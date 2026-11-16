-- AUD-1a (map row 8, R1.8 part 1; SA-11-1@73e32bad, SA-11-2@1deac028, SA-11-3@9126708a, AG-13-41@47af563a, SA-11 BR-3,
-- NFR5-08; P-571 (1), P-600; case-side contract §2.5): the one audit trail becomes the audit module's own
-- (prisma/schema/audit.prisma) and insert-only at the database. Additive: five nullable columns, one enum, one index, three
-- functions and three triggers; nothing dropped, no foreign key (the trail outlives what it names, SA-11 BR-8).
--
-- Order: columns; the actor words checked (an unknown word fails the migration, naming it); the back-fill (actor_type,
-- firm_id, case_id); actor_type NOT NULL; the triggers last, so the back-fill is not refused; then the grant step.
--
-- The delete exception (a departure from SA-11-3, SA-11 BR-1 and SA-11-14, recorded in the PR; Unconfirmed: no counsel):
-- the demo reset (one path, transaction setting app.audit_sample_reset = 'on') deletes the demo workspace's lines whose
-- firm_id is null or a Sample firm's, and its orphan sweep deletes lines whose workspace no longer exists (same firm
-- rule); nothing else, never a firm's production line or a platform-audit line (P-571 (1)).
-- Down (by hand): drop the three triggers and functions, the index, the five columns and the enum; grant UPDATE back.

-- CreateEnum
CREATE TYPE "AuditActorType" AS ENUM ('FIRM_STAFF', 'OUR_STAFF', 'CLIENT', 'SYSTEM', 'SEED');

-- AlterTable
ALTER TABLE "audit_event" ADD COLUMN "actor_type" "AuditActorType",
ADD COLUMN "case_id" UUID,
ADD COLUMN "correlation_id" TEXT,
ADD COLUMN "firm_id" UUID,
ADD COLUMN "support_session_id" UUID;

-- CreateIndex
CREATE INDEX "audit_event_firm_id_at_idx" ON "audit_event"("firm_id", "at");

