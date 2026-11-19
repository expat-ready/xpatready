-- FO-7ts part 3 (brief product/design/briefs/FO-7ts.md Part 3, Build Lead C's build-lead-c-briefs/FO-7ts-3.md; AG-6-23
-- rules 2-3 §7, AG-6-4 rule 2 §7, AG-6-68 rule 4 §7, AG-6-30 rules 2, 4; P-634 (1), P-600 (d); Lead 61's ruling on #1881;
-- Lead 95's plan read, 19 Nov, product/screens/FO-7ts-3/pick-guard-plan.md; legal reading Unconfirmed: no counsel).
-- Schema and database rules only: no route, no screen.
--   * a trust refund's offline details (method, date, reference) and its payee, on REFUND_TO_CLIENT only; never by card;
--   * the tax treatment: per party (money_party_tax_treatment, behind PF-12's walls) and per invoice, fixed at issue;
--   * the same-case pick: another payer's money pays an invoice only as a pick by the writer, with a reason, at the
--     database's time, on one and the same non-null case, never more than the payer holds on that case;
--   * the newest-issued index money_invoice (firm_id, issued_at DESC, id).
-- Replaces money_trust_entry_write (FO-7ts part 2's text, changed only as above) and money_invoice_write (FO-7ts part 1's
-- text, plus the treatment); no other function is edited or added.
-- Rollback: rollback.sql in this folder (Prisma reads only migration.sql).

-- Trust refunds recorded before this part carry no method or date; they are never filled in silently.
DO $refunds$
BEGIN
  PERFORM set_config('row_security', 'off', true);
  IF EXISTS (SELECT 1 FROM "money_trust_entry" WHERE "kind" = 'REFUND_TO_CLIENT') THEN
    RAISE EXCEPTION 'FO-7ts part 3: trust refunds are recorded without a method or date: record them by hand, then rerun' USING ERRCODE = 'check_violation';
  END IF;
END
$refunds$;

-- Prisma's DDL.
-- CreateEnum
CREATE TYPE "MoneyTaxTreatment" AS ENUM ('TAXABLE', 'ZERO_RATED', 'EXEMPT');

-- AlterTable
ALTER TABLE "money_invoice" ADD COLUMN     "tax_treatment" "MoneyTaxTreatment";

-- AlterTable
ALTER TABLE "money_trust_entry" ADD COLUMN     "payee_company_id" UUID,
ADD COLUMN     "payee_name" TEXT,
ADD COLUMN     "payee_person_id" UUID,
ADD COLUMN     "payee_reason" TEXT,
ADD COLUMN     "picked_other_funds_at" TIMESTAMPTZ,
ADD COLUMN     "picked_other_funds_by" TEXT,
ADD COLUMN     "picked_other_funds_reason" TEXT,
ADD COLUMN     "refund_method" "MoneyPaymentMethod",
ADD COLUMN     "refund_reference" TEXT,
ADD COLUMN     "refunded_on" DATE;

-- CreateTable
CREATE TABLE "money_party_tax_treatment" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "firm_id" UUID NOT NULL,
    "person_id" UUID,
    "company_id" UUID,
    "treatment" "MoneyTaxTreatment" NOT NULL,
    "updated_by" TEXT NOT NULL,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "money_party_tax_treatment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "money_party_tax_treatment_firm_id_person_id_key" ON "money_party_tax_treatment"("firm_id", "person_id");

-- CreateIndex
CREATE UNIQUE INDEX "money_party_tax_treatment_firm_id_company_id_key" ON "money_party_tax_treatment"("firm_id", "company_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "money_invoice_firm_id_issued_at_id_idx" ON "money_invoice"("firm_id", "issued_at" DESC, "id");

-- AddForeignKey
ALTER TABLE "money_party_tax_treatment" ADD CONSTRAINT "money_party_tax_treatment_firm_id_fkey" FOREIGN KEY ("firm_id") REFERENCES "money_payment_settings"("firm_id") ON DELETE RESTRICT ON UPDATE RESTRICT;


-- ------------------------------------------------------------------------------------------- the rows' own checks
-- A trust refund is offline (AG-6-23 rule 2): a method that is not a card, the date, a reference when there is one. Its
-- payee is the entry's party unless a person, a company or a name is given; any other payee needs a reason (rule 3).
-- The pick (AG-6-68 rule 4): all three or none, on a withdrawal to an invoice, by the writer, with a reason.
ALTER TABLE "money_trust_entry"
  ADD CONSTRAINT "money_trust_entry_refund_check" CHECK (CASE WHEN "kind" = 'REFUND_TO_CLIENT'
    THEN "refund_method" IS NOT NULL AND "refund_method" NOT IN ('CARD', 'CARD_TERMINAL') AND "refunded_on" IS NOT NULL
      AND ("refund_reference" IS NULL OR money_text_ok("refund_reference", 100))
      AND num_nonnulls("payee_person_id", "payee_company_id", "payee_name") <= 1
      AND ("payee_name" IS NULL OR money_text_ok("payee_name", 200))
      AND CASE WHEN ("payee_person_id" IS NOT NULL AND "payee_person_id" IS DISTINCT FROM "person_id")
                 OR ("payee_company_id" IS NOT NULL AND "payee_company_id" IS DISTINCT FROM "company_id") OR "payee_name" IS NOT NULL
        THEN money_text_ok("payee_reason", 200) ELSE "payee_reason" IS NULL END
    ELSE num_nonnulls("refund_method", "refunded_on", "refund_reference", "payee_person_id", "payee_company_id", "payee_name", "payee_reason") = 0 END),
  ADD CONSTRAINT "money_trust_entry_pick_check" CHECK (
    ("picked_other_funds_by" IS NULL AND "picked_other_funds_at" IS NULL AND "picked_other_funds_reason" IS NULL)
    OR ("kind" = 'WITHDRAWAL_TO_INVOICE' AND "picked_other_funds_by" = "created_by" AND "picked_other_funds_at" IS NOT NULL
        AND money_text_ok("picked_other_funds_reason", 200)));
ALTER TABLE "money_party_tax_treatment"
  ADD CONSTRAINT "money_party_tax_treatment_party_check" CHECK (num_nonnulls("person_id", "company_id") = 1),
  ADD CONSTRAINT "money_party_tax_treatment_by_check" CHECK (money_text_ok("updated_by", 200));

-- ---------------------------------------------------------------------------------------------- PF-12's walls (#1910)
ALTER TABLE "money_party_tax_treatment" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY "pf12_firm" ON "money_party_tax_treatment" USING ("firm_id" = platform_session_firm()) WITH CHECK ("firm_id" = platform_session_firm());
CREATE TRIGGER "0_pf12_firm_first" BEFORE INSERT OR UPDATE ON "money_party_tax_treatment" FOR EACH ROW EXECUTE FUNCTION platform_firm_first('firm_id');

-- ------------------------------------------------------------------------------- money_trust_entry_write: the pick
-- FO-7ts part 2's text, changed only for part 3: the refund's card words, the pick guard (replacing the "same party and
-- currency" refusal), the per-case limit for a pick, and the pick's time.
CREATE OR REPLACE FUNCTION money_trust_entry_write() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE d record; reversal boolean := false; last_seq integer; last_balance bigint; party uuid := coalesce(NEW.person_id, NEW.company_id); bal bigint; applied bigint; open_amount bigint; returned bigint; moving boolean := false; pre bigint; other_party boolean := false; picked boolean := NEW.picked_other_funds_by IS NOT NULL; on_case bigint; inv_party uuid; inv_cur "MoneyCurrency";
BEGIN
  -- The party's lock first, before any invoice row is touched, so a "Trust first" deposit and withdrawal in one
  -- transaction never deadlock with another withdrawal on the same invoice (review round 2, Minor 2: 40P01).
  -- FO-7ts part 3: a pick holds two party locks (its own, then money_issued_invoice's on the invoice's party), so both are
  -- taken here first, the smaller id first: two picks crossing on one case (A pays B's invoice, B pays A's) never
  -- deadlock (DW26). The invoice's party is read unlocked: an issued invoice's party never changes, a draft is refused.
  IF NEW.kind = 'WITHDRAWAL_TO_INVOICE' AND NEW.invoice_id IS NOT NULL AND party IS NOT NULL THEN
    SELECT coalesce(i.person_id, i.company_id), i.currency INTO inv_party, inv_cur FROM "money_invoice" i WHERE i.firm_id = NEW.firm_id AND i.id = NEW.invoice_id;
    IF inv_party < party THEN
      PERFORM money_trust_lock(NEW.firm_id, inv_party, inv_cur);
    END IF;
  END IF;
  IF party IS NOT NULL THEN
    PERFORM money_trust_lock(NEW.firm_id, party, NEW.currency);
  END IF;
  IF NEW.kind = 'DEPOSIT' THEN
    PERFORM money_trust_on(NEW.firm_id, 'money_trust_entry');
  END IF;
  -- FO-7ts part 3 (AG-6-23 rule 2; Build Lead C's ruling, 18 Nov): trust money goes back by an offline refund, never by
  -- card (P-567 (3)); card refunds come with card payments (FO-7c). The other refund details are checks on the row.
  IF NEW.kind = 'REFUND_TO_CLIENT' AND NEW.refund_method::text IN ('CARD', 'CARD_TERMINAL') THEN
    RAISE EXCEPTION 'money_trust_entry: a refund from trust is recorded as an offline refund (e-Transfer, cheque, wire, bank transfer, cash or other), never by card (%): card refunds come with card payments', NEW.refund_method USING ERRCODE = 'check_violation';
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
    SELECT i.issued_at, i.person_id, i.company_id, i.currency, i.case_id INTO d FROM "money_invoice" i WHERE i.firm_id = NEW.firm_id AND i.id = NEW.invoice_id;
    IF NOT FOUND THEN PERFORM money_missing('money_trust_entry', 'invoice', NEW.invoice_id); END IF;
    IF d.issued_at IS NULL THEN
      RAISE EXCEPTION 'money_trust_entry: trust is applied only to an issued invoice (Code s. 32(f): invoice before withdrawing)' USING ERRCODE = 'check_violation';
    END IF;
    -- FO-7ts part 3 (AG-6-68 rule 4 §7; Lead 61's ruling on #1881; Lead 95's plan read, 19 Nov): another payer's money
    -- pays an invoice only as a pick (by the writer, with a reason, at the database's time: money_trust_entry_pick_check)
    -- on one and the same non-null case as the invoice, in its currency. Across cases, clients or currencies: refused.
    -- The balance and the lock stay the paying party's (the entry's party); the open amount is the invoice's, whoever paid.
    other_party := (d.person_id, d.company_id) IS DISTINCT FROM (NEW.person_id, NEW.company_id);
    IF d.currency IS DISTINCT FROM NEW.currency THEN
      RAISE EXCEPTION 'money_trust_entry: trust pays only an invoice of the same party and currency' USING ERRCODE = 'check_violation';
    END IF;
    IF other_party AND NOT (picked AND NEW.case_id IS NOT NULL AND d.case_id IS NOT NULL AND NEW.case_id = d.case_id) THEN
      IF picked THEN
        RAISE EXCEPTION 'money_trust_entry: another payer''s money pays an invoice only on the same case as the money (a pick never crosses cases or clients)' USING ERRCODE = 'check_violation';
      END IF;
      RAISE EXCEPTION 'money_trust_entry: trust pays only an invoice of the same party and currency' USING ERRCODE = 'check_violation';
    END IF;
    -- A pick is recorded only when one happens (Lead 95, proposal 2). The same party on another case may be a pick; the
    -- route requires it there (proposal 1), the database accepts it either way, as FO-7a did.
    IF picked AND NOT other_party AND d.case_id IS NOT DISTINCT FROM NEW.case_id THEN
      RAISE EXCEPTION 'money_trust_entry: nothing to pick: this money is the invoice''s own party''s, on its own case' USING ERRCODE = 'check_violation';
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
  -- FO-7ts part 3 (Lead 95, proposal 3): a pick takes only what the payer holds on the money's case (the case, or before
  -- a case), read under the payer's lock, after the party-wide check above (whose words come first when both fail).
  IF picked AND NEW.kind = 'WITHDRAWAL_TO_INVOICE' THEN
    SELECT coalesce(sum(e.amount_minor), 0) INTO on_case FROM "money_trust_entry" e WHERE e.firm_id = NEW.firm_id AND e.currency = NEW.currency
      AND e.case_id IS NOT DISTINCT FROM NEW.case_id AND ((NEW.person_id IS NOT NULL AND e.person_id = NEW.person_id) OR (NEW.person_id IS NULL AND e.company_id = NEW.company_id));
    IF on_case + NEW.amount_minor < 0 THEN
      RAISE EXCEPTION 'money_trust_entry: a pick takes only what the payer holds on that case: Only % % is available on it', NEW.currency, to_char(greatest(on_case, 0) / 100.0, 'FM999,999,990.00') USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  NEW.seq := coalesce(last_seq, 0) + 1;
  NEW.balance_after_minor := bal;
  NEW.created_at := now();
  IF picked THEN NEW.picked_other_funds_at := now(); END IF;  -- the database's time; a lone time is the check's to refuse
  RETURN NEW;
END $$;

-- ------------------------------------------------------------------- money_invoice_write: the treatment, fixed at issue
-- FO-7ts part 1's text, changed only for part 3: the treatment is set at issue (the party's, else Taxable) and joins the
-- columns an issued invoice never changes.
CREATE OR REPLACE FUNCTION money_invoice_write() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE wrong integer; total bigint;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.issued_at IS NOT NULL THEN
      RAISE EXCEPTION 'money_invoice: issued invoices can''t be edited — use a credit note (% is never deleted)', OLD.number USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.number IS NOT NULL OR NEW.issued_at IS NOT NULL OR NEW.issued_by IS NOT NULL THEN
      RAISE EXCEPTION 'money_invoice: an invoice is written as a draft (no number, not issued); its number is the database''s' USING ERRCODE = 'check_violation';
    END IF;
    NEW.created_at := now();
    -- A typed confirmation time is never kept: the database's clock, when who is written (F3).
    NEW.unsigned_retainer_confirmed_at := CASE WHEN NEW.unsigned_retainer_confirmed_by IS NULL THEN NULL ELSE now() END;
    RETURN NEW;
  END IF;
  IF NEW.firm_id IS DISTINCT FROM OLD.firm_id THEN
    RAISE EXCEPTION 'money_invoice: firm_id never changes' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.issued_at IS NOT NULL THEN
    IF (NEW.number, NEW.issued_at, NEW.issued_by, NEW.person_id, NEW.company_id, NEW.case_id, NEW.currency, NEW.created_by, NEW.created_at, NEW.unsigned_retainer_confirmed_by, NEW.unsigned_retainer_confirmed_at, NEW.tax_treatment)
       IS DISTINCT FROM (OLD.number, OLD.issued_at, OLD.issued_by, OLD.person_id, OLD.company_id, OLD.case_id, OLD.currency, OLD.created_by, OLD.created_at, OLD.unsigned_retainer_confirmed_by, OLD.unsigned_retainer_confirmed_at, OLD.tax_treatment) THEN
      RAISE EXCEPTION 'money_invoice: issued invoices can''t be edited — use a credit note (% is fixed)', OLD.number USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  -- On a draft: the confirmation's time follows its who (the database's clock), and never changes alone (F3).
  IF NEW.unsigned_retainer_confirmed_by IS DISTINCT FROM OLD.unsigned_retainer_confirmed_by THEN
    NEW.unsigned_retainer_confirmed_at := CASE WHEN NEW.unsigned_retainer_confirmed_by IS NULL THEN NULL ELSE now() END;
  ELSIF NEW.unsigned_retainer_confirmed_at IS DISTINCT FROM OLD.unsigned_retainer_confirmed_at THEN
    RAISE EXCEPTION 'money_invoice: when invoicing on an unsigned retainer was confirmed is the database''s, and changes only with who confirmed it' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.number IS DISTINCT FROM OLD.number OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'money_invoice: the number and the times are the database''s' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.issued_at IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM "money_invoice_line" l WHERE l.firm_id = NEW.firm_id AND l.invoice_id = NEW.id) THEN
      RAISE EXCEPTION 'money_invoice: an invoice with no lines is not issued' USING ERRCODE = 'check_violation';
    END IF;
    SELECT count(*) INTO wrong FROM "money_invoice_line" l WHERE l.firm_id = NEW.firm_id AND l.invoice_id = NEW.id AND l.currency <> NEW.currency;
    IF wrong > 0 THEN
      RAISE EXCEPTION 'money_invoice: % line(s) are not in the invoice''s currency %', wrong, NEW.currency USING ERRCODE = 'check_violation';
    END IF;
    -- Every amount written against it (a credit note, a write-off, a payment) is an integer column, so its total is
    -- one too (break: a total past 2^31 − 1 cents could never be fully credited).
    total := money_invoice_total(NEW.firm_id, NEW.id);
    IF total > 2147483647 THEN
      RAISE EXCEPTION 'money_invoice: a total of % cents is more than one invoice can hold (21,474,836.47)', total USING ERRCODE = 'check_violation';
    END IF;
    -- FO-7ts part 3 (AG-6-4 rule 2 §7): the treatment is fixed at issue. Null on a draft means the party's; at issue it
    -- becomes the party's (money_party_tax_treatment), else Taxable, so a later change to the party never moves it.
    IF NEW.tax_treatment IS NULL THEN
      NEW.tax_treatment := coalesce((SELECT t.treatment FROM "money_party_tax_treatment" t WHERE t.firm_id = NEW.firm_id
        AND ((NEW.person_id IS NOT NULL AND t.person_id = NEW.person_id) OR (NEW.person_id IS NULL AND t.company_id = NEW.company_id))), 'TAXABLE');
    END IF;
    NEW.number := money_take_number(NEW.firm_id, 'INVOICE');
    NEW.issued_at := now();  -- the issue time is the database's: never backdated (break B-10)
  END IF;
  RETURN NEW;
END $$;

-- PF-12: CREATE OR REPLACE keeps the owner but resets these settings, so they are set again.
DO $readers$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['money_trust_entry_write()', 'money_invoice_write()'] LOOP
    EXECUTE format('ALTER FUNCTION %s SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp', f);
    EXECUTE format('ALTER FUNCTION %s OWNER TO xr_wall_reader', f);
  END LOOP;
END
$readers$;
