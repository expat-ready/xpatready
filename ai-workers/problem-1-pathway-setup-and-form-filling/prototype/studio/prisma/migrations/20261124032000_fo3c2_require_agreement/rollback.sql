-- FO-3c part 2 rollback (not a migration: Prisma reads only migration.sql). Run in one transaction:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f prisma/migrations/20261123050000_fo3c2_require_agreement/rollback.sql
-- Drops the column: every type's stored choice is lost (each then follows its purpose's default, as before a save).
-- Then delete this folder's row from _prisma_migrations.
ALTER TABLE "fo_consultation_type" DROP COLUMN "require_agreement";
