-- PF-21b part 2 (map row 85; SA-11 §3.5, SA-11-40, SA2-D25, BR-7, BR-12; brief design/briefs/track-b/PF-21b-2.md; P-600,
-- P-601 (1)): legal holds. Additive: one enum, one table, one index, four functions, four triggers, one constraint set,
-- five definers, and one data row in PF-4s's permission catalogue. No existing table, function or row is changed.
--
-- Walls: plat_legal_hold is one of our own registers (PF-12's OWN list, tests/check_pf12_walls.ts): row-level security
-- forced with no policy, so xr_app reads and writes nothing in it directly. Five narrow definers (owned by xr_wall_reader,
-- search_path pinned, EXECUTE for xr_data's members only) are the only ways in, as PF-4s closes its own tables:
--   * plat_legal_hold_active(firm): a firm's deleter (xr_app, in its firm's transaction) reads its OWN firm's active holds;
--     any other firm, or no firm, is refused. The bypass role and the owner read the table itself (the adapter).
--   * plat_legal_hold_place, plat_legal_hold_release, plat_legal_hold_firm and plat_legal_hold_list: our console's routes
--     (/api/system/register/holds, @SystemKeys("system/compliance:legal-hold")), which run with no firm. Each is refused
--     inside a firm's session (platform_session_firm() set). Who may call them with no firm is the code's gate (PF-4s's
--     guard and the key), the same model as PF-4s's plat_system_no_firm policy. Placing and releasing take the firm's
--     exclusive hold lock themselves (ports/legal-hold.ts rule 3), so a deleter's open transaction finishes first and
--     the next deleter sees the change.
-- Rules: the scope's shape (each kind its own target, nothing else); the firm exists (a check at insert: PlatformFirm's
-- schema file is not this row's, so no relation; firms are never deleted while a hold exists, PF-11 asks this port
-- first); reason and actors are set; placed_at and released_at are the database's time; a hold is never deleted or
-- truncated; an update only releases an active hold, once, with who, when and why, and changes nothing else.
-- Seed (P-601 (1), read by the Lead before the label): system/compliance:legal-hold for the Platform Owner only, into
-- PF-4s's plat_system_role_permission (SA-07 v2.17 Appendix A's row "Place and release legal holds", ticked for Own
-- only; SA7-D74 (a)). Legal reading Unconfirmed: no counsel.
--
-- Rollback (by hand): DELETE the seeded permission row; DROP TABLE plat_legal_hold (CASCADE drops its triggers); DROP the
-- eight functions and the enum.

-- CreateEnum
CREATE TYPE "PlatLegalHoldScope" AS ENUM ('FIRM', 'CASE', 'PERSON', 'CATEGORY', 'DATE_RANGE');

