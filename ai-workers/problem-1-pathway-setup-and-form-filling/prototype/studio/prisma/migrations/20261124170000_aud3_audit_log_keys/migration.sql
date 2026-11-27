-- AUD-3 part 2 (R1.87; SA-11-31 per-firm access report, SA-11-9 its CSV export logged; BACKLOG AUD-3 (2), P-601 (1)):
-- the two keys of our side's audit reading, seeded into PF-4s's plat_system_role_permission. No table, no column, no
-- function: data rows only.
--   system/audit-log:list  read a firm's access report (and, in part 3, our audit search): Platform Owner, Auditor.
--   system/audit:export    download it as CSV (the export writes audit.exported first): Platform Owner only, so the
--                          Auditor reads but cannot export unless its role is granted this key (the row's Done when).
-- The role mapping is the BACKLOG row's ("granted to Platform Owner and the read-only Auditor role", SA-11 §10; Sample
-- role set from PF-4s); the export to the Platform Owner only follows the row's test clause. Sample: Unconfirmed against
-- SA-07 Appendix A.
-- Rollback (by hand): DELETE FROM plat_system_role_permission WHERE permission_key IN ('system/audit-log:list', 'system/audit:export').
--
-- The seed runs in one DO statement (PF-8b F7, #3068): a runner that is neither superuser nor BYPASSRLS owns this walled
-- table but, under FORCE ROW LEVEL SECURITY, would write none of its rows; it lifts FORCE inside this statement (ACCESS
-- EXCLUSIVE first) and puts it back at its end. PF-12's firm gate steps aside the same way while plainly enabled (this
-- table has none, so that step finds nothing; F7's one shape, as PF-21b part 2's seed).
DO $$
DECLARE t text; lifted text[] := '{}'; walls text[] := ARRAY['plat_system_role_permission']; gated text[] := '{}';
BEGIN
  IF NOT (SELECT pf8b_role.rolsuper OR pf8b_role.rolbypassrls FROM pg_roles pf8b_role WHERE pf8b_role.rolname = current_user) THEN
    EXECUTE (SELECT 'LOCK TABLE ' || string_agg(format('%I', pf8b_w), ', ') || ' IN ACCESS EXCLUSIVE MODE' FROM unnest(walls) pf8b_w);
    SELECT coalesce(array_agg(pf8b_c.relname::text ORDER BY pf8b_c.relname), '{}') INTO lifted FROM pg_class pf8b_c
      WHERE pf8b_c.relnamespace = 'public'::regnamespace AND pf8b_c.relname = ANY (walls) AND pf8b_c.relforcerowsecurity;
    FOREACH t IN ARRAY lifted LOOP EXECUTE format('ALTER TABLE %I NO FORCE ROW LEVEL SECURITY', t); END LOOP;
    SELECT coalesce(array_agg(pf8b_g.tgrelid::regclass::text ORDER BY 1), '{}') INTO gated FROM pg_trigger pf8b_g
      WHERE pf8b_g.tgname = '0_pf12_firm_first' AND pf8b_g.tgenabled = 'O' AND pf8b_g.tgrelid::regclass::text = ANY (walls);
    FOREACH t IN ARRAY gated LOOP EXECUTE format('ALTER TABLE %I DISABLE TRIGGER "0_pf12_firm_first"', t); END LOOP;
  END IF;
  INSERT INTO "plat_system_role_permission" ("role_code", "permission_key") VALUES
    ('platform-owner', 'system/audit-log:list'), ('platform-auditor', 'system/audit-log:list'),
    ('platform-owner', 'system/audit:export');
  FOREACH t IN ARRAY gated LOOP EXECUTE format('ALTER TABLE %I ENABLE TRIGGER "0_pf12_firm_first"', t); END LOOP;
  FOREACH t IN ARRAY lifted LOOP EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t); END LOOP;
END $$;
