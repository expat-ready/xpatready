// J-109 (map row 109, the complaints record; R1.109): the join row's walk (rows rev 16.11 (b); brief J-rows.md §J-109
// as amended by wave1-registers.md, branch lead-b-front-office), on an isolated copy of the running app (its own
// database and port; never :4400), in a real browser against the real routes: no fake API, no stubbed request.
//   W1: a Case Manager records a complaint in the drawer (the screen sends an Idempotency-Key, PF-21i);
//   W2: its acknowledge-by date shows: 2 business days (Sample), counting the firm's closed days;
//   W3: a Read-only person cannot see it (P-601's keys: not in their list, Not found by its address);
//   W4: the Owner acknowledges it, then closes it with an outcome;
//   W5: it ends at the closed complaint in the list (no next capability follows; the list is the end).
// The swaps (DW): complaints' jobs are PF-14's PlatformJobs (pg-boss) and its clock the system's, both already wired on
// main in api/src/features/platform-complaints.ts (PF-21w, PF-23w), so this row changes no wiring; the tests show each
// is real by what only the real port does. The reminder's mail goes through the app's MessagePort (MESSAGES_MAIL, #2157,
// not this row): on a local copy it lands in the demo inbox (GET /api/demo/platform-inbox).
//   DW1: the reminder is a row in pg-boss's table, due at the acknowledge-by instant; already past due, the app's worker
//        runs it (Reminder sent on the record); one not yet due waits and its acknowledgement cancels it (an in-memory
//        runner leaves no row and runs nothing);
//   DW2: the service reads the system clock: a time received a minute ago (by this machine's clock) is accepted and one
//        five minutes ahead is refused (a fake clock fixed at another instant accepts or refuses the other way).
// The received date is fixed (Thu 12 Nov 2026, firm time) and Fri 13 Nov is made a closed day, so W2's date is the same
// on any run after it; the server's clock is the system's (that is DW2), so the walk fixes the date, not the clock.
// Setup writes Sample rows straight to the copy's database: the Read-only person and the closed day (restored at the end).
// Run from prototype/ (US$0, no model call; HEADED=1 for a visible browser):
//   zsh studio/tools/isolated.sh j109 4436 start --ttl 30 PLATFORM_IDENTITY=local && trap 'zsh studio/tools/isolated.sh j109 4436 stop' EXIT && tsx --tsconfig studio/api/tsconfig.json studio/tests/journeys/j_109.ts j109 4436
import "reflect-metadata";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { chromium, type Page } from "playwright";
import { platformAuditWorkspaceId } from "../../api/src/platform/audit/audit-event.ts";
import { seedSampleFirms } from "../../api/src/platform/seed-sample-firms.ts";
import { acknowledgeBy } from "../../api/src/platform/complaints/business-days.ts";
import { zonedInstant, type FirmCalendar } from "../../api/src/platform/calendar/working-days.ts";   // moved there by #2000 (CS-DL1)
import { ACK_REMINDER_JOB, ackReminderKey } from "../../api/src/platform/complaints/complaints.ts";
import { BUSINESS_HOURS, CLOSED_DAYS, readSetting, TIME_ZONE, writeSetting } from "../../api/src/platform/settings.ts";
import { dayTime, nowLocal } from "../../web/src/modules/platform/complaints/contract.ts";

const [NAME, PORT] = [process.argv[2] ?? "j109", Number(process.argv[3] ?? 4436)];
const BASE = `http://127.0.0.1:${PORT}`, DB_URL = `postgresql://xr_studio@127.0.0.1:54329/xr_studio_${NAME}`;
const SHOTS = join(import.meta.dirname, "..", "..", "..", "..", "product", "screens", "J-109"); mkdirSync(SHOTS, { recursive: true });
const NOT_FOUND = "We can't find this complaint. It may not exist, or it may not be one you can see.";
const RECEIVED = "2026-11-12T10:00", CLOSED_DAY = "2026-11-13";   // a Thursday, firm time; the Friday after is closed
let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 600)}` : ""}`); };
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: DB_URL, options: "-c TimeZone=UTC" }) });
const run = Date.now().toString(36), who = `Person J109 ${run}`;

