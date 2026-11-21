-- QA-644 (R1.24; PF-8b breaker m5): `staging` is kept for ExpatReady's own hosts. Staging serves firm addresses under
-- staging.<domain> (PF-8b F2b), so a firm holding the address `staging` under <domain> would own the label staging is
-- served from. Same rule as api/src/platform/web-address/rules.ts RESERVED_ADDRESSES (Sample list).
-- Replacing the function does not re-check rows already stored, so a firm that already holds `staging` (now or as an old
-- address) stops the migration with its name instead of being left with an address the rule refuses.
DO $$
DECLARE held text;
BEGIN
  SELECT string_agg(DISTINCT firm_id::text, ', ') INTO held FROM (
    SELECT firm_id FROM "platform_firm_web_address" WHERE "address" = 'staging'
    UNION ALL SELECT firm_id FROM "platform_firm_address_history" WHERE "old_address" = 'staging' OR "new_address" = 'staging'
  ) s;
  IF held IS NOT NULL THEN
    RAISE EXCEPTION 'QA-644: the web address staging is now kept for ExpatReady, but firm(s) % hold or held it; change their address first', held;
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION platform_web_address_allowed(a text) RETURNS boolean LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT a ~ '^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$'
     AND a NOT LIKE 'xn--%'
     AND a <> ALL (ARRAY['www', 'api', 'app', 'admin', 'mail', 'status', 'help', 'book', 'portal', 'staging'])
$$;
