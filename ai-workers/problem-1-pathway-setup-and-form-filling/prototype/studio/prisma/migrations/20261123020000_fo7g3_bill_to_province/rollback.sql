-- FO-7g part 3 rollback (not a migration: Prisma reads only migration.sql). Run in one transaction:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f prisma/migrations/20261123020000_fo7g3_bill_to_province/rollback.sql
-- Drops the gate, its function and the column. Every invoice's Bill-to province is lost with it, issued invoices'
-- included (review Minor 3): the stored line tax never changes, so an issued invoice's figures stay as issued, but the
-- province its tax followed is then only in the invoice.draft_created and invoice.bill_to_changed audit lines.
-- Then delete this folder's row from _prisma_migrations.
DROP TRIGGER money_invoice_bill_to_frozen ON "money_invoice";
DROP FUNCTION money_invoice_bill_to_frozen();
ALTER TABLE "money_invoice" DROP CONSTRAINT "money_invoice_bill_to_province_check", DROP COLUMN "bill_to_province";
