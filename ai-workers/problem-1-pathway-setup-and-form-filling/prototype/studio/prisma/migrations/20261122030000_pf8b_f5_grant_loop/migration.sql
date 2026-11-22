-- PF-8b F5 (RDS 18.3; R1.13, R1.15, R1.5, R1.24): Amazon RDS PostgreSQL 18.3 accepts PF-12's GRANT <migration role> TO
-- xr_wall_reader from its non-superuser admin (vanilla PostgreSQL 16+ refuses it), and PF-12's later GRANT xr_wall_reader
-- TO <migration role> then made a membership loop (P3018 / 0LP01 "role xr_wall_reader is a member of role xr_admin"), so
-- no migration from PF-12 on could apply there. The fix is in 20261116013000_pf12_firm_walls itself, because PF-12 is the
-- migration that fails: both grants are conditional on pg_auth_members, so they never go both ways (a non-superuser
-- migration role gives the reader its rights instead of its membership, as PF-12 already did wherever the grant was
-- refused). On a superuser cluster (CI, the demo, lane copies) PF-12 does what it did; on a database that applied it,
-- nothing runs again (prisma migrate deploy and status never re-check an applied migration).
-- This migration only writes PF-12's new checksum (the file's sha256) where a database holds an older one, as
-- 20261121230000_pf8b_f4_reader_create did, so migrate dev never asks to reset the demo or a lane copy
-- (tests/check_pf8b_f4_migrations.ts fails if the file changes without it). Down: nothing to undo.
DO $$
BEGIN
  IF to_regclass('_prisma_migrations') IS NOT NULL THEN   -- absent when the files are run without Prisma (psql -f, tests)
    UPDATE _prisma_migrations SET checksum = '81af13d2b4e2818d90b5f782fbd24cfd004fa99648ad8815adcc8d69b9c58725'
      WHERE migration_name = '20261116013000_pf12_firm_walls' AND finished_at IS NOT NULL AND checksum <> '81af13d2b4e2818d90b5f782fbd24cfd004fa99648ad8815adcc8d69b9c58725';
  END IF;
END $$;
