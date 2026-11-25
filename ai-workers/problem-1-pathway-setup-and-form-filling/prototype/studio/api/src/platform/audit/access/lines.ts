// AUD-3 part 1 (R1.87; SA-11-12, SA-11 BR-14; rev 9.1): the line each of our own staff's calls owes, written by one
// interceptor after the route's handler succeeds and before its answer is sent (no line, no answer: a line that cannot be
// written answers 500 and the data never leaves). What a route owes is its declaration (declare.ts):
//   reads-firm    one `platform.system.firm_read` line on that firm's trail, through AuditPort (OUR_STAFF, ourstaff:<id>,
//                 the request's correlation id), in a transaction of its own;
//   changes-firm  nothing more: the change wrote its own line in its own transaction; a successful call that wrote none
//                 answers 500 AUDIT_LINE_MISSING and raises one audit_write_failed alert (the guard-level check: no route
//                 can forget). The change has committed by then: the check is the net that a suite catches, not a rollback;
//   reads-across  one `cross_tenant.access` line on the platform's own trail (no firm; the platform audit workspace, never
//                 reset, P-571 (1)), naming the staff member and the scope; and one firm-read line on the trail of each
//                 firm the service noted its answer names (noteFirmsRead: one breach's firms), in one transaction;
//   none          nothing (our own staff's sign-in, identity and access, logged on our own table by PF-4s's guard).
// The firm-less cross_tenant.access line goes through AuditPort as AUD-3c's firm-less kind, its second fixed pair
// (cross_tenant.access / plat_system_access; round 6, Lead 15's ruling on #3209): the adapter keeps the request's own
// actor word, OUR_STAFF only, a detail of scope, method, route and declared filters, fail-closed with one alert. No
// direct audit_event write is left here (AUD-1m CW1).
// At start-up every route our staff call (@SystemKeys or @AnySystemStaff) must declare one; one that does not stops it,
// as does a read (@ReadsFirm, @ReadsAcrossFirms) that answers through @Res() or @Next(): its answer would leave before
// its line (review m1), so "no line, no answer" could not hold.
// A changes-firm line counts only once committed: the check reads, among the firms this request wrote lines for, the lines
// it committed under its own actor and correlation id (round 2; breaker 1, review m2).
// Limits, stated (review m3-m5, breaker 2): the check does not know which firm the change was for (a route's firm may come
// from its body), so a line on another firm passes; two requests sharing a client's X-Request-Id, by the same staff member
// on the same firm at the same moment, could each see the other's line; a change that commits without a line and then
// throws is not checked;
// a wrong declaration (@NoFirmData on a route that reads a firm) is caught only in review, which the suite's allow-list of
// @NoFirmData routes makes visible; @ReadsFirm writes for any well-formed firm id the handler answered for (a real route
// answers 404 for a firm that does not exist, so it never gets this far).
import { Inject, Injectable, type CallHandler, type ExecutionContext, type NestInterceptor, type OnModuleInit } from "@nestjs/common";
import { PATH_METADATA, METHOD_METADATA, ROUTE_ARGS_METADATA } from "@nestjs/common/constants.js";
import { ModulesContainer, Reflector } from "@nestjs/core";
import type { Prisma, PrismaClient } from "@prisma/client";
import { from, mergeMap, type Observable } from "rxjs";
import { Db } from "../../../core.ts";
import { problem } from "../../identity/keys.ts";
import { logPort } from "../../observability/log.ts";
import { writeAuditWithAlarm } from "../../observability/alerts.ts";
import { SYSTEM_ACCESS, SYSTEM_PATH, type SystemAccess } from "../../system-identity/keys.ts";
import { auditEvent, AuditRefused } from "../audit-event.ts";
import { auditContext } from "../context.ts";
import { AuditActionNames } from "../firm-read/action-names.ts";
import { FIRM_DATA, type FirmData } from "./declare.ts";
import { firmsReadInRequest, ourStaffFirmsInRequest } from "./tracker.ts";

type Tx = Prisma.TransactionClient;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const FIRM_READ = "platform.system.firm_read", CROSS_TENANT = "cross_tenant.access", ACCESS_ENTITY = "plat_system_access";
AuditActionNames.register("platform", { [FIRM_READ]: "ExpatReady staff read the firm's records" });

// --------------------------------------------------------------------------------------------------- the writers
type Call = { method: string; route: string };
export const ourStaff = () => {
  const ctx = auditContext();
  if (ctx?.actorType !== "OUR_STAFF" || !ctx.actor?.startsWith("ourstaff:")) throw new AuditRefused("audit line refused: an access line is written only in a request our staff make, under their own ourstaff:<id> word");
  return ctx as { actor: string; correlationId?: string };
};

