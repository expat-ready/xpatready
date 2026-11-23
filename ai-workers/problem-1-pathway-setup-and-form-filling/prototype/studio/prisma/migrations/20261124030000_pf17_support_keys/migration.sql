-- PF-17 part 2 (R1.93; SA-10 v2.8 §10, SA10-D8; Lead 1's ruling on #3155, 23 Nov): the two keys of our team's support
-- queue, seeded into PF-4s's plat_system_role_permission. No table, no column, no function: data rows only.
--   system/support:list    "View the cross-firm support queue and tickets" (SA-10 §10): Platform Owner, Admin, Support, Auditor.
--   system/support:manage  "Reply, add an internal note, assign, change status and priority, force-close …" (SA-10 §10;
--                          part 2 uses it for the reply only): Platform Owner, Support.
-- The role mapping is Sample: SA-10 leaves it to SA-07 ("Which roles hold system/support:list and :manage stays SA-07's"),
-- and SA-07 v2.17 Appendix A has no support-queue row yet. Unconfirmed: SA10-X3 pending. The BACKLOG row's
-- `system/support:reply` is not a key (the requirement's names win, Lead 1's ruling); it stays unseeded.
-- Rollback (by hand): DELETE FROM plat_system_role_permission WHERE permission_key IN ('system/support:list', 'system/support:manage').
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
    ('platform-owner', 'system/support:list'), ('platform-admin', 'system/support:list'),
    ('platform-support', 'system/support:list'), ('platform-auditor', 'system/support:list'),
    ('platform-owner', 'system/support:manage'), ('platform-support', 'system/support:manage');
  FOREACH t IN ARRAY gated LOOP EXECUTE format('ALTER TABLE %I ENABLE TRIGGER "0_pf12_firm_first"', t); END LOOP;
  FOREACH t IN ARRAY lifted LOOP EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t); END LOOP;
END $$;
