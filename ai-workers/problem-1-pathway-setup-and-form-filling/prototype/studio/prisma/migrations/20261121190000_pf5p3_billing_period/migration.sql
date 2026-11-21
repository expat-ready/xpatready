-- PF-5 part 3 (R1.19; qa Q9; the tech lead's ruling on #2857, comment 7067556246): the subscription stores the billing
-- period chosen at sign-up (Monthly or Yearly). Until now it lived only in the sign-up's audit line, so a trial firm's
-- choice was lost once the pending sign-up was used. Additive: one column on this area's own table, no policy change
-- (platform_subscription keeps its forced firm policy from PF-12).
ALTER TABLE "platform_subscription" ADD COLUMN "billing_period" "PlatformBillingPeriod" NOT NULL DEFAULT 'MONTHLY';

-- Backfill: a subscription made by self-serve sign-up has its period in its creation audit line
-- (platform.subscription.created, detail.period, written by firms/signup.ts since PF-5 part 1). Any other row (PF-3's Sample
-- firms, a firm made before PF-5) never chose a period: it keeps the default, MONTHLY, the sign-up's own default.
UPDATE "platform_subscription" s
SET "billing_period" = 'YEARLY'
FROM "audit_event" a
WHERE a."action" = 'platform.subscription.created'
  AND a."entity" = 'platform_subscription'
  AND a."entity_key" = s."id"::text
  AND a."detail"->>'period' = 'YEARLY';
