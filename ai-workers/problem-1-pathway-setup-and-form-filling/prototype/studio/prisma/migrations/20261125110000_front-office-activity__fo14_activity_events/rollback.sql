-- FO-14 part A rollback (not a migration: Prisma reads only migration.sql). Run in one transaction, after the code that
-- records or reads these events is rolled back:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f prisma/migrations/20261125110000_front-office-activity__fo14_activity_events/rollback.sql
-- The events are dropped with their table: keep a copy first if any exist.
DROP TABLE "fo_portal_activity_event";
DROP FUNCTION fo_activity_person_ok(), fo_activity_kept();
DROP TYPE "FoPortalActivityKind";
DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261125110000_front-office-activity__fo14_activity_events';
