// PF-18n part 1 (brief lead-b-briefs/PF-18n1.md; AG-7-39 r2, r10; AG16-60; AG-16 §3.3): NotificationPort's real adapter
// (ports/notifications.ts) over msg_notification, and the person's own reads of it (routes.ts). The rules:
//   * notify runs inside the caller's transaction and in its firm (PF-12's scope: a job's firm, a request's firm), so a
//     rollback leaves no row; no firm in scope is refused, never a silent drop;
//   * the person's In-app switch for the kind's group is asked first (NotificationPrefsPort, NOTIFICATION_PREFS): off, or a
//     person who is not this firm's active staff, writes nothing;
//   * one row per person, item and kind: a repeat (the 7-day, 2-day and on-the-day reminders of one deadline) sets read_at
//     back to empty and created_at to now, never a second row ("duplicate beats a miss");
//   * ids only; the link is built when a row is read (`linkOf`), never stored.
import type { Prisma, PrismaClient } from "@prisma/client";
import { NOTIFICATION_GROUP, parseNotify, type NotificationItem, type NotificationKind, type NotificationPort, type NotificationRecipient } from "../../../../ports/notifications.ts";
import type { NotificationPrefsPort } from "../../../../ports/notification-prefs.ts";
import { currentFirm, firmScope } from "../firm-scope.ts";

/** The injection token of NotificationPort's real adapter (api/src/features/platform-notifications.ts). */
export const NOTIFICATION_PORT = Symbol.for("platform.NotificationPort");
type DbOrTx = PrismaClient | Prisma.TransactionClient;

export class PrismaNotificationPort implements NotificationPort<Prisma.TransactionClient> {
  constructor(private readonly prefs: NotificationPrefsPort, private readonly now: () => Date = () => new Date()) {}

  async notify(tx: Prisma.TransactionClient, recipient: NotificationRecipient, kind: NotificationKind, item: NotificationItem): Promise<void> {
    const p = parseNotify(recipient, kind, item);   // a ZodError before anything is read or written
    const firm = currentFirm();
    if (!firm) throw new Error("NotificationPort: no firm in scope (call it in the firm's own scope: a job's or a request's)");
    const firmId = firmScope(firm).firmId, staffId = p.recipient.staffId.toLowerCase(), group = NOTIFICATION_GROUP[p.kind];
    if (!(await this.prefs.allows(firmId, staffId, group, "IN_APP"))) return;
    const at = this.now();
    await tx.$executeRaw`insert into msg_notification (id, firm_id, staff_id, kind, "group", item_kind, item_id, created_at)
      values (gen_random_uuid(), ${firmId}::uuid, ${staffId}::uuid, ${p.kind}, ${group}, ${p.item.kind}, ${p.item.id.toLowerCase()}::uuid, ${at})
      on conflict (firm_id, staff_id, item_kind, item_id, kind) do update set read_at = null, created_at = excluded.created_at`;
  }
}

/** What a person's list shows of one row. */
export type NotificationView = { id: string; kind: string; group: string; item: { kind: string; id: string }; link: string | null; createdAt: string; readAt: string | null };
type Row = { id: string; kind: string; group: string; itemKind: string; itemId: string; createdAt: Date; readAt: Date | null };

/** The page each item kind opens, built on read (null: no page yet). Case stages and steps open their case. */
async function linksOf(db: DbOrTx, firmId: string, rows: Row[]): Promise<Map<string, string>> {
  const ids = (k: string) => [...new Set(rows.filter((r) => r.itemKind === k).map((r) => r.itemId))];
  const links = new Map<string, string>();
  for (const id of ids("case")) links.set(`case|${id}`, `/cases/${id}`);
  const stages = ids("case-stage"), steps = ids("case-milestone");
  if (stages.length) for (const s of await db.caseStage.findMany({ where: { id: { in: stages }, firmId }, select: { id: true, caseId: true } })) links.set(`case-stage|${s.id}`, `/cases/${s.caseId}`);
  if (steps.length) for (const m of await db.caseMilestone.findMany({ where: { id: { in: steps }, firmId }, select: { id: true, caseId: true } })) links.set(`case-milestone|${m.id}`, `/cases/${m.caseId}`);
  return links;
}

/** The signed-in person's own notifications (routes.ts). Every read and write names the firm and the person. */
export class MyNotifications {
  constructor(private readonly db: DbOrTx, private readonly now: () => Date = () => new Date()) {}
  async list(firmId: string, staffId: string, q: { unread?: boolean; page?: number; size?: number }) {
    const size = Math.min(Math.max(Math.trunc(q.size ?? 20), 1), 100), page = Math.max(Math.trunc(q.page ?? 1), 1);
    const where = firmScope(firmId, { staffId, ...(q.unread ? { readAt: null } : {}) });
    const rows: Row[] = await this.db.msgNotification.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * size, take: size + 1,
      select: { id: true, kind: true, group: true, itemKind: true, itemId: true, createdAt: true, readAt: true } });
    const more = rows.length > size, shown = rows.slice(0, size), links = await linksOf(this.db, where.firmId, shown);
    const items: NotificationView[] = shown.map((r) => ({ id: r.id, kind: r.kind, group: r.group, item: { kind: r.itemKind, id: r.itemId }, link: links.get(`${r.itemKind}|${r.itemId}`) ?? null, createdAt: r.createdAt.toISOString(), readAt: r.readAt?.toISOString() ?? null }));
    return { items, page, size, nextPage: more ? page + 1 : null };
  }
  async unreadCount(firmId: string, staffId: string) {
    return { unread: await this.db.msgNotification.count({ where: firmScope(firmId, { staffId, readAt: null }) }) };
  }
  /** Marks one of the person's rows read; false when it is not theirs (another person's or firm's, or no such row). */
  async markRead(firmId: string, staffId: string, id: string): Promise<{ id: string; readAt: string } | null> {
    const mine = await this.db.msgNotification.findFirst({ where: firmScope(firmId, { id, staffId }), select: { id: true, readAt: true } });
    if (!mine) return null;
    if (mine.readAt) return { id, readAt: mine.readAt.toISOString() };
    const f = firmScope(firmId).firmId;
    // Never before its created_at (the table's check): a row a later reminder re-surfaced reads at that time at the earliest.
    const [r] = await this.db.$queryRaw<{ read_at: Date }[]>`update msg_notification set read_at = greatest(${this.now()}::timestamptz, created_at)
      where firm_id = ${f}::uuid and staff_id = ${staffId}::uuid and id = ${id}::uuid and read_at is null returning read_at`;
    return r ? { id, readAt: r.read_at.toISOString() } : this.markRead(firmId, staffId, id);   // read meanwhile: its first time stays
  }
  async markAllRead(firmId: string, staffId: string) {
    const f = firmScope(firmId).firmId;
    const n = await this.db.$executeRaw`update msg_notification set read_at = greatest(${this.now()}::timestamptz, created_at)
      where firm_id = ${f}::uuid and staff_id = ${staffId}::uuid and read_at is null`;
    return { marked: n };
  }
}
