// PF-4s part 1 (SA-7-1, SA-7-11, SA-7-14, SA-7-20; SA-6-4): the one guard of /api/system/*, and the wall around it.
// The guard: bearer token → one of our own staff (service.ts: two-step done, active, session not ended) → the route's
// declared system/* keys, all of them (403 otherwise), and its reason when it asks for one (400 otherwise) → one audit
// line, allowed or refused, written before the handler runs (no line, no call) → { staffId, name, roles, keys } on the
// request (req.systemStaff; read with systemStaffOf). It never sets a firm: these requests have none (SA-7-1).
// Every other path is left exactly as it was. Matching is by the route's declared access first, so a route is guarded
// whatever the letter case of the path it was reached by; core.ts's ConfigReadGuard leaves /api/system to this guard
// (its one line, a match of its own beside PF-4's).
// The wall: a session of our own staff is refused (403) on every path outside /api/system, before any other guard
// (SystemPlaneWall, installed on the HTTP server when the app is built, as PF-25's host routing): a staff token is valid
// only for the staff console (SA-7-1). The other way round, a firm staff session on /api/system is a 403 from the guard.
// At start-up every route under /api/system must declare its access (keys.ts) with system/* keys only, and no route
// outside it may; one that breaks either rule stops the start-up with its name.
import { Inject, Injectable, type CanActivate, type ExecutionContext, type OnModuleInit } from "@nestjs/common";
import { METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants.js";
import { HttpAdapterHost, ModulesContainer, Reflector } from "@nestjs/core";
import { PLATFORM_ACCESS, forbidden, problem } from "../identity/keys.ts";
import { REASON_MAX, SYSTEM_ACCESS, SYSTEM_KEY, SYSTEM_PATH, SYSTEM_REASON, SYSTEM_STEP_UP, type SystemAccess, type SystemStaffContext } from "./keys.ts";
import { correlationOf } from "../observability/hook.ts";
import { logPort } from "../observability/log.ts";
import { requestLine } from "../observability/metrics.ts";
import { PlatformClock } from "../identity/port.ts";
import { STEP_UP_SECONDS, requireStepUp } from "../identity/session/step-up.ts";
import { SystemIdentity } from "./service.ts";

const METHODS = ["GET", "POST", "PUT", "DELETE", "PATCH", "ALL", "OPTIONS", "HEAD", "SEARCH"];
const join = (...p: string[]) => `/${p.map((s) => s.replace(/^\/+|\/+$/g, "")).filter(Boolean).join("/")}`;
const bearerOf = (h: string | string[] | undefined) => { const a = Array.isArray(h) ? h[0] : h; return typeof a === "string" ? /^Bearer\s+(\S+)$/i.exec(a.trim())?.[1] : undefined; };
/** Text that goes on an audit line: control and invisible format characters dropped (a NUL would make the line
 *  impossible to write, so a refused call would leave none; breaker m2), at most `max` characters, counted and cut by code
 *  point so a cut never splits a character in two (a lone surrogate half). */
export const lineText = (v: string, max: number) => [...v.replace(/[\p{Cc}\p{Cf}]/gu, "").trim()].slice(0, max).join("");
const deviceOf = (h: string | string[] | undefined) => { const a = Array.isArray(h) ? h[0] : h; const t = typeof a === "string" ? lineText(a, 300) : ""; return t || null; };
/** A written reason: after the invisible characters go, at least one letter or digit, at most REASON_MAX (breaker m4). */
export const reasonOf = (v: unknown): string | null => { if (typeof v !== "string") return null; const t = lineText(v, REASON_MAX + 1); return /[\p{L}\p{N}]/u.test(t) && [...t].length <= REASON_MAX ? t : null; };

/** What a call affected: the route's path parameters, each cleaned for the line. */
const targetOf = (req: { params?: Record<string, unknown> }) => Object.fromEntries(Object.entries(req.params ?? {}).filter((e): e is [string, string] => typeof e[1] === "string").map(([k, v]) => [k, lineText(v, 200)]));

export type SystemRoute = { name: string; method: string; path: string; access: SystemAccess | undefined; firmAccess: boolean };

/** Every route of these controllers that is under /api/system or declares system access, with what it declares. */
export function systemRoutes(controllers: unknown[], reflector: Reflector): SystemRoute[] {
  const out: SystemRoute[] = [];
  for (const c of controllers) {
    const ctrl = c as (new (...a: never[]) => unknown) | undefined;
    if (!ctrl?.prototype) continue;
    const bases = ([] as string[]).concat(Reflect.getMetadata(PATH_METADATA, ctrl) ?? "");
    for (const key of Object.getOwnPropertyNames(ctrl.prototype)) {
      const handler = key === "constructor" ? undefined : (ctrl.prototype as Record<string, unknown>)[key];
      if (typeof handler !== "function" || Reflect.getMetadata(METHOD_METADATA, handler) === undefined) continue;
      const method = METHODS[Reflect.getMetadata(METHOD_METADATA, handler) as number] ?? "?", targets = [handler as () => unknown, ctrl];
      const access = reflector.getAllAndOverride<SystemAccess>(SYSTEM_ACCESS, targets), firmAccess = reflector.getAllAndOverride<unknown>(PLATFORM_ACCESS, targets) !== undefined;
      for (const b of bases) for (const p of ([] as string[]).concat(Reflect.getMetadata(PATH_METADATA, handler) ?? "")) {
        const path = join(b, p);
        if (access || SYSTEM_PATH.test(path)) out.push({ name: `${ctrl.name}.${key}`, method, path, access, firmAccess });
      }
    }
  }
  return out;
}

/** The start-up rules (default deny; SA-6-4: the two planes never mix). */
export function assertSystemRoutesDeclared(routes: SystemRoute[]) {
  const say = (r: SystemRoute) => `${r.name} (${r.method} ${r.path})`;
  const none = routes.filter((r) => !r.access).map(say);
  if (none.length) throw new Error(`Routes under /api/system with no declared system keys (default deny; add @SystemKeys, @AnySystemStaff or @SystemSignIn): ${none.join(", ")}`);
  const outside = routes.filter((r) => !SYSTEM_PATH.test(r.path)).map(say);
  if (outside.length) throw new Error(`Our own staff's access is declared only under /api/system (SA-7-1): ${outside.join(", ")}`);
  const mixed = routes.filter((r) => r.firmAccess).map(say);
  if (mixed.length) throw new Error(`A route under /api/system never also declares a firm's access (SA-6-4): ${mixed.join(", ")}`);
  const other = routes.filter((r) => r.access?.kind === "keys" && (!r.access.keys.length || r.access.keys.some((k) => !SYSTEM_KEY.test(k)))).map(say);
  if (other.length) throw new Error(`Routes under /api/system accept only system/* keys, at least one (SA-6-4): ${other.join(", ")}`);
}

type Req = { method: string; path?: string; url?: string; headers: Record<string, string | string[] | undefined>; params?: Record<string, unknown>; body?: unknown; route?: { path?: unknown }; systemStaff?: SystemStaffContext };

@Injectable()
export class SystemGuard implements CanActivate, OnModuleInit {
  constructor(@Inject(Reflector) private readonly reflector: Reflector, @Inject(ModulesContainer) private readonly modules: ModulesContainer, @Inject(SystemIdentity) private readonly identity: SystemIdentity, @Inject(PlatformClock) private readonly clock: PlatformClock) {}

  onModuleInit() {
    assertSystemRoutesDeclared(systemRoutes([...this.modules.values()].flatMap((m) => [...m.controllers.values()].map((w) => w.metatype)), this.reflector));
  }

  /** The route's declared pattern ("/api/system/firms/:id"), never the path itself. */
  private routeOf(ctx: ExecutionContext): string {
    const handler = ctx.getHandler();
    const base = ([] as string[]).concat(Reflect.getMetadata(PATH_METADATA, ctx.getClass()) ?? "")[0] ?? "", path = ([] as string[]).concat(Reflect.getMetadata(PATH_METADATA, handler) ?? "")[0] ?? "";
    return join(base, path);
  }

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (ctx.getType() !== "http") return true;
    const req = ctx.switchToHttp().getRequest<Req>();
    const access = this.reflector.getAllAndOverride<SystemAccess>(SYSTEM_ACCESS, [ctx.getHandler(), ctx.getClass()]);
    if (!access && !SYSTEM_PATH.test(req.path ?? req.url ?? "")) return true;
    if (!access) forbidden("This route declares no system keys, so it is refused (default deny).", "AUTHZ_UNCONFIGURED");
    if (access.kind === "sign-in") return true;   // the door writes its own line once it knows who signed in (service.ts)
    const route = this.routeOf(ctx), device = deviceOf(req.headers["user-agent"]), target = targetOf(req);
    const staff = await this.identity.authenticate(bearerOf(req.headers.authorization), (who, code) => this.identity.audit({ staff: who, method: req.method, route, target, outcome: "REFUSED", code, reason: null, device }));
    const missing = access.kind === "keys" ? access.keys.filter((k) => !staff.keys.includes(k)) : [];
    const targets = [ctx.getHandler(), ctx.getClass()], now = this.clock.now();
    const wantsReason = this.reflector.getAllAndOverride<boolean>(SYSTEM_REASON, targets) === true;
    // SA-7-10: a sign-in at most 5 minutes old (exactly 5 passes, as PF-4b's requireStepUp).
    const stale = this.reflector.getAllAndOverride<boolean>(SYSTEM_STEP_UP, targets) === true && now / 1000 - staff.authTime > STEP_UP_SECONDS;
    const reason = reasonOf((req.body as { reason?: unknown } | null | undefined)?.reason);
    const code = missing.length ? "MISSING_PERMISSION" : stale ? "STEP_UP_REQUIRED" : wantsReason && !reason ? "REASON_REQUIRED" : null;
    // One line per call, allowed or refused, before the handler: a line that cannot be written stops the call (fail-closed).
    await this.identity.audit({ staff, method: req.method, route, target, outcome: code ? "REFUSED" : "ALLOWED", code, reason: wantsReason ? reason : null, device });
    if (missing.length) forbidden(`Your roles do not include the permission this needs (${missing.join(", ")}).`, "MISSING_PERMISSION");
    if (stale) requireStepUp(staff, now, "this change");
    if (code === "REASON_REQUIRED") problem(400, "Give a reason", `This needs a written reason (reason, up to ${REASON_MAX} characters).`, { code });
    req.systemStaff = staff;
    return true;
  }
}

