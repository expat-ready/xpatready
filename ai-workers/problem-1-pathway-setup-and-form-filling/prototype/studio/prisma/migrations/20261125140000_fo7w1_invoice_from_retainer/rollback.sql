-- FO-7w1 rollback (not a migration: Prisma reads only migration.sql). Run in one transaction:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f prisma/migrations/20261125140000_fo7w1_invoice_from_retainer/rollback.sql
-- Drops the gates, the index and both columns: which lines came from which retainer row, and which invoices are
-- deposits, is then only in the invoice.draft_created audit lines. Then delete this folder's row from _prisma_migrations.
DROP TRIGGER money_invoice_line_source_fixed ON "money_invoice_line";
DROP TRIGGER money_invoice_deposit_fixed ON "money_invoice";
DROP FUNCTION money_invoice_source_fixed();
DROP INDEX "money_invoice_line_firm_id_source_fee_row_id_key";
ALTER TABLE "money_invoice_line" DROP COLUMN "source_fee_row_id";
ALTER TABLE "money_invoice" DROP COLUMN "deposit";
