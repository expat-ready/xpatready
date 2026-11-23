// PF-31 (EXPERIENCE §2.12; the founder's choice of 23 Nov: tabs drawn inside the app, the console pattern): work in many tabs,
// walked in a browser on an isolated copy (never :4400), with the API and the database read underneath. Lines:
//   T1 a menu link Ctrl-clicked opens an app tab in the background with the right address; the page stays where it was;
//   T2 the same record never opens twice: a second open of the office focuses the tab that has it;
//   T3 two different records in two tabs keep their own typed state (and an unsaved dot each);
//   T4 a second view of the same record (another window) mirrors what is typed, both ways; Save writes once, with If-Match and
//      the last value; the other view reads it again (tests/lib/multi-view.ts walkSharedRecord);
//   T5 a stale save is 409, nothing written, the conflict state shows both values; Keep mine saves (walkStaleSave);
//   T6 a reload restores the open tabs, the active one and the drafts; T7 a dirty tab asks before it closes; the 12-tab cap
//      says so; T8 the second screen, a lead's phone: mirrored, one save, stale 409 → conflict; T9 the API: ETag on reads,
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
const offices = async () => (await api(T, "GET", "/platform/offices")).body as { multipleOffices: boolean; offices: { id: string; name: string; version: string }[] };
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
  ok("strip: one tab, under the header, named for the page", (await tabs(p1)).length === 1 && (await tabs(p1))[0].title === "Offices", await tabs(p1));

  // T1: Ctrl-click a menu link and a record link → background tabs; the page stays
  await shown(p1).locator('nav[aria-label="My account"] a[href="/platform/team"]').click({ modifiers: ["Control"] });
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
  await p1.locator(`[data-workspace]:visible [role="tab"][data-ws-path="/platform/offices"]`).click();
  await shown(p1).locator(`[data-office-row="${O2.name}"] [data-office-edit]`).click();
  await nameField(p1).waitFor();
  await nameField(p1).fill(B3);
  await p1.locator(`[data-workspace]:visible [role="tab"][data-ws-path="${officePath(O1.id)}"]`).click();
  await nameField(p1).waitFor();
  const backA = await nameField(p1).inputValue();
  await p1.locator(`[data-workspace]:visible [role="tab"][data-ws-path="${officePath(O2.id)}"]`).click();
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

  // T4: a second view (another window of the same browser) mirrors, one save, the other view refreshes
  const p2 = await page(ctx);
  await p2.goto(`${BASE}${officePath(O1.id)}`); await nameField(p2).waitFor({ timeout: 60_000 });
  await p1.locator(`[data-workspace]:visible [role="tab"][data-ws-path="${officePath(O1.id)}"]`).click(); await nameField(p1).waitFor();
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
    open: async () => { await p1.locator(`[data-workspace]:visible [role="tab"][data-ws-path="${officePath(O2.id)}"]`).click(); await nameField(p1).waitFor(); },
    save: (p) => p.locator('[role="dialog"] [data-office-save]').click(), stored: async () => officeName(O2.id),
    otherSaves: async (v) => { const r = await api(T, "PATCH", `/platform/offices/${O2.id}`, { name: v }, { "if-match": `"${O2v.version}"` }); if (r.status !== 200) throw new Error(`other save ${r.status}`); },
    values: { mirrored: "", last: "", stale: `${O2.name} mine ${run}`, other: `${O2.name} theirs ${run}` } }, ok);

  // T7: a dirty tab asks before closing; the cap
  ok("T5/T4 after a save the panel closes and the list's tab comes forward (its address is the list's item)", await until(async () => urlPath(p1) === "/platform/offices"), p1.url());
  await p1.locator(`[data-workspace]:visible [role="tab"][data-ws-path="${officePath(O2.id)}"]`).click();
  await p1.locator('[role="dialog"] [data-office-name]').fill(`${O2.name} again ${run}`);
  closeAnswer = false;
  const before = (await tabs(p1)).length;
  await p1.locator(`[data-workspace]:visible [role="tab"][data-ws-path="${officePath(O2.id)}"]`).click({ button: "middle" });
  await p1.waitForTimeout(300);
  ok("T7 closing a tab with unsaved changes asks; No keeps it", (await tabs(p1)).length === before, await tabs(p1));
  closeAnswer = true;
  await p1.locator(`[data-workspace]:visible [role="tab"][data-ws-path="${officePath(O2.id)}"] [data-ws-close]`).click();
  ok("T7 Yes closes it, drops its draft and shows the next tab", await until(async () => (await tabs(p1)).length === before - 1) && !(await p1.evaluate(() => Object.keys(sessionStorage).some((k) => k.startsWith("xr.draft.platform-office:")))), await tabs(p1));
  await p1.evaluate(() => { const s = JSON.parse(sessionStorage.getItem("xr.workspace.v1")!); for (let i = s.tabs.length; i < 12; i++) s.tabs.push({ id: `cap${i}`, path: `/platform/x${i}`, title: `Item ${i}` }); sessionStorage.setItem("xr.workspace.v1", JSON.stringify(s)); });
  await p1.reload(); await p1.locator('[data-workspace]:visible [role="tablist"]').waitFor({ timeout: 60_000 });
  await p1.locator(`[data-workspace]:visible [role="tab"][data-ws-path="/platform/offices"]`).click(); await officeRows(p1);
  await shown(p1).locator('nav[aria-label="My account"] a[href="/platform/security"]').click({ modifiers: ["Control"] });
  ok("T7 at 12 open items a 13th is refused with a clear message", (await tabs(p1)).length === 12 && /12 items are open/.test(await p1.locator("[data-workspace]:visible [data-ws-notice]").innerText().catch(() => "")), await tabs(p1));

  // T10: axe on the strip; keyboard; 375 px
  const ax = (await new AxeBuilder({ page: p1 }).include("[data-workspace]:not([hidden] *) [data-workspace-strip]").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze()).violations;
  ok("T10 axe (WCAG 2.2 A/AA) clean on the strip", ax.length === 0, ax.map((v) => `${v.id}: ${v.nodes[0]?.target}`));
  await p1.locator('[data-workspace]:visible [role="tab"][aria-selected="true"]').focus();
  const was = urlPath(p1);
  await p1.keyboard.press("ArrowRight");
  ok("T10 arrow keys move between tabs (ARIA tabs)", await until(async () => urlPath(p1) !== was), { was, now: urlPath(p1) });
  await p1.keyboard.press("Alt+PageUp");
  ok("T10 Alt+PageUp goes back a tab", await until(async () => urlPath(p1) === was), urlPath(p1));
  await ctx.close();
  const small = await context(375), ps = await page(small);
  await ps.goto(`${BASE}/platform/offices`); await officeRows(ps);
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
  ok("T9 a read that carries a version sends it as a strong ETag", read.headers.get("etag") === `"${read.body?.version}"`, read.headers.get("etag"));
  const wrongRoute = await api(T, "PUT", `/platform/staff/${sql(`select id from platform_staff where actor_id = 'user-O' limit 1`)}/office`, { officeId: null }, { "if-match": '"x"' });
  ok("T9 If-Match on a change that takes no version is 422 in words (never a silent pass)", wrongRoute.status === 422 && /does not take a version/.test(JSON.stringify(wrongRoute.body)), wrongRoute.body);
  const bad = await api(T, "PATCH", `/platform/offices/${O1.id}`, { name: "x" }, { "if-match": "*" });
  const differ = await api(T, "PATCH", `/platform/offices/${O1.id}`, { name: "x", version: "a" }, { "if-match": '"b"' });
  ok("T9 a malformed If-Match (\"*\") and a body version that differs from the header are 422; nothing written", bad.status === 422 && differ.status === 422 && officeName(O1.id) === S4, { bad: bad.status, differ: differ.status });
  const staleProfile = await api(T, "PUT", "/platform/firm/profile", { website: "https://pf31.example.ca" }, { "if-match": '"0000"' });
  ok("T9 the firm profile takes If-Match too: a stale one is 409", staleProfile.status === 409, staleProfile.status);
  ok("no page errors", errs.length === 0, errs.slice(0, 5));
} catch (e) { failed = 1; console.error("FAIL  the walk stopped:", e); } finally { await browser.close(); }
process.exit(summary() + failed ? 1 : 0);
