-- PF-10a (map row 35; AG-18 §7; AG-18-11, -12, -15, -39, -49, -52, -54, -56; schema file prisma/schema/platform-import.prisma,
-- owner Lead B (platform)): the import batch tables the one import engine (PF-10b) writes. Additive: three enums, four new
-- tables, their keys and indexes, five checks, four pf_import_ functions, their triggers and PF-12's wall on each. No
-- existing table, row or function is changed.
--   * plat_import_row.reasons: a JSON array of at most 50 objects, each exactly {field, rule}, each a name
--     (^[A-Za-z][A-Za-z0-9_.-]{0,63}$): a raw value from the file has nowhere to go (AG-18-12). An ERROR row has at least
--     one reason; before_image only on a MERGE; record kind and id together, only on a CREATE or MERGE.
--   * plat_import_attestation: insert-only (update, delete, truncate refused), and written only for an ACTIVE staff member
--     of its own firm who holds an open OWNER grant (AG-18-49).
--   * plat_import_batch: born a DRAFT; its firm, target, source, file key, file hash, file kind, importer and created time
--     never change; its state moves forward only; from the run on its mapping, dry-run hash and attestation are frozen;
--     never deleted. Hashes are 64 lower-case hex; counts are never negative; the mapping is a JSON object.
--   * plat_import_row: written once (never updated); deleted only while its batch is before its run (a redone dry run).
--     The (firm_id, batch_id, row_number) key: a resumed job never writes a row twice (AG-18-20).
--   * The reasons check holds the SHAPE (names, never free text); that every name is one the target declared is PF-10b's
--     rule (the engine writes reasons only from the target's registered fields and rules).
--   * Staff keys are the pair (firm_id, staff_id) → platform_staff(firm_id, id) (PF-3's rule); a batch's attestation and a
--     row's batch are (firm_id, id) pairs too, so nothing of firm A names anything of firm B.
--   * PF-12's wall on all four (AG-18-52): a forced policy naming the session's firm and the firm-first gate.
-- Keys: agent/import:run, agent/import:undo and agent/import:view-report are already catalogue rows (PF-3's seed, Owner and
-- Admin; PF-6b's catalogue): none is added here.
-- New, empty tables: their keys validate no rows, so no FORCE lift (PF-8b F7) is needed; no data statement runs.
-- Rollback: rollback.sql in this folder.

-- CreateEnum
CREATE TYPE "PlatImportFileKind" AS ENUM ('CSV', 'XLSX');
CREATE TYPE "PlatImportBatchState" AS ENUM ('DRAFT', 'DRY_RUN_READY', 'RUNNING', 'COMPLETED', 'PARTIAL', 'FAILED', 'UNDOING', 'UNDONE');
CREATE TYPE "PlatImportRowOutcome" AS ENUM ('CREATE', 'MERGE', 'SKIP', 'ERROR');

-- CreateTable
CREATE TABLE "plat_import_batch" (
    "id" UUID NOT NULL,
    "firm_id" UUID NOT NULL,
    "target_key" TEXT NOT NULL,
    "source_name" TEXT NOT NULL,
    "file_key" TEXT NOT NULL,
    "file_sha256" CHAR(64) NOT NULL,
    "file_kind" "PlatImportFileKind" NOT NULL,
    "mapping" JSONB NOT NULL,
    "state" "PlatImportBatchState" NOT NULL DEFAULT 'DRAFT',
    "created_count" INTEGER NOT NULL DEFAULT 0,
    "merged_count" INTEGER NOT NULL DEFAULT 0,
    "skipped_count" INTEGER NOT NULL DEFAULT 0,
    "error_count" INTEGER NOT NULL DEFAULT 0,
    "importer_staff_id" UUID NOT NULL,
    "attestation_id" UUID,
    "dry_run_hash" CHAR(64),
    "undo_deadline" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ,

    CONSTRAINT "plat_import_batch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plat_import_row" (
    "id" UUID NOT NULL,
    "firm_id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "row_number" INTEGER NOT NULL,
    "outcome" "PlatImportRowOutcome" NOT NULL,
    "reasons" JSONB NOT NULL DEFAULT '[]',
    "record_kind" TEXT,
    "record_id" UUID,
    "before_image" JSONB,
    "written_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plat_import_row_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plat_import_mapping" (
    "id" UUID NOT NULL,
    "firm_id" UUID NOT NULL,
    "source_name" TEXT NOT NULL,
    "target_key" TEXT NOT NULL,
    "mapping" JSONB NOT NULL,
    "saved_by" UUID NOT NULL,
    "saved_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plat_import_mapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plat_import_attestation" (
    "id" UUID NOT NULL,
    "firm_id" UUID NOT NULL,
    "owner_staff_id" UUID NOT NULL,
    "wording_version" TEXT NOT NULL,
    "at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plat_import_attestation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "plat_import_batch_firm_id_created_at_idx" ON "plat_import_batch"("firm_id", "created_at");
CREATE UNIQUE INDEX "plat_import_batch_firm_id_id_key" ON "plat_import_batch"("firm_id", "id");
CREATE INDEX "plat_import_row_firm_id_batch_id_outcome_idx" ON "plat_import_row"("firm_id", "batch_id", "outcome");
CREATE UNIQUE INDEX "plat_import_row_firm_id_batch_id_row_number_key" ON "plat_import_row"("firm_id", "batch_id", "row_number");
CREATE UNIQUE INDEX "plat_import_mapping_firm_id_source_name_target_key_key" ON "plat_import_mapping"("firm_id", "source_name", "target_key");
CREATE INDEX "plat_import_attestation_firm_id_at_idx" ON "plat_import_attestation"("firm_id", "at");
CREATE UNIQUE INDEX "plat_import_attestation_firm_id_id_key" ON "plat_import_attestation"("firm_id", "id");

-- AddForeignKey
ALTER TABLE "plat_import_batch" ADD CONSTRAINT "plat_import_batch_firm_id_fkey" FOREIGN KEY ("firm_id") REFERENCES "platform_firm"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "plat_import_batch" ADD CONSTRAINT "plat_import_batch_firm_id_importer_staff_id_fkey" FOREIGN KEY ("firm_id", "importer_staff_id") REFERENCES "platform_staff"("firm_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "plat_import_batch" ADD CONSTRAINT "plat_import_batch_firm_id_attestation_id_fkey" FOREIGN KEY ("firm_id", "attestation_id") REFERENCES "plat_import_attestation"("firm_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "plat_import_row" ADD CONSTRAINT "plat_import_row_firm_id_batch_id_fkey" FOREIGN KEY ("firm_id", "batch_id") REFERENCES "plat_import_batch"("firm_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "plat_import_mapping" ADD CONSTRAINT "plat_import_mapping_firm_id_fkey" FOREIGN KEY ("firm_id") REFERENCES "platform_firm"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "plat_import_mapping" ADD CONSTRAINT "plat_import_mapping_firm_id_saved_by_fkey" FOREIGN KEY ("firm_id", "saved_by") REFERENCES "platform_staff"("firm_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "plat_import_attestation" ADD CONSTRAINT "plat_import_attestation_firm_id_fkey" FOREIGN KEY ("firm_id") REFERENCES "platform_firm"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "plat_import_attestation" ADD CONSTRAINT "plat_import_attestation_firm_id_owner_staff_id_fkey" FOREIGN KEY ("firm_id", "owner_staff_id") REFERENCES "platform_staff"("firm_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Rules Prisma cannot say.
-- A name: a target key, a record kind, a reason's field or rule (letters, digits, '_', '.', '-'; at most 64).
-- The reasons' shape (AG-18-12): an array of at most 50 objects, each with exactly the keys field and rule, each a name.
-- IMMUTABLE and free of tables, so a check may call it.
CREATE FUNCTION pf_import_reasons_ok(r jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
  SET search_path = pg_catalog, pg_temp AS $fn$
  -- CASE, not AND/OR: SQL does not promise to stop at the first false, and jsonb_array_length or jsonb_object_keys on the
  -- wrong kind of value raises instead of answering false (the check must refuse, never error).
  SELECT CASE WHEN jsonb_typeof(r) <> 'array' THEN false
              WHEN jsonb_array_length(r) > 50 THEN false
              ELSE NOT EXISTS (
                SELECT 1 FROM jsonb_array_elements(r) e
                 WHERE CASE WHEN jsonb_typeof(e) <> 'object' THEN true
                            WHEN (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(e) k) IS DISTINCT FROM ARRAY['field', 'rule'] THEN true
                            WHEN jsonb_typeof(e -> 'field') <> 'string' OR jsonb_typeof(e -> 'rule') <> 'string' THEN true
                            ELSE NOT ((e ->> 'field') ~ '^[A-Za-z][A-Za-z0-9_.-]{0,63}$' AND (e ->> 'rule') ~ '^[A-Za-z][A-Za-z0-9_.-]{0,63}$')
                       END)
         END
$fn$;

ALTER TABLE "plat_import_row" ADD CONSTRAINT "plat_import_row_reasons_shape" CHECK (pf_import_reasons_ok("reasons"));
-- An ERROR names why; a merge keeps what it overwrote (undo restores it, AG-18-40) and nothing else does; a CREATE or a
-- MERGE names its record (undo removes or restores it), and nothing else does; row numbers start at 1.
ALTER TABLE "plat_import_row" ADD CONSTRAINT "plat_import_row_outcome_shape" CHECK (
  "row_number" >= 1
  AND ("outcome" <> 'ERROR' OR (CASE WHEN jsonb_typeof("reasons") = 'array' THEN jsonb_array_length("reasons") >= 1 ELSE false END))
  AND (("before_image" IS NOT NULL) = ("outcome" = 'MERGE'))
  AND ("before_image" IS NULL OR jsonb_typeof("before_image") = 'object')
  AND (("record_kind" IS NOT NULL) = ("outcome" IN ('CREATE', 'MERGE'))) AND (("record_id" IS NOT NULL) = ("outcome" IN ('CREATE', 'MERGE')))
  AND ("record_kind" IS NULL OR "record_kind" ~ '^[A-Za-z][A-Za-z0-9_.-]{0,63}$'));
ALTER TABLE "plat_import_batch" ADD CONSTRAINT "plat_import_batch_facts" CHECK (
  "target_key" ~ '^[A-Za-z][A-Za-z0-9_.-]{0,63}$'
  AND "source_name" ~ '[A-Za-z0-9]' AND "source_name" !~ '[[:cntrl:]]' AND char_length("source_name") <= 200
  AND "file_key" ~ '^[A-Za-z0-9][A-Za-z0-9._/-]*$' AND char_length("file_key") <= 500
  AND "file_sha256" ~ '^[0-9a-f]{64}$' AND ("dry_run_hash" IS NULL OR "dry_run_hash" ~ '^[0-9a-f]{64}$')
  AND jsonb_typeof("mapping") = 'object'
  AND "created_count" >= 0 AND "merged_count" >= 0 AND "skipped_count" >= 0 AND "error_count" >= 0);
ALTER TABLE "plat_import_mapping" ADD CONSTRAINT "plat_import_mapping_facts" CHECK (
  "target_key" ~ '^[A-Za-z][A-Za-z0-9_.-]{0,63}$' AND "source_name" ~ '[A-Za-z0-9]' AND "source_name" !~ '[[:cntrl:]]'
  AND char_length("source_name") <= 200 AND jsonb_typeof("mapping") = 'object');
ALTER TABLE "plat_import_attestation" ADD CONSTRAINT "plat_import_attestation_facts" CHECK (
  "wording_version" ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$');

-- A batch's facts never change once written: which firm, target, source and file, who imports, when it was made. Its state
-- only moves forward (below; a dry run may be redone or sent back to DRAFT before the run). From the run on, the mapping,
-- the dry-run hash and the attestation it ran under are frozen (AG-18-16: the run is the dry run's file and mapping); a
-- run needs a dry-run hash; finished_at and undo_deadline are set once.
--   DRAFT → DRY_RUN_READY · DRY_RUN_READY → DRAFT | RUNNING · RUNNING → COMPLETED | PARTIAL | FAILED
--   COMPLETED | PARTIAL → UNDOING (AG-18-39) · UNDOING → UNDONE · and any state to itself (counts as a job goes on)
CREATE FUNCTION pf_import_batch_facts_kept() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  IF (NEW."id", NEW."firm_id", NEW."target_key", NEW."source_name", NEW."file_key", NEW."file_sha256", NEW."file_kind", NEW."importer_staff_id", NEW."created_at")
     IS DISTINCT FROM (OLD."id", OLD."firm_id", OLD."target_key", OLD."source_name", OLD."file_key", OLD."file_sha256", OLD."file_kind", OLD."importer_staff_id", OLD."created_at") THEN
    RAISE EXCEPTION 'plat_import_batch: a batch''s firm, target, source, file and importer never change' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW."state" <> OLD."state" AND NOT (OLD."state"::text, NEW."state"::text) IN (
       ('DRAFT', 'DRY_RUN_READY'), ('DRY_RUN_READY', 'DRAFT'), ('DRY_RUN_READY', 'RUNNING'),
       ('RUNNING', 'COMPLETED'), ('RUNNING', 'PARTIAL'), ('RUNNING', 'FAILED'),
       ('COMPLETED', 'UNDOING'), ('PARTIAL', 'UNDOING'), ('UNDOING', 'UNDONE')) THEN
    RAISE EXCEPTION 'plat_import_batch: a batch moves forward only (% to % refused)', OLD."state", NEW."state" USING ERRCODE = 'check_violation';
  END IF;
  IF NEW."state" NOT IN ('DRAFT', 'DRY_RUN_READY') AND NEW."dry_run_hash" IS NULL THEN
    RAISE EXCEPTION 'plat_import_batch: a batch runs only after its dry run (no dry-run hash)' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD."state" NOT IN ('DRAFT', 'DRY_RUN_READY')
     AND (NEW."mapping", NEW."dry_run_hash", NEW."attestation_id") IS DISTINCT FROM (OLD."mapping", OLD."dry_run_hash", OLD."attestation_id") THEN
    RAISE EXCEPTION 'plat_import_batch: from the run on, the mapping, dry-run hash and attestation never change' USING ERRCODE = 'check_violation';
  END IF;
  IF (OLD."finished_at" IS NOT NULL AND NEW."finished_at" IS DISTINCT FROM OLD."finished_at")
     OR (OLD."undo_deadline" IS NOT NULL AND NEW."undo_deadline" IS DISTINCT FROM OLD."undo_deadline") THEN
    RAISE EXCEPTION 'plat_import_batch: the finish time and the undo deadline are set once' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $fn$;
CREATE TRIGGER "plat_import_batch_facts_kept" BEFORE UPDATE ON "plat_import_batch" FOR EACH ROW EXECUTE FUNCTION pf_import_batch_facts_kept();
-- At insert: a batch starts as a DRAFT with nothing counted, run or finished (it reaches the later states only through the
-- moves above).
CREATE FUNCTION pf_import_batch_born() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  IF NEW."state" <> 'DRAFT' OR NEW."finished_at" IS NOT NULL OR NEW."undo_deadline" IS NOT NULL
     OR NEW."created_count" <> 0 OR NEW."merged_count" <> 0 OR NEW."skipped_count" <> 0 OR NEW."error_count" <> 0 THEN
    RAISE EXCEPTION 'plat_import_batch: a batch is created as a DRAFT with nothing counted or finished' USING ERRCODE = 'check_violation';
  END IF;
  NEW."created_at" := clock_timestamp();
  RETURN NEW;
END $fn$;
CREATE TRIGGER "plat_import_batch_born" BEFORE INSERT ON "plat_import_batch" FOR EACH ROW EXECUTE FUNCTION pf_import_batch_born();

-- A batch is never removed (its rows are what undo reads, AG-18-39, -40; AG-18-56 lists every batch): delete and truncate
-- refused. Its rows are written once: never changed; removed only while the batch is still before its run (a dry run is
-- redone, AG-18-15), never from the run on.
CREATE FUNCTION pf_import_kept() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  IF TG_TABLE_NAME = 'plat_import_row' AND TG_OP = 'DELETE' THEN   -- nested: only a row's OLD has batch_id
    IF EXISTS (SELECT 1 FROM "plat_import_batch" b WHERE b."firm_id" = OLD."firm_id" AND b."id" = OLD."batch_id" AND b."state" IN ('DRAFT', 'DRY_RUN_READY')) THEN
      RETURN OLD;   -- a dry run's rows, before the run
    END IF;
  END IF;
  RAISE EXCEPTION '%: kept for undo and the batch list (% refused)', TG_TABLE_NAME, TG_OP USING ERRCODE = 'insufficient_privilege';
END $fn$;
CREATE TRIGGER "plat_import_batch_kept" BEFORE DELETE ON "plat_import_batch" FOR EACH ROW EXECUTE FUNCTION pf_import_kept();
CREATE TRIGGER "plat_import_batch_no_truncate" BEFORE TRUNCATE ON "plat_import_batch" FOR EACH STATEMENT EXECUTE FUNCTION pf_import_kept();
CREATE TRIGGER "plat_import_row_kept" BEFORE UPDATE OR DELETE ON "plat_import_row" FOR EACH ROW EXECUTE FUNCTION pf_import_kept();
CREATE TRIGGER "plat_import_row_no_truncate" BEFORE TRUNCATE ON "plat_import_row" FOR EACH STATEMENT EXECUTE FUNCTION pf_import_kept();
REVOKE DELETE, TRUNCATE ON "plat_import_batch" FROM xr_data;
REVOKE UPDATE, TRUNCATE ON "plat_import_row" FROM xr_data;

-- The attestation (AG-18-49): written by an active Owner of its own firm, at the database's time.
CREATE FUNCTION pf_import_attestation_owner() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  IF NOT EXISTS (
       SELECT 1 FROM "platform_staff" s JOIN "platform_role_grant" g ON g."firm_id" = s."firm_id" AND g."staff_id" = s."id"
        WHERE s."firm_id" = NEW."firm_id" AND s."id" = NEW."owner_staff_id" AND s."status" = 'ACTIVE'
          AND g."role" = 'OWNER' AND g."ended_at" IS NULL) THEN
    RAISE EXCEPTION 'plat_import_attestation: only an active Owner of the firm records the attestation' USING ERRCODE = 'insufficient_privilege';
  END IF;
  NEW."at" := clock_timestamp();
  RETURN NEW;
END $fn$;
CREATE TRIGGER "plat_import_attestation_owner" BEFORE INSERT ON "plat_import_attestation" FOR EACH ROW EXECUTE FUNCTION pf_import_attestation_owner();

-- Insert-only: an attestation is a record of what the Owner declared; it is never changed or removed.
CREATE FUNCTION pf_import_attestation_kept() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  RAISE EXCEPTION 'plat_import_attestation: an attestation is written once, never changed or removed (% refused)', TG_OP USING ERRCODE = 'insufficient_privilege';
END $fn$;
CREATE TRIGGER "plat_import_attestation_kept" BEFORE UPDATE OR DELETE ON "plat_import_attestation" FOR EACH ROW EXECUTE FUNCTION pf_import_attestation_kept();
CREATE TRIGGER "plat_import_attestation_no_truncate" BEFORE TRUNCATE ON "plat_import_attestation" FOR EACH STATEMENT EXECUTE FUNCTION pf_import_attestation_kept();
REVOKE UPDATE, DELETE, TRUNCATE ON "plat_import_attestation" FROM xr_data;

-- PF-12's wall (forced policy naming the session's firm; the firm-first gate before the area's own triggers); the trigger
-- functions run as xr_wall_reader (tests/check_pf12_walls.ts).
ALTER TABLE "plat_import_batch" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY "pf12_firm" ON "plat_import_batch" USING ("firm_id" = platform_session_firm()) WITH CHECK ("firm_id" = platform_session_firm());
ALTER TABLE "plat_import_row" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY "pf12_firm" ON "plat_import_row" USING ("firm_id" = platform_session_firm()) WITH CHECK ("firm_id" = platform_session_firm());
ALTER TABLE "plat_import_mapping" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY "pf12_firm" ON "plat_import_mapping" USING ("firm_id" = platform_session_firm()) WITH CHECK ("firm_id" = platform_session_firm());
ALTER TABLE "plat_import_attestation" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY "pf12_firm" ON "plat_import_attestation" USING ("firm_id" = platform_session_firm()) WITH CHECK ("firm_id" = platform_session_firm());
CREATE TRIGGER "0_pf12_firm_first" BEFORE INSERT OR UPDATE ON "plat_import_batch" FOR EACH ROW EXECUTE FUNCTION platform_firm_first('firm_id');
CREATE TRIGGER "0_pf12_firm_first" BEFORE INSERT OR UPDATE ON "plat_import_row" FOR EACH ROW EXECUTE FUNCTION platform_firm_first('firm_id');
CREATE TRIGGER "0_pf12_firm_first" BEFORE INSERT OR UPDATE ON "plat_import_mapping" FOR EACH ROW EXECUTE FUNCTION platform_firm_first('firm_id');
CREATE TRIGGER "0_pf12_firm_first" BEFORE INSERT OR UPDATE ON "plat_import_attestation" FOR EACH ROW EXECUTE FUNCTION platform_firm_first('firm_id');
-- PF-8b F4 (RDS): a non-superuser may hand a function to xr_wall_reader only while it holds CREATE on public; grant it
-- for the hand-over and take it back after (a no-op pair on a superuser cluster; tests/check_pf8b_f4_migrations.ts).
GRANT CREATE ON SCHEMA public TO xr_wall_reader;
DO $readers$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['pf_import_batch_facts_kept()', 'pf_import_batch_born()', 'pf_import_kept()', 'pf_import_attestation_owner()', 'pf_import_attestation_kept()'] LOOP
    EXECUTE format('ALTER FUNCTION %s SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp', f);
    EXECUTE format('ALTER FUNCTION %s OWNER TO xr_wall_reader', f);
  END LOOP;
END
$readers$;
REVOKE CREATE ON SCHEMA public FROM xr_wall_reader;
