// PF-4 (contracts §7 §1.2; SA-6-14 AUTHZ_UNCONFIGURED, AG-1-19): the one guard of /api/platform/* and /api/front-office/*.
// bearer token → staff member, grants and keys (PF-3's tables) → a deactivated person or a session started before the
// person's last revocation is refused at once (401) → the route's declared permission keys, all of them (403 otherwise)
// → { staffId, firmId, keys, duties } on the request (req.platform; read with staffOf). Any other path is left exactly as
// it was: this guard returns at once and the simulated-person header keeps its own guard (core.ts ConfigReadGuard, which
// in turn leaves these paths to this guard). The simulated-person header gives nothing here: no bearer token is a 401.
// At start-up every route under those paths must declare its access (keys.ts); one that does not, or a firm route naming
// a key outside agent/*, stops the start-up with its name.
// PF-6b (rulings 2, 3): at start-up no duty or bundle may hand out a MONEY key (catalogue.ts); a route that declares a
// LICENCE-class key also needs the person's licence record, otherwise 403 NOT_LICENSED. Each route also reports its
// @OwnOrAll area (keys.ts), which the PF-6b check sweeps.
import { Inject, Injectable, type CanActivate, type ExecutionContext, type OnModuleInit } from "@nestjs/common";
import { METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants.js";
import { ModulesContainer, Reflector } from "@nestjs/core";
import { assertNoBundleHandsOutMoney } from "./catalogue.ts";
import { DUTY_KEYS, FIRM_KEY, NOT_LICENSED, OWN_OR_ALL, PLATFORM_ACCESS, PLATFORM_PATH, forbidden, type PlatformAccess, type StaffContext } from "./keys.ts";
import { PlatformIdentity } from "./service.ts";

const METHODS = ["GET", "POST", "PUT", "DELETE", "PATCH", "ALL", "OPTIONS", "HEAD", "SEARCH"];
const join = (...p: string[]) => `/${p.map((s) => s.replace(/^\/+|\/+$/g, "")).filter(Boolean).join("/")}`;

/** Every route the app serves under the platform paths, with its declared access (undefined when none). */
export function platformRoutes(modules: ModulesContainer, reflector: Reflector) {
  return controllerRoutes([...modules.values()].flatMap((m) => [...m.controllers.values()].map((w) => w.metatype)), reflector);
}

/** The same, for a list of controller classes (PF-6b's sweep reads every feature's controllers this way). */
export function controllerRoutes(controllers: unknown[], reflector: Reflector) {
  const out: { name: string; method: string; path: string; access: PlatformAccess | undefined; ownOrAll?: string }[] = [];
  for (const c of controllers) {
    const ctrl = c as (new (...a: never[]) => unknown) | undefined;
    if (!ctrl?.prototype) continue;
    const base = ([] as string[]).concat(Reflect.getMetadata(PATH_METADATA, ctrl) ?? "");
    for (const key of Object.getOwnPropertyNames(ctrl.prototype)) {
      if (key === "constructor") continue;
      const handler = ctrl.prototype[key as keyof typeof ctrl.prototype] as unknown;
      if (typeof handler !== "function" || Reflect.getMetadata(METHOD_METADATA, handler) === undefined) continue;
      const method = METHODS[Reflect.getMetadata(METHOD_METADATA, handler) as number] ?? "?";
      const paths = ([] as string[]).concat(Reflect.getMetadata(PATH_METADATA, handler) ?? "");
      for (const b of base) for (const p of paths) {
        const path = join(b, p);
        if (PLATFORM_PATH.test(path)) out.push({ name: `${ctrl.name}.${key}`, method, path, access: reflector.getAllAndOverride<PlatformAccess>(PLATFORM_ACCESS, [handler as () => unknown, ctrl]), ownOrAll: reflector.getAllAndOverride<string>(OWN_OR_ALL, [handler as () => unknown, ctrl]) });
      }
    }
  }
  return out;
}

/** The start-up rule: every platform route declares its access, and a firm route names agent/* keys only. */
export function assertEveryRouteDeclared(routes: ReturnType<typeof platformRoutes>) {
  const none = routes.filter((r) => !r.access).map((r) => `${r.name} (${r.method} ${r.path})`);
  if (none.length) throw new Error(`Platform routes with no declared permission keys (default deny; add @PermissionKeys, @AnyStaff or @StaffSignIn): ${none.join(", ")}`);
  const plane = routes.filter((r) => r.access?.kind === "keys" && r.access.keys.some((k) => !FIRM_KEY.test(k))).map((r) => `${r.name} (${r.method} ${r.path}: ${(r.access as { keys: string[] }).keys.filter((k) => !FIRM_KEY.test(k)).join(", ")})`);
  if (plane.length) throw new Error(`Firm routes accept only agent/* keys (SA-6-4): ${plane.join(", ")}`);
}

type Req = { method: string; path?: string; url?: string; headers: Record<string, string | string[] | undefined>; platform?: StaffContext };

@Injectable()
export class PlatformGuard implements CanActivate, OnModuleInit {
  constructor(@Inject(Reflector) private readonly reflector: Reflector, @Inject(ModulesContainer) private readonly modules: ModulesContainer, @Inject(PlatformIdentity) private readonly identity: PlatformIdentity) {}

  /** The LICENCE-class keys, read once from the catalogue (it changes only by migration). */
  private licence: Promise<Set<string>> | null = null;
  private licenceKeys() {
    this.licence ??= this.identity.catalogue().then((rows) => {
      assertNoBundleHandsOutMoney(DUTY_KEYS, rows);   // PF-6b ruling 2 (a): stops the start-up
      return new Set(rows.filter((r) => r.class === "LICENCE").map((r) => r.key));
    }).catch((e) => { this.licence = null; throw e; });
    return this.licence;
  }

  async onModuleInit() { assertEveryRouteDeclared(platformRoutes(this.modules, this.reflector)); await this.licenceKeys(); }

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Req>();
    const access = this.reflector.getAllAndOverride<PlatformAccess>(PLATFORM_ACCESS, [ctx.getHandler(), ctx.getClass()]);
    // A declared platform route is guarded whatever the path's letter case (break M1); an undeclared one on these paths is refused.
    if (!access && !PLATFORM_PATH.test(req.path ?? req.url ?? "")) return true;
    if (!access) forbidden("This route declares no permission keys, so it is refused (default deny).", "AUTHZ_UNCONFIGURED");
    if (access.kind === "sign-in") return true;
    const h = req.headers.authorization, auth = Array.isArray(h) ? h[0] : h;
    const m = typeof auth === "string" ? /^Bearer\s+(\S+)$/i.exec(auth.trim()) : null;
    const staff = await this.identity.authenticate(m?.[1]);
    if (access.kind === "keys") {
      const missing = access.keys.filter((k) => !staff.keys.includes(k));
      if (missing.length) forbidden(`Your roles do not include the permission this needs (${missing.join(", ")}).`, "MISSING_PERMISSION");
      const licence = await this.licenceKeys();
      if (access.keys.some((k) => licence.has(k)) && !(await this.identity.isLicensed(staff.firmId, staff.staffId))) forbidden(NOT_LICENSED, "NOT_LICENSED");   // PF-6b ruling 3
    }
    req.platform = staff;
    return true;
  }
}
