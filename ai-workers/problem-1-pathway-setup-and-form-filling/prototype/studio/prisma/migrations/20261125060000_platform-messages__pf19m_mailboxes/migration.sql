-- PF-19m (R1.52 part 1, map row 52; BACKLOG row PF-19m; shape screens/R1.52/shape.md approved by Lead 5 on #3653; AG-10-3,
-- -4, -9, -12, -62, -69, SA-11-37; P-584 (3), P-600; schema file prisma/schema/platform-messages.prisma, owner Lead B): the
-- tables a connected mailbox fills. Additive only: four new tables and five new enums; no existing row, table or column
-- changes (platform.prisma gets one back-relation line).
--   * msg_mailbox: a firm mailbox (owner_staff_id empty) or one person's own; the credential is SecretBoxPort's sealed
--     value, never a token (check on its shape); one main address per firm, a firm mailbox (partial unique index + check);
--     one live mailbox per firm and address (partial unique index); CONNECTED needs a credential, DISCONNECTED has none.
--   * msg_email: the message never changes after insert, only its filing; filed kind and id together; only an unfiled email
--     may be deleted (the disconnect purge, AG-10-4); the same provider message twice in one mailbox is refused.
--   * msg_unmatched: one per email, goes with it on the purge (CASCADE on that key only); msg_address_link: lower-case
--     addresses, one link per address and record.
--   * break round 1 (screens/R1.52/break-report.md): an email is deleted only from a DISCONNECTED mailbox (the purge; so a
--     filed email cannot be un-filed, deleted and re-inserted with other words, M1, and an open Unmatched email of a live
--     mailbox is never dropped, m2); nothing enters or changes in a DISCONNECTED mailbox, and an insert takes a share lock
--     on its mailbox so a sync mid-run serialises with the disconnect (M2); the sealed credential has the real box's exact
--     shape (`fake1.` is the test box's, kept for the fakes' tests, m1); the "by" columns and the sync cursor take no free
--     text (m1); addresses are plain ASCII lower case (m3); an OPEN Unmatched entry is for an unfiled email, and its
--     suggestions are small (m4). Not yet here: erasure (PF-21d) of a person's filed email. Its own migration adds a branch
--     to msg_email_write's DELETE, gated on an erasing plat_data_request (review round 2 r2-m4), with its failing case.
--   * review round 2 (14c4b73): a DISCONNECTED mailbox's filed email can still be moved or un-filed (AG-10-83, SA-11-39;
--     R2-M1), only no new email enters; an insert takes the mailbox row FOR NO KEY UPDATE, so two syncs of one mailbox
--     queue instead of deadlocking on a cursor update and a disconnect waits for a sync mid-run (r2-m1); an email with an
--     OPEN Unmatched entry is filed only once that entry is resolved (r2-m2); the "by" columns take AuditActor's four
--     words, an id without dots or slashes (r2-m3); TRUNCATE says what it refuses (n1). The cursor check fits Gmail's
--     history id and an IMAP UID pair; Microsoft's delta link (deferred, P-621) widens it in its own migration (n2).
--   * break round 2 (14c4b73): an email once filed is never purged, even un-filed (was_filed, set only by the trigger; n1);
--     the Unmatched entry rules close its other ways in (n5); the credential cap fits the box's largest seal (n7). Left to
--     the parts that write, with their own failing cases: the disconnect's purge runs at READ COMMITTED (a REPEATABLE READ
--     purge misses an email inserted while it waited; n2); a writer that also updates the mailbox row locks it first or
--     retries 40P01 (n3).
--   * left to the app, named here (review m4, m7): a personal mailbox's unfiled email is shown only to its owner (AG-10-69;
--     PF-19mi's routes, with a failing case there); moving the main address is unset-then-set in one transaction (PF-19mc).
--   * every function is msg_mailbox_ / msg_email_ / msg_unmatched_ (area prefix msg_, rows rev 15.2); PF-12's walls on all
--     four; the functions are owned by xr_wall_reader with its CREATE granted and taken back around it (RDS, P-8b F4).
-- Rollback (in this order): DROP TABLE "msg_address_link", "msg_unmatched", "msg_email", "msg_mailbox"; DROP FUNCTION
--   msg_mailbox_write(), msg_email_write(), msg_unmatched_write(), msg_mailbox_no_truncate(); DROP TYPE "MsgUnmatchedState", "MsgFiledBy", "MsgEmailDirection",
--   "MsgMailboxStatus", "MsgMailboxProvider"; delete this folder's row from _prisma_migrations.
-- Prisma's DDL (prisma migrate diff), then the rules.
CREATE TYPE "MsgMailboxProvider" AS ENUM ('GOOGLE', 'MICROSOFT', 'IMAP');

