-- PF-12 (contracts §0 rule 2, §7, §9; map row 3; AG-1-1, AG-1-3, AG-1-45; rows rev 14, rev 16.2, rev 16.34): database walls
-- between firms. Policies and roles only: no table, column, key or index changes.
--
-- Roles (cluster-wide: each created only when missing). xr_app LOGIN: the API's role; owns no table, no superuser, no
-- BYPASSRLS, no CREATE anywhere, so it cannot own a table, set session_replication_role or disable a trigger; terse
-- error logs. xr_data NOLOGIN: the table rights (by default privileges for later tables too), inherited by xr_app and
-- xr_staff_bypass. xr_staff_bypass NOLOGIN BYPASSRLS: xr_app may SET ROLE to it, never inherits it; only firm-scope.ts
-- asBypass() does, for a use on its named list, each use logged. xr_wall_reader NOLOGIN BYPASSRLS: owns every firm
-- table's trigger function (SECURITY DEFINER, search_path pinned, pg_temp last) and the address lookup, so each trigger
-- sees every firm's rows as before the walls (breaker M1, M2); nobody may become it. xr_case_lookup NOLOGIN (rev 16.34):
-- created only if CS-W1 part 1 has not; owns only the case side's firm-lookup functions; no grant here.
-- Walls: ENABLE + FORCE row-level security, one policy per table: firm_id = platform_session_firm() (app.firm_id, ''
-- read as none), so no firm reads and writes nothing. Off (catalogues, no firm_id): platform_plan,
-- platform_role_permission, platform_setting_definition, platform_permission_key, platform_terms_version. Our own
-- registers (platform_signup_pending; plat_breach, plat_data_request, plat_legal_hold when they exist): forced, no policy.
-- Firms also read platform-owned msg_template(_version) rows. Every later firm table ships its policy (tests/check_pf12_walls.ts).
-- Down: drop the policies and both functions; NO FORCE, DISABLE row-level security; trigger functions back to INVOKER and
-- the migration role; revoke the grants and default privileges; drop the roles once every database on the cluster has.

