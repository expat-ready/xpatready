// PF-17 part 2 (R1.93; SA-10 v2.8 §3.2 "one queue, oldest-unanswered first", §10 SA10-D8; AG-16-63; Lead 1's ruling on
// #3155, 23 Nov): our team's support queue. Every firm's support tickets (PF-18b) with their firm, one ticket with its
// messages, and our reply. Keys (seeded Sample by this part's migration; Unconfirmed: SA10-X3 pending):
// system/support:list reads the queue and a ticket; system/support:manage replies. Part 2 builds no internal note, no
// assignment, no priority and no force-close (no columns for them on main; not in R1.93).
// Our staff's requests carry no firm, so the tickets are read across PF-12's walls on two bypass uses declared beside this
// file (support.bypass.ts): the queue's (one firm-less line per call) and one ticket's (that ticket's firm's own line, for
// a read and for a reply). The reply is PF-18b's own SupportService.replyAsSupport, in this use's transaction: it writes
// the SUPPORT message, moves the ticket to "Waiting on firm" and writes its audit line on the firm's trail; a closed
// ticket is refused (409) and a blank body is the same 422 the firm gets. That line's actor is the staff member's own
// ourstaff:<id> (AUD-3a). PF-4s's guard writes the one line naming the staff member and the route for every call.
// Order (SA-10 §3.2; SA-10's WAITING_FOR_CUSTOMER "drops below unanswered tickets in the queue"): tickets waiting on us
// (OPEN, WAITING_ON_SUPPORT) first, then those waiting on the firm, then closed; inside each, the one waiting longest
// first (updated_at: Prisma's @updatedAt, set by PF-18b's ticket update with each reply or firm message; review m3).
import { HttpException, HttpStatus } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import { asBypass, touchFirm, touchPlatform } from "../firm-scope.ts";
import { FIELD_ERROR_STATUS, fieldsOf } from "../http/input.ts";
import { forbidden, problem } from "../identity/keys.ts";
import { subjectOf, type SupportService } from "../support/support.ts";
import { SUPPORT_QUEUE, SUPPORT_TICKET } from "./support.bypass.ts";

type Tx = Prisma.TransactionClient;
/** SA-10 §10: "View the cross-firm support queue and tickets". */
export const SUPPORT_LIST_KEY = "system/support:list";
/** SA-10 §10: "Reply, add an internal note, assign, …" (part 2: the reply only). */
export const SUPPORT_MANAGE_KEY = "system/support:manage";
/** Tickets per page (Sample). */
export const QUEUE_PAGE_SIZE = 50;
/** How a message of ours is named to the reader (our reply carries no person's name: author_id 'support', PF-18b). */
export const SUPPORT_NAME = "ExpatReady support";

const STATUSES = ["OPEN", "WAITING_ON_SUPPORT", "WAITING_ON_FIRM", "CLOSED"] as const;
export type QueueStatus = (typeof STATUSES)[number];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const QueueQuery = z.strictObject({
  status: z.enum(STATUSES).optional(),
  firm: z.string().regex(UUID, "a firm id").optional(),
  page: z.string().regex(/^[1-9][0-9]{0,4}$/, "a page number from 1").optional(),
});
/** The reply's body: `body` only (anything else, a priority or a status, is refused by name); its words are PF-18b's to judge. */
const ReplyBody = z.strictObject({ body: z.string({ error: "Write the reply as text." }) });   // R1.10 A4: a reply is text, refused before the ticket is looked up

export type FirmRef = { id: string; key: string; name: string };
export type QueueItem = { id: string; firm: FirmRef; subject: string; status: QueueStatus; page: string; raisedByName: string | null; messages: number; createdAt: string; updatedAt: string };
export type QueuePage = { tickets: QueueItem[]; page: number; pageSize: number; total: number };
export type QueueMessage = { id: string; authorKind: "FIRM_STAFF" | "SUPPORT"; authorName: string | null; body: string; files: number[]; createdAt: string };
export type QueueTicket = Omit<QueueItem, "messages"> & { messages: QueueMessage[] };
export type SupportCaller = { staffId: string; keys: readonly string[] };
export type SystemSupportDeps = { db: PrismaClient; support: Pick<SupportService, "replyAsSupport"> };

