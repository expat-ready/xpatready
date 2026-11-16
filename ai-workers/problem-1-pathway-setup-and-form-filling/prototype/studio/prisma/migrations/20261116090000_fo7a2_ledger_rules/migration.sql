-- FO-7a2 (brief product/design/lead-b-briefs/FO-7a2.md rev 16.53, order rev 16.58; P-634, P-638; AG-6-60 rule 7, AG-6-63 rule 7,
-- AG-6-68 rules 5 and 8, AG-6-75 rules 1-6, AG-6-48 rules 3-4, AG-6-73 rules 1 and 4, AG-6-21; breaks B-1, B-3, B-4, B-10 to B-13,
-- B-17 of FO-7mv's break report; legal reading Unconfirmed: no counsel): the trust ledger's reversal and credit-note rules.
-- Replaces FO-7a's money_trust_entry_write, money_credit_note_write and money_write_off_write (CREATE OR REPLACE; owner and
-- PF-12's reader settings kept below) and its balance check; adds money_trust_paid, money_payment_returned_not_cleared and
-- the view money_trust_shortfall; rule 2c (widened by Lead 69 on #1991): money_credit_note's overpaid choice, its
-- return to trust (money_credit_note_owed_back) and FO-7mv's money_move_line_write, money_trust_entry_moves and money_to_move
-- replaced for the operating → trust line a credit note owes. No table. Rollback: re-run FO-7a's three functions from its migration, put back
-- money_trust_entry_balance_check (balance_after_minor >= 0 AND seq >= 1) once no row is below zero, DROP VIEW
-- money_trust_shortfall, DROP TRIGGER money_payment_returned_not_cleared ON money_payment, DROP FUNCTION
-- money_payment_returned_not_cleared(), money_trust_paid(uuid, uuid).

-- Rule 2c's columns (Prisma's DDL): the choice, the amount it covers and the withdrawal it names, all three or none.
CREATE TYPE "MoneyOverpaidChoice" AS ENUM ('OVERPAID_REFUND', 'OVERPAID_TO_TRUST');
ALTER TABLE "money_credit_note" ADD COLUMN "overpaid_choice" "MoneyOverpaidChoice", ADD COLUMN "overpaid_entry_id" UUID, ADD COLUMN "overpaid_minor" INTEGER;
CREATE INDEX "money_credit_note_firm_id_overpaid_entry_id_idx" ON "money_credit_note"("firm_id", "overpaid_entry_id");
ALTER TABLE "money_credit_note" ADD CONSTRAINT "money_credit_note_firm_id_overpaid_entry_id_fkey" FOREIGN KEY ("firm_id", "overpaid_entry_id") REFERENCES "money_trust_entry"("firm_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "money_credit_note" ADD CONSTRAINT "money_credit_note_overpaid_check" CHECK (num_nonnulls("overpaid_choice", "overpaid_entry_id", "overpaid_minor") IN (0, 3) AND coalesce("overpaid_minor", 1) > 0);

-- What a trust application has moved to operating, or back into trust, in batches not undone; and what credit notes owe
-- back to trust from it (OVERPAID_TO_TRUST), or cover in all (both choices).
CREATE OR REPLACE FUNCTION money_moved_live(f uuid, src uuid, dir "MoneyMoveDirection") RETURNS bigint LANGUAGE sql STABLE SET search_path = pg_catalog, public, pg_temp AS
  $$ SELECT coalesce(sum(l.amount_minor), 0) FROM "money_move_line" l WHERE l.firm_id = f AND l.source_entry_id = src AND l.direction = dir
       AND NOT EXISTS (SELECT 1 FROM "money_move_batch" u WHERE u.firm_id = l.firm_id AND u.undoes_batch_id = l.batch_id) $$;
CREATE OR REPLACE FUNCTION money_owed_back(f uuid, w uuid, only_to_trust boolean) RETURNS bigint LANGUAGE sql STABLE SET search_path = pg_catalog, public, pg_temp AS
  $$ SELECT coalesce(sum(c.overpaid_minor), 0) FROM "money_credit_note" c WHERE c.firm_id = f AND c.overpaid_entry_id = w
       AND (NOT only_to_trust OR c.overpaid_choice = 'OVERPAID_TO_TRUST') $$;
-- The move-back still owed: the choices, but never more than is still in operating (an undone move takes it back, break B-2).
CREATE OR REPLACE FUNCTION money_owed_live(f uuid, w uuid) RETURNS bigint LANGUAGE sql STABLE SET search_path = pg_catalog, public, pg_temp AS
  $$ SELECT least(money_owed_back(f, w, true), money_moved_live(f, w, 'TRUST_TO_OPERATING')) $$;
-- These helpers keep their caller's rights (as FO-7a's do): inside a trigger they run as the wall reader, called directly
-- or from a view they see only the session's firm (review M1, break B-3).

-- Trust applied to an invoice and not returned: its withdrawals less the money returned to trust from them (FO-7a's sum).
CREATE OR REPLACE FUNCTION money_trust_paid(f uuid, inv uuid) RETURNS bigint LANGUAGE sql STABLE SET search_path = pg_catalog, public, pg_temp AS
  $$ SELECT coalesce(-sum(e.amount_minor), 0) - coalesce((SELECT sum(c.amount_minor) FROM "money_trust_entry" c JOIN "money_trust_entry" w ON w.firm_id = c.firm_id AND w.id = c.corrects_entry_id
       WHERE c.firm_id = f AND c.kind = 'CORRECTION' AND w.invoice_id = inv), 0)
     FROM "money_trust_entry" e WHERE e.firm_id = f AND e.invoice_id = inv AND e.kind = 'WITHDRAWAL_TO_INVOICE' $$;

-- A balance may be below zero only after a reversal (AG-6-60 rule 7), and money in leaves it as it is or raises it.
ALTER TABLE "money_trust_entry" DROP CONSTRAINT "money_trust_entry_balance_check",
  ADD CONSTRAINT "money_trust_entry_balance_check" CHECK ("seq" >= 1 AND ("balance_after_minor" >= 0 OR "amount_minor" > 0
    OR ("kind" = 'CORRECTION' AND "correction_kind" IN ('RETURNED', 'RECORDED_BY_MISTAKE', 'WRONG_CLIENT', 'OTHER'))));

CREATE OR REPLACE FUNCTION money_trust_entry_write() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE d record; reversal boolean := false; last_seq integer; last_balance bigint; party uuid := coalesce(NEW.person_id, NEW.company_id); bal bigint; applied bigint; open_amount bigint; returned bigint;
BEGIN
  -- The party's lock first, before any invoice row is touched, so a "Trust first" deposit and withdrawal in one
  -- transaction never deadlock with another withdrawal on the same invoice (review round 2, Minor 2: 40P01).
  IF party IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('money_trust:' || NEW.firm_id || ':' || party || ':' || NEW.currency, 0));
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

CREATE OR REPLACE FUNCTION money_credit_note_write() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE open_amount bigint; trust bigint; w record; freed bigint := 0;
BEGIN
  IF NEW.number IS NOT NULL THEN
    RAISE EXCEPTION 'money_credit_note: the number is the database''s' USING ERRCODE = 'check_violation';
  END IF;
  IF num_nonnulls(NEW.overpaid_choice, NEW.overpaid_entry_id, NEW.overpaid_minor) NOT IN (0, 3) THEN
    RAISE EXCEPTION 'money_credit_note: a refund or move-back choice carries its amount and its trust application, all three (money_credit_note_overpaid_check)' USING ERRCODE = 'check_violation';
  END IF;
  open_amount := money_issued_invoice(NEW.firm_id, NEW.invoice_id, NEW.currency, 'money_credit_note');
  -- Trust paid and not returned, less what earlier "Refund to the client" choices already freed (refunded from operating).
  trust := money_trust_paid(NEW.firm_id, NEW.invoice_id) - (SELECT coalesce(sum(c.overpaid_minor), 0) FROM "money_credit_note" c
    WHERE c.firm_id = NEW.firm_id AND c.invoice_id = NEW.invoice_id AND c.overpaid_choice = 'OVERPAID_REFUND');
  -- Rule 2c (P-634 (2)): trust money of this invoice that already moved to operating is freed for the credit note only
  -- with the person's choice, "Refund to the client" or "Move back to trust", never kept in operating; at most what moved
  -- and no earlier choice covers.
  IF NEW.overpaid_entry_id IS NOT NULL THEN
    SELECT e.kind, e.invoice_id INTO w FROM "money_trust_entry" e WHERE e.firm_id = NEW.firm_id AND e.id = NEW.overpaid_entry_id;
    IF NOT FOUND THEN PERFORM money_missing('money_credit_note', 'trust entry', NEW.overpaid_entry_id); END IF;
    IF w.kind IS DISTINCT FROM 'WITHDRAWAL_TO_INVOICE' OR w.invoice_id IS DISTINCT FROM NEW.invoice_id THEN
      RAISE EXCEPTION 'money_credit_note: a refund or move-back choice names a trust application to this invoice' USING ERRCODE = 'check_violation';
    END IF;
    freed := money_moved_live(NEW.firm_id, NEW.overpaid_entry_id, 'TRUST_TO_OPERATING') - money_owed_back(NEW.firm_id, NEW.overpaid_entry_id, false);
    IF NEW.overpaid_minor > freed THEN
      RAISE EXCEPTION 'money_credit_note: only % % of that trust application has moved to operating and has no refund or move-back choice yet', to_char(greatest(freed, 0) / 100.0, 'FM999,999,990.00'), NEW.currency USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.overpaid_minor > NEW.amount_minor - (open_amount - greatest(trust, 0)) THEN
      RAISE EXCEPTION 'money_credit_note: a refund or move-back choice covers only the part of this credit note that trust paid and that has moved (at most % %)',
        to_char(greatest(NEW.amount_minor - (open_amount - greatest(trust, 0)), 0) / 100.0, 'FM999,999,990.00'), NEW.currency USING ERRCODE = 'check_violation';
    END IF;
    trust := trust - NEW.overpaid_minor;
  END IF;
  trust := greatest(trust, 0);
  IF NEW.amount_minor > open_amount - trust THEN
    IF NEW.amount_minor <= open_amount THEN
      RAISE EXCEPTION 'money_credit_note: % % of this invoice was paid from trust: return % % to trust first (a correction naming the withdrawal, AG-6-48 rule 4), then credit it; for money already moved to operating, choose Refund to the client or Move back to trust (OVERPAID_REFUND, OVERPAID_TO_TRUST)',
        to_char(trust / 100.0, 'FM999,999,990.00'), NEW.currency, to_char((NEW.amount_minor - (open_amount - trust)) / 100.0, 'FM999,999,990.00'), NEW.currency USING ERRCODE = 'check_violation';
    END IF;
    RAISE EXCEPTION 'money_credit_note: % is more than is left to credit on the invoice (%)', NEW.amount_minor, open_amount - trust USING ERRCODE = 'check_violation';
  END IF;
  open_amount := open_amount - trust;
  IF NEW."full" AND NEW.amount_minor <> open_amount THEN
    RAISE EXCEPTION 'money_credit_note: a full credit note credits all that is left (%)', open_amount USING ERRCODE = 'check_violation';
  END IF;
  NEW.number := money_take_number(NEW.firm_id, 'CREDIT_NOTE');
  NEW.created_at := now();
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION money_write_off_write() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE open_amount bigint; trust bigint;
BEGIN
  open_amount := money_issued_invoice(NEW.firm_id, NEW.invoice_id, NEW.currency, 'money_write_off');
  trust := greatest(money_trust_paid(NEW.firm_id, NEW.invoice_id) - (SELECT coalesce(sum(c.overpaid_minor), 0) FROM "money_credit_note" c
    WHERE c.firm_id = NEW.firm_id AND c.invoice_id = NEW.invoice_id AND c.overpaid_choice = 'OVERPAID_REFUND'), 0);
  IF NEW.amount_minor > open_amount - trust AND NEW.amount_minor <= open_amount THEN
    RAISE EXCEPTION 'money_write_off: % % of this invoice was paid from trust: only what trust has not paid is written off (% left)', to_char(trust / 100.0, 'FM999,999,990.00'), NEW.currency, greatest(open_amount - trust, 0) USING ERRCODE = 'check_violation';
  END IF;
  open_amount := open_amount - trust;
  IF NEW.amount_minor > open_amount THEN
    RAISE EXCEPTION 'money_write_off: % is more than is left on the invoice (%)', NEW.amount_minor, open_amount USING ERRCODE = 'check_violation';
  END IF;
  NEW.created_at := now();
  RETURN NEW;
END $$;

-- B-17: a payment reversed as "Returned" (it bounced) is never ticked cleared afterwards. Read after the party's lock is
-- not possible here (a tick takes none); at READ COMMITTED a "Returned" written first is seen.
CREATE OR REPLACE FUNCTION money_payment_returned_not_cleared() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.cleared AND NOT OLD.cleared AND EXISTS (SELECT 1 FROM "money_trust_entry" d JOIN "money_trust_entry" r ON r.firm_id = d.firm_id AND r.corrects_entry_id = d.id
       WHERE d.firm_id = NEW.firm_id AND d.payment_id = NEW.id AND d.kind = 'DEPOSIT' AND r.correction_kind = 'RETURNED') THEN
    RAISE EXCEPTION 'money_payment: this payment was reversed as "Returned" (it bounced) and is never ticked cleared' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
-- Rule 2c: "Move back to trust" returns the credited money to the client's trust balance at once (the RETURN naming the
-- withdrawal), and the To move list shows the operating → trust transfer the firm owes until it is moved back.
CREATE OR REPLACE FUNCTION money_credit_note_owed_back() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE w record;
BEGIN
  IF NEW.overpaid_choice = 'OVERPAID_TO_TRUST' THEN
    SELECT e.person_id, e.company_id, e.case_id, e.currency INTO w FROM "money_trust_entry" e WHERE e.firm_id = NEW.firm_id AND e.id = NEW.overpaid_entry_id;
    INSERT INTO "money_trust_entry" (firm_id, person_id, company_id, case_id, kind, amount_minor, currency, corrects_entry_id, reason, created_by)
      VALUES (NEW.firm_id, w.person_id, w.company_id, w.case_id, 'CORRECTION', NEW.overpaid_minor, w.currency, NEW.overpaid_entry_id, 'Credit note ' || NEW.number || ': moved back to trust', NEW.created_by);
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER money_credit_note_owed_back AFTER INSERT ON "money_credit_note" FOR EACH ROW EXECUTE FUNCTION money_credit_note_owed_back();
CREATE TRIGGER money_payment_returned_not_cleared BEFORE UPDATE OF "cleared" ON "money_payment" FOR EACH ROW EXECUTE FUNCTION money_payment_returned_not_cleared();

