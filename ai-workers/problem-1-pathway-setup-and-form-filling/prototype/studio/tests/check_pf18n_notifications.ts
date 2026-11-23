// PF-18n part 1 (R1.74, QA-471; brief lead-b-briefs/PF-18n1.md; AG-7-39 r2, r10; AG16-60; AG-16 §3.3): the in-app
// notification store (api/src/platform/notifications/store.ts), the person's own routes (routes.ts) and the binding that
// arms the case deadline reminders (features/platform-notifications.ts). Each Done when line is one named case with a pass
// and a fail: DW1-DW6, plus NotificationPort's shared contract run by PrismaNotificationPort (P-606). One scratch database
// (every migration, PF-3's Sample firms), dropped at the end. DW4-DW5 run the routes in a Nest app behind PF-4's guard
// (the local stand-in's tokens); DW6 starts the real feature providers with the real PlatformJobs on pg-boss's TestClock.
// The case fixture is labelled test data on a route marked CITED, as check_csdl1_deadlines.ts does (no immigration value;
// every real route is Sample). No browser, no model call (US$0).
//   tsx --tsconfig studio/api/tsconfig.json studio/tests/check_pf18n_notifications.ts
import "reflect-metadata";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import pg from "pg";
import { TestClock } from "pg-boss";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations");
const BIN = "/opt/homebrew/opt/postgresql@18/bin", PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_pf18n_${process.pid}`, URL = `postgresql://xr_studio@127.0.0.1:54329/${DB}`;

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 600)}` : ""}`); };
const realPause = (ms: number) => new Promise((r) => setTimeout(r, ms));

execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", DB]); execFileSync(join(BIN, "createdb"), [...PG, DB]);
for (const d of readdirSync(MIG).filter((x) => /^\d{14}_/.test(x)).sort()) execFileSync(join(BIN, "psql"), [URL, "-v", "ON_ERROR_STOP=1", "-q", "-f", join(MIG, d, "migration.sql")], { stdio: ["ignore", "ignore", "pipe"] });
process.env.DATABASE_URL = URL;   // read by core.ts at import: every app import below comes after it
for (const k of ["PLATFORM_IDENTITY", "PLATFORM_ENVIRONMENT", "PLATFORM_SAMPLE_SEED"]) delete process.env[k];

const { NestFactory } = await import("@nestjs/core");
const { APP_GUARD } = await import("@nestjs/core");
const { Module } = await import("@nestjs/common");
const { ConfigReadGuard, Db } = await import("../api/src/core.ts");
const { seedSampleFirms } = await import("../api/src/platform/seed-sample-firms.ts");
const { withFirm } = await import("../api/src/platform/firm-scope.ts");
const { PlatformClock } = await import("../api/src/platform/identity/port.ts");
const { LocalIdentity } = await import("../api/src/platform/identity/local.ts");
const { IDENTITY_PORT, PlatformIdentity } = await import("../api/src/platform/identity/service.ts");
const { PlatformGuard } = await import("../api/src/platform/identity/guard.ts");
const { PlatformJobs, PLATFORM_JOBS_BOSS } = await import("../api/src/platform/jobs/platform-jobs.ts");
const { JsonLog, useLog } = await import("../api/src/platform/observability/log.ts");
const { PrismaNotificationPrefs } = await import("../api/src/platform/settings/notifications/prefs.ts");
const { PrismaNotificationPort, NOTIFICATION_PORT } = await import("../api/src/platform/notifications/store.ts");
const { REMINDER_JOB } = await import("../api/src/case-deadlines/plan.ts");
const { SWEEP_JOB } = await import("../api/src/case-deadlines/reminders.ts");
const { CASE_DEADLINE_NOTIFICATIONS } = await import("../api/src/features/case-deadlines.ts");
const { NOTIFICATION_GROUP, NOTIFICATION_KIND } = await import("../ports/notifications.ts");
const { runContract } = await import("../ports/contracts/contract.ts");
const { notificationPortContract } = await import("../ports/contracts/notification-port.contract.ts");
type Feat = { controllers?: unknown[]; providers?: unknown[] };
const feature = async (f: string) => (await import(`../api/src/features/${f}.ts`)).default as Feat;
let wallsF: Feat = {};
const [jobsF, deadlinesF, notifF, prefsF] = [await feature("platform-jobs"), await feature("case-deadlines"), await feature("platform-notifications"), await feature("platform-settings-personal")];