-- CreateTable
CREATE TABLE "plat_legal_hold" (
    "id" UUID NOT NULL,
    "firm_id" UUID NOT NULL,
    "scope_kind" "PlatLegalHoldScope" NOT NULL,
    "target_id" UUID,
    "category" TEXT,
    "range_from" TIMESTAMPTZ,
    "range_to" TIMESTAMPTZ,
    "reason" TEXT NOT NULL,
    "placed_by" TEXT NOT NULL,
    "placed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "released_by" TEXT,
    "released_at" TIMESTAMPTZ,
    "release_reason" TEXT,

    CONSTRAINT "plat_legal_hold_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "plat_legal_hold_firm_id_released_at_idx" ON "plat_legal_hold"("firm_id", "released_at");

-- Rules Prisma cannot say.
-- Each scope names its own target and nothing else; a date range ends on or after its start (ports/legal-hold.ts HoldScope).
ALTER TABLE "plat_legal_hold" ADD CONSTRAINT "plat_legal_hold_scope_shape" CHECK (
  CASE "scope_kind"
    WHEN 'FIRM' THEN "target_id" IS NULL AND "category" IS NULL AND "range_from" IS NULL AND "range_to" IS NULL
    WHEN 'CASE' THEN "target_id" IS NOT NULL AND "category" IS NULL AND "range_from" IS NULL AND "range_to" IS NULL
    WHEN 'PERSON' THEN "target_id" IS NOT NULL AND "category" IS NULL AND "range_from" IS NULL AND "range_to" IS NULL
    WHEN 'CATEGORY' THEN "target_id" IS NULL AND "category" ~ '^[a-z][a-z0-9_]{0,62}$' AND "range_from" IS NULL AND "range_to" IS NULL
    WHEN 'DATE_RANGE' THEN "target_id" IS NULL AND "category" IS NULL AND "range_from" IS NOT NULL AND "range_to" IS NOT NULL AND "range_from" <= "range_to"
  END);
-- A reason is set and at most 500 characters; actors are AuditPort's actor words (staff:<id>, seed:<row>, system:<door>).
ALTER TABLE "plat_legal_hold" ADD CONSTRAINT "plat_legal_hold_facts_set" CHECK (
  btrim("reason") <> '' AND char_length("reason") <= 500 AND "placed_by" ~ '^(staff|seed|system):[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$');
-- Released: all four release fields together, or none; the release's reason is set; it ends on or after the placement.
ALTER TABLE "plat_legal_hold" ADD CONSTRAINT "plat_legal_hold_release_whole" CHECK (
  ("released_by" IS NULL AND "released_at" IS NULL AND "release_reason" IS NULL)
  OR ("released_by" ~ '^(staff|seed|system):[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$' AND "released_at" >= "placed_at"
      AND btrim("release_reason") <> '' AND char_length("release_reason") <= 500));

-- At insert: the firm exists; the placement time is the database's; a hold is placed active.
CREATE FUNCTION plat_legal_hold_placed() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $fn$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM platform_firm f WHERE f.id = NEW.firm_id) THEN
    RAISE EXCEPTION 'plat_legal_hold_placed: no such firm' USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF NEW.released_at IS NOT NULL OR NEW.released_by IS NOT NULL OR NEW.release_reason IS NOT NULL THEN
    RAISE EXCEPTION 'plat_legal_hold_placed: a hold is placed active; a release is a later update' USING ERRCODE = 'check_violation';
  END IF;
  NEW.placed_at := clock_timestamp();
  RETURN NEW;
END $fn$;
CREATE TRIGGER "plat_legal_hold_placed" BEFORE INSERT ON "plat_legal_hold" FOR EACH ROW EXECUTE FUNCTION plat_legal_hold_placed();

-- An update only releases an active hold, once (BR-12: never a silent second release), and changes nothing else.
CREATE FUNCTION plat_legal_hold_released() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $fn$
BEGIN
  IF OLD.released_at IS NOT NULL THEN
    RAISE EXCEPTION 'plat_legal_hold_released: this hold is already released' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.id <> OLD.id OR NEW.firm_id <> OLD.firm_id OR NEW.scope_kind <> OLD.scope_kind OR NEW.target_id IS DISTINCT FROM OLD.target_id
     OR NEW.category IS DISTINCT FROM OLD.category OR NEW.range_from IS DISTINCT FROM OLD.range_from OR NEW.range_to IS DISTINCT FROM OLD.range_to
     OR NEW.reason <> OLD.reason OR NEW.placed_by <> OLD.placed_by OR NEW.placed_at <> OLD.placed_at THEN
    RAISE EXCEPTION 'plat_legal_hold_released: a hold''s facts never change; only its release is recorded' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.released_by IS NULL OR NEW.release_reason IS NULL THEN
    RAISE EXCEPTION 'plat_legal_hold_released: a release names who released it and why' USING ERRCODE = 'check_violation';
  END IF;
  NEW.released_at := clock_timestamp();
  RETURN NEW;
END $fn$;
CREATE TRIGGER "plat_legal_hold_released" BEFORE UPDATE ON "plat_legal_hold" FOR EACH ROW EXECUTE FUNCTION plat_legal_hold_released();

-- Never deleted, never truncated (§3.5: a hold is released, and the record stays).
CREATE FUNCTION plat_legal_hold_kept() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $fn$
BEGIN
  RAISE EXCEPTION 'plat_legal_hold_kept: a legal hold is released, never deleted (% refused)', TG_OP USING ERRCODE = 'insufficient_privilege';
