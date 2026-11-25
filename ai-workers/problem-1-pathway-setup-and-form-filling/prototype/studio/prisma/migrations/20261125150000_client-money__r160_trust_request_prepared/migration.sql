-- R1.60 part a1 (product/screens/R1.60/rules.md O1, B1-B6; AG-6-61 §5.2-§5.7, §6; Lead 19 on #3371, Lead 4's "go" of
-- 25 Nov): a deposit request prepared on signing is its own stored state, never #3033's "unsent".
--   * prepared_at: set when a signed retainer version prepares the request (the database's clock), never changed after.
--     PREPARED = prepared_at set, sent_at null, cancelled_at null. A PREPARED request has no number until a person sends
--     it (the number stays the database's, taken at send, as before).
--   * estimated_tax_minor: the estimated tax on the deposit row (AG-6-61 §5.3, MS-D21(4)), stored apart from amount_minor
--     (the deposit row itself); only a prepared request carries one, and it is never below zero.
--   * A prepared request names its retainer version (the one-per-version index of 20261118200000 holds B4).
-- Additive: two nullable columns, two checks, and money_trust_request_write() again with the two columns in its rules
-- (a cancelled request never changes; the prepared time is the database's; the tax goes with the amount once money is
-- recorded). Rollback: rollback.sql beside this file (by hand; it restores 20261118200000's function, then drops the
-- checks and the columns). Legal reading: Unconfirmed: no counsel. Tax figures: Sample; Unconfirmed: no accountant.
ALTER TABLE "money_trust_request" ADD COLUMN "prepared_at" TIMESTAMPTZ, ADD COLUMN "estimated_tax_minor" INTEGER;
ALTER TABLE "money_trust_request"
  ADD CONSTRAINT "money_trust_request_prepared_check" CHECK ("prepared_at" IS NULL OR ("retainer_version_id" IS NOT NULL AND "estimated_tax_minor" IS NOT NULL)),
  ADD CONSTRAINT "money_trust_request_estimated_tax_check" CHECK ("estimated_tax_minor" IS NULL OR ("estimated_tax_minor" >= 0 AND "prepared_at" IS NOT NULL));

CREATE OR REPLACE FUNCTION money_trust_request_write() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.sent_at IS NOT NULL THEN
      RAISE EXCEPTION 'money_trust_request: a sent request (%) is never deleted; cancel it with a reason', OLD.number USING ERRCODE = 'check_violation';
    END IF;
    -- R1.60 (break a1 m5): a request a signed retainer prepared keeps its version for good (B4): never deleted. FO-7ts's
    -- own rules on a version (DW9: an unsent request's version may change) are left as they were (review a1 r2 M2).
    IF OLD.prepared_at IS NOT NULL THEN
      RAISE EXCEPTION 'money_trust_request: a deposit request of a signed retainer is never deleted; cancel it with a reason' USING ERRCODE = 'check_violation';
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
    IF NEW.prepared_at IS NOT NULL THEN NEW.prepared_at := now(); END IF;   -- R1.60: the database's clock
    IF NEW.sent_at IS NOT NULL THEN NEW.number := money_take_number(NEW.firm_id, 'TRUST_REQUEST'); NEW.sent_at := now(); END IF;
    RETURN NEW;
  END IF;
  IF NEW.firm_id IS DISTINCT FROM OLD.firm_id THEN
    RAISE EXCEPTION 'money_trust_request: firm_id never changes' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.cancelled_at IS NOT NULL AND (NEW.number, NEW.person_id, NEW.company_id, NEW.case_id, NEW.amount_minor, NEW.currency, NEW.purpose, NEW.sent_at, NEW.sent_by, NEW.cancelled_at, NEW.cancelled_by, NEW.cancel_reason, NEW.created_by, NEW.created_at, NEW.retainer_version_id, NEW.pay_link_token_hash, NEW.prepared_at, NEW.estimated_tax_minor)
     IS DISTINCT FROM (OLD.number, OLD.person_id, OLD.company_id, OLD.case_id, OLD.amount_minor, OLD.currency, OLD.purpose, OLD.sent_at, OLD.sent_by, OLD.cancelled_at, OLD.cancelled_by, OLD.cancel_reason, OLD.created_by, OLD.created_at, OLD.retainer_version_id, OLD.pay_link_token_hash, OLD.prepared_at, OLD.estimated_tax_minor) THEN
    RAISE EXCEPTION 'money_trust_request: a cancelled request (%) never changes', coalesce(OLD.number, 'unsent') USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.number IS DISTINCT FROM OLD.number OR NEW.created_at IS DISTINCT FROM OLD.created_at OR NEW.prepared_at IS DISTINCT FROM OLD.prepared_at THEN
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
  IF (NEW.amount_minor, NEW.estimated_tax_minor, NEW.purpose) IS DISTINCT FROM (OLD.amount_minor, OLD.estimated_tax_minor, OLD.purpose)
     AND EXISTS (SELECT 1 FROM "money_payment" p WHERE p.firm_id = OLD.firm_id AND p.trust_request_id = OLD.id) THEN
    RAISE EXCEPTION 'money_trust_request: % has money recorded on it; its amount and purpose stay', OLD.number USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

-- PF-12: CREATE OR REPLACE keeps the owner but resets these settings, so they are set again.
-- PF-8b F4: the reader may own a function only while it may create in public (granted here, taken back below).
GRANT CREATE ON SCHEMA public TO xr_wall_reader;
ALTER FUNCTION money_trust_request_write() SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION money_trust_request_write() OWNER TO xr_wall_reader;
REVOKE CREATE ON SCHEMA public FROM xr_wall_reader;
