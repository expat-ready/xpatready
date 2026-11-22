-- PF-5 part 3 (R1.19; qa Q9; the tech lead's ruling on #2857, comment 7067556246): the subscription stores the billing
-- period chosen at sign-up (Monthly or Yearly). Until now it lived only in the sign-up's audit line, so a trial firm's
-- choice was lost once the pending sign-up was used. Additive: one column on this area's own table, no policy change
-- (platform_subscription keeps its forced firm policy from PF-12).
ALTER TABLE "platform_subscription" ADD COLUMN "billing_period" "PlatformBillingPeriod" NOT NULL DEFAULT 'MONTHLY';

-- Backfill: a subscription made by self-serve sign-up has its period in its creation audit line
-- (platform.subscription.created, detail.period, written by firms/signup.ts since PF-5 part 1). Any other row (PF-3's Sample
-- firms, a firm made before PF-5) never chose a period: it keeps the default, MONTHLY, the sign-up's own default.
-- PF-8b F7 (Amazon RDS: the admin is neither superuser nor BYPASSRLS): every yearly subscription is marked yearly. Such a runner owns the walled tables but,
-- under FORCE ROW LEVEL SECURITY, would read and change none of their rows; it lifts FORCE on them inside this one statement
-- (ACCESS EXCLUSIVE first, so nobody sees the walls lifted) and puts it back after. A superuser or BYPASSRLS runner does
-- exactly what it did. tests/check_pf8b_f7_data_walls.ts fails when a data statement on a walled table runs without this.
DO $pf8b_f7$
DECLARE t text; lifted text[] := '{}'; walls text[] := ARRAY['platform_subscription']; gated text[] := '{}';
BEGIN
  IF NOT (SELECT pf8b_role.rolsuper OR pf8b_role.rolbypassrls FROM pg_roles pf8b_role WHERE pf8b_role.rolname = current_user) THEN
    EXECUTE (SELECT 'LOCK TABLE ' || string_agg(format('%I', pf8b_w), ', ') || ' IN ACCESS EXCLUSIVE MODE' FROM unnest(walls) pf8b_w);
    SELECT coalesce(array_agg(pf8b_c.relname::text ORDER BY pf8b_c.relname), '{}') INTO lifted FROM pg_class pf8b_c
      WHERE pf8b_c.relnamespace = 'public'::regnamespace AND pf8b_c.relname = ANY (walls) AND pf8b_c.relforcerowsecurity;
    FOREACH t IN ARRAY lifted LOOP EXECUTE format('ALTER TABLE %I NO FORCE ROW LEVEL SECURITY', t); END LOOP;
    -- …and PF-12's firm gate, which refuses a write by such a runner with no session firm and lets a superuser or
    -- BYPASSRLS one through (platform_firm_first), steps aside on them too: the runner then writes as those do.
    SELECT coalesce(array_agg(pf8b_g.tgrelid::regclass::text ORDER BY 1), '{}') INTO gated FROM pg_trigger pf8b_g
      WHERE pf8b_g.tgname = '0_pf12_firm_first' AND pf8b_g.tgenabled <> 'D' AND pf8b_g.tgrelid::regclass::text = ANY (walls);
    FOREACH t IN ARRAY gated LOOP EXECUTE format('ALTER TABLE %I DISABLE TRIGGER "0_pf12_firm_first"', t); END LOOP;
  END IF;
  UPDATE "platform_subscription" s
  SET "billing_period" = 'YEARLY'
  FROM "audit_event" a
  WHERE a."action" = 'platform.subscription.created'
    AND a."entity" = 'platform_subscription'
    AND a."entity_key" = s."id"::text
    AND a."firm_id" = s."firm_id"          -- the line is the subscription's own firm's (break m2)
    AND a."detail"->>'period' = 'YEARLY';
  FOREACH t IN ARRAY gated LOOP EXECUTE format('ALTER TABLE %I ENABLE TRIGGER "0_pf12_firm_first"', t); END LOOP;
  FOREACH t IN ARRAY lifted LOOP EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t); END LOOP;
END
$pf8b_f7$;
