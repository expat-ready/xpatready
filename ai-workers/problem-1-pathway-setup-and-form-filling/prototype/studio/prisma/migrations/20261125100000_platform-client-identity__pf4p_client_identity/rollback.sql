-- PF-4p part 1 rollback (not a migration). In one transaction, after the code using these tables is rolled back:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f prisma/migrations/20261125100000_platform-client-identity__pf4p_client_identity/rollback.sql
-- The accounts and invitations are dropped with their tables: keep a copy first if any exist.
DROP FUNCTION platform_client_account_firm(uuid);
DROP TABLE "platform_client_invitation";
DROP TABLE "platform_client_account";
DROP FUNCTION pf4p_client_person_ok();
DROP FUNCTION pf4p_client_account_kept();
DROP TYPE "PlatClientAccountStatus";
DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261125100000_platform-client-identity__pf4p_client_identity';
