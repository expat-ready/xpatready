-- CS-DL3 part 1 (R1.74, QA-591; Doc 3 line 3337 CaseMilestone; AG-7-96 r7): a case's government steps with the letter's
-- date and its due date as typed by staff (never computed, P-170). Owner: the runtime lane. Prisma's DDL first, then:
--   * insert-only apart from cancelling (AG-7-96 r7: a recorded deadline never moves). The one UPDATE let through sets
--     cancelled_at, cancelled_by and cancel_reason on a line not yet cancelled and changes nothing else; cancelled_at is
--     the database's time. Any other UPDATE (a due date edited, a cancel undone or redone), a DELETE (unless the case row
--     is already gone: the case's ON DELETE CASCADE, as the demo reset deletes cases) and TRUNCATE are refused.
--   * STANDARDS §4 (idempotent creates, as case_decision): the request's key and its sha256, unique per case.
--   * due_on is never before occurred_on; a cancel has all three fields and a non-empty reason, or none of them; Other
--     needs a note; the key is a lower-case word (the list itself is code's, a Sample list: milestones.ts).
--   * a new line names its case's own firm (platform_firm by runtime_case.firm_key, as case_decision), is not cancelled,
--     and gets the database's recorded_at.
--   * No row-level security: like every case_* table, the firm wall is the firm id checked in code on every read and by
--     the insert trigger (PF-12's families are platform_, fo_, money_, msg_, auto_; check_pf12_walls.ts unchanged).
-- Rollback: rollback.sql in this folder (drops the table and its two functions, then this folder's _prisma_migrations
--   row). Recorded steps are lost: export them first.

-- CreateTable
CREATE TABLE "case_milestone" (
    "id" UUID NOT NULL,
    "firm_id" UUID NOT NULL,
    "case_id" UUID NOT NULL,
    "milestone_key" TEXT NOT NULL,
    "occurred_on" DATE NOT NULL,
    "due_on" DATE,
    "reference" TEXT,
    "note" TEXT,
    "recorded_by" TEXT NOT NULL,
    "recorded_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelled_at" TIMESTAMPTZ,
    "cancelled_by" TEXT,
    "cancel_reason" TEXT,
    "idempotency_key" TEXT,
    "idempotency_fingerprint" VARCHAR(64),

    CONSTRAINT "case_milestone_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "case_milestone_case_id_idempotency_key_key" ON "case_milestone"("case_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "case_milestone_firm_id_case_id_idx" ON "case_milestone"("firm_id", "case_id");

-- CreateIndex
CREATE INDEX "case_milestone_due_on_idx" ON "case_milestone"("due_on");

-- AddForeignKey
ALTER TABLE "case_milestone" ADD CONSTRAINT "case_milestone_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "runtime_case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ------------------------------------------------------------------------------------------- what Prisma cannot say
ALTER TABLE "case_milestone"
  ADD CONSTRAINT "case_milestone_due_check" CHECK ("due_on" IS NULL OR "due_on" >= "occurred_on"),
  ADD CONSTRAINT "case_milestone_key_check" CHECK ("milestone_key" ~ '^[a-z][a-z0-9_]{0,39}$'),
  ADD CONSTRAINT "case_milestone_other_check" CHECK ("milestone_key" <> 'other' OR length(btrim(coalesce("note", ''))) > 0),
  ADD CONSTRAINT "case_milestone_text_check" CHECK (("reference" IS NULL OR length("reference") <= 100) AND ("note" IS NULL OR length("note") <= 2000)),
  ADD CONSTRAINT "case_milestone_cancel_check" CHECK (
    ("cancelled_at" IS NULL AND "cancelled_by" IS NULL AND "cancel_reason" IS NULL)
    OR ("cancelled_at" IS NOT NULL AND "cancelled_by" IS NOT NULL AND "cancel_reason" IS NOT NULL
        AND length(btrim("cancel_reason")) > 0 AND length("cancel_reason") <= 500));

CREATE FUNCTION case_milestone_refuse_change() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF TG_OP = 'DELETE' AND NOT EXISTS (SELECT 1 FROM public."runtime_case" c WHERE c.id = OLD.case_id) THEN RETURN OLD; END IF;
  IF TG_OP = 'UPDATE' AND OLD.cancelled_at IS NULL AND NEW.cancelled_at IS NOT NULL
     AND NEW.id = OLD.id AND NEW.firm_id = OLD.firm_id AND NEW.case_id = OLD.case_id AND NEW.milestone_key = OLD.milestone_key
     AND NEW.occurred_on = OLD.occurred_on AND NEW.due_on IS NOT DISTINCT FROM OLD.due_on
     AND NEW.reference IS NOT DISTINCT FROM OLD.reference AND NEW.note IS NOT DISTINCT FROM OLD.note
     AND NEW.recorded_by = OLD.recorded_by AND NEW.recorded_at = OLD.recorded_at
     AND NEW.idempotency_key IS NOT DISTINCT FROM OLD.idempotency_key AND NEW.idempotency_fingerprint IS NOT DISTINCT FROM OLD.idempotency_fingerprint THEN
    NEW.cancelled_at := now();   -- the database's time, never the writer's
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'case_milestone: % is refused; a recorded step never changes (a wrong one is cancelled and recorded again)', lower(TG_OP)
    USING ERRCODE = 'restrict_violation';
END $$;
CREATE TRIGGER case_milestone_no_update BEFORE UPDATE ON "case_milestone" FOR EACH ROW EXECUTE FUNCTION case_milestone_refuse_change();
CREATE TRIGGER case_milestone_no_delete BEFORE DELETE ON "case_milestone" FOR EACH ROW EXECUTE FUNCTION case_milestone_refuse_change();
CREATE TRIGGER case_milestone_no_truncate BEFORE TRUNCATE ON "case_milestone" FOR EACH STATEMENT EXECUTE FUNCTION case_milestone_refuse_change();

CREATE FUNCTION case_milestone_check_insert() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "runtime_case" c JOIN "platform_firm" f ON f.key = c.firm_key WHERE c.id = NEW.case_id AND f.id = NEW.firm_id) THEN
    RAISE EXCEPTION 'case_milestone: firm % is not the firm of case %', NEW.firm_id, NEW.case_id USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.cancelled_at IS NOT NULL OR NEW.cancelled_by IS NOT NULL OR NEW.cancel_reason IS NOT NULL THEN
    RAISE EXCEPTION 'case_milestone: a new step is never already cancelled' USING ERRCODE = 'check_violation';
  END IF;
  NEW.recorded_at := now();   -- the database's time, never the writer's
  RETURN NEW;
END $$;
CREATE TRIGGER case_milestone_insert BEFORE INSERT ON "case_milestone" FOR EACH ROW EXECUTE FUNCTION case_milestone_check_insert();
