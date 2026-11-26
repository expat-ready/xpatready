// J-79 (map row 79, R1.79: firm dashboards and reports), written with its last part, PF-R3 (#3864). It walks R1.79's
// done-when as people do, on screens, with the database read underneath. Done when (CAPABILITIES R1.79): "Dashboards for the
// front office, cases and the firm read from the records, within the person's rights".
//   Setup (Sample, on an isolated copy, never :4400): the seeded Sample firm (Owner user-R; Case Officer user-O) and a Case
//   Manager added here (report view.all and export, no money access). Two issued invoices this month, CAD with HST and USD with
//   GST, plus one Sample lead, written to the copy's database, marked "J-79".
//   W1 the Owner signs in on the sign-in card, opens Home and follows "Reports" (no address typed): the Owner dashboard opens.
//   W2 money read from the records: Fees billed shows each currency apart, equal to the invoices' totals in the database this
//      month; fails on the fake (P-606): the same judge against last month's totals does not hold.
//   W3 the front office read from the records: Leads added equals fo_lead's count this month (closed ones included).
//   W4 cases read from the records: the Case Officer dashboard's "Open cases by stage" equals the API's own answer for the
//      Owner ("Whole firm").
//   W5 within the person's rights: the Case Officer signs in, sees "Your work", no person picker and no Export button; on the
//      Billing / Finance dashboard money says "Not in your access"; the Case Manager too (no money key).
//   W6 export: the Owner exports Tax collected; the file's rows are the API's rows, and one `report.exported` line is written.
//   W7 375, 1024 and 1440 px: no sideways scroll, no serious axe finding; no page error.
// What is a stand-in (said, not hidden): the invoices and the lead are Sample rows written to the copy's database (the money
// and lead screens that make them have their own journeys); the sign-in is PF-4's local stand-in (PLATFORM_IDENTITY=local).
// Sample data only; US$0, no model call, live AI off. Screenshots: product/screens/J-79/screenshots/. Run from prototype/:
//   zsh studio/tools/isolated.sh j79 4479 start --ttl 30 AI_LIVE=off PLATFORM_IDENTITY=local PLATFORM_SAMPLE_SEED=on && trap 'zsh studio/tools/isolated.sh j79 4479 stop' EXIT && tsx --tsconfig studio/api/tsconfig.json studio/tests/journeys/j_79.ts j79 4479
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { chromium, type Page } from "playwright";
import { client, recorder } from "../runtime/api.ts";
const { default: AxeBuilder } = createRequire(import.meta.url)("@axe-core/playwright") as typeof import("@axe-core/playwright");

const NAME = process.argv[2] ?? "j79", PORT = Number(process.argv[3] ?? 4479), DBNAME = `xr_studio_${NAME}`, BASE = `http://localhost:${PORT}`;
if (PORT === 4400) { console.log("refused: never the demo on :4400"); process.exit(2); }
const SHOTS = join(import.meta.dirname, "..", "..", "..", "..", "product", "screens", "J-79", "screenshots"); mkdirSync(SHOTS, { recursive: true });
const { ok, summary } = recorder();
const { sql: rawSql } = client(PORT, DBNAME);
const sql = (q: string) => (rawSql(q) ?? "").split("\n").map((x) => x.trim()).filter((x) => x && !/^(SET|INSERT \d+ \d+)$/.test(x))[0] ?? "";
const errors: string[] = [];