type WallReq = { method?: string; path?: string; url?: string; headers: Record<string, string | string[] | undefined> };
type WallRes = { setHeader(k: string, v: string): unknown; status(code: number): WallRes; type(t: string): WallRes; json(body: unknown): unknown };
export const SYSTEM_SESSION_ELSEWHERE = "An ExpatReady staff session works only in the staff console (/api/system). It cannot be used here.";

/** The wall's middleware: a bearer token that is a session of our own staff, on any path outside /api/system, is answered
 *  403 at once. Any other request goes on untouched (a firm's token, a link token and no token all fail the check). */
export function systemPlaneWall(identity: Pick<SystemIdentity, "isSystemSession">) {
  return (req: WallReq, res: WallRes, next: (e?: unknown) => void) => {
    const token = bearerOf(req.headers.authorization), t0 = performance.now();
    if (!token || SYSTEM_PATH.test(req.path ?? req.url ?? "")) return next();
    identity.isSystemSession(token).then((ours) => {
      if (!ours) return next();
      // It runs before PF-23's request middleware, so it gives its own request id and request line (review m3).
      const correlationId = correlationOf(req.headers["x-request-id"]);
      res.setHeader("X-Request-Id", correlationId);
      logPort.warn("system_session_elsewhere", { staffId: ours.staffId, method: req.method ?? "?", status: 403, correlationId });
      requestLine({ method: req.method ?? "?", route: "unmatched", status: 403, durationMs: performance.now() - t0, correlationId });
      res.status(403).type("application/problem+json").json({ type: "https://expatready.local/problems/system-session-elsewhere", title: "Not allowed", status: 403, detail: SYSTEM_SESSION_ELSEWHERE, message: SYSTEM_SESSION_ELSEWHERE, code: "SYSTEM_SESSION_ELSEWHERE" });
    }, next);
  };
}

/** Installs the wall when the app is built, so it runs before every guard and controller (a provider, not a line in
 *  main.ts: features add controllers and providers only). */
@Injectable()
export class SystemPlaneWall {
  constructor(@Inject(HttpAdapterHost) host: HttpAdapterHost, @Inject(SystemIdentity) identity: SystemIdentity) {
    const server = host.httpAdapter?.getInstance?.() as { use?: (fn: unknown) => unknown } | undefined;
    if (typeof server?.use !== "function") throw new Error("PF-4s: the HTTP server is not ready, so our own staff's sessions cannot be walled off from firm routes");
    server.use(systemPlaneWall(identity));
  }
}
