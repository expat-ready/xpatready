-- PF-8b F6 (Amazon RDS; R1.13, R1.15, R1.5, R1.24): RDS's admin is neither superuser nor BYPASSRLS (and is not given
-- BYPASSRLS), and 20261119170000_pf18bk_support_keys stopped there (P3018 / 42501) on its guard demanding one of the two.
-- The fix is in pf18bk itself, because no later migration can run on RDS before it: a runner that owns the four tables
-- lifts FORCE ROW LEVEL SECURITY on them inside pf18bk's one statement, so as their owner it sees every row for the
-- orphan counts and the keys' validation, and puts FORCE back before the end. Letting ADD CONSTRAINT validate alone is
-- not enough: on PostgreSQL 18 the table owner's first validation of a key reads under FORCE ROW LEVEL SECURITY and
-- misses hidden orphans (tests/check_pf8b_f6_pg18_nobypass.ts). A superuser or BYPASSRLS runner (CI, the demo, lane
-- copies) does what it did.
-- prisma migrate deploy and status never re-check an applied migration; migrate dev does. This migration only writes
-- pf18bk's new checksum (the file's sha256) where a database holds an older one, as 20261121230000_pf8b_f4_reader_create
-- and 20261122030000_pf8b_f5_grant_loop did (tests/check_pf8b_f6_pg18_nobypass.ts fails if the file changes without
-- it). Down: nothing to undo.
DO $$
BEGIN
  IF to_regclass('_prisma_migrations') IS NOT NULL THEN   -- absent when the files are run without Prisma (psql -f, tests)
    UPDATE _prisma_migrations SET checksum = 'd187adb77f12497b9139b703a0dd63c78a7902ba5a9dd7a78e043f6aab8ae540'
      WHERE migration_name = '20261119170000_pf18bk_support_keys' AND finished_at IS NOT NULL AND checksum <> 'd187adb77f12497b9139b703a0dd63c78a7902ba5a9dd7a78e043f6aab8ae540';
  END IF;
END $$;