type Row = { id: string; firmId: string; firmKey: string; firmName: string; status: QueueStatus; page: string; raisedByName: string | null; firstBody: string | null; messages: number; createdAt: Date; updatedAt: Date };

const notFound = (): never => { throw new HttpException({ type: "https://expatready.local/problems/not-found", title: "Not found", status: 404, code: "NOT_FOUND", detail: "No such support ticket." }, HttpStatus.NOT_FOUND); };
const fields = (e: z.ZodError, code: string): never => problem(FIELD_ERROR_STATUS, "Check the highlighted fields", "Some fields need a change.", { code, fields: fieldsOf(e) });
const item = (r: Row): QueueItem => ({ id: r.id, firm: { id: r.firmId, key: r.firmKey, name: r.firmName }, subject: subjectOf(r.firstBody ?? ""), status: r.status, page: r.page,
  raisedByName: r.raisedByName, messages: Number(r.messages), createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString() });

export class SystemSupport {
  constructor(private readonly d: SystemSupportDeps) {}

  private need(c: SupportCaller, key: string, words: string) {
    if (!c || !c.keys.includes(key)) forbidden(words, "MISSING_PERMISSION");
  }

  /** GET /api/system/support/tickets?status=&firm=&page=: every firm's tickets, waiting on us first, oldest first; 50 a page. */
  async list(c: SupportCaller, query: unknown): Promise<QueuePage> {
    this.need(c, SUPPORT_LIST_KEY, "Only ExpatReady staff with the support queue key see the support queue.");
    const p = QueueQuery.safeParse(query ?? {});
    if (!p.success) return fields(p.error, "SUPPORT_QUERY");
    const status = p.data.status ?? null, firm = p.data.firm?.toLowerCase() ?? null, page = Number(p.data.page ?? "1");
    return asBypass(SUPPORT_QUEUE, () => this.d.db.$transaction(async (tx) => {
      await touchPlatform(tx);   // the queue's one firm-less line (it spans firms)
      const [{ n }] = await tx.$queryRaw<{ n: number }[]>`
        SELECT count(*)::int AS n FROM platform_support_ticket t
         WHERE (${status}::text IS NULL OR t.status::text = ${status}) AND (${firm}::uuid IS NULL OR t.firm_id = ${firm}::uuid)`;
      const rows = await this.rows(tx, { status, firm, id: null, offset: (page - 1) * QUEUE_PAGE_SIZE });
      return { tickets: rows.map(item), page, pageSize: QUEUE_PAGE_SIZE, total: n };
    }));
  }

  /** GET /api/system/support/tickets/:id: one ticket with its messages in order; an unknown or malformed id is the same 404. */
  async one(c: SupportCaller, id: string): Promise<QueueTicket> {
    this.need(c, SUPPORT_LIST_KEY, "Only ExpatReady staff with the support queue key open support tickets.");
    if (typeof id !== "string" || !UUID.test(id)) notFound();
    return asBypass(SUPPORT_TICKET, () => this.d.db.$transaction(async (tx) => {
      const [row] = await this.rows(tx, { status: null, firm: null, id: id.toLowerCase(), offset: 0 });
      if (!row) return notFound();
      await touchFirm(tx, row.firmId);   // this firm's platform.bypass line, in this transaction (PF-12b)
      return this.ticket(tx, row);
    }));
  }

