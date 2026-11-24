-- PF-21d part 1a (map row 85; SA-11-16 (d); brief product/screens/PF-21d/brief.md, decision 1 accepted by the tech lead on
-- #3189, 23 Nov): the "Data erasure" switch's home, the minimal platform switch until SA-12's feature flags exist.
-- Additive: two tables (plat_switch, plat_switch_event) with one seeded row, rule triggers and two definers. No existing
-- table, row or function changes.
-- One row per switch, on by default (SA-11-16 (d)); a change needs a reason and is an insert-only event; only our staff
-- change it (key system/compliance:dsr-manage, the Platform Owner, Sample: SA-12 names no key). Our own tables: forced, no
-- policy, no grants for xr_data; reached only through the definers, each refused in a firm's session (the register's
-- own plat_switch_system_only). Legal reading Unconfirmed: no counsel.
-- Rollback (by hand): DROP the three functions, plat_switch_kept() and both tables.
CREATE TABLE "plat_switch" (
    "key" TEXT NOT NULL,
    "is_on" BOOLEAN NOT NULL DEFAULT true,
    "changed_by" TEXT,
    "changed_at" TIMESTAMPTZ,
    CONSTRAINT "plat_switch_pkey" PRIMARY KEY ("key")
);
CREATE TABLE "plat_switch_event" (
    "id" UUID NOT NULL,
    "seq" BIGSERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "is_on" BOOLEAN NOT NULL,
    "reason" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "plat_switch_event_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "plat_switch_event_key_seq_key" ON "plat_switch_event"("key", "seq");
ALTER TABLE "plat_switch_event" ADD CONSTRAINT "plat_switch_event_key_fkey" FOREIGN KEY ("key") REFERENCES "plat_switch"("key") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "plat_switch" ADD CONSTRAINT "plat_switch_facts_set" CHECK ("key" ~ '^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$' AND char_length("key") <= 100
  AND ("changed_by" IS NULL) = ("changed_at" IS NULL) AND ("changed_by" IS NULL OR "changed_by" ~ '^(staff|seed|system):[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$'));
ALTER TABLE "plat_switch_event" ADD CONSTRAINT "plat_switch_event_facts_set" CHECK (btrim("reason") <> '' AND char_length("reason") <= 500
  AND "actor" ~ '^(staff|seed|system):[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$');
-- The one switch this row needs, on (SA-11-16 (d): on by default). Seeded before the walls go up.
INSERT INTO "plat_switch" ("key") VALUES ('platform.data-erasure');
-- A switch is never deleted and changes only its state; its events are insert-only.
CREATE FUNCTION plat_switch_kept() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $fn$
BEGIN
  IF TG_OP = 'UPDATE' AND TG_TABLE_NAME = 'plat_switch' AND NEW.key = OLD.key THEN
    NEW.changed_at := clock_timestamp();
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'plat_switch_kept: every switch and every change is kept (% on % refused)', TG_OP, TG_TABLE_NAME USING ERRCODE = 'insufficient_privilege';
END $fn$;
CREATE TRIGGER "plat_switch_kept" BEFORE UPDATE OR DELETE ON "plat_switch" FOR EACH ROW EXECUTE FUNCTION plat_switch_kept();
CREATE TRIGGER "plat_switch_no_truncate" BEFORE TRUNCATE ON "plat_switch" FOR EACH STATEMENT EXECUTE FUNCTION plat_switch_kept();
CREATE TRIGGER "plat_switch_event_kept" BEFORE UPDATE OR DELETE ON "plat_switch_event" FOR EACH ROW EXECUTE FUNCTION plat_switch_kept();
CREATE TRIGGER "plat_switch_event_no_truncate" BEFORE TRUNCATE ON "plat_switch_event" FOR EACH STATEMENT EXECUTE FUNCTION plat_switch_kept();
REVOKE ALL ON "plat_switch", "plat_switch_event" FROM xr_data;
ALTER TABLE "plat_switch" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "plat_switch" FORCE ROW LEVEL SECURITY;
ALTER TABLE "plat_switch_event" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "plat_switch_event" FORCE ROW LEVEL SECURITY;
-- The switch definers (system plane only: each refused inside a firm's session, review m4).
CREATE FUNCTION plat_switch_system_only() RETURNS void LANGUAGE plpgsql STABLE SET search_path = pg_catalog, public, pg_temp AS $fn$
BEGIN
  IF platform_session_firm() IS NOT NULL THEN
    RAISE EXCEPTION 'plat_switch: only ExpatReady''s own staff read or change the platform switches' USING ERRCODE = 'insufficient_privilege';
  END IF;
END $fn$;
CREATE FUNCTION plat_switch_list() RETURNS TABLE (key text, is_on boolean, changed_by text, changed_at timestamptz)
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $fn$
BEGIN
  PERFORM plat_switch_system_only();
  RETURN QUERY SELECT s.key, s.is_on, s.changed_by, s.changed_at FROM plat_switch s ORDER BY s.key;
END $fn$;
-- Sets a switch with its reason: 'NOT_FOUND', 'SAME' (already so; nothing written) or 'SET'. The row is locked first.
CREATE FUNCTION plat_switch_set(p_key text, p_on boolean, p_reason text, p_by text) RETURNS text
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $fn$
DECLARE cur boolean;
BEGIN
  PERFORM plat_switch_system_only();
  SELECT s.is_on INTO cur FROM plat_switch s WHERE s.key = p_key FOR UPDATE;
  IF cur IS NULL THEN RETURN 'NOT_FOUND'; END IF;
  IF cur = p_on THEN RETURN 'SAME'; END IF;
  UPDATE plat_switch s SET is_on = p_on, changed_by = p_by WHERE s.key = p_key;
  INSERT INTO plat_switch_event (id, key, is_on, reason, actor) VALUES (gen_random_uuid(), p_key, p_on, p_reason, p_by);
  RETURN 'SET';
END $fn$;
-- PF-8b F4 (RDS): CREATE on public for xr_wall_reader only for the hand-over (as 20261123100000_pf21b_data_requests).
GRANT CREATE ON SCHEMA public TO xr_wall_reader;
DO $own$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['plat_switch_system_only()', 'plat_switch_list()', 'plat_switch_set(text, boolean, text, text)'] LOOP
    EXECUTE format('ALTER FUNCTION %s OWNER TO xr_wall_reader', f);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO xr_data', f);
  END LOOP;
END
$own$;
REVOKE CREATE ON SCHEMA public FROM xr_wall_reader;
