-- CS-W1 part 2a (Release 1 row R1.3; BACKLOG CS-W1; brief design/briefs/CS-W1.md "Part 2"; case-side contract v0.1 §8 step 1,
-- conditions 1 and 3; P-575, P-588 (4); Lead 5's go-ahead on #3811, 26 Nov 21:4x IST): the platform firm becomes required on
-- the case side's three base tables. Area file cases.prisma (the runtime lane's). Functions case_firm_*, SECURITY INVOKER,
-- search_path pinned, pg_temp last.
--   * the stop: while runtime_case, case_stage or firm_case_counter holds a row with no firm_id, the migration refuses in
--     plain words naming each firm key ("run the Sample seed, then migrate again"; brief DW8). CS-W1 part 1's backfill
--     runs once first, so a database whose Sample firms already exist migrates without a hand step.
--   * the fills (case_firm_from_key, case_firm_fill) fire ALWAYS, also under session_replication_role = replica (a
--     restore, the suites' seeds), so a restore-style insert still gets its firm.
--   * NOT NULL on the three columns (Prisma: firmId String, the default unchanged, so no code passes it).
--   * the guard (case_firm_fixed): a case's, a counter row's or a stage's firm_id and firm_key never change (brief DW6; on
--     main nothing guarded a case's firm: #3811's breaker m3). An UPDATE that names the columns with the same values passes.
--   * Left for part 2b (its own PR): the four unique rules re-keyed from firm_key to firm_id, runtime_next_case_number
--     resolving the id inside, and the five firm-identity comparisons in code switching to firm_id (brief DW3, DW4).
-- Rollback (in this order): ALTER TABLE runtime_case, firm_case_counter ENABLE TRIGGER case_firm_from_key; ALTER TABLE
--   case_stage ENABLE TRIGGER case_firm_fill; DROP TRIGGER case_firm_fixed ON runtime_case, firm_case_counter, case_stage; DROP FUNCTION
--   case_firm_fixed(); ALTER TABLE runtime_case, firm_case_counter, case_stage ALTER COLUMN firm_id DROP NOT NULL; then
--   delete this folder's row from _prisma_migrations. Nothing is lost.

SELECT case_firm_backfill();

DO $chk$
DECLARE bad text;
BEGIN
  SELECT string_agg(DISTINCT x, ', ') INTO bad FROM (
    SELECT 'runtime_case "' || firm_key || '"' x FROM runtime_case WHERE firm_id IS NULL
    UNION ALL SELECT 'case_stage "' || firm_key || '"' FROM case_stage WHERE firm_id IS NULL
    UNION ALL SELECT 'firm_case_counter "' || firm_key || '"' FROM firm_case_counter WHERE firm_id IS NULL) q;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'CS-W1 part 2 stopped: these firm keys have no platform firm yet: % (run the Sample seed, then migrate again)', bad
      USING ERRCODE = '23502';
  END IF;
END $chk$;

-- The fill fires on a restore too (session_replication_role = replica, as pg_restore and the suites' seeds run): a row
-- written with no firm_id still gets its key's (or its case's) firm, and a given one must still match. Without this every
-- restore-style insert would hit the NOT NULL below.
ALTER TABLE "runtime_case" ENABLE ALWAYS TRIGGER case_firm_from_key;
ALTER TABLE "firm_case_counter" ENABLE ALWAYS TRIGGER case_firm_from_key;
ALTER TABLE "case_stage" ENABLE ALWAYS TRIGGER case_firm_fill;

-- AlterTable
ALTER TABLE "case_stage" ALTER COLUMN "firm_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "firm_case_counter" ALTER COLUMN "firm_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "runtime_case" ALTER COLUMN "firm_id" SET NOT NULL;

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