CREATE TYPE "MsgMailboxStatus" AS ENUM ('PENDING', 'CONNECTED', 'FAILED', 'DISCONNECTED');

CREATE TYPE "MsgEmailDirection" AS ENUM ('INBOUND', 'OUTBOUND');

CREATE TYPE "MsgFiledBy" AS ENUM ('RULE', 'STAFF');

CREATE TYPE "MsgUnmatchedState" AS ENUM ('OPEN', 'LINKED', 'DISMISSED');

CREATE TABLE "msg_mailbox" (
    "id" UUID NOT NULL,
    "firm_id" UUID NOT NULL,
    "owner_staff_id" UUID,
    "provider" "MsgMailboxProvider" NOT NULL,
    "address" TEXT NOT NULL,
    "is_main" BOOLEAN NOT NULL DEFAULT false,
    "status" "MsgMailboxStatus" NOT NULL DEFAULT 'PENDING',
    "credential" TEXT,
    "sync_cursor" TEXT,
    "last_checked_at" TIMESTAMPTZ,
    "last_error_code" TEXT,
    "connected_by" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "msg_mailbox_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "msg_email" (
    "id" UUID NOT NULL,
    "firm_id" UUID NOT NULL,
    "mailbox_id" UUID NOT NULL,
    "direction" "MsgEmailDirection" NOT NULL,
    "provider_message_id" TEXT NOT NULL,
    "rfc_message_id" TEXT,
    "in_reply_to" TEXT,
    "references" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "thread_key" TEXT NOT NULL,
    "from_address" TEXT NOT NULL,
    "to_addresses" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "cc_addresses" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "subject" TEXT,
    "sent_at" TIMESTAMPTZ NOT NULL,
    "body_file_key" TEXT,
    "attachment_file_keys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "via_address" TEXT,
    "filed_kind" TEXT,
    "filed_id" UUID,
    "filed_by" "MsgFiledBy",
    "filed_rule" TEXT,
    "filed_at" TIMESTAMPTZ,
    "was_filed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "msg_email_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "msg_unmatched" (
    "id" UUID NOT NULL,
    "firm_id" UUID NOT NULL,
    "email_id" UUID NOT NULL,
    "suggestions" JSONB NOT NULL DEFAULT '[]',
    "state" "MsgUnmatchedState" NOT NULL DEFAULT 'OPEN',
    "resolved_by" TEXT,
    "resolved_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "msg_unmatched_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "msg_address_link" (
    "id" UUID NOT NULL,
    "firm_id" UUID NOT NULL,
    "address" TEXT NOT NULL,
    "record_kind" TEXT NOT NULL,
    "record_id" UUID NOT NULL,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "msg_address_link_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "msg_mailbox_firm_id_owner_staff_id_idx" ON "msg_mailbox"("firm_id", "owner_staff_id");

CREATE INDEX "msg_mailbox_firm_id_status_idx" ON "msg_mailbox"("firm_id", "status");

CREATE UNIQUE INDEX "msg_mailbox_firm_id_id_key" ON "msg_mailbox"("firm_id", "id");

CREATE INDEX "msg_email_firm_id_rfc_message_id_idx" ON "msg_email"("firm_id", "rfc_message_id");

CREATE INDEX "msg_email_firm_id_thread_key_idx" ON "msg_email"("firm_id", "thread_key");

CREATE INDEX "msg_email_firm_id_filed_kind_filed_id_sent_at_idx" ON "msg_email"("firm_id", "filed_kind", "filed_id", "sent_at");

CREATE UNIQUE INDEX "msg_email_firm_id_id_key" ON "msg_email"("firm_id", "id");

CREATE UNIQUE INDEX "msg_email_firm_id_mailbox_id_provider_message_id_key" ON "msg_email"("firm_id", "mailbox_id", "provider_message_id");

CREATE INDEX "msg_unmatched_firm_id_state_created_at_idx" ON "msg_unmatched"("firm_id", "state", "created_at");

CREATE UNIQUE INDEX "msg_unmatched_firm_id_email_id_key" ON "msg_unmatched"("firm_id", "email_id");

CREATE UNIQUE INDEX "msg_address_link_firm_id_address_record_kind_record_id_key" ON "msg_address_link"("firm_id", "address", "record_kind", "record_id");

ALTER TABLE "msg_mailbox" ADD CONSTRAINT "msg_mailbox_firm_id_fkey" FOREIGN KEY ("firm_id") REFERENCES "msg_firm"("firm_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "msg_mailbox" ADD CONSTRAINT "msg_mailbox_firm_id_owner_staff_id_fkey" FOREIGN KEY ("firm_id", "owner_staff_id") REFERENCES "platform_staff"("firm_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "msg_email" ADD CONSTRAINT "msg_email_firm_id_fkey" FOREIGN KEY ("firm_id") REFERENCES "msg_firm"("firm_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "msg_email" ADD CONSTRAINT "msg_email_firm_id_mailbox_id_fkey" FOREIGN KEY ("firm_id", "mailbox_id") REFERENCES "msg_mailbox"("firm_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "msg_unmatched" ADD CONSTRAINT "msg_unmatched_firm_id_fkey" FOREIGN KEY ("firm_id") REFERENCES "msg_firm"("firm_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "msg_unmatched" ADD CONSTRAINT "msg_unmatched_firm_id_email_id_fkey" FOREIGN KEY ("firm_id", "email_id") REFERENCES "msg_email"("firm_id", "id") ON DELETE CASCADE ON UPDATE RESTRICT;

ALTER TABLE "msg_address_link" ADD CONSTRAINT "msg_address_link_firm_id_fkey" FOREIGN KEY ("firm_id") REFERENCES "msg_firm"("firm_id") ON DELETE RESTRICT ON UPDATE RESTRICT;
-- ------------------------------------------------------------------------------------------------ rules Prisma cannot say
-- SQLSTATE 23514 (check_violation) for a broken rule.
CREATE UNIQUE INDEX "msg_mailbox_one_main" ON "msg_mailbox"("firm_id") WHERE "is_main";
CREATE UNIQUE INDEX "msg_mailbox_one_live_address" ON "msg_mailbox"("firm_id", "address") WHERE "status" <> 'DISCONNECTED';
ALTER TABLE "msg_mailbox"
  -- Plain ASCII lower case (break m3: no invisible or look-alike letters beside a live address).
  ADD CONSTRAINT "msg_mailbox_address_check" CHECK (msg_address_ok('EMAIL', "address")),
  -- AG-10-62: the main address is the firm's own mailbox, never a person's.
  ADD CONSTRAINT "msg_mailbox_main_check" CHECK (NOT "is_main" OR "owner_staff_id" IS NULL),
  -- AG-16-18: a SecretBoxPort sealed value (ports/secret-box.ts SealedSecret), never a raw token.
  -- The real box's exact form, sb1.v<n>.<iv 12 bytes>.<tag 16 bytes>.<ciphertext> in base64url (secret-box/aes-gcm.ts), or the
  -- test box's fake1.v<n>.<one part> (ports/secret-box.ts fakeSecretBox, tests only).
  ADD CONSTRAINT "msg_mailbox_credential_check" CHECK ("credential" IS NULL OR (("credential" ~ '^sb1\.v[1-9][0-9]{0,5}\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]+$' OR "credential" ~ '^fake1\.v[1-9][0-9]{0,5}\.[A-Za-z0-9_-]+$') AND length("credential") <= 48000)),
  -- A provider's cursor (Gmail's history id, an IMAP UID pair), never free text (break m1).
  ADD CONSTRAINT "msg_mailbox_cursor_check" CHECK ("sync_cursor" IS NULL OR "sync_cursor" ~ '^[0-9]{1,30}(:[0-9]{1,30})?$'),
  ADD CONSTRAINT "msg_mailbox_by_check" CHECK ("connected_by" ~ '^(staff|ourstaff|system|seed):[A-Za-z0-9][A-Za-z0-9_:-]{0,99}(\.[A-Za-z0-9][A-Za-z0-9_:-]{0,99}){0,3}$'),
  ADD CONSTRAINT "msg_mailbox_status_check" CHECK (("status" <> 'CONNECTED' OR "credential" IS NOT NULL) AND ("status" <> 'DISCONNECTED' OR ("credential" IS NULL AND NOT "is_main"))),
  ADD CONSTRAINT "msg_mailbox_error_check" CHECK ("last_error_code" IS NULL OR ("last_error_code" ~ '^[a-z][a-z0-9_]*$' AND length("last_error_code") <= 64));
ALTER TABLE "msg_email"
  ADD CONSTRAINT "msg_email_filed_check" CHECK (
    ("filed_kind" IS NULL AND "filed_id" IS NULL AND "filed_by" IS NULL AND "filed_rule" IS NULL AND "filed_at" IS NULL)
    OR ("filed_kind" IS NOT NULL AND "filed_id" IS NOT NULL AND "filed_by" IS NOT NULL AND "filed_at" IS NOT NULL AND ("filed_by" = 'RULE') = ("filed_rule" IS NOT NULL))),
  ADD CONSTRAINT "msg_email_kind_check" CHECK ("filed_kind" IS NULL OR ("filed_kind" ~ '^[a-z][a-z0-9]*(-[a-z0-9]+)*$' AND length("filed_kind") <= 64)),
  ADD CONSTRAINT "msg_email_rule_check" CHECK ("filed_rule" IS NULL OR ("filed_rule" ~ '^[a-z][a-z0-9]*(-[a-z0-9]+)*$' AND length("filed_rule") <= 64)),
  ADD CONSTRAINT "msg_email_from_check" CHECK ("from_address" = lower("from_address") AND length("from_address") <= 320),
  ADD CONSTRAINT "msg_email_to_check" CHECK (array_to_string("to_addresses", ' ') = lower(array_to_string("to_addresses", ' ')) AND array_to_string("cc_addresses", ' ') = lower(array_to_string("cc_addresses", ' ')) AND ("via_address" IS NULL OR "via_address" = lower("via_address"))),
  ADD CONSTRAINT "msg_email_arrays_check" CHECK ("references" IS NOT NULL AND "to_addresses" IS NOT NULL AND "cc_addresses" IS NOT NULL AND "attachment_file_keys" IS NOT NULL);
ALTER TABLE "msg_unmatched"
  ADD CONSTRAINT "msg_unmatched_suggestions_check" CHECK (jsonb_typeof("suggestions") = 'array' AND jsonb_array_length("suggestions") <= 20 AND length("suggestions"::text) <= 4000),
  ADD CONSTRAINT "msg_unmatched_by_check" CHECK ("resolved_by" IS NULL OR "resolved_by" ~ '^(staff|ourstaff|system|seed):[A-Za-z0-9][A-Za-z0-9_:-]{0,99}(\.[A-Za-z0-9][A-Za-z0-9_:-]{0,99}){0,3}$'),
  ADD CONSTRAINT "msg_unmatched_resolved_check" CHECK (("state" = 'OPEN') = ("resolved_by" IS NULL AND "resolved_at" IS NULL));
ALTER TABLE "msg_address_link"
  ADD CONSTRAINT "msg_address_link_address_check" CHECK (msg_address_ok('EMAIL', "address")),
  ADD CONSTRAINT "msg_address_link_by_check" CHECK ("created_by" ~ '^(staff|ourstaff|system|seed):[A-Za-z0-9][A-Za-z0-9_:-]{0,99}(\.[A-Za-z0-9][A-Za-z0-9_:-]{0,99}){0,3}$'),
  ADD CONSTRAINT "msg_address_link_kind_check" CHECK ("record_kind" ~ '^[a-z][a-z0-9]*(-[a-z0-9]+)*$' AND length("record_kind") <= 64);
-- A mailbox stays its firm's, its owner's, its provider's and its address's; DISCONNECTED is final.
CREATE FUNCTION msg_mailbox_write() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'msg_mailbox: a mailbox is disconnected, never deleted' USING ERRCODE = 'check_violation';
  END IF;
  IF (NEW.id, NEW.firm_id, NEW.owner_staff_id, NEW.provider, NEW.address, NEW.connected_by, NEW.created_at) IS DISTINCT FROM (OLD.id, OLD.firm_id, OLD.owner_staff_id, OLD.provider, OLD.address, OLD.connected_by, OLD.created_at) THEN
    RAISE EXCEPTION 'msg_mailbox: who owns a mailbox, its provider and its address never change' USING ERRCODE = 'check_violation';
  END IF;
  -- A disconnected mailbox is final: nothing on it changes again (break M2: no sync cursor or check after the disconnect).
  IF OLD.status = 'DISCONNECTED' AND (NEW.status, NEW.is_main, NEW.credential, NEW.sync_cursor, NEW.last_checked_at, NEW.last_error_code) IS DISTINCT FROM (OLD.status, OLD.is_main, OLD.credential, OLD.sync_cursor, OLD.last_checked_at, OLD.last_error_code) THEN
    RAISE EXCEPTION 'msg_mailbox: a disconnected mailbox stays as it is (connect again is a new row)' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER msg_mailbox_write BEFORE UPDATE OR DELETE ON "msg_mailbox" FOR EACH ROW EXECUTE FUNCTION msg_mailbox_write();
-- An email's message never changes; only its filing does, in any mailbox (a disconnected one's filed email is still moved
-- or un-filed: R2-M1). An email enters only a mailbox that is not DISCONNECTED: the insert locks the mailbox row FOR NO KEY
-- UPDATE, so a sync mid-run and the disconnect run one after the other (break M2) and two syncs of one mailbox queue
-- (r2-m1). It leaves only by the purge: unfiled, from a DISCONNECTED mailbox (break M1, m2); DISCONNECTED is final, so the
-- delete needs no lock. Filing an email that has an OPEN Unmatched entry waits for that entry to be resolved (r2-m2).
CREATE FUNCTION msg_email_write() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE st text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.was_filed := NEW.filed_id IS NOT NULL;
    SELECT m.status::text INTO st FROM msg_mailbox m WHERE m.firm_id = NEW.firm_id AND m.id = NEW.mailbox_id FOR NO KEY UPDATE;
    IF st = 'DISCONNECTED' THEN
      RAISE EXCEPTION 'msg_email: a disconnected mailbox takes no new email' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  SELECT m.status::text INTO st FROM msg_mailbox m WHERE m.firm_id = OLD.firm_id AND m.id = OLD.mailbox_id;
  IF TG_OP = 'DELETE' THEN
    IF OLD.filed_id IS NOT NULL OR OLD.was_filed THEN
      RAISE EXCEPTION 'msg_email: a filed email is kept (only unfiled email is purged)' USING ERRCODE = 'check_violation';
    END IF;
    IF st IS DISTINCT FROM 'DISCONNECTED' THEN
      RAISE EXCEPTION 'msg_email: email is purged only when its mailbox is disconnected' USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
  END IF;
  IF (NEW.id, NEW.firm_id, NEW.mailbox_id, NEW.direction, NEW.provider_message_id, NEW.rfc_message_id, NEW.in_reply_to, NEW."references", NEW.thread_key, NEW.from_address, NEW.to_addresses, NEW.cc_addresses, NEW.subject, NEW.sent_at, NEW.body_file_key, NEW.attachment_file_keys, NEW.via_address, NEW.created_at)
     IS DISTINCT FROM (OLD.id, OLD.firm_id, OLD.mailbox_id, OLD.direction, OLD.provider_message_id, OLD.rfc_message_id, OLD.in_reply_to, OLD."references", OLD.thread_key, OLD.from_address, OLD.to_addresses, OLD.cc_addresses, OLD.subject, OLD.sent_at, OLD.body_file_key, OLD.attachment_file_keys, OLD.via_address, OLD.created_at) THEN
    RAISE EXCEPTION 'msg_email: only an email''s filing changes' USING ERRCODE = 'check_violation';
  END IF;
  -- Once filed, always kept (break round 2 n1): un-filing never makes an email purgeable.
  NEW.was_filed := OLD.was_filed OR NEW.filed_id IS NOT NULL;
  IF NEW.filed_id IS NOT NULL AND (NEW.filed_kind, NEW.filed_id) IS DISTINCT FROM (OLD.filed_kind, OLD.filed_id)
     AND EXISTS (SELECT 1 FROM msg_unmatched u WHERE u.firm_id = NEW.firm_id AND u.email_id = NEW.id AND u.state = 'OPEN') THEN
    RAISE EXCEPTION 'msg_email: resolve its open Unmatched entry before filing it' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER msg_email_write BEFORE INSERT OR UPDATE OR DELETE ON "msg_email" FOR EACH ROW EXECUTE FUNCTION msg_email_write();
-- An OPEN Unmatched entry is for an email nobody has filed (break m4); it stays its email's, a resolved entry never
-- re-opens, and an OPEN entry is never deleted on its own (AG-10-12 "never dropped"; break round 2 n5): it goes only with
-- its email, by the purge's cascade (pg_trigger_depth() > 1 there).
CREATE FUNCTION msg_unmatched_write() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.state = 'OPEN' AND pg_trigger_depth() <= 1 THEN
      RAISE EXCEPTION 'msg_unmatched: an open entry is never dropped (link it or dismiss it)' USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' AND (NEW.email_id IS DISTINCT FROM OLD.email_id OR (OLD.state <> 'OPEN' AND NEW.state = 'OPEN')) THEN
    RAISE EXCEPTION 'msg_unmatched: an entry stays its email''s, and a resolved one never re-opens' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.state = 'OPEN' AND EXISTS (SELECT 1 FROM msg_email e WHERE e.firm_id = NEW.firm_id AND e.id = NEW.email_id AND e.filed_id IS NOT NULL) THEN
    RAISE EXCEPTION 'msg_unmatched: an open entry is for an unfiled email' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER msg_unmatched_write BEFORE INSERT OR UPDATE OR DELETE ON "msg_unmatched" FOR EACH ROW EXECUTE FUNCTION msg_unmatched_write();
-- Kept rows are never emptied wholesale (review m10, n1).
CREATE FUNCTION msg_mailbox_no_truncate() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '%: TRUNCATE refused (a mailbox is disconnected and its unfiled email purged, row by row)', TG_TABLE_NAME USING ERRCODE = 'restrict_violation';
END $$;
CREATE TRIGGER "msg_mailbox_no_truncate" BEFORE TRUNCATE ON "msg_mailbox" FOR EACH STATEMENT EXECUTE FUNCTION msg_mailbox_no_truncate();
CREATE TRIGGER "msg_email_no_truncate" BEFORE TRUNCATE ON "msg_email" FOR EACH STATEMENT EXECUTE FUNCTION msg_mailbox_no_truncate();
CREATE TRIGGER "msg_unmatched_no_truncate" BEFORE TRUNCATE ON "msg_unmatched" FOR EACH STATEMENT EXECUTE FUNCTION msg_mailbox_no_truncate();
CREATE TRIGGER "msg_address_link_no_truncate" BEFORE TRUNCATE ON "msg_address_link" FOR EACH STATEMENT EXECUTE FUNCTION msg_mailbox_no_truncate();
-- ------------------------------------------------------------------------------------------------------ PF-12's walls
ALTER TABLE "msg_mailbox" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
ALTER TABLE "msg_email" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
ALTER TABLE "msg_unmatched" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
ALTER TABLE "msg_address_link" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY "pf12_firm" ON "msg_mailbox" USING ("firm_id" = platform_session_firm()) WITH CHECK ("firm_id" = platform_session_firm());
CREATE POLICY "pf12_firm" ON "msg_email" USING ("firm_id" = platform_session_firm()) WITH CHECK ("firm_id" = platform_session_firm());
CREATE POLICY "pf12_firm" ON "msg_unmatched" USING ("firm_id" = platform_session_firm()) WITH CHECK ("firm_id" = platform_session_firm());
CREATE POLICY "pf12_firm" ON "msg_address_link" USING ("firm_id" = platform_session_firm()) WITH CHECK ("firm_id" = platform_session_firm());
CREATE TRIGGER "0_pf12_firm_first" BEFORE INSERT OR UPDATE ON "msg_mailbox" FOR EACH ROW EXECUTE FUNCTION platform_firm_first('firm_id');
CREATE TRIGGER "0_pf12_firm_first" BEFORE INSERT OR UPDATE ON "msg_email" FOR EACH ROW EXECUTE FUNCTION platform_firm_first('firm_id');
CREATE TRIGGER "0_pf12_firm_first" BEFORE INSERT OR UPDATE ON "msg_unmatched" FOR EACH ROW EXECUTE FUNCTION platform_firm_first('firm_id');
CREATE TRIGGER "0_pf12_firm_first" BEFORE INSERT OR UPDATE ON "msg_address_link" FOR EACH ROW EXECUTE FUNCTION platform_firm_first('firm_id');
GRANT CREATE ON SCHEMA public TO xr_wall_reader;
ALTER FUNCTION msg_mailbox_write() SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION msg_mailbox_write() OWNER TO xr_wall_reader;
ALTER FUNCTION msg_email_write() SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION msg_email_write() OWNER TO xr_wall_reader;
ALTER FUNCTION msg_unmatched_write() SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION msg_unmatched_write() OWNER TO xr_wall_reader;
ALTER FUNCTION msg_mailbox_no_truncate() SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION msg_mailbox_no_truncate() OWNER TO xr_wall_reader;
REVOKE CREATE ON SCHEMA public FROM xr_wall_reader;
