-- FO-10 part 2 rollback (not a migration: Prisma reads only migration.sql). Run in one transaction:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f prisma/migrations/20261121090000_fo10p2_least_recent_turns/rollback.sql
-- Roll the code back to FO-10 part 1 first: part 2's engine reads `turns`. Each round robin's least-recently-given turns
-- are lost; part 1's `last_staff_id` stays, so part 1's "next id after the cursor" carries on from it. No other data
-- changes: the rules, their owners and lists, and every lead stay as they are.
ALTER TABLE "fo_assignment_rule" DROP CONSTRAINT "fo_assignment_rule_turns_check";
ALTER TABLE "fo_assignment_rule" DROP COLUMN "turns", DROP COLUMN "turn_no";
DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261121090000_fo10p2_least_recent_turns';
