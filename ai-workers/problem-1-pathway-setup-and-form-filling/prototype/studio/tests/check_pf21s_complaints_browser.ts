// PF-21s part 3 (concept screens/pf-21-complaints §6 qa journeys; brief lead-b-briefs/PF-21s.md rev 16.75): the
// complaints list, the record drawer and the read-only record page in a real browser against PF-21w's and PF-21v's real
// routes on the local stand-in (no fake API): DW1, DW2, DW5, DW6, and part 4's acts DW3, DW4, DW7, DW8 (start sheet
// lead-b-briefs/wave1-registers.md), each with a pass and a fail;
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
import { canAct, Complaint, KEY, nowLocal, Page as ComplaintPage, zonedToIso } from "../web/src/modules/platform/complaints/contract.ts";
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
// PF-21j H6 (break M1): the page decides what to offer with the server's rule (contract.ts canAct): the record key, as
// the handler or with the read key too. A handler who lost the record key sees the read-only line, not the actions.
{ const me = (staffId: string, keys: string[]) => ({ staffId, keys }) as unknown as Parameters<typeof canAct>[0], c = { handlerStaffId: T.id };
  ok("PF-21j H6 pass: the page offers actions to a handler holding the record key, and to someone with both keys", canAct(me(T.id, [KEY.record]), c) && canAct(me(R.id, [KEY.record, KEY.read]), c));
  ok("PF-21j H6 fail: no action for a handler without the record key (none, or the read key alone)", !canAct(me(T.id, []), c) && !canAct(me(T.id, [KEY.read]), c));
  ok("PF-21j H6 fail: nor for someone with the record key alone who is not the handler", !canAct(me(O.id, [KEY.record]), c)); }
