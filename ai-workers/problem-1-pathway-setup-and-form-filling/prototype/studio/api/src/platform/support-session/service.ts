// AUD-3b part 1 (R1.87; SA-2-16, SA-2-17, SA-2-18, SA-11-11; P-607 (4): read-only support sessions in Release 1): our own
// staff open one firm read-only, for 60 minutes, with a reason or ticket, and every line they write in it carries the
// session and its reason on that firm's own trail.
//   POST /api/system/firms/:id/support-sessions { reason }   system/firm:impersonate (Platform Owner, Support), a sign-in
//        in the last 5 minutes (SA-2-16's step-up; SA7-D35), a reason of 1-200 characters. 201 with the session, its end
//        time and the actions it never allows; one platform.support_session.started line on the firm's trail. 404 for no
//        such firm; 409 SUPPORT_SESSION_OPEN while this staff member has a session open (SA-2-17: "starting another session").
// In a session (the header X-Support-Session: <id> on a /api/system call, SupportSessionCalls below):
//   * a read of that firm (@ReadsFirm on its id) is allowed; its line carries support_session_id and the reason;
//   * our own identity reads (@NoFirmData GETs) are allowed;
//   * everything else is refused 403 with one platform.support_session.refused line on the session's firm: any change
//     (read-only, P-607 (4)), and with it every always-blocked action (SA-2-17); a read of another firm; a read across
//     firms (a session is one firm's); starting another session;
//   * an ended, expired, unknown or another person's session answers 401 SUPPORT_SESSION_ENDED (SA-2-18: never refreshed).
// The session itself is our own register (plat_support_session, walled; its definers are the only way in).
// Stated (round 1): a session applies to the calls that send its header (the firm's own routes under a session are a
// later part), so a call without it is an ordinary console call, logged as one; a refusal line is written for each
// refused call (no throttle yet); a call refused first by another interceptor (If-Match) writes no refusal line.
// Later parts (stated): change mode and the firm's setting (SA-2-28), payment hold and security lock (SA-2-30), the end
// with our staff member's own session (SA-2-41), the Owner's email (SA-2-29), the sessions list (SA-2-19), the firm's
// own routes under a session (SA-11-11's "the firm's context").
import { Body, Controller, HttpCode, Inject, Injectable, Param, Post, Req, type CallHandler, type ExecutionContext, type NestInterceptor } from "@nestjs/common";
import { PATH_METADATA } from "@nestjs/common/constants.js";
import { Reflector } from "@nestjs/core";
import type { PrismaClient } from "@prisma/client";
import { from, mergeMap, type Observable } from "rxjs";
import { z } from "zod";
import { Db } from "../../core.ts";
import { auditEvent } from "../audit/audit-event.ts";
import { ChangesFirm, FIRM_DATA, type FirmData } from "../audit/access/declare.ts";
import { ourStaff } from "../audit/access/lines.ts";
import { AuditActionNames } from "../audit/firm-read/action-names.ts";
import { FIELD_ERROR_STATUS, parseInput, strict } from "../http/input.ts";
import { problem } from "../identity/keys.ts";
import { reasonOf } from "../system-identity/guard.ts";
import { AuditDetail } from "../../../../ports/audit.ts";
import { SYSTEM_ACCESS, SYSTEM_PATH, SystemKeys, SystemReason, SystemStepUp, systemStaffOf, type SystemAccess, type SystemStaffContext } from "../system-identity/keys.ts";

export const IMPERSONATE_KEY = "system/firm:impersonate", SESSION_HEADER = "x-support-session";
export const STARTED = "platform.support_session.started", REFUSED = "platform.support_session.refused", SESSION_ENTITY = "plat_support_session";
export const REASON_LIMIT = 200;
AuditActionNames.register("platform", { [STARTED]: "ExpatReady support started a read-only support session", [REFUSED]: "ExpatReady support was refused an action in a support session" });
/** SA-2-17's always-blocked actions, as the start answers them (for the banner, PF-6sb); a read-only session refuses every change besides. */
export const ALWAYS_BLOCKED = Object.freeze([
  "Deleting clients, cases or documents", "Billing and payment", "Bulk export", "Users, roles and security settings", "Signing", "Sending messages to clients",
  "Starting another session", "Waiving a deficiency, approving a review, recording a decision, exporting a case", "Keeping the current message wording, switching automatic messages on or off",
]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** ES2024's String.prototype.isWellFormed (Node 20+; this project's TypeScript lib is es2023), as ports/files.ts: no lone surrogate. */
const isWellFormed = (v: string): boolean => (String.prototype as unknown as { isWellFormed(this: string): boolean }).isWellFormed.call(v);
export const StartBody = strict({ reason: z.string().trim().min(1, "Give a reason or a ticket reference.").max(500, `A reason of 1-${REASON_LIMIT} characters.`) });

export type OpenSession = { id: string; firmId: string; reason: string; mode: string; startedAt: Date; endsAt: Date };
type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

@Injectable()
export class SupportSessions {
  constructor(@Inject(Db) private readonly db: PrismaClient) {}

