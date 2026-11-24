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
--   * plat_import_row: a DRY_RUN preview or a RUN result (phase). Never updated. DRY_RUN rows are written and deleted only
--     while the batch is DRAFT or DRY_RUN_READY; RUN rows are written only while RUNNING and never deleted; the batch is
--     locked FOR SHARE meanwhile.
--     The (firm_id, batch_id, phase, row_number) key: a resumed job never writes a row twice (AG-18-20).
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
CREATE TYPE "PlatImportRowPhase" AS ENUM ('DRY_RUN', 'RUN');

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
    "phase" "PlatImportRowPhase" NOT NULL,
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
CREATE UNIQUE INDEX "plat_import_row_firm_id_batch_id_phase_row_number_key" ON "plat_import_row"("firm_id", "batch_id", "phase", "row_number");
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
-- A row is a dry run's preview (DRY_RUN: AG-18-15, nothing written to a target record, so no before-image; a would-be
-- CREATE names no record yet; a MERGE or SKIP may name the record it matched) or the run's result (RUN: a CREATE or MERGE
-- names its record, and a MERGE keeps what it overwrote, AG-18-40). An ERROR names why and no record; row numbers start
-- at 1 (review round 2 M3).
ALTER TABLE "plat_import_row" ADD CONSTRAINT "plat_import_row_outcome_shape" CHECK (
  "row_number" >= 1
  AND ("outcome" <> 'ERROR' OR (CASE WHEN jsonb_typeof("reasons") = 'array' THEN jsonb_array_length("reasons") >= 1 ELSE false END))
  AND (("before_image" IS NOT NULL) = ("phase" = 'RUN' AND "outcome" = 'MERGE'))
  AND ("before_image" IS NULL OR jsonb_typeof("before_image") = 'object')
  AND (("record_kind" IS NULL) = ("record_id" IS NULL))
  AND ("record_kind" IS NULL OR "outcome" <> 'ERROR')
  AND ("phase" <> 'RUN' OR "outcome" NOT IN ('CREATE', 'MERGE') OR "record_kind" IS NOT NULL)
  AND ("record_kind" IS NULL OR "record_kind" ~ '^[A-Za-z][A-Za-z0-9_.-]{0,63}$'));
ALTER TABLE "plat_import_batch" ADD CONSTRAINT "plat_import_batch_facts" CHECK (
  "target_key" ~ '^[A-Za-z][A-Za-z0-9_.-]{0,63}$'
  AND "source_name" ~ E'[^[:space:][:punct:]]' AND "source_name" !~ E'[[:cntrl:] ­​-‏ -  -⁯﻿]' AND char_length("source_name") <= 200
  AND "file_key" ~ '^[A-Za-z0-9][A-Za-z0-9._/-]*$' AND "file_key" !~ '(^|/)\.{1,2}(/|$)' AND "file_key" !~ '//' AND char_length("file_key") <= 500
  AND "file_sha256" ~ '^[0-9a-f]{64}$' AND ("dry_run_hash" IS NULL OR "dry_run_hash" ~ '^[0-9a-f]{64}$')
  AND jsonb_typeof("mapping") = 'object'
  AND "created_count" >= 0 AND "merged_count" >= 0 AND "skipped_count" >= 0 AND "error_count" >= 0);
-- The finish time belongs to a finished batch and only to one; an undo deadline to a batch that can be undone (break R2-F3).
ALTER TABLE "plat_import_batch" ADD CONSTRAINT "plat_import_batch_finish_shape" CHECK (
  ("finished_at" IS NULL) = ("state" IN ('DRAFT', 'DRY_RUN_READY', 'RUNNING'))
  AND (("undo_deadline" IS NOT NULL) = ("state" IN ('COMPLETED', 'PARTIAL', 'UNDOING', 'UNDONE')))
  -- FAILED made nothing: a run that created or merged anything ends PARTIAL, so undo can reach it (AG-18-39; review m8).
  AND ("state" <> 'FAILED' OR ("created_count" = 0 AND "merged_count" = 0)));
