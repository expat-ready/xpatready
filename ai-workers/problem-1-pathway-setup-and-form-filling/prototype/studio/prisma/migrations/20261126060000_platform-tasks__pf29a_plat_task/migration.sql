-- PF-29a (R1.75 part p1; concept screens/tk-tasks/concept.md r2.1; AG-13-1, -2, -5, -8, -62; BR-19): the firm's tasks.
-- Additive only: one new table plat_task (no existing row, table or column changes); platform.prisma gets one back-relation
-- line. The assignee is checked by a same-firm trigger (as fo_lead's owner: Prisma cannot say an optional composite key);
-- never deleted by the app; firm, host, context, maker and source key never change; each change moves version on by one.
-- Rollback: DROP TABLE "plat_task"; DROP FUNCTION plat_task_write(), plat_task_assignee_in_firm(); delete the _prisma_migrations row.
-- Prisma's DDL (prisma migrate diff), then the rules.
CREATE TABLE "plat_task" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "firm_id" UUID NOT NULL,
    "host_type" TEXT NOT NULL,
    "host_id" UUID,
    "context_type" TEXT,
    "context_id" UUID,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "assignee_staff_id" UUID,
    "assigned_by" TEXT,
    "due_at" TIMESTAMPTZ,
    "due_zone" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "cancel_reason" TEXT,
    "completed_by" TEXT,
    "completed_at" TIMESTAMPTZ,
    "archived_at" TIMESTAMPTZ,
    "source_key" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plat_task_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "plat_task_firm_id_assignee_staff_id_status_due_at_idx" ON "plat_task"("firm_id", "assignee_staff_id", "status", "due_at");

CREATE INDEX "plat_task_firm_id_host_type_host_id_idx" ON "plat_task"("firm_id", "host_type", "host_id");

CREATE UNIQUE INDEX "plat_task_firm_id_source_key_key" ON "plat_task"("firm_id", "source_key");

ALTER TABLE "plat_task" ADD CONSTRAINT "plat_task_firm_id_fkey" FOREIGN KEY ("firm_id") REFERENCES "platform_firm"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- ------------------------------------------------------------------------------------------------ rules Prisma cannot say
-- SQLSTATE 23514 (check_violation) for a broken rule; 23503 (foreign_key_violation) for an assignee who is not the firm's.
ALTER TABLE "plat_task"
  -- The hosts of api/src/platform/tasks/hosts.ts (one pattern, not a list of words: migration-slots.py reads a lone word as a table); a firm task has no host id, every other has one.
  ADD CONSTRAINT "plat_task_host_check" CHECK ("host_type" ~ '^(fo_person|case|case_client|firm)$' AND (("host_type" = 'firm') = ("host_id" IS NULL))),
  ADD CONSTRAINT "plat_task_context_check" CHECK (("context_type" IS NULL AND "context_id" IS NULL) OR ("context_type" ~ '^(LEAD|PROSPECT|CASE)$' AND "context_id" IS NOT NULL)),
  -- AG-13-1: a title of 1-200 characters on one line, no control character; details plain text up to 5,000; a category up to 40.
  ADD CONSTRAINT "plat_task_title_check" CHECK (char_length(btrim("title")) BETWEEN 1 AND 200 AND "title" !~ '[\x01-\x1f\x7f]'),
  ADD CONSTRAINT "plat_task_description_check" CHECK ("description" IS NULL OR (char_length("description") <= 5000 AND "description" !~ '[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]')),
  ADD CONSTRAINT "plat_task_category_check" CHECK ("category" IS NULL OR (char_length(btrim("category")) BETWEEN 1 AND 40 AND "category" !~ '[\x01-\x1f\x7f]')),
  -- A due time names its zone (the record's office zone), and the zone is one PostgreSQL knows.
  ADD CONSTRAINT "plat_task_due_check" CHECK ((("due_at" IS NULL) = ("due_zone" IS NULL)) AND ("due_zone" IS NULL OR now() AT TIME ZONE "due_zone" IS NOT NULL)),
  ADD CONSTRAINT "plat_task_priority_check" CHECK ("priority" IN ('LOW', 'MEDIUM', 'HIGH', 'URGENT')),
  ADD CONSTRAINT "plat_task_status_check" CHECK ("status" IN ('OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')),
  -- AG-13-8: a cancelled task says why; only a cancelled one has a reason. A completed one says who and when.
  ADD CONSTRAINT "plat_task_cancel_check" CHECK (("status" = 'CANCELLED') = ("cancel_reason" IS NOT NULL) AND ("cancel_reason" IS NULL OR char_length(btrim("cancel_reason")) BETWEEN 1 AND 500)),
  ADD CONSTRAINT "plat_task_completed_check" CHECK (("status" = 'COMPLETED') = ("completed_at" IS NOT NULL AND "completed_by" IS NOT NULL)),
  ADD CONSTRAINT "plat_task_actor_check" CHECK (char_length("created_by") BETWEEN 1 AND 120 AND ("assigned_by" IS NULL OR char_length("assigned_by") <= 120) AND ("completed_by" IS NULL OR char_length("completed_by") <= 120)),
  ADD CONSTRAINT "plat_task_source_key_check" CHECK ("source_key" IS NULL OR char_length("source_key") BETWEEN 1 AND 200),
  ADD CONSTRAINT "plat_task_version_check" CHECK ("version" >= 1);
-- BR-19: the assignee is staff of the task's own firm (the row's own firm_id is compared).
CREATE FUNCTION plat_task_assignee_in_firm() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."assignee_staff_id" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "platform_staff" s WHERE s."firm_id" = NEW."firm_id" AND s."id" = NEW."assignee_staff_id") THEN
    RAISE EXCEPTION 'plat_task: assignee % is no staff member of this firm', NEW."assignee_staff_id" USING ERRCODE = 'foreign_key_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "plat_task_assignee_in_firm" BEFORE INSERT OR UPDATE OF "assignee_staff_id", "firm_id" ON "plat_task" FOR EACH ROW EXECUTE FUNCTION plat_task_assignee_in_firm();
