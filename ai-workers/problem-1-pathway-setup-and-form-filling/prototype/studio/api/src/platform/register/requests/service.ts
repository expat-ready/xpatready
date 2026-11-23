// PF-21b part 3 (map row 85; SA-11 §3.8, SA-11-18, SA-11-40, NFR5-14): the register of privacy requests made to ExpatReady
// itself (a client's request is the firm's, Q21). Only staff holding system/compliance:dsr-manage (the Platform Owner;
// Sample) log, read and move requests; anyone else gets 403 (the system guard first, this service again). The register has
// no firm, so each change is recorded by its insert-only step and by the call's one line in our staff's trail
// (plat_system_audit), written here inside the change's transaction (PF-4s's @SystemChange; a refusal writes a REFUSED
// line). The daily check (sweep) moves an open request past its target to OVERDUE with one alert, and raises the
// near-date alert once inside PF-23's lead (CLOCK_LEAD_MS); each alert's mark is a step in the same transaction, so a
// second run raises nothing and an alert that cannot be raised undoes its mark. Legal reading Unconfirmed: no counsel.
import { HttpException, Inject, Injectable, Optional } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import type { AlertPort } from "../../../../../ports/alert.ts";
import { FirmId } from "../../../../../ports/audit.ts";
import { Db } from "../../../core.ts";
import { FIELD_ERROR_STATUS, fieldsOf } from "../../http/input.ts";
import { PlatformClock } from "../../identity/port.ts";
import { forbidden, problem } from "../../identity/keys.ts";
import { CLOCK_LEAD_MS, clocksNear, currentAlerts } from "../../observability/alerts.ts";
import { logPort } from "../../observability/log.ts";
import { SystemIdentity, type SystemAuditLine } from "../../system-identity/service.ts";
type Tx = Prisma.TransactionClient;
/** SA-11 v2.16 line 778: "Manage the register of requests made to ExpatReady". */
export const DSR_KEY = "system/compliance:dsr-manage";
/** §3.8: ExpatReady's own target, received + 30 days (a code constant; a reminder, not enforced). */
export const DATA_REQUEST_TARGET_DAYS = 30;
/** The daily check: 07:20 Toronto, every day. */
export const DATA_REQUEST_QUEUE = "platform.register.data_requests_daily", DATA_REQUEST_CRON = "20 7 * * *", DATA_REQUEST_ZONE = "America/Toronto";
export const DATA_REQUEST_ACTOR = "system:platform.register.data-requests";
/** The alerts the service raises through (a test gives its own); the process's AlertPort otherwise. */
export const DATA_REQUEST_ALERTS = Symbol("DataRequests.alerts");
export type RequestCaller = { staffId: string; keys: readonly string[] };
/** The guard's line for this call (PF-4s's CallLine), or null outside a route (the daily check). */
export type CallLine = Omit<SystemAuditLine, "outcome" | "code">;
export type RequestStatus = "PENDING" | "IN_PROGRESS" | "COMPLETED" | "OVERDUE" | "HELD";
export type RequestView = { id: string; type: string; requester: string; requesterEmail: string; receivedOn: string; targetDate: string; status: RequestStatus;
  actionsTaken: string | null; completedOn: string | null; firmId: string | null; personId: string | null; recordedBy: string; createdAt: string };
export type StepView = { seq: number; kind: string; from: string | null; to: string | null; note: string | null; actor: string; at: string };
/** Ordinary text: control characters (C0, C1) and the invisible direction marks that can reorder what a person reads are
 *  refused (as the hold register's reasons). */
const plain = (max: number, what: string) => z.string().trim().min(1, `Give ${what}.`).max(max, `At most ${max} characters.`)
  .refine((r) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069]/.test(r), "Write it as ordinary text.");
const Uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "a uuid").transform((v) => v.toLowerCase());
/** A calendar day (YYYY-MM-DD), years 1900-9999. */
const Day = z.iso.date({ error: "A date (YYYY-MM-DD)." }).refine((d) => Number(d.slice(0, 4)) >= 1900, "A date from the year 1900.");
const LogBody = z.strictObject({
  type: z.enum(["ACCESS", "CORRECTION", "DELETION"]),
  requester: plain(200, "the requester's name"),
  requesterEmail: z.string().trim().toLowerCase().email("An email address.").max(320),
  receivedOn: Day,
  /** SA-11-40: the one person record the request is about, when known (a firm and that firm's person). */
  firmId: FirmId.optional(),
  subject: z.strictObject({ kind: z.literal("PERSON"), id: Uuid }).optional(),
  reason: z.string().optional(),
}).refine((b) => (b.firmId === undefined) === (b.subject === undefined), { message: "Name the firm and its person together, or neither.", path: ["subject"] });
const MoveBody = z.strictObject({
  status: z.enum(["IN_PROGRESS", "COMPLETED", "HELD"], { error: "In progress, Completed or Held (Overdue is set by the daily check)." }),
  actionsTaken: plain(2000, "the actions taken").optional(),
  note: plain(2000, "a note").optional(),
  reason: z.string().optional(),
}).refine((b) => b.status !== "COMPLETED" || b.actionsTaken !== undefined, { message: "Say what was done to complete it.", path: ["actionsTaken"] });
export const LIST_MAX = 500;
const ListQuery = z.strictObject({ status: z.enum(["PENDING", "IN_PROGRESS", "COMPLETED", "OVERDUE", "HELD"]).optional(), limit: z.coerce.number().int().min(1).max(LIST_MAX).optional() });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function fields(e: z.ZodError): never { return problem(FIELD_ERROR_STATUS, "Check the highlighted fields", "Some fields need a change.", { code: "DATA_REQUEST_FIELDS", fields: fieldsOf(e) }); }
const notFound = (): never => problem(404, "Not found", "No such request.", { code: "NOT_FOUND" });
const dayOf = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (day: string, n: number) => dayOf(new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000));
const codeOf = (e: unknown) => e instanceof HttpException ? String((e.getResponse() as { code?: unknown })?.code ?? `HTTP_${e.getStatus()}`) : "ERROR";
type Row = { id: string; type: string; requester_name: string; requester_email: string; received_on: Date; target_date: Date; status: RequestStatus; actions_taken: string | null;
  completed_on: Date | null; firm_id: string | null; person_id: string | null; recorded_by: string; created_at: Date };
const view = (r: Row): RequestView => ({ id: r.id, type: r.type, requester: r.requester_name, requesterEmail: r.requester_email, receivedOn: dayOf(r.received_on), targetDate: dayOf(r.target_date),
  status: r.status, actionsTaken: r.actions_taken, completedOn: r.completed_on ? dayOf(r.completed_on) : null, firmId: r.firm_id, personId: r.person_id, recordedBy: r.recorded_by, createdAt: r.created_at.toISOString() });