-- Roles are the cluster's; databases on it may run this at once (isolated copies, CI packs), so each statement is retried
-- on "tuple concurrently updated" and a role already made (another run, CS-W1 for xr_case_lookup) counts as done. The reader
-- holds the migration role's rights by membership on a superuser cluster, and those rights themselves for a non-superuser
-- migration role (owner-only helpers such as money_take_number keep their access lists).
-- PF-8b F4 (RDS): the migration role may be a non-superuser with CREATEROLE (Amazon RDS's admin is rds_superuser, not
-- SUPERUSER), and PostgreSQL 16+ refuses any SUPERUSER or REPLICATION clause from it, and a BYPASSRLS clause unless it
-- holds BYPASSRLS. So each role is created with only the attributes it needs (the rest are PostgreSQL's NO defaults),
-- ALTER then names only an attribute that differs from the target, and the end state is checked: every role NOSUPERUSER
-- NOCREATEDB NOCREATEROLE NOREPLICATION, xr_app LOGIN INHERIT NOBYPASSRLS, only xr_staff_bypass and xr_wall_reader
-- BYPASSRLS. A target the migration role cannot reach stops the migration naming the role, never a weaker wall.
DO $$
DECLARE s text; n int; r record; want record; fix text; held text; su boolean := (SELECT rolsuper FROM pg_roles WHERE rolname = current_user);
BEGIN
  -- PF-8b F5 (RDS 18.3): the reader and the migration role are members of each other in one direction only. A
  -- non-superuser migration role must be a member of the reader (below), so a reader left over (another run, a manual
  -- step) that already reaches the migration role through pg_auth_members would make a membership loop (0LP01). Such a
  -- reader is dropped and made afresh when it holds nothing anywhere on the cluster; otherwise the migration stops naming it.
  IF NOT su AND EXISTS (WITH RECURSIVE up(oid) AS (
                          SELECT m.roleid FROM pg_auth_members m WHERE m.member = (SELECT oid FROM pg_roles WHERE rolname = 'xr_wall_reader')
                          UNION SELECT m.roleid FROM pg_auth_members m JOIN up ON m.member = up.oid)
                        SELECT 1 FROM up JOIN pg_roles g ON g.oid = up.oid WHERE g.rolname = current_user) THEN
    BEGIN EXECUTE 'DROP ROLE xr_wall_reader';
    EXCEPTION WHEN insufficient_privilege OR dependent_objects_still_exist THEN
      GET STACKED DIAGNOSTICS held = PG_EXCEPTION_DETAIL;   -- what holds the reader (break m2)
      RAISE EXCEPTION 'PF-12 stopped: role xr_wall_reader is a member of role % and cannot be made afresh (%; %)', current_user, SQLERRM, coalesce(nullif(held, ''), 'no detail')
        USING ERRCODE = 'insufficient_privilege', HINT = format('A role with ADMIN OPTION on %I (a superuser, or on RDS the admin that made the grant) runs REVOKE %I FROM xr_wall_reader once; the reader must not hold the migration role.', current_user, current_user);
    END;
  END IF;
  FOR want IN SELECT * FROM (VALUES
      ('xr_data', false, false), ('xr_app', true, false), ('xr_staff_bypass', false, true),
      ('xr_wall_reader', false, true), ('xr_case_lookup', false, false)) AS w(name, login, bypass) LOOP
    s := format('CREATE ROLE %I %s%s', want.name, CASE WHEN want.login THEN 'LOGIN' ELSE 'NOLOGIN' END, CASE WHEN want.bypass THEN ' BYPASSRLS' ELSE '' END);
    n := 0; LOOP
      BEGIN EXECUTE s; EXIT;
      EXCEPTION WHEN duplicate_object THEN EXIT;
        WHEN internal_error OR unique_violation THEN n := n + 1; IF n > 200 THEN RAISE; END IF; PERFORM pg_sleep(0.02 + random() * 0.1);
        WHEN insufficient_privilege THEN RAISE EXCEPTION 'PF-12 stopped: % cannot create role % (%)', current_user, want.name, SQLERRM
          USING ERRCODE = 'insufficient_privilege', HINT = 'Run migrations as a role with CREATEROLE, and BYPASSRLS for the two wall roles (on Amazon RDS: the instance''s admin user).';
      END; END LOOP;
    SELECT * INTO r FROM pg_roles WHERE rolname = want.name;
    fix := concat_ws(' ',
      CASE WHEN r.rolsuper THEN 'NOSUPERUSER' END, CASE WHEN r.rolreplication THEN 'NOREPLICATION' END,
      CASE WHEN r.rolcreatedb THEN 'NOCREATEDB' END, CASE WHEN r.rolcreaterole THEN 'NOCREATEROLE' END,
      CASE WHEN r.rolcanlogin <> want.login THEN CASE WHEN want.login THEN 'LOGIN' ELSE 'NOLOGIN' END END,
      CASE WHEN r.rolbypassrls <> want.bypass THEN CASE WHEN want.bypass THEN 'BYPASSRLS' ELSE 'NOBYPASSRLS' END END,
      CASE WHEN want.name = 'xr_app' AND NOT r.rolinherit THEN 'INHERIT' END);
    IF fix <> '' THEN
      n := 0; LOOP
        BEGIN EXECUTE format('ALTER ROLE %I %s', want.name, fix); EXIT;
        EXCEPTION WHEN internal_error OR unique_violation THEN n := n + 1; IF n > 200 THEN RAISE; END IF; PERFORM pg_sleep(0.02 + random() * 0.1);
          WHEN insufficient_privilege THEN RAISE EXCEPTION 'PF-12 stopped: % cannot set % on role % (%)', current_user, fix, want.name, SQLERRM
            USING ERRCODE = 'insufficient_privilege', HINT = 'A superuser sets these once; the walls are never weakened to go on.';
        END; END LOOP;
    END IF;
    SELECT * INTO r FROM pg_roles WHERE rolname = want.name;
    IF r.rolsuper OR r.rolreplication OR r.rolcreatedb OR r.rolcreaterole OR r.rolcanlogin <> want.login OR r.rolbypassrls <> want.bypass
       OR (want.name = 'xr_app' AND NOT r.rolinherit) THEN
      RAISE EXCEPTION 'PF-12 stopped: role % does not have its required attributes', want.name USING ERRCODE = 'insufficient_privilege';
    END IF;
  END LOOP;
  -- xr_app's terse error logs (set once; left alone when already set). log_error_verbosity is a superuser setting: a
  -- migration role that may not set it (RDS) goes on only when the server already logs tersely for everyone (the estate's
  -- parameter group sets log_error_verbosity=terse, deploy/cdk/lib/estate.ts); otherwise it stops.
  IF NOT EXISTS (SELECT 1 FROM pg_db_role_setting d JOIN pg_roles a ON a.oid = d.setrole
                 WHERE a.rolname = 'xr_app' AND d.setdatabase = 0 AND 'log_error_verbosity=terse' = ANY (d.setconfig)) THEN
    n := 0; LOOP
    BEGIN EXECUTE 'ALTER ROLE xr_app SET log_error_verbosity = ''terse'''; EXIT;
    EXCEPTION WHEN internal_error OR unique_violation THEN n := n + 1; IF n > 200 THEN RAISE; END IF; PERFORM pg_sleep(0.02 + random() * 0.1);
      WHEN insufficient_privilege THEN
      -- the value xr_app gets: the server's (or this database's), never one set on the migration role alone
      IF (SELECT reset_val FROM pg_settings WHERE name = 'log_error_verbosity') <> 'terse'
         OR EXISTS (SELECT 1 FROM pg_db_role_setting d WHERE d.setrole = (SELECT oid FROM pg_roles WHERE rolname = current_user)
                    AND EXISTS (SELECT 1 FROM unnest(d.setconfig) c WHERE c LIKE 'log_error_verbosity=%')) THEN
        RAISE EXCEPTION 'PF-12 stopped: % may not set log_error_verbosity for xr_app, and the server does not log tersely', current_user
          USING ERRCODE = 'insufficient_privilege', HINT = 'Set log_error_verbosity = terse in the server''s configuration (the RDS parameter group), or run this as a superuser.';
      END IF;
      EXIT;
    END; END LOOP;
  END IF;
  -- On a superuser cluster the reader holds the migration role's rights by membership. A non-superuser migration role
  -- never makes that grant (PF-8b F5: vanilla PostgreSQL 16+ refuses it, RDS 18.3 accepts it and the grant to the
  -- migration role below would then loop), so the reader gets the part of the owner's rights its functions use
  -- instead, now and (default privileges) for every later object: EXECUTE on the functions, and SELECT, INSERT, UPDATE,
  -- DELETE on every table and USAGE, SELECT on sequences in public. Not xr_data's rights alone: later migrations take
  -- rights away from xr_data on tables reader functions write (pf15's limit tables). Never ownership (no ALTER, DROP,
  -- TRUNCATE). The reader logs in to nothing and nobody may become it: it acts only inside its own definer functions.
  FOREACH s IN ARRAY ARRAY[
    'GRANT xr_data TO xr_app WITH INHERIT TRUE, SET FALSE', 'GRANT xr_data TO xr_staff_bypass WITH INHERIT TRUE, SET FALSE',
    'GRANT xr_data TO xr_wall_reader WITH INHERIT TRUE, SET FALSE', format('GRANT %I TO xr_wall_reader WITH INHERIT TRUE, SET FALSE', current_user),
    'GRANT xr_staff_bypass TO xr_app WITH INHERIT FALSE, SET TRUE'] LOOP
    n := 0; LOOP
      BEGIN
        -- PF-8b F5: the reader joins the migration role only where the migration role needs no membership in the reader
        -- (a superuser) and is in no way a member of it already (pg_auth_members); a non-superuser (RDS 18.3 accepts this
        -- grant from its admin) takes the rights instead, so the grant below the loop never goes the other way too.
        IF s = format('GRANT %I TO xr_wall_reader WITH INHERIT TRUE, SET FALSE', current_user)
           AND (NOT su OR EXISTS (WITH RECURSIVE up(oid) AS (
                                    SELECT m.roleid FROM pg_auth_members m WHERE m.member = (SELECT oid FROM pg_roles WHERE rolname = current_user)
                                    UNION SELECT m.roleid FROM pg_auth_members m JOIN up ON m.member = up.oid)
                                  SELECT 1 FROM up JOIN pg_roles g ON g.oid = up.oid WHERE g.rolname = 'xr_wall_reader')) THEN
          RAISE insufficient_privilege USING MESSAGE = 'PF-12: the reader takes the migration role''s rights, not its membership';
        END IF;
        EXECUTE s; EXIT;
      EXCEPTION WHEN duplicate_object THEN EXIT;
        WHEN internal_error OR unique_violation THEN n := n + 1; IF n > 200 THEN RAISE; END IF; PERFORM pg_sleep(0.02 + random() * 0.1);
        WHEN insufficient_privilege THEN
          IF s <> format('GRANT %I TO xr_wall_reader WITH INHERIT TRUE, SET FALSE', current_user) THEN RAISE; END IF;
          EXECUTE 'GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO xr_wall_reader';
          EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO xr_wall_reader';
          EXECUTE 'GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO xr_wall_reader';
          EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO xr_wall_reader', current_user);
          EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO xr_wall_reader', current_user);
          EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO xr_wall_reader', current_user);
          EXIT;
      END; END LOOP;
  END LOOP;
  -- ALTER FUNCTION … OWNER TO xr_wall_reader (below) needs the migration role to be able to SET ROLE to it, and later
  -- migrations that replace a reader-owned function need it to count as that owner: a superuser does both; a non-superuser
  -- that created the reader holds ADMIN OPTION but no membership (PostgreSQL 16+), so it grants itself membership. The
  -- migration role is the database's admin already; role attributes (BYPASSRLS) are never inherited.
  -- PF-8b F5: never while the reader reaches the migration role (pg_auth_members): that grant would make a loop.
  IF NOT (pg_has_role(current_user, 'xr_wall_reader', 'SET') AND pg_has_role(current_user, 'xr_wall_reader', 'USAGE')) THEN
    IF EXISTS (WITH RECURSIVE up(oid) AS (
                 SELECT m.roleid FROM pg_auth_members m WHERE m.member = (SELECT oid FROM pg_roles WHERE rolname = 'xr_wall_reader')
                 UNION SELECT m.roleid FROM pg_auth_members m JOIN up ON m.member = up.oid)
               SELECT 1 FROM up JOIN pg_roles g ON g.oid = up.oid WHERE g.rolname = current_user) THEN
      RAISE EXCEPTION 'PF-12 stopped: role xr_wall_reader is a member of role %, which must be a member of the reader', current_user
        USING ERRCODE = 'insufficient_privilege', HINT = format('A role with ADMIN OPTION on %I (a superuser, or on RDS the admin that made the grant) runs REVOKE %I FROM xr_wall_reader once.', current_user, current_user);
    END IF;
    EXECUTE format('GRANT xr_wall_reader TO %I WITH INHERIT TRUE, SET TRUE', current_user);
  END IF;
  -- …and the new owner to hold CREATE on the function's schema (a superuser skips that check). For a non-superuser
  -- migration role only, the reader holds CREATE on public while the migrations hand it its functions;
  -- 20261121230000_pf8b_f4_reader_create takes it back after the last of them.
  IF NOT (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) AND NOT has_schema_privilege('xr_wall_reader', 'public', 'CREATE') THEN
    EXECUTE 'GRANT CREATE ON SCHEMA public TO xr_wall_reader';
  END IF;
  -- The memberships' end state: xr_app inherits xr_data, may SET ROLE to the bypass role without inheriting it (from any
  -- grantor), can never become the reader, and reaches no other role through any chain of memberships (its own, xr_data's
  -- or the bypass role's: a grant made outside this migration, such as a superuser role or pg_execute_server_program, stops
  -- it). 20261121230000_pf8b_f4_reader_create checks the same after every later migration.
  IF NOT pg_has_role('xr_app', 'xr_data', 'USAGE') OR NOT pg_has_role('xr_app', 'xr_staff_bypass', 'SET') OR pg_has_role('xr_app', 'xr_staff_bypass', 'USAGE')
     OR pg_has_role('xr_app', 'xr_wall_reader', 'SET') OR pg_has_role('xr_app', 'xr_wall_reader', 'USAGE')
     OR EXISTS (WITH RECURSIVE up(oid) AS (
                  SELECT m.roleid FROM pg_auth_members m WHERE m.member = (SELECT oid FROM pg_roles WHERE rolname = 'xr_app')
                  UNION SELECT m.roleid FROM pg_auth_members m JOIN up ON m.member = up.oid)
                SELECT 1 FROM up JOIN pg_roles g ON g.oid = up.oid WHERE g.rolname NOT IN ('xr_data', 'xr_staff_bypass')) THEN
    RAISE EXCEPTION 'PF-12 stopped: xr_app''s role memberships are not as required' USING ERRCODE = 'insufficient_privilege';
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO xr_data;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO xr_data;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO xr_data;   -- nextval, never setval (breaker m7)
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO xr_data;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO xr_data;

