// PF-21s part 3 (concept screens/pf-21-complaints §6 qa journeys; brief lead-b-briefs/PF-21s.md rev 16.75): the
// complaints list, the record drawer and the read-only record page in a real browser against PF-21w's and PF-21v's real
// routes on the local stand-in (no fake API): DW1, DW2, DW5, DW6 (DW3, DW4 are part 4), each with a pass and a fail;
// the drawer's field errors and its two endings; keyboard-only; axe-core (WCAG 2.2 AA) on every state; no sideways page
// scroll and screenshots at 375, 1024, 1440 px. Seeds through the API (the Sample firms' staff). US$0.
//   zsh studio/tools/isolated.sh screens_pf21s 4571 start PLATFORM_IDENTITY=local && tsx studio/tests/check_pf21s_complaints_browser.ts 4571 xr_studio_screens_pf21s
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import { seedSampleFirms } from "../api/src/platform/seed-sample-firms.ts";
import { Complaint, Page as ComplaintPage, zonedToIso } from "../web/src/modules/platform/complaints/contract.ts";
import { client, recorder } from "./runtime/api.ts";
const { default: AxeBuilder } = createRequire(import.meta.url)("@axe-core/playwright") as typeof import("@axe-core/playwright");
const PORT = Number(process.argv[2] ?? 4571), DBNAME = process.argv[3] ?? "xr_studio_screens_pf21s";
const BASE = `http://localhost:${PORT}`, STUDIO = join(import.meta.dirname, "..");
const SHOTS = join(STUDIO, "..", "..", "product", "screens", "pf-21-complaints", "screenshots"); mkdirSync(SHOTS, { recursive: true });
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const NOT_FOUND = "We can't find this complaint. It may not exist, or it may not be one you can see.";
const { ok, summary } = recorder();
const { sql: rawSql } = client(PORT, DBNAME);
const sql = (q: string) => rawSql(q).split("\n")[0].trim();
const run = Date.now().toString(36);
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://xr_studio@127.0.0.1:54329/${DBNAME}`, options: "-c TimeZone=UTC" }) });
await seedSampleFirms(db); await db.$disconnect();
const staffOf = (actor: string) => { const [id, email, name] = sql(`select id || '|' || email || '|' || display_name from platform_staff where actor_id = '${actor}'`).split("|"); return { id, email, name }; };
const R = staffOf("user-R"), T = staffOf("user-T"), O = staffOf("user-O"), S = staffOf("user-S");   // Owner + CM; CM (record key only); Case Officer (no key); sample-solo's Owner
ok("PF-21s setup: the Sample firms' staff are seeded", !!R.id && !!T.id && !!O.id && !!S.id);
async function signIn(firmKey: string, email: string): Promise<string> {
  const r = await fetch(`${BASE}/api/platform/session/local`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ firmKey, email, secondStep: true }) });
  const b = await r.json() as { token?: string; detail?: string }; if (b.token) return b.token;
  throw new Error(`STOP  local sign-in refused for ${email} (start the copy with PLATFORM_IDENTITY=local): ${b.detail}`);
}
const call = async (tok: string, method: string, path: string, body?: unknown) => {
  const r = await fetch(`${BASE}/api/platform/complaints${path}`, { method, headers: { authorization: `Bearer ${tok}`, ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => null) as unknown };
};
const ago = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();
const rTok = await signIn("sample-firm", R.email), sTok = await signIn("sample-solo", S.email);
const record = async (tok: string, name: string, handler: string, receivedAt: string) => {
  const r = await call(tok, "POST", "", { subjectKind: "OTHER_PERSON", complainantName: name, receivedAt, channel: "EMAIL", category: "FEES", summary: `Sample complaint ${name}.`, handlerStaffId: handler });
  if (r.status !== 201 && r.status !== 200) throw new Error(`record refused: ${JSON.stringify(r.body)}`);
  return Complaint.parse(r.body).id;
};
const late = await record(rTok, `Person Late ${run}`, R.id, ago(10));
const fresh = await record(rTok, `Person Fresh ${run}`, T.id, ago(0.01));
const acked = await record(rTok, `Person Acked ${run}`, R.id, ago(10));
const ack = await call(rTok, "POST", `/${acked}/acknowledge`, { at: ago(9) });
const closed = await record(rTok, `Person Closed ${run}`, T.id, ago(3));
const shut = await call(rTok, "POST", `/${closed}/close`, { outcome: "WITHDRAWN", at: ago(0.005), note: "Withdrawn by the person (Sample)." });
const other = await record(sTok, `Person Other Firm ${run}`, S.id, ago(1));
ok("PF-21s setup: five complaints recorded through PF-21w (one in the other firm), one acknowledged, one closed", ack.status === 200 && shut.status === 200 && !!other, { ack: ack.status, shut: shut.status });

// Break m1: a time typed in the firm's zone keeps its wall time next to a clock change (Toronto: 8 Mar and 1 Nov 2026).
ok("PF-21s drawer time: 03:30 on the spring-forward day is 07:30Z and 12:00 on the fall-back day is 17:00Z", zonedToIso("2026-03-08T03:30", "America/Toronto") === "2026-03-08T07:30:00.000Z" && zonedToIso("2026-11-01T12:00", "America/Toronto") === "2026-11-01T17:00:00.000Z",
  [zonedToIso("2026-03-08T03:30", "America/Toronto"), zonedToIso("2026-11-01T12:00", "America/Toronto")]);
ok("PF-21s drawer time fail: a summer time is not read with winter's offset (14:00 on 10 Jul 2026 is 18:00Z, not 19:00Z)", zonedToIso("2026-07-10T14:00", "America/Toronto") === "2026-07-10T18:00:00.000Z");
const browser: Browser = await chromium.launch({ headless: true, ...(process.platform === "darwin" ? { channel: "chrome" } : existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {}) });
const errors: string[] = [], calls: string[] = [];
async function newPage(tok: string, width = 1440): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: "light", reducedMotion: "reduce" }), p = await ctx.newPage();
  await ctx.addInitScript((t) => { if (!sessionStorage.getItem("xr-staff-session")) sessionStorage.setItem("xr-staff-session", JSON.stringify({ token: t, expiresAt: Date.now() + 3_600_000 })); }, tok);
  p.on("pageerror", (e) => errors.push(String(e)));
  p.on("request", (r) => { const u = new URL(r.url()); if (u.pathname.startsWith("/api/")) calls.push(`${r.method()} ${u.pathname}`); });
  return p;
}
const axe = async (name: string, p: Page) => { const r = await new AxeBuilder({ page: p }).withTags(TAGS).analyze();
  const bad = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  ok(`${name}: axe finds no serious or critical WCAG A/AA violation`, bad.length === 0, bad.map((v) => `${v.id}: ${v.nodes[0]?.target?.join(" ")}`).join(" | ") || undefined); };
