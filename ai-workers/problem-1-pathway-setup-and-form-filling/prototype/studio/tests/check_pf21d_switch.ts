// PF-21d part 1a (R1.85; brief product/screens/PF-21d/brief.md decision 1, accepted on #3189; SA-11-16 (d)): the "Data
// erasure" switch's home and ErasurePort. Each line a pass and a fail: who may read and change a switch, a reason required,
// one event and one audit line per change, an unknown switch 404, already-so 409; the database's rules and walls;
// ErasurePort's contract on its fake and its registry, and the eraser rules (eraserCases) on a test eraser; the migration
// right after itself. Scratch databases, no model call (US$0).
//   tsx --tsconfig studio/api/tsconfig.json studio/tests/check_pf21d_switch.ts
import "reflect-metadata";
import { Module } from "@nestjs/common";
import { APP_GUARD, APP_INTERCEPTOR, NestFactory } from "@nestjs/core";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runContract } from "../ports/contracts/contract.ts";
import { erasurePortContract, eraserCases } from "../ports/contracts/erasure-port.contract.ts";
import { fakeErasure, type Eraser } from "../ports/erasure.ts";
const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations"), SCHEMA = join(STUDIO, "prisma", "schema");
const NEW = "20261124080000_pf21d_switch";
const BIN = ["/opt/homebrew/opt/postgresql@18/bin", "/usr/lib/postgresql/18/bin"].find((b) => existsSync(join(b, "psql"))) ?? "";
const PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_pf21ds_${process.pid}`, EMPTY = `xr_studio_pf21ds_empty_${process.pid}`, DEMO = `xr_studio_pf21ds_demo_${process.pid}`;
const WORK = join(STUDIO, "var", `pf21ds-${process.pid}`);
const urlOf = (db: string, user = "xr_studio") => `postgresql://${user}@127.0.0.1:54329/${db}`;
const psqlFile = (db: string, f: string) => execFileSync(join(BIN, "psql"), [urlOf(db), "-X", "-v", "ON_ERROR_STOP=1", "-q", "-f", f], { stdio: ["ignore", "ignore", "pipe"] });
const sqlOn = (db: string, q: string, user = "xr_studio") => execFileSync(join(BIN, "psql"), [urlOf(db, user), "-X", "-v", "ON_ERROR_STOP=1", "-q", "-Atc", q], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const sql = (q: string, user = "xr_studio") => sqlOn(DB, q, user);
const refusedBySql = (q: string, like: RegExp, user = "xr_studio") => { try { sql(q, user); return false; } catch (e) { return like.test(String((e as { stderr?: unknown }).stderr ?? e)); } };
const refusedAsApp = (firm: string | null, q: string, like: RegExp) => refusedBySql(`begin; select set_config('app.firm_id', '${firm ?? ""}', true); ${q}; commit`, like, "xr_app");

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 600)}` : ""}`); };
const uuid = () => globalThis.crypto.randomUUID();
const DAY = 86_400_000;
const call = async (base: string, method: string, path: string, o: { token?: string; body?: unknown } = {}) => {
  const headers: Record<string, string> = { "content-type": "application/json", "user-agent": "pf21d-check/1" };
  if (o.token) headers.authorization = `Bearer ${o.token}`;
  const r = await fetch(`${base}${path}`, { method, headers, body: o.body === undefined ? undefined : JSON.stringify(o.body) });
  const text = await r.text(); let body: any = text; try { body = JSON.parse(text); } catch { /* text */ }
  return { status: r.status, body };
};
const throws = async (f: () => Promise<unknown>, like: RegExp) => f().then(() => false, (e) => like.test(`${(e as any)?.response?.code ?? ""} ${String(e)}`));

