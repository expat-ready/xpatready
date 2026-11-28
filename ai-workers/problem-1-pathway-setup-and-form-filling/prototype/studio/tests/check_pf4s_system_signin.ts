// PF-4s part 1 (BACKLOG row PF-4s, brief product/design/lead-b-briefs/PF-4s.md; R1.5; SA-7-1, SA-7-2, SA-7-3, SA-7-11,
// SA-7-14, SA-7-20, SA7-D5, SA7-D8, Appendix A of SA-07 v2.17): sign-in for ExpatReady's own staff on a pool of their own,
// the guard of /api/system/* and the wall that keeps their sessions off every other path. The row's "Done when" DW1-DW5
// and DW8, each with a passing and a failing case (DW6, DW7: step-up and the staff access routes, are part 2's).
// One process: a scratch database (every migration, PF-3's Sample seed for a firm's staff) and small Nest apps built from
// the feature's own classes beside core.ts's ConfigReadGuard, PF-4's guard and routes, PF-23's request scope, a stand-in
// "existing" route and test-only system routes (a refund route: never in api/src). No model call (US$0).
//   tsx --tsconfig studio/api/tsconfig.json studio/tests/check_pf4s_system_signin.ts
import "reflect-metadata";
import { Body, Controller, Get, Module, Param, Post, SetMetadata } from "@nestjs/common";
import { APP_GUARD, NestFactory } from "@nestjs/core";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { createHmac, createSign, generateKeyPairSync, randomUUID } from "node:crypto";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { runContract } from "../ports/contracts/contract.ts";
import { identityPortContract } from "../ports/contracts/identity-port.contract.ts";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations");
const BIN = ["/opt/homebrew/opt/postgresql@18/bin", "/usr/lib/postgresql/18/bin"].find((b) => existsSync(join(b, "psql"))) ?? "";
const PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_pf4s_scratch_${process.pid}`;
const urlOf = (db: string, user = "xr_studio") => `postgresql://${user}@127.0.0.1:54329/${db}`;
const sql = (q: string, user = "xr_studio") => execFileSync(join(BIN, "psql"), [urlOf(DB, user), "-X", "-v", "ON_ERROR_STOP=1", "-q", "-Atc", q], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const refusedBySql = (q: string, like: RegExp, user = "xr_studio") => { try { sql(q, user); return false; } catch (e) { return like.test(String((e as { stderr?: unknown }).stderr ?? e)); } };

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 600)}` : ""}`); };
const throwsLike = async (f: () => unknown, test: (e: unknown) => boolean) => { try { await f(); return false; } catch (e) { return test(e); } };

// Everything this process prints (the wall's log line is read from it).
let printed = "";
for (const st of [process.stdout, process.stderr]) { const w = st.write.bind(st); st.write = ((chunk: unknown, ...a: unknown[]) => { printed += String(chunk); return (w as (...x: unknown[]) => boolean)(chunk, ...a); }) as typeof st.write; }

type Res = { status: number; body: any; requestId: string | null };
const call = async (base: string, method: string, path: string, o: { token?: string; actor?: string; body?: unknown; requestId?: string } = {}): Promise<Res> => {
  const headers: Record<string, string> = { "content-type": "application/json", "user-agent": "pf4s-check/1" };
  if (o.token) headers.authorization = `Bearer ${o.token}`;
  if (o.actor) headers["x-actor"] = o.actor;
  if (o.requestId) headers["x-request-id"] = o.requestId;
  const r = await fetch(`${base}${path}`, { method, headers, body: o.body === undefined ? undefined : JSON.stringify(o.body) });
  const text = await r.text();
  let body: any = text; try { body = JSON.parse(text); } catch { /* text */ }
  return { status: r.status, body, requestId: r.headers.get("x-request-id") };
};

// ------------------------------------------------------------------------------------------- the scratch database
execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", DB]); execFileSync(join(BIN, "createdb"), [...PG, DB]);
for (const d of readdirSync(MIG).filter((x) => /^\d{14}_/.test(x)).sort()) execFileSync(join(BIN, "psql"), [urlOf(DB), "-X", "-v", "ON_ERROR_STOP=1", "-q", "-f", join(MIG, d, "migration.sql")], { stdio: ["ignore", "ignore", "pipe"] });
process.env.DATABASE_URL = urlOf(DB);
for (const k of Object.keys(process.env)) if (/^PLATFORM_/.test(k)) delete process.env[k];
process.env.PLATFORM_ENVIRONMENT = "local";   // PF-24w: required, no default

const { ConfigReadGuard, Db } = await import("../api/src/core.ts");
const { loadPlatformConfig } = await import("../api/src/platform/config/settings.ts");
const { seedSampleFirms } = await import("../api/src/platform/seed-sample-firms.ts");
const { PlatformClock } = await import("../api/src/platform/identity/port.ts");
const { LocalIdentity } = await import("../api/src/platform/identity/local.ts");
const { CognitoIdentity } = await import("../api/src/platform/identity/cognito.ts");
const { IDENTITY_PORT, PlatformIdentity } = await import("../api/src/platform/identity/service.ts");
const { PlatformGuard } = await import("../api/src/platform/identity/guard.ts");
const { PlatformIdentityController } = await import("../api/src/platform/identity/routes.ts");
const { AnyStaff, PLATFORM_ACCESS } = await import("../api/src/platform/identity/keys.ts");
const { requestMiddleware } = await import("../api/src/platform/observability/hook.ts");
const { auditEvent } = await import("../api/src/platform/audit/audit-event.ts");
let trailDb: PrismaClient | undefined;   // AUD-3a's test route writes through it (set below)
const { SystemLocalIdentity, SYSTEM_LOCAL_ISSUER } = await import("../api/src/platform/system-identity/local.ts");
const { SYSTEM_IDENTITY_PORT, SystemIdentity, systemIdentityPortFromConfig } = await import("../api/src/platform/system-identity/service.ts");
const { SystemGuard, SystemPlaneWall, assertSystemRoutesDeclared } = await import("../api/src/platform/system-identity/guard.ts");
const { SystemIdentityController, SystemStaffController } = await import("../api/src/platform/system-identity/routes.ts");
const { SystemStaffAccess } = await import("../api/src/platform/system-identity/staff.ts");
const { lineText } = await import("../api/src/platform/system-identity/guard.ts");
const { AnySystemStaff, SystemKeys, SystemReason, SYSTEM_ACCESS, SYSTEM_ROLES } = await import("../api/src/platform/system-identity/keys.ts");
const feature = (await import("../api/src/features/platform-system-identity.ts")).default;
const firmFeature = (await import("../api/src/features/platform-identity.ts")).default;

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: urlOf(DB), options: "-c TimeZone=UTC" }) });

// A stand-in for every existing route (a configuration read, guarded by core.ts as before) and a firm front-office route.
@Controller("api/probe") class ProbeController { @Get() read() { return { ok: true }; } }
@Controller("api/front-office") class FirmProbeController { @Get("pf4s-probe") @AnyStaff("a test route of the firm plane") read() { return { ok: true }; } }
// Test-only system routes (the refund route the row names lives here, never in api/src).
let handled = 0;
@Controller("api/system/test") class TestSystemController {
  @Post("refunds/:id") @SystemKeys("system/billing:refund") refund(@Param("id") id: string) { handled++; return { refunded: id }; }
  @Post("nobody") @SystemKeys("system/test:nobody-holds-this") nobody() { handled++; return { ok: true }; }
  @Post("firms/:id/lock") @SystemKeys("system/firm:suspend") @SystemReason() lock(@Param("id") id: string) { handled++; return { locked: id }; }
  // AUD-3a: a test route that writes one line on a firm's own trail, as PF-25w's address change will (the actor word comes
  // from the request: the guard's req.systemStaff through hook.ts).
  @Post("firms/:id/trail") @SystemKeys("system/firm:address") async trail(@Param("id") id: string, @Body() b: { actor?: string }) {
    const actor = b?.actor ?? (await import("../api/src/platform/observability/log.ts")).requestScope.getStore()?.audit?.()?.actor ?? "none";
    await trailDb!.$transaction((tx) => auditEvent.record(tx as never, { firmId: id, actor, action: "platform.check.aud3a", entity: "platform_firm", entityKey: `aud3a-${id.slice(0, 8)}`, summary: "AUD-3a test line." }));
    return { ok: true };
  }
}
// Routes that must stop the start-up.
@Controller("api/system") class UndeclaredController { @Get("undeclared-thing") thing() { return 1; } }
@Controller("api/platform") class OutsideController { @Get("pf4s-outside") @AnySystemStaff("declared on the firm plane by mistake") thing() { return 1; } }
@Controller("api/system") class MixedController { @Get("pf4s-mixed") @AnySystemStaff("ours") @AnyStaff("and a firm's") thing() { return 1; } }
@Controller("api/system") class FirmKeyController { @Get("pf4s-firm-key") @SetMetadata(SYSTEM_ACCESS, { kind: "keys", keys: ["agent/staff:manage"] }) thing() { return 1; } }

const clock = new (class extends PlatformClock { t = Date.now(); override now() { return this.t; } })();
const FIRM_SIGNING = "pf4s-firm-standin-key-0123456789abcdef", SYSTEM_SIGNING = "pf4s-system-standin-key-0123456789abcd";
const firmLocal = new LocalIdentity(FIRM_SIGNING, () => clock.now());
const systemLocal = new SystemLocalIdentity(SYSTEM_SIGNING, () => clock.now());
/** A session of the system stand-in for one staff id, signed in now, with or without the second step. */
const issued = (staffId: string, secondStep: boolean) => systemLocal.issue(staffId, { authTimeMs: clock.now(), secondStep });

