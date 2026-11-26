-- CS-W2 part filings (Release 1 row R1.3; BACKLOG CS-W2; brief design/briefs/CS-W2.md part 1; case-side contract v0.1 §8
-- steps 2 and 2a, conditions 1 and 3; P-575, P-588 (4), P-600; AG-1-1@ca84eb07, AG-1-45@a4057ff0): the platform firm on the
-- nine filings tables. Area file filings.prisma (the runtime lane's); one line on cases.prisma (Case's (id, firm_id) unique
-- and the six back-relations Prisma needs). Every function is case_filings_*, SECURITY INVOKER, search_path pinned.
--   * firm_id uuid on submission_group, filing, filing_applicant, filing_item, assessment, assessment_override,
--     assessment_review, filing_change and filing_form_addition, with the session's firm as its default (CS-W1's text:
--     nullif(current_setting('app.firm_id', true), '')), an index (firm_id, …) beside each (case_id, …) one.
--   * NULLABLE in this part (a deviation from the row's "NOT NULL after the backfill", said in the PR): runtime_case.firm_id
--     is itself nullable until CS-W1 part 2, and a case whose key has no platform firm (the scratch databases of about a
--     dozen suites) has children; NOT NULL on a child before its case would refuse them. The NOT NULL for every case-side
--     table lands with CS-W1 part 2, after the backfill here has run everywhere.
--   * the fill: BEFORE INSERT case_filings_firm_fill calling CS-W1's case_firm_fill(parent, column): a null firm_id takes
--     the parent's; a different one (named, or the session's firm through the default) is refused (23514).
--     Parents: the case for six tables; the filing for filing_applicant; the assessment for its override and review.
--   * the cross-firm keys (§8 step 2a; foreign-key checks ignore row-level security): (case_id, firm_id) →
--     runtime_case (id, firm_id) on the six case-keyed tables, and the file's own parents: filing → submission_group,
--     filing_applicant, filing_item and filing_form_addition → filing, override and review → assessment. ON UPDATE
--     RESTRICT: a parent's firm cannot move while a child names it. Left for part "keys": submission_group → case_stage
--     and filing → case_stage (CS-W1's case_stage has firm_id but no (id, firm_id) unique yet).
--   * the keep: BEFORE UPDATE OF firm_id, case_filings_firm_keep refuses a firm emptied or changed once set (the keys
--     skip a null firm, breaker M1); only the fill from empty passes.
--   * the follow: AFTER UPDATE OF firm_id on runtime_case, filing and assessment, case_filings_firm_follow
--     fills the children still empty (a case whose key gets its platform firm after this migration: CS-W1's backfill runs
--     again after each seed). The fill is checked by the composite keys, so it can only ever be the parent's firm.
--   * the three write-once guards (assessment_frozen, c613_no_update, filing_form_addition_mark_only) and C6.17's two stage
--     guards (runtime_stage_row_current, runtime_stage_row_via_filing: an ended stage's rows) let through exactly one change,
--     case_filings_firm_fill_only: firm_id from empty to a value, every other column unchanged (the backfill and the
--     follow); any other update is refused as before.
-- Rollback (in this order): DROP TRIGGER case_filings_firm_fill ON each of the nine tables; DROP TRIGGER
--   case_filings_firm_follow ON runtime_case, filing, assessment; DROP TRIGGER case_filings_firm_keep
--   ON each of the nine tables; DROP FUNCTION case_filings_firm_keep(); DROP FUNCTION case_filings_firm_follow(),
--   case_filings_firm_backfill(); restore the five guards from their latest migrations (c69_eligibility, c613_filing_change,
--   c78_filing_form_addition, and the stage guards' latest CREATE OR REPLACE); DROP FUNCTION case_filings_firm_fill_only(jsonb, jsonb); DROP each *_firm_id_fkey constraint below; DROP INDEX each index below; ALTER TABLE each of
--   the nine DROP COLUMN firm_id; then delete this folder's row from _prisma_migrations. Nothing is lost: firm_id is derived.

-- AlterTable
ALTER TABLE "assessment" ADD COLUMN     "firm_id" UUID DEFAULT (NULLIF(current_setting('app.firm_id'::text, true), ''::text))::uuid;

-- AlterTable
ALTER TABLE "assessment_override" ADD COLUMN     "firm_id" UUID DEFAULT (NULLIF(current_setting('app.firm_id'::text, true), ''::text))::uuid;

-- AlterTable
ALTER TABLE "assessment_review" ADD COLUMN     "firm_id" UUID DEFAULT (NULLIF(current_setting('app.firm_id'::text, true), ''::text))::uuid;

-- AlterTable
ALTER TABLE "filing" ADD COLUMN     "firm_id" UUID DEFAULT (NULLIF(current_setting('app.firm_id'::text, true), ''::text))::uuid;

-- AlterTable
ALTER TABLE "filing_applicant" ADD COLUMN     "firm_id" UUID DEFAULT (NULLIF(current_setting('app.firm_id'::text, true), ''::text))::uuid;

-- AlterTable
ALTER TABLE "filing_change" ADD COLUMN     "firm_id" UUID DEFAULT (NULLIF(current_setting('app.firm_id'::text, true), ''::text))::uuid;

-- AlterTable
ALTER TABLE "filing_form_addition" ADD COLUMN     "firm_id" UUID DEFAULT (NULLIF(current_setting('app.firm_id'::text, true), ''::text))::uuid;

-- AlterTable
ALTER TABLE "filing_item" ADD COLUMN     "firm_id" UUID DEFAULT (NULLIF(current_setting('app.firm_id'::text, true), ''::text))::uuid;

-- AlterTable
ALTER TABLE "submission_group" ADD COLUMN     "firm_id" UUID DEFAULT (NULLIF(current_setting('app.firm_id'::text, true), ''::text))::uuid;

-- CreateIndex
CREATE INDEX "assessment_firm_id_case_id_subject_id_created_at_idx" ON "assessment"("firm_id", "case_id", "subject_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_id_firm_id_key" ON "assessment"("id", "firm_id");

-- CreateIndex
CREATE INDEX "assessment_override_firm_id_assessment_id_idx" ON "assessment_override"("firm_id", "assessment_id");

-- CreateIndex
CREATE INDEX "assessment_review_firm_id_assessment_id_idx" ON "assessment_review"("firm_id", "assessment_id");

-- CreateIndex
CREATE INDEX "filing_firm_id_case_id_idx" ON "filing"("firm_id", "case_id");

-- CreateIndex
CREATE UNIQUE INDEX "filing_id_firm_id_key" ON "filing"("id", "firm_id");

-- CreateIndex
CREATE INDEX "filing_applicant_firm_id_filing_id_idx" ON "filing_applicant"("firm_id", "filing_id");

-- CreateIndex
CREATE INDEX "filing_change_firm_id_case_id_changed_at_idx" ON "filing_change"("firm_id", "case_id", "changed_at");

-- CreateIndex
CREATE INDEX "filing_form_addition_firm_id_case_id_idx" ON "filing_form_addition"("firm_id", "case_id");

-- CreateIndex
CREATE INDEX "filing_item_firm_id_case_id_idx" ON "filing_item"("firm_id", "case_id");

-- CreateIndex
CREATE UNIQUE INDEX "runtime_case_id_firm_id_key" ON "runtime_case"("id", "firm_id");

-- CreateIndex
CREATE INDEX "submission_group_firm_id_case_id_idx" ON "submission_group"("firm_id", "case_id");

-- CreateIndex
CREATE UNIQUE INDEX "submission_group_id_firm_id_key" ON "submission_group"("id", "firm_id");

-- The one update the guards let through: firm_id from empty to a value, every other column unchanged. It can only be the
-- parent's firm (the composite keys below check it), so no write-once rule is weakened. Shared by the five guards here;
-- later CS-W2 parts call it for their own tables. IMMUTABLE: it reads only its arguments. Compared as text, not as jsonb
-- values: jsonb calls 1 and 1.000 equal, and a frozen run's stored text must not change (breaker m2).
CREATE FUNCTION case_filings_firm_fill_only(o jsonb, n jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE SECURITY INVOKER
  SET search_path = pg_catalog, pg_temp
  AS $fn$ SELECT o ? 'firm_id' AND o ->> 'firm_id' IS NULL AND n ->> 'firm_id' IS NOT NULL AND (o - 'firm_id')::text = (n - 'firm_id')::text $fn$;

-- The write-once guards and the two stage guards (C6.17; their tables' firm fill runs on ended stages too).
CREATE OR REPLACE FUNCTION assessment_frozen() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  IF public.case_filings_firm_fill_only(to_jsonb(OLD), to_jsonb(NEW)) THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'assessment_frozen: an eligibility run is never changed; review and override are rows of their own'; END $fn$;
CREATE OR REPLACE FUNCTION c613_no_update() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  IF public.case_filings_firm_fill_only(to_jsonb(OLD), to_jsonb(NEW)) THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'filing_change is append-only: add a new row instead';
END $fn$;
CREATE OR REPLACE FUNCTION filing_form_addition_mark_only() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  IF public.case_filings_firm_fill_only(to_jsonb(OLD), to_jsonb(NEW)) THEN RETURN NEW; END IF;
  IF OLD."removed_at" IS NOT NULL THEN
    RAISE EXCEPTION 'filing_form_addition: a removed addition is kept as it is';
  END IF;
  IF (to_jsonb(NEW) - 'removed_at' - 'removed_by' - 'removed_reason') IS DISTINCT FROM (to_jsonb(OLD) - 'removed_at' - 'removed_by' - 'removed_reason') THEN
    RAISE EXCEPTION 'filing_form_addition: only the removed mark is ever written after insert';
  END IF;
  RETURN NEW;
END $fn$;
CREATE OR REPLACE FUNCTION runtime_stage_row_current() RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE st text; sc uuid; r record;
BEGIN
  IF TG_OP = 'UPDATE' AND public.case_filings_firm_fill_only(to_jsonb(OLD), to_jsonb(NEW)) THEN RETURN NEW; END IF;
  -- Lead 38's schema read (1): a delete is guarded too; a cascade (from a deleted case: a reset) is a nested trigger.
  IF TG_OP = 'DELETE' THEN r := OLD; ELSE r := NEW; END IF;
  IF pg_trigger_depth() > 1 THEN RETURN r; END IF;
  IF TG_OP = 'UPDATE' AND NEW.stage_id <> OLD.stage_id THEN
    RAISE EXCEPTION 'case_stage_ended: a row keeps its stage'; END IF;
  PERFORM 1 FROM runtime_case WHERE id = r.case_id FOR KEY SHARE;
  SELECT state, case_id INTO st, sc FROM case_stage WHERE id = r.stage_id;
  IF sc IS DISTINCT FROM r.case_id THEN RAISE EXCEPTION 'case_stage_ended: the stage is not this case''s'; END IF;
  IF st <> 'CURRENT' THEN RAISE EXCEPTION 'case_stage_ended: this stage has ended; its rows are kept as they were'; END IF;
  RETURN r;
END $fn$;
CREATE OR REPLACE FUNCTION runtime_stage_row_via_filing() RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE fid uuid; k uuid; st text; r record;
BEGIN
  IF TG_OP = 'UPDATE' AND public.case_filings_firm_fill_only(to_jsonb(OLD), to_jsonb(NEW)) THEN RETURN NEW; END IF;
  IF TG_OP = 'DELETE' THEN r := OLD; ELSE r := NEW; END IF;
  IF pg_trigger_depth() > 1 THEN RETURN r; END IF;
  IF TG_TABLE_NAME IN ('sign_step', 'entered_section', 'signed_scan') THEN
    IF r.item_id IS NULL THEN RETURN r; END IF;
    SELECT i.filing_id INTO fid FROM filing_item i WHERE i.id = r.item_id;
  ELSE
    fid := r.filing_id;
  END IF;
  IF fid IS NULL THEN RETURN r; END IF;
  SELECT f.case_id INTO k FROM filing f WHERE f.id = fid;
  PERFORM 1 FROM runtime_case WHERE id = k FOR KEY SHARE;
  SELECT s.state INTO st FROM filing f JOIN case_stage s ON s.id = f.stage_id WHERE f.id = fid;
  IF st IS DISTINCT FROM 'CURRENT' THEN RAISE EXCEPTION 'case_stage_ended: this filing''s stage has ended; its items and records are kept as they were'; END IF;
  RETURN r;
END $fn$;

-- The backfill, parents first; a second run changes nothing. Returns the number of rows filled.
CREATE FUNCTION case_filings_firm_backfill() RETURNS integer LANGUAGE plpgsql SECURITY INVOKER
  SET search_path = pg_catalog, public, pg_temp AS $fn$
DECLARE t text; n integer; total integer := 0;
BEGIN
  FOREACH t IN ARRAY ARRAY['submission_group', 'filing', 'filing_item', 'assessment', 'filing_change', 'filing_form_addition'] LOOP
    EXECUTE format('UPDATE %I c SET firm_id = k.firm_id FROM runtime_case k WHERE k.id = c.case_id AND c.firm_id IS NULL AND k.firm_id IS NOT NULL', t);
    GET DIAGNOSTICS n = ROW_COUNT; total := total + n;
  END LOOP;
  UPDATE filing_applicant a SET firm_id = f.firm_id FROM filing f WHERE f.id = a.filing_id AND a.firm_id IS NULL AND f.firm_id IS NOT NULL;
  GET DIAGNOSTICS n = ROW_COUNT; total := total + n;
  UPDATE assessment_override o SET firm_id = s.firm_id FROM assessment s WHERE s.id = o.assessment_id AND o.firm_id IS NULL AND s.firm_id IS NOT NULL;
  GET DIAGNOSTICS n = ROW_COUNT; total := total + n;
  UPDATE assessment_review r SET firm_id = s.firm_id FROM assessment s WHERE s.id = r.assessment_id AND r.firm_id IS NULL AND s.firm_id IS NOT NULL;
  GET DIAGNOSTICS n = ROW_COUNT; total := total + n;
  RETURN total;
END $fn$;
REVOKE ALL ON FUNCTION case_filings_firm_backfill() FROM PUBLIC;
SELECT case_filings_firm_backfill();

-- Rows whose two parents disagree (a filing of one case under another case's group, an item whose filing is another
-- case's, or a parent with no firm under a filled row: breaker m5) would make a composite key below fail with Postgres's words; stop first with ours, naming the table and row.
DO $chk$
DECLARE bad text;
BEGIN
  SELECT string_agg(x, ', ') INTO bad FROM (
    SELECT 'filing ' || f.id || ' (its group is another firm''s)' x FROM filing f JOIN submission_group g ON g.id = f.submission_group_id WHERE f.firm_id IS NOT NULL AND f.firm_id IS DISTINCT FROM g.firm_id
    UNION ALL SELECT 'filing_item ' || i.id FROM filing_item i JOIN filing f ON f.id = i.filing_id WHERE i.firm_id IS NOT NULL AND i.firm_id IS DISTINCT FROM f.firm_id
    UNION ALL SELECT 'filing_form_addition ' || a.id FROM filing_form_addition a JOIN filing f ON f.id = a.filing_id WHERE a.firm_id IS NOT NULL AND a.firm_id IS DISTINCT FROM f.firm_id
    LIMIT 20) q;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'CS-W2 filings stopped: these rows sit under parents of two different firms: %', bad USING ERRCODE = '23514';
  END IF;
END $chk$;

-- The fill on insert (CS-W1's generic function; the parent and its column per table).
CREATE TRIGGER case_filings_firm_fill BEFORE INSERT ON "submission_group" FOR EACH ROW EXECUTE FUNCTION case_firm_fill('runtime_case', 'case_id');
CREATE TRIGGER case_filings_firm_fill BEFORE INSERT ON "filing" FOR EACH ROW EXECUTE FUNCTION case_firm_fill('runtime_case', 'case_id');
CREATE TRIGGER case_filings_firm_fill BEFORE INSERT ON "filing_item" FOR EACH ROW EXECUTE FUNCTION case_firm_fill('runtime_case', 'case_id');
CREATE TRIGGER case_filings_firm_fill BEFORE INSERT ON "assessment" FOR EACH ROW EXECUTE FUNCTION case_firm_fill('runtime_case', 'case_id');
CREATE TRIGGER case_filings_firm_fill BEFORE INSERT ON "filing_change" FOR EACH ROW EXECUTE FUNCTION case_firm_fill('runtime_case', 'case_id');
CREATE TRIGGER case_filings_firm_fill BEFORE INSERT ON "filing_form_addition" FOR EACH ROW EXECUTE FUNCTION case_firm_fill('runtime_case', 'case_id');
CREATE TRIGGER case_filings_firm_fill BEFORE INSERT ON "filing_applicant" FOR EACH ROW EXECUTE FUNCTION case_firm_fill('filing', 'filing_id');
CREATE TRIGGER case_filings_firm_fill BEFORE INSERT ON "assessment_override" FOR EACH ROW EXECUTE FUNCTION case_firm_fill('assessment', 'assessment_id');
CREATE TRIGGER case_filings_firm_fill BEFORE INSERT ON "assessment_review" FOR EACH ROW EXECUTE FUNCTION case_firm_fill('assessment', 'assessment_id');

-- A firm once set stays (breaker M1): the composite keys skip a row whose firm_id is null (MATCH SIMPLE), so emptying it
-- would let one statement move a row under another firm's parent; changing it to another firm is refused too. The one
-- change allowed is the fill from empty. (CS-W1 part 2's NOT NULL makes the first rule structural.)
CREATE FUNCTION case_filings_firm_keep() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
  SET search_path = pg_catalog, public, pg_temp AS $fn$
BEGIN
  IF OLD.firm_id IS NOT NULL AND NEW.firm_id IS DISTINCT FROM OLD.firm_id THEN
    RAISE EXCEPTION 'case_filings_firm_keep: a % row keeps its firm', TG_TABLE_NAME USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $fn$;
CREATE TRIGGER case_filings_firm_keep BEFORE UPDATE OF firm_id ON "submission_group" FOR EACH ROW EXECUTE FUNCTION case_filings_firm_keep();
CREATE TRIGGER case_filings_firm_keep BEFORE UPDATE OF firm_id ON "filing" FOR EACH ROW EXECUTE FUNCTION case_filings_firm_keep();
CREATE TRIGGER case_filings_firm_keep BEFORE UPDATE OF firm_id ON "filing_applicant" FOR EACH ROW EXECUTE FUNCTION case_filings_firm_keep();
CREATE TRIGGER case_filings_firm_keep BEFORE UPDATE OF firm_id ON "filing_item" FOR EACH ROW EXECUTE FUNCTION case_filings_firm_keep();
CREATE TRIGGER case_filings_firm_keep BEFORE UPDATE OF firm_id ON "assessment" FOR EACH ROW EXECUTE FUNCTION case_filings_firm_keep();
CREATE TRIGGER case_filings_firm_keep BEFORE UPDATE OF firm_id ON "assessment_override" FOR EACH ROW EXECUTE FUNCTION case_filings_firm_keep();
CREATE TRIGGER case_filings_firm_keep BEFORE UPDATE OF firm_id ON "assessment_review" FOR EACH ROW EXECUTE FUNCTION case_filings_firm_keep();
CREATE TRIGGER case_filings_firm_keep BEFORE UPDATE OF firm_id ON "filing_change" FOR EACH ROW EXECUTE FUNCTION case_filings_firm_keep();
CREATE TRIGGER case_filings_firm_keep BEFORE UPDATE OF firm_id ON "filing_form_addition" FOR EACH ROW EXECUTE FUNCTION case_filings_firm_keep();

-- The follow: when a parent's firm is filled later, its still-empty children take it (TG_ARGV: child table, its column, …).
CREATE FUNCTION case_filings_firm_follow() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
  SET search_path = pg_catalog, public, pg_temp AS $fn$
DECLARE i int := 0;
BEGIN
  IF NEW.firm_id IS NULL OR NEW.firm_id IS NOT DISTINCT FROM OLD.firm_id THEN RETURN NULL; END IF;
  WHILE i < TG_NARGS LOOP
    EXECUTE format('UPDATE %I SET firm_id = $1 WHERE %I = $2 AND firm_id IS NULL', TG_ARGV[i], TG_ARGV[i + 1]) USING NEW.firm_id, NEW.id;
    i := i + 2;
  END LOOP;
  RETURN NULL;
END $fn$;
CREATE TRIGGER case_filings_firm_follow AFTER UPDATE OF firm_id ON "runtime_case" FOR EACH ROW EXECUTE FUNCTION case_filings_firm_follow(
  'submission_group', 'case_id', 'filing', 'case_id', 'filing_item', 'case_id', 'assessment', 'case_id', 'filing_change', 'case_id', 'filing_form_addition', 'case_id');
CREATE TRIGGER case_filings_firm_follow AFTER UPDATE OF firm_id ON "filing" FOR EACH ROW EXECUTE FUNCTION case_filings_firm_follow('filing_applicant', 'filing_id');
CREATE TRIGGER case_filings_firm_follow AFTER UPDATE OF firm_id ON "assessment" FOR EACH ROW EXECUTE FUNCTION case_filings_firm_follow('assessment_override', 'assessment_id', 'assessment_review', 'assessment_id');

-- AddForeignKey
ALTER TABLE "submission_group" ADD CONSTRAINT "submission_group_case_id_firm_id_fkey" FOREIGN KEY ("case_id", "firm_id") REFERENCES "runtime_case"("id", "firm_id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "filing" ADD CONSTRAINT "filing_case_id_firm_id_fkey" FOREIGN KEY ("case_id", "firm_id") REFERENCES "runtime_case"("id", "firm_id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "filing" ADD CONSTRAINT "filing_submission_group_id_firm_id_fkey" FOREIGN KEY ("submission_group_id", "firm_id") REFERENCES "submission_group"("id", "firm_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "filing_applicant" ADD CONSTRAINT "filing_applicant_filing_id_firm_id_fkey" FOREIGN KEY ("filing_id", "firm_id") REFERENCES "filing"("id", "firm_id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "filing_item" ADD CONSTRAINT "filing_item_case_id_firm_id_fkey" FOREIGN KEY ("case_id", "firm_id") REFERENCES "runtime_case"("id", "firm_id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "filing_item" ADD CONSTRAINT "filing_item_filing_id_firm_id_fkey" FOREIGN KEY ("filing_id", "firm_id") REFERENCES "filing"("id", "firm_id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "assessment" ADD CONSTRAINT "assessment_case_id_firm_id_fkey" FOREIGN KEY ("case_id", "firm_id") REFERENCES "runtime_case"("id", "firm_id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "assessment_override" ADD CONSTRAINT "assessment_override_assessment_id_firm_id_fkey" FOREIGN KEY ("assessment_id", "firm_id") REFERENCES "assessment"("id", "firm_id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "assessment_review" ADD CONSTRAINT "assessment_review_assessment_id_firm_id_fkey" FOREIGN KEY ("assessment_id", "firm_id") REFERENCES "assessment"("id", "firm_id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "filing_change" ADD CONSTRAINT "filing_change_case_id_firm_id_fkey" FOREIGN KEY ("case_id", "firm_id") REFERENCES "runtime_case"("id", "firm_id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "filing_form_addition" ADD CONSTRAINT "filing_form_addition_case_id_firm_id_fkey" FOREIGN KEY ("case_id", "firm_id") REFERENCES "runtime_case"("id", "firm_id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "filing_form_addition" ADD CONSTRAINT "filing_form_addition_filing_id_firm_id_fkey" FOREIGN KEY ("filing_id", "firm_id") REFERENCES "filing"("id", "firm_id") ON DELETE CASCADE ON UPDATE RESTRICT;
