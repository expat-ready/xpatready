-- CS-W2 part review (Release 1 row R1.3; BACKLOG CS-W2; brief design/briefs/CS-W2.md part 5; case-side contract v0.1 §8
-- steps 2 and 2a, conditions 1 and 3; P-575, P-588 (4), P-600; AG-1-1@ca84eb07, AG-1-45@a4057ff0): the platform firm on the
-- seven review tables, as part filings (#3811) did for its nine. Area file review.prisma; on filings.prisma filing_item's
-- (id, firm_id) unique and back-relations, on cases.prisma back-relations (Prisma requires them). Functions case_review_*,
-- SECURITY INVOKER, search_path pinned, pg_temp last.
--   * firm_id on review_finding, filing_review, readiness_pass, review_round, review_round_filing, review_round_form,
--     review_check: the session's firm as default; filled on insert by CS-W1's case_firm_fill (the filing for
--     filing_review and readiness_pass, the case for the rest); a different firm refused (23514). Indexes (firm_id, …).
--     NULLABLE until CS-W1 part 2, as #3811 (Lead 2 accepted it there).
--   * 15 composite keys (…_id, firm_id) → parent (id, firm_id), ON UPDATE RESTRICT: every firm-owned parent present
--     (the case, the filing, the item, the round, the round's filing row, the filing review). Left for part "keys":
--     review_finding → case_stage and review_round_form → answer_snapshot (its two snapshot relations; answers part).
--   * review_finding.filing (optional, SetNull) is held by a match trigger, not a key (brief point 2): the filing must be of
--     the finding's case (the same-case rule #3823's breaker asked for: it holds while a firm is still empty).
--   * the keep (case_review_firm_keep): a firm once set is never emptied or changed (#3811's round-1 Major).
--   * the follow (case_review_firm_follow, AFTER UPDATE OF firm_id on runtime_case and filing): a case's firm arriving
--     later fills these rows, parents first.
--   * the five update guards of these tables (c76_append_only, c83_no_update, c83_check_guard, c83_filing_guard,
--     c83_form_guard) let through only #3811's public.case_filings_firm_fill_only (firm from empty, nothing else changed,
--     compared as text); every other update is refused as before.
-- Rollback (in this order): DROP TRIGGER case_review_firm_fill, case_review_firm_keep ON the seven tables; DROP TRIGGER
--   case_review_firm_match ON review_finding; DROP TRIGGER case_review_firm_follow ON runtime_case, filing; DROP FUNCTION
--   case_review_firm_keep(), case_review_firm_match(), case_review_firm_follow(), case_review_firm_backfill(); restore the
--   five guards from their migrations (c76, c83); DROP each *_firm_id_fkey below; DROP INDEX each index below; ALTER TABLE
--   the seven DROP COLUMN firm_id; then delete this folder's row from _prisma_migrations. Nothing is lost: firm_id is derived.

-- AlterTable
ALTER TABLE "filing_review" ADD COLUMN     "firm_id" UUID DEFAULT (NULLIF(current_setting('app.firm_id'::text, true), ''::text))::uuid;

-- AlterTable
ALTER TABLE "readiness_pass" ADD COLUMN     "firm_id" UUID DEFAULT (NULLIF(current_setting('app.firm_id'::text, true), ''::text))::uuid;

-- AlterTable
ALTER TABLE "review_check" ADD COLUMN     "firm_id" UUID DEFAULT (NULLIF(current_setting('app.firm_id'::text, true), ''::text))::uuid;

-- AlterTable
ALTER TABLE "review_finding" ADD COLUMN     "firm_id" UUID DEFAULT (NULLIF(current_setting('app.firm_id'::text, true), ''::text))::uuid;

-- AlterTable
ALTER TABLE "review_round" ADD COLUMN     "firm_id" UUID DEFAULT (NULLIF(current_setting('app.firm_id'::text, true), ''::text))::uuid;

-- AlterTable
ALTER TABLE "review_round_filing" ADD COLUMN     "firm_id" UUID DEFAULT (NULLIF(current_setting('app.firm_id'::text, true), ''::text))::uuid;

-- AlterTable
ALTER TABLE "review_round_form" ADD COLUMN     "firm_id" UUID DEFAULT (NULLIF(current_setting('app.firm_id'::text, true), ''::text))::uuid;

-- CreateIndex
CREATE UNIQUE INDEX "filing_item_id_firm_id_key" ON "filing_item"("id", "firm_id");

-- CreateIndex
CREATE INDEX "filing_review_firm_id_filing_id_idx" ON "filing_review"("firm_id", "filing_id");

-- CreateIndex
CREATE UNIQUE INDEX "filing_review_id_firm_id_key" ON "filing_review"("id", "firm_id");

-- CreateIndex
CREATE INDEX "readiness_pass_firm_id_filing_id_idx" ON "readiness_pass"("firm_id", "filing_id");

-- CreateIndex
CREATE INDEX "review_check_firm_id_case_id_idx" ON "review_check"("firm_id", "case_id");

-- CreateIndex
CREATE INDEX "review_finding_firm_id_case_id_idx" ON "review_finding"("firm_id", "case_id");

-- CreateIndex
CREATE INDEX "review_round_firm_id_case_id_idx" ON "review_round"("firm_id", "case_id");

-- CreateIndex
CREATE UNIQUE INDEX "review_round_id_firm_id_key" ON "review_round"("id", "firm_id");

-- CreateIndex
CREATE INDEX "review_round_filing_firm_id_case_id_idx" ON "review_round_filing"("firm_id", "case_id");

-- CreateIndex
CREATE UNIQUE INDEX "review_round_filing_id_firm_id_key" ON "review_round_filing"("id", "firm_id");

-- CreateIndex
CREATE INDEX "review_round_form_firm_id_case_id_idx" ON "review_round_form"("firm_id", "case_id");

-- The update guards: the one firm fill from empty is let through (#3811's helper).
CREATE OR REPLACE FUNCTION c76_append_only() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  IF public.case_filings_firm_fill_only(to_jsonb(OLD), to_jsonb(NEW)) THEN RETURN NEW; END IF;
  RAISE EXCEPTION '% is append-only: add a new row instead', TG_TABLE_NAME;
END $fn$;
CREATE OR REPLACE FUNCTION c83_no_update() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  IF public.case_filings_firm_fill_only(to_jsonb(OLD), to_jsonb(NEW)) THEN RETURN NEW; END IF;
  RAISE EXCEPTION '% is append-only: send a new round instead', TG_TABLE_NAME;
END $fn$;
CREATE OR REPLACE FUNCTION c83_check_guard() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  IF public.case_filings_firm_fill_only(to_jsonb(OLD), to_jsonb(NEW)) THEN RETURN NEW; END IF;
  IF (NEW."id", NEW."workspace_id", NEW."case_id", NEW."round_filing_id", NEW."item_key", NEW."source", NEW."wording", NEW."live")
     IS DISTINCT FROM (OLD."id", OLD."workspace_id", OLD."case_id", OLD."round_filing_id", OLD."item_key", OLD."source", OLD."wording", OLD."live") THEN
    RAISE EXCEPTION 'review_check: an item''s words never change';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "review_round_filing" WHERE "id" = OLD."round_filing_id" AND "status" IN ('sent', 'under_review')) THEN
    RAISE EXCEPTION 'review_check: the filing is decided; its checklist is closed';
  END IF;
  RETURN NEW;
END $fn$;
CREATE OR REPLACE FUNCTION c83_filing_guard() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  IF public.case_filings_firm_fill_only(to_jsonb(OLD), to_jsonb(NEW)) THEN RETURN NEW; END IF;
  IF NEW."id" <> OLD."id" OR NEW."workspace_id" <> OLD."workspace_id" OR NEW."case_id" <> OLD."case_id" OR NEW."round_id" <> OLD."round_id"
     OR NEW."filing_id" <> OLD."filing_id" OR NEW."filing_round" <> OLD."filing_round" THEN
    RAISE EXCEPTION 'review_round_filing: which round and filing a row is never changes';
  END IF;
  IF OLD."status" = 'sent' AND NEW."status" = 'under_review' AND OLD."opened_by" IS NULL AND NEW."opened_by" IS NOT NULL
     AND NEW."decided_by" IS NULL AND NEW."reasons" IS NULL AND NEW."confirmed_unticked" IS NULL AND NEW."representative" IS NULL
     AND NEW."review_kind" IS NULL AND NEW."self_statement" IS NULL AND NEW."filing_review_id" IS NULL THEN
    RETURN NEW;
  END IF;
  IF OLD."status" = 'under_review' AND NEW."status" IN ('approved', 'sent_back') AND OLD."decided_by" IS NULL
     AND NEW."opened_by" IS NOT DISTINCT FROM OLD."opened_by" AND NEW."opened_at" IS NOT DISTINCT FROM OLD."opened_at" THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'review_round_filing: % → % is not an allowed move (only sent → under_review → approved or sent_back, once)', OLD."status", NEW."status";
END $fn$;
CREATE OR REPLACE FUNCTION c83_form_guard() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  IF public.case_filings_firm_fill_only(to_jsonb(OLD), to_jsonb(NEW)) THEN RETURN NEW; END IF;
  IF (NEW."id", NEW."workspace_id", NEW."case_id", NEW."round_id", NEW."round_filing_id", NEW."filing_id", NEW."item_id", NEW."form_number", NEW."subject_id")
     IS DISTINCT FROM (OLD."id", OLD."workspace_id", OLD."case_id", OLD."round_id", OLD."round_filing_id", OLD."filing_id", OLD."item_id", OLD."form_number", OLD."subject_id")
     OR (NEW."snapshot_id", NEW."facts_hash", NEW."file_kind", NEW."file_id", NEW."file_sha256") IS DISTINCT FROM (OLD."snapshot_id", OLD."facts_hash", OLD."file_kind", OLD."file_id", OLD."file_sha256") THEN
    RAISE EXCEPTION 'review_round_form: what a round froze never changes';
  END IF;
  IF OLD."stamped_at" IS NOT NULL THEN
    -- QA-345: the one move a written stamp may make, once, on an approved row.
    IF OLD."stamp_file_kind" IN ('none', 'generated_copy') AND NEW."stamp_file_kind" = 'validated_copy' AND NEW."stamp_file_sha256" IS NOT NULL
       AND (NEW."stamp_snapshot_id", NEW."stamp_hash", NEW."stamped_by", NEW."stamped_at") IS NOT DISTINCT FROM (OLD."stamp_snapshot_id", OLD."stamp_hash", OLD."stamped_by", OLD."stamped_at")
       AND EXISTS (SELECT 1 FROM "review_round_filing" o WHERE o."id" = OLD."round_filing_id" AND o."status" = 'approved'
                   AND NOT EXISTS (SELECT 1 FROM "review_round_filing" n WHERE n."filing_id" = o."filing_id" AND n."filing_round" > o."filing_round"))
       AND EXISTS (SELECT 1 FROM "validated_copy" v WHERE v."sha256" = NEW."stamp_file_sha256") THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'review_round_form: a stamp is written once';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "review_round_filing" WHERE "id" = OLD."round_filing_id" AND ("status" = 'under_review' OR "xmin" = pg_current_xact_id()::xid)) THEN
    RAISE EXCEPTION 'review_round_form: a stamp is written only while its filing is under review';
  END IF;
  RETURN NEW;
