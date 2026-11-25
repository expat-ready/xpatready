-- CS-DL1 part 1 (map row 74; Build Lead C's ruling on #2000 after Build Lead A's, owner of the walls): a case request runs
-- with no platform firm (PF-12), so the case's stage view reads its own firm's calendar through one narrow definer
-- function: the firm's time zone, business hours and closed days (the three registered settings, as stored; an unset one
-- is null and the app reads its default), found by the case's firm key; an unknown key returns no row. Nothing else is
-- read, nothing is written. Owned by xr_wall_reader (as PF-12's platform_web_address_taken), search_path pinned, pg_temp
-- last; EXECUTE for xr_app only. CS-W3 part 1 replaces this: case requests carry their firm.
-- Rollback: DROP FUNCTION platform_firm_calendar(text);
CREATE FUNCTION platform_firm_calendar(firm_key text) RETURNS TABLE (time_zone jsonb, business_hours jsonb, closed_days jsonb)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
  AS $fn$ SELECT (SELECT s.value FROM platform_firm_setting s WHERE s.firm_id = f.id AND s.key = 'platform.time_zone'),
                 (SELECT s.value FROM platform_firm_setting s WHERE s.firm_id = f.id AND s.key = 'platform.business_hours'),
                 (SELECT s.value FROM platform_firm_setting s WHERE s.firm_id = f.id AND s.key = 'platform.closed_days')
          FROM platform_firm f WHERE f.key = $1 $fn$;
ALTER FUNCTION platform_firm_calendar(text) OWNER TO xr_wall_reader;
REVOKE ALL ON FUNCTION platform_firm_calendar(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform_firm_calendar(text) TO xr_app;