async function signIn(firmKey: string, email: string): Promise<string> {
  const r = await fetch(`${BASE}/api/platform/session/local`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ firmKey, email, secondStep: true }) });
  const b = await r.json() as { token?: string; detail?: string }; if (b.token) return b.token;
  throw new Error(`STOP  local sign-in refused for ${email} (start the copy with PLATFORM_IDENTITY=local): ${b.detail}`);
}
const call = async (tok: string, method: string, path: string, body?: unknown) => {
  const r = await fetch(`${BASE}/api/platform/complaints${path}`, { method, headers: { authorization: `Bearer ${tok}`, ...(body ? { "content-type": "application/json" } : {}), ...(method === "POST" && path === "" ? { "idempotency-key": crypto.randomUUID() } : {}) }, body: body ? JSON.stringify(body) : undefined });   // PF-21i: a fresh key per create
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
// PF-21i DW (Build Lead A on #2012): a Record whose answer is lost (it reached the server; the browser saw a failure) and
// pressed again stores one complaint: both presses send the drawer's one Idempotency-Key, the second gets the first's.
const lost = await newPage(rTok), keys: string[] = [];
let dropFirst = true;
await lost.route(/\/api\/platform\/complaints$/, async (r) => {
  if (r.request().method() !== "POST") return r.continue();
  keys.push(r.request().headers()["idempotency-key"] ?? "");
  if (dropFirst) { dropFirst = false; await r.fetch(); return r.abort("connectionreset"); }   // the server records it; the answer never arrives
  return r.continue();
});
await lost.goto(`${BASE}/platform/complaints`); await listed(lost);
await lost.locator("[data-record-open]").click(); await lost.locator("[data-record-drawer]").waitFor(); await fill(lost, `Person Lost ${run}`);
const dropped = lost.waitForEvent("requestfailed", { predicate: (r) => r.method() === "POST" && /\/api\/platform\/complaints$/.test(r.url()), timeout: 15_000 });
await lost.getByRole("button", { name: "Record the complaint" }).click();
await dropped;
await lost.locator("[data-record-drawer] button[aria-busy='true']").waitFor({ state: "detached", timeout: 15_000 });
const afterFirst = ComplaintPage.parse((await call(rTok, "GET", "?view=all&limit=100")).body).items.filter((x) => x.complainantName === `Person Lost ${run}`).length;
await lost.getByRole("button", { name: "Record the complaint" }).click();
await lost.waitForURL(/\/platform\/complaints\/[0-9a-f-]{36}$/, { timeout: 15_000 });
const lostCount = ComplaintPage.parse((await call(rTok, "GET", "?view=all&limit=100")).body).items.filter((x) => x.complainantName === `Person Lost ${run}`).length;
ok("PF-21i DW (browser) pass: Record pressed again after a lost answer stores one complaint and opens it (both presses carry the drawer's one key)",
  afterFirst === 1 && lostCount === 1 && keys.length === 2 && !!keys[0] && keys[0] === keys[1], { afterFirst, lostCount, keys });
// The record page is open; a new opening of the drawer gets a new key:
await lost.goto(`${BASE}/platform/complaints`); await listed(lost);
await lost.locator("[data-record-open]").click(); await lost.locator("[data-record-drawer]").waitFor(); await fill(lost, `Person Lost Two ${run}`);
await lost.getByRole("button", { name: "Record the complaint" }).click();
await lost.waitForURL(/\/platform\/complaints\/[0-9a-f-]{36}$/, { timeout: 15_000 });
ok("PF-21i DW (browser) fail→pass: a new opening of the drawer sends a new key (a second complaint is its own, never the first's answer)", keys.length === 3 && !!keys[2] && keys[2] !== keys[0], keys);
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

// ------------------------------------------------------------------------------- part 4: DW3, DW4, DW7, DW8 (actions)
const FORBIDDEN = "You can't change this complaint. Ask an Owner or Admin.";
const opened = async (p: Page, id: string) => { await p.goto(`${BASE}/platform/complaints/${id}`); await p.locator(`[data-complaint="${id}"]`).waitFor({ timeout: 20_000 }); };
const nextOf = (p: Page) => p.locator("[data-next-step]").getAttribute("data-next-step");
const eventsOf = (p: Page) => p.locator("[data-event]").evaluateAll((els) => els.map((e) => e.getAttribute("data-event")));
const panel = (p: Page, act: string) => p.locator(`[data-action-drawer="${act}"]`);
const actOpen = async (p: Page, act: string) => { await p.locator(`[data-act="${act}"]`).click(); await panel(p, act).waitFor({ timeout: 10_000 }); };
const submitOf = (p: Page) => p.locator('[role="dialog"] button[type="submit"]');
/** Submit the open panel and wait until it is gone and the timeline holds one more event. */
const saved = async (p: Page, act: string) => { const n = (await eventsOf(p)).length; await submitOf(p).click(); await panel(p, act).waitFor({ state: "detached", timeout: 15_000 });
  await p.waitForFunction((k) => document.querySelectorAll("[data-event]").length > k, n, { timeout: 15_000 }); };
const acts = (p: Page) => p.locator("[data-act]").evaluateAll((els) => els.map((e) => e.getAttribute("data-act")));
const postsTo = (suffix: string) => calls.filter((x) => x.startsWith("POST /api/platform/complaints/") && x.endsWith(suffix)).length;

// DW3: the one filled button walks acknowledge → step → response sent → close; a double click posts once; the timeline refreshes.
const walk = await record(rTok, `Person Walk ${run}`, R.id, ago(1));
const w3 = await newPage(rTok);
await opened(w3, walk);
const zone = (await call(rTok, "GET", `/${walk}`)).body as { firmTimeZone: string };
ok("PF-21s DW3: a new complaint's one filled button is Record the acknowledgement, with step, note, response and close beside it", (await nextOf(w3)) === "acknowledge"
  && JSON.stringify(await acts(w3)) === JSON.stringify(["acknowledge", "step", "note", "response", "close", "handler"]), await acts(w3));
await axe("PF-21s record page with the next-step bar (1440)", w3); await shot(w3, "record-next-step-1440");
await actOpen(w3, "acknowledge");
await axe("PF-21s acknowledgement panel (1440)", w3); await shot(w3, "action-acknowledge-1440");
const ackBefore = postsTo("/acknowledge"), evBefore = (await eventsOf(w3)).length;
await submitOf(w3).dblclick();
await panel(w3, "acknowledge").waitFor({ state: "detached", timeout: 15_000 });
await w3.waitForFunction((k) => document.querySelectorAll("[data-event]").length > k, evBefore, { timeout: 15_000 }); await w3.waitForTimeout(500);
const ackEvents = (await eventsOf(w3)).filter((x) => x === "ACKNOWLEDGED").length;
ok("PF-21s DW3 pass: a double click on Record the acknowledgement sends one POST, and the timeline shows it at the top", postsTo("/acknowledge") - ackBefore === 1 && ackEvents === 1 && (await eventsOf(w3))[0] === "ACKNOWLEDGED", { posts: postsTo("/acknowledge") - ackBefore, ackEvents });
ok("PF-21s DW3: after the acknowledgement the filled button is Add a handling step, and the panel returned focus to it", (await nextOf(w3)) === "step" && (await w3.evaluate(() => document.activeElement?.getAttribute("data-act"))) === "step");
await actOpen(w3, "step");
await submitOf(w3).click(); await w3.locator('[data-action-drawer="step"] [role=alert]').first().waitFor({ timeout: 10_000 });
ok("PF-21s DW3 fail: a step without its note is refused with the field error, and the panel stays open", (await w3.locator('[data-action-error]').innerText()).includes("Note") && (await panel(w3, "step").count()) === 1);
await w3.getByRole("textbox", { name: /^Note/ }).fill("Called the person to hear the details (Sample).");
await saved(w3, "step");
ok("PF-21s DW3: the step is on the timeline and the filled button is Record the response sent", (await eventsOf(w3))[0] === "STEP" && (await nextOf(w3)) === "response");
await actOpen(w3, "response");
await w3.getByLabel(/^When/).fill(nowLocal(zone.firmTimeZone, new Date(Date.now() - 2 * 3_600_000)));   // after receipt, before the acknowledgement
const resBefore = postsTo("/response-sent");
await submitOf(w3).click(); await w3.locator('[data-action-drawer="response"] [role=alert]').first().waitFor({ timeout: 10_000 });
ok("PF-21s DW3 fail: a response dated before the acknowledgement shows the server's field error on When, and what was typed is kept",
  (await w3.locator('[data-action-drawer="response"]').innerText()).includes("the response comes after the acknowledgement") && postsTo("/response-sent") - resBefore === 1 && (await w3.getByLabel(/^When/).inputValue()) !== "");
await axe("PF-21s response panel with a field error (1440)", w3); await shot(w3, "action-response-error-1440");
await w3.getByLabel(/^When/).fill(nowLocal(zone.firmTimeZone));
await saved(w3, "response");
ok("PF-21s DW3: the response is on the timeline and the filled button is Close with an outcome, with no response act left", (await eventsOf(w3))[0] === "RESPONSE_SENT" && (await nextOf(w3)) === "close" && !(await acts(w3)).includes("response"));
await actOpen(w3, "close");
await submitOf(w3).click(); await w3.locator('[data-action-drawer="close"] [role=alert]').first().waitFor({ timeout: 10_000 });
ok("PF-21s DW3 fail: closing without an outcome or a note shows both field errors", /Outcome/.test(await w3.locator("[data-action-error]").innerText()) && /Note/.test(await w3.locator("[data-action-error]").innerText()));
await w3.getByLabel("Resolved").check(); await w3.getByRole("textbox", { name: /^Note/ }).fill("Fee refunded; the person agreed (Sample).");
await saved(w3, "close");
ok("PF-21s DW3 pass: closed with an outcome, the page says Closed with the outcome, the timeline ends with Closed", (await w3.locator('[data-status="Closed"]').count()) === 1 && (await w3.getByText(/outcome: Resolved/).count()) === 1 && (await eventsOf(w3))[0] === "CLOSED");
// DW7: a closed complaint has no action buttons (Add a note only, the concept's "closed → none, Add a note only").
ok("PF-21s DW7 pass: a closed complaint shows no act but Add a note, and no Change handler", JSON.stringify(await acts(w3)) === JSON.stringify(["note"])
  && (await w3.getByRole("button", { name: /Record the acknowledgement|Add a handling step|Record the response sent|Close with an outcome|Change handler/ }).count()) === 0, await acts(w3));
await actOpen(w3, "note"); await w3.getByRole("textbox", { name: /^Note/ }).fill("The person wrote to thank the firm (Sample).");
await saved(w3, "note");
ok("PF-21s DW7: a note on a closed complaint is kept on its timeline, and it stays closed", (await eventsOf(w3))[0] === "NOTE" && (await w3.locator('[data-status="Closed"]').count()) === 1);
await axe("PF-21s record page, closed with the note act (1440)", w3);
const shutAgain = await call(rTok, "POST", `/${walk}/close`, { outcome: "UPHELD", at: new Date().toISOString(), note: "Again." });
ok("PF-21s DW7 fail: the server still refuses to close a closed complaint (409)", shutAgain.status === 409, shutAgain.status);
// A 409 shows in the page: the complaint is closed by someone else while the panel is open.
const race = await record(rTok, `Person Race ${run}`, R.id, ago(1));
await opened(w3, race); await actOpen(w3, "step"); await w3.getByRole("textbox", { name: /^Note/ }).fill("Sample.");
await call(rTok, "POST", `/${race}/close`, { outcome: "WITHDRAWN", at: new Date().toISOString(), note: "Withdrawn (Sample)." });
await submitOf(w3).click(); await w3.getByText("This complaint is closed. It was closed while you were working").waitFor({ timeout: 10_000 });
ok("PF-21s refused: a 409 shows the concept's words and the server's in the panel, not a toast alone, and the note typed is kept",
  (await w3.locator("[data-action-error]").innerText()).includes("add a note instead") && (await w3.getByRole("textbox", { name: /^Note/ }).inputValue()) === "Sample.");
// Review M1: after the 409 the page behind the panel is read again: Closed, with Add a note as its only act; the note
// typed for the refused step is carried into Add a note and saved there.
await w3.locator('[data-status="Closed"]').waitFor({ timeout: 10_000 });
ok("PF-21s review M1 pass: after a 409 for a closed complaint the page shows Closed with only Add a note, without a reload", JSON.stringify(await acts(w3)) === JSON.stringify(["note"]), await acts(w3));
await w3.locator("[data-carry-note]").click(); await panel(w3, "note").waitFor({ timeout: 10_000 });
ok("PF-21s review M1: Add it as a note carries the typed text into the note panel, which does not claim the session ended", (await w3.getByRole("textbox", { name: /^Note/ }).inputValue()) === "Sample." && (await w3.getByText("Your session ended").count()) === 0);
await saved(w3, "note");
ok("PF-21s review M1: the carried note is on the closed complaint's timeline", (await eventsOf(w3))[0] === "NOTE");
// Review M1 fail case: acknowledged in another tab while the panel is open: the 409's words show, and after Cancel the
// filled button has moved on (no second "Record the acknowledgement" that would only be refused again).
const twice = await record(rTok, `Person Twice ${run}`, R.id, ago(1));
await opened(w3, twice); await actOpen(w3, "acknowledge");
await call(rTok, "POST", `/${twice}/acknowledge`, { at: new Date(Date.now() - 60_000).toISOString() });
await submitOf(w3).click(); await w3.getByText("Already acknowledged").waitFor({ timeout: 10_000 });
await w3.locator('[data-next-step="step"]').waitFor({ timeout: 10_000 });
await w3.getByRole("button", { name: "Cancel" }).click(); await panel(w3, "acknowledge").waitFor({ state: "detached", timeout: 10_000 });
ok("PF-21s review M1 fail: acknowledged elsewhere, the page moves on to Add a handling step and offers no acknowledgement act", (await nextOf(w3)) === "step" && !(await acts(w3)).includes("acknowledge") && (await eventsOf(w3))[0] === "ACKNOWLEDGED");
// Review m1: response sent without a step: the filled button is Close (steps are never required).
await actOpen(w3, "response"); await saved(w3, "response");
ok("PF-21s review m1: acknowledged and answered with no step, the filled button is Close with an outcome", (await nextOf(w3)) === "close" && (await acts(w3)).includes("step"), await acts(w3));
// Review R1: a browser clock 2 seconds ahead of the server's still saves the untouched default (cut to the minute,
// never before receipt): the acknowledgement and the close. Not started in a minute's first seconds, where the cut
// minute is the one now beginning.
const skew = await record(rTok, `Person Skew ${run}`, R.id, ago(1));
while (new Date().getSeconds() < 4 || new Date().getSeconds() > 50) await new Promise((r) => setTimeout(r, 500));
const sk = await newPage(rTok);
await opened(sk, skew); await sk.clock.setSystemTime(Date.now() + 2_000);
await actOpen(sk, "acknowledge"); await saved(sk, "acknowledge");
await actOpen(sk, "close"); await sk.getByLabel("Resolved").check(); await sk.getByRole("textbox", { name: /^Note/ }).fill("Sample."); await saved(sk, "close");
ok("PF-21s review R1: with the browser's clock 2 s ahead, the default dates of the acknowledgement and the close are accepted", JSON.stringify(await eventsOf(sk)) === JSON.stringify(["CLOSED", "ACKNOWLEDGED", "RECEIVED"]), await eventsOf(sk));
// Break m1: a complaint received seconds ago takes its acknowledgement at the default date (not cut to before receipt).
const secs = await record(rTok, `Person Seconds ${run}`, R.id, new Date(Date.now() - 2_000).toISOString());
await opened(w3, secs); await actOpen(w3, "acknowledge"); await saved(w3, "acknowledge");
ok("PF-21s break m1: received 2 seconds ago, the default date of the acknowledgement is accepted", (await eventsOf(w3))[0] === "ACKNOWLEDGED");
// Break m5a: Escape from a quiet act's panel returns focus to that act's button.
await w3.locator('[data-act="close"]').focus(); await w3.keyboard.press("Enter"); await panel(w3, "close").waitFor();
await w3.keyboard.press("Escape"); await panel(w3, "close").waitFor({ state: "detached", timeout: 10_000 });
// Radix returns focus a tick after the panel goes: wait up to 3 s for it to land on the close button, then judge.
const m5aBack = await w3.waitForFunction(() => document.activeElement?.getAttribute("data-act") === "close", undefined, { timeout: 3_000 }).then(() => true, () => false);
const m5aFocus = await w3.evaluate(() => document.activeElement?.getAttribute("data-act") ?? document.activeElement?.outerHTML.slice(0, 80));
ok("PF-21s break m5a: Escape from Close with an outcome returns focus to its own button, not the filled one", m5aBack && m5aFocus === "close", m5aFocus);
// Break m2a: answered before any acknowledgement, the filled button is Close; the acknowledgement stays a quiet act.
const early = await record(rTok, `Person Early ${run}`, R.id, ago(2));
await call(rTok, "POST", `/${early}/response-sent`, { at: ago(1) });
await opened(w3, early);
ok("PF-21s break m2a pass: response sent before any acknowledgement, the filled button is Close with an outcome", (await nextOf(w3)) === "close" && (await acts(w3)).includes("acknowledge"), await acts(w3));
ok("PF-21s break m2a fail: the filled button is not Record the acknowledgement, whose default date the service refuses", (await w3.locator('[data-next-step="acknowledge"]').count()) === 0);
// Closed straight after receipt as Withdrawn, from the quiet act (no acknowledgement, no step).
const quick = await record(rTok, `Person Quick ${run}`, R.id, ago(0.02));
await opened(w3, quick); await actOpen(w3, "close"); await w3.getByLabel("Withdrawn").check(); await w3.getByRole("textbox", { name: /^Note/ }).fill("Withdrawn the same day (Sample).");
await saved(w3, "close");
ok("PF-21s DW3: a complaint closes straight after receipt as Withdrawn from the quiet Close act", (await w3.getByText(/outcome: Withdrawn/).count()) === 1 && JSON.stringify(await eventsOf(w3)) === JSON.stringify(["CLOSED", "RECEIVED"]));

// Keyboard only: from the record page's filled button through the panel to the saved acknowledgement.
const kb = await record(rTok, `Person Keys ${run}`, R.id, ago(1));
await opened(k, kb);
await k.locator('[data-act="acknowledge"]').focus(); await k.keyboard.press("Enter"); await panel(k, "acknowledge").waitFor();
ok("PF-21s keyboard: Enter on the filled button opens its panel on its first field", (await k.evaluate(() => (document.activeElement as HTMLInputElement | null)?.type)) === "datetime-local");
for (let i = 0; i < 20 && (await k.evaluate(() => document.activeElement?.textContent?.trim())) !== "Record the acknowledgement"; i++) await k.keyboard.press("Tab");
await k.keyboard.press("Enter"); await panel(k, "acknowledge").waitFor({ state: "detached", timeout: 15_000 });
await k.waitForFunction(() => document.querySelector("[data-next-step]")?.getAttribute("data-next-step") === "step", undefined, { timeout: 15_000 });
ok("PF-21s keyboard: the acknowledgement is saved by Tab and Enter alone, and focus lands on the next filled button", (await k.evaluate(() => document.activeElement?.getAttribute("data-act"))) === "step");

// DW4: Change handler hidden for a Case Manager on their own complaint; shown for the Owner, picker from GET /handlers.
const t4Tok = await signIn("sample-firm", T.email);   // a session of its own: the break M3 checks ended T's earlier ones
const moved = await record(rTok, `Person Moved ${run}`, T.id, ago(1));
const tw = await newPage(t4Tok);
await opened(tw, moved);
ok("PF-21s DW4 pass: a Case Manager on their own complaint has the acts but no Change handler", (await acts(tw)).includes("acknowledge") && !(await acts(tw)).includes("handler"), await acts(tw));
const forced = await call(t4Tok, "POST", `/${moved}/handler`, { handlerStaffId: R.id });
ok("PF-21s DW4 fail: a forced POST /:id/handler as the Case Manager is refused (403)", forced.status === 403, forced.status);
// Forced through the page: /me answers with the read key too, so the link shows; the server's 403 shows in the panel.
const tf = await newPage(t4Tok);
await tf.route(/\/api\/platform\/me$/, async (r) => { const res = await r.fetch(); const b = await res.json() as { keys: string[] }; await r.fulfill({ response: res, json: { ...b, keys: [...b.keys, "agent/complaint:read"] } }); });
await opened(tf, moved); await actOpen(tf, "handler");
await tf.getByLabel("New handler").selectOption(R.id); await submitOf(tf).click();
await tf.getByText(FORBIDDEN).waitFor({ timeout: 10_000 });
const refusedText = await tf.locator("[data-action-error]").innerText(), serverWords = (forced.body as { detail?: string }).detail ?? "";
ok("PF-21s DW4 fail: forced in the page, the server's 403 shows in the panel with its own words", !!serverWords && refusedText.includes(serverWords) && (await panel(tf, "handler").count()) === 1, { refusedText, serverWords });
await axe("PF-21s change handler refused (1440)", tf); await shot(tf, "action-handler-refused-1440");
// The Owner sees Change handler; its picker is GET /handlers' active staff, without the present handler.
const ow = await newPage(rTok);
await opened(ow, moved); await actOpen(ow, "handler");
const active = (await call(rTok, "GET", "/handlers")).body as { items: { id: string }[] };
await ow.locator('[data-action-drawer="handler"] select option[value]:not([value=""])').first().waitFor({ state: "attached", timeout: 10_000 });
const offered = await ow.locator('[data-action-drawer="handler"] select option').evaluateAll((els) => els.map((e) => (e as HTMLOptionElement).value).filter(Boolean));
const inactive = sql(`select count(*) from platform_staff where firm_id = (select firm_id from platform_staff where id = '${R.id}') and status <> 'ACTIVE' and id in (${offered.map((x) => `'${x}'`).join(",") || "''"})`);
ok("PF-21s DW4 pass: the Owner's picker lists GET /handlers' active staff, without the present handler, and no inactive one",
  JSON.stringify(offered) === JSON.stringify(active.items.map((x) => x.id).filter((x) => x !== T.id)) && inactive === "0", { offered: offered.length, active: active.items.length, inactive });
ok("PF-21j fail: the picker does not offer the Case Officer (no agent/complaint:record)", !offered.includes(O.id), offered);
await axe("PF-21s change handler panel (1440)", ow);
// DW8: the old handler's open panel, after the handler is changed, saves to the not-found words; nothing of it stays.
await actOpen(tw, "step"); await tw.getByRole("textbox", { name: /^Note/ }).fill("Sample step.");
// PF-21j: the new handler must be someone who may record complaints; the Case Officer (O) is no longer offered, so the
// Owner (R) takes it over.
await ow.getByLabel("New handler").selectOption(R.id); await saved(ow, "handler");
ok("PF-21s DW4: the Owner's change is on the timeline with both names", (await eventsOf(ow))[0] === "HANDLER_CHANGED" && (await ow.getByText(`From ${T.name} to ${R.name}.`).count()) === 1 && (await ow.locator("[data-handler]").innerText()) === R.name);
await submitOf(tw).click(); await tw.locator("[data-not-found]").waitFor({ timeout: 15_000 });
const lostWords = await tw.locator("[data-not-found]").innerText();
ok("PF-21s DW8 pass: the old handler's save shows Not found with part 3's DW5 words, word for word", lostWords === words[0], { lostWords });
ok("PF-21s break m5b: focus lands on the not-found heading, not on the page body", (await tw.evaluate(() => document.activeElement?.tagName)) === "H1");
ok("PF-21s DW8 fail: nothing of the complaint stays on their screen, and Back to Complaints is offered", (await tw.getByText(`Person Moved ${run}`).count()) === 0 && (await tw.locator("[data-complaint]").count()) === 0 && (await tw.getByRole("link", { name: "Back to Complaints" }).count()) >= 1);
await opened(ow, moved);
ok("PF-21s DW8: the old handler's step was never recorded", !(await eventsOf(ow)).includes("STEP"));

// Break M3 for an act: the session ends while a panel holds a typed step; after signing in again it is back, unsaved.
const keep = await record(rTok, `Person Keep Act ${run}`, T.id, ago(1));
const m4 = await newPage(await signIn("sample-firm", T.email));
await opened(m4, keep); await actOpen(m4, "step"); await m4.getByRole("textbox", { name: /^Note/ }).fill(`Kept step ${run}`);
await signIn("sample-firm", T.email);
await submitOf(m4).click(); await m4.locator("[data-signed-in-elsewhere]").waitFor({ timeout: 15_000 });
await m4.getByRole("button", { name: "Sign in again here" }).click();
await m4.getByLabel("Firm key").fill("sample-firm"); await m4.getByLabel("Work email").fill(T.email); await m4.getByRole("button", { name: "Sign in" }).click();
const backAct = await panel(m4, "step").waitFor({ timeout: 15_000 }).then(() => true, () => false);
ok("PF-21s break M3 (acts): after the session ends mid-panel and the person signs in again, the step panel is back with the note and says it was not saved",
  backAct && (await m4.getByRole("textbox", { name: /^Note/ }).inputValue()) === `Kept step ${run}` && (await m4.getByText("not saved yet").count()) === 1);
ok("PF-21s break M3 (acts) fail: nothing was recorded while the session was ended", !(((await call(rTok, "GET", `/${keep}`)).body as { events: { kind: string }[] }).events.some((e) => e.kind === "STEP")));
// Break m3: a Close panel kept across an ended session is not reopened once the complaint was closed meanwhile.
const gone = await record(rTok, `Person Gone ${run}`, T.id, ago(1));
const m5 = await newPage(await signIn("sample-firm", T.email));
await opened(m5, gone); await actOpen(m5, "close"); await m5.getByLabel("Resolved").check(); await m5.getByRole("textbox", { name: /^Note/ }).fill("Sample.");
await signIn("sample-firm", T.email);
await submitOf(m5).click(); await m5.locator("[data-signed-in-elsewhere]").waitFor({ timeout: 15_000 });
await call(rTok, "POST", `/${gone}/close`, { outcome: "WITHDRAWN", at: new Date().toISOString(), note: "Withdrawn (Sample)." });
await m5.getByRole("button", { name: "Sign in again here" }).click();
await m5.getByLabel("Firm key").fill("sample-firm"); await m5.getByLabel("Work email").fill(T.email); await m5.getByRole("button", { name: "Sign in" }).click();
await m5.locator('[data-status="Closed"]').waitFor({ timeout: 15_000 }); await m5.waitForTimeout(500);
ok("PF-21s break m3: closed while the session was ended, the restored Close panel is not opened; only Add a note is offered", (await panel(m5, "close").count()) === 0 && JSON.stringify(await acts(m5)) === JSON.stringify(["note"]));
for (const wd of [375, 1024]) {
  const p = await newPage(rTok, wd);
  await opened(p, kb); await actOpen(p, "step");
  await axe(`PF-21s step panel (${wd} px)`, p); await noSideways(`PF-21s step panel (${wd} px)`, p); await shot(p, `action-step-${wd}`);
}

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
const foreign = calls.filter((x) => !/^(GET|POST) \/api\/platform\/(me|complaints)(\/|\?|$)/.test(x) && !x.startsWith("GET /api/platform/complaints") && x !== "POST /api/platform/session/local" && x !== "GET /api/platform/billing/banner");   // PF-16: the frame's trial banner read (Owner and Admin)
ok("PF-21s: the pages call only PF-21's complaints routes and /api/platform/me (and the frame's sign-in card, break M3, and its trial banner read, PF-16)", foreign.length === 0 && calls.length > 10, [...new Set(foreign)]);
ok("PF-21s: no page error in any browser", errors.length === 0, errors);
} finally { await browser.close(); }
process.exit(summary() ? 1 : 0);
