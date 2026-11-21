-- PF-18n part 1 (BACKLOG row PF-18n, brief design/lead-b-briefs/PF-18n1.md; AG-7-39 r2, r10; AG16-60; P-600; schema file
-- prisma/schema/platform-messages.prisma, owner Lead B): the in-app notification store behind NotificationPort. Additive only:
-- one new table; no existing row, table or column changes.
--   * new: msg_notification, one row per person, item and kind (unique key); a repeat sets read_at back to empty and created_at
--     to now (api/src/platform/notifications/store.ts), never a second row.
--   * real keys, RESTRICT both ways: firm_id → platform_firm(id); (firm_id, staff_id) → platform_staff(firm_id, id), so a row
--     never points at another firm's person (the PF-18bk pattern). platform.prisma gets two back-relation lines only.
--   * ids only (AG-7-39 r10): kind and item_kind are PF-18np's kebab-case names, group one of its eight; no text column.
--   * after insert only read_at and created_at change (created_at never earlier); no delete or truncate by the app (part 2's 90-day job will add its own).
--   * every function is msg_notification_ (area prefix msg_, rows rev 15.2).
-- Rollback (in this order): DROP TABLE "msg_notification"; DROP FUNCTION msg_notification_write(); delete this folder's row from
--   _prisma_migrations.
-- Prisma's DDL (prisma migrate diff), then the rules.
CREATE TABLE "msg_notification" (
    "id" UUID NOT NULL,
    "firm_id" UUID NOT NULL,
    "staff_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "group" TEXT NOT NULL,
    "item_kind" TEXT NOT NULL,
    "item_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "read_at" TIMESTAMPTZ,

    CONSTRAINT "msg_notification_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "msg_notification_firm_id_staff_id_created_at_idx" ON "msg_notification"("firm_id", "staff_id", "created_at");
CREATE UNIQUE INDEX "msg_notification_firm_id_staff_id_item_kind_item_id_kind_key" ON "msg_notification"("firm_id", "staff_id", "item_kind", "item_id", "kind");
ALTER TABLE "msg_notification" ADD CONSTRAINT "msg_notification_firm_id_fkey" FOREIGN KEY ("firm_id") REFERENCES "platform_firm"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "msg_notification" ADD CONSTRAINT "msg_notification_firm_id_staff_id_fkey" FOREIGN KEY ("firm_id", "staff_id") REFERENCES "platform_staff"("firm_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
-- ------------------------------------------------------------------------------------------------ rules Prisma cannot say
-- SQLSTATE 23514 (check_violation) for a broken rule; the keys give 23503 for a person who is not the firm's.
ALTER TABLE "msg_notification"
  -- PF-18np's names: kebab-case codes, never words (AG-7-39 r10). A new kind is a line in ports/notifications.ts, no migration.
  ADD CONSTRAINT "msg_notification_kind_check" CHECK ("kind" ~ '^[a-z][a-z0-9]*(-[a-z0-9]+)*$' AND length("kind") <= 64),
  ADD CONSTRAINT "msg_notification_item_kind_check" CHECK ("item_kind" ~ '^[a-z][a-z0-9]*(-[a-z0-9]+)*$' AND length("item_kind") <= 64),
  -- The eight groups of AG-16 §3.3 (PF-18np's NotificationGroup; the same list as platform_notification_preference_group_check).
  ADD CONSTRAINT "msg_notification_group_check" CHECK ("group" IN ('WORK_HANDED_TO_ME', 'NEEDS_YOU', 'MY_DEADLINES', 'CLIENT_MESSAGED_ME', 'MENTIONS', 'TEAM_WATCH', 'PAYMENTS', 'FIRM_AND_CONNECTIONS')),
  -- A row is never read before it was made.
  ADD CONSTRAINT "msg_notification_read_check" CHECK ("read_at" IS NULL OR "read_at" >= "created_at");
-- A row stays its firm's, person's, kind's and item's: only read_at and created_at change, and created_at only forwards.
CREATE FUNCTION msg_notification_write() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.id, NEW.firm_id, NEW.staff_id, NEW.kind, NEW."group", NEW.item_kind, NEW.item_id) IS DISTINCT FROM (OLD.id, OLD.firm_id, OLD.staff_id, OLD.kind, OLD."group", OLD.item_kind, OLD.item_id) THEN
    RAISE EXCEPTION 'msg_notification: only read_at and created_at of a row change' USING ERRCODE = 'check_violation';
  END IF;
  -- A repeat surfaces a row again; it never moves it back in time (breaker m2).
  IF NEW.created_at < OLD.created_at THEN
    RAISE EXCEPTION 'msg_notification: created_at never moves earlier' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER msg_notification_write BEFORE UPDATE ON "msg_notification" FOR EACH ROW EXECUTE FUNCTION msg_notification_write();
REVOKE UPDATE, DELETE, TRUNCATE ON "msg_notification" FROM xr_data; GRANT UPDATE ("read_at", "created_at") ON "msg_notification" TO xr_data;
-- ------------------------------------------------------------------------------------------------------ PF-12's walls
ALTER TABLE "msg_notification" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY "pf12_firm" ON "msg_notification" USING ("firm_id" = platform_session_firm()) WITH CHECK ("firm_id" = platform_session_firm());
CREATE TRIGGER "0_pf12_firm_first" BEFORE INSERT OR UPDATE ON "msg_notification" FOR EACH ROW EXECUTE FUNCTION platform_firm_first('firm_id');
ALTER FUNCTION msg_notification_write() SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION msg_notification_write() OWNER TO xr_wall_reader;
