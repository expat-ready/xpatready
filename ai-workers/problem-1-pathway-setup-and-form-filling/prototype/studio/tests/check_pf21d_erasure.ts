// PF-21d part 1b (R1.85; brief product/screens/PF-21d/brief.md, accepted on #3189; SA-11-16, -18, -28, -40): an approved
// deletion request on the register carried out 7 days after approval, behind part 1a's "Data erasure" switch. Each line a
// pass and a fail: never before day 7, cancel stops it; switch off → nothing erased (one step); a held person → HELD,
// nothing erased, and the run after the release erases; one eraser failing rolls the whole order back; a KEPT → HELD
// (partial); only the person's rows of that firm go; who may approve and cancel; the database's rules and walls; the
// migration right after itself. Scratch databases, no model call (US$0).
//   tsx --tsconfig studio/api/tsconfig.json studio/tests/check_pf21d_erasure.ts
import "reflect-metadata";
import { Module } from "@nestjs/common";
import { APP_GUARD, APP_INTERCEPTOR, NestFactory } from "@nestjs/core";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Eraser } from "../ports/erasure.ts";
const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations"), SCHEMA = join(STUDIO, "prisma", "schema");
const NEW = "20261124140000_pf21d_erasure";
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
  // A scratch table of a person's rows, and the test module's eraser over it (in the order's firm scope only).
  sql(`create table pf21d_rows (id serial primary key, firm_id uuid not null, person_id uuid not null)`);
  const seen: { firm: string; scope: string | undefined; person: string }[] = [];
  const testEraser: Eraser<any> = { module: "test.rows", async erase(tx, o) {
    seen.push({ firm: o.firmId, scope: currentFirm(), person: o.personId });
    const n = await tx.$executeRaw`delete from pf21d_rows where firm_id = ${currentFirm()}::uuid and person_id = ${o.personId}::uuid`;
    return n ? { outcome: "ERASED", note: `${n} row(s)` } : { outcome: "NOTHING", note: "no rows" };
  } };
  let mode: "nothing" | "throw" | "kept" | "wait" | "merge" | "breakRecord" | "loseCommit" = "nothing", mergeTry: (() => void) | null = null, entered = false, gate: () => void = () => undefined;
  const secondEraser: Eraser<any> = { module: "test.second", async erase() {
    if (mode === "throw") throw new Error("Sample: the second module is down");
    if (mode === "wait") { entered = true; await new Promise<void>((r) => { gate = r; }); }
    if (mode === "merge" && mergeTry) mergeTry();   // review r4 M1: a merge tries to land while the run erases
    if (mode === "loseCommit") testDb.loseNextCommit = true;   // Lead 27: this transaction commits, then its answer is lost
    if (mode === "breakRecord") sql(`alter function plat_data_request_erasure_finish(uuid, text, text, date, text, timestamptz) rename to pf21d_finish_away`);   // Lead 26: the record fails after the erasers commit
    return mode === "kept" ? { outcome: "KEPT", note: "client_financial: 2 rows kept 7 years, name replaced by a reference" } : { outcome: "NOTHING", note: "no rows" };
  } };
  const rowsOf = (firm: string, person: string) => Number(sql(`select count(*) from pf21d_rows where firm_id = '${firm}' and person_id = '${person}'`));
  const addRows = (firm: string, person: string, n = 2) => { for (let i = 0; i < n; i++) sql(`insert into pf21d_rows (firm_id, person_id) values ('${firm}', '${person}')`); };
  // Lead 27: a database client whose next transaction commits and then answers with an error (the connection was lost
  // while COMMIT was answered: the database committed, the client cannot know).
  class TestDb extends (Db as any) { loseNextCommit = false;
    $transaction(...a: unknown[]) { return (super.$transaction as any)(...a).then((v: unknown) => { if (this.loseNextCommit) { this.loseNextCommit = false; throw new Error("Sample: the connection was lost while COMMIT was answered"); } return v; }); } }
  let testDb: { loseNextCommit: boolean } = { loseNextCommit: false };
  // ------------------------------------------------------------------------------------------- the test app
  const clock = new (class extends PlatformClock { t = Date.parse("2026-11-24T15:00:00Z"); override now() { return this.t; } })();
  const firmLocal = new LocalIdentity("pf21d-firm-standin-key-0123456789abcdef", () => clock.now());
  const systemLocal = new SystemLocalIdentity("pf21d-system-standin-key-0123456789abc", () => clock.now());
  const jobCalls: string[] = [];
  const stubJobs = { handle: async (n: string) => { jobCalls.push(`handle ${n}`); }, recurring: async (n: string, c: string) => { jobCalls.push(`recurring ${n} ${c}`); } };
  @Module({ controllers: [PlatformIdentityController, SystemIdentityController, ...requestsFeature.controllers, ...feature.controllers] as never[],
    providers: [{ provide: Db, useClass: TestDb }, { provide: APP_GUARD, useClass: ConfigReadGuard }, { provide: PlatformClock, useValue: clock }, { provide: IDENTITY_PORT, useValue: firmLocal }, PlatformIdentity, PlatformGuard, { provide: APP_GUARD, useExisting: PlatformGuard },
      { provide: SYSTEM_IDENTITY_PORT, useValue: systemLocal }, SystemIdentity, SystemPlaneWall, SystemGuard, { provide: APP_GUARD, useExisting: SystemGuard },
      { provide: APP_INTERCEPTOR, useClass: FirmWallsInterceptor }, { provide: PlatformJobs, useValue: stubJobs }, ...requestsFeature.providers, ...feature.providers] as never[] }) class TestApp {}
  const app = await NestFactory.create(TestApp, { logger: false });
  app.use(requestMiddleware());
  await app.listen(0, "127.0.0.1"); apps.push(app);
  const base = `http://127.0.0.1:${(app.getHttpServer().address() as { port: number }).port}`;
  testDb = app.get(Db) as unknown as { loseNextCommit: boolean };
  const svc = app.get(Erasure), requests = app.get(DataRequests);
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
  const off = await call(base, "POST", SW, { token: ownerT, body: { on: false, reason: "Sample: emergency stop while a module is checked" } });
  ok("PF-21d pass (SA-11-16 (d), part 1a): the Owner turns \"Data erasure\" off with a reason", off.status === 200 && off.body.on === false, off);
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
  const byHand = await throws(() => requests.move(as, null, r1, { status: "COMPLETED", actionsTaken: "Sample: done by hand" }), /ERASURE_SCHEDULED/);
  ok("PF-21d fail (break M3): a hand move of a scheduled request → 409 ERASURE_SCHEDULED; the request unchanged",
    byHand && statusOf(r1) === `IN_PROGRESS|${again.eraseOn}`, { byHand, s: statusOf(r1) });
  // PF-21d part 2a, item 1 (Lead 4, #3235 comment 7095583893): while "Data erasure" is off (the emergency stop), an approved
  // erasure past its day can still be withdrawn; erasure cannot be undone. With the switch on, the window has ended (409).
  const wDay = clock.t, PW = person(A); addRows(A, PW);
  const rW = await deletion(A, PW); await svc.approve(as, null, rW); clock.t = wDay + 8 * DAY;
  const offCancel = await svc.cancel(as, null, rW, { note: "Sample: withdrawn during the emergency stop" }).then((b) => ({ ok: true, b }), (e) => ({ ok: false, e: `${(e as any)?.response?.code ?? ""} ${String(e)}` }));
  clock.t = wDay;
  ok("PF-21d pass (part 2a item 1, Lead 4): with the switch off, cancel after the day goes through (eraseOn cleared, an ERASURE_CANCELLED step); the person's rows stay",
    offCancel.ok && (offCancel as any).b.eraseOn === null && kinds(rW).endsWith("ERASURE_CANCELLED") && statusOf(rW).endsWith("|-") && rowsOf(A, PW) === 2, { offCancel, k: kinds(rW), s: statusOf(rW) });
  const turnedOn = await swOn(); seen.length = 0;
  const lateCancel = await throws(() => svc.cancel(as, null, r1, {}), /WINDOW_ENDED/);
  ok("PF-21d fail (break M3, part 2a item 1): with the switch on, on its day the window has ended (cancel → 409); the request unchanged",
    lateCancel && statusOf(r1) === `IN_PROGRESS|${again.eraseOn}`, { lateCancel, s: statusOf(r1) });
  const empty = await svc.run();
  ok("PF-21d fail (review M1, SA-11-28): with no module registered, nothing is erased and nothing reads COMPLETED; the order stays scheduled",
    empty.skipped.includes(r1) && empty.erased.length === 0 && statusOf(r1) === `IN_PROGRESS|${again.eraseOn}`, { empty, s: statusOf(r1) });
  app.get(ErasureRegistry).register(testEraser); app.get(ErasureRegistry).register(secondEraser);
  const erased = await svc.run();
  ok("PF-21d pass (SA-11-40): switch on → the next run erases the person's rows in that firm only (a family member's and another firm's stay); each module's result a step; COMPLETED with the actions taken, eraseOn cleared",
    turnedOn && erased.erased.includes(r1) && rowsOf(A, P1) === 0 && rowsOf(A, P1fam) === 2 && rowsOf(B, P1b) === 2 && statusOf(r1) === "COMPLETED|-"
    && sql(`select string_agg(note, ' / ' order by seq) from plat_data_request_event where request_id = '${r1}' and kind = 'ERASURE_RESULT'`) === "test.rows: ERASED — 2 row(s) / test.second: NOTHING — no rows"
    && /test\.rows: ERASED/.test(sql(`select actions_taken from plat_data_request where id = '${r1}'`)), { erased, s: statusOf(r1) });
  ok("PF-21d fail: firm A's order never runs an eraser with or in firm B (each call names firm A and runs in its scope)", seen.length === 1 && seen.every((s) => s.firm === A && s.scope === A && s.person === P1), seen);
  const rerun = await svc.run(), late = await throws(() => svc.cancel(as, null, r1, {}), /NOT_SCHEDULED/);
  const reApprove = await throws(() => svc.approve(as, null, r1), /APPROVE_REFUSED/);
  ok("PF-21d fail: a done erasure is never run again, cannot be cancelled or approved again (409)", rerun.erased.length === 0 && late && reApprove, rerun);
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
  ok("PF-21d fail (SA-11-40 Failure): the second module failing rolls back the first module's erasure: the rows stay, nothing COMPLETED, still scheduled; the request shows the failure as a step (review M2); counted failed (the job fails and retries)",
    failed.failed === 1 && rowsOf(A, P3) === 2 && statusOf(r3).startsWith("IN_PROGRESS|2")
    && sql(`select string_agg(note, ' / ') from plat_data_request_event where request_id = '${r3}' and kind = 'ERASURE_RESULT'`) === "test.second: FAILED — nothing was erased; the next run retries.", { failed, s: statusOf(r3), k: kinds(r3) });
  mode = "kept"; const partial = await svc.run();
  ok("PF-21d pass/fail (SA-11-16 (c), SA-11-28): a module keeping a floor class → HELD (partial), never a false COMPLETED; what was kept and why in the step and the actions taken; eraseOn cleared",
    partial.partial.includes(r3) && rowsOf(A, P3) === 0 && statusOf(r3) === "HELD|-" && /test\.second: KEPT/.test(sql(`select actions_taken from plat_data_request where id = '${r3}'`)), { partial, s: statusOf(r3) });
  // ----------------------------------------------------------- break B1, B2: a cancel or a hand move during the run
  const P4 = person(A); addRows(A, P4);
  const r4 = await deletion(A, P4); await svc.approve(as, null, r4); clock.t += 7 * DAY;
  mode = "wait"; entered = false;
  const running = svc.run();
  for (let i = 0; i < 200 && !entered; i++) await new Promise((r) => setTimeout(r, 25));
  const midCancel = await throws(() => svc.cancel(as, null, r4, {}), /ERASURE_RUNNING/);
  const midMove = await throws(() => requests.move(as, null, r4, { status: "HELD" }), /ERASURE_SCHEDULED/);
  gate(); const ran = await running;
  ok("PF-21d fail (break B1, B2): while the job erases, a cancel → 409 ERASURE_RUNNING and a hand move → 409; the erasure ends recorded: COMPLETED with each module's result",
    entered && midCancel && midMove && ran.erased.includes(r4) && rowsOf(A, P4) === 0 && statusOf(r4) === "COMPLETED|-" && !kinds(r4).includes("ERASURE_CANCELLED")
    && (kinds(r4).match(/ERASURE_RESULT/g) ?? []).length === 2, { entered, midCancel, midMove, ran, s: statusOf(r4), k: kinds(r4) });
  mode = "nothing";
  // ------------------------------------- Lead B 5 on #3235: a person merged away between approval and the day
  const P5 = person(A), P5s = person(A); addRows(A, P5);
  const r5 = await deletion(A, P5); await svc.approve(as, null, r5); clock.t += 7 * DAY;
  sql(`update fo_person set merged_into_id = '${P5s}', merged_at = now() where id = '${P5}'`);
  seen.length = 0;
  const gone = await svc.run(); await svc.run();
  ok("PF-21d fail (Lead B 5, SA-11-40 rule 6): a person merged away after approval → HELD with why (one step over two runs), no eraser called, the rows stay, never a false COMPLETED; the merge is not followed",
    gone.held.includes(r5) && seen.length === 0 && rowsOf(A, P5) === 2 && statusOf(r5).startsWith("HELD|2") && (kinds(r5).match(/ERASURE_HELD/g) ?? []).length === 1
    && /merged away or is no longer in that firm/.test(sql(`select note from plat_data_request_event where request_id = '${r5}' and kind = 'ERASURE_HELD'`)), { gone, s: statusOf(r5), k: kinds(r5) });
  // review r4 M1: a merge that tries to land while the run is erasing (after the re-check) is refused by the run's lock
  // (FO-9b's merge locks with NOWAIT: it answers "busy"); the run ends recorded, never COMPLETED with nothing erased.
  const P6 = person(A), P6s = person(A); addRows(A, P6);
  const r6 = await deletion(A, P6); await svc.approve(as, null, r6); clock.t += 7 * DAY;
  let mergeOutcome = "not tried";
  mergeTry = () => { mergeOutcome = refusedBySql(`set lock_timeout = '300ms'; update fo_person set merged_into_id = '${P6s}', merged_at = now() where id = '${P6}'`, /lock timeout|could not obtain lock|canceling statement/) ? "refused by the lock" : "landed"; };
  mode = "merge"; const raced = await svc.run(); mode = "nothing"; mergeTry = null;
  ok("PF-21d fail (review r4 M1): a merge trying to land mid-run cannot slip between the re-check and the erasers: it waits on the run's lock and gives up; the order ends COMPLETED with the person's rows erased, never COMPLETED with nothing erased",
    mergeOutcome === "refused by the lock" && raced.erased.includes(r6) && rowsOf(A, P6) === 0 && statusOf(r6) === "COMPLETED|-"
    && /test\.rows: ERASED/.test(sql(`select actions_taken from plat_data_request where id = '${r6}'`)), { mergeOutcome, raced, s: statusOf(r6) });
  // review r4 m1: HELD for a hold, then the person merged and the hold released → a new HELD step with the new reason.
  const P7 = person(A), P7s = person(A); addRows(A, P7);
  const r7 = await deletion(A, P7); await svc.approve(as, null, r7);
  const h7 = sql(`insert into plat_legal_hold (id, firm_id, scope_kind, target_id, reason, placed_by) values (gen_random_uuid(), '${A}', 'PERSON', '${P7}', 'Sample: an inquiry on the records', 'staff:${OWNER}') returning id`).split("\n")[0];
  clock.t += 7 * DAY; await svc.run();
  sql(`update fo_person set merged_into_id = '${P7s}', merged_at = now() where id = '${P7}'`);
  sql(`update plat_legal_hold set released_by = 'staff:${OWNER}', released_at = now(), release_reason = 'Sample: lifted' where id = '${h7}'`);
  await svc.run(); await svc.run();
  const notes7 = sql(`select string_agg(note, ' / ' order by seq) from plat_data_request_event where request_id = '${r7}' and kind = 'ERASURE_HELD'`);
  ok("PF-21d fail (review r4 m1): held for a hold, then merged away with the hold released → a second HELD step names the merge (the stale reason is not left alone); still one per reason over two runs",
    (kinds(r7).match(/ERASURE_HELD/g) ?? []).length === 2 && /an inquiry on the records/.test(notes7) && /merged away/.test(notes7) && rowsOf(A, P7) === 2 && statusOf(r7).startsWith("HELD|2"), { notes7, s: statusOf(r7) });
  // Lead 26 on #3235: a HELD order (its hold since lifted) whose erasers commit but whose record then fails must not be
  // cancellable: the register would read cancelled with the data gone. The claim stays (cancel → 409) until a run records it.
  const P8 = person(A); addRows(A, P8);
  const r8 = await deletion(A, P8); await svc.approve(as, null, r8);
  const h8 = sql(`insert into plat_legal_hold (id, firm_id, scope_kind, target_id, reason, placed_by) values (gen_random_uuid(), '${A}', 'PERSON', '${P8}', 'Sample: a short inquiry', 'staff:${OWNER}') returning id`).split("\n")[0];
  clock.t += 7 * DAY; await svc.run();
  sql(`update plat_legal_hold set released_by = 'staff:${OWNER}', released_at = now(), release_reason = 'Sample: lifted' where id = '${h8}'`);
  mode = "breakRecord"; const broke = await svc.run(); mode = "nothing";
  sql(`alter function pf21d_finish_away(uuid, text, text, date, text, timestamptz) rename to plat_data_request_erasure_finish`);
  const afterBreak = statusOf(r8), rowsAfter = rowsOf(A, P8);
  const lateCancel8 = await throws(() => svc.cancel(as, null, r8, { note: "Sample: withdrawn" }), /ERASURE_RUNNING/);
  sql(`update plat_data_request set erasing_since = erasing_since - interval '31 minutes' where id = '${r8}'`);   // a run 30 minutes later
  const staleCancel8 = await throws(() => svc.cancel(as, null, r8, {}), /ERASURE_RUNNING/);   // review r6 M1: a stale claim still refuses
  const recorded = await svc.run();
  ok("PF-21d fail (Lead 26): a HELD order whose erasers committed but whose record failed keeps its claim: cancel → 409 (never a cancelled register over erased data); a run after 30 minutes records it COMPLETED",
    broke.failed === 1 && rowsAfter === 0 && afterBreak.startsWith("HELD|2") && lateCancel8 && staleCancel8 && !kinds(r8).includes("ERASURE_CANCELLED")
    && recorded.erased.includes(r8) && statusOf(r8) === "COMPLETED|-" && /earlier run.*not recorded/i.test(sql(`select actions_taken from plat_data_request where id = '${r8}'`)), { broke, afterBreak, rowsAfter, lateCancel8, recorded, s: statusOf(r8), k: kinds(r8) });
  // Lead 27: the same order shape, but the erasers' COMMIT succeeds and its answer is lost: the claim must stay too.
  const P9 = person(A); addRows(A, P9);
  const r9 = await deletion(A, P9); await svc.approve(as, null, r9);
  const h9 = sql(`insert into plat_legal_hold (id, firm_id, scope_kind, target_id, reason, placed_by) values (gen_random_uuid(), '${A}', 'PERSON', '${P9}', 'Sample: a short inquiry', 'staff:${OWNER}') returning id`).split("\n")[0];
  clock.t += 7 * DAY; await svc.run();
  sql(`update plat_legal_hold set released_by = 'staff:${OWNER}', released_at = now(), release_reason = 'Sample: lifted' where id = '${h9}'`);
  mode = "loseCommit"; const lost = await svc.run(); mode = "nothing";
  const lostRows = rowsOf(A, P9), lostState = statusOf(r9);
  const lostCancel = await throws(() => svc.cancel(as, null, r9, { note: "Sample: withdrawn" }), /ERASURE_RUNNING/);
  sql(`update plat_data_request set erasing_since = erasing_since - interval '31 minutes' where id = '${r9}'`);
  const staleCancel9 = await throws(() => svc.cancel(as, null, r9, {}), /ERASURE_RUNNING/);   // review r6 M1
  const lostRecorded = await svc.run();
  ok("PF-21d fail (Lead 27): the erasers' COMMIT succeeds but its answer is lost → the claim stays (an unknown outcome is never a rollback): cancel → 409; a run after 30 minutes records it COMPLETED",
    lost.failed === 1 && lostRows === 0 && lostState.startsWith("HELD|2") && lostCancel && staleCancel9 && !kinds(r9).includes("ERASURE_CANCELLED") && lostRecorded.erased.includes(r9) && statusOf(r9) === "COMPLETED|-",
    { lost, lostRows, lostState, lostCancel, lostRecorded, s: statusOf(r9), k: kinds(r9) });
  // review r6 M2: the run that retakes a kept claim knows the data may already be erased. A hold placed meanwhile → HELD
  // with true words and no erase day (never cancellable, never "nothing was erased"); nothing more is erased.
  const P10 = person(A); addRows(A, P10);
  const r10 = await deletion(A, P10); await svc.approve(as, null, r10); clock.t += 7 * DAY;
  mode = "breakRecord"; await svc.run(); mode = "nothing";
  sql(`alter function pf21d_finish_away(uuid, text, text, date, text, timestamptz) rename to plat_data_request_erasure_finish`);
  sql(`insert into plat_legal_hold (id, firm_id, scope_kind, target_id, reason, placed_by) values (gen_random_uuid(), '${A}', 'PERSON', '${P10}', 'Sample: a late inquiry', 'staff:${OWNER}')`);
  sql(`update plat_data_request set erasing_since = erasing_since - interval '31 minutes' where id = '${r10}'`);
  const gapCancel10 = await throws(() => svc.cancel(as, null, r10, { note: "Sample: withdrawn in the gap" }), /ERASURE_RUNNING/);   // part 2a item 6
  const retook = await svc.run();
  const notes10 = sql(`select string_agg(coalesce(note, ''), ' / ' order by seq) from plat_data_request_event where request_id = '${r10}'`);
  const cancel10 = await throws(() => svc.cancel(as, null, r10, {}), /NOT_SCHEDULED|ERASURE_RUNNING/);
  ok("PF-21d fail (part 2a item 6, Lead 4): after a crash, 30 minutes and a new hold, a cancel in the gap → 409; the retake then ends HELD and the rows stay",
    gapCancel10 && !kinds(r10).includes("ERASURE_CANCELLED") && rowsOf(A, P10) === 0 && statusOf(r10) === "HELD|-", { gapCancel10, k: kinds(r10), rows: rowsOf(A, P10) });
  ok("PF-21d fail (review r6 M2): a retaken claim under a new hold → HELD, no erase day, the step says an earlier run may have erased and its result was not recorded (never \"nothing was erased\"); cancel → 409",
    retook.partial.includes(r10) && statusOf(r10) === "HELD|-" && cancel10 && /not recorded/.test(notes10) && /a late inquiry/.test(notes10)
    && !/On legal hold; nothing was erased/.test(notes10) && /may have erased|its marks say: test\.rows: ERASED/.test(sql(`select actions_taken from plat_data_request where id = '${r10}'`)), { retook, s: statusOf(r10), notes10 });
  // review r6 M2: a retaken claim whose eraser then fails keeps the claim (an earlier run may have erased): cancel → 409.
  const P11 = person(A); addRows(A, P11);
  const r11 = await deletion(A, P11); await svc.approve(as, null, r11); clock.t += 7 * DAY;
  mode = "breakRecord"; await svc.run(); mode = "nothing";
  sql(`alter function pf21d_finish_away(uuid, text, text, date, text, timestamptz) rename to plat_data_request_erasure_finish`);
  sql(`update plat_data_request set erasing_since = erasing_since - interval '31 minutes' where id = '${r11}'`);
  mode = "throw"; const retakeFail = await svc.run(); mode = "nothing";
  const cancel11 = await throws(() => svc.cancel(as, null, r11, {}), /ERASURE_RUNNING/);
  ok("PF-21d fail (review r6 M2): a retaken claim whose eraser fails keeps the claim (never \"nothing was erased\" over an earlier unrecorded run): cancel → 409",
    retakeFail.failed === 1 && cancel11 && sql(`select erasing_since is not null from plat_data_request where id = '${r11}'`) === "t", { retakeFail, cancel11, k: kinds(r11) });
  const notes11 = sql(`select string_agg(coalesce(note, ''), ' / ' order by seq) from plat_data_request_event where request_id = '${r11}'`);
  ok("PF-21d fail (part 2a item 8, R7-3): a retake whose own eraser fails names that module and says \"may\"; it never claims the erasers ran",
    /test\.second: FAILED on a run after an earlier one that may have erased/.test(notes11) && !/The erasers ran, but/.test(notes11), { notes11 });
  // ----------------------------------------------------------------------------------------- PF-21d part 2a, items 2-8
  // Item 5 (round 2 m3, R7-2): the lost-COMMIT run's marks committed with its erasers, so the run that records it says what
  // the earlier run erased, never only "NOTHING".
  const actions9 = sql(`select coalesce(actions_taken, '') from plat_data_request where id = '${r9}'`);
  ok("PF-21d fail (part 2a item 5): a retake records the earlier run's marks (test.rows: ERASED), so the register never understates what was erased",
    /its marks say: test\.rows: ERASED/.test(actions9), { actions9 });
  // Item 8 (R7-1): a request a run retook stays marked. Approved again with the hold still on: cancel → 409, and the next run
  // never says "nothing was erased"; with many long hold reasons the words still end "Nothing more was erased." (R7-4).
  for (let i = 0; i < 5; i++) sql(`insert into plat_legal_hold (id, firm_id, scope_kind, target_id, reason, placed_by) values (gen_random_uuid(), '${A}', 'PERSON', '${P10}', 'Sample: a long reason ${"x".repeat(470)}', 'staff:${OWNER}')`);
  const again10 = await svc.approve(as, null, r10);
  const cancelMarked = await throws(() => svc.cancel(as, null, r10, {}), /MAY_HAVE_ERASED/);
  clock.t += 7 * DAY; const reRun10 = await svc.run();
  const last10 = sql(`select note from plat_data_request_event where request_id = '${r10}' and kind = 'ERASURE_HELD' order by seq desc limit 1`);
  ok("PF-21d fail (part 2a item 8, R7-1, R7-4): a request a run retook, approved again under a hold → cancel 409 MAY_HAVE_ERASED; the run ends HELD with the earlier run's words, ending \"Nothing more was erased.\"",
    !!again10.eraseOn && cancelMarked && reRun10.partial.includes(r10) && statusOf(r10) === "HELD|-" && !/^On legal hold; nothing was erased/.test(last10)
    && /earlier run/.test(last10) && last10.endsWith("Nothing more was erased.") && last10.length <= 2000, { cancelMarked, reRun10, last10: last10.slice(-120), n: last10.length });
  // R7-4: the retake's gone path, with its next step.
  const P13 = person(A), P13to = person(A); addRows(A, P13);
  const r13 = await deletion(A, P13); await svc.approve(as, null, r13); clock.t += 7 * DAY;
  mode = "breakRecord"; await svc.run(); mode = "nothing";
  sql(`alter function pf21d_finish_away(uuid, text, text, date, text, timestamptz) rename to plat_data_request_erasure_finish`);
  sql(`update fo_person set merged_into_id = '${P13to}', merged_at = now() where id = '${P13}'`);
  sql(`update plat_data_request set erasing_since = erasing_since - interval '31 minutes' where id = '${r13}'`);
  const gone13 = await svc.run();
  const last13 = sql(`select note from plat_data_request_event where request_id = '${r13}' and kind = 'ERASURE_HELD' order by seq desc limit 1`);
  ok("PF-21d fail (part 2a item 8, R7-4): a retake whose person was merged away since → HELD, no erase day; the words give the earlier run's marks, the next step, and \"Nothing more was erased.\"",
    gone13.partial.includes(r13) && statusOf(r13) === "HELD|-" && /its marks say: test\.rows: ERASED/.test(last13) && /log the request on the right person record/.test(last13) && last13.endsWith("Nothing more was erased."), { gone13, last13 });
  // Item 4 (round 2 m4): an order another run still holds (a fresh claim) is counted as skipped, never silent.
  const P14 = person(A); addRows(A, P14);
  const r14 = await deletion(A, P14); await svc.approve(as, null, r14); clock.t += 7 * DAY;
  sql(`update plat_data_request set erasing_since = now() where id = '${r14}'`);
  const held14 = await svc.run();
  ok("PF-21d fail (part 2a item 4): an order still claimed by another run → counted as skipped, nothing erased",
    held14.skipped.includes(r14) && rowsOf(A, P14) === 2, { held14 });
  // -------------------------------------------------------------------------------------- the database's rules
  ok("PF-21d fail (database): an erase day on an access request or not after the day received, a forged mark through the job's step → refused",
    refusedBySql(`update plat_data_request set erase_on = received_on + 7 where id = '${access}'`, /plat_data_request_erase_on_set/)
    && refusedBySql(`update plat_data_request set erase_on = received_on where id = '${r3}'`, /plat_data_request_erase_on_set/)
    && refusedBySql(`update plat_data_request set erasing_since = now() where id = '${access}'`, /plat_data_request_erase_on_set/)   // part 2a item 2: a claim needs an erase day
    && refusedBySql(`select plat_data_request_erasure_step('${r3}', 'OVERDUE_ALERTED', 'x', 'system:x', false, null)`, /not an erasure step/));
  ok("PF-21d fail (walls): a firm's session cannot approve, cancel, read or run an order (refused by the database)",
    refusedAsApp(A, `select plat_data_request_erasure_approve('${r1}', '2027-01-01', 'staff:x')`, /only ExpatReady's own staff/)
    && refusedAsApp(A, `select plat_data_request_erasure_cancel('${r1}', null, 'staff:x', '2027-01-01')`, /only ExpatReady's own staff/)
    && refusedAsApp(A, `select plat_data_request_erasure_of('${r1}')`, /only ExpatReady's own staff/)
    && refusedAsApp(A, `select plat_data_request_erasure_due('2027-01-01', 10)`, /only ExpatReady's own staff/)
    && refusedAsApp(B, `select plat_data_request_erasure_mark_add('${r1}', now(), 'test.rows', 'ERASED', 'x')`, /not an order of this firm|permission denied/)   // part 2a: a mark only for the session's own firm, under the run's claim
    && refusedBySql(`select plat_data_request_erasure_mark_add('${r1}', now(), 'test.rows', 'ERASED', 'x')`, /not an order of this firm/)
    && refusedBySql(`delete from plat_data_request_erasure_mark`, /plat_data_request_kept/));
  // ------------------------------------------------------------------------------------- the migration right after itself
  const prior = all.filter((d) => d < NEW);
  ok(`PF-21d: the migration has its own stamp, after every one before it (newest before: ${prior.at(-1)})`, all.includes(NEW) && all.filter((d) => d.slice(0, 14) === NEW.slice(0, 14)).length === 1);
  for (const d of prior) { psqlFile(EMPTY, join(MIG, d, "migration.sql")); psqlFile(DEMO, join(MIG, d, "migration.sql")); }
  const demo = new PrismaClient({ adapter: new PrismaPg({ connectionString: urlOf(DEMO), options: "-c TimeZone=UTC" }) });
  try { await seedSampleFirms(demo); } finally { await demo.$disconnect(); }
  psqlFile(EMPTY, join(MIG, NEW, "migration.sql")); psqlFile(DEMO, join(MIG, NEW, "migration.sql"));
  const shape = (d: string) => sqlOn(d, `select count(*) from pg_proc p where p.proname like 'plat_data_request_erasure%' and p.prosecdef and pg_get_userbyid(p.proowner) = 'xr_wall_reader'`)
    + sqlOn(d, `select count(*) from pg_enum e join pg_type t on t.oid = e.enumtypid where t.typname = 'PlatDataRequestEventKind' and e.enumlabel like 'ERASURE_%'`)
    + sqlOn(d, `select count(*) from plat_data_request where erase_on is not null`);
  ok("PF-21d pass: right after its own migration, on an empty and a demo copy: the eight definers xr_wall_reader's, the five step kinds, no request scheduled",
    shape(EMPTY) === "850" && shape(DEMO) === "850", { empty: shape(EMPTY), demo: shape(DEMO) });
  ok("PF-21d: every function the migration creates carries the prefix plat_data_request_erasure",
    [...readFileSync(join(MIG, NEW, "migration.sql"), "utf8").replace(/^\s*--.*$/gm, "").matchAll(/CREATE (?:OR REPLACE )?FUNCTION (\w+)/g)].every((m) => m[1].startsWith("plat_data_request_erasure")));
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
