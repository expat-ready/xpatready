// J-74 (map row 74, R1.74: government and stage deadlines that remind, counted back over the firm's open days; P-728: it
// merges in the same PR as CS-DL1 part 2): the join-and-walk row. It walks the merged parts (C6.17's route and Start next
// stage, CS-DL1a's deadline view, CS-DL1b's reminders, CS-C1a's withdraw and reopen) on an isolated copy of the running app
// (its own database and port, never :4400), on screen and through the API, as the firm's case officer would.
//   DW1-DW4, the swaps shown real; each judge also runs on its stand-in, where it must fail (the NR lines, as j_77.ts):
//     DW1 the firm's own calendar (Settings' closed days) marks the date and moves the reminders earlier; NR: with the
//         defaults (no closed day) the same judge fails.
//     DW2 the recipients are the case's own team, found as the firm's staff; NR: a job carrying firm B's id reads
//         nothing of firm A's case and tells nobody.
//     DW3 the close and reopen come from CS-C1a's real routes with a staff session, through the outbox; NR: the same
//         withdraw sent as the simulated person (x-actor only) is 401, writes no event, and cancels nothing.
//     DW4 only a cited route reminds (P-412 F13 (b)); NR: the same case with its route back to Sample arms nothing.
//   W1-W4, the walk at 1440 px (axe on the strip): W1 open a case on the study permit (route "Study, then work"); W2 Start
//   next stage with the study permit's end date: the work permit's deadline shows "Mon 8 Mar 2027 (closed day)", the
//   reminders armed for it (the deadline followed the stage); W3 withdraw: none fires; W4 reopen: the two still to come
//   reach the representative and the officer once each.
// What stays a stand-in (said, not hidden): the reminders run in this process on the copy's own database with PF-0p's
// fakeJobs on a FakeClock (PF-14's runner is the same JobPort) and fakeNotifications (PF-18n's real adapter is not on main;
// the app arms nothing until it is bound, features/case-deadlines.ts). The route is marked CITED here: labelled test data,
// no immigration value (every real route is Sample). The firm's closed days are test data. US$0, no model call, live AI off.
// Run from prototype/ (HEADED=1 opens a visible browser, slowed; on Linux under xvfb-run):
//   zsh studio/tools/isolated.sh j74 4474 start AI_LIVE=off PLATFORM_IDENTITY=local PLATFORM_SAMPLE_SEED=on && trap 'zsh studio/tools/isolated.sh j74 4474 stop' EXIT && tsx --tsconfig studio/api/tsconfig.json studio/tests/journeys/j_74.ts j74 4474
import "reflect-metadata";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { chromium } from "playwright";
const { default: AxeBuilder } = createRequire(import.meta.url)("@axe-core/playwright") as typeof import("@axe-core/playwright");
const [NAME, PORT_ARG] = [process.argv[2] ?? "j74", process.argv[3] ?? "4474"];
process.argv[2] = PORT_ARG; process.argv[3] = `xr_studio_${NAME}`;
const { AUTHOR, DB, PORT, call, ok, rec, sql } = await import("../../acceptance/lib/m3.ts");
if (PORT === 4400) { console.log("refused: never the demo on :4400"); process.exit(2); }
const BASE = `http://localhost:${PORT}`, HEADED = process.env.HEADED === "1";
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://xr_studio@127.0.0.1:54329/${DB}`, options: "-c TimeZone=UTC" }) });
const { CaseDeadlines } = await import("../../api/src/case-deadlines/reminders.ts");
const { REMINDER_JOB } = await import("../../api/src/case-deadlines/plan.ts");
const { CLOSED_DAYS, writeSetting } = await import("../../api/src/platform/settings.ts");
const { platformAuditWorkspaceId } = await import("../../api/src/platform/identity/audit.ts");
const { FakeClock } = await import("../../ports/clock.ts"), { fakeJobs } = await import("../../ports/jobs.ts"), { fakeNotifications } = await import("../../ports/notifications.ts");
const one = (q: string) => (sql(q) ?? "").split("\n")[0].trim();
const staffApi = async (t: string | null, method: string, path: string, body?: unknown, actor?: string) => {
  const r = await fetch(`${BASE}/api${path}`, { method, headers: { "content-type": "application/json", ...(t ? { authorization: `Bearer ${t}` } : {}), ...(actor ? { "x-actor": actor } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: r.status, body: await r.json().catch(() => null) as any };   // eslint-disable-line @typescript-eslint/no-explicit-any -- API answers are read loosely, as in the other checks
};

let failed = 0;
try {
  // ---------------------------------------------------------------------------------------------------- setup
  if (!one(`select count(*) from route`) || one(`select count(*) from route`) === "0") {
    const l = await call("POST", "/demo/load", { sample: "configured" }, AUTHOR);
    ok("J-74 setup: Demo › Load the configured checkpoint (its Sample route \"Study, then work\")", l.status < 300, l.status);
  }
  const routeKey = one(`select key from route where stages::text like '%permit_valid_until%' limit 1`);
  ok("J-74 setup: the route whose work permit deadline reads the study permit's end date is loaded", !!routeKey);
  const FA = one(`select id from platform_firm where key = 'sample-firm'`), FB = one(`select id from platform_firm where key = 'sample-solo'`);
  const REP = one(`select id from platform_staff where actor_id = 'user-R'`), OFF = one(`select id from platform_staff where actor_id = 'user-O'`);
  const signed = await staffApi(null, "POST", "/platform/session/local", { firmKey: "sample-firm", email: "representative@sample-firm.example.com", secondStep: true });
  const R = signed.body?.token as string;
  ok("J-74 setup: the Sample firms and their staff are seeded; the representative signs in (local stand-in)", !!FA && !!FB && !!REP && !!OFF && !!R, signed.status);
  sql(`update route set basis = 'CITED' where key = '${routeKey}'`);   // labelled test data (see the header)
  const clock = new FakeClock(new Date()), jobs = fakeJobs(clock), inner = fakeNotifications({ now: () => clock.now() });
  const told: { staffId: string; stageId: string; at: string }[] = [];
  const notifications = { ...inner, async notify(tx: unknown, r: { staffId: string }, k: Parameters<typeof inner.notify>[2], i: Parameters<typeof inner.notify>[3]) { told.push({ staffId: r.staffId, stageId: i.id, at: clock.now().toISOString().slice(0, 16) }); return inner.notify(tx, r, k, i); } };
  const dl = new CaseDeadlines({ db, jobs, notifications, clock });
  await dl.register({ sweep: false });
  const walk = async (to: string) => { while (clock.now() < new Date(to)) await clock.set(new Date(Math.min(clock.now().getTime() + 3_600_000, Date.parse(to)))); };
  const mine = (id: string, status?: string) => jobs.jobs.filter((j) => j.name === REMINDER_JOB && j.payload.caseId === id && (!status || j.status === status));

  // ---------------------------------------------------------------------------------------------------- W1, W2 on screen
  const b = await chromium.launch({ headless: !HEADED, slowMo: HEADED ? 250 : 0, ...(process.platform === "darwin" ? { channel: "chrome" } : existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {}) });
  const p = await (await b.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light", reducedMotion: "reduce" })).newPage(); const errs: string[] = [];
  p.on("pageerror", (e) => errs.push(e.message));
  await p.goto(BASE); await p.evaluate(() => localStorage.setItem("xr-actor", "user-O"));
  const settle = async () => { await p.waitForFunction(() => !document.querySelector('[aria-busy="true"]') && !document.querySelector(".animate-spin"), null, { timeout: 30_000 }); await p.waitForTimeout(300); };
  await p.goto(`${BASE}/cases`); await settle(); await p.getByRole("button", { name: "Open a case" }).click();
  const sel = p.getByLabel("Combination (released)"); await sel.selectOption((await sel.locator("option", { hasText: "Outside Canada" }).first().getAttribute("value"))!);
  await p.getByLabel("Your own reference (optional)").fill(`J74-${Date.now().toString(36).slice(-4)}`); await p.getByLabel("Principal applicant's name").fill("Sample Client J74");
  await p.getByRole("button", { name: "Open case" }).click(); await p.waitForURL(/\/cases\/[0-9a-f-]{36}$/); await p.locator("[data-start-next]").waitFor(); await settle();
  const caseId = p.url().split("/").pop()!;
  const team = sql(`select string_agg(role || ':' || user_id, ',' order by role) from case_team_member where case_id = '${caseId}' and ended_at is null`);
  await dl.sweep();
  ok("J-74 W1: the officer opens a case on the study permit (firm A, team: representative user-R, officer user-O); its current stage has no deadline, so nothing is armed",
    one(`select firm_key from runtime_case where id = '${caseId}'`) === "sample-firm" && team === "LEAD_REPRESENTATIVE:user-R,OFFICER:user-O" && mine(caseId).length === 0, team);
  // DW1: firm A's Settings close Fri 5 and Mon 8 Mar 2027 (test data).
  await writeSetting(db as never, { firmId: FA, key: CLOSED_DAYS.key, value: ["2027-03-05", "2027-03-08"], by: "seed:j74", workspaceId: await platformAuditWorkspaceId(db as never) });
  await p.locator("[data-start-next]").focus(); await p.keyboard.press("Enter"); await p.locator("[data-start-dialog]").waitFor(); await settle();
  const dlg = p.locator("[data-start-dialog]");
  await dlg.getByLabel("Study permit valid until (optional)").fill("2027-03-08");
  await dlg.getByLabel("Reason").fill("The study permit was filed by the client before the firm took the case (test walk)");
  await p.locator("[data-start-confirm]").click(); await p.locator("[data-start-dialog]").waitFor({ state: "detached" }); await settle();
  const strip = await p.locator("[data-stage-strip]").innerText();
  ok("J-74 W2 (DW1): after Start next stage the work permit is current and its deadline shows \"Mon 8 Mar 2027 (closed day)\": the calendar date, never moved, marked by the firm's own closed days",
    /Mon 8 Mar 2027 \(closed day\)/.test(strip), strip);
  const v = (await new AxeBuilder({ page: p }).include("[data-stage-strip]").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze()).violations;
  ok("J-74 W2 axe: the stage strip has no WCAG 2.2 A/AA violation; 1440 px, no sideways scroll", v.length === 0 && await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), v.map((x) => x.id));
  await dl.sweep();
  ok("J-74 W2 (DW1): the deadline followed the stage: three reminders armed for the work permit, counted back over open days: Wed 24 Feb (7), Wed 3 Mar (2), Thu 4 Mar (on the day: Fri 5 and Mon 8 are closed)",
    mine(caseId).map((j) => j.payload.day).join() === "2027-02-24,2027-03-03,2027-03-04", mine(caseId).map((j) => j.payload.day));
  const bare = (await import("../../api/src/case-deadlines/plan.ts")).remindersOf(caseId, "x", "2027-03-08", 0, { zone: "America/Toronto", hours: ["MON", "TUE", "WED", "THU", "FRI"].map((day) => ({ day, opens: "09:00", closes: "17:00" })), closedDays: [] }).map((r) => r.day).join();
  ok("J-74 DW1 NR: with the defaults (no closed day) the same judge fails: the days would be Thu 25 Feb, Thu 4 Mar, Mon 8 Mar", bare === "2027-02-25,2027-03-04,2027-03-08" && bare !== mine(caseId).map((j) => j.payload.day).join(), bare);

  // ---------------------------------------------------------------------------------------------------- DW2, DW4
  const stray = await dl.runReminder({ payload: mine(caseId)[0].payload, key: mine(caseId)[0].key, firmId: FB });
  ok("J-74 DW2 NR: a job carrying firm B's id reads nothing of firm A's case and tells nobody", stray === 0 && told.length === 0);
  sql(`update route set basis = 'SAMPLE' where key = '${routeKey}'`);
  const sampleArm = await dl.arm(caseId), sampleRun = await dl.runReminder({ payload: mine(caseId)[0].payload, key: mine(caseId)[0].key, firmId: FA });
  sql(`update route set basis = 'CITED' where key = '${routeKey}'`);
  ok("J-74 DW4 NR: with the route back to Sample the case arms nothing and a waiting job tells nobody (shown, never reminded)", sampleArm.length === 0 && sampleRun === 0 && told.length === 0);

  // ---------------------------------------------------------------------------------------------------- W3, W4, DW3
  const asPerson = await staffApi(null, "POST", `/runtime/cases/${caseId}/withdraw`, { reason: "Test walk", withdrawnOn: new Date().toISOString().slice(0, 10) }, "user-R");
  await dl.sweep();
  ok("J-74 DW3 NR: the withdraw sent as the simulated person (x-actor only) is 401, writes no case.closed and cancels nothing", asPerson.status === 401 && one(`select count(*) from module_event where subject_id = '${caseId}'`) === "0" && mine(caseId, "waiting").length === 3, asPerson.status);
  const w = await staffApi(R, "POST", `/runtime/cases/${caseId}/withdraw`, { reason: "The client withdrew (test walk)", withdrawnOn: new Date().toISOString().slice(0, 10) });
  await dl.sweep(); await walk("2027-02-26T12:00:00.000Z");
  ok("J-74 W3 (DW3): withdrawn through CS-C1a's route with the representative's session: case.closed in the outbox, the three reminders cancelled, none fires (24 Feb passes)",
    w.status === 200 && one(`select count(*) from module_event where subject_id = '${caseId}' and type = 'case.closed'`) === "1" && mine(caseId, "cancelled").length === 3 && told.length === 0, w.status);
  const r = await staffApi(R, "POST", `/runtime/cases/${caseId}/reopen`, { reason: "The client came back (test walk)" });
  await dl.sweep(); await walk("2027-03-09T12:00:00.000Z");
  const at = [...new Set(told.map((t) => t.at))];
  ok("J-74 W4 (DW2): reopened: the two reminders still to come reach the representative and the officer once each (Wed 3 and Thu 4 Mar, 09:00 Toronto); the passed one never fires late",
    r.status === 200 && at.join() === "2027-03-03T14:00,2027-03-04T14:00" && told.length === 4 && told.every((t) => t.stageId === one(`select id from case_stage where case_id = '${caseId}' and state = 'CURRENT'`) && [REP, OFF].includes(t.staffId)), { status: r.status, told });
  ok("J-74 walk: no page error on the way", errs.length === 0, errs);
  await b.close();
} catch (e) {
  failed++; console.log(`FAIL  J-74 stopped: ${(e as Error).stack ?? e}`);
} finally {
  await db.$disconnect();
}
const f = rec.summary();
process.exit(f || failed ? 1 : 0);
