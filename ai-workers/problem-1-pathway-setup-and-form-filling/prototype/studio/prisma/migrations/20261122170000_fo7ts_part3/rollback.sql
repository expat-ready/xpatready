-- FO-7ts part 3 rollback (not a migration: Prisma reads only migration.sql). Run from the studio folder, in one
-- transaction, before any part 3 fact exists that must be kept (it refuses otherwise; Taxable on an issued invoice is
-- what issuing chose with no party treatment, so it may go):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f prisma/migrations/20261122170000_fo7ts_part3/rollback.sql
-- Restores money_trust_entry_write exactly as FO-7ts part 2 left it, money_invoice_write exactly as FO-7ts part 1
-- left it, and money_credit_note_write, money_move_batch_owed_back and money_move_line_write exactly as FO-7lk left them (each read from its own migration's text, PF-12's reader settings set again), and drops the rest. Then
-- delete this folder's row from _prisma_migrations.
DO $$
DECLARE t text; lifted text[] := '{}'; walls text[] := ARRAY['money_trust_entry', 'money_party_tax_treatment', 'money_invoice']; gated text[] := '{}';
BEGIN
  -- PF-8b F7: a runner that is neither superuser nor BYPASSRLS owns these walled tables but, under FORCE ROW LEVEL
  -- SECURITY, would read none of their rows; it lifts FORCE inside this statement (ACCESS EXCLUSIVE first) and puts it back
  -- below. tests/check_pf8b_f7_data_walls.ts fails when a data statement on a walled table runs without this.
  IF NOT (SELECT pf8b_role.rolsuper OR pf8b_role.rolbypassrls FROM pg_roles pf8b_role WHERE pf8b_role.rolname = current_user) THEN
    EXECUTE (SELECT 'LOCK TABLE ' || string_agg(format('%I', pf8b_w), ', ') || ' IN ACCESS EXCLUSIVE MODE' FROM unnest(walls) pf8b_w);
    SELECT coalesce(array_agg(pf8b_c.relname::text ORDER BY pf8b_c.relname), '{}') INTO lifted FROM pg_class pf8b_c
      WHERE pf8b_c.relnamespace = 'public'::regnamespace AND pf8b_c.relname = ANY (walls) AND pf8b_c.relforcerowsecurity;
    FOREACH t IN ARRAY lifted LOOP EXECUTE format('ALTER TABLE %I NO FORCE ROW LEVEL SECURITY', t); END LOOP;
    -- …and PF-12's firm gate, which refuses a write by such a runner with no session firm and lets a superuser or
    -- BYPASSRLS one through (platform_firm_first), steps aside on them too while plainly enabled (an ALWAYS gate stays and
    -- refuses loudly; a REPLICA one does not fire): the runner then writes as those do, and each comes back as it was.
    SELECT coalesce(array_agg(pf8b_g.tgrelid::regclass::text ORDER BY 1), '{}') INTO gated FROM pg_trigger pf8b_g
      WHERE pf8b_g.tgname = '0_pf12_firm_first' AND pf8b_g.tgenabled = 'O' AND pf8b_g.tgrelid::regclass::text = ANY (walls);
    FOREACH t IN ARRAY gated LOOP EXECUTE format('ALTER TABLE %I DISABLE TRIGGER "0_pf12_firm_first"', t); END LOOP;
  END IF;
  IF EXISTS (SELECT 1 FROM "money_trust_entry" WHERE "picked_other_funds_by" IS NOT NULL OR "refund_method" IS NOT NULL) THEN
    RAISE EXCEPTION 'FO-7ts part 3 rollback: picks or trust refunds with their details are recorded; they cannot be rolled back silently';
  END IF;
  IF EXISTS (SELECT 1 FROM "money_party_tax_treatment") OR EXISTS (SELECT 1 FROM "money_invoice" WHERE "tax_treatment" IS NOT NULL AND ("tax_treatment" <> 'TAXABLE' OR "issued_at" IS NULL)) THEN
    RAISE EXCEPTION 'FO-7ts part 3 rollback: tax treatments are recorded; they cannot be rolled back silently';
  END IF;
  FOREACH t IN ARRAY gated LOOP EXECUTE format('ALTER TABLE %I ENABLE TRIGGER "0_pf12_firm_first"', t); END LOOP;
  FOREACH t IN ARRAY lifted LOOP EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t); END LOOP;   -- PF-8b F7: the walls back