@Injectable()
export class DataRequests {
  constructor(@Inject(Db) private readonly db: PrismaClient, @Inject(SystemIdentity) private readonly identity: Pick<SystemIdentity, "audit">,
    @Inject(PlatformClock) private readonly clock: PlatformClock, @Optional() @Inject(DATA_REQUEST_ALERTS) private readonly alerts?: AlertPort) {}
  private allowed(c: RequestCaller) {
    if (!c || !c.keys.includes(DSR_KEY)) forbidden("Only ExpatReady staff who manage the register of requests made to ExpatReady can do this.", "MISSING_PERMISSION");
  }
  private today() { return new Date(this.clock.now()).toLocaleDateString("en-CA", { timeZone: DATA_REQUEST_ZONE }); }   // ExpatReady's day, Toronto (break m5)
  private alertPort() { return this.alerts ?? currentAlerts(); }
  /** One change: the work and its ALLOWED line in one transaction; anything refusing it → one REFUSED line, then the error. */
  private async change<T>(line: CallLine | null, fn: (tx: Tx) => Promise<{ result: T; target: Record<string, unknown> }>): Promise<T> {
    try {
      return await this.db.$transaction(async (tx) => {
        const done = await fn(tx);
        if (line) await this.identity.audit({ ...line, target: { ...line.target, ...done.target }, outcome: "ALLOWED", code: null }, tx);
        return done.result;
      });
    } catch (e) {
      if (line) await this.identity.audit({ ...line, outcome: "REFUSED", code: codeOf(e) });
      throw e;
    }
  }
  /** POST /api/system/register/requests: 201 with the request (PENDING, or OVERDUE at once when logged past its target). */
  async log(c: RequestCaller, line: CallLine | null, body: unknown): Promise<RequestView> {
    this.allowed(c);
    const id = await this.change(line, async (tx) => {
      const p = LogBody.safeParse(body ?? {});
      if (!p.success) fields(p.error);
      const b = p.data;
      if (b.receivedOn > this.today()) problem(FIELD_ERROR_STATUS, "Check the highlighted fields", "Some fields need a change.", { code: "DATA_REQUEST_FIELDS", fields: { receivedOn: "The day received cannot be in the future." } });
      const [{ id }] = await tx.$queryRaw<{ id: string }[]>`SELECT plat_data_request_log(${b.type}, ${b.requester}, ${b.requesterEmail}, ${b.receivedOn}::date,
        ${addDays(b.receivedOn, DATA_REQUEST_TARGET_DAYS)}::date, ${b.firmId?.toLowerCase() ?? null}::uuid, ${b.subject?.id ?? null}::uuid, ${`staff:${c.staffId}`})::text AS id`;
      return { result: id, target: { requestId: id, type: b.type } };
    });
    await this.checkOne(id).catch(() => undefined);   // break M1: saved is saved (201); a failed alert is the daily check's to retry
    return this.one(id);
  }
  /** POST /api/system/register/requests/:id/status { status, actionsTaken?, note? }: 200 with the request; 409 when the
   *  move is not allowed (a completed request, In progress from Overdue); Overdue by hand → 422. */
  async move(c: RequestCaller, line: CallLine | null, id: string, body: unknown): Promise<RequestView> {
    this.allowed(c);
    await this.change(line, async (tx) => {
      if (!UUID.test(id)) notFound();
      const p = MoveBody.safeParse(body ?? {});
      if (!p.success) fields(p.error);
      const [{ out }] = await tx.$queryRaw<{ out: string }[]>`SELECT plat_data_request_move(${id.toLowerCase()}::uuid, ${p.data.status}, ${p.data.actionsTaken ?? null},
        ${p.data.note ?? null}, ${`staff:${c.staffId}`}, ${this.today()}::date) AS out`.catch((e: unknown) => {
        // PF-21d part 1b (break M3): an erasure scheduled or running holds the request; cancel it first.
        if (/plat_data_request_erasure_guard/.test(String(e))) problem(409, "An erasure holds this request", "An erasure is scheduled or running for this request; cancel it before moving the request by hand.", { code: "ERASURE_SCHEDULED" });
        throw e;
      });
      if (out === "NOT_FOUND") notFound();
      if (out === "SAME") problem(409, "Already in that status", "The request is already in that status; nothing was changed.", { code: "SAME_STATUS" });
      if (out !== "MOVED") problem(409, "Not allowed", "That move is not allowed from the request's current status; nothing was changed.", { code: "MOVE_REFUSED" });
      return { result: undefined, target: { requestId: id.toLowerCase(), to: p.data.status } };
    });
    return this.one(id.toLowerCase());
  }
  /** GET /api/system/register/requests?status=&limit=: newest first; `truncated` when more match. */
  async list(c: RequestCaller, query: unknown): Promise<{ requests: RequestView[]; truncated: boolean }> {
    this.allowed(c);
    const q = ListQuery.safeParse(query ?? {});
    if (!q.success) fields(q.error);
    const limit = q.data.limit ?? LIST_MAX;
    const rows = await this.rows(q.data.status ?? null, null, null, limit + 1);
    return { requests: rows.slice(0, limit), truncated: rows.length > limit };
  }
  /** GET /api/system/register/requests/:id: the request and its steps in order. */
  async read(c: RequestCaller, id: string): Promise<RequestView & { steps: StepView[] }> {
    this.allowed(c);
    if (!UUID.test(id)) notFound();
    const r = await this.one(id.toLowerCase());
    const steps = await this.db.$queryRaw<{ seq: bigint; kind: string; from_status: string | null; to_status: string | null; note: string | null; actor: string; at: Date }[]>`
      SELECT * FROM plat_data_request_steps(${r.id}::uuid)`;
    return { ...r, steps: steps.map((s) => ({ seq: Number(s.seq), kind: s.kind, from: s.from_status, to: s.to_status, note: s.note, actor: s.actor, at: s.at.toISOString() })) };
  }
  /** The daily check (NFR5-14): every open request due within the lead; one request's failure never stops the rest. */
  async sweep(): Promise<{ overdue: string[]; near: string[]; failed: number }> {
    const leadDays = Math.ceil(CLOCK_LEAD_MS.privacy_clock_near / 86_400_000);   // bounds the read; the test per request is below
    const due = await this.rows(null, null, addDays(this.today(), leadDays + 1), LIST_MAX + 1);
    const out = { overdue: [] as string[], near: [] as string[], failed: 0 };
    for (const r of due) {
      try { const k = await this.checkOne(r.id, r); if (k) out[k].push(r.id); } catch (e) { out.failed++; logPort.error("data_request_check_failed", e, {}); }   // review M3
    }
    return out;
  }
  /** One request's check: OVERDUE (moved, one alert) when past its target, else the near-date alert once within the lead. */
  private async checkOne(id: string, known?: RequestView): Promise<"overdue" | "near" | null> {
    const r = known ?? await this.one(id), today = this.today(), alerts = this.alertPort();
    if (r.status !== "PENDING" && r.status !== "IN_PROGRESS") return null;
    const dueAt = new Date(`${r.targetDate}T23:59:59.999Z`);
    return this.db.$transaction(async (tx) => {
      if (today > r.targetDate) {
        const [{ marked }] = await tx.$queryRaw<{ marked: boolean }[]>`SELECT plat_data_request_mark(${r.id}::uuid, 'OVERDUE', ${today}::date, ${DATA_REQUEST_ACTOR}) AS marked`;
        if (!marked) return null;
        const { raised } = await alerts.raise("privacy_clock_near", { rule: "NFR5-14.overdue", entity: "privacy_request", entityKey: r.id, dueAt: dueAt.toISOString() });
        void raised;   // a repeat inside the adapter's window is still one incident; a throw undoes the mark
        return "overdue" as const;
      }
      if (dueAt.getTime() - this.clock.now() > CLOCK_LEAD_MS.privacy_clock_near) return null;   // clocksNear's own test, PF-23's one constant
      const [{ marked }] = await tx.$queryRaw<{ marked: boolean }[]>`SELECT plat_data_request_mark(${r.id}::uuid, 'NEAR', ${today}::date, ${DATA_REQUEST_ACTOR}) AS marked`;
      if (!marked) return null;
      const raised = await clocksNear("privacy_clock_near", [{ id: r.id, dueAt }], { now: () => new Date(this.clock.now()) }, alerts);
      if (!raised.length) throw new Error("privacy_clock_near could not be raised; the mark is undone and the next run tries again");
      return "near" as const;
    }, { maxWait: 10_000, timeout: 60_000 });   // break m3: a slow alert never outlives its mark
  }
  private async rows(status: string | null, id: string | null, dueBy: string | null, limit: number): Promise<RequestView[]> {
    const rows = await this.db.$queryRaw<Row[]>`SELECT id::text AS id, type, requester_name, requester_email, received_on, target_date, status, actions_taken, completed_on,
      firm_id::text AS firm_id, person_id::text AS person_id, recorded_by, created_at FROM plat_data_request_list(${status}, ${id}::uuid, ${dueBy}::date, ${limit}::int)`;
    return rows.map(view);
  }
  private async one(id: string): Promise<RequestView> {
    const [hit] = await this.rows(null, id, null, 1);
    return hit ?? notFound();
  }
}
