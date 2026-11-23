-- R1.90 (PF-5's invited sign-up; P-566 "invited link kept"; PF-5 row: "the invited sign-up carries a plan and period"):
-- a private sign-up link names its plan and period, and the pending sign-up it starts names the link, so Confirm marks
-- the link used with its firm in the transaction that makes the firm. Columns added only; nothing existing changes.
-- The link's single use stays PF-3's trigger (platform_signup_link_used_once) and check (used with its firm).
-- Rollback: rollback.sql in this folder (Prisma reads only migration.sql).
ALTER TABLE "platform_signup_link"
  ADD COLUMN "plan_code" TEXT NOT NULL DEFAULT 'team',
  ADD COLUMN "billing_period" "PlatformBillingPeriod" NOT NULL DEFAULT 'MONTHLY';

ALTER TABLE "platform_signup_pending" ADD COLUMN "signup_link_id" UUID;
ALTER TABLE "platform_signup_pending" ADD CONSTRAINT "platform_signup_pending_signup_link_id_fkey" FOREIGN KEY ("signup_link_id") REFERENCES "platform_signup_link"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "platform_signup_pending_signup_link_id_idx" ON "platform_signup_pending"("signup_link_id");
