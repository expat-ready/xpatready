-- AUD-3b part 1 (R1.87; SA-2-16 start with a step-up check and a reason or ticket, read-only; SA-2-17 always blocked;
-- SA-2-18 fixed 60 minutes, never refreshed; SA-11-11 every action stamped with the support person and the session;
-- P-607 (4) read-only sessions in Release 1; BACKLOG AUD-3b, amendment 2: its own area file). Additive: one enum, one
-- table, two indexes, six functions (three trigger functions, a system-plane check and two definers), four triggers, two checks, and two data rows in PF-4s's permission
-- catalogue. No existing table, function or row is changed. Area `shared`: the table is platform-support-session's, the
-- seed rows platform-system's (SPD-2).
--
-- Walls: plat_support_session is one of our own registers (PF-12's OWN list, tests/check_pf12_walls.ts): row-level
-- security forced with no policy, so xr_app reads and writes nothing in it directly. Two narrow definers (owned by
-- xr_wall_reader, search_path pinned, EXECUTE for xr_data's members only) are the only ways in, each refused inside a
-- firm's session (platform_session_firm() set): who may call them with no firm is the code's gate (PF-4s's guard and
-- the key system/firm:impersonate), the model of PF-21b's legal holds.
--   * plat_support_session_start(firm, staff, reason): a new READ session, or OPEN (this staff member has one open: SA-2-17
--     "starting another session"), FIRM_NOT_FOUND or STAFF_NOT_FOUND; one staff member at a time (an advisory lock).
--   * plat_support_session_open(id, staff): the session while it is open and this staff member's, else nothing.
-- Rules: started_at is the database's time and ends_at exactly 60 minutes later (SA-2-18), never moved; the firm and the
-- staff member exist (checked at insert; other areas' tables, no relation); mode READ only in this part (CHANGE needs the
-- firm's setting, AUD-3b part 2); the reason is 1-200 characters; a session is never deleted or truncated; an update
-- only ends an open session, once, with an end reason, and changes nothing else.
-- Seed (P-601 (1)): system/firm:impersonate for the Platform Owner and Support (SA-07 v2.17 Appendix A "Start a support
-- session (read-only unless the firm allowed changes)": Own and Sup ticked).
--
-- Rollback (by hand): DELETE the seeded permission rows; DROP TABLE plat_support_session (CASCADE drops its triggers);
-- DROP the six functions and the enum.

-- CreateEnum
CREATE TYPE "PlatSupportSessionMode" AS ENUM ('READ', 'CHANGE');

-- CreateTable
CREATE TABLE "plat_support_session" (
    "id" UUID NOT NULL,
    "firm_id" UUID NOT NULL,
    "staff_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "mode" "PlatSupportSessionMode" NOT NULL DEFAULT 'READ',
    "started_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ends_at" TIMESTAMPTZ NOT NULL,
    "ended_at" TIMESTAMPTZ,
    "end_reason" TEXT,

    CONSTRAINT "plat_support_session_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "plat_support_session_staff_id_ends_at_idx" ON "plat_support_session"("staff_id", "ends_at");

-- CreateIndex
CREATE INDEX "plat_support_session_firm_id_started_at_idx" ON "plat_support_session"("firm_id", "started_at");

ALTER TABLE "plat_support_session" ADD CONSTRAINT "plat_support_session_reason_set" CHECK (char_length(btrim("reason")) BETWEEN 1 AND 200);
ALTER TABLE "plat_support_session" ADD CONSTRAINT "plat_support_session_end_whole" CHECK (("ended_at" IS NULL) = ("end_reason" IS NULL));

-- At insert: the database's times, the firm and the staff member exist, READ only (this part).
CREATE FUNCTION plat_support_session_started() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $fn$
BEGIN
  IF NEW.mode <> 'READ' THEN
    RAISE EXCEPTION 'plat_support_session: a session is read-only until the firm allows changes (AUD-3b part 2)' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM platform_firm f WHERE f.id = NEW.firm_id) THEN
    RAISE EXCEPTION 'plat_support_session: no such firm' USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM plat_system_staff s WHERE s.id = NEW.staff_id) THEN
    RAISE EXCEPTION 'plat_support_session: no such ExpatReady staff member' USING ERRCODE = 'foreign_key_violation';
  END IF;
  NEW.started_at := clock_timestamp();
  NEW.ends_at := NEW.started_at + interval '60 minutes';
  NEW.ended_at := NULL;
  NEW.end_reason := NULL;
  RETURN NEW;
END $fn$;
CREATE TRIGGER "plat_support_session_started" BEFORE INSERT ON "plat_support_session" FOR EACH ROW EXECUTE FUNCTION plat_support_session_started();

-- An update only ends an open session, once; nothing else changes.
CREATE FUNCTION plat_support_session_ended() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $fn$
BEGIN
  IF OLD.ended_at IS NOT NULL OR NEW.ended_at IS NULL
     OR (NEW.id, NEW.firm_id, NEW.staff_id, NEW.reason, NEW.mode, NEW.started_at, NEW.ends_at) IS DISTINCT FROM (OLD.id, OLD.firm_id, OLD.staff_id, OLD.reason, OLD.mode, OLD.started_at, OLD.ends_at) THEN
    RAISE EXCEPTION 'plat_support_session: a session only ends, once; nothing else of it changes' USING ERRCODE = 'insufficient_privilege';
  END IF;
  NEW.ended_at := least(clock_timestamp(), OLD.ends_at);
  RETURN NEW;
END $fn$;
CREATE TRIGGER "plat_support_session_ended" BEFORE UPDATE ON "plat_support_session" FOR EACH ROW EXECUTE FUNCTION plat_support_session_ended();

CREATE FUNCTION plat_support_session_kept() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $fn$
BEGIN
  RAISE EXCEPTION 'plat_support_session: a support session is never deleted (SA-2-19: kept for the audit period)' USING ERRCODE = 'insufficient_privilege';
END $fn$;
CREATE TRIGGER "plat_support_session_kept" BEFORE DELETE ON "plat_support_session" FOR EACH ROW EXECUTE FUNCTION plat_support_session_kept();
CREATE TRIGGER "plat_support_session_no_truncate" BEFORE TRUNCATE ON "plat_support_session" FOR EACH STATEMENT EXECUTE FUNCTION plat_support_session_kept();
REVOKE DELETE, TRUNCATE ON "plat_support_session" FROM xr_data;

-- Our own register: forced, no policy (PF-12's OWN list).
ALTER TABLE "plat_support_session" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "plat_support_session" FORCE ROW LEVEL SECURITY;

-- Our console's start and read (system plane only: refused inside a firm's session).
CREATE FUNCTION plat_support_session_system_only() RETURNS void LANGUAGE plpgsql STABLE SET search_path = pg_catalog, public, pg_temp AS $fn$
BEGIN
  IF platform_session_firm() IS NOT NULL THEN
    RAISE EXCEPTION 'plat_support_session: only ExpatReady''s own staff start or read support sessions' USING ERRCODE = 'insufficient_privilege';
  END IF;
END $fn$;

CREATE FUNCTION plat_support_session_start(p_firm uuid, p_staff uuid, p_reason text)
  RETURNS TABLE (status text, id uuid, started_at timestamptz, ends_at timestamptz)
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $fn$
DECLARE o record;
BEGIN
  PERFORM plat_support_session_system_only();
  PERFORM pg_advisory_xact_lock(hashtext('support-session:' || lower(p_staff::text)));   -- one start at a time per staff member
  IF NOT EXISTS (SELECT 1 FROM platform_firm f WHERE f.id = p_firm) THEN RETURN QUERY SELECT 'FIRM_NOT_FOUND'::text, NULL::uuid, NULL::timestamptz, NULL::timestamptz; RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM plat_system_staff s WHERE s.id = p_staff) THEN RETURN QUERY SELECT 'STAFF_NOT_FOUND'::text, NULL::uuid, NULL::timestamptz, NULL::timestamptz; RETURN; END IF;
  SELECT s.id, s.started_at, s.ends_at INTO o FROM plat_support_session s WHERE s.staff_id = p_staff AND s.ended_at IS NULL AND s.ends_at > clock_timestamp() ORDER BY s.started_at DESC LIMIT 1;
  IF FOUND THEN RETURN QUERY SELECT 'OPEN'::text, o.id, o.started_at, o.ends_at; RETURN; END IF;
  RETURN QUERY INSERT INTO plat_support_session AS s (id, firm_id, staff_id, reason, ends_at) VALUES (gen_random_uuid(), p_firm, p_staff, p_reason, clock_timestamp())
    RETURNING 'STARTED'::text, s.id, s.started_at, s.ends_at;
END $fn$;

CREATE FUNCTION plat_support_session_open(p_id uuid, p_staff uuid)
  RETURNS TABLE (id uuid, firm_id uuid, reason text, mode text, started_at timestamptz, ends_at timestamptz)
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $fn$
BEGIN
  PERFORM plat_support_session_system_only();
  RETURN QUERY SELECT s.id, s.firm_id, s.reason, s.mode::text, s.started_at, s.ends_at FROM plat_support_session s
   WHERE s.id = p_id AND s.staff_id = p_staff AND s.ended_at IS NULL AND s.ends_at > clock_timestamp();
END $fn$;

-- Seed (P-601 (1)): SA-07 v2.17 Appendix A "Start a support session (read-only unless the firm allowed changes)" — Own
-- and Sup. The seed runs in its own DO statement (PF-8b F7, #3068; the shape of 20261124170000_aud3_audit_log_keys).
DO $$
DECLARE t text; lifted text[] := '{}'; walls text[] := ARRAY['plat_system_role_permission']; gated text[] := '{}';
BEGIN
  IF NOT (SELECT pf8b_role.rolsuper OR pf8b_role.rolbypassrls FROM pg_roles pf8b_role WHERE pf8b_role.rolname = current_user) THEN
    EXECUTE (SELECT 'LOCK TABLE ' || string_agg(format('%I', pf8b_w), ', ') || ' IN ACCESS EXCLUSIVE MODE' FROM unnest(walls) pf8b_w);
    SELECT coalesce(array_agg(pf8b_c.relname::text ORDER BY pf8b_c.relname), '{}') INTO lifted FROM pg_class pf8b_c
      WHERE pf8b_c.relnamespace = 'public'::regnamespace AND pf8b_c.relname = ANY (walls) AND pf8b_c.relforcerowsecurity;
    FOREACH t IN ARRAY lifted LOOP EXECUTE format('ALTER TABLE %I NO FORCE ROW LEVEL SECURITY', t); END LOOP;
    SELECT coalesce(array_agg(pf8b_g.tgrelid::regclass::text ORDER BY 1), '{}') INTO gated FROM pg_trigger pf8b_g
      WHERE pf8b_g.tgname = '0_pf12_firm_first' AND pf8b_g.tgenabled = 'O' AND pf8b_g.tgrelid::regclass::text = ANY (walls);
    FOREACH t IN ARRAY gated LOOP EXECUTE format('ALTER TABLE %I DISABLE TRIGGER "0_pf12_firm_first"', t); END LOOP;
  END IF;
  INSERT INTO "plat_system_role_permission" ("role_code", "permission_key") VALUES
    ('platform-owner', 'system/firm:impersonate'), ('platform-support', 'system/firm:impersonate');
  FOREACH t IN ARRAY gated LOOP EXECUTE format('ALTER TABLE %I ENABLE TRIGGER "0_pf12_firm_first"', t); END LOOP;
  FOREACH t IN ARRAY lifted LOOP EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t); END LOOP;
END $$;

-- PF-8b F4 (RDS): a non-superuser may hand a function to xr_wall_reader only while it holds CREATE on public; granted for
-- the hand-over and taken back after (a no-op pair on a superuser cluster; tests/check_pf8b_f4_migrations.ts).
GRANT CREATE ON SCHEMA public TO xr_wall_reader;
DO $own$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['plat_support_session_system_only()', 'plat_support_session_start(uuid, uuid, text)', 'plat_support_session_open(uuid, uuid)'] LOOP
    EXECUTE format('ALTER FUNCTION %s OWNER TO xr_wall_reader', f);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO xr_data', f);
  END LOOP;
END
$own$;
REVOKE CREATE ON SCHEMA public FROM xr_wall_reader;