async function signIn(email: string): Promise<string> {
  const r = await fetch(`${BASE}/api/platform/session/local`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ firmKey: "sample-firm", email, secondStep: true }) });
  const b = await r.json() as { token?: string; detail?: string }; if (b.token) return b.token;
  throw new Error(`STOP  local sign-in refused for ${email} (start the copy with PLATFORM_IDENTITY=local): ${b.detail}`);
}
const api = async (tok: string, method: string, path: string, body?: unknown, key?: string) => {
  const r = await fetch(`${BASE}/api/platform/complaints${path}`, { method, headers: { authorization: `Bearer ${tok}`, ...(body ? { "content-type": "application/json" } : {}), ...(key ? { "idempotency-key": key } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => null) as any };
};
const reminder = (id: string) => db.$queryRawUnsafe<{ state: string; start_after: Date }[]>(`select state, start_after from platform_jobs.job where name = $1 and data->>'key' = $2`, ACK_REMINDER_JOB, ackReminderKey(id));

await seedSampleFirms(db);
const firm = await db.platformFirm.findUniqueOrThrow({ where: { key: "sample-firm" } });
const staff = (actorId: string) => db.platformStaff.findFirstOrThrow({ where: { firmId: firm.id, actorId } });
const R = await staff("user-R"), T = await staff("user-T");   // Owner + Case Manager; Case Manager (record key only)
const ro = await db.platformStaff.create({ data: { firmId: firm.id, email: `read-only-${run}@j109.example`, displayName: `Sample Read-only ${run}`, actorId: `j109-ro-${run}`, status: "ACTIVE" } });
await db.platformRoleGrant.create({ data: { firmId: firm.id, staffId: ro.id, role: "READ_ONLY", grantedBy: "seed:j109" } });
const workspaceId = await platformAuditWorkspaceId(db as never);
const before = await readSetting<string[]>(db, firm.id, CLOSED_DAYS.key);
const setClosed = (value: string[], reason: string) => writeSetting(db, { firmId: firm.id, key: CLOSED_DAYS.key, value, by: "seed:j109", workspaceId, reason });
await setClosed([...new Set([...before, CLOSED_DAY])], "J-109 walk: a closed day after the complaint");
const cal: FirmCalendar = { zone: await readSetting<string>(db, firm.id, TIME_ZONE.key), hours: await readSetting(db, firm.id, BUSINESS_HOURS.key), closedDays: await readSetting(db, firm.id, CLOSED_DAYS.key) };
const receivedAt = zonedInstant(RECEIVED.slice(0, 10), RECEIVED.slice(11), cal.zone);
const due = acknowledgeBy(receivedAt, cal), dueOpen = acknowledgeBy(receivedAt, { ...cal, closedDays: cal.closedDays.filter((d) => d !== CLOSED_DAY) });
ok("J-109 setup: the Sample firm's Owner and Case Manager, a Read-only person, and Fri 13 Nov a closed day", !!R.id && !!T.id && cal.closedDays.includes(CLOSED_DAY));

const browser = await chromium.launch({ headless: process.env.HEADED !== "1", ...(process.platform === "darwin" ? { channel: "chrome" } : existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {}) });
const errors: string[] = [], keys: (string | undefined)[] = [];
async function as(tok: string): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light", reducedMotion: "reduce" }), p = await ctx.newPage();
  await ctx.addInitScript((t) => { if (!sessionStorage.getItem("xr-staff-session")) sessionStorage.setItem("xr-staff-session", JSON.stringify({ token: t, expiresAt: Date.now() + 3_600_000 })); }, tok);
  p.on("pageerror", (e) => errors.push(String(e)));
  p.on("request", (r) => { if (r.method() === "POST" && new URL(r.url()).pathname === "/api/platform/complaints") keys.push(r.headers()["idempotency-key"]); });
  return p;
}
const shot = (p: Page, name: string) => p.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true });
const listed = (p: Page) => p.locator("[data-complaint-row], [data-empty]").first().waitFor({ timeout: 30_000 });
const rowOf = (p: Page, id: string) => p.locator(`[data-complaint-row="${id}"]`);
const findRow = async (p: Page, id: string) => { while (!(await rowOf(p, id).count()) && await p.getByRole("button", { name: "Show more" }).count()) { const n = await p.locator("[data-complaint-row]").count(); await p.getByRole("button", { name: "Show more" }).click(); await p.waitForFunction((k) => document.querySelectorAll("[data-complaint-row]").length > k, n); } return rowOf(p, id); };
const eventsOf = (p: Page) => p.locator("[data-event]").evaluateAll((els) => els.map((e) => e.getAttribute("data-event")));
const panel = (p: Page, act: string) => p.locator(`[data-action-drawer="${act}"]`);
const saved = async (p: Page, act: string) => { const n = (await eventsOf(p)).length; await p.locator('[role="dialog"] button[type="submit"]').click(); await panel(p, act).waitFor({ state: "detached", timeout: 15_000 });
  await p.waitForFunction((k) => document.querySelectorAll("[data-event]").length > k, n, { timeout: 15_000 }); };

