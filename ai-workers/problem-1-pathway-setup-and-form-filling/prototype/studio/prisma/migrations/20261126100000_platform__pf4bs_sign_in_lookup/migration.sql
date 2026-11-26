-- PF-4bs part 2a (R1.5; concept r3 §2, approved by the tech lead 24 Nov on #3214): the sign-in door takes an email and a
-- password, with no firm key. On Cognito the provider knows the person by email; the local stand-in, which mirrors it,
-- needs the same one answer: a work email → that staff member's id (one sign-in account is one firm's staff member,
-- PF-4b BR-4, checked at accept; the email is not unique in the table, so two matching rows answer null, never a
-- guess). Nothing else is returned: the firm then comes from platform_staff_firm and
-- the person is read as that firm under PF-12's walls. Owned by xr_wall_reader, SECURITY DEFINER, search_path pinned with
-- pg_temp last, EXECUTE for xr_app and xr_staff_bypass only (as PF-12b part 2's door lookups). Nothing is written.
-- Rollback: rollback.sql (DROP FUNCTION platform_staff_of_email(text)).
CREATE FUNCTION platform_staff_of_email(email text) RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
  AS $fn$ SELECT CASE WHEN count(*) = 1 THEN min(s.id::text)::uuid END FROM platform_staff s WHERE s.email = $1 $fn$;
ALTER FUNCTION platform_staff_of_email(text) OWNER TO xr_wall_reader;
REVOKE ALL ON FUNCTION platform_staff_of_email(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform_staff_of_email(text) TO xr_app, xr_staff_bypass;
