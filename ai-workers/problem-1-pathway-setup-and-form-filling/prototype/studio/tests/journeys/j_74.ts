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
//   W5-W7, a government step (CS-DL3 part 2, QA-591) on the same case, reopened, as the representative signed in (staff
//   session): W5 Government steps › Record a step, by keyboard: a biometrics instruction letter of today, due in 30 days;
//   W6 its reminders are listed on the case, and they are the very jobs the reminders arm (7, 2 and 0 open days before);
//   W7 cancel it with a reason and record it again: both lines show, the first as cancelled, its jobs cancelled, the
//   second's armed. Today is the server's real day here (the walk's own FakeClock and queue start at now).
//   W6b-W7b (CS-DL3 part 3, R1.74's last part; brief build-lead-c-briefs/CS-DL3-3.md): the walk's reminders go through
//   PF-18n's real store (PrismaNotificationPort, msg_notification), each job in its firm's scope as PF-14's runner does.
//   W6b the clock reaches 7 working days before the step's due date: its reminder reaches the representative and the
//   officer once each (NR: an hour before, nobody); W6c the officer signs in, opens Home and finds it under "Needs you"
//   only by PF-18h's data-needs-you-item hooks (NR: before the reminder, no item), opens it and lands on the case, whose
//   Government steps line names the step and its due date (the item names the case only, PF-18h concept Q1); W7b after
//   the cancel the clock reaches 2 working days before: the cancelled step reminds nobody and no data-needs-you-item for
//   it comes back on Home, while the step recorded again does (NR: the same walk is not simply silent).
// What stays a stand-in (said, not hidden): the reminders run in this process on the copy's own database with PF-0p's
// fakeJobs on a FakeClock (PF-14's runner is the same JobPort). W1-W4 tell fakeNotifications; W5-W7b tell PF-18n's real
// store (PrismaNotificationPort), so Home's "Reminder came in" shows the walk's clock time, a date ahead of today. The
// running app's own job runner on real time is not walked here. The route is marked CITED here: labelled test data,
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
const { MILESTONE_JOB } = await import("../../api/src/case-deadlines/milestones.ts");
const { PrismaNotificationPort } = await import("../../api/src/platform/notifications/store.ts");
const { PrismaNotificationPrefs } = await import("../../api/src/platform/settings/notifications/prefs.ts");
const { withFirm } = await import("../../api/src/platform/firm-scope.ts");
const { CLOSED_DAYS, TIME_ZONE, readSetting, writeSetting } = await import("../../api/src/platform/settings.ts");
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
  const told: { staffId: string; stageId: string; at: string; item: string; kind: string }[] = [];
  const notifications = { ...inner, async notify(tx: unknown, r: { staffId: string }, k: Parameters<typeof inner.notify>[2], i: Parameters<typeof inner.notify>[3]) { told.push({ staffId: r.staffId, stageId: i.id, at: clock.now().toISOString().slice(0, 16), item: i.kind, kind: k }); return inner.notify(tx, r, k, i); } };
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
  // Review S6: on a copy used before, other open cases on the cited route have reminders too; W3 and W4 judge this case's.
  const stagesHere = new Set((sql(`select id from case_stage where case_id = '${caseId}'`) ?? "").split("\n").map((x) => x.trim()).filter(Boolean));
  const toldHere = () => told.filter((t) => stagesHere.has(t.stageId));
  const w = await staffApi(R, "POST", `/runtime/cases/${caseId}/withdraw`, { reason: "The client withdrew (test walk)", withdrawnOn: new Date().toISOString().slice(0, 10) });
  await dl.sweep(); await walk("2027-02-26T12:00:00.000Z");
  ok("J-74 W3 (DW3): withdrawn through CS-C1a's route with the representative's session: case.closed in the outbox, the three reminders cancelled, none fires (24 Feb passes)",
    w.status === 200 && one(`select count(*) from module_event where subject_id = '${caseId}' and type = 'case.closed'`) === "1" && mine(caseId, "cancelled").length === 3 && toldHere().length === 0, w.status);
  const r = await staffApi(R, "POST", `/runtime/cases/${caseId}/reopen`, { reason: "The client came back (test walk)" });
  await dl.sweep(); await walk("2027-03-09T12:00:00.000Z");
  const at = [...new Set(toldHere().map((t) => t.at))];
  ok("J-74 W4 (DW2): reopened: the two reminders still to come reach the representative and the officer once each (Wed 3 and Thu 4 Mar, 09:00 Toronto); the passed one never fires late",
    r.status === 200 && at.join() === "2027-03-03T14:00,2027-03-04T14:00" && toldHere().length === 4 && toldHere().every((t) => t.stageId === one(`select id from case_stage where case_id = '${caseId}' and state = 'CURRENT'`) && [REP, OFF].includes(t.staffId)), { status: r.status, told: toldHere() });
  // ---------------------------------------------------------------------------------------------------- W5-W7 a government step
  // Its own clock and queue at now (the walk's clock has passed March 2027); the copy's server reads its own real day.
  // Part 3: PF-18n's real store, so the reminder is a msg_notification row the app's Home reads; each job runs in its
  // firm's scope, as PF-14's runner does (the store refuses a write with no firm in scope).
  const clock2 = new FakeClock(new Date()), jobs2 = fakeJobs(clock2);
  const store = new PrismaNotificationPort((tx) => new PrismaNotificationPrefs(tx), () => clock2.now());
  const real = Object.assign(Object.create(store), { async notify(tx: unknown, r: { staffId: string }, k: Parameters<typeof inner.notify>[2], i: Parameters<typeof inner.notify>[3]) { told.push({ staffId: r.staffId, stageId: i.id, at: clock2.now().toISOString().slice(0, 16), item: i.kind, kind: k }); return store.notify(tx as never, r, k, i); } });
  const scoped = { ...jobs2, async handle(name: string, h: Parameters<typeof jobs2.handle>[1]) { return jobs2.handle(name, (j) => j.firmId ? withFirm(j.firmId, () => h(j)) : h(j)); } };
  const dl2 = new CaseDeadlines({ db, jobs: scoped as typeof jobs2, notifications: real, clock: clock2 });
  await dl2.register({ sweep: false });
  const ZONE = await readSetting<string>(db as never, FA, TIME_ZONE.key);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const due = new Date(Date.parse(`${today}T00:00:00Z`) + 30 * 86_400_000).toISOString().slice(0, 10);
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], words = (d: string) => `${Number(d.slice(8, 10))} ${MON[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`;
  const steps = p.locator("[data-gov-steps]"), gov = (k: string) => p.locator(`[data-gov-dialog="${k}"]`), fld = (k: string, f: string) => gov(k).locator(`[data-gov-field="${f}"]`);
  const reach = async (el: ReturnType<typeof p.locator>) => { for (let i = 0; i < 250; i++) { if (await el.evaluate((x) => x === document.activeElement).catch(() => false)) return; await p.keyboard.press("Tab"); } throw new Error("not reached by Tab"); };
  const record = async (dueOn: string) => {
    await reach(steps.locator("[data-gov-record]")); await p.keyboard.press("Enter"); await gov("record").waitFor();
    await reach(fld("record", "milestoneKey")); await fld("record", "milestoneKey").selectOption("biometrics");
    await reach(fld("record", "occurredOn")); await fld("record", "occurredOn").fill(today);   // Tab walks a date's own parts: reach the next field
    await reach(fld("record", "dueOn")); await fld("record", "dueOn").fill(dueOn);
    await reach(fld("record", "reference")); await p.keyboard.type("B-J74-0001");
    await reach(gov("record").locator("[data-gov-send]")); await p.keyboard.press("Enter"); await gov("record").waitFor({ state: "detached", timeout: 15_000 });
  };
  const walk2 = async (to: number) => { while (clock2.now().getTime() < to) await clock2.set(new Date(Math.min(clock2.now().getTime() + 3_600_000, to))); };
  const toldStep = (id: string) => told.filter((t) => t.item === "case-milestone" && t.stageId === id);
  const mjobs = (id: string, status?: string) => jobs2.jobs.filter((j) => j.name === MILESTONE_JOB && j.payload.milestoneId === id && (!status || j.status === status));
  await p.evaluate((t) => sessionStorage.setItem("xr-staff-session", JSON.stringify({ token: t, expiresAt: Date.now() + 3_600_000 })), R);
  await p.reload(); await steps.locator("[data-gov-empty]").waitFor({ timeout: 30_000 }); await settle();
  await record(due);
  const line1 = steps.locator('[data-gov-state="open"]'); await line1.waitFor();
  const t1 = await line1.innerText(), m1 = (await line1.getAttribute("data-gov-step"))!;
  ok(`J-74 W5: the representative records a biometrics instruction letter of ${words(today)} by keyboard; Government steps shows it due ${words(due)}, "in 30 days", with its reference`,
    t1.includes("Biometrics instruction letter") && t1.includes(words(due)) && t1.includes("in 30 days") && t1.includes("Ref. B-J74-0001")
      && one(`select due_on from case_milestone where id = '${m1}'`) === due, t1);
  await dl2.sweep();
  const listed = (await line1.locator("[data-gov-reminders]").innerText()), armed = mjobs(m1, "waiting").map((j) => j.payload.day as string).sort();
  ok("J-74 W6: its reminders are listed on the case, and they are the jobs the reminders armed: three, 7, 2 and 0 open days before the due date, each day named on the case",
    listed.startsWith("Reminders planned:") && armed.length === 3 && armed.every((d) => listed.includes(words(d))) && mjobs(m1).map((j) => j.payload.offset).sort().join() === "0,2,7", { listed, armed });
  const va = (await new AxeBuilder({ page: p }).include("[data-gov-steps]").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze()).violations;
  ok("J-74 W6 axe: Government steps has no WCAG 2.2 A/AA violation", va.length === 0, va.map((x) => x.id));
  const runAt = (id: string, offset: number) => mjobs(id).find((j) => j.payload.offset === offset)!.runAt.getTime();
  // W6c: the officer, signed in as firm staff, on Home. An item is found only by its data-needs-you-item hook, whose value
  // is the officer's own notification row for this step (never a class or a position).
  const TO = (await staffApi(null, "POST", "/platform/session/local", { firmKey: "sample-firm", actorId: "user-O", secondStep: true })).body?.token as string;
  const po = await (await b.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light", reducedMotion: "reduce" })).newPage();
  po.on("pageerror", (e) => errs.push(e.message));
  await po.addInitScript((t) => { sessionStorage.setItem("xr-staff-session", JSON.stringify({ token: t, expiresAt: Date.now() + 3_600_000 })); localStorage.setItem("xr-actor", "user-O"); }, TO);
  const NUMBER = one(`select case_number from runtime_case where id = '${caseId}'`);
  const noteOf = (step: string) => one(`select id from msg_notification where staff_id = '${OFF}' and item_id = '${step}'`);
  const home = async () => { await po.goto(`${BASE}/home`); await po.locator("[data-needs-you-item], [data-needs-you-empty]").first().waitFor({ timeout: 30_000 }); };
  const item = (step: string) => po.locator(`[data-needs-you-item="${noteOf(step)}"]`);
  await walk2(runAt(m1, 7) - 3_600_000);
  const before7 = toldStep(m1).length, rowsBefore = one(`select count(*) from msg_notification where item_id = '${m1}'`);
  await home();
  const onHomeBefore = await po.locator("[data-needs-you-item]", { hasText: `case ${NUMBER}` }).count();
  await walk2(runAt(m1, 7) + 60_000);
  const at7 = toldStep(m1);
  ok("J-74 W6b NR: an hour before the 7-working-day reminder, the step has told nobody, has no row in the store, and the officer's Home has no data-needs-you-item for this case", before7 === 0 && rowsBefore === "0" && onHomeBefore === 0, { before7, rowsBefore, onHomeBefore });
  ok(`J-74 W6b: at 7 working days before the due date (${armed[0]}, 09:00 in the firm's zone) the step's reminder reaches the representative and the officer once each, as a case-milestone deadline`,
    at7.length === 2 && new Set(at7.map((t) => t.staffId)).size === 2 && at7.every((t) => [REP, OFF].includes(t.staffId) && t.kind === "case-milestone-deadline")
      && one(`select count(*) from msg_notification where item_id = '${m1}' and read_at is null`) === "2", at7);
  await home();
  const itemText = await item(m1).innerText().catch(() => "");
  ok("J-74 W6c: the officer signs in and opens Home: under \"Needs you\" one item (by its data-needs-you-item hook) says \"A government step on case " + NUMBER + "\"",
    !!TO && !!noteOf(m1) && await item(m1).count() === 1 && itemText.includes(`A government step on case ${NUMBER}`), itemText);
  const vh = (await new AxeBuilder({ page: po }).include("[data-needs-you]").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze()).violations;
  ok("J-74 W6c axe: Needs you has no WCAG 2.2 A/AA violation", vh.length === 0, vh.map((x) => x.id));
  await item(m1).locator("[data-needs-you-open]").focus(); await po.keyboard.press("Enter");
  await po.waitForURL(`${BASE}/cases/${caseId}`, { timeout: 30_000 }); await po.locator("[data-gov-steps] [data-gov-step]").first().waitFor({ timeout: 30_000 });
  const landed = await po.locator(`[data-gov-step="${m1}"]`).innerText(), header = await po.locator("[data-case-number-h]").innerText();
  ok(`J-74 W6c: opening it (keyboard) lands on case ${NUMBER}, whose Government steps line names the step and its due date ${words(due)}; the item is read`,
    header === NUMBER && landed.includes("Biometrics instruction letter") && landed.includes(words(due)) && one(`select read_at is not null from msg_notification where id = '${noteOf(m1)}'`) === "t", { header, landed });
  await reach(line1.locator("[data-gov-cancel]")); await p.keyboard.press("Enter"); await gov("cancel").waitFor();
  await reach(fld("cancel", "reason")); await p.keyboard.type("The due date was typed wrong (test walk)");
  await reach(gov("cancel").locator("[data-gov-cancel-send]")); await p.keyboard.press("Enter"); await gov("cancel").waitFor({ state: "detached", timeout: 15_000 });
  await steps.locator('[data-gov-state="cancelled"]').waitFor();
  const due2 = new Date(Date.parse(`${due}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
  await record(due2); await steps.locator('[data-gov-state="open"]').waitFor();
  await dl2.sweep();
  const m2 = (await steps.locator('[data-gov-state="open"]').getAttribute("data-gov-step"))!, tc = await steps.locator('[data-gov-state="cancelled"]').innerText();
  ok(`J-74 W7: cancelled with a reason and recorded again (due ${words(due2)}): both lines show, the first as Cancelled with its reason; its jobs still to come are cancelled (the 7-day one already ran in W6b) and the new step's three armed`,
    await steps.locator("[data-gov-step]").count() === 2 && tc.includes("Cancelled") && tc.includes("Reason: The due date was typed wrong (test walk)") && m2 !== m1
      && mjobs(m1, "cancelled").length === 2 && mjobs(m1, "waiting").length === 0 && mjobs(m2, "waiting").length === 3
      && one(`select string_agg(due_on::text || ':' || (cancelled_at is not null)::text, ',' order by recorded_at) from case_milestone where case_id = '${caseId}'`) === `${due}:true,${due2}:false`, { tc, m1: mjobs(m1).map((j) => j.status), m2: mjobs(m2).map((j) => j.status) });
  await walk2(runAt(m1, 2) + 60_000);
  await home();
  ok("J-74 W7b: at 2 working days before the cancelled step's due date nothing more reaches anyone for it (its two told stay the 7-day ones), and Home shows no data-needs-you-item for it",
    toldStep(m1).length === 2 && await item(m1).count() === 0 && one(`select count(*) from msg_notification where item_id = '${m1}' and read_at is null and staff_id = '${OFF}'`) === "0", { told: toldStep(m1).length, items: await item(m1).count() });
  ok("J-74 W7b NR: in the same walk the step recorded again (open) does remind its people, so the silence is the cancel's, not a stopped clock",
    toldStep(m2).length >= 2 && toldStep(m2).every((t) => [REP, OFF].includes(t.staffId)) && await item(m2).count() === 1, { told: toldStep(m2).length, items: await item(m2).count() });
  ok("J-74 walk: no page error on the way", errs.length === 0, errs);
  await b.close();
} catch (e) {
  failed++; console.log(`FAIL  J-74 stopped: ${(e as Error).stack ?? e}`);
} finally {
  await db.$disconnect();
}
const f = rec.summary();
process.exit(f || failed ? 1 : 0);
