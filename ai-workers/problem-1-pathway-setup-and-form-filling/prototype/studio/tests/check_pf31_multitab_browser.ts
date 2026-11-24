// PF-31 (EXPERIENCE §2.13; the founder's choice of 23 Nov: tabs drawn inside the app, the console pattern): work in many tabs,
// walked in a browser on an isolated copy (never :4400), with the API and the database read underneath. Lines:
//   T1 a menu link Ctrl-clicked opens an app tab in the background with the right address; the page stays where it was;
//   T2 the same record never opens twice: a second open of the office focuses the tab that has it;
//   T3 two different records in two tabs keep their own typed state (and an unsaved dot each);
//   T4 a second view of the same record (another window) mirrors what is typed, both ways; Save writes once, with If-Match and
//      the last value; the other view reads it again (tests/lib/multi-view.ts walkSharedRecord);
//   T5 a stale save is 409, nothing written, the conflict state shows both values; Keep mine saves (walkStaleSave);
//   T6 a reload restores the open tabs, the active one and the drafts; T7 a dirty tab asks before it closes; the 12-tab cap
//      says so; T5b "keep mine" keeps only what I changed; T8 the second screen, a lead's phone: mirrored, one save, stale
//      409 → conflict; T9 the API: version in reads' bodies, ETag on save answers,
//      If-Match on a route that takes no version 422, a malformed tag 422; T10 axe clean on the strip; 375 px: "Open items".
// Sample firm only, fresh copy. US$0, no model call; live AI off. Run from studio/:
//   zsh tools/isolated.sh pf31 4731 start AI_LIVE=off PLATFORM_IDENTITY=local && tsx tests/check_pf31_multitab_browser.ts 4731 xr_studio_pf31
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { chromium, type BrowserContext, type Page } from "playwright";
import { seedSampleFirmsFrontOffice } from "../api/src/front-office/firm-seed.ts";
import { client, recorder } from "./runtime/api.ts";
import { shown, tabs, until, walkSharedRecord, walkStaleSave } from "./lib/multi-view.ts";
const { default: AxeBuilder } = createRequire(import.meta.url)("@axe-core/playwright") as typeof import("@axe-core/playwright");

const [PORT, DBNAME] = [Number(process.argv[2] ?? 4731), process.argv[3] ?? "xr_studio_pf31"];
if (PORT === 4400 || DBNAME === "xr_studio_demo") { console.log("refused: never the demo on :4400"); process.exit(2); }
const BASE = `http://localhost:${PORT}`;
const { ok, summary } = recorder();
const { sql: rawSql } = client(PORT, DBNAME);
const sql = (q: string) => (rawSql(q) ?? "").split("\n")[0].trim();
type Ans = { status: number; body: any; headers: Headers };   // eslint-disable-line @typescript-eslint/no-explicit-any -- API answers are read loosely, as in the other checks
const api = async (t: string, method: string, path: string, body?: unknown, extra: Record<string, string> = {}): Promise<Ans> => {
  const r = await fetch(`${BASE}/api${path}`, { method, headers: { "content-type": "application/json", authorization: `Bearer ${t}`, ...extra }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text(); let j: unknown = null; try { j = JSON.parse(text); } catch { /* not JSON */ }
  return { status: r.status, body: j, headers: r.headers };
};

// ------------------------------------------------------------------------------------------------ setup (Sample)
await fetch(`${BASE}/api/platform/me`);   // waits for the Sample seed
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://xr_studio@127.0.0.1:54329/${DBNAME}`, options: "-c TimeZone=UTC" }) });
await seedSampleFirmsFrontOffice(db); await db.$disconnect();   // the lead's front office (stages, sources), as J-6 does
const signIn = await fetch(`${BASE}/api/platform/session/local`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ firmKey: "sample-firm", actorId: "user-R", secondStep: true }) }).then((r) => r.json()) as { token?: string };
if (!signIn.token) { console.error("STOP  local sign-in refused (start the copy with PLATFORM_IDENTITY=local)"); process.exit(2); }
const T = signIn.token, run = Date.now().toString(36).slice(-4);
const offices = async () => (await api(T, "GET", "/platform/offices")).body as { multipleOffices: boolean; offices: { id: string; name: string; version: string; timeZone: string }[] };
if (!(await offices()).multipleOffices) await api(T, "POST", "/platform/offices", { name: `Calgary ${run}`, country: "CA", province: "AB" });
const list = (await offices()).offices;
const [O1, O2] = list;
const lead = await api(T, "POST", "/front-office/leads", { requestId: randomUUID(), source: "Phone call", givenNames: `Tabs${run}`, familyName: "Sample", email: `tabs${run}@pf31.example`, phone: "+1 416 555 0100", confirmedNew: true });
const LEAD = lead.body?.id as string, PERSON = sql(`select person_id from fo_lead where id = '${LEAD}'`);
ok("setup: the Owner signed in; two offices; one lead with a phone", list.length >= 2 && !!LEAD && !!PERSON, { offices: list.length, lead: lead.status });
const officeName = (id: string) => sql(`select name from platform_office where id = '${id}'`);
const phone = () => sql(`select coalesce(phone, '') from fo_person where id = '${PERSON}'`);