async function makeApp(o: { systemPort?: unknown; extra?: unknown[]; identity?: unknown } = {}) {
  const providers = [Db, { provide: APP_GUARD, useClass: ConfigReadGuard }, { provide: PlatformClock, useValue: clock }, { provide: IDENTITY_PORT, useValue: firmLocal }, PlatformIdentity, PlatformGuard, { provide: APP_GUARD, useExisting: PlatformGuard },
    { provide: SYSTEM_IDENTITY_PORT, useValue: o.systemPort ?? systemLocal }, o.identity ? { provide: SystemIdentity, useClass: o.identity } : SystemIdentity, SystemStaffAccess, SystemPlaneWall, SystemGuard, { provide: APP_GUARD, useExisting: SystemGuard }];
  @Module({ controllers: [ProbeController, FirmProbeController, PlatformIdentityController, SystemIdentityController, SystemStaffController, TestSystemController, ...(o.extra ?? [])] as never[], providers: providers as never[] }) class TestApp {}
  const app = await NestFactory.create(TestApp, { logger: false });
  app.use(requestMiddleware());   // PF-23's request scope (main.ts observe): the request id an audit line carries
  await app.listen(0, "127.0.0.1");
  return { app, base: `http://127.0.0.1:${(app.getHttpServer().address() as { port: number }).port}` };
}

