-- FO-14 part A (BACKLOG row FO-14; R1.62; AG-15-29, -30, -54; schema file prisma/schema/front-office-activity.prisma, owner
-- front office): the client's progress stream. Additive: one enum, one table, its index, one check, two fo_activity_
-- functions, their triggers and PF-12's wall. No existing table, row or function is changed.
--   * Insert-only: an event is never updated, deleted or truncated (a trigger refuses each, for every role but the
--     cluster's superuser maintenance; the app's data role also loses the grants).
--   * person_id is an fo_person of the row's own firm, checked by a trigger (not a foreign key: fo_person is another
--     area's table, and an SQL-only key would be dropped by `prisma migrate diff`); the time is the database's.
--   * source is the door, one lower-case word (letters, joined by '-'; at most 40); source_ref at most 200, one line.
--   * PF-12's wall: a forced policy naming the session's firm and the firm-first gate; trigger functions run as
--     xr_wall_reader (tests/check_pf12_walls.ts).
-- New, empty table: no data statement runs. Rollback: rollback.sql in this folder.

-- CreateEnum
CREATE TYPE "FoPortalActivityKind" AS ENUM ('SIGN_IN', 'VIEW', 'UPLOAD', 'QUESTIONNAIRE_PROGRESS', 'SUBMIT', 'SIGNED', 'PAID');

-- CreateTable
CREATE TABLE "fo_portal_activity_event" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "firm_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "kind" "FoPortalActivityKind" NOT NULL,
    "case_id" UUID,
    "source" TEXT NOT NULL,
    "source_ref" TEXT,
    "at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fo_portal_activity_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fo_portal_activity_event_firm_id_person_id_at_idx" ON "fo_portal_activity_event"("firm_id", "person_id", "at" DESC);

-- Rules Prisma cannot say.
ALTER TABLE "fo_portal_activity_event" ADD CONSTRAINT "fo_portal_activity_event_shape" CHECK (
  "source" ~ '^[a-z]+(-[a-z]+)*$' AND char_length("source") <= 40
  AND ("source_ref" IS NULL OR (char_length("source_ref") BETWEEN 1 AND 200 AND "source_ref" !~ '[[:cntrl:]]')));

-- The person is the firm's own fo_person; the time is the database's (a door never backdates an event). Only for the real
-- table, in the session's own firm (a look-alike temp table, or another firm's id, learns nothing).
CREATE FUNCTION fo_activity_person_ok() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  IF TG_RELID IS DISTINCT FROM 'public.fo_portal_activity_event'::regclass THEN
    RAISE EXCEPTION 'fo_activity_person_ok: fo_portal_activity_event''s own trigger only' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF platform_session_firm() IS NOT NULL AND NEW."firm_id" IS DISTINCT FROM platform_session_firm() THEN
    RAISE EXCEPTION 'fo_activity_person_ok: only the session''s own firm' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "fo_person" p WHERE p."firm_id" = NEW."firm_id" AND p."id" = NEW."person_id" FOR KEY SHARE) THEN
    RAISE EXCEPTION 'fo_portal_activity_event: the person is not one of the firm''s people' USING ERRCODE = 'foreign_key_violation';
  END IF;
  NEW."at" := clock_timestamp();
  RETURN NEW;
END $fn$;
CREATE TRIGGER "fo_activity_person" BEFORE INSERT ON "fo_portal_activity_event" FOR EACH ROW EXECUTE FUNCTION fo_activity_person_ok();

-- Insert-only: an event is a record of what the client did; it is never changed or removed.
CREATE FUNCTION fo_activity_kept() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  RAISE EXCEPTION 'fo_portal_activity_event: an event is written once, never changed or removed (% refused)', TG_OP USING ERRCODE = 'insufficient_privilege';
END $fn$;
CREATE TRIGGER "fo_activity_kept" BEFORE UPDATE OR DELETE ON "fo_portal_activity_event" FOR EACH ROW EXECUTE FUNCTION fo_activity_kept();
CREATE TRIGGER "fo_activity_no_truncate" BEFORE TRUNCATE ON "fo_portal_activity_event" FOR EACH STATEMENT EXECUTE FUNCTION fo_activity_kept();
REVOKE UPDATE, DELETE, TRUNCATE ON "fo_portal_activity_event" FROM xr_data;

-- PF-12's wall (forced policy naming the session's firm; the firm-first gate before the area's own triggers).
ALTER TABLE "fo_portal_activity_event" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY "pf12_firm" ON "fo_portal_activity_event" USING ("firm_id" = platform_session_firm()) WITH CHECK ("firm_id" = platform_session_firm());
CREATE TRIGGER "0_pf12_firm_first" BEFORE INSERT OR UPDATE ON "fo_portal_activity_event" FOR EACH ROW EXECUTE FUNCTION platform_firm_first('firm_id');

-- The trigger functions run as xr_wall_reader (BYPASSRLS, owns no table), search_path pinned with pg_temp last. The
-- migration role holds CREATE on public only for the hand-over (a no-op pair on a superuser cluster).
GRANT CREATE ON SCHEMA public TO xr_wall_reader;
DO $readers$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['fo_activity_person_ok()', 'fo_activity_kept()'] LOOP
    EXECUTE format('ALTER FUNCTION %s SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp', f);
    EXECUTE format('ALTER FUNCTION %s OWNER TO xr_wall_reader', f);
    -- No one calls a trigger function directly; a trigger fires it without EXECUTE.
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
  END LOOP;
END
$readers$;
REVOKE CREATE ON SCHEMA public FROM xr_wall_reader;
