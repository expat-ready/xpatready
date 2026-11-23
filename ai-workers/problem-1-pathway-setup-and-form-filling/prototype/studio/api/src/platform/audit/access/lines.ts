// AUD-3 part 1 (R1.87; SA-11-12, SA-11 BR-14; rev 9.1): the line each of our own staff's calls owes, written by one
// interceptor after the route's handler succeeds and before its answer is sent (no line, no answer: a line that cannot be
// written answers 500 and the data never leaves). What a route owes is its declaration (declare.ts):
//   reads-firm    one `platform.system.firm_read` line on that firm's trail, through AuditPort (OUR_STAFF, ourstaff:<id>,
//                 the request's correlation id), in a transaction of its own;
//   changes-firm  nothing more: the change wrote its own line in its own transaction; a successful call that wrote none
//                 answers 500 AUDIT_LINE_MISSING and raises one audit_write_failed alert (the guard-level check: no route
//                 can forget). The change has committed by then: the check is the net that a suite catches, not a rollback;
//   reads-across  one `cross_tenant.access` line on the platform's own trail (no firm; the platform audit workspace, never
//                 reset, P-571 (1)), naming the staff member and the scope;
//   none          nothing (our own staff's sign-in, identity and access, logged on our own table by PF-4s's guard).
// A recorded departure, as PF-12b part 3's touchPlatform: AuditPort's AuditEntry requires a firm, and the case-side shape
// refuses our staff, so the firm-less cross_tenant.access line is written here, with the port's rules (the request's own
// actor word, exactly; OUR_STAFF only; ids only in detail; fail-closed with one alert), not through a port change
// (a firm-less platform entry on the port is the tech lead's later row, P-423).
// At start-up every route our staff call (@SystemKeys or @AnySystemStaff) must declare one; one that does not stops it.
import { Inject, Injectable, type CallHandler, type ExecutionContext, type NestInterceptor, type OnModuleInit } from "@nestjs/common";
import { PATH_METADATA, METHOD_METADATA } from "@nestjs/common/constants.js";
import { ModulesContainer, Reflector } from "@nestjs/core";
import type { Prisma, PrismaClient } from "@prisma/client";
import { from, mergeMap, type Observable } from "rxjs";
import { Db } from "../../../core.ts";
import { problem } from "../../identity/keys.ts";
import { writeAuditWithAlarm } from "../../observability/alerts.ts";
import { SYSTEM_ACCESS, SYSTEM_PATH, type SystemAccess } from "../../system-identity/keys.ts";
import { auditEvent, AuditRefused, platformAuditWorkspaceId } from "../audit-event.ts";
import { auditContext } from "../context.ts";
import { AuditActionNames } from "../firm-read/action-names.ts";
import { FIRM_DATA, type FirmData } from "./declare.ts";
import { ourStaffLinesInRequest } from "./tracker.ts";

type Tx = Prisma.TransactionClient;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const FIRM_READ = "platform.system.firm_read", CROSS_TENANT = "cross_tenant.access", ACCESS_ENTITY = "plat_system_access";
AuditActionNames.register("platform", { [FIRM_READ]: "ExpatReady staff read the firm's records" });

// --------------------------------------------------------------------------------------------------- the writers
type Call = { method: string; route: string };
const ourStaff = () => {
  const ctx = auditContext();
  if (ctx?.actorType !== "OUR_STAFF" || !ctx.actor?.startsWith("ourstaff:")) throw new AuditRefused("audit line refused: an access line is written only in a request our staff make, under their own ourstaff:<id> word");
  return ctx as { actor: string; correlationId?: string };
};

/** One firm-read line on that firm's trail, in `tx` (through AuditPort: its rules and its alert). */
export async function recordFirmRead(tx: Tx, firmId: string, call: Call): Promise<void> {
  const { actor } = ourStaff();
  await auditEvent.record(tx, { firmId, actor, action: FIRM_READ, entity: "platform_firm", entityKey: firmId.toLowerCase(),
    summary: "ExpatReady staff read this firm's records.", detail: { method: call.method, route: call.route } });
}