END $$;
\set tew `sed -n '/^CREATE OR REPLACE FUNCTION money_trust_entry_write()/,/^END \$\$;/p' prisma/migrations/20261119080000_fo7ts_ledgers/migration.sql`
\set iw `sed -n '/^CREATE OR REPLACE FUNCTION money_invoice_write()/,/^END \$\$;/p' prisma/migrations/20261118200000_fo7ts_money_settings/migration.sql`
\set cnw `sed -n '/^CREATE OR REPLACE FUNCTION money_credit_note_write()/,/^END \$\$;/p' prisma/migrations/20261118210000_fo7lk_trust_lock/migration.sql`
\set mbob `sed -n '/^CREATE OR REPLACE FUNCTION money_move_batch_owed_back()/,/^END \$\$;/p' prisma/migrations/20261118210000_fo7lk_trust_lock/migration.sql`
\set mlw `sed -n '/^CREATE OR REPLACE FUNCTION money_move_line_write()/,/^END \$\$;/p' prisma/migrations/20261118210000_fo7lk_trust_lock/migration.sql`
:tew
:iw
:cnw
:mbob
:mlw
DO $restored$
BEGIN  -- run from another folder, sed reads nothing: refuse (the transaction undoes everything) rather than drop columns in use
  IF (SELECT prosrc FROM pg_proc WHERE proname = 'money_trust_entry_write') LIKE '%picked_other_funds%'
     OR (SELECT prosrc FROM pg_proc WHERE proname = 'money_invoice_write') LIKE '%tax_treatment%'
     OR (SELECT prosrc FROM pg_proc WHERE proname IN ('money_credit_note_write')) LIKE '%inv_party%'
     OR (SELECT prosrc FROM pg_proc WHERE proname IN ('money_move_batch_owed_back')) LIKE '%FOR p IN SELECT DISTINCT%'
     OR (SELECT prosrc FROM pg_proc WHERE proname IN ('money_move_line_write')) LIKE '%inv_party%' THEN
    RAISE EXCEPTION 'FO-7ts part 3 rollback: the earlier function texts were not read; run it from the studio folder';
  END IF;
END $restored$;
-- PF-8b F4 (RDS): hand a function to xr_wall_reader only while it holds CREATE on public; taken back after
-- (a no-op pair on a superuser cluster; tests/check_pf8b_f4_migrations.ts; review R6-1).
GRANT CREATE ON SCHEMA public TO xr_wall_reader;
DO $readers$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['money_trust_entry_write()', 'money_invoice_write()', 'money_credit_note_write()', 'money_move_batch_owed_back()', 'money_move_line_write()'] LOOP
    EXECUTE format('ALTER FUNCTION %s SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp', f);
    EXECUTE format('ALTER FUNCTION %s OWNER TO xr_wall_reader', f);
  END LOOP;
END
$readers$;
REVOKE CREATE ON SCHEMA public FROM xr_wall_reader;
ALTER TABLE "money_trust_entry" DROP CONSTRAINT "money_trust_entry_refund_check", DROP CONSTRAINT "money_trust_entry_pick_check",
  DROP COLUMN "payee_company_id", DROP COLUMN "payee_name", DROP COLUMN "payee_person_id", DROP COLUMN "payee_reason",
  DROP COLUMN "picked_other_funds_at", DROP COLUMN "picked_other_funds_by", DROP COLUMN "picked_other_funds_reason",
  DROP COLUMN "refund_method", DROP COLUMN "refund_reference", DROP COLUMN "refunded_on";
DROP TABLE "money_party_tax_treatment";
DROP INDEX "money_invoice_firm_id_issued_at_id_idx";
ALTER TABLE "money_invoice" DROP COLUMN "tax_treatment";
DROP TYPE "MoneyTaxTreatment";
