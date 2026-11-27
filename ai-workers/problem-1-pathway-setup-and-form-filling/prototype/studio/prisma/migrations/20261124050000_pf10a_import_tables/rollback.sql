-- PF-10a rollback (not a migration: Prisma reads only migration.sql). Run in one transaction, after the code that uses these
-- tables (PF-10b onwards) is rolled back:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f prisma/migrations/20261124050000_pf10a_import_tables/rollback.sql
-- The batches, rows, mappings and attestations are dropped with their tables: keep a copy first if any exist.
DROP TABLE "plat_import_row";
DROP TABLE "plat_import_batch";
DROP TABLE "plat_import_mapping";
DROP TABLE "plat_import_attestation";
DROP FUNCTION pf_import_reasons_ok(jsonb), pf_import_batch_facts_kept(), pf_import_batch_born(), pf_import_kept(), pf_import_row_open(), pf_import_attestation_owner(), pf_import_attestation_kept();
DROP TYPE "PlatImportFileKind", "PlatImportBatchState", "PlatImportRowOutcome", "PlatImportRowPhase";
DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261124050000_pf10a_import_tables';
