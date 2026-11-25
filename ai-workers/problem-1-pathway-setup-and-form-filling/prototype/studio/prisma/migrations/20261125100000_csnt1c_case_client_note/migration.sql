-- CS-NT1 part 3 (map row 76, "a note on a case or a person"; design/briefs/CS-NT1.md part 3; AG-13-20): a note on a case
-- client (CS-K1's case_client, on main), in the same table and with the same rules as a note on a case. Owner: the
-- release Lead (case side), case-notes.prisma. Additive for every existing row: case_id loses NOT NULL (every existing
-- row keeps its case), one new nullable column case_client_id, one check, two indexes, one new AFTER DELETE trigger on
-- case_client. The three case_note_* functions are replaced, never added to (part 1's DW7 counts them):
--   * a note names exactly one subject: its case (case_id) or its case client (case_client_id) (case_note_subject_check).
--   * case_note_check_insert: for a client note, what the case's foreign key would do, on case_client: the client
--     exists and is held FOR KEY SHARE; firm_id is the client's firm (case_lookup.case_firm_id_of_key(firm_key), as for a
--     case) and workspace_id its workspace. A next version keeps its subject (case or client), firm, workspace and author.
--   * case_note_refuse_change: a DELETE is let through only once the note's own subject row is gone (its case, or its
--     client); part 1's rule was written for case_id only and would let a client note's DELETE through (NULL case_id).
--   * case_note_follow_case: also the client's cascade (TG_TABLE_NAME), fired by the new trigger case_note_follow_client.
-- Rollback (in this order): DROP TRIGGER case_note_follow_client ON "case_client"; DELETE the client notes (a superuser
--   session with session_replication_role = replica); DROP INDEX "case_note_case_client_id_note_key_version_idx",
--   "case_note_case_client_id_idempotency_key_key"; ALTER TABLE "case_note" DROP CONSTRAINT case_note_subject_check, DROP
--   COLUMN case_client_id, ALTER COLUMN case_id SET NOT NULL; re-run part 1's three CREATE FUNCTION bodies as CREATE OR
--   REPLACE; then delete this folder's row from _prisma_migrations. Lost: the notes on clients.

-- AlterTable
ALTER TABLE "case_note" ADD COLUMN "case_client_id" UUID,
ALTER COLUMN "case_id" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "case_note_case_client_id_note_key_version_idx" ON "case_note"("case_client_id", "note_key", "version");

-- CreateIndex
CREATE UNIQUE INDEX "case_note_case_client_id_idempotency_key_key" ON "case_note"("case_client_id", "idempotency_key");

-- ------------------------------------------------------------------------------------------- what Prisma cannot say
ALTER TABLE "case_note" ADD CONSTRAINT "case_note_subject_check" CHECK (("case_id" IS NULL) <> ("case_client_id" IS NULL));

CREATE OR REPLACE FUNCTION case_note_refuse_change() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  -- The subject's own removal (case_note_follow_case, after a demo reset deletes cases or clients): its row is already gone.
  IF TG_OP = 'DELETE' AND (
       (OLD.case_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public."runtime_case" c WHERE c.id = OLD.case_id))
    OR (OLD.case_client_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public."case_client" k WHERE k.id = OLD.case_client_id))) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'case_note: % is refused; a note is kept (an edit is a new version)', lower(TG_OP)
    USING ERRCODE = 'restrict_violation';
END $$;

CREATE OR REPLACE FUNCTION case_note_check_insert() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE s record; prev record; what text;
BEGIN
  -- What a foreign key would do: the subject (the case, or the case client) exists, and is held until this transaction
  -- ends (a delete waits).
  IF NEW.case_id IS NOT NULL THEN
    what := 'case';
    SELECT id, workspace_id, firm_key INTO s FROM "runtime_case" WHERE id = NEW.case_id FOR KEY SHARE;
  ELSE
    what := 'client';
    SELECT id, workspace_id, firm_key INTO s FROM "case_client" WHERE id = NEW.case_client_id FOR KEY SHARE;
  END IF;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'case_note: no % %', what, coalesce(NEW.case_id, NEW.case_client_id) USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF case_lookup.case_firm_id_of_key(s.firm_key) IS DISTINCT FROM NEW.firm_id THEN
    RAISE EXCEPTION 'case_note: firm % is not the firm of % %', NEW.firm_id, what, s.id USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.workspace_id IS DISTINCT FROM s.workspace_id THEN
    RAISE EXCEPTION 'case_note: workspace % is not the workspace of % %', NEW.workspace_id, what, s.id USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.version = 1 THEN
    IF EXISTS (SELECT 1 FROM "case_note" n WHERE n.note_key = NEW.note_key) THEN
      RAISE EXCEPTION 'case_note: note % already exists', NEW.note_key USING ERRCODE = 'unique_violation';
    END IF;
  ELSE
    SELECT case_id, case_client_id, firm_id, workspace_id, author INTO prev FROM "case_note" n WHERE n.note_key = NEW.note_key AND n.version = NEW.version - 1;
    IF NOT FOUND OR prev.case_id IS DISTINCT FROM NEW.case_id OR prev.case_client_id IS DISTINCT FROM NEW.case_client_id
       OR prev.firm_id <> NEW.firm_id OR prev.workspace_id <> NEW.workspace_id OR prev.author <> NEW.author THEN
      RAISE EXCEPTION 'case_note: version % of note % does not follow version % of the same note, subject and author', NEW.version, NEW.note_key, NEW.version - 1
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  NEW.created_at := now();   -- the database's time, never the writer's
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION case_note_follow_case() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  -- The cascade a foreign key would give (case_decision's), for a case and, since part 3, for a case client.
  IF TG_TABLE_NAME = 'case_client' THEN
    DELETE FROM "case_note" WHERE case_client_id = OLD.id;
  ELSE
    DELETE FROM "case_note" WHERE case_id = OLD.id;
  END IF;
  RETURN OLD;
END $$;
CREATE TRIGGER case_note_follow_client AFTER DELETE ON "case_client" FOR EACH ROW EXECUTE FUNCTION case_note_follow_case();
