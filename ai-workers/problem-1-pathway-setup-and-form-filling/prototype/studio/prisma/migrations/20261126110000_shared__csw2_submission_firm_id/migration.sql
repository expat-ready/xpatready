-- CS-W2 part submission (Release 1 row R1.3; BACKLOG CS-W2; brief design/briefs/CS-W2.md part 6; case-side contract v0.1
-- §8 steps 2 and 2a, conditions 1 and 3; P-575, P-588 (4), P-600; AG-1-1@ca84eb07, AG-1-45@a4057ff0): the platform firm on
-- the six submission tables, as parts filings (#3811) and review (#3831) did. Area file submission.prisma; back-relations on
-- filings.prisma and cases.prisma (Prisma requires them). Folder shared__ (migration-slots). Functions case_submission_*,
-- SECURITY INVOKER, search_path pinned, pg_temp last.
--   * firm_id on sign_step, signed_scan, filing_record, fee_receipt_file, filing_person_record, filing_record_correction:
--     the session's firm as default; filled on insert by CS-W1's case_firm_fill (the filing for the person record and the
--     correction, the case for the rest); a different firm refused (23514). Indexes (firm_id, ...). NULLABLE until CS-W1
--     part 2, as #3811 (Lead 2 accepted it there).
--   * eleven composite keys (..._id, firm_id) -> parent (id, firm_id), ON UPDATE RESTRICT: the case, the item, the filing,
--     the submission group, and fee_receipt_file -> filing_record (filing_id, firm_id) (its relation is by filing_id;
--     filing_record gets that unique). Left for part "keys": sign_step -> form_instance (copy_id; answers part).
--   * the keep (case_submission_firm_keep): a firm once set is never emptied or changed (#3811's round-1 Major).
--   * the follow (AFTER UPDATE OF firm_id on runtime_case and filing): a case's firm arriving later fills these rows; part
--     filings' follow (named earlier, so fired first) has filled the filings and groups by then.
--   * the four update guards of these tables (fee_receipt_file_append_only, c82_record_only_corrected, c82_append_only,
--     signed_scan_append_only) let through only #3811's public.case_filings_firm_fill_only; any other update is refused as
--     before. (sign_step's and the records' stage guards were given it by #3811.)
-- Rollback (in this order): DROP TRIGGER case_submission_firm_fill, case_submission_firm_keep ON the six tables; DROP TRIGGER
--   case_submission_firm_follow ON runtime_case, filing; DROP FUNCTION case_submission_firm_keep(),
--   case_submission_firm_follow(), case_submission_firm_backfill(); restore the four guards from their migrations; DROP
--   each *_firm_id_fkey below; DROP INDEX each index below; ALTER TABLE the six DROP COLUMN firm_id; then delete this
--   folder's row from _prisma_migrations. Nothing is lost: firm_id is derived.

-- AlterTable
ALTER TABLE "fee_receipt_file" ADD COLUMN     "firm_id" UUID DEFAULT (NULLIF(current_setting('app.firm_id'::text, true), ''::text))::uuid;

-- AlterTable
ALTER TABLE "filing_person_record" ADD COLUMN     "firm_id" UUID DEFAULT (NULLIF(current_setting('app.firm_id'::text, true), ''::text))::uuid;

-- AlterTable
ALTER TABLE "filing_record" ADD COLUMN     "firm_id" UUID DEFAULT (NULLIF(current_setting('app.firm_id'::text, true), ''::text))::uuid;

-- AlterTable
ALTER TABLE "filing_record_correction" ADD COLUMN     "firm_id" UUID DEFAULT (NULLIF(current_setting('app.firm_id'::text, true), ''::text))::uuid;

-- AlterTable
ALTER TABLE "sign_step" ADD COLUMN     "firm_id" UUID DEFAULT (NULLIF(current_setting('app.firm_id'::text, true), ''::text))::uuid;

-- AlterTable
ALTER TABLE "signed_scan" ADD COLUMN     "firm_id" UUID DEFAULT (NULLIF(current_setting('app.firm_id'::text, true), ''::text))::uuid;

-- CreateIndex
CREATE INDEX "fee_receipt_file_firm_id_filing_id_idx" ON "fee_receipt_file"("firm_id", "filing_id");

-- CreateIndex
CREATE INDEX "filing_person_record_firm_id_filing_id_idx" ON "filing_person_record"("firm_id", "filing_id");

-- CreateIndex
CREATE INDEX "filing_record_firm_id_case_id_idx" ON "filing_record"("firm_id", "case_id");

-- CreateIndex
CREATE UNIQUE INDEX "filing_record_filing_id_firm_id_key" ON "filing_record"("filing_id", "firm_id");

-- CreateIndex
CREATE INDEX "filing_record_correction_firm_id_filing_id_idx" ON "filing_record_correction"("firm_id", "filing_id");

-- CreateIndex
CREATE INDEX "sign_step_firm_id_case_id_idx" ON "sign_step"("firm_id", "case_id");

-- CreateIndex
CREATE INDEX "signed_scan_firm_id_case_id_idx" ON "signed_scan"("firm_id", "case_id");

-- The update guards: the one firm fill from empty is let through (#3811's helper).
CREATE OR REPLACE FUNCTION fee_receipt_file_append_only() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  IF public.case_filings_firm_fill_only(to_jsonb(OLD), to_jsonb(NEW)) THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'fee_receipt_file is append-only: a fee receipt is never changed in place';
END $fn$;
CREATE OR REPLACE FUNCTION c82_record_only_corrected() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  IF public.case_filings_firm_fill_only(to_jsonb(OLD), to_jsonb(NEW)) THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME = 'filing_record' AND (to_jsonb(NEW) - 'application_number') IS DISTINCT FROM (to_jsonb(OLD) - 'application_number') THEN
    RAISE EXCEPTION 'filing_record changes only in its application number, through a correction';
  END IF;
  IF TG_TABLE_NAME = 'filing_person_record' AND (to_jsonb(NEW) - 'uci') IS DISTINCT FROM (to_jsonb(OLD) - 'uci') THEN
    RAISE EXCEPTION 'filing_person_record changes only in its UCI, through a correction';
  END IF;
  RETURN NEW;
END $fn$;
CREATE OR REPLACE FUNCTION c82_append_only() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  IF public.case_filings_firm_fill_only(to_jsonb(OLD), to_jsonb(NEW)) THEN RETURN NEW; END IF;
  RAISE EXCEPTION '% is append-only: add a new row instead', TG_TABLE_NAME;
END $fn$;
CREATE OR REPLACE FUNCTION signed_scan_append_only() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  IF public.case_filings_firm_fill_only(to_jsonb(OLD), to_jsonb(NEW)) THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'signed_scan is append-only: a signed scan is never changed in place';
END $fn$;

-- The backfill, parents first; a second run changes nothing.
CREATE FUNCTION case_submission_firm_backfill() RETURNS integer LANGUAGE plpgsql SECURITY INVOKER
  SET search_path = pg_catalog, public, pg_temp AS $fn$
DECLARE n integer; total integer := 0;
BEGIN
  UPDATE sign_step c SET firm_id = p.firm_id FROM runtime_case p WHERE p.id = c.case_id AND c.firm_id IS NULL AND p.firm_id IS NOT NULL;
  GET DIAGNOSTICS n = ROW_COUNT; total := total + n;
  UPDATE signed_scan c SET firm_id = p.firm_id FROM runtime_case p WHERE p.id = c.case_id AND c.firm_id IS NULL AND p.firm_id IS NOT NULL;
  GET DIAGNOSTICS n = ROW_COUNT; total := total + n;
  UPDATE filing_record c SET firm_id = p.firm_id FROM runtime_case p WHERE p.id = c.case_id AND c.firm_id IS NULL AND p.firm_id IS NOT NULL;
  GET DIAGNOSTICS n = ROW_COUNT; total := total + n;
  UPDATE fee_receipt_file c SET firm_id = p.firm_id FROM runtime_case p WHERE p.id = c.case_id AND c.firm_id IS NULL AND p.firm_id IS NOT NULL;
  GET DIAGNOSTICS n = ROW_COUNT; total := total + n;
  UPDATE filing_person_record c SET firm_id = p.firm_id FROM filing p WHERE p.id = c.filing_id AND c.firm_id IS NULL AND p.firm_id IS NOT NULL;
  GET DIAGNOSTICS n = ROW_COUNT; total := total + n;
  UPDATE filing_record_correction c SET firm_id = p.firm_id FROM filing p WHERE p.id = c.filing_id AND c.firm_id IS NULL AND p.firm_id IS NOT NULL;
  GET DIAGNOSTICS n = ROW_COUNT; total := total + n;
  RETURN total;
END $fn$;
REVOKE ALL ON FUNCTION case_submission_firm_backfill() FROM PUBLIC;
SELECT case_submission_firm_backfill();

-- Rows whose parents disagree on the firm, or whose parent is missing (a forced restore), would make a key below fail
-- with Postgres's words; stop first with ours, naming the rows.
DO $chk$
DECLARE bad text;
BEGIN
  SELECT string_agg(x, ', ') INTO bad FROM (
    SELECT 'sign_step ' || c.id || ' (case_id names a row of another firm)' x FROM sign_step c JOIN runtime_case p ON p.id = c.case_id WHERE c.firm_id IS NOT NULL AND c.firm_id IS DISTINCT FROM p.firm_id
    UNION ALL SELECT 'sign_step ' || c.id || ' (item_id names a row of another firm)' x FROM sign_step c JOIN filing_item p ON p.id = c.item_id WHERE c.firm_id IS NOT NULL AND c.firm_id IS DISTINCT FROM p.firm_id
    UNION ALL SELECT 'signed_scan ' || c.id || ' (case_id names a row of another firm)' x FROM signed_scan c JOIN runtime_case p ON p.id = c.case_id WHERE c.firm_id IS NOT NULL AND c.firm_id IS DISTINCT FROM p.firm_id
    UNION ALL SELECT 'signed_scan ' || c.id || ' (item_id names a row of another firm)' x FROM signed_scan c JOIN filing_item p ON p.id = c.item_id WHERE c.firm_id IS NOT NULL AND c.firm_id IS DISTINCT FROM p.firm_id
    UNION ALL SELECT 'filing_record ' || c.id || ' (case_id names a row of another firm)' x FROM filing_record c JOIN runtime_case p ON p.id = c.case_id WHERE c.firm_id IS NOT NULL AND c.firm_id IS DISTINCT FROM p.firm_id
    UNION ALL SELECT 'filing_record ' || c.id || ' (filing_id names a row of another firm)' x FROM filing_record c JOIN filing p ON p.id = c.filing_id WHERE c.firm_id IS NOT NULL AND c.firm_id IS DISTINCT FROM p.firm_id
    UNION ALL SELECT 'filing_record ' || c.id || ' (submission_group_id names a row of another firm)' x FROM filing_record c JOIN submission_group p ON p.id = c.submission_group_id WHERE c.firm_id IS NOT NULL AND c.firm_id IS DISTINCT FROM p.firm_id
    UNION ALL SELECT 'fee_receipt_file ' || c.id || ' (case_id names a row of another firm)' x FROM fee_receipt_file c JOIN runtime_case p ON p.id = c.case_id WHERE c.firm_id IS NOT NULL AND c.firm_id IS DISTINCT FROM p.firm_id
    UNION ALL SELECT 'fee_receipt_file ' || c.id || ' (filing_id names a row of another firm)' x FROM fee_receipt_file c JOIN filing_record p ON p.filing_id = c.filing_id WHERE c.firm_id IS NOT NULL AND c.firm_id IS DISTINCT FROM p.firm_id
    UNION ALL SELECT 'filing_person_record ' || c.id || ' (filing_id names a row of another firm)' x FROM filing_person_record c JOIN filing p ON p.id = c.filing_id WHERE c.firm_id IS NOT NULL AND c.firm_id IS DISTINCT FROM p.firm_id
    UNION ALL SELECT 'filing_record_correction ' || c.id || ' (filing_id names a row of another firm)' x FROM filing_record_correction c JOIN filing p ON p.id = c.filing_id WHERE c.firm_id IS NOT NULL AND c.firm_id IS DISTINCT FROM p.firm_id
    UNION ALL SELECT 'sign_step ' || c.id || ' (no such runtime_case)' FROM sign_step c WHERE NOT EXISTS (SELECT 1 FROM runtime_case p WHERE p.id = c.case_id)
    UNION ALL SELECT 'signed_scan ' || c.id || ' (no such runtime_case)' FROM signed_scan c WHERE NOT EXISTS (SELECT 1 FROM runtime_case p WHERE p.id = c.case_id)
    UNION ALL SELECT 'filing_record ' || c.id || ' (no such runtime_case)' FROM filing_record c WHERE NOT EXISTS (SELECT 1 FROM runtime_case p WHERE p.id = c.case_id)
    UNION ALL SELECT 'fee_receipt_file ' || c.id || ' (no such runtime_case)' FROM fee_receipt_file c WHERE NOT EXISTS (SELECT 1 FROM runtime_case p WHERE p.id = c.case_id)
    UNION ALL SELECT 'filing_person_record ' || c.id || ' (no such filing)' FROM filing_person_record c WHERE NOT EXISTS (SELECT 1 FROM filing p WHERE p.id = c.filing_id)
    UNION ALL SELECT 'filing_record_correction ' || c.id || ' (no such filing)' FROM filing_record_correction c WHERE NOT EXISTS (SELECT 1 FROM filing p WHERE p.id = c.filing_id)
    LIMIT 20) q;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'CS-W2 submission stopped: %', bad USING ERRCODE = '23514';
  END IF;
END $chk$;

-- The fill on insert (CS-W1's generic function).
CREATE TRIGGER case_submission_firm_fill BEFORE INSERT ON "sign_step" FOR EACH ROW EXECUTE FUNCTION case_firm_fill('runtime_case', 'case_id');
CREATE TRIGGER case_submission_firm_fill BEFORE INSERT ON "signed_scan" FOR EACH ROW EXECUTE FUNCTION case_firm_fill('runtime_case', 'case_id');
CREATE TRIGGER case_submission_firm_fill BEFORE INSERT ON "filing_record" FOR EACH ROW EXECUTE FUNCTION case_firm_fill('runtime_case', 'case_id');
CREATE TRIGGER case_submission_firm_fill BEFORE INSERT ON "fee_receipt_file" FOR EACH ROW EXECUTE FUNCTION case_firm_fill('runtime_case', 'case_id');
CREATE TRIGGER case_submission_firm_fill BEFORE INSERT ON "filing_person_record" FOR EACH ROW EXECUTE FUNCTION case_firm_fill('filing', 'filing_id');
CREATE TRIGGER case_submission_firm_fill BEFORE INSERT ON "filing_record_correction" FOR EACH ROW EXECUTE FUNCTION case_firm_fill('filing', 'filing_id');

-- A firm once set stays (#3811's round-1 Major: the keys skip a null firm).
CREATE FUNCTION case_submission_firm_keep() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
  SET search_path = pg_catalog, public, pg_temp AS $fn$
BEGIN
  IF OLD.firm_id IS NOT NULL AND NEW.firm_id IS DISTINCT FROM OLD.firm_id THEN
    RAISE EXCEPTION 'case_submission_firm_keep: a % row keeps its firm', TG_TABLE_NAME USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $fn$;
CREATE TRIGGER case_submission_firm_keep BEFORE UPDATE OF firm_id ON "sign_step" FOR EACH ROW EXECUTE FUNCTION case_submission_firm_keep();
CREATE TRIGGER case_submission_firm_keep BEFORE UPDATE OF firm_id ON "signed_scan" FOR EACH ROW EXECUTE FUNCTION case_submission_firm_keep();
CREATE TRIGGER case_submission_firm_keep BEFORE UPDATE OF firm_id ON "filing_record" FOR EACH ROW EXECUTE FUNCTION case_submission_firm_keep();
CREATE TRIGGER case_submission_firm_keep BEFORE UPDATE OF firm_id ON "fee_receipt_file" FOR EACH ROW EXECUTE FUNCTION case_submission_firm_keep();
CREATE TRIGGER case_submission_firm_keep BEFORE UPDATE OF firm_id ON "filing_person_record" FOR EACH ROW EXECUTE FUNCTION case_submission_firm_keep();
CREATE TRIGGER case_submission_firm_keep BEFORE UPDATE OF firm_id ON "filing_record_correction" FOR EACH ROW EXECUTE FUNCTION case_submission_firm_keep();

-- The follow: when a parent's firm is filled later, its still-empty rows take it (TG_ARGV: child table, its column, …).
CREATE FUNCTION case_submission_firm_follow() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
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
CREATE TRIGGER case_submission_firm_follow AFTER UPDATE OF firm_id ON "runtime_case" FOR EACH ROW EXECUTE FUNCTION case_submission_firm_follow('sign_step', 'case_id', 'signed_scan', 'case_id', 'filing_record', 'case_id', 'fee_receipt_file', 'case_id');
CREATE TRIGGER case_submission_firm_follow AFTER UPDATE OF firm_id ON "filing" FOR EACH ROW EXECUTE FUNCTION case_submission_firm_follow('filing_person_record', 'filing_id', 'filing_record_correction', 'filing_id');

-- AddForeignKey
ALTER TABLE "sign_step" ADD CONSTRAINT "sign_step_case_id_firm_id_fkey" FOREIGN KEY ("case_id", "firm_id") REFERENCES "runtime_case"("id", "firm_id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "sign_step" ADD CONSTRAINT "sign_step_item_id_firm_id_fkey" FOREIGN KEY ("item_id", "firm_id") REFERENCES "filing_item"("id", "firm_id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "signed_scan" ADD CONSTRAINT "signed_scan_case_id_firm_id_fkey" FOREIGN KEY ("case_id", "firm_id") REFERENCES "runtime_case"("id", "firm_id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "signed_scan" ADD CONSTRAINT "signed_scan_item_id_firm_id_fkey" FOREIGN KEY ("item_id", "firm_id") REFERENCES "filing_item"("id", "firm_id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "filing_record" ADD CONSTRAINT "filing_record_case_id_firm_id_fkey" FOREIGN KEY ("case_id", "firm_id") REFERENCES "runtime_case"("id", "firm_id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "filing_record" ADD CONSTRAINT "filing_record_filing_id_firm_id_fkey" FOREIGN KEY ("filing_id", "firm_id") REFERENCES "filing"("id", "firm_id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "filing_record" ADD CONSTRAINT "filing_record_submission_group_id_firm_id_fkey" FOREIGN KEY ("submission_group_id", "firm_id") REFERENCES "submission_group"("id", "firm_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "fee_receipt_file" ADD CONSTRAINT "fee_receipt_file_case_id_firm_id_fkey" FOREIGN KEY ("case_id", "firm_id") REFERENCES "runtime_case"("id", "firm_id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "fee_receipt_file" ADD CONSTRAINT "fee_receipt_file_filing_id_firm_id_fkey" FOREIGN KEY ("filing_id", "firm_id") REFERENCES "filing_record"("filing_id", "firm_id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "filing_person_record" ADD CONSTRAINT "filing_person_record_filing_id_firm_id_fkey" FOREIGN KEY ("filing_id", "firm_id") REFERENCES "filing"("id", "firm_id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "filing_record_correction" ADD CONSTRAINT "filing_record_correction_filing_id_firm_id_fkey" FOREIGN KEY ("filing_id", "firm_id") REFERENCES "filing"("id", "firm_id") ON DELETE CASCADE ON UPDATE RESTRICT;
