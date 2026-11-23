// AUD-3c (Lead 10's ruling on #3040, 23 Nov, with Lead B's points): a bypass use in a request our own staff make writes
// its platform.bypass line under the request's own ourstaff:<id>. Each "Done when" line passes and fails, through PF-4s's
// real guard, PF-23's request scope, PF-12's walls and the real adapter:
// DW1 touchPlatform in our staff's request writes one firm-less line, the port's own kind: firm and case null, the
// platform audit workspace, OUR_STAFF, ourstaff:<id>, platform.bypass, plat_bypass_use, the use as its key, the request's
// correlation id; on main it answers 500 (recordCase refuses our staff, AUD-3a). DW2 touchFirm in our staff's request
// writes one ordinary line on that firm's trail under ourstaff:<id>; on main it answers 500 (system:<use> refused in such
// a request). DW3 each refusal has its fail case, with nothing written: outside our staff's request, another actor, a
// firm id, a case id, another action, a workspace id; a request or job acting for a firm. DW4 nothing changes outside our
// staff's requests (a direct call keeps the system:<use> case-shape line). DW5 the port's in-memory fake refuses the same.
// No /api/system route on main calls touchPlatform or touchFirm today (grep in the PR body); the routes below are
// test-only, on platform.entitlements.limit-change's named routes (POST /api/system/plans/...).
// One process, a scratch database (dropped at the end), no model call (US$0).
//   tsx --tsconfig studio/api/tsconfig.json studio/tests/check_aud3c_platform_line.ts
import "reflect-metadata";
import { Body, Controller, Module, Param, Post } from "@nestjs/common";
import { APP_GUARD, APP_INTERCEPTOR, NestFactory } from "@nestjs/core";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations");
const BIN = ["/opt/homebrew/opt/postgresql@18/bin", "/usr/lib/postgresql/18/bin"].find((b) => existsSync(join(b, "psql"))) ?? "";
const PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_aud3c_${process.pid}`;
const urlOf = (db: string, user = "xr_studio") => `postgresql://${user}@127.0.0.1:54329/${db}`;
const psqlFile = (f: string) => execFileSync(join(BIN, "psql"), [urlOf(DB), "-X", "-v", "ON_ERROR_STOP=1", "-q", "-f", f], { stdio: ["ignore", "ignore", "pipe"] });
const sql = (q: string) => execFileSync(join(BIN, "psql"), [urlOf(DB), "-X", "-v", "ON_ERROR_STOP=1", "-q", "-Atc", q], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 600)}` : ""}`); };
const throwsLike = async (f: () => unknown, test: (e: unknown) => boolean) => { try { await f(); return false; } catch (e) { return test(e); } };
const uuid = () => globalThis.crypto.randomUUID();
type Res = { status: number; body: any; requestId: string | null };
const call = async (base: string, method: string, path: string, o: { token?: string; body?: unknown } = {}): Promise<Res> => {
  const headers: Record<string, string> = { "content-type": "application/json", "user-agent": "aud3c-check/1" };
  if (o.token) headers.authorization = `Bearer ${o.token}`;
  const r = await fetch(`${base}${path}`, { method, headers, body: o.body === undefined ? undefined : JSON.stringify(o.body) });
  const text = await r.text();
  let body: any = text; try { body = JSON.parse(text); } catch { /* text */ }
  return { status: r.status, body, requestId: r.headers.get("x-request-id") };
};

execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", DB]); execFileSync(join(BIN, "createdb"), [...PG, DB]);
for (const d of readdirSync(MIG).filter((x) => /^\d{14}_/.test(x)).sort()) psqlFile(join(MIG, d, "migration.sql"));
process.env.DATABASE_URL = urlOf(DB);
for (const k of Object.keys(process.env)) if (/^PLATFORM_/.test(k)) delete process.env[k];
process.env.PLATFORM_ENVIRONMENT = "local";
const { ConfigReadGuard, Db } = await import("../api/src/core.ts");
const { seedSampleFirms } = await import("../api/src/platform/seed-sample-firms.ts");
const { appDatabaseUrl, asBypass, touchFirm, touchPlatform, wallUnscopedQueries, WalledPool } = await import("../api/src/platform/firm-scope.ts");
const { FirmWallsInterceptor } = await import("../api/src/features/platform-firm-walls.ts");
const { PlatformClock } = await import("../api/src/platform/identity/port.ts");
const { LocalIdentity } = await import("../api/src/platform/identity/local.ts");
const { IDENTITY_PORT, PlatformIdentity } = await import("../api/src/platform/identity/service.ts");
const { PlatformGuard } = await import("../api/src/platform/identity/guard.ts");
const { PlatformIdentityController } = await import("../api/src/platform/identity/routes.ts");
const { requestMiddleware } = await import("../api/src/platform/observability/hook.ts");
const { SystemLocalIdentity } = await import("../api/src/platform/system-identity/local.ts");
const { SYSTEM_IDENTITY_PORT } = await import("../api/src/platform/system-identity/service.ts");
const { SystemGuard } = await import("../api/src/platform/system-identity/guard.ts");
const { SystemKeys } = await import("../api/src/platform/system-identity/keys.ts");
const sysFeature = (await import("../api/src/features/platform-system-identity.ts")).default;
const { auditEvent } = await import("../api/src/platform/audit/audit-event.ts");
const port: Record<string, any> = await import("../ports/audit.ts");
const onMain = typeof port.ourStaffPlatformRefusal !== "function";   // run on main's code: only the route lines can say anything
const owner = new PrismaClient({ adapter: new PrismaPg({ connectionString: urlOf(DB), options: "-c TimeZone=UTC" }) });
wallUnscopedQueries();
const pool = new WalledPool({ connectionString: appDatabaseUrl(urlOf(DB), {}), max: 6, options: "-c TimeZone=UTC" });
const walled = new PrismaClient({ adapter: new PrismaPg(pool) });
const apps: { close(): Promise<void> }[] = [];
const lines = (where: string) => Number(sql(`select count(*) from audit_event where ${where}`));
const USE = "platform.entitlements.limit-change";
const kind = (actor: string, extra: Record<string, unknown> = {}) => ({ firmId: null, actor, action: "platform.bypass", entity: "plat_bypass_use", entityKey: USE, summary: "Sample firm-less line.", detail: {}, ...extra });
let otherStaff = "", firmForTry = "";

// Test-only routes on limit-change's named routes (POST /api/system/plans/...), through PF-4s's guard.
@Controller("api/system/plans/aud3c")
class Aud3cController {
  @Post("platform") @SystemKeys("system/firm:read")
  async platform() { await asBypass(USE, () => walled.$transaction(async (tx) => { await touchPlatform(tx, { step: "aud3c.test", key: null }); })); return { ok: true }; }
  @Post("firm/:id") @SystemKeys("system/firm:read")
  async firm(@Param("id") id: string) { await asBypass(USE, () => walled.$transaction(async (tx) => { await touchFirm(tx, id); })); return { ok: true }; }
  @Post("try/:variant") @SystemKeys("system/firm:read")
  async attempt(@Param("variant") v: string, @Body() _b: unknown) {
    const ctx = (await import("../api/src/platform/audit/context.ts")).auditContext(), me = ctx?.actor ?? "none";
    const entry = v === "own" ? kind(me) : v === "other-actor" ? kind(`ourstaff:${otherStaff}`) : v === "firm-id" ? kind(me, { firmId: firmForTry })
      : v === "case-id" ? kind(me, { caseId: uuid() }) : v === "other-action" ? kind(me, { action: "platform.other" }) : v === "workspace" ? kind(me, { workspaceId: sql(`select id from workspace where key = 'platform-audit'`) || uuid() })
      : v === "system-word" ? kind("system:aud3c") : kind(me);
    await walled.$transaction(async (tx) => { await auditEvent.record(tx as never, entry as never); });
    return { ok: true };
  }
}