await fetch(`${BASE}/api/platform/me`).catch(() => undefined);   // the app seeds the Sample firms at start
const A = sql(`select id from platform_firm where key = 'sample-firm'`);
if (sql(`select count(*) from money_invoice where number like 'J79-%'`) !== "0") { console.error("STOP  this copy already holds J-79's rows: start a fresh copy"); process.exit(2); }
const email = (actor: string) => sql(`select email from platform_staff where actor_id = '${actor}'`);
const CM = sql(`insert into platform_staff (id, firm_id, email, display_name, actor_id, updated_at) values (gen_random_uuid(), '${A}', 'j79.cm@sample-firm.example.com', 'Case manager J-79 (Sample)', 'j79-cm', now()) returning id`);
sql(`insert into platform_role_grant (id, firm_id, staff_id, role, granted_by) values (gen_random_uuid(), '${A}', '${CM}', 'CASE_MANAGER', 'seed:j79')`);
const R = "set session_replication_role = replica;";
sql(`${R} insert into money_payment_settings (firm_id, updated_by, updated_at) values ('${A}', 'seed:j79', now()) on conflict (firm_id) do nothing`);
const P = sql(`${R} insert into fo_person (id, firm_id, given_names, family_name, email, created_by, updated_at) values (gen_random_uuid(), '${A}', 'Client J79', 'Sample', 'j79.client@example.org', 'seed:j79', now()) returning id`);
for (const [cur, amt, rate, tax] of [["CAD", 200000, 130000, 26000], ["USD", 50000, 50000, 2500]] as const) {
  const id = sql(`${R} insert into money_invoice (firm_id, person_id, number, currency, due_date, issued_at, issued_by, created_by, updated_at) values ('${A}', '${P}', 'J79-${cur}', '${cur}', current_date + 30, now() - interval '1 hour', 'seed', 'seed', now()) returning id`);
  sql(`${R} insert into money_invoice_line (firm_id, invoice_id, position, kind, description, quantity, unit_amount_minor, amount_minor, tax_rate_ppm, tax_minor, currency) values ('${A}', '${id}', 1, 'FEE', 'J-79 (Sample)', 1, ${amt}, ${amt}, ${rate}, ${tax}, '${cur}')`);
}
// one Sample lead this month, on the Sample client person (any door: the figure counts every door), its number given (L-79079: the numbering trigger is off under the replica role)
sql(`${R} insert into fo_lead (id, firm_id, number, person_id, door, source, created_by, updated_at) values (gen_random_uuid(), '${A}', 'L-79079', '${P}', 'MANUAL', 'J-79 (Sample)', 'seed:j79', now())`);
const fmt = (minor: string) => `${Number(BigInt(minor) / 100n).toLocaleString("en-CA")}.${String(BigInt(minor) % 100n).padStart(2, "0")}`;
const month = (back: number) => `date_trunc('month', (now() at time zone 'America/Toronto') - interval '${back} month')`;
const billedIn = (back: number, cur: string) => sql(`select coalesce(sum(money_invoice_total(i.firm_id, i.id)), 0) - coalesce((select sum(c.amount_minor) from money_credit_note c join money_invoice j on j.id = c.invoice_id where j.firm_id = '${A}' and j.currency = '${cur}' and (c.created_at at time zone 'America/Toronto') >= ${month(back)} and (c.created_at at time zone 'America/Toronto') < ${month(back)} + interval '1 month'), 0)
  from money_invoice i where i.firm_id = '${A}' and i.currency = '${cur}' and i.issued_at is not null and (i.issued_at at time zone 'America/Toronto') >= ${month(back)} and (i.issued_at at time zone 'America/Toronto') < ${month(back)} + interval '1 month'`);

const browser = await chromium.launch({ headless: !process.env.HEADED, slowMo: process.env.HEADED ? 200 : 0, ...(process.platform === "darwin" ? { channel: "chrome" } : existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {}) });
async function signIn(mail: string, width = 1440): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: "light", reducedMotion: "reduce", acceptDownloads: true }), p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(String(e)));
  await p.goto(`${BASE}/account`);
  await p.getByLabel("Firm key").fill("sample-firm"); await p.getByLabel("Work email").fill(mail); await p.getByRole("button", { name: "Sign in" }).click();
  await p.getByLabel("Firm key").waitFor({ state: "detached", timeout: 20_000 });
  await p.locator("main h1").first().waitFor({ timeout: 20_000 });
  return p;
}
const ready = async (p: Page) => { await p.locator("[data-report-card]").first().waitFor({ timeout: 60_000 }); await p.waitForLoadState("networkidle"); };
const card = (p: Page, key: string) => p.locator(`[data-report-card="${key}"]`);
// after a switch the previous answer stays until the new one comes: wait until no card of the new layout is still loading
const go = async (p: Page, dashboard: string) => { await p.locator("[data-report-dashboard]").selectOption(dashboard); await p.waitForURL(new RegExp(`dashboard=${dashboard}`)); await ready(p);
  await p.waitForFunction(() => !document.querySelector("[data-report-state=loading]"), undefined, { timeout: 30_000 }); };
