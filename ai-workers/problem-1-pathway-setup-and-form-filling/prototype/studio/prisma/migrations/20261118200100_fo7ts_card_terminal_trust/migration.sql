-- FO-7ts part 1, step 2 (tech lead Lead 80 on #2106, 18 Nov, accepting the brief's proposal; Lead B's #2016 Q2 ruling
-- "card terminal is Operating only"; P-567 (3) "card only for invoiced fees into the operating account", legal reading
-- Unconfirmed: no counsel): a card terminal payment is never received into trust, at the database as well as at FO-7b's
-- route (defence in depth). FO-7a's money_payment_card_not_trust is widened from CARD to CARD and CARD_TERMINAL.
-- A step of its own: CARD_TERMINAL was added by the step before (20261118200000_fo7ts_money_settings), and a new enum
-- value is usable only after the transaction that added it commits.
-- Rollback: put back FO-7a's check, CHECK ("method" <> 'CARD' OR "received_into" = 'OPERATING'), and delete this
--   folder's row from _prisma_migrations.

-- A card terminal payment already recorded into trust stops the migration (none can exist outside a test database:
-- no route records CARD_TERMINAL yet).
DO $$
DECLARE p uuid; t text; lifted text[] := '{}'; walls text[] := ARRAY['money_payment']; gated text[] := '{}';
BEGIN
  -- PF-8b F7: a runner that is neither superuser nor BYPASSRLS owns these walled tables but, under FORCE ROW LEVEL
  -- SECURITY, would read none of their rows; it lifts FORCE inside this statement (ACCESS EXCLUSIVE first) and puts it back
  -- below. tests/check_pf8b_f7_data_walls.ts fails when a data statement on a walled table runs without this.
  IF NOT (SELECT pf8b_role.rolsuper OR pf8b_role.rolbypassrls FROM pg_roles pf8b_role WHERE pf8b_role.rolname = current_user) THEN
    EXECUTE (SELECT 'LOCK TABLE ' || string_agg(format('%I', pf8b_w), ', ') || ' IN ACCESS EXCLUSIVE MODE' FROM unnest(walls) pf8b_w);
    SELECT coalesce(array_agg(pf8b_c.relname::text ORDER BY pf8b_c.relname), '{}') INTO lifted FROM pg_class pf8b_c
      WHERE pf8b_c.relnamespace = 'public'::regnamespace AND pf8b_c.relname = ANY (walls) AND pf8b_c.relforcerowsecurity;
    FOREACH t IN ARRAY lifted LOOP EXECUTE format('ALTER TABLE %I NO FORCE ROW LEVEL SECURITY', t); END LOOP;
    -- …and PF-12's firm gate, which refuses a write by such a runner with no session firm and lets a superuser or
    -- BYPASSRLS one through (platform_firm_first), steps aside on them too while plainly enabled (an ALWAYS gate stays and
    -- refuses loudly; a REPLICA one does not fire): the runner then writes as those do, and each comes back as it was.
    SELECT coalesce(array_agg(pf8b_g.tgrelid::regclass::text ORDER BY 1), '{}') INTO gated FROM pg_trigger pf8b_g
      WHERE pf8b_g.tgname = '0_pf12_firm_first' AND pf8b_g.tgenabled = 'O' AND pf8b_g.tgrelid::regclass::text = ANY (walls);
    FOREACH t IN ARRAY gated LOOP EXECUTE format('ALTER TABLE %I DISABLE TRIGGER "0_pf12_firm_first"', t); END LOOP;
  END IF;
  PERFORM set_config('row_security', 'off', true);  -- a role that neither bypasses the walls nor owns the table (PF-8b F7 above) fails here (review Nit 2)
  SELECT x.id INTO p FROM "money_payment" x WHERE x.method = 'CARD_TERMINAL' AND x.received_into <> 'OPERATING' ORDER BY x.id LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'FO-7ts: payment % is a card terminal payment received into trust; card money goes to operating only, and payments are never changed or removed: ask the tech lead (a reviewed one-off), then rerun', p USING ERRCODE = 'check_violation';
  END IF;
  FOREACH t IN ARRAY gated LOOP EXECUTE format('ALTER TABLE %I ENABLE TRIGGER "0_pf12_firm_first"', t); END LOOP;
  FOREACH t IN ARRAY lifted LOOP EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t); END LOOP;   -- PF-8b F7: the walls back
END $$;

ALTER TABLE "money_payment" DROP CONSTRAINT "money_payment_card_not_trust",
  ADD CONSTRAINT "money_payment_card_not_trust" CHECK ("method" NOT IN ('CARD', 'CARD_TERMINAL') OR "received_into" = 'OPERATING');
