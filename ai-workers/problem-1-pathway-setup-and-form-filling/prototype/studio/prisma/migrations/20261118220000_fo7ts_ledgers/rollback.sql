-- FO-7ts part 2 rollback (not a migration: Prisma reads only migration.sql). Run in one transaction, before any
-- MOVE_TO_CASE entry or credit entry exists that must be kept (it refuses otherwise):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f prisma/migrations/20261118220000_fo7ts_ledgers/rollback.sql
-- Restores money_trust_entry_write exactly as FO-7lk left it, the two checks as FO-7a2 wrote them, and drops the rest.
-- The enum value MOVE_TO_CASE stays (PostgreSQL cannot drop one). Then delete this folder's row from _prisma_migrations.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "money_trust_entry" WHERE "kind"::text = 'MOVE_TO_CASE') THEN
    RAISE EXCEPTION 'FO-7ts part 2 rollback: moves to a case are recorded; they cannot be rolled back silently';
  END IF;
  IF EXISTS (SELECT 1 FROM "money_credit_entry") THEN  -- break R1 on 692ea4be: never drop a client's credit
    RAISE EXCEPTION 'FO-7ts part 2 rollback: credit entries are recorded; they cannot be rolled back silently';
  END IF;
END $$;
DROP TRIGGER money_refund_credit_kept ON "money_refund";
DROP TRIGGER money_trust_entry_credit_kept ON "money_trust_entry";
DROP TRIGGER money_invoice_line_credit ON "money_invoice_line";
DROP TRIGGER money_invoice_credit_pinned ON "money_invoice";
DROP FUNCTION money_refund_credit_kept(), money_trust_entry_credit_kept(), money_invoice_line_credit(), money_invoice_credit_pinned();
DROP TABLE "money_credit_entry";
DROP FUNCTION money_credit_entry_holds(), money_credit_kept_holds(uuid, uuid, text), money_invoice_credit(uuid, uuid, "MoneyCreditKind");
DROP FUNCTION money_credit_entry_write(), money_invoice_due(uuid, uuid);
DROP TYPE "MoneyCreditKind";
DROP TRIGGER money_trust_entry_move_paired ON "money_trust_entry";
DROP FUNCTION money_trust_entry_move_paired();
ALTER TABLE "money_trust_entry" DROP CONSTRAINT "money_trust_entry_move_check",
  DROP CONSTRAINT "money_trust_entry_sign_check",
  ADD CONSTRAINT "money_trust_entry_sign_check" CHECK (("kind" = 'DEPOSIT' AND "amount_minor" > 0) OR ("kind" IN ('WITHDRAWAL_TO_INVOICE', 'REFUND_TO_CLIENT') AND "amount_minor" < 0) OR ("kind" = 'CORRECTION' AND "amount_minor" <> 0)),
  DROP CONSTRAINT "money_trust_entry_balance_check",
  ADD CONSTRAINT "money_trust_entry_balance_check" CHECK ("seq" >= 1 AND ("balance_after_minor" >= 0 OR "amount_minor" > 0
    OR ("kind" = 'CORRECTION' AND "correction_kind" IN ('RETURNED', 'RECORDED_BY_MISTAKE', 'WRONG_CLIENT', 'OTHER')))),
  DROP COLUMN "moved_from_entry_id";

