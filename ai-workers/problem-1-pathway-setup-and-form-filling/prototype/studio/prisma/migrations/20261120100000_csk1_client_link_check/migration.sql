-- CS-K1 part 2 (BACKLOG CS-K1; brief design/build-lead-c-briefs/CS-K1-2.md with Build Lead C (4)'s answers of 20 Nov;
-- case-side contract v0.1 §1 rule 4, §5; P-607): every case client is linked to the front office's party: a PERSON client
-- to its fo_person, a COMPANY client to its fo_company. The link is made in code, through FoPersonPort (createCase, in the
-- opening's transaction; FO-8's prospect.won; the one-time job api/src/case-clients/client-link.ts). Here:
--   * fo_link_pending: true for a client the database made or moved with no link, which code cannot reach in its own
--     transaction: case_client_for_case (a case written straight to the table: fixtures and restores) and
--     case_client_follow_firm (CS-W1's backfill fills a client's firm id later). The job links them and clears it.
--   * case_client_front_office_link_check, NOT VALID (Build Lead C (4) ruling 3): a client of a platform firm is linked by
--     its kind, unless pending. NOT VALID so a database migrated before the job ran does not stop here; it already refuses
--     every new or changed row. A client of a key with no platform firm (firm_id null) has no front office yet.
--   * case_client_pending_guard (review M1, breaker F3): only those two triggers may set the flag (pg_trigger_depth() >= 2,
--     a row written by another trigger); a direct write that sets it, as the API's role or any other, is refused.
--   * case_client_validate_link_check(): the job's last step. VALIDATE needs the table's owner and the API runs as xr_app,
--     so it is SECURITY DEFINER (search_path pinned), validates only once no client is missing its link, and says if it did.
-- Rollback (in this order): DROP TRIGGER case_client_pending_guard ON case_client; DROP FUNCTION
--   case_client_pending_guard(), case_client_validate_link_check(); ALTER TABLE case_client DROP CONSTRAINT
--   case_client_front_office_link_check, DROP COLUMN fo_link_pending; run the two functions' CREATE OR REPLACE from
--   20261118230000_csk1_case_client again; then delete this folder's row from _prisma_migrations (rollback.sql does it).
--   The links themselves stay (part 1's columns); nothing is lost.

ALTER TABLE "case_client" ADD COLUMN "fo_link_pending" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "case_client" ADD CONSTRAINT "case_client_front_office_link_check" CHECK (
  "firm_id" IS NULL OR "fo_link_pending"
  OR ("display_kind" = 'PERSON' AND "fo_person_id" IS NOT NULL) OR ("display_kind" = 'COMPANY' AND "fo_company_id" IS NOT NULL)) NOT VALID;

CREATE FUNCTION case_client_pending_guard() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
  SET search_path = pg_catalog, public, pg_temp AS $fn$
BEGIN
  IF NEW.fo_link_pending AND (TG_OP = 'INSERT' OR NOT OLD.fo_link_pending) AND pg_trigger_depth() < 2 THEN
    RAISE EXCEPTION 'case_client_pending_guard: only the database marks a client as waiting for its front-office link; link it through FoPersonPort' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $fn$;
CREATE TRIGGER case_client_pending_guard BEFORE INSERT OR UPDATE OF fo_link_pending ON "case_client" FOR EACH ROW EXECUTE FUNCTION case_client_pending_guard();

-- Part 1's two functions, each with the flag added (nothing else changed).
CREATE OR REPLACE FUNCTION case_client_for_case() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
  SET search_path = pg_catalog, public, pg_temp AS $fn$
BEGIN
  IF NEW.client_id IS NULL THEN
    INSERT INTO case_client (id, workspace_id, firm_key, firm_id, client_number, display_name, display_kind, created_by, fo_link_pending)
    VALUES (gen_random_uuid(), NEW.workspace_id, NEW.firm_key, case_lookup.case_firm_id_of_key(NEW.firm_key), case_client_next_number(NEW.workspace_id, NEW.firm_key),
            left('Client of ' || coalesce(NEW.case_number, NEW.reference, 'a case'), 200), case_client_kind_of(NEW.combination_id),
            coalesce(NEW.created_by, 'system:case_client_for_case'), true)
    RETURNING id INTO NEW.client_id;
  END IF;
  RETURN NEW;
END $fn$;

CREATE OR REPLACE FUNCTION case_client_follow_firm() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
  SET search_path = pg_catalog, public, pg_temp AS $fn$
BEGIN
  IF NEW.firm_id IS NOT NULL AND NEW.firm_id IS DISTINCT FROM OLD.firm_id THEN
    UPDATE case_client SET firm_id = NEW.firm_id, fo_link_pending = fo_link_pending OR (fo_person_id IS NULL AND fo_company_id IS NULL)
     WHERE id = NEW.client_id AND firm_id IS NULL;
  END IF;
  RETURN NEW;
END $fn$;

CREATE FUNCTION case_client_validate_link_check() RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, public, pg_temp AS $fn$
BEGIN
  IF EXISTS (SELECT 1 FROM case_client WHERE firm_id IS NOT NULL AND (fo_link_pending
      OR (display_kind = 'PERSON' AND fo_person_id IS NULL) OR (display_kind = 'COMPANY' AND fo_company_id IS NULL))) THEN
    RETURN false;
  END IF;
  ALTER TABLE case_client VALIDATE CONSTRAINT case_client_front_office_link_check;
  RETURN true;
END $fn$;
REVOKE ALL ON FUNCTION case_client_validate_link_check() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION case_client_validate_link_check() TO xr_data;
