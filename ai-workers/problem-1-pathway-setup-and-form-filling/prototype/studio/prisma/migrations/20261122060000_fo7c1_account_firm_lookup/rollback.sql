-- Rollback of 20261122060000_fo7c1_account_firm_lookup (not a migration: Prisma reads only migration.sql). Run in one
-- transaction: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f prisma/migrations/20261122060000_fo7c1_account_firm_lookup/rollback.sql
DROP FUNCTION money_firm_of_stripe_account(text);
