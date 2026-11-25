// PF-21 (P-579, P-584 (8); BACKLOG row PF-21 = FO-13k rev 12's Done when; contracts §0, §7, §9): the firm's complaints
// record. A complaint made to the firm by a front-office person, a case party or another person (kind + the other
// module's id, never a foreign key into it: the id is not checked here, the other module owns it), each handling step,
// the outcome and the dates; an acknowledgement reminder to the handler on JobPort after the Sample period
// (business-days.ts) for s. 29's "promptly respond"; a closed complaint stays readable and changes only by a new event;
// never deleted. Code SOR/2022-128 s. 24(3)(r), s. 29, s. 37; legal reading Unconfirmed: no counsel; every field, list
// and period Sample until the College's by-laws are read.
// Who (Lead 47 on #1753): agent/complaint:record (Owner, Admin, Case Manager) records a complaint; agent/complaint:read
// (Owner, Admin) reads every one; record + read act on any; the handler reads their own without either key and handles
// it (steps, response, close) only while they hold the record key (PF-21j, QA-517: a handler who lost it, say made
// Read-only, still reads it but gets 403 on a change). Only a person whose roles grant the record key can be made
// handler (422 otherwise). Anyone else gets the same 404 as for another firm's complaint (an id leaks nothing).
// Every change is one transaction: the event first, then the row (the database refuses a row change without its event),
// one AuditPort line (a failing audit rolls everything back). Job calls run after the commit (JobPort takes no
// transaction): a rolled-back change never cancels a reminder. The reminder's mail is sent inside its run, after its
// event (runAckReminder): a failed send is never recorded as sent.
// Events (contracts §0.5): complaint.received and complaint.closed go to the outbox (module_event), written last in the
// change's transaction, ids and facts only (ports/events.ts). Not yet here: routes wait for PF-4's @PermissionKeys.
import { HttpException, HttpStatus } from "@nestjs/common";
import type { PlatComplaint, PlatComplaintEvent, Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import type { AuditPort, AuditValues } from "../../../../ports/audit.ts";
import type { ClockPort } from "../../../../ports/clock.ts";
import type { JobPort } from "../../../../ports/jobs.ts";
import type { MailPort } from "../../../../ports/mail.ts";
import { ComplaintClosed, ComplaintReceived, EVENT } from "../../../../ports/events.ts";
import { MessageRefused } from "../../../../ports/messages.ts";
import type { StaffContext } from "../../../../ports/staff.ts";
import { firmScope } from "../firm-scope.ts";
import { lockRequestKey, requestHash } from "../idempotency.ts";
import { mailIn } from "../messages/send/mail.ts";
import { readSetting, TIME_ZONE } from "../settings.ts";
import { BusinessDayTally, businessDaysBetween, readFirmCalendar, type FirmCalendar } from "../calendar/working-days.ts";
import { acknowledgeBy } from "./business-days.ts";

export const COMPLAINT_KEYS = { record: "agent/complaint:record", read: "agent/complaint:read" } as const;
export const ACK_REMINDER_JOB = "platform.complaint.ack_reminder";
export const ackReminderKey = (complaintId: string) => `plat-complaint-ack:${complaintId}`;
const SYSTEM_ACTOR = "system:complaint-ack-reminder";
/** The list's page size (and its largest). */
export const PAGE = 100;

type Tx = Prisma.TransactionClient;
export type ComplaintDeps = { db: PrismaClient; audit: AuditPort<Tx>; jobs: JobPort; clock: ClockPort; mail: MailPort };

// ------------------------------------------------------------------------------------------------------------- problems
const problem = (status: number, code: string, title: string, detail: string, extra: Record<string, unknown> = {}): never => {
  throw new HttpException({ type: `https://expatready.local/problems/${code}`, title, status, detail, code: code.toUpperCase().replace(/-/g, "_"), ...extra }, status as HttpStatus);
};
export const notFound = (): never => problem(404, "not-found", "Not found", "No such complaint.");
/** Field errors, one message per field (the screen shows each at its field). */
const fieldErrors = (fields: Record<string, string>): never => problem(422, "complaint-fields", "Check the highlighted fields", "Some fields need a change.", { fields });
const closedRefused = (): never => problem(409, "complaint-closed", "This complaint is closed", "A closed complaint is not changed: add a note instead.");

// ------------------------------------------------------------------------------------------------------------- input
/** The same two lists as the migration's plat_complaint_has_text: blanks of every width, invisible format marks, fillers
 *  and direction marks do not count as text; no C0 or C1 control character. */
const BLANK = "\\u0009-\\u000d\\u0020\\u0085\\u00a0\\u00ad\\u034f\\u061c\\u115f\\u1160\\u1680\\u180e\\u2000-\\u200f\\u2028-\\u202f\\u205f-\\u2064\\u2066-\\u206f\\u2800\\u3000\\u3164\\ufe00-\\ufe0f\\ufeff\\uffa0";
const BLANK_ALL = new RegExp(`[${BLANK}]`, "g");
/** After removing the blanks, at least one letter (or letter number), ASCII digit, punctuation mark or symbol: the
 *  migration's plat_complaint_has_text asks the same of the database's pg_c_utf8 classes ([:alpha:], ASCII [:digit:],
 *  [:punct:] with symbols). Combining marks, tags, variation selectors and format characters alone are not text. */
const SEEN = /[\p{L}\p{Nl}\p{P}\p{S}0-9]/u;
const filled = (s: string) => SEEN.test(s.replace(BLANK_ALL, ""));
const CONTROL = new RegExp("[\\u0000-\\u0008\\u000b\\u000c\\u000e-\\u001f\\u007f-\\u0084\\u0086-\\u009f]");
/** One line: no line or paragraph break, no tab, and no direction override or isolate (a name shown reversed). */
const LINE_BREAK = new RegExp("[\\u0009-\\u000d\\u0085\\u2028\\u2029\\u202a-\\u202e\\u2066-\\u2069]");
const text = (max: number, oneLine = false) => z.string().max(max, `at most ${max} characters`)
  .refine(filled, "write something here")
  .refine((s) => !CONTROL.test(s), "remove the control characters")
  .refine((s) => !(oneLine && LINE_BREAK.test(s)), "keep this on one line, without direction marks");

const ISO = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(Z|[+-](\d{2}):(\d{2}))$/;
/** A real calendar date and time (no 31 February, no 24:00), with its offset, from the year 2000. */
export function isInstant(s: string): boolean {
  const m = ISO.exec(s);
  if (!m) return false;
  const [y, mo, d, h, mi, se] = [m[1], m[2], m[3], m[4], m[5], m[6] ?? "0"].map(Number);
  if (y < 2000 || mo < 1 || mo > 12 || d < 1 || h > 23 || mi > 59 || se > 59) return false;
  if (m[7] !== "Z" && (Number(m[8]) > 14 || Number(m[9]) > 59)) return false;
  return new Date(Date.UTC(y, mo - 1, d)).getUTCDate() === d && Number.isFinite(Date.parse(s)) && Date.parse(s) >= Date.UTC(2000, 0, 1);
}
const instant = z.string({ error: "a date and time is needed" }).refine(isInstant, "a real date and time from 2000 on, e.g. 2026-11-16T14:00:00Z").transform((s) => new Date(s));
/** The same uuid rule as the shared event shapes (ports/events.ts, zod's uuid): an id that passes here never fails there. */
const UUID_SHAPE = z.string().uuid();
export const isUuid = (s: unknown): s is string => UUID_SHAPE.safeParse(s).success;
const uuid = z.string().refine(isUuid, "an id").transform((s) => s.toLowerCase());

export const SUBJECT_KINDS = ["FRONT_OFFICE_PERSON", "CASE_PARTY", "OTHER_PERSON"] as const;
export const CHANNELS = ["EMAIL", "PHONE", "IN_PERSON", "LETTER", "WEB_FORM", "OTHER"] as const;
export const CATEGORIES = ["SERVICE", "FEES", "COMMUNICATION", "CONDUCT", "PRIVACY", "OTHER"] as const;
export const OUTCOMES = ["RESOLVED", "UPHELD", "NOT_UPHELD", "WITHDRAWN", "REFERRED_TO_COLLEGE"] as const;

export const RecordComplaint = z.object({
  subjectKind: z.enum(SUBJECT_KINDS, { error: "choose who made the complaint" }),
  subjectId: uuid.optional(),
  complainantName: text(200, true).optional(),
  complainantContact: text(320, true).optional(),
  receivedAt: instant,
  channel: z.enum(CHANNELS, { error: "choose how it was received" }),
  category: z.enum(CATEGORIES, { error: "choose what it is about" }),
  summary: text(4000),
  handlerStaffId: uuid,
}).strict().superRefine((v, c) => {
  if (v.subjectKind === "OTHER_PERSON") {
    if (v.subjectId) c.addIssue({ code: "custom", path: ["subjectId"], message: "another person has no record to link" });
    if (!v.complainantName) c.addIssue({ code: "custom", path: ["complainantName"], message: "the person's name is needed" });
  } else if (!v.subjectId) c.addIssue({ code: "custom", path: ["subjectId"], message: "choose the person" });
});
export type RecordComplaint = z.input<typeof RecordComplaint>;

const At = z.object({ at: instant, note: text(4000).optional() }).strict();
const Step = z.object({ kind: z.enum(["STEP", "NOTE"], { error: "Choose STEP (a step taken) or NOTE (a note)." }), note: text(4000), at: instant.optional() }).strict();
const Handler = z.object({ handlerStaffId: uuid, note: text(4000).optional() }).strict();
const Close = z.object({ outcome: z.enum(OUTCOMES, { error: "choose the outcome" }), at: instant, note: text(4000) }).strict();
export const LIST_VIEWS = ["open", "overdue", "closed", "all"] as const;
export type ListView = (typeof LIST_VIEWS)[number];

export function parse<T extends z.ZodType>(schema: T, input: unknown): z.output<T> {
  const r = schema.safeParse(input ?? {});
  if (r.success) return r.data;
  const fields: Record<string, string> = {};
  for (const i of r.error.issues) { const k = i.path.length ? i.path.join(".") : (i.code === "unrecognized_keys" ? (i as { keys?: string[] }).keys?.join(",") ?? "_" : "_"); fields[k] ??= i.code === "invalid_type" && i.input === undefined ? "this is needed" : i.message; }
  return fieldErrors(fields);
}

// ------------------------------------------------------------------------------------------------------------- views
/** PF-21v: what the screen shows without working it out itself (STANDARDS §7). `businessDaysLeft`: for an open, not
 *  acknowledged complaint, the business days from today to its acknowledge-by day (0: due today), or, once overdue,
 *  minus the business days it is late, at least 1 (so the sign always agrees with `overdue`); null once acknowledged or
 *  closed. `people`: the display name of every staff id in the answer (handler, recorder, event actors, a handler
 *  change's from and to; staff of any status; names only), keyed by the bare id (an actor "staff:<id>" is <id>).
 *  `firmTimeZone`: the firm's zone setting. */
export type ComplaintView = Omit<PlatComplaint, "firmId" | "requestKey" | "requestHash"> & { overdue: boolean; businessDaysLeft: number | null; events?: Omit<PlatComplaintEvent, "firmId" | "seq">[]; reminderScheduled?: boolean };
export type People = Record<string, string>;
export type ComplaintPage = { items: ComplaintView[]; next: string | null; people: People; firmTimeZone: string };
export type ComplaintDetail = ComplaintView & { people: People; firmTimeZone: string };
export type HandlerChoices = { items: { id: string; displayName: string }[] };
const isOverdue = (c: PlatComplaint, now: Date) => c.status === "OPEN" && !c.acknowledgedAt && now > c.acknowledgeBy;
/** One request's calendar and the day answers its rows share (the settings are read once per request). */
type Days = { cal: FirmCalendar; tally: BusinessDayTally };
function daysLeft(c: PlatComplaint, now: Date, d: Days): number | null {
  if (c.status !== "OPEN" || c.acknowledgedAt) return null;
  if (isOverdue(c, now)) return -Math.max(1, businessDaysBetween(d.cal, c.acknowledgeBy, now, d.tally));
  return businessDaysBetween(d.cal, now, c.acknowledgeBy, d.tally);
}
/** R1.8 (QA-594, P-687): a complaint's values as its audit line's before and after, in full (the complainant's name and
 *  contact included; the firm's log shows them to holders of the audit permission). */
const valuesOf = (c: PlatComplaint): AuditValues => ({ subjectKind: c.subjectKind, subjectId: c.subjectId, complainantName: c.complainantName, complainantContact: c.complainantContact,
  receivedAt: c.receivedAt.toISOString(), channel: c.channel, category: c.category, summary: c.summary.slice(0, 4000), handlerStaffId: c.handlerStaffId, acknowledgeBy: c.acknowledgeBy.toISOString(),
  acknowledgedAt: c.acknowledgedAt?.toISOString() ?? null, responseSentAt: c.responseSentAt?.toISOString() ?? null, status: c.status, outcome: c.outcome, closedAt: c.closedAt?.toISOString() ?? null });

const view = (c: PlatComplaint, now: Date, d: Days, events?: PlatComplaintEvent[]): ComplaintView => {
  const { firmId: _f, requestKey: _k, requestHash: _h, ...rest } = c;   // PF-21i: the request key stays inside
  return { ...rest, overdue: isOverdue(c, now), businessDaysLeft: daysLeft(c, now, d), ...(events ? { events: events.map(({ firmId: _ef, seq: _s, ...e }) => e) } : {}) };
};
/** The staff ids an answer names: the handler, the recorder and each staff actor ("staff:<id>"), and a handler
 *  change's from and to. A system actor is not staff. */
function staffIdsIn(c: PlatComplaint, events: PlatComplaintEvent[] = []): string[] {
  const out = [c.handlerStaffId];
  const actor = (a: string) => { const m = /^staff:(.+)$/.exec(a); if (m && isUuid(m[1])) out.push(m[1].toLowerCase()); };
  actor(c.recordedBy);
  for (const e of events) {
    actor(e.actor);
    if (e.kind === "HANDLER_CHANGED" && e.detail && typeof e.detail === "object" && !Array.isArray(e.detail)) {
      for (const k of ["from", "to"] as const) { const v = (e.detail as Record<string, unknown>)[k]; if (isUuid(v)) out.push(v.toLowerCase()); }
    }
  }
  return out;
}
/** A list cursor: the last row's sort date and id, opaque to the caller. */
const cursorOf = (at: Date, id: string) => Buffer.from(`${at.toISOString()}|${id}`).toString("base64url");
function readCursor(s: unknown): { at: Date; id: string } {
  if (typeof s !== "string" || s.length > 200) return fieldErrors({ cursor: "start the list again" });
  const [at, id] = Buffer.from(s, "base64url").toString("utf8").split("|");
  if (!at || !id || !isUuid(id) || !isInstant(at)) return fieldErrors({ cursor: "start the list again" });
  return { at: new Date(at), id };
}

/** Writes one event to the outbox (module_event, PF-3), last in its transaction (contracts §0.5): its subject is the
 *  complaint; the payload is the event's own ids-only shape (ports/events.ts). */
const outbox = (tx: Tx, c: PlatComplaint, e: ComplaintReceived | ComplaintClosed) =>
  tx.moduleEvent.create({ data: { firmId: c.firmId, type: e.type, subjectId: c.id, payload: e } });

/** PF-21i: set (not sent: a symbol is no JSON key) on record's answer when it repeats an earlier request with the same
 *  Idempotency-Key and body, so the route answers 200 instead of 201. */
export const REPEATED = Symbol("complaint.repeated");
export const KEY_LOCK = "plat-complaint-key";
/** PF-21j: the field error for a handler who may not record complaints. */
export const HANDLER_NEEDS_KEY = "This person cannot handle complaints. Choose someone who may record them.";
const keyReused = (): never => problem(422, "idempotency-key-reused", "Request key already used", "This request key was already used for a different complaint.");

/** Work to run after the transaction commits (job and mail calls). */
type After = (() => Promise<unknown>)[];

// ------------------------------------------------------------------------------------------------------------- service
export class ComplaintsService {
  constructor(private readonly d: ComplaintDeps) {}

  private has = (ctx: StaffContext, key: string) => ctx.keys.includes(key);
  private handles = (ctx: StaffContext, c: PlatComplaint) => c.handlerStaffId === ctx.staffId.toLowerCase();
  /** Read: the read key, or the handler. */
  private canRead = (ctx: StaffContext, c: PlatComplaint) => this.has(ctx, COMPLAINT_KEYS.read) || this.handles(ctx, c);
  /** Act (PF-21j): the record key, and either being the handler or the read key too. */
  private canAct = (ctx: StaffContext, c: PlatComplaint) => this.has(ctx, COMPLAINT_KEYS.record) && (this.handles(ctx, c) || this.has(ctx, COMPLAINT_KEYS.read));
  private actor = (ctx: StaffContext) => `staff:${ctx.staffId.toLowerCase()}`;

  /** The names behind the staff ids of rows the reader may already see: one read, the firm's staff of any status. */
  private async people(firmId: string, ids: string[]): Promise<People> {
    const want = [...new Set(ids)];
    if (!want.length) return {};
    const rows = await this.d.db.platformStaff.findMany({ where: firmScope(firmId, { id: { in: want } }), select: { id: true, displayName: true } });
    return Object.fromEntries(rows.map((r) => [r.id, r.displayName]));
  }
  private async days(db: Tx | PrismaClient, firmId: string): Promise<Days> { const cal = await this.calendar(db, firmId); return { cal, tally: new BusinessDayTally(cal) }; }

  private calendar(db: Tx | PrismaClient, firmId: string): Promise<FirmCalendar> { return readFirmCalendar(db, firmId); }

  /** The handler must be an active staff member of the firm (the foreign key proves the firm; this the state). */
  private async activeStaff(tx: Tx, firmId: string, staffId: string): Promise<boolean> {
    return !!(await tx.platformStaff.findFirst({ where: firmScope(firmId, { id: staffId, status: "ACTIVE" as const }), select: { id: true } }));
  }

  /** PF-21j: the firm's active staff whose current roles (grants not ended) grant the record key: who can handle one. */
  private async mayHandle(db: Tx | PrismaClient, firmId: string, extra: Prisma.PlatformStaffWhereInput = {}): Promise<Prisma.PlatformStaffWhereInput> {
    const roles = (await db.platformRolePermission.findMany({ where: { permissionKey: COMPLAINT_KEYS.record }, select: { role: true } })).map((r) => r.role);
    return firmScope(firmId, { ...extra, status: "ACTIVE" as const, grants: { some: { endedAt: null, role: { in: roles } } } });
  }

  /** The handler being set: an active staff member of the firm (422 at the field otherwise, as before), who may record
   *  complaints (PF-21j: 422 with its own sentence otherwise). */
  private async checkHandler(tx: Tx, firmId: string, staffId: string) {
    if (!(await this.activeStaff(tx, firmId, staffId))) fieldErrors({ handlerStaffId: "choose an active staff member of your firm" });
    if (!(await tx.platformStaff.findFirst({ where: await this.mayHandle(tx, firmId, { id: staffId }), select: { id: true } }))) fieldErrors({ handlerStaffId: HANDLER_NEEDS_KEY });
  }

  /** Locks one complaint of the firm for the rest of the transaction, or the 404 (another firm's, none, or not an id). */
  private async lock(tx: Tx, firmId: string, id: string): Promise<PlatComplaint> {
    if (!isUuid(id)) return notFound();
    const scope = firmScope(firmId), key = id.toLowerCase();
    await tx.$queryRaw`SELECT id FROM "plat_complaint" WHERE firm_id = ${scope.firmId}::uuid AND id = ${key}::uuid FOR UPDATE`;
    return (await tx.platComplaint.findFirst({ where: firmScope(firmId, { id: key }) })) ?? notFound();
  }

  private notFuture(fields: Record<string, Date | undefined>) {
    const now = this.d.clock.now(), bad: Record<string, string> = {};
    for (const [k, v] of Object.entries(fields)) if (v && v > now) bad[k] = "this date is in the future";
    if (Object.keys(bad).length) fieldErrors(bad);
  }

  /** Runs a transaction, then (only once it committed) its after-commit work. */
  private async commit<T>(work: (tx: Tx, after: After) => Promise<T>): Promise<T> {
    const after: After = [];
    const out = await this.d.db.$transaction((tx) => work(tx, after));
    for (const f of after) await f();
    return out;
  }

  /** Records a complaint (key agent/complaint:record): the row, its RECEIVED event, one audit line, the outbox event;
   *  after the commit, the reminder job (keyed by the complaint, so it never queues twice). The complaint is recorded
   *  once committed: a job queue that fails afterwards is answered with `reminderScheduled: false` (never a 500 that
   *  would make the person record it twice); the overdue list still shows the complaint when its date passes.
   *  PF-21i: with `key` (the route's Idempotency-Key, required at the door), the key is locked for the transaction and
   *  looked up in the firm: found with the same body (canonical SHA-256) and the same recorder → that complaint as it
   *  was recorded (open, not acknowledged, the first handler: never its later state), marked REPEATED, and nothing is written (no event, audit line, outbox row or reminder job); found with another body,
   *  or recorded by someone else → 422 IDEMPOTENCY_KEY_REUSED; not found → recorded as before, keeping the key and hash.
   *  Without `key` (in-process callers only, e.g. PF-21's suite) it records as before. */
  async record(ctx: StaffContext, input: unknown, key?: string): Promise<ComplaintView & { reminderScheduled?: boolean; [REPEATED]?: true }> {
    if (!this.has(ctx, COMPLAINT_KEYS.record)) problem(403, "not-allowed", "Not allowed", "Recording a complaint needs the permission to record complaints.");
    const v = parse(RecordComplaint, input);
    this.notFuture({ receivedAt: v.receivedAt });
    const firmId = firmScope(ctx.firmId).firmId, now = this.d.clock.now();
    let reminderScheduled = true;
    const hash = key === undefined ? null : requestHash(input);
    let repeated = false;
    const recorded = await this.commit(async (tx, after) => {
      if (key !== undefined) {
        await lockRequestKey(tx, KEY_LOCK, firmId, key);
        const first = await tx.platComplaint.findFirst({ where: firmScope(firmId, { requestKey: key }) });
        if (first) {
          if (first.requestHash !== hash || first.recordedBy !== this.actor(ctx)) keyReused();
          repeated = true;
          // The answer to the first request, never the complaint's later state (review M1): a recorder who may not read
          // it learns nothing of an acknowledgement, response, close or handler change made since.
          const asRecorded: PlatComplaint = { ...first, handlerStaffId: v.handlerStaffId, acknowledgedAt: null, responseSentAt: null, status: "OPEN", outcome: null, closedAt: null, updatedAt: first.createdAt };
          return view(asRecorded, now, await this.days(tx, firmId));
        }
      }
      await this.checkHandler(tx, firmId, v.handlerStaffId);
      const days = await this.days(tx, firmId), due = acknowledgeBy(v.receivedAt, days.cal);
      const c = await tx.platComplaint.create({ data: {
        firmId, subjectKind: v.subjectKind, subjectId: v.subjectId ?? null, complainantName: v.complainantName ?? null, complainantContact: v.complainantContact ?? null,
        receivedAt: v.receivedAt, channel: v.channel, category: v.category, summary: v.summary, handlerStaffId: v.handlerStaffId,
        acknowledgeBy: due, recordedBy: this.actor(ctx), requestKey: key ?? null, requestHash: hash,
      } });
      await tx.platComplaintEvent.create({ data: { firmId, complaintId: c.id, kind: "RECEIVED", at: v.receivedAt, actor: this.actor(ctx), detail: { channel: v.channel, category: v.category, handlerStaffId: v.handlerStaffId } } });
      await this.d.audit.record(tx, { firmId, actor: this.actor(ctx), action: "complaint.record", entity: "plat_complaint", entityKey: c.id, summary: `Complaint recorded (${v.category.toLowerCase()}, by ${v.subjectKind.toLowerCase().replace(/_/g, " ")}); acknowledge by ${due.toISOString()}`, detail: { complaintId: c.id, subjectKind: v.subjectKind, subjectId: v.subjectId ?? null, handlerStaffId: v.handlerStaffId }, before: null, after: valuesOf(c) });
      await outbox(tx, c, ComplaintReceived.parse({ type: EVENT.COMPLAINT_RECEIVED, firmId, complaintId: c.id, subjectKind: c.subjectKind, subjectId: c.subjectId, receivedAt: c.receivedAt.toISOString() }));
      after.push(() => this.d.jobs.schedule(ACK_REMINDER_JOB, due, { firmId, complaintId: c.id }, { key: ackReminderKey(c.id), firmId }).then(() => undefined, () => { reminderScheduled = false; }));
      return view(c, now, days);
    });
    return repeated ? { ...recorded, [REPEATED]: true as const } : { ...recorded, reminderScheduled };
  }

  /** One complaint with its events in order, for a person who may read it; otherwise the same 404 as another firm's. */
  async get(ctx: StaffContext, id: string): Promise<ComplaintDetail> {
    if (!isUuid(id)) return notFound();
    const c = await this.d.db.platComplaint.findFirst({ where: firmScope(ctx.firmId, { id: id.toLowerCase() }) });
    if (!c || !this.canRead(ctx, c)) return notFound();
    const events = await this.d.db.platComplaintEvent.findMany({ where: firmScope(ctx.firmId, { complaintId: c.id }), orderBy: { seq: "asc" } });
    const days = await this.days(this.d.db, ctx.firmId);
    return { ...view(c, this.d.clock.now(), days, events), people: await this.people(ctx.firmId, staffIdsIn(c, events)), firmTimeZone: days.cal.zone };
  }

  /** The list, a page at a time (`next` is the cursor of the next page, null at the end): open, closed or all newest
   *  received first; overdue (open, not acknowledged, past its date) the longest overdue first. A person without the
   *  read key sees only the complaints they handle. */
  async list(ctx: StaffContext, viewName: string = "open", page: { cursor?: unknown; limit?: number } = {}): Promise<ComplaintPage> {
    if (!(LIST_VIEWS as readonly string[]).includes(viewName)) fieldErrors({ view: `one of ${LIST_VIEWS.join(", ")}` });
    const limit = page.limit ?? PAGE;
    if (!Number.isInteger(limit) || limit < 1 || limit > PAGE) fieldErrors({ limit: `a whole number from 1 to ${PAGE}` });
    const now = this.d.clock.now(), v = viewName as ListView, byDue = v === "overdue";
    const mine = this.has(ctx, COMPLAINT_KEYS.read) ? {} : { handlerStaffId: ctx.staffId.toLowerCase() };
    const where: Prisma.PlatComplaintWhereInput = v === "open" ? { status: "OPEN" } : v === "closed" ? { status: "CLOSED" } : byDue ? { status: "OPEN", acknowledgedAt: null, acknowledgeBy: { lt: now } } : {};
    const cur = page.cursor !== undefined && page.cursor !== null && page.cursor !== "" ? readCursor(page.cursor) : null;
    const after: Prisma.PlatComplaintWhereInput = !cur ? {} : byDue
      ? { OR: [{ acknowledgeBy: { gt: cur.at } }, { acknowledgeBy: cur.at, id: { gt: cur.id } }] }
      : { OR: [{ receivedAt: { lt: cur.at } }, { receivedAt: cur.at, id: { gt: cur.id } }] };
    const rows = await this.d.db.platComplaint.findMany({
      where: firmScope(ctx.firmId, { AND: [where, mine, after] }),
      orderBy: byDue ? [{ acknowledgeBy: "asc" }, { id: "asc" }] : [{ receivedAt: "desc" }, { id: "asc" }],
      take: limit + 1,
    });
    const items = rows.slice(0, limit), last = items.at(-1), days = await this.days(this.d.db, ctx.firmId);
    return {
      items: items.map((c) => view(c, now, days)), next: rows.length > limit && last ? cursorOf(byDue ? last.acknowledgeBy : last.receivedAt, last.id) : null,
      people: await this.people(ctx.firmId, items.flatMap((c) => staffIdsIn(c))), firmTimeZone: days.cal.zone,
    };
  }

  /** PF-21v: who can be made handler (key agent/complaint:record): the firm's active staff who may record complaints
   *  (PF-21j), by name then id; the id and the name only. */
  async handlers(ctx: StaffContext): Promise<HandlerChoices> {
    if (!this.has(ctx, COMPLAINT_KEYS.record)) problem(403, "not-allowed", "Not allowed", "Choosing a handler needs the permission to record complaints.");
    const items = await this.d.db.platformStaff.findMany({ where: await this.mayHandle(this.d.db, ctx.firmId), select: { id: true, displayName: true }, orderBy: [{ displayName: "asc" }, { id: "asc" }] });
    return { items };
  }

  /** One change to a complaint by a person who may act on it: lock, check, event, row, audit — one transaction; its
   *  after-commit work (a job cancel) only once it committed. */
  private change(ctx: StaffContext, id: string, act: (tx: Tx, c: PlatComplaint, after: After) => Promise<{ action: string; summary: string; detail?: Record<string, string | number | boolean | null>; event?: ComplaintReceived | ComplaintClosed; added?: AuditValues }>): Promise<ComplaintView> {
    const firmId = firmScope(ctx.firmId).firmId;
    return this.commit(async (tx, after) => {
      const c = await this.lock(tx, firmId, id);
      if (!this.canRead(ctx, c)) return notFound();
      if (!this.canAct(ctx, c)) problem(403, "not-allowed", "Not allowed", "Changing a complaint needs the permission to record complaints, as its handler or with the permission to read every complaint.");
      const r = await act(tx, c, after);
      const fresh = (await tx.platComplaint.findFirst({ where: firmScope(firmId, { id: c.id }) }))!;
      // R1.8 (QA-594): the complaint's values before and after (only what changed is kept); a step or note adds an event row
      // and changes no field, so its line's after is that row (added).
      await this.d.audit.record(tx, { firmId, actor: this.actor(ctx), action: r.action, entity: "plat_complaint", entityKey: c.id, summary: r.summary, detail: { complaintId: c.id, ...(r.detail ?? {}) },
        before: r.added ? null : valuesOf(c), after: r.added ?? valuesOf(fresh) });
      if (r.event) await outbox(tx, c, r.event);
      return view(fresh, this.d.clock.now(), await this.days(tx, firmId));
    });
  }

  private event(tx: Tx, ctx: StaffContext, c: PlatComplaint, kind: PlatComplaintEvent["kind"], at: Date, note?: string, detail?: Record<string, unknown>) {
    return tx.platComplaintEvent.create({ data: { firmId: c.firmId, complaintId: c.id, kind, at, actor: this.actor(ctx), note: note ?? null, ...(detail ? { detail: detail as Prisma.InputJsonValue } : {}) } });
  }
  private where = (c: PlatComplaint) => ({ firmId_id: { firmId: c.firmId, id: c.id } });

  /** The complaint was acknowledged to the complainant (once, no later than the response); the reminder is cancelled
   *  after the commit. */
  acknowledge(ctx: StaffContext, id: string, input: unknown) {
    const v = parse(At, input);
    this.notFuture({ at: v.at });
    return this.change(ctx, id, async (tx, c, after) => {
      if (c.status === "CLOSED") closedRefused();
      if (c.acknowledgedAt) problem(409, "complaint-acknowledged", "Already acknowledged", "The acknowledgement is recorded once.");
      if (v.at < c.receivedAt) fieldErrors({ at: "the acknowledgement comes after the complaint was received" });
      if (c.responseSentAt && v.at > c.responseSentAt) fieldErrors({ at: "the acknowledgement comes no later than the response" });
      await this.event(tx, ctx, c, "ACKNOWLEDGED", v.at, v.note);
      await tx.platComplaint.update({ where: this.where(c), data: { acknowledgedAt: v.at } });
      after.push(() => this.d.jobs.cancel(ackReminderKey(c.id)).catch(() => false));   // a failed cancel is harmless: the run skips an acknowledged or closed complaint
      return { action: "complaint.acknowledge", summary: `Complaint acknowledged at ${v.at.toISOString()}` };
    });
  }

  /** A handling step or a note. A closed complaint takes a note only (a new event; nothing on the record changes). */
  addStep(ctx: StaffContext, id: string, input: unknown) {
    const v = parse(Step, input);
    this.notFuture({ at: v.at });
    return this.change(ctx, id, async (tx, c) => {
      if (c.status === "CLOSED" && v.kind !== "NOTE") closedRefused();
      const at = v.at ?? this.d.clock.now();
      if (at < c.receivedAt) fieldErrors({ at: "a step comes after the complaint was received" });
      await this.event(tx, ctx, c, v.kind, at, v.note);
      return { action: v.kind === "NOTE" ? "complaint.note" : "complaint.step", summary: v.kind === "NOTE" ? "Note added to a complaint" : "Handling step added to a complaint", added: { kind: v.kind, at: at.toISOString(), note: v.note?.slice(0, 4000) ?? null } };
    });
  }

  /** The firm's response was sent (once, no earlier than the acknowledgement). */
  responseSent(ctx: StaffContext, id: string, input: unknown) {
    const v = parse(At, input);
    this.notFuture({ at: v.at });
    return this.change(ctx, id, async (tx, c) => {
      if (c.status === "CLOSED") closedRefused();
      if (c.responseSentAt) problem(409, "complaint-responded", "Response already recorded", "The response date is recorded once.");
      if (v.at < (c.acknowledgedAt ?? c.receivedAt)) fieldErrors({ at: c.acknowledgedAt ? "the response comes after the acknowledgement" : "the response comes after the complaint was received" });
      await this.event(tx, ctx, c, "RESPONSE_SENT", v.at, v.note);
      await tx.platComplaint.update({ where: this.where(c), data: { responseSentAt: v.at } });
      return { action: "complaint.response", summary: `Response to a complaint sent at ${v.at.toISOString()}` };
    });
  }

  /** A new handler (both keys): an active staff member of the firm who may record complaints (PF-21j). */
  changeHandler(ctx: StaffContext, id: string, input: unknown) {
    const v = parse(Handler, input);
    return this.change(ctx, id, async (tx, c) => {
      if (!this.has(ctx, COMPLAINT_KEYS.record) || !this.has(ctx, COMPLAINT_KEYS.read)) problem(403, "not-allowed", "Not allowed", "Changing the handler needs the permissions to read and record complaints.");
      if (c.status === "CLOSED") closedRefused();
      if (v.handlerStaffId === c.handlerStaffId) fieldErrors({ handlerStaffId: "this person already handles it" });
      await this.checkHandler(tx, c.firmId, v.handlerStaffId);
      await this.event(tx, ctx, c, "HANDLER_CHANGED", this.d.clock.now(), v.note, { from: c.handlerStaffId, to: v.handlerStaffId });
      await tx.platComplaint.update({ where: this.where(c), data: { handlerStaffId: v.handlerStaffId } });
      return { action: "complaint.handler", summary: "Complaint handler changed" };   // R1.8: the handler before and after are on the line
    });
  }

  /** Closes with an outcome (once, no earlier than the acknowledgement and the response): the CLOSED event first, then
   *  the row; the reminder is cancelled after the commit. */
  close(ctx: StaffContext, id: string, input: unknown) {
    const v = parse(Close, input);
    this.notFuture({ at: v.at });
    return this.change(ctx, id, async (tx, c, after) => {
      if (c.status === "CLOSED") closedRefused();
      const floor = [c.receivedAt, c.acknowledgedAt, c.responseSentAt].filter((d): d is Date => !!d).reduce((a, b) => (b > a ? b : a));
      if (v.at < floor) fieldErrors({ at: "the close comes after the complaint was received, acknowledged and answered" });
      await this.event(tx, ctx, c, "CLOSED", v.at, v.note, { outcome: v.outcome });
      await tx.platComplaint.update({ where: this.where(c), data: { status: "CLOSED", outcome: v.outcome, closedAt: v.at } });
      after.push(() => this.d.jobs.cancel(ackReminderKey(c.id)).catch(() => false));   // a failed cancel is harmless: the run skips an acknowledged or closed complaint
      return { action: "complaint.close", summary: `Complaint closed: ${v.outcome.toLowerCase().replace(/_/g, " ")}`, detail: { outcome: v.outcome },
        event: ComplaintClosed.parse({ type: EVENT.COMPLAINT_CLOSED, firmId: c.firmId, complaintId: c.id, subjectKind: c.subjectKind, subjectId: c.subjectId, outcome: v.outcome, closedAt: v.at.toISOString() }) };
    });
  }

  /** Complaints are kept (map row 105's keep period) and never deleted by anyone: always refused, for every key. */
  async remove(_ctx: StaffContext, _id: string): Promise<never> {
    return problem(405, "complaint-kept", "Complaints are kept", "A complaint is never deleted. Close it with an outcome, or add a note.");
  }

  /** The reminder job (JobPort): once, only while the complaint is open and not acknowledged, to the handler; to the
   *  firm's active Owners and Admins when the handler is no longer active; to the firm's contact address when none of
   *  them is active either (never a reminder to nobody). The mail names no complainant and no summary (the handler
   *  opens the record) and gives the date in the firm's zone. It is sent inside the run's transaction, after the
   *  REMINDER_SENT event and its audit line: a failed send rolls them back and the job runs again (at least once,
   *  never recorded as sent when it was not). PF-19r: through MessagePort (MessagesMail), each email is written into
   *  the outbox in the same transaction and sent after the commit, so a rolled-back run sends nothing. A SERVICE email
   *  names its person: the handler or each Owner and Admin (STAFF); a tier nobody in can be reached falls to the next. The firm's contact address is the firm's, not a
   *  person's: that last-resort reminder goes as TRANSACTIONAL (a duty the firm cannot opt out of; question to the tech
   *  lead on the PF-19r PR). */
  async runAckReminder(payload: unknown): Promise<"sent" | "skipped"> {
    const p = z.object({ firmId: uuid, complaintId: uuid }).safeParse(payload);
    if (!p.success) return "skipped";
    const { firmId, complaintId } = p.data;
    return this.commit(async (tx, after) => {
      await tx.$queryRaw`SELECT id FROM "plat_complaint" WHERE firm_id = ${firmId}::uuid AND id = ${complaintId}::uuid FOR UPDATE`;
      const c = await tx.platComplaint.findFirst({ where: firmScope(firmId, { id: complaintId }) });
      if (!c || c.status === "CLOSED" || c.acknowledgedAt) return "skipped" as const;
      if (await tx.platComplaintEvent.findFirst({ where: firmScope(firmId, { complaintId, kind: "REMINDER_SENT" as const }), select: { id: true } })) return "skipped" as const;
      // PF-21j (break M2): the handler is reminded only while they may still act on it (active, with the record key);
      // one who lost the key could not acknowledge, so the reminder goes to the Owners and Admins instead.
      const handler = await tx.platformStaff.findFirst({ where: await this.mayHandle(tx, firmId, { id: c.handlerStaffId }), select: { id: true, email: true } });
      const admins = await tx.platformStaff.findMany({
        where: firmScope(firmId, { status: "ACTIVE" as const, grants: { some: { role: { in: ["OWNER", "ADMIN"] as ("OWNER" | "ADMIN")[] }, endedAt: null } } }), select: { id: true, email: true }, orderBy: { email: "asc" },
      });
      const firm = await tx.platformFirm.findFirstOrThrow({ where: { id: firmScope(firmId).firmId }, select: { contactEmail: true } });
      const zone = await readSetting<string>(tx, firmId, TIME_ZONE.key);
      const due = new Intl.DateTimeFormat("en-CA", { timeZone: zone, dateStyle: "long", timeStyle: "short" }).format(c.acknowledgeBy);
      const now = this.d.clock.now();
      type Tier = { sentTo: "handler" | "owners_admins" | "firm_contact"; to: { address: string; staffId: string | null }[]; text: string };
      const reach = handler ? "cannot be reached by email" : "is no longer active or can no longer handle complaints";
      const tiers: Tier[] = [
        ...(handler ? [{ sentTo: "handler" as const, to: [{ address: handler.email, staffId: handler.id }], text: `A complaint you handle was due to be acknowledged by ${due} (${zone}). Open it in Complaints (reference ${complaintId}) and record the acknowledgement.` }] : []),
        { sentTo: "owners_admins", to: admins.filter((a) => a.id !== handler?.id).map((a) => ({ address: a.email, staffId: a.id })), text: `A complaint was due to be acknowledged by ${due} (${zone}), and its handler ${reach}. Open it in Complaints (reference ${complaintId}), choose a new handler if needed and record the acknowledgement.` },
        { sentTo: "firm_contact", to: [{ address: firm.contactEmail, staffId: null }], text: `A complaint was due to be acknowledged by ${due} (${zone}), and neither its handler nor an Owner or Admin can be reached. Open it in Complaints (reference ${complaintId}), choose a new handler and record the acknowledgement.` },
      ];
      // Tier by tier (PF-19r, break m3): the handler, else each active Owner and Admin, else the firm's contact address.
      // An address the firm's suppression list holds is skipped; for these emails (SERVICE and TRANSACTIONAL email) that
      // is the only thing the consent gate refuses (ports/consent.ts decide). The first tier that reaches anyone is
      // recorded; then the event and its audit line, then the emails, in that order, so a run that rolls back sends nothing
      // (and a refused send, e.g. an address suppressed meanwhile, rolls the run back and the job tries again).
      const all = tiers.flatMap((t) => t.to.map((r) => r.address.toLowerCase()));
      const suppressed = new Set((await tx.msgSuppression.findMany({ where: firmScope(firmId, { channel: "EMAIL" as const, address: { in: all } }), select: { address: true } })).map((x) => x.address));
      const used = tiers.map((t) => ({ ...t, to: t.to.filter((r) => !suppressed.has(r.address.toLowerCase())) })).find((t) => t.to.length);
      if (!used) throw new MessageRefused("not sent: no handler, Owner, Admin or firm contact address takes email (each is suppressed)");
      const recipients = used.to.length, sentTo = used.sentTo;
      await tx.platComplaintEvent.create({ data: { firmId, complaintId, kind: "REMINDER_SENT", at: now, actor: SYSTEM_ACTOR, detail: { handlerStaffId: c.handlerStaffId, sentTo, recipients } } });
      await this.d.audit.record(tx, { firmId, actor: SYSTEM_ACTOR, action: "complaint.reminder", entity: "plat_complaint", entityKey: complaintId,
        summary: sentTo === "handler" ? "Acknowledgement reminder sent to the handler" : sentTo === "owners_admins" ? `Acknowledgement reminder sent to the firm's Owners and Admins (the handler ${reach})` : "Acknowledgement reminder sent to the firm's contact address (no handler, Owner or Admin could be reached)",
        detail: { complaintId, handlerStaffId: c.handlerStaffId, sentTo, recipients }, before: null, after: { sentTo, recipients, at: now.toISOString() } });
      for (const r of used.to) after.push((await mailIn(this.d.mail, tx, {
        firmId, to: r.address, replyTo: firm.contactEmail, subject: "A complaint is waiting for its acknowledgement", text: used.text, templateKey: "platform.complaint.ack_reminder",
        ...(r.staffId ? { class: "SERVICE" as const, person: { kind: "STAFF" as const, id: r.staffId } } : { class: "TRANSACTIONAL" as const }),
        idempotencyKey: `complaint.ack_reminder:${complaintId}:${r.staffId ?? "firm-contact"}`,
      })).dispatch);
      return "sent" as const;
    });
  }
}

/** Registers the reminder job's worker (JobPort.handle, PF-0p). */
export function registerComplaintJobs(jobs: JobPort, service: ComplaintsService): Promise<void> {
  return jobs.handle(ACK_REMINDER_JOB, async (job) => { await service.runAckReminder(job.payload); });
}
