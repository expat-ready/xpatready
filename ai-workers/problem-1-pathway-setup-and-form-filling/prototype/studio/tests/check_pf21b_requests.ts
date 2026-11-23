// PF-21b part 3 (R1.85; brief design/lead-b-briefs/PF-21b.md "Part 2" DW3, DW5, DW6; SA-11 §3.8, SA-11-40, NFR5-14): the
// register of privacy requests made to ExpatReady. DW5 on the fake clock: OVERDUE past the target with one alert (not two
// on a second run), the near-date alert once inside the lead, never both kinds; an alert that cannot be raised undoes its
// mark. DW3: firm staff, Support, Admin, Auditor → 403; the Platform Owner logs and works a request to an outcome, each
// change a step and one audit line. DW6: no firm route; the database's rules and walls; the migration right after itself.
// One process, scratch databases (dropped at the end), no model call (US$0).
//   tsx --tsconfig studio/api/tsconfig.json studio/tests/check_pf21b_requests.ts
import "reflect-metadata";
import { Module } from "@nestjs/common";
import { APP_GUARD, APP_INTERCEPTOR, NestFactory } from "@nestjs/core";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fakeAlerts } from "../ports/alert.ts";
const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations"), SCHEMA = join(STUDIO, "prisma", "schema");
const NEW = "20261123100000_pf21b_data_requests";
const BIN = ["/opt/homebrew/opt/postgresql@18/bin", "/usr/lib/postgresql/18/bin"].find((b) => existsSync(join(b, "psql"))) ?? "";
const PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_pf21b3_${process.pid}`, EMPTY = `xr_studio_pf21b3_empty_${process.pid}`, DEMO = `xr_studio_pf21b3_demo_${process.pid}`;
const WORK = join(STUDIO, "var", `pf21b3-${process.pid}`);
const urlOf = (db: string, user = "xr_studio") => `postgresql://${user}@127.0.0.1:54329/${db}`;
const psqlFile = (db: string, f: string) => execFileSync(join(BIN, "psql"), [urlOf(db), "-X", "-v", "ON_ERROR_STOP=1", "-q", "-f", f], { stdio: ["ignore", "ignore", "pipe"] });
const sqlOn = (db: string, q: string, user = "xr_studio") => execFileSync(join(BIN, "psql"), [urlOf(db, user), "-X", "-v", "ON_ERROR_STOP=1", "-q", "-Atc", q], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const sql = (q: string, user = "xr_studio") => sqlOn(DB, q, user);
const refusedBySql = (q: string, like: RegExp, user = "xr_studio") => { try { sql(q, user); return false; } catch (e) { return like.test(String((e as { stderr?: unknown }).stderr ?? e)); } };
const asApp = (firm: string | null, q: string) => sql(`begin; select set_config('app.firm_id', '${firm ?? ""}', true); ${q}; commit`, "xr_app").split("\n").filter((l) => l !== "" && l !== firm).join("\n");
const refusedAsApp = (firm: string | null, q: string, like: RegExp) => { try { asApp(firm, q); return false; } catch (e) { return like.test(String((e as { stderr?: unknown }).stderr ?? e)); } };

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 600)}` : ""}`); };
const uuid = () => globalThis.crypto.randomUUID();
const DAY = 86_400_000;
const dayOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);
type Res = { status: number; body: any };
const call = async (base: string, method: string, path: string, o: { token?: string; body?: unknown } = {}): Promise<Res> => {
  const headers: Record<string, string> = { "content-type": "application/json", "user-agent": "pf21b3-check/1" };
  if (o.token) headers.authorization = `Bearer ${o.token}`;
  const r = await fetch(`${base}${path}`, { method, headers, body: o.body === undefined ? undefined : JSON.stringify(o.body) });
  const text = await r.text();
  let body: any = text; try { body = JSON.parse(text); } catch { /* text */ }
  return { status: r.status, body };
};

