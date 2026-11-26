// R1.79 part 4 (BACKLOG PF-R3; concept product/screens/pf-r3-reports/concept-draft.md r2, approved by Lead 5 on #3849): the
// firm's Reports page, walked in a browser on an isolated copy (its own database and port, never :4400), with the API read
// underneath. Named "PF-R3 BR<n>" (a pass and a fail each, the concept's §6 list) and "PF-R3 row" (the row's checks):
//   BR-1 each card shows its own scope; BR-2 the dashboard by role, and ?dashboard= falls back; BR-3 the filters live in the
//   address and a viewer without view.all never sends a person; BR-4 CAD and USD apart; BR-5 each card's words are its
//   answer's source; BR-6 empty, not counted yet and unavailable say why; BR-7 export: the button only with the key and an
//   OK table, one audit line per export, none for a refusal; BR-8 no figure links.
// Money rows are written with the replica role (Sample values, dated this month in the firm's zone). US$0, no model call.
// Screenshots (deviceScaleFactor 1) in product/screens/pf-r3-reports/screenshots/. Run from prototype/:
//   zsh studio/tools/isolated.sh pfr3 4731 start AI_LIVE=off PLATFORM_IDENTITY=local && tsx studio/tests/check_pfr3_reports_browser.ts 4731 xr_studio_pfr3
import "reflect-metadata";
import { existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { chromium, type Browser, type Page } from "playwright";
import { seedSampleFirms } from "../api/src/platform/seed-sample-firms.ts";
import { csvOf } from "../api/src/platform/reports/export.ts";
import { client, recorder } from "./runtime/api.ts";
const { default: AxeBuilder } = createRequire(import.meta.url)("@axe-core/playwright") as typeof import("@axe-core/playwright");

const [PORT, DBNAME] = [Number(process.argv[2] ?? 4731), process.argv[3] ?? "xr_studio_pfr3"];
if (PORT === 4400 || DBNAME === "xr_studio_demo") { console.log("refused: never the demo on :4400"); process.exit(2); }
const BASE = `http://localhost:${PORT}`, STUDIO = join(import.meta.dirname, "..");
const SHOTS = join(STUDIO, "..", "..", "product", "screens", "pf-r3-reports", "screenshots"); mkdirSync(SHOTS, { recursive: true });
const { ok, summary } = recorder();
const { sql: rawSql } = client(PORT, DBNAME);
/** One value: the first line psql prints that is not a command tag ("SET", "INSERT 0 1"). */
const sql = (q: string) => (rawSql(q) ?? "").split("\n").map((x) => x.trim()).filter((x) => x && !/^(SET|INSERT \d+ \d+|UPDATE \d+|DELETE \d+)$/.test(x))[0] ?? "";
const run = Date.now().toString(36);
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://xr_studio@127.0.0.1:54329/${DBNAME}`, options: "-c TimeZone=UTC" }) });
type Ans = { status: number; body: any; text: string; headers: Headers };   // eslint-disable-line @typescript-eslint/no-explicit-any -- API answers are read loosely, as in the other checks
const api = async (t: string | null, method: string, path: string, body?: unknown): Promise<Ans> => {
  const r = await fetch(`${BASE}/api${path}`, { method, headers: { "content-type": "application/json", ...(t ? { authorization: `Bearer ${t}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text(); let j: unknown = null; try { j = JSON.parse(text); } catch { /* CSV or text */ }
  return { status: r.status, body: j, text, headers: r.headers };
};
let failed = 0;
// break r2-m4: a label shaped like an amount stays text (guarded); an amount in a later column and a number are written as they are
ok("PF-R3 BR7 pass (break r2-m4): the CSV writes a label that looks like an amount as guarded text, and amounts and numbers as they are",
  csvOf([{ stage: "-5.00", cases: -3, average_days: "-1.50" }]) === "\uFEFFStage,Cases,Average days\r\n'-5.00,-3,-1.50\r\n", csvOf([{ stage: "-5.00", cases: -3, average_days: "-1.50" }]));

await seedSampleFirms(db);
const A = sql(`select id from platform_firm where key = 'sample-firm'`);
// a fresh copy only: a second run would count the first run's invoices too (review minor)
if (sql(`select count(*) from money_invoice where number like 'PFR3-%'`) !== "0") { console.log("STOP  this copy already holds PF-R3's rows: start a fresh copy"); process.exit(2); }
const signIn = async (firmKey: string, who: { actorId?: string; email?: string }): Promise<string> => {
  const r = await api(null, "POST", "/platform/session/local", { firmKey, ...who, secondStep: true });
  if (r.body?.token) return r.body.token as string;
  throw new Error(`sign-in refused: ${r.text.slice(0, 200)}`);
};
const TR = await signIn("sample-firm", { actorId: "user-R" }), TO = await signIn("sample-firm", { actorId: "user-O" });
// a Case Manager colleague (report view.all and export, no view-financial), labelled test data
const cm = await db.platformStaff.create({ data: { firmId: A, actorId: `pfr3-cm-${run}`, email: `pfr3-cm-${run}@sample.invalid`, displayName: "Sample case manager" } });
await db.platformRoleGrant.create({ data: { firmId: A, staffId: cm.id, role: "CASE_MANAGER", grantedBy: "seed:pfr3" } });
const TM = await signIn("sample-firm", { actorId: cm.actorId! });
// Read-only and Billing / Finance colleagues (BR-2's fallback, BR-3's no-person rule for view-financial without view.all)
const role = async (r: string) => { const x = await db.platformStaff.create({ data: { firmId: A, actorId: `pfr3-${r.toLowerCase()}-${run}`, email: `pfr3-${r.toLowerCase()}-${run}@sample.invalid`, displayName: `Sample ${r.toLowerCase()}` } });
  await db.platformRoleGrant.create({ data: { firmId: A, staffId: x.id, role: r as never, grantedBy: "seed:pfr3" } }); return signIn("sample-firm", { actorId: x.actorId! }); };
const TRO = await role("READ_ONLY"), TBF = await role("BILLING_FINANCE");

// ------------------------------------------------------------------------------- money this month (Sample, replica role)
const R = "set session_replication_role = replica;";
sql(`${R} insert into money_payment_settings (firm_id, updated_by, updated_at) values ('${A}', 'seed:pfr3', now()) on conflict (firm_id) do nothing`);
const P = sql(`${R} insert into fo_person (id, firm_id, given_names, family_name, email, created_by, updated_at) values (gen_random_uuid(), '${A}', 'Client R3', 'Sample', 'pfr3.${run}@example.org', 'seed:pfr3', now()) returning id`);
const inv = (cur: string, amount: number, rate: number, tax: number, due: string) => {
  const id = sql(`${R} insert into money_invoice (firm_id, person_id, number, currency, due_date, issued_at, issued_by, created_by, updated_at) values ('${A}', '${P}', 'PFR3-${run}-${cur}-${amount}', '${cur}', ${due}, now() - interval '1 hour', 'seed', 'seed', now()) returning id`);
  sql(`${R} insert into money_invoice_line (firm_id, invoice_id, position, kind, description, quantity, unit_amount_minor, amount_minor, tax_rate_ppm, tax_minor, currency) values ('${A}', '${id}', 1, 'FEE', 'Sample', 1, ${amount}, ${amount}, ${rate}, ${tax}, '${cur}')`);
};
inv("CAD", 100000, 130000, 13000, "current_date + 30"); inv("USD", 20000, 50000, 1000, "current_date + 30");

try {
  // ---------------------------------------------------------------------------------------------------- the API underneath
  const dO = await api(TR, "GET", "/platform/reports/filters"), dC = await api(TO, "GET", "/platform/reports/filters");
  const lO = await api(TR, "GET", "/platform/reports/dashboards/owner"), lC = await api(TO, "GET", "/platform/reports/dashboards/case-officer");
  const month = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "2-digit" }).format(new Date());
  ok("PF-R3 BR3 pass (API): GET filters carries the firm's month and, for the Owner (view.all), the people; and that they may export",
    dO.status === 200 && dO.body.period.from === `${month}-01` && dO.body.period.to.startsWith(month) && Array.isArray(dO.body.people) && dO.body.people.length > 0 && dO.body.canExport === true && lO.status === 200, dO.body);
  ok("PF-R3 BR3 fail (API; challenge M1): the Case Officer (view.own) gets no people at all, and may not export", dC.status === 200 && dC.body.people === undefined && dC.body.canExport === false && JSON.stringify(lC.body.widgets) !== undefined, dC.body);
  const lines = () => Number(sql(`select count(*) from audit_event where firm_id = '${A}' and action = 'report.exported'`));
  const before = lines(), filters = { from: dO.body.period.from, to: dO.body.period.to };
  const ex = await api(TR, "POST", "/platform/reports/export", { metric: "reports.money.tax_collected", filters });
  const line = sql(`select detail::text from audit_event where firm_id = '${A}' and action = 'report.exported' order by at desc limit 1`);
  ok("PF-R3 BR7 pass (API): the Owner's export is a CSV of the table (currency first, amounts as answered) and writes one audit line with scope and rows",
    ex.status === 200 && ex.text.replace(/^﻿/, "").startsWith("Currency,Tax name,Tax\r\n") && ex.text.includes("CAD,HST,130.00") && ex.text.includes("USD,GST,10.00") && lines() === before + 1
      && /"scope": ?"financial"/.test(line) && /"rows": ?2/.test(line) && !line.includes("130.00") && (ex.headers.get("content-disposition") ?? "").includes(`reports-tax-collected-${month}.csv`), { status: ex.status, text: ex.text.slice(0, 200), line });
  const noKey = await api(TO, "POST", "/platform/reports/export", { metric: "reports.money.tax_collected", filters });
  const withheld = await api(TM, "POST", "/platform/reports/export", { metric: "reports.money.tax_collected", filters });
  const tile = await api(TR, "POST", "/platform/reports/export", { metric: "reports.money.fees_billed", filters });
  const bad = await api(TR, "POST", "/platform/reports/export", { metric: "reports.money.tax_collected", filters: { from: "2026-02-30" } });
  const none = await api(TR, "POST", "/platform/reports/export", { metric: "reports.money.tax_collected", filters: { from: "2020-01-01", to: "2020-01-31" } });
  ok("PF-R3 BR7 fail (API; challenge M4, break m3): no export key → 403; a WITHHELD table (Case Manager, no money access) → 403; a single figure → 400; a bad date → 422; an empty table → 422; none writes a line",
    noKey.status === 403 && withheld.status === 403 && withheld.body?.code === "WITHHELD" && tile.status === 400 && tile.body?.code === "NOT_A_TABLE" && bad.status === 422 && none.status === 422 && none.body?.code === "NOTHING_TO_EXPORT" && lines() === before + 1,
    { noKey: noKey.status, withheld: [withheld.status, withheld.body?.code], tile: [tile.status, tile.body?.code], bad: bad.status });

  // ----------------------------------------------------------------------------------------------------------- the browser
  const browser: Browser = await chromium.launch({ headless: process.env.HEADED !== "1", ...(existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : process.platform === "darwin" ? { channel: "chrome" } : {}) });
  const errs: string[] = [];
  const tab = async (token: string, width = 1440) => {
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1, colorScheme: "light", reducedMotion: "reduce", acceptDownloads: true });
    await ctx.addInitScript((x) => { sessionStorage.setItem("xr-staff-session", JSON.stringify({ token: x, expiresAt: Date.now() + 3_600_000 })); }, token);
    const p = await ctx.newPage(); p.on("pageerror", (e) => errs.push(e.message)); return p;
  };
  // ready when the first card is drawn and no card is still loading (its answer may come after the layout's)
  const open = async (p: Page, search = "") => { await p.goto(`${BASE}/platform/reports${search}`); await p.locator("[data-report-card]").first().waitFor({ timeout: 60_000 }); await p.waitForLoadState("networkidle");
    await p.waitForFunction(() => !document.querySelector("[data-report-state=loading]"), undefined, { timeout: 30_000 }); };
  const card = (p: Page, key: string) => p.locator(`[data-report-card="${key}"]`);
  const axe = async (p: Page) => (await new AxeBuilder({ page: p }).include("main").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze()).violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  try {
    // the Owner, 1440 px: their dashboard, money per currency, the screen equals the API
    const po = await tab(TR);
    const t0 = Date.now(); await open(po);
    const lcp = await po.evaluate(() => new Promise<number>((res) => { new PerformanceObserver((l) => { const e = l.getEntries(); res(e[e.length - 1]!.startTime); }).observe({ type: "largest-contentful-paint", buffered: true }); setTimeout(() => res(-1), 3000); }));
    await po.screenshot({ path: join(SHOTS, "owner-1440.png"), fullPage: true });
    ok("PF-R3 BR2 pass: the Owner lands on the Owner dashboard (no address needed)", (await po.locator("[data-report-dashboard]").inputValue()) === "owner");
    const q = await api(TR, "POST", "/platform/reports/query", { metrics: ["reports.money.fees_billed"], filters });
    const apiFigures = q.body.metrics[0].reading.figures.map((x: { currency: string }) => x.currency).join();
    const shown = await card(po, "reports.money.fees_billed").locator("[data-report-money]").allTextContents();
    ok("PF-R3 BR4 pass and row (the screen equals the API): Fees billed shows one line per currency, CAD and USD apart, as the API answers", shown.length === 2 && shown[0]!.startsWith("CAD ") && shown[1]!.startsWith("USD ") && apiFigures === "CAD,USD", { shown, apiFigures });
    ok("PF-R3 BR4 fail: no card shows a sum or a currency the answer lacks (no \"USD 0.00\", no total)", !(await po.locator("[data-report-grid]").innerText()).includes("USD 0.00"));
    const src = q.body.metrics[0].source as string, tip = await card(po, "reports.money.fees_billed").locator("[data-report-tip]").first().getAttribute("title");
    ok("PF-R3 BR5 pass: the card's \"What this counts\" is the answer's own source words", tip === src, { tip, src });
    ok("PF-R3 BR1 pass: the Owner's money card says \"Whole firm\"", (await card(po, "reports.money.fees_billed").locator("[data-report-scope]").innerText()) === "Whole firm");
    ok("PF-R3 BR8 pass: no figure links anywhere (no answer carries a drill target)", (await po.locator("[data-report-grid] a").count()) === 0);
    ok("PF-R3 row: the first figures render within the STANDARDS §9 budget (LCP ≤ 2.5 s; warning budget, P-717 (b))", lcp >= 0 && lcp <= 2500, { lcp, wall: Date.now() - t0 });
    ok("PF-R3 BR6 pass: a seeded widget no row registers yet reads \"Not counted yet\"", (await card(po, "reports.cases.overdue_tasks_by_person").locator("[data-report-state=not-counted]").count()) === 1);

    // BR-7 in the browser: Owner on Billing / Finance exports Tax collected
    await open(po, "?dashboard=billing-finance");
    const before2 = lines();
    const [dl] = await Promise.all([po.waitForEvent("download"), po.locator('[data-report-export="reports.money.tax_collected"]').click()]);
    await po.locator("[data-report-export-said]").waitFor();
    ok("PF-R3 BR7 pass (browser): Export CSV downloads the table and says it is recorded; one more audit line", dl.suggestedFilename() === `reports-tax-collected-${month}.csv` && lines() === before2 + 1);
    ok("PF-R3 BR7 fail: a TILE has no Export button", (await card(po, "reports.money.fees_billed").locator("[data-report-export]").count()) === 0);
    await po.screenshot({ path: join(SHOTS, "billing-finance-1440.png"), fullPage: true });

    // BR-6: one unavailable figure (a route rewrite of the answer) shows Retry, never a 0
    await po.route("**/api/platform/reports/query", async (r) => { const res = await r.fetch(); const j = await res.json(); j.metrics = j.metrics.map((m: { key: string }) => m.key === "reports.money.fees_billed" ? { ...m, status: "UNAVAILABLE", reading: null } : m); await r.fulfill({ response: res, json: j }); });
    await open(po, "?dashboard=billing-finance");
    ok("PF-R3 BR6 fail: an unavailable figure says \"Could not be counted just now\" with Retry, never 0", (await card(po, "reports.money.fees_billed").locator("[data-report-retry]").count()) === 1 && (await card(po, "reports.money.fees_billed").locator("[data-report-value]").count()) === 0);
    await po.unroute("**/api/platform/reports/query");
    await po.context().close();

    // the Case Officer (view.own): their dashboard, own scope, no person picker, no export; the Owner on the same dashboard
    const pc = await tab(TO), sent: string[] = [];
    pc.on("request", (r) => { if (r.url().endsWith("/api/platform/reports/query")) sent.push(r.postData() ?? ""); });
    await open(pc, `?person=${dO.body.people[0].id}`);
    ok("PF-R3 BR2 pass and BR1 pass: the Case Officer lands on the Case Officer dashboard and sees \"Your work\"", (await pc.locator("[data-report-dashboard]").inputValue()) === "case-officer" && (await card(pc, "reports.cases.case_load").locator("[data-report-scope]").innerText()) === "Your work");
    ok("PF-R3 BR3 fail (challenge M1): a person in a Case Officer's address is dropped: \"You\" shows, no picker, and no query sends a staffId", (await pc.locator("[data-report-person-you]").count()) === 1 && (await pc.locator("[data-report-person]").count()) === 0 && sent.length > 0 && sent.every((b) => !b.includes("staffId")), sent);
    ok("PF-R3 BR7 fail (browser): no Export button for someone without the Export permission", (await pc.locator("[data-report-export]").count()) === 0);
    await pc.screenshot({ path: join(SHOTS, "case-officer-1440.png"), fullPage: true });
    const pr = await tab(TR); await open(pr, "?dashboard=case-officer");
    const tilesO = await pr.locator("[data-report-card]").evaluateAll((e) => e.map((x) => x.getAttribute("data-report-card"))), tilesC = await pc.locator("[data-report-card]").evaluateAll((e) => e.map((x) => x.getAttribute("data-report-card")));
    ok("PF-R3 row: an Owner and a Case Officer see the same tiles at different scope (\"Whole firm\" against \"Your work\")", JSON.stringify(tilesO) === JSON.stringify(tilesC) && (await card(pr, "reports.cases.case_load").locator("[data-report-scope]").innerText()) === "Whole firm");
    await open(pr, "?dashboard=nope");
    ok("PF-R3 BR2 fail: an unknown ?dashboard= opens the viewer's default, never an error page", (await pr.locator("[data-report-dashboard]").inputValue()) === "owner");
    // BR-3: the address carries the filters; reloading keeps them, and every card is asked again with them
    await pr.locator("[data-report-client-type]").selectOption("CORPORATE");
    await pr.waitForURL(/clientType=CORPORATE/); await pr.reload(); await pr.locator("[data-report-card]").first().waitFor();
    ok("PF-R3 BR3 pass: a filter goes into the address and a reload keeps it", (await pr.locator("[data-report-client-type]").inputValue()) === "CORPORATE");
    await pc.context().close();

    // the Case Manager: WITHHELD money, no export on it
    const pm = await tab(TM); await open(pm, "?dashboard=billing-finance");
    ok("PF-R3 BR1 fail and BR6: a WITHHELD figure reads \"Not in your access\" with no scope badge and no Export button", (await card(pm, "reports.money.tax_collected").locator("[data-report-state=withheld]").count()) === 1
      && (await card(pm, "reports.money.tax_collected").locator("[data-report-scope], [data-report-export]").count()) === 0);
    await pm.context().close();

    // review M1: "What this counts" opens by keyboard (Enter) and shows its words in the page, Escape hides them
    const pk = await tab(TR); await open(pk);
    const tipBtn = card(pk, "reports.money.fees_billed").locator("[data-report-tip]").first();
    await tipBtn.focus(); await pk.keyboard.press("Enter");
    const tipText = await card(pk, "reports.money.fees_billed").locator("[data-report-tip-text]").innerText().catch(() => "");
    await pk.keyboard.press("Escape");
    ok("PF-R3 BR5 pass (review M1): Enter on (i) shows \"What this counts\" in the page, and Escape hides it", tipText === src && (await pk.locator("[data-report-tip-text]").count()) === 0, { tipText });
    // review M3: the month picker, and a custom range with the end before the start says so on the field and asks nothing
    ok("PF-R3 BR3 pass (review M3): a Month picker opens on the firm's current month", (await pk.locator("[data-report-month]").inputValue()) === `${month}-01`);
    const asked: string[] = []; pk.on("request", (r) => { if (r.url().endsWith("/api/platform/reports/query")) asked.push(r.postData() ?? ""); });
    await pk.goto(`${BASE}/platform/reports?from=${month}-20&to=${month}-10`); await pk.locator("[data-report-card]").first().waitFor({ timeout: 60_000 }); await pk.waitForLoadState("networkidle");
    ok("PF-R3 BR3 fail (review M3, break m6): From after To keeps both dates, says so on the To field, and no figure is asked for", (await pk.locator("[data-report-to]").inputValue()) === `${month}-10`
      && (await pk.getByText("The end date is before the start date").count()) === 1 && asked.length === 0, { asked: asked.length });
    // break M1: a person who is not the firm's staff is dropped: "Everyone", no staffId sent
    asked.length = 0; await open(pk, "?person=00000000-0000-4000-8000-000000000000");
    ok("PF-R3 BR3 fail (break M1): an outside person id is dropped: the picker says Everyone and no query sends a staffId", (await pk.locator("[data-report-person]").inputValue()) === "" && asked.length > 0 && asked.every((b) => !b.includes("staffId")), asked);
    // review M4 and M2: BR-1's "<Name>'s work", with the person's own (empty) figures, never the firm's under the new words
    const officer = dO.body.people.find((x: { id: string; name: string }) => x.id === sql(`select id from platform_staff where actor_id = 'user-O'`));
    await open(pk, `?person=${officer.id}`);
    ok("PF-R3 BR1 pass (review M2, M4): with a person picked, a card says \"<Name>'s work\" over that person's own figures (no invoices on their cases)", (await card(pk, "reports.money.fees_billed").locator("[data-report-scope]").innerText()) === `${officer.name}'s work`
      && (await card(pk, "reports.money.fees_billed").locator("[data-report-state=empty]").innerText()) === "No invoices in this period");
    // break R2-M1: the same colleague's id in capitals is the same person: picker, badge and figures agree
    await open(pk, `?person=${officer.id.toUpperCase()}`);
    ok("PF-R3 BR1 pass (break R2-M1): a person id in capitals selects that person in the picker and the badge says \"<Name>'s work\"", (await pk.locator("[data-report-person]").inputValue()) === officer.id
      && (await card(pk, "reports.money.fees_billed").locator("[data-report-scope]").innerText()) === `${officer.name}'s work`);
    // break R2-M2: an impossible month or day never crashes the page; it reads as the firm's month
    await open(pk, "?from=2026-13-01&to=2026-11-32");
    ok("PF-R3 BR3 fail (break R2-M2): an impossible date in the address falls back to the month, never a crash", (await pk.locator("[data-report-month]").inputValue()) === `${month}-01` && !errs.some((e) => /Invalid time value/.test(e)), errs);
    // review r2-m3: the stale-answer guard (M2) with a slow answer: after a filter change no old figure shows until the new one comes
    await pk.route("**/api/platform/reports/query", async (r) => { await new Promise((res) => setTimeout(res, 2500)); await r.continue(); });
    await open(pk);
    await pk.locator("[data-report-client-type]").selectOption("CORPORATE");
    const midValues = await pk.locator("[data-report-grid] [data-report-value]").count(), midBusy = await pk.locator("[data-report-grid]").getAttribute("aria-busy"), midExport = await pk.locator("[data-report-export]").count();
    await pk.waitForFunction(() => !document.querySelector("[data-report-state=loading]"), undefined, { timeout: 30_000 });
    ok("PF-R3 BR1 fail (review M2, r2-m3): while a new answer is coming no old figure and no Export button show, and the grid is busy", midValues === 0 && midBusy === "true" && midExport === 0, { midValues, midBusy, midExport });
    await pk.unroute("**/api/platform/reports/query");
    // break and review r2-m1: the words of the right-hand card's (i) stay inside the page at 1440
    await open(pk);
    const right = pk.locator("[data-report-card] [data-report-tip]").last(); await right.click();
    ok("PF-R3 BR5 pass (r2-m1): the open \"What this counts\" words never push the page sideways", (await pk.locator("[data-report-tip-text]").count()) === 1 && !(await pk.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)));
    // review and break r2-m2: dates that cannot be read together say why on every card; nothing pretends to load
    await pk.goto(`${BASE}/platform/reports?from=${month}-20&to=${month}-10`); await pk.locator("[data-report-state=blocked]").first().waitFor({ timeout: 30_000 });
    ok("PF-R3 BR6 pass (r2-m2): with the end before the start, cards say \"Fix the dates above\" and the grid is not busy", (await pk.locator("[data-report-state=loading]").count()) === 0 && (await pk.locator("[data-report-grid]").getAttribute("aria-busy")) === "false");
    // review M4: BR-6's empty words per metric
    await open(pk, "?clientType=CORPORATE");
    ok("PF-R3 BR6 pass (review M4, break m8): empty figures say why in their own words: \"No payments in this period\", \"No invoices in this period\"", (await card(pk, "reports.money.fees_collected").locator("[data-report-state=empty]").innerText()) === "No payments in this period"
      && (await card(pk, "reports.money.fees_billed").locator("[data-report-state=empty]").innerText()) === "No invoices in this period");
    await pk.context().close();
    // review M4: BR-2's Read-only fallback; BR-3's Billing / Finance never sends a person and opens on All
    const pro = await tab(TRO); await open(pro);
    ok("PF-R3 BR2 pass (review M4): Read-only lands on the Case Officer dashboard", (await pro.locator("[data-report-dashboard]").inputValue()) === "case-officer");
    await pro.context().close();
    const pbf = await tab(TBF), bfSent: string[] = []; pbf.on("request", (r) => { if (r.url().endsWith("/api/platform/reports/query")) bfSent.push(r.postData() ?? ""); });
    await open(pbf, `?person=${officer.id}`);
    ok("PF-R3 BR3 pass (review M4, break m11): Billing / Finance lands on its dashboard on All clients, shows \"You\", and never sends a staffId", (await pbf.locator("[data-report-dashboard]").inputValue()) === "billing-finance"
      && (await pbf.locator("[data-report-client-type]").inputValue()) === "ALL" && (await pbf.locator("[data-report-person-you]").count()) === 1 && bfSent.length > 0 && bfSent.every((b) => !b.includes("staffId")), bfSent);
    await pbf.context().close();

    // keyboard and widths: axe 0 serious, no sideways scroll at 375, 1024 and 1440; the filter bar by keyboard alone
    for (const w of [375, 1024, 1440]) {
      const p = await tab(TR, w); await open(p);
      const v = await axe(p), wide = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      ok(`PF-R3 row: at ${w} px axe finds 0 serious and the page never scrolls sideways`, v.length === 0 && !wide, { v: v.map((x) => x.id), wide });
      if (w === 375) await p.screenshot({ path: join(SHOTS, "owner-375.png"), fullPage: true });
      if (w === 1440) {
        await p.locator("[data-report-dashboard]").focus(); await p.keyboard.press("Tab");
        const next = await p.evaluate(() => document.activeElement?.getAttribute("data-report-month") !== null);
        await p.locator("[data-report-client-type]").focus(); await p.keyboard.press("ArrowDown"); await p.waitForURL(/clientType=/);
        ok("PF-R3 row: keyboard only: Tab moves from the Dashboard picker to the filters, and the arrow keys change a filter", next);
      }
      await p.context().close();
    }
    ok("PF-R3: no page error in any tab", errs.length === 0, errs);
  } finally { await browser.close(); }
} catch (e) {
  failed++; console.log(`FAIL  PF-R3: the check stopped: ${(e as Error).stack?.slice(0, 600)}`);
} finally { await db.$disconnect(); }
process.exit(summary() + failed ? 1 : 0);
