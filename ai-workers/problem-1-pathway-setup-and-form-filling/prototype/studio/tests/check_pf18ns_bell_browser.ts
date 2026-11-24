// PF-18ns (BACKLOG row PF-18ns; concept product/screens/PF-18ns r2, approved by the tech lead at c9353ae76; R1.50): the bell in
// the staff frames and the notification list, walked in a browser on an isolated copy (its own database and port, never
// :4400), with the API and the database read underneath. The notifications are real: R assigns leads through the app's own
// Assign route, which tells the assignee through PF-18n part 2's NotificationPort. Each line has a pass and a fail:
//   DW1 the row's walk: a lead assigned to O → O's bell says 1 → the panel shows it with the lead's name → opening it lands
//       on the lead (the sales frame, its own bell) and the count is 0; fail: R, who assigned it, is not told (bell 0);
//   DW2 Mark all read empties the count; fail: a notice that arrives after the panel loaded stays unread (BR-6);
//   DW3 another person's notification never shows (panel, All page, API); fail: R marking O's row read is 404;
//   DW4 the live region speaks once per change: a page change and two 60-second polls with no change say nothing new; a new
//       notice says "1 unread notification" once (BR-8, challenge M1);
//   DW5 keyboard only: Tab to the bell, Enter opens the panel with focus inside, Escape closes it with focus back on the bell;
//       axe-core 0 serious or critical (WCAG 2.2 A/AA) on the bell, the open panel and the All page at 375, 1024 and 1440 px,
//       no sideways scroll;
//   DW6 the All page: Settings | All tabs, Unread filter, page 2 by Next, a row it can no longer open says so with Mark read;
//       "Choose what you get" opens the settings.
// Sample rows only. US$0, no model call; live AI off. Screenshots (deviceScaleFactor 1) in product/screens/PF-18ns/screenshots/.
// Run from prototype/:
//   zsh studio/tools/isolated.sh pf18ns 4731 start AI_LIVE=off PLATFORM_IDENTITY=local && tsx studio/tests/check_pf18ns_bell_browser.ts 4731 xr_studio_pf18ns
import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { chromium, type Browser, type Locator, type Page } from "playwright";
import { seedSampleFirmsFrontOffice } from "../api/src/front-office/firm-seed.ts";
import { client, recorder } from "./runtime/api.ts";
const { default: AxeBuilder } = createRequire(import.meta.url)("@axe-core/playwright") as typeof import("@axe-core/playwright");