-- PF-25's address check reads every firm's addresses (a web address is public; one firm's choice must not take another's),
-- also inside a firm's own transaction, so it is one narrow definer function: the addresses taken or held by another
-- firm than `self`, and nothing else (no firm id), owned by xr_wall_reader, callable by xr_app only.
CREATE FUNCTION platform_web_address_taken(addresses text[], at timestamptz, self uuid) RETURNS SETOF text
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
  AS $fn$ SELECT w.address FROM platform_firm_web_address w WHERE w.address = ANY (addresses) AND w.firm_id IS DISTINCT FROM self
          UNION SELECT h.old_address FROM platform_firm_address_history h WHERE h.old_address = ANY (addresses) AND h.until > at AND h.firm_id IS DISTINCT FROM self $fn$;
ALTER FUNCTION platform_web_address_taken(text[], timestamptz, uuid) OWNER TO xr_wall_reader;
REVOKE ALL ON FUNCTION platform_web_address_taken(text[], timestamptz, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform_web_address_taken(text[], timestamptz, uuid) TO xr_app;

-- The session's firm: set by api/src/platform/firm-scope.ts for each query (set_config('app.firm_id', …)); none → null.
CREATE FUNCTION platform_session_firm() RETURNS uuid LANGUAGE sql STABLE PARALLEL SAFE SET search_path = pg_catalog
  AS $fn$ SELECT nullif(current_setting('app.firm_id', true), '')::uuid $fn$;

-- The firm tables (every platform_*, fo_*, money_*, msg_* and plat_complaint* table on main, except those below):
-- ENABLE + FORCE row-level security and one policy, firm_id = the session's firm, for reads and writes.
DO $walls$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'fo_arrival_receipt', 'fo_availability', 'fo_booking', 'fo_booking_token', 'fo_call', 'fo_company', 'fo_company_contact',
    'fo_conflict_check', 'fo_consultation_type', 'fo_identity_check', 'fo_lead', 'fo_lead_attribution', 'fo_note',
    'fo_person', 'fo_prospect', 'fo_reason', 'fo_retainer', 'fo_retainer_fee_row', 'fo_retainer_template',
    'fo_retainer_version', 'fo_sales_setup', 'fo_service', 'fo_stage', 'fo_stage_move', 'fo_time_off', 'fo_web_form',
    'money_credit_note', 'money_invoice', 'money_invoice_line', 'money_number_series', 'money_payment', 'money_payment_account',
    'money_payment_settings', 'money_receipt', 'money_refund', 'money_trust_entry', 'money_trust_request',
    'money_write_off', 'msg_consent', 'msg_consent_withdrawal', 'msg_consent_wording', 'msg_event', 'msg_firm',
    'msg_outbox', 'msg_send_counter', 'msg_suppression', 'plat_complaint', 'plat_complaint_event', 'platform_firm_address_history',
    'platform_firm_setting', 'platform_firm_web_address', 'platform_invitation', 'platform_role_grant', 'platform_session_revocation',
    'platform_signup_link', 'platform_staff', 'platform_staff_credential', 'platform_subscription'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY "pf12_firm" ON %I USING ("firm_id" = platform_session_firm()) WITH CHECK ("firm_id" = platform_session_firm())', t);
  END LOOP;
END
$walls$;

-- Platform-owned templates (firm_id null): any firm reads them, only the bypass role writes them.
ALTER TABLE "msg_template" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "msg_template" FORCE ROW LEVEL SECURITY;
CREATE POLICY "pf12_firm" ON "msg_template" USING ("firm_id" = platform_session_firm()) WITH CHECK ("firm_id" = platform_session_firm());
CREATE POLICY "pf12_platform_read" ON "msg_template" FOR SELECT USING ("firm_id" IS NULL AND platform_session_firm() IS NOT NULL);
ALTER TABLE "msg_template_version" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "msg_template_version" FORCE ROW LEVEL SECURITY;
CREATE POLICY "pf12_firm" ON "msg_template_version" USING ("firm_id" = platform_session_firm()) WITH CHECK ("firm_id" = platform_session_firm());
CREATE POLICY "pf12_platform_read" ON "msg_template_version" FOR SELECT USING ("firm_id" IS NULL AND platform_session_firm() IS NOT NULL);
-- A firm's own row: its id is the firm id.
ALTER TABLE "platform_firm" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "platform_firm" FORCE ROW LEVEL SECURITY;
CREATE POLICY "pf12_firm" ON "platform_firm" USING ("id" = platform_session_firm()) WITH CHECK ("id" = platform_session_firm());
-- PF-5 (merged before this migration): the terms a firm's staff accepted are the firm's; a pending sign-up has no firm
-- yet and is our own (row-level security forced, no policy: only the bypass role reaches it, as the brief sets for
-- plat_breach, plat_data_request and plat_legal_hold); platform_terms_version is our catalogue (no firm_id).
ALTER TABLE "platform_terms_acceptance" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "platform_terms_acceptance" FORCE ROW LEVEL SECURITY;
CREATE POLICY "pf12_firm" ON "platform_terms_acceptance" USING ("firm_id" = platform_session_firm()) WITH CHECK ("firm_id" = platform_session_firm());
ALTER TABLE "platform_signup_pending" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "platform_signup_pending" FORCE ROW LEVEL SECURITY;

-- Every trigger function on a firm table (65 on main) runs as xr_wall_reader, so the rules they check across tables hold
-- against xr_app as they did against the old superuser app. A later migration's trigger function on a firm table does the
-- same (tests/check_pf12_walls.ts fails otherwise).
DO $readers$
DECLARE f regprocedure;
BEGIN
  FOR f IN SELECT DISTINCT t.tgfoid::regprocedure FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
           WHERE NOT t.tgisinternal AND c.relnamespace = 'public'::regnamespace AND c.relname ~ '^(platform_|fo_|money_|msg_|auto_|plat_complaint)'
  LOOP
    EXECUTE format('ALTER FUNCTION %s SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp', f);
    EXECUTE format('ALTER FUNCTION %s OWNER TO xr_wall_reader', f);
  END LOOP;
END
$readers$;
-- A BEFORE trigger runs before the wall's WITH CHECK, and the reader's triggers see every firm, so a row naming another
-- firm would reach them and their refusal could tell its values (breaker R2-1). One gate fires first on every walled
-- table: a row that is not the session's firm is refused before any other trigger, unless the role passes the walls.
CREATE FUNCTION platform_firm_first() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $fn$
BEGIN
  IF (SELECT r.rolbypassrls OR r.rolsuper FROM pg_roles r WHERE r.rolname = current_user) THEN RETURN NEW; END IF;
  IF TG_ARGV[0] = '' OR platform_session_firm() IS NULL OR (to_jsonb(NEW) ->> TG_ARGV[0])::uuid IS DISTINCT FROM platform_session_firm() THEN   -- no firm: refused (R3-1)
    RAISE EXCEPTION 'new row violates row-level security policy for table "%"', TG_TABLE_NAME USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $fn$;
DO $gate$
DECLARE c record;
BEGIN
  FOR c IN SELECT k.relname, CASE WHEN k.relname = 'platform_firm' THEN 'id' WHEN EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = k.oid AND a.attname = 'firm_id') THEN 'firm_id' ELSE '' END AS col
           FROM pg_class k WHERE k.relnamespace = 'public'::regnamespace AND k.relforcerowsecurity AND k.relname ~ '^(platform_|fo_|money_|msg_|auto_|plat_complaint)'
  LOOP
    EXECUTE format('CREATE TRIGGER "0_pf12_firm_first" BEFORE INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION platform_firm_first(%L)', c.relname, c.col);
  END LOOP;
END
$gate$;
