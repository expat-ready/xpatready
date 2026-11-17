// PF-23w (map rows 9 + 13, the join row; QA-452, QA-453, QA-473): PF-14's job worker reports to PF-23's health, metrics
// and stuck alarm, and FO-3's booking runs on the real jobs. Each Done when line is one named case (P-606, rows rev 16.11
// (a)): DW1-DW7. The app is the real feature providers (platform-jobs, platform-observability, front-office-booking)
// in a Nest app on a scratch database with every migration; time is pg-boss's TestClock (it moves timers and
// PostgreSQL's job_now() together), and the booking's clock reads the same clock. A restart is the app closed and a new
// one started on the same database. DW5 and DW6 run qa's own checks (tests/qa/check_qa452_*, check_qa453_*). No browser,
// no model call (US$0). The scratch database is dropped at the end.
//   tsx --tsconfig studio/api/tsconfig.json studio/tests/check_pf23w_jobs_wired.ts
import "reflect-metadata";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import pg from "pg";
import { TestClock } from "pg-boss";
import type { AlertDetail, AlertKind, AlertPort } from "../ports/alert.ts";
import { fakeArrival } from "../ports/arrival.ts";
import { fakeMail, type FakeMail } from "../ports/mail.ts";
import { QA_CHECKS, runQaCheck } from "./pf23w-qa-checks.ts";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations"), SRC = join(STUDIO, "api", "src");
const BIN = "/opt/homebrew/opt/postgresql@18/bin", PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_pf23w_${process.pid}`, URL = `postgresql://xr_studio@127.0.0.1:54329/${DB}`;
const TZ = "America/Toronto", FIRM_X = "0000000a-0000-4000-8000-00000000000a";

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 600)}` : ""}`); };
const realPause = (ms: number) => new Promise((r) => setTimeout(r, ms));

execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", DB]);
execFileSync(join(BIN, "createdb"), [...PG, DB]);
for (const d of readdirSync(MIG).filter((x) => /^\d{14}_/.test(x)).sort()) execFileSync(join(BIN, "psql"), [URL, "-v", "ON_ERROR_STOP=1", "-q", "-f", join(MIG, d, "migration.sql")], { stdio: ["ignore", "ignore", "pipe"] });
process.env.DATABASE_URL = URL;   // read by core.ts at import: every app import below comes after it
process.env.PLATFORM_ENVIRONMENT ??= "local";   // PF-24w: required, no default (features/platform-messages.ts reads the loader at import)

const { NestFactory } = await import("@nestjs/core");
const { Module } = await import("@nestjs/common");
const { Db } = await import("../api/src/core.ts");
const { JsonLog, useLog } = await import("../api/src/platform/observability/log.ts");
const { useAlerts, STUCK_JOB_MS } = await import("../api/src/platform/observability/alerts.ts");
const { PlatformJobs, PLATFORM_JOBS_BOSS } = await import("../api/src/platform/jobs/platform-jobs.ts");
const { STUCK_CHECK_QUEUE } = await import("../api/src/platform/jobs/stuck-check.ts");
const { DEAD_LETTER } = await import("../api/src/platform/jobs/pgboss-jobs.ts");
const { BOOKING_PORTS, Booking } = await import("../api/src/front-office/booking/public.controller.ts");
const { copyFirmHoursTo } = await import("../api/src/front-office/booking-seed.ts");
const { wallToUtc } = await import("../api/src/front-office/booking/slots.ts");
const { auditEvent } = await import("../api/src/platform/audit/audit-event.ts");
const feature = async (f: string) => (await import(`../api/src/features/${f}.ts`)).default as { controllers?: unknown[]; providers?: unknown[] };
const [jobsF, obsF, bookingF] = [await feature("platform-jobs"), await feature("platform-observability"), await feature("front-office-booking")];

// Every log line of the process (the job lines, failure lines and alert-repeat lines PF-23 writes).
const lines: Record<string, unknown>[] = [];
useLog(new JsonLog((l) => { try { lines.push(JSON.parse(l) as Record<string, unknown>); } catch { /* not a JSON line */ } }));
const jobLines = (queue: string, outcome?: string) => lines.filter((l) => l.event === "job" && l.queue === queue && (!outcome || l.outcome === outcome));
// Every alert raised (a recording AlertPort: the stuck check's own 5-minute memory is what DW3 tests, so no other dedup).
const raised: { kind: AlertKind; detail: AlertDetail }[] = [];
const recording: AlertPort = { async raise(kind, detail) { raised.push({ kind, detail }); return { raised: true }; } };
useAlerts(recording);