try {
  const tTok = await signIn(T.email), rTok = await signIn(R.email), roTok = await signIn(ro.email);

  // ----------------------------------------------------------------------------------------------------------- W1
  const t = await as(tTok);
  await t.goto(`${BASE}/platform/complaints`); await listed(t);
  await t.locator("[data-record-open]").click(); await t.locator("[data-record-drawer]").waitFor({ timeout: 10_000 });
  await t.getByLabel("Their name").fill(who);
  await t.getByLabel(/^Received/).fill(RECEIVED);
  await t.getByLabel("How it came").selectOption("EMAIL"); await t.getByLabel("About", { exact: true }).selectOption("FEES");
  await t.getByLabel("What it is about").fill("The person says they were charged twice for the same work (Sample).");
  ok("J-109 W1: the Case Manager's drawer offers themselves as the handler", (await t.getByLabel("Handler").inputValue()) === T.id);
  await shot(t, "w1-record-drawer-1440");
  await t.getByRole("button", { name: "Record the complaint" }).click();
  await t.waitForURL(/\/platform\/complaints\/[0-9a-f-]{36}$/, { timeout: 15_000 }); await t.locator("[data-complaint]").waitFor({ timeout: 20_000 });
  const id = t.url().split("/").pop()!;
  const row = await db.platComplaint.findUniqueOrThrow({ where: { id } });
  ok("J-109 W1 pass: a Case Manager records a complaint in the drawer; it opens on its record page, received 12 Nov, handled by them",
    (await t.locator("h1").innerText()) === who && row.receivedAt.getTime() === receivedAt.getTime() && row.handlerStaffId === T.id && row.recordedBy.endsWith(T.id), { h1: await t.locator("h1").innerText(), row });
  ok("J-109 W1: the screen sent one record request, with an Idempotency-Key (PF-21i), and the row keeps it", keys.length === 1 && !!keys[0] && row.requestKey === keys[0], { keys, kept: row.requestKey });
  const repeat = await api(tTok, "POST", "", { subjectKind: "OTHER_PERSON", complainantName: "Someone else", receivedAt: receivedAt.toISOString(), channel: "EMAIL", category: "FEES", summary: "Other words.", handlerStaffId: T.id }, keys[0]);
  ok("J-109 W1 fail: the same key with another complaint's words is refused (422), and nothing new is recorded", repeat.status === 422 && (await db.platComplaint.count({ where: { firmId: firm.id, requestKey: keys[0] } })) === 1, repeat);
  await shot(t, "w1-recorded-1440");

  // ---------------------------------------------------------------------------------------------------------- DW1
  const r1 = await reminder(id);
  ok("J-109 DW1 pass: the acknowledgement reminder is a row in pg-boss's table (PlatformJobs), due at the acknowledge-by instant",
    r1.length === 1 && r1[0].start_after.getTime() === due.getTime(), { r1, due });
  let ran = r1[0]?.state;
  // Break m2: PF-14 polls about one job per 2 s, so a reused copy with a backlog needs longer than a fresh one (up to 2 min here).
  for (let i = 0; i < 120 && ran !== "completed"; i++) { await new Promise((r) => setTimeout(r, 1_000)); ran = (await reminder(id))[0]?.state; }
  const sent = await db.platComplaintEvent.count({ where: { firmId: firm.id, complaintId: id, kind: "REMINDER_SENT" } });
  ok("J-109 DW1: already past its date, the reminder is run by the app's pg-boss worker (completed, and its Reminder sent event is on the record; an in-memory runner runs nothing)", ran === "completed" && sent === 1, { ran, sent });

  // ---------------------------------------------------------------------------------------------------------- DW2
  const nearNow = (ms: number) => ({ subjectKind: "OTHER_PERSON", complainantName: `Person Clock ${run} ${ms}`, receivedAt: new Date(Date.now() + ms).toISOString(), channel: "PHONE", category: "SERVICE", summary: "Clock check (Sample).", handlerStaffId: R.id });
  const past = await api(rTok, "POST", "", nearNow(-60_000), crypto.randomUUID()), ahead = await api(rTok, "POST", "", nearNow(5 * 60_000), crypto.randomUUID());
  ok("J-109 DW2 pass: the service reads the system clock: received a minute ago by this machine's clock is recorded", past.status === 201, past);
  const fresh = past.body?.id as string, waiting = await reminder(fresh);
  const acked = await api(rTok, "POST", `/${fresh}/acknowledge`, { at: new Date().toISOString() });
  ok("J-109 DW1 fail: a complaint not yet due waits in pg-boss and is not run; its acknowledgement cancels it there (it never runs)", waiting[0]?.state === "created" && acked.status === 200 && (await reminder(fresh))[0]?.state === "cancelled", { waiting, acked: acked.status, after: await reminder(fresh) });
  ok("J-109 DW2 fail: received five minutes ahead of this machine's clock is refused as in the future", ahead.status === 422 && JSON.stringify(ahead.body).includes("this date is in the future"), ahead);

  // ----------------------------------------------------------------------------------------------------------- W2
  const ackFact = await t.locator("dt", { hasText: "Acknowledge by" }).locator("xpath=following-sibling::dd[1]").innerText({ timeout: 10_000 });
  ok("J-109 W2 pass: the record page shows the acknowledge-by date: 2 business days after 12 Nov, skipping closed Fri 13 Nov (Tue 17 Nov, close of business)",
    row.acknowledgeBy.getTime() === due.getTime() && ackFact.includes(dayTime(due.toISOString(), cal.zone)) && due.getTime() === zonedInstant("2026-11-17", "17:00", cal.zone).getTime(), { ackFact, due, stored: row.acknowledgeBy });
  ok("J-109 W2 fail: it is not the date without the closed day (Mon 16 Nov)", dueOpen.getTime() !== due.getTime() && !ackFact.includes(dayTime(dueOpen.toISOString(), cal.zone)), { dueOpen, ackFact });
  ok("J-109 W2: past its date it says Needs you with the business days late", /Needs you/.test(await t.locator("body").innerText()) && (await t.getByText(/business days? late/).count()) >= 1);
  await shot(t, "w2-acknowledge-by-1440");

  // ----------------------------------------------------------------------------------------------------------- W3
  const ro1 = await as(roTok);
  await ro1.goto(`${BASE}/platform/complaints?view=all`); await listed(ro1);
  ok("J-109 W3 pass: a Read-only person's list does not hold the complaint", (await (await findRow(ro1, id)).count()) === 0 && !(await ro1.locator("body").innerText()).includes(who));
  ok("J-109 W3: a Read-only person is not offered Record a complaint", (await ro1.locator("[data-record-open]").count()) === 0);
  await shot(ro1, "w3-read-only-list-1440");
  await ro1.goto(`${BASE}/platform/complaints/${id}`); await ro1.locator("[data-not-found]").waitFor({ timeout: 20_000 });
  ok("J-109 W3: opened by its address, a Read-only person sees Not found, and nothing of it", (await ro1.getByText(NOT_FOUND).count()) === 1 && !(await ro1.locator("body").innerText()).includes(who));
  ok("J-109 W3: the API answers them 404 for it", (await api(roTok, "GET", `/${id}`)).status === 404);
  await shot(ro1, "w3-read-only-not-found-1440");

  // ----------------------------------------------------------------------------------------------------------- W4
  const o = await as(rTok);
  await o.goto(`${BASE}/platform/complaints?view=overdue`); await listed(o);
  ok("J-109 W3 fail: the Owner does see it, under Overdue", (await (await findRow(o, id)).count()) === 1);
  await (await findRow(o, id)).getByRole("link").click(); await o.locator(`[data-complaint="${id}"]`).waitFor({ timeout: 20_000 });
  ok("J-109 W4: the Owner's one filled button is Record the acknowledgement", (await o.locator("[data-next-step]").getAttribute("data-next-step")) === "acknowledge");
  await o.locator('[data-act="acknowledge"]').click(); await panel(o, "acknowledge").waitFor({ timeout: 10_000 });
  await o.getByLabel(/^When/).fill(nowLocal(cal.zone, new Date(Date.now() - 60 * 60_000)));
  await shot(o, "w4-acknowledge-1440");
  await saved(o, "acknowledge");
  ok("J-109 W4 pass: the Owner acknowledges it: the timeline's newest event is Acknowledged and it is no longer Needs you", (await eventsOf(o))[0] === "ACKNOWLEDGED" && !/Needs you/.test(await o.locator("body").innerText()));
  await o.locator('[data-act="close"]').click(); await panel(o, "close").waitFor({ timeout: 10_000 });
  await o.locator('[role="dialog"] button[type="submit"]').click(); await o.locator('[data-action-drawer="close"] [role=alert]').first().waitFor({ timeout: 10_000 });
  ok("J-109 W4 fail: closing without an outcome is refused in the panel, and it stays open", /Outcome/.test(await o.locator("[data-action-error]").innerText()) && (await db.platComplaint.findUniqueOrThrow({ where: { id } })).status === "OPEN");
  await o.getByLabel("Resolved").check(); await o.getByRole("textbox", { name: /^Note/ }).fill("The double charge was refunded; the person agreed (Sample).");
  await shot(o, "w4-close-1440");
  await saved(o, "close");
  const shut = await db.platComplaint.findUniqueOrThrow({ where: { id } });
  ok("J-109 W4 pass: the Owner closes it with an outcome: Closed, outcome Resolved, no action buttons left but a note",
    (await o.locator('[data-status="Closed"]').count()) === 1 && (await o.getByText(/outcome: Resolved/).count()) === 1 && (await eventsOf(o))[0] === "CLOSED" && shut.status === "CLOSED" && shut.outcome === "RESOLVED"
    && (await o.locator('[data-act="acknowledge"], [data-act="close"], [data-act="response"], [data-act="step"]').count()) === 0, await o.locator("[data-act]").evaluateAll((els) => els.map((e) => e.getAttribute("data-act"))));
  await shot(o, "w4-closed-1440");

  // ----------------------------------------------------------------------------------------------------------- W5
  await o.goto(`${BASE}/platform/complaints`); await listed(o);
  ok("J-109 W5 fail: the closed complaint has left Open", (await (await findRow(o, id)).count()) === 0);
  await o.locator('[data-chip="closed"]').click(); await o.locator('[data-shown-view="closed"]').waitFor({ timeout: 30_000 });
  const closedRow = await findRow(o, id);
  ok("J-109 W5 pass: it ends at the closed complaint in the list, under Closed, with its Closed status", (await closedRow.count()) === 1 && (await closedRow.locator('[data-status="Closed"]').count()) === 1 && new URL(o.url()).searchParams.get("view") === "closed");
  await closedRow.scrollIntoViewIfNeeded(); await shot(o, "w5-closed-list-1440");
  await t.goto(`${BASE}/platform/complaints?view=closed`); await listed(t);
  ok("J-109 W5: its handler, the Case Manager, sees it closed in their list too", (await (await findRow(t, id)).locator('[data-status="Closed"]').count()) === 1);
  ok("J-109: no page error in any browser step", errors.length === 0, errors);
} finally {
  await browser.close();
  await setClosed(before, "J-109 walk: closed days put back").catch((e) => console.log(`NOTE  closed days not put back: ${e}`));
  await db.$disconnect();
}
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
