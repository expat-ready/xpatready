-- PF-18a part 2 (BACKLOG row PF-18a, brief design/lead-b-briefs/PF-18a.md; AG-16-10, AG-16 §3.3; P-600; schema file prisma/schema/platform-offices.prisma, owner
-- Lead B): each person's In-app and Email switches for the eight notification groups. One new table only; no existing row, table or column changes.
--   * new: platform_notification_preference (one row per person and group, written only once the person saves that group; no row → the §3.3 default).
--   * real key on (firm, staff) to platform_staff; platform.prisma gets only one back-relation line under its slot `offices (PF-18a)`.
--   * the group names are PF-18np's NotificationGroup (ports/notifications.ts), checked here too (tests/check_pf18a_notifications.ts compares the two lists).
--   * every function is platform_notification_pref_ (area prefix, rows rev 15.2).
-- Rollback (in this order): DROP TABLE "platform_notification_preference"; DROP FUNCTION platform_notification_pref_write(); delete this folder's row from
--   _prisma_migrations.
-- Prisma's DDL (prisma migrate diff), then the rules.
CREATE TABLE "platform_notification_preference" (
  "staff_id" UUID NOT NULL, "firm_id" UUID NOT NULL, "group" TEXT NOT NULL, "in_app" BOOLEAN NOT NULL, "email" BOOLEAN NOT NULL, "updated_at" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "platform_notification_preference_pkey" PRIMARY KEY ("staff_id", "group")
);
CREATE INDEX "platform_notification_preference_firm_id_staff_id_idx" ON "platform_notification_preference"("firm_id", "staff_id");
ALTER TABLE "platform_notification_preference" ADD CONSTRAINT "platform_notification_preference_firm_id_staff_id_fkey" FOREIGN KEY ("firm_id", "staff_id") REFERENCES "platform_staff"("firm_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
-- ------------------------------------------------------------------------------------------------ rules Prisma cannot say
-- SQLSTATE 23514 (check_violation) for a broken rule; the key gives 23503 for a person who is not the firm's.
ALTER TABLE "platform_notification_preference"
  -- The eight groups of AG-16 §3.3, by PF-18np's names (security emails are not a group: always on, no row).
  ADD CONSTRAINT "platform_notification_preference_group_check" CHECK ("group" IN ('WORK_HANDED_TO_ME', 'NEEDS_YOU', 'MY_DEADLINES', 'CLIENT_MESSAGED_ME', 'MENTIONS', 'TEAM_WATCH', 'PAYMENTS', 'FIRM_AND_CONNECTIONS'));
-- A row stays its person's, firm's and group's: only the two switches and the time change.
CREATE FUNCTION platform_notification_pref_write() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.staff_id, NEW.firm_id, NEW."group") IS DISTINCT FROM (OLD.staff_id, OLD.firm_id, OLD."group") THEN
    RAISE EXCEPTION 'platform_notification_preference: the person, firm and group of a row never change' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER platform_notification_pref_write BEFORE UPDATE ON "platform_notification_preference" FOR EACH ROW EXECUTE FUNCTION platform_notification_pref_write();
REVOKE UPDATE ON "platform_notification_preference" FROM xr_data; GRANT UPDATE ("in_app", "email", "updated_at") ON "platform_notification_preference" TO xr_data;
-- ------------------------------------------------------------------------------------------------------ PF-12's walls
ALTER TABLE "platform_notification_preference" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY "pf12_firm" ON "platform_notification_preference" USING ("firm_id" = platform_session_firm()) WITH CHECK ("firm_id" = platform_session_firm());
CREATE TRIGGER "0_pf12_firm_first" BEFORE INSERT OR UPDATE ON "platform_notification_preference" FOR EACH ROW EXECUTE FUNCTION platform_firm_first('firm_id');
ALTER FUNCTION platform_notification_pref_write() SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION platform_notification_pref_write() OWNER TO xr_wall_reader;
