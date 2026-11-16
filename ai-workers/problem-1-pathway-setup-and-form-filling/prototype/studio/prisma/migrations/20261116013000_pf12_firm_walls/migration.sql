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

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'xr_data') THEN CREATE ROLE xr_data NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'xr_app') THEN CREATE ROLE xr_app LOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'xr_staff_bypass') THEN CREATE ROLE xr_staff_bypass NOLOGIN BYPASSRLS; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'xr_wall_reader') THEN CREATE ROLE xr_wall_reader NOLOGIN BYPASSRLS; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'xr_case_lookup') THEN CREATE ROLE xr_case_lookup NOLOGIN; END IF;
END
$$;
-- The attributes are set again every time, so a role that existed with others is brought back to these.
ALTER ROLE xr_data NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
ALTER ROLE xr_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS INHERIT;
ALTER ROLE xr_staff_bypass NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION BYPASSRLS;
ALTER ROLE xr_wall_reader NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION BYPASSRLS;
ALTER ROLE xr_case_lookup NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
ALTER ROLE xr_app SET log_error_verbosity = 'terse';
GRANT xr_data TO xr_app WITH INHERIT TRUE, SET FALSE;
GRANT xr_data TO xr_staff_bypass WITH INHERIT TRUE, SET FALSE;
GRANT xr_data TO xr_wall_reader WITH INHERIT TRUE, SET FALSE;
-- Trigger functions call helpers closed to PUBLIC (money_take_number): the reader may call every function; xr_app not.
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO xr_wall_reader;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO xr_wall_reader;
GRANT xr_staff_bypass TO xr_app WITH INHERIT FALSE, SET TRUE;

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
  IF TG_ARGV[0] = '' OR (to_jsonb(NEW) ->> TG_ARGV[0])::uuid IS DISTINCT FROM platform_session_firm() THEN
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