const noSideways = async (name: string, p: Page) => ok(`${name}: no sideways page scroll`, await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
const shot = (p: Page, name: string) => p.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true });
const listed = (p: Page) => p.locator("[data-complaint-row], [data-empty]").first().waitFor({ timeout: 30_000 });
const rowOf = (p: Page, id: string) => p.locator(`[data-complaint-row="${id}"]`);
/** The row, after Show more until it is loaded (a reused copy may hold more than one page). */
const findRow = async (p: Page, id: string) => { while (!(await rowOf(p, id).count()) && await p.getByRole("button", { name: "Show more" }).count()) { const n = await p.locator("[data-complaint-row]").count(); await p.getByRole("button", { name: "Show more" }).click(); await p.waitForFunction((k) => document.querySelectorAll("[data-complaint-row]").length > k, n); } return rowOf(p, id); };
const chip = async (p: Page, view: string) => { await p.locator(`[data-chip="${view}"]`).click(); await p.locator(`[data-shown-view="${view}"]`).waitFor({ timeout: 30_000 });   // the rows of that view, not the last view's or a gap between them (CI shard 6, c94625b1e)
  ok(`PF-21s: the ${view} chip is kept in the address`, new URL(p.url()).searchParams.get("view") === (view === "open" ? null : view)); };
