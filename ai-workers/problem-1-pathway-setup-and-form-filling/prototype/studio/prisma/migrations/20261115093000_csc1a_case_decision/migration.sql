-- CS-C1a (map row 77; brief design/briefs/CS-C1.md part 1; AG-7-33, AG-7-34, AG-7-13, AG-7-50, BR-10): the decision and
-- withdrawal record, and a case's closing fields. Owner: the runtime lane (cases.prisma). Every function and trigger is
-- named case_* (brief). Prisma's DDL first, then what Prisma cannot say:
--   * status is OPEN or CLOSED; a closed case has closed_at, close_outcome and closed_reason, an open one has none of the
--     closing fields (a reopen clears them all, AG-7-13 rule 3); a withdrawn case is closed WITHDRAWN.
--   * case_decision is insert-only: UPDATE, DELETE and TRUNCATE are refused (a correction is a new row). Its rows go only
--     with their case: a DELETE is let through only once the case row itself is gone (the case's ON DELETE CASCADE, as
--     the demo reset deletes cases); any other DELETE, from a statement or from another trigger, is refused. A filing
--     with a decision cannot be deleted (NO ACTION).
--   * a new row names its case's own firm (platform_firm by runtime_case.firm_key), a filing of the same case (recorded
--     as submitted, C8.2's filing_record, for a DECISION), and a
--     kind with its outcomes (DECISION: APPROVED, REFUSED, a Sample list until cited; WITHDRAWAL: WITHDRAWN, no filing).
-- Rollback (in this order): DROP TABLE "case_decision"; DROP FUNCTION case_decision_check_insert(),
--   case_decision_refuse_change(); ALTER TABLE "runtime_case" DROP CONSTRAINT "runtime_case_closing_fields_check",
--   DROP CONSTRAINT "runtime_case_close_outcome_check", DROP CONSTRAINT "runtime_case_status_check", DROP CONSTRAINT
--   "runtime_case_closed_from_stage_fkey", DROP COLUMN "close_outcome", DROP COLUMN "closed_at", DROP COLUMN
--   "closed_from_stage", DROP COLUMN "closed_reason", DROP COLUMN "withdraw_reason", DROP COLUMN "withdrawn_at"; then
--   delete this folder's row from _prisma_migrations. Closed cases lose their closing fields (export them first).

-- AlterTable
ALTER TABLE "runtime_case" ADD COLUMN     "close_outcome" TEXT,
ADD COLUMN     "closed_at" TIMESTAMPTZ,
ADD COLUMN     "closed_from_stage" UUID,
ADD COLUMN     "closed_reason" TEXT,
ADD COLUMN     "withdraw_reason" TEXT,
ADD COLUMN     "withdrawn_at" TIMESTAMPTZ;

-- CreateTable
CREATE TABLE "case_decision" (
    "id" UUID NOT NULL,
    "firm_id" UUID NOT NULL,
    "case_id" UUID NOT NULL,
    "filing_id" UUID,
    "kind" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "decided_on" DATE NOT NULL,
    "note" TEXT,
    "recorded_by" TEXT NOT NULL,
    "recorded_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "case_decision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "case_decision_firm_id_case_id_idx" ON "case_decision"("firm_id", "case_id");

-- CreateIndex
CREATE INDEX "case_decision_filing_id_idx" ON "case_decision"("filing_id");

-- AddForeignKey
ALTER TABLE "runtime_case" ADD CONSTRAINT "runtime_case_closed_from_stage_fkey" FOREIGN KEY ("closed_from_stage") REFERENCES "case_stage"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_decision" ADD CONSTRAINT "case_decision_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "runtime_case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_decision" ADD CONSTRAINT "case_decision_filing_id_fkey" FOREIGN KEY ("filing_id") REFERENCES "filing"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- ------------------------------------------------------------------------------------------- what Prisma cannot say
ALTER TABLE "runtime_case"
  ADD CONSTRAINT "runtime_case_status_check" CHECK ("status" IN ('OPEN', 'CLOSED')),
  ADD CONSTRAINT "runtime_case_close_outcome_check" CHECK ("close_outcome" IN ('WITHDRAWN', 'COMPLETED', 'CLOSED_BY_STAFF')),
  ADD CONSTRAINT "runtime_case_closing_fields_check" CHECK (
    ("status" = 'OPEN' AND "closed_at" IS NULL AND "closed_reason" IS NULL AND "close_outcome" IS NULL AND "withdrawn_at" IS NULL AND "withdraw_reason" IS NULL AND "closed_from_stage" IS NULL)
    OR ("status" = 'CLOSED' AND "closed_at" IS NOT NULL AND "close_outcome" IS NOT NULL AND length(btrim("closed_reason")) > 0
        AND (("close_outcome" = 'WITHDRAWN') = ("withdrawn_at" IS NOT NULL)) AND (("withdrawn_at" IS NULL) = ("withdraw_reason" IS NULL))));

ALTER TABLE "case_decision"
  ADD CONSTRAINT "case_decision_kind_check" CHECK (
    ("kind" = 'DECISION' AND "filing_id" IS NOT NULL AND "outcome" IN ('APPROVED', 'REFUSED'))
    OR ("kind" = 'WITHDRAWAL' AND "filing_id" IS NULL AND "outcome" = 'WITHDRAWN')),
  ADD CONSTRAINT "case_decision_note_check" CHECK ("note" IS NULL OR length("note") <= 2000);

CREATE FUNCTION case_decision_refuse_change() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  -- The case's own cascade (a demo reset deleting cases): the case row is already gone when its decisions are deleted.
  IF TG_OP = 'DELETE' AND NOT EXISTS (SELECT 1 FROM public."runtime_case" c WHERE c.id = OLD.case_id) THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'case_decision: % is refused; a decision is a record (a correction is a new row)', lower(TG_OP)
    USING ERRCODE = 'restrict_violation';
END $$;
CREATE TRIGGER case_decision_no_update BEFORE UPDATE ON "case_decision" FOR EACH ROW EXECUTE FUNCTION case_decision_refuse_change();
CREATE TRIGGER case_decision_no_delete BEFORE DELETE ON "case_decision" FOR EACH ROW EXECUTE FUNCTION case_decision_refuse_change();
CREATE TRIGGER case_decision_no_truncate BEFORE TRUNCATE ON "case_decision" FOR EACH STATEMENT EXECUTE FUNCTION case_decision_refuse_change();

CREATE FUNCTION case_decision_check_insert() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "runtime_case" c JOIN "platform_firm" f ON f.key = c.firm_key WHERE c.id = NEW.case_id AND f.id = NEW.firm_id) THEN
    RAISE EXCEPTION 'case_decision: firm % is not the firm of case %', NEW.firm_id, NEW.case_id USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.filing_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "filing" x WHERE x.id = NEW.filing_id AND x.case_id = NEW.case_id) THEN
    RAISE EXCEPTION 'case_decision: filing % is not a filing of case %', NEW.filing_id, NEW.case_id USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.kind = 'DECISION' AND NOT EXISTS (SELECT 1 FROM "filing_record" r WHERE r.filing_id = NEW.filing_id) THEN
    RAISE EXCEPTION 'case_decision: filing % is not recorded as submitted', NEW.filing_id USING ERRCODE = 'check_violation';
  END IF;
  NEW.recorded_at := now();   -- the database's time, never the writer's
  RETURN NEW;
END $$;
CREATE TRIGGER case_decision_insert BEFORE INSERT ON "case_decision" FOR EACH ROW EXECUTE FUNCTION case_decision_check_insert();