const tokenOf = (p: Page) => p.evaluate(() => JSON.parse(sessionStorage.getItem("xr-staff-session") ?? "{}").token as string);
const query = async (p: Page, metric: string) => (await (await fetch(`${BASE}/api/platform/reports/query`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${await tokenOf(p)}` }, body: JSON.stringify({ metrics: [metric] }) })).json()).metrics[0];
try {
  // W1
  const owner = await signIn(email("user-R"));
  await owner.goto(`${BASE}/home`); await owner.getByRole("link", { name: "Reports" }).first().click(); await ready(owner);
  ok("J-79 W1: the Owner follows Reports from Home (no address typed) and the Owner dashboard opens", owner.url().includes("/platform/reports") && (await owner.locator("[data-report-dashboard]").inputValue()) === "owner");
  await owner.screenshot({ path: join(SHOTS, "w1-owner-1440.png"), fullPage: true });
  // W2
  const shown = await card(owner, "reports.money.fees_billed").locator("[data-report-money]").allTextContents();
  const want = ["CAD", "USD"].map((c) => `${c} ${fmt(billedIn(0, c))}`), last = ["CAD", "USD"].map((c) => `${c} ${fmt(billedIn(1, c))}`);
  ok("J-79 W2: Fees billed shows each currency apart, equal to this month's invoice totals in the database", JSON.stringify(shown) === JSON.stringify(want), { shown, want });
  ok("J-79 W2 fail on the fake: the same judge against last month's totals does not hold", JSON.stringify(shown) !== JSON.stringify(last), { last });
  // W3
  const leads = sql(`select count(*) from fo_lead t where t.firm_id = '${A}' and (t.arrived_at at time zone 'America/Toronto') >= ${month(0)} and not exists (select 1 from fo_reason r where r.id = t.close_reason_id and r.key in ('COMBINED_LEAD', 'ADDED_TO_PROSPECT'))`);
  ok("J-79 W3: Leads added equals the firm's leads this month in the database (the Sample lead included)", Number(leads) >= 1 && (await card(owner, "reports.sales.leads_added").locator("[data-report-value]").innerText()).replace(/,/g, "") === leads, { leads });
  // W4
  await go(owner, "case-officer");
  const load = await query(owner, "reports.cases.case_load"), rows = await card(owner, "reports.cases.case_load").locator("[data-report-bar], [data-report-state=empty]").count();
  ok("J-79 W4: Open cases by stage is the API's own answer for the Owner, at \"Whole firm\"", (load.reading.rows.length ? rows === load.reading.rows.length : rows === 1) && (await card(owner, "reports.cases.case_load").locator("[data-report-scope]").innerText()) === "Whole firm", { load, rows });
  // W6
  await go(owner, "billing-finance");
  const before = Number(sql(`select count(*) from audit_event where firm_id = '${A}' and action = 'report.exported'`));
  const [dl] = await Promise.all([owner.waitForEvent("download"), owner.locator('[data-report-export="reports.money.tax_collected"]').click()]);
  const file = readFileSync((await dl.path())!, "utf8").replace(/^﻿/, "").trim().split("\r\n"), tax = await query(owner, "reports.money.tax_collected");
  ok("J-79 W6: the exported file's rows are the API's rows, and one report.exported line is written", file.length === tax.reading.rows.length + 1 && tax.reading.rows.every((r: Record<string, string>) => file.includes(`${r.currency},${r.tax_name},${r.tax}`))
    && Number(sql(`select count(*) from audit_event where firm_id = '${A}' and action = 'report.exported'`)) === before + 1, { file, rows: tax.reading.rows });
  await owner.context().close();
  // W5
  for (const [who, mail, own] of [["Case Officer", email("user-O"), true], ["Case Manager", "j79.cm@sample-firm.example.com", false]] as const) {
    const p = await signIn(mail); await p.goto(`${BASE}/platform/reports`); await ready(p);
    const scope = own ? await card(p, "reports.cases.case_load").locator("[data-report-scope]").innerText() : "Whole firm";
    const picker = await p.locator("[data-report-person]").count(), exp = own ? await p.locator("[data-report-export]").count() : 0;
    await go(p, "billing-finance");
    ok(`J-79 W5: the ${who} sees within their rights: ${own ? "\"Your work\", no person picker, no Export button; " : ""}money says "Not in your access"`,
      (own ? scope === "Your work" && picker === 0 && exp === 0 : true) && (await card(p, "reports.money.fees_billed").locator("[data-report-state=withheld]").count()) === 1, { scope, picker, exp });
    if (own) await p.screenshot({ path: join(SHOTS, "w5-case-officer-1440.png"), fullPage: true });
    await p.context().close();
  }
  // W7
  for (const w of [375, 1024, 1440]) {
    const p = await signIn(email("user-R"), w); await p.goto(`${BASE}/platform/reports`); await ready(p);
    const v = (await new AxeBuilder({ page: p }).include("main").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze()).violations.filter((x) => x.impact === "serious" || x.impact === "critical");
    const wide = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    ok(`J-79 W7: at ${w} px no sideways scroll and no serious axe finding`, v.length === 0 && !wide, { v: v.map((x) => x.id), wide });
    await p.context().close();
  }
  ok("J-79: no page error", errors.length === 0, errors);
} finally { await browser.close(); }
process.exit(summary() ? 1 : 0);
