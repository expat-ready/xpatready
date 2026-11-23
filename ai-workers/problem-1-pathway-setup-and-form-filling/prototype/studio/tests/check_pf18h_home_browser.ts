// PF-18h (concept product/screens/pf-18h-home r3, approved by the tech lead at r2; R1.74, QA-471 part 2): the staff Home's
// "Needs you" list, walked in a browser on an isolated copy (its own database and port, never :4400), with the API and the
// database read underneath. The reminders are real: CaseDeadlines' own milestone reminder job (CS-DL3 part 1) runs here
// on a FakeClock with PF-0p's fakeJobs (PF-18n part 1's DW6 proves the real job runner fires it), and tells people through
// PrismaNotificationPort, PF-18n's real adapter, into the copy's msg_notification. Each line has a pass and a fail:
//   DW1 the 7-day reminder for a case I officer shows one item, with its case number; fail: a NEEDS_YOU-group row for me
//       (another group) shows nothing;
//   DW2 hidden, then the 2-day reminder of the same deadline brings it back: one item, total 1; fail: a second, different
//       deadline does add a second item (the count is real);
//   DW3 opening it marks it read, then lands on the case page showing that case's number (Q2: the page acts as the
//       simulated officer, labelled scaffolding), and Home no longer lists it; fail: the representative's item for the
//       same deadline stays unread on theirs;
//   DW4 another person's and another firm's items never show (API and page); fail: firm B's staff sees an empty list and
//       marking firm A's row read is 404;
//   DW5 keyboard only (Tab to the row's link, Enter opens; Tab to Hide, Space hides; focus moves on), axe clean (WCAG 2.2
//       A/AA) at 375, 1024 and 1440 px, no sideways scroll; fail: the same axe run finds an unlabelled control we add;
//   BR-6 a row whose case cannot be opened shows with no link; BR-7 the times are in my office's zone (fail: no office
//       gives the firm's zone); BR-5/BR-8 26 items: the newest 20 shown, "26 items need you" in words, "of 26".
// Sample rows only; the government step's name is Sample. US$0, no model call; live AI off.
// Screenshots (deviceScaleFactor 1) in product/screens/pf-18h-home/screenshots/. Run from prototype/:
//   zsh studio/tools/isolated.sh pf18h 4718 start AI_LIVE=off PLATFORM_IDENTITY=local && tsx studio/tests/check_pf18h_home_browser.ts 4718 xr_studio_pf18h
import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { chromium, type Browser, type Locator, type Page } from "playwright";
import { seedSampleFirms } from "../api/src/platform/seed-sample-firms.ts";
import { withFirm } from "../api/src/platform/firm-scope.ts";
import { CaseDeadlines } from "../api/src/case-deadlines/reminders.ts";
import { MILESTONE_JOB } from "../api/src/case-deadlines/milestones.ts";
import { PrismaNotificationPort } from "../api/src/platform/notifications/store.ts";
import { PrismaNotificationPrefs } from "../api/src/platform/settings/notifications/prefs.ts";
import { FakeClock } from "../ports/clock.ts";
import { fakeJobs } from "../ports/jobs.ts";
import { NOTIFICATION_KIND } from "../ports/notifications.ts";
import { client, recorder } from "./runtime/api.ts";
const { default: AxeBuilder } = createRequire(import.meta.url)("@axe-core/playwright") as typeof import("@axe-core/playwright");

