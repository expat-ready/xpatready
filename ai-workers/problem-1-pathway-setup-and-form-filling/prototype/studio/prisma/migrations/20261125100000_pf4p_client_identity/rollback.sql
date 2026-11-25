-- PF-4p part 1 rollback (not a migration: Prisma reads only migration.sql). Run in one transaction, after the code that
-- uses these tables (api/src/platform/client-identity) is rolled back:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f prisma/migrations/20261125100000_pf4p_client_identity/rollback.sql
-- The accounts and invitations are dropped with their tables: keep a copy first if any exist.
DROP FUNCTION platform_client_account_firm(uuid);
DROP TABLE "platform_client_invitation";
DROP TABLE "platform_client_account";
DROP TYPE "PlatClientAccountStatus";
DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261125100000_pf4p_client_identity';
