-- PF-12 (contracts §0 rule 2, §7, §9; map row 3; AG-1-1, AG-1-3, AG-1-45; rows rev 14, rev 16.2, rev 16.34): database walls
-- between firms. Policies and roles only: no table, column, key or index changes.
--
-- Roles (cluster-wide, so each is created only when missing; isolated copies share one cluster):
--   * xr_app            LOGIN: the role the API connects as. Owns no table, not a superuser, no BYPASSRLS, cannot create
--                       roles or databases, cannot create in schema public (PostgreSQL 15+ default), so it cannot own a
--                       table, set session_replication_role (superuser-only) or disable a trigger (owner-only).
--                       log_error_verbosity = terse, so a refused row's DETAIL never repeats its values in the log.
--   * xr_data           NOLOGIN: holds the table rights (SELECT, INSERT, UPDATE, DELETE; sequences). xr_app and
--                       xr_staff_bypass inherit them. Later migrations' tables get them by default privileges.
--   * xr_staff_bypass   NOLOGIN, BYPASSRLS: our own staff's audited bypass. xr_app may SET ROLE to it (SET TRUE) but does
--                       not inherit it (INHERIT FALSE); only api/src/platform/firm-scope.ts asBypass() does, for a name on
--                       its named list, and every use writes a log line.
--   * xr_case_lookup    NOLOGIN (rev 16.34, #1872 Q10): created here when CS-W1 part 1 has not created it already; PF-12's
--                       from then on. It owns only the case side's firm-lookup definer functions (CS-W1, CS-W3) and gets
--                       no table grant here. xr_app is never a member.
--   The migration role (the role running this file, the tables' owner) is unchanged.
--
-- Walls: ENABLE + FORCE ROW LEVEL SECURITY and one policy per table, firm_id = the session's firm
-- (platform_session_firm(): current_setting('app.firm_id', true), '' read as none). With no firm set a query reads nothing
-- and writes nothing. Exceptions (no policy, row-level security stays off): platform_plan, platform_role_permission,
-- platform_setting_definition, platform_permission_key, platform_terms_version (catalogues: no firm_id). Our own
-- registers (platform_signup_pending; plat_breach, plat_data_request, plat_legal_hold once they exist): row-level
-- security forced and no policy, so only the bypass role reaches them. msg_template and msg_template_version
-- also let a firm read the platform-owned rows (firm_id null); only the bypass role writes those.
-- Every later platform_*, fo_*, money_*, msg_*, auto_* and plat_complaint* table ships its own policy in its own migration
-- (tests/check_pf12_walls.ts fails otherwise).
--
-- Down: DROP FUNCTION platform_web_address_taken(text[], timestamptz); DROP POLICY "pf12_firm" (and "pf12_platform_read") ON each table below; ALTER TABLE … NO FORCE ROW LEVEL SECURITY,
-- DISABLE ROW LEVEL SECURITY; DROP FUNCTION platform_session_firm(); REVOKE xr_data, xr_staff_bypass FROM xr_app;
-- ALTER DEFAULT PRIVILEGES … REVOKE …; DROP ROLE only after every database on the cluster has run the same.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'xr_data') THEN CREATE ROLE xr_data NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'xr_app') THEN CREATE ROLE xr_app LOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'xr_staff_bypass') THEN CREATE ROLE xr_staff_bypass NOLOGIN BYPASSRLS; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'xr_case_lookup') THEN CREATE ROLE xr_case_lookup NOLOGIN; END IF;
END
$$;
-- The attributes are set again every time, so a role that existed with others is brought back to these.
ALTER ROLE xr_data NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
ALTER ROLE xr_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS INHERIT;
ALTER ROLE xr_staff_bypass NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION BYPASSRLS;
ALTER ROLE xr_case_lookup NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
ALTER ROLE xr_app SET log_error_verbosity = 'terse';
GRANT xr_data TO xr_app WITH INHERIT TRUE, SET FALSE;
GRANT xr_data TO xr_staff_bypass WITH INHERIT TRUE, SET FALSE;
GRANT xr_staff_bypass TO xr_app WITH INHERIT FALSE, SET TRUE;