// ------------------------------------------------------------------------------------------- the scratch databases
for (const d of [DB, EMPTY, DEMO]) { execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", d]); execFileSync(join(BIN, "createdb"), [...PG, d]); }
const all = readdirSync(MIG).filter((x) => /^\d{14}_/.test(x)).sort();
for (const d of all) psqlFile(DB, join(MIG, d, "migration.sql"));
process.env.DATABASE_URL = urlOf(DB);
for (const k of Object.keys(process.env)) if (/^PLATFORM_/.test(k)) delete process.env[k];
process.env.PLATFORM_ENVIRONMENT = "local";
const { ConfigReadGuard, Db } = await import("../api/src/core.ts");
const { seedSampleFirms } = await import("../api/src/platform/seed-sample-firms.ts");
const { wallUnscopedQueries, withFirm } = await import("../api/src/platform/firm-scope.ts");
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
const { DataRequests, DATA_REQUEST_ALERTS, DATA_REQUEST_QUEUE, DATA_REQUEST_CRON, DSR_KEY } = await import("../api/src/platform/register/requests/service.ts");
const feature = (await import("../api/src/features/platform-register-requests.ts")).default;
const { DATA_REQUEST_DAILY } = await import("../api/src/features/platform-register-requests.ts");
const owner = new PrismaClient({ adapter: new PrismaPg({ connectionString: urlOf(DB), options: "-c TimeZone=UTC" }) });
wallUnscopedQueries();
const apps: { close(): Promise<void> }[] = [];
try {
  // ------------------------------------------------------------------------------------------------ the test app
  const clock = new (class extends PlatformClock { t = Date.parse("2026-11-24T14:00:00Z"); override now() { return this.t; } })();
  const alerts = fakeAlerts();
  let alertsFail = false;
  const alertPort = { raise: async (k: any, d: any) => { if (alertsFail) throw new Error("Sample: the alert line could not be written"); return alerts.raise(k, d); } };
  const firmLocal = new LocalIdentity("pf21b3-firm-standin-key-0123456789abcde", () => clock.now());
  const systemLocal = new SystemLocalIdentity("pf21b3-system-standin-key-0123456789ab", () => clock.now());
  const jobCalls: string[] = [];
  const stubJobs = { handle: async (n: string) => { jobCalls.push(`handle ${n}`); }, recurring: async (n: string, c: string, z: string) => { jobCalls.push(`recurring ${n} ${c} ${z}`); } };
  const { PlatformJobs } = await import("../api/src/platform/jobs/platform-jobs.ts");
  @Module({ controllers: [PlatformIdentityController, SystemIdentityController, ...feature.controllers] as never[],
    providers: [Db, { provide: APP_GUARD, useClass: ConfigReadGuard }, { provide: PlatformClock, useValue: clock }, { provide: IDENTITY_PORT, useValue: firmLocal }, PlatformIdentity, PlatformGuard, { provide: APP_GUARD, useExisting: PlatformGuard },
      { provide: SYSTEM_IDENTITY_PORT, useValue: systemLocal }, SystemIdentity, SystemPlaneWall, SystemGuard, { provide: APP_GUARD, useExisting: SystemGuard },
      { provide: APP_INTERCEPTOR, useClass: FirmWallsInterceptor }, { provide: DATA_REQUEST_ALERTS, useValue: alertPort }, { provide: PlatformJobs, useValue: stubJobs }, ...feature.providers] as never[] }) class TestApp {}
  const app = await NestFactory.create(TestApp, { logger: false });
  app.use(requestMiddleware());
  await app.listen(0, "127.0.0.1"); apps.push(app);
  const base = `http://127.0.0.1:${(app.getHttpServer().address() as { port: number }).port}`;
  const svc = app.get(DataRequests);
  ok("PF-21b DW5 pass: the feature registers the daily check on PF-14's runner (its handler and a recurring schedule)",
    app.get(DATA_REQUEST_DAILY) === true && jobCalls.includes(`handle ${DATA_REQUEST_QUEUE}`) && jobCalls.some((c) => c.startsWith(`recurring ${DATA_REQUEST_QUEUE} ${DATA_REQUEST_CRON}`)), jobCalls);
  await seedSampleFirms(owner);
  const person = async (name: string, roles: string[]) => (await owner.platSystemStaff.create({ data: { email: `${name.toLowerCase()}.pf21b3@expatready.example`, displayName: `Sample ${name}`, grants: { create: roles.map((roleCode) => ({ roleCode })) } } })).id;
  const OWNER = await person("Owner", ["platform-owner"]), SUPPORT = await person("Support", ["platform-support"]), ADMIN = await person("Admin", ["platform-admin"]), AUDITOR = await person("Auditor", ["platform-auditor"]);
  const tokenOf = async (id: string) => { const email = (await owner.platSystemStaff.findUniqueOrThrow({ where: { id } })).email; const r = await call(base, "POST", "/api/system/session/local", { body: { email, secondStep: true } }); if (r.status !== 200) throw new Error(JSON.stringify(r.body)); return r.body.token as string; };
  const ownerT = await tokenOf(OWNER), supportT = await tokenOf(SUPPORT), adminT = await tokenOf(ADMIN), auditorT = await tokenOf(AUDITOR);
  const firmT = (await call(base, "POST", "/api/platform/session/local", { body: { firmKey: "sample-firm", actorId: "user-R", secondStep: true } })).body.token as string;
  const sampleFirm = sql(`select id from platform_firm where key = 'sample-firm'`);
  const P = "/api/system/register/requests";
  const count = () => Number(sql(`select count(*) from plat_data_request`));
  const lines = (outcome: string, route: string) => Number(sql(`select count(*) from plat_system_audit where outcome = '${outcome}' and route = '${route}'`));
  const kinds = (id: string) => sql(`select string_agg(kind::text, ',' order by seq) from plat_data_request_event where request_id = '${id}'`);
  const today = () => dayOf(clock.t);
  ok("PF-21b DW3 pass: the migration gives system/compliance:dsr-manage to the Platform Owner only (Sample)",
    sql(`select string_agg(role_code, ',') from plat_system_role_permission where permission_key = '${DSR_KEY}'`) === "platform-owner");
  // ---------------------------------------------------------------------------------------------- DW3: who may
  const body = { type: "ACCESS", requester: "Sample Requester", requesterEmail: "requester.pf21b3@example.com", receivedOn: today() };
  const before = count();
  const refusals = await Promise.all([firmT, supportT, adminT, auditorT].map((t) => call(base, "POST", P, { token: t, body })));
  const readRefusals = await Promise.all([firmT, supportT, adminT, auditorT].map((t) => call(base, "GET", P, { token: t })));
  ok("PF-21b DW3 fail: a firm's staff token, our Support, Admin and Auditor → 403 on log and list; nothing logged",
    refusals.every((r) => r.status === 403) && readRefusals.every((r) => r.status === 403) && refusals[0].body.code === "FIRM_SESSION_REFUSED" && count() === before,
    { refusals: refusals.map((r) => [r.status, r.body.code]), readRefusals: readRefusals.map((r) => r.status) });
  const bad = await Promise.all([
    { ...body, type: "PORTABILITY" }, { ...body, requesterEmail: "not an email" }, { ...body, requester: "  " }, { ...body, receivedOn: dayOf(clock.t + DAY) },
    { ...body, firmId: sampleFirm }, { ...body, requester: "Sample \u202e reversed" }, { ...body, extra: 1 },
  ].map((b) => call(base, "POST", P, { token: ownerT, body: b })));
  ok("PF-21b DW3 fail: an unknown type, a bad email, an empty name, a day in the future, a firm without its person, a direction mark and an unknown field → 422 each, nothing logged; each a REFUSED line",
    bad.every((r) => r.status === 422 && r.body.code === "DATA_REQUEST_FIELDS") && count() === before && lines("REFUSED", P) >= bad.length, bad.map((r) => [r.status, r.body.fields]));
  // ---------------------------------------------------------------------------- DW3/W1-W2: logged and worked to an outcome
  const allowedBefore = lines("ALLOWED", P);
  const logged = await call(base, "POST", P, { token: ownerT, body });
  ok("PF-21b DW3 pass (§3.8): the Platform Owner logs a request → 201, PENDING, target date received + 30 days (a reminder), recorded by staff:<id>; one ALLOWED line naming it",
    logged.status === 201 && logged.body.status === "PENDING" && logged.body.targetDate === dayOf(clock.t + 30 * DAY) && logged.body.recordedBy === `staff:${OWNER}`
    && lines("ALLOWED", P) === allowedBefore + 1 && sql(`select target->>'requestId' from plat_system_audit where outcome = 'ALLOWED' and route = '${P}' order by at desc limit 1`) === logged.body.id, logged);
  const id = logged.body.id as string, S = `${P}/:id/status`;
  const m1 = await call(base, "POST", `${P}/${id}/status`, { token: ownerT, body: { status: "IN_PROGRESS", note: "Sample: gathering the records" } });
  const noActions = await call(base, "POST", `${P}/${id}/status`, { token: ownerT, body: { status: "COMPLETED" } });
  const m2 = await call(base, "POST", `${P}/${id}/status`, { token: ownerT, body: { status: "COMPLETED", actionsTaken: "Sample: sent the person's records" } });
  const read = await call(base, "GET", `${P}/${id}`, { token: ownerT });
  ok("PF-21b DW3 pass (§3.8): the request moves In progress, then Completed with the actions taken and its response date; each move is a step listed on the request (RECEIVED, STATUS_CHANGED ×2); each an ALLOWED line",
    m1.status === 200 && m1.body.status === "IN_PROGRESS" && m2.status === 200 && m2.body.status === "COMPLETED" && m2.body.completedOn === today() && m2.body.actionsTaken === "Sample: sent the person's records"
    && read.status === 200 && read.body.steps.map((s: any) => `${s.kind}:${s.to}`).join() === "RECEIVED:PENDING,STATUS_CHANGED:IN_PROGRESS,STATUS_CHANGED:COMPLETED"
    && read.body.steps[1].note === "Sample: gathering the records" && read.body.steps.every((s: any) => s.actor === `staff:${OWNER}`) && lines("ALLOWED", S) === 2, { m1: m1.body, m2: m2.body, read: read.body });
  ok("PF-21b DW3 fail: Completed without the actions taken → 422, nothing changed", noActions.status === 422 && noActions.body.fields?.actionsTaken, noActions);
  const refusedBefore = lines("REFUSED", S);
  const again = await call(base, "POST", `${P}/${id}/status`, { token: ownerT, body: { status: "IN_PROGRESS" } });
  const byHand = await call(base, "POST", `${P}/${id}/status`, { token: ownerT, body: { status: "OVERDUE" } });
  const unknown = await call(base, "POST", `${P}/${uuid()}/status`, { token: ownerT, body: { status: "HELD" } });
  const supportMove = await call(base, "POST", `${P}/${id}/status`, { token: supportT, body: { status: "HELD" } });
  ok("PF-21b DW3 fail: a completed request never moves (409 MOVE_REFUSED), Overdue by hand → 422, an unknown request → 404, Support → 403; the request unchanged; each refusal a REFUSED line",
    again.status === 409 && again.body.code === "MOVE_REFUSED" && byHand.status === 422 && unknown.status === 404 && supportMove.status === 403
    && sql(`select status from plat_data_request where id = '${id}'`) === "COMPLETED" && kinds(id) === "RECEIVED,STATUS_CHANGED,STATUS_CHANGED" && lines("REFUSED", S) >= refusedBefore + 3, { again, byHand, unknown, supportMove });
  const listed = await call(base, "GET", `${P}?status=COMPLETED`, { token: ownerT });
  const badList = await call(base, "GET", `${P}?status=DONE`, { token: ownerT });
  ok("PF-21b DW3 pass/fail: the list filters by status (the completed request is listed, every row COMPLETED); an unknown status → 422",
    listed.status === 200 && listed.body.requests.some((r: any) => r.id === id) && listed.body.requests.every((r: any) => r.status === "COMPLETED") && listed.body.truncated === false && badList.status === 422, { listed: listed.body, badList: badList.status });
  // -------------------------------------------------------------------------------------- DW5: within its time
  const late = await call(base, "POST", P, { token: ownerT, body: { ...body, type: "CORRECTION", requesterEmail: "late.pf21b3@example.com", receivedOn: dayOf(clock.t - 40 * DAY) } });
  const lateAlerts = () => alerts.raised.filter((a) => a.detail.entityKey === late.body.id);
  ok("PF-21b DW5 pass: a request logged 40 days after it was received is past its target: it reads OVERDUE at once and raises one privacy_clock_near alert (rule NFR5-14.overdue, ids only)",
    late.status === 201 && late.body.status === "OVERDUE" && lateAlerts().length === 1 && lateAlerts()[0].kind === "privacy_clock_near" && lateAlerts()[0].detail.rule === "NFR5-14.overdue"
    && kinds(late.body.id) === "RECEIVED,STATUS_CHANGED,OVERDUE_ALERTED" && sql(`select actor from plat_data_request_event where request_id = '${late.body.id}' and kind = 'OVERDUE_ALERTED'`) === "system:platform.register.data-requests", { late: late.body, alerts: lateAlerts() });
  await svc.sweep(); await svc.sweep();
  ok("PF-21b DW5 fail: two more runs of the daily check raise nothing more for it (one alert, one mark)", lateAlerts().length === 1 && kinds(late.body.id) === "RECEIVED,STATUS_CHANGED,OVERDUE_ALERTED", lateAlerts());
  const lateIn = await call(base, "POST", `${P}/${late.body.id}/status`, { token: ownerT, body: { status: "IN_PROGRESS" } });
  const lateDone = await call(base, "POST", `${P}/${late.body.id}/status`, { token: ownerT, body: { status: "COMPLETED", actionsTaken: "Sample: corrected the record" } });
  ok("PF-21b DW5 pass/fail: an overdue request stays Overdue until done (In progress → 409), then it can be completed", lateIn.status === 409 && lateDone.status === 200 && lateDone.body.status === "COMPLETED", { lateIn, lateDone: lateDone.body });
  // The fake clock walks one request through its 30 days.
  const fresh = await call(base, "POST", P, { token: ownerT, body: { ...body, type: "DELETION", requesterEmail: "fresh.pf21b3@example.com", firmId: sampleFirm, subject: { kind: "PERSON", id: uuid() } } });
  const fid = fresh.body.id as string, freshAlerts = () => alerts.raised.filter((a) => a.detail.entityKey === fid);
  const held = await call(base, "POST", P, { token: ownerT, body: { ...body, requesterEmail: "held.pf21b3@example.com" } });
  await call(base, "POST", `${P}/${held.body.id}/status`, { token: ownerT, body: { status: "HELD", note: "Sample: a legal hold covers the records" } });
  const start = clock.t;
  clock.t = start + 20 * DAY; await svc.sweep();
  const day20 = freshAlerts().length;
  clock.t = start + 26 * DAY; const r26 = await svc.sweep(); await svc.sweep();
  const day26 = freshAlerts().map((a) => a.detail.rule);
  ok("PF-21b DW5 pass/fail (NFR5-14): a request with a firm's person (SA-11-40) raises nothing on day 20; inside PF-23's 5-day lead (day 26) it raises the near-date alert once, not twice on a second run",
    fresh.status === 201 && fresh.body.personId && day20 === 0 && r26.near.includes(fid) && JSON.stringify(day26) === '["NFR5-14"]' && kinds(fid) === "RECEIVED,NEAR_DATE_ALERTED", { day20, day26, r26 });
  clock.t = start + 31 * DAY; const r31 = await svc.sweep(); await svc.sweep();
  // (Our staff's session tokens expire as the fake clock moves on: from here the service is called as the Platform Owner.)
  const as = { staffId: OWNER, keys: [DSR_KEY] };
  const after31 = { body: await svc.read(as, fid) };
  ok("PF-21b DW5 pass/fail: on day 31 it reads OVERDUE with one overdue alert (two runs), never a second near-date alert",
    r31.overdue.includes(fid) && after31.body.status === "OVERDUE" && JSON.stringify(freshAlerts().map((a) => a.detail.rule)) === '["NFR5-14","NFR5-14.overdue"]'
    && kinds(fid) === "RECEIVED,NEAR_DATE_ALERTED,STATUS_CHANGED,OVERDUE_ALERTED", { r31, alerts: freshAlerts(), status: after31.body.status });
  ok("PF-21b DW5 fail: a held request and a completed one are never marked or alerted, however late",
    alerts.raised.every((a) => a.detail.entityKey !== held.body.id && a.detail.entityKey !== id) && sql(`select status from plat_data_request where id = '${held.body.id}'`) === "HELD");
  // An alert that cannot be raised undoes its mark; the next run raises it.
  clock.t += 31 * DAY; alertsFail = true;   // break M1: logged while alerts are down, 31 days late → saved once, PENDING, no error
  const flaky = { body: await svc.log(as, null, { ...body, requesterEmail: "flaky.pf21b3@example.com", receivedOn: dayOf(clock.t - 31 * DAY) }) };
  const failed = await svc.sweep();
  const stillOpen = sql(`select status from plat_data_request where id = '${flaky.body.id}'`), marksThen = kinds(flaky.body.id);
  alertsFail = false;
  const retried = await svc.sweep();
  ok("PF-21b DW5 pass/fail: a request logged while alerts are down is saved (no error) and, like any whose alert cannot be raised, stays open with no mark (counted as failed); the next run moves it to OVERDUE and raises the one alert",
    flaky.body.status === "PENDING" && failed.failed >= 1 && stillOpen === "PENDING" && marksThen === "RECEIVED" && retried.overdue.includes(flaky.body.id)
    && alerts.raised.filter((a) => a.detail.entityKey === flaky.body.id).length === 1, { failed, stillOpen, marksThen, retried });
  ok("PF-21b DW5: every alert carries ids and rule names only (AlertPort's check; no name, no email)", alerts.raised.every((a) => !JSON.stringify(a.detail).includes("@") && !JSON.stringify(a.detail).includes("Sample")));
  // --------------------------------------------------------------------------------------- DW6: the database rules
  ok("PF-21b DW6 fail: a DELETE or TRUNCATE of a request or of a step, and a changed step, are refused by the database (even for the owner)",
    refusedBySql(`delete from plat_data_request where id = '${id}'`, /keeps every request/) && refusedBySql(`truncate plat_data_request cascade`, /keeps every request/)
    && refusedBySql(`delete from plat_data_request_event where request_id = '${id}'`, /keeps every request/) && refusedBySql(`update plat_data_request_event set note = 'x' where request_id = '${id}'`, /keeps every request/)
    && refusedBySql(`truncate plat_data_request_event`, /keeps every request/) && kinds(id) === "RECEIVED,STATUS_CHANGED,STATUS_CHANGED");
  ok("PF-21b DW6 fail: a request's facts never change, a completed request never changes, a move outside the allowed ones is refused, a request is logged PENDING only",
    refusedBySql(`update plat_data_request set requester_name = 'changed' where id = '${fid}'`, /facts never change/)
    && refusedBySql(`update plat_data_request set actions_taken = 'later' where id = '${id}'`, /completed request never changes/)
    && refusedBySql(`update plat_data_request set status = 'IN_PROGRESS' where id = '${fid}'`, /OVERDUE cannot move to IN_PROGRESS/)
    && refusedBySql(`insert into plat_data_request (id, type, requester_name, requester_email, received_on, target_date, status, recorded_by) values (gen_random_uuid(), 'ACCESS', 'S', 's@example.com', '2026-01-01', '2026-01-31', 'COMPLETED', 'staff:x')`, /logged PENDING/));
  ok("PF-21b DW6 fail: a target not after the day received, a firm without its person, a bare actor and a second overdue mark are refused by the database",
    refusedBySql(`select plat_data_request_log('ACCESS', 'S', 's@example.com', '2026-01-01', '2026-01-01', null, null, 'staff:x')`, /plat_data_request_facts_set/)
    && refusedBySql(`select plat_data_request_log('ACCESS', 'S', 's@example.com', '2026-01-01', '2026-01-31', '${sampleFirm}', null, 'staff:x')`, /plat_data_request_facts_set/)
    && refusedBySql(`select plat_data_request_log('ACCESS', 'S', 's@example.com', '2026-01-01', '2026-01-31', null, null, 'test')`, /plat_data_request_facts_set/)
    && refusedBySql(`insert into plat_data_request_event (id, request_id, kind, actor) values (gen_random_uuid(), '${fid}', 'OVERDUE_ALERTED', 'system:x')`, /plat_data_request_event_one_mark/));
  ok("PF-21b DW6 fail (walls): a firm's session cannot log, move, list or read the register (refused by the database); xr_app, and the bypass role it may take, cannot read or write the tables directly (break m1)",
    refusedAsApp(sampleFirm, `select plat_data_request_list(null, null, null, 10)`, /only ExpatReady's own staff/)
    && refusedAsApp(sampleFirm, `select plat_data_request_log('ACCESS', 'S', 's@example.com', '2026-01-01', '2026-01-31', null, null, 'staff:x')`, /only ExpatReady's own staff/)
    && refusedAsApp(sampleFirm, `select plat_data_request_move('${fid}', 'HELD', null, null, 'staff:x', '2026-01-01')`, /only ExpatReady's own staff/)
    && refusedAsApp(sampleFirm, `select plat_data_request_steps('${fid}')`, /only ExpatReady's own staff/)
    && refusedAsApp(sampleFirm, `select count(*) from plat_data_request`, /permission denied/) && refusedAsApp(null, `select count(*) from plat_data_request_event`, /permission denied/) && refusedAsApp(null, `set local role xr_staff_bypass; select count(*) from plat_data_request`, /permission denied/)
    && refusedAsApp(null, `insert into plat_data_request_event (id, request_id, kind, actor) values (gen_random_uuid(), '${fid}', 'NOTE', 'staff:x')`, /row-level security|permission denied/));
  ok("PF-21b DW6 fail (walls, the service): the service called inside a firm's scope is refused by the database",
    await withFirm(sampleFirm, () => svc.list(as, {})).then(() => false, (e) => /only ExpatReady's own staff/.test(String(e))));
  // ------------------------------------------------------------------------------- DW6: no firm route for the register
  const firmTry = await Promise.all(["/api/platform/data-requests", "/api/platform/register/requests", "/api/front-office/data-requests"].map((p) => call(base, "GET", p, { token: firmT })));
  const srcFiles = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? srcFiles(join(dir, e.name)) : /\.ts$/.test(e.name) ? [join(dir, e.name)] : []);
  const controllers = srcFiles(join(STUDIO, "api", "src")).flatMap((f) => [...readFileSync(f, "utf8").matchAll(/@Controller\(\s*"([^"]*)"/g)].map((m) => m[1]));
  ok("PF-21b DW6 pass/fail: no firm route answers for the register (404); the only controller naming it is under /api/system",
    firmTry.every((r) => r.status === 404) && controllers.filter((p) => /request/i.test(p) && /register|data-req/i.test(p)).join() === "api/system/register/requests", { firmTry: firmTry.map((r) => r.status), controllers: controllers.filter((p) => /request/i.test(p)) });
  // ----------------------------------------------------------------- DW6: the migration, right after itself (rows rev 16.7)
  const prior = all.filter((d) => d < NEW);
  ok(`PF-21b DW6: the migration has its own stamp, later than every one before it and unique (P-600; newest before: ${prior.at(-1)})`, all.includes(NEW) && all.filter((d) => d.slice(0, 14) === NEW.slice(0, 14)).length === 1 && prior.length === all.indexOf(NEW));
  for (const d of prior) psqlFile(EMPTY, join(MIG, d, "migration.sql"));
  for (const d of prior) psqlFile(DEMO, join(MIG, d, "migration.sql"));
  const demo = new PrismaClient({ adapter: new PrismaPg({ connectionString: urlOf(DEMO), options: "-c TimeZone=UTC" }) });
  try { await seedSampleFirms(demo); } finally { await demo.$disconnect(); }
  const firmsBefore = sqlOn(DEMO, `select count(*) from platform_firm`);
  psqlFile(EMPTY, join(MIG, NEW, "migration.sql")); psqlFile(DEMO, join(MIG, NEW, "migration.sql"));
  const shape = (d: string) => sqlOn(d, `select bool_and(c.relrowsecurity and c.relforcerowsecurity and not exists (select 1 from pg_policy p where p.polrelid = c.oid)) from pg_class c where c.relname in ('plat_data_request', 'plat_data_request_event')`)
    + sqlOn(d, `select string_agg(role_code, ',') from plat_system_role_permission where permission_key = '${DSR_KEY}'`)
    + sqlOn(d, `select count(*) from pg_proc p where p.proname like 'plat_data_request%' and p.prosecdef and pg_get_userbyid(p.proowner) = 'xr_wall_reader'`);
  ok("PF-21b DW6 pass: right after its own migration, on an empty copy and on a demo-data copy: both tables forced with no policy, the key the Platform Owner's only, the five definers xr_wall_reader's; the demo firms untouched",
    shape(EMPTY) === "tplatform-owner5" && shape(DEMO) === "tplatform-owner5" && sqlOn(DEMO, `select count(*) from platform_firm`) === firmsBefore, { empty: shape(EMPTY), demo: shape(DEMO) });
  ok("PF-21b DW6: every function the migration creates carries the prefix plat_data_request (rows rev 15.2)",
    [...readFileSync(join(MIG, NEW, "migration.sql"), "utf8").replace(/^\s*--.*$/gm, "").matchAll(/CREATE (?:OR REPLACE )?FUNCTION (\w+)/g)].every((m) => m[1].startsWith("plat_data_request")));
  for (const d of all.filter((x) => x > NEW)) psqlFile(EMPTY, join(MIG, d, "migration.sql"));
  mkdirSync(WORK, { recursive: true });
  const cfg = join(WORK, "prisma.config.ts");
  writeFileSync(cfg, `import { defineConfig } from "prisma/config";\nexport default defineConfig({ schema: ${JSON.stringify(SCHEMA)}, migrations: { path: ${JSON.stringify(MIG)} }, datasource: { url: ${JSON.stringify(urlOf(EMPTY))} } });\n`);
  const diff = spawnSync(join(STUDIO, "node_modules", ".bin", "prisma"), ["migrate", "diff", "--config", cfg, "--from-config-datasource", "--to-schema", SCHEMA, "--exit-code"], { cwd: STUDIO, encoding: "utf8" });
  ok("PF-21b DW6 pass: prisma migrate diff between the fully migrated database and the schema is empty", diff.status === 0, `${diff.stdout}${diff.stderr}`.slice(0, 800));
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