try {
// ------------------------------------------------------------------------------------------------------------- DW1
const o = await newPage(rTok);
await o.goto(`${BASE}/platform/complaints`); await listed(o);
await o.locator('[data-chip="all"] [data-count]').filter({ hasNotText: "…" }).waitFor({ timeout: 15_000 });
for (const view of ["open", "overdue", "closed", "all"]) {
  if (view !== "open") await chip(o, view);
  const shown = await o.locator(`[data-chip="${view}"] [data-count]`).innerText();
  const api = ComplaintPage.parse((await call(rTok, "GET", `?view=${view}`)).body);
  const rows = await o.locator("[data-complaint-row]").count();
  const partial = !!ComplaintPage.parse((await call(rTok, "GET", "?view=all")).body).next;
  ok(`PF-21s DW1 pass: Owner's ${view} chip count equals the rows under the view (${shown || "no number: past one page"})`, partial ? (view === "all" ? shown === "100+" : shown === "") : shown === String(rows) && rows === api.items.length && !api.next, { shown, rows, api: api.items.length, partial });
}
await chip(o, "open");
ok("PF-21s DW1 fail: a closed complaint is absent from Open and present under Closed", (await (await findRow(o, fresh)).count()) === 1 && (await (await findRow(o, closed)).count()) === 0);
await chip(o, "closed");
ok("PF-21s DW1: the closed complaint shows under Closed with its Closed status", (await (await findRow(o, closed)).locator('[data-status="Closed"]').count()) === 1);
ok("PF-21s DW1: the view is kept in the address (?view=closed) and on reload", (await o.reload(), await listed(o), (await o.locator('[data-chip="closed"]').getAttribute("aria-pressed")) === "true"));
ok("PF-21s DW1: the Owner sees the subtitle for every complaint and Record a complaint", (await o.getByText("Every complaint made to the firm").count()) === 1 && (await o.locator("[data-record-open]").count()) === 1);

// ------------------------------------------------------------------------------------------------------------- DW6
await chip(o, "open");
const lateRow = await findRow(o, late), ackRow = await findRow(o, acked);
const lateText = await lateRow.locator("[data-days-left]").innerText().catch(() => "");
const warnOf = (p: Page, sel: string) => p.locator(sel).first().evaluate((el) => getComputedStyle(el).color);
const probe = await o.evaluate(() => { const s = document.createElement("span"); s.className = "text-text-warn"; document.body.append(s); const c = getComputedStyle(s).color; s.remove(); return c; });
ok("PF-21s DW6 pass: the overdue row shows \"!\" Overdue in the needs-you colour and \"N business days late\"",
  (await lateRow.locator('[data-status="Overdue"]').innerText()).includes("!") && /^\d+ business days? late$/.test(lateText)
  && (await warnOf(o, `[data-complaint-row="${late}"] [data-status] > span`)) === probe && (await warnOf(o, `[data-complaint-row="${late}"] [data-days-left]`)) === probe, { lateText, probe });
ok("PF-21s DW6 fail: the acknowledged row is plain Open, never overdue or late", (await ackRow.locator('[data-status="Open"]').count()) === 1 && (await ackRow.locator("[data-days-left]").count()) === 0 && (await ackRow.innerText()).includes("Acknowledged"));
ok("PF-21s DW6: a fresh complaint shows its business days left, not late", /business days? left|due today/.test(await (await findRow(o, fresh)).locator("[data-days-left]").innerText()));
await chip(o, "overdue");
ok("PF-21s DW6: Overdue holds the late complaint and not the acknowledged one", (await (await findRow(o, late)).count()) === 1 && (await (await findRow(o, acked)).count()) === 0);
await axe("PF-21s list, Overdue (1440)", o);
// The record page: the overdue line, facts and the timeline, newest first.
await o.goto(`${BASE}/platform/complaints/${late}`); await o.locator("[data-complaint]").waitFor({ timeout: 20_000 });
ok("PF-21s DW6: the record page says Needs you with the days late", /Needs you/.test(await o.locator("body").innerText()) && (await o.getByText(/business days? late/).count()) >= 1);
await o.goto(`${BASE}/platform/complaints/${closed}`); await o.locator("[data-complaint]").waitFor({ timeout: 20_000 });
const kinds = await o.locator("[data-event]").evaluateAll((els) => els.map((e) => e.getAttribute("data-event")));
ok("PF-21s record page: a closed complaint shows its outcome and the timeline newest first (Closed, then Received)", kinds[0] === "CLOSED" && kinds[kinds.length - 1] === "RECEIVED" && (await o.getByText(/outcome: Withdrawn/).count()) === 1, kinds);
await axe("PF-21s record page, closed (1440)", o); await shot(o, "record-closed-1440");

// ------------------------------------------------------------------------------------------------------------- DW2
const tTok = await signIn("sample-firm", T.email);
const t = await newPage(tTok);
await t.goto(`${BASE}/platform/complaints?view=all`); await listed(t);
const tIds = await t.locator("[data-complaint-row]").evaluateAll((els) => els.map((e) => e.getAttribute("data-complaint-row")));
const handlers = await t.locator("[data-complaint-row] td:nth-child(5)").allInnerTexts();
ok("PF-21s DW2 pass: a Case Manager handler sees only complaints they handle (their two, every handler cell theirs)", tIds.includes(fresh) && tIds.includes(closed) && handlers.every((h) => h.trim() === T.name), { handlers: [...new Set(handlers)] });
ok("PF-21s DW2 fail: someone else's complaint is not in their list", !tIds.includes(late) && !tIds.includes(acked));
ok("PF-21s DW2: their subtitle reads \"Complaints you handle.\" and the record key shows Record a complaint", (await t.getByText("Complaints you handle.").count()) === 1 && (await t.locator("[data-record-open]").count()) === 1);
await t.goto(`${BASE}/platform/complaints/${late}`); await t.locator("[data-not-found]").waitFor({ timeout: 20_000 });
ok("PF-21s DW2: another's complaint id opens Not found for them", (await t.getByText(NOT_FOUND).count()) === 1 && (await t.getByText(`Person Late ${run}`).count()) === 0);

// ------------------------------------------------------------------------------------------------------------- DW5
const words: string[] = [];
for (const [label, page, id] of [["another firm's", o, other], ["a nonexistent", o, "0b9e3c4e-1f6a-4c1d-9b8e-123456789abc"], ["a malformed", o, "not-an-id"]] as const) {
  await page.goto(`${BASE}/platform/complaints/${id}`); await page.locator("[data-not-found]").waitFor({ timeout: 20_000 });
  words.push(await page.locator("[data-not-found]").innerText());
  ok(`PF-21s DW5 pass: ${label} complaint id shows the not-found words`, (await page.getByText(NOT_FOUND).count()) === 1 && (await page.getByText(`Person Other Firm ${run}`).count()) === 0);
}
words.push(await t.locator("[data-not-found]").innerText());
ok("PF-21s DW5 fail: another firm's, a nonexistent and someone else's complaint read the same, word for word", new Set(words).size === 1, words);
await axe("PF-21s not found (1440)", o); await shot(o, "not-found-1440");
ok("PF-21s DW5: Back to Complaints leads to the list", (await o.getByRole("link", { name: "Back to Complaints" }).first().click(), await o.waitForURL(/\/platform\/complaints$/), true));

// ------------------------------------------------------------------------------------------- record drawer + keyboard
const k = await newPage(rTok);
await k.goto(`${BASE}/platform/complaints`); await listed(k);
await k.locator("[data-record-open]").focus(); await k.keyboard.press("Enter");
await k.locator("[data-record-drawer]").waitFor({ timeout: 10_000 });
ok("PF-21s drawer: opened by the keyboard, it starts on its first field and offers only \"Someone else\" without a linked id", (await k.evaluate(() => (document.activeElement as HTMLInputElement | null)?.value)) === "OTHER_PERSON" && (await k.locator('input[name="pf-kind"]').count()) === 1);
await k.getByLabel("Their name").fill(`Person Drawer ${run}`);
await k.getByRole("button", { name: "Record the complaint" }).click();
await k.getByText("There is a problem").waitFor({ timeout: 10_000 });
ok("PF-21s drawer fail: a missing channel, topic and summary show on each field with a summary, and the name typed is kept", (await k.locator("[data-record-drawer] [role=alert]").count()) >= 3 && (await k.getByLabel("Their name").inputValue()) === `Person Drawer ${run}`);
await axe("PF-21s drawer with field errors (1440)", k); await shot(k, "record-drawer-errors-1440");
await k.getByLabel("How it came").selectOption("PHONE"); await k.getByLabel("About", { exact: true }).selectOption("SERVICE");
await k.getByLabel("What it is about").fill("x".repeat(4000));
await k.getByLabel("What it is about").focus(); await k.keyboard.press("Tab"); await k.keyboard.press("Tab"); await k.keyboard.press("Tab");
ok("PF-21s keyboard: Tab from the last field reaches Record the complaint", (await k.evaluate(() => document.activeElement?.textContent?.trim())) === "Record the complaint");
await k.keyboard.press("Enter");
await k.waitForURL(/\/platform\/complaints\/[0-9a-f-]{36}$/, { timeout: 15_000 }); await k.locator("[data-complaint]").waitFor();
ok("PF-21s drawer pass: recorded for yourself it opens the new record, received by phone, 4,000 characters wrapped", (await k.locator("h1").innerText()) === `Person Drawer ${run}` && (await k.getByText("Phone").count()) >= 1);
await noSideways("PF-21s record page, long summary (1440)", k);
// Recorded by a Case Manager for another handler: they stay on the list with the toast (the record would 404 for them).
await t.goto(`${BASE}/platform/complaints`); await listed(t);
await t.locator("[data-record-open]").click(); await t.locator("[data-record-drawer]").waitFor();
await t.getByLabel("Their name").fill(`Person For R ${run}`); await t.getByLabel("How it came").selectOption("LETTER"); await t.getByLabel("About", { exact: true }).selectOption("CONDUCT");
await t.getByLabel("What it is about").fill("Sample."); await t.getByLabel("Handler").selectOption(R.id);
await t.getByRole("button", { name: "Record the complaint" }).click();
await t.getByText(`Complaint recorded. ${R.name} handles it.`).waitFor({ timeout: 15_000 });
ok("PF-21s drawer: a Case Manager recording for another handler stays on the list with \"Complaint recorded. {Handler} handles it.\"", /\/platform\/complaints$/.test(t.url()));
// Keyboard: from the list, a row's link opens the record by Enter.
await k.goto(`${BASE}/platform/complaints`); await listed(k);
await (await findRow(k, fresh)).getByRole("link").focus(); await k.keyboard.press("Enter");
await k.waitForURL(new RegExp(`/platform/complaints/${fresh}$`)); await k.locator("[data-complaint]").waitFor();
ok("PF-21s keyboard: Enter on a row's link opens that complaint", (await k.locator("h1").innerText()) === `Person Fresh ${run}`);

// ------------------------------------------------------------------------------------------ break M1, M2, M3 (fail first)
const fill = async (p: Page, name: string) => {
  await p.getByLabel("Their name").fill(name); await p.getByLabel("How it came").selectOption("EMAIL"); await p.getByLabel("About", { exact: true }).selectOption("FEES");
  await p.getByLabel("What it is about").fill("Sample.");
};
const posts = () => calls.filter((x) => x === "POST /api/platform/complaints").length;
const d = await newPage(rTok);
await d.goto(`${BASE}/platform/complaints`); await listed(d);
await d.locator("[data-record-open]").click(); await d.locator("[data-record-drawer]").waitFor(); await fill(d, `Person Double ${run}`);
const before = posts();
await d.getByRole("button", { name: "Record the complaint" }).dblclick();
await d.waitForURL(/\/platform\/complaints\/[0-9a-f-]{36}$/, { timeout: 15_000 }); await d.waitForTimeout(800);
const doubles = ComplaintPage.parse((await call(rTok, "GET", "?view=all&limit=100")).body).items.filter((x) => x.complainantName === `Person Double ${run}`).length;
ok("PF-21s break M1: a double click on Record the complaint sends one POST and records one complaint", posts() - before === 1 && doubles === 1, { posts: posts() - before, doubles });
// M2: past one page (`next` set), no chip says "0+"; All reads "100+" (concept G1).
const m2 = await newPage(rTok);
await m2.route(/\/api\/platform\/complaints\?view=all$/, async (r) => { const res = await r.fetch(); const b = await res.json(); await r.fulfill({ response: res, json: { ...b, next: "more" } }); });
await m2.goto(`${BASE}/platform/complaints`); await listed(m2);
await m2.locator('[data-chip="all"] [data-count]').filter({ hasNotText: "…" }).waitFor({ timeout: 15_000 });
const chipTexts = await m2.locator("[data-chip]").allInnerTexts();
ok("PF-21s break M2: past one page the All chip reads 100+ and no chip reads \"0+\"", (await m2.locator('[data-chip="all"]').innerText()).includes("100+") && chipTexts.every((x) => !/\b0\+/.test(x)), chipTexts);
// M3: the session ends while the drawer holds a typed complaint; after signing in again the draft is back, not recorded.
const m3 = await newPage(await signIn("sample-firm", T.email));
await m3.goto(`${BASE}/platform/complaints`); await listed(m3);
await m3.locator("[data-record-open]").click(); await m3.locator("[data-record-drawer]").waitFor(); await fill(m3, `Person Kept ${run}`);
await signIn("sample-firm", T.email);   // T signs in elsewhere: this tab's session ends on its next call
await m3.getByRole("button", { name: "Record the complaint" }).click();
await m3.locator("[data-signed-in-elsewhere]").waitFor({ timeout: 15_000 });
await m3.getByRole("button", { name: "Sign in again here" }).click();
await m3.getByLabel("Firm key").fill("sample-firm"); await m3.getByLabel("Work email").fill(T.email); await m3.getByRole("button", { name: "Sign in" }).click();
const back = await m3.locator("[data-record-drawer]").waitFor({ timeout: 15_000 }).then(() => true, () => false);
ok("PF-21s break M3: after the session ends mid-drawer and the person signs in again, the drawer is back with what they typed and says it was not recorded",
  back && (await m3.getByLabel("Their name").inputValue()) === `Person Kept ${run}` && (await m3.getByText("not recorded yet").count()) === 1);

// ------------------------------------------------------------------------------------------- empty, read-only, widths
const oTok = await signIn("sample-firm", O.email), c = await newPage(oTok);
await c.goto(`${BASE}/platform/complaints`); await listed(c);
const oHas = ComplaintPage.parse((await call(oTok, "GET", "?view=open")).body).items.length;   // a reused copy may give O one
ok("PF-21s empty: a Case Officer who handles none sees the empty words, and no Record button either way", (oHas > 0 || (await c.getByText("No open complaints that you handle.").count()) === 1) && (await c.locator("[data-record-open]").count()) === 0, { oHas });
await axe("PF-21s list, empty (1440)", c); await shot(c, "list-empty-1440");
const tr = await newPage(await signIn("sample-firm", T.email)); await tr.goto(`${BASE}/platform/complaints/${fresh}`); await tr.locator("[data-complaint]").waitFor();
ok("PF-21s record page: the handler is not shown the read-only reason on their own complaint", (await tr.locator("[data-read-only]").count()) === 0);
for (const w of [375, 1024, 1440]) {
  const p = await newPage(rTok, w);
  await p.goto(`${BASE}/platform/complaints?view=all`); await listed(p);
  await axe(`PF-21s list (${w} px)`, p); await noSideways(`PF-21s list (${w} px)`, p); await shot(p, `list-${w}`);
  await p.goto(`${BASE}/platform/complaints/${late}`); await p.locator("[data-complaint]").waitFor();
  await axe(`PF-21s record page (${w} px)`, p); await noSideways(`PF-21s record page (${w} px)`, p); await shot(p, `record-${w}`);
  if (w === 375) ok("PF-21s record page (375 px): the facts sit above the timeline", await p.evaluate(() => document.querySelector("#pf-facts")!.getBoundingClientRect().top < document.querySelector("#pf-events")!.getBoundingClientRect().top && document.querySelector("#pf-facts")!.getBoundingClientRect().left === document.querySelector("#pf-events")!.getBoundingClientRect().left));
}
const foreign = calls.filter((x) => !/^(GET|POST) \/api\/platform\/(me|complaints)(\/|\?|$)/.test(x) && !x.startsWith("GET /api/platform/complaints") && x !== "POST /api/platform/session/local");
ok("PF-21s: the pages call only PF-21's complaints routes and /api/platform/me (and the frame's sign-in card, break M3)", foreign.length === 0 && calls.length > 10, [...new Set(foreign)]);
ok("PF-21s: no page error in any browser", errors.length === 0, errors);
} finally { await browser.close(); }
process.exit(summary() ? 1 : 0);
