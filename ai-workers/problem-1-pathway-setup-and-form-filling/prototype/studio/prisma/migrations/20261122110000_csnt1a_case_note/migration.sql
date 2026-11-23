-- CS-NT1 part 1 (map row 76, the case half; design/briefs/CS-NT1.md, build-lead-c-briefs/CS-NT1-1.md; AG-13-20, AG-13-21,
-- AG-13-23, AG-13-24): plain notes on a case. Owner: the release Lead (case side), case-notes.prisma. Additive: one new
-- table, its functions (every one named case_note_*) and triggers; one AFTER DELETE trigger on runtime_case (its notes go
-- with it). No existing row or column changes. Prisma's DDL first, then what Prisma cannot say:
--   * case_note is insert-only: UPDATE, DELETE and TRUNCATE are refused. An edit, a pin or unpin and a visibility change
--     each write the next version of the note's key (version n+1 after version n, same case, firm, workspace and author).
--     Rows go only with their case: a DELETE is let through once the case row itself is gone, as case_decision's.
--   * No foreign key to runtime_case (that needs a Prisma relation, so a back-relation line on cases.prisma's Case, which
--     CS-K1 holds next): the insert trigger does what the key would. It holds the case row FOR KEY SHARE (the lock a
--     foreign key check takes, so a case delete waits for the note's transaction), refuses a case that does not exist,
--     and the case's AFTER DELETE trigger removes its notes (the cascade case_decision has).
--   * a new row names its case's own firm (case_lookup.case_firm_id_of_key(runtime_case.firm_key): the one lookup past
--     PF-12's wall on platform_firm, CS-W1) and the case's workspace; created_at is the database's clock.
--   * text: 1-5,000 characters after trim, no control, direction-mark or hidden character but tab, line feed and carriage
--     return (C0, DEL, C1, U+061C, U+180E, U+200B, U+200E, U+200F, U+2028-U+202E, U+2060-U+2064, U+2066-U+2069, U+FEFF, tags); visibility
--     INTERNAL or CLIENT_VISIBLE; an idempotency key only on version 1, always with its fingerprint.
-- Rollback (in this order): DROP TRIGGER case_note_follow_case ON "runtime_case"; DROP TABLE "case_note"; DROP FUNCTION
--   case_note_follow_case(), case_note_check_insert(), case_note_refuse_change(); then delete this folder's row from
--   _prisma_migrations. Every note is lost (export them first).

-- CreateTable
CREATE TABLE "case_note" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "firm_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "case_id" UUID NOT NULL,
    "note_key" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "visibility" TEXT NOT NULL DEFAULT 'INTERNAL',
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "author" TEXT NOT NULL,
    "by_actor" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "idempotency_key" TEXT,
    "idempotency_fingerprint" VARCHAR(64),

    CONSTRAINT "case_note_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "case_note_case_id_note_key_version_idx" ON "case_note"("case_id", "note_key", "version");

-- CreateIndex
CREATE UNIQUE INDEX "case_note_note_key_version_key" ON "case_note"("note_key", "version");

-- CreateIndex
CREATE UNIQUE INDEX "case_note_case_id_idempotency_key_key" ON "case_note"("case_id", "idempotency_key");

-- ------------------------------------------------------------------------------------------- what Prisma cannot say
ALTER TABLE "case_note"
  ADD CONSTRAINT "case_note_visibility_check" CHECK ("visibility" IN ('INTERNAL', 'CLIENT_VISIBLE')),
  ADD CONSTRAINT "case_note_version_check" CHECK ("version" >= 1),
  ADD CONSTRAINT "case_note_text_check" CHECK (
    char_length("text") <= 5000 AND char_length(btrim("text", E' \t\n\r')) >= 1
    AND "text" !~ '[\u0001-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u061c\u180e\u200b\u200e\u200f\u2028-\u202e\u2060-\u2064\u2066-\u2069\ufeff\U000e0000-\U000e007f]'),
  ADD CONSTRAINT "case_note_actor_check" CHECK (length(btrim("author")) > 0 AND length(btrim("by_actor")) > 0),
  ADD CONSTRAINT "case_note_idempotency_check" CHECK (
    ("idempotency_key" IS NULL) = ("idempotency_fingerprint" IS NULL) AND ("idempotency_key" IS NULL OR "version" = 1));

CREATE FUNCTION case_note_refuse_change() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  -- The case's own removal (case_note_follow_case, after a demo reset deletes cases): the case row is already gone.
  IF TG_OP = 'DELETE' AND NOT EXISTS (SELECT 1 FROM public."runtime_case" c WHERE c.id = OLD.case_id) THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'case_note: % is refused; a note is kept (an edit is a new version)', lower(TG_OP)
    USING ERRCODE = 'restrict_violation';
END $$;
CREATE TRIGGER case_note_no_update BEFORE UPDATE ON "case_note" FOR EACH ROW EXECUTE FUNCTION case_note_refuse_change();
CREATE TRIGGER case_note_no_delete BEFORE DELETE ON "case_note" FOR EACH ROW EXECUTE FUNCTION case_note_refuse_change();
CREATE TRIGGER case_note_no_truncate BEFORE TRUNCATE ON "case_note" FOR EACH STATEMENT EXECUTE FUNCTION case_note_refuse_change();

CREATE FUNCTION case_note_check_insert() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE c record; prev record;
BEGIN
  -- What a foreign key would do: the case exists, and is held until this transaction ends (a delete waits).
  SELECT id, workspace_id, firm_key INTO c FROM "runtime_case" WHERE id = NEW.case_id FOR KEY SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'case_note: no case %', NEW.case_id USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF case_lookup.case_firm_id_of_key(c.firm_key) IS DISTINCT FROM NEW.firm_id THEN
    RAISE EXCEPTION 'case_note: firm % is not the firm of case %', NEW.firm_id, NEW.case_id USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.workspace_id IS DISTINCT FROM c.workspace_id THEN
    RAISE EXCEPTION 'case_note: workspace % is not the workspace of case %', NEW.workspace_id, NEW.case_id USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.version = 1 THEN
    IF EXISTS (SELECT 1 FROM "case_note" n WHERE n.note_key = NEW.note_key) THEN
      RAISE EXCEPTION 'case_note: note % already exists', NEW.note_key USING ERRCODE = 'unique_violation';
    END IF;
  ELSE
    SELECT case_id, firm_id, workspace_id, author INTO prev FROM "case_note" n WHERE n.note_key = NEW.note_key AND n.version = NEW.version - 1;
    IF NOT FOUND OR prev.case_id <> NEW.case_id OR prev.firm_id <> NEW.firm_id OR prev.workspace_id <> NEW.workspace_id OR prev.author <> NEW.author THEN
      RAISE EXCEPTION 'case_note: version % of note % does not follow version % of the same note, case and author', NEW.version, NEW.note_key, NEW.version - 1
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  NEW.created_at := now();   -- the database's time, never the writer's
  RETURN NEW;
END $$;
CREATE TRIGGER case_note_insert BEFORE INSERT ON "case_note" FOR EACH ROW EXECUTE FUNCTION case_note_check_insert();

CREATE FUNCTION case_note_follow_case() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  DELETE FROM "case_note" WHERE case_id = OLD.id;   -- the cascade a foreign key would give (case_decision's)
  RETURN OLD;
END $$;
CREATE TRIGGER case_note_follow_case AFTER DELETE ON "runtime_case" FOR EACH ROW EXECUTE FUNCTION case_note_follow_case();
