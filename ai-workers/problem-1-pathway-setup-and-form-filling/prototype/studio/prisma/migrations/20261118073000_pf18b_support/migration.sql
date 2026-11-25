-- PF-18b (AG-16-63, AG16-16; SA-06 v3.15 AG16-16 row; P-559, P-600; schema file prisma/schema/platform-support.prisma,
-- owner Lead B (platform)): support tickets a firm's staff raise to us. New tables only (P-600: own file, own folder,
-- platform_support_ names); no existing table, column or row changes. The two keys, agent/support-ticket:create and
-- agent/support-ticket:list, are already on main (PF-3's 20261114015002_pf3_platform_tables, every starter role): this
-- migration adds no catalogue row. No foreign key to platform_firm or platform_staff: platform.prisma takes no edit while
-- #2009 is open (tech lead's condition), so platform_support_ticket_write proves the firm and the person instead.
--   * the tables of the row: platform_support_ticket, platform_support_message.
--   * rules Prisma cannot say, at the end: messages are insert-only (no update, delete or truncate: the database refuses
--     each); a ticket is never deleted or truncated and only its status (with updated_at) changes; the raiser and a
--     FIRM_STAFF author are staff of the row's own firm; a message's file keys are at most three and lie in its own
--     ticket's folder (support/<ticket id>/<n>, n 1 to 3, each once); the page is an app path of at most 300 characters
--     (letters, digits and - . _ ~ / %, not starting with //: no query string, no other site, no contact value); a body
--     is 1 to 5,000 characters with text in it; a CLOSED ticket never changes again and takes no message; updated_at
--     never goes back.
--   * PF-12's walls on both tables (forced policy, the firm-first gate); every trigger function runs as xr_wall_reader.
-- Rollback (in this order): DROP TABLE "platform_support_message", "platform_support_ticket"; DROP FUNCTION
--   platform_support_ticket_write(), platform_support_message_write(), platform_support_no_truncate(),
--   platform_support_has_text(text); DROP TYPE "PlatformSupportTicketStatus", "PlatformSupportAuthorKind"; delete this
--   folder's row from _prisma_migrations.

-- CreateEnum
CREATE TYPE "PlatformSupportTicketStatus" AS ENUM ('OPEN', 'WAITING_ON_FIRM', 'WAITING_ON_SUPPORT', 'CLOSED');

-- CreateEnum
CREATE TYPE "PlatformSupportAuthorKind" AS ENUM ('FIRM_STAFF', 'SUPPORT');

-- CreateTable
CREATE TABLE "platform_support_ticket" (
    "id" UUID NOT NULL,
    "firm_id" UUID NOT NULL,
    "raised_by" UUID NOT NULL,
    "page" TEXT NOT NULL,
    "status" "PlatformSupportTicketStatus" NOT NULL DEFAULT 'OPEN',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "platform_support_ticket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_support_message" (
    "id" UUID NOT NULL,
    "firm_id" UUID NOT NULL,
    "ticket_id" UUID NOT NULL,
    "author_kind" "PlatformSupportAuthorKind" NOT NULL,
    "author_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "file_keys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_support_message_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "platform_support_ticket_firm_id_raised_by_created_at_idx" ON "platform_support_ticket"("firm_id", "raised_by", "created_at");

-- CreateIndex
CREATE INDEX "platform_support_ticket_firm_id_created_at_idx" ON "platform_support_ticket"("firm_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "platform_support_ticket_firm_id_id_key" ON "platform_support_ticket"("firm_id", "id");

-- CreateIndex
CREATE INDEX "platform_support_message_firm_id_ticket_id_created_at_idx" ON "platform_support_message"("firm_id", "ticket_id", "created_at");

-- AddForeignKey
ALTER TABLE "platform_support_message" ADD CONSTRAINT "platform_support_message_firm_id_ticket_id_fkey" FOREIGN KEY ("firm_id", "ticket_id") REFERENCES "platform_support_ticket"("firm_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- ------------------------------------------------------------------------------------------- rules Prisma cannot say
-- Text: once blanks are removed, at least one letter, digit, punctuation mark or symbol; no control character but tab and
-- line breaks (a ticket is free text over lines). The service asks the same (support.ts hasText).
CREATE FUNCTION platform_support_has_text(t text) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT (regexp_replace(t, '[\u0009-\u000d \u0085 ­͏؜ᅟᅠ ᠎ -‏ -  -⁤⁦-⁯⠀　ㅤ︀-️﻿ﾠ]', '', 'g') COLLATE pg_c_utf8) ~ '[[:alpha:][:digit:][:punct:]]'
     AND t !~ '[\u0001-\u0008\u000b\u000c\u000e-\u001f\u007f-\u0084\u0086-\u009f]'
$$;

ALTER TABLE "platform_support_ticket"
  ADD CONSTRAINT "platform_support_ticket_page" CHECK (char_length(page) BETWEEN 1 AND 300 AND page ~ '^/[A-Za-z0-9._~/%-]*$' AND page !~ '^//');
ALTER TABLE "platform_support_message"
  ADD CONSTRAINT "platform_support_message_body" CHECK (char_length(body) BETWEEN 1 AND 5000 AND platform_support_has_text(body)),
  ADD CONSTRAINT "platform_support_message_files" CHECK (file_keys IS NOT NULL AND cardinality(file_keys) <= 3 AND array_position(file_keys, NULL) IS NULL),
  ADD CONSTRAINT "platform_support_message_author" CHECK ((author_kind = 'SUPPORT' AND author_id = 'support') OR (author_kind = 'FIRM_STAFF' AND author_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'));

-- A ticket: its raiser is staff of its firm (the firm row exists with them); never deleted; only status and updated_at change.
CREATE FUNCTION platform_support_ticket_write() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'platform_support_ticket: a support ticket is never deleted' USING ERRCODE = 'restrict_violation';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NOT EXISTS (SELECT 1 FROM "platform_staff" s WHERE s.firm_id = NEW.firm_id AND s.id = NEW.raised_by) THEN
      RAISE EXCEPTION 'platform_support_ticket: the raiser is not staff of this firm' USING ERRCODE = 'foreign_key_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.firm_id IS DISTINCT FROM OLD.firm_id OR NEW.raised_by IS DISTINCT FROM OLD.raised_by
     OR NEW.page IS DISTINCT FROM OLD.page OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'platform_support_ticket: only a ticket''s status changes' USING ERRCODE = 'restrict_violation';
  END IF;
  IF OLD.status = 'CLOSED' THEN   -- break m2: closed is final
    RAISE EXCEPTION 'platform_support_ticket: a closed ticket never changes' USING ERRCODE = 'restrict_violation';
  END IF;
  IF NEW.updated_at < OLD.updated_at THEN
    RAISE EXCEPTION 'platform_support_ticket: updated_at never goes back' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $fn$;
CREATE TRIGGER "platform_support_ticket_write" BEFORE INSERT OR UPDATE OR DELETE ON "platform_support_ticket" FOR EACH ROW EXECUTE FUNCTION platform_support_ticket_write();

-- A message: insert-only; a FIRM_STAFF author is staff of the firm; its file keys lie in its own ticket's folder only.
CREATE FUNCTION platform_support_message_write() RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE k text;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'platform_support_message: a support message is never changed or deleted' USING ERRCODE = 'restrict_violation';
  END IF;
  IF NEW.author_kind = 'FIRM_STAFF' AND NOT EXISTS (SELECT 1 FROM "platform_staff" s WHERE s.firm_id = NEW.firm_id AND s.id = NEW.author_id::uuid) THEN
    RAISE EXCEPTION 'platform_support_message: the author is not staff of this firm' USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM "platform_support_ticket" t WHERE t.firm_id = NEW.firm_id AND t.id = NEW.ticket_id AND t.status = 'CLOSED') THEN   -- break m2
    RAISE EXCEPTION 'platform_support_message: a closed ticket takes no message' USING ERRCODE = 'restrict_violation';
  END IF;
  IF NEW.file_keys IS NULL OR cardinality(NEW.file_keys) <> (SELECT count(DISTINCT x) FROM unnest(NEW.file_keys) x) THEN   -- break m9
    RAISE EXCEPTION 'platform_support_message: file keys are a list of distinct keys' USING ERRCODE = 'check_violation';
  END IF;
  FOREACH k IN ARRAY NEW.file_keys LOOP
    IF k !~ ('^support/' || NEW.ticket_id::text || '/[1-3]$') THEN
      RAISE EXCEPTION 'platform_support_message: a file key lies outside its own ticket''s folder' USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;
  RETURN NEW;
END $fn$;
CREATE TRIGGER "platform_support_message_write" BEFORE INSERT OR UPDATE OR DELETE ON "platform_support_message" FOR EACH ROW EXECUTE FUNCTION platform_support_message_write();

CREATE FUNCTION platform_support_no_truncate() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  RAISE EXCEPTION '%: support records are never truncated', TG_TABLE_NAME USING ERRCODE = 'restrict_violation';
END $fn$;
CREATE TRIGGER "platform_support_ticket_no_truncate" BEFORE TRUNCATE ON "platform_support_ticket" FOR EACH STATEMENT EXECUTE FUNCTION platform_support_no_truncate();
CREATE TRIGGER "platform_support_message_no_truncate" BEFORE TRUNCATE ON "platform_support_message" FOR EACH STATEMENT EXECUTE FUNCTION platform_support_no_truncate();

-- ------------------------------------------------------------------------------------------- PF-12's walls
-- Forced policy (firm_id = the session's firm) and the firm-first gate on both tables; every trigger function on them
-- runs as xr_wall_reader (tests/check_pf12_walls.ts). Table rights come by PF-12's default privileges.
ALTER TABLE "platform_support_ticket" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY "pf12_firm" ON "platform_support_ticket" USING ("firm_id" = platform_session_firm()) WITH CHECK ("firm_id" = platform_session_firm());
ALTER TABLE "platform_support_message" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY "pf12_firm" ON "platform_support_message" USING ("firm_id" = platform_session_firm()) WITH CHECK ("firm_id" = platform_session_firm());
CREATE TRIGGER "0_pf12_firm_first" BEFORE INSERT OR UPDATE ON "platform_support_ticket" FOR EACH ROW EXECUTE FUNCTION platform_firm_first('firm_id');
CREATE TRIGGER "0_pf12_firm_first" BEFORE INSERT OR UPDATE ON "platform_support_message" FOR EACH ROW EXECUTE FUNCTION platform_firm_first('firm_id');
DO $readers$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['platform_support_ticket_write()', 'platform_support_message_write()', 'platform_support_no_truncate()'] LOOP
    EXECUTE format('ALTER FUNCTION %s SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp', f);
    EXECUTE format('ALTER FUNCTION %s OWNER TO xr_wall_reader', f);
  END LOOP;
END
$readers$;
