-- Rollback of 20261125060000_client-money__r160_trust_request_prepared (R1.60 part a1), by hand, in one transaction:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f rollback.sql
-- Contract step only after part a2 and part b are rolled back (they read these columns). It puts back
-- money_trust_request_write() exactly as 20261118200000_fo7ts_money_settings left it, with PF-12's definer settings,
-- then drops the two checks and the two columns. A prepared request keeps its row: it reads as #3033's unsent one
-- ("Waiting") afterwards, and a person cancels it with a reason. Then delete this migration's _prisma_migrations row:
--   DELETE FROM _prisma_migrations WHERE migration_name = '20261125060000_client-money__r160_trust_request_prepared';
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

-- PF-8b F4: the reader may own a function only while it may create in public (granted here, taken back below).
GRANT CREATE ON SCHEMA public TO xr_wall_reader;
ALTER FUNCTION money_trust_request_write() SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION money_trust_request_write() OWNER TO xr_wall_reader;
REVOKE CREATE ON SCHEMA public FROM xr_wall_reader;

ALTER TABLE "money_trust_request" DROP CONSTRAINT "money_trust_request_estimated_tax_check", DROP CONSTRAINT "money_trust_request_prepared_check";
ALTER TABLE "money_trust_request" DROP COLUMN "estimated_tax_minor", DROP COLUMN "prepared_at";