const [PORT, DBNAME] = [Number(process.argv[2] ?? 4731), process.argv[3] ?? "xr_studio_pf18ns"];
if (PORT === 4400 || DBNAME === "xr_studio_demo") { console.log("refused: never the demo on :4400"); process.exit(2); }
const BASE = `http://localhost:${PORT}`, STUDIO = join(import.meta.dirname, "..");
const SHOTS = join(STUDIO, "..", "..", "product", "screens", "PF-18ns", "screenshots"); mkdirSync(SHOTS, { recursive: true });
const { ok, summary } = recorder();
const { sql: rawSql } = client(PORT, DBNAME);
const sql = (q: string) => (rawSql(q) ?? "").split("\n")[0].trim();
const run = Date.now().toString(36);
type Ans = { status: number; body: any; text: string };   // eslint-disable-line @typescript-eslint/no-explicit-any -- API answers are read loosely, as in the other checks
const api = async (t: string | null, method: string, path: string, body?: unknown): Promise<Ans> => {
  const r = await fetch(`${BASE}/api${path}`, { method, headers: { "content-type": "application/json", ...(t ? { authorization: `Bearer ${t}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text(); let j: unknown = null; try { j = JSON.parse(text); } catch { /* not JSON */ }
  return { status: r.status, body: j, text };
};

// ------------------------------------------------------------------------------------------------ setup (Sample)
// The copy seeds the platform's Sample firms; their front office (sales setup, web form, reasons) is seeded here, as the other
// front-office browser checks do (idempotent).
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://xr_studio@127.0.0.1:54329/${DBNAME}`, options: "-c TimeZone=UTC" }) });
await seedSampleFirmsFrontOffice(db); await db.$disconnect();
const A = sql(`select id from platform_firm where key = 'sample-firm'`);
const staffOf = (actor: string) => sql(`select id from platform_staff where actor_id = '${actor}' and firm_id = '${A}'`);
const O = staffOf("user-O"), R = staffOf("user-R");
const signIn = async (firmKey: string, who: { actorId?: string; email?: string }): Promise<string> => {
  const r = await api(null, "POST", "/platform/session/local", { firmKey, ...who, secondStep: true });
  if (r.body?.token) return r.body.token as string;
  console.error(`STOP  local sign-in refused for ${JSON.stringify(who)} (start the copy with PLATFORM_IDENTITY=local): ${r.text.slice(0, 300)}`); process.exit(2);
};
const TO = await signIn("sample-firm", { actorId: "user-O" }), TR = await signIn("sample-firm", { actorId: "user-R" });
let n = 0;
/** R adds a lead (R owns it, AG-2-4 rule 8) and assigns it to O through the app's own routes: O is told by PF-18n part 2. */
const assignToO = async (given = `Client ${String.fromCharCode(65 + (n % 26))}${n}`) => {
  const i = n++;
  const added = await api(TR, "POST", "/front-office/leads", { givenNames: given, familyName: "Sample", email: `pf18ns-${run}-${i}@sample.invalid`, source: "Referral", requestId: randomUUID() });
  const id = added.body?.id as string;
  const done = await api(TR, "POST", `/front-office/leads/${id}/assign`, { staffId: O, expectedOwnerStaffId: R });
  if (added.status >= 300 || done.status >= 300) throw new Error(`assign failed: ${added.text.slice(0, 200)} ${done.text.slice(0, 200)}`);
  return { id, number: added.body?.number as string, name: `${given} Sample` };
};
const unreadOf = async (t: string) => (await api(t, "GET", "/platform/me/notifications/unread-count")).body?.unread as number;
// A fresh start on a reused copy (review m8): O's and R's earlier rows and switches (other suites', some dated ahead by a fake clock) are
// removed by the database owner; the app itself never deletes a notification.
sql(`delete from msg_notification where staff_id in ('${O}', '${R}')`);
sql(`delete from platform_notification_preference where staff_id in ('${O}', '${R}')`);   // back to the defaults (in-app on), whatever another suite switched

// ------------------------------------------------------------------------------------------------ the browser
const browser: Browser = await chromium.launch({ headless: process.env.HEADED !== "1", ...(existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {}) });
const errs: string[] = [];
const SLOW = Number(process.env.PF18NS_CPU_SLOW ?? 1);
const tab = async (token: string, width = 1440) => {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1, colorScheme: "light", reducedMotion: "reduce" });
  await ctx.addInitScript((x) => { sessionStorage.setItem("xr-staff-session", JSON.stringify({ token: x, expiresAt: Date.now() + 3_600_000 })); }, token);
  const p = await ctx.newPage(); p.on("pageerror", (e) => errs.push(e.message));
  // PF18NS_CPU_SLOW=<n>: the page runs n times slower (Chrome's CPU throttling), to prove the checks hold on a slow runner.
  if (SLOW > 1) await (await ctx.newCDPSession(p)).send("Emulation.setCPUThrottlingRate", { rate: SLOW });
  return p;
};
const bell = (p: Page) => p.locator("[data-notifications-bell]");
const count = async (p: Page) => Number(await bell(p).getAttribute("data-unread-count"));
const waitCount = async (p: Page, want: number, ms = 20_000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await bell(p).count() && await count(p) === want) return true; await p.waitForTimeout(200); } return false; };
const panel = (p: Page) => p.locator("[data-notifications-panel]");
const rows = (p: Page) => panel(p).locator("[data-notification]");
const go = async (p: Page, path: string) => { await p.goto(`${BASE}${path}`); await bell(p).waitFor({ timeout: 60_000 }); };
const openPanel = async (p: Page) => { await bell(p).click(); await panel(p).locator("[data-notification], [data-notifications-empty]").first().waitFor({ timeout: 20_000 }); };
const shot = (p: Page, name: string) => p.screenshot({ path: join(SHOTS, `pf18ns-${name}.png`), fullPage: true });
const serious = async (p: Page) => (await new AxeBuilder({ page: p }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze()).violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.nodes.length}`);
const sideways = (p: Page) => p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
const reach = async (p: Page, target: Locator, max = 60) => {
  for (let i = 0; i < max; i++) { if (await target.evaluate((el) => el === document.activeElement).catch(() => false)) return true; await p.keyboard.press("Tab"); }
  return false;
};

let failed = 0;
try {
  // ---------------------------------------------------------------------------------------------- DW1 the row's walk
  const po = await tab(TO), pr = await tab(TR);
  await go(po, "/home"); await go(pr, "/home");
  const zeroAtStart = await waitCount(po, 0);
  const lead = await assignToO("Client A");
  await go(po, "/account");
  ok("PF-18ns DW1: a lead R assigns to O makes O's bell say 1, named for screen readers (\"Notifications, 1 unread\") with the badge",
    zeroAtStart && await waitCount(po, 1) && (await bell(po).getAttribute("aria-label")) === "Notifications, 1 unread" && (await po.locator("[data-notifications-badge]").innerText()) === "1");
  await go(pr, "/account");
  ok("PF-18ns DW1 fail: R, who assigned it, is not told: R's bell stays at 0 (\"none unread\", no badge)", await waitCount(pr, 0) && (await bell(pr).getAttribute("aria-label")) === "Notifications, none unread" && await pr.locator("[data-notifications-badge]").count() === 0);
  await shot(po, "1-bell-one-1440");
  await openPanel(po);
  const row = rows(po).first(), rowText = (await row.innerText()).replace(/\u2011/g, "-");   // the number shows with a non-breaking hyphen
  ok("PF-18ns DW1: the panel shows it: \"Lead assigned to you · <name> (<number>)\", unread (dot and word), the time, and the zone once in the heading",
    await panel(po).locator("[data-notification][data-unread]").count() === 1 && rowText.includes(`Lead assigned to you · ${lead.name} (${lead.number})`) && rowText.includes("Unread") && (await row.getAttribute("data-unread")) === "true"
    && (await po.locator('[role="dialog"]').innerText()).includes("Times in America/Toronto"), rowText);
  await shot(po, "2-panel-1440");
  await row.locator("[data-notification-open]").focus(); await po.keyboard.press("Enter");
  await po.waitForURL(`${BASE}/front-office/leads/${lead.id}`, { timeout: 20_000 });
  // The lead page draws its record after its own read: wait for the number (isVisible() is a snapshot and never waits;
  // on a slow runner it ran before the page had drawn, run 45311346283 shard 19).
  const leadShown = await po.getByText(lead.number).first().waitFor({ state: "visible", timeout: 20_000 }).then(() => true, () => false);
  ok("PF-18ns DW1: opening it lands on the lead's page (the sales frame, with its own bell), and the count is 0; the row is read underneath",
    leadShown && await waitCount(po, 0) && sql(`select coalesce(read_at::text, 'unread') from msg_notification where staff_id = '${O}' and item_id = '${lead.id}'`) !== "unread");
  await shot(po, "3-on-the-lead-1440");

  // ---------------------------------------------------------------------------------------------- DW2 Mark all read
  await assignToO(); await assignToO();
  await go(po, "/account");
  await waitCount(po, 2); await openPanel(po);
  const late = await assignToO();   // arrives after the panel loaded its list
  await panel(po).locator("[data-notifications-mark-all]").click();
  await po.keyboard.press("Escape");
  ok("PF-18ns DW2 fail (BR-6): Mark all read marks what the panel showed; the notice that came after it stays unread (count 1, its row unread)",
    await waitCount(po, 1) && sql(`select coalesce(read_at::text, 'unread') from msg_notification where staff_id = '${O}' and item_id = '${late.id}'`) === "unread");
  await openPanel(po); await panel(po).locator("[data-notifications-mark-all]").click();
  ok("PF-18ns DW2: Mark all read again empties the count (0) and the button is then disabled", await waitCount(po, 0) && await panel(po).locator("[data-notifications-mark-all]").isDisabled());
  await po.keyboard.press("Escape");

  // ---------------------------------------------------------------------------------------------- DW3 another person's never shows
  const mine = (await api(TO, "GET", "/platform/me/notifications/items?size=100")).body.items as { id: string; item: { id: string } }[];
  await openPanel(pr);
  const rPanel = await panel(pr).innerText(), rAll = (await api(TR, "GET", "/platform/me/notifications/items?size=100")).body.items as { id: string }[];
  const steal = await api(TR, "POST", `/platform/me/notifications/${mine[0]!.id}/read`);
  ok("PF-18ns DW3: R's panel and list never show O's notifications (no name, no row id)", !rPanel.includes("Client A Sample") && mine.every((m) => !rAll.some((r) => r.id === m.id)), { rPanel: rPanel.slice(0, 200) });
  ok("PF-18ns DW3 fail: R marking O's row read is 404", steal.status === 404, steal.status);
  await pr.keyboard.press("Escape");

  // ---------------------------------------------------------------------------------------------- DW5 keyboard, axe, sizes
  await go(po, "/account");
  const reached = await reach(po, bell(po));
  await po.keyboard.press("Enter");
  await panel(po).waitFor();
  const inside = await po.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'));
  await po.keyboard.press("Escape");
  await panel(po).waitFor({ state: "detached" });
  // The dialog gives focus back on the tick after it unmounts (Radix FocusScope), so read it once that tick has run:
  // the bell must hold focus within 1 s (run 45311346283 read it in the same tick as the unmount).
  const back = await po.waitForFunction(() => document.activeElement?.hasAttribute("data-notifications-bell") ?? false, null, { timeout: 1_000 * Math.max(1, SLOW) }).then(() => true, () => false);
  ok("PF-18ns DW5: keyboard only: Tab reaches the bell (a button), Enter opens the panel with focus inside it, Escape closes it with focus back on the bell", reached && inside && back, { reached, inside, back });
  const sizes: Record<number, unknown> = {};
  for (const w of [375, 1024, 1440]) {
    const p = await tab(TO, w); await go(p, "/account"); await waitCount(p, 0);
    const onPage = await serious(p), wide1 = await sideways(p);
    await openPanel(p); const inPanel = await serious(p), wide2 = await sideways(p);
    await shot(p, `5-panel-${w}`);
    await p.keyboard.press("Escape");
    await go(p, "/account/notifications/all"); await p.locator("[data-notifications-tabs]").waitFor(); await p.locator("section[aria-label='Notifications'] li, [data-notifications-empty]").first().waitFor();
    const onAll = await serious(p), wide3 = await sideways(p);
    await shot(p, `6-all-${w}`);
    sizes[w] = { onPage, inPanel, onAll, wide: [wide1, wide2, wide3] };
    await p.context().close();
  }
  ok("PF-18ns DW5: axe-core finds 0 serious or critical issues on the page with the bell, the open panel and the All page, at 375, 1024 and 1440 px, with no sideways scroll",
    Object.values(sizes).every((s) => { const x = s as { onPage: string[]; inPanel: string[]; onAll: string[]; wide: boolean[] }; return !x.onPage.length && !x.inPanel.length && !x.onAll.length && x.wide.every((b) => !b); }), sizes);

  // ---------------------------------------------------------------------------------------------- DW4 the live region
  const pl = await tab(TO);
  await pl.clock.install();
  await go(pl, "/account"); await waitCount(pl, 0);
  // Each page mounts its own frame (and live region), so the whole document is watched: every new text the live region says.
  await pl.evaluate(() => {
    const w = window as unknown as { said: string[] }; w.said = []; let last = document.querySelector("[data-notifications-live]")?.textContent ?? "";
    new MutationObserver(() => { const now = document.querySelector("[data-notifications-live]")?.textContent ?? ""; if (now !== last) { last = now; if (now) w.said.push(now); } }).observe(document.body, { childList: true, characterData: true, subtree: true });
  });
  await pl.locator('nav[aria-label="My account"] [data-account-section="/account/licence"]').click(); await pl.waitForURL(`${BASE}/account/licence`);
  await pl.clock.runFor(60_000); await pl.clock.runFor(60_000);
  const quiet = await pl.evaluate(() => (window as unknown as { said: string[] }).said.filter(Boolean).length);
  const liveNow = await pl.locator("[data-notifications-live]").innerText();
  ok("PF-18ns DW4 fail: a page change and two 60-second polls with no new notice say nothing (the live region stays silent)", quiet === 0 && liveNow === "", { quiet, liveNow });
  await assignToO();
  await pl.clock.runFor(60_000);
  await waitCount(pl, 1);
  await pl.clock.runFor(60_000);
  const said = await pl.evaluate(() => (window as unknown as { said: string[] }).said.filter(Boolean));
  ok("PF-18ns DW4: a new notice is announced once, \"1 unread notification\", and the next poll with no change says nothing more", said.length === 1 && said[0] === "1 unread notification" && await count(pl) === 1, said);
  await pl.context().close();

  // ---------------------------------------------------------------------------------------------- DW6 the All page
  // 27 rows for O whose leads are gone or not O's (label and link null): the "can no longer be opened" state, and paging.
  // Millisecond times, as the adapter writes them (a browser's `seen` time has millisecond precision).
  for (let i = 0; i < 27; i++) sql(`insert into msg_notification (id, firm_id, staff_id, kind, "group", item_kind, item_id, created_at) values (gen_random_uuid(), '${A}', '${O}', 'lead-assigned', 'WORK_HANDED_TO_ME', 'lead', gen_random_uuid(), date_trunc('milliseconds', now()) - interval '${i + 1} minutes')`);
  const pa = await tab(TO);
  await go(pa, "/account/notifications/all");
  const list = pa.locator("section[aria-label='Notifications'] [data-notification]");
  await list.first().waitFor();
  const firstPage = await list.count();
  await pa.locator("[data-notifications-next]").click();
  await pa.getByText("Page 2").waitFor();
  const secondPage = await list.count();
  ok("PF-18ns DW6: the All page lists every notification of mine, 25 a page, newest first; Next opens page 2 with the rest", firstPage === 25 && secondPage >= 3, { firstPage, secondPage });
  await pa.locator("[data-notifications-prev]").click(); await pa.getByText("Page 1").waitFor();
  await pa.locator('[data-notifications-filter="unread"]').click();
  await pa.waitForTimeout(500);
  const unreadRows = await list.count(), allUnread = await list.evaluateAll((els) => els.every((e) => e.getAttribute("data-unread") === "true"));
  const gone = list.filter({ hasText: "This item can no longer be opened" }).first();
  ok("PF-18ns DW6: the Unread filter shows only unread rows; a row whose lead I can no longer open says so, with no link and a Mark read button",
    unreadRows > 0 && allUnread && await gone.locator("[data-notification-open]").count() === 0 && await gone.locator("[data-notification-mark]").isVisible(), { unreadRows, allUnread });
  const before = await unreadOf(TO);
  await gone.locator("[data-notification-mark]").click();
  const after = await waitCount(pa, before - 1);
  ok("PF-18ns DW6 fail: Mark read on that row reads it (the count falls by one); Read rows leave the Unread filter", after && (await unreadOf(TO)) === before - 1, { before });
  await shot(pa, "7-all-unread-1440");
  await pa.locator("[data-notifications-tabs] a", { hasText: "Settings" }).click();
  await pa.waitForURL(`${BASE}/account/notifications`);
  ok("PF-18ns DW6: Settings | All tabs link the two pages; the settings page carries the same tabs", await pa.locator("[data-notifications-tabs] a", { hasText: "All" }).isVisible());
  await openPanel(pa); await panel(pa).locator("xpath=ancestor::*[@role='dialog']").locator("[data-notifications-choose]").click();
  await pa.waitForURL(`${BASE}/account/notifications`);
  ok("PF-18ns DW6: \"Choose what you get\" in the panel opens My account → Notifications (the settings)", pa.url() === `${BASE}/account/notifications`);

  // ---------------------------------------------------------------------------------------------- round 2 (review m1, m3; break M1, m2-m5)
  const p2 = await tab(TO);
  await go(p2, "/account"); await api(TO, "POST", "/platform/me/notifications/read-all"); await p2.locator('nav[aria-label="My account"] [data-account-section="/home"]').click(); await waitCount(p2, 0);
  await assignToO();
  await p2.locator('nav[aria-label="My account"] [data-account-section="/account/licence"]').click(); await p2.waitForURL(`${BASE}/account/licence`);
  ok("PF-18ns DW1 (review m1): moving to another page inside the app, right after a count was read, reads it again: the bell says 1 at once (no reload)", await waitCount(p2, 1, 3_000));
  await api(TO, "POST", "/platform/me/notifications/read-all"); await assignToO();   // after the last count read, before the panel opens
  await openPanel(p2);
  ok("PF-18ns DW2 (break m2): opening the panel reads the count again, and Mark all read follows the panel's own unread rows (enabled)",
    await panel(p2).locator("[data-notifications-mark-all]").isEnabled() && await waitCount(p2, 1, 3_000));
  const link = panel(p2).locator("[data-notification][data-unread] [data-notification-open]").first();
  ok("PF-18ns DW5 (break m5): an unread row's link carries \"unread\" in its accessible name", /unread/i.test((await link.evaluate((el) => (el as HTMLElement).innerText)) ?? ""));
  await p2.keyboard.press("Escape");
  // break M1, review m3: Mark read keeps keyboard focus on the row (never the page body).
  sql(`insert into msg_notification (id, firm_id, staff_id, kind, "group", item_kind, item_id, created_at) values (gen_random_uuid(), '${A}', '${O}', 'lead-assigned', 'WORK_HANDED_TO_ME', 'lead', gen_random_uuid(), date_trunc('milliseconds', now()))`);
  await go(p2, "/account/notifications/all");
  const markBtn = p2.locator("section[aria-label='Notifications'] [data-notification-mark]").first();
  await markBtn.waitFor();
  const markName = await markBtn.getAttribute("aria-label");
  await markBtn.focus(); await p2.keyboard.press("Enter");
  // Once the mark is done (the row is read, its button gone), where is focus?
  await p2.waitForFunction(() => !document.querySelector("section[aria-label='Notifications'] [data-notification]:first-child [data-notification-mark]"), null, { timeout: 10_000 });
  await p2.waitForTimeout(300);
  const focusOn = await p2.evaluate(() => (document.activeElement?.closest("[data-notification]") ? "row" : document.activeElement?.tagName));
  ok("PF-18ns DW6 (break M1): after Mark read, focus stays on that row (not the page body); each Mark read button names its own row and time", focusOn === "row" && !!markName && /\d{1,2} \w{3}, \d{2}:\d{2}/.test(markName), { focusOn, markName });
  // break m4: a link that is not an app path is never trusted (shown with no link).
  await p2.route("**/api/platform/me/notifications/items?size=20", async (r) => { const res = await r.fetch(); const j = await res.json(); if (j.items[0]) j.items[0].link = "https://evil.example/x"; await r.fulfill({ response: res, json: j }); });
  await go(p2, "/account"); await openPanel(p2);
  ok("PF-18ns DW3 (break m4): an outside link from the server is not rendered as a link", await panel(p2).locator('a[href^="http"], a[href^="//"]').count() === 0);
  await p2.unroute("**/api/platform/me/notifications/items?size=20"); await p2.keyboard.press("Escape");
  // break m3: marking the last row of Unread page 2 moves back to a page with rows.
  sql(`delete from msg_notification where staff_id = '${O}'`);   // exactly 26 unread: page 1 holds 25, page 2 one
  for (let i = 0; i < 26; i++) sql(`insert into msg_notification (id, firm_id, staff_id, kind, "group", item_kind, item_id, created_at) values (gen_random_uuid(), '${A}', '${O}', 'lead-assigned', 'WORK_HANDED_TO_ME', 'lead', gen_random_uuid(), date_trunc('milliseconds', now()) - interval '${200 + i} minutes')`);
  const lastPage = await tab(TO);
  await go(lastPage, "/account/notifications/all"); await lastPage.locator('[data-notifications-filter="unread"]').click();
  await lastPage.locator("[data-notifications-next]").click(); await lastPage.getByText("Page 2").waitFor();
  await lastPage.locator("section[aria-label='Notifications'] [data-notification-mark]").last().click();
  await lastPage.getByText("Page 1").waitFor({ timeout: 10_000 }).catch(() => undefined);
  ok("PF-18ns DW6 (break m3): marking the last row of the last Unread page goes back to the previous page, never an empty page while unread rows remain",
    await lastPage.getByText("Page 1").isVisible().catch(() => false) || (await lastPage.locator("section[aria-label='Notifications'] [data-notification]").count()) > 0);
  // round 5 (Lead 16 on #3302; review r5): the brand gives way below 375 px, so between 320 and 374 px no width scrolls
  // sideways with a long name (the wordmark needs 365 px with the bell; `max-[359px]` left 359-364 px scrolling).
  const LONG = "Second representative of the Sample firm (Sample)", wideAt: number[] = [];
  for (const w of [320, 359, 364, 374]) {
    const pw = await tab(TO, w);
    await pw.route("**/api/platform/me", async (r) => { const res = await r.fetch(); const j = await res.json() as Record<string, unknown>; await r.fulfill({ response: res, json: { ...j, displayName: LONG } }); });
    await go(pw, "/home");
    if (await sideways(pw)) wideAt.push(w);
    await pw.context().close();
  }
  ok("PF-18ns DW5 (round 5): from 320 to 374 px (320, 359, 364, 374) with a long name the top bar never scrolls the page sideways", wideAt.length === 0, wideAt);
  await lastPage.context().close(); await p2.context().close();

  // ---------------------------------------------------------------------------------------------- round 3 (break M1 round 2, review m3): focus
  const p3 = await tab(TO);
  const focusedRow = () => p3.evaluate(() => { const a = document.activeElement; return a?.matches("[data-notification-mark]") ? "mark" : a?.matches("[data-notifications-empty]") ? "empty" : a?.closest("[data-notification]")?.getAttribute("data-notification") ?? a?.tagName ?? null; });
  sql(`delete from msg_notification where staff_id = '${O}'`);
  for (let i = 0; i < 3; i++) sql(`insert into msg_notification (id, firm_id, staff_id, kind, "group", item_kind, item_id, created_at) values (gen_random_uuid(), '${A}', '${O}', 'lead-assigned', 'WORK_HANDED_TO_ME', 'lead', gen_random_uuid(), date_trunc('milliseconds', now()) - interval '${i + 1} minutes')`);
  await go(p3, "/account/notifications/all"); await p3.locator('[data-notifications-filter="unread"]').click();
  const unreadList = p3.locator("section[aria-label='Notifications'] [data-notification]");
  await unreadList.nth(2).waitFor();
  const ids3 = await unreadList.evaluateAll((els) => els.map((e) => e.getAttribute("data-notification")));
  await unreadList.first().locator("[data-notification-mark]").focus(); await p3.keyboard.press("Enter");
  await p3.waitForFunction((gone) => !document.querySelector(`[data-notification="${gone}"]`), ids3[0], { timeout: 10_000 }); await p3.waitForTimeout(300);
  const afterOne = await focusedRow();
  ok("PF-18ns DW6 (round 3): in the Unread filter, keyboard Mark read on row 1 removes it and puts focus on the new row 1 (never the page body)", afterOne === ids3[1], { afterOne, ids3 });
  // a failed mark returns focus to that row's Mark read (review m3)
  await p3.route("**/api/platform/me/notifications/*/read*", (r) => r.fulfill({ status: 500, contentType: "application/problem+json", body: JSON.stringify({ title: "Server error", status: 500 }) }));
  await unreadList.first().locator("[data-notification-mark]").focus(); await p3.keyboard.press("Enter");
  await p3.getByText("Could not mark this read.").first().waitFor({ timeout: 10_000 }); await p3.waitForTimeout(300);
  const afterFail = await focusedRow();
  ok("PF-18ns DW6 fail (round 3): a failed Mark read keeps the row, says so, and returns focus to its Mark read button", afterFail === "mark", afterFail);
  await p3.unroute("**/api/platform/me/notifications/*/read*");
  // Mark all read in the Unread filter: the list empties; focus goes to the empty line
  await p3.locator("[data-notifications-mark-all]").focus(); await p3.keyboard.press("Enter");
  await p3.locator("[data-notifications-empty]").waitFor({ timeout: 10_000 }); await p3.waitForTimeout(300);
  const afterAll = await focusedRow();
  ok("PF-18ns DW2 (round 3): Mark all read in the Unread filter empties the list and puts focus on its empty line (never the page body)", afterAll === "empty", afterAll);
  await p3.context().close();
  await pa.context().close(); await po.context().close(); await pr.context().close();
  ok("PF-18ns: no page error in any tab", errs.length === 0, errs);
} catch (e) {
  failed++; console.log(`FAIL  PF-18ns: the check stopped: ${(e as Error).stack?.slice(0, 800)}`);
} finally {
  await browser.close();
}
process.exit(summary() + failed ? 1 : 0);
