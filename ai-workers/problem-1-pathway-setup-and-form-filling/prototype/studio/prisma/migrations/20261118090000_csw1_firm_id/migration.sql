-- CS-W1 part 1 (BACKLOG CS-W1; brief design/briefs/CS-W1.md; case-side contract v0.1 §8 step 1, conditions 1 and 3, §0
-- fact 1; P-575, P-588 (4), P-559 (4); AG-1-1@ca84eb07, AG-1-45@a4057ff0): the case side's text firm key gets the
-- platform firm id beside it. Owner: the release Lead (case side), area file cases.prisma. Every function is case_firm_*.
--   * firm_id uuid, NULLABLE in this part, on runtime_case, case_stage and firm_case_counter, with an index shaped like
--     the (workspace_id, …) one. The default is the session's firm (P-588 (4) condition 1); '' after a SET LOCAL ends is
--     read as none (nullif). No foreign key and no Prisma relation (platform.prisma is Lead B's file, P-600 (1)(b)): the
--     fill triggers refuse an id that is not the key's platform firm. firm_key stays (P-559 (4)); dropping it is a later row.
--   * case_lookup.case_firm_id_of_key(key): the one narrow lookup, past PF-12's forced wall on platform_firm (with no firm
--     set nobody reads it). SECURITY DEFINER, search_path pinned (pg_temp last), owned by xr_case_lookup (NOLOGIN, owns
--     nothing else, NOBYPASSRLS), which reads only platform_firm (id, key) through one role-only policy. It lives in its own
--     schema, case_lookup: ALTER FUNCTION … OWNER TO needs the new owner to hold CREATE on the function's schema, and
--     public grants nobody CREATE since PostgreSQL 15 (#1872 round 4). EXECUTE and USAGE go to xr_data, whose members are
--     the API's xr_app and its bypass role (a case written under asBypass must fill too), never to PUBLIC.
--   * xr_case_lookup: PF-12 (merged first) already created it; this creates it only where it is missing (Lead B's ruling,
--     #1872 comment 6900931491), each cluster-wide statement retried as PF-12's are. The role is PF-12's from then on.
--   * case_firm_from_key(): BEFORE INSERT on runtime_case and firm_case_counter. A null firm_id is filled from the key; it
--     stays null while the key has no platform firm (part 1 never refuses an insert for that). A given firm_id that is not
--     the key's firm is refused in plain words.
--   * case_firm_fill(parent_table, parent_column): the generic fill for CS-W2's tables, born here so no CS-W2 PR owns a
--     shared function. A null firm_id is filled from the parent row's firm_id; a different one is refused. Used here on
--     case_stage (parent runtime_case by case_id).
--   * every trigger function is SECURITY INVOKER (contract §8 condition 3); the lookup is the only definer.
--   * backfill (case_firm_backfill(), INVOKER): every case, stage and counter whose key has a platform firm gets that firm's
--     id. The Sample firms are made by PF-3's seed (the API at start with PLATFORM_SAMPLE_SEED=on, and the demo reset),
--     never by SQL here, so the API runs the backfill again after each seed.
--   * part 2 (its own folder): NOT NULL, the four unique rules re-keyed, the update guards, the code switch.
-- Rollback (in this order): DROP TRIGGER case_firm_from_key ON runtime_case; DROP TRIGGER case_firm_from_key ON
--   firm_case_counter; DROP TRIGGER case_firm_fill ON case_stage; DROP FUNCTION case_firm_from_key(), case_firm_fill(), case_firm_backfill();
--   DROP POLICY case_lookup_read ON platform_firm; DROP FUNCTION case_lookup.case_firm_id_of_key(text); REVOKE SELECT (id, key)
--   ON platform_firm FROM xr_case_lookup; REVOKE USAGE ON SCHEMA public FROM xr_case_lookup; DROP SCHEMA case_lookup; DROP INDEX runtime_case_firm_id_created_at_idx,
--   case_stage_firm_id_case_id_idx, firm_case_counter_firm_id_year_idx; ALTER TABLE runtime_case, case_stage,
--   firm_case_counter DROP COLUMN firm_id; then delete this folder's row from _prisma_migrations. The role xr_case_lookup
--   stays (PF-12's; it may own CS-W3's functions). Nothing is lost: firm_id is derived from firm_key.

-- AlterTable
ALTER TABLE "case_stage" ADD COLUMN     "firm_id" UUID DEFAULT nullif(current_setting('app.firm_id', true), '')::uuid;

-- AlterTable
ALTER TABLE "firm_case_counter" ADD COLUMN     "firm_id" UUID DEFAULT nullif(current_setting('app.firm_id', true), '')::uuid;

-- AlterTable
ALTER TABLE "runtime_case" ADD COLUMN     "firm_id" UUID DEFAULT nullif(current_setting('app.firm_id', true), '')::uuid;

-- CreateIndex
CREATE INDEX "case_stage_firm_id_case_id_idx" ON "case_stage"("firm_id", "case_id");

-- CreateIndex
CREATE INDEX "firm_case_counter_firm_id_year_idx" ON "firm_case_counter"("firm_id", "year");

-- CreateIndex
CREATE INDEX "runtime_case_firm_id_created_at_idx" ON "runtime_case"("firm_id", "created_at");

-- The lookup's owner (cluster-wide; created only where missing) and the migration role's membership, which ALTER FUNCTION
-- … OWNER TO needs when the migration role is not a superuser. Retried on "tuple concurrently updated" (other databases on
-- the cluster may migrate at once), as PF-12 does. PF-8b F4 (RDS): ALTER names only an attribute that differs from
-- NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS (a non-superuser may not name SUPERUSER or
-- REPLICATION at all, PostgreSQL 16+), and the end state is checked.
DO $$
DECLARE s text; n int; r record; fix text;
BEGIN
  FOREACH s IN ARRAY ARRAY['CREATE ROLE xr_case_lookup NOLOGIN', '-- attributes', format('GRANT xr_case_lookup TO %I', current_user)] LOOP
    IF s = '-- attributes' THEN
      SELECT * INTO r FROM pg_roles WHERE rolname = 'xr_case_lookup';
      fix := concat_ws(' ', CASE WHEN r.rolsuper THEN 'NOSUPERUSER' END, CASE WHEN r.rolreplication THEN 'NOREPLICATION' END,
        CASE WHEN r.rolcreatedb THEN 'NOCREATEDB' END, CASE WHEN r.rolcreaterole THEN 'NOCREATEROLE' END,
        CASE WHEN r.rolcanlogin THEN 'NOLOGIN' END, CASE WHEN r.rolbypassrls THEN 'NOBYPASSRLS' END);
      IF fix = '' THEN CONTINUE; END IF;
      s := 'ALTER ROLE xr_case_lookup ' || fix;
    END IF;
    n := 0; LOOP
      BEGIN EXECUTE s; EXIT;
      EXCEPTION WHEN duplicate_object THEN EXIT;
        WHEN internal_error OR unique_violation THEN n := n + 1; IF n > 200 THEN RAISE; END IF; PERFORM pg_sleep(0.02 + random() * 0.1);
      END; END LOOP;
  END LOOP;
  SELECT * INTO r FROM pg_roles WHERE rolname = 'xr_case_lookup';
  IF r.rolsuper OR r.rolreplication OR r.rolcreatedb OR r.rolcreaterole OR r.rolcanlogin OR r.rolbypassrls THEN
    RAISE EXCEPTION 'CS-W1 stopped: role xr_case_lookup does not have its required attributes' USING ERRCODE = 'insufficient_privilege';
  END IF;
END $$;

CREATE SCHEMA IF NOT EXISTS case_lookup;
REVOKE ALL ON SCHEMA case_lookup FROM PUBLIC;
GRANT USAGE, CREATE ON SCHEMA case_lookup TO xr_case_lookup;
GRANT USAGE ON SCHEMA public TO xr_case_lookup;   -- the table it reads; never PUBLIC's default alone (breaker R2-m1)
GRANT USAGE ON SCHEMA case_lookup TO xr_data;
-- The minimum the lookup reads, and the one policy that lets its owner read past PF-12's forced wall (one line on Lead B's
-- table: their OK in the PR). PF-12's own policy is unchanged; policies are permissive, so this adds rows for this role only.
GRANT SELECT (id, key) ON platform_firm TO xr_case_lookup;
CREATE POLICY case_lookup_read ON platform_firm FOR SELECT TO xr_case_lookup USING (true);

-- One key's platform firm id; null when no platform firm has that key. Nothing else is returned. OR REPLACE: a reset that
-- drops only public (Prisma's shadow database, prisma migrate reset) keeps the case_lookup schema and this function.
CREATE OR REPLACE FUNCTION case_lookup.case_firm_id_of_key(key text) RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, case_lookup, pg_temp
  AS $fn$ SELECT f.id FROM public.platform_firm f WHERE f.key = $1 $fn$;
ALTER FUNCTION case_lookup.case_firm_id_of_key(text) OWNER TO xr_case_lookup;
REVOKE ALL ON FUNCTION case_lookup.case_firm_id_of_key(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION case_lookup.case_firm_id_of_key(text) TO xr_data;

-- runtime_case and firm_case_counter: the firm of the row's key.
CREATE FUNCTION case_firm_from_key() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
  SET search_path = pg_catalog, public, pg_temp AS $fn$
DECLARE f uuid := case_lookup.case_firm_id_of_key(NEW.firm_key);
BEGIN
  IF NEW.firm_id IS NULL THEN NEW.firm_id := f;
  ELSIF NEW.firm_id IS DISTINCT FROM f THEN
    RAISE EXCEPTION 'case_firm_from_key: the firm id given is not the platform firm of key "%" (%)', NEW.firm_key, TG_TABLE_NAME USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $fn$;
CREATE TRIGGER case_firm_from_key BEFORE INSERT ON "runtime_case" FOR EACH ROW EXECUTE FUNCTION case_firm_from_key();
CREATE TRIGGER case_firm_from_key BEFORE INSERT ON "firm_case_counter" FOR EACH ROW EXECUTE FUNCTION case_firm_from_key();

-- The generic fill (CS-W2): TG_ARGV[0] the parent table, TG_ARGV[1] the row's column holding the parent's id.
CREATE FUNCTION case_firm_fill() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
  SET search_path = pg_catalog, public, pg_temp AS $fn$
DECLARE parent_id uuid := (to_jsonb(NEW) ->> TG_ARGV[1])::uuid; given uuid := (to_jsonb(NEW) ->> 'firm_id')::uuid; pf uuid;
BEGIN
  EXECUTE format('SELECT firm_id FROM %I WHERE id = $1', TG_ARGV[0]) INTO pf USING parent_id;
  IF given IS NULL THEN RETURN jsonb_populate_record(NEW, jsonb_build_object('firm_id', pf)); END IF;
  IF given IS DISTINCT FROM pf THEN
    RAISE EXCEPTION 'case_firm_fill: a % row''s firm must be its % row''s firm', TG_TABLE_NAME, TG_ARGV[0] USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $fn$;
CREATE TRIGGER case_firm_fill BEFORE INSERT ON "case_stage" FOR EACH ROW EXECUTE FUNCTION case_firm_fill('runtime_case', 'case_id');

-- Backfill: what resolves, only rows still empty. One function, because on a database that already holds cases the Sample
-- firms are made after this migration (start.sh migrates, then the API seeds), so the API runs it again right after its
-- seed at start (main.ts) and after the demo's seed (demo.ts); a second run changes nothing (breaker M1). Returns the
-- number of rows filled. A key with no platform firm stays null; part 2 refuses then, naming it.
CREATE FUNCTION case_firm_backfill() RETURNS integer LANGUAGE plpgsql SECURITY INVOKER
  SET search_path = pg_catalog, public, pg_temp AS $fn$
DECLARE a integer; b integer; c integer;
BEGIN
  UPDATE runtime_case SET firm_id = case_lookup.case_firm_id_of_key(firm_key)
   WHERE firm_id IS NULL AND case_lookup.case_firm_id_of_key(firm_key) IS NOT NULL;
  GET DIAGNOSTICS a = ROW_COUNT;
  UPDATE case_stage s SET firm_id = k.firm_id FROM runtime_case k WHERE k.id = s.case_id AND s.firm_id IS NULL AND k.firm_id IS NOT NULL;
  GET DIAGNOSTICS b = ROW_COUNT;
  UPDATE firm_case_counter SET firm_id = case_lookup.case_firm_id_of_key(firm_key)
   WHERE firm_id IS NULL AND case_lookup.case_firm_id_of_key(firm_key) IS NOT NULL;
  GET DIAGNOSTICS c = ROW_COUNT;
  RETURN a + b + c;
END $fn$;
REVOKE ALL ON FUNCTION case_firm_backfill() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION case_firm_backfill() TO xr_data;
SELECT case_firm_backfill();
