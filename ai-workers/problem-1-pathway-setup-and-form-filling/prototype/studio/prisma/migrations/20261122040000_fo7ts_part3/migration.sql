-- FO-7ts part 3 (brief product/design/briefs/FO-7ts.md Part 3, Build Lead C's build-lead-c-briefs/FO-7ts-3.md; AG-6-23
-- rules 2-3 §7, AG-6-4 rule 2 §7, AG-6-68 rule 4 §7, AG-6-30 rules 2, 4; P-634 (1), P-600 (d); Lead 61's ruling on #1881;
-- Lead 95's plan read, 19 Nov, product/screens/FO-7ts-3/pick-guard-plan.md; legal reading Unconfirmed: no counsel).
-- Schema and database rules only: no route, no screen.
--   * a trust refund's offline details (method, date, reference) and its payee, on REFUND_TO_CLIENT only; never by card;
--   * the tax treatment: per party (money_party_tax_treatment, behind PF-12's walls) and per invoice, fixed at issue;
--   * the same-case pick: another payer's money pays an invoice only as a pick by the writer, with a reason, at the
--     database's time, on one and the same non-null case, never more than the payer holds on that case;
--   * the newest-issued index money_invoice (firm_id, issued_at DESC, id).
-- Replaces money_trust_entry_write (FO-7ts part 2's text, changed only as above), money_invoice_write (FO-7ts part 1's
-- text, plus the treatment), and, by Lead 96's rulings, FO-7lk's money_credit_note_write, money_move_batch_owed_back
-- and money_move_line_write (the two party locks smaller id first, as a pick takes them); no other function is edited or
-- added.
-- Rollback: rollback.sql in this folder (Prisma reads only migration.sql).

-- Trust refunds recorded before this part carry no method or date; they are never filled in silently.
DO $refunds$
BEGIN
  PERFORM set_config('row_security', 'off', true);
  IF EXISTS (SELECT 1 FROM "money_trust_entry" WHERE "kind" = 'REFUND_TO_CLIENT') THEN
    RAISE EXCEPTION 'FO-7ts part 3: trust refunds are recorded without a method or date: no route writes these yet, so only a test database holds one: ask the tech lead' USING ERRCODE = 'check_violation';
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


-- Invoices issued before this part: what issuing would have chosen (no party treatment exists yet), set while FO-7ts
-- part 1's freeze does not yet name the column (break m2), so none is left null for good.
DO $issued$
BEGIN
  PERFORM set_config('row_security', 'off', true);
  UPDATE "money_invoice" SET "tax_treatment" = 'TAXABLE' WHERE "issued_at" IS NOT NULL AND "tax_treatment" IS NULL;
END
$issued$;

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
  -- FO-7ts part 3: a pick, and a correction returning money from one, touch two parties' ledgers (the payer's, and the
  -- invoice's party's: its credit and money_issued_invoice's lock), so both locks are taken here first, the smaller id
  -- first: picks crossing on one case never deadlock (DW26), and the payee's credit is checked under both (break M1).
  -- The invoice's party is read unlocked: an issued invoice's party never changes, and a draft is refused below.
  -- Only for a write that can pass (break R2-m2; FO-7lk B-1): a pick, or a correction of this party's own withdrawal.
  IF party IS NOT NULL AND ((NEW.kind = 'WITHDRAWAL_TO_INVOICE' AND NEW.invoice_id IS NOT NULL AND picked) OR (NEW.kind = 'CORRECTION' AND NEW.corrects_entry_id IS NOT NULL)) THEN
    SELECT coalesce(i.person_id, i.company_id), i.currency INTO inv_party, inv_cur FROM "money_invoice" i
      WHERE i.firm_id = NEW.firm_id AND i.id = coalesce(NEW.invoice_id, (SELECT w.invoice_id FROM "money_trust_entry" w WHERE w.firm_id = NEW.firm_id AND w.id = NEW.corrects_entry_id
        AND w.kind = 'WITHDRAWAL_TO_INVOICE' AND w.currency = NEW.currency AND (w.person_id, w.company_id) IS NOT DISTINCT FROM (NEW.person_id, NEW.company_id)));
    IF inv_party = party THEN inv_party := NULL; END IF;
  END IF;
  IF inv_party < party THEN
    PERFORM money_trust_lock(NEW.firm_id, inv_party, inv_cur);
  END IF;
  IF party IS NOT NULL THEN
    PERFORM money_trust_lock(NEW.firm_id, party, NEW.currency);
  END IF;
  IF inv_party > party THEN
    PERFORM money_trust_lock(NEW.firm_id, inv_party, inv_cur);
  END IF;
  IF NEW.kind = 'DEPOSIT' THEN
    PERFORM money_trust_on(NEW.firm_id, 'money_trust_entry');
  END IF;
  -- FO-7ts part 3 (AG-6-23 rule 2; Build Lead C's ruling, 18 Nov): trust money goes back by an offline refund, never by
  -- card (P-567 (3)); card refunds come with card payments (FO-7c). The other refund details are checks on the row.
  IF NEW.kind = 'REFUND_TO_CLIENT' AND NEW.refund_method::text IN ('CARD', 'CARD_TERMINAL') THEN
    RAISE EXCEPTION 'money_trust_entry: a refund from trust is recorded as an offline refund (e-Transfer, cheque, wire, bank transfer, cash or other), never by card (%): card refunds come with card payments', NEW.refund_method USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.kind = 'REFUND_TO_CLIENT' AND NEW.refunded_on > current_date + 1 THEN  -- break m4: a refund is recorded once made
    RAISE EXCEPTION 'money_trust_entry: a refund is recorded on or after the day it is made, never ahead (%)', NEW.refunded_on USING ERRCODE = 'check_violation';
  END IF;
  -- and never before the party's money was in trust (break round 2): its first entry in this currency, read under its lock.
  IF NEW.kind = 'REFUND_TO_CLIENT' AND NEW.refunded_on < (SELECT min(e.created_at)::date - 1 FROM "money_trust_entry" e WHERE e.firm_id = NEW.firm_id AND e.currency = NEW.currency
      AND ((NEW.person_id IS NOT NULL AND e.person_id = NEW.person_id) OR (NEW.person_id IS NULL AND e.company_id = NEW.company_id))) THEN
    RAISE EXCEPTION 'money_trust_entry: a refund is never dated before the party''s money came into trust (%)', NEW.refunded_on USING ERRCODE = 'check_violation';
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
    SELECT e.person_id, e.company_id, e.currency, e.kind, e.amount_minor, p.method, e.case_id INTO d FROM "money_trust_entry" e
      LEFT JOIN "money_payment" p ON p.firm_id = e.firm_id AND p.id = e.payment_id WHERE e.firm_id = NEW.firm_id AND e.id = NEW.corrects_entry_id;
    IF NOT FOUND THEN PERFORM money_missing('money_trust_entry', 'entry', NEW.corrects_entry_id); END IF;
    IF (d.person_id, d.company_id, d.currency) IS DISTINCT FROM (NEW.person_id, NEW.company_id, NEW.currency) THEN
      RAISE EXCEPTION 'money_trust_entry: a correction is on the same party and currency as the entry it corrects' USING ERRCODE = 'check_violation';
    END IF;
    IF d.kind NOT IN ('WITHDRAWAL_TO_INVOICE', 'DEPOSIT') THEN
      RAISE EXCEPTION 'money_trust_entry: a correction names a withdrawal (to return money from it) or a deposit (to correct it), never a % (P-603: money leaves trust only to an issued invoice or back to the client)', d.kind USING ERRCODE = 'check_violation';
    END IF;
    -- FO-7ts part 3 (break M2, review Major 2): and on its case, so a correction never moves money between cases (the
    -- per-case limit). Money returned from a withdrawal goes back to the withdrawal's case. A deposit's correction goes
    -- on the deposit's case; a deposit made before a case may instead be corrected on a case this party moved money to
    -- (a returned cheque whose money was moved to a case comes off that case).
    IF d.case_id IS DISTINCT FROM NEW.case_id AND NOT (d.kind = 'DEPOSIT' AND d.case_id IS NULL AND EXISTS (SELECT 1 FROM "money_trust_entry" m
        WHERE m.firm_id = NEW.firm_id AND m.kind::text = 'MOVE_TO_CASE' AND m.moved_from_entry_id IS NOT NULL AND m.case_id = NEW.case_id AND m.currency = NEW.currency
          AND ((NEW.person_id IS NOT NULL AND m.person_id = NEW.person_id) OR (NEW.person_id IS NULL AND m.company_id = NEW.company_id)))) THEN
      RAISE EXCEPTION 'money_trust_entry: a correction is on the case of the entry it corrects (a deposit made before a case may also be corrected on a case its party moved money to)' USING ERRCODE = 'check_violation';
    END IF;
    -- On such a case, at most what was moved there less the pre-case deposits' corrections already booked there (break
    -- R2-M1): the rest stays before a case (a deposit may be corrected in more than one row).
    IF d.case_id IS NULL AND NEW.case_id IS NOT NULL THEN
      -- and only once nothing is left before a case (break R3-m2): the pre-case money is taken first, so a correction on
      -- a case never frees money moved there while pre-case money could have covered it.
      SELECT coalesce(sum(e.amount_minor), 0) INTO on_case FROM "money_trust_entry" e WHERE e.firm_id = NEW.firm_id AND e.currency = NEW.currency AND e.case_id IS NULL
        AND ((NEW.person_id IS NOT NULL AND e.person_id = NEW.person_id) OR (NEW.person_id IS NULL AND e.company_id = NEW.company_id));
      IF on_case > 0 THEN
        RAISE EXCEPTION 'money_trust_entry: a correction of a deposit made before a case takes from before a case first (% % held there); record that part before a case', NEW.currency, to_char(on_case / 100.0, 'FM999,999,990.00') USING ERRCODE = 'check_violation';
      END IF;
      SELECT coalesce(sum(m.amount_minor), 0) INTO on_case FROM "money_trust_entry" m WHERE m.firm_id = NEW.firm_id AND m.currency = NEW.currency AND m.case_id = NEW.case_id
        AND ((NEW.person_id IS NOT NULL AND m.person_id = NEW.person_id) OR (NEW.person_id IS NULL AND m.company_id = NEW.company_id))
        AND ((m.kind::text = 'MOVE_TO_CASE' AND m.moved_from_entry_id IS NOT NULL)
          OR (m.kind = 'CORRECTION' AND EXISTS (SELECT 1 FROM "money_trust_entry" x WHERE x.firm_id = m.firm_id AND x.id = m.corrects_entry_id AND x.kind = 'DEPOSIT' AND x.case_id IS NULL)));
      IF -NEW.amount_minor > on_case THEN
        RAISE EXCEPTION 'money_trust_entry: a correction of a deposit made before a case takes from a case at most what was moved there (% %); record the rest before a case', NEW.currency, to_char(greatest(on_case, 0) / 100.0, 'FM999,999,990.00') USING ERRCODE = 'check_violation';
      END IF;
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
    -- FO-7ts part 3 (break M3): a pick pays at most what is still due (after operating payments and applied credit too),
    -- so one client's trust money never becomes another's credit; read under the invoice row.
    IF picked AND -NEW.amount_minor > greatest(money_invoice_due(NEW.firm_id, NEW.invoice_id), 0) THEN
      RAISE EXCEPTION 'money_trust_entry: a pick pays at most what is still due on the invoice (% due)', greatest(money_invoice_due(NEW.firm_id, NEW.invoice_id), 0) USING ERRCODE = 'check_violation';
    END IF;
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

-- ----------------------------------------- FO-7lk's three other two-party writers: one lock order (Lead 96's rulings)
-- A pick holds two party locks, smaller id first (above). money_credit_note_write ("Move back to trust": the withdrawal's
-- party, then money_issued_invoice's invoice party) and money_move_batch_owed_back (an undo: each line's party, then its
-- invoice row) and money_move_line_write (a line: the payer's lock, then the invoice row of a pick's other party) took
-- them the other way, and each deadlocked against a pick (40P01; review Major 1 and R2-1, break m1 and R2-m1). All three
-- are FO-7lk's text, changed only to take the parties smaller id first. A batch of several lines can still deadlock: the
-- move route (FO-7t part 3) must take all its lines' locks, sorted, before the first line (see money_move_line_write).
CREATE OR REPLACE FUNCTION money_credit_note_write() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE open_amount bigint; trust bigint; w record; freed bigint := 0; whole bigint; inv_party uuid; inv_cur "MoneyCurrency";
BEGIN
  IF NEW.number IS NOT NULL THEN
    RAISE EXCEPTION 'money_credit_note: the number is the database''s' USING ERRCODE = 'check_violation';
  END IF;
  IF num_nonnulls(NEW.overpaid_choice, NEW.overpaid_entry_id, NEW.overpaid_minor) NOT IN (0, 3) THEN
    RAISE EXCEPTION 'money_credit_note: a refund or move-back choice carries its amount and its trust application, all three (money_credit_note_overpaid_check)' USING ERRCODE = 'check_violation';
  END IF;
  -- FO-7lk: "Move back to trust" writes a trust entry for the withdrawal's party (money_credit_note_owed_back, after the
  -- insert). Take that party's lock now, before money_issued_invoice touches the invoice row, so this path keeps the
  -- order a withdrawal to the invoice keeps: the party locks first, the invoice row second (no 40P01). Only for a
  -- withdrawal to this invoice: an entry the checks below refuse takes no lock (FO-7lk break B-1). With a pick that
  -- withdrawal's party is another than the invoice's (FO-7ts part 3), so both locks are taken, smaller id first.
  IF NEW.overpaid_choice = 'OVERPAID_TO_TRUST' THEN
    SELECT coalesce(e.person_id, e.company_id) AS party, e.currency INTO w FROM "money_trust_entry" e
      WHERE e.firm_id = NEW.firm_id AND e.id = NEW.overpaid_entry_id AND e.kind = 'WITHDRAWAL_TO_INVOICE' AND e.invoice_id = NEW.invoice_id;
    IF FOUND THEN
      -- FO-7ts part 3 (Lead 96's ruling): a pick makes the withdrawal's party another than the invoice's, and
      -- money_issued_invoice takes the invoice party's lock, so the two are taken smaller id first, as a pick takes them.
      SELECT coalesce(i.person_id, i.company_id), i.currency INTO inv_party, inv_cur FROM "money_invoice" i WHERE i.firm_id = NEW.firm_id AND i.id = NEW.invoice_id;
      IF inv_party < w.party THEN PERFORM money_trust_lock(NEW.firm_id, inv_party, inv_cur); END IF;
      PERFORM money_trust_lock(NEW.firm_id, w.party, w.currency);
    END IF;  -- anything else is refused below
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
  -- A full credit note cancels all that is left (AG-6-48 rule 2), trust-paid part included: that part is returned (or
  -- chosen) first (Devin review on #1991: a "full" credit of only the unpaid part).
  whole := open_amount;
  open_amount := open_amount - trust;
  IF NEW."full" AND NEW.amount_minor <> whole THEN
    RAISE EXCEPTION 'money_credit_note: a full credit note credits all that is left (%)', whole USING ERRCODE = 'check_violation';
  END IF;
  NEW.number := money_take_number(NEW.firm_id, 'CREDIT_NOTE');
  NEW.created_at := now();
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION money_move_batch_owed_back() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE l record; p record;
BEGIN
  IF NEW.undoes_batch_id IS NULL OR EXISTS (SELECT 1 FROM "money_move_batch" u WHERE u.firm_id = NEW.firm_id AND u.undoes_batch_id = NEW.undoes_batch_id) THEN
    RETURN NEW;  -- not an undo, or already undone (FO-7mv's unique index refuses the second)
  END IF;
  -- FO-7ts part 3 (Lead 96's ruling): with a pick a line's party (the payer) is another than its invoice's, so every
  -- party the undo touches, the lines' and their invoices', is locked first, in one order (smaller id first), before
  -- any invoice row.
  FOR p IN SELECT DISTINCT q.party, q.currency FROM (
             SELECT coalesce(x.person_id, x.company_id) AS party, x.currency FROM "money_move_line" x
               WHERE x.firm_id = NEW.firm_id AND x.batch_id = NEW.undoes_batch_id AND x.direction = 'TRUST_TO_OPERATING' AND x.kind = 'TRUST_APPLIED'
             UNION SELECT coalesce(i.person_id, i.company_id), i.currency FROM "money_move_line" x JOIN "money_invoice" i ON i.firm_id = x.firm_id AND i.id = x.invoice_id
               WHERE x.firm_id = NEW.firm_id AND x.batch_id = NEW.undoes_batch_id AND x.direction = 'TRUST_TO_OPERATING' AND x.kind = 'TRUST_APPLIED') q
            WHERE q.party IS NOT NULL ORDER BY q.party, q.currency LOOP
    PERFORM money_trust_lock(NEW.firm_id, p.party, p.currency);
  END LOOP;
  FOR l IN SELECT x.source_entry_id, x.currency, coalesce(x.person_id, x.company_id) AS party, x.invoice_id, sum(x.amount_minor) AS amount
             FROM "money_move_line" x WHERE x.firm_id = NEW.firm_id AND x.batch_id = NEW.undoes_batch_id AND x.direction = 'TRUST_TO_OPERATING' AND x.kind = 'TRUST_APPLIED'
            GROUP BY 1, 2, 3, 4 ORDER BY 3, 1 LOOP
    UPDATE "money_invoice" i SET updated_at = now() WHERE i.firm_id = NEW.firm_id AND i.id = l.invoice_id;
    IF money_owed_back(NEW.firm_id, l.source_entry_id, false) > 0
       AND money_moved_live(NEW.firm_id, l.source_entry_id, 'TRUST_TO_OPERATING') - l.amount < money_owed_back(NEW.firm_id, l.source_entry_id, false) THEN
      RAISE EXCEPTION 'money_move_batch: a credit note''s refund or move-back choice covers this move, so it is never undone (record the money''s way back instead)' USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION money_move_line_write() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE b record; s record; party uuid; inv_party uuid; inv_cur "MoneyCurrency"; earlier integer; moved bigint; returned bigint; cap bigint; arrived boolean;
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
  -- FO-7ts part 3 (Lead 96's ruling): a pick's line is on the payer, its invoice on another party, whose invoice row it
  -- touches below; both party locks are taken first, smaller id first, as a pick takes them. Within one line that holds.
  -- A batch of several lines locks line by line, so it can still deadlock against a pick, even with its lines sorted by
  -- party (a pick line also locks its invoice's party; break R3-m1): the move route (FO-7t part 3) must take every lock
  -- its lines need (each line's party and each pick line's invoice party), sorted, before the first line.
  IF NEW.kind = 'TRUST_APPLIED' AND s.invoice_id IS NOT NULL THEN
    SELECT coalesce(i.person_id, i.company_id), i.currency INTO inv_party, inv_cur FROM "money_invoice" i WHERE i.firm_id = NEW.firm_id AND i.id = s.invoice_id;
    IF inv_party = party THEN inv_party := NULL; END IF;
  END IF;
  IF inv_party < party THEN PERFORM money_trust_lock(NEW.firm_id, inv_party, inv_cur); END IF;
  PERFORM money_trust_lock(NEW.firm_id, party, s.currency);
  IF inv_party > party THEN PERFORM money_trust_lock(NEW.firm_id, inv_party, inv_cur); END IF;
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


-- PF-12: CREATE OR REPLACE keeps the owner but resets these settings, so they are set again.
-- PF-8b F4 (RDS): hand a function to xr_wall_reader only while it holds CREATE on public; taken back after
-- (a no-op pair on a superuser cluster; tests/check_pf8b_f4_migrations.ts; review R6-1).
GRANT CREATE ON SCHEMA public TO xr_wall_reader;
DO $readers$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['money_trust_entry_write()', 'money_invoice_write()', 'money_credit_note_write()', 'money_move_batch_owed_back()', 'money_move_line_write()'] LOOP
    EXECUTE format('ALTER FUNCTION %s SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp', f);
    EXECUTE format('ALTER FUNCTION %s OWNER TO xr_wall_reader', f);
  END LOOP;
END
$readers$;
REVOKE CREATE ON SCHEMA public FROM xr_wall_reader;