const clock = new TestClock("2026-10-26T12:00:00Z");   // Monday 08:00 in Toronto (EDT)
const bookingClock = { now: () => new Date(clock.now()) };
const tickUntil = async (cond: () => boolean | Promise<boolean>, stepMs: number, maxSteps: number) => {
  for (let i = 0; i < maxSteps; i++) { if (await cond()) return true; await clock.tick(stepMs); await realPause(15); }
  return cond();
};
const at = (s: string) => { const [d, t] = s.split(" "); const [y, m, dd] = d!.split("-").map(Number); const [h, mi] = t!.split(":").map(Number); const r = wallToUtc(y!, m!, dd!, h! * 60 + mi!, TZ); if (!r) throw new Error(`no such time ${s}`); return r; };

const arrival = fakeArrival();   // the booker, kept across the restart (FO-2's real arrival replaces the fake later)
type App = Awaited<ReturnType<typeof NestFactory.create>>;
async function startApp(mail: FakeMail): Promise<{ app: App; port: number }> {
  const ports = { audit: auditEvent, clock: bookingClock, mail, arrival, publicBaseUrl: "http://localhost:4430", limits: { bookPerIp: 1000, bookPerFirm: 1000, slotsPerIp: 1000, tokenPerIp: 1000 } };
  const providers = [Db, ...(jobsF.providers ?? []), ...(obsF.providers ?? []),
    ...(bookingF.providers ?? []).filter((p) => !(typeof p === "object" && p !== null && (p as { provide?: unknown }).provide === BOOKING_PORTS)),
    { provide: BOOKING_PORTS, useValue: ports },
    { provide: PLATFORM_JOBS_BOSS, useValue: { clock, cronMonitorIntervalSeconds: 1, cronWorkerIntervalSeconds: 1 } }];
  class AppModule {}
  Module({ controllers: [...(obsF.controllers ?? [])] as never[], providers: providers as never[] })(AppModule);
  const app = await NestFactory.create(AppModule, { logger: false });
  await app.listen(0, "127.0.0.1");
  return { app, port: (app.getHttpServer().address() as AddressInfo).port };
}
const ready = async (port: number) => { const r = await fetch(`http://127.0.0.1:${port}/api/health/ready`); return { status: r.status, body: await r.json() as { failing: string[]; checks: { job_queue: { ok: boolean | null; words: string } } } }; };

const sql = new pg.Pool({ connectionString: URL, max: 2 });
const q = async <T = Record<string, unknown>>(text: string, v: unknown[] = []) => (await sql.query(text, v)).rows as T[];
let current: App | null = null;

