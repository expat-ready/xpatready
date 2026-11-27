-- CS-W1 part 2a (Release 1 row R1.3; BACKLOG CS-W1; brief design/briefs/CS-W1.md "Part 2"; case-side contract v0.1 §8 step 1,
-- conditions 1 and 3; P-575, P-588 (4); Lead 5's go-ahead on #3811, 26 Nov 21:4x IST): the platform firm becomes required on
-- the case side's three base tables. Area file cases.prisma (the runtime lane's). Functions case_firm_*, SECURITY INVOKER,
-- search_path pinned, pg_temp last.
--   * the stop: the three tables locked; CS-W1 part 1's backfill once more (a client of another firm stops in words);
--     then the migration refuses in plain words while any row has no firm, or a firm other than its key's or its case's,
--     naming each firm key (a stage by its case's key), and says how to clear Prisma's failed-migration mark before
--     migrating again (brief DW8; breaker B1-B5). A database whose Sample firms already exist migrates without a hand step.
--   * the fills (case_firm_from_key, case_firm_fill) fire ALWAYS, also under session_replication_role = replica (the
--     suites' restore-style seeds; pg_restore itself loads the data before the triggers exist), so such an insert still
--     gets its firm.
--   * NOT NULL on the three columns (Prisma: firmId String, the default unchanged, so no code passes it).
--   * the guard (case_firm_fixed, ALWAYS): a case's, a counter row's or a stage's firm_id and firm_key never change (brief
--     DW6; on main nothing guarded a case's firm: #3811's breaker m3). An UPDATE that names the columns with the same
--     values passes. On case_stage this stands in for the brief's change to runtime_case_stage_forward() (same effect).
--   * Left for part 2b (its own PR): the four unique rules re-keyed from firm_key to firm_id, runtime_next_case_number
--     resolving the id inside, and the five firm-identity comparisons in code switching to firm_id (brief DW3, DW4).
-- Rollback (in this order): DROP TRIGGER case_firm_fixed ON runtime_case; DROP TRIGGER case_firm_fixed ON firm_case_counter;
--   DROP TRIGGER case_firm_fixed ON case_stage; DROP FUNCTION case_firm_fixed(); ALTER TABLE runtime_case ENABLE TRIGGER
--   case_firm_from_key; ALTER TABLE firm_case_counter ENABLE TRIGGER case_firm_from_key; ALTER TABLE case_stage ENABLE
--   TRIGGER case_firm_fill; ALTER TABLE runtime_case ALTER COLUMN firm_id DROP NOT NULL; (the same for firm_case_counter
--   and case_stage); then delete this folder's row from _prisma_migrations. Nothing is lost.

-- The stop and the NOT NULL in one statement, so one transaction (psql and Prisma run a migration file statement by
-- statement): the three tables are locked first, so no write slips in between the check and NOT NULL (breaker B5).
DO $p2$
DECLARE bad text;
BEGIN
  LOCK TABLE runtime_case, case_stage, firm_case_counter IN SHARE ROW EXCLUSIVE MODE;
  -- CS-W1 part 1's backfill once more; a client row that does not match its case stops here in words (breaker B4).
  BEGIN
    PERFORM case_firm_backfill();
  EXCEPTION WHEN foreign_key_violation THEN
    RAISE EXCEPTION 'CS-W1 part 2 stopped: a case''s client is not of the case''s firm, so the case cannot take its firm (%). Fix the client row, then: npx prisma migrate resolve --rolled-back 20261126160000_cases__csw1_firm_required, and migrate again', SQLERRM
      USING ERRCODE = '23503';
  END;
  -- Every row needs its firm, and the right one (breaker B2: a firm that disagrees with its key, or a stage's with its
  -- case's, would be frozen by the guard below). A stage is named by its case's key, the one the seed must give a firm
  -- (breaker B3). The words say how to clear Prisma's failed-migration mark before migrating again (breaker B1: P3009).
  SELECT string_agg(DISTINCT x, ', ') INTO bad FROM (
    SELECT 'runtime_case "' || firm_key || '" (no platform firm)' x FROM runtime_case WHERE firm_id IS NULL
    UNION ALL SELECT 'runtime_case "' || firm_key || '" (firm id is not the key''s)' FROM runtime_case WHERE firm_id IS NOT NULL AND firm_id IS DISTINCT FROM case_lookup.case_firm_id_of_key(firm_key)
    UNION ALL SELECT 'case_stage of case key "' || k.firm_key || '" (no firm on its case)' FROM case_stage s JOIN runtime_case k ON k.id = s.case_id WHERE s.firm_id IS NULL AND k.firm_id IS NULL
    UNION ALL SELECT 'case_stage of case key "' || k.firm_key || '" (not its case''s firm)' FROM case_stage s JOIN runtime_case k ON k.id = s.case_id WHERE s.firm_id IS DISTINCT FROM k.firm_id AND NOT (s.firm_id IS NULL AND k.firm_id IS NULL)
    UNION ALL SELECT 'case_stage "' || s.firm_key || '" (no such case)' FROM case_stage s WHERE NOT EXISTS (SELECT 1 FROM runtime_case k WHERE k.id = s.case_id)
    UNION ALL SELECT 'firm_case_counter "' || firm_key || '" (no platform firm)' FROM firm_case_counter WHERE firm_id IS NULL
    UNION ALL SELECT 'firm_case_counter "' || firm_key || '" (firm id is not the key''s)' FROM firm_case_counter WHERE firm_id IS NOT NULL AND firm_id IS DISTINCT FROM case_lookup.case_firm_id_of_key(firm_key)) q;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'CS-W1 part 2 stopped: these firm keys have no platform firm yet, or a row''s firm does not match: % (run the Sample seed or fix the rows, then: npx prisma migrate resolve --rolled-back 20261126160000_cases__csw1_firm_required, and migrate again)', bad
      USING ERRCODE = '23502';
  END IF;
  SET CONSTRAINTS ALL IMMEDIATE;   -- the backfill's deferred stage checks run now; ALTER TABLE refuses pending trigger events
  ALTER TABLE "case_stage" ALTER COLUMN "firm_id" SET NOT NULL;
  ALTER TABLE "firm_case_counter" ALTER COLUMN "firm_id" SET NOT NULL;
  ALTER TABLE "runtime_case" ALTER COLUMN "firm_id" SET NOT NULL;
END $p2$;

-- The fill fires on a restore too (session_replication_role = replica, as pg_restore and the suites' seeds run): a row
-- written with no firm_id still gets its key's (or its case's) firm, and a given one must still match. Without this every
-- restore-style insert would hit the NOT NULL below.
ALTER TABLE "runtime_case" ENABLE ALWAYS TRIGGER case_firm_from_key;
ALTER TABLE "firm_case_counter" ENABLE ALWAYS TRIGGER case_firm_from_key;
ALTER TABLE "case_stage" ENABLE ALWAYS TRIGGER case_firm_fill;

-- A row's firm never changes once it has one (the column is NOT NULL from here on, so that is always).
CREATE FUNCTION case_firm_fixed() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
  SET search_path = pg_catalog, public, pg_temp AS $fn$
BEGIN
  IF NEW.firm_id IS DISTINCT FROM OLD.firm_id OR NEW.firm_key IS DISTINCT FROM OLD.firm_key THEN
    RAISE EXCEPTION 'case_firm_fixed: a % row keeps its firm', TG_TABLE_NAME USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $fn$;
CREATE TRIGGER case_firm_fixed BEFORE UPDATE OF firm_id, firm_key ON "runtime_case" FOR EACH ROW EXECUTE FUNCTION case_firm_fixed();
CREATE TRIGGER case_firm_fixed BEFORE UPDATE OF firm_id, firm_key ON "firm_case_counter" FOR EACH ROW EXECUTE FUNCTION case_firm_fixed();
CREATE TRIGGER case_firm_fixed BEFORE UPDATE OF firm_id, firm_key ON "case_stage" FOR EACH ROW EXECUTE FUNCTION case_firm_fixed();
-- The guard fires ALWAYS too (review m2): a replica-mode writer cannot give a row another firm either. A restore that
-- needs to (none does: pg_restore loads the data before the triggers exist) is a deliberate owner act: DISABLE TRIGGER.
ALTER TABLE "runtime_case" ENABLE ALWAYS TRIGGER case_firm_fixed;
ALTER TABLE "firm_case_counter" ENABLE ALWAYS TRIGGER case_firm_fixed;
ALTER TABLE "case_stage" ENABLE ALWAYS TRIGGER case_firm_fixed;
