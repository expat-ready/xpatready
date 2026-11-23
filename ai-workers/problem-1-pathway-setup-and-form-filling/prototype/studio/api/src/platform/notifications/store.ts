// PF-18n part 1 (brief lead-b-briefs/PF-18n1.md; AG-7-39 r2, r10; AG16-60; AG-16 §3.3): NotificationPort's real adapter
// (ports/notifications.ts) over msg_notification, and the person's own reads of it (routes.ts). The rules:
//   * notify runs inside the caller's transaction and in its firm (PF-12's scope: a job's firm, a request's firm), so a
//     rollback leaves no row; no firm in scope is refused, never a silent drop;
//   * the person's In-app switch for the kind's group is asked first (NotificationPrefsPort; its real adapter, the one behind
//     NOTIFICATION_PREFS, built over the caller's tx: one connection per call, and a switch or person changed earlier in the
//     same transaction is seen, breaker M1): off, or a person who is not this firm's active staff, writes nothing;
//   * one row per person, item and kind: a repeat (the 7-day, 2-day and on-the-day reminders of one deadline) sets read_at
//     back to empty and created_at to now (never earlier than it was, breaker m2), never a second row ("duplicate beats a miss");
//   * ids only; the link is built when a row is read (`linkOf`), never stored.
import type { Prisma, PrismaClient } from "@prisma/client";
import { NOTIFICATION_GROUP, parseNotify, type NotificationItem, type NotificationKind, type NotificationPort, type NotificationRecipient } from "../../../../ports/notifications.ts";
import type { NotificationPrefsPort } from "../../../../ports/notification-prefs.ts";
import { systemClock } from "../../../../ports/clock.ts";
import { currentFirm, firmScope } from "../firm-scope.ts";

/** The injection token of NotificationPort's real adapter (api/src/features/platform-notifications.ts). */
export const NOTIFICATION_PORT = Symbol.for("platform.NotificationPort");
type DbOrTx = PrismaClient | Prisma.TransactionClient;

export class PrismaNotificationPort implements NotificationPort<Prisma.TransactionClient> {
  /** `prefsOver(tx)`: NotificationPrefsPort read through the caller's transaction (features/platform-notifications.ts passes
   *  PrismaNotificationPrefs, NOTIFICATION_PREFS' adapter; a test may pass a fake). */
  constructor(private readonly prefsOver: (tx: Prisma.TransactionClient) => NotificationPrefsPort, private readonly now: () => Date = () => systemClock.now()) {}

  async notify(tx: Prisma.TransactionClient, recipient: NotificationRecipient, kind: NotificationKind, item: NotificationItem): Promise<void> {
    const p = parseNotify(recipient, kind, item);   // a ZodError before anything is read or written
    const firm = currentFirm();
    if (!firm) throw new Error("NotificationPort: no firm in scope (call it in the firm's own scope: a job's or a request's)");
    const firmId = firmScope(firm).firmId, staffId = p.recipient.staffId.toLowerCase(), group = NOTIFICATION_GROUP[p.kind];
    if (!(await this.prefsOver(tx).allows(firmId, staffId, group, "IN_APP"))) return;
    const at = this.now();
    await tx.$executeRaw`insert into msg_notification (id, firm_id, staff_id, kind, "group", item_kind, item_id, created_at)
      values (gen_random_uuid(), ${firmId}::uuid, ${staffId}::uuid, ${p.kind}, ${group}, ${p.item.kind}, ${p.item.id.toLowerCase()}::uuid, ${at})
      on conflict (firm_id, staff_id, item_kind, item_id, kind) do update set read_at = null, created_at = greatest(msg_notification.created_at, excluded.created_at)`;
  }
}

/** Home's "Needs you" shows at most this many (PF-18h BR-5). */
export const NEEDS_YOU_SHOWN = 20;
/** What a person's list shows of one row. */
/** `label` and `link` (PF-18n part 2): the item's words and page, built on read; both null when the item is gone or the
 *  reader may no longer open it (a lead reassigned away: its module's own view rule, labels.ts). */