END $fn$;
CREATE TRIGGER "plat_legal_hold_kept" BEFORE DELETE ON "plat_legal_hold" FOR EACH ROW EXECUTE FUNCTION plat_legal_hold_kept();
CREATE TRIGGER "plat_legal_hold_no_truncate" BEFORE TRUNCATE ON "plat_legal_hold" FOR EACH STATEMENT EXECUTE FUNCTION plat_legal_hold_kept();
REVOKE DELETE, TRUNCATE ON "plat_legal_hold" FROM xr_data;

-- Our own register: forced, no policy (PF-12's OWN list).
ALTER TABLE "plat_legal_hold" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "plat_legal_hold" FORCE ROW LEVEL SECURITY;

-- A firm's deleter's read: the ACTIVE holds of the session's own firm, nothing else. Refused for any other firm, and when
-- the session names no firm (a firmless xr_app caller learns nothing; the bypass role reads the table itself). Owned by
-- xr_wall_reader (BYPASSRLS), search_path pinned; callable by xr_data's members only.
CREATE FUNCTION plat_legal_hold_active(p_firm uuid)
  RETURNS TABLE (id uuid, scope_kind text, target_id uuid, category text, range_from timestamptz, range_to timestamptz, reason text, placed_by text, placed_at timestamptz)
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $fn$
BEGIN
  IF p_firm IS NULL OR platform_session_firm() IS NULL OR p_firm <> platform_session_firm() THEN
    RAISE EXCEPTION 'plat_legal_hold_active: only the session''s own firm''s holds' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN QUERY SELECT h.id, h.scope_kind::text, h.target_id, h.category, h.range_from, h.range_to, h.reason, h.placed_by, h.placed_at
    FROM plat_legal_hold h WHERE h.firm_id = p_firm AND h.released_at IS NULL ORDER BY h.placed_at, h.id;
END $fn$;
-- (Owner and grants: the last block below.)

-- Seed (P-601 (1)): SA-07 v2.17 Appendix A "Place and release legal holds (`system/compliance:legal-hold` — G-Q5)" — Own
-- only (SA7-D74 (a) "Place and release legal holds — Platform Owner only"; SA2-D25).
-- The seed runs in its own DO statement (PF-8b F7, #3068; the shape of 20261122060000_pf4s_system_identity): a runner
-- that is neither superuser nor BYPASSRLS owns this walled table but, under FORCE ROW LEVEL SECURITY, would write none of
-- its rows; it lifts FORCE inside this statement (ACCESS EXCLUSIVE first) and puts it back at its end. PF-12's firm gate
-- steps aside the same way while plainly enabled (this table has none, so that step finds nothing; F7's one shape).
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
  INSERT INTO "plat_system_role_permission" ("role_code", "permission_key") VALUES ('platform-owner', 'system/compliance:legal-hold');
  FOREACH t IN ARRAY gated LOOP EXECUTE format('ALTER TABLE %I ENABLE TRIGGER "0_pf12_firm_first"', t); END LOOP;
  FOREACH t IN ARRAY lifted LOOP EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t); END LOOP;
END $$;

-- Our console's writes and reads (system plane only: refused inside a firm's session).
CREATE FUNCTION plat_legal_hold_system_only() RETURNS void LANGUAGE plpgsql STABLE SET search_path = pg_catalog, public, pg_temp AS $fn$
BEGIN
  IF platform_session_firm() IS NOT NULL THEN
    RAISE EXCEPTION 'plat_legal_hold: only ExpatReady''s own staff place, release or read legal holds' USING ERRCODE = 'insufficient_privilege';
  END IF;
END $fn$;

CREATE FUNCTION plat_legal_hold_place(p_firm uuid, p_kind text, p_target uuid, p_category text, p_from timestamptz, p_to timestamptz, p_reason text, p_by text)
  RETURNS TABLE (id uuid, placed_at timestamptz)
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $fn$
BEGIN
  PERFORM plat_legal_hold_system_only();
  PERFORM pg_advisory_xact_lock(hashtext('legal-hold:' || lower(p_firm::text)));   -- LEGAL_HOLD_LOCK.exclusive (rule 3)
  RETURN QUERY INSERT INTO plat_legal_hold AS h (id, firm_id, scope_kind, target_id, category, range_from, range_to, reason, placed_by)
    VALUES (gen_random_uuid(), p_firm, p_kind::"PlatLegalHoldScope", p_target, p_category, p_from, p_to, p_reason, p_by)
    RETURNING h.id, h.placed_at;
END $fn$;

-- The firm of a hold (null: no such hold), so the release can take that firm's lock before it changes anything.
CREATE FUNCTION plat_legal_hold_firm(p_id uuid) RETURNS uuid
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $fn$
BEGIN
  PERFORM plat_legal_hold_system_only();
  RETURN (SELECT h.firm_id FROM plat_legal_hold h WHERE h.id = p_id);
END $fn$;

-- Releases an active hold under its firm's exclusive lock: 'NOT_FOUND', 'ALREADY_RELEASED' (a second release, also one
-- that waited for a parallel first) or 'RELEASED'. Each statement reads afresh after the lock (READ COMMITTED).
CREATE FUNCTION plat_legal_hold_release(p_id uuid, p_by text, p_reason text) RETURNS text
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $fn$
DECLARE f uuid; n int;
BEGIN
  PERFORM plat_legal_hold_system_only();
  SELECT h.firm_id INTO f FROM plat_legal_hold h WHERE h.id = p_id;
  IF f IS NULL THEN RETURN 'NOT_FOUND'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('legal-hold:' || lower(f::text)));
  UPDATE plat_legal_hold h SET released_by = p_by, release_reason = p_reason WHERE h.id = p_id AND h.released_at IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN CASE WHEN n = 1 THEN 'RELEASED' ELSE 'ALREADY_RELEASED' END;