const lines: Record<string, unknown>[] = [];
useLog(new JsonLog((l) => { try { lines.push(JSON.parse(l) as Record<string, unknown>); } catch { /* not a JSON line */ } }));

const db = new Db();
const sql = new pg.Pool({ connectionString: URL, max: 2 });   // the owner: sees every firm's rows (the checks' own reads)
const q = async <T = Record<string, unknown>>(text: string, v: unknown[] = []) => (await sql.query(text, v)).rows as T[];
const rowsOf = (staffId: string) => q<{ id: string; kind: string; group: string; item_kind: string; item_id: string; created_at: Date; read_at: Date | null; firm_id: string }>("select * from msg_notification where staff_id = $1 order by created_at, kind", [staffId]);
const apps: { close(): Promise<void> }[] = [];
const S = NOTIFICATION_KIND.CASE_STAGE_DEADLINE, M = NOTIFICATION_KIND.CASE_MILESTONE_DEADLINE;

try {
  await seedSampleFirms(db);
  const firm = async (key: string) => (await db.platformFirm.findUniqueOrThrow({ where: { key } })).id;
  const FA = await firm("sample-firm"), FB = await firm("sample-solo");
  const staff = async (actorId: string) => (await db.platformStaff.findUniqueOrThrow({ where: { actorId } })).id;
  const [REP, OFF, SOLO] = [await staff("user-R"), await staff("user-O"), await staff("user-S")];
  const GONE = (await db.platformStaff.create({ data: { firmId: FA, email: "gone@pf18n.example.com", displayName: "Sample gone", actorId: "pf18n-gone", status: "DEACTIVATED" } })).id;
  const prefs = new PrismaNotificationPrefs(db);
  let now = new Date("2026-11-21T10:00:00.000Z");
  const prefsOver = (tx: unknown) => new PrismaNotificationPrefs(tx as never);   // NOTIFICATION_PREFS' adapter over the caller's tx, as the feature wires it
  const port = new PrismaNotificationPort(prefsOver, () => now);
  const tell = (firmId: string, staffId: string, kind: typeof S | typeof M, item: { kind: "case-stage" | "case-milestone"; id: string }) =>
    withFirm(firmId, () => db.$transaction((tx) => port.notify(tx, { staffId }, kind, item)));

  // ---------------------------------------------------------------- DW1 one row per person, item and kind; a repeat re-marks it unread
  const stage = { kind: "case-stage" as const, id: randomUUID() };
  await tell(FA, OFF, S, stage);
  const [first] = await rowsOf(OFF);
  await q("update msg_notification set read_at = $2 where id = $1", [first!.id, new Date("2026-11-21T11:00:00.000Z")]);
  now = new Date("2026-11-26T14:00:00.000Z");   // the 2-day reminder of the same deadline
  await tell(FA, OFF, S, stage);
  const again = await rowsOf(OFF);
  ok("PF-18n DW1 pass: notify twice for one item and kind gives one row; the second marks it unread again with the newer created_at",
    again.length === 1 && again[0]!.id === first!.id && again[0]!.read_at === null && again[0]!.created_at.toISOString() === "2026-11-26T14:00:00.000Z" && first!.created_at.toISOString() === "2026-11-21T10:00:00.000Z"
    && again[0]!.kind === "case-stage-deadline" && again[0]!.group === "MY_DEADLINES" && again[0]!.item_kind === "case-stage" && again[0]!.item_id === stage.id && again[0]!.firm_id === FA, { first, again });
  await tell(FA, OFF, M, { kind: "case-milestone", id: stage.id }); await tell(FA, REP, S, stage);
  ok("PF-18n DW1 fail: another kind, or another person, is its own row (never merged into the first)", (await rowsOf(OFF)).length === 2 && (await rowsOf(REP)).length === 1);
  const dup = await q<{ n: string }>("select count(*)::text n from msg_notification where staff_id = $1 and item_id = $2 and kind = $3", [OFF, stage.id, S]);
  let raw = "";
  try { await q("insert into msg_notification (id, firm_id, staff_id, kind, \"group\", item_kind, item_id) values (gen_random_uuid(), $1, $2, $3, 'MY_DEADLINES', 'case-stage', $4)", [FA, OFF, S, stage.id]); } catch (e) { raw = (e as { code?: string }).code ?? ""; }
  ok("PF-18n DW1 fail: the database refuses a second row for the same firm, person, item and kind (unique key, 23505)", dup[0]!.n === "1" && raw === "23505", raw);
  let words = "";
  try { await q("update msg_notification set item_id = gen_random_uuid() where id = $1", [first!.id]); } catch (e) { words = (e as { code?: string }).code ?? ""; }
  let free = "";
  try { await q("insert into msg_notification (id, firm_id, staff_id, kind, \"group\", item_kind, item_id) values (gen_random_uuid(), $1, $2, 'Client I filed late', 'MY_DEADLINES', 'case', gen_random_uuid())", [FA, OFF]); } catch (e) { free = (e as { code?: string }).code ?? ""; }
  let cross = "";
  try { await q("insert into msg_notification (id, firm_id, staff_id, kind, \"group\", item_kind, item_id) values (gen_random_uuid(), $1, $2, 'case-stage-deadline', 'MY_DEADLINES', 'case', gen_random_uuid())", [FB, OFF]); } catch (e) { cross = (e as { code?: string }).code ?? ""; }
  ok("PF-18n DW1 fail (the table's rules): a row's item never changes (23514), words in place of a kind are refused (23514), and firm B's row cannot name firm A's person (23503)", words === "23514" && free === "23514" && cross === "23503", { words, free, cross });

  now = new Date("2026-11-22T09:00:00.000Z");   // breaker m2: a repeat with an older clock (a slower worker)
  await tell(FA, OFF, S, stage);
  let back = "";
  try { await q("update msg_notification set created_at = '1970-01-01' where id = $1", [first!.id]); } catch (e) { back = (e as { code?: string }).code ?? ""; }
  ok("PF-18n DW1 fail (breaker m2): a repeat with an older clock re-marks it unread but never moves created_at back, and the database refuses an earlier created_at (23514)",
    (await rowsOf(OFF)).find((r) => r.id === first!.id)?.created_at.toISOString() === "2026-11-26T14:00:00.000Z" && back === "23514", { back });
  now = new Date("2026-11-26T15:00:00.000Z");

  // ---------------------------------------------------------------- DW2 the person's In-app switch decides
  const quiet = { kind: "case-stage" as const, id: randomUUID() };
  await withFirm(FA, () => db.platformNotificationPreference.create({ data: { firmId: FA, staffId: REP, group: "MY_DEADLINES", inApp: false, email: true } }));
  await tell(FA, REP, S, quiet);
  ok("PF-18n DW2 pass: in-app off for My deadlines (email on) gives no row", (await rowsOf(REP)).every((r) => r.item_id !== quiet.id));
  await withFirm(FA, () => db.platformNotificationPreference.update({ where: { staffId_group: { staffId: REP, group: "MY_DEADLINES" } }, data: { inApp: true, email: false } }));
  await tell(FA, REP, S, quiet);
  ok("PF-18n DW2 fail: switched back on (email off) it writes one; a person who never switched gets the group's default (on): DW1's rows", (await rowsOf(REP)).filter((r) => r.item_id === quiet.id).length === 1);
  await tell(FA, GONE, S, quiet); await tell(FA, SOLO, S, quiet);
  ok("PF-18n DW2 fail: a deactivated person, or another firm's person named under firm A's scope, gets no row (and no key error)", (await rowsOf(GONE)).length === 0 && (await rowsOf(SOLO)).length === 0);
  ok("PF-18n DW2: no kind maps to SECURITY (security emails are not a group and have no in-app row, AG-16 §3.3; question for the tech lead on the PR)", Object.values(NOTIFICATION_GROUP).every((g) => (g as string) !== "SECURITY"));

  const same = { kind: "case-stage" as const, id: randomUUID() };
  await withFirm(FA, () => db.$transaction(async (tx) => {
    await tx.platformNotificationPreference.update({ where: { staffId_group: { staffId: REP, group: "MY_DEADLINES" } }, data: { inApp: false } });
    await port.notify(tx, { staffId: REP }, S, same);
    await tx.platformNotificationPreference.update({ where: { staffId_group: { staffId: REP, group: "MY_DEADLINES" } }, data: { inApp: true } });
  }));
  ok("PF-18n DW2 fail (breaker M1): the switch is read inside the caller's transaction: turned off earlier in it, notify writes nothing", (await rowsOf(REP)).every((r) => r.item_id !== same.id));
  const many = Array.from({ length: 14 }, () => ({ kind: "case-stage" as const, id: randomUUID() }));
  const t0 = Date.now(), settled = await Promise.allSettled(many.map((it) => tell(FA, OFF, S, it)));
  ok("PF-18n DW2 pass (breaker M1): 14 notifies at once (more than the pool's 10 connections) all commit, one row each (no second connection per call: the old wiring timed out at 5 s)",
    settled.every((r) => r.status === "fulfilled") && (await rowsOf(OFF)).filter((r) => many.some((m) => m.id === r.item_id)).length === 14, { ms: Date.now() - t0, failed: settled.filter((r) => r.status === "rejected").map((r) => String((r as PromiseRejectedResult).reason).slice(0, 120)) });

  // ---------------------------------------------------------------- DW3 the caller's transaction
  const rolled = { kind: "case-stage" as const, id: randomUUID() };
  let rolledBack = false;
  try { await withFirm(FA, () => db.$transaction(async (tx) => { await port.notify(tx, { staffId: OFF }, S, rolled); throw new Error("the caller fails after notify"); })); } catch { rolledBack = true; }
  ok("PF-18n DW3 pass: a rollback in the caller's transaction leaves no row", rolledBack && (await rowsOf(OFF)).every((r) => r.item_id !== rolled.id));
  await tell(FA, OFF, S, rolled);
  let noFirm = "";
  try { await db.$transaction((tx) => port.notify(tx, { staffId: OFF }, S, { kind: "case-stage", id: randomUUID() })); } catch (e) { noFirm = (e as Error).message; }
  ok("PF-18n DW3 fail: the same call committed writes its row; with no firm in scope it is refused in words, never a silent drop", (await rowsOf(OFF)).some((r) => r.item_id === rolled.id) && /no firm in scope/.test(noFirm), noFirm);

  // ---------------------------------------------------------------- P-606: the shared contract, on the real adapter
  // The contract names people by fresh ids: the harness makes each one an active staff member of firm A first (the
  // adapter writes only for a firm's active person), then calls the adapter unchanged inside firm A's transaction.
  const contractPort = new PrismaNotificationPort(prefsOver);
  const ensure = async (id: unknown) => { if (typeof id === "string" && /^[0-9a-f-]{36}$/.test(id)) await db.platformStaff.upsert({ where: { id }, create: { id, firmId: FA, email: `${id}@pf18n.example.com`, displayName: "Sample contract person" }, update: {} }); };
  await runContract(notificationPortContract, "PrismaNotificationPort", () => ({
    notifications: { async notify(t: unknown, r: { staffId: string }, k: typeof S, i: { kind: "case"; id: string }) { await ensure(r?.staffId); return contractPort.notify(t as never, r, k, i); } },
    tx: <T,>(fn: (t: unknown) => Promise<T>) => withFirm(FA, () => db.$transaction((tx) => fn(tx))),
    sent: async (s: string) => (await rowsOf(s)).map((r) => ({ staffId: s, kind: r.kind as typeof S, item: { kind: r.item_kind as "case", id: r.item_id }, at: r.created_at, read: r.read_at !== null })),
    markRead: async (s: string, item: { kind: string; id: string }) => { await q("update msg_notification set read_at = greatest(now(), created_at) where staff_id = $1 and item_kind = $2 and item_id = $3", [s, item.kind, item.id]); },
  }), ok);

  // ---------------------------------------------------------------- the app (DW6 fail first: the waiting line is said once per process)
  const local = new LocalIdentity("pf18n-check-signing-key-0123456789abcdef", () => Date.now());
  const clock = new TestClock(new Date().toISOString());
  const tickUntil = async (cond: () => boolean | Promise<boolean>, stepMs: number, maxSteps: number) => {
    for (let i = 0; i < maxSteps; i++) { if (await cond()) return true; await clock.tick(stepMs); await realPause(20); }
    return cond();
  };
  async function startApp(bound: boolean) {
    const providers = [Db, { provide: APP_GUARD, useClass: ConfigReadGuard }, PlatformClock, { provide: IDENTITY_PORT, useValue: local }, PlatformIdentity, PlatformGuard, { provide: APP_GUARD, useExisting: PlatformGuard },
      ...(wallsF.providers ?? []), ...(jobsF.providers ?? []), ...(deadlinesF.providers ?? []), ...(prefsF.providers ?? []), ...(bound ? notifF.providers ?? [] : []),
      { provide: PLATFORM_JOBS_BOSS, useValue: { clock, cronMonitorIntervalSeconds: 1, cronWorkerIntervalSeconds: 1 } }];
    class AppModule {}
    Module({ controllers: [...(bound ? notifF.controllers ?? [] : [])] as never[], providers: providers as never[] })(AppModule);
    const app = await NestFactory.create(AppModule, { logger: false });
    await app.listen(0, "127.0.0.1"); apps.push(app);
    return { app, base: `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}` };
  }
  const waiting = () => lines.filter((l) => l.event === "case_deadlines_waiting").length;
  const hasHandler = async (jobs: InstanceType<typeof PlatformJobs>, name: string) => { try { await jobs.handle(name, async () => {}); return false; } catch (e) { return /already has a handler/.test((e as Error).message); } };

  // A cited stage deadline: today (the system clock, P-607) + 21 days, on a route marked CITED (labelled test data).
  const W = randomUUID(), CMB = [randomUUID(), randomUUID()];
  const psql = (s: string) => execFileSync(join(BIN, "psql"), [URL, "-v", "ON_ERROR_STOP=1", "-q", "-Atc", s], { encoding: "utf8" }).trim();
  psql(`set session_replication_role = replica; insert into workspace (id, key, label) values ('${W}', 'pf18n-${process.pid}', 'PF-18n check');
    insert into route (id, workspace_id, key, label, basis, stages, created_by) values (gen_random_uuid(), '${W}', 'test-cited', 'Test route (labelled test data)', 'CITED', '[{"key":"study"},{"key":"work"}]', 'seed:pf18n')`);
  const due = new Date(Date.now() + 21 * 86_400_000).toISOString().slice(0, 10);
  const CASE = randomUUID(), WORK = randomUUID();
  const spec = (dl: boolean) => JSON.stringify({ key_details: dl ? [] : [{ field: "stage.permit_valid_until", label: "Study permit valid until", type: "DATE" }], ...(dl ? { deadline: { label: "Apply by (test)", from_stage: "study", field: "stage.permit_valid_until", add_days: 0 } } : {}) });
  psql(`set session_replication_role = replica;
    insert into runtime_case (id, workspace_id, combination_id, client_actor_id, created_by, case_number, firm_key, firm_id) values ('${CASE}', '${W}', '${CMB[1]}', 'user-P', 'user-O', 'C-2026-90001', 'sample-firm', '${FA}');
    insert into case_stage (id, workspace_id, case_id, firm_key, firm_id, ord, stage_key, staff_name, client_name, combination_id, state, key_details, spec, route_key, application_subject_id, started_from) values
      (gen_random_uuid(), '${W}', '${CASE}', 'sample-firm', '${FA}', 1, 'study', 'Study permit', 'Study permit', '${CMB[0]}', 'DONE_BEFORE', '{"stage.permit_valid_until": {"value": "${due}", "by": "user-O", "at": "2026-11-01T10:00:00.000Z"}}', '${spec(false)}', 'test-cited', null, null),
      ('${WORK}', '${W}', '${CASE}', 'sample-firm', '${FA}', 2, 'work', 'Work permit', 'Work permit', '${CMB[1]}', 'CURRENT', '{}', '${spec(true)}', 'test-cited', gen_random_uuid(), 'BEGIN');
    insert into case_team_member (id, workspace_id, case_id, user_id, role, assigned_by) values (gen_random_uuid(), '${W}', '${CASE}', 'user-R', 'LEAD_REPRESENTATIVE', 'seed:pf18n'), (gen_random_uuid(), '${W}', '${CASE}', 'user-O', 'OFFICER', 'seed:pf18n')`);
  const reminders = () => q<{ data: { payload: { offset: number } }; start_after: Date; state: string }>("select data, start_after, state from platform_jobs.job where name = $1 order by start_after", [REMINDER_JOB]);
  const caseRows = async () => (await q<{ staff_id: string }>("select staff_id from msg_notification where item_id = $1", [WORK]));

  // ---------------------------------------------------------------- DW6 fail: no binding → waiting, nothing armed, no row
  // From here the process walls as the API server does (features/platform-firm-walls.ts, loaded now: its import walls every
  // query outside a scope, so the sweep runs as xr_app with no firm, never on the bypass role).
  wallsF = await feature("platform-firm-walls");
  const before = waiting();
  const unbound = await startApp(false);
  const ujobs = unbound.app.get(PlatformJobs);
  ok("PF-18n DW6 fail: without the binding CaseDeadlineJobs logs case_deadlines_waiting and registers no reminder or sweep handler",
    waiting() === before + 1 && !(await hasHandler(ujobs, REMINDER_JOB)) && !(await hasHandler(ujobs, SWEEP_JOB)), { before, after: waiting() });
  ok("PF-18n DW6 fail: … and no msg_notification row exists for the case", (await caseRows()).length === 0);
  await unbound.app.close(); apps.pop();

  // ---------------------------------------------------------------- DW6 pass: bound → the sweep arms, the 7-day point writes one row per person
  const said = waiting();
  const { app, base } = await startApp(true);
  const jobs = app.get(PlatformJobs);
  ok("PF-18n DW6 pass: with the binding the app starts, CASE_DEADLINE_NOTIFICATIONS is the PrismaNotificationPort, no new waiting line, and the reminder and sweep handlers are registered",
    app.get(CASE_DEADLINE_NOTIFICATIONS) === app.get(NOTIFICATION_PORT) && app.get(NOTIFICATION_PORT) instanceof PrismaNotificationPort && waiting() === said && await hasHandler(jobs, REMINDER_JOB) && await hasHandler(jobs, SWEEP_JOB));
  // Review n1: the app's own wiring (features/platform-notifications.ts) reads the switch inside the caller's transaction.
  const appPort = app.get(NOTIFICATION_PORT) as InstanceType<typeof PrismaNotificationPort>, wired = { kind: "case-stage" as const, id: randomUUID() };
  await withFirm(FA, () => db.$transaction(async (tx) => {
    await tx.platformNotificationPreference.update({ where: { staffId_group: { staffId: REP, group: "MY_DEADLINES" } }, data: { inApp: false } });
    await appPort.notify(tx, { staffId: REP }, S, wired);
    await tx.platformNotificationPreference.update({ where: { staffId_group: { staffId: REP, group: "MY_DEADLINES" } }, data: { inApp: true } });
  }));
  const offInTx = (await rowsOf(REP)).filter((r) => r.item_id === wired.id).length;
  await withFirm(FA, () => db.$transaction((tx) => appPort.notify(tx, { staffId: REP }, S, wired)));
  ok("PF-18n DW6 fail (review n1): the app's own NOTIFICATION_PORT reads the switch in the caller's transaction (off earlier in it: no row; on: one row)", offInTx === 0 && (await rowsOf(REP)).filter((r) => r.item_id === wired.id).length === 1, { offInTx });
  // The sweep is the app's own 10-minute recurring run (no hand-made job): the test clock moves until it has run.
  const armed = await tickUntil(async () => (await reminders()).length === 3, 30_000, 80);
  const plan = await reminders();
  ok("PF-18n DW6 pass: the recurring sweep arms the cited deadline's three reminders (7, 2 and on the day) on the real job runner", armed && plan.map((j) => j.data.payload.offset).join() === "7,2,0", plan);
  const seven = plan.find((j) => j.data.payload.offset === 7)!;
  await clock.setTime(seven.start_after.getTime() + 60_000);   // a jump (setTime fires nothing on the way), then ticks run what is due
  await tickUntil(async () => (await caseRows()).length >= 2, 1_000, 60);
  const told = await caseRows();
  ok("PF-18n DW6 pass: the 7-day point writes one msg_notification row for the case officer (and one for the lead representative), none twice",
    told.filter((r) => r.staff_id === OFF).length === 1 && told.filter((r) => r.staff_id === REP).length === 1 && told.length === 2, told);

  // ---------------------------------------------------------------- DW4, DW5 the routes
  const token = (id: string) => local.issue(id, { authTimeMs: Date.now() - 60_000, secondStep: true });
  const call = async (method: string, path: string, who?: string) => {
    const r = await fetch(`${base}${path}`, { method, headers: who ? { authorization: `Bearer ${token(who)}` } : {} });
    const t = await r.text(); let b: any = t; try { b = JSON.parse(t); } catch { /* text */ }
    return { status: r.status, body: b };
  };
  const mine = await call("GET", "/api/platform/me/notifications/items", OFF);
  const deadline = mine.body.items?.find((i: { item: { id: string } }) => i.item.id === WORK);
  ok("PF-18n DW6 pass: GET …/items returns the reminder with the case's link (/cases/<case id>), ids only",
    mine.status === 200 && deadline?.kind === "case-stage-deadline" && deadline.group === "MY_DEADLINES" && deadline.item.kind === "case-stage" && deadline.link === `/cases/${CASE}` && deadline.readAt === null
    && Object.keys(deadline).sort().join() === "createdAt,group,id,item,kind,link,readAt", mine.body);
  ok("PF-18n DW4 pass: my list is newest first and holds only my rows (every row from msg_notification for me, none of the representative's)",
    mine.body.items.length === (await rowsOf(OFF)).length && mine.body.items.every((i: { createdAt: string }, n: number, a: { createdAt: string }[]) => n === 0 || a[n - 1]!.createdAt >= i.createdAt)
    && (await call("GET", "/api/platform/me/notifications/items", REP)).body.items.every((i: { id: string }) => !mine.body.items.some((m: { id: string }) => m.id === i.id)), mine.body);
  const repRow = (await call("GET", "/api/platform/me/notifications/items", REP)).body.items[0];
  const steal = await call("POST", `/api/platform/me/notifications/${repRow.id}/read`, OFF), fromB = await call("POST", `/api/platform/me/notifications/${deadline.id}/read`, SOLO), listB = await call("GET", "/api/platform/me/notifications/items", SOLO);
  ok("PF-18n DW4 fail: another person's row cannot be marked read by me (404), firm B's person gets 404 for firm A's row and an empty list; the rows stay unread",
    steal.status === 404 && fromB.status === 404 && listB.status === 200 && listB.body.items.length === 0 && (await rowsOf(REP)).find((r) => r.id === repRow.id)?.read_at === null && (await rowsOf(OFF)).find((r) => r.id === deadline.id)?.read_at === null, { steal, fromB, listB: listB.body });
  ok("PF-18n DW4 fail: no session is 401; a malformed id is 404", (await call("GET", "/api/platform/me/notifications/items")).status === 401 && (await call("POST", "/api/platform/me/notifications/not-a-uuid/read", OFF)).status === 404);
  const count0 = (await call("GET", "/api/platform/me/notifications/unread-count", OFF)).body.unread;
  const one = await call("POST", `/api/platform/me/notifications/${deadline.id}/read`, OFF), count1 = (await call("GET", "/api/platform/me/notifications/unread-count", OFF)).body.unread;
  const unreadOnly = await call("GET", "/api/platform/me/notifications/items?unread=1", OFF);
  ok("PF-18n DW5 pass: mark one read: its readAt is set and the unread count falls by one; ?unread=1 leaves it out",
    count0 >= 2 && one.status === 200 && typeof one.body.readAt === "string" && count1 === count0 - 1 && unreadOnly.body.items.every((i: { id: string; readAt: null }) => i.id !== deadline.id && i.readAt === null), { count0, one: one.body, count1 });
  const all = await call("POST", "/api/platform/me/notifications/read-all", OFF), count2 = (await call("GET", "/api/platform/me/notifications/unread-count", OFF)).body.unread, repCount = (await call("GET", "/api/platform/me/notifications/unread-count", REP)).body.unread;
  ok("PF-18n DW5 pass: mark all read: the unread count goes to 0 (and the representative's own count is untouched)", all.status === 200 && all.body.marked === count1 && count2 === 0 && repCount >= 1, { all: all.body, count2, repCount });
  const again2 = await call("POST", "/api/platform/me/notifications/read-all", OFF), reread = await call("POST", `/api/platform/me/notifications/${deadline.id}/read`, OFF);
  ok("PF-18n DW5 fail: mark all again marks nothing (0) and reading a read row keeps its first readAt; the count never goes below 0",
    again2.body.marked === 0 && reread.body.readAt === one.body.readAt && (await call("GET", "/api/platform/me/notifications/unread-count", OFF)).body.unread === 0, { again2: again2.body, reread: reread.body });
  // Review m2 / breaker m3: a reminder surfaced again after the list was drawn is not used up by a click on that list.
  const shown = deadline.createdAt;
  await q("update msg_notification set read_at = null, created_at = created_at + interval '1 minute' where id = $1", [deadline.id]);   // the 2-day reminder re-surfaces it
  const stale = await call("POST", `/api/platform/me/notifications/${deadline.id}/read?seen=${shown}`, OFF), staleAll = await call("POST", `/api/platform/me/notifications/read-all?seen=${shown}`, OFF);
  const badSeen = await call("POST", `/api/platform/me/notifications/read-all?seen=yesterday`, OFF);
  ok("PF-18n DW5 fail (review m2): with the createdAt its list showed, a click or mark-all on an old list leaves a re-surfaced reminder unread; a bad seen is 422 naming seen (PF-28 part 2b)",
    stale.status === 200 && stale.body.readAt === null && staleAll.body.marked === 0 && (await rowsOf(OFF)).find((r) => r.id === deadline.id)?.read_at === null && badSeen.status === 422 && badSeen.body?.fields?.seen !== undefined, { stale: stale.body, staleAll: staleAll.body, badSeen: badSeen.status });
  const fresh = (await call("GET", "/api/platform/me/notifications/items?unread=1", OFF)).body.items.find((i: { id: string }) => i.id === deadline.id);
  const now2 = await call("POST", `/api/platform/me/notifications/${deadline.id}/read?seen=${fresh?.createdAt}`, OFF);
  ok("PF-18n DW5 pass (review m2): with the list's own newer createdAt the click marks it read", now2.status === 200 && typeof now2.body.readAt === "string", now2.body);
  const page1 = await call("GET", "/api/platform/me/notifications/items?size=1", OFF), page2 = await call("GET", "/api/platform/me/notifications/items?size=1&page=2", OFF);
  ok("PF-18n DW4: the list is paged (size 1: page 1 names page 2, page 2 the next row)", page1.body.items.length === 1 && page1.body.nextPage === 2 && page2.body.items.length === 1 && page2.body.items[0].id !== page1.body.items[0].id, { page1: page1.body, page2: page2.body });
  const far = await call("GET", "/api/platform/me/notifications/items?page=9999999", OFF), big = await call("GET", "/api/platform/me/notifications/items?size=100000", OFF), zero = await call("GET", "/api/platform/me/notifications/items?size=0", OFF);
  ok("PF-18n DW4 fail (breaker m5): paging values are clamped, never reset: page 9999999 is an empty page (not page 1), size 100000 is 100, size 0 is 1",
    far.status === 200 && far.body.items.length === 0 && far.body.page === 1_000_000 && big.body.size === 100 && zero.body.size === 1 && zero.body.items.length === 1, { far: far.body.page, big: big.body.size, zero: zero.body.size });
  // breaker m4: a row whose item is a case links only to the firm's own case (firm B's case id gives no link).
  const BCASE = randomUUID();
  psql(`set session_replication_role = replica; insert into runtime_case (id, workspace_id, combination_id, client_actor_id, created_by, case_number, firm_key, firm_id) values ('${BCASE}', '${W}', '${CMB[1]}', 'user-P', 'user-S', 'C-2026-90002', 'sample-solo', '${FB}')`);
  await q("insert into msg_notification (id, firm_id, staff_id, kind, \"group\", item_kind, item_id) values (gen_random_uuid(), $1, $2, 'case-stage-deadline', 'MY_DEADLINES', 'case', $3), (gen_random_uuid(), $1, $2, 'case-stage-deadline', 'MY_DEADLINES', 'case', $4)", [FA, OFF, BCASE, CASE]);
  const links = (await call("GET", "/api/platform/me/notifications/items?size=100", OFF)).body.items.filter((i: { item: { kind: string } }) => i.item.kind === "case");
  ok("PF-18n DW4 fail (breaker m4): item kind case links to the firm's own case (/cases/<id>) and gives no link for another firm's case id",
    links.find((i: { item: { id: string } }) => i.item.id === CASE)?.link === `/cases/${CASE}` && links.find((i: { item: { id: string } }) => i.item.id === BCASE)?.link === null, links);
} catch (e) {
  fail++;   // review m7: a crash is a FAIL line with its error on stderr (the JSON logger holds the console)
  process.stderr.write(`FAIL  PF-18n: the check crashed — ${e instanceof Error ? e.stack ?? e.message : String(e)}\n`);
} finally {
  for (const a of apps) await a.close().catch(() => undefined);
  await sql.end(); await db.$disconnect();
  execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", DB]);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
