// PF-17 part 1 (R1.93; brief design/briefs/track-b/PF-17-1.md; P-581): our team's firms list with health and usage per
// firm, GET /api/system/firms and GET /api/system/firms/:id behind PF-4s's @SystemKeys("system/firm:read"). Each "Done
// when" line passes and fails: DW1 who may read (a firm's staff and a Content publisher 403; Support, Billing, Admin,
// Auditor, Owner 200); DW2 every figure equals PF-15's own read for that firm, and follows a change; DW3 the health rules
// (one seat over → ATTENTION "seats over the limit", a held firm → HELD, nothing wrong → OK, a trial ending soon); DW4
// last staff sign-in is the newest, null when nobody signed in; DW5 one PF-4s audit line per call (a refusal too), never
// on a firm's own trail; DW6 the two bypass uses are on the named list for these routes only and refused anywhere else;
// DW7 an unknown or malformed id → 404, never 500; DW8 paging and ?health= / ?q= return the right rows. One process, a
// scratch database (dropped at the end), a small Nest app built from the features' own classes. No model call (US$0).
//   tsx --tsconfig studio/api/tsconfig.json studio/tests/check_pf17_console.ts
import "reflect-metadata";
import { Module } from "@nestjs/common";
import { APP_GUARD, APP_INTERCEPTOR, NestFactory } from "@nestjs/core";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations");
const BIN = ["/opt/homebrew/opt/postgresql@18/bin", "/usr/lib/postgresql/18/bin"].find((b) => existsSync(join(b, "psql"))) ?? "";
const PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_pf17_${process.pid}`;
const urlOf = (db: string, user = "xr_studio") => `postgresql://${user}@127.0.0.1:54329/${db}`;
const sql = (q: string) => execFileSync(join(BIN, "psql"), [urlOf(DB), "-X", "-v", "ON_ERROR_STOP=1", "-q", "-Atc", q], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 700)}` : ""}`); };
const throwsLike = async (f: () => unknown, test: (e: unknown) => boolean) => { try { await f(); return false; } catch (e) { return test(e); } };
type Res = { status: number; body: any };
const call = async (base: string, path: string, token?: string): Promise<Res> => {
  const r = await fetch(`${base}${path}`, { headers: { "user-agent": "pf17-check/1", ...(token ? { authorization: `Bearer ${token}` } : {}) } });
  const text = await r.text(); let body: any = text; try { body = JSON.parse(text); } catch { /* text */ }
  return { status: r.status, body };
};

execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", DB]); execFileSync(join(BIN, "createdb"), [...PG, DB]);
for (const d of readdirSync(MIG).filter((x) => /^\d{14}_/.test(x)).sort()) execFileSync(join(BIN, "psql"), [urlOf(DB), "-X", "-v", "ON_ERROR_STOP=1", "-q", "-f", join(MIG, d, "migration.sql")], { stdio: ["ignore", "ignore", "pipe"] });
process.env.DATABASE_URL = urlOf(DB);
for (const k of Object.keys(process.env)) if (/^PLATFORM_/.test(k)) delete process.env[k];
process.env.PLATFORM_ENVIRONMENT = "local";

const { ConfigReadGuard, Db } = await import("../api/src/core.ts");
const { seedSampleFirms } = await import("../api/src/platform/seed-sample-firms.ts");
const { BYPASS_USES, BypassRefused, inRequest, wallUnscopedQueries } = await import("../api/src/platform/firm-scope.ts");
const { FirmWallsInterceptor } = await import("../api/src/features/platform-firm-walls.ts");
const { PlatformClock } = await import("../api/src/platform/identity/port.ts");
const { LocalIdentity } = await import("../api/src/platform/identity/local.ts");
const { IDENTITY_PORT, PlatformIdentity } = await import("../api/src/platform/identity/service.ts");
const { PlatformGuard } = await import("../api/src/platform/identity/guard.ts");
const { PlatformIdentityController } = await import("../api/src/platform/identity/routes.ts");
const { requestMiddleware } = await import("../api/src/platform/observability/hook.ts");
const { SystemLocalIdentity } = await import("../api/src/platform/system-identity/local.ts");
const { SYSTEM_IDENTITY_PORT, SystemIdentity } = await import("../api/src/platform/system-identity/service.ts");
const { SystemGuard, SystemPlaneWall } = await import("../api/src/platform/system-identity/guard.ts");
const { SystemIdentityController } = await import("../api/src/platform/system-identity/routes.ts");
const { SystemFirms, FIRMS_LIST_USE, FIRM_READ_USE, PAGE_SIZE, healthOf } = await import("../api/src/platform/system-console/firms.ts");
const { SystemFirmsController } = await import("../api/src/platform/system-console/routes.ts");
const { PgEntitlements, seatsUsed, mbOf } = await import("../api/src/platform/entitlements/limits.ts");
const { PgCaseCount } = await import("../api/src/case-count.ts");
const feature = (await import("../api/src/features/platform-system-console.ts")).default;

