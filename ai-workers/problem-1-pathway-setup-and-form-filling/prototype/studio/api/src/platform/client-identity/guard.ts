// PF-4p part 1 (R1.62; P-584 (4)): the one guard of /api/portal/*: a bearer token → a known, ACTIVE client of one firm whose session has not
// ended (service.ts) → req.portalClient (clientOf), with the request's firm set for PF-12. Staff tokens are another issuer and key (401 here);
// a client token is 401 on /api/platform, /api/front-office and /api/system, and 403 on the case side (core.ts). At start-up every route
// under /api/portal declares its access (keys.ts), none outside does, and none mixes planes; a breach stops the start-up with its name.
import { Inject, Injectable, type CanActivate, type ExecutionContext, type OnModuleInit } from "@nestjs/common";
import { METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants.js";
import { ModulesContainer, Reflector } from "@nestjs/core";
import { enterRequest, setRequestFirm } from "../firm-scope.ts";
import { PLATFORM_ACCESS, forbidden } from "../identity/keys.ts";
import { SYSTEM_ACCESS } from "../system-identity/keys.ts";
import { PORTAL_ACCESS, PORTAL_PATH, type ClientContext, type PortalAccess } from "./keys.ts";
import { ClientIdentity } from "./service.ts";

const METHODS = ["GET", "POST", "PUT", "DELETE", "PATCH", "ALL", "OPTIONS", "HEAD", "SEARCH"];
const join = (...p: string[]) => `/${p.map((s) => s.replace(/^\/+|\/+$/g, "")).filter(Boolean).join("/")}`;
const bearerOf = (h: string | string[] | undefined) => { const a = Array.isArray(h) ? h[0] : h; return typeof a === "string" ? /^Bearer\s+(\S+)$/i.exec(a.trim())?.[1] : undefined; };

export type PortalRoute = { name: string; method: string; path: string; access: PortalAccess | undefined; otherPlane: boolean };
/** Every route of these controllers that is under /api/portal or declares portal access, with what it declares. */
export function portalRoutes(controllers: unknown[], reflector: Reflector): PortalRoute[] {
  const out: PortalRoute[] = [];
  for (const c of controllers) {
    const ctrl = c as (new (...a: never[]) => unknown) | undefined;
    if (!ctrl?.prototype) continue;
    const bases = ([] as string[]).concat(Reflect.getMetadata(PATH_METADATA, ctrl) ?? "");
    for (const key of Object.getOwnPropertyNames(ctrl.prototype)) {
      const handler = key === "constructor" ? undefined : (ctrl.prototype as Record<string, unknown>)[key];
      if (typeof handler !== "function" || Reflect.getMetadata(METHOD_METADATA, handler) === undefined) continue;
      const method = METHODS[Reflect.getMetadata(METHOD_METADATA, handler) as number] ?? "?", targets = [handler as () => unknown, ctrl];
      const access = reflector.getAllAndOverride<PortalAccess>(PORTAL_ACCESS, targets);
      const otherPlane = reflector.getAllAndOverride<unknown>(PLATFORM_ACCESS, targets) !== undefined || reflector.getAllAndOverride<unknown>(SYSTEM_ACCESS, targets) !== undefined;
      for (const b of bases) for (const p of ([] as string[]).concat(Reflect.getMetadata(PATH_METADATA, handler) ?? "")) {
        const path = join(b, p);
        if (access || PORTAL_PATH.test(path)) out.push({ name: `${ctrl.name}.${key}`, method, path, access, otherPlane });
      }
    }
  }
  return out;
}
/** The start-up rules (default deny; the three planes never mix). */
export function assertPortalRoutesDeclared(routes: PortalRoute[]) {
  const say = (r: PortalRoute) => `${r.name} (${r.method} ${r.path})`;
  const none = routes.filter((r) => !r.access).map(say);
  if (none.length) throw new Error(`Routes under /api/portal with no declared client access (default deny; add @PortalClient or @PortalSignIn): ${none.join(", ")}`);
  const outside = routes.filter((r) => !PORTAL_PATH.test(r.path)).map(say);
  if (outside.length) throw new Error(`A client's access is declared only under /api/portal (P-584 (4)): ${outside.join(", ")}`);
  const mixed = routes.filter((r) => r.otherPlane).map(say);
  if (mixed.length) throw new Error(`A route under /api/portal never also declares a firm's or our own staff's access: ${mixed.join(", ")}`);
}
type Req = { method: string; path?: string; url?: string; headers: Record<string, string | string[] | undefined>; portalClient?: ClientContext };
@Injectable()
export class ClientGuard implements CanActivate, OnModuleInit {
  constructor(@Inject(Reflector) private readonly reflector: Reflector, @Inject(ModulesContainer) private readonly modules: ModulesContainer, @Inject(ClientIdentity) private readonly identity: ClientIdentity) {}

  onModuleInit() {
    assertPortalRoutesDeclared(portalRoutes([...this.modules.values()].flatMap((m) => [...m.controllers.values()].map((w) => w.metatype)), this.reflector));
  }

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (ctx.getType() !== "http") return true;
    const req = ctx.switchToHttp().getRequest<Req>();
    const access = this.reflector.getAllAndOverride<PortalAccess>(PORTAL_ACCESS, [ctx.getHandler(), ctx.getClass()]);
    if (!access && !PORTAL_PATH.test(req.path ?? req.url ?? "")) return true;
    if (!access) forbidden("This route declares no client access, so it is refused (default deny).", "AUTHZ_UNCONFIGURED");
    enterRequest(req);   // PF-12: this request's scope (no firm yet)
    if (access.kind === "sign-in") return true;
    const client = await this.identity.authenticate(bearerOf(req.headers.authorization));
    setRequestFirm(req, client.firmId);   // PF-12: the handler runs as the client's firm
    req.portalClient = client;
    return true;
  }
}
