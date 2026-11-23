-- Rollback of 20261124070000_r190_signup_link_plan (STANDARDS §5; Prisma reads only migration.sql). Drops only what the
-- migration added. Run it only with R1.90's code rolled back too: the invited routes and Confirm read these columns.
DROP INDEX IF EXISTS "platform_signup_pending_signup_link_id_idx";
ALTER TABLE "platform_signup_pending" DROP CONSTRAINT IF EXISTS "platform_signup_pending_signup_link_id_fkey";
ALTER TABLE "platform_signup_pending" DROP COLUMN IF EXISTS "signup_link_id";
ALTER TABLE "platform_signup_link" DROP COLUMN IF EXISTS "billing_period", DROP COLUMN IF EXISTS "plan_code";