END $fn$;

-- The backfill, parents first; a second run changes nothing.
CREATE FUNCTION case_review_firm_backfill() RETURNS integer LANGUAGE plpgsql SECURITY INVOKER
  SET search_path = pg_catalog, public, pg_temp AS $fn$
DECLARE t text; n integer; total integer := 0;
BEGIN
  FOREACH t IN ARRAY ARRAY['filing_review', 'readiness_pass'] LOOP
    EXECUTE format('UPDATE %I c SET firm_id = f.firm_id FROM filing f WHERE f.id = c.filing_id AND c.firm_id IS NULL AND f.firm_id IS NOT NULL', t);
    GET DIAGNOSTICS n = ROW_COUNT; total := total + n;
  END LOOP;
  FOREACH t IN ARRAY ARRAY['review_round', 'review_round_filing', 'review_round_form', 'review_check', 'review_finding'] LOOP
    EXECUTE format('UPDATE %I c SET firm_id = k.firm_id FROM runtime_case k WHERE k.id = c.case_id AND c.firm_id IS NULL AND k.firm_id IS NOT NULL', t);
    GET DIAGNOSTICS n = ROW_COUNT; total := total + n;
  END LOOP;
  RETURN total;
END $fn$;
REVOKE ALL ON FUNCTION case_review_firm_backfill() FROM PUBLIC;
SELECT case_review_firm_backfill();