-- FO-7lk's text, exactly.
CREATE OR REPLACE FUNCTION money_trust_entry_write() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE d record; reversal boolean := false; last_seq integer; last_balance bigint; party uuid := coalesce(NEW.person_id, NEW.company_id); bal bigint; applied bigint; open_amount bigint; returned bigint;
BEGIN
  -- The party's lock first, before any invoice row is touched, so a "Trust first" deposit and withdrawal in one
  -- transaction never deadlock with another withdrawal on the same invoice (review round 2, Minor 2: 40P01).
  IF party IS NOT NULL THEN
    PERFORM money_trust_lock(NEW.firm_id, party, NEW.currency);
  END IF;
  IF NEW.kind = 'DEPOSIT' THEN
    PERFORM money_trust_on(NEW.firm_id, 'money_trust_entry');
  END IF;
  -- A missing id is the checks' to refuse (money_trust_entry_deposit_payment, _withdrawal_invoice).
  IF NEW.kind = 'DEPOSIT' AND NEW.payment_id IS NOT NULL THEN
    SELECT p.amount_minor, p.currency, p.received_into, p.trust_request_id, p.invoice_id, i.person_id AS inv_person, i.company_id AS inv_company INTO d
      FROM "money_payment" p LEFT JOIN "money_invoice" i ON i.firm_id = p.firm_id AND i.id = p.invoice_id WHERE p.firm_id = NEW.firm_id AND p.id = NEW.payment_id;
    IF NOT FOUND THEN PERFORM money_missing('money_trust_entry', 'payment', NEW.payment_id); END IF;
    IF d.received_into <> 'TRUST' THEN
      RAISE EXCEPTION 'money_trust_entry: a deposit comes from a payment received into trust (this one went to %)', d.received_into USING ERRCODE = 'check_violation';
    END IF;
    IF (d.amount_minor, d.currency) IS DISTINCT FROM (NEW.amount_minor, NEW.currency) THEN
      RAISE EXCEPTION 'money_trust_entry: a deposit is its payment''s amount and currency (% %)', d.amount_minor, d.currency USING ERRCODE = 'check_violation';
    END IF;
    -- "Trust first" (AG-6-69 rule 5): money paid on an invoice into trust is held for that invoice's party (review round 1, m2).
    IF d.invoice_id IS NOT NULL AND (d.inv_person, d.inv_company) IS DISTINCT FROM (NEW.person_id, NEW.company_id) THEN
      RAISE EXCEPTION 'money_trust_entry: a deposit paid on an invoice is held for that invoice''s party' USING ERRCODE = 'check_violation';
    END IF;
    IF d.trust_request_id IS NOT NULL AND NEW.trust_request_id IS DISTINCT FROM d.trust_request_id THEN
      IF NEW.trust_request_id IS NOT NULL THEN
        RAISE EXCEPTION 'money_trust_entry: a deposit names its payment''s trust request' USING ERRCODE = 'check_violation';
      END IF;
      NEW.trust_request_id := d.trust_request_id;
    END IF;
  END IF;
  IF NEW.trust_request_id IS NOT NULL THEN
    SELECT r.person_id, r.company_id, r.currency INTO d FROM "money_trust_request" r WHERE r.firm_id = NEW.firm_id AND r.id = NEW.trust_request_id;
    IF NOT FOUND THEN PERFORM money_missing('money_trust_entry', 'trust request', NEW.trust_request_id); END IF;
    IF (d.person_id, d.company_id, d.currency) IS DISTINCT FROM (NEW.person_id, NEW.company_id, NEW.currency) THEN
      RAISE EXCEPTION 'money_trust_entry: an entry is on its trust request''s party and currency' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  IF NEW.kind = 'WITHDRAWAL_TO_INVOICE' AND NEW.invoice_id IS NOT NULL THEN
    SELECT i.issued_at, i.person_id, i.company_id, i.currency INTO d FROM "money_invoice" i WHERE i.firm_id = NEW.firm_id AND i.id = NEW.invoice_id;
    IF NOT FOUND THEN PERFORM money_missing('money_trust_entry', 'invoice', NEW.invoice_id); END IF;
    IF d.issued_at IS NULL THEN
      RAISE EXCEPTION 'money_trust_entry: trust is applied only to an issued invoice (Code s. 32(f): invoice before withdrawing)' USING ERRCODE = 'check_violation';
    END IF;
    IF (d.person_id, d.company_id, d.currency) IS DISTINCT FROM (NEW.person_id, NEW.company_id, NEW.currency) THEN
      RAISE EXCEPTION 'money_trust_entry: trust pays only an invoice of the same party and currency' USING ERRCODE = 'check_violation';
    END IF;
    -- Touches the invoice row, so it goes one at a time with the invoice's credit notes and write-off (see
    -- money_issued_invoice); returns what is open after them.
    open_amount := money_issued_invoice(NEW.firm_id, NEW.invoice_id, NEW.currency, 'money_trust_entry');
  END IF;
  IF NEW.kind = 'CORRECTION' AND NEW.corrects_entry_id IS NOT NULL THEN  -- another kind naming one: money_trust_entry_corrects_check
    SELECT e.person_id, e.company_id, e.currency, e.kind, e.amount_minor, p.method INTO d FROM "money_trust_entry" e
      LEFT JOIN "money_payment" p ON p.firm_id = e.firm_id AND p.id = e.payment_id WHERE e.firm_id = NEW.firm_id AND e.id = NEW.corrects_entry_id;
    IF NOT FOUND THEN PERFORM money_missing('money_trust_entry', 'entry', NEW.corrects_entry_id); END IF;
    IF (d.person_id, d.company_id, d.currency) IS DISTINCT FROM (NEW.person_id, NEW.company_id, NEW.currency) THEN
      RAISE EXCEPTION 'money_trust_entry: a correction is on the same party and currency as the entry it corrects' USING ERRCODE = 'check_violation';
    END IF;
    IF d.kind NOT IN ('WITHDRAWAL_TO_INVOICE', 'DEPOSIT') THEN
      RAISE EXCEPTION 'money_trust_entry: a correction names a withdrawal (to return money from it) or a deposit (to correct it), never a % (P-603: money leaves trust only to an issued invoice or back to the client)', d.kind USING ERRCODE = 'check_violation';
    END IF;
    -- FO-7a2 (AG-6-75 rules 2, 4): a correction of a deposit with a reversal kind is recorded even below zero, and the
    -- shortfall is shown (money_trust_shortfall). "Returned" is a bounced cheque or wire: an e-Transfer, card, card
    -- terminal or cash payment is cleared when recorded (AG-6-63 rule 7; break B-17).
    IF d.kind = 'DEPOSIT' AND NEW.correction_kind IN ('RETURNED', 'RECORDED_BY_MISTAKE', 'WRONG_CLIENT', 'OTHER') THEN
      reversal := true;
      IF NEW.correction_kind = 'RETURNED' AND d.method::text IN ('E_TRANSFER', 'CARD', 'CARD_TERMINAL', 'CASH') THEN
        RAISE EXCEPTION 'money_trust_entry: a % payment is cleared when recorded and is never "Returned"; reverse it as "Recorded by mistake", "Wrong client" or with a typed reason', d.method USING ERRCODE = 'check_violation';
      END IF;
    END IF;
    -- What the earlier corrections of that entry add up to (the party's lock is held, so they are read after every
    -- earlier one; a stale read at REPEATABLE READ takes a seq already taken and is refused, 23505).
    SELECT coalesce(sum(c.amount_minor), 0) INTO returned FROM "money_trust_entry" c WHERE c.firm_id = NEW.firm_id AND c.corrects_entry_id = NEW.corrects_entry_id;
    -- Money returned from a trust application: positive, and never more than was applied.
    IF d.kind = 'WITHDRAWAL_TO_INVOICE' AND (NEW.amount_minor <= 0 OR returned + NEW.amount_minor > -d.amount_minor) THEN
      RAISE EXCEPTION 'money_trust_entry: money returned from a trust application is positive and at most what was applied (% applied, % returned)', -d.amount_minor, returned USING ERRCODE = 'check_violation';
    END IF;
    -- A deposit corrected: negative, and all its corrections together never more than the deposit.
    IF d.kind = 'DEPOSIT' AND (NEW.amount_minor >= 0 OR -(returned + NEW.amount_minor) > d.amount_minor) THEN
      RAISE EXCEPTION 'money_trust_entry: a correction of a deposit takes money out, at most the deposit (% deposited, % corrected before)', d.amount_minor, -returned USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  IF NEW.kind = 'WITHDRAWAL_TO_INVOICE' AND NEW.invoice_id IS NOT NULL THEN
    -- Paid from trust so far: the invoice's withdrawals less the money returned to trust from them (corrections naming
    -- them), so a return frees the amount again (review round 2, Major 2).
    SELECT coalesce(-sum(e.amount_minor), 0) - coalesce((SELECT sum(c.amount_minor) FROM "money_trust_entry" c JOIN "money_trust_entry" w ON w.firm_id = c.firm_id AND w.id = c.corrects_entry_id
        WHERE c.firm_id = NEW.firm_id AND c.kind = 'CORRECTION' AND w.invoice_id = NEW.invoice_id), 0)
      INTO applied FROM "money_trust_entry" e WHERE e.firm_id = NEW.firm_id AND e.invoice_id = NEW.invoice_id;
    -- FO-7a2 (Devin review on #1991): trust money a credit note's "Refund to the client" sent back from operating no
    -- longer pays the invoice, as the credit-note and write-off checks count it.
    applied := greatest(applied - (SELECT coalesce(sum(c.overpaid_minor), 0) FROM "money_credit_note" c
      WHERE c.firm_id = NEW.firm_id AND c.invoice_id = NEW.invoice_id AND c.overpaid_choice = 'OVERPAID_REFUND'), 0);
    IF applied - NEW.amount_minor > open_amount THEN
      RAISE EXCEPTION 'money_trust_entry: % from trust would pay more than is open on the invoice (% open after credit notes and write-off, % already paid from trust)', -NEW.amount_minor, open_amount, applied USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  IF NEW.person_id IS NOT NULL THEN
    SELECT e.seq, e.balance_after_minor INTO last_seq, last_balance FROM "money_trust_entry" e
      WHERE e.firm_id = NEW.firm_id AND e.person_id = NEW.person_id AND e.currency = NEW.currency ORDER BY e.seq DESC LIMIT 1;
  ELSE
    SELECT e.seq, e.balance_after_minor INTO last_seq, last_balance FROM "money_trust_entry" e
      WHERE e.firm_id = NEW.firm_id AND e.company_id = NEW.company_id AND e.currency = NEW.currency ORDER BY e.seq DESC LIMIT 1;
  END IF;
  bal := coalesce(last_balance, 0) + NEW.amount_minor;
  -- FO-7a2 (AG-6-68 rule 8): money taken out never goes past the ledger balance, "Only CAD 169.50 is available."; a
  -- reversal is always recorded, even below zero (AG-6-75 rule 4, AG-6-60 rule 7; break B-10); money in always is.
  IF bal < 0 AND NEW.amount_minor < 0 AND NOT reversal THEN
    RAISE EXCEPTION 'money_trust_entry: Only % % is available; the trust balance would go below zero (held % %, entry %)',
      NEW.currency, to_char(greatest(coalesce(last_balance, 0), 0) / 100.0, 'FM999,999,990.00'), coalesce(last_balance, 0), NEW.currency, NEW.amount_minor USING ERRCODE = 'check_violation';
  END IF;
  NEW.seq := coalesce(last_seq, 0) + 1;
  NEW.balance_after_minor := bal;
  NEW.created_at := now();
  RETURN NEW;
END $$;
ALTER FUNCTION money_trust_entry_write() SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION money_trust_entry_write() OWNER TO xr_wall_reader;
