-- PF-8b F7 (Amazon RDS; R1.13, R1.15, R1.5, R1.24): every data statement a migration runs on a walled table now runs with
-- FORCE ROW LEVEL SECURITY lifted inside its own DO statement for a runner that is neither superuser nor BYPASSRLS (RDS's
-- admin, the tables' owner), who otherwise reads and changes none of their rows while the migration still succeeds
-- (breaker M1 on #3060). Ten applied migrations were edited for it; a superuser or BYPASSRLS runner (CI, the demo, lane
-- copies) does exactly what it did. prisma migrate deploy and status never re-check an applied migration; migrate dev
-- does. This migration only writes their new checksums (each file's sha256) where a database holds an older one, as
-- 20261121230000_pf8b_f4_reader_create did (tests/check_pf8b_f7_data_walls.ts fails if a file changes without it).
-- Down: nothing to undo.
DO $$
BEGIN
  IF to_regclass('_prisma_migrations') IS NOT NULL THEN   -- absent when the files are run without Prisma (psql -f, tests)
    UPDATE _prisma_migrations SET checksum = 'd4fca72d62f331685cb75bc727864f888ddbe233b32c2df389af19b6e5419d4f'
      WHERE migration_name = '20261116030000_fo7mv_move_list' AND finished_at IS NOT NULL AND checksum <> 'd4fca72d62f331685cb75bc727864f888ddbe233b32c2df389af19b6e5419d4f';
    UPDATE _prisma_migrations SET checksum = '93a57aeb5cc5724b97be3357d06c4c6461e702af631c72bfb281646032bda192'
      WHERE migration_name = '20261117030000_fo9a_duplicate_match' AND finished_at IS NOT NULL AND checksum <> '93a57aeb5cc5724b97be3357d06c4c6461e702af631c72bfb281646032bda192';
    UPDATE _prisma_migrations SET checksum = '6f8d94e2985c1346815460402971332adf5bf6c89370ecf4a91b9f62556d9f3a'
      WHERE migration_name = '20261118200000_fo7ts_money_settings' AND finished_at IS NOT NULL AND checksum <> '6f8d94e2985c1346815460402971332adf5bf6c89370ecf4a91b9f62556d9f3a';
    UPDATE _prisma_migrations SET checksum = 'fb9297b3adc960da44936e2670017eec2ab4a679676de5bbb6496b1a0296bfc5'
      WHERE migration_name = '20261118200100_fo7ts_card_terminal_trust' AND finished_at IS NOT NULL AND checksum <> 'fb9297b3adc960da44936e2670017eec2ab4a679676de5bbb6496b1a0296bfc5';
    UPDATE _prisma_migrations SET checksum = '9ffa345cf057793a8a20f9c44fbbce771b8993233ea52f6dafb3990a27b1fbc6'
      WHERE migration_name = '20261119031000_fo3a_hour_sets' AND finished_at IS NOT NULL AND checksum <> '9ffa345cf057793a8a20f9c44fbbce771b8993233ea52f6dafb3990a27b1fbc6';
    UPDATE _prisma_migrations SET checksum = '5690217af2a2bce783eead4ad8500f93d8ca82f0b7357918c04cbd71811e4b93'
      WHERE migration_name = '20261119081500_fo3a_set_name_unique' AND finished_at IS NOT NULL AND checksum <> '5690217af2a2bce783eead4ad8500f93d8ca82f0b7357918c04cbd71811e4b93';
    UPDATE _prisma_migrations SET checksum = 'e07951956d46f18f5e7386d81e794667fba77458145b801aff41ddc5c8f157cc'
      WHERE migration_name = '20261121090000_fo10p2_least_recent_turns' AND finished_at IS NOT NULL AND checksum <> 'e07951956d46f18f5e7386d81e794667fba77458145b801aff41ddc5c8f157cc';
    UPDATE _prisma_migrations SET checksum = '092d1fe12aca662c3310031028f29c0241bc6317697af6f20364adfaf5e3c1df'
      WHERE migration_name = '20261121110000_fo3a1e_firm_timings' AND finished_at IS NOT NULL AND checksum <> '092d1fe12aca662c3310031028f29c0241bc6317697af6f20364adfaf5e3c1df';
    UPDATE _prisma_migrations SET checksum = 'b56520d34b823b7a95a8d3efb8369f97cc50fb7df8d371a5dca6dabc651e9ac0'
      WHERE migration_name = '20261122000000_pf5p3_billing_period' AND finished_at IS NOT NULL AND checksum <> 'b56520d34b823b7a95a8d3efb8369f97cc50fb7df8d371a5dca6dabc651e9ac0';
    UPDATE _prisma_migrations SET checksum = 'c7694a1bb0848e2e453450e2734a6bd40eb673a15e1bcd4e625a65907eca5a24'
      WHERE migration_name = '20261122033000_qa644_reserve_staging' AND finished_at IS NOT NULL AND checksum <> 'c7694a1bb0848e2e453450e2734a6bd40eb673a15e1bcd4e625a65907eca5a24';
  END IF;
END $$;
