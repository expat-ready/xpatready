// FO-7s1 part 1 (concept screens/fo-7s-money/concept-invoices.md (a), (b); AG-6-1, AG-6-4 r3, AG-6-25 to -27, AG-6-48, AG-6-59 r5;
// P-607 (7)): Money → Invoices and an invoice's detail walked in a browser on an isolated copy (its own database and port, never
// :4400), with the API and the database read underneath. Each line has a pass and a fail:
//   DW3 (issued is frozen) an issued invoice offers "Use a credit note" and no edit control; a part credit note issues and the
//       balance is the API's; fail: a draft offers no credit note;
//   DW6 (allowedActions) the Case Officer (no agent/invoice:void) sees no "Use a credit note"; nobody sees Record payment in
//       this part; fail: an action FO-7q does not name (injected into the answer) is never shown;
//   DW7 (currencies) a CAD and a USD invoice in the list: every figure carries exactly one currency, no row or total adds them;
//       fail: the scan catches a planted figure that sums the two;
//   DW1 (part 1's half) a government-fee line on the detail says "Government fees are never taxed" and shows no tax figure;
//   DW9 (trust off) with trust Unanswered, no trust word on the list or the detail; fail: the scan catches a planted one;
//   L1 the list's filters live in the address (Status Paid shows only Paid; Clear filters), the empty and refused states, and
//       an unknown invoice is a plain not found;
//   DW10 keyboard only (Tab to an invoice, Enter opens it; Tab to "Use a credit note", Enter opens the panel on its first field,
//       Escape returns focus), axe-core 0 serious (WCAG 2.2 A/AA) on the list, the detail and the panel, at 375, 1024 and 1440 px
//       with no sideways scroll; fail: the same axe run finds an unlabelled field we add.
// Sample firm and Sample figures only; re-runnable (each run makes its own invoices). US$0, no model call; live AI off.
// Screenshots (deviceScaleFactor 1) in product/screens/fo-7s-money/build/. Run from prototype/:
//   zsh studio/tools/isolated.sh fo7s1 4751 start AI_LIVE=off PLATFORM_IDENTITY=local && tsx studio/tests/check_fo7s1_invoices_browser.ts 4751 xr_studio_fo7s1
import { existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { chromium, type Browser, type Locator, type Page } from "playwright";
import { seedSampleFirmsFrontOffice } from "../api/src/front-office/firm-seed.ts";
import { centsOf, money } from "../web/src/modules/client-money/invoices/contract.ts";
import { client, recorder } from "./runtime/api.ts";
const { default: AxeBuilder } = createRequire(import.meta.url)("@axe-core/playwright") as typeof import("@axe-core/playwright");

const [PORT, DBNAME] = [Number(process.argv[2] ?? 4751), process.argv[3] ?? "xr_studio_fo7s1"];
if (PORT === 4400 || DBNAME === "xr_studio_demo") { console.log("refused: never the demo on :4400"); process.exit(2); }
const BASE = `http://localhost:${PORT}`, STUDIO = join(import.meta.dirname, "..");
const SHOTS = join(STUDIO, "..", "..", "product", "screens", "fo-7s-money", "build"); mkdirSync(SHOTS, { recursive: true });
const { ok, summary } = recorder();
const { sql: rawSql } = client(PORT, DBNAME);
const sql = (q: string) => (rawSql(q) ?? "").split("\n")[0].trim();
type Ans = { status: number; body: any; text: string };   // eslint-disable-line @typescript-eslint/no-explicit-any -- API answers are read loosely, as in the other checks
const api = async (t: string | null, method: string, path: string, body?: unknown): Promise<Ans> => {
  const r = await fetch(`${BASE}/api${path}`, { method, headers: { "content-type": "application/json", ...(t ? { authorization: `Bearer ${t}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text(); let j: unknown = null; try { j = JSON.parse(text); } catch { /* not JSON */ }
  return { status: r.status, body: j, text };
};
const signIn = async (firmKey: string, actorId: string): Promise<string> => {
  const r = await api(null, "POST", "/platform/session/local", { firmKey, actorId, secondStep: true });
  if (r.body?.token) return r.body.token as string;
  console.error(`STOP  local sign-in refused for ${actorId} (start the copy with PLATFORM_IDENTITY=local): ${r.text.slice(0, 300)}`); process.exit(2);
};
const M = "/front-office/money/invoices";

// ------------------------------------------------------------------------------------------------ setup (Sample)
await api(null, "GET", "/platform/me");   // the app seeds the Sample firms at start; this only waits for it
// The front office's set-up for the Sample firms (people need it), as the other front-office browser checks seed it.
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://xr_studio@127.0.0.1:54329/${DBNAME}`, options: "-c TimeZone=UTC" }) });
await seedSampleFirmsFrontOffice(db); await db.$disconnect();
const A = sql(`select id from platform_firm where key = 'sample-firm'`), run = Date.now().toString(36).slice(-5);
if (sql(`select count(*) from money_payment_settings where firm_id = '${A}'`) === "0") sql(`insert into money_payment_settings (firm_id, updated_by, updated_at) values ('${A}', 'seed:FO-7s1', now())`);
// An Ontario firm registered for tax (FO-7g's cited HST 13 %, Sample number), with no payment details (the "Email waits" case of part 2).
sql(`update money_payment_settings set tax_registered = true, tax_number = coalesce(tax_number, '123456789RT0001 (Sample)'), operating_details = null where firm_id = '${A}'`);
const province = sql(`select business_address->>'province_state' from platform_firm where id = '${A}'`);
const person = (n: string) => sql(`insert into fo_person (id, firm_id, given_names, family_name, email, created_by, updated_at) values (gen_random_uuid(), '${A}', 'Client ${n}', 'Sample', 'fo7s1.${run}.${n}@example.org', 'seed:FO-7s1', now()) returning id`);
const TOWNER = await signIn("sample-firm", "user-R"), TOFF = await signIn("sample-firm", "user-O");
const ADM = sql(`select id from platform_staff where actor_id = 'user-T' and firm_id = '${A}'`);
const ro = await api(TOWNER, "PATCH", `/platform/staff/${ADM}/roles`, { roles: ["READ_ONLY"], reason: "FO-7s1 check: a person without the invoice list" });
const TRO = await signIn("sample-firm", "user-T");
// C5 (CS-MV1): a party is visible when it is the subject of a prospect the person may see. Each run's two people get a prospect
// owned by the Owner and one by the Case Officer, inserted as FO-7q's own check seeds them (Sample).
const PB = person("b"), PU = person("u");
const staffOf = (actor: string) => sql(`select id from platform_staff where actor_id = '${actor}' and firm_id = '${A}'`);
let pn = 0;
for (const who of [PB, PU]) for (const owner of ["user-R", "user-O"])
  sql(`set session_replication_role = replica; insert into fo_prospect (id, firm_id, number, lead_id, type, stage_id, subject_person_id, subject_company_id, primary_contact_person_id, owner_staff_id, created_by, updated_at)
    values (gen_random_uuid(), '${A}', 'P-${String(10000 + ((Date.now() + 7919 * ++pn) % 89999))}', gen_random_uuid(), 'INDIVIDUAL', gen_random_uuid(), '${who}', null, '${who}', '${staffOf(owner)}', 'seed:FO-7s1', now())`);
const make = async (who: string, currency: string, lines: { kind: string; description: string; unitMinor: number; ratePpm?: number }[]) => {
  const d = await api(TOWNER, "POST", M, { personId: who, currency });
  for (const l of lines) await api(TOWNER, "POST", `${M}/${d.body?.id}/lines`, { ratePpm: 0, ...l });
  return d.body?.id as string;
};
// The concept's walk figures (Sample): a Fee of CAD 1,000.00 at 13 % and a Government fee of CAD 255.00, never taxed.
const cad = await make(PB, "CAD", [{ kind: "FEE", description: `Work permit — LMIA-based ${run}`, unitMinor: 100000, ratePpm: 130000 }, { kind: "GOVERNMENT_FEE", description: "Government fee: work permit (Sample)", unitMinor: 25500 }]);
await api(TOWNER, "POST", `${M}/${cad}/issue`);
const usd = await make(PU, "USD", [{ kind: "FEE", description: `Advice ${run}`, unitMinor: 50000 }]);
await api(TOWNER, "POST", `${M}/${usd}/issue`);
const draft = await make(PB, "CAD", [{ kind: "FEE", description: `Draft work ${run}`, unitMinor: 1000 }]);
const cadNo = sql(`select number from money_invoice where id = '${cad}'`), usdNo = sql(`select number from money_invoice where id = '${usd}'`);
const trustAnswered = sql(`select trust_answer from money_payment_settings where firm_id = '${A}'`) !== "UNANSWERED";
ok("FO-7s1 setup: a CAD invoice (Fee 1,000.00 at 13 % and a Government fee 255.00) and a USD invoice issued, a draft; the Owner, the Case Officer and user-T as Read only signed in; trust not answered",
  /^INV-/.test(cadNo ?? "") && /^INV-/.test(usdNo) && !!draft && ro.status === 200 && !trustAnswered && province === "ON", { cadNo, usdNo, ro: ro.status, trustAnswered, province });

// ------------------------------------------------------------------------------------------------ B1 the typed amount (break B1)
const cents = (t: string) => { const r = centsOf(t); return "cents" in r ? r.cents : null; };
ok("FO-7s1 B1 pass: an amount is read one way only: 1,000.50 → 100050, 5.50 → 550, 100 → 10000, 12,345,678.9 → 1234567890",
  cents("1,000.50") === 100050 && cents("5.50") === 550 && cents("100") === 10000 && cents("12,345,678.9") === 1234567890);
ok("FO-7s1 B1 fail: a decimal comma, stray commas, spaces, three decimals and 0 are refused, never guessed: 5,50 · 1,0,0 · 1 000,50 · 1000.005 · 0.00",
  ["5,50", "1,0,0", "1 000,50", "1000.005", "0.00", "-5", "1e3"].every((t) => cents(t) === null));

// ------------------------------------------------------------------------------------------------ the browser
const browser: Browser = await chromium.launch({ headless: process.env.HEADED !== "1", ...(existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : process.platform === "darwin" ? { channel: "chrome" } : {}) });
const errs: string[] = [];
const tab = async (token: string, width = 1440) => {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1, colorScheme: "light", reducedMotion: "reduce" });
  await ctx.addInitScript((t) => { sessionStorage.setItem("xr-staff-session", JSON.stringify({ token: t, expiresAt: Date.now() + 3_600_000 })); }, token);
  const p = await ctx.newPage(); p.on("pageerror", (e) => errs.push(e.message)); return p;
};
const list = async (p: Page, query = "") => { await p.goto(`${BASE}/money/invoices${query}`); await p.locator("[data-invoice-row], [data-empty], [data-invoices-refused], [data-invoices-error]").first().waitFor({ timeout: 60_000 }); };
const detail = async (p: Page, id: string) => { await p.goto(`${BASE}/money/invoices/${id}`); await p.locator("[data-invoice-number], [data-invoice-missing], [data-invoice-error]").first().waitFor({ timeout: 60_000 }); };
const shot = (p: Page, name: string) => p.screenshot({ path: join(SHOTS, `fo7s1-${name}.png`), fullPage: true });
const serious = async (p: Page, scope = "main") => (await p.waitForTimeout(300), await new AxeBuilder({ page: p }).include(scope).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze()).violations
  .filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.nodes[0]?.target}`);
const sideways = (p: Page) => p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
const reach = async (p: Page, target: Locator, max = 80) => {
  for (let i = 0; i < max; i++) { if (await target.evaluate((el) => el === document.activeElement).catch(() => false)) return; await p.keyboard.press("Tab"); }
  throw new Error("not reached by Tab");
};
/** Every figure on the page: one currency each, and none equal to a CAD figure plus a USD figure (BR-4). */
const figures = (p: Page) => p.locator("[data-figure]").allInnerTexts();
const oneCurrency = (t: string) => (t.match(/\b(CAD|USD)\b/g) ?? []).length === 1;
const TRUST = /\btrust\b|\bdeposit\b|to move/i;
const axeAll: string[] = [];

let failed = 0;
try {
  // ---------------------------------------------------------------------------------------------- L1, DW7, DW9 on the list
  const po = await tab(TOWNER); await list(po);
  const menu = await po.locator('nav[aria-label="Money"] [data-money-menu]').allInnerTexts();
  ok("FO-7s1 L1: the Money area's menu offers Invoices, and the list shows this run's CAD and USD invoices with their numbers and status words",
    JSON.stringify(menu) === JSON.stringify(["Invoices"]) && (await po.locator(`[data-invoice-row="${cadNo}"]`).count()) === 1 && (await po.locator(`[data-invoice-row="${usdNo}"]`).count()) === 1
    && (await po.locator(`[data-invoice-row="${cadNo}"]`).getByText("Open").count()) === 1, { menu });
  const figs = await figures(po);
  const cadRow = await po.locator(`[data-invoice-row="${cadNo}"] [data-balance]`).innerText(), usdRow = await po.locator(`[data-invoice-row="${usdNo}"] [data-balance]`).innerText();
  const sumWord = money(138500 + 50000, "CAD"), sumWordUsd = money(138500 + 50000, "USD");
  ok("FO-7s1 DW7 pass: every figure on the list carries exactly one currency; the CAD row is CAD 1,385.00, the USD row USD 500.00; no figure is their sum and there is no total row",
    figs.length > 0 && figs.every(oneCurrency) && cadRow === "CAD 1,385.00" && usdRow === "USD 500.00" && !figs.some((t) => t === sumWord || t === sumWordUsd) && (await po.getByText(/^Total of|^Totals?:/).count()) === 0, { cadRow, usdRow, n: figs.length });
  await po.evaluate((w) => { const s = document.createElement("span"); s.setAttribute("data-figure", ""); s.textContent = w; document.querySelector("main")?.appendChild(s); }, sumWord);
  ok("FO-7s1 DW7 fail: the same scan catches a planted figure that adds the CAD and USD invoices", (await figures(po)).some((t) => t === sumWord));
  await po.reload(); await list(po);
  const listText = await po.locator("main").innerText();
  ok("FO-7s1 DW9 pass: trust not answered: no trust word on the list", !TRUST.test(listText));
  ok("FO-7s1 DW9 fail: the same scan catches a planted trust word", TRUST.test(`${listText} Paid from trust`));
  await shot(po, "list-1440"); axeAll.push(...(await serious(po)).map((x) => `list-1440: ${x}`));
  await po.locator("[data-filter-status]").selectOption("PAID");
  await po.waitForURL(/status=PAID/);
  await po.locator("[data-invoice-row], [data-empty]").first().waitFor();
  const paidWords = await po.locator("[data-invoice-row] td:last-child").allInnerTexts();
  ok("FO-7s1 L1: Status Paid goes in the address and shows only Paid invoices (or the no-match words); this run's open invoices are gone",
    po.url().includes("status=PAID") && paidWords.every((w) => w.trim() === "Paid") && (await po.locator(`[data-invoice-row="${cadNo}"]`).count()) === 0
    && (paidWords.length > 0 || (await po.locator("[data-empty]").innerText()) === "No invoices match these filters."), { paidWords });
  await po.locator("[data-clear-filters]").click(); await po.locator(`[data-invoice-row="${cadNo}"]`).waitFor();
  ok("FO-7s1 L1: Clear filters empties the address and the open invoices come back", !po.url().includes("status=") && (await po.locator(`[data-invoice-row="${cadNo}"]`).count()) === 1);
  await list(po, "?issuedFrom=2026-12-01&issuedTo=2026-11-01").catch(() => undefined);
  await po.locator("[data-filter-to]").waitFor();
  ok("FO-7s1 L1 fail: Issued from after Issued to is said on the field in words (no code names, no request)",
    (await po.locator("[data-filter-to]").getAttribute("aria-invalid")) === "true" && (await po.getByText("Choose a date on or after Issued from.").count()) === 1 && !/issuedFrom/.test(await po.locator("main").innerText()));
  await list(po, "?issuedFrom=2999-01-01");
  ok("FO-7s1 L1 fail: filters that match nothing say so in words, with Clear filters", (await po.locator("[data-empty]").innerText()) === "No invoices match these filters." && (await po.locator("[data-clear-filters]").count()) === 1);
  const pr = await tab(TRO); await list(pr);
  ok("FO-7s1 L1 fail: a person without agent/invoice:list (Read only) sees \"You don't have access to invoices.\", no rows and no Money menu",
    (await pr.locator("[data-invoices-refused]").innerText()) === "You don't have access to invoices." && (await pr.locator("[data-invoice-row]").count()) === 0 && (await pr.locator('nav[aria-label="Money"]').count()) === 0);

  // ---------------------------------------------------------------------------------------------- DW3, DW1, DW6 on the detail
  await detail(po, cad);
  const acts = await po.locator("[data-action]").evaluateAll((els) => els.map((e) => e.getAttribute("data-action")));
  ok("FO-7s1 DW3 pass: the issued invoice offers \"Use a credit note\" and Download PDF, says it can't be edited, and has no edit or Record payment control",
    JSON.stringify(acts) === JSON.stringify(["CREDIT_NOTE", "DOWNLOAD_PDF"]) && (await po.getByRole("button", { name: "Use a credit note" }).count()) === 1
    && (await po.locator("[data-frozen]").innerText()) === "Issued invoices can't be edited — use a credit note." && (await po.getByRole("button", { name: /^edit|record payment/i }).count()) === 0 && (await po.locator("main input").count()) === 0, { acts });
  const govTax = await po.locator('[data-line="GOVERNMENT_FEE"] [data-line-tax]').innerText(), feeTax = await po.locator('[data-line="FEE"] [data-line-tax]').innerText();
  ok("FO-7s1 DW1 (part 1): the government-fee line says \"Government fees are never taxed\" with no tax figure; the Fee line shows CAD 130.00 (13%); the total is the API's CAD 1,385.00",
    govTax === "Government fees are never taxed" && feeTax === "CAD 130.00 (13%)" && (await po.locator("[data-total]").innerText()) === "CAD 1,385.00", { govTax, feeTax });
  const dText = await po.locator("main").innerText();
  ok("FO-7s1 DW9 pass: trust not answered: no trust word on the detail", !TRUST.test(dText));
  await shot(po, "detail-1440"); axeAll.push(...(await serious(po)).map((x) => `detail-1440: ${x}`));
  // the credit note, through the panel
  await po.getByRole("button", { name: "Use a credit note" }).click();
  await po.locator("[data-credit-amount]").fill("100.00"); await po.locator("[data-credit-reason]").fill(`Goodwill ${run}`);
  axeAll.push(...(await serious(po, '[role="dialog"]')).map((x) => `panel: ${x}`));
  await shot(po, "credit-note-panel-1440");
  await po.locator("[data-credit-save]").click();
  await po.locator('[role="dialog"]').waitFor({ state: "detached", timeout: 15_000 }).catch(() => undefined);
  const after = await api(TOWNER, "GET", `${M}/${cad}/detail`);
  await po.locator("[data-credit-note]").first().waitFor({ timeout: 15_000 });
  ok("FO-7s1 DW3 pass: a part credit note of CAD 100.00 issues: one credit note in the database, and the balance shown is the API's (CAD 1,285.00)",
    sql(`select count(*) from money_credit_note where invoice_id = '${cad}'`) === "1" && after.body?.invoice?.dueMinor === 128500 && (await po.locator("[data-balance]").innerText()) === "CAD 1,285.00", [after.body?.invoice?.dueMinor]);
  await po.getByRole("button", { name: "Use a credit note" }).click();
  await po.locator("[data-credit-amount]").fill("99999.00"); await po.locator("[data-credit-reason]").fill("Too much");
  await po.locator("[data-credit-save]").click();
  await po.locator("[data-credit-problem]").waitFor({ timeout: 15_000 });
  ok("FO-7s1 DW3 fail: more than can be credited is refused in the API's words on the panel, and nothing is written", (await po.locator("[data-credit-problem]").innerText()).length > 0 && sql(`select count(*) from money_credit_note where invoice_id = '${cad}'`) === "1",
    await po.locator("[data-credit-problem]").innerText());
  await po.locator("[data-credit-amount]").fill("5,50");
  const reads = await po.locator("[data-credit-reads]").count();
  await po.locator("[data-credit-save]").click();
  const amountErr = await po.locator("[data-credit-amount]").getAttribute("aria-invalid");
  ok("FO-7s1 B1 fail (browser): \"5,50\" is refused on the field in words before anything is sent, the old refusal is gone, and no credit note is written",
    amountErr === "true" && reads === 0 && (await po.locator("[data-credit-problem]").count()) === 0 && sql(`select count(*) from money_credit_note where invoice_id = '${cad}'`) === "1");
  await po.locator("[data-credit-amount]").fill("5.50"); await po.locator("[data-credit-reason]").fill("");
  const readsOk = await po.locator("[data-credit-reads]").innerText().catch(() => "");
  await po.locator("[data-credit-save]").click();
  ok("FO-7s1 B1 pass (browser): \"5.50\" reads back as \"This credit note: CAD 5.50\" before Save; an empty reason is asked for in words, nothing sent",
    readsOk === "CAD 5.50" && (await po.locator("[data-credit-reason]").getAttribute("aria-invalid")) === "true" && sql(`select count(*) from money_credit_note where invoice_id = '${cad}'`) === "1", { readsOk });
  await po.keyboard.press("Escape"); await po.locator('[role="dialog"]').waitFor({ state: "detached" }).catch(() => undefined);
  await detail(po, draft);
  ok("FO-7s1 DW3 fail: a draft offers no credit note, no PDF and no number (\"Draft\")", (await po.locator("[data-action]").count()) === 0 && (await po.locator("[data-invoice-number]").innerText()) === "Draft");
  const pc = await tab(TOFF); await detail(pc, cad);
  ok("FO-7s1 DW6 pass: the Case Officer (no agent/invoice:void) sees the invoice with Download PDF only: no \"Use a credit note\", no Record payment",
    JSON.stringify(await pc.locator("[data-action]").evaluateAll((els) => els.map((e) => e.getAttribute("data-action")))) === JSON.stringify(["DOWNLOAD_PDF"]) && (await pc.getByRole("button", { name: /credit note|record payment/i }).count()) === 0);
  await pc.route(`**/api${M}/${cad}/detail`, async (route) => { const r = await route.fetch(); const j = await r.json(); j.allowedActions = [...j.allowedActions, "PAY_FROM_TRUST", "WRITE_OFF"]; await route.fulfill({ response: r, json: j }); });
  await detail(pc, cad);
  ok("FO-7s1 DW6 fail: actions FO-7q does not name (PAY_FROM_TRUST, WRITE_OFF injected into the answer) are never shown", (await pc.locator("[data-action]").count()) === 1 && (await pc.getByRole("button", { name: /trust|write off/i }).count()) === 0);
  await pc.unroute(`**/api${M}/${cad}/detail`);
  await detail(po, "00000000-0000-4000-8000-000000000000");
  ok("FO-7s1 L1 fail: an unknown invoice is a plain not found, never CAD 0", (await po.locator("[data-invoice-missing]").count()) === 1 && !/CAD 0/.test(await po.locator("main").innerText()));

  // ---------------------------------------------------------------------------------------------- DW10
  const pk = await tab(TOWNER); await list(pk);
  const link = pk.locator(`[data-invoice-row="${cadNo}"] [data-invoice-link]`); await reach(pk, link); await pk.keyboard.press("Enter");
  await pk.locator("[data-invoice-number]").waitFor();
  const cn = pk.getByRole("button", { name: "Use a credit note" }); await reach(pk, cn); await pk.keyboard.press("Enter");
  await pk.locator('[role="dialog"]').waitFor();
  const onFirst = await pk.locator("[data-credit-part]").evaluate((el) => el === document.activeElement);
  await pk.keyboard.press("Escape"); await pk.locator('[role="dialog"]').waitFor({ state: "detached" });
  let back = false; for (let i = 0; i < 20 && !back; i++) { back = await cn.evaluate((el) => el === document.activeElement); if (!back) await pk.waitForTimeout(100); }
  ok("FO-7s1 DW10 pass: keyboard only: Tab to the invoice and Enter opens it; Tab to \"Use a credit note\" and Enter opens the panel on its first field; Escape returns focus to the button", onFirst && back, { onFirst, back });
  for (const w of [375, 1024]) {
    const pw = await tab(TOWNER, w);
    await list(pw); const l = await sideways(pw);
    const small = await pw.locator('nav[aria-label="Money sections"]').isVisible(), side = await pw.locator('nav[aria-label="Money"]').isVisible();
    ok(`FO-7s1 DW10: at ${w} px the Money menu is ${w < 768 ? "a row at the top of the page, not a side column" : "the side column"}`, w < 768 ? small && !side : side && !small, { small, side }); axeAll.push(...(await serious(pw)).map((x) => `list-${w}: ${x}`)); await shot(pw, `list-${w}`);
    await detail(pw, cad); const d = await sideways(pw); axeAll.push(...(await serious(pw)).map((x) => `detail-${w}: ${x}`)); await shot(pw, `detail-${w}`);
    ok(`FO-7s1 DW10 pass: at ${w} px the list and the detail have no sideways scroll, and the balance and status stay in view`, !l && !d && (await pw.locator("[data-balance]").isVisible()) && (await pw.locator("[data-invoice-status]").isVisible()), { l, d });
  }
  ok("FO-7s1 DW10 pass: axe-core finds 0 serious or critical (WCAG 2.2 A/AA) on the list, the detail and the credit-note panel at 375, 1024 and 1440 px", axeAll.length === 0, axeAll);
  await pk.evaluate(() => { const i = document.createElement("input"); document.querySelector("main")?.appendChild(i); });
  ok("FO-7s1 DW10 fail: the same axe run finds an unlabelled field we add", (await serious(pk)).some((x) => x.startsWith("label")));
  ok("FO-7s1: no page error in any tab", errs.length === 0, errs);
} catch (e) { failed++; ok(`FO-7s1: the walk stopped: ${(e as Error).message.split("\n")[0]}`, false); }
finally {
  await api(TOWNER, "PATCH", `/platform/staff/${ADM}/roles`, { roles: ["CASE_MANAGER"], reason: "FO-7s1 check: put user-T back" });
  await browser.close();
}
process.exit(summary() || failed ? 1 : 0);