export type NotificationView = { id: string; kind: string; group: string; item: { kind: string; id: string }; label: string | null; link: string | null; createdAt: string; readAt: string | null };
/** The other modules' labels for a page of rows (labels.ts `NotificationLabels.of`, bound to the reader by the route). */
export type LabelsOf = (items: { kind: string; id: string }[]) => Promise<Map<string, { label: string; link: string }>>;
type Row = { id: string; kind: string; group: string; itemKind: string; itemId: string; createdAt: Date; readAt: Date | null };

/** The item kinds this file labels itself (a case, its stages and steps); never handed to another module's labeller. */
const CASE_KINDS = new Set(["case", "case-stage", "case-milestone"]);
/** The page each item kind opens, built on read (null: no page yet), and its case's number. Case stages and steps open their case. */
type Linked = { link: string; caseNumber: string };
async function linksOf(db: DbOrTx, firmId: string, rows: Row[]): Promise<Map<string, Linked>> {
  const ids = (k: string) => [...new Set(rows.filter((r) => r.itemKind === k).map((r) => r.itemId))];
  const caseOf = new Map<string, string>();   // item key → its case id, each read in the firm
  const cases = ids("case");
  for (const id of cases) caseOf.set(`case|${id}`, id);
  const stages = ids("case-stage"), steps = ids("case-milestone");
  if (stages.length) for (const s of await db.caseStage.findMany({ where: { id: { in: stages }, firmId }, select: { id: true, caseId: true } })) caseOf.set(`case-stage|${s.id}`, s.caseId);
  if (steps.length) for (const m of await db.caseMilestone.findMany({ where: { id: { in: steps }, firmId }, select: { id: true, caseId: true } })) caseOf.set(`case-milestone|${m.id}`, m.caseId);
  // PF-18h Q1 (a): the case number comes from this one firm-scoped case read (breaker m4: the firm's own case only). X-row:
  // a case-side CaseLabelPort replaces these platform reads of case tables.
  const ofCase = new Map<string, string>();
  const caseIds = [...new Set(caseOf.values())];
  if (caseIds.length) for (const c of await db.case.findMany({ where: { id: { in: caseIds }, firmId }, select: { id: true, caseNumber: true } })) ofCase.set(c.id, c.caseNumber);
  const links = new Map<string, Linked>();
  for (const [key, caseId] of caseOf) { const n = ofCase.get(caseId); if (n !== undefined) links.set(key, { link: `/cases/${caseId}`, caseNumber: n }); }
  return links;
}

