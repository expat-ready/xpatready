-- FO-7ts part 1 (brief product/design/briefs/FO-7ts.md, Build Lead C's FO-7ts-1.md; Lead B rev 16.33, 16.35 (b), 16.36,
-- 16.37, 16.41; AG-6-59 §6-§8 rules 4-6, AG-6-4 §3 §7 §13 rules 5-7, AG-6-19 rule 1, AG-6-69 rule 3 §7, AG-6-61 rules 7, 10
-- §7, AG-6-14 rule 3, AG-6-42 §7; P-567 (3), P-568 (1), P-600 (d), P-603; legal reading Unconfirmed: no counsel; tax
-- reading Unconfirmed: no accountant): the money settings and request columns. Schema and database rules only: no route.
--   * the trust answer: UNANSWERED | YES | NO with who and when (replaces FO-7a's trust_enabled); the allowed moves are a
--     trigger (UNANSWERED → YES | NO, YES ⇄ NO, never back to UNANSWERED); money_trust_on reads YES;
--   * tax: tax_registered (needs a tax number), qst_number (stored, unused in R1: P-568 (1)), prices_include_tax; the
--     firm's rate list tax_rates and money_tax_rates_ok go (AG-6-4 §13: rates are ExpatReady data, never the firm's);
--   * "Invoice payments go to": OPERATING | TRUST_FIRST with who and when (the rule and the route are FO-7b's);
--   * payment methods BANK_TRANSFER and CARD_TERMINAL, added (none removed or renamed); not used in this migration, so
--     the one-transaction harness can add them (a new enum value is usable only after its transaction commits);
--   * a trust request's retainer_version_id: one deposit request per version (partial unique), fixed once sent;
--   * pay_link_token_hash on an invoice and a trust request: a SHA-256 in hex, never a raw token, unique per firm; it
--     may change on an issued invoice (a new link replaces the old one);
--   * an invoice's unsigned_retainer_confirmed_by / _at (AG-6-42 §7): both or neither, the time the database's (Lead 82's
--     ruling on #2106, break F3: who and when on money records are audit facts, never caller input), fixed once issued.
-- A firm row with trust_enabled = true stops the migration (Lead B rev 16.37 (1)): only test databases can hold one.
-- Rollback: ALTER TABLE money_payment_settings ADD trust_enabled boolean NOT NULL DEFAULT false (true where trust_answer
--   = 'YES'), ADD tax_rates jsonb NOT NULL DEFAULT '[]' with FO-7a's money_tax_rates_ok and its check; DROP TRIGGER
--   money_trust_answer_move ON money_payment_settings; DROP FUNCTION money_trust_answer_move(); DROP the new columns,
--   indexes and checks; re-run FO-7a's money_trust_on, money_trust_request_write and money_invoice_write with PF-12's
--   reader settings; DROP TYPE "MoneyTrustAnswer", "MoneyInvoicePaymentsGoTo". The two enum values stay (PostgreSQL
--   cannot drop one). Delete this folder's row from _prisma_migrations.

-- The mapping refusal comes first: a firm already saying "trust on" cannot be mapped to a three-state answer silently.
DO $map$
DECLARE f uuid; t text; lifted text[] := '{}'; walls text[] := ARRAY['money_payment_settings']; gated text[] := '{}';
BEGIN
  -- PF-8b F7: a runner that is neither superuser nor BYPASSRLS owns these walled tables but, under FORCE ROW LEVEL
  -- SECURITY, would read none of their rows; it lifts FORCE inside this statement (ACCESS EXCLUSIVE first) and puts it back
  -- below. tests/check_pf8b_f7_data_walls.ts fails when a data statement on a walled table runs without this.
  IF NOT (SELECT pf8b_role.rolsuper OR pf8b_role.rolbypassrls FROM pg_roles pf8b_role WHERE pf8b_role.rolname = current_user) THEN
    EXECUTE (SELECT 'LOCK TABLE ' || string_agg(format('%I', pf8b_w), ', ') || ' IN ACCESS EXCLUSIVE MODE' FROM unnest(walls) pf8b_w);
    SELECT coalesce(array_agg(pf8b_c.relname::text ORDER BY pf8b_c.relname), '{}') INTO lifted FROM pg_class pf8b_c
      WHERE pf8b_c.relnamespace = 'public'::regnamespace AND pf8b_c.relname = ANY (walls) AND pf8b_c.relforcerowsecurity;
    FOREACH t IN ARRAY lifted LOOP EXECUTE format('ALTER TABLE %I NO FORCE ROW LEVEL SECURITY', t); END LOOP;
    -- …and PF-12's firm gate, which refuses a write by such a runner with no session firm and lets a superuser or
    -- BYPASSRLS one through (platform_firm_first), steps aside on them too while plainly enabled (an ALWAYS gate stays and
    -- refuses loudly; a REPLICA one does not fire): the runner then writes as those do, and each comes back as it was.
    SELECT coalesce(array_agg(pf8b_g.tgrelid::regclass::text ORDER BY 1), '{}') INTO gated FROM pg_trigger pf8b_g
      WHERE pf8b_g.tgname = '0_pf12_firm_first' AND pf8b_g.tgenabled = 'O' AND pf8b_g.tgrelid::regclass::text = ANY (walls);
    FOREACH t IN ARRAY gated LOOP EXECUTE format('ALTER TABLE %I DISABLE TRIGGER "0_pf12_firm_first"', t); END LOOP;
  END IF;
  -- No writer between this read and the ALTER below (break F2 on facc5231: a trust_enabled = true committed in between
  -- was mapped silently), and a role that neither bypasses the walls nor owns the table (PF-8b F7 above) fails here instead
  -- of reading no rows (review Nit 2).
  LOCK TABLE "money_payment_settings" IN SHARE ROW EXCLUSIVE MODE;
  PERFORM set_config('row_security', 'off', true);
  SELECT s.firm_id INTO f FROM "money_payment_settings" s WHERE s.trust_enabled ORDER BY s.firm_id LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'FO-7ts: firm % has trust_enabled = true, which has no three-state answer: set the trust answer by hand, then rerun', f
      USING ERRCODE = 'check_violation';
  END IF;
  FOREACH t IN ARRAY gated LOOP EXECUTE format('ALTER TABLE %I ENABLE TRIGGER "0_pf12_firm_first"', t); END LOOP;
  FOREACH t IN ARRAY lifted LOOP EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t); END LOOP;   -- PF-8b F7: the walls back
END
$map$;

-- CreateEnum / AlterEnum (Prisma's DDL)
CREATE TYPE "MoneyTrustAnswer" AS ENUM ('UNANSWERED', 'YES', 'NO');
CREATE TYPE "MoneyInvoicePaymentsGoTo" AS ENUM ('OPERATING', 'TRUST_FIRST');
ALTER TYPE "MoneyPaymentMethod" ADD VALUE 'BANK_TRANSFER';
ALTER TYPE "MoneyPaymentMethod" ADD VALUE 'CARD_TERMINAL';

-- AlterTable
ALTER TABLE "money_payment_settings"
  DROP CONSTRAINT "money_payment_settings_tax_rates_check",
  DROP COLUMN "tax_rates",
  DROP COLUMN "trust_enabled",
  ADD COLUMN "trust_answer" "MoneyTrustAnswer" NOT NULL DEFAULT 'UNANSWERED',
  ADD COLUMN "trust_answered_by" TEXT,
  ADD COLUMN "trust_answered_at" TIMESTAMPTZ,
  ADD COLUMN "tax_registered" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "qst_number" TEXT,
  ADD COLUMN "prices_include_tax" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "invoice_payments_go_to" "MoneyInvoicePaymentsGoTo" NOT NULL DEFAULT 'OPERATING',
  ADD COLUMN "invoice_payments_changed_by" TEXT,
  ADD COLUMN "invoice_payments_changed_at" TIMESTAMPTZ;
DROP FUNCTION money_tax_rates_ok(jsonb);
ALTER TABLE "money_trust_request" ADD COLUMN "retainer_version_id" UUID, ADD COLUMN "pay_link_token_hash" TEXT;
ALTER TABLE "money_invoice" ADD COLUMN "pay_link_token_hash" TEXT, ADD COLUMN "unsigned_retainer_confirmed_by" UUID,
  ADD COLUMN "unsigned_retainer_confirmed_at" TIMESTAMPTZ;

-- CreateIndex: one deposit request per retainer version (a cancelled request keeps its version: an amendment is a new
-- version, AG-6-61 rule 10); one current link per document; both partial, so in SQL only (the schema says so).
CREATE UNIQUE INDEX "money_trust_request_one_per_retainer_version" ON "money_trust_request"("firm_id", "retainer_version_id") WHERE "retainer_version_id" IS NOT NULL;
CREATE UNIQUE INDEX "money_trust_request_pay_link_token_hash" ON "money_trust_request"("firm_id", "pay_link_token_hash") WHERE "pay_link_token_hash" IS NOT NULL;
CREATE UNIQUE INDEX "money_invoice_pay_link_token_hash" ON "money_invoice"("firm_id", "pay_link_token_hash") WHERE "pay_link_token_hash" IS NOT NULL;

-- Checks. An answer has an actor and a time; UNANSWERED has neither (so an answer with no actor is refused even after
-- the trigger fills the time). Registered for tax needs a tax number (AG-6-4 rule 5).
ALTER TABLE "money_payment_settings"
  ADD CONSTRAINT "money_payment_settings_trust_answer_check" CHECK (CASE WHEN "trust_answer" = 'UNANSWERED'
    THEN "trust_answered_by" IS NULL AND "trust_answered_at" IS NULL
    ELSE "trust_answered_at" IS NOT NULL AND money_text_ok("trust_answered_by", 200) END),
  ADD CONSTRAINT "money_payment_settings_tax_registered_check" CHECK (NOT "tax_registered" OR "tax_number" IS NOT NULL),
  ADD CONSTRAINT "money_payment_settings_qst_number_check" CHECK ("qst_number" IS NULL OR money_text_ok("qst_number", 40)),
  ADD CONSTRAINT "money_payment_settings_invoice_payments_check" CHECK (num_nonnulls("invoice_payments_changed_by", "invoice_payments_changed_at") IN (0, 2)
    AND ("invoice_payments_changed_by" IS NULL OR money_text_ok("invoice_payments_changed_by", 200)));
ALTER TABLE "money_trust_request"
  ADD CONSTRAINT "money_trust_request_pay_link_check" CHECK ("pay_link_token_hash" IS NULL OR "pay_link_token_hash" ~ '^[0-9a-f]{64}$');
ALTER TABLE "money_invoice"
  ADD CONSTRAINT "money_invoice_pay_link_check" CHECK ("pay_link_token_hash" IS NULL OR "pay_link_token_hash" ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT "money_invoice_unsigned_retainer_check" CHECK (num_nonnulls("unsigned_retainer_confirmed_by", "unsigned_retainer_confirmed_at") IN (0, 2));

-- The trust answer's moves and the two settings' times (AG-6-59 §6, rule 8; AG-6-69 §7). Who answered is the caller's
-- (the route checks the Owner, Lead B rev 16.33); when is the database's. A firm row starts unanswered and paying into
-- operating, with no who or when.
CREATE OR REPLACE FUNCTION money_trust_answer_move() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- Break F1 on facc5231: deleting an answered row and inserting it again would bring the answer back to unanswered.
  IF TG_OP = 'DELETE' THEN
    IF OLD.trust_answer <> 'UNANSWERED' THEN
      RAISE EXCEPTION 'money_payment_settings: an answered firm''s settings are never removed (the trust answer never goes back to unanswered)' USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.trust_answer <> 'UNANSWERED' OR num_nonnulls(NEW.trust_answered_by, NEW.trust_answered_at) > 0
       OR NEW.invoice_payments_go_to <> 'OPERATING' OR num_nonnulls(NEW.invoice_payments_changed_by, NEW.invoice_payments_changed_at) > 0 THEN
      RAISE EXCEPTION 'money_payment_settings: a firm starts with the trust question unanswered and invoice payments into operating (the Owner answers later)' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.trust_answer IS DISTINCT FROM OLD.trust_answer THEN
    IF NEW.trust_answer = 'UNANSWERED' THEN
      RAISE EXCEPTION 'money_payment_settings: the trust answer never goes back to unanswered (Yes and No may change: AG-6-59 §6)' USING ERRCODE = 'check_violation';
    END IF;
    NEW.trust_answered_at := now();
  ELSIF (NEW.trust_answered_by, NEW.trust_answered_at) IS DISTINCT FROM (OLD.trust_answered_by, OLD.trust_answered_at) THEN
    RAISE EXCEPTION 'money_payment_settings: who answered and when change only with the answer' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.invoice_payments_go_to IS DISTINCT FROM OLD.invoice_payments_go_to THEN
    NEW.invoice_payments_changed_at := now();
  ELSIF (NEW.invoice_payments_changed_by, NEW.invoice_payments_changed_at) IS DISTINCT FROM (OLD.invoice_payments_changed_by, OLD.invoice_payments_changed_at) THEN
    RAISE EXCEPTION 'money_payment_settings: who changed "Invoice payments go to" and when change only with it' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER money_trust_answer_move BEFORE INSERT OR UPDATE OR DELETE ON "money_payment_settings" FOR EACH ROW EXECUTE FUNCTION money_trust_answer_move();

-- Trust is on only once the Owner says Yes (AG-6-59 rules 4-5: until answered the firm behaves as trust off). As in
-- FO-7a, withdrawals, refunds to the client and corrections of money already held stay possible in any state (rule 6).
CREATE OR REPLACE FUNCTION money_trust_on(f uuid, what text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF coalesce((SELECT s.trust_answer FROM "money_payment_settings" s WHERE s.firm_id = f), 'UNANSWERED') <> 'YES' THEN
    RAISE EXCEPTION '%: the firm does not hold client money in trust (trust is off: the trust answer is not Yes)', what USING ERRCODE = 'check_violation';
  END IF;
END $$;

-- FO-7a's trust request rules, with the retainer version fixed once sent and both new columns in the cancelled freeze;
-- the link hash may change on a sent request (a new link replaces the old one; unused in R1, P-567 (3)).
CREATE OR REPLACE FUNCTION money_trust_request_write() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.sent_at IS NOT NULL THEN
      RAISE EXCEPTION 'money_trust_request: a sent request (%) is never deleted; cancel it with a reason', OLD.number USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'INSERT' THEN
    PERFORM money_trust_on(NEW.firm_id, 'money_trust_request');
    IF NEW.number IS NOT NULL THEN
      RAISE EXCEPTION 'money_trust_request: the number is the database''s, taken when the request is sent' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.cancelled_at IS NOT NULL THEN
      RAISE EXCEPTION 'money_trust_request: a request is not written cancelled' USING ERRCODE = 'check_violation';
    END IF;
    NEW.created_at := now();
    IF NEW.sent_at IS NOT NULL THEN NEW.number := money_take_number(NEW.firm_id, 'TRUST_REQUEST'); NEW.sent_at := now(); END IF;
    RETURN NEW;
  END IF;
  IF NEW.firm_id IS DISTINCT FROM OLD.firm_id THEN
    RAISE EXCEPTION 'money_trust_request: firm_id never changes' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.cancelled_at IS NOT NULL AND (NEW.number, NEW.person_id, NEW.company_id, NEW.case_id, NEW.amount_minor, NEW.currency, NEW.purpose, NEW.sent_at, NEW.sent_by, NEW.cancelled_at, NEW.cancelled_by, NEW.cancel_reason, NEW.created_by, NEW.created_at, NEW.retainer_version_id, NEW.pay_link_token_hash)
     IS DISTINCT FROM (OLD.number, OLD.person_id, OLD.company_id, OLD.case_id, OLD.amount_minor, OLD.currency, OLD.purpose, OLD.sent_at, OLD.sent_by, OLD.cancelled_at, OLD.cancelled_by, OLD.cancel_reason, OLD.created_by, OLD.created_at, OLD.retainer_version_id, OLD.pay_link_token_hash) THEN
    RAISE EXCEPTION 'money_trust_request: a cancelled request (%) never changes', coalesce(OLD.number, 'unsent') USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.number IS DISTINCT FROM OLD.number OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'money_trust_request: the number and the times are the database''s' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.cancelled_at IS NULL AND NEW.cancelled_at IS NOT NULL THEN NEW.cancelled_at := now(); END IF;
  IF OLD.sent_at IS NULL THEN
    IF NEW.sent_at IS NOT NULL THEN
      PERFORM money_trust_on(NEW.firm_id, 'money_trust_request');
      NEW.number := money_take_number(NEW.firm_id, 'TRUST_REQUEST');
      NEW.sent_at := now();
    END IF;
    RETURN NEW;
  END IF;
  IF (NEW.sent_at, NEW.sent_by, NEW.person_id, NEW.company_id, NEW.case_id, NEW.currency, NEW.created_by, NEW.retainer_version_id)
     IS DISTINCT FROM (OLD.sent_at, OLD.sent_by, OLD.person_id, OLD.company_id, OLD.case_id, OLD.currency, OLD.created_by, OLD.retainer_version_id) THEN
    RAISE EXCEPTION 'money_trust_request: a sent request''s party, case, currency, retainer version and sending never change (%)', OLD.number USING ERRCODE = 'check_violation';
  END IF;
  -- A payment on the request touches it first (money_payment_write), so this read sees every payment that could race
  -- the change: the change waits for it, and at REPEATABLE READ either writer fails to serialise (break B-4).
  IF (NEW.amount_minor, NEW.purpose) IS DISTINCT FROM (OLD.amount_minor, OLD.purpose)
     AND EXISTS (SELECT 1 FROM "money_payment" p WHERE p.firm_id = OLD.firm_id AND p.trust_request_id = OLD.id) THEN
    RAISE EXCEPTION 'money_trust_request: % has money recorded on it; its amount and purpose stay', OLD.number USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

-- FO-7a's invoice rules, with the unsigned-retainer confirmation fixed once issued and its time the database's; the link
-- hash stays changeable.
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
    IF (NEW.number, NEW.issued_at, NEW.issued_by, NEW.person_id, NEW.company_id, NEW.case_id, NEW.currency, NEW.created_by, NEW.created_at, NEW.unsigned_retainer_confirmed_by, NEW.unsigned_retainer_confirmed_at)
       IS DISTINCT FROM (OLD.number, OLD.issued_at, OLD.issued_by, OLD.person_id, OLD.company_id, OLD.case_id, OLD.currency, OLD.created_by, OLD.created_at, OLD.unsigned_retainer_confirmed_by, OLD.unsigned_retainer_confirmed_at) THEN
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
    NEW.number := money_take_number(NEW.firm_id, 'INVOICE');
    NEW.issued_at := now();  -- the issue time is the database's: never backdated (break B-10)
  END IF;
  RETURN NEW;
END $$;

-- PF-12: trigger functions on firm tables run as the wall reader (SECURITY DEFINER, search_path pinned); CREATE OR
-- REPLACE keeps the owner but resets these settings, so they are set again (and set for the new one).
DO $readers$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['money_trust_answer_move()', 'money_trust_request_write()', 'money_invoice_write()'] LOOP
    EXECUTE format('ALTER FUNCTION %s SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp', f);
    EXECUTE format('ALTER FUNCTION %s OWNER TO xr_wall_reader', f);
  END LOOP;
END
$readers$;