  async start(staff: SystemStaffContext, firmId: string, body: unknown, req?: { supportSession?: { id: string; reason: string } }) {
    const raw = parseInput(StartBody, body ?? {}).reason;
    // Round 1 (breaker m2): the reason the guard checked and logged, cleaned the same way (no control or direction
    // characters, no NUL), at most 200 UTF-16 units: the audit line's own limit (ports/audit.ts), so a reason that passes
    // here (and the check below) is never refused there (round 2, R2-M1: a 500 and a false alarm); within the database's 200 characters too.
    const reason = reasonOf(raw);
    if (!reason || reason.length > REASON_LIMIT) problem(FIELD_ERROR_STATUS, "Check the details", `Give a reason or a ticket reference of 1-${REASON_LIMIT} characters, in plain text. Nothing was opened.`, { code: "INVALID", fields: { reason: `A reason of 1-${REASON_LIMIT} characters.` } });
    // Round 3 (R3-M1, R3-S2): the reason is carried on audit lines, so it must pass the line's own rules here, before
    // anything is opened: well-formed text (no lone surrogate) and AuditDetail (ids and facts only: no email address).
    if (!isWellFormed(reason!)) problem(FIELD_ERROR_STATUS, "Check the details", "The reason holds a broken character. Type it again in plain text. Nothing was opened.", { code: "INVALID", fields: { reason: "Plain text only: a character in it is broken." } });
    if (!AuditDetail.safeParse({ reason }).success) problem(FIELD_ERROR_STATUS, "Check the details", "Give a ticket reference or a reason in plain words, without an email address or other personal detail: it is kept on the firm's audit trail. Nothing was opened.", { code: "INVALID", fields: { reason: "A ticket reference or plain words, with no email address." } });
    if (typeof firmId !== "string" || !UUID.test(firmId)) problem(404, "Firm not found", "No firm has this id.", { code: "FIRM_NOT_FOUND" });
    const firm = firmId.toLowerCase(), { actor } = ourStaff();
    return this.db.$transaction(async (tx) => {
      const [r] = await tx.$queryRaw<{ status: string; id: string | null; started_at: Date | null; ends_at: Date | null }[]>`
        select status, id::text as id, started_at, ends_at from plat_support_session_start(${firm}::uuid, ${staff.staffId}::uuid, ${reason})`;
      if (r?.status === "FIRM_NOT_FOUND") problem(404, "Firm not found", "No firm has this id.", { code: "FIRM_NOT_FOUND" });
      if (r?.status === "OPEN") problem(409, "A support session is open", `You already have a support session open until ${r.ends_at?.toISOString()} (it ends by itself then). One session at a time: start the next one after it ends.`, { code: "SUPPORT_SESSION_OPEN", sessionId: r.id });
      if (r?.status !== "STARTED" || !r.id || !r.started_at || !r.ends_at) problem(500, "Not started", "The support session could not be started. Nothing was opened.", { code: "SUPPORT_SESSION_NOT_STARTED" });
      if (req) req.supportSession = { id: r!.id!, reason: reason! };   // round 1 (breaker m1): the start line is the session's own (its column)
      await auditEvent.record(tx, { firmId: firm, actor, action: STARTED, entity: SESSION_ENTITY, entityKey: r!.id!,
        summary: `ExpatReady support started a read-only support session in this firm, until ${r!.ends_at!.toISOString()}.`,
        detail: { supportSessionId: r!.id!, reason, mode: "READ", startedAt: r!.started_at!.toISOString(), endsAt: r!.ends_at!.toISOString() }, before: null, after: null });   // a session start changes no firm record
      return { id: r!.id!, firmId: firm, mode: "READ" as const, reason, startedAt: r!.started_at!.toISOString(), endsAt: r!.ends_at!.toISOString(), header: "X-Support-Session", alwaysBlocked: ALWAYS_BLOCKED };
    });
  }

  /** The session while it is open and this staff member's, else undefined. */
  async open(id: string, staffId: string): Promise<OpenSession | undefined> {
    if (!UUID.test(id)) return undefined;
    const [s] = await this.db.$queryRaw<{ id: string; firm_id: string; reason: string; mode: string; started_at: Date; ends_at: Date }[]>`
      select id::text as id, firm_id::text as firm_id, reason, mode, started_at, ends_at from plat_support_session_open(${id.toLowerCase()}::uuid, ${staffId}::uuid)`;
    return s ? { id: s.id, firmId: s.firm_id, reason: s.reason, mode: s.mode, startedAt: s.started_at, endsAt: s.ends_at } : undefined;
  }

  /** One refusal line on the session's firm (SA-2-17: "a refusal is logged"), in its own transaction, under the session. */
  async refused(tx: Tx, s: OpenSession, call: { method: string; route: string }, why: string): Promise<void> {
    const { actor } = ourStaff();
    await auditEvent.record(tx, { firmId: s.firmId, actor, action: REFUSED, entity: SESSION_ENTITY, entityKey: s.id,
      summary: `ExpatReady support was refused in a support session: ${why}`, detail: { supportSessionId: s.id, method: call.method, route: call.route, why }, before: null, after: null });   // a refusal changes nothing
  }
}

