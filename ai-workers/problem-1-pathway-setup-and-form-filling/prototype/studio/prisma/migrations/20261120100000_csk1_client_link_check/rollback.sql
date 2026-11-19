-- CS-K1 part 2 rollback (not a migration: Prisma reads only migration.sql). Run in one transaction:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f prisma/migrations/20261120100000_csk1_client_link_check/rollback.sql
-- The links stay in fo_person_id / fo_company_id (part 1's columns); only the flag, the check and the function go.
DROP TRIGGER case_client_pending_guard ON "case_client";
DROP FUNCTION case_client_pending_guard(), case_client_validate_link_check();
ALTER TABLE "case_client" DROP CONSTRAINT "case_client_front_office_link_check";
CREATE OR REPLACE FUNCTION case_client_for_case() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
  SET search_path = pg_catalog, public, pg_temp AS $fn$
BEGIN
  IF NEW.client_id IS NULL THEN
    INSERT INTO case_client (id, workspace_id, firm_key, firm_id, client_number, display_name, display_kind, created_by)
    VALUES (gen_random_uuid(), NEW.workspace_id, NEW.firm_key, case_lookup.case_firm_id_of_key(NEW.firm_key), case_client_next_number(NEW.workspace_id, NEW.firm_key),
            left('Client of ' || coalesce(NEW.case_number, NEW.reference, 'a case'), 200), case_client_kind_of(NEW.combination_id),
            coalesce(NEW.created_by, 'system:case_client_for_case'))
    RETURNING id INTO NEW.client_id;
  END IF;
  RETURN NEW;
END $fn$;
CREATE OR REPLACE FUNCTION case_client_follow_firm() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
  SET search_path = pg_catalog, public, pg_temp AS $fn$
BEGIN
  IF NEW.firm_id IS NOT NULL AND NEW.firm_id IS DISTINCT FROM OLD.firm_id THEN
    UPDATE case_client SET firm_id = NEW.firm_id WHERE id = NEW.client_id AND firm_id IS NULL;
  END IF;
  RETURN NEW;
END $fn$;
ALTER TABLE "case_client" DROP COLUMN "fo_link_pending";
DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261120100000_csk1_client_link_check';