  /** POST /api/system/support/tickets/:id/replies {body}: our reply (PF-18b's replyAsSupport), the ticket then "Waiting on firm". */
  async reply(c: SupportCaller, id: string, input: unknown): Promise<QueueTicket> {
    this.need(c, SUPPORT_MANAGE_KEY, "Only ExpatReady staff with the support manage key reply on support tickets.");
    if (typeof id !== "string" || !UUID.test(id)) notFound();
    const v = ReplyBody.safeParse(input ?? {});
    if (!v.success) return fields(v.error, "SUPPORT_FIELDS");
    const ticketId = id.toLowerCase();
    return asBypass(SUPPORT_TICKET, () => this.d.db.$transaction(async (tx) => {
      const [found] = await tx.$queryRaw<{ firmId: string }[]>`SELECT firm_id::text AS "firmId" FROM platform_support_ticket WHERE id = ${ticketId}::uuid`;
      if (!found) return notFound();
      await touchFirm(tx, found.firmId);
      // AUD-3a: in our staff's request the firm's line names the person, ourstaff:<id> (the request scope's own word).
      await this.d.support.replyAsSupport(tx, { ticketId, body: v.data.body as string }, `ourstaff:${c.staffId}`);
      const [row] = await this.rows(tx, { status: null, firm: null, id: ticketId, offset: 0 });
      return this.ticket(tx, row!);
    }));
  }

  /** Tickets with their firm, raiser's name, first message (the subject) and message count, in the queue's order. */
  private rows(tx: Tx, w: { status: string | null; firm: string | null; id: string | null; offset: number }): Promise<Row[]> {
    return tx.$queryRaw<Row[]>`
      SELECT t.id::text AS id, t.firm_id::text AS "firmId", f.key AS "firmKey", f.operating_name AS "firmName", t.status::text AS status,
             t.page, s.display_name AS "raisedByName", t.created_at AS "createdAt", t.updated_at AS "updatedAt",
             (SELECT m.body FROM platform_support_message m WHERE m.firm_id = t.firm_id AND m.ticket_id = t.id ORDER BY m.created_at, m.id LIMIT 1) AS "firstBody",
             (SELECT count(*)::int FROM platform_support_message m WHERE m.firm_id = t.firm_id AND m.ticket_id = t.id) AS messages
        FROM platform_support_ticket t
        JOIN platform_firm f ON f.id = t.firm_id
        LEFT JOIN platform_staff s ON s.firm_id = t.firm_id AND s.id = t.raised_by
       WHERE (${w.status}::text IS NULL OR t.status::text = ${w.status}) AND (${w.firm}::uuid IS NULL OR t.firm_id = ${w.firm}::uuid)
         AND (${w.id}::uuid IS NULL OR t.id = ${w.id}::uuid)
       ORDER BY CASE t.status WHEN 'OPEN' THEN 0 WHEN 'WAITING_ON_SUPPORT' THEN 0 WHEN 'WAITING_ON_FIRM' THEN 1 ELSE 2 END, t.updated_at, t.id
       LIMIT ${QUEUE_PAGE_SIZE} OFFSET ${w.offset}`;
  }

  /** One ticket's messages, each firm author named from the ticket's own firm's staff (AG01-28), ours as ExpatReady support. */
  private async ticket(tx: Tx, r: Row): Promise<QueueTicket> {
    const ms = await tx.platformSupportMessage.findMany({ where: { firmId: r.firmId, ticketId: r.id }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
    const ids = [...new Set(ms.filter((m) => m.authorKind === "FIRM_STAFF").map((m) => m.authorId))].filter((x) => UUID.test(x));
    const staff = ids.length ? await tx.platformStaff.findMany({ where: { firmId: r.firmId, id: { in: ids } }, select: { id: true, displayName: true } }) : [];
    const names = new Map(staff.map((s) => [s.id.toLowerCase(), s.displayName]));
    const { messages: _n, ...head } = item(r);
    return { ...head, messages: ms.map((m) => ({ id: m.id, authorKind: m.authorKind, authorName: m.authorKind === "SUPPORT" ? SUPPORT_NAME : names.get(m.authorId.toLowerCase()) ?? null,
      body: m.body, files: m.fileKeys.map((k) => Number(k.split("/").pop())), createdAt: m.createdAt.toISOString() })) };
  }
}

