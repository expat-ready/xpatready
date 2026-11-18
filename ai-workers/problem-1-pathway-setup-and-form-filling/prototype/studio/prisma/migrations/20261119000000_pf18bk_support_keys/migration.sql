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
-- Before any key: every existing ticket has its firm and its raiser in that firm, and every message its firm; otherwise
-- the migration stops with the counts and changes nothing. It never deletes or edits a row.
-- Rollback: ALTER TABLE "platform_support_message" DROP CONSTRAINT "platform_support_message_firm_id_fkey";
--   ALTER TABLE "platform_support_ticket" DROP CONSTRAINT "platform_support_ticket_firm_id_raised_by_fkey",
--   DROP CONSTRAINT "platform_support_ticket_firm_id_fkey"; delete this folder's row from _prisma_migrations.

-- ------------------------------------------------------------------------------------------- every row has its firm and raiser
DO $pf18bk$
DECLARE no_firm bigint; no_raiser bigint; msg_no_firm bigint;
BEGIN
  SELECT count(*) INTO no_firm FROM "platform_support_ticket" t
    WHERE NOT EXISTS (SELECT 1 FROM "platform_firm" f WHERE f.id = t.firm_id);
  SELECT count(*) INTO no_raiser FROM "platform_support_ticket" t
    WHERE NOT EXISTS (SELECT 1 FROM "platform_staff" s WHERE s.firm_id = t.firm_id AND s.id = t.raised_by);
  SELECT count(*) INTO msg_no_firm FROM "platform_support_message" m
    WHERE NOT EXISTS (SELECT 1 FROM "platform_firm" f WHERE f.id = m.firm_id);
  IF no_firm + no_raiser + msg_no_firm > 0 THEN
    RAISE EXCEPTION 'PF-18bk stopped, nothing changed: % support ticket(s) without their firm, % without a raiser on that firm''s staff, % support message(s) without their firm', no_firm, no_raiser, msg_no_firm
      USING ERRCODE = 'foreign_key_violation',
            HINT = 'Find them with the three NOT EXISTS queries at the top of this migration, give each row its firm and raiser (never delete a support record), then deploy again.';
  END IF;
END
$pf18bk$;

-- AddForeignKey
ALTER TABLE "platform_support_ticket" ADD CONSTRAINT "platform_support_ticket_firm_id_fkey" FOREIGN KEY ("firm_id") REFERENCES "platform_firm"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "platform_support_ticket" ADD CONSTRAINT "platform_support_ticket_firm_id_raised_by_fkey" FOREIGN KEY ("firm_id", "raised_by") REFERENCES "platform_staff"("firm_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "platform_support_message" ADD CONSTRAINT "platform_support_message_firm_id_fkey" FOREIGN KEY ("firm_id") REFERENCES "platform_firm"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