for (const d of [DB, EMPTY, DEMO]) { execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", d]); execFileSync(join(BIN, "createdb"), [...PG, d]); }
const all = readdirSync(MIG).filter((x) => /^\d{14}_/.test(x)).sort();
for (const d of all) psqlFile(DB, join(MIG, d, "migration.sql"));
process.env.DATABASE_URL = urlOf(DB);
for (const k of Object.keys(process.env)) if (/^PLATFORM_/.test(k)) delete process.env[k];
process.env.PLATFORM_ENVIRONMENT = "local";
const { ConfigReadGuard, Db } = await import("../api/src/core.ts");
const { seedSampleFirms } = await import("../api/src/platform/seed-sample-firms.ts");
const { currentFirm, wallUnscopedQueries, withFirm } = await import("../api/src/platform/firm-scope.ts");
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
const { DSR_KEY } = await import("../api/src/platform/register/requests/service.ts");
const feature = (await import("../api/src/features/platform-erasure.ts")).default;
const { ErasureRegistry } = await import("../api/src/platform/erasure/registry.ts");
const { PlatSwitches } = await import("../api/src/platform/switches/service.ts");
const owner = new PrismaClient({ adapter: new PrismaPg({ connectionString: urlOf(DB), options: "-c TimeZone=UTC" }) });
wallUnscopedQueries();
const apps: { close(): Promise<void> }[] = [];
try {
  // ------------------------------------------------------------------- ErasurePort's contract (fake and registry)
  const rFake = await runContract(erasurePortContract, "fakeErasure", () => fakeErasure(), ok);
  const rReal = await runContract(erasurePortContract, "ErasureRegistry", () => new ErasureRegistry(), ok);
  ok("PF-21d pass/fail: ErasurePort's contract on fakeErasure and ErasureRegistry (order kept, a module once, a bad name refused)",
    [rFake, rReal].every((r) => r.failed.length === 0 && r.passed.length === 3), [rFake, rReal]);
  // A scratch table of a person's rows, and the test module's eraser over it (in the order's firm scope only).
  sql(`create table pf21d_rows (id serial primary key, firm_id uuid not null, person_id uuid not null)`);
  const seen: { firm: string; scope: string | undefined; person: string }[] = [];
  const testEraser: Eraser<any> = { module: "test.rows", async erase(tx, o) {
    seen.push({ firm: o.firmId, scope: currentFirm(), person: o.personId });
    const n = await tx.$executeRaw`delete from pf21d_rows where firm_id = ${currentFirm()}::uuid and person_id = ${o.personId}::uuid`;
    return n ? { outcome: "ERASED", note: `${n} row(s)` } : { outcome: "NOTHING", note: "no rows" };
  } };
  const rowsOf = (firm: string, person: string) => Number(sql(`select count(*) from pf21d_rows where firm_id = '${firm}' and person_id = '${person}'`));
  const addRows = (firm: string, person: string, n = 2) => { for (let i = 0; i < n; i++) sql(`insert into pf21d_rows (firm_id, person_id) values ('${firm}', '${person}')`); };
  for (const c of eraserCases(async () => ({
    eraser: testEraser,
    run: (firm, fn) => withFirm(firm, () => owner.$transaction((tx) => fn(tx))),
    seed: async () => { const f1 = uuid(), f2 = uuid(), p = uuid(), other = uuid(); addRows(f1, p); addRows(f2, p); addRows(f1, other);
      return { order: { requestId: uuid(), firmId: f1, personId: p }, otherFirmOrder: { requestId: uuid(), firmId: f2, personId: p }, otherPersonId: other }; },
    rowsOf: async (f, p) => rowsOf(f, p),
  }))) { ok(`PF-21d pass/fail (eraser rules 3-4): ${c.name}`, await c.run().then(() => true, (e) => { console.log(String(e?.message ?? e), e?.detail ?? ""); return false; })); }
  // ------------------------------------------------------------------------------------------- the test app
  const clock = new (class extends PlatformClock { t = Date.parse("2026-11-24T15:00:00Z"); override now() { return this.t; } })();
  const firmLocal = new LocalIdentity("pf21d-firm-standin-key-0123456789abcdef", () => clock.now());
  const systemLocal = new SystemLocalIdentity("pf21d-system-standin-key-0123456789abc", () => clock.now());
  @Module({ controllers: [PlatformIdentityController, SystemIdentityController, ...feature.controllers] as never[],
    providers: [Db, { provide: APP_GUARD, useClass: ConfigReadGuard }, { provide: PlatformClock, useValue: clock }, { provide: IDENTITY_PORT, useValue: firmLocal }, PlatformIdentity, PlatformGuard, { provide: APP_GUARD, useExisting: PlatformGuard },
      { provide: SYSTEM_IDENTITY_PORT, useValue: systemLocal }, SystemIdentity, SystemPlaneWall, SystemGuard, { provide: APP_GUARD, useExisting: SystemGuard },
      { provide: APP_INTERCEPTOR, useClass: FirmWallsInterceptor }, ...feature.providers] as never[] }) class TestApp {}
  const app = await NestFactory.create(TestApp, { logger: false });
  app.use(requestMiddleware());
  await app.listen(0, "127.0.0.1"); apps.push(app);
  const base = `http://127.0.0.1:${(app.getHttpServer().address() as { port: number }).port}`;
  const switches = app.get(PlatSwitches);
  await seedSampleFirms(owner);
  const staff = async (name: string, roles: string[]) => (await owner.platSystemStaff.create({ data: { email: `${name.toLowerCase()}.pf21d@expatready.example`, displayName: `Sample ${name}`, grants: { create: roles.map((roleCode) => ({ roleCode })) } } })).id;
  const OWNER = await staff("Owner", ["platform-owner"]), SUPPORT = await staff("Support", ["platform-support"]), ADMIN = await staff("Admin", ["platform-admin"]), AUDITOR = await staff("Auditor", ["platform-auditor"]);
  const tokenOf = async (id: string) => { const email = (await owner.platSystemStaff.findUniqueOrThrow({ where: { id } })).email; const r = await call(base, "POST", "/api/system/session/local", { body: { email, secondStep: true } }); if (r.status !== 200) throw new Error(JSON.stringify(r.body)); return r.body.token as string; };
  const ownerT = await tokenOf(OWNER), supportT = await tokenOf(SUPPORT), adminT = await tokenOf(ADMIN), auditorT = await tokenOf(AUDITOR);
  const firmT = (await call(base, "POST", "/api/platform/session/local", { body: { firmKey: "sample-firm", actorId: "user-R", secondStep: true } })).body.token as string;
  const A = sql(`select id from platform_firm where key = 'sample-firm'`);
  const as = { staffId: OWNER, keys: [DSR_KEY] };
  const lines = (outcome: string, route: string) => Number(sql(`select count(*) from plat_system_audit where outcome = '${outcome}' and route = '${route}'`));
  // ----------------------------------------------------------------------------------------------- the switch
  const SW = "/api/system/switches/platform.data-erasure";
  const listed = await call(base, "GET", "/api/system/switches", { token: ownerT });
  const noReason = await call(base, "POST", SW, { token: ownerT, body: { on: false } });
  const refusedBefore = lines("REFUSED", "/api/system/switches/:key");
  const swWho = await Promise.all([supportT, adminT, auditorT, firmT].map((t) => call(base, "POST", SW, { token: t, body: { on: false, reason: "Sample" } })));
  const off = await call(base, "POST", SW, { token: ownerT, body: { on: false, reason: "Sample: emergency stop while a module is checked" } });
  const offAgain = await call(base, "POST", SW, { token: ownerT, body: { on: false, reason: "Sample" } });
  const unknownSw = await call(base, "POST", "/api/system/switches/platform.nothing", { token: ownerT, body: { on: false, reason: "Sample" } });
  const nulKey = await call(base, "POST", "/api/system/switches/platform.data-erasure%00", { token: ownerT, body: { on: true, reason: "Sample" } });
  const invisible = await call(base, "POST", SW, { token: ownerT, body: { on: true, reason: "\u200b\u3164..." } });
  ok("PF-21d pass/fail (SA-11-16 (d)): \"Data erasure\" is listed on; off without a reason, or with no letter or digit → 400 (the guard's rule); Support, Admin, Auditor, a firm → 403 with REFUSED lines; a key with a NUL → 404; the Owner turns it off with a reason → one event, one ALLOWED line; off again → 409; an unknown switch → 404",
    listed.status === 200 && listed.body.switches.some((s: any) => s.key === "platform.data-erasure" && s.name === "Data erasure" && s.on === true) && noReason.status === 400 && invisible.status === 400 && nulKey.status === 404
    && swWho.every((r) => r.status === 403) && off.status === 200 && off.body.on === false && off.body.changedBy === `staff:${OWNER}`
    && sql(`select count(*) || ':' || bool_and(not is_on) from plat_switch_event`) === "1:true" && lines("ALLOWED", "/api/system/switches/:key") === 1
    && offAgain.status === 409 && unknownSw.status === 404 && lines("REFUSED", "/api/system/switches/:key") >= refusedBefore + 3, { nulKey: nulKey.status, invisible: invisible.status, listed: listed.body, noReason: noReason.status, swWho: swWho.map((r) => r.status), off: off.body, offAgain: offAgain.status, unknownSw: unknownSw.status });
  const isOff = !(await switches.isOn("platform.data-erasure"));
  const back = await switches.set(as, null, "platform.data-erasure", { on: true, reason: "Sample: back on" });
  const notStaff = await switches.list({ staffId: SUPPORT, keys: [] }).then(() => false, (e) => /MISSING_PERMISSION/.test(JSON.stringify((e as any)?.response ?? e)));
  const unknownIsOn = await switches.isOn("platform.nothing").then(() => false, (e) => /no switch platform\.nothing/.test(String(e)));
  ok("PF-21d pass/fail: isOn reads the switch (off after the change), turning it back on is a second event; the service refuses a caller without the key; an unknown switch is an error, never a silent on or off",
    isOff && back.on === true && sql(`select string_agg(is_on::text, ',' order by seq) from plat_switch_event`) === "false,true" && notStaff && unknownIsOn, { isOff, back, notStaff, unknownIsOn });
  // -------------------------------------------------------------------------------------- the database's rules
  ok("PF-21d fail (database): a switch and its events are never deleted or truncated, an event never changed; a switch's key never changes",
    refusedBySql(`delete from plat_switch`, /every switch and every change is kept/) && refusedBySql(`truncate plat_switch_event`, /every switch and every change is kept/)
    && refusedBySql(`update plat_switch_event set reason = 'x'`, /every switch and every change is kept/) && refusedBySql(`update plat_switch set key = 'platform.other'`, /every switch and every change is kept/));
  ok("PF-21d fail (database): a switch change with no reason, a bare actor, a bad key → refused by the database",
    refusedBySql(`select plat_switch_set('platform.data-erasure', false, ' ', 'staff:x')`, /plat_switch_event_facts_set/)
    && refusedBySql(`select plat_switch_set('platform.data-erasure', false, 'x', 'test')`, /plat_switch_facts_set|plat_switch_event_facts_set/)
    && refusedBySql(`insert into plat_switch (key) values ('Not A Key')`, /plat_switch_facts_set/));
  ok("PF-21d fail (walls): a firm's session cannot read or set a switch (refused by the database); xr_app, and the bypass role it may take, cannot read the switch tables directly",
    refusedAsApp(A, `select plat_switch_list()`, /only ExpatReady's own staff/) && refusedAsApp(A, `select plat_switch_set('platform.data-erasure', false, 'x', 'staff:x')`, /only ExpatReady's own staff/)
    && refusedAsApp(null, `select count(*) from plat_switch`, /permission denied/) && refusedAsApp(null, `set local role xr_staff_bypass; select count(*) from plat_switch_event`, /permission denied/));
  // ------------------------------------------------------------------------------------- the migration right after itself
  const prior = all.filter((d) => d < NEW);
  ok(`PF-21d: the migration has its own stamp, after every one before it (newest before: ${prior.at(-1)})`, all.includes(NEW) && all.filter((d) => d.slice(0, 14) === NEW.slice(0, 14)).length === 1);
  for (const d of prior) { psqlFile(EMPTY, join(MIG, d, "migration.sql")); psqlFile(DEMO, join(MIG, d, "migration.sql")); }
  const demo = new PrismaClient({ adapter: new PrismaPg({ connectionString: urlOf(DEMO), options: "-c TimeZone=UTC" }) });
  try { await seedSampleFirms(demo); } finally { await demo.$disconnect(); }
  psqlFile(EMPTY, join(MIG, NEW, "migration.sql")); psqlFile(DEMO, join(MIG, NEW, "migration.sql"));
  const shape = (d: string) => sqlOn(d, `select bool_and(c.relrowsecurity and c.relforcerowsecurity and not exists (select 1 from pg_policy p where p.polrelid = c.oid)) from pg_class c where c.relname in ('plat_switch', 'plat_switch_event')`)
    + sqlOn(d, `select key || '=' || is_on from plat_switch`) + sqlOn(d, `select count(*) from pg_proc p where p.proname like 'plat_switch%' and p.prosecdef and pg_get_userbyid(p.proowner) = 'xr_wall_reader'`);
  ok("PF-21d pass: right after its own migration, on an empty and a demo copy: both switch tables forced with no policy, \"Data erasure\" seeded on, the two definers xr_wall_reader's",
    shape(EMPTY) === "tplatform.data-erasure=true2" && shape(DEMO) === "tplatform.data-erasure=true2", { empty: shape(EMPTY), demo: shape(DEMO) });
  ok("PF-21d: every function the migration creates carries the prefix plat_switch",
    [...readFileSync(join(MIG, NEW, "migration.sql"), "utf8").replace(/^\s*--.*$/gm, "").matchAll(/CREATE (?:OR REPLACE )?FUNCTION (\w+)/g)].every((m) => /^plat_switch/.test(m[1])));
  for (const d of all.filter((x) => x > NEW)) psqlFile(EMPTY, join(MIG, d, "migration.sql"));
  mkdirSync(WORK, { recursive: true });
  const cfg = join(WORK, "prisma.config.ts");
  writeFileSync(cfg, `import { defineConfig } from "prisma/config";\nexport default defineConfig({ schema: ${JSON.stringify(SCHEMA)}, migrations: { path: ${JSON.stringify(MIG)} }, datasource: { url: ${JSON.stringify(urlOf(EMPTY))} } });\n`);
  const diff = spawnSync(join(STUDIO, "node_modules", ".bin", "prisma"), ["migrate", "diff", "--config", cfg, "--from-config-datasource", "--to-schema", SCHEMA, "--exit-code"], { cwd: STUDIO, encoding: "utf8" });
  ok("PF-21d pass: prisma migrate diff between the fully migrated database and the schema is empty", diff.status === 0, `${diff.stdout}${diff.stderr}`.slice(0, 800));
} catch (e) {
  fail++; console.log(`FAIL  unexpected error — ${String((e as Error)?.stack ?? e).slice(0, 1500)}`);
} finally {
  for (const a of apps) await a.close().catch(() => undefined);
  await owner.$disconnect().catch(() => undefined);
  rmSync(WORK, { recursive: true, force: true });
  for (const d of [DB, EMPTY, DEMO]) { try { execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", d]); } catch { /* left for the cleanup tool */ } }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