GRANT USAGE ON SCHEMA public TO xr_data;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO xr_data;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO xr_data;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO xr_data;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO xr_data;

-- PF-25's address check reads every firm's addresses (a web address is public; one firm's choice must not take another's),
-- also inside a firm's own transaction, so it is one narrow definer function: addresses and their firm ids only, owned
-- by the bypass role (BYPASSRLS), callable by xr_app only.
CREATE FUNCTION platform_web_address_taken(addresses text[], at timestamptz) RETURNS TABLE (address text, firm_id uuid)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public
  AS $fn$ SELECT w.address, w.firm_id FROM platform_firm_web_address w WHERE w.address = ANY (addresses)
          UNION ALL SELECT h.old_address, h.firm_id FROM platform_firm_address_history h WHERE h.old_address = ANY (addresses) AND h.until > at $fn$;
ALTER FUNCTION platform_web_address_taken(text[], timestamptz) OWNER TO xr_staff_bypass;
REVOKE ALL ON FUNCTION platform_web_address_taken(text[], timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform_web_address_taken(text[], timestamptz) TO xr_app;

-- The session's firm: set by api/src/platform/firm-scope.ts for each query (set_config('app.firm_id', …)); none → null.
CREATE FUNCTION platform_session_firm() RETURNS uuid LANGUAGE sql STABLE PARALLEL SAFE SET search_path = pg_catalog
  AS $fn$ SELECT nullif(current_setting('app.firm_id', true), '')::uuid $fn$;

ALTER TABLE "fo_arrival_receipt" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fo_arrival_receipt" FORCE ROW LEVEL SECURITY;
CREATE POLICY "pf12_firm" ON "fo_arrival_receipt" USING ("firm_id" = platform_session_firm()) WITH CHECK ("firm_id" = platform_session_firm());
ALTER TABLE "fo_availability" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fo_availability" FORCE ROW LEVEL SECURITY;
CREATE POLICY "pf12_firm" ON "fo_availability" USING ("firm_id" = platform_session_firm()) WITH CHECK ("firm_id" = platform_session_firm());
ALTER TABLE "fo_booking" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fo_booking" FORCE ROW LEVEL SECURITY;
CREATE POLICY "pf12_firm" ON "fo_booking" USING ("firm_id" = platform_session_firm()) WITH CHECK ("firm_id" = platform_session_firm());
ALTER TABLE "fo_booking_token" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fo_booking_token" FORCE ROW LEVEL SECURITY;
CREATE POLICY "pf12_firm" ON "fo_booking_token" USING ("firm_id" = platform_session_firm()) WITH CHECK ("firm_id" = platform_session_firm());
ALTER TABLE "fo_call" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fo_call" FORCE ROW LEVEL SECURITY;
CREATE POLICY "pf12_firm" ON "fo_call" USING ("firm_id" = platform_session_firm()) WITH CHECK ("firm_id" = platform_session_firm());
ALTER TABLE "fo_company" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fo_company" FORCE ROW LEVEL SECURITY;
CREATE POLICY "pf12_firm" ON "fo_company" USING ("firm_id" = platform_session_firm()) WITH CHECK ("firm_id" = platform_session_firm());
ALTER TABLE "fo_company_contact" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fo_company_contact" FORCE ROW LEVEL SECURITY;
CREATE POLICY "pf12_firm" ON "fo_company_contact" USING ("firm_id" = platform_session_firm()) WITH CHECK ("firm_id" = platform_session_firm());
ALTER TABLE "fo_conflict_check" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fo_conflict_check" FORCE ROW LEVEL SECURITY;
CREATE POLICY "pf12_firm" ON "fo_conflict_check" USING ("firm_id" = platform_session_firm()) WITH CHECK ("firm_id" = platform_session_firm());
ALTER TABLE "fo_consultation_type" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fo_consultation_type" FORCE ROW LEVEL SECURITY;
CREATE POLICY "pf12_firm" ON "fo_consultation_type" USING ("firm_id" = platform_session_firm()) WITH CHECK ("firm_id" = platform_session_firm());
ALTER TABLE "fo_identity_check" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fo_identity_check" FORCE ROW LEVEL SECURITY;
CREATE POLICY "pf12_firm" ON "fo_identity_check" USING ("firm_id" = platform_session_firm()) WITH CHECK ("firm_id" = platform_session_firm());
ALTER TABLE "fo_lead" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fo_lead" FORCE ROW LEVEL SECURITY;
CREATE POLICY "pf12_firm" ON "fo_lead" USING ("firm_id" = platform_session_firm()) WITH CHECK ("firm_id" = platform_session_firm());
ALTER TABLE "fo_lead_attribution" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fo_lead_attribution" FORCE ROW LEVEL SECURITY;
CREATE POLICY "pf12_firm" ON "fo_lead_attribution" USING ("firm_id" = platform_session_firm()) WITH CHECK ("firm_id" = platform_session_firm());
ALTER TABLE "fo_note" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fo_note" FORCE ROW LEVEL SECURITY;
CREATE POLICY "pf12_firm" ON "fo_note" USING ("firm_id" = platform_session_firm()) WITH CHECK ("firm_id" = platform_session_firm());
ALTER TABLE "fo_person" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fo_person" FORCE ROW LEVEL SECURITY;
CREATE POLICY "pf12_firm" ON "fo_person" USING ("firm_id" = platform_session_firm()) WITH CHECK ("firm_id" = platform_session_firm());
ALTER TABLE "fo_prospect" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fo_prospect" FORCE ROW LEVEL SECURITY;
CREATE POLICY "pf12_firm" ON "fo_prospect" USING ("firm_id" = platform_session_firm()) WITH CHECK ("firm_id" = platform_session_firm());
ALTER TABLE "fo_reason" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fo_reason" FORCE ROW LEVEL SECURITY;
CREATE POLICY "pf12_firm" ON "fo_reason" USING ("firm_id" = platform_session_firm()) WITH CHECK ("firm_id" = platform_session_firm());
ALTER TABLE "fo_retainer" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fo_retainer" FORCE ROW LEVEL SECURITY;
CREATE POLICY "pf12_firm" ON "fo_retainer" USING ("firm_id" = platform_session_firm()) WITH CHECK ("firm_id" = platform_session_firm());
ALTER TABLE "fo_retainer_fee_row" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fo_retainer_fee_row" FORCE ROW LEVEL SECURITY;
CREATE POLICY "pf12_firm" ON "fo_retainer_fee_row" USING ("firm_id" = platform_session_firm()) WITH CHECK ("firm_id" = platform_session_firm());
ALTER TABLE "fo_retainer_template" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fo_retainer_template" FORCE ROW LEVEL SECURITY;
CREATE POLICY "pf12_firm" ON "fo_retainer_template" USING ("firm_id" = platform_session_firm()) WITH CHECK ("firm_id" = platform_session_firm());
ALTER TABLE "fo_retainer_version" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fo_retainer_version" FORCE ROW LEVEL SECURITY;
CREATE POLICY "pf12_firm" ON "fo_retainer_version" USING ("firm_id" = platform_session_firm()) WITH CHECK ("firm_id" = platform_session_firm());
ALTER TABLE "fo_sales_setup" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fo_sales_setup" FORCE ROW LEVEL SECURITY;
CREATE POLICY "pf12_firm" ON "fo_sales_setup" USING ("firm_id" = platform_session_firm()) WITH CHECK ("firm_id" = platform_session_firm());
ALTER TABLE "fo_service" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fo_service" FORCE ROW LEVEL SECURITY;
CREATE POLICY "pf12_firm" ON "fo_service" USING ("firm_id" = platform_session_firm()) WITH CHECK ("firm_id" = platform_session_firm());
ALTER TABLE "fo_stage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fo_stage" FORCE ROW LEVEL SECURITY;
CREATE POLICY "pf12_firm" ON "fo_stage" USING ("firm_id" = platform_session_firm()) WITH CHECK ("firm_id" = platform_session_firm());
ALTER TABLE "fo_stage_move" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fo_stage_move" FORCE ROW LEVEL SECURITY;
CREATE POLICY "pf12_firm" ON "fo_stage_move" USING ("firm_id" = platform_session_firm()) WITH CHECK ("firm_id" = platform_session_firm());
ALTER TABLE "fo_time_off" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fo_time_off" FORCE ROW LEVEL SECURITY;
CREATE POLICY "pf12_firm" ON "fo_time_off" USING ("firm_id" = platform_session_firm()) WITH CHECK ("firm_id" = platform_session_firm());
ALTER TABLE "fo_web_form" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fo_web_form" FORCE ROW LEVEL SECURITY;
CREATE POLICY "pf12_firm" ON "fo_web_form" USING ("firm_id" = platform_session_firm()) WITH CHECK ("firm_id" = platform_session_firm());
ALTER TABLE "money_credit_note" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "money_credit_note" FORCE ROW LEVEL SECURITY;
CREATE POLICY "pf12_firm" ON "money_credit_note" USING ("firm_id" = platform_session_firm()) WITH CHECK ("firm_id" = platform_session_firm());
ALTER TABLE "money_invoice" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "money_invoice" FORCE ROW LEVEL SECURITY;
CREATE POLICY "pf12_firm" ON "money_invoice" USING ("firm_id" = platform_session_firm()) WITH CHECK ("firm_id" = platform_session_firm());
ALTER TABLE "money_invoice_line" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "money_invoice_line" FORCE ROW LEVEL SECURITY;
CREATE POLICY "pf12_firm" ON "money_invoice_line" USING ("firm_id" = platform_session_firm()) WITH CHECK ("firm_id" = platform_session_firm());
ALTER TABLE "money_number_series" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "money_number_series" FORCE ROW LEVEL SECURITY;
CREATE POLICY "pf12_firm" ON "money_number_series" USING ("firm_id" = platform_session_firm()) WITH CHECK ("firm_id" = platform_session_firm());
ALTER TABLE "money_payment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "money_payment" FORCE ROW LEVEL SECURITY;
CREATE POLICY "pf12_firm" ON "money_payment" USING ("firm_id" = platform_session_firm()) WITH CHECK ("firm_id" = platform_session_firm());
ALTER TABLE "money_payment_account" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "money_payment_account" FORCE ROW LEVEL SECURITY;
CREATE POLICY "pf12_firm" ON "money_payment_account" USING ("firm_id" = platform_session_firm()) WITH CHECK ("firm_id" = platform_session_firm());
ALTER TABLE "money_payment_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "money_payment_settings" FORCE ROW LEVEL SECURITY;
CREATE POLICY "pf12_firm" ON "money_payment_settings" USING ("firm_id" = platform_session_firm()) WITH CHECK ("firm_id" = platform_session_firm());
ALTER TABLE "money_receipt" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "money_receipt" FORCE ROW LEVEL SECURITY;
CREATE POLICY "pf12_firm" ON "money_receipt" USING ("firm_id" = platform_session_firm()) WITH CHECK ("firm_id" = platform_session_firm());
ALTER TABLE "money_refund" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "money_refund" FORCE ROW LEVEL SECURITY;
CREATE POLICY "pf12_firm" ON "money_refund" USING ("firm_id" = platform_session_firm()) WITH CHECK ("firm_id" = platform_session_firm());
ALTER TABLE "money_trust_entry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "money_trust_entry" FORCE ROW LEVEL SECURITY;
CREATE POLICY "pf12_firm" ON "money_trust_entry" USING ("firm_id" = platform_session_firm()) WITH CHECK ("firm_id" = platform_session_firm());
ALTER TABLE "money_trust_request" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "money_trust_request" FORCE ROW LEVEL SECURITY;
CREATE POLICY "pf12_firm" ON "money_trust_request" USING ("firm_id" = platform_session_firm()) WITH CHECK ("firm_id" = platform_session_firm());
ALTER TABLE "money_write_off" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "money_write_off" FORCE ROW LEVEL SECURITY;
CREATE POLICY "pf12_firm" ON "money_write_off" USING ("firm_id" = platform_session_firm()) WITH CHECK ("firm_id" = platform_session_firm());
ALTER TABLE "msg_consent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "msg_consent" FORCE ROW LEVEL SECURITY;
CREATE POLICY "pf12_firm" ON "msg_consent" USING ("firm_id" = platform_session_firm()) WITH CHECK ("firm_id" = platform_session_firm());
ALTER TABLE "msg_consent_withdrawal" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "msg_consent_withdrawal" FORCE ROW LEVEL SECURITY;
CREATE POLICY "pf12_firm" ON "msg_consent_withdrawal" USING ("firm_id" = platform_session_firm()) WITH CHECK ("firm_id" = platform_session_firm());
ALTER TABLE "msg_consent_wording" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "msg_consent_wording" FORCE ROW LEVEL SECURITY;
CREATE POLICY "pf12_firm" ON "msg_consent_wording" USING ("firm_id" = platform_session_firm()) WITH CHECK ("firm_id" = platform_session_firm());
ALTER TABLE "msg_event" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "msg_event" FORCE ROW LEVEL SECURITY;
CREATE POLICY "pf12_firm" ON "msg_event" USING ("firm_id" = platform_session_firm()) WITH CHECK ("firm_id" = platform_session_firm());
ALTER TABLE "msg_firm" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "msg_firm" FORCE ROW LEVEL SECURITY;
CREATE POLICY "pf12_firm" ON "msg_firm" USING ("firm_id" = platform_session_firm()) WITH CHECK ("firm_id" = platform_session_firm());
ALTER TABLE "msg_outbox" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "msg_outbox" FORCE ROW LEVEL SECURITY;
CREATE POLICY "pf12_firm" ON "msg_outbox" USING ("firm_id" = platform_session_firm()) WITH CHECK ("firm_id" = platform_session_firm());
ALTER TABLE "msg_send_counter" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "msg_send_counter" FORCE ROW LEVEL SECURITY;
CREATE POLICY "pf12_firm" ON "msg_send_counter" USING ("firm_id" = platform_session_firm()) WITH CHECK ("firm_id" = platform_session_firm());
ALTER TABLE "msg_suppression" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "msg_suppression" FORCE ROW LEVEL SECURITY;
CREATE POLICY "pf12_firm" ON "msg_suppression" USING ("firm_id" = platform_session_firm()) WITH CHECK ("firm_id" = platform_session_firm());
ALTER TABLE "msg_template" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "msg_template" FORCE ROW LEVEL SECURITY;
CREATE POLICY "pf12_firm" ON "msg_template" USING ("firm_id" = platform_session_firm()) WITH CHECK ("firm_id" = platform_session_firm());
CREATE POLICY "pf12_platform_read" ON "msg_template" FOR SELECT USING ("firm_id" IS NULL AND platform_session_firm() IS NOT NULL);
ALTER TABLE "msg_template_version" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "msg_template_version" FORCE ROW LEVEL SECURITY;
CREATE POLICY "pf12_firm" ON "msg_template_version" USING ("firm_id" = platform_session_firm()) WITH CHECK ("firm_id" = platform_session_firm());
CREATE POLICY "pf12_platform_read" ON "msg_template_version" FOR SELECT USING ("firm_id" IS NULL AND platform_session_firm() IS NOT NULL);
ALTER TABLE "plat_complaint" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "plat_complaint" FORCE ROW LEVEL SECURITY;
CREATE POLICY "pf12_firm" ON "plat_complaint" USING ("firm_id" = platform_session_firm()) WITH CHECK ("firm_id" = platform_session_firm());
ALTER TABLE "plat_complaint_event" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "plat_complaint_event" FORCE ROW LEVEL SECURITY;
CREATE POLICY "pf12_firm" ON "plat_complaint_event" USING ("firm_id" = platform_session_firm()) WITH CHECK ("firm_id" = platform_session_firm());
ALTER TABLE "platform_firm" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "platform_firm" FORCE ROW LEVEL SECURITY;
CREATE POLICY "pf12_firm" ON "platform_firm" USING ("id" = platform_session_firm()) WITH CHECK ("id" = platform_session_firm());
ALTER TABLE "platform_firm_address_history" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "platform_firm_address_history" FORCE ROW LEVEL SECURITY;
CREATE POLICY "pf12_firm" ON "platform_firm_address_history" USING ("firm_id" = platform_session_firm()) WITH CHECK ("firm_id" = platform_session_firm());
ALTER TABLE "platform_firm_setting" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "platform_firm_setting" FORCE ROW LEVEL SECURITY;
CREATE POLICY "pf12_firm" ON "platform_firm_setting" USING ("firm_id" = platform_session_firm()) WITH CHECK ("firm_id" = platform_session_firm());
-- PF-5 (merged before this migration): the terms a firm's staff accepted are the firm's; a pending sign-up has no firm
-- yet and is our own (row-level security forced, no policy: only the bypass role reaches it, as the brief sets for
-- plat_breach, plat_data_request and plat_legal_hold); platform_terms_version is our catalogue (no firm_id).
ALTER TABLE "platform_terms_acceptance" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "platform_terms_acceptance" FORCE ROW LEVEL SECURITY;
CREATE POLICY "pf12_firm" ON "platform_terms_acceptance" USING ("firm_id" = platform_session_firm()) WITH CHECK ("firm_id" = platform_session_firm());
ALTER TABLE "platform_signup_pending" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "platform_signup_pending" FORCE ROW LEVEL SECURITY;
ALTER TABLE "platform_firm_web_address" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "platform_firm_web_address" FORCE ROW LEVEL SECURITY;
CREATE POLICY "pf12_firm" ON "platform_firm_web_address" USING ("firm_id" = platform_session_firm()) WITH CHECK ("firm_id" = platform_session_firm());
ALTER TABLE "platform_invitation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "platform_invitation" FORCE ROW LEVEL SECURITY;
CREATE POLICY "pf12_firm" ON "platform_invitation" USING ("firm_id" = platform_session_firm()) WITH CHECK ("firm_id" = platform_session_firm());
ALTER TABLE "platform_role_grant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "platform_role_grant" FORCE ROW LEVEL SECURITY;
CREATE POLICY "pf12_firm" ON "platform_role_grant" USING ("firm_id" = platform_session_firm()) WITH CHECK ("firm_id" = platform_session_firm());
ALTER TABLE "platform_session_revocation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "platform_session_revocation" FORCE ROW LEVEL SECURITY;
CREATE POLICY "pf12_firm" ON "platform_session_revocation" USING ("firm_id" = platform_session_firm()) WITH CHECK ("firm_id" = platform_session_firm());
ALTER TABLE "platform_signup_link" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "platform_signup_link" FORCE ROW LEVEL SECURITY;
CREATE POLICY "pf12_firm" ON "platform_signup_link" USING ("firm_id" = platform_session_firm()) WITH CHECK ("firm_id" = platform_session_firm());
ALTER TABLE "platform_staff" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "platform_staff" FORCE ROW LEVEL SECURITY;
CREATE POLICY "pf12_firm" ON "platform_staff" USING ("firm_id" = platform_session_firm()) WITH CHECK ("firm_id" = platform_session_firm());
ALTER TABLE "platform_staff_credential" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "platform_staff_credential" FORCE ROW LEVEL SECURITY;
CREATE POLICY "pf12_firm" ON "platform_staff_credential" USING ("firm_id" = platform_session_firm()) WITH CHECK ("firm_id" = platform_session_firm());
ALTER TABLE "platform_subscription" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "platform_subscription" FORCE ROW LEVEL SECURITY;
CREATE POLICY "pf12_firm" ON "platform_subscription" USING ("firm_id" = platform_session_firm()) WITH CHECK ("firm_id" = platform_session_firm());