-- The one mapping from an actor word to its type (Lead 61, comment 6900882210 on #1870), used by the back-fill and the
-- insert trigger. staff:<id>, the firm-staff ids and user-A/B/C (the Sample firm's configuration people, not our staff)
-- are FIRM_STAFF; client ids and person:<party id> (a person on their own link) are CLIENT; system, system:<door> and
-- rules (the rules resolving findings) are SYSTEM; seed:<row> is SEED. An id after the prefix is AuditPort's shape
-- (a letter or digit first, no spaces: breaker). Any other word: null (never guessed, BR-3).
CREATE FUNCTION aud_event_actor_type(actor text) RETURNS "AuditActorType"
  LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = pg_catalog, public, pg_temp
  AS $fn$ SELECT CASE
    WHEN actor ~ '^staff:[A-Za-z0-9][A-Za-z0-9._:/-]*$' OR actor IN ('user-A', 'user-B', 'user-C', 'user-O', 'user-R', 'user-T', 'user-S') THEN 'FIRM_STAFF'
    WHEN actor ~ '^person:[A-Za-z0-9][A-Za-z0-9._:/-]*$' OR actor IN ('user-P', 'user-Q') THEN 'CLIENT'
    WHEN actor IN ('system', 'rules') OR actor ~ '^system:[A-Za-z0-9][A-Za-z0-9._:/-]*$' THEN 'SYSTEM'
    WHEN actor ~ '^seed:[A-Za-z0-9][A-Za-z0-9._:/-]*$' THEN 'SEED'
  END::"AuditActorType" $fn$;

-- An actor word the mapping does not know fails the migration, with the words listed (at most 20 shown).
DO $$
DECLARE unknown text; n int;
BEGIN
  SELECT count(*), string_agg(quote_literal(a), ', ' ORDER BY a) FILTER (WHERE rn <= 20) INTO n, unknown
    FROM (SELECT a, row_number() OVER (ORDER BY a) rn FROM (SELECT DISTINCT actor a FROM "audit_event" WHERE aud_event_actor_type(actor) IS NULL) d) x;
  IF n > 0 THEN
    RAISE EXCEPTION 'aud1a: % audit actor word(s) have no actor type: %', n, unknown
      USING HINT = 'Add each word to aud_event_actor_type (FIRM_STAFF, OUR_STAFF, CLIENT, SYSTEM or SEED) before this migration runs.';
  END IF;
END $$;

-- Back-fill. actor_type from the mapping; firm_id from detail.firmId on the platform-audit workspace's lines (uuid-shaped
-- values only; others stay null); case_id from entity_key where the line is about a case and the key is an existing case.
UPDATE "audit_event" SET "actor_type" = aud_event_actor_type("actor");
UPDATE "audit_event" e SET "firm_id" = lower(e."detail"->>'firmId')::uuid
  FROM "workspace" w
  WHERE w."id" = e."workspace_id" AND w."key" = 'platform-audit'
    AND e."detail"->>'firmId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
UPDATE "audit_event" e SET "case_id" = c."id"
  FROM "runtime_case" c
  WHERE e."entity" = 'case' AND e."entity_key" ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND c."id" = e."entity_key"::uuid;

ALTER TABLE "audit_event" ALTER COLUMN "actor_type" SET NOT NULL;

-- Insert trigger: actor_type from the actor word (every writer on main leaves it out; one that passes it must pass the
-- word's own type); a word the mapping does not know is refused (BR-3: never inferred), so the writer's transaction
-- fails like any audit failure. A new kind of writer (our staff, AUD-1b) adds its word to aud_event_actor_type.
CREATE FUNCTION aud_event_fill() RETURNS trigger
  LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp
  AS $fn$
DECLARE t "AuditActorType" := aud_event_actor_type(NEW."actor");
BEGIN
  IF t IS NULL THEN
    RAISE EXCEPTION 'audit line refused: the actor word % has no actor type (staff:<id>, person:<id>, system:<door>, seed:<row> or a simulated person''s id)', quote_literal(NEW."actor")
      USING ERRCODE = 'check_violation';
  END IF;
  -- A writer that passes actor_type passes the word's own type (breaker: never a type the word does not have).
  IF NEW."actor_type" IS NOT NULL AND NEW."actor_type" <> t THEN
    RAISE EXCEPTION 'audit line refused: the actor word % is %, not %', quote_literal(NEW."actor"), t, NEW."actor_type" USING ERRCODE = 'check_violation';
  END IF;
  NEW."actor_type" := t;
  RETURN NEW;
END $fn$;
CREATE TRIGGER "aud_event_fill" BEFORE INSERT ON "audit_event" FOR EACH ROW EXECUTE FUNCTION aud_event_fill();

-- Insert-only trigger (SA-11-3, AG-13-41): an UPDATE is refused always; a DELETE only inside the demo reset (setting on)
-- and only for a Sample line: in the demo workspace, or in a workspace that no longer exists (the orphan sweep), and whose
-- firm (firm_id, else detail.firmId, where platform lines keep it until AUD-1b) is none or a Sample firm's. So a firm's
-- platform-audit line stays even if its workspace row were deleted first (review M1). Runs as xr_wall_reader (PF-12's pattern) so it sees the workspace and every firm row.
CREATE FUNCTION aud_event_no_change() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
  AS $fn$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'audit lines are never changed or deleted (UPDATE refused): a correction is a new reversing line'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF coalesce(current_setting('app.audit_sample_reset', true), '') = 'on'
     AND (NOT EXISTS (SELECT 1 FROM "workspace" w WHERE w."id" = OLD."workspace_id")
          OR EXISTS (SELECT 1 FROM "workspace" w WHERE w."id" = OLD."workspace_id" AND w."key" = 'demo'))
     AND (coalesce(OLD."firm_id"::text, OLD."detail"->>'firmId') IS NULL
          OR EXISTS (SELECT 1 FROM "platform_firm" f WHERE f."key" IN ('sample-firm', 'sample-solo')
                       AND (f."id"::text = lower(coalesce(OLD."firm_id"::text, OLD."detail"->>'firmId')) OR f."key" = OLD."detail"->>'firmId'))) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'audit lines are never changed or deleted (DELETE refused): only the demo reset removes the demo workspace''s Sample lines'
    USING ERRCODE = 'insufficient_privilege';
END $fn$;
ALTER FUNCTION aud_event_no_change() OWNER TO xr_wall_reader;
CREATE TRIGGER "aud_event_no_change" BEFORE UPDATE OR DELETE ON "audit_event" FOR EACH ROW EXECUTE FUNCTION aud_event_no_change();

CREATE FUNCTION aud_event_no_truncate() RETURNS trigger
  LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp
  AS $fn$
BEGIN
  RAISE EXCEPTION 'audit lines are never changed or deleted (TRUNCATE refused)' USING ERRCODE = 'insufficient_privilege';
END $fn$;
CREATE TRIGGER "aud_event_no_truncate" BEFORE TRUNCATE ON "audit_event" FOR EACH STATEMENT EXECUTE FUNCTION aud_event_no_truncate();

-- The grant step (SA-11-3, with the DELETE departure): PF-12's app role (xr_app, its table rights through xr_data) loses
-- UPDATE and TRUNCATE on the trail. DELETE stays granted while the demo reset runs as the app; the trigger refuses every
-- delete outside the exception (moving the reset to its own role needs a later row).
REVOKE UPDATE, TRUNCATE ON "audit_event" FROM xr_data, xr_app, PUBLIC;
