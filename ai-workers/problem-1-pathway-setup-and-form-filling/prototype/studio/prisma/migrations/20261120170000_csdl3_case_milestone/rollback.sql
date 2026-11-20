-- CS-DL3 part 1 rollback (not a migration: Prisma reads only migration.sql). Run in one transaction:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f prisma/migrations/20261120170000_csdl3_case_milestone/rollback.sql
-- Recorded government steps are lost: export case_milestone first. Waiting reminder jobs (keys case_milestone:...) then
-- find no step and tell nobody.
DROP TABLE "case_milestone";
DROP FUNCTION case_milestone_refuse_change(), case_milestone_check_insert();
DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261120170000_csdl3_case_milestone';
