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
// PF-5t (checklist row 100): after every other rule, a person with current terms to accept (terms/service.ts, one read)
// gets 428 TERMS_PENDING on every guarded route but the four in TERMS_OPEN_ROUTES, matched on the route's declared method
// and path. Wired by features/platform-terms.ts (TERMS_GATE); an app that serves the terms routes without the gate stops
// at start-up.
import { Inject, Injectable, Optional, type CanActivate, type ExecutionContext, type OnModuleInit } from "@nestjs/common";
import { METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants.js";
import { ModulesContainer, Reflector } from "@nestjs/core";
import { TERMS_GATE, TERMS_OPEN_ROUTES, termsPending, type TermsGate } from "../terms/gate.ts";
import { LICENCE_KEYS, assertNoBundleHandsOutMoney, catalogueMismatches } from "./catalogue.ts";
import { DUTY_KEYS, FIRM_KEY, NOT_LICENSED, OWN_OR_ALL, PLATFORM_ACCESS, PLATFORM_PATH, forbidden, type PlatformAccess, type StaffContext } from "./keys.ts";
import { PlatformIdentity } from "./service.ts";
import { enterRequest, setRequestFirm, withFirm } from "../firm-scope.ts";

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
  constructor(@Inject(Reflector) private readonly reflector: Reflector, @Inject(ModulesContainer) private readonly modules: ModulesContainer, @Inject(PlatformIdentity) private readonly identity: PlatformIdentity,
    @Optional() @Inject(TERMS_GATE) private readonly terms?: TermsGate) {}

  /** The LICENCE-class keys, read once from the catalogue (it changes only by migration), always with the code's own list:
   *  a catalogue row edited by hand can never switch the check off (break m1, review m2), and a catalogue that disagrees
   *  with ruling 1 (catalogue.ts scopeOf/classOf) stops the start-up. */
  private licence: Promise<Set<string>> | null = null;
  private licenceKeys() {
    this.licence ??= this.identity.catalogue().then((rows) => {
      assertNoBundleHandsOutMoney(DUTY_KEYS, rows);   // PF-6b ruling 2 (a): stops the start-up
      const wrong = catalogueMismatches(rows);
      if (wrong.length) throw new Error(`The permission-key catalogue disagrees with PF-6b's rules (platform_permission_key): ${wrong.join("; ")}`);
      return new Set([...LICENCE_KEYS, ...rows.filter((r) => r.class === "LICENCE").map((r) => r.key)]);
    }).catch((e) => { this.licence = null; throw e; });
    return this.licence;
  }

  async onModuleInit() {
    const routes = platformRoutes(this.modules, this.reflector);
    assertEveryRouteDeclared(routes);
    if (!this.terms && routes.some((r) => r.path === "/api/platform/me/terms")) throw new Error("The terms routes are served but the guard has no TERMS_GATE (features/platform-terms.ts): pending terms would never be asked.");
    await this.licenceKeys();
  }

  /** The handler's declared method and path(s), as platformRoutes reads them. */
  private declared(ctx: ExecutionContext): string[] {
    const handler = ctx.getHandler(), method = METHODS[Reflect.getMetadata(METHOD_METADATA, handler) as number] ?? "?";
    const bases = ([] as string[]).concat(Reflect.getMetadata(PATH_METADATA, ctx.getClass()) ?? ""), paths = ([] as string[]).concat(Reflect.getMetadata(PATH_METADATA, handler) ?? "");
    return bases.flatMap((b) => paths.map((p) => `${method} ${join(b, p)}`));
  }

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Req>();
    enterRequest(req);   // PF-12: this request's scope (no firm yet), before any await
    const access = this.reflector.getAllAndOverride<PlatformAccess>(PLATFORM_ACCESS, [ctx.getHandler(), ctx.getClass()]);
    // A declared platform route is guarded whatever the path's letter case (break M1); an undeclared one on these paths is refused.
    if (!access && !PLATFORM_PATH.test(req.path ?? req.url ?? "")) return true;
    if (!access) forbidden("This route declares no permission keys, so it is refused (default deny).", "AUTHZ_UNCONFIGURED");
    if (access.kind === "sign-in") return true;
    const h = req.headers.authorization, auth = Array.isArray(h) ? h[0] : h;
    const m = typeof auth === "string" ? /^Bearer\s+(\S+)$/i.exec(auth.trim()) : null;
    const staff = await this.identity.authenticate(m?.[1]);   // PF-12b part 2: finds the firm by a narrow lookup, then runs as it (no bypass)
    setRequestFirm(req, staff.firmId);   // PF-12: the handler runs as this firm
    if (access.kind === "keys") {
      const missing = access.keys.filter((k) => !staff.keys.includes(k));
      if (missing.length) forbidden(`Your roles do not include the permission this needs (${missing.join(", ")}).`, "MISSING_PERMISSION");
      const licence = await this.licenceKeys();
      if (access.keys.some((k) => licence.has(k)) && !(await withFirm(staff.firmId, () => this.identity.isLicensed(staff.firmId, staff.staffId)))) forbidden(NOT_LICENSED, "NOT_LICENSED");
      // PF-6b ruling 3, P-612 (founder, 15 Nov: "Yes, keep the check"): a recorded departure from SA-6-27, which says the
      // permission system never checks licence. Unconfirmed: no counsel.
    }
    // PF-5t: pending terms stop everything but who-am-I, the terms routes and sign-out (Unconfirmed: no counsel).
    if (this.terms && !this.declared(ctx).every((r) => TERMS_OPEN_ROUTES.has(r)) && (await this.terms.mustAccept(staff))) termsPending();
    req.platform = staff;
    return true;
  }
}