/** The signed-in person's own notifications (routes.ts). Every read and write names the firm and the person. */
export class MyNotifications {
  constructor(private readonly db: DbOrTx, private readonly now: () => Date = () => systemClock.now()) {}
  async list(firmId: string, staffId: string, q: { unread?: boolean; page?: number; size?: number }, labelsOf?: LabelsOf) {
    const size = Math.min(Math.max(Math.trunc(q.size ?? 20), 1), 100), page = Math.min(Math.max(Math.trunc(q.page ?? 1), 1), 1_000_000);   // clamped, breaker m5
    const where = firmScope(firmId, { staffId, ...(q.unread ? { readAt: null } : {}) });
    const rows: Row[] = await this.db.msgNotification.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * size, take: size + 1,
      select: { id: true, kind: true, group: true, itemKind: true, itemId: true, createdAt: true, readAt: true } });
    const more = rows.length > size, shown = rows.slice(0, size);
    // Case items: this file's own case read (label = the case number); every other kind: its module's labeller, if any.
    const [links, others] = await Promise.all([linksOf(this.db, where.firmId, shown), labelsOf ? labelsOf(shown.filter((r) => !CASE_KINDS.has(r.itemKind)).map((r) => ({ kind: r.itemKind, id: r.itemId }))) : new Map()]);
    const items: NotificationView[] = shown.map((r) => {
      const key = `${r.itemKind}|${r.itemId}`, c = links.get(key), o = CASE_KINDS.has(r.itemKind) ? undefined : others.get(key);
      return { id: r.id, kind: r.kind, group: r.group, item: { kind: r.itemKind, id: r.itemId }, label: c?.caseNumber ?? o?.label ?? null, link: c?.link ?? o?.link ?? null, createdAt: r.createdAt.toISOString(), readAt: r.readAt?.toISOString() ?? null };
    });
    return { items, page, size, nextPage: more ? page + 1 : null };
  }
  /** PF-18h (BR-1, BR-5): my unread MY_DEADLINES rows for Home's "Needs you", newest first, at most 20, with the total. */
  async needsYou(firmId: string, staffId: string) {
    const where = firmScope(firmId, { staffId, group: "MY_DEADLINES", readAt: null });
    const [rows, total] = await Promise.all([
      this.db.msgNotification.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: NEEDS_YOU_SHOWN, select: { id: true, kind: true, group: true, itemKind: true, itemId: true, createdAt: true, readAt: true } }) as Promise<Row[]>,
      this.db.msgNotification.count({ where }),
    ]);
    const links = await linksOf(this.db, where.firmId, rows);
    return { items: rows.map((r) => { const l = links.get(`${r.itemKind}|${r.itemId}`); return { id: r.id, kind: r.kind, caseNumber: l?.caseNumber ?? null, link: l?.link ?? null, createdAt: r.createdAt.toISOString() }; }), total };
  }
  async unreadCount(firmId: string, staffId: string) {
    return { unread: await this.db.msgNotification.count({ where: firmScope(firmId, { staffId, readAt: null }) }) };
  }
  /** Marks one of the person's rows read; null when it is not theirs (another person's or firm's, or no such row). `seen`
   *  (the createdAt the person's list showed): a row a later reminder surfaced again after it stays unread (readAt null),
   *  so a click on an old list never uses up a newer reminder (review m2, breaker m3: "duplicate beats a miss"). */
  async markRead(firmId: string, staffId: string, id: string, seen?: Date): Promise<{ id: string; readAt: string | null } | null> {
    const mine = await this.db.msgNotification.findFirst({ where: firmScope(firmId, { id, staffId }), select: { id: true, readAt: true } });
    if (!mine) return null;
    if (mine.readAt) return { id, readAt: mine.readAt.toISOString() };
    const f = firmScope(firmId).firmId;
    // Never before its created_at (the table's check): a row a later reminder re-surfaced reads at that time at the earliest.
    const upTo = seen ?? null;
    const [r] = await this.db.$queryRaw<{ read_at: Date }[]>`update msg_notification set read_at = greatest(${this.now()}::timestamptz, created_at)
      where firm_id = ${f}::uuid and staff_id = ${staffId}::uuid and id = ${id}::uuid and read_at is null
      and (${upTo}::timestamptz is null or created_at <= ${upTo}::timestamptz) returning read_at`;
    if (r) return { id, readAt: r.read_at.toISOString() };
    // Not updated: read meanwhile (its first time stays), or surfaced again after `seen` (it stays unread).
    const now = await this.db.msgNotification.findFirst({ where: firmScope(firmId, { id, staffId }), select: { readAt: true } });
    return now ? { id, readAt: now.readAt?.toISOString() ?? null } : null;
  }
  /** Marks the person's unread rows read; with `seen` (the newest createdAt their list showed) only rows up to it. */
  async markAllRead(firmId: string, staffId: string, seen?: Date) {
    const f = firmScope(firmId).firmId, upTo = seen ?? null;
    const n = await this.db.$executeRaw`update msg_notification set read_at = greatest(${this.now()}::timestamptz, created_at)
      where firm_id = ${f}::uuid and staff_id = ${staffId}::uuid and read_at is null
      and (${upTo}::timestamptz is null or created_at <= ${upTo}::timestamptz)`;
    return { marked: n };
  }
}