ALTER TABLE "plat_import_mapping" ADD CONSTRAINT "plat_import_mapping_facts" CHECK (
  "target_key" ~ '^[A-Za-z][A-Za-z0-9_.-]{0,63}$' AND "source_name" ~ E'[^[:space:][:punct:]]' AND "source_name" !~ E'[[:cntrl:] ­​-‏ -  -⁯﻿]' AND char_length("source_name") <= 200
  AND jsonb_typeof("mapping") = 'object');
ALTER TABLE "plat_import_attestation" ADD CONSTRAINT "plat_import_attestation_facts" CHECK (
  "wording_version" ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$');

-- A batch's facts never change once written: which firm, target, source and file, who imports, when it was made. Its state
-- only moves forward (below; a dry run may be redone or sent back to DRAFT before the run). From the run on, the mapping,
-- the dry-run hash and the attestation it ran under are frozen, including in the move to RUNNING (AG-18-16: the run is the
-- dry run's file and mapping); a run needs a dry-run hash; finished_at and undo_deadline are set once, and only with a
-- finished state (the finish-shape check); a finished batch's counts never change.
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
  IF (OLD."state" NOT IN ('DRAFT', 'DRY_RUN_READY') OR NEW."state" NOT IN ('DRAFT', 'DRY_RUN_READY'))
     AND (NEW."mapping", NEW."dry_run_hash", NEW."attestation_id") IS DISTINCT FROM (OLD."mapping", OLD."dry_run_hash", OLD."attestation_id") THEN
    RAISE EXCEPTION 'plat_import_batch: from the run on, the mapping, dry-run hash and attestation never change' USING ERRCODE = 'check_violation';
  END IF;
  -- A dry run's result names the mapping it checked: while DRY_RUN_READY, a new mapping comes with a new dry-run hash or
  -- sends the batch back to DRAFT (break R2-F4).
  IF OLD."state" = 'DRY_RUN_READY' AND NEW."state" = 'DRY_RUN_READY' AND NEW."mapping" IS DISTINCT FROM OLD."mapping"
     AND NEW."dry_run_hash" IS NOT DISTINCT FROM OLD."dry_run_hash" THEN
    RAISE EXCEPTION 'plat_import_batch: a changed mapping needs a new dry run' USING ERRCODE = 'check_violation';
  END IF;
  -- A finished batch's counts are its result (break R2-F3).
  IF OLD."state" IN ('COMPLETED', 'PARTIAL', 'FAILED', 'UNDOING', 'UNDONE')
     AND (NEW."created_count", NEW."merged_count", NEW."skipped_count", NEW."error_count") IS DISTINCT FROM (OLD."created_count", OLD."merged_count", OLD."skipped_count", OLD."error_count") THEN
    RAISE EXCEPTION 'plat_import_batch: a finished batch''s counts never change' USING ERRCODE = 'check_violation';
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
-- refused. Its rows are never changed or truncated. pf_import_kept reads no table, so it answers nothing about any row.
CREATE FUNCTION pf_import_kept() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  RAISE EXCEPTION '%: kept for undo and the batch list (% refused)', TG_TABLE_NAME, TG_OP USING ERRCODE = 'insufficient_privilege';
END $fn$;
CREATE TRIGGER "plat_import_batch_kept" BEFORE DELETE ON "plat_import_batch" FOR EACH ROW EXECUTE FUNCTION pf_import_kept();
CREATE TRIGGER "plat_import_batch_no_truncate" BEFORE TRUNCATE ON "plat_import_batch" FOR EACH STATEMENT EXECUTE FUNCTION pf_import_kept();
CREATE TRIGGER "plat_import_row_kept" BEFORE UPDATE ON "plat_import_row" FOR EACH ROW EXECUTE FUNCTION pf_import_kept();
CREATE TRIGGER "plat_import_row_no_truncate" BEFORE TRUNCATE ON "plat_import_row" FOR EACH STATEMENT EXECUTE FUNCTION pf_import_kept();

-- A row follows its batch's state (break R2-F2, review M3): a DRY_RUN row is written and removed only while the batch is
-- DRAFT or DRY_RUN_READY (a redone dry run); a RUN row is written only while the batch is RUNNING and never removed. The
-- batch is locked FOR SHARE, so its state cannot move while a row is written or removed in an open transaction. It
-- answers only for the real plat_import_row (break R2-F1: called from a look-alike temp table it refuses before reading
-- anything), in the session's own firm.
CREATE FUNCTION pf_import_row_open() RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE r record; st text;
BEGIN
  IF TG_RELID IS DISTINCT FROM 'public.plat_import_row'::regclass THEN
    RAISE EXCEPTION 'pf_import_row_open: plat_import_row''s own trigger only' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF TG_OP = 'INSERT' THEN r := NEW; ELSE r := OLD; END IF;
  IF platform_session_firm() IS NOT NULL AND r."firm_id" IS DISTINCT FROM platform_session_firm() THEN
    RAISE EXCEPTION 'pf_import_row_open: only the session''s own firm''s rows' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT b."state"::text INTO st FROM "plat_import_batch" b WHERE b."firm_id" = r."firm_id" AND b."id" = r."batch_id" FOR SHARE;
  IF TG_OP = 'INSERT' AND st IS NULL THEN RETURN NEW; END IF;   -- no such batch of this firm: the (firm_id, batch_id) key refuses it
  IF r."phase" = 'DRY_RUN' AND st IN ('DRAFT', 'DRY_RUN_READY') THEN
    IF TG_OP = 'INSERT' THEN RETURN NEW; ELSE RETURN OLD; END IF;
  END IF;
  IF r."phase" = 'RUN' AND TG_OP = 'INSERT' AND st = 'RUNNING' THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'plat_import_row: kept for undo and the batch list (% of a % row refused while the batch is %)', TG_OP, r."phase", st USING ERRCODE = 'insufficient_privilege';
END $fn$;
CREATE TRIGGER "plat_import_row_open" BEFORE INSERT OR DELETE ON "plat_import_row" FOR EACH ROW EXECUTE FUNCTION pf_import_row_open();
REVOKE DELETE, TRUNCATE ON "plat_import_batch" FROM xr_data;
REVOKE UPDATE, TRUNCATE ON "plat_import_row" FROM xr_data;

-- The attestation (AG-18-49): written by an active Owner of its own firm, at the database's time.
CREATE FUNCTION pf_import_attestation_owner() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  -- Only for the real table, in the session's own firm (break R2-F1: a look-alike temp table, or another firm's id, learns
  -- nothing and locks nothing).
  IF TG_RELID IS DISTINCT FROM 'public.plat_import_attestation'::regclass THEN
    RAISE EXCEPTION 'pf_import_attestation_owner: plat_import_attestation''s own trigger only' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF platform_session_firm() IS NOT NULL AND NEW."firm_id" IS DISTINCT FROM platform_session_firm() THEN
    RAISE EXCEPTION 'pf_import_attestation_owner: only the session''s own firm' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT EXISTS (
       SELECT 1 FROM "platform_staff" s JOIN "platform_role_grant" g ON g."firm_id" = s."firm_id" AND g."staff_id" = s."id"
        WHERE s."firm_id" = NEW."firm_id" AND s."id" = NEW."owner_staff_id" AND s."status" = 'ACTIVE'
          AND g."role" = 'OWNER' AND g."ended_at" IS NULL
        FOR SHARE OF s, g) THEN   -- the person and the grant stay as read until this attestation commits (review m5)
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
  FOREACH f IN ARRAY ARRAY['pf_import_batch_facts_kept()', 'pf_import_batch_born()', 'pf_import_kept()', 'pf_import_row_open()', 'pf_import_attestation_owner()', 'pf_import_attestation_kept()'] LOOP
    EXECUTE format('ALTER FUNCTION %s SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp', f);
    EXECUTE format('ALTER FUNCTION %s OWNER TO xr_wall_reader', f);
    -- No one calls a trigger function directly; a trigger fires it without EXECUTE (break R2-F1).
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
  END LOOP;
END
$readers$;
REVOKE CREATE ON SCHEMA public FROM xr_wall_reader;