-- AG-6-75 rule 4, AG-6-60 rule 7: each party below zero, per currency, with the reversal that took it below (the latest
-- reversal at or before the newest entry), for the case's red line, the monthly check and the Owner's item (screens later).
CREATE OR REPLACE VIEW "money_trust_shortfall" WITH (security_invoker = true) AS
  SELECT l.firm_id, l.person_id, l.company_id, l.currency, l.balance_after_minor AS balance_minor, l.seq,
         (SELECT r.id FROM "money_trust_entry" r WHERE r.firm_id = l.firm_id AND r.person_id IS NOT DISTINCT FROM l.person_id AND r.company_id IS NOT DISTINCT FROM l.company_id
            AND r.currency = l.currency AND r.kind = 'CORRECTION' AND r.correction_kind IN ('RETURNED', 'RECORDED_BY_MISTAKE', 'WRONG_CLIENT', 'OTHER') ORDER BY r.seq DESC LIMIT 1) AS reversal_entry_id
    FROM (SELECT DISTINCT ON (e.firm_id, e.person_id, e.company_id, e.currency) e.* FROM "money_trust_entry" e
            ORDER BY e.firm_id, e.person_id, e.company_id, e.currency, e.seq DESC) l
   WHERE l.balance_after_minor < 0;

-- FO-7mv's move rules and list, replaced for rule 2c (an operating → trust line only for what a credit note owes back).
CREATE OR REPLACE FUNCTION money_move_line_write() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE b record; s record; party uuid; earlier integer; moved bigint; returned bigint; cap bigint; arrived boolean;
BEGIN
  SELECT x.undoes_batch_id, x.currency, x.direction, pg_xact_status(((pg_current_xact_id()::text::bigint >> 32 << 32) | x.xmin::text::bigint)::text::xid8) = 'in progress' AS mine
    INTO b FROM "money_move_batch" x WHERE x.firm_id = NEW.firm_id AND x.id = NEW.batch_id;
  IF NOT FOUND THEN PERFORM money_missing('money_move_line', 'batch', NEW.batch_id); END IF;
  IF b.undoes_batch_id IS NOT NULL THEN
    RAISE EXCEPTION 'money_move_line: an undo batch carries no lines (the undone batch''s lines go back to the list)' USING ERRCODE = 'check_violation';
  END IF;
  IF b.mine IS NOT TRUE THEN
    RAISE EXCEPTION 'money_move_line: a batch takes its lines in the transaction that records it; a recorded batch is never added to' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM "money_move_batch" u WHERE u.firm_id = NEW.firm_id AND u.undoes_batch_id = NEW.batch_id) THEN
    RAISE EXCEPTION 'money_move_line: an undone batch never gains a line, also in the transaction that records it' USING ERRCODE = 'check_violation';
  END IF;
  IF (NEW.currency, NEW.direction) IS DISTINCT FROM (b.currency, b.direction) THEN
    RAISE EXCEPTION 'money_move_line: a line is in its batch''s currency and direction (% %); CAD and USD never share a batch', b.currency, b.direction USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.kind = 'CARD_FEE_ON_TRUST' THEN
    RAISE EXCEPTION 'money_move_line: card fees on the trust account wait for card payments into trust (held, P-567; FO-7c)' USING ERRCODE = 'check_violation';
  END IF;
  SELECT e.kind, e.amount_minor, e.currency, e.person_id, e.company_id, e.invoice_id, e.correction_kind, d.kind AS corrected_kind, p.id AS deposit_payment_id
    INTO s FROM "money_trust_entry" e LEFT JOIN "money_trust_entry" d ON d.firm_id = e.firm_id AND d.id = e.corrects_entry_id
      LEFT JOIN "money_payment" p ON p.firm_id = d.firm_id AND p.id = d.payment_id
    WHERE e.firm_id = NEW.firm_id AND e.id = NEW.source_entry_id;
  IF NOT FOUND THEN PERFORM money_missing('money_move_line', 'trust entry', NEW.source_entry_id); END IF;
  -- The party's lock first, before anything that can change is read (break B-22: a "Returned" still open was missed).
  party := coalesce(s.person_id, s.company_id);
  PERFORM pg_advisory_xact_lock(hashtextextended('money_trust:' || NEW.firm_id || ':' || party || ':' || s.currency, 0));
  IF NEW.kind = 'TRUST_APPLIED' AND s.kind IS DISTINCT FROM 'WITHDRAWAL_TO_INVOICE' THEN
    RAISE EXCEPTION 'money_move_line: a trust application moves a withdrawal to an invoice, not a %', s.kind USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.kind = 'WRONG_ACCOUNT' AND (s.kind IS DISTINCT FROM 'CORRECTION' OR s.corrected_kind IS DISTINCT FROM 'DEPOSIT' OR s.correction_kind IS DISTINCT FROM 'WRONG_ACCOUNT') THEN
    RAISE EXCEPTION 'money_move_line: only a WRONG_ACCOUNT correction of a deposit licenses a wrong-account move out of trust (this entry is a %): a bounced cheque or an entry error never reached the trust account as money to move',
      coalesce(s.correction_kind::text || ' ', '') || s.kind USING ERRCODE = 'check_violation';
  END IF;
  -- A wrong-account line moves only money that arrived: its payment is cleared and was never "Returned" (break B-20: a
  -- bounced cheque ticked cleared afterwards), read after the party's lock (a "Returned" takes it too) and with the
  -- payment row share-locked, so a "Cleared" tick written after this snapshot fails to serialise (40001) at REPEATABLE
  -- READ instead of being missed.
  IF NEW.kind = 'WRONG_ACCOUNT' THEN
    SELECT x.cleared AND NOT EXISTS (SELECT 1 FROM "money_trust_entry" r JOIN "money_trust_entry" c ON c.firm_id = r.firm_id AND c.id = NEW.source_entry_id
             WHERE r.firm_id = NEW.firm_id AND r.corrects_entry_id = c.corrects_entry_id AND r.correction_kind = 'RETURNED')
      INTO arrived FROM "money_payment" x WHERE x.firm_id = NEW.firm_id AND x.id = s.deposit_payment_id FOR SHARE;
  END IF;
  IF NEW.kind = 'WRONG_ACCOUNT' AND arrived IS NOT TRUE THEN
    RAISE EXCEPTION 'money_move_line: the payment this wrong-account correction names is not cleared, or was returned; it moves only once it has cleared' USING ERRCODE = 'check_violation';
  END IF;
  -- FO-7a2 rule 2c: back into trust only a trust application's money a credit note owes ("Move back to trust").
  IF NEW.direction <> 'TRUST_TO_OPERATING' AND NEW.kind <> 'TRUST_APPLIED' THEN
    RAISE EXCEPTION 'money_move_line: a % line moves from trust to operating (money into trust waits for its own ledger entry)', NEW.kind USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.currency <> s.currency THEN
    RAISE EXCEPTION 'money_move_line: a line is in its entry''s currency (%)', s.currency USING ERRCODE = 'check_violation';
  END IF;
  NEW.invoice_id := coalesce(NEW.invoice_id, s.invoice_id);
  IF NEW.person_id IS NULL AND NEW.company_id IS NULL THEN
    NEW.person_id := s.person_id; NEW.company_id := s.company_id;
  END IF;
  IF (NEW.invoice_id, NEW.person_id, NEW.company_id) IS DISTINCT FROM (s.invoice_id, s.person_id, s.company_id) THEN
    RAISE EXCEPTION 'money_move_line: a line''s invoice and party are its trust entry''s' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.kind = 'TRUST_APPLIED' THEN
    UPDATE "money_invoice" x SET updated_at = now() WHERE x.firm_id = NEW.firm_id AND x.id = s.invoice_id;
  END IF;
  SELECT count(*) INTO earlier FROM "money_move_line" l WHERE l.firm_id = NEW.firm_id AND l.source_entry_id = NEW.source_entry_id;
  moved := money_moved_live(NEW.firm_id, NEW.source_entry_id, NEW.direction);
  IF NEW.direction = 'OPERATING_TO_TRUST' THEN
    cap := money_owed_live(NEW.firm_id, NEW.source_entry_id);
    IF moved + NEW.amount_minor > cap THEN
      RAISE EXCEPTION 'money_move_line: a TRUST_APPLIED line moves from trust to operating, or back into trust only what a credit note owes (% % owed back, % moved back)', cap, NEW.currency, moved USING ERRCODE = 'check_violation';
    END IF;
    NEW.move_ordinal := earlier + 1;
    NEW.created_at := now();
    RETURN NEW;
  END IF;
  IF NEW.kind = 'TRUST_APPLIED' THEN
    SELECT coalesce(sum(c.amount_minor), 0) INTO returned FROM "money_trust_entry" c WHERE c.firm_id = NEW.firm_id AND c.corrects_entry_id = NEW.source_entry_id;
  ELSE
    returned := 0;
  END IF;
  -- What a credit note owes back to trust from this application can move out again only after it is moved back (rule 2c).
  cap := -s.amount_minor - returned + CASE WHEN NEW.kind = 'TRUST_APPLIED' THEN money_owed_live(NEW.firm_id, NEW.source_entry_id) ELSE 0 END;
  IF moved + NEW.amount_minor > cap THEN
    RAISE EXCEPTION 'money_move_line: % % would move more than this entry still holds (% % to move: % less % returned to trust, % moved before)',
      NEW.amount_minor, NEW.currency, cap - moved, NEW.currency, -s.amount_minor, returned, moved USING ERRCODE = 'check_violation';
  END IF;
  -- Break B-4 (AG-6-75 rules 3-4): after a reversal took the party below zero, its unmoved trust applications are undone
  -- money: what moves out never exceeds the party's ledger balance plus what it still has to move, so a shortfall is only
  -- ever money that had already moved.
  IF NEW.kind = 'TRUST_APPLIED' THEN
    SELECT coalesce((SELECT e.balance_after_minor FROM "money_trust_entry" e WHERE e.firm_id = NEW.firm_id AND (e.person_id = party OR e.company_id = party)
      AND e.currency = s.currency ORDER BY e.seq DESC LIMIT 1), 0) INTO returned;
    IF returned < 0 AND returned + (cap - moved) - NEW.amount_minor < 0 THEN
      RAISE EXCEPTION 'money_move_line: this party''s trust balance is % % after a reversal; its unmoved trust applications are undone money and do not move (AG-6-75 rule 3)',
        to_char(returned / 100.0, 'FM999,999,990.00'), s.currency USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  NEW.move_ordinal := earlier + 1;
  NEW.created_at := now();
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION money_trust_entry_moves() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE c record; moved bigint; returned bigint;
BEGIN
  IF NEW.kind <> 'CORRECTION' OR NEW.corrects_entry_id IS NULL THEN RETURN NULL; END IF;
  SELECT e.kind, e.amount_minor, e.invoice_id INTO c FROM "money_trust_entry" e WHERE e.firm_id = NEW.firm_id AND e.id = NEW.corrects_entry_id;
  IF c.kind = 'DEPOSIT' AND NEW.correction_kind IS NULL THEN
    RAISE EXCEPTION 'money_trust_entry: a correction of a deposit says why it was made: RETURNED, RECORDED_BY_MISTAKE, WRONG_CLIENT, OTHER or WRONG_ACCOUNT' USING ERRCODE = 'check_violation';
  END IF;
  IF c.kind <> 'DEPOSIT' AND NEW.correction_kind IS NOT NULL THEN
    RAISE EXCEPTION 'money_trust_entry: only a correction of a deposit has a correction kind (this one names a %)', c.kind USING ERRCODE = 'check_violation';
  END IF;
  IF c.kind = 'WITHDRAWAL_TO_INVOICE' THEN
    UPDATE "money_invoice" x SET updated_at = now() WHERE x.firm_id = NEW.firm_id AND x.id = c.invoice_id;
    -- Moved out, less what a credit note owes back (rule 2c: that part comes back to trust now and moves back later).
    -- Every refund or move-back choice counts as moved even after an undo (review B1: a refund choice must never be
    -- returned to trust as well); a move-back's own return is already in the returns.
    moved := greatest(money_moved_live(NEW.firm_id, NEW.corrects_entry_id, 'TRUST_TO_OPERATING'), money_owed_back(NEW.firm_id, NEW.corrects_entry_id, false))
      - money_owed_back(NEW.firm_id, NEW.corrects_entry_id, true);
    SELECT coalesce(sum(r.amount_minor), 0) INTO returned FROM "money_trust_entry" r WHERE r.firm_id = NEW.firm_id AND r.corrects_entry_id = NEW.corrects_entry_id;
    IF moved > -c.amount_minor - returned THEN
      RAISE EXCEPTION 'money_trust_entry: % % of this trust application has moved to operating, so only % can come back to trust: undo that move batch first',
        moved, NEW.currency, greatest(-c.amount_minor - (returned - NEW.amount_minor) - moved, 0) USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NULL;