const apps: { close(): Promise<void> }[] = [];
try {
  await seedSampleFirms(db);
  const firmStaff = (await db.platformStaff.findFirstOrThrow({ where: { actorId: "user-R" } })).id;
  const firmId = (await db.platformFirm.findUniqueOrThrow({ where: { key: "sample-firm" } })).id;
  // Our own staff for this check (Sample names; the first real Platform Owner is part 2's invite).
  const person = async (name: string, roles: string[], o: { status?: "ACTIVE" | "DEACTIVATED"; identitySubject?: string } = {}) =>
    (await db.platSystemStaff.create({ data: { email: `${name.toLowerCase().replace(/\s+/g, ".")}@expatready.example`, displayName: `Sample ${name}`, status: o.status ?? "ACTIVE", identitySubject: o.identitySubject, grants: { create: roles.map((roleCode) => ({ roleCode })) } } })).id;
  const OWNER = await person("Owner", ["platform-owner"]), ADMIN = await person("Admin", ["platform-admin"]), BILLING = await person("Billing", ["platform-billing-ops"]), SUPPORT = await person("Support", ["platform-support"]);
  const BOTH = await person("Support And Billing", ["platform-support", "platform-billing-ops"]), NOBODY = await person("No Role", []), GONE = await person("Deactivated", ["platform-owner"], { status: "DEACTIVATED" });
  const emailOf = async (id: string) => (await db.platSystemStaff.findUniqueOrThrow({ where: { id } })).email;

  const A = await makeApp(); apps.push(A.app);
  const signIn = async (id: string, secondStep: unknown = true) => call(A.base, "POST", "/api/system/session/local", { body: { email: await emailOf(id), secondStep } });
  const tokenOf = async (id: string) => { const r = await signIn(id); if (r.status !== 200) throw new Error(`sign-in ${id}: ${JSON.stringify(r.body)}`); return r.body.token as string; };
  const firmToken = (await call(A.base, "POST", "/api/platform/session/local", { body: { firmKey: "sample-firm", actorId: "user-R", secondStep: true } })).body.token as string;
  const owner = await tokenOf(OWNER), billing = await tokenOf(BILLING), support = await tokenOf(SUPPORT), admin = await tokenOf(ADMIN);
  const claimsOf = (t: string) => JSON.parse(Buffer.from(t.split(".")[1], "base64url").toString("utf8")) as Record<string, unknown>;
  const lines = () => Number(sql(`select count(*) from plat_system_audit`));
  const lastLine = () => JSON.parse(sql(`select row_to_json(a) from plat_system_audit a order by at desc, id desc limit 1`)) as Record<string, any>;
  const trail = () => Number(sql(`select count(*) from audit_event`));

  // ------------------------------------------------------------------------------------------------ start-up rules
  ok("PF-4s pass: the feature registers the guard (APP_GUARD), the wall and the routes, after PF-4's feature in file-name order",
    feature.controllers.includes(SystemIdentityController) && (feature.providers as unknown[]).some((p) => (p as { provide?: unknown }).provide === APP_GUARD) && (feature.providers as unknown[]).includes(SystemPlaneWall)
    && "platform-identity.ts" < "platform-system-identity.ts" && firmFeature.controllers.includes(PlatformIdentityController));
  ok("PF-4s DW3 fail (SA-7-14): a route under /api/system with no @SystemKeys stops the start-up, naming it (deny by default)",
    await throwsLike(async () => { const a = await makeApp({ extra: [UndeclaredController] }); apps.push(a.app); }, (e) => /UndeclaredController\.thing \(GET \/api\/system\/undeclared-thing\)/.test(String(e))));
  ok("PF-4s DW3 fail (SA-7-1): our own staff's access declared on a firm path stops the start-up, naming it",
    await throwsLike(async () => { const a = await makeApp({ extra: [OutsideController] }); apps.push(a.app); }, (e) => /only under \/api\/system.*OutsideController\.thing/.test(String(e))));
  ok("PF-4s DW3 fail (SA-6-4): a route under /api/system that also declares a firm's access stops the start-up",
    await throwsLike(async () => { const a = await makeApp({ extra: [MixedController] }); apps.push(a.app); }, (e) => /never also declares a firm's access.*MixedController\.thing/.test(String(e))) && Reflect.getMetadata(PLATFORM_ACCESS, MixedController.prototype.thing) !== undefined);
  ok("PF-4s DW3 fail (SA-6-4): a system route naming an agent/* key stops the start-up, and @SystemKeys refuses to declare one",
    await throwsLike(async () => { const a = await makeApp({ extra: [FirmKeyController] }); apps.push(a.app); }, (e) => /only system\/\* keys.*FirmKeyController\.thing/.test(String(e)))
    && await throwsLike(() => SystemKeys("agent/staff:manage"), (e) => /only system\/\* keys/.test(String(e))) && await throwsLike(() => SystemKeys(), (e) => /at least one key/.test(String(e))));
  ok("PF-4s DW3 pass: the rule accepts declared system/* routes", !(await throwsLike(() => assertSystemRoutesDeclared([{ name: "X.y", method: "GET", path: "/api/system/x", access: { kind: "keys", keys: ["system/firm:read"] }, firmAccess: false }]), () => true)));

  // ------------------------------------------------------------------------- DW1: the two planes never mix (SA-7-1)
  const me = await call(A.base, "GET", "/api/system/me", { token: owner });
  ok("PF-4s DW1 pass (SA-7-1): a system token on /api/system/me → 200 with the person, their roles and system/* keys",
    me.status === 200 && me.body.staffId === OWNER && me.body.name === "Sample Owner" && me.body.roles[0].code === "platform-owner" && me.body.roles[0].name === "Platform Owner" && me.body.keys.includes("system/firm:suspend") && me.body.keys.every((k: string) => k.startsWith("system/")), me);
  ok("PF-4s DW1 pass (SA-7-1): no firm id anywhere in the answer or in the token's claims", !/firm/i.test(JSON.stringify(Object.keys(me.body))) && !JSON.stringify(me.body).includes(firmId) && !Object.keys(claimsOf(owner)).some((k) => /firm/i.test(k)) && claimsOf(owner).plane === "system", { body: me.body, claims: claimsOf(owner) });
  const firmOnSystem = await call(A.base, "GET", "/api/system/me", { token: firmToken });
  ok("PF-4s DW1 fail (SA-7-1): a firm token on /api/system/me → 403 FIRM_SESSION_REFUSED", firmOnSystem.status === 403 && firmOnSystem.body.code === "FIRM_SESSION_REFUSED", firmOnSystem);
  const firmOnRefund = await call(A.base, "POST", "/api/system/test/refunds/r-1", { token: firmToken, body: {} });
  ok("PF-4s DW1 fail: a firm token on a keyed /api/system route → 403, and the handler never runs", firmOnRefund.status === 403 && handled === 0, firmOnRefund);
  const onPlatform = await call(A.base, "GET", "/api/platform/me", { token: owner }), onFrontOffice = await call(A.base, "GET", "/api/front-office/pf4s-probe", { token: owner });
  const wallRid = await call(A.base, "GET", "/api/platform/me", { token: owner, requestId: `pf4s-${process.pid}-wall` });
  ok("PF-4s DW1 pass (review m3): the wall's 403 carries the request id and leaves PF-23's request line", wallRid.status === 403 && wallRid.requestId === `pf4s-${process.pid}-wall` && printed.split("\n").some((l) => l.includes('"event":"request"') && l.includes(`pf4s-${process.pid}-wall`) && l.includes('"status":403')), wallRid);
  const wallLines = printed.split("\n").filter((l) => l.includes('"event":"system_session_elsewhere"'));
  ok("PF-4s DW1 pass (breaker m1): each wall refusal leaves one log line naming the staff member's id (it runs before PF-23's request lines)", wallLines.length === 3 && wallLines.every((l) => l.includes(OWNER) && !l.includes(owner)), wallLines);
  ok("PF-4s DW1 fail (SA-7-1, SA-6-4): a system token on /api/platform/me → 403 SYSTEM_SESSION_ELSEWHERE", onPlatform.status === 403 && onPlatform.body.code === "SYSTEM_SESSION_ELSEWHERE", onPlatform);
  ok("PF-4s DW1 fail: a system token on a front-office route → 403 SYSTEM_SESSION_ELSEWHERE", onFrontOffice.status === 403 && onFrontOffice.body.code === "SYSTEM_SESSION_ELSEWHERE", onFrontOffice);
  const onCase = await call(A.base, "GET", "/api/probe", { token: owner, actor: "user-A" }), onMixedCase = await call(A.base, "GET", "/API/Platform/Me", { token: owner });
  ok("PF-4s DW1 fail: a system token on a case-side route, and on a firm path in another letter case → 403", onCase.status === 403 && onCase.body.code === "SYSTEM_SESSION_ELSEWHERE" && onMixedCase.status === 403 && onMixedCase.body.code === "SYSTEM_SESSION_ELSEWHERE", { onCase, onMixedCase });
  const firmMe = await call(A.base, "GET", "/api/platform/me", { token: firmToken }), firmFo = await call(A.base, "GET", "/api/front-office/pf4s-probe", { token: firmToken });
  ok("PF-4s DW1 pass: the wall leaves a firm's own session alone (firm token on /api/platform/me and a front-office route → 200)", firmMe.status === 200 && firmMe.body.staffId === firmStaff && firmFo.status === 200, { firmMe, firmFo });
  const upper = await call(A.base, "GET", "/API/System/Me", { token: owner }), upperFirm = await call(A.base, "GET", "/API/System/Me", { token: firmToken }), upperNone = await call(A.base, "GET", "/API/SYSTEM/ME");
  // The guard's own match (no web catch-all in this app; in main.ts the web pages' case-sensitive catch-all answers an
// upper-case /API path first, with the web page and no data: PF-4pc's row, main.ts:244).
ok("PF-4s DW1 pass/fail (mixed-case path, the guard's match of its own): /API/System/Me reaches the guard as /api/system/me (system 200, firm 403, none 401 NOT_SIGNED_IN)",
    upper.status === 200 && upper.body.staffId === OWNER && upperFirm.status === 403 && upperFirm.body.code === "FIRM_SESSION_REFUSED" && upperNone.status === 401 && upperNone.body.code === "NOT_SIGNED_IN", { upper, upperFirm, upperNone });
  const none = await call(A.base, "GET", "/api/system/me"), junk = await call(A.base, "GET", "/api/system/me", { token: "not-a-token" }), header = await call(A.base, "GET", "/api/system/me", { actor: "user-A" });
  ok("PF-4s DW1 fail: no token, a token of nothing and the simulated-person header → 401 on /api/system/me", none.status === 401 && junk.status === 401 && header.status === 401 && header.body.code === "NOT_SIGNED_IN", { none, junk, header });

  // ------------------------------------------------------------ DW2: two-step, the stand-in's limits, separate keys
  const noStep = await signIn(OWNER, false), noStepField = await call(A.base, "POST", "/api/system/session/local", { body: { email: await emailOf(OWNER) } });
  ok("PF-4s DW2 fail (SA-7-2): a system sign-in without the second step is refused (401 TWO_STEP_REQUIRED, no token)", noStep.status === 401 && noStep.body.code === "TWO_STEP_REQUIRED" && !noStep.body.token && noStepField.status === 401 && noStepField.body.code === "TWO_STEP_REQUIRED", { noStep, noStepField });
  const oneStep = await call(A.base, "GET", "/api/system/me", { token: issued(OWNER, false) });
  ok("PF-4s DW2 fail (SA-7-2): a session whose sign-in skipped the second step is refused by the guard (401 TWO_STEP_REQUIRED)", oneStep.status === 401 && oneStep.body.code === "TWO_STEP_REQUIRED", oneStep);
  ok("PF-4s DW2 pass (SA-7-2): with the second step the sign-in gives a one-hour bearer session", (await signIn(OWNER)).body.tokenType === "Bearer" && (await signIn(OWNER)).body.expiresIn === 3600);
  const unknown = await call(A.base, "POST", "/api/system/session/local", { body: { email: "user-r@sample-firm.example", secondStep: true } }), extra = await call(A.base, "POST", "/api/system/session/local", { body: { email: await emailOf(OWNER), secondStep: true, firmKey: "sample-firm" } });
  ok("PF-4s DW2 fail (SA-7-2): a firm's staff email never signs in here (401 UNKNOWN_STAFF), and a firm key in the body is refused (422)", unknown.status === 401 && unknown.body.code === "UNKNOWN_STAFF" && extra.status === 422, { unknown, extra });
  const base = { PLATFORM_ENVIRONMENT: "local" };
  const refusedConfig = (env: Record<string, string>, like: RegExp) => throwsLike(() => loadPlatformConfig(env), (e) => like.test(String(e)));
  ok("PF-4s DW2 fail: the stand-in is refused outside local (PLATFORM_SYSTEM_IDENTITY=local in test and in production)",
    await refusedConfig({ PLATFORM_ENVIRONMENT: "test", PLATFORM_SYSTEM_IDENTITY: "local" }, /PLATFORM_SYSTEM_IDENTITY is set but not valid.*never runs in the test environment or production/)
    && await refusedConfig({ PLATFORM_ENVIRONMENT: "production", PLATFORM_SYSTEM_IDENTITY: "local" }, /PLATFORM_SYSTEM_IDENTITY is set but not valid/));
  ok("PF-4s DW2 pass: PLATFORM_SYSTEM_IDENTITY=local is accepted where the environment is local; unset means no sign-in for our staff",
    loadPlatformConfig({ ...base, PLATFORM_SYSTEM_IDENTITY: "local" }).systemIdentity.via === "local" && loadPlatformConfig(base).systemIdentity.via === "none");
  ok("PF-4s DW2 fail (separate secrets and pools): the system stand-in's key equal to the firm stand-in's, or one pool for both, stops the start-up, naming the setting and never its value",
    await refusedConfig({ ...base, PLATFORM_LOCAL_SECRET: FIRM_SIGNING, PLATFORM_SYSTEM_LOCAL_SECRET: FIRM_SIGNING }, /PLATFORM_SYSTEM_LOCAL_SECRET is set but not valid.*a key of its own/)
    && !(await refusedConfig({ ...base, PLATFORM_LOCAL_SECRET: FIRM_SIGNING, PLATFORM_SYSTEM_LOCAL_SECRET: FIRM_SIGNING }, new RegExp(FIRM_SIGNING)))
    && await refusedConfig({ ...base, PLATFORM_COGNITO_USER_POOL_ID: "ca-central-1_OnePool", PLATFORM_SYSTEM_COGNITO_USER_POOL_ID: "ca-central-1_OnePool" }, /PLATFORM_SYSTEM_COGNITO_USER_POOL_ID is set but not valid.*a pool of its own/)
    && loadPlatformConfig({ ...base, PLATFORM_LOCAL_SECRET: FIRM_SIGNING, PLATFORM_SYSTEM_LOCAL_SECRET: SYSTEM_SIGNING }).systemIdentity.localSecret !== null);
  ok("PF-4s DW2 fail (review m5): PLATFORM_SYSTEM_IDENTITY=cognito without its own pool and client stops the start-up, naming both; with them it loads",
    await refusedConfig({ ...base, PLATFORM_SYSTEM_IDENTITY: "cognito" }, /Missing required settings: PLATFORM_SYSTEM_COGNITO_USER_POOL_ID, PLATFORM_SYSTEM_COGNITO_CLIENT_ID/)
    && loadPlatformConfig({ ...base, PLATFORM_SYSTEM_IDENTITY: "cognito", PLATFORM_SYSTEM_COGNITO_USER_POOL_ID: "ca-central-1_Staff", PLATFORM_SYSTEM_COGNITO_CLIENT_ID: "staffclient" }).systemIdentity.via === "cognito");
  ok("PF-4s DW2 pass: the system stand-in's key is a secret setting (never printed, scrubbed from the environment)", String(loadPlatformConfig({ ...base, PLATFORM_SYSTEM_LOCAL_SECRET: SYSTEM_SIGNING }).systemIdentity.localSecret) === "[secret PLATFORM_SYSTEM_LOCAL_SECRET]");
  // A firm stand-in token (signed with the firm's key) against the system stand-in, even one built with the same key.
  const firmSigned = firmLocal.issue(OWNER, { authTimeMs: clock.now(), secondStep: true });
  const sign = (secret: string, claims: Record<string, unknown>) => { const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64url"), body = `${b64({ alg: "HS256", typ: "JWT" })}.${b64(claims)}`; return `${body}.${createHmac("sha256", Buffer.from(secret, "utf8")).update(body).digest("base64url")}`; };
  const nowS = clock.now() / 1000, good = { iss: SYSTEM_LOCAL_ISSUER, plane: "system", token_use: "access", sub: OWNER, iat: nowS, exp: nowS + 600, auth_time: nowS, amr: ["pwd", "otp"] };
  ok("PF-4s DW2 fail (separate secrets): a firm stand-in token naming one of our staff ids is refused by the system stand-in, even one given the firm's own key (issuer and plane)",
    await throwsLike(() => systemLocal.verify(firmSigned), (e) => /not one this server issued for ExpatReady staff/.test(String(e))) && await throwsLike(() => new SystemLocalIdentity(FIRM_SIGNING, () => clock.now()).verify(firmSigned), (e) => /not an ExpatReady staff sign-in/.test(String(e))));
  const forged = await call(A.base, "GET", "/api/system/me", { token: sign(FIRM_SIGNING, good) });
  ok("PF-4s DW2 fail (breaker): a token with system claims signed with the firm's key → 401 on /api/system/me", forged.status === 401, forged);
  ok("PF-4s DW2 pass: the same claims signed with the system key are a session", (await call(A.base, "GET", "/api/system/me", { token: sign(SYSTEM_SIGNING, good) })).status === 200);
  const withFirm = await call(A.base, "GET", "/api/system/me", { token: sign(SYSTEM_SIGNING, { ...good, firm_id: firmId }) }), withFirmCamel = await call(A.base, "GET", "/api/system/me", { token: sign(SYSTEM_SIGNING, { ...good, "custom:firmId": firmId }) });
  ok("PF-4s DW2 fail (SA-7-1, breaker): a system-signed token that carries a firm id claim is refused (401)", withFirm.status === 401 && /never names a firm/.test(withFirm.body.detail) && withFirmCamel.status === 401, { withFirm, withFirmCamel });
  clock.t += 3601_000;
  const expired = await call(A.base, "GET", "/api/system/me", { token: owner });
  clock.t -= 3601_000;
  ok("PF-4s DW2 fail: a session past its hour is refused (401 TOKEN_EXPIRED)", expired.status === 401 && expired.body.code === "TOKEN_EXPIRED", expired);
  // PF-0c: IdentityPort's shared contract on the system stand-in.
  const KEY0C = "pf4s-contract-signing-key-0123456789ab";
  await runContract(identityPortContract, "SystemLocalIdentity", () => { const id = new SystemLocalIdentity(KEY0C, () => Date.now()); return { identity: id, who: { staffId: OWNER }, token: ({ secondStep }: { secondStep: boolean }) => id.issue(OWNER, { authTimeMs: Date.now() - 60_000, secondStep }), expiredToken: () => new SystemLocalIdentity(KEY0C, () => Date.now() - 2 * 3600_000).issue(OWNER, { authTimeMs: Date.now() - 2 * 3600_000 - 60_000, secondStep: true }) }; }, ok);
  // No sign-in configured (PLATFORM_SYSTEM_IDENTITY unset): every /api/system route 401s and the door says it is off.
  const N = await makeApp({ systemPort: systemIdentityPortFromConfig(clock) }); apps.push(N.app);
  const offMe = await call(N.base, "GET", "/api/system/me", { token: owner }), offDoor = await call(N.base, "POST", "/api/system/session/local", { body: { email: await emailOf(OWNER), secondStep: true } });
  ok("PF-4s DW2 fail: with PLATFORM_SYSTEM_IDENTITY unset every session is refused (401 SIGN_IN_NOT_SET_UP) and the stand-in's door is off (404 STAND_IN_OFF)", offMe.status === 401 && offMe.body.code === "SIGN_IN_NOT_SET_UP" && offDoor.status === 404 && offDoor.body.code === "STAND_IN_OFF", { offMe, offDoor });
  // The Cognito adapter on our staff's own pool (a test key set: never the network). Not a proof of the real pool (AWS).
  const POOL = "ca-central-1_PF4sStaff", CLIENT = "pf4sstaffclient", FIRM_POOL = "ca-central-1_PF4sFirms", SUB = randomUUID(), KID = "pf4s-kid";
  const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const cognito = new CognitoIdentity({ userPoolId: POOL, clientId: CLIENT, mfaRequired: true });
  cognito.cacheJwks({ keys: [{ ...(publicKey.export({ format: "jwk" }) as Record<string, string>), kid: KID, alg: "RS256", use: "sig" }] } as never);
  const jwt = (pool: string) => { const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64url"), t = Math.floor(Date.now() / 1000), body = `${b64({ alg: "RS256", kid: KID, typ: "JWT" })}.${b64({ iss: `https://cognito-idp.ca-central-1.amazonaws.com/${pool}`, token_use: "access", client_id: CLIENT, sub: SUB, auth_time: t - 30, iat: t - 30, exp: t + 600 })}`; return `${body}.${createSign("RSA-SHA256").update(body).sign(privateKey).toString("base64url")}`; };
  const COGNITO_STAFF = await person("Cognito Support", ["platform-support"], { identitySubject: SUB });
  const C = await makeApp({ systemPort: cognito }); apps.push(C.app);
  const cMe = await call(C.base, "GET", "/api/system/me", { token: jwt(POOL) }), cOther = await call(C.base, "GET", "/api/system/me", { token: jwt(FIRM_POOL) }), cDoor = await call(C.base, "POST", "/api/system/session/local", { body: { email: await emailOf(OWNER), secondStep: true } });
  ok("PF-4s DW2 pass (Cognito adapter, test keys): a token of our staff's own pool is the person its subject names", cMe.status === 200 && cMe.body.staffId === COGNITO_STAFF && cMe.body.roles[0].code === "platform-support", cMe);
  ok("PF-4s DW2 fail (Cognito adapter, test keys): a token of another pool (the firm staff's) is refused (401), and the stand-in's door is off (404)", cOther.status === 401 && /another sign-in service/.test(cOther.body.detail) && cDoor.status === 404, { cOther, cDoor });

  // --------------------------------------------------------- DW3: permissions are the roles' system/* keys, on the server
  handled = 0;
  const refundSupport = await call(A.base, "POST", "/api/system/test/refunds/r-1", { token: support, body: {} });
  ok("PF-4s DW3 fail (SA-7-11, SA-7-14): a Support person (no system/billing:refund) → 403 MISSING_PERMISSION naming the key; the handler never runs", refundSupport.status === 403 && refundSupport.body.code === "MISSING_PERMISSION" && /system\/billing:refund/.test(refundSupport.body.detail) && handled === 0, refundSupport);
  const refundBilling = await call(A.base, "POST", "/api/system/test/refunds/r-2", { token: billing, body: {} });
  ok("PF-4s DW3 pass (SA-7-11; Appendix A ticks Billing on the refunds row): a Billing person → 200", refundBilling.status === 201 && refundBilling.body.refunded === "r-2" && handled === 1, refundBilling);
  const both = await call(A.base, "GET", "/api/system/me", { token: await tokenOf(BOTH) });
  ok("PF-4s DW3 pass (SA-7-11): a person's keys are the sum of their roles' keys (Support + Billing)", both.status === 200 && both.body.roles.length === 2 && both.body.keys.includes("system/billing:refund") && both.body.keys.includes("system/firm:read") && !both.body.keys.includes("system/firm:suspend"), both);
  const nobodyKey = await Promise.all([owner, admin, billing, support].map((token) => call(A.base, "POST", "/api/system/test/nobody", { token, body: {} })));
  ok("PF-4s DW3 fail: a key on no role → 403 for everyone, the Platform Owner included", nobodyKey.every((r) => r.status === 403 && r.body.code === "MISSING_PERMISSION"), nobodyKey.map((r) => r.status));
  const noRole = await call(A.base, "POST", "/api/system/test/refunds/r-3", { token: await tokenOf(NOBODY), body: {} }), noRoleMe = await call(A.base, "GET", "/api/system/me", { token: await tokenOf(NOBODY) });
  ok("PF-4s DW3 fail (SA-7-11: everything else is denied): a staff member with no role holds no key (403), yet can read who they are", noRole.status === 403 && noRoleMe.status === 200 && noRoleMe.body.keys.length === 0, { noRole, noRoleMe });
  const goneSignIn = await signIn(GONE), goneCall = await call(A.base, "GET", "/api/system/me", { token: issued(GONE, true) });
  ok("PF-4s DW3 fail: a deactivated staff member cannot sign in, and a session of theirs is refused (401 STAFF_NOT_ACTIVE)", goneSignIn.status === 401 && goneSignIn.body.code === "STAFF_NOT_ACTIVE" && goneCall.status === 401 && goneCall.body.code === "STAFF_NOT_ACTIVE", { goneSignIn, goneCall });
  const ghost = await call(A.base, "GET", "/api/system/me", { token: issued(randomUUID(), true) }), firmIdAsOurs = await call(A.base, "GET", "/api/system/me", { token: issued(firmStaff, true) });
  ok("PF-4s DW3 fail: a system session naming nobody, or a firm's staff id, is refused (401 UNKNOWN_STAFF)", ghost.status === 401 && ghost.body.code === "UNKNOWN_STAFF" && firmIdAsOurs.status === 401 && firmIdAsOurs.body.code === "UNKNOWN_STAFF", { ghost, firmIdAsOurs });
  // A role that ends takes its keys with it at once; sessions ended (part 2's deactivation) refuse the older session.
  const supportToken2 = await tokenOf(BOTH);
  await db.platSystemRoleGrant.updateMany({ where: { staffId: BOTH, roleCode: "platform-billing-ops" }, data: { endedAt: new Date() } });
  const afterEnd = await call(A.base, "POST", "/api/system/test/refunds/r-4", { token: supportToken2, body: {} });
  ok("PF-4s DW3 fail: a role that has ended gives no key on the very next call (403)", afterEnd.status === 403 && afterEnd.body.code === "MISSING_PERMISSION", afterEnd);
  await db.platSystemStaff.update({ where: { id: BOTH }, data: { sessionsEndedAt: new Date(clock.now() + 1) } });
  const ended = await call(A.base, "GET", "/api/system/me", { token: supportToken2 });
  clock.t += 5;
  const fresh = await call(A.base, "GET", "/api/system/me", { token: await tokenOf(BOTH) });
  ok("PF-4s DW3 fail/pass: a session that started before the person's sessions were ended is refused (401 SESSION_REVOKED); a new sign-in works", ended.status === 401 && ended.body.code === "SESSION_REVOKED" && fresh.status === 200, { ended, fresh });

  // --------------------------------------------------------------- DW4: the six roles and the seed match Appendix A
  const roles = sql(`select code || '=' || display_name from plat_system_role order by code`).split("\n").sort();
  ok("PF-4s DW4 pass (SA7-D8): the six roles exist with SA7-D8's codes and final display names", JSON.stringify(roles) === JSON.stringify(Object.entries(SYSTEM_ROLES).map(([c, n]) => `${c}=${n}`).sort()) && roles.length === 6
    && roles.includes("platform-billing-ops=Billing") && roles.includes("platform-content-publisher=Content publisher") && roles.includes("platform-admin=Admin"), roles);
  ok("PF-4s DW4 fail (SA7-D8): a seventh role is refused by the database", refusedBySql(`insert into plat_system_role (code, display_name) values ('platform-engineer', 'Platform engineer')`, /plat_system_role_code_six/));
  // Appendix A (SA-07 v2.17), the rows the seeded keys map to: Own · Adm · Sup · Bil · Con · Aud.
  const Own = "platform-owner", Adm = "platform-admin", Sup = "platform-support", Bil = "platform-billing-ops", Aud = "platform-auditor";
  const APPENDIX_A: [key: string, row: string, roles: string[]][] = [
    ["system/platform-user:list", "Staff list and detail", [Own, Adm, Aud]],
    ["system/platform-user:show", "Staff list and detail", [Own, Adm, Aud]],
    ["system/platform-user:manage", "Manage staff — invite, give / remove roles (not Owner), countries, reactivate, Reset MFA", [Own]],
    ["system/platform-user:remove", "Deactivate · require a password change · end another person's session", [Own, Adm]],
    ["system/firm:read", "Firm list and detail (read-only)", [Own, Adm, Sup, Bil, Aud]],
    ["system/signup-link:manage", "Create firms · sign-up links (create, revoke, with approved discount) · edit … web address", [Own, Adm]],
    ["system/firm:address", "Create firms · sign-up links … · edit contact, address, billing email, web address", [Own, Adm]],
    ["system/firm:suspend", "Apply and lift a security lock (SA7-D53)", [Own]],
    ["system/firm:reinstate", "Apply and lift a security lock (SA7-D53)", [Own]],
    ["system/billing:manage", "For a firm: change plan or billing period, cancel / undo, apply or remove an approved discount (SA7-D50)", [Own, Bil]],
    ["system/billing:refund", "Approved-discount list · refunds · monthly written-off report", [Own, Bil]],
    // PF-21b part 2's migration (P-601 (1)): "Place and release legal holds (system/compliance:legal-hold — G-Q5)" — Own (SA7-D74 (a)).
    ["system/compliance:legal-hold", "Place and release legal holds", [Own]],
    // PF-21c's migration (P-601 (1)): "ExpatReady's data-incident (breach) register — Owner manages, Auditor read-only" (SA7-D74 (b)).
    ["system/breach:manage", "ExpatReady's data-incident (breach) register", [Own]],
    ["system/breach:read", "ExpatReady's data-incident (breach) register", [Own, Aud]],
    // PF-21b part 3 (P-601 (1)): no Appendix A row; SA-11 v2.16 line 778 "Manage the register of requests made to ExpatReady" — Own, Sample (brief PF-21b).
    ["system/compliance:dsr-manage", "Manage the register of requests made to ExpatReady (SA-11, Sample)", [Own]],
    // PF-17 part 2's migration (Lead 1's ruling on #3155; SA-10 §10, SA10-D8): no Appendix A row yet, Sample (Unconfirmed: SA10-X3 pending).
    ["system/support:list", "(SA10-X3 pending) See the support queue", [Own, Adm, Sup, Aud]],
    ["system/support:manage", "(SA10-X3 pending) Work the support queue", [Own, Sup]],
    // AUD-3 part 2's migration (20261124170000_aud3_audit_log_keys; SA-11 §10, BACKLOG AUD-3 (2)): Sample role mapping,
    // Unconfirmed against SA-07 Appendix A: list for the Owner and the read-only Auditor, export for the Owner only.
    ["system/audit-log:list", "(Sample, Unconfirmed against Appendix A) Read a firm's access report", [Own, Aud]],
    ["system/audit:export", "(Sample, Unconfirmed against Appendix A) Export a firm's access report as CSV", [Own]],
    // AUD-3b part 1's migration (20261125160500_shared__aud3b_support_session): "Start a support session (read-only unless the firm allowed changes)" — Own, Sup.
    ["system/firm:impersonate", "Start a support session (read-only unless the firm allowed changes)", [Own, Sup]],
  ];
  const seeded = new Map(sql(`select permission_key || '=' || string_agg(role_code, ',' order by role_code) from plat_system_role_permission group by permission_key`).split("\n").map((l) => l.split("=") as [string, string]));
  const wrong = APPENDIX_A.filter(([key, , r]) => seeded.get(key) !== [...r].sort().join(","));
  ok("PF-4s DW4 pass (Appendix A): each seeded key's roles are exactly its Appendix A row's ticks, and nothing else is seeded", wrong.length === 0 && seeded.size === APPENDIX_A.length, { wrong, seeded: [...seeded] });
  ok("PF-4s DW4 fail (SA7-D5): Admin does not hold system/platform-user:manage; only the Platform Owner holds the lock keys; a key with no Appendix A row (system/support:reply) is not seeded",
    !seeded.get("system/platform-user:manage")!.includes(Adm) && seeded.get("system/firm:suspend") === Own && seeded.get("system/firm:reinstate") === Own && !seeded.has("system/support:reply") && !seeded.has("system/security:lock"));
  const adminMe = await call(A.base, "GET", "/api/system/me", { token: admin });
  ok("PF-4s DW4 fail (SA7-D5), through the door: the Admin's own keys carry no system/platform-user:manage", adminMe.status === 200 && !adminMe.body.keys.includes("system/platform-user:manage") && adminMe.body.keys.includes("system/platform-user:remove"), adminMe);
  ok("PF-4s DW4 fail (SA-6-4): a role can never be given an agent/* key (refused by the database)", refusedBySql(`insert into plat_system_role_permission (role_code, permission_key) values ('platform-owner', 'agent/staff:manage')`, /plat_system_role_permission_system_key/));

  // ------------------------------------------------------- DW5: one audit line per call (SA-7-3, SA-7-20), none on a firm's trail
  const trail0 = trail();
  let n = lines();
  const rid = `pf4s-${process.pid}-allowed`, allowed = await call(A.base, "POST", "/api/system/test/refunds/r-77", { token: billing, body: {}, requestId: rid });
  const lineA = lastLine();
  ok("PF-4s DW5 pass (SA-7-3, SA-7-20): an allowed call writes exactly one line naming expatready_staff, the person's id and name, the route, what it affected and the request id",
    allowed.status === 201 && lines() === n + 1 && lineA.actor_kind === "expatready_staff" && lineA.staff_id === BILLING && lineA.staff_name === "Sample Billing" && lineA.method === "POST" && lineA.route === "/api/system/test/refunds/:id"
    && lineA.target.id === "r-77" && lineA.outcome === "ALLOWED" && lineA.code === null && lineA.request_id === rid && allowed.requestId === rid && lineA.device === "pf4s-check/1", lineA);
  n = lines();
  const rid2 = `pf4s-${process.pid}-refused`, refused = await call(A.base, "POST", "/api/system/test/refunds/r-78", { token: support, body: {}, requestId: rid2 });
  const lineR = lastLine();
  ok("PF-4s DW5 pass: a refused call (403) also writes exactly one line, with the refusal's code", refused.status === 403 && lines() === n + 1 && lineR.outcome === "REFUSED" && lineR.code === "MISSING_PERMISSION" && lineR.staff_id === SUPPORT && lineR.staff_name === "Sample Support" && lineR.target.id === "r-78" && lineR.request_id === rid2, lineR);
  n = lines();
  const meLine = await call(A.base, "GET", "/api/system/me", { token: owner });
  ok("PF-4s DW5 pass: a read (who am I) writes exactly one line too, with a request id of its own when the caller sends none", meLine.status === 200 && lines() === n + 1 && lastLine().route === "/api/system/me" && lastLine().request_id === meLine.requestId && !!meLine.requestId, lastLine());
  n = lines();
  const doorLine = await signIn(ADMIN);
  ok("PF-4s DW5 pass: a sign-in writes exactly one line naming who signed in", doorLine.status === 200 && lines() === n + 1 && lastLine().route === "/api/system/session/local" && lastLine().staff_id === ADMIN, lastLine());
  // A route that names a reason requires one (the lock route here is test-only; PF-27 builds the real one).
  n = lines(); handled = 0;
  const noReason = await call(A.base, "POST", `/api/system/test/firms/${firmId}/lock`, { token: owner, body: {} }), blank = await call(A.base, "POST", `/api/system/test/firms/${firmId}/lock`, { token: owner, body: { reason: "   " } });
  ok("PF-4s DW5 fail: a route that names a reason refuses a call without one (422 REASON_REQUIRED naming reason; R1.10 A4), the handler never runs, and each refusal is one line", noReason.status === 422 && noReason.body.code === "REASON_REQUIRED" && !!noReason.body.fields?.reason && blank.status === 422 && handled === 0 && lines() === n + 2 && lastLine().code === "REASON_REQUIRED", { noReason, blank });
  n = lines();
  const withReason = await call(A.base, "POST", `/api/system/test/firms/${firmId}/lock`, { token: owner, body: { reason: "  A report of a stolen Owner account  " } });
  ok("PF-4s DW5 pass: with a reason the call goes through and its one line carries the reason and the firm it affected", withReason.status === 201 && handled === 1 && lines() === n + 1 && lastLine().reason === "A report of a stolen Owner account" && lastLine().target.id === firmId && lastLine().outcome === "ALLOWED", lastLine());
  n = lines(); handled = 0;
  const invisible = await call(A.base, "POST", `/api/system/test/firms/${firmId}/lock`, { token: owner, body: { reason: "\u200b\u202e" } });
  ok("PF-4s DW5 fail (breaker m4): a reason of invisible characters only is no reason (422 REASON_REQUIRED naming reason; R1.10 A4), one line", invisible.status === 422 && invisible.body.code === "REASON_REQUIRED" && !!invisible.body.fields?.reason && handled === 0 && lines() === n + 1, invisible);
  n = lines();
  const nul = await call(A.base, "POST", "/api/system/test/refunds/a%00b", { token: support, body: {} }), nulReason = await call(A.base, "POST", `/api/system/test/firms/${firmId}/lock`, { token: owner, body: { reason: "stolen\u0000 account" } });
  ok("PF-4s DW5 fail (breaker m2): a NUL in a path parameter or a reason still leaves its one line (cleaned), the refusal stays a 403, the call with a reason goes through",
    nul.status === 403 && nulReason.status === 201 && lines() === n + 2 && lastLine().reason === "stolen account" && !sql(`select target::text from plat_system_audit where code = 'MISSING_PERMISSION' order by at desc limit 1`).includes("\\u0000"), { nul, nulReason, line: lastLine() });
  n = lines();
  const adminLock = await call(A.base, "POST", `/api/system/test/firms/${firmId}/lock`, { token: admin, body: { reason: "trying" } });
  ok("PF-4s DW5 fail (SA7-D53): an Admin cannot apply a security lock (403), and that refusal is one line", adminLock.status === 403 && lines() === n + 1 && lastLine().code === "MISSING_PERMISSION" && lastLine().staff_id === ADMIN, adminLock);
  n = lines();
  await call(A.base, "GET", "/api/system/me"); await call(A.base, "GET", "/api/system/me", { token: firmToken }); await call(A.base, "GET", "/api/platform/me", { token: owner });
  await call(A.base, "POST", "/api/system/session/local", { body: { email: "nobody@expatready.example", secondStep: true } }); await call(A.base, "GET", "/api/system/me", { token: issued(randomUUID(), true) });
  ok("PF-4s DW5 (stated limit): a call that names none of our staff (no session, a firm's session, an unknown email or subject) writes no staff line: there is no person to name", lines() === n);
  // Review M2: a refusal of a session or sign-in that names one of our staff writes its one REFUSED line, with the code.
  const refusedLine = async (what: string, f: () => Promise<Res>, who: string, code: string) => {
    const before = lines(), r = await f(), l = lastLine();
    ok(`PF-4s DW5 fail (review M2): ${what} → 401 ${code}, and exactly one REFUSED line naming the person`, r.status === 401 && r.body.code === code && lines() === before + 1 && l.outcome === "REFUSED" && l.code === code && l.staff_id === who && !!l.request_id, { r, l });
  };
  await refusedLine("a session whose sign-in skipped the second step", () => call(A.base, "GET", "/api/system/me", { token: issued(OWNER, false) }), OWNER, "TWO_STEP_REQUIRED");
  await refusedLine("a deactivated person's session", () => call(A.base, "GET", "/api/system/me", { token: issued(GONE, true) }), GONE, "STAFF_NOT_ACTIVE");
  await refusedLine("a session from before the person's sessions were ended (a replayed token)", () => call(A.base, "POST", "/api/system/test/refunds/r-5", { token: supportToken2, body: {} }), BOTH, "SESSION_REVOKED");
  await refusedLine("a deactivated person's sign-in", () => signIn(GONE), GONE, "STAFF_NOT_ACTIVE");
  await refusedLine("a known person's sign-in without the second step", () => signIn(OWNER, false), OWNER, "TWO_STEP_REQUIRED");
  ok("PF-4s DW5 fail: a firm audit list never shows these lines (none of them is on the one trail, and the staff table has no firm column)", trail() === trail0
    && sql(`select count(*) from information_schema.columns where table_name like 'plat_system_%' and column_name ~* 'firm'`) === "0" && sql(`select count(*) from audit_event where actor like '%' || '${OWNER}' || '%' or actor like '%' || '${BILLING}' || '%'`) === "0");
  ok("PF-4s DW5 fail (SA-7-20): a line is never changed or removed (UPDATE, DELETE and TRUNCATE refused by the database)",
    refusedBySql(`update plat_system_audit set staff_name = 'x'`, /plat_system_audit_insert_only/) && refusedBySql(`delete from plat_system_audit`, /plat_system_audit_insert_only/) && refusedBySql(`truncate plat_system_audit`, /plat_system_audit_insert_only/)
    && refusedBySql(`insert into plat_system_audit (id, actor_kind, staff_id, staff_name, method, route, target, outcome, request_id) values (gen_random_uuid(), 'firm_staff', '${OWNER}', 'x', 'GET', '/x', '{}', 'ALLOWED', 'r')`, /plat_system_audit_actor_kind/));
  // Fail-closed: when the line cannot be written, the call does not happen.
  class NoAudit extends SystemIdentity { override async audit(): Promise<void> { throw new Error("pf4s check: the audit line cannot be written"); } }
  const quiet = console.error; console.error = () => undefined;
  const F = await makeApp({ identity: NoAudit }); apps.push(F.app);
  handled = 0;
  const closed = await call(F.base, "POST", "/api/system/test/refunds/r-99", { token: billing, body: {} });
  console.error = quiet;
  ok("PF-4s DW5 fail (fail-closed): when the audit line cannot be written the call is refused (500) and the handler never runs", closed.status === 500 && handled === 0, closed);
  // The database's own wall (SA-7-1): a session acting for a firm reads and writes nothing of our staff.
  const asApp = (firm: string | null, q: string) => sql(`begin; select set_config('app.firm_id', '${firm ?? ""}', true); ${q}; commit`, "xr_app").split("\n").pop();
  ok("PF-4s DW1 fail (database wall): the app's role acting for a firm sees no staff, role, key or audit row of ours; with no firm it sees them",
    asApp(firmId, `select count(*) from plat_system_staff`) === "0" && asApp(firmId, `select count(*) from plat_system_role_permission`) === "0" && asApp(firmId, `select count(*) from plat_system_audit`) === "0"
    && Number(asApp(null, `select count(*) from plat_system_staff`)) >= 7 && Number(asApp(null, `select count(*) from plat_system_role_permission`)) > 0
    && refusedBySql(`begin; select set_config('app.firm_id', '${firmId}', true); insert into plat_system_role_grant (id, staff_id, role_code) values (gen_random_uuid(), '${NOBODY}', 'platform-owner'); commit`, /row-level security/, "xr_app"));
  ok("PF-4s DW4 fail (breaker m3; SA7-D2): the app's role, even acting for no firm, cannot change a role or its keys (a release does), nor write a line for a staff member who does not exist",
    refusedBySql(`begin; select set_config('app.firm_id', '', true); insert into plat_system_role_permission (role_code, permission_key) values ('platform-support', 'system/platform-user:manage'); commit`, /permission denied/, "xr_app")
    && refusedBySql(`begin; select set_config('app.firm_id', '', true); update plat_system_role set display_name = 'Boss'; commit`, /permission denied/, "xr_app")
    && refusedBySql(`insert into plat_system_audit (id, staff_id, staff_name, method, route, target, outcome, request_id) values (gen_random_uuid(), gen_random_uuid(), 'x', 'GET', '/x', '{}', 'ALLOWED', 'r')`, /plat_system_audit_staff_id_fkey/));
  ok("PF-4s DW3 fail (SA7-D58): a staff member is never deleted, and holds a role at most once at a time",
    refusedBySql(`delete from plat_system_staff where id = '${NOBODY}'`, /plat_system_staff_kept/) && refusedBySql(`insert into plat_system_role_grant (id, staff_id, role_code) values (gen_random_uuid(), '${OWNER}', 'platform-owner')`, /plat_system_role_grant_open_once/));


  // ------------------------------------------------------------- DW6, DW7 (part 2): step-up and staff access
  const P2 = "/api/system/staff";
  const one = async (f: () => Promise<Res>) => { const before = lines(); const r = await f(); return { r, added: lines() - before, line: lastLine() }; };
  const signedNow = async (id: string) => { clock.t = Math.ceil(clock.t / 1000) * 1000 + 1000; return tokenOf(id); };   // a sign-in on a whole second
  const rolesNow = async (id: string) => (await db.platSystemRoleGrant.findMany({ where: { staffId: id, endedAt: null }, select: { roleCode: true } })).map((g) => g.roleCode).sort();
  const TSUP = await person("Target Support", ["platform-support"]), TSUP2 = await person("Target Support Two", ["platform-support"]);

  let o = await signedNow(OWNER); clock.t += 6 * 60_000;
  let x = await one(() => call(A.base, "PUT", `${P2}/${TSUP}/roles`, { token: o, body: { roles: ["platform-support", "platform-auditor"] } }));
  ok("PF-4s DW6 fail (SA-7-10): a role change 6 minutes after sign-in is 401 STEP_UP_REQUIRED, one REFUSED line, nothing changed",
    x.r.status === 401 && x.r.body.code === "STEP_UP_REQUIRED" && x.added === 1 && x.line.outcome === "REFUSED" && x.line.code === "STEP_UP_REQUIRED" && (await rolesNow(TSUP)).join() === "platform-support", x);
  o = await signedNow(OWNER); clock.t += 5 * 60_000;
  x = await one(() => call(A.base, "PUT", `${P2}/${TSUP}/roles`, { token: o, body: { roles: ["platform-support", "platform-auditor"] } }));
  ok("PF-4s DW6 pass (SA-7-10, SA-7-12; breaker: exactly 5 minutes): a role change exactly 5 minutes after sign-in is 200, one ALLOWED line with before and after",
    x.r.status === 200 && x.added === 1 && x.line.outcome === "ALLOWED" && x.line.route === "/api/system/staff/:id/roles" && JSON.stringify(x.line.target.before) === '{"roles":["platform-support"]}' && JSON.stringify(x.line.target.after) === '{"roles":["platform-auditor","platform-support"]}' && (await rolesNow(TSUP)).join() === "platform-auditor,platform-support", x);
  const sup = await signedNow(SUPPORT); clock.t += 6 * 60_000;
  x = await one(() => call(A.base, "PUT", `${P2}/${TSUP}/roles`, { token: sup, body: { roles: [] } }));
  ok("PF-4s DW6 order: missing keys answer before step-up (403 MISSING_PERMISSION, not 401), one line", x.r.status === 403 && x.r.body.code === "MISSING_PERMISSION" && x.added === 1, x);
  o = await signedNow(OWNER);
  x = await one(() => call(A.base, "POST", `${P2}/${OWNER}/reset-mfa`, { token: o, body: { reason: "lost phone", verified: true } }));
  ok("PF-4s DW6 fail (SA-7-31): Reset MFA on oneself is 403 OWN_ACCOUNT, one REFUSED line", x.r.status === 403 && x.r.body.code === "OWN_ACCOUNT" && x.added === 1 && x.line.code === "OWN_ACCOUNT", x);
  x = await one(() => call(A.base, "POST", `${P2}/${TSUP}/reset-mfa`, { token: o, body: { verified: true } }));
  ok("PF-4s DW6 fail (SA-7-31): Reset MFA without a reason is 422 REASON_REQUIRED naming reason (R1.10 A4), one line", x.r.status === 422 && x.r.body.code === "REASON_REQUIRED" && !!x.r.body.fields?.reason && x.added === 1, x);
  x = await one(() => call(A.base, "POST", `${P2}/${TSUP}/reset-mfa`, { token: o, body: { reason: "lost phone" } }));
  ok("PF-4s DW6 fail (SA7-D21): Reset MFA without the verified flag is 400 IDENTITY_NOT_VERIFIED, one line", x.r.status === 400 && x.r.body.code === "IDENTITY_NOT_VERIFIED" && x.added === 1 && x.line.code === "IDENTITY_NOT_VERIFIED", x);
  const tsupToken = await tokenOf(TSUP); clock.t += 1000;
  x = await one(() => call(A.base, "POST", `${P2}/${TSUP}/reset-mfa`, { token: o, body: { reason: "lost phone", verified: true } }));
  const afterReset = await call(A.base, "GET", "/api/system/me", { token: tsupToken });
  ok("PF-4s DW6 pass (SA-7-31): Reset MFA by an Owner is 200 with its reason on the line, and the person's session ends at once",
    x.r.status === 200 && x.added === 1 && x.line.reason === "lost phone" && afterReset.status === 401 && afterReset.body.code === "SESSION_REVOKED", { x, afterReset });

  let a = await signedNow(ADMIN); const tsup2Token = await tokenOf(TSUP2); clock.t += 1000;
  x = await one(() => call(A.base, "POST", `${P2}/${TSUP2}/deactivate`, { token: a, body: { reason: "left the company" } }));
  const gone = await call(A.base, "GET", "/api/system/me", { token: tsup2Token }), row = await db.platSystemStaff.findUniqueOrThrow({ where: { id: TSUP2 } });
  ok("PF-4s DW7 pass (SA-7-22, SA7-D5): an Admin deactivates Support (200, one line with before and after); that person's next call is 401 and their sessions are ended",
    x.r.status === 200 && x.added === 1 && x.line.target.after?.status === "DEACTIVATED" && gone.status === 401 && row.status === "DEACTIVATED" && !!row.sessionsEndedAt, { x, gone });
  x = await one(() => call(A.base, "POST", `${P2}/${OWNER}/deactivate`, { token: a, body: { reason: "test" } }));
  ok("PF-4s DW7 fail (SA7-D5): an Admin deactivating an Owner is 403 PRIVILEGED_TARGET, one REFUSED line, still active",
    x.r.status === 403 && x.r.body.code === "PRIVILEGED_TARGET" && x.added === 1 && (await db.platSystemStaff.findUniqueOrThrow({ where: { id: OWNER } })).status === "ACTIVE", x);
  x = await one(() => call(A.base, "POST", `${P2}/${OWNER}/end-sessions`, { token: a, body: {} }));
  ok("PF-4s DW7 fail (SA7-D5): an Admin ending an Owner's sessions is 403 PRIVILEGED_TARGET", x.r.status === 403 && x.r.body.code === "PRIVILEGED_TARGET" && x.added === 1, x);
  x = await one(() => call(A.base, "POST", `${P2}/${TSUP2}/reactivate`, { token: a, body: {} }));
  ok("PF-4s DW7 fail (SA-7-23): an Admin reactivating anyone is 403 MISSING_PERMISSION", x.r.status === 403 && x.r.body.code === "MISSING_PERMISSION" && x.added === 1, x);
  x = await one(() => call(A.base, "PUT", `${P2}/${TSUP}/roles`, { token: a, body: { roles: ["platform-owner"], reason: "promotion" } }));
  ok("PF-4s DW7 fail (SA-7-29): an Admin giving the Owner role is 403", x.r.status === 403 && x.added === 1 && !(await rolesNow(TSUP)).includes("platform-owner"), x);
  x = await one(() => call(A.base, "POST", P2, { token: a, body: { email: "new.person@expatready.example", displayName: "Sample New", roles: ["platform-support"] } }));
  ok("PF-4s DW7 fail (SA-7-4): an Admin cannot invite (403)", x.r.status === 403 && x.added === 1, x);

  o = await signedNow(OWNER);
  x = await one(() => call(A.base, "POST", `${P2}/${TSUP2}/reactivate`, { token: o, body: {} }));
  const oldAfter = await call(A.base, "GET", "/api/system/me", { token: tsup2Token }), newIn = await signIn(TSUP2);
  ok("PF-4s DW7 pass (SA-7-23): an Owner reactivates (200, one line); the old session stays ended and a new sign-in works",
    x.r.status === 200 && x.added === 1 && oldAfter.status === 401 && oldAfter.body.code === "SESSION_REVOKED" && newIn.status === 200, { x, oldAfter, newIn });
  x = await one(() => call(A.base, "PUT", `${P2}/${OWNER}/roles`, { token: o, body: { roles: [] , reason: "test" } }));
  ok("PF-4s DW7 fail (SA-7-12): nobody changes their own roles (403 OWN_ROLES), one line", x.r.status === 403 && x.r.body.code === "OWN_ROLES" && x.added === 1, x);
  x = await one(() => call(A.base, "POST", P2, { token: o, body: { email: "second.owner@expatready.example", displayName: "Sample Second Owner", roles: ["platform-owner"] } }));
  ok("PF-4s DW7 fail (SA-7-12): giving the Owner role without a reason is 422 REASON_REQUIRED naming reason (R1.10 A4), nobody created", x.r.status === 422 && x.r.body.code === "REASON_REQUIRED" && !!x.r.body.fields?.reason && x.added === 1 && !(await db.platSystemStaff.findUnique({ where: { email: "second.owner@expatready.example" } })), x);
  x = await one(() => call(A.base, "POST", P2, { token: o, body: { email: "Second.Owner@expatready.example", displayName: "Sample Second Owner", roles: ["platform-owner"], reason: "a second Owner" } }));
  const OWNER2 = x.r.body.staffId as string;
  ok("PF-4s DW7 pass (SA-7-4): an Owner adds a staff member with the Owner role and a reason (201, one ALLOWED line naming the new person)",
    x.r.status === 201 && x.added === 1 && x.line.outcome === "ALLOWED" && x.line.target.staffId === OWNER2 && (await rolesNow(OWNER2)).join() === "platform-owner", x);
  x = await one(() => call(A.base, "POST", P2, { token: o, body: { email: "second.owner@expatready.example", displayName: "Again", roles: [] } }));
  ok("PF-4s DW7 fail: the same work email twice is 409 STAFF_EXISTS", x.r.status === 409 && x.r.body.code === "STAFF_EXISTS" && x.added === 1, x);
  const o1 = await signedNow(OWNER), o2 = await tokenOf(OWNER2), before2 = lines();
  const [r1, r2] = await Promise.all([call(A.base, "PUT", `${P2}/${OWNER2}/roles`, { token: o1, body: { roles: [], reason: "race" } }), call(A.base, "PUT", `${P2}/${OWNER}/roles`, { token: o2, body: { roles: [], reason: "race" } })]);
  const owners = Number(sql(`select count(*) from plat_system_role_grant g join plat_system_staff s on s.id = g.staff_id where g.role_code = 'platform-owner' and g.ended_at is null and s.status = 'ACTIVE'`));
  const refusedRace = [r1, r2].find((r) => r.status === 409);
  ok("PF-4s DW7 fail (SA-7-25): two Owners removing each other's Owner role at once: exactly one succeeds (the other 409 ROLES_CHANGED or LAST_OWNER), one active Owner stays, two lines",
    [r1.status, r2.status].sort().join() === "200,409" && ["ROLES_CHANGED", "LAST_OWNER"].includes(refusedRace?.body.code) && owners === 1 && lines() - before2 === 2, { r1, r2, owners });
  // QA-755 (Lead 18 on #3202): either Owner may win the race, so what follows must sign in the one left (soleOwner).
  // PF4S_FORCE_SOLE_OWNER=OWNER|OWNER2 (proof only) makes that person the winner after the race: the one active Owner
  // grant moves to them in the database, so both outcomes can be run on purpose.
  const forced = process.env.PF4S_FORCE_SOLE_OWNER;
  if (forced === "OWNER" || forced === "OWNER2") {
    const want = forced === "OWNER2" ? OWNER2 : OWNER, other = forced === "OWNER2" ? OWNER : OWNER2;
    if (sql(`select count(*) from plat_system_role_grant where staff_id = '${want}' and role_code = 'platform-owner' and ended_at is null`) === "0") {
      sql(`update plat_system_role_grant set ended_at = now() where staff_id = '${other}' and role_code = 'platform-owner' and ended_at is null returning id`);
      sql(`update plat_system_role_grant set ended_at = null where id = (select id from plat_system_role_grant where staff_id = '${want}' and role_code = 'platform-owner' order by ended_at desc limit 1) returning id`);
    }
    console.log(`  forced: ${forced} is the one active Owner after the race`);
  }
  // Review m2: the floor itself, asked directly (through the API it is a second wall: the sender is an active Owner and
  // never the target, so two active Owners exist whenever it runs).
  const soleOwner = sql(`select g.staff_id from plat_system_role_grant g join plat_system_staff s on s.id = g.staff_id where g.role_code = 'platform-owner' and g.ended_at is null and s.status = 'ACTIVE'`);
  const floorSole = await throwsLike(() => db.$transaction((tx) => SystemStaffAccess.lastOwner(tx as never, soleOwner)), (e) => (e as { getResponse?: () => { code?: string } }).getResponse?.().code === "LAST_OWNER");
  const floorOther = !(await throwsLike(() => db.$transaction((tx) => SystemStaffAccess.lastOwner(tx as never, TSUP)), () => true));
  ok("PF-4s DW7 fail/pass (SA-7-25): the floor refuses taking the last active Owner (409 LAST_OWNER) and lets anyone else go", floorSole && floorOther, { soleOwner, floorSole, floorOther });
  // Review m1: a sender deactivated after the guard let the call through changes nothing (the check under the lock).
  const OWNER3 = await person("Third Owner", ["platform-owner"]); clock.t = Math.ceil(clock.t / 1000) * 1000 + 1000;
  const o3ctx = await A.app.get(SystemIdentity).authenticate(await tokenOf(OWNER3));
  await db.platSystemStaff.update({ where: { id: OWNER3 }, data: { status: "DEACTIVATED" } });
  const midBefore = lines(), tsupEnded = (await db.platSystemStaff.findUniqueOrThrow({ where: { id: TSUP } })).sessionsEndedAt?.getTime() ?? null;
  const mid = await throwsLike(() => A.app.get(SystemStaffAccess).endAllSessions(o3ctx, { staff: { staffId: OWNER3, name: "Sample Third Owner" }, method: "POST", route: "/api/system/staff/:id/end-sessions", target: { id: TSUP }, reason: null, device: null }, TSUP, {}),
    (e) => (e as { getResponse?: () => { code?: string } }).getResponse?.().code === "SESSION_REVOKED");
  ok("PF-4s DW7 fail (review m1): a sender deactivated between the guard and the change changes nothing (401 SESSION_REVOKED under the lock), one REFUSED line",
    mid && lines() - midBefore === 1 && lastLine().code === "SESSION_REVOKED" && ((await db.platSystemStaff.findUniqueOrThrow({ where: { id: TSUP } })).sessionsEndedAt?.getTime() ?? null) === tsupEnded, { mid });
  // Breaker m2, n1, n2: invisible reasons and names; a reason too long is told so.
  const o4 = await signedNow(soleOwner);
  const filler = await one(() => call(A.base, "POST", `${P2}/${TSUP}/deactivate`, { token: o4, body: { reason: "\u3164\u115F" } }));
  const long = await one(() => call(A.base, "PUT", `${P2}/${TSUP}/roles`, { token: o4, body: { roles: ["platform-support"], reason: "r".repeat(501) } }));
  const blankName = await one(() => call(A.base, "POST", P2, { token: o4, body: { email: "blank.name@expatready.example", displayName: "\u200B\u3164", roles: [] } }));
  ok("PF-4s part 2 fail (breaker m2, n1, n2): a reason of Hangul fillers is no reason (422), a 501-character one is 422 REASON_TOO_LONG, an invisible name is 422; one line each, nothing changed",
    filler.r.status === 422 && filler.r.body.code === "REASON_REQUIRED" && !!filler.r.body.fields?.reason && long.r.status === 422 && long.r.body.code === "REASON_TOO_LONG" && !!long.r.body.fields?.reason && blankName.r.status === 422 && filler.added + long.added + blankName.added === 3
    && (await db.platSystemStaff.findUniqueOrThrow({ where: { id: TSUP } })).status === "ACTIVE" && !(await db.platSystemStaff.findUnique({ where: { email: "blank.name@expatready.example" } })), { filler: filler.r, long: long.r, blankName: blankName.r });
  // PF-28's rule on our own staff's routes (its sweep cannot sign in here, so it lists them NOT TESTED and they are asked
  // here): an unknown field 422 naming it, a wrong type 422, and a bad body changes nothing (one REFUSED line, code INVALID).
  const ow = await signedNow(soleOwner), probeId = TSUP, staffBefore = sql(`select count(*) from plat_system_staff`);
  const p28: [string, string, unknown][] = [["POST", P2, { pf28Unknown: "x" }], ["PUT", `${P2}/${probeId}/roles`, { pf28Unknown: "x" }], ["POST", `${P2}/${probeId}/deactivate`, { reason: "x", pf28Unknown: "x" }],
    ["POST", `${P2}/${probeId}/reactivate`, { pf28Unknown: "x" }], ["POST", `${P2}/${probeId}/end-sessions`, { pf28Unknown: "x" }], ["POST", `${P2}/${probeId}/reset-mfa`, { reason: "x", verified: true, pf28Unknown: "x" }]];
  const p28Wrong: string[] = [];
  for (const [m, path, body] of p28) {
    const u = await one(() => call(A.base, m, path, { token: ow, body })), w = await call(A.base, m, path, { token: ow, body: [1] });
    if (u.r.status !== 422 || !Object.hasOwn(u.r.body.fields ?? {}, "pf28Unknown") || u.added !== 1 || u.line.code !== "INVALID" || w.status !== 422) p28Wrong.push(`${m} ${path}: unknown ${u.r.status} (+${u.added} ${u.line.code}), wrong type ${w.status}`);
  }
  const rolesTyped = await call(A.base, "PUT", `${P2}/${probeId}/roles`, { token: ow, body: { roles: "platform-owner" } });
  ok("PF-4s part 2 (PF-28): each staff route answers an unknown field 422 naming it and a wrong type 422, writes one REFUSED line (INVALID) and changes nothing",
    p28Wrong.length === 0 && rolesTyped.status === 422 && sql(`select count(*) from plat_system_staff`) === staffBefore, { p28Wrong, rolesTyped });
  ok("PF-4s part 2: audit text is cut by code point, never splitting a character", lineText("😀😀😀", 2) === "😀😀" && lineText("a\u0000b", 5) === "ab");

  // ---------------------------------------------------------- AUD-3a: our staff's actor word on a firm's trail
  trailDb = db;
  const adm = await signedNow(ADMIN), trailOf = () => sql(`select actor_type || '|' || actor || '|' || firm_id from audit_event where entity_key = 'aud3a-${firmId.slice(0, 8)}'`);
  const trailCall = await call(A.base, "POST", `/api/system/test/firms/${firmId}/trail`, { token: adm, body: {} });
  ok("AUD-3a pass: a firm-trail line written in our staff's request (through the system guard) is OUR_STAFF, ourstaff:<their id>, on that firm's trail",
    trailCall.status === 201 && trailOf() === `OUR_STAFF|ourstaff:${ADMIN}|${firmId}`, { trailCall, line: trailOf() });
  const asFirm = await call(A.base, "POST", `/api/system/test/firms/${firmId}/trail`, { token: adm, body: { actor: `staff:${ADMIN}` } });
  ok("AUD-3a fail: in our staff's request a firm-trail line under a firm staff word is refused (500, nothing more written)", asFirm.status === 500 && sql(`select count(*) from audit_event where entity_key = 'aud3a-${firmId.slice(0, 8)}'`) === "1", asFirm);

  // ------------------------------------------------------------------------ DW8: everything else is as it was
  const simulated = await call(A.base, "GET", "/api/probe", { actor: "user-A" }), nobody = await call(A.base, "GET", "/api/probe"), linkOnly = await call(A.base, "GET", "/api/probe", { token: "some-link-token", actor: "user-A" });
  ok("PF-4s DW8 pass/fail: the simulated configurator people are unchanged (user-A reads; no header 401; another bearer token is still link-only 403)", simulated.status === 200 && nobody.status === 401 && linkOnly.status === 403 && /link/i.test(JSON.stringify(linkOnly.body)), { simulated, nobody, linkOnly });
  const firmUndisturbed = await call(A.base, "GET", "/api/platform/me", { token: firmToken }), firmNoToken = await call(A.base, "GET", "/api/platform/me");
  ok("PF-4s DW8 pass/fail: PF-4's guard is unchanged (a firm session reads who it is; no session 401 NOT_SIGNED_IN)", firmUndisturbed.status === 200 && firmUndisturbed.body.firmKey === "sample-firm" && firmNoToken.status === 401 && firmNoToken.body.code === "NOT_SIGNED_IN", { firmUndisturbed, firmNoToken });
} catch (e) {
  ok("the check ran to its end", false, e instanceof Error ? `${e.name}: ${e.message}\n${e.stack}` : String(e));
} finally {
  for (const a of apps) await a.close().catch(() => undefined);
  await db.$disconnect();
  try { execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", DB]); } catch { /* left for the cluster's sweep */ }
}

console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
