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
    UPDATE _prisma_migrations SET checksum = 'a6b4c4e17cb173ebaa42a9257e830d662b8ddc2231583db68418db251ea6623f'
      WHERE migration_name = '20261116030000_fo7mv_move_list' AND finished_at IS NOT NULL AND checksum <> 'a6b4c4e17cb173ebaa42a9257e830d662b8ddc2231583db68418db251ea6623f';
    UPDATE _prisma_migrations SET checksum = '09686c7eddb5797df4bcebc2fb3366f733bfa112e93644cd8aeefdc64447fd6f'
      WHERE migration_name = '20261117030000_fo9a_duplicate_match' AND finished_at IS NOT NULL AND checksum <> '09686c7eddb5797df4bcebc2fb3366f733bfa112e93644cd8aeefdc64447fd6f';
    UPDATE _prisma_migrations SET checksum = '61e13041c85c645bfa87070103d462f30b1d88c2b65d18417dfa24548146bc6b'
      WHERE migration_name = '20261118200000_fo7ts_money_settings' AND finished_at IS NOT NULL AND checksum <> '61e13041c85c645bfa87070103d462f30b1d88c2b65d18417dfa24548146bc6b';
    UPDATE _prisma_migrations SET checksum = '93f899a0d46239096981dc87518671b67e5b689cce24ed418365edf29fcc991b'
      WHERE migration_name = '20261118200100_fo7ts_card_terminal_trust' AND finished_at IS NOT NULL AND checksum <> '93f899a0d46239096981dc87518671b67e5b689cce24ed418365edf29fcc991b';
    UPDATE _prisma_migrations SET checksum = '6beb89733004052e93c59f3a8105b69d97cccc4ac9f6a18bf35de7b89e447fe6'
      WHERE migration_name = '20261119031000_fo3a_hour_sets' AND finished_at IS NOT NULL AND checksum <> '6beb89733004052e93c59f3a8105b69d97cccc4ac9f6a18bf35de7b89e447fe6';
    UPDATE _prisma_migrations SET checksum = '7f347a59aa91ab26f381014359e8c3126c4cc6bf12b2d5b5009d342285bf08f8'
      WHERE migration_name = '20261119081500_fo3a_set_name_unique' AND finished_at IS NOT NULL AND checksum <> '7f347a59aa91ab26f381014359e8c3126c4cc6bf12b2d5b5009d342285bf08f8';
    UPDATE _prisma_migrations SET checksum = '077c70a3eea7641e153bb59ac330bb3eb54a82be18b91f58ec28a5275ae46763'
      WHERE migration_name = '20261121090000_fo10p2_least_recent_turns' AND finished_at IS NOT NULL AND checksum <> '077c70a3eea7641e153bb59ac330bb3eb54a82be18b91f58ec28a5275ae46763';
    UPDATE _prisma_migrations SET checksum = '1c127a52f5b5673b24627b274196759b9360963fbfa46535d1a7b6b8c0bcb775'
      WHERE migration_name = '20261121110000_fo3a1e_firm_timings' AND finished_at IS NOT NULL AND checksum <> '1c127a52f5b5673b24627b274196759b9360963fbfa46535d1a7b6b8c0bcb775';
    UPDATE _prisma_migrations SET checksum = '798eec97f5c5e7a8d982eb436a17cdcaeb91d3079d75ce38d49b4c3a53258cfe'
      WHERE migration_name = '20261122000000_pf5p3_billing_period' AND finished_at IS NOT NULL AND checksum <> '798eec97f5c5e7a8d982eb436a17cdcaeb91d3079d75ce38d49b4c3a53258cfe';
    UPDATE _prisma_migrations SET checksum = 'fe42534af640b8313202fa5bef0eeb6ed3804ddd37bdbd7a70c477c9496a8af0'
      WHERE migration_name = '20261122033000_qa644_reserve_staging' AND finished_at IS NOT NULL AND checksum <> 'fe42534af640b8313202fa5bef0eeb6ed3804ddd37bdbd7a70c477c9496a8af0';
  END IF;
END $$;
