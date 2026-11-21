-- PF-8b F4 (RDS; R1.13, R1.15): take back the CREATE on schema public that PF-12 gives xr_wall_reader when the migration
-- role is not a superuser (Amazon RDS: rds_superuser, not SUPERUSER). PostgreSQL lets a non-superuser hand a function to
-- xr_wall_reader only while xr_wall_reader holds CREATE on its schema, and twenty migrations up to
-- 20261121120000_pf12b2_door_lookups do. After the last of them the reader needs no CREATE: it owns its functions and only
-- runs inside them. On a superuser cluster (CI, the demo, lane copies) the reader holds no CREATE grant of its own (its
-- rights come by membership in the migration role, as PF-12 has always made them) and this changes nothing.
-- A later migration that hands xr_wall_reader a function in public on RDS grants CREATE first and revokes it after, as here.
-- On a cluster upgraded from PostgreSQL 14 or older, where PUBLIC still holds CREATE on public, that grant is revoked for
-- every role on this database (xr_app must never create objects).
-- Down: nothing to undo (CREATE is only ever needed during the hand-overs above; the checksums name the files as they are).
DO $$
BEGIN
  IF has_schema_privilege('xr_wall_reader', 'public', 'CREATE') AND NOT pg_has_role('xr_wall_reader', current_user, 'USAGE') THEN
    REVOKE CREATE ON SCHEMA public FROM xr_wall_reader;
  END IF;
  -- xr_app never creates anything (PF-12): a cluster upgraded from PostgreSQL 14 or older may still give PUBLIC CREATE on
  -- public, which reaches xr_app too.
  IF has_schema_privilege('xr_app', 'public', 'CREATE') THEN REVOKE CREATE ON SCHEMA public FROM PUBLIC; END IF;
  IF has_schema_privilege('xr_app', 'public', 'CREATE') THEN
    RAISE EXCEPTION 'PF-8b F4 stopped: xr_app may create objects in schema public' USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- PF-12's membership rule once more, after every migration before this one: xr_app reaches only xr_data and the bypass
  -- role (SET only) through any chain of memberships, never a superuser role or a predefined pg_* role.
  IF pg_has_role('xr_app', 'xr_staff_bypass', 'USAGE') OR pg_has_role('xr_app', 'xr_wall_reader', 'SET')
     OR EXISTS (WITH RECURSIVE up(oid) AS (
                  SELECT m.roleid FROM pg_auth_members m WHERE m.member = (SELECT oid FROM pg_roles WHERE rolname = 'xr_app')
                  UNION SELECT m.roleid FROM pg_auth_members m JOIN up ON m.member = up.oid)
                SELECT 1 FROM up JOIN pg_roles g ON g.oid = up.oid WHERE g.rolname NOT IN ('xr_data', 'xr_staff_bypass')) THEN
    RAISE EXCEPTION 'PF-8b F4 stopped: xr_app''s role memberships are not as PF-12 requires' USING ERRCODE = 'insufficient_privilege';
  END IF;
END $$;

-- PF-8b F4 also edits two applied migrations, 20261116013000_pf12_firm_walls and 20261118090000_csw1_firm_id (their role
-- statements made RDS-safe; on a superuser cluster they do what they did). prisma migrate deploy and status never re-check
-- an applied migration, but migrate dev does and would ask to reset a database holding the old checksum. A database that
-- applied the old files gets the new checksums here, so the demo and every lane copy carry on with no manual step. The
-- values are the files' sha256 (tests/check_pf8b_f4_migrations.ts fails if a file changes without them).
DO $$
BEGIN
  IF to_regclass('_prisma_migrations') IS NOT NULL THEN   -- absent when the files are run without Prisma (psql -f, tests)
    UPDATE _prisma_migrations SET checksum = '33d69fc491e71e019fd1ae56628a74c9191e1382bf47142165af6b9e30036a16'
      WHERE migration_name = '20261116013000_pf12_firm_walls' AND finished_at IS NOT NULL AND checksum <> '33d69fc491e71e019fd1ae56628a74c9191e1382bf47142165af6b9e30036a16';
    UPDATE _prisma_migrations SET checksum = '207dd0f004fe959d3b5c25a82d0ad0d5e05eb6e4245ef1f1239a8feef35e5711'
      WHERE migration_name = '20261118090000_csw1_firm_id' AND finished_at IS NOT NULL AND checksum <> '207dd0f004fe959d3b5c25a82d0ad0d5e05eb6e4245ef1f1239a8feef35e5711';
  END IF;
END $$;