END $$;

CREATE OR REPLACE VIEW "money_to_move" WITH (security_invoker = true) AS
  WITH src AS (
    SELECT e.firm_id, e.id AS source_entry_id, 'TRUST_APPLIED'::"MoneyMoveKind" AS kind, 'TRUST_TO_OPERATING'::"MoneyMoveDirection" AS direction, e.currency, e.person_id, e.company_id, e.case_id, e.invoice_id,
           (-e.amount_minor + money_owed_live(e.firm_id, e.id))::integer AS eligible_minor,
           (SELECT coalesce(sum(c.amount_minor), 0)::integer FROM "money_trust_entry" c WHERE c.firm_id = e.firm_id AND c.corrects_entry_id = e.id) AS returned_minor,
           e.created_at
      FROM "money_trust_entry" e WHERE e.kind = 'WITHDRAWAL_TO_INVOICE'
    UNION ALL
    SELECT e.firm_id, e.id, 'WRONG_ACCOUNT'::"MoneyMoveKind", 'TRUST_TO_OPERATING'::"MoneyMoveDirection", e.currency, e.person_id, e.company_id, e.case_id, NULL::uuid,
           -e.amount_minor, 0, e.created_at
      FROM "money_trust_entry" e WHERE e.kind = 'CORRECTION' AND e.correction_kind = 'WRONG_ACCOUNT'
        -- shown once its payment has cleared (it moves only then)
        AND EXISTS (SELECT 1 FROM "money_trust_entry" d JOIN "money_payment" p ON p.firm_id = d.firm_id AND p.id = d.payment_id
                     WHERE d.firm_id = e.firm_id AND d.id = e.corrects_entry_id AND p.cleared
                       AND NOT EXISTS (SELECT 1 FROM "money_trust_entry" r WHERE r.firm_id = d.firm_id AND r.corrects_entry_id = d.id AND r.correction_kind = 'RETURNED'))
    UNION ALL
    -- Rule 2c: what credit notes owe back to trust from a trust application, operating → trust.
    SELECT e.firm_id, e.id, 'TRUST_APPLIED'::"MoneyMoveKind", 'OPERATING_TO_TRUST'::"MoneyMoveDirection", e.currency, e.person_id, e.company_id, e.case_id, e.invoice_id,
           money_owed_live(e.firm_id, e.id)::integer, 0, e.created_at
      FROM "money_trust_entry" e WHERE e.kind = 'WITHDRAWAL_TO_INVOICE' AND money_owed_live(e.firm_id, e.id) > 0
  ), m AS (
    SELECT s.*, money_moved_live(s.firm_id, s.source_entry_id, s.direction)::integer AS moved_minor FROM src s
  )
  SELECT firm_id, source_entry_id, kind, direction, currency, person_id, company_id, case_id, invoice_id, eligible_minor, returned_minor, moved_minor,
         eligible_minor - returned_minor - moved_minor AS open_minor, created_at
    FROM m WHERE eligible_minor - returned_minor - moved_minor > 0;

-- PF-12: trigger functions on firm tables run as the wall reader (SECURITY DEFINER, search_path pinned); CREATE OR
-- REPLACE keeps the owner but resets these settings, so they are set again.
DO $readers$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['money_trust_entry_write()', 'money_credit_note_write()', 'money_write_off_write()', 'money_payment_returned_not_cleared()', 'money_credit_note_owed_back()', 'money_move_line_write()', 'money_trust_entry_moves()'] LOOP
    EXECUTE format('ALTER FUNCTION %s SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp', f);
    EXECUTE format('ALTER FUNCTION %s OWNER TO xr_wall_reader', f);
  END LOOP;
END
$readers$;