// ------------------------------------------------------------------------------------------------ the browser
const browser = await chromium.launch({ headless: process.env.HEADED !== "1", ...(existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : process.platform === "darwin" ? { channel: "chrome" } : {}) });
const errs: string[] = [];
let closeAnswer = true;   // what a confirm() says: true accepts (also a reload's leave-page question)
const context = async (width = 1440): Promise<BrowserContext> => {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1, colorScheme: "light", reducedMotion: "reduce" });
  await ctx.addInitScript((t) => { sessionStorage.setItem("xr-staff-session", JSON.stringify({ token: t, expiresAt: Date.now() + 3_600_000 })); }, T);
  return ctx;
};
const page = async (ctx: BrowserContext) => { const p = await ctx.newPage(); p.on("pageerror", (e) => errs.push(e.message)); p.on("dialog", (d) => void (closeAnswer || d.type() === "beforeunload" ? d.accept() : d.dismiss())); return p; };
const nameField = (p: Page) => p.locator('[role="dialog"] [data-office-name]');
const officeRows = (p: Page) => shown(p).locator("[data-office-row]").first().waitFor({ timeout: 60_000 });
const officePath = (id: string) => `/platform/offices/${id}`;
const urlPath = (p: Page) => new URL(p.url()).pathname;

let failed = 0;
try {
  const ctx = await context(), p1 = await page(ctx);
  await p1.goto(`${BASE}/platform/offices`); await officeRows(p1);
  // Lead 13: with one item open there is no strip (the page looks as before PF-31); the second item brings it (T1 below).
  ok("strip: none while only one item is open", (await p1.locator("[data-workspace-strip]").count()) === 0 && (await p1.locator("main").count()) === 1, await tabs(p1));

  // T1: Ctrl-click a menu link and a record link → background tabs; the page stays
  const rowTop = async () => (await shown(p1).locator(`[data-office-row="${O1.name}"] [data-office-edit]`).boundingBox())?.y ?? -1;
  const topBefore = await rowTop();
  await shown(p1).locator('nav[aria-label="My account"] a[href="/platform/team"]').click({ modifiers: ["Control"] });
  await until(async () => (await p1.locator("[data-workspace-strip]").count()) > 0);
  ok("T1 the strip appearing does not move the list under the pointer (breaker M3 on 2fd5352aa)", Math.abs((await rowTop()) - topBefore) <= 2, { before: topBefore, after: await rowTop() });
  await shown(p1).locator(`[data-office-row="${O1.name}"] [data-office-edit]`).click({ modifiers: ["Control"] });
  await until(async () => (await tabs(p1)).length === 3);
  let t = await tabs(p1);
  ok("T1 Ctrl-click on a menu item opens an app tab in the background with the right address", t.some((x) => x.path === "/platform/team" && !x.selected), t);
  ok("T1 Ctrl-click on a record's Edit opens its own address in a background tab; the address bar stays on the list", t.some((x) => x.path === officePath(O1.id) && !x.selected) && urlPath(p1) === "/platform/offices" && t[0].selected, { t, url: p1.url() });
  ok("T1 no browser tab was opened", ctx.pages().length === 1, ctx.pages().length);

  // T2: the same record never opens twice
  await shown(p1).locator(`[data-office-row="${O1.name}"] [data-office-edit]`).click();
  await until(async () => urlPath(p1) === officePath(O1.id));
  t = await tabs(p1);
  ok("T2 a second open of the same office focuses the tab that has it (no new tab)", t.length === 3 && t.find((x) => x.path === officePath(O1.id))?.selected === true && urlPath(p1) === officePath(O1.id), { t, url: p1.url() });
  await nameField(p1).waitFor();
  ok("T2 the tab names its record", (await tabs(p1)).find((x) => x.selected)?.title === `Office: ${O1.name}`, await tabs(p1));

  // T3: two records, two tabs, each keeps its own state
  const A3 = `${O1.name} draft ${run}`, B3 = `${O2.name} draft ${run}`;
  await nameField(p1).fill(A3);
  await p1.locator(`[data-workspace]:visible [data-ws-tab][data-ws-path="/platform/offices"]`).click();
  await shown(p1).locator(`[data-office-row="${O2.name}"] [data-office-edit]`).click();
  await nameField(p1).waitFor();
  await nameField(p1).fill(B3);
  await p1.locator(`[data-workspace]:visible [data-ws-tab][data-ws-path="${officePath(O1.id)}"]`).click();
  await nameField(p1).waitFor();
  const backA = await nameField(p1).inputValue();
  await p1.locator(`[data-workspace]:visible [data-ws-tab][data-ws-path="${officePath(O2.id)}"]`).click();
  await nameField(p1).waitFor();
  const backB = await nameField(p1).inputValue();
  t = await tabs(p1);
  ok("T3 two different records in two tabs keep their own typed values", backA === A3 && backB === B3, { backA, backB });
  ok("T3 each tab with unsaved changes shows the dot; the address bar shows the active tab", t.filter((x) => x.dirty).length === 2 && urlPath(p1) === officePath(O2.id), { t, url: p1.url() });

  // T6: reload restores the tabs, the active one and the drafts
  await p1.reload(); await nameField(p1).waitFor({ timeout: 60_000 });
  const t6 = await tabs(p1);
  ok("T6 a reload restores the open tabs and the active one", t6.length === 4 && t6.find((x) => x.selected)?.path === officePath(O2.id), t6);
  ok("T6 the active tab's draft survives the reload", (await nameField(p1).inputValue()) === B3, await nameField(p1).inputValue());
  ok("T6 a tab not mounted since the reload still shows its dot (break M2)", !!t6.find((x) => x.path === officePath(O1.id))?.dirty, t6);
  closeAnswer = false;
  await p1.locator(`[data-workspace]:visible [data-ws-tab][data-ws-path="${officePath(O1.id)}"] [data-ws-close]`).click();
  await p1.waitForTimeout(300);
  ok("T6 closing that tab asks first; No keeps it (break M2, review round 3)", (await tabs(p1)).some((x) => x.path === officePath(O1.id)), await tabs(p1));
  closeAnswer = true;

  // T4: a second view (another window of the same browser) mirrors, one save, the other view refreshes
  const p2 = await page(ctx);
  await p2.goto(`${BASE}${officePath(O1.id)}`); await nameField(p2).waitFor({ timeout: 60_000 });
  await p1.locator(`[data-workspace]:visible [data-ws-tab][data-ws-path="${officePath(O1.id)}"]`).click(); await nameField(p1).waitFor();
  ok("T4 the second window opens with the first window's draft", await until(async () => (await nameField(p2).inputValue()) === A3), await nameField(p2).inputValue());
  ok("T4 the draft line says the record is also open in another window", await until(async () => /also open in 1 other window/.test(await p1.locator('[role="dialog"] [data-draft-line]').innerText().catch(() => ""))), await p1.locator('[role="dialog"] [data-draft-line]').innerText().catch(() => "none"));
  const S4 = `${O1.name} saved ${run}`;
  await walkSharedRecord({ label: "T4 office", a: p1, b: p2, field: nameField, saves: (m, u) => m === "PATCH" && u.includes(`/api/platform/offices/${O1.id}`),
    save: (p) => p.locator('[role="dialog"] [data-office-save]').click(), stored: async () => officeName(O1.id), otherSaves: async () => {},
    values: { mirrored: `${O1.name} mirrored ${run}`, last: S4, stale: "", other: "" } }, ok);
  await p2.close();

  // T5: a stale save → 409 and the conflict state (the second office's draft began before someone else saved it)
  const O2v = (await offices()).offices.find((o) => o.id === O2.id)!;
  await walkStaleSave({ label: "T5 office", a: p1, field: nameField, saves: (m, u) => m === "PATCH" && u.includes(`/api/platform/offices/${O2.id}`),
    open: async () => { await p1.locator(`[data-workspace]:visible [data-ws-tab][data-ws-path="${officePath(O2.id)}"]`).click(); await nameField(p1).waitFor(); },
    save: (p) => p.locator('[role="dialog"] [data-office-save]').click(), stored: async () => officeName(O2.id),
    otherSaves: async (v) => { const r = await api(T, "PATCH", `/platform/offices/${O2.id}`, { name: v }, { "if-match": `"${O2v.version}"` }); if (r.status !== 200) throw new Error(`other save ${r.status}`); },
    values: { mirrored: "", last: "", stale: `${O2.name} mine ${run}`, other: `${O2.name} theirs ${run}` } }, ok);

  ok("T5 after a save the office's tab closes and the list's tab comes forward (review M2)", await until(async () => urlPath(p1) === "/platform/offices" && !(await tabs(p1)).some((x) => x.path === officePath(O2.id))), { url: p1.url(), tabs: await tabs(p1) });
  const editFromList = async (o: { id: string }) => { await p1.locator('[data-workspace]:visible [data-ws-tab][data-ws-path="/platform/offices"]').click(); await shown(p1).locator(`[data-office-edit][href="${officePath(o.id)}"]`).click(); await nameField(p1).waitFor(); };

  // T5b (review M1): someone changes a detail I did not touch; "Keep mine" keeps only what I changed
  await editFromList(O1);
  const O1v = (await offices()).offices.find((o) => o.id === O1.id)!, mineName = `${O1.name} only name ${run}`;
  await nameField(p1).fill(mineName);
  // A zone other than the current one, so the save really changes the record (a second run on the same copy starts on Halifax).
  const theirZone = O1v.timeZone === "America/Halifax" ? "America/Toronto" : "America/Halifax";
  const zoneSave = await api(T, "PATCH", `/platform/offices/${O1.id}`, { timeZone: theirZone }, { "if-match": `"${O1v.version}"` });
  await p1.locator('[role="dialog"] [data-office-save]').click();
  const box = p1.locator("[data-conflict]");
  await box.waitFor({ timeout: 10_000 });
  ok("T5b the conflict lists only the detail I changed (no time zone I never touched)", zoneSave.status === 200 && (await box.locator("[data-conflict-row]").count()) === 1 && (await box.locator('[data-conflict-row="Office name"]').count()) === 1, await box.innerText());
  ok("T5b the conflict notice takes focus and is announced (role alert)", await box.evaluate((el) => el === document.activeElement && el.getAttribute("role") === "alert"));
  await box.locator("[data-conflict-keep-mine]").click();
  await p1.locator('[role="dialog"] [data-office-save]').click();
  ok("T5b Keep mine then Save: my name is written and their time zone stays", await until(async () => officeName(O1.id) === mineName && sql(`select time_zone from platform_office where id = '${O1.id}'`) === theirZone, 5000), { name: officeName(O1.id), zone: sql(`select time_zone from platform_office where id = '${O1.id}'`) });

  // T5c (break M1): I change the province while someone moves the office abroad; "Keep mine" keeps my whole "where"
  await editFromList(O1);
  const O1w = (await offices()).offices.find((o) => o.id === O1.id)!;
  const myProvince = sql(`select coalesce(province, '') from platform_office where id = '${O1.id}'`) === "BC" ? "MB" : "BC";
  await p1.locator('[role="dialog"] [data-office-in-canada]').check();
  await p1.locator('[role="dialog"] [data-office-province]').selectOption(myProvince);
  const abroad = await api(T, "PATCH", `/platform/offices/${O1.id}`, { country: "GB", province: null }, { "if-match": `"${O1w.version}"` });
  await p1.locator('[role="dialog"] [data-office-save]').click();
  await box.waitFor({ timeout: 10_000 });
  await box.locator("[data-conflict-keep-mine]").click();
  await p1.locator('[role="dialog"] [data-office-save]').click();
  const whereNow = () => sql(`select country_code || ' ' || coalesce(province, '') from platform_office where id = '${O1.id}'`);
  ok("T5c Keep mine then Save keeps my province in Canada, not their country (break M1)", abroad.status === 200 && await until(async () => whereNow() === `CA ${myProvince}`, 5000), { abroad: abroad.status, where: whereNow() });

  // T7: Close; a dirty tab asks before closing; the cap
  await editFromList(O2);
  await p1.locator('[role="dialog"] [data-office-close]').click();
  ok("T7 Close on an unchanged office closes its tab and shows the list (review M2)", await until(async () => urlPath(p1) === "/platform/offices" && !(await tabs(p1)).some((x) => x.path === officePath(O2.id))), await tabs(p1));
  ok("T7 after Close, focus is on the tab that comes forward, not lost (round 2 Should 1)", await until(async () => p1.evaluate(() => !!document.activeElement?.hasAttribute("data-ws-tab") && document.activeElement?.getAttribute("aria-current") === "page")), await p1.evaluate(() => document.activeElement?.outerHTML.slice(0, 120)));
  await editFromList(O2);
  await p1.locator('[role="dialog"] [data-office-name]').fill(`${O2.name} again ${run}`);
  closeAnswer = false;
  const before = (await tabs(p1)).length;
  await p1.locator(`[data-workspace]:visible [data-ws-tab][data-ws-path="${officePath(O2.id)}"]`).click({ button: "middle" });
  await p1.waitForTimeout(300);
  ok("T7 closing a tab with unsaved changes asks; No keeps it", (await tabs(p1)).length === before, await tabs(p1));
  closeAnswer = true;
  await p1.locator(`[data-workspace]:visible [data-ws-tab][data-ws-path="${officePath(O2.id)}"] [data-ws-close]`).click();
  ok("T7 Yes closes it, drops its draft and shows the next tab", await until(async () => (await tabs(p1)).length === before - 1) && !(await p1.evaluate(() => Object.keys(sessionStorage).some((k) => k.startsWith("xr.draft.platform-office:")))), await tabs(p1));
  ok("T7 focus goes to the tab that comes forward (review S4)", await until(async () => p1.evaluate(() => !!document.activeElement?.hasAttribute("data-ws-tab") && document.activeElement?.getAttribute("aria-current") === "page")));
  await p1.evaluate(() => { const k = Object.keys(sessionStorage).find((x) => x.startsWith("xr.workspace.v1:"))!, s = JSON.parse(sessionStorage.getItem(k)!); for (let i = s.tabs.length; i < 12; i++) s.tabs.push({ id: `cap${i}`, path: `/platform/x${i}`, title: `Item ${i}` }); sessionStorage.setItem(k, JSON.stringify(s)); });
  await p1.reload(); await p1.locator('[data-workspace]:visible [data-ws-strip]').waitFor({ timeout: 60_000 });
  await p1.locator(`[data-workspace]:visible [data-ws-tab][data-ws-path="/platform/offices"]`).click(); await officeRows(p1);
  await shown(p1).locator('nav[aria-label="My account"] a[href="/platform/security"]').click({ modifiers: ["Control"] });
  ok("T7 at 12 open items a 13th is refused with a clear message", (await tabs(p1)).length === 12 && /12 items are open/.test(await p1.locator("[data-workspace]:visible [data-ws-notice]").innerText().catch(() => "")), await tabs(p1));
  await p1.setViewportSize({ width: 1024, height: 900 });
  ok("T7 at 1024 px a full strip scrolls inside itself; the page never scrolls sideways (break M3)", await until(async () => p1.evaluate(() => document.documentElement.scrollWidth <= 1024)), await p1.evaluate(() => document.documentElement.scrollWidth));
  await p1.setViewportSize({ width: 1440, height: 900 });
  await p1.locator('[data-workspace]:visible [data-ws-tab][data-ws-path="/platform/x11"] [data-ws-close]').click();
  ok("T7 closing a background tab keeps focus on the strip's active tab (round 2 Should 2)", await until(async () => p1.evaluate(() => !!document.activeElement?.hasAttribute("data-ws-tab") && document.activeElement?.getAttribute("aria-current") === "page")) && (await tabs(p1)).length === 11, await p1.evaluate(() => document.activeElement?.outerHTML.slice(0, 120)));
  // Review on 2fd5352aa: My account's own pages (/account, /home, …) are staff pages too, so they open in the workspace.
  const pagesBefore = ctx.pages().length;
  await shown(p1).locator('nav[aria-label="My account"] a[href="/account"]').click({ modifiers: ["Control"] });
  // Breaker N1 on 30ab3cde2: a public page (pricing, a firm's booking page) is never an in-app tab of the staff workspace.
  const publicOpened = ctx.waitForEvent("page", { timeout: 15_000 }).catch(() => null);
  // A link as Home shows it (Home's own Pricing link), clicked with Ctrl the moment it is in the frame.
  await p1.evaluate(() => { const f = document.querySelector("[data-ws-panel] [data-workspace]")!, a = document.createElement("a"); a.href = "/pricing"; a.textContent = "Pricing"; f.appendChild(a); a.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0, ctrlKey: true })); });
  const pub = await publicOpened;
  ok("T7 Ctrl-click on a public page (pricing) opens a browser tab, never an in-app one", !!pub && !(await tabs(p1)).some((x) => x.path === "/pricing"), { browserTab: !!pub, tabs: (await tabs(p1)).map((x) => x.path) });
  await pub?.close();
  ok("T7 Ctrl-click on My account's Profile opens an app tab in the background, never a browser tab", await until(async () => (await tabs(p1)).some((x) => x.path === "/account" && !x.selected)) && ctx.pages().length === pagesBefore, { tabs: (await tabs(p1)).map((x) => x.path), pages: ctx.pages().length });
  // Breaker F1 on 13621c493: My account and Licence open together; a switch after the 2 s staleTime re-reads both (each its
  // own query key now) and nothing breaks: no page error, a page is drawn.
  const errsBefore = errs.length;
  await p1.locator('[data-workspace]:visible [data-ws-tab][data-ws-path="/platform/x10"] [data-ws-close]').click();   // room under the cap
  await shown(p1).locator('nav[aria-label="My account"] a[href="/account/licence"]').click({ modifiers: ["Control"] });
  await until(async () => (await tabs(p1)).some((x) => x.path === "/account/licence"));
  await p1.locator(`[data-workspace]:visible [data-ws-tab][data-ws-path="/account"]`).click(); await p1.waitForTimeout(2_600);
  await p1.locator(`[data-workspace]:visible [data-ws-tab][data-ws-path="/account/licence"]`).click(); await p1.waitForTimeout(2_600);
  await p1.locator(`[data-workspace]:visible [data-ws-tab][data-ws-path="/account"]`).click(); await p1.waitForTimeout(1_000);
  ok("T7 with My account and Licence both open, switching between them after 2 s keeps the app drawn (breaker F1)", errs.length === errsBefore && (await p1.locator("main").count()) === 1 && (await p1.locator("[data-ws-failed]").count()) === 0, errs.slice(errsBefore));
  // Review on 91cb4a742: each open tab has its own notification bell; a new count is said once, by the shown tab's bell,
  // even when the shown tab is not the first one open (a hidden bell used to take the announcement).
  const rStaff = sql("select id from platform_staff where actor_id = 'user-R' limit 1"), rFirm = sql(`select firm_id from platform_staff where id = '${rStaff}'`);
  sql(`insert into msg_notification (id, firm_id, staff_id, kind, "group", item_kind, item_id) select gen_random_uuid(), '${rFirm}', '${rStaff}', 'lead-assigned', 'WORK_HANDED_TO_ME', 'lead', gen_random_uuid() from generate_series(1, 2)`);
  await p1.locator('[data-workspace]:visible [data-ws-tab][data-ws-path="/account/licence"]').click();
  ok("T7 two new notifications are said once by the shown tab's bell, not by a hidden tab's (review on 91cb4a742)", await until(async () => /^\d+ unread notifications?$/.test((await p1.locator("[data-notifications-live]").innerText().catch(() => "")).trim()), 8_000) && (await p1.locator("[data-notifications-live]").count()) === 1, await p1.locator("[data-notifications-live]").allInnerTexts());
  sql(`delete from msg_notification where staff_id = '${rStaff}' and kind = 'lead-assigned' and item_id not in (select id from fo_lead)`);

  // B1 (review round 3 Should 2): a draft broadcast by another person's window is ignored here
  const forgedKey = `platform-office:${O2.id}`;
  await p1.evaluate((k) => new BroadcastChannel("xr-sync").postMessage({ t: "draft", key: k, entry: { values: { name: "forged" }, base: {}, version: null, who: "someone-else" }, from: "forger", who: "someone-else" }), forgedKey);
  await p1.waitForTimeout(300);
  ok("B1 a draft broadcast by another person's window is ignored", !(await p1.evaluate((k) => sessionStorage.getItem(`xr.draft.${k}`), forgedKey)));

  // T10: axe on the strip; keyboard; 375 px
  // Lead 13 on #3193: hidden tabs are out of the document and the strip is navigation, so a page with several items open still
  // has one main, one heading and only its own tabs (page checks read `main`, `main h1` and `getByRole("tab")`).
  ok("T10 with several items open the page has one main and one h1, and the strip is nav \"Open items\", not a tab list", (await tabs(p1)).length > 1 && await p1.locator("main").count() === 1 && await p1.locator("main h1").count() <= 1 && await p1.locator('[data-workspace-strip] [role="tablist"], [data-workspace-strip] [role="tab"], [role="tabpanel"][data-ws-panel]').count() === 0 && await p1.getByRole("navigation", { name: "Open items" }).count() === 1, { tabs: (await tabs(p1)).length, main: await p1.locator("main").count(), h1: await p1.locator("main h1").count() });
  const ax = (await new AxeBuilder({ page: p1 }).include("[data-workspace]:not([hidden] *) [data-workspace-strip]").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze()).violations;
  ok("T10 axe (WCAG 2.2 A/AA) clean on the strip", ax.length === 0, ax.map((v) => `${v.id}: ${v.nodes[0]?.target}`));
  await p1.locator('[data-workspace]:visible [data-ws-tab][aria-current="page"]').focus();
  const was = urlPath(p1);
  await p1.keyboard.press("ArrowRight");
  ok("T10 arrow keys move between tabs (the strip's roving focus)", await until(async () => urlPath(p1) !== was), { was, now: urlPath(p1) });
  await p1.keyboard.press("Alt+PageUp");
  ok("T10 Alt+PageUp goes back a tab", await until(async () => urlPath(p1) === was), urlPath(p1));
  await ctx.close();
  const small = await context(375), ps = await page(small);
  await ps.goto(`${BASE}/platform/offices`); await officeRows(ps);
  ok("T10 at 375 px with one item open: no strip and no Open items row", (await ps.locator("[data-workspace-strip]").count()) === 0);
  await shown(ps).locator("[data-office-row] [data-office-edit]").first().click(); await nameField(ps).waitFor();   // a second item
  ok("T10 at 375 px the strip folds into an Open items menu; no sideways scroll", await ps.locator("[data-workspace]:visible [data-ws-menu]").isVisible() && await ps.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await small.close();

  // T8: the lead's phone (front office): mirrored, one save, stale 409
  const lctx = await context(), l1 = await page(lctx), l2 = await page(lctx);
  const phoneField = (p: Page) => shown(p).locator("[data-phone-input]");
  for (const p of [l1, l2]) { await p.goto(`${BASE}/front-office/leads/${LEAD}`); await shown(p).locator("[data-phone-edit-open]").waitFor({ timeout: 60_000 }); }
  await shown(l1).locator("[data-phone-edit-open]").click();
  await phoneField(l1).fill("+14165550101");
  ok("T8 lead: a number typed in one window opens the field in the other with the same value", await until(async () => (await phoneField(l2).count()) > 0 && (await phoneField(l2).inputValue()) === "+14165550101"));
  await walkSharedRecord({ label: "T8 lead phone", a: l1, b: l2, field: phoneField, saves: (m, u) => m === "PATCH" && u.includes(`/api/front-office/people/${PERSON}`),
    save: (p) => shown(p).locator("[data-phone-save]").click(), stored: async () => phone(), otherSaves: async () => {},
    values: { mirrored: "+14165550102", last: "+14165550103", stale: "", other: "" } }, ok);
  await l2.close();
  const ver = sql(`select to_char(updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') from fo_person where id = '${PERSON}'`);
  await walkStaleSave({ label: "T8 lead phone", a: l1, field: phoneField, saves: (m, u) => m === "PATCH" && u.includes(`/api/front-office/people/${PERSON}`),
    open: async () => { await shown(l1).locator("[data-phone-edit-open]").click(); await phoneField(l1).waitFor(); },
    save: (p) => shown(p).locator("[data-phone-save]").click(), stored: async () => phone(),
    otherSaves: async (v) => { const r = await api(T, "PATCH", `/front-office/people/${PERSON}`, { phone: v }, { "if-match": `"${ver}"` }); if (r.status !== 200) throw new Error(`other save ${r.status} ${JSON.stringify(r.body)}`); },
    values: { mirrored: "", last: "", stale: "+14165550104", other: "+14165550105" } }, ok);
  await lctx.close();

  // T9: the API door
  const read = await api(T, "GET", "/platform/firm/profile");
  ok("T9 a read carries its version in the body, never as an ETag a cache could answer 304 to (review M3)", !!read.body?.version && read.headers.get("etag") !== `"${read.body?.version}"`, read.headers.get("etag"));
  const o1 = (await offices()).offices.find((o) => o.id === O1.id)!;
  const saved = await api(T, "PATCH", `/platform/offices/${O1.id}`, { name: `${O1.name} etag ${run}` }, { "if-match": `"${o1.version}"` });
  ok("T9 a save with If-Match is 200 and its answer's version is its strong ETag", saved.status === 200 && saved.headers.get("etag") === `"${saved.body?.version}"`, { status: saved.status, etag: saved.headers.get("etag") });
  const wrongRoute = await api(T, "PUT", `/platform/staff/${sql(`select id from platform_staff where actor_id = 'user-O' limit 1`)}/office`, { officeId: null }, { "if-match": '"x"' });
  ok("T9 If-Match on a change that takes no version is 422 in words (never a silent pass)", wrongRoute.status === 422 && /does not take a version/.test(JSON.stringify(wrongRoute.body)), wrongRoute.body);
  const bad = await api(T, "PATCH", `/platform/offices/${O1.id}`, { name: "x" }, { "if-match": "*" });
  const differ = await api(T, "PATCH", `/platform/offices/${O1.id}`, { name: "x", version: "a" }, { "if-match": '"b"' });
  ok("T9 a malformed If-Match (\"*\") and a body version that differs from the header are 422; nothing written", bad.status === 422 && differ.status === 422 && officeName(O1.id) === `${O1.name} etag ${run}`, { bad: bad.status, differ: differ.status });
  const staleProfile = await api(T, "PUT", "/platform/firm/profile", { website: "https://pf31.example.ca" }, { "if-match": '"0000"' });
  ok("T9 the firm profile takes If-Match too: a stale one is 409", staleProfile.status === 409, staleProfile.status);
  // Breaker M1 on 2fd5352aa: a menu left open in a tab that is then hidden closes; nothing floats over the shown tab.
  const sctx = await browser.newContext({ viewport: { width: 1440, height: 400 } });
  await sctx.addInitScript(() => { try { localStorage.setItem("xr-actor", "user-A"); } catch { /* none */ } });
  const st = await page(sctx);
  await st.goto(`${BASE}/library/fields`); await st.locator("[data-workspace]:visible").first().waitFor({ timeout: 60_000 });
  // Review on 30ab3cde2: from a scrolled page too, the strip appearing leaves the content where it was (the browser's own scroll
  // anchoring and the workspace's correction together move it by nothing).
  // Any second Studio page will do; Rules, not Releases, so this check is not chosen for every change to the releases page
  // (select-suites maps a suite to the pages it names; check-select-suites keeps that page under 30 suites, Lead 19).
  const studioLink = shown(st).locator('a[href="/library/rules"]').first();
  await st.waitForTimeout(1000); await st.evaluate(() => window.scrollTo(0, 150)); await studioLink.scrollIntoViewIfNeeded(); await st.waitForTimeout(300);
  const mainTop = () => st.evaluate(() => Math.round(document.querySelector("main")?.getBoundingClientRect().top ?? -999));
  const scrolledBefore = await mainTop(), scrolledY = await st.evaluate(() => scrollY);
  ok("the scrolled-page line starts from a scrolled page (review on 91cb4a742)", scrolledY > 0, scrolledY);
  await studioLink.click({ modifiers: ["Control"] });
  await until(async () => (await tabs(st)).length > 1);
  await st.waitForTimeout(200);
  ok("from a scrolled page the strip appearing leaves the content still (review on 30ab3cde2)", Math.abs((await mainTop()) - scrolledBefore) <= 2, { before: scrolledBefore, after: await mainTop(), scrollYBefore: scrolledY, scrollY: await st.evaluate(() => scrollY) });
  await shown(st).getByRole("button", { name: /^Demo/ }).click(); await st.getByRole("menu").waitFor();
  await st.keyboard.press("Alt+PageDown");
  ok("a menu open in a tab that is then hidden closes: no menu over the shown tab, the page takes clicks", await until(async () => (await st.getByRole("menu").count()) === 0 && await st.evaluate(() => getComputedStyle(document.body).pointerEvents !== "none")), { menus: await st.getByRole("menu").count(), url: st.url() });
  await sctx.close();

  // B1 (break) and review round 3: drafts and tabs belong to the person. A session that ends by itself keeps them for the
  // same person; another person signing in here never sees them. Last: it ends T's session. It signs in user-T, so a breaker
  // running user-T on the same copy at the same time loses its session (one session per person).
  const ctxB = await context(), pb = await page(ctxB), typed = `${O2.name} typed by R ${run}`;
  const formSignIn = async (email: string) => {
    await pb.locator("[data-sign-in-card] input").first().fill("sample-firm");
    await pb.locator('[data-sign-in-card] input[type="email"]').fill(email);
    await pb.locator('[data-sign-in-card] button[type="submit"]').click();
    await pb.locator("[data-staff-name]").waitFor({ timeout: 20_000 });
  };
  const kept = () => pb.evaluate((v) => Object.values(sessionStorage).some((x) => x.includes(v)), typed);
  await pb.goto(`${BASE}/platform/offices`); await shown(pb).locator(`[data-office-edit][href="${officePath(O2.id)}"]`).click(); await nameField(pb).waitFor({ timeout: 60_000 });
  await nameField(pb).fill(typed);
  await until(kept);
  await pb.locator('[data-workspace]:visible [data-ws-tab][data-ws-path="/platform/offices"]').click();   // the list again: the header is not behind the panel
  // The session ends by itself: R signs in elsewhere, so the next call here is refused (401, "signed in elsewhere").
  await fetch(`${BASE}/api/platform/session/local`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ firmKey: "sample-firm", actorId: "user-R", secondStep: true }) });
  await pb.reload();   // the first call with the old token is refused, so the session ends here (the typing was kept over the reload)
  await pb.locator("[data-signed-in-elsewhere]").waitFor({ timeout: 60_000 });
  ok("round 3: a session ended by the server hides the typing but keeps it for the same person", await kept() && (await pb.getByText(typed).count()) === 0);
  await pb.getByRole("button", { name: "Sign in again here" }).click();
  await formSignIn(sql("select email from platform_staff where actor_id = 'user-R' limit 1"));
  await pb.locator(`[data-workspace]:visible [data-ws-tab][data-ws-path="${officePath(O2.id)}"]`).click();
  ok("round 3: the same person signing in again gets the tab and the typing back", await until(async () => (await nameField(pb).inputValue().catch(() => "")) === typed), await nameField(pb).inputValue().catch(() => "(no panel)"));
  // Round 5 (breaker round 4 m2): a second window of the same person holds the same draft.
  const cur = await pb.evaluate(() => sessionStorage.getItem("xr-staff-session"));
  const pb2 = await page(ctxB);
  await pb2.addInitScript((v) => { if (v) sessionStorage.setItem("xr-staff-session", v); }, cur);
  await pb2.goto(`${BASE}${officePath(O2.id)}`);
  const kept2 = () => pb2.evaluate((v) => Object.values(sessionStorage).some((x) => x.includes(v)), typed);
  ok("round 5: a second window of the same person shows the draft", await until(async () => (await nameField(pb2).inputValue().catch(() => "")) === typed, 20_000), await nameField(pb2).inputValue().catch(() => "(no panel)"));
  await pb.locator('[data-workspace]:visible [data-ws-tab]').first().click();
  // Round 5 (review round 4 Should 2): the server has already ended this session (R signed in elsewhere), so Sign out's own
  // call answers 401; nothing of the person may stay all the same.
  await fetch(`${BASE}/api/platform/session/local`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ firmKey: "sample-firm", actorId: "user-R", secondStep: true }) });
  await pb.getByRole("button", { name: "Sign out" }).click();
  await pb.locator("[data-sign-in-card], [data-signed-in-elsewhere]").first().waitFor();
  const staffLists = (p: Page) => p.evaluate(() => Object.keys(sessionStorage).filter((k) => k.startsWith("xr.workspace.v1:") && !k.endsWith(":local")));
  ok("B1 Sign out (answered 401) drops the person's drafts and tabs from this browser tab (a shared computer)", !(await kept()) && (await staffLists(pb)).length === 0, await pb.evaluate(() => Object.keys(sessionStorage)));
  ok("round 5: Sign out also empties the same person's other window and signs it out", await until(async () => !(await kept2()) && (await staffLists(pb2)).length === 0 && (await nameField(pb2).count()) === 0, 10_000), await pb2.evaluate(() => Object.keys(sessionStorage)));
  await pb2.close();
  if (await pb.locator("[data-signed-in-elsewhere]").count()) await pb.getByRole("button", { name: "Sign in again here" }).click();
  await formSignIn(sql("select email from platform_staff where actor_id = 'user-T' limit 1"));
  await pb.waitForTimeout(500);
  const seen = await nameField(pb).inputValue({ timeout: 2000 }).catch(() => "(no panel)");
  ok("B1 another person signed in here sees none of the last person's typing or tabs", seen !== typed && !(await kept()) && !(await tabs(pb)).some((x) => x.path === officePath(O2.id)), { seen, tabs: await tabs(pb) });
  // Review on 2fd5352aa: a Sign out the server answers 200 keeps no tab list either (no staff address in any list).
  await pb.getByRole("button", { name: "Sign out" }).click(); await pb.locator("[data-sign-in-card]").waitFor();
  ok("Sign out (answered 200) keeps no tab list with a staff address", await pb.evaluate(() => !Object.entries(sessionStorage).some(([k, v]) => k.startsWith("xr.workspace.v1:") && /\/(platform|front-office|account|home)\b/.test(v))), await pb.evaluate(() => Object.entries(sessionStorage).filter(([k]) => k.startsWith("xr.workspace"))));
  await ctxB.close();
  // Break round 3 M2: an area with no staff session (the case area, simulated people) keeps its tabs over a reload too.
  const ctxS = await browser.newContext({ viewport: { width: 1440, height: 900 } }), pc = await page(ctxS);
  await pc.goto(`${BASE}/cases`); await pc.locator('[data-workspace]:visible').first().waitFor({ timeout: 60_000 });
  await pc.locator('[data-workspace]:visible nav a[href^="/"]').nth(1).click({ modifiers: ["Control"] });
  await until(async () => (await tabs(pc)).length > 1);
  const beforeS = (await tabs(pc)).length;
  await pc.reload(); await pc.locator('[data-workspace]:visible [data-ws-strip]').waitFor({ timeout: 60_000 });
  ok("round 3: with no staff session (the case area) the tabs still come back after a reload (break M2)", beforeS > 1 && await until(async () => (await tabs(pc)).length === beforeS), { beforeS, after: await tabs(pc) });
  await ctxS.close();
  ok("no page errors", errs.length === 0, errs.slice(0, 5));
} catch (e) { failed = 1; console.error("FAIL  the walk stopped:", e); } finally { await browser.close(); }
process.exit(summary() + failed ? 1 : 0);
