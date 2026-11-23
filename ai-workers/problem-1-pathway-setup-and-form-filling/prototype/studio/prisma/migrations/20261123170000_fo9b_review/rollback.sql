-- FO-9b part 2 rollback (not a migration: Prisma reads only migration.sql). Run in one transaction, after the code is
-- rolled back: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f prisma/migrations/20261123170000_fo9b_review/rollback.sql
-- The review pairs are dropped with their table: keep a copy first if any exist.
DROP POLICY "pf12_firm" ON "fo_dup_review";
DROP TABLE "fo_dup_review";
DROP FUNCTION fo_dup_review_no_delete();
DROP TYPE "FoDupReviewStatus";