-- A task stays its firm's, host's and maker's; every change moves version on by one and updated_at forward.
CREATE FUNCTION plat_task_write() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.id, NEW.firm_id, NEW.host_type, NEW.host_id, NEW.context_type, NEW.context_id, NEW.source_key, NEW.created_by, NEW.created_at)
     IS DISTINCT FROM (OLD.id, OLD.firm_id, OLD.host_type, OLD.host_id, OLD.context_type, OLD.context_id, OLD.source_key, OLD.created_by, OLD.created_at) THEN
    RAISE EXCEPTION 'plat_task: a task never moves firm, host or context, and its maker never changes' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.version <> OLD.version + 1 THEN
    RAISE EXCEPTION 'plat_task: each change moves version on by one' USING ERRCODE = 'check_violation';
  END IF;
  NEW.updated_at := greatest(now(), OLD.updated_at);
  RETURN NEW;
END $$;
CREATE TRIGGER "plat_task_write" BEFORE UPDATE ON "plat_task" FOR EACH ROW EXECUTE FUNCTION plat_task_write();
REVOKE DELETE, TRUNCATE ON "plat_task" FROM xr_data;
-- ------------------------------------------------------------------------------------------------------ PF-12's walls
ALTER TABLE "plat_task" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY "pf12_firm" ON "plat_task" USING ("firm_id" = platform_session_firm()) WITH CHECK ("firm_id" = platform_session_firm());
CREATE TRIGGER "0_pf12_firm_first" BEFORE INSERT OR UPDATE ON "plat_task" FOR EACH ROW EXECUTE FUNCTION platform_firm_first('firm_id');
-- PF-12: trigger functions run as xr_wall_reader, search_path pinned; PF-8b F4 (RDS): CREATE on public only for the hand-over.
GRANT CREATE ON SCHEMA public TO xr_wall_reader;
ALTER FUNCTION plat_task_assignee_in_firm() SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp; ALTER FUNCTION plat_task_assignee_in_firm() OWNER TO xr_wall_reader;
ALTER FUNCTION plat_task_write() SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION plat_task_write() OWNER TO xr_wall_reader;
REVOKE CREATE ON SCHEMA public FROM xr_wall_reader;
