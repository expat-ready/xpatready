-- FO-14 parts A and B (BACKLOG row FO-14; R1.62; AG-15-29, -30, -54; schema file prisma/schema/front-office-activity.prisma, owner
-- front office): the client's progress stream. Additive: one enum, one table, its index, one check, two fo_activity_
-- functions, their triggers and PF-12's wall. No existing table, row or function is changed.
--   * Insert-only: an event is never updated, deleted or truncated (a trigger refuses each, for every role but the
--     cluster's superuser maintenance; the app's data role also loses the grants).
--   * person_id is an fo_person of the row's own firm, checked by a trigger (not a foreign key: fo_person is another
--     area's table, and an SQL-only key would be dropped by `prisma migrate diff`); the time is the database's.
--   * source is the door, one lower-case word (letters, joined by '-'; at most 40); source_ref at most 200, one line.
--   * PF-12's wall: a forced policy naming the session's firm and the firm-first gate; trigger functions run as
--     xr_wall_reader (tests/check_pf12_walls.ts).
-- Part B: fo_client_update, one row per "Tell the client" message (insert-only, the same person trigger and wall);
-- "last update" is its newest ACCEPTED row whose outbox row is SENT or DELIVERED (read by the service). body 1-2000
-- characters, sent_by `staff:<id>`, state ACCEPTED (with its outbox row) or NOT_SENT; one row per Idempotency-Key in a
-- firm (request_key, request_hash). Both tables refuse a merged-away person (merged_into_id set): a merge moves neither.
-- New, empty tables: no data statement runs. Rollback: rollback.sql in this folder.

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

-- CreateTable
CREATE TABLE "fo_client_update" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "firm_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "case_id" UUID,
    "body" TEXT NOT NULL,
    "sent_by" TEXT NOT NULL,
    "outbox_id" UUID,
    "state" TEXT NOT NULL,
    "reason" TEXT,
    "request_key" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fo_client_update_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fo_client_update_firm_id_person_id_created_at_idx" ON "fo_client_update"("firm_id", "person_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "fo_client_update_firm_id_request_key_key" ON "fo_client_update"("firm_id", "request_key");

-- Rules Prisma cannot say.
ALTER TABLE "fo_client_update" ADD CONSTRAINT "fo_client_update_shape" CHECK (
  char_length("body") BETWEEN 1 AND 2000 AND "sent_by" ~ '^staff:[A-Za-z0-9-]{1,64}$' AND "state" IN ('ACCEPTED', 'NOT_SENT')
  AND ("state" <> 'ACCEPTED' OR "outbox_id" IS NOT NULL) AND ("reason" IS NULL OR char_length("reason") BETWEEN 1 AND 200)
  AND char_length("request_key") BETWEEN 1 AND 255 AND "request_hash" ~ '^[0-9a-f]{64}$');
ALTER TABLE "fo_portal_activity_event" ADD CONSTRAINT "fo_portal_activity_event_shape" CHECK (
  "source" ~ '^[a-z]+(-[a-z]+)*$' AND char_length("source") <= 40
  AND ("source_ref" IS NULL OR (char_length("source_ref") BETWEEN 1 AND 200 AND "source_ref" !~ '[[:cntrl:]]')));

-- The person is the firm's own fo_person; the time is the database's (a door never backdates an event). Only for the real
-- table, in the session's own firm (a look-alike temp table, or another firm's id, learns nothing).
CREATE FUNCTION fo_activity_person_ok() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  IF TG_RELID NOT IN ('public.fo_portal_activity_event'::regclass, 'public.fo_client_update'::regclass) THEN
    RAISE EXCEPTION 'fo_activity_person_ok: fo_portal_activity_event''s and fo_client_update''s own trigger only' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF platform_session_firm() IS NOT NULL AND NEW."firm_id" IS DISTINCT FROM platform_session_firm() THEN
    RAISE EXCEPTION 'fo_activity_person_ok: only the session''s own firm' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "fo_person" p WHERE p."firm_id" = NEW."firm_id" AND p."id" = NEW."person_id" AND p."merged_into_id" IS NULL FOR KEY SHARE) THEN
    RAISE EXCEPTION '%: the person is not one of the firm''s people', TG_TABLE_NAME USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF TG_TABLE_NAME = 'fo_client_update' THEN NEW."created_at" := clock_timestamp(); ELSE NEW."at" := clock_timestamp(); END IF;
  RETURN NEW;
END $fn$;
CREATE TRIGGER "fo_activity_person" BEFORE INSERT ON "fo_portal_activity_event" FOR EACH ROW EXECUTE FUNCTION fo_activity_person_ok();
CREATE TRIGGER "fo_update_person" BEFORE INSERT ON "fo_client_update" FOR EACH ROW EXECUTE FUNCTION fo_activity_person_ok();

-- Insert-only: an event is a record of what the client did; it is never changed or removed.
CREATE FUNCTION fo_activity_kept() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  RAISE EXCEPTION '%: written once, never changed or removed (% refused)', TG_TABLE_NAME, TG_OP USING ERRCODE = 'insufficient_privilege';
END $fn$;
CREATE TRIGGER "fo_activity_kept" BEFORE UPDATE OR DELETE ON "fo_portal_activity_event" FOR EACH ROW EXECUTE FUNCTION fo_activity_kept();
CREATE TRIGGER "fo_activity_no_truncate" BEFORE TRUNCATE ON "fo_portal_activity_event" FOR EACH STATEMENT EXECUTE FUNCTION fo_activity_kept();
CREATE TRIGGER "fo_update_kept" BEFORE UPDATE OR DELETE ON "fo_client_update" FOR EACH ROW EXECUTE FUNCTION fo_activity_kept();
CREATE TRIGGER "fo_update_no_truncate" BEFORE TRUNCATE ON "fo_client_update" FOR EACH STATEMENT EXECUTE FUNCTION fo_activity_kept();
REVOKE UPDATE, DELETE, TRUNCATE ON "fo_portal_activity_event", "fo_client_update" FROM xr_data;

-- PF-12's wall (forced policy naming the session's firm; the firm-first gate before the area's own triggers).
ALTER TABLE "fo_portal_activity_event" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY "pf12_firm" ON "fo_portal_activity_event" USING ("firm_id" = platform_session_firm()) WITH CHECK ("firm_id" = platform_session_firm());
CREATE TRIGGER "0_pf12_firm_first" BEFORE INSERT OR UPDATE ON "fo_portal_activity_event" FOR EACH ROW EXECUTE FUNCTION platform_firm_first('firm_id');
ALTER TABLE "fo_client_update" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY "pf12_firm" ON "fo_client_update" USING ("firm_id" = platform_session_firm()) WITH CHECK ("firm_id" = platform_session_firm());
CREATE TRIGGER "0_pf12_firm_first" BEFORE INSERT OR UPDATE ON "fo_client_update" FOR EACH ROW EXECUTE FUNCTION platform_firm_first('firm_id');

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