const [PORT, DBNAME] = [Number(process.argv[2] ?? 4718), process.argv[3] ?? "xr_studio_pf18h"];
if (PORT === 4400 || DBNAME === "xr_studio_demo") { console.log("refused: never the demo on :4400"); process.exit(2); }
const BASE = `http://localhost:${PORT}`, STUDIO = join(import.meta.dirname, "..");
const SHOTS = join(STUDIO, "..", "..", "product", "screens", "pf-18h-home", "screenshots"); mkdirSync(SHOTS, { recursive: true });
const { ok, summary } = recorder();
const { sql: rawSql } = client(PORT, DBNAME);
const sql = (q: string) => (rawSql(q) ?? "").split("\n")[0].trim();
const run = Date.now().toString(36);
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://xr_studio@127.0.0.1:54329/${DBNAME}`, options: "-c TimeZone=UTC" }) });
type Ans = { status: number; body: any; text: string };   // eslint-disable-line @typescript-eslint/no-explicit-any -- API answers are read loosely, as in the other checks
const api = async (t: string | null, method: string, path: string, body?: unknown, actor?: string): Promise<Ans> => {
  const r = await fetch(`${BASE}/api${path}`, { method, headers: { "content-type": "application/json", ...(t ? { authorization: `Bearer ${t}` } : {}), ...(actor ? { "x-actor": actor } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text(); let j: unknown = null; try { j = JSON.parse(text); } catch { /* not JSON */ }
  return { status: r.status, body: j, text };
};
const ZONE = "America/Toronto";
const today = new Intl.DateTimeFormat("en-CA", { timeZone: ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const plus = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

// ------------------------------------------------------------------------------------------------ setup (Sample)
await seedSampleFirms(db);
const vv = () => sql(`select c.id from combination c where c.combination_key = 'vv.single' and exists (select 1 from config_release r where r.combination_id = c.id)`);
if (!vv()) await api(null, "POST", "/demo/load", { sample: "configured" }, "user-A");
const VV = vv(), A = sql(`select id from platform_firm where key = 'sample-firm'`), B = sql(`select id from platform_firm where key = 'sample-solo'`);
const staffOf = (actor: string) => sql(`select id from platform_staff where actor_id = '${actor}' and firm_id = '${A}'`);
const OFF = staffOf("user-O"), REP = staffOf("user-R");
const signIn = async (firmKey: string, who: { actorId?: string; email?: string }): Promise<string> => {
  const r = await api(null, "POST", "/platform/session/local", { firmKey, ...who, secondStep: true });
  if (r.body?.token) return r.body.token as string;
  console.error(`STOP  local sign-in refused for ${JSON.stringify(who)} (start the copy with PLATFORM_IDENTITY=local): ${r.text.slice(0, 300)}`); process.exit(2);
};
const TO = await signIn("sample-firm", { actorId: "user-O" }), TR = await signIn("sample-firm", { actorId: "user-R" });
const bStaff = sql(`select email from platform_staff where firm_id = '${B}' and status = 'ACTIVE' order by created_at limit 1`);
const TB = await signIn("sample-solo", { email: bStaff });
// A colleague in firm A with no reminders, in an office in another zone (BR-7), labelled test data.
const colleague = await db.platformStaff.create({ data: { firmId: A, actorId: `pf18h-colleague-${run}`, email: `pf18h-colleague-${run}@sample.invalid`, displayName: "Sample colleague" } });
await db.platformRoleGrant.create({ data: { firmId: A, staffId: colleague.id, role: "READ_ONLY", grantedBy: "seed:pf18h" } });
const office = await db.platformOffice.create({ data: { firmId: A, name: `Test office London ${run}`, countryCode: "GB", timeZone: "Europe/London", businessHours: [], closedDays: [], createdBy: "seed:pf18h" } });
await db.platformStaffOffice.create({ data: { firmId: A, staffId: colleague.id, officeId: office.id, setBy: "seed:pf18h" } });
const TC = await signIn("sample-firm", { actorId: colleague.actorId! });
const opened = await api(null, "POST", "/runtime/cases", { combinationId: VV, reference: `PF18H-${run}`, clientActor: "user-P", principal: { displayName: "Sample Client PF18h" }, representative: "user-R", caseOfficers: ["user-O"] }, "user-O");
const CASE = opened.body?.id as string, NUMBER = opened.body?.case_number as string;
const step = await api(TR, "POST", `/runtime/cases/${CASE}/milestones`, { milestoneKey: "biometrics", occurredOn: today, dueOn: plus(today, 30), reference: `B-${run}` });
const STEP = sql(`select id from case_milestone where case_id = '${CASE}' and cancelled_at is null limit 1`);
ok("PF-18h setup: the Sample firms, officer, representative, a colleague in a London office and firm B's staff signed in; an open case with a government step due in 30 days",
  !!VV && !!A && !!B && !!OFF && !!REP && !!TB && !!TC && opened.status < 300 && !!NUMBER && step.status < 300 && !!STEP, { opened: opened.status, step: step.text.slice(0, 200) });

// The reminders: CaseDeadlines' own job on a FakeClock, telling people through PF-18n's real adapter.
const clock = new FakeClock(new Date()), jobs = fakeJobs(clock);
const port = new PrismaNotificationPort((tx) => new PrismaNotificationPrefs(tx), () => clock.now());
const dl = new CaseDeadlines({ db, jobs, notifications: port, clock });
await dl.register({ sweep: false });
await dl.arm(CASE);
const job = (offset: number) => jobs.jobs.find((j) => j.name === MILESTONE_JOB && j.payload.milestoneId === STEP && j.payload.offset === offset && j.status === "waiting");
// The clock moves to the real time first, so a later reminder is later than the one the page shows (PF-18n keeps the newer time).
const remind = async (offset: number) => { await clock.set(new Date(Math.max(Date.now(), clock.now().getTime() + 1))); const j = job(offset)!; return withFirm(A, () => dl.runMilestoneReminder({ payload: j.payload, key: j.key, firmId: A })); };
const notifyAs = (staffId: string, kind: (typeof NOTIFICATION_KIND)[keyof typeof NOTIFICATION_KIND], item: { kind: "case" | "case-milestone"; id: string }) =>
  withFirm(A, () => db.$transaction((tx) => port.notify(tx, { staffId }, kind, item)));
const needs = (t: string) => api(t, "GET", "/platform/me/needs-you");
const rowsOf = (staff: string, unread = true) => Number(sql(`select count(*) from msg_notification where staff_id = '${staff}' and item_id = '${STEP}'${unread ? " and read_at is null" : ""}`));

// ------------------------------------------------------------------------------------------------ the browser
const browser: Browser = await chromium.launch({ headless: process.env.HEADED !== "1", slowMo: process.env.HEADED === "1" ? 200 : 0, ...(existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : process.platform === "darwin" ? { channel: "chrome" } : {}) });
const errs: string[] = [];
const tab = async (token: string, width = 1440, actor = "user-O") => {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1, colorScheme: "light", reducedMotion: "reduce" });
  await ctx.addInitScript((x) => { sessionStorage.setItem("xr-staff-session", JSON.stringify({ token: x.token, expiresAt: Date.now() + 3_600_000 })); localStorage.setItem("xr-actor", x.actor); }, { token, actor });
  const p = await ctx.newPage(); p.on("pageerror", (e) => errs.push(e.message)); return p;
};
const section = (p: Page) => p.locator("[data-needs-you]");
const items = (p: Page) => section(p).locator("[data-needs-you-item]");
const home = async (p: Page) => { await p.goto(`${BASE}/home`); await section(p).locator("[data-needs-you-count], [data-needs-you-empty]").first().waitFor({ timeout: 60_000 }); };
const shot = (p: Page, name: string) => p.screenshot({ path: join(SHOTS, `pf18h-${name}.png`), fullPage: true });
const axe = async (p: Page) => (await new AxeBuilder({ page: p }).include("main").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze()).violations;
const reach = async (p: Page, target: Locator, max = 120) => {
  for (let i = 0; i < max; i++) { if (await target.evaluate((el) => el === document.activeElement).catch(() => false)) return; await p.keyboard.press("Tab"); }
  throw new Error("not reached by Tab");
};

let failed = 0;
try {
  // ---------------------------------------------------------------------------------------------- DW1
  const told7 = await remind(7);
  await notifyAs(OFF, NOTIFICATION_KIND.PORT_SELF_TEST, { kind: "case", id: CASE });   // NEEDS_YOU group: never on this list
  const p = await tab(TO);
  await home(p);
  const n1 = await needs(TO), first = items(p).first();
  ok("PF-18h DW1: the 7-day reminder tells the officer and the representative; the officer's Home lists one item, \"A government step on case <number>\", with when it came in",
    told7 === 2 && await items(p).count() === 1 && (await first.innerText()).includes(`A government step on case ${NUMBER}`) && (await first.innerText()).includes("Reminder came in")
      && (await section(p).locator("[data-needs-you-count]").innerText()) === "1 item needs you" && n1.body?.total === 1, { told7, n1: n1.text.slice(0, 300) });
  ok("PF-18h DW1 fail: the officer's NEEDS_YOU-group notification (another group) is stored and unread, yet Needs you never shows it",
    Number(sql(`select count(*) from msg_notification where staff_id = '${OFF}' and "group" = 'NEEDS_YOU' and read_at is null`)) >= 1 && !(n1.body?.items ?? []).some((i: { kind: string }) => i.kind === "port-self-test"));
  await shot(p, "1-one-item-1440");

  // ---------------------------------------------------------------------------------------------- BR-7
  const nc = await needs(TC);
  ok("PF-18h BR-7: times are in my office's zone: the officer (no office) gets the firm's America/Toronto, named on the page; the London colleague gets Europe/London",
    n1.body?.zone === ZONE && (await section(p).innerText()).includes("Times in America/Toronto") && nc.body?.zone === "Europe/London", { officer: n1.body?.zone, colleague: nc.body?.zone });

  // ---------------------------------------------------------------------------------------------- re-review R1: the loading and load-error states
  const pe = await tab(TO);
  let release: () => void = () => {};
  const held = new Promise<void>((r) => { release = r; });
  await pe.route("**/api/platform/me/needs-you", async (r) => { await held; await r.fulfill({ status: 500, json: { title: "Internal error" } }); });
  await pe.goto(`${BASE}/home`);
  await section(pe).locator('[role="status"][aria-label="Loading what needs you…"]').waitFor({ timeout: 60_000 });
  const vLoading = await axe(pe);
  release();
  await section(pe).getByText("Could not load what needs you.").waitFor({ timeout: 30_000 });
  const vError = await axe(pe);
  await pe.unroute("**/api/platform/me/needs-you");
  await section(pe).getByRole("button", { name: "Try again" }).click();
  await section(pe).locator("[data-needs-you-count]").waitFor({ timeout: 30_000 });
  ok("PF-18h states: loading shows a named status, a failed load says \"Could not load what needs you.\" with Try again, which loads the list; axe clean on both",
    vLoading.length === 0 && vError.length === 0 && await items(pe).count() === 1, { vLoading: vLoading.map((x) => x.id), vError: vError.map((x) => x.id) });
  await pe.context().close();

  // ---------------------------------------------------------------------------------------------- DW2 (hide by keyboard: DW5's Space)
  const hide = first.locator("[data-needs-you-hide]");
  await reach(p, hide); await p.keyboard.press("Space");
  await section(p).locator("[data-needs-you-empty]").waitFor({ timeout: 15_000 });
  // The page moves the focus in an effect once its refetch has finished (home-page.tsx focusAfter), after the list shows:
  // waited for, at most 5 s, then read (on a busy machine an at-once read ran before it; red packed, green alone).
  await p.waitForFunction(() => document.activeElement?.id === "needs-you-h", undefined, { timeout: 5_000 }).catch(() => undefined);
  const focusedHeading = await p.evaluate(() => document.activeElement?.id);
  ok("PF-18h DW2: \"Hide until next reminder\" by keyboard marks it read; the list is empty (\"Nothing needs you right now.\") and focus moves to the section heading",
    rowsOf(OFF) === 0 && (await section(p).innerText()).includes("Nothing needs you right now.") && focusedHeading === "needs-you-h", focusedHeading);
  const vEmpty = await axe(p);
  ok("PF-18h DW5: the empty state has no WCAG 2.2 A/AA violation", vEmpty.length === 0, vEmpty.map((x) => x.id));
  await shot(p, "2-empty-1440");
  const told2 = await remind(2);
  await home(p);
  const n2 = await needs(TO);
  ok("PF-18h DW2: the 2-day reminder of the same deadline brings the one item back: one row in the store, one item, total 1",
    told2 === 2 && rowsOf(OFF, false) === 1 && rowsOf(OFF) === 1 && await items(p).count() === 1 && n2.body?.total === 1, { told2, n2: n2.text.slice(0, 200) });
  const other = randomUUID();
  await notifyAs(OFF, NOTIFICATION_KIND.CASE_STAGE_DEADLINE, { kind: "case-milestone", id: other });
  const n2b = await needs(TO);
  ok("PF-18h DW2 fail: a second, different deadline does add a second item (total 2), so the one above is a real count, not a cap",
    n2b.body?.total === 2 && n2b.body?.items?.length === 2, n2b.text.slice(0, 200));

  // ---------------------------------------------------------------------------------------------- break m3: a reminder that came back
  await home(p);
  const told0 = await remind(0);   // the on-the-day reminder lands while the page still shows the 2-day one
  const mine = items(p).filter({ hasText: NUMBER });
  await mine.locator("[data-needs-you-hide]").click();
  await section(p).getByText("A newer reminder came in for this deadline, so it stays on your list.").waitFor({ timeout: 15_000 });
  // The notice shows first; the focus goes back to Hide only once the refetch it starts has finished (home-page.tsx
  // focusAfter), so it is waited for, at most 5 s, and false on a timeout. Read at once it was red packed
  // ({"told0":2,"unread":1}: the data right, the focus not back yet) and green alone.
  const hideFocused = await items(p).filter({ hasText: NUMBER }).locator("[data-needs-you-hide]").evaluate((el) => new Promise<boolean>((done) => {
    const t0 = performance.now(); const tick = () => (el === document.activeElement ? done(true) : performance.now() - t0 > 5_000 ? done(false) : requestAnimationFrame(tick)); tick();
  })).catch(() => false);
  ok("PF-18h (break m3): Hide on a row whose deadline was reminded again after the page loaded keeps it, says so, and the store keeps it unread (PF-18n's seen)",
    told0 === 2 && rowsOf(OFF) === 1 && await items(p).filter({ hasText: NUMBER }).count() === 1 && hideFocused,
    { told0, unread: rowsOf(OFF), hideFocused, focused: await p.evaluate(() => document.activeElement?.outerHTML.slice(0, 120) ?? null) });

  // ---------------------------------------------------------------------------------------------- BR-6
  await home(p);
  const gone = items(p).filter({ hasText: "a case you can no longer open" });
  ok("PF-18h BR-6: an item whose case cannot be opened shows, with no link and its Hide button (never hidden silently)",
    await gone.count() === 1 && await gone.locator("a").count() === 0 && await gone.locator("[data-needs-you-hide]").count() === 1);
  await gone.locator("[data-needs-you-hide]").click(); await items(p).filter({ hasText: "a case you can no longer open" }).waitFor({ state: "detached", timeout: 15_000 });

  // ---------------------------------------------------------------------------------------------- DW5 axe at three widths
  for (const w of [375, 1024, 1440]) {
    const q = await tab(TO, w); await home(q);
    const v = await axe(q), wide = await q.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
    ok(`PF-18h DW5: Home at ${w} px has no WCAG 2.2 A/AA violation and no sideways scroll`, v.length === 0 && wide, { v: v.map((x) => `${x.id}: ${x.nodes[0]?.target}`), wide });
    if (w !== 1440) await shot(q, `3-one-item-${w}`);
    if (w === 375) {
      await q.evaluate(() => { const b = document.createElement("button"); b.setAttribute("data-axe-probe", ""); document.querySelector("[data-needs-you]")!.appendChild(b); });
      const bad = await axe(q);
      ok("PF-18h DW5 fail: the same axe run on the same page finds the unlabelled button we add (the check can fail)", bad.some((x) => x.id === "button-name"), bad.map((x) => x.id));
    }
    await q.context().close();
  }

  // ---------------------------------------------------------------------------------------------- review S1: BR-4's failure branch
  let refused = 0;
  await p.route("**/api/platform/me/notifications/*/read*", async (r) => { refused++; await r.fulfill({ status: 503, json: { title: "Service unavailable" } }); });
  const openNow = items(p).first().locator("[data-needs-you-open]");
  await openNow.click();
  await section(p).getByText("We could not open this reminder.").waitFor({ timeout: 15_000 });
  const vFail = await axe(p), focusBack = await openNow.evaluate((el) => el === document.activeElement);
  ok("PF-18h BR-4 fail: when marking read fails, the page stays (no case opened), says \"We could not open this reminder.\" with \"Open the case anyway\", focus is back on the link, the item stays unread, axe clean",
    refused === 1 && new URL(p.url()).pathname === "/home" && await section(p).getByRole("link", { name: "Open the case anyway" }).count() === 1 && focusBack && rowsOf(OFF) === 1 && vFail.length === 0, { refused, url: p.url(), focusBack, v: vFail.map((x) => x.id) });
  await p.unroute("**/api/platform/me/notifications/*/read*");
  await home(p);

  // ---------------------------------------------------------------------------------------------- DW3 (open by keyboard: DW5's Enter)
  const open = items(p).first().locator("[data-needs-you-open]");
  await reach(p, open); await p.keyboard.press("Enter");
  await p.waitForURL(`${BASE}/cases/${CASE}`, { timeout: 30_000 });
  const h = p.locator("[data-case-number-h]"); await h.waitFor({ timeout: 60_000 });
  const n3 = await needs(TO);
  ok("PF-18h DW3: opening it marks it read, then lands on that case's page with its number in the header; Home's list no longer has it",
    (await h.innerText()).trim() === NUMBER && rowsOf(OFF) === 0 && n3.body?.total === 0, { header: await h.innerText(), n3: n3.text.slice(0, 200) });
  await shot(p, "4-case-page-1440");
  const nr = await needs(TR);
  ok("PF-18h DW3 fail: the representative's item for the same deadline stays unread on their Home (each person reads their own)",
    rowsOf(REP) === 1 && (nr.body?.items ?? []).some((i: { caseNumber: string | null }) => i.caseNumber === NUMBER), nr.text.slice(0, 200));   // a reused copy may hold earlier runs' items too

  // ---------------------------------------------------------------------------------------------- DW4
  const repRow = sql(`select id from msg_notification where staff_id = '${REP}' and item_id = '${STEP}'`);
  const nb = await needs(TB), stolen = await api(TB, "POST", `/platform/me/notifications/${repRow}/read`), stolenA = await api(TC, "POST", `/platform/me/notifications/${repRow}/read`);
  const pc = await tab(TC); await home(pc);
  ok("PF-18h DW4: a colleague in the same firm sees none of the officer's or representative's items (API and page)",
    nc.body?.total === 0 && await items(pc).count() === 0 && await section(pc).locator("[data-needs-you-empty]").isVisible());
  ok("PF-18h DW4 fail: firm B's staff gets an empty list, and marking firm A's row read is 404 (from firm B and from another person in firm A); the row stays unread",
    nb.status === 200 && nb.body?.total === 0 && stolen.status === 404 && stolenA.status === 404 && rowsOf(REP) === 1, { nb: nb.text.slice(0, 120), stolen: stolen.status, stolenA: stolenA.status });
  await pc.context().close();
  const unsigned = await api(null, "GET", "/platform/me/needs-you");
  ok("PF-18h DW4: signed out, the list is refused (401)", unsigned.status === 401, unsigned.status);

  // ---------------------------------------------------------------------------------------------- BR-5, BR-8: 26 items
  for (let i = 0; i < 26; i++) await notifyAs(colleague.id, NOTIFICATION_KIND.CASE_MILESTONE_DEADLINE, { kind: "case-milestone", id: randomUUID() });
  const pm = await tab(TC); await home(pm);
  const nm = await needs(TC);
  ok("PF-18h BR-5, BR-8: 26 items: the newest 20 are shown, the count says \"26 items need you\" in words, and the foot says \"Showing the newest 20 of 26\"",
    await items(pm).count() === 20 && nm.body?.items?.length === 20 && nm.body?.total === 26 && (await section(pm).locator("[data-needs-you-count]").innerText()) === "26 items need you"
      && (await section(pm).innerText()).includes("Showing the newest 20 of 26."), { shown: await items(pm).count(), total: nm.body?.total });
  const times = (nm.body?.items ?? []).map((i: { createdAt: string }) => Date.parse(i.createdAt));
  ok("PF-18h BR-5: newest first", times.every((t: number, i: number) => i === 0 || times[i - 1] >= t));
  await shot(pm, "5-twenty-of-26-1440");
  await pm.context().close();

  // ---------------------------------------------------------------------------------------------- landing and menu
  const pl = await tab(TO); await pl.goto(`${BASE}/account`); await pl.locator('nav[aria-label="My account"] [data-account-section="/home"]').waitFor({ timeout: 60_000 });
  await pl.locator('nav[aria-label="My account"] [data-account-section="/home"]').click(); await pl.waitForURL(`${BASE}/home`); await section(pl).waitFor();
  ok("PF-18h: Home is the first entry of the staff menu and opens the Home page", (await pl.locator('nav[aria-label="My account"] a').first().getAttribute("data-account-section")) === "/home");
  await pl.context().close();
  ok("PF-18h: no page error in any tab", errs.length === 0, errs);
} catch (e) {
  failed++; console.log(`FAIL  PF-18h: the check stopped: ${(e as Error).stack?.slice(0, 600)}`);
} finally {
  await browser.close(); await db.$disconnect();
}
process.exit(summary() + failed ? 1 : 0);
