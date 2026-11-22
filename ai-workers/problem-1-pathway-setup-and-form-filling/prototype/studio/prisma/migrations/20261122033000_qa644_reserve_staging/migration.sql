-- QA-644 (R1.24; PF-8b breaker m5): `staging` is kept for ExpatReady's own hosts. Staging serves firm addresses under
-- staging.<domain> (PF-8b F2b), so a firm holding the address `staging` under <domain> would own the label staging is
-- served from. Same rule as api/src/platform/web-address/rules.ts RESERVED_ADDRESSES (Sample list).
-- Replacing the function does not re-check rows already stored, so a firm that holds or held `staging` (its current
-- address, or a row of the insert-only address history) stops the migration with its id instead of being left with rows
-- the rule refuses. Changing the address cannot clear it (the change writes a history row naming staging): that case needs
-- a data repair the tech lead and the founder decide (none is known: no deployed firm has used the address).
-- One DO block (one transaction, also when psql applies the file without one): the two tables are locked first (history
-- first, as the address change does; a 5 s lock timeout), so no sign-up can take staging between the check and the rule.
-- Rollback: CREATE OR REPLACE the function with the nine names of 20261114230000_pf25_web_address (nothing else changes).
DO $$
DECLARE held text;
BEGIN
  SET LOCAL lock_timeout = '5s';   -- a long open transaction fails the deploy loudly instead of queueing every sign-up behind it
  -- History first, the order WebAddresses.change takes them (service.ts), so the two never deadlock.
  LOCK TABLE "platform_firm_address_history", "platform_firm_web_address" IN SHARE ROW EXCLUSIVE MODE;
  SELECT string_agg(DISTINCT firm_id::text, ', ') INTO held FROM (
    SELECT firm_id FROM "platform_firm_web_address" WHERE "address" = 'staging'
    UNION ALL SELECT firm_id FROM "platform_firm_address_history" WHERE "old_address" = 'staging' OR "new_address" = 'staging'
  ) s;
  IF held IS NOT NULL THEN
    RAISE EXCEPTION 'QA-644: the web address staging is now kept for ExpatReady, but firm(s) % hold or held it; a data repair decided by the tech lead and the founder is needed before this migration (changing the address does not clear it)', held;
  END IF;
  EXECUTE $fn$
    CREATE OR REPLACE FUNCTION platform_web_address_allowed(a text) RETURNS boolean LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $body$
      SELECT a ~ '^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$'
         AND a NOT LIKE 'xn--%'
         AND a <> ALL (ARRAY['www', 'api', 'app', 'admin', 'mail', 'status', 'help', 'book', 'portal', 'staging'])
    $body$
  $fn$;
END
$$;
