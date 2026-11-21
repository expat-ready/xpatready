-- PF-5 part 3 rollback: the column goes; the period stays in each sign-up's audit line, as before.
ALTER TABLE "platform_subscription" DROP COLUMN IF EXISTS "billing_period";
