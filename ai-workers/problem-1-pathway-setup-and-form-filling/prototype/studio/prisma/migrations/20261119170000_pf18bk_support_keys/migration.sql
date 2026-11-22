-- PF-18bk (brief: Lead B's briefs, PF-18bk.md, 18 Nov 23:38 IST; Lead 74's P-423 note 1 on #2064; P-600, P-606): the real
-- foreign keys PF-18b (20261118073000_pf18b_support) left to its write trigger while platform.prisma was held for #2009.
-- Schema files prisma/schema/platform-support.prisma and two back-relation models in platform.prisma; owner Lead B.
--   * platform_support_ticket.firm_id → platform_firm(id), RESTRICT both ways.
--   * platform_support_ticket(firm_id, raised_by) → platform_staff(firm_id, id), RESTRICT both ways: the raiser is staff of
--     the ticket's own firm (platform_staff_firm_id_id_key, PF-3, is the target).
--   * platform_support_message.firm_id → platform_firm(id), RESTRICT both ways. (firm_id, ticket_id) → the ticket is PF-18b's.
--   * author_id is text ('support' or a staff uuid) and takes no key: platform_support_message_write keeps proving a
--     FIRM_STAFF author. No trigger, function or check changes: the raiser's EXISTS check stays too (PF-18b's suite names
--     its message; the key refuses the same row with the same code, foreign_key_violation, tests/check_pf18bk_keys.ts DW2).
-- One statement (a DO block), so it is all or nothing however it is run (psql -f wraps nothing; a key that failed after
-- another was added must never leave the folder half done). The runner must see every row: under FORCE ROW LEVEL
-- SECURITY anyone else would count no orphan, and ADD CONSTRAINT would validate blind as well (review m1; PF-8b F6
-- proved it on PostgreSQL 18: as the table owner, a key's first validation reads under the walls). A superuser or
-- BYPASSRLS runner (xr_studio, as every migration here) sees every row. Any other runner must own the four tables (Amazon
-- RDS: the admin, not given BYPASSRLS; PF-8b F6): it lifts FORCE on the four inside this one statement, under its lock,
-- so as their owner it sees every row, and puts FORCE back before the end (an error rolls it back too). Then it locks the four tables (no firm, staff, ticket or message changes between the check and the keys), checks
-- that every ticket has its firm and its raiser in that firm and every message its firm, and otherwise stops with the
-- counts and changes nothing. It never deletes or edits a row.
-- Rollback: ALTER TABLE "platform_support_message" DROP CONSTRAINT "platform_support_message_firm_id_fkey";
--   ALTER TABLE "platform_support_ticket" DROP CONSTRAINT "platform_support_ticket_firm_id_raised_by_fkey",
--   DROP CONSTRAINT "platform_support_ticket_firm_id_fkey"; delete this folder's row from _prisma_migrations.

-- ------------------------------------------------------------------------------------------- check, then the three keys
DO $pf18bk$
DECLARE no_firm bigint; no_raiser bigint; msg_no_firm bigint; t text; forced text[] := '{}';
  four regclass[] := ARRAY['platform_firm', 'platform_staff', 'platform_support_ticket', 'platform_support_message']::regclass[];
BEGIN
  IF (SELECT r.rolsuper OR r.rolbypassrls FROM pg_roles r WHERE r.rolname = current_user) THEN
    LOCK TABLE "platform_firm", "platform_staff", "platform_support_ticket", "platform_support_message" IN SHARE ROW EXCLUSIVE MODE;
  ELSE
    -- PF-8b F6: the owner of the four tables (break m2: checked before the lock, so a runner without rights gets this message)
    IF EXISTS (SELECT 1 FROM pg_class c WHERE c.oid = ANY (four) AND NOT pg_has_role(current_user, c.relowner, 'USAGE')) THEN
      RAISE EXCEPTION 'PF-18bk stopped, nothing changed: % cannot see every support row (row level security): run migrations as a superuser, a BYPASSRLS role or the owner of the four tables', current_user
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    -- review m1: ALTER TABLE below needs ACCESS EXCLUSIVE, so it is taken at once (no lock upgrade, no deadlock)
    LOCK TABLE "platform_firm", "platform_staff", "platform_support_ticket", "platform_support_message" IN ACCESS EXCLUSIVE MODE;
    -- PF-8b F6: the owner sees every row once FORCE is lifted; only the tables that had it get it back
    SELECT coalesce(array_agg(c.relname::text ORDER BY c.relname), '{}') INTO forced FROM pg_class c WHERE c.oid = ANY (four) AND c.relforcerowsecurity;
    FOREACH t IN ARRAY forced LOOP EXECUTE format('ALTER TABLE %I NO FORCE ROW LEVEL SECURITY', t); END LOOP;
  END IF;
  SELECT count(*) INTO no_firm FROM "platform_support_ticket" t
    WHERE NOT EXISTS (SELECT 1 FROM "platform_firm" f WHERE f.id = t.firm_id);
  SELECT count(*) INTO no_raiser FROM "platform_support_ticket" t
    WHERE NOT EXISTS (SELECT 1 FROM "platform_staff" s WHERE s.firm_id = t.firm_id AND s.id = t.raised_by);
  SELECT count(*) INTO msg_no_firm FROM "platform_support_message" m
    WHERE NOT EXISTS (SELECT 1 FROM "platform_firm" f WHERE f.id = m.firm_id);
  IF no_firm + no_raiser + msg_no_firm > 0 THEN
    RAISE EXCEPTION 'PF-18bk stopped, nothing changed: % support ticket(s) without their firm, % without a raiser on that firm''s staff, % support message(s) without their firm', no_firm, no_raiser, msg_no_firm
      USING ERRCODE = 'foreign_key_violation',
            HINT = 'Find them with the three NOT EXISTS queries in this migration and take each to the tech lead: never delete a support record. A ticket''s firm and raiser are fixed by platform_support_ticket_write, so a repair is the database owner''s, with that trigger disabled for the one row. Then mark the failed attempt rolled back (prisma migrate resolve --rolled-back 20261119170000_pf18bk_support_keys) and deploy again.';
  END IF;

  -- AddForeignKey
  ALTER TABLE "platform_support_ticket" ADD CONSTRAINT "platform_support_ticket_firm_id_fkey" FOREIGN KEY ("firm_id") REFERENCES "platform_firm"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

  -- AddForeignKey
  ALTER TABLE "platform_support_ticket" ADD CONSTRAINT "platform_support_ticket_firm_id_raised_by_fkey" FOREIGN KEY ("firm_id", "raised_by") REFERENCES "platform_staff"("firm_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

  -- AddForeignKey
  ALTER TABLE "platform_support_message" ADD CONSTRAINT "platform_support_message_firm_id_fkey" FOREIGN KEY ("firm_id") REFERENCES "platform_firm"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

  -- PF-8b F6: the walls exactly as they were (empty for a superuser or BYPASSRLS runner)
  FOREACH t IN ARRAY forced LOOP EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t); END LOOP;
END
$pf18bk$;
