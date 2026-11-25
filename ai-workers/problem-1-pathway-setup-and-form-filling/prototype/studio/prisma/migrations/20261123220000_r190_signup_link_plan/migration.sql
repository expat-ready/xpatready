-- R1.90 (PF-5's invited sign-up; P-566 "invited link kept"; PF-5 row: "the invited sign-up carries a plan and period"):
-- a private sign-up link names its plan and period, and the pending sign-up it starts names the link, so Confirm marks
-- the link used with its firm in the transaction that makes the firm. Columns added only; nothing existing changes.
-- The link's single use stays PF-3's trigger (platform_signup_link_used_once) and check (used with its firm).
-- Rollback: rollback.sql in this folder (Prisma reads only migration.sql).
ALTER TABLE "platform_signup_link"
  ADD COLUMN "plan_code" TEXT NOT NULL DEFAULT 'team',
  ADD COLUMN "billing_period" "PlatformBillingPeriod" NOT NULL DEFAULT 'MONTHLY';

ALTER TABLE "platform_signup_pending" ADD COLUMN "signup_link_id" UUID;
-- PF-8b F7 (Amazon RDS: the admin is neither superuser nor BYPASSRLS; Lead 15 on #3040, full run 45272503115): adding a
-- foreign key validates the existing rows of a walled table, so the key is added with FORCE lifted inside this one
-- statement (ACCESS EXCLUSIVE first, so nobody sees the walls lifted) and put back after, in F7's lift shape (as
-- 20261123010000_fo9b_person_merge). platform_signup_link is the referenced table and is lifted with it. A superuser or
-- BYPASSRLS runner does exactly what it did. tests/check_pf8b_f7_data_walls.ts fails when this key is added without it.
DO $pf8b_f7$
DECLARE t text; lifted text[] := '{}'; walls text[] := ARRAY['platform_signup_link', 'platform_signup_pending']; gated text[] := '{}';
BEGIN
  IF NOT (SELECT pf8b_role.rolsuper OR pf8b_role.rolbypassrls FROM pg_roles pf8b_role WHERE pf8b_role.rolname = current_user) THEN
    EXECUTE (SELECT 'LOCK TABLE ' || string_agg(format('%I', pf8b_w), ', ') || ' IN ACCESS EXCLUSIVE MODE' FROM unnest(walls) pf8b_w);
    SELECT coalesce(array_agg(pf8b_c.relname::text ORDER BY pf8b_c.relname), '{}') INTO lifted FROM pg_class pf8b_c
      WHERE pf8b_c.relnamespace = 'public'::regnamespace AND pf8b_c.relname = ANY (walls) AND pf8b_c.relforcerowsecurity;
    FOREACH t IN ARRAY lifted LOOP EXECUTE format('ALTER TABLE %I NO FORCE ROW LEVEL SECURITY', t); END LOOP;
    SELECT coalesce(array_agg(pf8b_g.tgrelid::regclass::text ORDER BY 1), '{}') INTO gated FROM pg_trigger pf8b_g
      WHERE pf8b_g.tgname = '0_pf12_firm_first' AND pf8b_g.tgenabled = 'O' AND pf8b_g.tgrelid::regclass::text = ANY (walls);
    FOREACH t IN ARRAY gated LOOP EXECUTE format('ALTER TABLE %I DISABLE TRIGGER "0_pf12_firm_first"', t); END LOOP;
  END IF;
  ALTER TABLE "platform_signup_pending" ADD CONSTRAINT "platform_signup_pending_signup_link_id_fkey" FOREIGN KEY ("signup_link_id") REFERENCES "platform_signup_link"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  FOREACH t IN ARRAY gated LOOP EXECUTE format('ALTER TABLE %I ENABLE TRIGGER "0_pf12_firm_first"', t); END LOOP;
  FOREACH t IN ARRAY lifted LOOP EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t); END LOOP;
END $pf8b_f7$;
CREATE INDEX "platform_signup_pending_signup_link_id_idx" ON "platform_signup_pending"("signup_link_id");