-- Rows whose parents disagree on the firm (or a finding naming another case's filing) would make a key below fail with
-- Postgres's words; stop first with ours, naming the rows.
DO $chk$
DECLARE bad text;
BEGIN
  SELECT string_agg(x, ', ') INTO bad FROM (
    SELECT 'review_finding ' || c.id || ' (case_id names a row of another firm)' x FROM review_finding c JOIN runtime_case p ON p.id = c.case_id WHERE c.firm_id IS NOT NULL AND c.firm_id IS DISTINCT FROM p.firm_id
    UNION ALL SELECT 'filing_review ' || c.id || ' (filing_id names a row of another firm)' x FROM filing_review c JOIN filing p ON p.id = c.filing_id WHERE c.firm_id IS NOT NULL AND c.firm_id IS DISTINCT FROM p.firm_id
    UNION ALL SELECT 'readiness_pass ' || c.id || ' (filing_id names a row of another firm)' x FROM readiness_pass c JOIN filing p ON p.id = c.filing_id WHERE c.firm_id IS NOT NULL AND c.firm_id IS DISTINCT FROM p.firm_id
    UNION ALL SELECT 'review_round ' || c.id || ' (case_id names a row of another firm)' x FROM review_round c JOIN runtime_case p ON p.id = c.case_id WHERE c.firm_id IS NOT NULL AND c.firm_id IS DISTINCT FROM p.firm_id
    UNION ALL SELECT 'review_round_filing ' || c.id || ' (case_id names a row of another firm)' x FROM review_round_filing c JOIN runtime_case p ON p.id = c.case_id WHERE c.firm_id IS NOT NULL AND c.firm_id IS DISTINCT FROM p.firm_id
    UNION ALL SELECT 'review_round_filing ' || c.id || ' (round_id names a row of another firm)' x FROM review_round_filing c JOIN review_round p ON p.id = c.round_id WHERE c.firm_id IS NOT NULL AND c.firm_id IS DISTINCT FROM p.firm_id
    UNION ALL SELECT 'review_round_filing ' || c.id || ' (filing_id names a row of another firm)' x FROM review_round_filing c JOIN filing p ON p.id = c.filing_id WHERE c.firm_id IS NOT NULL AND c.firm_id IS DISTINCT FROM p.firm_id
    UNION ALL SELECT 'review_round_filing ' || c.id || ' (filing_review_id names a row of another firm)' x FROM review_round_filing c JOIN filing_review p ON p.id = c.filing_review_id WHERE c.firm_id IS NOT NULL AND c.firm_id IS DISTINCT FROM p.firm_id
    UNION ALL SELECT 'review_round_form ' || c.id || ' (case_id names a row of another firm)' x FROM review_round_form c JOIN runtime_case p ON p.id = c.case_id WHERE c.firm_id IS NOT NULL AND c.firm_id IS DISTINCT FROM p.firm_id
    UNION ALL SELECT 'review_round_form ' || c.id || ' (round_id names a row of another firm)' x FROM review_round_form c JOIN review_round p ON p.id = c.round_id WHERE c.firm_id IS NOT NULL AND c.firm_id IS DISTINCT FROM p.firm_id
    UNION ALL SELECT 'review_round_form ' || c.id || ' (filing_id names a row of another firm)' x FROM review_round_form c JOIN filing p ON p.id = c.filing_id WHERE c.firm_id IS NOT NULL AND c.firm_id IS DISTINCT FROM p.firm_id
    UNION ALL SELECT 'review_round_form ' || c.id || ' (round_filing_id names a row of another firm)' x FROM review_round_form c JOIN review_round_filing p ON p.id = c.round_filing_id WHERE c.firm_id IS NOT NULL AND c.firm_id IS DISTINCT FROM p.firm_id
    UNION ALL SELECT 'review_round_form ' || c.id || ' (item_id names a row of another firm)' x FROM review_round_form c JOIN filing_item p ON p.id = c.item_id WHERE c.firm_id IS NOT NULL AND c.firm_id IS DISTINCT FROM p.firm_id
    UNION ALL SELECT 'review_check ' || c.id || ' (case_id names a row of another firm)' x FROM review_check c JOIN runtime_case p ON p.id = c.case_id WHERE c.firm_id IS NOT NULL AND c.firm_id IS DISTINCT FROM p.firm_id
    UNION ALL SELECT 'review_check ' || c.id || ' (round_filing_id names a row of another firm)' x FROM review_check c JOIN review_round_filing p ON p.id = c.round_filing_id WHERE c.firm_id IS NOT NULL AND c.firm_id IS DISTINCT FROM p.firm_id
    UNION ALL SELECT 'review_finding ' || f.id || ' (its filing is another case''s)' FROM review_finding f JOIN filing g ON g.id = f.filing_id WHERE g.case_id <> f.case_id
    LIMIT 20) q;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'CS-W2 review stopped: %', bad USING ERRCODE = '23514';
  END IF;
END $chk$;

-- The fill on insert (CS-W1's generic function).
CREATE TRIGGER case_review_firm_fill BEFORE INSERT ON "filing_review" FOR EACH ROW EXECUTE FUNCTION case_firm_fill('filing', 'filing_id');
CREATE TRIGGER case_review_firm_fill BEFORE INSERT ON "readiness_pass" FOR EACH ROW EXECUTE FUNCTION case_firm_fill('filing', 'filing_id');
CREATE TRIGGER case_review_firm_fill BEFORE INSERT ON "review_round" FOR EACH ROW EXECUTE FUNCTION case_firm_fill('runtime_case', 'case_id');
CREATE TRIGGER case_review_firm_fill BEFORE INSERT ON "review_round_filing" FOR EACH ROW EXECUTE FUNCTION case_firm_fill('runtime_case', 'case_id');
CREATE TRIGGER case_review_firm_fill BEFORE INSERT ON "review_round_form" FOR EACH ROW EXECUTE FUNCTION case_firm_fill('runtime_case', 'case_id');
CREATE TRIGGER case_review_firm_fill BEFORE INSERT ON "review_check" FOR EACH ROW EXECUTE FUNCTION case_firm_fill('runtime_case', 'case_id');
CREATE TRIGGER case_review_firm_fill BEFORE INSERT ON "review_finding" FOR EACH ROW EXECUTE FUNCTION case_firm_fill('runtime_case', 'case_id');

-- review_finding.filing: the filing must be of the finding's case (so of its firm, even while a firm is still empty).
CREATE FUNCTION case_review_firm_match() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
  SET search_path = pg_catalog, public, pg_temp AS $fn$
DECLARE k uuid;
BEGIN
  IF NEW.filing_id IS NULL THEN RETURN NEW; END IF;
  SELECT case_id INTO k FROM filing WHERE id = NEW.filing_id;
  IF k IS NOT NULL AND k IS DISTINCT FROM NEW.case_id THEN
    RAISE EXCEPTION 'case_review_firm_match: a finding can only name a filing of its own case' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $fn$;
CREATE TRIGGER case_review_firm_match BEFORE INSERT OR UPDATE OF filing_id, case_id ON "review_finding" FOR EACH ROW EXECUTE FUNCTION case_review_firm_match();

-- A firm once set stays (#3811's round-1 Major: the keys skip a null firm).
CREATE FUNCTION case_review_firm_keep() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
  SET search_path = pg_catalog, public, pg_temp AS $fn$
BEGIN
  IF OLD.firm_id IS NOT NULL AND NEW.firm_id IS DISTINCT FROM OLD.firm_id THEN
    RAISE EXCEPTION 'case_review_firm_keep: a % row keeps its firm', TG_TABLE_NAME USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $fn$;
CREATE TRIGGER case_review_firm_keep BEFORE UPDATE OF firm_id ON "filing_review" FOR EACH ROW EXECUTE FUNCTION case_review_firm_keep();
CREATE TRIGGER case_review_firm_keep BEFORE UPDATE OF firm_id ON "readiness_pass" FOR EACH ROW EXECUTE FUNCTION case_review_firm_keep();
CREATE TRIGGER case_review_firm_keep BEFORE UPDATE OF firm_id ON "review_round" FOR EACH ROW EXECUTE FUNCTION case_review_firm_keep();
CREATE TRIGGER case_review_firm_keep BEFORE UPDATE OF firm_id ON "review_round_filing" FOR EACH ROW EXECUTE FUNCTION case_review_firm_keep();
CREATE TRIGGER case_review_firm_keep BEFORE UPDATE OF firm_id ON "review_round_form" FOR EACH ROW EXECUTE FUNCTION case_review_firm_keep();
CREATE TRIGGER case_review_firm_keep BEFORE UPDATE OF firm_id ON "review_check" FOR EACH ROW EXECUTE FUNCTION case_review_firm_keep();
CREATE TRIGGER case_review_firm_keep BEFORE UPDATE OF firm_id ON "review_finding" FOR EACH ROW EXECUTE FUNCTION case_review_firm_keep();

-- The follow: when a parent's firm is filled later, its still-empty rows take it (TG_ARGV: child table, its column, …).
CREATE FUNCTION case_review_firm_follow() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
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
CREATE TRIGGER case_review_firm_follow AFTER UPDATE OF firm_id ON "filing" FOR EACH ROW EXECUTE FUNCTION case_review_firm_follow('filing_review', 'filing_id', 'readiness_pass', 'filing_id');
CREATE TRIGGER case_review_firm_follow AFTER UPDATE OF firm_id ON "runtime_case" FOR EACH ROW EXECUTE FUNCTION case_review_firm_follow(
  'review_round', 'case_id', 'review_round_filing', 'case_id', 'review_round_form', 'case_id', 'review_check', 'case_id', 'review_finding', 'case_id');

-- AddForeignKey
ALTER TABLE "review_finding" ADD CONSTRAINT "review_finding_case_id_firm_id_fkey" FOREIGN KEY ("case_id", "firm_id") REFERENCES "runtime_case"("id", "firm_id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "filing_review" ADD CONSTRAINT "filing_review_filing_id_firm_id_fkey" FOREIGN KEY ("filing_id", "firm_id") REFERENCES "filing"("id", "firm_id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "readiness_pass" ADD CONSTRAINT "readiness_pass_filing_id_firm_id_fkey" FOREIGN KEY ("filing_id", "firm_id") REFERENCES "filing"("id", "firm_id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "review_round" ADD CONSTRAINT "review_round_case_id_firm_id_fkey" FOREIGN KEY ("case_id", "firm_id") REFERENCES "runtime_case"("id", "firm_id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "review_round_filing" ADD CONSTRAINT "review_round_filing_case_id_firm_id_fkey" FOREIGN KEY ("case_id", "firm_id") REFERENCES "runtime_case"("id", "firm_id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "review_round_filing" ADD CONSTRAINT "review_round_filing_round_id_firm_id_fkey" FOREIGN KEY ("round_id", "firm_id") REFERENCES "review_round"("id", "firm_id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "review_round_filing" ADD CONSTRAINT "review_round_filing_filing_id_firm_id_fkey" FOREIGN KEY ("filing_id", "firm_id") REFERENCES "filing"("id", "firm_id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "review_round_filing" ADD CONSTRAINT "review_round_filing_filing_review_id_firm_id_fkey" FOREIGN KEY ("filing_review_id", "firm_id") REFERENCES "filing_review"("id", "firm_id") ON DELETE NO ACTION ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "review_round_form" ADD CONSTRAINT "review_round_form_case_id_firm_id_fkey" FOREIGN KEY ("case_id", "firm_id") REFERENCES "runtime_case"("id", "firm_id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "review_round_form" ADD CONSTRAINT "review_round_form_round_id_firm_id_fkey" FOREIGN KEY ("round_id", "firm_id") REFERENCES "review_round"("id", "firm_id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "review_round_form" ADD CONSTRAINT "review_round_form_filing_id_firm_id_fkey" FOREIGN KEY ("filing_id", "firm_id") REFERENCES "filing"("id", "firm_id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "review_round_form" ADD CONSTRAINT "review_round_form_round_filing_id_firm_id_fkey" FOREIGN KEY ("round_filing_id", "firm_id") REFERENCES "review_round_filing"("id", "firm_id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "review_round_form" ADD CONSTRAINT "review_round_form_item_id_firm_id_fkey" FOREIGN KEY ("item_id", "firm_id") REFERENCES "filing_item"("id", "firm_id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "review_check" ADD CONSTRAINT "review_check_case_id_firm_id_fkey" FOREIGN KEY ("case_id", "firm_id") REFERENCES "runtime_case"("id", "firm_id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "review_check" ADD CONSTRAINT "review_check_round_filing_id_firm_id_fkey" FOREIGN KEY ("round_filing_id", "firm_id") REFERENCES "review_round_filing"("id", "firm_id") ON DELETE CASCADE ON UPDATE RESTRICT;