END $fn$;

-- Holds newest first: of one firm or all (p_firm), active only, released only or both (p_active), or one hold (p_id); at
-- most p_limit rows (1 to 501: the service asks one more than it shows, to say the list was cut).
CREATE FUNCTION plat_legal_hold_list(p_firm uuid, p_active boolean, p_id uuid, p_limit int)
  RETURNS TABLE (id uuid, firm_id uuid, scope_kind text, target_id uuid, category text, range_from timestamptz, range_to timestamptz, reason text,
                 placed_by text, placed_at timestamptz, released_by text, released_at timestamptz, release_reason text)
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $fn$
BEGIN
  PERFORM plat_legal_hold_system_only();
  RETURN QUERY SELECT h.id, h.firm_id, h.scope_kind::text, h.target_id, h.category, h.range_from, h.range_to, h.reason, h.placed_by, h.placed_at,
                      h.released_by, h.released_at, h.release_reason
    FROM plat_legal_hold h
   WHERE (p_firm IS NULL OR h.firm_id = p_firm) AND (p_id IS NULL OR h.id = p_id) AND (p_active IS NULL OR (h.released_at IS NULL) = p_active)
   ORDER BY h.placed_at DESC, h.id LIMIT least(greatest(coalesce(p_limit, 501), 1), 501);
END $fn$;

-- PF-8b F4 (RDS): a non-superuser may hand a function to xr_wall_reader only while it holds CREATE on public; granted for
-- the hand-over and taken back after (a no-op pair on a superuser cluster; tests/check_pf8b_f4_migrations.ts).
GRANT CREATE ON SCHEMA public TO xr_wall_reader;
DO $own$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['plat_legal_hold_active(uuid)', 'plat_legal_hold_system_only()', 'plat_legal_hold_place(uuid, text, uuid, text, timestamptz, timestamptz, text, text)',
                           'plat_legal_hold_firm(uuid)', 'plat_legal_hold_release(uuid, text, text)', 'plat_legal_hold_list(uuid, boolean, uuid, integer)'] LOOP
    EXECUTE format('ALTER FUNCTION %s OWNER TO xr_wall_reader', f);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO xr_data', f);
  END LOOP;
END
$own$;
REVOKE CREATE ON SCHEMA public FROM xr_wall_reader;