try {
  const clock = new (class extends PlatformClock { t = Date.now(); override now() { return this.t; } })();
  const firmLocal = new LocalIdentity("aud3c-firm-standin-key-0123456789abcdefg", () => clock.now());
  const systemLocal = new SystemLocalIdentity("aud3c-system-standin-key-0123456789abc", () => clock.now());
  const sysProviders = sysFeature.providers.filter((p: any) => p !== PlatformClock && p?.provide !== SYSTEM_IDENTITY_PORT && p?.provide !== APP_GUARD);
  @Module({ controllers: [PlatformIdentityController, ...sysFeature.controllers, Aud3cController] as never[],
    providers: [Db, { provide: APP_GUARD, useClass: ConfigReadGuard }, { provide: PlatformClock, useValue: clock }, { provide: IDENTITY_PORT, useValue: firmLocal }, PlatformIdentity, PlatformGuard, { provide: APP_GUARD, useExisting: PlatformGuard },
      { provide: SYSTEM_IDENTITY_PORT, useValue: systemLocal }, ...sysProviders, { provide: APP_GUARD, useExisting: SystemGuard },
      { provide: APP_INTERCEPTOR, useClass: FirmWallsInterceptor }] as never[] }) class TestApp {}
  const app = await NestFactory.create(TestApp, { logger: false });
  app.use(requestMiddleware());
  await app.listen(0, "127.0.0.1"); apps.push(app);
  const base = `http://127.0.0.1:${(app.getHttpServer().address() as { port: number }).port}`;

  await seedSampleFirms(owner);
  const firmA = sql(`select id from platform_firm where key = 'sample-firm'`);
  firmForTry = firmA;
  const person = async (name: string, roles: string[]) => (await owner.platSystemStaff.create({ data: { email: `${name.toLowerCase()}.aud3c@expatready.example`, displayName: `Sample ${name}`, grants: { create: roles.map((roleCode) => ({ roleCode })) } } })).id;
  const OWNER = await person("Owner", ["platform-owner"]); otherStaff = await person("Other", ["platform-admin"]);
  const tokenOf = async (id: string) => { const email = (await owner.platSystemStaff.findUniqueOrThrow({ where: { id } })).email; const r = await call(base, "POST", "/api/system/session/local", { body: { email, secondStep: true } }); if (r.status !== 200) throw new Error(JSON.stringify(r.body)); return r.body.token as string; };
  const ownerT = await tokenOf(OWNER);

  // ---------------------------------------------------------------------------- DW1: touchPlatform, firm-less
  const p0 = lines(`action = 'platform.bypass'`);
  const plat = await call(base, "POST", "/api/system/plans/aud3c/platform", { token: ownerT, body: {} });
  const pl = sql(`select coalesce(e.firm_id::text, 'none') || '|' || coalesce(e.case_id::text, 'none') || '|' || w.key || '|' || e.actor_type || '|' || e.actor || '|' || e.entity || '|' || e.entity_key || '|' || coalesce(e.correlation_id, '') || '|' || (e.detail->>'step')
    from audit_event e join workspace w on w.id = e.workspace_id where e.action = 'platform.bypass' order by e.at desc limit 1`);
  ok("AUD-3c DW1 pass (red on main): touchPlatform in our staff's request answers 201 and writes one firm-less line: firm and case null, the platform audit workspace, OUR_STAFF, ourstaff:<their id>, plat_bypass_use, the use as key, the request's correlation id",
    plat.status === 201 && lines(`action = 'platform.bypass'`) === p0 + 1 && pl === `none|none|platform-audit|OUR_STAFF|ourstaff:${OWNER}|plat_bypass_use|${USE}|${plat.requestId}|aud3c.test`, { plat, pl });

  // ---------------------------------------------------------------------------- DW2: touchFirm, on the firm's trail
  const f0 = lines(`firm_id = '${firmA}' and action = 'platform.bypass'`);
  const firm = await call(base, "POST", `/api/system/plans/aud3c/firm/${firmA}`, { token: ownerT, body: {} });
  const fl = sql(`select actor_type || '|' || actor || '|' || entity || '|' || entity_key || '|' || coalesce(correlation_id, '') from audit_event where firm_id = '${firmA}' and action = 'platform.bypass' order by at desc limit 1`);
  ok("AUD-3c DW2 pass (red on main): touchFirm in our staff's request answers 201 and writes one ordinary line on that firm's trail under ourstaff:<their id> (never system:<use>)",
    firm.status === 201 && lines(`firm_id = '${firmA}' and action = 'platform.bypass'`) === f0 + 1 && fl === `OUR_STAFF|ourstaff:${OWNER}|platform_firm|${firmA}|${firm.requestId}`, { firm, fl });

  if (onMain) {
    ok("AUD-3c: the refusals, DW4 and the fake are checked on the head only (main has no firm-less kind)", false);
  } else {
    // -------------------------------------------------------------------------------------- DW3: the refusals
    const own0 = lines(`entity = 'plat_bypass_use'`);
    const own = await call(base, "POST", "/api/system/plans/aud3c/try/own", { token: ownerT, body: {} });
    ok("AUD-3c DW3 pass: the kind written directly in our staff's request, under their own word, is one line", own.status === 201 && lines(`entity = 'plat_bypass_use'`) === own0 + 1, own);
    for (const [v, why] of [["other-actor", "another staff member's ourstaff: word"], ["firm-id", "a firm id"], ["case-id", "a case id"], ["other-action", "another action"],
      ["workspace", "a workspace id (it would be a case entry, which our staff never write)"], ["system-word", "a system: word"]] as const) {
      const before = lines("true");
      const r = await call(base, "POST", `/api/system/plans/aud3c/try/${v}`, { token: ownerT, body: {} });
      ok(`AUD-3c DW3 fail: the firm-less kind with ${why} is refused (500), and nothing is written`, r.status === 500 && lines("true") === before, r);
    }
    const out0 = lines("true");
    ok("AUD-3c DW3 fail: outside any request the kind is refused, nothing written",
      await throwsLike(() => owner.$transaction((tx) => auditEvent.record(tx as never, kind(`ourstaff:${OWNER}`) as never)), (e) => /only in a request our staff make/.test(String(e))) && lines("true") === out0);
    const refusal = port.ourStaffPlatformRefusal, parsed = port.OurStaffPlatformEntry.parse(kind(`ourstaff:${OWNER}`));
    ok("AUD-3c DW3 fail: in a firm staff member's request, or one that acts for a firm, the kind is refused; in our staff's own request it passes",
      /only in a request our staff make/.test(refusal(parsed, { actor: "staff:x", actorType: "FIRM_STAFF", firmId: firmA }) ?? "")
      && /acts for firm/.test(refusal(parsed, { actor: `ourstaff:${OWNER}`, actorType: "OUR_STAFF", firmId: firmA }) ?? "")
      && refusal(parsed, { actor: `ourstaff:${OWNER}`, actorType: "OUR_STAFF" }) === null);
    ok("AUD-3c DW3 fail: an ordinary firm entry may not take the kind's entity (plat_bypass_use)",
      await throwsLike(() => owner.$transaction((tx) => auditEvent.record(tx as never, { firmId: firmA, actor: "system:aud3c", action: "platform.bypass", entity: "plat_bypass_use", entityKey: USE, summary: "x", before: null, after: null })), (e) => /firm-less kind's entity/.test(String(e))));

    // ------------------------------------------------------------------- DW4: outside our staff, unchanged
    const OUTSIDE = "platform.demo.reset";   // a use allowed outside a request (the reset tools)
    const d0 = lines(`entity = 'bypass use' and actor = 'system:${OUTSIDE}'`);
    await asBypass(OUTSIDE, () => walled.$transaction(async (tx) => { await touchPlatform(tx, { step: "aud3c.outside", key: null }); }));
    ok("AUD-3c DW4 pass: outside every request a use keeps PF-12b's system:<use> firm-less case-shape line, as before", lines(`entity = 'bypass use' and actor = 'system:${OUTSIDE}'`) === d0 + 1);

    // ------------------------------------------------------------------------------ DW5: the in-memory fake
    let ctx: any = { actor: `ourstaff:${OWNER}`, actorType: "OUR_STAFF" };
    const fake = port.fakeAudit({ context: () => ctx });
    await fake.record({}, kind(`ourstaff:${OWNER}`));
    const fakeRefuses = async (e: unknown) => throwsLike(() => fake.record({}, e), () => true);
    const refusedAll = await fakeRefuses(kind(`ourstaff:${otherStaff}`)) && await fakeRefuses(kind(`ourstaff:${OWNER}`, { caseId: uuid() })) && await fakeRefuses(kind(`ourstaff:${OWNER}`, { action: "platform.other" }))
      && await fakeRefuses({ firmId: firmA, actor: "system:x", action: "platform.bypass", entity: "plat_bypass_use", entityKey: USE, summary: "x", before: null, after: null });
    ctx = { actor: "staff:x", actorType: "FIRM_STAFF" };
    const refusedFirmStaff = await fakeRefuses(kind(`ourstaff:${OWNER}`));
    const noContext = await throwsLike(() => port.fakeAudit().record({}, kind(`ourstaff:${OWNER}`)), () => true);
    ok("AUD-3c DW5: the port's in-memory fake keeps our staff's own line and refuses the same: another actor, a case id, another action, the kind's entity on a firm line, a firm staff request, no request at all",
      fake.platformEntries.length === 1 && refusedAll && refusedFirmStaff && noContext && fake.platformEntries.length === 1);
  }
} finally {
  for (const a of apps) await a.close().catch(() => undefined);
  await walled.$disconnect().catch(() => undefined); await owner.$disconnect().catch(() => undefined); await pool.end().catch(() => undefined);
  try { execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", DB]); } catch { /* left for the cleanup tool */ }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
