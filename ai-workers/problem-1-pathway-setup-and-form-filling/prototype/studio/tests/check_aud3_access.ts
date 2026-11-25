// AUD-3 part 1 (R1.87; SA-11-12, SA-11 BR-14, rev 9.1, AUD-3a's ourstaff: word): the line each of our own staff's calls
// owes. Each "Done when" line passes and fails, through PF-4s's real guard, PF-23's request scope and the walled pool:
// DW1 a firm read (our Support opens firm A's billing page, a test route) writes one platform.system.firm_read line on
// firm A's trail, OUR_STAFF, ourstaff:<their id>, the request's correlation id, and none on firm B's; a refused or failed
// call writes none. DW2 a read across firms (PF-21b's holds list) writes one cross_tenant.access line on the platform's own
// trail (no firm) naming the staff member and the scope, and no line on any firm's trail. DW3 the guard-level check: a
// change route that writes no line answers 500 AUDIT_LINE_MISSING; one that writes its line answers 201 (PF-21b's place);
// a route our staff call with no declaration stops the start-up, naming it. DW4 fail-closed: a line that cannot be
// written answers 500 and the data is never sent; the writers refuse outside our staff's request. DW5 (part 2) our
// per-firm access report and its CSV. DW7 (part 3) our audit search: dates required, its filters, keyset pages, and its
// own cross_tenant.access line naming the firm it was narrowed to.
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
const accessFeature = (await import("../api/src/features/audit-access.ts")).default as { controllers?: unknown[]; providers: unknown[] };
const { ReadsFirm, ChangesFirm, NoFirmData, ReadsAcrossFirms } = await import("../api/src/platform/audit/access/declare.ts");
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
  @Get("tickets/:id") @SystemKeys("system/firm:read") @ReadsAcrossFirms("one Sample ticket, named by its own id")
  ticket(@Param("id") id: string) { handled++; return { ticket: id }; }
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
  @Module({ controllers: [PlatformIdentityController, ...sysFeature.controllers, ...holdsFeature.controllers, Aud3TestController, BypassOnlyController, ...(accessFeature.controllers ?? [])] as never[],
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
  const OWNER = await person("Owner", ["platform-owner"]), SUPPORT = await person("Support", ["platform-support"]), CONTENT = await person("Content", ["platform-content-publisher"]), AUDITOR = await person("Auditor", ["platform-auditor"]);
  const tokenOf = async (id: string) => { const email = (await owner.platSystemStaff.findUniqueOrThrow({ where: { id } })).email; const r = await call(base, "POST", "/api/system/session/local", { body: { email, secondStep: true } }); if (r.status !== 200) throw new Error(JSON.stringify(r.body)); return r.body.token as string; };
  const ownerT = await tokenOf(OWNER), supportT = await tokenOf(SUPPORT), contentT = await tokenOf(CONTENT), auditorT = await tokenOf(AUDITOR);

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
  ok("AUD-3 DW3 pass (start-up): every route on main our staff call declares one (PF-4s's, PF-21b's holds and requests, PF-21c's breaches, PF-17's firms and support queue, R1.90's sign-up links, AUD-3 part 2's access report and part 3's search, PF-21d's switches and erasure)",
    await throwsLike(() => assertFirmDataDeclared([...sysFeature.controllers, ...holdsFeature.controllers, ...breachesFeature.controllers, ...requestsFeature.controllers, ...consoleFeature.controllers, ...signupLinksFeature.controllers, ...supportFeature.controllers, ...(accessFeature.controllers ?? []), ...erasureFeature.controllers, Aud3TestController], reflector), () => true) === false);
  ok("AUD-3 DW3 fail (start-up, round 2, breaker 4): a handler inherited from a base class with no declaration stops the start-up too",
    await throwsLike(() => assertFirmDataDeclared([InheritedController], reflector), (e) => /InheritedController\.thing \(\/api\/system\/aud3-inherited\)/.test(String(e))));
  ok("AUD-3 DW3 fail (start-up, review m1): a read that answers through @Res() stops the start-up (its answer would leave before its line)",
    await throwsLike(() => assertFirmDataDeclared([RawReadController], reflector), (e) => /RawReadController\.thing .*answers through @Res\(\)/.test(String(e))));
  // Review m4: an opt-out is visible in review. Every route on main that declares @NoFirmData, by name; a new one fails here.
  const { FIRM_DATA } = await import("../api/src/platform/audit/access/declare.ts");
  const optOuts = [...sysFeature.controllers, ...holdsFeature.controllers, ...breachesFeature.controllers, ...requestsFeature.controllers, ...consoleFeature.controllers, ...signupLinksFeature.controllers, ...supportFeature.controllers, ...erasureFeature.controllers].flatMap((c: any) => Object.getOwnPropertyNames(c.prototype).filter((k) => k !== "constructor" && (Reflect.getMetadata(FIRM_DATA, c.prototype[k]) as { kind?: string } | undefined)?.kind === "none").map((k) => `${c.name}.${k}`)).sort();
  ok("AUD-3 DW3 (review m4, round 5): the @NoFirmData routes are exactly PF-4s's who-am-I and six staff-access routes, the changes to ExpatReady's own breach and request registers, its platform switches and erasure cancel (PF-21d), and the private sign-up link (a new opt-out must be added here, in review)",
    JSON.stringify(optOuts) === JSON.stringify(["BreachController.change", "BreachController.fromAlert", "BreachController.open", "DataRequestController.log", "DataRequestController.move", "ErasureController.cancel", "PlatSwitchController.list", "PlatSwitchController.set", "SignupLinkController.make", "SystemIdentityController.me", "SystemStaffController.deactivate", "SystemStaffController.endSessions", "SystemStaffController.invite", "SystemStaffController.reactivate", "SystemStaffController.resetMfa", "SystemStaffController.roles"]), optOuts);
  ok("AUD-3 DW3 fail: a declaration in no plain words is refused", await throwsLike(() => ReadsFirm("1-bad"), () => true) && await throwsLike(() => ChangesFirm(""), () => true));

  // ------------------------------------------------------------- DW5: our side's per-firm access report (part 2)
  const REPORT_ROUTE = "/api/system/firms/:id/access-report", EXPORT_ROUTE = "/api/system/firms/:id/access-report/export";
  const day = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString().slice(0, 10), RANGE = `from=${day(-1)}&to=${day(2)}`;
  // A firm staff member's own line on firm A (not ours: never in our access report) and our unfiltered read across firms.
  const firmStaffLine = sql(`insert into audit_event (id, workspace_id, actor, action, entity, entity_key, summary, firm_id) values (gen_random_uuid(), (select id from workspace where key = 'platform-audit'),
    'staff:${uuid()}', 'platform.aud3_test.firm_staff', 'platform_firm', '${firmA}', 'Sample firm staff line.', '${firmA}') returning id`);
  await call(base, "GET", "/api/system/register/holds", { token: ownerT });
  // Breaker M1 (round 1): a read across firms whose route ignores `?firm=` (no firmFilter declared) records no firm,
  // so a caller cannot plant a line in firm A's report; the holds list (which narrows by ?firm=) still records it.
  const planted = await call(base, "GET", `/api/system/aud3-test/tickets/${uuid()}?firm=${firmA}`, { token: supportT });
  const plantedLine = sql(`select coalesce(detail->>'firm', 'none') from audit_event where action = '${CROSS_TENANT}' and correlation_id = '${planted.requestId}'`);
  ok("AUD-3 DW5 fail (breaker M1): ?firm=<firm A> on a read across firms that does not narrow by it writes its cross_tenant.access line with no firm, so it can never reach firm A's report",
    planted.status === 200 && plantedLine === "none", { planted: planted.status, plantedLine });
  // Review M1 (round 1): a read across firms filtered to firm B (a cross_tenant.access line with detail.firm = B), which
  // must never reach firm A's report; and a line written under a support session on firm A (AUD-3b's column, by insert).
  await call(base, "GET", `/api/system/register/holds?firm=${firmB}`, { token: ownerT });
  const sessionLine = sql(`insert into audit_event (id, workspace_id, actor, action, entity, entity_key, summary, firm_id, support_session_id) values (gen_random_uuid(), (select id from workspace where key = 'platform-audit'),
    'ourstaff:${SUPPORT}', 'platform.aud3_test.in_session', 'platform_firm', '${firmA}', 'Sample line in a support session.', '${firmA}', gen_random_uuid()) returning id`);
  const idsWhere = (where: string) => sql(`select coalesce(string_agg(id::text, ','), '') from audit_event where ${where}`).split(",").filter(Boolean);
  const wantA = idsWhere(`(firm_id = '${firmA}' and actor_type = 'OUR_STAFF') or (firm_id is null and action = '${CROSS_TENANT}' and detail->>'firm' = '${firmA}')`);
  const notA = idsWhere(`firm_id = '${firmB}' or (firm_id is null and action = '${CROSS_TENANT}' and (detail->>'firm' is null or detail->>'firm' = '${firmB}')) or id = '${firmStaffLine}'`);
  const filteredToB = idsWhere(`firm_id is null and action = '${CROSS_TENANT}' and detail->>'firm' = '${firmB}'`);
  const readA0 = lines(`firm_id = '${firmA}' and action = '${FIRM_READ}' and detail->>'route' = '${REPORT_ROUTE}'`), b5 = lines(`firm_id = '${firmB}'`);
  const report = await call(base, "GET", `/api/system/firms/${firmA}/access-report?${RANGE}`, { token: ownerT });
  // The report's own crossing writes its platform.bypass line on firm A in the same call (report.bypass.ts), so that line is shown too.
  const got: string[] = Array.isArray(report.body?.lines) ? report.body.lines.filter((l: { correlationId: string | null }) => l.correlationId !== report.requestId).map((l: { id: string }) => l.id) : [];
  const ownBypass = Array.isArray(report.body?.lines) ? report.body.lines.filter((l: any) => l.correlationId === report.requestId) : [];
  ok("AUD-3 DW5 pass (SA-11-31): firm A's access report shows every OUR_STAFF line on firm A's trail and every cross-firm line filtered to firm A, each with its trail, the plain action words and who (and this call's own platform.bypass line on firm A)",
    report.status === 200 && report.body.firm?.id === firmA && wantA.length > 3 && wantA.every((id) => got.includes(id)) && got.length === wantA.length
    && ownBypass.length === 1 && ownBypass[0].action === "platform.bypass" && ownBypass[0].actor === `ourstaff:${OWNER}`
    && report.body.lines.some((l: any) => l.trail === "platform" && l.action === CROSS_TENANT) && report.body.lines.every((l: any) => (l.supportSessionId ? l.who === "ExpatReady support" : l.who === "ExpatReady staff") && typeof l.at === "string")
    && report.body.lines.some((l: any) => l.action === FIRM_READ && l.actionWords === "ExpatReady staff read the firm's records"), { status: report.status, body: report.body, wantA: wantA.length, got: got.length });
  ok("AUD-3 DW5 fail (strictly firm-scoped): the report shows none of firm B's lines, no unfiltered read across firms, and no firm staff member's own line",
    report.status === 200 && notA.length > 2 && filteredToB.length === 1 && notA.every((id) => !got.includes(id)), { notA, filteredToB });
  const inSession = (report.body?.lines ?? []).find((l: any) => l.id === sessionLine);
  ok("AUD-3 DW5 pass (SA-2-19, review m7): a line written under a support session on firm A is in the report, said as \"ExpatReady support\" with its session id",
    inSession?.who === "ExpatReady support" && typeof inSession?.supportSessionId === "string", inSession);
  ok("AUD-3 DW5 pass (SA-11-12): the report's own read writes one platform.system.firm_read line on firm A's trail (and nothing on firm B's)",
    lines(`firm_id = '${firmA}' and action = '${FIRM_READ}' and detail->>'route' = '${REPORT_ROUTE}' and actor = 'ourstaff:${OWNER}'`) === readA0 + 1 && lines(`firm_id = '${firmB}'`) === b5);
  // Keyset pages: 50 lines a page, the next page from the cursor, no line twice or missed.
  for (let i = 0; i < 50; i++) await call(base, "GET", `/api/system/aud3-test/firms/${firmA}/billing`, { token: supportT });
  const p1 = await call(base, "GET", `/api/system/firms/${firmA}/access-report?${RANGE}`, { token: ownerT });
  const p2 = p1.body?.next ? await call(base, "GET", `/api/system/firms/${firmA}/access-report?${RANGE}&cursor=${p1.body.next}`, { token: ownerT }) : { status: 0, body: {} as any, requestId: null };
  const paged = [...(p1.body?.lines ?? []), ...(p2.body?.lines ?? [])].map((l: any) => l.id);
  const inRange = Number(sql(`select count(*) from audit_event where ((firm_id = '${firmA}' and actor_type = 'OUR_STAFF') or (firm_id is null and action = '${CROSS_TENANT}' and detail->>'firm' = '${firmA}')) and coalesce(correlation_id, '') <> '${p2.requestId}' and not (coalesce(correlation_id, '') = '${p1.requestId}' and action = '${FIRM_READ}')`));   // page 1's own read line is written after page 1 is read, so it is newer than both pages
  ok("AUD-3 DW5 pass (keyset pages): the first page holds 50 lines and a cursor; the next page holds the rest, newest first, no line twice or missed",
    p1.status === 200 && p1.body.lines.length === 50 && typeof p1.body.next === "string" && p2.status === 200 && p2.body.next === null && new Set(paged).size === paged.length && paged.length === inRange
    && paged.every((id, i) => i === 0 || [...p1.body.lines, ...p2.body.lines][i - 1].at >= [...p1.body.lines, ...p2.body.lines][i].at), { p1: p1.body?.lines?.length, p2: p2.body?.lines?.length, paged: paged.length, inRange });
  const a5 = lines(`firm_id = '${firmA}'`);
  const noDates = await call(base, "GET", `/api/system/firms/${firmA}/access-report`, { token: ownerT });
  const badRange = await call(base, "GET", `/api/system/firms/${firmA}/access-report?from=${day(2)}&to=${day(-1)}`, { token: ownerT });
  const unknownKey = await call(base, "GET", `/api/system/firms/${firmA}/access-report?${RANGE}&actorType=FIRM_STAFF`, { token: ownerT });
  const badCursor = await call(base, "GET", `/api/system/firms/${firmA}/access-report?${RANGE}&cursor=nope`, { token: ownerT });
  ok("AUD-3 DW5 fail (date range required): no dates → 422 DATES_REQUIRED; to before from, an unknown filter or a cursor this report did not give → 422; none writes a line",
    noDates.status === 422 && noDates.body.code === "DATES_REQUIRED" && badRange.status === 422 && unknownKey.status === 422 && badCursor.status === 422 && lines(`firm_id = '${firmA}'`) === a5, { noDates, badRange, unknownKey, badCursor });
  const ghost = uuid(), all0 = lines("true");
  const unknownFirm = await call(base, "GET", `/api/system/firms/${ghost}/access-report?${RANGE}`, { token: ownerT });
  const malformed = await call(base, "GET", `/api/system/firms/not-a-firm/access-report?${RANGE}`, { token: ownerT });
  ok("AUD-3 DW5 fail: an unknown or malformed firm id answers 404 and writes no audit_event line at all",
    unknownFirm.status === 404 && malformed.status === 404 && lines("true") === all0 && lines(`firm_id = '${ghost}'`) === 0, { unknownFirm, malformed });
  const noKey = await call(base, "GET", `/api/system/firms/${firmA}/access-report?${RANGE}`, { token: supportT });   // review m2: Support holds system/firm:read, not the audit key
  const noToken = await call(base, "GET", `/api/system/firms/${firmA}/access-report?${RANGE}`);
  ok("AUD-3 DW5 fail: our Support (system/firm:read, not system/audit-log:list) gets 403, and no token 401; neither writes a line on firm A's trail",
    noKey.status === 403 && noToken.status === 401 && lines(`firm_id = '${firmA}'`) === a5, { noKey: noKey.status, noToken: noToken.status });
  const keys = sql(`select string_agg(role_code || '=' || permission_key, ',' order by permission_key, role_code) from plat_system_role_permission where permission_key in ('system/audit-log:list', 'system/audit:export')`);
  ok("AUD-3 DW5 (catalogue rows, SA-11 §10 as the row names it): system/audit-log:list is the Platform Owner's and the Auditor's, system/audit:export the Platform Owner's only",
    keys === "platform-auditor=system/audit-log:list,platform-owner=system/audit-log:list,platform-owner=system/audit:export", keys);
  // The CSV export.
  const exp0 = lines(`firm_id = '${firmA}' and action = 'audit.exported'`);
  const csv = await fetch(`${base}/api/system/firms/${firmA}/access-report/export?${RANGE}`, { headers: { authorization: `Bearer ${ownerT}` } });
  const csvText = await csv.text();
  const exported = sql(`select actor || '|' || actor_type || '|' || entity || '|' || (detail->>'rows') || '|' || coalesce(correlation_id, '') from audit_event where firm_id = '${firmA}' and action = 'audit.exported' order by at desc limit 1`);
  ok("AUD-3 DW5 pass (SA-11-9): the Platform Owner's CSV export answers a CSV file with firm A's lines and none of firm B's, and writes one audit.exported line on firm A's trail (OUR_STAFF, the row count, the request's correlation id)",
    csv.status === 200 && /^text\/csv/.test(csv.headers.get("content-type") ?? "") && /attachment; filename="access-report-/.test(csv.headers.get("content-disposition") ?? "") && csv.headers.get("cache-control") === "no-store"
    && wantA.every((id) => csvText.includes(id)) && notA.every((id) => !csvText.includes(id)) && lines(`firm_id = '${firmA}' and action = 'audit.exported'`) === exp0 + 1
    && exported.startsWith(`ourstaff:${OWNER}|OUR_STAFF|plat_audit_export|`) && exported.endsWith(`|${csv.headers.get("x-request-id")}`), { status: csv.status, exported, head: csvText.slice(0, 300) });
  const headExp0 = lines(`firm_id = '${firmA}' and action = 'audit.exported'`);
  const headExport = await fetch(`${base}/api/system/firms/${firmA}/access-report/export?${RANGE}`, { method: "HEAD", headers: { authorization: `Bearer ${ownerT}` } });
  ok("AUD-3 DW5 fail (breaker m1): HEAD on the export answers 405 and logs no export nobody received",
    headExport.status === 405 && lines(`firm_id = '${firmA}' and action = 'audit.exported'`) === headExp0, headExport.status);
  // Breaker M2: each export uses one connection at a time, so a burst of exports leaves the pool to other routes.
  const burst = await Promise.all([...Array.from({ length: 10 }, () => fetch(`${base}/api/system/firms/${firmA}/access-report/export?${RANGE}`, { headers: { authorization: `Bearer ${ownerT}` } }).then(async (r) => { await r.text(); return r.status; })),
    call(base, "GET", "/api/system/register/holds", { token: ownerT }).then((r) => r.status)]);
  ok("AUD-3 DW5 pass (breaker M2, review m4): 10 exports at once (2 made, 8 waiting) and an unrelated holds list all answer 200", burst.every((s) => s === 200), burst);
  const over = await Promise.all(Array.from({ length: 14 }, () => fetch(`${base}/api/system/firms/${firmA}/access-report/export?${RANGE}`, { headers: { authorization: `Bearer ${ownerT}` } }).then(async (r) => { await r.text(); return r.status; })));
  ok("AUD-3 DW5 fail (review m4): past 2 made and 8 waiting, an export answers 503 EXPORTS_BUSY (nothing written for it); the others 200",
    over.filter((s) => s === 503).length >= 1 && over.every((s) => s === 200 || s === 503), over);
  const { AccessReport } = await import("../api/src/platform/audit/access/report.ts");
  const svc = app.get(AccessReport), exp413 = lines(`firm_id = '${firmA}' and action = 'audit.exported'`);
  svc.exportMax = 3;
  const tooBig = await call(base, "GET", `/api/system/firms/${firmA}/access-report/export?${RANGE}`, { token: ownerT });
  svc.exportMax = 50_000;
  ok("AUD-3 DW5 fail (review m3): an export over the limit answers 413 EXPORT_TOO_LARGE with no audit.exported line and no file",
    tooBig.status === 413 && tooBig.body.code === "EXPORT_TOO_LARGE" && lines(`firm_id = '${firmA}' and action = 'audit.exported'`) === exp413, tooBig);
  const overOk = over.filter((s) => s === 200).length;
  ok("AUD-3 DW5 pass: each export's own read writes one platform.system.firm_read line on firm A's trail too (the first, the burst's 10 and each 200 of the 14; none for HEAD, a 503 or the 413)",
    lines(`firm_id = '${firmA}' and action = '${FIRM_READ}' and detail->>'route' = '${EXPORT_ROUTE}'`) === 11 + overOk && lines(`firm_id = '${firmA}' and action = 'audit.exported' and detail->>'report' = 'access-report'`) === 11 + overOk);
  const audRead = await call(base, "GET", `/api/system/firms/${firmA}/access-report?${RANGE}`, { token: auditorT });
  const exp1 = lines(`firm_id = '${firmA}' and action = 'audit.exported'`);
  const audExport = await call(base, "GET", `/api/system/firms/${firmA}/access-report/export?${RANGE}`, { token: auditorT });
  ok("AUD-3 DW5 fail (the Auditor, read-only): the Auditor reads the report (200) but the export answers 403 with no audit.exported line",
    audRead.status === 200 && audExport.status === 403 && lines(`firm_id = '${firmA}' and action = 'audit.exported'`) === exp1, { audRead: audRead.status, audExport: audExport.status });
  sql(`insert into plat_system_role_permission (role_code, permission_key) values ('platform-auditor', 'system/audit:export')`);
  const audExport2 = await call(base, "GET", `/api/system/firms/${firmA}/access-report/export?${RANGE}`, { token: await tokenOf(AUDITOR) });
  sql(`delete from plat_system_role_permission where role_code = 'platform-auditor' and permission_key = 'system/audit:export'`);
  ok("AUD-3 DW5 pass: once the Auditor's role is granted system/audit:export, the Auditor's export answers 200 and writes its audit.exported line",
    audExport2.status === 200 && lines(`firm_id = '${firmA}' and action = 'audit.exported' and actor = 'ourstaff:${AUDITOR}'`) === 1, audExport2.status);
  // No line, no file (P-607 (3)): audit.exported refused at the database for one call.
  sql(`create function aud3_refuse_export() returns trigger language plpgsql as $$ begin raise exception 'aud3 test: refused'; end $$;
       create trigger aud3_refuse_export before insert on audit_event for each row when (new.action = 'audit.exported') execute function aud3_refuse_export()`);
  const blockedCsv = await fetch(`${base}/api/system/firms/${firmA}/access-report/export?${RANGE}`, { headers: { authorization: `Bearer ${ownerT}` } });
  const blockedText = await blockedCsv.text();
  sql(`drop trigger aud3_refuse_export on audit_event; drop function aud3_refuse_export()`);
  ok("AUD-3 DW5 fail (fail-closed): an export whose audit.exported line cannot be written answers 500 and sends no line of the report",
    blockedCsv.status === 500 && wantA.every((id) => !blockedText.includes(id)), { status: blockedCsv.status, text: blockedText.slice(0, 200) });

  // ---------------------------------------------------------------------------- DW7: our audit search (part 3)
  const SEARCH = "/api/system/audit", SEARCH_SCOPE = "our audit search";
  const searchLine = (rid: string | null) => sql(`select coalesce(firm_id::text, 'none') || '|' || actor || '|' || (detail->>'scope') || '|' || coalesce(detail->>'firm', 'none') from audit_event where action = '${CROSS_TENANT}' and correlation_id = '${rid}'`);
  const x0 = lines(`action = '${CROSS_TENANT}'`), b7 = lines(`firm_id = '${firmB}'`);
  const wantSA = idsWhere(`firm_id = '${firmA}' and at >= '${day(-1)}' and at < '${day(2)}'`).length;
  const sA = await call(base, "GET", `${SEARCH}?${RANGE}&firm=${firmA}`, { token: ownerT });
  const searchRead = (firm: string, rid: string | null) => sql(`select count(*) || '|' || coalesce(string_agg(actor || '|' || (detail->>'route') || '|' || (detail->>'scope'), ','), '') from audit_event
    where firm_id = '${firm}' and action = '${FIRM_READ}' and correlation_id = '${rid}'`);
  const allSA: any[] = [];
  for (let r = sA, n = 0; r.status === 200 && n < 20; n++) { allSA.push(...r.body.lines); if (!r.body.next) break; r = await call(base, "GET", `${SEARCH}?${RANGE}&firm=${firmA}&cursor=${r.body.next}`, { token: ownerT }); }
  ok("AUD-3 DW7 pass (SA-11-8): our search narrowed to firm A answers 200 with every line on firm A's trail in the range (any actor type), newest first, each with its firm, trail, who and plain action words",
    sA.status === 200 && sA.body.firm === firmA && allSA.length === wantSA && allSA.every((l) => l.firmId === firmA && l.trail === "firm") && allSA.some((l) => l.who === "Firm staff" && l.actorType === "FIRM_STAFF")
    && allSA.some((l) => l.action === FIRM_READ && l.actionWords === "ExpatReady staff read the firm's records") && new Set(allSA.map((l) => l.id)).size === allSA.length, { status: sA.status, got: allSA.length, wantSA });
  ok("AUD-3 DW7 fail (narrowed): the search narrowed to firm A holds none of firm B's lines and no platform-trail line", allSA.every((l) => l.firmId !== firmB) && !allSA.some((l) => l.firmId === null));
  ok("AUD-3 DW7 pass (SA-11-12, BR-14: the query that produced the evidence logs itself): each search page wrote one cross_tenant.access line on the platform's own trail naming the staff member, the scope and firm A, and one firm-read line on firm A's own trail (the firm whose lines it read)",
    searchLine(sA.requestId) === `none|ourstaff:${OWNER}|${SEARCH_SCOPE}|${firmA}` && searchRead(firmA, sA.requestId) === `1|ourstaff:${OWNER}|${SEARCH}|${SEARCH_SCOPE}`, { line: searchLine(sA.requestId), read: searchRead(firmA, sA.requestId) });
  ok("AUD-3 DW7 fail: a search of firm A's lines writes nothing on firm B's trail", lines(`firm_id = '${firmB}'`) === b7);
  // Round 1, breaker M1: narrowed to firm A by an entity key or a correlation id, never naming the firm: firm A still gets
  // its read line, and firm A's access report shows it.
  const sKey = await call(base, "GET", `${SEARCH}?${RANGE}&entityKey=${firmA}&action=platform.aud3_test.firm_staff`, { token: ownerT });
  const repAfter = await call(base, "GET", `/api/system/firms/${firmA}/access-report?${RANGE}`, { token: ownerT });
  ok("AUD-3 DW7 pass (round 1, breaker M1): a search narrowed to firm A's lines by entity key alone (no firm filter) writes one firm-read line on firm A's trail, shown in firm A's access report",
    sKey.status === 200 && sKey.body.lines.length === 1 && searchRead(firmA, sKey.requestId).startsWith("1|") && searchLine(sKey.requestId).endsWith("|none")
    && (repAfter.body?.lines ?? []).some((l: any) => l.correlationId === sKey.requestId && l.action === FIRM_READ), { sKey: sKey.body?.lines?.length, read: searchRead(firmA, sKey.requestId) });
  const sNone = await call(base, "GET", `${SEARCH}?${RANGE}&action=platform.aud3_test.nothing`, { token: ownerT });
  ok("AUD-3 DW7 fail (round 1): a search that finds no firm's line writes no line on any firm's trail, only its platform line",
    sNone.status === 200 && sNone.body.lines.length === 0 && lines(`firm_id is not null and correlation_id = '${sNone.requestId}'`) === 0 && searchLine(sNone.requestId).startsWith("none|"));
  const sAll = await call(base, "GET", `${SEARCH}?${RANGE}`, { token: auditorT });
  ok("AUD-3 DW7 pass: an unnarrowed search by the Auditor (read-only) answers 200 with lines of firm A, firm B and the platform's own trail, and its line names no firm (it is in no firm's report)",
    sAll.status === 200 && sAll.body.lines.length === 50 && typeof sAll.body.next === "string" && searchLine(sAll.requestId) === `none|ourstaff:${AUDITOR}|${SEARCH_SCOPE}|none`, { status: sAll.status, line: searchLine(sAll.requestId) });
  const sPlat = await call(base, "GET", `${SEARCH}?${RANGE}&firm=platform`, { token: ownerT });
  ok("AUD-3 DW7 pass: firm=platform reads the platform's own trail only (firm-less lines), and its line names no firm",
    sPlat.status === 200 && sPlat.body.lines.length > 0 && sPlat.body.lines.every((l: any) => l.firmId === null && l.trail === "platform") && searchLine(sPlat.requestId) === `none|ourstaff:${OWNER}|${SEARCH_SCOPE}|none`, { status: sPlat.status, line: searchLine(sPlat.requestId) });
  const sOurs = await call(base, "GET", `${SEARCH}?${RANGE}&firm=${firmA}&ours=1`, { token: ownerT });
  const sSess = await call(base, "GET", `${SEARCH}?${RANGE}&ours=1&action=platform.aud3_test.in_session`, { token: ownerT });
  ok("AUD-3 DW7 pass (the \"ExpatReady staff access\" button): ours=1 holds only our staff's lines and lines under a support session, the support one said as \"ExpatReady support\"",
    sOurs.status === 200 && sOurs.body.lines.length > 0 && sOurs.body.lines.every((l: any) => l.actorType === "OUR_STAFF" || l.supportSessionId)
    && sSess.status === 200 && sSess.body.lines.length === 1 && sSess.body.lines[0].id === sessionLine && sSess.body.lines[0].who === "ExpatReady support", { ours: sOurs.body?.lines?.length, sess: sSess.body?.lines });
  ok("AUD-3 DW7 fail (the button): ours=1 leaves out the firm staff member's own line", sOurs.status === 200 && !sOurs.body.lines.some((l: any) => l.id === firmStaffLine));
  const sCorr = await call(base, "GET", `${SEARCH}?${RANGE}&correlationId=${read.requestId}`, { token: ownerT });
  const sType = await call(base, "GET", `${SEARCH}?${RANGE}&firm=${firmA}&actorType=FIRM_STAFF&action=platform.aud3_test.firm_staff&entity=platform_firm&entityKey=${firmA}`, { token: ownerT });
  ok("AUD-3 DW7 pass (filters): a correlation id finds exactly that request's lines (DW1's read: its one firm-read line); actor type, action, entity and entity key narrow to the one firm staff line",
    sCorr.status === 200 && sCorr.body.lines.length === lines(`correlation_id = '${read.requestId}'`) && sCorr.body.lines.some((l: any) => l.action === FIRM_READ && l.firmId === firmA) && sCorr.body.lines.every((l: any) => l.correlationId === read.requestId)
    && sType.status === 200 && sType.body.lines.length === 1 && sType.body.lines[0].id === firmStaffLine, { corr: sCorr.body?.lines?.length, type: sType.body?.lines });
  const x1 = lines(`action = '${CROSS_TENANT}'`), all1 = lines("true");
  const sNoDates = await call(base, "GET", `${SEARCH}?firm=${firmA}`, { token: ownerT });
  const sLong = await call(base, "GET", `${SEARCH}?from=2024-01-01&to=2026-01-02`, { token: ownerT });
  const sBadFirm = await call(base, "GET", `${SEARCH}?${RANGE}&firm=not-a-firm`, { token: ownerT });
  const sBadType = await call(base, "GET", `${SEARCH}?${RANGE}&actorType=ROBOT`, { token: ownerT });
  const sUnknown = await call(base, "GET", `${SEARCH}?${RANGE}&person=${OWNER}`, { token: ownerT });
  const sBadCursor = await call(base, "GET", `${SEARCH}?${RANGE}&cursor=nope`, { token: ownerT });
  const feb30 = Buffer.from(JSON.stringify(["2026-02-30T00:00:00.000000Z", uuid()])).toString("base64url");
  const sFeb30 = await call(base, "GET", `${SEARCH}?${RANGE}&cursor=${feb30}`, { token: ownerT }), rFeb30 = await call(base, "GET", `/api/system/firms/${firmA}/access-report?${RANGE}&cursor=${feb30}`, { token: ownerT });
  const sNul = await call(base, "GET", `${SEARCH}?${RANGE}&action=a%00`, { token: ownerT }), sNulCorr = await call(base, "GET", `${SEARCH}?${RANGE}&correlationId=a%00`, { token: ownerT });
  const all1b = lines("true");
  const sHead = await fetch(`${base}${SEARCH}?${RANGE}&firm=${firmA}`, { method: "HEAD", headers: { authorization: `Bearer ${ownerT}` } });
  ok("AUD-3 DW7 fail (round 1, breaker m1-m3): a cursor of 30 February → 422 BAD_CURSOR (search and access report), a NUL byte in a filter → 422, HEAD → 405; none writes a line (the report's own crossing aside)",
    sFeb30.status === 422 && sFeb30.body.code === "BAD_CURSOR" && rFeb30.status === 422 && sNul.status === 422 && sNulCorr.status === 422 && sHead.status === 405 && lines("true") === all1b,
    { sFeb30: sFeb30.status, rFeb30: rFeb30.status, sNul: sNul.status, sNulCorr: sNulCorr.status, sHead: sHead.status });
  ok("AUD-3 DW7 fail (date range required): no dates → 422 DATES_REQUIRED; over a year → 422 RANGE_TOO_LONG; a malformed firm, an unknown actor type, a filter this search does not take, a cursor it did not give → 422; none writes any line",
    sNoDates.status === 422 && sNoDates.body.code === "DATES_REQUIRED" && sLong.status === 422 && sLong.body.code === "RANGE_TOO_LONG" && sBadFirm.status === 422 && sBadFirm.body.fields?.firm
    && sBadType.status === 422 && sUnknown.status === 422 && sBadCursor.status === 422 && lines("true") === all1, { sNoDates: sNoDates.body, sLong: sLong.status, sBadFirm: sBadFirm.body, sBadType: sBadType.status, sUnknown: sUnknown.status, sBadCursor: sBadCursor.status });
  const sNoKey = await call(base, "GET", `${SEARCH}?${RANGE}`, { token: supportT }), sNoToken = await call(base, "GET", `${SEARCH}?${RANGE}`);
  ok("AUD-3 DW7 fail (system/audit-log:list): our Support gets 403 and no token 401; neither writes a cross_tenant.access line",
    sNoKey.status === 403 && sNoToken.status === 401 && lines(`action = '${CROSS_TENANT}'`) === x1, { sNoKey: sNoKey.status, sNoToken: sNoToken.status });
  // AG-13-31: equal times page with no skip or repeat (120 lines on firm B at one moment).
  const tie = new Date(Date.now() - 3_600_000).toISOString();
  sql(`insert into audit_event (id, workspace_id, actor, action, entity, entity_key, summary, firm_id, at) select gen_random_uuid(), (select id from workspace where key = 'platform-audit'),
    'staff:${uuid()}', 'platform.aud3_test.tie', 'platform_firm', '${firmB}', 'Sample tie line.', '${firmB}', '${tie}' from generate_series(1, 120)`);
  const tied: string[] = [];
  for (let r = await call(base, "GET", `${SEARCH}?${RANGE}&firm=${firmB}&action=platform.aud3_test.tie`, { token: ownerT }), n = 0; r.status === 200 && n < 5; n++) {
    tied.push(...r.body.lines.map((l: any) => l.id)); if (!r.body.next) break;
    r = await call(base, "GET", `${SEARCH}?${RANGE}&firm=${firmB}&action=platform.aud3_test.tie&cursor=${r.body.next}`, { token: ownerT });
  }
  ok("AUD-3 DW7 pass (AG-13-31, keyset): 120 lines at one moment page as 50, 50, 20 with no line twice or missed", tied.length === 120 && new Set(tied).size === 120, tied.length);

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
