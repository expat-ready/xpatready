-- Rollback of 20261122010000_pf12b5_webhook_receipt_wall (not a migration: Prisma reads only migration.sql). Run in one
-- transaction: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f prisma/migrations/20261122010000_pf12b5_webhook_receipt_wall/rollback.sql
DROP TRIGGER "0_pf12_firm_first" ON "webhook_receipt";
DROP POLICY "pf12_firm" ON "webhook_receipt";
ALTER TABLE "webhook_receipt" NO FORCE ROW LEVEL SECURITY, DISABLE ROW LEVEL SECURITY;
DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261122010000_pf12b5_webhook_receipt_wall';   -- so migrate deploy applies it again (break m4)