/** One firm-read line on that firm's trail, in `tx` (through AuditPort: its rules and its alert). */
export async function recordFirmRead(tx: Tx, firmId: string, call: Call, scope?: string): Promise<void> {
  const { actor } = ourStaff();
  await auditEvent.record(tx, { firmId, actor, action: FIRM_READ, entity: "platform_firm", entityKey: firmId.toLowerCase(),
    summary: "ExpatReady staff read this firm's records.", detail: { method: call.method, route: call.route, ...(scope ? { scope } : {}) }, before: null, after: null });   // a read: nothing before or after
}

/** One firm-less cross_tenant.access line on the platform's own trail, in `tx`: the staff member (the actor) and the scope. */
export async function recordCrossTenant(tx: Tx, scope: string, call: Call, filters: Record<string, string> = {}): Promise<void> {
  // Round 6 (Lead 15's ruling on #3209): through AuditPort as AUD-3c's firm-less kind, its cross_tenant.access pair; the
  // adapter writes today's row (platform audit workspace, OUR_STAFF, the request's correlation id) with its one attempt and
  // its alarm. ourStaff() refuses first outside our staff's request, in this file's own words, and that refusal raises the
  // same one alert as a failed write (round 6, Lead 16: as before the line moved onto the port).
  const { actor } = await writeAuditWithAlarm(async () => ourStaff(), { entity: ACCESS_ENTITY, entityKey: call.route.slice(0, 200) }, { attempts: 1 });
  await auditEvent.record(tx, { firmId: null, actor, action: "cross_tenant.access", entity: "plat_system_access", entityKey: call.route.slice(0, 200),
    summary: `ExpatReady staff read more than one firm's records: ${scope}.`, detail: { scope, method: call.method, route: call.route, ...filters }, before: null, after: null });   // a read: nothing before or after
}

/** The changes-firm check's failure: one alert (ids only) and a plain 500. */
async function missingLine(call: Call): Promise<never> {
  await writeAuditWithAlarm(async () => { throw new AuditRefused(`audit line missing: ${call.method} ${call.route} changed a firm's records but wrote no line on its trail`); },
    { entity: "platform_firm", entityKey: call.route.slice(0, 200) }, { attempts: 1 }).catch(() => undefined);
  return problem(500, "Not saved to the audit trail", "This change wrote no line on the firm's audit trail, so it is reported as failed. Tell ExpatReady's engineers.", { code: "AUDIT_LINE_MISSING" });
}

// ------------------------------------------------------------------------------------------- the start-up rule
type Ctrl = new (...a: never[]) => unknown;
const join = (...p: string[]) => `/${p.map((s) => s.replace(/^\/+|\/+$/g, "")).filter(Boolean).join("/")}`;

/** A handler that takes the response (@Res(), 1) or next (@Next(), 2) answers by itself, before any interceptor's after-step. */
const answersItself = (ctrl: Ctrl, key: string) => Object.keys((Reflect.getMetadata(ROUTE_ARGS_METADATA, ctrl, key) ?? {}) as object).some((k) => /^(1|2):/.test(k));

/** Every handler our staff call (a route that declares @SystemKeys or @AnySystemStaff) with no firm-data declaration. */
export function undeclaredFirmData(controllers: unknown[], reflector: Reflector): string[] {
  const out: string[] = [];
  for (const c of controllers) {
    const ctrl = c as Ctrl | undefined;
    if (!ctrl?.prototype) continue;
    // Round 2 (breaker 4): the handlers a controller inherits from a base class too, each once (the nearest wins).
    const keys = new Set<string>();
    for (let p: object | null = ctrl.prototype; p && p !== Object.prototype; p = Object.getPrototypeOf(p)) for (const k of Object.getOwnPropertyNames(p)) keys.add(k);
    for (const key of keys) {
      const handler = key === "constructor" ? undefined : (ctrl.prototype as Record<string, unknown>)[key];
      if (typeof handler !== "function" || Reflect.getMetadata(METHOD_METADATA, handler) === undefined) continue;
      const targets = [handler as () => unknown, ctrl];
      const access = reflector.getAllAndOverride<SystemAccess>(SYSTEM_ACCESS, targets);
      if (!access || access.kind === "sign-in") continue;
      const data = reflector.getAllAndOverride<FirmData>(FIRM_DATA, targets);
      const raw = data && (data.kind === "reads-firm" || data.kind === "reads-across") && answersItself(ctrl, key);
      if (!data || raw) {
        const base = ([] as string[]).concat(Reflect.getMetadata(PATH_METADATA, ctrl) ?? "")[0] ?? "", path = ([] as string[]).concat(Reflect.getMetadata(PATH_METADATA, handler) ?? "")[0] ?? "";
        out.push(`${ctrl.name}.${key} (${join(base, path)})${raw ? " answers through @Res() or @Next(), before its line" : ""}`);
      }
    }
  }
  return out;
}

