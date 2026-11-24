// AUD-3 part 1 (R1.87; SA-11-12, SA-11 BR-14, rev 9.1, AUD-3a's ourstaff: word): the line each of our own staff's calls
// owes. Each "Done when" line passes and fails, through PF-4s's real guard, PF-23's request scope and the walled pool:
// DW1 a firm read (our Support opens firm A's billing page, a test route) writes one platform.system.firm_read line on
// firm A's trail, OUR_STAFF, ourstaff:<their id>, the request's correlation id, and none on firm B's; a refused or failed
// call writes none. DW2 a read across firms (PF-21b's holds list) writes one cross_tenant.access line on the platform's own
// trail (no firm) naming the staff member and the scope, and no line on any firm's trail. DW3 the guard-level check: a
// change route that writes no line answers 500 AUDIT_LINE_MISSING; one that writes its line answers 201 (PF-21b's place);
// a route our staff call with no declaration stops the start-up, naming it. DW4 fail-closed: a line that cannot be
// written answers 500 and the data is never sent; the writers refuse outside our staff's request.
// One process, a scratch database (dropped at the end), no model call (US$0).
//   tsx --tsconfig studio/api/tsconfig.json studio/tests/check_aud3_access.ts
import "reflect-metadata";
import { Body, Controller, Get, Module, Param, Post, Req, Res } from "@nestjs/common";
import { APP_GUARD, APP_INTERCEPTOR, NestFactory, Reflector } from "@nestjs/core";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations");
const BIN = ["/opt/homebrew/opt/postgresql@18/bin", "/usr/lib/postgresql/18/bin"].find((b) => existsSync(join(b, "psql"))) ?? "";
const PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_aud3_${process.pid}`;
const urlOf = (db: string, user = "xr_studio") => `postgresql://${user}@127.0.0.1:54329/${db}`;
const psqlFile = (f: string) => execFileSync(join(BIN, "psql"), [urlOf(DB), "-X", "-v", "ON_ERROR_STOP=1", "-q", "-f", f], { stdio: ["ignore", "ignore", "pipe"] });
const sql = (q: string) => execFileSync(join(BIN, "psql"), [urlOf(DB), "-X", "-v", "ON_ERROR_STOP=1", "-q", "-Atc", q], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 600)}` : ""}`); };
const throwsLike = async (f: () => unknown, test: (e: unknown) => boolean) => { try { await f(); return false; } catch (e) { return test(e); } };
const uuid = () => globalThis.crypto.randomUUID();
type Res = { status: number; body: any; requestId: string | null };
const call = async (base: string, method: string, path: string, o: { token?: string; body?: unknown } = {}): Promise<Res> => {
  const headers: Record<string, string> = { "content-type": "application/json", "user-agent": "aud3-check/1" };
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
const { appDatabaseUrl, asBypass, touchFirm, wallUnscopedQueries, WalledPool } = await import("../api/src/platform/firm-scope.ts");
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
const { SystemKeys, AnySystemStaff } = await import("../api/src/platform/system-identity/keys.ts");
const sysFeature = (await import("../api/src/features/platform-system-identity.ts")).default;
const holdsFeature = (await import("../api/src/features/platform-register-holds.ts")).default;
const breachesFeature = (await import("../api/src/features/platform-register-breaches.ts")).default;   // round 5: PF-21c (#3185)
const requestsFeature = (await import("../api/src/features/platform-register-requests.ts")).default;   // round 5: PF-21b part 3 (#3189)
const consoleFeature = (await import("../api/src/features/platform-system-console.ts")).default;   // round 6: PF-17 part 1 (#3155)
const signupLinksFeature = (await import("../api/src/features/platform-signup-links.ts")).default;   // round 6: R1.90 (#3040)
const supportFeature = (await import("../api/src/features/platform-system-support.ts")).default;   // round 8: PF-17 part 2 (#3225)
const erasureFeature = (await import("../api/src/features/platform-erasure.ts")).default;   // PF-21d part 1a (#3234): the "Data erasure" switch
const accessFeature = (await import("../api/src/features/audit-access.ts")).default;
const { ReadsFirm, ChangesFirm, NoFirmData } = await import("../api/src/platform/audit/access/declare.ts");
const { assertFirmDataDeclared, recordCrossTenant, recordFirmRead, SystemAccessLines, FIRM_READ, CROSS_TENANT } = await import("../api/src/platform/audit/access/lines.ts");
const { auditEvent } = await import("../api/src/platform/audit/audit-event.ts");
const port: Record<string, any> = await import("../ports/audit.ts");
const { useAlerts } = await import("../api/src/platform/observability/alerts.ts");
const owner = new PrismaClient({ adapter: new PrismaPg({ connectionString: urlOf(DB), options: "-c TimeZone=UTC" }) });
wallUnscopedQueries();
const pool = new WalledPool({ connectionString: appDatabaseUrl(urlOf(DB), {}), max: 6, options: "-c TimeZone=UTC" });
const walled = new PrismaClient({ adapter: new PrismaPg(pool) });
const apps: { close(): Promise<void> }[] = [];
const lines = (where: string) => Number(sql(`select count(*) from audit_event where ${where}`));
let handled = 0;

// Test-only routes under /api/system: a firm's billing page (a read of one firm), a change that forgets its line, a change
// that writes it, and our own plane.
@Controller("api/system/aud3-test")
class Aud3TestController {
  @Get("firms/:id/billing") @SystemKeys("system/firm:read") @ReadsFirm("id")
  billing(@Param("id") id: string) { handled++; return { firm: id, invoices: ["Sample invoice"] }; }
  @Get("firms/:id/no-uuid") @SystemKeys("system/firm:read") @ReadsFirm("nothere")
  noFirm(@Param("id") id: string) { handled++; return { firm: id }; }
  @Post("firms/:id/forgets") @SystemKeys("system/firm:read") @ChangesFirm("a change that forgets its line")
  forgets(@Param("id") id: string) { handled++; return { changed: id }; }
  @Post("firms/:id/writes") @SystemKeys("system/firm:read") @ChangesFirm("a change that writes its line")
  async writes(@Param("id") id: string, @Body() _b: unknown) {
    handled++;
    const actor = (await import("../api/src/platform/audit/context.ts")).auditContext()?.actor ?? "none";
    await walled.$transaction((tx) => auditEvent.record(tx as never, { firmId: id, actor, action: "platform.aud3_test.changed", entity: "platform_firm", entityKey: id, summary: "Sample change." }));
    return { changed: id };
  }
  @Post("firms/:id/rolls-back") @SystemKeys("system/firm:read") @ChangesFirm("a change whose line rolls back")
  async rollsBack(@Param("id") id: string) {
    handled++;
    const actor = (await import("../api/src/platform/audit/context.ts")).auditContext()?.actor ?? "none";
    await walled.$transaction(async (tx) => { await auditEvent.record(tx as never, { firmId: id, actor, action: "platform.aud3_test.changed", entity: "platform_firm", entityKey: id, summary: "Sample change." }); throw new Error("rolled back"); }).catch(() => undefined);
    return { changed: id };
  }
  @Get("firms/:id/via-req") @SystemKeys("system/firm:read") @ReadsFirm("id")
  viaReq(@Param("id") id: string, @Req() r: { res: { json(b: unknown): void } }) { handled++; r.res.json({ firm: id }); }
  @Get("mine") @AnySystemStaff("own identity") @NoFirmData("own identity")
  mine() { handled++; return { ok: true }; }
}
@Controller("api/system/aud3-undeclared") class UndeclaredController { @Get() @SystemKeys("system/firm:read") thing() { return 1; } }
class InheritedBase { @Get() @SystemKeys("system/firm:read") thing() { return 1; } }
@Controller("api/system/aud3-inherited") class InheritedController extends InheritedBase {}
// Round 5 (Lead B on #3296): a declared change that only crosses into the firm through a bypass use (touchFirm's own
// platform.bypass line, AUD-3c) and writes no change line of its own; on limit-change's named routes.
@Controller("api/system/plans/aud3-test")
class BypassOnlyController {
  @Post("firms/:id/bypass-only") @SystemKeys("system/firm:read") @ChangesFirm("a change that only touches the firm through a bypass use")
  async bypassOnly(@Param("id") id: string) { await asBypass("platform.entitlements.limit-change", () => walled.$transaction(async (tx) => { await touchFirm(tx, id); })); return { changed: id }; }
}
@Controller("api/system/aud3-raw") class RawReadController { @Get("firms/:id") @SystemKeys("system/firm:read") @ReadsFirm("id") thing(@Res() res: { send(b: unknown): void }) { res.send(1); } }

try {
  const clock = new (class extends PlatformClock { t = Date.now(); override now() { return this.t; } })();
  const firmLocal = new LocalIdentity("aud3-firm-standin-key-0123456789abcdefgh", () => clock.now());
  const systemLocal = new SystemLocalIdentity("aud3-system-standin-key-0123456789abcd", () => clock.now());
  const sysProviders = sysFeature.providers.filter((p: any) => p !== PlatformClock && p?.provide !== SYSTEM_IDENTITY_PORT && p?.provide !== APP_GUARD);
  @Module({ controllers: [PlatformIdentityController, ...sysFeature.controllers, ...holdsFeature.controllers, Aud3TestController, BypassOnlyController] as never[],
    providers: [Db, { provide: APP_GUARD, useClass: ConfigReadGuard }, { provide: PlatformClock, useValue: clock }, { provide: IDENTITY_PORT, useValue: firmLocal }, PlatformIdentity, PlatformGuard, { provide: APP_GUARD, useExisting: PlatformGuard },
      { provide: SYSTEM_IDENTITY_PORT, useValue: systemLocal }, ...sysProviders, { provide: APP_GUARD, useExisting: SystemGuard },
      ...accessFeature.providers, { provide: APP_INTERCEPTOR, useClass: FirmWallsInterceptor }, ...holdsFeature.providers] as never[] }) class TestApp {}   // the app's order: features load by file name, audit-access.ts first
  const app = await NestFactory.create(TestApp, { logger: false });
  app.use(requestMiddleware());
  await app.listen(0, "127.0.0.1"); apps.push(app);
  const base = `http://127.0.0.1:${(app.getHttpServer().address() as { port: number }).port}`;
  ok("AUD-3 setup: the app runs PF-4s's guard and AUD-3's interceptor", app.get(SystemGuard) instanceof SystemGuard && app.get(SystemAccessLines) instanceof SystemAccessLines && SystemPlaneWall !== undefined);

  await seedSampleFirms(owner);
  const newFirm = async () => { const k = `aud3-${uuid().slice(0, 8)}`; return (await owner.$queryRaw<{ id: string }[]>`insert into platform_firm (id, key, operating_name, country_code, contact_email, updated_at)
    values (gen_random_uuid(), ${k}, 'Sample access firm', 'CA', ${`${k}@sample-firm.example`}, now()) returning id::text as id`)[0].id; };
  const firmA = await newFirm(), firmB = await newFirm();
  const person = async (name: string, roles: string[]) => (await owner.platSystemStaff.create({ data: { email: `${name.toLowerCase()}.aud3@expatready.example`, displayName: `Sample ${name}`, grants: { create: roles.map((roleCode) => ({ roleCode })) } } })).id;
  const OWNER = await person("Owner", ["platform-owner"]), SUPPORT = await person("Support", ["platform-support"]), CONTENT = await person("Content", ["platform-content-publisher"]);
  const tokenOf = async (id: string) => { const email = (await owner.platSystemStaff.findUniqueOrThrow({ where: { id } })).email; const r = await call(base, "POST", "/api/system/session/local", { body: { email, secondStep: true } }); if (r.status !== 200) throw new Error(JSON.stringify(r.body)); return r.body.token as string; };
  const ownerT = await tokenOf(OWNER), supportT = await tokenOf(SUPPORT), contentT = await tokenOf(CONTENT);

  // ------------------------------------------------------------------------------------------ DW1: a firm read
  const beforeA = lines(`firm_id = '${firmA}'`), beforeB = lines(`firm_id = '${firmB}'`);
  const read = await call(base, "GET", `/api/system/aud3-test/firms/${firmA}/billing`, { token: supportT });
  const line = sql(`select actor_type || '|' || actor || '|' || action || '|' || coalesce(correlation_id, '') || '|' || entity_key from audit_event where firm_id = '${firmA}' order by at desc limit 1`);
  ok("AUD-3 DW1 pass (SA-11-12): our Support opening firm A's billing page gets the page and writes one line on firm A's trail: OUR_STAFF, ourstaff:<their id>, the request's correlation id",
    read.status === 200 && read.body.firm === firmA && lines(`firm_id = '${firmA}'`) === beforeA + 1 && line === `OUR_STAFF|ourstaff:${SUPPORT}|${FIRM_READ}|${read.requestId}|${firmA}`, { read, line });
  ok("AUD-3 DW1 fail: no line lands on firm B's trail for a read of firm A", lines(`firm_id = '${firmB}'`) === beforeB);
  const h0 = handled, a0 = lines(`firm_id = '${firmA}'`);
  const refused = await call(base, "GET", `/api/system/aud3-test/firms/${firmA}/billing`, { token: contentT });
  ok("AUD-3 DW1 fail: a staff member without the key gets 403 and no line on firm A's trail (the guard's REFUSED line is on our own table)",
    refused.status === 403 && handled === h0 && lines(`firm_id = '${firmA}'`) === a0, refused);
  const noFirm = await call(base, "GET", `/api/system/aud3-test/firms/${firmA}/no-uuid`, { token: supportT });
  ok("AUD-3 DW1 fail (fail-closed): a firm read whose declared parameter holds no firm id answers 500 AUDIT_LINE_MISSING, the data never sent",
    noFirm.status === 500 && noFirm.body.code === "AUDIT_LINE_MISSING" && noFirm.body.firm === undefined, noFirm);
  const a3 = lines(`firm_id = '${firmA}' and action = '${FIRM_READ}'`);
  const viaReq = await call(base, "GET", `/api/system/aud3-test/firms/${firmA}/via-req`, { token: supportT });
  await new Promise((r) => setTimeout(r, 300));   // the line step runs after the handler's own answer
  ok("AUD-3 DW1 pass (round 2, breaker A): a read that answers through req.res still gets its line on the firm's trail",
    viaReq.status === 200 && lines(`firm_id = '${firmA}' and action = '${FIRM_READ}'`) === a3 + 1, viaReq);
  const aud4 = (await import("../api/src/platform/audit/firm-read/action-names.ts")).AuditActionNames;
  ok("AUD-3 DW1 pass: the firm's own log (AUD-4) names the line in plain words", aud4.label(FIRM_READ) === "ExpatReady staff read the firm's records", aud4.label(FIRM_READ));

  // ------------------------------------------------------------------------------------ DW2: a read across firms
  const firmLinesBefore = lines("firm_id is not null"), crossBefore = lines(`action = '${CROSS_TENANT}'`);
  const list = await call(base, "GET", `/api/system/register/holds`, { token: ownerT });
  const cross = sql(`select coalesce(firm_id::text, 'none') || '|' || actor_type || '|' || actor || '|' || (detail->>'scope') || '|' || coalesce(correlation_id, '') from audit_event where action = '${CROSS_TENANT}' order by at desc limit 1`);
  ok("AUD-3 DW2 pass (SA-11-12, BR-14): the holds list writes one cross_tenant.access line on the platform's own trail (no firm), naming the staff member and the scope",
    list.status === 200 && lines(`action = '${CROSS_TENANT}'`) === crossBefore + 1 && cross === `none|OUR_STAFF|ourstaff:${OWNER}|legal holds of every firm|${list.requestId}`, { list: list.status, cross });
  ok("AUD-3 DW2 fail: the list writes no line on any firm's trail", lines("firm_id is not null") === firmLinesBefore);
  const filtered = await call(base, "GET", `/api/system/register/holds?firm=${firmA}`, { token: ownerT });
  // Round 6 (Lead 15's ruling): the stored row, field by field, is today's row; the same check runs before and after the
  // line moved onto the port (one attempt, its alarm, the correlation id, the platform audit workspace, no firm or case).
  const rowOf = (rid: string | null) => JSON.parse(sql(`select json_build_object('workspace', (select key from workspace w where w.id = e.workspace_id), 'firm_id', e.firm_id, 'case_id', e.case_id,
    'actor_type', e.actor_type, 'correlation_id', e.correlation_id, 'support_session_id', e.support_session_id, 'actor', e.actor, 'action', e.action, 'entity', e.entity, 'entity_key', e.entity_key,
    'summary', e.summary, 'detail', e.detail, 'combination_id', e.combination_id)::text from audit_event e where e.action = '${CROSS_TENANT}' and e.correlation_id = '${rid}'`) || "null");
  const want = (rid: string | null, filters: Record<string, string>) => ({ workspace: "platform-audit", firm_id: null, case_id: null, actor_type: "OUR_STAFF", correlation_id: rid, support_session_id: null,
    actor: `ourstaff:${OWNER}`, action: CROSS_TENANT, entity: "plat_system_access", entity_key: "/api/system/register/holds", summary: "ExpatReady staff read more than one firm's records: legal holds of every firm.",
    detail: { scope: "legal holds of every firm", method: "GET", route: "/api/system/register/holds", ...filters }, combination_id: null });
  const sameRow = (a: unknown, b: unknown) => { const norm = (v: any): any => (v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, norm(v[k])])) : v); return JSON.stringify(norm(a)) === JSON.stringify(norm(b)); };
  ok("AUD-3 DW2 (round 6): the cross_tenant.access row, field by field, is exactly today's: platform-audit workspace, no firm or case, OUR_STAFF, ourstaff:<id>, the correlation id, no support session, entity plat_system_access, the route as key, the summary, detail = scope, method, route (and the firm filter when given)",
    sameRow(rowOf(list.requestId), want(list.requestId, {})) && sameRow(rowOf(filtered.requestId), want(filtered.requestId, { firm: firmA })), { plain: rowOf(list.requestId), filtered: rowOf(filtered.requestId) });
  ok("AUD-3 DW2 pass: a list filtered to one firm still names that filter on the line",
    filtered.status === 200 && sql(`select detail->>'firm' from audit_event where action = '${CROSS_TENANT}' order by at desc limit 1`) === firmA);

  // ------------------------------------------------------------------------------- DW3: the guard-level check
  const forgot = await call(base, "POST", `/api/system/aud3-test/firms/${firmA}/forgets`, { token: supportT, body: {} });
  ok("AUD-3 DW3 fail (no route can forget): a change route that writes no line on the firm's trail answers 500 AUDIT_LINE_MISSING, the answer never sent",
    forgot.status === 500 && forgot.body.code === "AUDIT_LINE_MISSING" && forgot.body.changed === undefined, forgot);
  const a1 = lines(`firm_id = '${firmA}'`);
  const wrote = await call(base, "POST", `/api/system/aud3-test/firms/${firmA}/writes`, { token: supportT, body: {} });
  ok("AUD-3 DW3 pass: a change route that writes its own line answers 201, with exactly that one line (no read line added)",
    wrote.status === 201 && lines(`firm_id = '${firmA}'`) === a1 + 1, wrote);
  const a2 = lines(`firm_id = '${firmA}'`);
  const rolled = await call(base, "POST", `/api/system/aud3-test/firms/${firmA}/rolls-back`, { token: supportT, body: {} });
  ok("AUD-3 DW3 fail (round 2, breaker 1): a change whose line was written in a transaction that rolled back answers 500 AUDIT_LINE_MISSING (only committed lines count)",
    rolled.status === 500 && rolled.body.code === "AUDIT_LINE_MISSING" && lines(`firm_id = '${firmA}'`) === a2, rolled);
  const bp0 = lines(`firm_id = '${firmA}' and action = 'platform.bypass'`);
  const bypassOnly = await call(base, "POST", `/api/system/plans/aud3-test/firms/${firmA}/bypass-only`, { token: supportT, body: {} });
  ok("AUD-3 DW3 fail (round 5, Lead B on #3296): a declared change whose only firm line is its bypass use's own platform.bypass line answers 500 AUDIT_LINE_MISSING",
    bypassOnly.status === 500 && bypassOnly.body.code === "AUDIT_LINE_MISSING" && lines(`firm_id = '${firmA}' and action = 'platform.bypass'`) === bp0 + 1, bypassOnly);
  const placed = await call(base, "POST", "/api/system/register/holds", { token: ownerT, body: { firmId: firmB, scope: { kind: "FIRM" }, reason: "Sample: regulator's inquiry" } });
  ok("AUD-3 DW3 pass: PF-21b's place (a declared change that writes its own line) answers 201 through the check",
    placed.status === 201 && lines(`firm_id = '${firmB}' and action = 'platform.legal_hold.placed' and actor = 'ourstaff:${OWNER}'`) === 1, placed);
  const mine = await call(base, "GET", "/api/system/aud3-test/mine", { token: supportT });
  ok("AUD-3 DW3 pass: a route that touches no firm's data writes no audit_event line", mine.status === 200);
  const reflector = new Reflector();
  ok("AUD-3 DW3 fail (start-up): a route our staff call with no firm-data declaration stops the start-up, naming it",
    await throwsLike(() => assertFirmDataDeclared([UndeclaredController], reflector), (e) => /UndeclaredController\.thing \(\/api\/system\/aud3-undeclared\)/.test(String(e))));
  ok("AUD-3 DW3 pass (start-up): every route on main our staff call declares one (PF-4s's, PF-21b's holds and requests, PF-21c's breaches, PF-17's firms and support queue, R1.90's sign-up links, PF-21d's switches)",
    await throwsLike(() => assertFirmDataDeclared([...sysFeature.controllers, ...holdsFeature.controllers, ...breachesFeature.controllers, ...requestsFeature.controllers, ...consoleFeature.controllers, ...signupLinksFeature.controllers, ...supportFeature.controllers, ...erasureFeature.controllers, Aud3TestController], reflector), () => true) === false);
  ok("AUD-3 DW3 fail (start-up, round 2, breaker 4): a handler inherited from a base class with no declaration stops the start-up too",
    await throwsLike(() => assertFirmDataDeclared([InheritedController], reflector), (e) => /InheritedController\.thing \(\/api\/system\/aud3-inherited\)/.test(String(e))));
  ok("AUD-3 DW3 fail (start-up, review m1): a read that answers through @Res() stops the start-up (its answer would leave before its line)",
    await throwsLike(() => assertFirmDataDeclared([RawReadController], reflector), (e) => /RawReadController\.thing .*answers through @Res\(\)/.test(String(e))));
  // Review m4: an opt-out is visible in review. Every route on main that declares @NoFirmData, by name; a new one fails here.
  const { FIRM_DATA } = await import("../api/src/platform/audit/access/declare.ts");
  const optOuts = [...sysFeature.controllers, ...holdsFeature.controllers, ...breachesFeature.controllers, ...requestsFeature.controllers, ...consoleFeature.controllers, ...signupLinksFeature.controllers, ...supportFeature.controllers, ...erasureFeature.controllers].flatMap((c: any) => Object.getOwnPropertyNames(c.prototype).filter((k) => k !== "constructor" && (Reflect.getMetadata(FIRM_DATA, c.prototype[k]) as { kind?: string } | undefined)?.kind === "none").map((k) => `${c.name}.${k}`)).sort();
  ok("AUD-3 DW3 (review m4, round 5): the @NoFirmData routes are exactly PF-4s's who-am-I and six staff-access routes, the changes to ExpatReady's own breach and request registers, its platform switches (PF-21d), and the private sign-up link (a new opt-out must be added here, in review)",
    JSON.stringify(optOuts) === JSON.stringify(["BreachController.change", "BreachController.fromAlert", "BreachController.open", "DataRequestController.log", "DataRequestController.move", "PlatSwitchController.list", "PlatSwitchController.set", "SignupLinkController.make", "SystemIdentityController.me", "SystemStaffController.deactivate", "SystemStaffController.endSessions", "SystemStaffController.invite", "SystemStaffController.reactivate", "SystemStaffController.resetMfa", "SystemStaffController.roles"]), optOuts);
  ok("AUD-3 DW3 fail: a declaration in no plain words is refused", await throwsLike(() => ReadsFirm("1-bad"), () => true) && await throwsLike(() => ChangesFirm(""), () => true));

  // --------------------------------------------------------------------------------------- DW4: fail-closed
  // Round 6 (Lead 16): the outside refusal raises one alert with the line's ids, as before the line moved onto the port.
  const outsideAlerts: { kind: string; detail: any }[] = [];
  const wasA = useAlerts({ raise: async (kind: string, detail: any) => { outsideAlerts.push({ kind, detail }); return { raised: true }; } } as never);
  const outsideRefused = await throwsLike(() => owner.$transaction((tx) => recordCrossTenant(tx as never, "Sample scope", { method: "GET", route: "/api/system/register/holds" })), (e) => /only in a request our staff make/.test(String(e)));
  useAlerts(wasA);
  ok("AUD-3 DW4 fail (round 6, Lead 16): a cross_tenant.access line refused outside our staff's request raises one audit_write_failed alert, entity plat_system_access",
    outsideRefused && outsideAlerts.length === 1 && outsideAlerts[0].kind === "audit_write_failed" && outsideAlerts[0].detail.entity === "plat_system_access", outsideAlerts);
  ok("AUD-3 DW4 fail: the writers refuse outside our staff's request (no request at all)",
    await throwsLike(() => owner.$transaction((tx) => recordFirmRead(tx as never, firmA, { method: "GET", route: "/x" })), (e) => /only in a request our staff make/.test(String(e)))
    && await throwsLike(() => owner.$transaction((tx) => recordCrossTenant(tx as never, "Sample scope", { method: "GET", route: "/x" })), (e) => /only in a request our staff make/.test(String(e))));
  // Round 6 (Lead 15's ruling on #3209): AUD-3c's kind is a union of exactly two fixed pairs; neither can cross, and the
  // cross_tenant.access pair's detail is scope, method, route and declared filters only.
  const me = `ourstaff:${OWNER}`, route = "/api/system/register/holds";
  const pair = (action: string, entity: string, detail: Record<string, unknown>) => ({ firmId: null, actor: me, action, entity, entityKey: route, summary: "Sample.", detail });
  const goodCross = pair("cross_tenant.access", "plat_system_access", { scope: "legal holds of every firm", method: "GET", route });
  const crossings = [pair("cross_tenant.access", "plat_bypass_use", { scope: "x y", method: "GET", route }), pair("platform.bypass", "plat_system_access", { use: "x" })];
  const badDetails = [pair("cross_tenant.access", "plat_system_access", { scope: "x y", method: "GET", route, email: "jane.doe@sample.example" }),
    pair("cross_tenant.access", "plat_system_access", { scope: "x y", method: "GET", route, firmId: firmA }), pair("cross_tenant.access", "plat_system_access", { scope: "x y", method: "GET", route, firm: "not-a-firm" })];
  ok("AUD-3 DW4 fail (round 6): the schema refuses both crossings (cross_tenant.access with plat_bypass_use; platform.bypass with plat_system_access) and a cross-firm detail with any other key, a firmId key, or a firm that is not a firm id; it takes the good pair",
    crossings.every((e) => !port.OurStaffPlatformEntry.safeParse(e).success) && badDetails.every((e) => !port.OurStaffPlatformEntry.safeParse(e).success) && port.OurStaffPlatformEntry.safeParse(goodCross).success);
  ok("AUD-3 DW4 fail (round 6): the real adapter refuses both crossings with nothing written, before any request check",
    (await Promise.all(crossings.map((e) => throwsLike(() => owner.$transaction((tx) => auditEvent.record(tx as never, e as never)), (err) => !/only in a request our staff make/.test(String(err)))))).every(Boolean));
  let fctx: any = { actor: me, actorType: "OUR_STAFF" };
  const fake = port.fakeAudit({ context: () => fctx });
  await fake.record({}, goodCross);
  const fakeRefuses = async (e: unknown) => throwsLike(() => fake.record({}, e), () => true);
  const refusedLikewise = (await Promise.all([...crossings, ...badDetails].map(fakeRefuses))).every(Boolean)
    && await fakeRefuses({ firmId: firmA, actor: me, action: "platform.read", entity: "plat_system_access", entityKey: route, summary: "x", before: null, after: null });
  fctx = { actor: "staff:x", actorType: "FIRM_STAFF" };
  const refusedFirmStaff = await fakeRefuses(goodCross);
  ok("AUD-3 DW4 (round 6): the port's fake keeps the good cross_tenant.access pair in our staff's context and refuses alike: both crossings, the three bad details, the kind's entity on a firm line, a firm staff context",
    fake.platformEntries.length === 1 && refusedLikewise && refusedFirmStaff && fake.platformEntries.length === 1);
  // Round 6 (Lead 16, review m2): a cross_tenant.access write that fails at the database answers 500 with no data, after
  // exactly one try (a sequence the trigger bumps before refusing: nextval survives the rollback), and raises exactly one
  // audit_write_failed alert with the line's own ids.
  const crossAlerts: { kind: string; detail: any }[] = [];
  sql(`create sequence aud3_tries; create function aud3_refuse_cross() returns trigger language plpgsql as $$ begin perform nextval('aud3_tries'); raise exception 'aud3 test: refused'; end $$;
       create trigger aud3_refuse_cross before insert on audit_event for each row when (new.action = '${CROSS_TENANT}') execute function aud3_refuse_cross()`);
  const wasB = useAlerts({ raise: async (kind: string, detail: any) => { crossAlerts.push({ kind, detail }); return { raised: true }; } } as never);
  // The failure's metric line carries its tries (a retry inside the aborted transaction never reaches the trigger again, so
  // the sequence alone cannot count a second try): read from the process's own log lines during the call.
  const logLines: string[] = [], realOut = process.stdout.write.bind(process.stdout), realErr = process.stderr.write.bind(process.stderr);
  (process.stdout as any).write = (chunk: any, ...rest: any[]) => { logLines.push(String(chunk)); return realOut(chunk, ...rest); };
  (process.stderr as any).write = (chunk: any, ...rest: any[]) => { logLines.push(String(chunk)); return realErr(chunk, ...rest); };
  const crossFailed = await call(base, "GET", "/api/system/register/holds", { token: ownerT });
  (process.stdout as any).write = realOut; (process.stderr as any).write = realErr;
  useAlerts(wasB);
  const failLines = logLines.flatMap((l) => l.split("\n")).filter((l) => l.includes('"event":"audit_write_failed"')).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  const tries = Number(sql(`select last_value from aud3_tries`)), triedAtAll = sql(`select is_called from aud3_tries`) === "t";
  sql(`drop trigger aud3_refuse_cross on audit_event; drop function aud3_refuse_cross(); drop sequence aud3_tries`);
  ok("AUD-3 DW4 pass (round 6, Lead 16): a cross_tenant.access line refused by the database answers 500 with no holds sent, after exactly one try, and raises exactly one audit_write_failed alert (entity plat_system_access, the route as key, masked as not_an_id)",
    crossFailed.status === 500 && crossFailed.body?.holds === undefined && triedAtAll && tries === 1 && crossAlerts.length === 1 && crossAlerts[0].kind === "audit_write_failed"
    && crossAlerts[0].detail.entity === "plat_system_access" && crossAlerts[0].detail.entityKey === "not_an_id"
    && failLines.length === 1 && failLines[0].attempts === 1 && failLines[0].entity === "plat_system_access", { status: crossFailed.status, tries, crossAlerts, failLines });
  // A line that cannot be written: forced at the database for one call, by a trigger refusing the read line's action, then dropped.
  sql(`create function aud3_refuse() returns trigger language plpgsql as $$ begin raise exception 'aud3 test: refused'; end $$;
       create trigger aud3_refuse before insert on audit_event for each row when (new.action = '${FIRM_READ}') execute function aud3_refuse()`);
  const h1 = handled;
  const blocked = await call(base, "GET", `/api/system/aud3-test/firms/${firmA}/billing`, { token: supportT });
  sql(`drop trigger aud3_refuse on audit_event; drop function aud3_refuse()`);
  ok("AUD-3 DW4 pass (fail-closed, P-607 (3)): a read line that cannot be written answers 500 and the page is never sent; one audit_write_failed alert",
    blocked.status === 500 && handled === h1 + 1 && blocked.body.invoices === undefined, blocked);
} finally {
  for (const a of apps) await a.close().catch(() => undefined);
  await walled.$disconnect().catch(() => undefined); await owner.$disconnect().catch(() => undefined); await pool.end().catch(() => undefined);
  try { execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", DB]); } catch { /* left for the cleanup tool */ }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