try {
  const mail1 = fakeMail({ clock: bookingClock });
  let { app, port } = await startApp(mail1);
  current = app;
  let jobs = app.get(PlatformJobs);

  // ------------------------------------------------------------------------------------------------------------ DW1
  const up = await ready(port);
  ok("PF-23w DW1 pass: on a copy running the worker, /api/health/ready is 200 with job_queue.ok true", up.status === 200 && up.body.checks.job_queue.ok === true, up);
  await jobs.runner.stop();
  const down = await ready(port);
  ok("PF-23w DW1 fail: with pg-boss stopped, ready is 503 and names the job queue (failing [job_queue], in words)", down.status === 503 && down.body.failing.includes("job_queue") && down.body.checks.job_queue.ok === false && /job queue/i.test(down.body.checks.job_queue.words), down);
  ok("PF-23w DW1: job_queue.ok is never null (the probe is provided by features/platform-jobs.ts)", up.body.checks.job_queue.ok !== null && down.body.checks.job_queue.ok !== null
    && /provide\s*:\s*JOB_QUEUE_PROBE\b/.test(readFileSync(join(SRC, "features", "platform-jobs.ts"), "utf8")), { up: up.body.checks.job_queue, down: down.body.checks.job_queue });
  await jobs.runner.start();
  ok("PF-23w DW1 pass: started again, ready is 200 again", (await ready(port)).status === 200);

  // ------------------------------------------------------------------------------------------------------------ DW2
  let okRuns = 0, boomRuns = 0, aroundRuns = 0;
  await jobs.handle("pf23w.ok", async () => { okRuns++; });
  await jobs.handle("pf23w.boom", async () => { boomRuns++; throw new Error("pf23w boom"); });
  await jobs.runner.handle("pf23w.around", async () => { aroundRuns++; });   // going around PlatformJobs.handle
  await jobs.enqueue("pf23w.ok", {}, { key: "pf23w:ok:1", firmId: FIRM_X });
  await jobs.enqueue("pf23w.boom", {}, { key: "pf23w:boom:1", firmId: FIRM_X });
  await jobs.enqueue("pf23w.around", {}, { key: "pf23w:around:1", firmId: FIRM_X });
  await tickUntil(() => okRuns === 1 && boomRuns >= 1 && aroundRuns === 1, 500, 80);
  await realPause(100);
  const okLines = jobLines("pf23w.ok");
  ok("PF-23w DW2 pass: one run writes one metric line with queue, outcome and age", okRuns === 1 && okLines.length === 1 && okLines[0]!.outcome === "done" && typeof okLines[0]!.ageMs === "number" && okLines[0]!.jobId === "pf23w:ok:1"
    && JSON.stringify(okLines[0]).includes("JobRuns"), okLines);
  const boomFailed = jobLines("pf23w.boom", "failed"), boomErrors = lines.filter((l) => l.event === "job_error" && l.queue === "pf23w.boom");
  ok("PF-23w DW2 fail: a failing job's run writes one failure line (outcome failed) and one error line, never its message", boomRuns === 1 && boomFailed.length === 1 && boomErrors.length === 1
    && !JSON.stringify(boomErrors).includes("pf23w boom"), { boomRuns, boomFailed, boomErrors });
  await tickUntil(() => boomRuns === 2, 5_000, 20);   // PF-14's first retry, 30 s later (Sample policy)
  ok("PF-23w DW2 fail: the wrapper passes the throw on, so pg-boss retries the job (a second run, a second failure line)", boomRuns === 2 && jobLines("pf23w.boom", "failed").length === 2, { boomRuns, failed: jobLines("pf23w.boom", "failed").length });
  // The check every handler must pass: each run has its job line. A handler registered around PlatformJobs.handle has none.
  const wrappedCheck = (queue: string, runs: number) => runs > 0 && jobLines(queue).length === runs;
  ok("PF-23w DW2 pass: a handler registered through PlatformJobs.handle is wrapped by observeJob (one job line per run)", wrappedCheck("pf23w.ok", okRuns));
  ok("PF-23w DW2 fail: a test handler registered around it (runner.handle) ran but fails the wrapped check", aroundRuns === 1 && !wrappedCheck("pf23w.around", aroundRuns), jobLines("pf23w.around"));
  // The code half: nothing outside platform/jobs registers on the runner directly or builds its own pg-boss runner.
  const files = (dir: string): string[] => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? files(p) : p.endsWith(".ts") ? [p] : []; });
  const code = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  const around = (t: string) => /\.runner\s*\.\s*handle\s*\(|new\s+PgBossJobs\s*\(/.test(code(t));
  const offenders = files(SRC).filter((p) => !p.startsWith(join(SRC, "platform", "jobs")) && around(readFileSync(p, "utf8"))).map((p) => p.slice(SRC.length + 1));
  ok("PF-23w DW2 pass: no module in api/src registers a handler around PlatformJobs.handle (runner.handle, new PgBossJobs)", offenders.length === 0, offenders);
  ok("PF-23w DW2 fail: the code check catches a planted `jobs.runner.handle(` and `new PgBossJobs(`", around("await this.jobs.runner.handle('x', h);") && around("const r = new PgBossJobs({ connectionString });"));

  // ----------------------------------------------------------------------------------------------- DW4: a real booking
  const firm = await (app.get(Db)).platformFirm.create({ data: { key: "pf23w-firm", operatingName: "Sample PF-23w firm", countryCode: "CA", status: "ACTIVE", contactEmail: "office@pf23w.example" } });
  const host = await app.get(Db).platformStaff.create({ data: { firmId: firm.id, email: "host@pf23w.example", displayName: "Sample host", status: "ACTIVE" } });
  await copyFirmHoursTo(app.get(Db), firm.id, [host.id]);
  await app.get(Db).foConsultationType.create({ data: { firmId: firm.id, slug: "free", name: "Free consultation", modes: ["VIDEO", "PHONE"], hostStaffIds: [host.id], minutes: 30 } });
  const booking = app.get(Booking);
  const page = await booking.publicSlots(firm.key, "free", {}, "10.0.0.9");
  await clock.tick(5_000);
  const answer = await booking.publicBook(firm.key, "free", { givenNames: "Ana", familyName: "Sample", email: "ana@client.example", mode: "VIDEO", startsAt: at("2026-10-27 10:00").toISOString(), timeZone: TZ, consent: true, consentWordingId: page.consent!.wordingId, formStamp: page.formStamp }, "10.0.0.9");
  const tok = await app.get(Db).foBookingToken.findUniqueOrThrow({ where: { id: answer.manageToken.split(".")[0] } });
  const bookingId = tok.bookingId;
  type JobRow = { name: string; state: string; key: string; start_after: Date };
  const jobRows = () => q<JobRow>(`select name, state, data->>'key' as key, start_after from platform_jobs.job where data->>'key' like $1 order by start_after`, [`booking:${bookingId}:%`]);
  const before = await jobRows();
  const reminders = before.filter((r) => r.name === "booking.reminder");
  const usesRunner = (booking as unknown as { ports: { jobs: unknown } }).ports.jobs === jobs;
  ok("PF-23w DW4: FO-3's booking reminders (24 h and 1 h) are rows in pg-boss's job table, waiting", reminders.length === 2 && reminders.every((r) => r.state === "created")
    && reminders.some((r) => r.key.endsWith("reminder-24h")) && reminders.some((r) => r.key.endsWith("reminder-1h")), before);
  ok("PF-23w DW4: the booking's JobPort is PF-14's PlatformJobs, not PF-0p's fake", usesRunner);
  ok("PF-23w DW4: the attendance question is a row in pg-boss's job table too", before.some((r) => r.name === "booking.attendance_ask" && r.state === "created"), before);
  await tickUntil(() => mail1.sent.length >= 2, 500, 40);   // the confirmation emails run now, through booking.mail

  // --------------------------------------------------------------------------------------------- DW7: restart (QA-473)
  await app.close();
  current = null;
  const mail2 = fakeMail({ clock: bookingClock });
  ({ app, port } = await startApp(mail2));
  current = app;
  jobs = app.get(PlatformJobs);
  const afterRestart = await jobRows();
  ok("PF-23w DW7: after the API restart the reminders and the attendance question are still queued", afterRestart.filter((r) => r.state === "created" && (r.name === "booking.reminder" || r.name === "booking.attendance_ask")).length === 3, afterRestart);
  ok("PF-23w DW7: after the restart ready is ok", (await ready(port)).status === 200);
  const sentKeys = () => mail2.sent.map((m) => m.templateKey);
  // The clock jumps to two minutes before each due time, then steps on (pg-boss's job_now() moves with it).
  await clock.setTime(at("2026-10-26 10:00").getTime() - 120_000);
  await tickUntil(() => sentKeys().includes("booking.reminder_24h"), 30_000, 30);
  ok("PF-23w DW7: the 24 h reminder runs after the restart, at its due time on the clock (Mon 10:00 Toronto), and mails the booker",
    mail2.inbox("ana@client.example").some((m) => m.templateKey === "booking.reminder_24h") && clock.now() >= at("2026-10-26 10:00").getTime() && clock.now() < at("2026-10-26 10:00").getTime() + 15 * 60_000, { sent: sentKeys(), now: new Date(clock.now()).toISOString() });
  ok("PF-23w DW7 fail: the 1 h reminder has not run yet at that time (due Tue 09:00)", !sentKeys().includes("booking.reminder_1h"));
  await clock.setTime(at("2026-10-27 09:00").getTime() - 120_000);
  await tickUntil(() => sentKeys().includes("booking.reminder_1h"), 30_000, 30);
  await clock.setTime(at("2026-10-27 11:00").getTime() - 120_000);
  await tickUntil(() => jobLines("booking.attendance_ask", "done").length === 1, 30_000, 30);
  // FO-3m DW6: the attendance question runs but mails no one (AG-4-39 rule 2, shown, not pushed).
  ok("PF-23w DW7: the 1 h reminder and the attendance question (30 min after the end) run after the restart", sentKeys().includes("booking.reminder_1h") && !mail2.sent.some((m) => m.templateKey === "booking.attendance_ask")
    && clock.now() >= at("2026-10-27 11:00").getTime(), { sent: sentKeys(), now: new Date(clock.now()).toISOString() });
  ok("PF-23w DW7: each booking job's run wrote its job line (observeJob on the real worker)", jobLines("booking.reminder", "done").length === 2 && jobLines("booking.attendance_ask", "done").length === 1);
  ok("PF-23w DW7: nothing ran twice (2 reminders and 1 question after the restart, none before it)", mail2.sent.filter((m) => (m.templateKey ?? "").startsWith("booking.reminder")).length === 2 && !mail1.sent.some((m) => (m.templateKey ?? "").startsWith("booking.reminder")), { mail1: mail1.sent.map((m) => m.templateKey), mail2: sentKeys() });

  // ------------------------------------------------------------------------------------------------------------ DW3
  // A job no worker takes (its queue has no handler) waits past its due time; the stuck check (the platform cron job,
  // every minute) raises one job_stuck once it is over STUCK_JOB_MS late, and no more within 5 minutes.
  const stuckFor = (queue: string) => raised.filter((a) => a.kind === "job_stuck" && a.detail.queue === queue);
  await jobs.enqueue("pf23w.nobody", {}, { key: "pf23w:nobody:1", firmId: FIRM_X });
  await jobs.schedule("pf23w.later", new Date(clock.now() + 864e5), {}, { key: "pf23w:later:1", firmId: FIRM_X });
  const due = clock.now();
  await tickUntil(() => clock.now() - due >= STUCK_JOB_MS - 60_000, 60_000, 40);
  ok("PF-23w DW3 fail: a job waiting under STUCK_JOB_MS (29 min) raises nothing", stuckFor("pf23w.nobody").length === 0, stuckFor("pf23w.nobody"));
  await tickUntil(() => stuckFor("pf23w.nobody").length > 0, 60_000, 5);
  const firstAt = clock.now();
  const first = stuckFor("pf23w.nobody");
  ok("PF-23w DW3 pass: a job older than STUCK_JOB_MS raises one job_stuck alert naming its queue and job, from the cron check", first.length === 1 && first[0]!.detail.entityKey !== undefined && first[0]!.detail.rule === "SA8-D40", first);
  ok("PF-23w DW3: the stuck check ran as a platform cron job through PlatformJobs (its runs have job lines)", jobLines(STUCK_CHECK_QUEUE, "done").length > 0);
  await tickUntil(() => clock.now() - firstAt >= 4 * 60_000, 60_000, 6);
  const direct = await jobs.stuck.run();
  ok("PF-23w DW3 fail: further checks within 5 minutes (the cron's and a direct one) raise none for that job", stuckFor("pf23w.nobody").length === 1 && !direct.includes("pf23w.nobody"), { alerts: stuckFor("pf23w.nobody").length, direct });
  ok("PF-23w DW3 fail: a job due tomorrow is not stuck", stuckFor("pf23w.later").length === 0);
  await tickUntil(() => stuckFor("pf23w.nobody").length > 1, 60_000, 4);
  ok("PF-23w DW3: after 5 minutes a job still stuck raises again (one alert per job per 5 minutes)", stuckFor("pf23w.nobody").length === 2 && clock.now() - firstAt >= 5 * 60_000, { n: stuckFor("pf23w.nobody").length, after: clock.now() - firstAt });
  // DW2's failing job waits in pg-boss's retry state, due since Monday: after the restart no worker takes that queue.
  ok("PF-23w DW3 pass: a job in the retry state long past its due time is reported stuck too", stuckFor("pf23w.boom").length > 0, stuckFor("pf23w.boom"));
  // The dead-letter list: DW2's failing job, its handler registered again on this app, runs out of retries and lands
  // there, where no worker takes it; however old it gets, it is never reported stuck.
  await jobs.handle("pf23w.boom", async () => { boomRuns++; throw new Error("pf23w boom"); });
  const deadCount = async () => (await q<{ n: number }>(`select count(*)::int as n from platform_jobs.job where name = $1`, [DEAD_LETTER]))[0]!.n;
  await tickUntil(async () => (await deadCount()) > 0, 30_000, 120);
  const dead = await deadCount();
  await tickUntil(() => false, 60_000, 32);   // the dead-letter row is now over STUCK_JOB_MS old, and the cron ran each minute
  ok("PF-23w DW3 fail: the dead-letter list (DW2's failed job, waiting with no worker) is never reported stuck", dead > 0 && stuckFor(DEAD_LETTER).length === 0, { dead, boomRuns, alerts: stuckFor(DEAD_LETTER) });
} finally {
  await current?.close().catch(() => {});
  await sql.end();
  execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", DB]);
}

// ------------------------------------------------------------------------------------------------------ DW5, DW6
// qa's own checks, from qa's PR #1789 until it merges (tests/pf23w-qa-checks.ts says why they live there): on a checkout
// without them the case is reported "NOT RUN" with the reason (never a pass), and the PR pastes their output.
for (const c of QA_CHECKS) {
  const r = runQaCheck(c.path);
  if (!r) { console.log(`NOT RUN  ${c.name} — ${c.path} is not on this checkout (qa's #1789)`); continue; }
  console.log(r.out.split("\n").map((l) => `    ${c.tag}| ${l}`).join("\n"));
  ok(c.name, r.status === 0 && c.pattern.test(r.out), r.out.slice(-300));
}
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