export function assertFirmDataDeclared(controllers: unknown[], reflector: Reflector): void {
  const none = undeclaredFirmData(controllers, reflector);
  if (none.length) throw new Error(`AUD-3: each of our staff's routes declares what it does with firms' data (@ReadsFirm, @ChangesFirm, @ReadsAcrossFirms or @NoFirmData), and a read answers through the interceptor, so its audit line cannot be forgotten: ${none.join(", ")}`);
}

// --------------------------------------------------------------------------------------------- the interceptor
type Req = { method: string; path?: string; url?: string; params?: Record<string, unknown>; query?: Record<string, unknown> };

@Injectable()
export class SystemAccessLines implements NestInterceptor, OnModuleInit {
  constructor(@Inject(Reflector) private readonly reflector: Reflector, @Inject(ModulesContainer) private readonly modules: ModulesContainer, @Inject(Db) private readonly db: PrismaClient) {}

  onModuleInit() {
    assertFirmDataDeclared([...this.modules.values()].flatMap((m) => [...m.controllers.values()].map((w) => w.metatype)), this.reflector);
  }

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (ctx.getType() !== "http") return next.handle();
    const req = ctx.switchToHttp().getRequest<Req>(), targets = [ctx.getHandler(), ctx.getClass()];
    const access = this.reflector.getAllAndOverride<SystemAccess>(SYSTEM_ACCESS, targets);
    if (!access || access.kind === "sign-in" || !SYSTEM_PATH.test(req.path ?? req.url ?? "")) return next.handle();
    const data = this.reflector.getAllAndOverride<FirmData>(FIRM_DATA, targets);
    const base = ([] as string[]).concat(Reflect.getMetadata(PATH_METADATA, ctx.getClass()) ?? "")[0] ?? "", path = ([] as string[]).concat(Reflect.getMetadata(PATH_METADATA, ctx.getHandler()) ?? "")[0] ?? "";
    const call: Call = { method: req.method, route: join(base, path) };
    const res = ctx.switchToHttp().getResponse<{ headersSent?: boolean }>();
    return next.handle().pipe(mergeMap((body) => from(this.after(data, req, call).then(() => {
      // Round 2 (breaker A): a handler that reached the response another way (req.res) answered before this step. Its
      // line is still written above; only "no line, no answer" could not hold, so it is reported loudly, never silent.
      if (res?.headersSent && data?.kind !== "none") logPort.error("system_answer_before_line", undefined, { method: call.method, route: call.route });
      return body;
    }))));
  }

  /** Round 2 (breaker 1, review m2): the lines this request committed on the trails of the firms it wrote for, under its
   *  own actor and correlation id. A line written in a transaction that rolled back is not there, so it is not counted. */
  private async committedLines(): Promise<number> {
    const firms = ourStaffFirmsInRequest(), ctx = auditContext();
    if (!firms.length || !ctx?.actor || !ctx.correlationId) return 0;
    const [row] = await this.db.$queryRaw<{ n: number }[]>`select count(*)::int as n from audit_event where correlation_id = ${ctx.correlationId} and actor = ${ctx.actor} and firm_id = any(${firms}::uuid[]) and action <> 'platform.bypass'`;   // part 2 (#3209 round-2 minor 1): uuid against uuid, so audit_event_firm_id_at_idx can serve it   // round 5 (Lead B): a bypass use's own line (touchFirm, AUD-3c) is not the change's line
    return row?.n ?? 0;
  }

  private async after(data: FirmData | undefined, req: Req, call: Call): Promise<void> {
    if (!data) return missingLine(call);   // the start-up rule makes this unreachable; fail closed all the same
    if (data.kind === "none") return;
    if (data.kind === "changes-firm") { if (!(await this.committedLines())) await missingLine(call); return; }
    if (data.kind === "reads-firm") {
      const firm = req.params?.[data.param];
      if (typeof firm !== "string" || !UUID.test(firm)) return missingLine(call);   // a firm read answered without a firm id
      await this.db.$transaction(async (tx) => { await recordFirmRead(tx, firm.toLowerCase(), call); });
      return;
    }
    // Part 2 (breaker M1): the firm filter is recorded only for a route that declares it narrows by `?firm=` (its own
    // strict query reads it); on any other route a caller's `?firm=` is ignored by the handler, so it is never recorded,
    // and no line can be planted in a firm's access report.
    const f = data.firmFilter ? req.query?.firm : undefined, filters: Record<string, string> = typeof f === "string" && UUID.test(f) ? { firm: f.toLowerCase() } : {};
    // AUD-3 breach read (R1.87 P6): a read across firms that names firms in its answer (noteFirmsRead, tracker.ts: one breach's
    // affected and notified firms) also writes one firm-read line on each of their trails, in the same transaction as
    // its platform line: all or none, before the answer.
    const firms = firmsReadInRequest().filter((f) => UUID.test(f));
    await this.db.$transaction(async (tx) => {
      await recordCrossTenant(tx, data.scope, call, filters);
      for (const f of firms) await recordFirmRead(tx, f, call, data.scope);
    });
  }
}
