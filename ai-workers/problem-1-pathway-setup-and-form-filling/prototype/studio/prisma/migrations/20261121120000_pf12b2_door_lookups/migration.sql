-- PF-12b part 2 (QA-499 own-firm half, QA-608; R1.4 map row 4; P-607, AG-1-45): the seven own-firm doors stop using the
-- bypass role. Each finds the one firm it serves through a narrow definer lookup below, then runs as that firm under
-- PF-12's walls (firm-scope.ts withFirm, enterFirm). Each function takes the door's key or token and returns the firm id
-- only (a boolean for the one cross-firm email check), never a row's other columns; an unknown key returns null. Owned
-- by xr_wall_reader (as PF-12's platform_web_address_taken), SECURITY DEFINER, search_path pinned with pg_temp last;
-- EXECUTE for xr_app (PUBLIC revoked), so xr_app can call them but cannot alter them; and for xr_staff_bypass, which
-- already reads every firm, so that a suite or tool process (unscoped queries run on that role, firm-scope.ts) calls the
-- same doors. Nothing is written.
-- Rollback: DROP FUNCTION platform_firm_of_key(text), platform_staff_firm(uuid, text), platform_invitation_firm(text),
-- platform_staff_email_taken(text), fo_sales_web_form_firm(text), fo_booking_token_firm(uuid, text), platform_web_address_firm(text, timestamptz);

-- platform.identity.sign-in and fo.booking.public-page: a firm key → that firm.
CREATE FUNCTION platform_firm_of_key(firm_key text) RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
  AS $fn$ SELECT f.id FROM platform_firm f WHERE f.key = $1 $fn$;
-- platform.identity.authenticate: the session's staff member (by id, or by the provider's subject) → their firm.
CREATE FUNCTION platform_staff_firm(staff uuid, subject text) RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
  AS $fn$ SELECT s.firm_id FROM platform_staff s WHERE ($1 IS NOT NULL AND s.id = $1) OR ($1 IS NULL AND $2 IS NOT NULL AND s.identity_subject = $2) LIMIT 1 $fn$;
-- platform.identity.invitation: the link's token (its SHA-256, as stored) → the invitation's firm.
CREATE FUNCTION platform_invitation_firm(token_hash text) RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
  AS $fn$ SELECT i.firm_id FROM platform_invitation i WHERE i.token_hash = $1 $fn$;
-- platform.identity.invitation, at accept: one sign-in account is one firm's staff member (PF-4b, BR-4), so the email is
-- checked across every firm. Yes or no only: never which firm.
CREATE FUNCTION platform_staff_email_taken(email text) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
  AS $fn$ SELECT EXISTS (SELECT 1 FROM platform_staff s WHERE s.email = $1) $fn$;
-- fo.sales.web-form: the form's public token → its firm.
CREATE FUNCTION fo_sales_web_form_firm(public_token text) RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
  AS $fn$ SELECT w.firm_id FROM fo_web_form w WHERE w.public_token = $1 $fn$;
-- fo.booking.self-service: the booker's link (its token row id and the SHA-256 of its secret part, as stored) → its
-- firm, only when both match: an unknown id and a wrong secret are the same null in the same one query (review m4,
-- break m1), and the link's live state (voided, expired) is then checked as the firm.
CREATE FUNCTION fo_booking_token_firm(token_id uuid, token_hash text) RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
  AS $fn$ SELECT t.firm_id FROM fo_booking_token t WHERE t.id = $1 AND t.token_hash = $2 $fn$;
-- platform.web-address.host: a host's address → the firm it serves now, else the firm whose old address it still is at
-- `at` (the newest change); the redirect and the firm's state are read as that firm (web-address/service.ts resolveHost).
CREATE FUNCTION platform_web_address_firm(address text, at timestamptz) RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
  AS $fn$ SELECT coalesce((SELECT w.firm_id FROM platform_firm_web_address w WHERE w.address = $1),
                          (SELECT h.firm_id FROM platform_firm_address_history h WHERE h.old_address = $1 AND h.until > $2 ORDER BY h.changed_at DESC LIMIT 1)) $fn$;

DO $own$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['platform_firm_of_key(text)', 'platform_staff_firm(uuid, text)', 'platform_invitation_firm(text)', 'platform_staff_email_taken(text)',
                           'fo_sales_web_form_firm(text)', 'fo_booking_token_firm(uuid, text)', 'platform_web_address_firm(text, timestamptz)'] LOOP
    EXECUTE format('ALTER FUNCTION %s OWNER TO xr_wall_reader', f);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO xr_app, xr_staff_bypass', f);
  END LOOP;
END
$own$;
