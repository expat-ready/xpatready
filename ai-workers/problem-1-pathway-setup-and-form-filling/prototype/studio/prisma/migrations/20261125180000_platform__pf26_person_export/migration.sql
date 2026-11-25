-- PF-26 part 2 (map row 34, R1.34; AG-2-93, SA-11-36, SA-11-40; shape product/screens/PF-26/shape.md): one enum, the table
-- platform_person_export (its requester staff of the same firm), PF-12's walls, its checks and fact-keeping triggers, and
-- a check that the key agent/data-export:request (AG-2-93 rule 1: a separate key from agent/prospect:export, never
-- agent/pii:reveal) is seeded on OWNER, ADMIN and CASE_MANAGER (AG-2-93 §8). New, empty table: no data statement.
-- Legal reading Unconfirmed: no counsel.
-- Rollback (in this order): DROP TABLE "platform_person_export"; DROP FUNCTION pf26_person_export_no_delete();
--   DROP FUNCTION pf26_person_export_kept(); DROP TYPE "PlatformPersonExportState"; delete this folder's _prisma_migrations row.
CREATE TYPE "PlatformPersonExportState" AS ENUM ('QUEUED', 'READY', 'EXPIRED', 'FAILED');
CREATE TABLE "platform_person_export" (
    "id" UUID NOT NULL,
    "firm_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "requested_by" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "state" "PlatformPersonExportState" NOT NULL DEFAULT 'QUEUED',
    "records" UUID[],
    "file_key" TEXT,
    "sha256" TEXT,
    "size_bytes" INTEGER,
    "expires_at" TIMESTAMPTZ,
    "failed_module" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ,
    CONSTRAINT "platform_person_export_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "platform_person_export_firm_id_person_id_created_at_idx" ON "platform_person_export"("firm_id", "person_id", "created_at");
ALTER TABLE "platform_person_export" ADD CONSTRAINT "platform_person_export_firm_id_fkey" FOREIGN KEY ("firm_id") REFERENCES "platform_firm"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "platform_person_export" ADD CONSTRAINT "platform_person_export_firm_id_requested_by_fkey" FOREIGN KEY ("firm_id", "requested_by") REFERENCES "platform_staff"("firm_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
-- The reason is one line of ordinary text, as the app says (service.ts RequestBody): 1-300 characters, not only spaces and
-- punctuation (a test that holds in any locale; the app requires a letter or digit, break R2-M2), ZWNJ and ZWJ allowed,
-- no control character, no format character (direction marks, zero-width, word joiner, byte-order mark, tags), no line
-- or paragraph separator. Each attempt's file is person-export/<export id>/<attempt id>.json. A READY or EXPIRED export has its
-- file, hash, size, records and expiry; a FAILED one names its module (a module name, never a message); a finished one
-- its finish time.
ALTER TABLE "platform_person_export" ADD CONSTRAINT "platform_person_export_facts" CHECK (
  btrim("reason") <> '' AND char_length("reason") <= 300 AND "reason" ~ '[^[:space:][:punct:]]'
  AND "reason" !~ E'[[:cntrl:]\u00ad\u0600-\u0605\u061c\u06dd\u070f\u180e\u200b\u200e\u200f\u2028-\u202e\u2060-\u2064\u2066-\u206f\ufeff\ufff9-\ufffb\U000e0001-\U000e007f]'
  AND (("state" IN ('READY', 'EXPIRED')) = ("file_key" IS NOT NULL))
  AND ("file_key" IS NULL OR ("file_key" ~ '^person-export/[0-9a-f-]{36}/[0-9a-f-]{36}\.json$' AND "sha256" ~ '^[0-9a-f]{64}$' AND "size_bytes" >= 0 AND "expires_at" IS NOT NULL AND cardinality("records") >= 1))
  AND (("state" = 'FAILED') = ("failed_module" IS NOT NULL))
  AND ("failed_module" IS NULL OR "failed_module" ~ '^[a-z()][a-z0-9().-]{0,59}$')
  AND (("state" = 'QUEUED') = ("finished_at" IS NULL)));
-- Who asked, for whom, why and when never change; the state moves forward only: QUEUED → READY | FAILED, READY → EXPIRED;
-- a READY row's file facts never change (its expiry only moves to EXPIRED).
CREATE FUNCTION pf26_person_export_kept() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $fn$
BEGIN
  IF (NEW."id", NEW."firm_id", NEW."person_id", NEW."requested_by", NEW."reason", NEW."created_at")
     IS DISTINCT FROM (OLD."id", OLD."firm_id", OLD."person_id", OLD."requested_by", OLD."reason", OLD."created_at") THEN
    RAISE EXCEPTION 'platform_person_export: who asked, for whom, why and when never change' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW."state" <> OLD."state" AND NOT (OLD."state"::text, NEW."state"::text) IN (('QUEUED', 'READY'), ('QUEUED', 'FAILED'), ('READY', 'EXPIRED')) THEN
    RAISE EXCEPTION 'platform_person_export: an export moves forward only (% to % refused)', OLD."state", NEW."state" USING ERRCODE = 'check_violation';
  END IF;
  IF OLD."state" <> 'QUEUED' AND (NEW."file_key", NEW."sha256", NEW."size_bytes", NEW."records", NEW."expires_at", NEW."failed_module", NEW."finished_at")
     IS DISTINCT FROM (OLD."file_key", OLD."sha256", OLD."size_bytes", OLD."records", OLD."expires_at", OLD."failed_module", OLD."finished_at") THEN
    RAISE EXCEPTION 'platform_person_export: a finished export''s facts never change' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $fn$;
CREATE TRIGGER "pf26_person_export_kept" BEFORE UPDATE ON "platform_person_export" FOR EACH ROW EXECUTE FUNCTION pf26_person_export_kept();
CREATE FUNCTION pf26_person_export_no_delete() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $fn$
BEGIN RAISE EXCEPTION 'platform_person_export: a request is a record of who exported whom; it is never deleted' USING ERRCODE = 'check_violation'; END $fn$;
CREATE TRIGGER "pf26_person_export_no_delete" BEFORE DELETE OR TRUNCATE ON "platform_person_export" FOR EACH STATEMENT EXECUTE FUNCTION pf26_person_export_no_delete();
-- PF-12: every trigger function on a firm table runs as xr_wall_reader. PF-8b F4 (RDS): a non-superuser may hand a function
-- to xr_wall_reader only while it holds CREATE on public; granted for the hand-over and taken back after.
GRANT CREATE ON SCHEMA public TO xr_wall_reader;
DO $readers$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['pf26_person_export_kept()', 'pf26_person_export_no_delete()'] LOOP
    EXECUTE format('ALTER FUNCTION %s SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp', f);
    EXECUTE format('ALTER FUNCTION %s OWNER TO xr_wall_reader', f);
    -- No one calls a trigger function directly; a trigger fires it without EXECUTE.
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
  END LOOP;
END
$readers$;
REVOKE CREATE ON SCHEMA public FROM xr_wall_reader;
-- PF-12: forced policy and the firm-first gate (tests/check_pf12_walls.ts). Table rights come by PF-12's default privileges.
ALTER TABLE "platform_person_export" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY "pf12_firm" ON "platform_person_export" USING ("firm_id" = platform_session_firm()) WITH CHECK ("firm_id" = platform_session_firm());
CREATE TRIGGER "0_pf12_firm_first" BEFORE INSERT OR UPDATE ON "platform_person_export" FOR EACH ROW EXECUTE FUNCTION platform_firm_first('firm_id');
-- The key: PF-3 seeds agent/data-export:request on OWNER, ADMIN and CASE_MANAGER and PF-6b catalogues it; verified here,
-- nothing added.
DO $$ BEGIN
  IF (SELECT count(*) FROM "platform_role_permission" WHERE "permission_key" = 'agent/data-export:request' AND "role" IN ('OWNER', 'ADMIN', 'CASE_MANAGER')) <> 3
     OR NOT EXISTS (SELECT 1 FROM "platform_permission_key" WHERE "key" = 'agent/data-export:request')
  THEN RAISE EXCEPTION 'pf26: agent/data-export:request is not seeded on OWNER, ADMIN and CASE_MANAGER (PF-3) and catalogued (PF-6b)'; END IF;
END $$;
