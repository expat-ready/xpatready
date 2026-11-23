// PF-21d part 1 (R1.85; brief product/screens/PF-21d/brief.md, accepted on #3189; SA-11-16, -18, -28, -40): an approved
// deletion request on the register carried out 7 days after approval, behind the "Data erasure" switch. Each line a pass
// and a fail: never before day 7, cancel stops it; switch off → nothing erased (one step); a held person → HELD, nothing
// erased, and the run after the release erases; one eraser failing rolls the whole order back; a KEPT → HELD (partial);
// only the person's rows of that firm go; who may approve, cancel and switch; the database's rules and walls; ErasurePort's
// contract on its fake and its registry; the migration right after itself. Scratch databases, no model call (US$0).
//   tsx --tsconfig studio/api/tsconfig.json studio/tests/check_pf21d_erasure.ts
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
const NEW = "20261123110000_pf21d_erasure";
const BIN = ["/opt/homebrew/opt/postgresql@18/bin", "/usr/lib/postgresql/18/bin"].find((b) => existsSync(join(b, "psql"))) ?? "";
const PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_pf21d_${process.pid}`, EMPTY = `xr_studio_pf21d_empty_${process.pid}`, DEMO = `xr_studio_pf21d_demo_${process.pid}`;
const WORK = join(STUDIO, "var", `pf21d-${process.pid}`);
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
const { PlatformJobs } = await import("../api/src/platform/jobs/platform-jobs.ts");
const { DataRequests, DSR_KEY } = await import("../api/src/platform/register/requests/service.ts");
const requestsFeature = (await import("../api/src/features/platform-register-requests.ts")).default;
const feature = (await import("../api/src/features/platform-erasure.ts")).default;
const { ERASURE_DAILY } = await import("../api/src/features/platform-erasure.ts");
const { Erasure, ERASURE_QUEUE, ERASURE_CRON } = await import("../api/src/platform/erasure/service.ts");
const { ErasureRegistry } = await import("../api/src/platform/erasure/registry.ts");
const owner = new PrismaClient({ adapter: new PrismaPg({ connectionString: urlOf(DB), options: "-c TimeZone=UTC" }) });
wallUnscopedQueries();
const apps: { close(): Promise<void> }[] = [];
try {
  // ------------------------------------------------------------------- ErasurePort's contract (fake and registry)
  for (const [name, make] of [["fakeErasure", () => fakeErasure()], ["ErasureRegistry", () => new ErasureRegistry()]] as const) {
    const r = await runContract(erasurePortContract, name, make, ok);
    ok(`PF-21d pass/fail: ErasurePort's contract on ${name} (order kept, a module once, a bad name refused)`, r.failed.length === 0 && r.passed.length === 3, r);
  }
  // A scratch table of a person's rows, and the test module's eraser over it (in the order's firm scope only).
  sql(`create table pf21d_rows (id serial primary key, firm_id uuid not null, person_id uuid not null)`);
  const seen: { firm: string; scope: string | undefined; person: string }[] = [];
  const testEraser: Eraser<any> = { module: "test.rows", async erase(tx, o) {
    seen.push({ firm: o.firmId, scope: currentFirm(), person: o.personId });
    const n = await tx.$executeRaw`delete from pf21d_rows where firm_id = ${currentFirm()}::uuid and person_id = ${o.personId}::uuid`;
    return n ? { outcome: "ERASED", note: `${n} row(s)` } : { outcome: "NOTHING", note: "no rows" };
  } };
  let mode: "nothing" | "throw" | "kept" = "nothing";
  const secondEraser: Eraser<any> = { module: "test.second", async erase() {
    if (mode === "throw") throw new Error("Sample: the second module is down");
    return mode === "kept" ? { outcome: "KEPT", note: "client_financial: 2 rows kept 7 years, name replaced by a reference" } : { outcome: "NOTHING", note: "no rows" };
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
  const jobCalls: string[] = [];
  const stubJobs = { handle: async (n: string) => { jobCalls.push(`handle ${n}`); }, recurring: async (n: string, c: string) => { jobCalls.push(`recurring ${n} ${c}`); } };
  @Module({ controllers: [PlatformIdentityController, SystemIdentityController, ...requestsFeature.controllers, ...feature.controllers] as never[],
    providers: [Db, { provide: APP_GUARD, useClass: ConfigReadGuard }, { provide: PlatformClock, useValue: clock }, { provide: IDENTITY_PORT, useValue: firmLocal }, PlatformIdentity, PlatformGuard, { provide: APP_GUARD, useExisting: PlatformGuard },
      { provide: SYSTEM_IDENTITY_PORT, useValue: systemLocal }, SystemIdentity, SystemPlaneWall, SystemGuard, { provide: APP_GUARD, useExisting: SystemGuard },
      { provide: APP_INTERCEPTOR, useClass: FirmWallsInterceptor }, { provide: PlatformJobs, useValue: stubJobs }, ...requestsFeature.providers, ...feature.providers] as never[] }) class TestApp {}
  const app = await NestFactory.create(TestApp, { logger: false });
  app.use(requestMiddleware());
  await app.listen(0, "127.0.0.1"); apps.push(app);
  const base = `http://127.0.0.1:${(app.getHttpServer().address() as { port: number }).port}`;
  const svc = app.get(Erasure), requests = app.get(DataRequests);
  app.get(ErasureRegistry).register(testEraser); app.get(ErasureRegistry).register(secondEraser);
  ok("PF-21d pass: the feature registers the daily job on PF-14's runner (handler and schedule)",
    app.get(ERASURE_DAILY) === true && jobCalls.includes(`handle ${ERASURE_QUEUE}`) && jobCalls.includes(`recurring ${ERASURE_QUEUE} ${ERASURE_CRON}`), jobCalls);
  await seedSampleFirms(owner);
  const staff = async (name: string, roles: string[]) => (await owner.platSystemStaff.create({ data: { email: `${name.toLowerCase()}.pf21d@expatready.example`, displayName: `Sample ${name}`, grants: { create: roles.map((roleCode) => ({ roleCode })) } } })).id;
  const OWNER = await staff("Owner", ["platform-owner"]), SUPPORT = await staff("Support", ["platform-support"]), AUDITOR = await staff("Auditor", ["platform-auditor"]);
  const tokenOf = async (id: string) => { const email = (await owner.platSystemStaff.findUniqueOrThrow({ where: { id } })).email; const r = await call(base, "POST", "/api/system/session/local", { body: { email, secondStep: true } }); if (r.status !== 200) throw new Error(JSON.stringify(r.body)); return r.body.token as string; };
  const ownerT = await tokenOf(OWNER), supportT = await tokenOf(SUPPORT), auditorT = await tokenOf(AUDITOR);
  const firmT = (await call(base, "POST", "/api/platform/session/local", { body: { firmKey: "sample-firm", actorId: "user-R", secondStep: true } })).body.token as string;
  const A = sql(`select id from platform_firm where key = 'sample-firm'`), B = sql(`select id from platform_firm where key <> 'sample-firm' order by key limit 1`);
  for (const f of [A, B]) sql(`insert into fo_sales_setup (firm_id) values ('${f}') on conflict do nothing`);
  const person = (firm: string) => sql(`insert into fo_person (firm_id, given_names, family_name, created_by, updated_at) values ('${firm}', 'Sample', 'Person', 'seed:pf21d', now()) returning id`).split("\n")[0];
  const as = { staffId: OWNER, keys: [DSR_KEY] };
  const today = () => new Date(clock.t).toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
  const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
  const deletion = async (firm: string | null, p: string | null, type = "DELETION") => (await requests.log(as, null, { type, requester: "Sample Requester", requesterEmail: "requester.pf21d@example.com", receivedOn: today(),
    ...(firm && p ? { firmId: firm, subject: { kind: "PERSON", id: p } } : {}) })).id;
  const kinds = (id: string) => sql(`select string_agg(kind::text, ',' order by seq) from plat_data_request_event where request_id = '${id}'`);
  const statusOf = (id: string) => sql(`select status || '|' || coalesce(erase_on::text, '-') from plat_data_request where id = '${id}'`);
  const lines = (outcome: string, route: string) => Number(sql(`select count(*) from plat_system_audit where outcome = '${outcome}' and route = '${route}'`));
  // ----------------------------------------------------------------------------------------- approve: who and what
  const P1 = person(A), P1fam = person(A), P1b = person(B);
  addRows(A, P1); addRows(A, P1fam); addRows(B, P1b);
  const r1 = await deletion(A, P1), access = await deletion(A, P1, "ACCESS"), noPerson = await deletion(null, null), stranger = await deletion(A, P1b);
  const AP = "/api/system/erasure/requests/:id/approve";
  const who = await Promise.all([firmT, supportT, auditorT].map((t) => call(base, "POST", `/api/system/erasure/requests/${r1}/approve`, { token: t })));
  ok("PF-21d fail: a firm's staff, our Support and our Auditor cannot approve (403); nothing scheduled",
    who.every((r) => r.status === 403) && statusOf(r1) === "PENDING|-", who.map((r) => [r.status, r.body.code]));
  const unfit = await Promise.all([access, noPerson, stranger, uuid()].map((id) => call(base, "POST", `/api/system/erasure/requests/${id}/approve`, { token: ownerT })));
  ok("PF-21d fail (SA-11-40, review m2 of #3189): an access request, a deletion naming no person, a person not in that firm → 422 each with its code; an unknown request → 404; each a REFUSED line; nothing scheduled",
    unfit.map((r) => `${r.status}:${r.body.code}`).join() === "422:NOT_DELETION,422:NO_PERSON,422:PERSON_NOT_IN_FIRM,404:NOT_FOUND" && lines("REFUSED", AP) >= 4
    && [access, noPerson, stranger].every((id) => statusOf(id).endsWith("|-")), unfit.map((r) => r.body));
  const day0 = today();
  const ok1 = await call(base, "POST", `/api/system/erasure/requests/${r1}/approve`, { token: ownerT });
  const twice = await call(base, "POST", `/api/system/erasure/requests/${r1}/approve`, { token: ownerT });
  ok("PF-21d pass (SA-11-16 (a)): the Platform Owner approves → IN_PROGRESS, \"Erasing on\" approval day + 7, an ERASURE_APPROVED step and one ALLOWED line; a second approve → 409",
    ok1.status === 200 && ok1.body.eraseOn === addDays(day0, 7) && ok1.body.status === "IN_PROGRESS" && kinds(r1) === "RECEIVED,STATUS_CHANGED,ERASURE_APPROVED"
    && sql(`select note from plat_data_request_event where request_id = '${r1}' and kind = 'ERASURE_APPROVED'`) === `Erasing on ${addDays(day0, 7)}` && lines("ALLOWED", AP) === 1
    && twice.status === 409 && twice.body.code === "ALREADY_SCHEDULED", { ok1: ok1.body, twice: twice.body });
  // ----------------------------------------------------------------------------------------------- the switch
  const SW = "/api/system/switches/platform.data-erasure";
  const listed = await call(base, "GET", "/api/system/switches", { token: ownerT });
  const noReason = await call(base, "POST", SW, { token: ownerT, body: { on: false } });
  const swWho = await Promise.all([supportT, auditorT, firmT].map((t) => call(base, "POST", SW, { token: t, body: { on: false, reason: "Sample" } })));
  const off = await call(base, "POST", SW, { token: ownerT, body: { on: false, reason: "Sample: emergency stop while a module is checked" } });
  const offAgain = await call(base, "POST", SW, { token: ownerT, body: { on: false, reason: "Sample" } });
  const unknownSw = await call(base, "POST", "/api/system/switches/platform.nothing", { token: ownerT, body: { on: false, reason: "Sample" } });
  ok("PF-21d pass/fail (SA-11-16 (d)): \"Data erasure\" is listed on; off without a reason → 422; Support, Auditor, a firm → 403; the Owner turns it off with a reason → one event, one ALLOWED line; off again → 409; an unknown switch → 404",
    listed.status === 200 && listed.body.switches.some((s: any) => s.key === "platform.data-erasure" && s.name === "Data erasure" && s.on === true) && noReason.status === 422
    && swWho.every((r) => r.status === 403) && off.status === 200 && off.body.on === false && off.body.changedBy === `staff:${OWNER}`
    && sql(`select count(*) || ':' || bool_and(not is_on) from plat_switch_event`) === "1:true" && lines("ALLOWED", "/api/system/switches/:key") === 1
    && offAgain.status === 409 && unknownSw.status === 404, { listed: listed.body, noReason: noReason.status, swWho: swWho.map((r) => r.status), off: off.body, offAgain: offAgain.status, unknownSw: unknownSw.status });
  const swOn = async () => { const r = await svc["switches"].set(as, null, "platform.data-erasure", { on: true, reason: "Sample: back on" }); return r.on; };
  // -------------------------------------------------------------------------------- the 7 days, cancel, the switch
  const start = clock.t;
  let early = 0; seen.length = 0;
  for (let d = 0; d < 7; d++) { clock.t = start + d * DAY; const r = await svc.run(); early += r.erased.length + r.skipped.length + r.held.length; }
  ok("PF-21d fail (SA-11-16 (a)): on days 0 to 6 the job takes nothing; the person's rows stay", early === 0 && rowsOf(A, P1) === 2 && seen.length === 0, { early, seen: seen.length });
  clock.t = start + 6 * DAY;
  const cancelled = { body: await svc.cancel(as, null, r1, { note: "Sample: the person withdrew the request" }) };
  clock.t = start + 7 * DAY; const afterCancel = await svc.run();
  const cancel2 = await throws(() => svc.cancel(as, null, r1, {}), /NOT_SCHEDULED/);
  ok("PF-21d pass/fail: cancel on day 6 stops it (eraseOn cleared, an ERASURE_CANCELLED step); day 7 takes nothing; a second cancel → 409",
    cancelled.body.eraseOn === null && afterCancel.erased.length + afterCancel.skipped.length === 0 && rowsOf(A, P1) === 2 && kinds(r1).endsWith("ERASURE_CANCELLED") && cancel2, { cancelled: cancelled.body, afterCancel });
  const again = await svc.approve(as, null, r1);   // day 7: erase on day 14; the switch is still off
  clock.t = start + 14 * DAY; const skipped = await svc.run(); await svc.run();
  ok("PF-21d fail (SA-11-16 (d)): with the switch off, day 14 erases nothing: one ERASURE_SKIPPED step over two runs; the order stays scheduled",
    again.eraseOn === addDays(addDays(day0, 7), 7) && skipped.skipped.includes(r1) && rowsOf(A, P1) === 2 && (kinds(r1).match(/ERASURE_SKIPPED/g) ?? []).length === 1 && statusOf(r1) === `IN_PROGRESS|${again.eraseOn}`, { skipped, k: kinds(r1) });
  const turnedOn = await swOn(); seen.length = 0;
  const erased = await svc.run();
  ok("PF-21d pass (SA-11-40): switch on → the next run erases the person's rows in that firm only (a family member's and another firm's stay); each module's result a step; COMPLETED with the actions taken, eraseOn cleared",
    turnedOn && erased.erased.includes(r1) && rowsOf(A, P1) === 0 && rowsOf(A, P1fam) === 2 && rowsOf(B, P1b) === 2 && statusOf(r1) === "COMPLETED|-"
    && sql(`select string_agg(note, ' / ' order by seq) from plat_data_request_event where request_id = '${r1}' and kind = 'ERASURE_RESULT'`) === "test.rows: ERASED — 2 row(s) / test.second: NOTHING — no rows"
    && /test\.rows: ERASED/.test(sql(`select actions_taken from plat_data_request where id = '${r1}'`)), { erased, s: statusOf(r1) });
  ok("PF-21d fail: firm A's order never runs an eraser with or in firm B (each call names firm A and runs in its scope)", seen.length === 1 && seen.every((s) => s.firm === A && s.scope === A && s.person === P1), seen);
  const rerun = await svc.run(), late = await throws(() => svc.cancel(as, null, r1, {}), /NOT_SCHEDULED/);
  ok("PF-21d fail: a done erasure is never run again, and cannot be cancelled (409)", rerun.erased.length === 0 && late, rerun);
  // -------------------------------------------------------------------------------------------- a legal hold
  const r2 = await deletion(A, P1fam); await svc.approve(as, null, r2);
  const hold = sql(`insert into plat_legal_hold (id, firm_id, scope_kind, target_id, reason, placed_by) values (gen_random_uuid(), '${A}', 'PERSON', '${P1fam}', 'Sample: a court order on the records', 'staff:${OWNER}') returning id`).split("\n")[0];
  clock.t += 7 * DAY; seen.length = 0;
  const held = await svc.run(); await svc.run();
  ok("PF-21d fail (SA-11-18, SA-11-28): a held person → HELD with the hold's reason (one step over two runs), no eraser called, the rows stay, still scheduled",
    held.held.includes(r2) && seen.length === 0 && rowsOf(A, P1fam) === 2 && statusOf(r2).startsWith("HELD|2") && (kinds(r2).match(/ERASURE_HELD/g) ?? []).length === 1
    && sql(`select note from plat_data_request_event where request_id = '${r2}' and kind = 'ERASURE_HELD'`).includes("Sample: a court order on the records"), { held, s: statusOf(r2), k: kinds(r2) });
  sql(`update plat_legal_hold set released_by = 'staff:${OWNER}', released_at = now(), release_reason = 'Sample: order lifted' where id = '${hold}'`);
  const released = await svc.run();
  ok("PF-21d pass: after the release the next run erases it → COMPLETED", released.erased.includes(r2) && rowsOf(A, P1fam) === 0 && statusOf(r2) === "COMPLETED|-", { released, s: statusOf(r2) });
  // ------------------------------------------------------------------------------- one module failing; a KEPT
  const P3 = person(A); addRows(A, P3);
  const r3 = await deletion(A, P3); await svc.approve(as, null, r3); clock.t += 7 * DAY;
  mode = "throw"; const failed = await svc.run();
  ok("PF-21d fail (SA-11-40 Failure): the second module failing rolls back the first module's erasure: the rows stay, nothing COMPLETED, still scheduled; counted failed (the job fails and retries)",
    failed.failed === 1 && rowsOf(A, P3) === 2 && statusOf(r3).startsWith("IN_PROGRESS|2") && !kinds(r3).includes("ERASURE_RESULT"), { failed, s: statusOf(r3) });
  mode = "kept"; const partial = await svc.run();
  ok("PF-21d pass/fail (SA-11-16 (c), SA-11-28): a module keeping a floor class → HELD (partial), never a false COMPLETED; what was kept and why in the step and the actions taken; eraseOn cleared",
    partial.partial.includes(r3) && rowsOf(A, P3) === 0 && statusOf(r3) === "HELD|-" && /test\.second: KEPT/.test(sql(`select actions_taken from plat_data_request where id = '${r3}'`)), { partial, s: statusOf(r3) });
  mode = "nothing";
  // -------------------------------------------------------------------------------------- the database's rules
  ok("PF-21d fail (database): a switch and its events are never deleted or truncated, an event never changed; a switch's key never changes",
    refusedBySql(`delete from plat_switch`, /every switch and every change is kept/) && refusedBySql(`truncate plat_switch_event`, /every switch and every change is kept/)
    && refusedBySql(`update plat_switch_event set reason = 'x'`, /every switch and every change is kept/) && refusedBySql(`update plat_switch set key = 'platform.other'`, /every switch and every change is kept/));
  ok("PF-21d fail (database): an erase day on an access request or before the day received, a forged mark through the job's step, a switch change with no reason → refused",
    refusedBySql(`update plat_data_request set erase_on = received_on + 7 where id = '${access}'`, /plat_data_request_erase_on_set/)
    && refusedBySql(`select plat_data_request_erasure_step('${r3}', 'OVERDUE_ALERTED', 'x', 'system:x', false)`, /not an erasure step/)
    && refusedBySql(`select plat_switch_set('platform.data-erasure', false, ' ', 'staff:x')`, /plat_switch_event_facts_set/));
  ok("PF-21d fail (walls): a firm's session cannot read or set a switch, approve, cancel or run an order (refused by the database); xr_app cannot read the switch tables directly",
    refusedAsApp(A, `select plat_switch_list()`, /only ExpatReady's own staff/) && refusedAsApp(A, `select plat_switch_set('platform.data-erasure', false, 'x', 'staff:x')`, /only ExpatReady's own staff/)
    && refusedAsApp(A, `select plat_data_request_erasure_approve('${r1}', '2027-01-01', 'staff:x')`, /only ExpatReady's own staff/)
    && refusedAsApp(A, `select plat_data_request_erasure_due('2027-01-01', 10)`, /only ExpatReady's own staff/)
    && refusedAsApp(null, `select count(*) from plat_switch`, /permission denied/) && refusedAsApp(null, `set local role xr_staff_bypass; select count(*) from plat_switch_event`, /permission denied/));
  // ------------------------------------------------------------------------------------- the migration right after itself
  const prior = all.filter((d) => d < NEW);
  ok(`PF-21d: the migration has its own stamp, after every one before it (newest before: ${prior.at(-1)})`, all.includes(NEW) && all.filter((d) => d.slice(0, 14) === NEW.slice(0, 14)).length === 1);
  for (const d of prior) { psqlFile(EMPTY, join(MIG, d, "migration.sql")); psqlFile(DEMO, join(MIG, d, "migration.sql")); }
  const demo = new PrismaClient({ adapter: new PrismaPg({ connectionString: urlOf(DEMO), options: "-c TimeZone=UTC" }) });
  try { await seedSampleFirms(demo); } finally { await demo.$disconnect(); }
  psqlFile(EMPTY, join(MIG, NEW, "migration.sql")); psqlFile(DEMO, join(MIG, NEW, "migration.sql"));
  const shape = (d: string) => sqlOn(d, `select bool_and(c.relrowsecurity and c.relforcerowsecurity and not exists (select 1 from pg_policy p where p.polrelid = c.oid)) from pg_class c where c.relname in ('plat_switch', 'plat_switch_event')`)
    + sqlOn(d, `select key || '=' || is_on from plat_switch`) + sqlOn(d, `select count(*) from pg_proc p where (p.proname like 'plat_switch%' or p.proname like 'plat_data_request_erasure%') and p.prosecdef and pg_get_userbyid(p.proowner) = 'xr_wall_reader'`);
  ok("PF-21d pass: right after its own migration, on an empty and a demo copy: both switch tables forced with no policy, \"Data erasure\" seeded on, the eight definers xr_wall_reader's",
    shape(EMPTY) === "tplatform.data-erasure=true8" && shape(DEMO) === "tplatform.data-erasure=true8", { empty: shape(EMPTY), demo: shape(DEMO) });
  ok("PF-21d: every function the migration creates carries the prefix plat_switch or plat_data_request",
    [...readFileSync(join(MIG, NEW, "migration.sql"), "utf8").replace(/^\s*--.*$/gm, "").matchAll(/CREATE (?:OR REPLACE )?FUNCTION (\w+)/g)].every((m) => /^plat_(switch|data_request)/.test(m[1])));
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