const owner = new PrismaClient({ adapter: new PrismaPg({ connectionString: urlOf(DB), options: "-c TimeZone=UTC" }) });
/** Storage in bytes per firm id, read by the service and by the test's own PF-15 comparison through the same FilesPort. */
const bytes = new Map<string, number>();
const files = { usedBytes: async (id: string) => bytes.get(id) ?? 0 };
const apps: { close(): Promise<void> }[] = [];
try {
  await seedSampleFirms(owner);
  const firmA = sql(`select id from platform_firm where key = 'sample-firm'`), firmS = sql(`select id from platform_firm where key = 'sample-solo'`);

  const clock = new (class extends PlatformClock { t = Date.now(); override now() { return this.t; } })();
  const firmLocal = new LocalIdentity("pf17-firm-standin-key-0123456789abcdef", () => clock.now());
  const systemLocal = new SystemLocalIdentity("pf17-system-standin-key-0123456789abc", () => clock.now());
  @Module({ controllers: [PlatformIdentityController, SystemIdentityController, SystemFirmsController] as never[],
    providers: [Db, { provide: APP_GUARD, useClass: ConfigReadGuard }, { provide: PlatformClock, useValue: clock }, { provide: IDENTITY_PORT, useValue: firmLocal }, PlatformIdentity, PlatformGuard, { provide: APP_GUARD, useExisting: PlatformGuard },
      { provide: SYSTEM_IDENTITY_PORT, useValue: systemLocal }, SystemIdentity, SystemPlaneWall, SystemGuard, { provide: APP_GUARD, useExisting: SystemGuard },
      { provide: APP_INTERCEPTOR, useClass: FirmWallsInterceptor },
      { provide: SystemFirms, useFactory: (db: InstanceType<typeof Db>) => new SystemFirms({ db, files, cases: (k, tx) => new PgCaseCount(tx, k), now: () => clock.now() }), inject: [Db] }] as never[] }) class TestApp {}
  const app = await NestFactory.create(TestApp, { logger: false });
  app.use(requestMiddleware());
  await app.listen(0, "127.0.0.1"); apps.push(app);
  const base = `http://127.0.0.1:${(app.getHttpServer().address() as { port: number }).port}`;
  ok("PF-17 pass: the feature registers the firms controller and the service (bound to PF-15's FilesPort and the case side's PgCaseCount)",
    feature.controllers.includes(SystemFirmsController) && (feature.providers as { provide?: unknown }[]).some((p) => p.provide === SystemFirms));

  const person = async (name: string, roles: string[]) => (await owner.platSystemStaff.create({ data: { email: `${name.toLowerCase().replace(/\s+/g, ".")}.pf17@expatready.example`, displayName: `Sample ${name}`, grants: { create: roles.map((roleCode) => ({ roleCode })) } } })).id;
  const tokenOf = async (id: string) => { const email = (await owner.platSystemStaff.findUniqueOrThrow({ where: { id } })).email; const r = await (await fetch(`${base}/api/system/session/local`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, secondStep: true }) })).json(); return r.token as string; };
  const roles = { owner: "platform-owner", admin: "platform-admin", support: "platform-support", billing: "platform-billing-ops", auditor: "platform-auditor", publisher: "platform-content-publisher" } as const;
  const tokens: Record<keyof typeof roles, string> = {} as never;
  for (const [k, r] of Object.entries(roles)) tokens[k as keyof typeof roles] = await tokenOf(await person(`${k} PF17`, [r]));
  const firmToken = (await (await fetch(`${base}/api/platform/session/local`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ firmKey: "sample-firm", actorId: "user-R", secondStep: true }) })).json()).token as string;
  const sysLines = () => Number(sql(`select count(*) from plat_system_audit`));

  // ---------------------------------------------------------------------------------------- DW1: who may read
  const allowed = await Promise.all((["owner", "admin", "support", "billing", "auditor"] as const).map((k) => call(base, "/api/system/firms", tokens[k])));
  ok("PF-17 DW1 pass: Platform Owner, Admin, Support, Billing and Auditor (system/firm:read) → 200 with the firms", allowed.every((r) => r.status === 200 && Array.isArray(r.body.firms) && r.body.total >= 2), allowed.map((r) => r.status));
  const pub = await call(base, "/api/system/firms", tokens.publisher), firm = await call(base, "/api/system/firms", firmToken), none = await call(base, "/api/system/firms");
  const pubOne = await call(base, `/api/system/firms/${firmA}`, tokens.publisher), firmOne = await call(base, `/api/system/firms/${firmA}`, firmToken);
  ok("PF-17 DW1 fail: a Content publisher (no system/firm:read) → 403, a firm staff token → 403 FIRM_SESSION_REFUSED, no token → 401; the same on one firm",
    pub.status === 403 && firm.status === 403 && firm.body.code === "FIRM_SESSION_REFUSED" && none.status === 401 && pubOne.status === 403 && firmOne.status === 403, { pub, firm, none: none.status, pubOne: pubOne.status, firmOne: firmOne.status });
  const upper = await call(base, "/API/System/Firms", firmToken);
  ok("PF-17 DW1 fail (breaker): the firm token on a mixed-case path is refused too (403)", upper.status === 403, upper);

  // ----------------------------------------------------------------------------- DW2: PF-15's own figures
  bytes.set(firmA, 7 * 1024 * 1024 + 1);
  const pf15 = async (id: string, key: string) => {
    const ent = new PgEntitlements(owner, () => clock.now()), counts = await new PgCaseCount(owner, key).activeCounts(owner);
    return { seats: { used: await seatsUsed(owner, id), limit: (await ent.limitOf(id, "seats")).limit }, active_individual_cases: { used: counts.individual, limit: (await ent.limitOf(id, "active_individual_cases")).limit },
      active_corporate_cases: { used: counts.corporate, limit: (await ent.limitOf(id, "active_corporate_cases")).limit }, storage_mb: { used: mbOf(await files.usedBytes(id)), limit: (await ent.limitOf(id, "storage_mb")).limit } } as Record<string, { used: number; limit: number | null }>;
  };
  const same = (got: any, want: Record<string, { used: number; limit: number | null }>) => got.usage.length === 4 && got.usage.every((u: any) => want[u.metric] && want[u.metric].used === u.used && want[u.metric].limit === u.limit);
  const aOne = await call(base, `/api/system/firms/${firmA}`, tokens.support), aWant = await pf15(firmA, "sample-firm");
  ok("PF-17 DW2 pass: firm A's seats, active individual and corporate cases and storage (used and limit) equal PF-15's own reads for A",
    aOne.status === 200 && same(aOne.body, aWant) && aOne.body.usage.find((u: any) => u.metric === "storage_mb").used === 8, { got: aOne.body.usage, want: aWant });
  const aInList = (await call(base, "/api/system/firms", tokens.support)).body.firms.find((f: any) => f.id === firmA);
  ok("PF-17 DW2 pass: the list's row for A carries the same figures as the one-firm answer", JSON.stringify(aInList?.usage) === JSON.stringify(aOne.body.usage), { aInList: aInList?.usage });
  sql(`insert into platform_staff (id, firm_id, email, display_name, status, updated_at) values (gen_random_uuid(), '${firmA}', 'extra.pf17@sample-firm.example', 'Sample extra', 'ACTIVE', now())`);
  const aAfter = await call(base, `/api/system/firms/${firmA}`, tokens.support), aWant2 = await pf15(firmA, "sample-firm");
  const seatsBefore = aOne.body.usage.find((u: any) => u.metric === "seats").used, seatsAfter = aAfter.body.usage.find((u: any) => u.metric === "seats").used;
  ok("PF-17 DW2 fail: one more staff member in A moves A's seats by one, as PF-15's read does; firm B's figures do not move",
    seatsAfter === seatsBefore + 1 && same(aAfter.body, aWant2) && same((await call(base, `/api/system/firms/${firmS}`, tokens.support)).body, await pf15(firmS, "sample-solo")), { seatsBefore, seatsAfter });

  // ------------------------------------------------------------------------------------ DW3: the health rules
  const okA = await call(base, `/api/system/firms/${firmA}`, tokens.auditor);
  ok("PF-17 DW3 pass: a firm with nothing wrong (Team plan, 4 of 5 seats, active, paid) is OK with no reasons", okA.body.health === "OK" && okA.body.reasons.length === 0 && okA.body.status === "ACTIVE" && okA.body.plan.code === "team", okA.body);
  sql(`insert into platform_staff (id, firm_id, email, display_name, status, updated_at) values (gen_random_uuid(), '${firmS}', 'second.pf17@sample-solo.example', 'Sample second', 'ACTIVE', now())`);
  const over = await call(base, `/api/system/firms/${firmS}`, tokens.auditor);
  ok("PF-17 DW3 pass: a firm one seat over its limit (Solo: 2 of 1) is ATTENTION with the reason \"seats over the limit\"",
    over.body.health === "ATTENTION" && over.body.reasons.includes("seats over the limit") && over.body.usage.find((u: any) => u.metric === "seats").over === true, over.body);
  sql(`update platform_firm set status = 'PAYMENT_HOLD' where id = '${firmS}'`);
  const held = await call(base, `/api/system/firms/${firmS}`, tokens.auditor);
  ok("PF-17 DW3 pass: a held firm is HELD, its hold first among its reasons (the seat reason kept after it)", held.body.health === "HELD" && held.body.reasons[0] === "on payment hold" && held.body.reasons.includes("seats over the limit"), held.body);
  sql(`update platform_firm set status = 'ACTIVE' where id = '${firmS}'; update platform_staff set status = 'DEACTIVATED' where email = 'second.pf17@sample-solo.example'`);
  const back = await call(base, `/api/system/firms/${firmS}`, tokens.auditor);
  ok("PF-17 DW3 fail: back under its limit and off hold, the same firm is OK again", back.body.health === "OK" && back.body.reasons.length === 0, back.body);
  const now = clock.now(), u = [{ metric: "seats" as const, used: 1, limit: 1, over: false }];
  const soon = healthOf({ status: "TRIAL", subStatus: "TRIAL", trialEndsAt: new Date(now + 2 * 86_400_000), usage: u }, now), later = healthOf({ status: "TRIAL", subStatus: "TRIAL", trialEndsAt: new Date(now + 5 * 86_400_000), usage: u }, now);
  const overdue = healthOf({ status: "ACTIVE", subStatus: "OVERDUE", trialEndsAt: null, usage: u }, now), atLimit = healthOf({ status: "ACTIVE", subStatus: "ACTIVE", trialEndsAt: null, usage: [{ metric: "seats", used: 5, limit: 5, over: false }] }, now);
  ok("PF-17 DW3 pass/fail: a trial ending in 2 days or an overdue payment is ATTENTION; a trial ending in 5 days and a firm exactly at its limit are OK",
    soon.health === "ATTENTION" && soon.reasons.includes("trial ends within 3 days") && overdue.health === "ATTENTION" && overdue.reasons.includes("payment overdue") && later.health === "OK" && atLimit.health === "OK", { soon, later, overdue, atLimit });

  // -------------------------------------------------------------------------------- DW4: last staff sign-in
  sql(`update platform_staff set last_sign_in_at = null where firm_id in ('${firmA}', '${firmS}')`);
  const never = await call(base, `/api/system/firms/${firmS}`, tokens.support);
  sql(`update platform_staff set last_sign_in_at = '2026-11-20T10:00:00Z' where firm_id = '${firmA}' and email <> 'extra.pf17@sample-firm.example'; update platform_staff set last_sign_in_at = '2026-11-22T08:30:00Z' where email = 'extra.pf17@sample-firm.example'`);
  const newest = await call(base, `/api/system/firms/${firmA}`, tokens.support);
  ok("PF-17 DW4 pass/fail: last staff sign-in is the newest of the firm's staff (22 Nov 08:30Z over 20 Nov), and null when nobody has signed in",
    newest.body.lastStaffSignInAt === "2026-11-22T08:30:00.000Z" && never.body.lastStaffSignInAt === null, { newest: newest.body.lastStaffSignInAt, never: never.body.lastStaffSignInAt });

  // ---------------------------------------------------------------------------- DW5: one PF-4s line per call
  const trailA = () => Number(sql(`select count(*) from audit_event where firm_id = '${firmA}'`)), bypassA = () => Number(sql(`select count(*) from audit_event where firm_id = '${firmA}' and action = 'platform.bypass'`));
  const s0 = sysLines(), t0 = trailA();
  await call(base, "/api/system/firms", tokens.billing);
  const s1 = sysLines(), t1 = trailA(), last = JSON.parse(sql(`select row_to_json(a) from (select staff_id, method, route, outcome from plat_system_audit order by at desc, id desc limit 1) a`));
  await call(base, "/api/system/firms", tokens.publisher);
  const s2 = sysLines(), refusedLine = JSON.parse(sql(`select row_to_json(a) from (select route, outcome, code from plat_system_audit order by at desc, id desc limit 1) a`));
  ok("PF-17 DW5 pass: a list call writes exactly one PF-4s audit line naming the staff member and the route; a refused call writes exactly one too (REFUSED)",
    s1 === s0 + 1 && last.method === "GET" && last.route === "/api/system/firms" && last.outcome === "ALLOWED" && s2 === s1 + 1 && refusedLine.outcome === "REFUSED", { s0, s1, s2, last, refusedLine });
  ok("PF-17 DW5 fail: the list call leaves no line on a firm's own trail (its one bypass line is firm-less)", t1 === t0 && Number(sql(`select count(*) from audit_event where firm_id is null and action = 'platform.bypass' and detail->>'use' = '${FIRMS_LIST_USE}'`)) >= 1, { t0, t1 });
  const b0 = bypassA();
  await call(base, `/api/system/firms/${firmA}`, tokens.billing);
  ok("PF-17 DW5 pass: opening one firm writes one PF-4s line and that firm's own platform.bypass line (its use named), nothing for another firm",
    bypassA() === b0 + 1 && JSON.parse(sql(`select detail from audit_event where firm_id = '${firmA}' and action = 'platform.bypass' order by at desc, id desc limit 1`)).use === FIRM_READ_USE, { b0, b1: bypassA() });

  // ----------------------------------------------------------------------------------- DW6: the bypass uses
  const listUse = BYPASS_USES[FIRMS_LIST_USE], oneUse = BYPASS_USES[FIRM_READ_USE];
  ok("PF-17 DW6 pass: the two uses are on the named list for these two routes only (list: platform audit; one firm: per-firm)",
    listUse?.routes.length === 1 && listUse.routes[0].test("GET /api/system/firms") && !listUse.routes[0].test("GET /api/system/firms/x") && !listUse.routes[0].test("POST /api/system/firms") && listUse.audit === "platform"
    && oneUse?.routes.length === 1 && oneUse.routes[0].test(`GET /api/system/firms/${firmA}`) && !oneUse.routes[0].test("GET /api/system/firms") && !oneUse.routes[0].test(`DELETE /api/system/firms/${firmA}`) && !oneUse.routes[0].test(`GET /api/system/firms/${firmA}/staff`) && oneUse.audit === "per-firm");
  const svc = new SystemFirms({ db: owner, files, cases: (k, tx) => new PgCaseCount(tx, k) });
  const caller = { staffId: "pf17", keys: ["system/firm:read"] };
  const elsewhere = await throwsLike(() => inRequest({ method: "GET", path: "/api/platform/me" }, () => svc.list(caller, {})), (e) => e instanceof BypassRefused);
  const elsewhereOne = await throwsLike(() => inRequest({ method: "POST", path: "/api/system/signup-links" }, () => svc.one(caller, firmA)), (e) => e instanceof BypassRefused);
  wallUnscopedQueries();
  const unscoped = await throwsLike(() => svc.list(caller, {}), (e) => e instanceof BypassRefused);
  ok("PF-17 DW6 fail: the service called on any other route, or with no request at all in the API server, is refused (BypassRefused) before any read", elsewhere && elsewhereOne && unscoped, { elsewhere, elsewhereOne, unscoped });

  // -------------------------------------------------------------------------------------------- DW7: 404s
  const unknown = await call(base, "/api/system/firms/00000000-0000-4000-8000-00000000abcd", tokens.support), bad = await call(base, "/api/system/firms/not-a-firm", tokens.support), sqlish = await call(base, `/api/system/firms/${encodeURIComponent("1' or '1'='1")}`, tokens.support);
  ok("PF-17 DW7 pass/fail: an unknown firm id and a malformed one (a SQL-looking one too) → 404 \"No such firm.\", never 500",
    [unknown, bad, sqlish].every((r) => r.status === 404 && r.body.detail === "No such firm."), [unknown, bad, sqlish].map((r) => [r.status, r.body.detail]));

  // ------------------------------------------------------------------------------ DW8: paging and filters
  sql(`insert into platform_firm (id, key, operating_name, country_code, contact_email, status, updated_at)
       select gen_random_uuid(), 'pf17-page-' || i, 'Paging firm ' || lpad(i::text, 3, '0'), 'CA', 'p' || i || '@pf17.example', 'ACTIVE', now() from generate_series(1, ${PAGE_SIZE + 3}) i`);
  sql(`insert into platform_staff (id, firm_id, email, display_name, status, updated_at) values (gen_random_uuid(), '${firmS}', 'third.pf17@sample-solo.example', 'Sample third', 'ACTIVE', now())`);
  const p1 = await call(base, "/api/system/firms", tokens.admin), p2 = await call(base, "/api/system/firms?page=2", tokens.admin);
  const total = PAGE_SIZE + 3 + 2;
  ok(`PF-17 DW8 pass: ${total} firms in pages of ${PAGE_SIZE}: page 1 has ${PAGE_SIZE}, starting with the ATTENTION firm; page 2 has the other 5; no firm on both`,
    p1.body.total === total && p1.body.firms.length === PAGE_SIZE && p1.body.firms[0].id === firmS && p1.body.firms[0].health === "ATTENTION" && p2.body.firms.length === 5 && !p2.body.firms.some((f: any) => p1.body.firms.some((g: any) => g.id === f.id)), { total: p1.body.total, first: p1.body.firms[0]?.health, p2: p2.body.firms?.length });
  const att = await call(base, "/api/system/firms?health=ATTENTION", tokens.admin), byName = await call(base, "/api/system/firms?q=paging%20firm%20007", tokens.admin), byAddr = await call(base, `/api/system/firms?q=${encodeURIComponent("' or 1=1 --")}`, tokens.admin);
  ok("PF-17 DW8 pass/fail: ?health=ATTENTION returns only the over-limit firm; ?q= matches a name (one firm); a SQL-looking ?q= matches nothing",
    att.body.total === 1 && att.body.firms[0].id === firmS && byName.body.total === 1 && byName.body.firms[0].name === "Paging firm 007" && byAddr.status === 200 && byAddr.body.total === 0, { att: att.body.total, byName: byName.body.total, byAddr: byAddr.body.total });
  const badQ = await Promise.all(["/api/system/firms?health=SICK", "/api/system/firms?page=0", "/api/system/firms?sort=name"].map((p) => call(base, p, tokens.admin)));
  ok("PF-17 DW8 fail: an unknown health, page 0 and an unknown query key → 422 with the field named", badQ.every((r) => r.status === 422 && r.body.code === "FIRMS_QUERY"), badQ.map((r) => [r.status, r.body.fields]));
} catch (e) {
  fail++; console.log(`FAIL  unexpected error — ${String((e as Error)?.stack ?? e).slice(0, 1500)}`);
} finally {
  for (const a of apps) await a.close().catch(() => undefined);
  await owner.$disconnect().catch(() => undefined);
  try { execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", DB]); } catch { /* left for the cleanup tool */ }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
