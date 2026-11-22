// PF-18b (AG-16-63, AG16-16; SA-06 v3.15 AG16-16 row; P-559): support tickets a firm's staff raise to us. One text box,
// the page the "?" was pressed on (noted by the screen), and up to three attachments; no priority field (AG-16-63).
// Who (SA-06 AG16-16): agent/support-ticket:create raises (every starter role); agent/support-ticket:list reads (every
// starter role): each person sees their own tickets, and the Owner and Admin roles see all the firm's tickets and may reply
// on any. Anyone else's ticket, or another firm's, is the same 404 as one that does not exist (an id leaks nothing).
// Files: each is checked first (Sample 10 MB, PDF, PNG, JPEG or plain text, by its type and its first bytes), then stored
// by FilesPort under support/<ticket id>/<n> before the ticket's transaction; a failure after that leaves the stored bytes
// with no ticket (FilesPort.delete is the caller's only after its record's commit, ports/files.ts; such bytes are PF-F2's
// cleanup). The ticket, its first message, one AuditPort line (no body: field names and ids only) and the outbox event
// (EVENT.SUPPORT_TICKET_RAISED, ids only) are one transaction. After the commit, one email to our support inbox (Sample
// address) with the firm's key, the ticket id and the page only; a failed send leaves the ticket saved (`emailed: false`).
// Our reply (replyAsSupport) has no route here: PF-17's console calls it under /api/system after PF-4s.
// PF-18s part 2 (challenge M4, M5): the list and one ticket also answer `subject` (the first line of the first message, cut to
// 80 characters: AG-16 §3.15 "the first line as the subject") and `raisedByName`; one ticket's staff messages carry `authorName`.
// Names come from platform_staff in the ticket's own firm in the same read (AG01-28: colleague names on records need no key),
// so the Help pages never call GET /staff.
import { HttpException, HttpStatus } from "@nestjs/common";
import type { PlatformSupportMessage, PlatformSupportTicket, Prisma, PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { AuditPort } from "../../../../ports/audit.ts";
import { EVENT, SupportTicketRaised } from "../../../../ports/events.ts";
import type { FilesPort } from "../../../../ports/files.ts";
import type { MailPort } from "../../../../ports/mail.ts";
import type { StaffContext } from "../../../../ports/staff.ts";
import { firmScope } from "../firm-scope.ts";

export const SUPPORT_KEYS = { create: "agent/support-ticket:create", list: "agent/support-ticket:list" } as const;
/** AG-16-63: "Owner and Admin see all the firm's tickets and may reply on any". */
export const ALL_FIRM_ROLES = ["OWNER", "ADMIN"] as const;
/** Sample: an attachment's largest size (the offline-PDF limit on main, FO-5's OFFLINE_PDF_MAX_BYTES; no source number). */
export const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
export const MAX_FILES = 3;
export const BODY_MAX = 5000;
export const PAGE_MAX = 300;
/** Sample: our support inbox (no real address in the repository). */
export const SUPPORT_INBOX = () => process.env.SUPPORT_INBOX ?? "support@expatready.example.com";
/** The list's size (Sample; a firm raises few tickets). */
export const PAGE = 100;

/** The listed types, each with the first bytes its content must start with (plain text: valid UTF-8, no NUL). */
const TYPES: Record<string, { words: string; starts?: number[] }> = {
  "application/pdf": { words: "a PDF", starts: [0x25, 0x50, 0x44, 0x46, 0x2d] },
  "image/png": { words: "a PNG image", starts: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  "image/jpeg": { words: "a JPEG image", starts: [0xff, 0xd8, 0xff] },
  "text/plain": { words: "a plain text file" },
};

type Tx = Prisma.TransactionClient;
export type Upload = { bytes: Uint8Array; size: number; contentType?: string };
export type SupportDeps = { db: PrismaClient; files: FilesPort; audit: AuditPort<Tx>; mail: MailPort };

// ------------------------------------------------------------------------------------------------------------- problems
const problem = (status: number, code: string, title: string, detail: string, extra: Record<string, unknown> = {}): never => {
  throw new HttpException({ type: `https://expatready.local/problems/${code}`, title, status, detail, code: code.toUpperCase().replace(/-/g, "_"), ...extra }, status as HttpStatus);
};
export const notFound = (): never => problem(404, "not-found", "Not found", "No such support ticket.");
const fieldErrors = (fields: Record<string, string>): never => problem(422, "support-fields", "Check the highlighted fields", "Some fields need a change.", { fields });
const closedRefused = (): never => problem(409, "support-closed", "This ticket is closed", "A closed ticket takes no new message: raise a new ticket instead.");

// ------------------------------------------------------------------------------------------------------------- input
/** The migration's platform_support_has_text: blanks of every width and invisible marks do not count; no control
 *  character but tab and line breaks. */
const BLANK = new RegExp("[\\u0009-\\u000d\\u0020\\u0085\\u00a0\\u00ad\\u034f\\u061c\\u115f\\u1160\\u1680\\u180e\\u2000-\\u200f\\u2028-\\u202f\\u205f-\\u2064\\u2066-\\u206f\\u2800\\u3000\\u3164\\ufe00-\\ufe0f\\ufeff\\uffa0]", "g");
const CONTROL = new RegExp("[\\u0000-\\u0008\\u000b\\u000c\\u000e-\\u001f\\u007f-\\u0084\\u0086-\\u009f]");
export const hasText = (s: string) => /[\p{L}\p{Nl}\p{P}\p{S}0-9]/u.test(s.replace(BLANK, "")) && !CONTROL.test(s);
/** A string's length in characters (code points), as the database's char_length counts it (break m4). */
const chars = (s: string) => [...s].length;
/** Break m1 (PF-18s part 2): a multipart field arrives with CRLF line breaks; counted and stored as one character each. */
const Body = z.string({ error: "write what you need help with" }).transform((s) => s.replace(/\r\n?/g, "\n")).refine((s) => chars(s) <= BODY_MAX, `at most ${BODY_MAX} characters`).refine(hasText, "write what you need help with, without control characters");
/** The app path the ticket was raised from: its query string and fragment are cut off (they can hold a token). */
/** The app path the ticket was raised from: its query string and fragment are cut off (they can hold a token). An app
 *  path only (break m3): letters, digits and - . _ ~ / %, not starting with // (another site), no backslash, no @ (a
 *  contact value), no space, control, direction or invisible mark; the migration's CHECK asks the same. */
export const APP_PATH = /^\/(?!\/)[A-Za-z0-9._~\/%-]*$/;
const Page = z.string({ error: "the page is needed" }).transform((p) => p.split(/[?#]/)[0])
  .refine((p) => p.length >= 1 && p.length <= PAGE_MAX && APP_PATH.test(p), `an app path starting with /, at most ${PAGE_MAX} characters`);
const NO_PRIORITY = "a support ticket has no priority: write what you need in the text";
const Raise = z.object({ body: Body, page: Page }).strict();
const Message = z.object({ body: Body }).strict();

const UUID_SHAPE = z.string().uuid();
export const isUuid = (s: unknown): s is string => UUID_SHAPE.safeParse(s).success;

function parse<T extends z.ZodType>(schema: T, input: unknown): z.output<T> {
  const r = schema.safeParse(input ?? {});
  if (r.success) return r.data;
  const fields: Record<string, string> = Object.create(null);
  const set = (k: string, m: string) => { if (!Object.hasOwn(fields, k)) fields[k] = m; };
  for (const i of r.error.issues) {
    if (i.code === "unrecognized_keys") { for (const k of (i as { keys?: string[] }).keys ?? []) set(k, k === "priority" ? NO_PRIORITY : "not a field of a support ticket"); continue; }
    const k = i.path.length ? i.path.join(".") : "_";
    set(k, i.code === "invalid_type" && i.input === undefined ? "this is needed" : i.message);
  }
  return fieldErrors({ ...fields });
}

/** Why an attachment is refused, in plain words, or null when it may be stored. */
export function attachmentProblem(f: Upload): string | null {
  const type = (f.contentType ?? "").split(";")[0].trim().toLowerCase(), t = TYPES[type];
  if (f.size > ATTACHMENT_MAX_BYTES || f.bytes.byteLength > ATTACHMENT_MAX_BYTES) return `larger than ${ATTACHMENT_MAX_BYTES / 1024 / 1024} MB (Sample limit): attach a smaller file`;
  if (!f.bytes.byteLength) return "the file is empty";
  if (!t) return "attach a PDF, a PNG or JPEG image, or a plain text file";
  if (t.starts && !t.starts.every((b, i) => f.bytes[i] === b)) return `the file is not ${t.words} as its type says`;
  if (type === "text/plain") {
    if (f.bytes.includes(0)) return "the file is not a plain text file as its type says";
    try { new TextDecoder("utf-8", { fatal: true }).decode(f.bytes); } catch { return "the file is not a plain text file as its type says"; }
  }
  return null;
}

// ------------------------------------------------------------------------------------------------------------- views
export type MessageView = { id: string; authorKind: PlatformSupportMessage["authorKind"]; authorId: string; authorName?: string | null; body: string; files: number[]; createdAt: Date };
export type TicketView = Omit<PlatformSupportTicket, "firmId"> & { messages?: MessageView[]; subject?: string; raisedByName?: string | null };
/** A ticket's subject (PF-18s part 2, challenge M5): the first line with words of its first message, cut to 80 characters. */
export const SUBJECT_MAX = 80;
/** Break m6: direction overrides and isolates are dropped from the subject (they could reverse a list's words), and the cut
 *  never splits a character a person sees as one (a flag, a family emoji). */
const BIDI = /[\u202a-\u202e\u2066-\u2069\u200e\u200f\u061c]/g;
export const subjectOf = (body: string) => {
  const line = (body.split(/\r\n|\r|\n/).map((l) => l.trim()).find(hasText) ?? body.trim()).replace(BIDI, "");
  const gs = [...new Intl.Segmenter("en", { granularity: "grapheme" }).segment(line)].map((g) => g.segment);
  return gs.length > SUBJECT_MAX ? `${gs.slice(0, SUBJECT_MAX - 1).join("").trimEnd()}…` : line;
};
const fileNumber = (key: string) => Number(key.split("/").pop());
const messageView = (m: PlatformSupportMessage, names?: Map<string, string>): MessageView => ({ id: m.id, authorKind: m.authorKind, authorId: m.authorId,
  ...(names ? { authorName: m.authorKind === "FIRM_STAFF" ? names.get(m.authorId) ?? null : null } : {}), body: m.body, files: m.fileKeys.map(fileNumber), createdAt: m.createdAt });
const view = (t: PlatformSupportTicket, messages?: PlatformSupportMessage[], names?: Map<string, string>): TicketView => {
  const { firmId: _f, ...rest } = t;
  return { ...rest, ...(messages ? { messages: messages.map((m) => messageView(m, names)) } : {}) };
};
export const fileKeyOf = (ticketId: string, n: number) => `support/${ticketId.toLowerCase()}/${n}`;

// ------------------------------------------------------------------------------------------------------------- service
export class SupportService {
  constructor(private readonly d: SupportDeps) {}

  private has = (ctx: StaffContext, key: string) => ctx.keys.includes(key);
  /** The Owner and Admin roles see and answer every ticket of the firm (AG-16-63); everyone else their own. */
  private allFirm = (ctx: StaffContext) => this.has(ctx, SUPPORT_KEYS.list) && ctx.roles.some((r) => (ALL_FIRM_ROLES as readonly string[]).includes(r));
  private sees = (ctx: StaffContext, t: PlatformSupportTicket) => this.has(ctx, SUPPORT_KEYS.list) && (this.allFirm(ctx) || t.raisedBy === ctx.staffId.toLowerCase());
  private actor = (ctx: StaffContext) => `staff:${ctx.staffId.toLowerCase()}`;
  /** Break M1: the database's platform_support_has_text is the one judge of a body (Node's Unicode and PostgreSQL's
   *  differ, and differ again between versions), asked before any file is stored or row written: a 422, never a 500. */
  private async bodyHasText(db: Tx | PrismaClient, body: string): Promise<void> {
    const r = await db.$queryRaw<{ ok: boolean }[]>`SELECT platform_support_has_text(${body}) AS ok`;
    if (!r[0]?.ok) fieldErrors({ body: "write what you need help with in letters, digits or punctuation (some new characters are not read here yet)" });
  }

  /** Raises a ticket (agent/support-ticket:create): checks every file first, stores them, then one transaction; the
   *  email after the commit. */
  async raise(ctx: StaffContext, input: unknown, uploads: Upload[] = []): Promise<TicketView & { emailed: boolean }> {
    if (!this.has(ctx, SUPPORT_KEYS.create)) problem(403, "not-allowed", "Not allowed", "Raising a support ticket needs the permission to raise support tickets.");
    const v = parse(Raise, input);
    await this.bodyHasText(this.d.db, v.body);
    if (uploads.length > MAX_FILES) fieldErrors({ files: `at most ${MAX_FILES} attachments` });
    const bad: Record<string, string> = {};
    uploads.forEach((f, i) => { const why = attachmentProblem(f); if (why) bad[`files.${i}`] = why; });
    if (Object.keys(bad).length) fieldErrors(bad);
    const firmId = firmScope(ctx.firmId).firmId, ticketId = randomUUID(), staffId = ctx.staffId.toLowerCase();
    const keys: string[] = [];
    for (const [i, f] of uploads.entries()) {
      const key = fileKeyOf(ticketId, i + 1);
      await this.d.files.put(firmId, key, f.bytes, (f.contentType ?? "").split(";")[0].trim().toLowerCase());
      keys.push(key);
    }
    const t = await this.d.db.$transaction(async (tx) => {
      const ticket = await tx.platformSupportTicket.create({ data: { id: ticketId, firmId, raisedBy: staffId, page: v.page } });
      const m = await tx.platformSupportMessage.create({ data: { firmId, ticketId, authorKind: "FIRM_STAFF", authorId: staffId, body: v.body, fileKeys: keys } });
      await this.d.audit.record(tx, { firmId, actor: this.actor(ctx), action: "support.ticket.raised", entity: "platform_support_ticket", entityKey: ticketId,
        summary: `Support ticket raised with ${keys.length} attachment(s)`, detail: { ticketId, messageId: m.id, fields: ["body", "page", ...(keys.length ? ["files"] : [])], files: keys.length },
        before: null, after: { status: ticket.status, files: keys.length } });   // the ticket's words never reach an audit line (PF-18b, AG-16-63)
      const e = SupportTicketRaised.parse({ type: EVENT.SUPPORT_TICKET_RAISED, firmId, ticketId, raisedBy: staffId, files: keys.length, createdAt: ticket.createdAt.toISOString() });
      await tx.moduleEvent.create({ data: { firmId, type: e.type, subjectId: ticketId, payload: e } });
      return { ticket, m };
    });
    let emailed = true;
    await this.d.mail.send({
      firmId, to: SUPPORT_INBOX(), replyTo: SUPPORT_INBOX(), class: "TRANSACTIONAL", templateKey: "support.ticket_raised", idempotencyKey: `support-ticket:${ticketId}`,
      subject: `Support ticket ${ticketId} from ${ctx.firmKey}`,
      text: `A support ticket was raised.\nFirm: ${ctx.firmKey}\nTicket: ${ticketId}\nPage: ${v.page}\nRead it in the support console.`,
    }).catch(() => { emailed = false; });
    return { ...view(t.ticket, [t.m]), emailed };
  }

  /** The person's own tickets, or the firm's for an Owner or Admin; newest first. */
  async list(ctx: StaffContext): Promise<{ items: TicketView[]; allFirm: boolean }> {
    const firmId = firmScope(ctx.firmId).firmId, all = this.allFirm(ctx);
    const rows = await this.d.db.platformSupportTicket.findMany({ where: firmScope(firmId, all ? {} : { raisedBy: ctx.staffId.toLowerCase() }), orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: PAGE,
      include: { raiser: { select: { displayName: true } }, messages: { orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 1, select: { body: true } } } });
    return { items: rows.map(({ raiser, messages, ...t }) => ({ ...view(t), subject: subjectOf(messages[0]?.body ?? ""), raisedByName: raiser.displayName })), allFirm: all };
  }

  /** One ticket with its messages in order, for a person who may see it; otherwise the same 404 as another firm's. */
  async get(ctx: StaffContext, id: string): Promise<TicketView> {
    const t = await this.visible(ctx, id);
    const messages = await this.d.db.platformSupportMessage.findMany({ where: firmScope(t.firmId, { ticketId: t.id }), orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
    const ids = [...new Set([t.raisedBy, ...messages.filter((m) => m.authorKind === "FIRM_STAFF").map((m) => m.authorId)])].filter(isUuid);
    const staff = await this.d.db.platformStaff.findMany({ where: firmScope(t.firmId, { id: { in: ids } }), select: { id: true, displayName: true } });
    const names = new Map(staff.map((s) => [s.id.toLowerCase(), s.displayName]));
    return { ...view(t, messages, names), subject: subjectOf(messages[0]?.body ?? ""), raisedByName: names.get(t.raisedBy) ?? null };
  }

  /** The firm's next message (the raiser, or an Owner or Admin): "Waiting on support". */
  async addMessage(ctx: StaffContext, id: string, input: unknown): Promise<TicketView> {
    const v = parse(Message, input);
    await this.bodyHasText(this.d.db, v.body);
    const seen = await this.visible(ctx, id);
    return this.d.db.$transaction(async (tx) => {
      const t = await this.lock(tx, seen.id, seen.firmId);
      if (t.status === "CLOSED") closedRefused();
      const m = await tx.platformSupportMessage.create({ data: { firmId: t.firmId, ticketId: t.id, authorKind: "FIRM_STAFF", authorId: ctx.staffId.toLowerCase(), body: v.body } });
      const u = await tx.platformSupportTicket.update({ where: { firmId_id: { firmId: t.firmId, id: t.id } }, data: { status: "WAITING_ON_SUPPORT" } });
      await this.d.audit.record(tx, { firmId: t.firmId, actor: this.actor(ctx), action: "support.ticket.message_added", entity: "platform_support_ticket", entityKey: t.id,
        summary: "Message added to a support ticket; waiting on support", detail: { ticketId: t.id, messageId: m.id, fields: ["body"] },
        before: { status: t.status }, after: { status: u.status } });
      return view(u, [m]);
    });
  }

  /** Our team's reply (PF-17's console calls it, under /api/system after PF-4s): "Waiting on firm". Inside the caller's
   *  transaction; the caller runs on the system plane (no firm scope: our team answers every firm). */
  async replyAsSupport(tx: Tx, input: { ticketId: string; body: string }): Promise<TicketView> {
    const v = parse(z.object({ ticketId: z.string().refine(isUuid, "a ticket id"), body: Body }).strict(), input);
    await this.bodyHasText(tx, v.body);
    const t = await this.lock(tx, v.ticketId.toLowerCase());
    if (t.status === "CLOSED") closedRefused();
    const m = await tx.platformSupportMessage.create({ data: { firmId: t.firmId, ticketId: t.id, authorKind: "SUPPORT", authorId: "support", body: v.body } });
    const u = await tx.platformSupportTicket.update({ where: { firmId_id: { firmId: t.firmId, id: t.id } }, data: { status: "WAITING_ON_FIRM" } });
    await this.d.audit.record(tx, { firmId: t.firmId, actor: "system:support", action: "support.ticket.replied", entity: "platform_support_ticket", entityKey: t.id,
      summary: "Support replied to a ticket; waiting on the firm", detail: { ticketId: t.id, messageId: m.id, fields: ["body"] },
      before: { status: t.status }, after: { status: u.status } });
    return view(u, [m]);
  }

  /** The key of attachment `n` of a ticket the person sees (for a signed link), or 404. */
  async fileKey(ctx: StaffContext, id: string, n: unknown): Promise<string> {
    const t = await this.visible(ctx, id), num = typeof n === "string" && /^[1-9]$/.test(n) ? Number(n) : NaN, key = fileKeyOf(t.id, num);
    const has = Number.isInteger(num) && await this.d.db.platformSupportMessage.findFirst({ where: firmScope(t.firmId, { ticketId: t.id, fileKeys: { has: key } }), select: { id: true } });
    return has ? key : notFound();
  }

  /** A signed link's key still names a ticket the person sees (404 otherwise). */
  async assertKeyVisible(ctx: StaffContext, key: string): Promise<void> {
    const m = /^support\/([0-9a-f-]{36})\/[1-9]$/.exec(key);
    if (!m) notFound();
    await this.visible(ctx, m![1]);
  }

  private async visible(ctx: StaffContext, id: string): Promise<PlatformSupportTicket> {
    if (!isUuid(id)) return notFound();
    const t = await this.d.db.platformSupportTicket.findFirst({ where: firmScope(ctx.firmId, { id: id.toLowerCase() }) });
    return t && this.sees(ctx, t) ? t : notFound();
  }

  /** Locks one ticket for the rest of the transaction (in the firm when given), or the 404. */
  private async lock(tx: Tx, id: string, firmId?: string): Promise<PlatformSupportTicket> {
    if (!isUuid(id)) return notFound();
    if (firmId) await tx.$queryRaw`SELECT id FROM "platform_support_ticket" WHERE firm_id = ${firmScope(firmId).firmId}::uuid AND id = ${id}::uuid FOR UPDATE`;
    else await tx.$queryRaw`SELECT id FROM "platform_support_ticket" WHERE id = ${id}::uuid FOR UPDATE`;
    return (await tx.platformSupportTicket.findFirst({ where: firmId ? firmScope(firmId, { id }) : { id } })) ?? notFound();
  }
}
