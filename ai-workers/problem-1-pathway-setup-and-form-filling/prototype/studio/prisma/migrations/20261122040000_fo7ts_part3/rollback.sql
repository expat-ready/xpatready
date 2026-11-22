-- FO-7ts part 3 rollback (not a migration: Prisma reads only migration.sql). Run from the studio folder, in one
-- transaction, before any part 3 fact exists that must be kept (it refuses otherwise; Taxable on an issued invoice is
-- what issuing chose with no party treatment, so it may go):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f prisma/migrations/20261122040000_fo7ts_part3/rollback.sql
-- Restores money_trust_entry_write exactly as FO-7ts part 2 left it, money_invoice_write exactly as FO-7ts part 1
-- left it, and money_credit_note_write, money_move_batch_owed_back and money_move_line_write exactly as FO-7lk left them (each read from its own migration's text, PF-12's reader settings set again), and drops the rest. Then
-- delete this folder's row from _prisma_migrations.
DO $$
BEGIN
  PERFORM set_config('row_security', 'off', true);
  IF EXISTS (SELECT 1 FROM "money_trust_entry" WHERE "picked_other_funds_by" IS NOT NULL OR "refund_method" IS NOT NULL) THEN
    RAISE EXCEPTION 'FO-7ts part 3 rollback: picks or trust refunds with their details are recorded; they cannot be rolled back silently';
  END IF;
  IF EXISTS (SELECT 1 FROM "money_party_tax_treatment") OR EXISTS (SELECT 1 FROM "money_invoice" WHERE "tax_treatment" IS NOT NULL AND ("tax_treatment" <> 'TAXABLE' OR "issued_at" IS NULL)) THEN
    RAISE EXCEPTION 'FO-7ts part 3 rollback: tax treatments are recorded; they cannot be rolled back silently';
  END IF;
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
