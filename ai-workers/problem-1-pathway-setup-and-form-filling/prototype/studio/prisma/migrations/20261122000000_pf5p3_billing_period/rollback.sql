-- Rollback of 20261122000000_pf5p3_billing_period (PF-5 part 3). Run only with the code before PF-5 part 3: its client
-- reads and writes platform_subscription.billing_period. The period stays in each sign-up's audit line, as before.
ALTER TABLE "platform_subscription" DROP COLUMN IF EXISTS "billing_period";
DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261122000000_pf5p3_billing_period';
