-- FO-7ts part 2 (brief product/design/briefs/FO-7ts.md Part 2, Build Lead C's build-lead-c-briefs/FO-7ts-2.md; AG-6-60
-- rules 2-5, 9, AG-6-21 rules 2-3, 5 §7, AG-6-23 rules 1, 4; P-603, P-634, P-600 (d); Lead 61 ruling 5c; legal reading
-- Unconfirmed: no counsel): two ledgers under the party lock. Schema and database rules only: no route, no screen.
--   * the pre-case → case pair: MOVE_TO_CASE, − on the party with no case (at most its pre-case balance, refused at zero
--     or below), + on a case naming the − (moved_from_entry_id), one + per −, both in one transaction (checked at commit);
--     the party's balance is unchanged and nothing leaves trust. The case's currency and client are the move route's.
--   * the credit ledger money_credit_entry, per holder (the case, or the party) and currency: KEPT, APPLIED, REFUNDED,
--     REVERSED, never below zero, insert-only, behind PF-12's walls. Credit is not trust (P-634 does not touch it).
--   * one lock order: both take the party lock first (money_trust_lock, FO-7lk), then any invoice row, then (applied
--     credit, above READ COMMITTED only, NOWAIT) the draft's lines (review n-f).
-- Replaces money_trust_entry_write (FO-7a2's text after FO-7lk, changed only for the pair); every other function is new,
-- with five new triggers keeping the credit rules after later writes. No other row's function is edited.
-- Rollback: rollback.sql in this folder (Prisma reads only migration.sql); the enum value MOVE_TO_CASE stays.

-- Prisma's DDL. MOVE_TO_CASE is usable only after this commits: only function bodies and text compares name it below.
CREATE TYPE "MoneyCreditKind" AS ENUM ('KEPT', 'APPLIED', 'REFUNDED', 'REVERSED');
ALTER TYPE "MoneyTrustEntryKind" ADD VALUE IF NOT EXISTS 'MOVE_TO_CASE';  -- IF NOT EXISTS: re-run after the rollback (break R2)
ALTER TABLE "money_trust_entry" ADD COLUMN     "moved_from_entry_id" UUID;
CREATE TABLE "money_credit_entry" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "firm_id" UUID NOT NULL,
    "person_id" UUID,
    "company_id" UUID,
    "case_id" UUID,
    "kind" "MoneyCreditKind" NOT NULL,
    "amount_minor" INTEGER NOT NULL,
    "currency" "MoneyCurrency" NOT NULL,
    "seq" INTEGER NOT NULL DEFAULT 0,
    "balance_after_minor" INTEGER NOT NULL DEFAULT 0,
    "payment_id" UUID,
    "invoice_id" UUID,
    "reverses_entry_id" UUID,
    "reason" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "money_credit_entry_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "money_credit_entry_firm_id_payment_id_idx" ON "money_credit_entry"("firm_id", "payment_id");
CREATE INDEX "money_credit_entry_firm_id_invoice_id_idx" ON "money_credit_entry"("firm_id", "invoice_id");
CREATE INDEX "money_credit_entry_firm_id_reverses_entry_id_idx" ON "money_credit_entry"("firm_id", "reverses_entry_id");
CREATE UNIQUE INDEX "money_credit_entry_firm_id_id_key" ON "money_credit_entry"("firm_id", "id");
CREATE UNIQUE INDEX "money_trust_entry_firm_id_moved_from_entry_id_key" ON "money_trust_entry"("firm_id", "moved_from_entry_id");
ALTER TABLE "money_trust_entry" ADD CONSTRAINT "money_trust_entry_firm_id_moved_from_entry_id_fkey" FOREIGN KEY ("firm_id", "moved_from_entry_id") REFERENCES "money_trust_entry"("firm_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "money_credit_entry" ADD CONSTRAINT "money_credit_entry_firm_id_fkey" FOREIGN KEY ("firm_id") REFERENCES "money_payment_settings"("firm_id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "money_credit_entry" ADD CONSTRAINT "money_credit_entry_firm_id_payment_id_fkey" FOREIGN KEY ("firm_id", "payment_id") REFERENCES "money_payment"("firm_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "money_credit_entry" ADD CONSTRAINT "money_credit_entry_firm_id_invoice_id_fkey" FOREIGN KEY ("firm_id", "invoice_id") REFERENCES "money_invoice"("firm_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "money_credit_entry" ADD CONSTRAINT "money_credit_entry_firm_id_reverses_entry_id_fkey" FOREIGN KEY ("firm_id", "reverses_entry_id") REFERENCES "money_credit_entry"("firm_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- ------------------------------------------------------------------------------------------------ the move pair
-- The shape of each half (the rules across rows are in money_trust_entry_write): the − half has no case and a negative
-- amount; the + half has a case, a positive amount and names the − half; no other entry names one. The sign check and
-- the balance check take the new kind (the − half may pass below zero only when the + half brings it back).
ALTER TABLE "money_trust_entry"
  ADD CONSTRAINT "money_trust_entry_move_check" CHECK (CASE WHEN "kind"::text = 'MOVE_TO_CASE'
    THEN ("moved_from_entry_id" IS NULL AND "amount_minor" < 0 AND "case_id" IS NULL) OR ("moved_from_entry_id" IS NOT NULL AND "amount_minor" > 0 AND "case_id" IS NOT NULL AND "moved_from_entry_id" <> "id")
    ELSE "moved_from_entry_id" IS NULL END),
  DROP CONSTRAINT "money_trust_entry_sign_check",
  ADD CONSTRAINT "money_trust_entry_sign_check" CHECK (("kind" = 'DEPOSIT' AND "amount_minor" > 0) OR ("kind" IN ('WITHDRAWAL_TO_INVOICE', 'REFUND_TO_CLIENT') AND "amount_minor" < 0)
    OR ("kind" = 'CORRECTION' AND "amount_minor" <> 0) OR ("kind"::text = 'MOVE_TO_CASE' AND "amount_minor" <> 0)),
  DROP CONSTRAINT "money_trust_entry_balance_check",
  ADD CONSTRAINT "money_trust_entry_balance_check" CHECK ("seq" >= 1 AND ("balance_after_minor" >= 0 OR "amount_minor" > 0 OR "kind"::text = 'MOVE_TO_CASE'
    OR ("kind" = 'CORRECTION' AND "correction_kind" IN ('RETURNED', 'RECORDED_BY_MISTAKE', 'WRONG_CLIENT', 'OTHER'))));

-- FO-7a2's text (after FO-7lk), changed only for the pair: the two branches after the trust check, and the − half may
-- pass below zero (moving).
CREATE OR REPLACE FUNCTION money_trust_entry_write() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE d record; reversal boolean := false; last_seq integer; last_balance bigint; party uuid := coalesce(NEW.person_id, NEW.company_id); bal bigint; applied bigint; open_amount bigint; returned bigint; moving boolean := false; pre bigint;
BEGIN
  -- The party's lock first, before any invoice row is touched, so a "Trust first" deposit and withdrawal in one
  -- transaction never deadlock with another withdrawal on the same invoice (review round 2, Minor 2: 40P01).
  IF party IS NOT NULL THEN
    PERFORM money_trust_lock(NEW.firm_id, party, NEW.currency);
  END IF;
  IF NEW.kind = 'DEPOSIT' THEN
    PERFORM money_trust_on(NEW.firm_id, 'money_trust_entry');
  END IF;
  -- FO-7ts part 2 (AG-6-60 rules 3, 5, 9; P-634): a move to a case is a pair on this party, read under its lock. The −
  -- half (no case) is an outflow from the pre-case balance: at most what the party holds with no case in this currency,
  -- refused at zero or below. The + half (on a case) names a − half this transaction wrote, on the same party and
  -- currency, with the opposite amount. One + per − is the unique key on moved_from_entry_id; a − with no + is refused
  -- at commit (money_trust_entry_move_paired). Any trust state: it brings no money in.
  IF NEW.kind = 'MOVE_TO_CASE' AND NEW.moved_from_entry_id IS NULL THEN
    SELECT coalesce(sum(e.amount_minor), 0) INTO pre FROM "money_trust_entry" e WHERE e.firm_id = NEW.firm_id AND e.currency = NEW.currency AND e.case_id IS NULL
      AND ((NEW.person_id IS NOT NULL AND e.person_id = NEW.person_id) OR (NEW.person_id IS NULL AND e.company_id = NEW.company_id));
    IF -NEW.amount_minor > pre THEN
      RAISE EXCEPTION 'money_trust_entry: a move to a case takes only what is held before a case: Only % % is available', NEW.currency, to_char(greatest(pre, 0) / 100.0, 'FM999,999,990.00') USING ERRCODE = 'check_violation';
    END IF;
    moving := true;  -- the pair nets to zero, so the − half alone may pass below zero when the party's case is short
  ELSIF NEW.kind = 'MOVE_TO_CASE' THEN
    SELECT e.kind, e.person_id, e.company_id, e.currency, e.amount_minor, e.moved_from_entry_id AS from_id,
           pg_xact_status(((pg_current_xact_id()::text::bigint >> 32 << 32) | e.xmin::text::bigint)::text::xid8) = 'in progress' AS mine
      INTO d FROM "money_trust_entry" e WHERE e.firm_id = NEW.firm_id AND e.id = NEW.moved_from_entry_id;
    IF NOT FOUND THEN PERFORM money_missing('money_trust_entry', 'entry', NEW.moved_from_entry_id); END IF;
    IF d.kind IS DISTINCT FROM 'MOVE_TO_CASE' OR d.from_id IS NOT NULL THEN
      RAISE EXCEPTION 'money_trust_entry: the + half of a move to a case names the − half of a move, not a %', d.kind USING ERRCODE = 'check_violation';
    END IF;
    IF (d.person_id, d.company_id, d.currency) IS DISTINCT FROM (NEW.person_id, NEW.company_id, NEW.currency) OR d.amount_minor <> -NEW.amount_minor THEN
      RAISE EXCEPTION 'money_trust_entry: the + half of a move to a case is on the − half''s party and currency, with the opposite amount (%)', -d.amount_minor USING ERRCODE = 'check_violation';
    END IF;
    IF d.mine IS NOT TRUE THEN
      RAISE EXCEPTION 'money_trust_entry: the + half of a move to a case is written in the transaction that wrote its − half' USING ERRCODE = 'check_violation';
    END IF;
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
  IF bal < 0 AND NEW.amount_minor < 0 AND NOT reversal AND NOT moving THEN
    RAISE EXCEPTION 'money_trust_entry: Only % % is available; the trust balance would go below zero (held % %, entry %)',
      NEW.currency, to_char(greatest(coalesce(last_balance, 0), 0) / 100.0, 'FM999,999,990.00'), coalesce(last_balance, 0), NEW.currency, NEW.amount_minor USING ERRCODE = 'check_violation';
  END IF;
  NEW.seq := coalesce(last_seq, 0) + 1;
  NEW.balance_after_minor := bal;
  NEW.created_at := now();
  RETURN NEW;
END $$;


-- Each − half has its + half by the end of its transaction (a CHECK cannot read another row).
CREATE OR REPLACE FUNCTION money_trust_entry_move_paired() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.kind = 'MOVE_TO_CASE' AND NEW.moved_from_entry_id IS NULL
     AND NOT EXISTS (SELECT 1 FROM "money_trust_entry" p WHERE p.firm_id = NEW.firm_id AND p.moved_from_entry_id = NEW.id) THEN
    RAISE EXCEPTION 'money_trust_entry: a move to a case is a pair: the + entry on the case, naming this one, is written in the same transaction' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER money_trust_entry_move_paired AFTER INSERT ON "money_trust_entry" DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW WHEN (NEW.kind::text = 'MOVE_TO_CASE' AND NEW.moved_from_entry_id IS NULL) EXECUTE FUNCTION money_trust_entry_move_paired();

-- ------------------------------------------------------------------------------------------------ the credit ledger
ALTER TABLE "money_credit_entry"
  ADD CONSTRAINT "money_credit_entry_party_check" CHECK (num_nonnulls("person_id", "company_id") = 1),
  ADD CONSTRAINT "money_credit_entry_sign_check" CHECK (("kind" = 'KEPT' AND "amount_minor" > 0) OR ("kind" IN ('APPLIED', 'REFUNDED') AND "amount_minor" < 0) OR ("kind" = 'REVERSED' AND "amount_minor" <> 0)),
  ADD CONSTRAINT "money_credit_entry_links_check" CHECK (("kind" = 'KEPT') = ("payment_id" IS NOT NULL) AND ("kind" = 'APPLIED') = ("invoice_id" IS NOT NULL)
    AND ("kind" = 'REVERSED') = ("reverses_entry_id" IS NOT NULL) AND "reverses_entry_id" IS DISTINCT FROM "id"),
  ADD CONSTRAINT "money_credit_entry_reason_check" CHECK (CASE WHEN "kind" IN ('REFUNDED', 'REVERSED') THEN money_text_ok("reason", 200) ELSE "reason" IS NULL END),
  ADD CONSTRAINT "money_credit_entry_by_check" CHECK (money_text_ok("created_by", 200)),
  ADD CONSTRAINT "money_credit_entry_balance_check" CHECK ("seq" >= 1 AND "balance_after_minor" >= 0);
-- One running balance per holder and currency: a stale writer (REPEATABLE READ) takes a seq already taken and is refused.
CREATE UNIQUE INDEX "money_credit_entry_case_seq" ON "money_credit_entry"("firm_id", "case_id", "currency", "seq") WHERE "case_id" IS NOT NULL;
CREATE UNIQUE INDEX "money_credit_entry_party_seq" ON "money_credit_entry"("firm_id", (coalesce("person_id", "company_id")), "currency", "seq") WHERE "case_id" IS NULL;
CREATE TRIGGER money_credit_entry_insert_only BEFORE UPDATE OR DELETE ON "money_credit_entry" FOR EACH ROW EXECUTE FUNCTION money_insert_only();
CREATE TRIGGER money_credit_entry_no_truncate BEFORE TRUNCATE ON "money_credit_entry" FOR EACH STATEMENT EXECUTE FUNCTION money_insert_only();

-- What is still due on an invoice: its total less credit notes and the write-off, trust paid (less "Refund to the
-- client" choices, as FO-7a2 counts it), its payments into operating net of their refunds, and credit applied net of
-- reversals. Below zero, it was paid over. Caller's rights (inside a trigger it runs as the wall reader).
CREATE OR REPLACE FUNCTION money_invoice_due(f uuid, inv uuid) RETURNS bigint LANGUAGE sql STABLE SET search_path = pg_catalog, public, pg_temp AS
  $$ SELECT money_invoice_total(f, inv)
       - (SELECT coalesce(sum(c.amount_minor), 0) FROM "money_credit_note" c WHERE c.firm_id = f AND c.invoice_id = inv)
       - (SELECT coalesce(sum(w.amount_minor), 0) FROM "money_write_off" w WHERE w.firm_id = f AND w.invoice_id = inv)
       - greatest(money_trust_paid(f, inv) - (SELECT coalesce(sum(c.overpaid_minor), 0) FROM "money_credit_note" c WHERE c.firm_id = f AND c.invoice_id = inv AND c.overpaid_choice = 'OVERPAID_REFUND'), 0)
       - (SELECT coalesce(sum(p.amount_minor), 0) - coalesce((SELECT sum(r.amount_minor) FROM "money_refund" r JOIN "money_payment" q ON q.firm_id = r.firm_id AND q.id = r.payment_id
            WHERE r.firm_id = f AND q.invoice_id = inv AND q.received_into = 'OPERATING'), 0)
            FROM "money_payment" p WHERE p.firm_id = f AND p.invoice_id = inv AND p.received_into = 'OPERATING')
       + (SELECT coalesce(sum(a.amount_minor), 0) + coalesce((SELECT sum(r.amount_minor) FROM "money_credit_entry" r JOIN "money_credit_entry" x ON x.firm_id = r.firm_id AND x.id = r.reverses_entry_id
            WHERE r.firm_id = f AND x.invoice_id = inv AND x.kind = 'APPLIED'), 0)
            FROM "money_credit_entry" a WHERE a.firm_id = f AND a.invoice_id = inv AND a.kind = 'APPLIED') $$;

-- The party's lock first (FO-7lk's key), then any invoice row, then the holder's last entry (a fresh read after the
-- lock); the database writes seq, the balance and the time.
CREATE OR REPLACE FUNCTION money_credit_entry_write() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE d record; i record; last_seq integer; last_balance bigint; bal bigint; due bigint; kept bigint; undone bigint;
BEGIN
  PERFORM money_trust_lock(NEW.firm_id, coalesce(NEW.person_id, NEW.company_id), NEW.currency);
  IF NEW.kind = 'KEPT' THEN
    -- AG-6-21 rules 2-3: what a payment paid over its invoice may be kept for the invoice's holder.
    SELECT p.amount_minor, p.currency, p.received_into, p.invoice_id, p.cleared INTO d FROM "money_payment" p WHERE p.firm_id = NEW.firm_id AND p.id = NEW.payment_id;
    IF NOT FOUND THEN PERFORM money_missing('money_credit_entry', 'payment', NEW.payment_id); END IF;
    IF d.received_into <> 'OPERATING' OR d.invoice_id IS NULL THEN
      RAISE EXCEPTION 'money_credit_entry: credit is kept from a payment into operating on an invoice (money in trust stays in the trust ledger)' USING ERRCODE = 'check_violation';
    END IF;
    IF NOT d.cleared THEN
      RAISE EXCEPTION 'money_credit_entry: credit is kept only from money that arrived (this cheque is not cleared yet)' USING ERRCODE = 'check_violation';
    END IF;
    IF d.currency <> NEW.currency THEN
      RAISE EXCEPTION 'money_credit_entry: credit is in its payment''s currency (%)', d.currency USING ERRCODE = 'check_violation';
    END IF;
    UPDATE "money_invoice" x SET updated_at = now() WHERE x.firm_id = NEW.firm_id AND x.id = d.invoice_id RETURNING x.person_id, x.company_id, x.case_id INTO i;
    IF (i.person_id, i.company_id, i.case_id) IS DISTINCT FROM (NEW.person_id, NEW.company_id, NEW.case_id) THEN
      RAISE EXCEPTION 'money_credit_entry: credit is kept for its invoice''s holder (the same party and case)' USING ERRCODE = 'check_violation';
    END IF;
    -- Kept so far from the invoice's payments (net of reversals), and from this payment.
    SELECT coalesce(sum(k.amount_minor + coalesce((SELECT sum(r.amount_minor) FROM "money_credit_entry" r WHERE r.firm_id = k.firm_id AND r.reverses_entry_id = k.id), 0)), 0),
           coalesce(sum(k.amount_minor + coalesce((SELECT sum(r.amount_minor) FROM "money_credit_entry" r WHERE r.firm_id = k.firm_id AND r.reverses_entry_id = k.id), 0)) FILTER (WHERE k.payment_id = NEW.payment_id), 0)
      INTO kept, undone FROM "money_credit_entry" k JOIN "money_payment" p ON p.firm_id = k.firm_id AND p.id = k.payment_id
     WHERE k.firm_id = NEW.firm_id AND k.kind = 'KEPT' AND p.invoice_id = d.invoice_id;
    due := money_invoice_due(NEW.firm_id, d.invoice_id);
    IF kept + NEW.amount_minor > greatest(-due, 0) THEN
      RAISE EXCEPTION 'money_credit_entry: only % % was paid over this invoice and is not kept yet', to_char(greatest(-due - kept, 0) / 100.0, 'FM999,999,990.00'), NEW.currency USING ERRCODE = 'check_violation';
    END IF;
    IF undone + NEW.amount_minor > d.amount_minor - (SELECT coalesce(sum(r.amount_minor), 0) FROM "money_refund" r WHERE r.firm_id = NEW.firm_id AND r.payment_id = NEW.payment_id) THEN
      RAISE EXCEPTION 'money_credit_entry: credit kept from a payment is never more than the payment, less its refunds' USING ERRCODE = 'check_violation';
    END IF;
  ELSIF NEW.kind = 'APPLIED' THEN
    -- AG-6-21 rule 5: to an invoice of the same holder and currency, draft or issued, at most what is due on it.
    UPDATE "money_invoice" x SET updated_at = now() WHERE x.firm_id = NEW.firm_id AND x.id = NEW.invoice_id RETURNING x.person_id, x.company_id, x.case_id, x.currency INTO i;
    IF NOT FOUND THEN PERFORM money_missing('money_credit_entry', 'invoice', NEW.invoice_id); END IF;
    IF (i.currency, i.case_id, i.person_id, i.company_id) IS DISTINCT FROM (NEW.currency, NEW.case_id, NEW.person_id, NEW.company_id) THEN  -- and its party (review m2)
      RAISE EXCEPTION 'money_credit_entry: credit pays only an invoice of its holder (the same case, or the same party with no case) and currency' USING ERRCODE = 'check_violation';
    END IF;
    -- Above READ COMMITTED a stale line read must fail (break N4: 40001): after the row, share the lines without waiting
    -- (55P03; never 40P01: break N11, N12, review M3, m-f). At READ COMMITTED each read is already fresh.
    IF current_setting('transaction_isolation') NOT IN ('read committed', 'read uncommitted') THEN
      PERFORM 1 FROM "money_invoice_line" l WHERE l.firm_id = NEW.firm_id AND l.invoice_id = NEW.invoice_id FOR SHARE NOWAIT;
    END IF;
    due := money_invoice_due(NEW.firm_id, NEW.invoice_id);
    IF -NEW.amount_minor > due THEN
      RAISE EXCEPTION 'money_credit_entry: % % is more than is due on the invoice (% %)', to_char(-NEW.amount_minor / 100.0, 'FM999,999,990.00'), NEW.currency, to_char(greatest(due, 0) / 100.0, 'FM999,999,990.00'), NEW.currency USING ERRCODE = 'check_violation';
    END IF;
  ELSIF NEW.kind = 'REVERSED' THEN
    -- Lead 61, ruling 5c: a reversal undoes one KEPT or APPLIED entry of this holder, never more than it in all.
    SELECT r.kind, r.amount_minor, r.person_id, r.company_id, r.case_id, r.currency, r.invoice_id INTO d FROM "money_credit_entry" r WHERE r.firm_id = NEW.firm_id AND r.id = NEW.reverses_entry_id;
    IF NOT FOUND THEN PERFORM money_missing('money_credit_entry', 'entry', NEW.reverses_entry_id); END IF;
    IF d.kind NOT IN ('KEPT', 'APPLIED') OR (d.person_id, d.company_id, d.case_id, d.currency) IS DISTINCT FROM (NEW.person_id, NEW.company_id, NEW.case_id, NEW.currency) THEN
      RAISE EXCEPTION 'money_credit_entry: a reversal names a KEPT or APPLIED entry of the same holder and currency' USING ERRCODE = 'check_violation';
    END IF;
    IF d.invoice_id IS NOT NULL THEN
      UPDATE "money_invoice" x SET updated_at = now() WHERE x.firm_id = NEW.firm_id AND x.id = d.invoice_id;
    END IF;
    SELECT coalesce(sum(r.amount_minor), 0) INTO undone FROM "money_credit_entry" r WHERE r.firm_id = NEW.firm_id AND r.reverses_entry_id = NEW.reverses_entry_id;
    IF sign(NEW.amount_minor) = sign(d.amount_minor) OR abs(undone + NEW.amount_minor) > abs(d.amount_minor) THEN
      RAISE EXCEPTION 'money_credit_entry: a reversal has the opposite sign of its entry and never undoes more than it (% of %, % undone before)', NEW.amount_minor, d.amount_minor, undone USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  IF NEW.case_id IS NOT NULL THEN
    SELECT e.seq, e.balance_after_minor INTO last_seq, last_balance FROM "money_credit_entry" e
      WHERE e.firm_id = NEW.firm_id AND e.case_id = NEW.case_id AND e.currency = NEW.currency ORDER BY e.seq DESC LIMIT 1;
  ELSE
    SELECT e.seq, e.balance_after_minor INTO last_seq, last_balance FROM "money_credit_entry" e
      WHERE e.firm_id = NEW.firm_id AND e.case_id IS NULL AND coalesce(e.person_id, e.company_id) = coalesce(NEW.person_id, NEW.company_id) AND e.currency = NEW.currency ORDER BY e.seq DESC LIMIT 1;
  END IF;
  bal := coalesce(last_balance, 0) + NEW.amount_minor;
  IF bal < 0 THEN
    RAISE EXCEPTION 'money_credit_entry: Only % % of credit is available', NEW.currency, to_char(greatest(coalesce(last_balance, 0), 0) / 100.0, 'FM999,999,990.00') USING ERRCODE = 'check_violation';
  END IF;
  NEW.seq := coalesce(last_seq, 0) + 1;
  NEW.balance_after_minor := bal;
  NEW.created_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER money_credit_entry_write BEFORE INSERT ON "money_credit_entry" FOR EACH ROW EXECUTE FUNCTION money_credit_entry_write();

-- ------------------------------------------------------------------------------- kept and applied credit stay true
-- Break B4-B8 on 692ea4be: the credit rules hold after later writes too (a refund, a reversal, trust returned, a draft's
-- lines, the invoice's holder). Each writer takes the party lock before the invoice row, or (draft lines) only the row;
-- applied credit shares a draft's lines after its row, without waiting, and only above READ COMMITTED (review n-f).
CREATE OR REPLACE FUNCTION money_credit_kept_holds(f uuid, inv uuid, what text) RETURNS void LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE kept bigint; due bigint;
BEGIN
  SELECT coalesce(sum(k.amount_minor + coalesce((SELECT sum(r.amount_minor) FROM "money_credit_entry" r WHERE r.firm_id = k.firm_id AND r.reverses_entry_id = k.id), 0)), 0)
    INTO kept FROM "money_credit_entry" k JOIN "money_payment" p ON p.firm_id = k.firm_id AND p.id = k.payment_id WHERE k.firm_id = f AND k.kind = 'KEPT' AND p.invoice_id = inv;
  IF kept <= 0 THEN RETURN; END IF;
  due := money_invoice_due(f, inv);
  IF kept > greatest(-due, 0) THEN
    RAISE EXCEPTION '%: % of what was paid on this invoice is held as credit, so the invoice must stay paid over by that much (now %): reverse the kept credit first',
      what, to_char(kept / 100.0, 'FM999,999,990.00'), to_char(-due / 100.0, 'FM999,999,990.00') USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM "money_payment" p WHERE p.firm_id = f AND p.invoice_id = inv
      AND p.amount_minor - coalesce((SELECT sum(r.amount_minor) FROM "money_refund" r WHERE r.firm_id = p.firm_id AND r.payment_id = p.id), 0)
        < coalesce((SELECT sum(k.amount_minor + coalesce((SELECT sum(r.amount_minor) FROM "money_credit_entry" r WHERE r.firm_id = k.firm_id AND r.reverses_entry_id = k.id), 0))
                     FROM "money_credit_entry" k WHERE k.firm_id = p.firm_id AND k.kind = 'KEPT' AND k.payment_id = p.id), 0)) THEN
    RAISE EXCEPTION '%: credit kept from a payment is never more than the payment less its refunds: reverse the kept credit first', what USING ERRCODE = 'check_violation';
  END IF;
END $$;

-- The credit held on an invoice, kept from its payments or applied to it, net of reversals.
CREATE OR REPLACE FUNCTION money_invoice_credit(f uuid, inv uuid, k "MoneyCreditKind") RETURNS bigint LANGUAGE sql STABLE SET search_path = pg_catalog, public, pg_temp AS
  $$ SELECT coalesce(sum(e.amount_minor + coalesce((SELECT sum(r.amount_minor) FROM "money_credit_entry" r WHERE r.firm_id = e.firm_id AND r.reverses_entry_id = e.id), 0)), 0)
       FROM "money_credit_entry" e LEFT JOIN "money_payment" p ON p.firm_id = e.firm_id AND p.id = e.payment_id
      WHERE e.firm_id = f AND e.kind = k AND (e.invoice_id = inv OR p.invoice_id = inv) $$;

-- B5: reversing an application re-opens its invoice; credit kept from that invoice's payments must still be paid over.
CREATE OR REPLACE FUNCTION money_credit_entry_holds() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE inv uuid;
BEGIN
  SELECT r.invoice_id INTO inv FROM "money_credit_entry" r WHERE r.firm_id = NEW.firm_id AND r.id = NEW.reverses_entry_id AND r.kind = 'APPLIED';
  IF inv IS NOT NULL THEN PERFORM money_credit_kept_holds(NEW.firm_id, inv, 'money_credit_entry'); END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER money_credit_entry_holds AFTER INSERT ON "money_credit_entry" FOR EACH ROW WHEN (NEW.kind = 'REVERSED') EXECUTE FUNCTION money_credit_entry_holds();

-- B4: a refund of an operating payment on an invoice: the party lock BEFORE FO-7a's money_refund_write locks the payment
-- row ("credit" sorts before "write"; review M2, break N9: 40P01 otherwise); the invoice row and the check AFTER, so
-- FO-7a's refund ordinal still refuses a stale second refund first (23505).
CREATE OR REPLACE FUNCTION money_refund_credit_kept() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE i record;
BEGIN
  SELECT x.id, coalesce(x.person_id, x.company_id) AS party, x.currency INTO i FROM "money_payment" p JOIN "money_invoice" x ON x.firm_id = p.firm_id AND x.id = p.invoice_id
   WHERE p.firm_id = NEW.firm_id AND p.id = NEW.payment_id AND p.received_into = 'OPERATING';
  IF NOT FOUND THEN RETURN NEW; END IF;
  IF TG_WHEN = 'BEFORE' THEN PERFORM money_trust_lock(NEW.firm_id, i.party, i.currency); RETURN NEW; END IF;
  UPDATE "money_invoice" x SET updated_at = now() WHERE x.firm_id = NEW.firm_id AND x.id = i.id;
  PERFORM money_credit_kept_holds(NEW.firm_id, i.id, 'money_refund');
  RETURN NEW;
END $$;
CREATE TRIGGER money_refund_credit_lock BEFORE INSERT ON "money_refund" FOR EACH ROW EXECUTE FUNCTION money_refund_credit_kept();
CREATE TRIGGER money_refund_credit_kept AFTER INSERT ON "money_refund" FOR EACH ROW EXECUTE FUNCTION money_refund_credit_kept();

-- B6: money returned to trust from a withdrawal re-opens its invoice (the entry already holds the party lock).
CREATE OR REPLACE FUNCTION money_trust_entry_credit_kept() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE inv uuid;
BEGIN
  SELECT w.invoice_id INTO inv FROM "money_trust_entry" w WHERE w.firm_id = NEW.firm_id AND w.id = NEW.corrects_entry_id AND w.kind = 'WITHDRAWAL_TO_INVOICE';
  IF inv IS NOT NULL THEN PERFORM money_credit_kept_holds(NEW.firm_id, inv, 'money_trust_entry'); END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER money_trust_entry_credit_kept AFTER INSERT ON "money_trust_entry" FOR EACH ROW WHEN (NEW.kind = 'CORRECTION' AND NEW.amount_minor > 0) EXECUTE FUNCTION money_trust_entry_credit_kept();

-- B7: a draft's lines never fall below the credit applied to it (the line writer holds the invoice row FOR SHARE).
CREATE OR REPLACE FUNCTION money_invoice_line_credit() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE f uuid; inv uuid; applied bigint;
BEGIN
  IF TG_OP = 'DELETE' THEN f := OLD.firm_id; inv := OLD.invoice_id; ELSE f := NEW.firm_id; inv := NEW.invoice_id; END IF;
  applied := -money_invoice_credit(f, inv, 'APPLIED');
  IF applied > 0 AND money_invoice_total(f, inv) - (SELECT coalesce(sum(c.amount_minor), 0) FROM "money_credit_note" c WHERE c.firm_id = f AND c.invoice_id = inv)
       - (SELECT coalesce(sum(w.amount_minor), 0) FROM "money_write_off" w WHERE w.firm_id = f AND w.invoice_id = inv) < applied THEN
    RAISE EXCEPTION 'money_invoice_line: % of credit is applied to this draft, more than its lines would leave: reverse that credit first', to_char(applied / 100.0, 'FM999,999,990.00') USING ERRCODE = 'check_violation';
  END IF;
  PERFORM money_credit_kept_holds(f, inv, 'money_invoice_line');
  RETURN NULL;
END $$;
CREATE TRIGGER money_invoice_line_credit AFTER INSERT OR UPDATE OR DELETE ON "money_invoice_line" FOR EACH ROW EXECUTE FUNCTION money_invoice_line_credit();

-- B8: an invoice that holds credit keeps its holder and currency (AG-6-21 rule 5 holds after the credit is written).
CREATE OR REPLACE FUNCTION money_invoice_credit_pinned() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.person_id, NEW.company_id, NEW.case_id, NEW.currency) IS DISTINCT FROM (OLD.person_id, OLD.company_id, OLD.case_id, OLD.currency)
     AND EXISTS (SELECT 1 FROM "money_credit_entry" e LEFT JOIN "money_payment" p ON p.firm_id = e.firm_id AND p.id = e.payment_id
                  WHERE e.firm_id = OLD.firm_id AND (e.invoice_id = OLD.id OR p.invoice_id = OLD.id)) THEN
    RAISE EXCEPTION 'money_invoice: this invoice holds credit (applied to it or kept from its payments), so its party, case and currency never change' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER money_invoice_credit_pinned BEFORE UPDATE ON "money_invoice" FOR EACH ROW EXECUTE FUNCTION money_invoice_credit_pinned();

-- ------------------------------------------------------------------------------------------- PF-12's walls (#1910)
ALTER TABLE "money_credit_entry" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY "pf12_firm" ON "money_credit_entry" USING ("firm_id" = platform_session_firm()) WITH CHECK ("firm_id" = platform_session_firm());
CREATE TRIGGER "0_pf12_firm_first" BEFORE INSERT OR UPDATE ON "money_credit_entry" FOR EACH ROW EXECUTE FUNCTION platform_firm_first('firm_id');
DO $readers$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['money_trust_entry_write()', 'money_trust_entry_move_paired()', 'money_credit_entry_write()', 'money_credit_entry_holds()',
                           'money_refund_credit_kept()', 'money_trust_entry_credit_kept()', 'money_invoice_line_credit()', 'money_invoice_credit_pinned()'] LOOP
    EXECUTE format('ALTER FUNCTION %s SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp', f);
    EXECUTE format('ALTER FUNCTION %s OWNER TO xr_wall_reader', f);
  END LOOP;
END
$readers$;