// ------------------------------------------------------------------------------------------- the session's rules
type CallReq = { method: string; path?: string; url?: string; headers: Record<string, string | string[] | undefined>; params?: Record<string, unknown>; systemStaff?: SystemStaffContext; supportSession?: OpenSession };
const join = (...p: string[]) => `/${p.map((s) => s.replace(/^\/+|\/+$/g, "")).filter(Boolean).join("/")}`;

/** What a call in a session may do: null (allowed) or the plain reason it is refused. */
export function refusalInSession(data: FirmData | undefined, method: string, params: Record<string, unknown> | undefined, s: OpenSession, starts: boolean, keys: readonly string[] = []): string | null {
  if (starts) return "starting another session is never allowed in a support session.";
  if (method !== "GET" && method !== "HEAD") return "a support session is read-only: no change is made in it.";
  // Round 1 (breaker M1; SA-2-17 "bulk export"): a route that needs an export key is never used in a session, even a GET.
  if (keys.some((k) => /:export$/.test(k))) return "bulk export is never allowed in a support session.";
  if (!data) return "this action declares no firm data, so it is refused in a support session.";
  if (data.kind === "reads-firm") {
    const firm = params?.[data.param];
    return typeof firm === "string" && firm.toLowerCase() === s.firmId ? null : "a support session reads only its own firm.";
  }
  if (data.kind === "none") return null;
  return data.kind === "reads-across" ? "a support session is one firm's: it reads no other firm's records." : "a support session is read-only: no change is made in it.";
}

/** Runs inside AUD-3's SystemAccessLines (features load by name: audit-access.ts first), before the handler: a call that
 *  names a support session is checked here, refused with its line, or marked (req.supportSession) so that the line
 *  written after it (lines.ts, through AuditPort) carries the session and its reason (observability/hook.ts). */
@Injectable()
export class SupportSessionCalls implements NestInterceptor {
  constructor(@Inject(Reflector) private readonly reflector: Reflector, @Inject(SupportSessions) private readonly sessions: SupportSessions, @Inject(Db) private readonly db: PrismaClient) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (ctx.getType() !== "http") return next.handle();
    const req = ctx.switchToHttp().getRequest<CallReq>(), raw = req.headers[SESSION_HEADER];
    if (raw === undefined || !SYSTEM_PATH.test(req.path ?? req.url ?? "")) return next.handle();
    const targets = [ctx.getHandler(), ctx.getClass()];
    const access = this.reflector.getAllAndOverride<SystemAccess>(SYSTEM_ACCESS, targets);
    if (!access || access.kind === "sign-in" || !req.systemStaff) return next.handle();
    const base = ([] as string[]).concat(Reflect.getMetadata(PATH_METADATA, ctx.getClass()) ?? "")[0] ?? "", path = ([] as string[]).concat(Reflect.getMetadata(PATH_METADATA, ctx.getHandler()) ?? "")[0] ?? "";
    const call = { method: req.method, route: join(base, path) };
    const keys = access.kind === "keys" ? access.keys : [];
    return from(this.check(req, typeof raw === "string" ? raw : "", this.reflector.getAllAndOverride<FirmData>(FIRM_DATA, targets), call, ctx.getClass() === SupportSessionController, keys)).pipe(mergeMap(() => next.handle()));
  }

  private async check(req: CallReq, id: string, data: FirmData | undefined, call: { method: string; route: string }, starts: boolean, keys: readonly string[]): Promise<void> {
    const s = await this.sessions.open(id, req.systemStaff!.staffId);
    if (!s && starts) return;   // round 1 (breaker m5): an ended session's header never stops a new start
    if (!s) problem(401, "Support session ended", "This support session has ended, has expired (60 minutes, never refreshed) or is not yours. Start a new one.", { code: "SUPPORT_SESSION_ENDED" });
    req.supportSession = s;   // the refusal line below is the session's too
    const why = refusalInSession(data, call.method, req.params, s!, starts, keys);
    if (why) {
      await this.db.$transaction(async (tx) => { await this.sessions.refused(tx, s!, call, why); });
      problem(403, "Not in a support session", `Refused: ${why}`, { code: "SUPPORT_SESSION_REFUSED" });
    }
  }
}

@Controller("api/system/firms")
export class SupportSessionController {
  constructor(@Inject(SupportSessions) private readonly sessions: SupportSessions) {}

  @Post(":id/support-sessions") @HttpCode(201) @SystemKeys(IMPERSONATE_KEY) @SystemStepUp() @SystemReason(StartBody)
  @ChangesFirm("starts a read-only support session in one firm and writes its line on that firm's trail")
  start(@Req() r: { systemStaff?: SystemStaffContext; supportSession?: { id: string; reason: string } }, @Param("id") id: string, @Body() b: unknown) { return this.sessions.start(systemStaffOf(r), id, b, r); }
}