/** One firm-less cross_tenant.access line on the platform's own trail, in `tx`: the staff member (the actor) and the scope. */
export async function recordCrossTenant(tx: Tx, scope: string, call: Call, filters: Record<string, string | null> = {}): Promise<void> {
  await writeAuditWithAlarm(async () => {
    const { actor, correlationId } = ourStaff();
    const workspaceId = await platformAuditWorkspaceId(tx);
    await tx.auditEvent.create({ data: { workspaceId, firmId: null, caseId: null, actorType: "OUR_STAFF", correlationId: correlationId ?? null, supportSessionId: null,
      actor, action: CROSS_TENANT, entity: ACCESS_ENTITY, entityKey: call.route.slice(0, 200), summary: `ExpatReady staff read more than one firm's records: ${scope}.`,
      detail: { scope, method: call.method, route: call.route, ...filters } } });
  }, { entity: ACCESS_ENTITY, entityKey: call.route.slice(0, 200) }, { attempts: 1 });
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

/** Every handler our staff call (a route that declares @SystemKeys or @AnySystemStaff) with no firm-data declaration. */
export function undeclaredFirmData(controllers: unknown[], reflector: Reflector): string[] {
  const out: string[] = [];
  for (const c of controllers) {
    const ctrl = c as Ctrl | undefined;
    if (!ctrl?.prototype) continue;
    for (const key of Object.getOwnPropertyNames(ctrl.prototype)) {
      const handler = key === "constructor" ? undefined : (ctrl.prototype as Record<string, unknown>)[key];
      if (typeof handler !== "function" || Reflect.getMetadata(METHOD_METADATA, handler) === undefined) continue;
      const targets = [handler as () => unknown, ctrl];
      const access = reflector.getAllAndOverride<SystemAccess>(SYSTEM_ACCESS, targets);
      if (!access || access.kind === "sign-in") continue;
      if (!reflector.getAllAndOverride<FirmData>(FIRM_DATA, targets)) {
        const base = ([] as string[]).concat(Reflect.getMetadata(PATH_METADATA, ctrl) ?? "")[0] ?? "", path = ([] as string[]).concat(Reflect.getMetadata(PATH_METADATA, handler) ?? "")[0] ?? "";
        out.push(`${ctrl.name}.${key} (${join(base, path)})`);
      }
    }
  }
  return out;
}

export function assertFirmDataDeclared(controllers: unknown[], reflector: Reflector): void {
  const none = undeclaredFirmData(controllers, reflector);
  if (none.length) throw new Error(`AUD-3: each of our staff's routes declares what it does with firms' data (@ReadsFirm, @ChangesFirm, @ReadsAcrossFirms or @NoFirmData), so its audit line cannot be forgotten: ${none.join(", ")}`);
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
    return next.handle().pipe(mergeMap((body) => from(this.after(data, req, call).then(() => body))));
  }

  private async after(data: FirmData | undefined, req: Req, call: Call): Promise<void> {
    if (!data) return missingLine(call);   // the start-up rule makes this unreachable; fail closed all the same
    if (data.kind === "none") return;
    if (data.kind === "changes-firm") { if (ourStaffLinesInRequest() < 1) await missingLine(call); return; }
    if (data.kind === "reads-firm") {
      const firm = req.params?.[data.param];
      if (typeof firm !== "string" || !UUID.test(firm)) return missingLine(call);   // a firm read answered without a firm id
      await this.db.$transaction(async (tx) => { await recordFirmRead(tx, firm.toLowerCase(), call); });
      return;
    }
    const f = req.query?.firm, filters = typeof f === "string" && UUID.test(f) ? { firm: f.toLowerCase() } : {};
    await this.db.$transaction(async (tx) => { await recordCrossTenant(tx, data.scope, call, filters); });
  }
}
