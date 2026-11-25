// FO-7s3a part 1 (R1.58; concept screens/fo-7s-money/concept-payments.md (c); AG-6-19 r1-3, AG-6-21 r2-3, AG-6-63 r7,
// AG-6-1 §8 C5, AG-6-59 r5): recording a payment with trust off, walked in a browser on an isolated copy (its own database and
// port, never :4400), against FO-7b's and FO-7q's real routes, with the database read underneath. Each line a pass and a fail:
//   W1 (part 1 walk) a Billing person who can see Client B opens the invoice (CAD 2,655.50, Sample from AG-6-19's test),
//       records a cheque of 1,000.00 with the keyboard, sees the receipt number and "Not yet cleared", the invoice "Part paid"
//       with CAD 1,655.50 due, then the payment in Payments and on its detail page;
//   DW3 (extra money, never refused) CAD 1,855.50 on CAD 1,655.50 due is recorded in full, "CAD 200.00 extra", Keep as
//       credit puts CAD 200.00 on the credit ledger; fail: no refusal words anywhere on the way;
//   DW4 (double submit) two fast clicks of Record in one opening make one payment and one receipt; a new opening a new key;
//   DW5 (duplicate reference) reference 4471 again warns in AG-6-19's words; Close records nothing; Record anyway records;
//   DW1 (part 1's half: trust words) with trust Unanswered no trust word on the panel, the list or the detail, no "Received
//       into"; fail: the scan catches a planted one;
//   DW10 (C5) a Case Officer who cannot see the party finds no row for its payments, and the payment's address is a plain
//       "not found" with no amount; the Billing person, once out of view, the same;
//   DW11 (methods) the panel lists AG-6-19's seven methods and no "Card";
//   K keyboard only, axe-core 0 serious (WCAG 2.2 A/AA) on the panel, the list and the detail, 375/1024/1440 px no sideways scroll.
// Sample firm and Sample figures only; re-runnable (each run makes its own invoices). US$0, no model call; live AI off.
// Screenshots (deviceScaleFactor 1) in product/screens/fo-7s-money/build/. Run from prototype/:
//   zsh studio/tools/isolated.sh fo7s3a 4752 start AI_LIVE=off PLATFORM_IDENTITY=local && trap 'zsh studio/tools/isolated.sh fo7s3a 4752 stop' EXIT && tsx studio/tests/check_fo7s3a_payments_trust_browser.ts 4752 xr_studio_fo7s3a
import { existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { chromium, type Browser, type Locator, type Page } from "playwright";
import { seedSampleFirmsFrontOffice } from "../api/src/front-office/firm-seed.ts";
import { cleanReference, METHODS, paymentStatus } from "../web/src/modules/client-money/payments/contract.ts";
import { client, recorder } from "./runtime/api.ts";
const { default: AxeBuilder } = createRequire(import.meta.url)("@axe-core/playwright") as typeof import("@axe-core/playwright");

const [PORT, DBNAME] = [Number(process.argv[2] ?? 4752), process.argv[3] ?? "xr_studio_fo7s3a"];
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
const M = "/front-office/money";

// ------------------------------------------------------------------------------------------------ setup (Sample)
await api(null, "GET", "/platform/me");   // the app seeds the Sample firms at start; this only waits for it
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://xr_studio@127.0.0.1:54329/${DBNAME}`, options: "-c TimeZone=UTC" }) });
await seedSampleFirmsFrontOffice(db); await db.$disconnect();
const A = sql(`select id from platform_firm where key = 'sample-firm'`), run = Date.now().toString(36).slice(-5);
if (sql(`select count(*) from money_payment_settings where firm_id = '${A}'`) === "0") sql(`insert into money_payment_settings (firm_id, updated_by, updated_at) values ('${A}', 'seed:FO-7s3a', now())`);
sql(`update money_payment_settings set tax_registered = true, tax_number = coalesce(tax_number, '123456789RT0001 (Sample)') where firm_id = '${A}'`);
const TOWNER = await signIn("sample-firm", "user-R"), TOFF = await signIn("sample-firm", "user-O");
const staffOf = (actor: string) => sql(`select id from platform_staff where actor_id = '${actor}' and firm_id = '${A}'`);
const BIL = staffOf("user-T");
const role = await api(TOWNER, "PATCH", `/platform/staff/${BIL}/roles`, { roles: ["BILLING_FINANCE"], reason: "FO-7s3a check: a Billing person" });
const TBILL = await signIn("sample-firm", "user-T");
const person = (n: string) => sql(`insert into fo_person (id, firm_id, given_names, family_name, email, created_by, updated_at) values (gen_random_uuid(), '${A}', 'Client ${n}', 'Sample', 'fo7s3a.${run}.${n.toLowerCase()}@example.org', 'seed:FO-7s3a', now()) returning id`);
// C5 (CS-MV1): a party is visible when it is the subject of a prospect the person may see: Client B's is owned by the Billing
// person and the Owner (not the Case Officer); Client H's by the Billing person only, removed later (DW10).
const PB = person("B"), PH = person("H");
let pn = 0;
const prospect = (who: string, owner: string) => sql(`set session_replication_role = replica; insert into fo_prospect (id, firm_id, number, lead_id, type, stage_id, subject_person_id, subject_company_id, primary_contact_person_id, owner_staff_id, created_by, updated_at)
    values (gen_random_uuid(), '${A}', 'P-${String(10000 + ((Date.now() + 7919 * ++pn) % 89999))}', gen_random_uuid(), 'INDIVIDUAL', gen_random_uuid(), '${who}', null, '${who}', '${staffOf(owner)}', 'seed:FO-7s3a', now())`);
prospect(PB, "user-T"); prospect(PB, "user-R"); prospect(PH, "user-T");
// INV-… of CAD 2,655.50 (AG-6-19's test figure, Sample): a Fee of 2,350.00 at 13 % HST.
const invoice = async (who: string) => {
  const d = await api(TOWNER, "POST", `${M}/invoices`, { personId: who, currency: "CAD" });
  await api(TOWNER, "POST", `${M}/invoices/${d.body?.id}/lines`, { kind: "FEE", description: `Work permit ${run}`, unitMinor: 235000, ratePpm: 130000 });
  await api(TOWNER, "POST", `${M}/invoices/${d.body?.id}/issue`);
  return d.body?.id as string;
};
const INV = await invoice(PB), INV2 = await invoice(PB), INVH = await invoice(PH);
const no = (id: string) => sql(`select number from money_invoice where id = '${id}'`);
const total = String((await api(TOWNER, "GET", `${M}/invoices/${INV}/detail`)).body?.invoice?.totalMinor);
const trust = sql(`select trust_answer from money_payment_settings where firm_id = '${A}'`);
ok("FO-7s3a setup: three invoices of CAD 2,655.50 issued (two for Client B, one for Client H); user-T is a Billing person; trust Unanswered",
  /^INV-/.test(no(INV)) && total === "265550" && role.status === 200 && trust === "UNANSWERED", { total, role: role.status, trust });
const pays = (id: string) => sql(`select count(*) from money_payment where invoice_id = '${id}'`);

// ------------------------------------------------------------------------------------------------ the browser
const browser: Browser = await chromium.launch({ headless: process.env.HEADED !== "1", ...(existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : process.platform === "darwin" ? { channel: "chrome" } : {}) });
const errs: string[] = [];
const tab = async (token: string, width = 1440) => {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1, colorScheme: "light", reducedMotion: "reduce" });
  await ctx.addInitScript((t) => { sessionStorage.setItem("xr-staff-session", JSON.stringify({ token: t, expiresAt: Date.now() + 3_600_000 })); }, token);
  const p = await ctx.newPage(); p.on("pageerror", (e) => errs.push(e.message));
  p.on("dialog", (d) => void d.accept().catch(() => undefined));   // "Discard this payment?": yes
  return p;
};
const detail = async (p: Page, id: string) => { await p.goto(`${BASE}/money/invoices/${id}`); await p.locator("[data-invoice-number], [data-invoice-missing]").first().waitFor({ timeout: 60_000 }); };
const payments = async (p: Page) => { await p.goto(`${BASE}/money/payments`); await p.locator("[data-payment-row], [data-empty], [data-payments-refused]").first().waitFor({ timeout: 60_000 }); };
const shot = (p: Page, name: string) => p.screenshot({ path: join(SHOTS, `fo7s3a-${name}.png`), fullPage: true });
const serious = async (p: Page, scope = "main") => (await p.waitForTimeout(300), await new AxeBuilder({ page: p }).include(scope).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze()).violations
  .filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.nodes[0]?.target}`);
const sideways = (p: Page) => p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
const reach = async (p: Page, target: Locator, max = 80) => {
  for (let i = 0; i < max; i++) { if (await target.evaluate((el) => el === document.activeElement).catch(() => false)) return; await p.keyboard.press("Tab"); }
  throw new Error("not reached by Tab");
};
const open = async (p: Page) => { await p.getByRole("button", { name: "Record payment…" }).click(); await p.locator("[data-pay-method]").waitFor(); };
const fill = async (p: Page, method: string, amount: string, reference = "") => {
  await p.locator("[data-pay-method]").selectOption(method); await p.locator("[data-pay-amount]").fill(amount); await p.locator("[data-pay-reference]").fill(reference);
};
const TRUST = /\btrust\b|\bdeposit\b|to move|received into/i, REFUSAL = /can't be recorded|refused|not recorded|too much|more than (is )?due/i;
const axeAll: string[] = [];

let failed = 0;
try {
  // ---------------------------------------------------------------------------------------------- W1, DW11, DW1, K: the walk
  const pb = await tab(TBILL);
  await payments(pb);
  const link = pb.locator('nav[aria-label="Money"] [data-money-menu="Payments"]');
  ok("FO-7s3a W1: the Billing person's Money menu offers Payments", (await link.count()) === 1, await pb.locator('nav[aria-label="Money"] [data-money-menu]').allInnerTexts());
  await detail(pb, INV);
  const rec = pb.getByRole("button", { name: "Record payment…" });
  await reach(pb, rec); await pb.keyboard.press("Enter");
  await pb.locator("[data-pay-method]").waitFor();
  const methods = await pb.locator("[data-pay-method] option").allInnerTexts();
  ok("FO-7s3a DW11 pass: the panel lists AG-6-19's seven methods in words (Bank transfer, Wire, Cheque, Cash, e-Transfer, Card terminal, Other)",
    JSON.stringify(methods.slice(1)) === JSON.stringify(METHODS.map((m) => m.word)), methods);
  ok("FO-7s3a DW11 fail: no method reads \"Card\" alone (a card payment comes only from the card webhook)", !methods.some((m) => m.trim() === "Card"));
  const panelText = await pb.locator('[role="dialog"]').innerText();
  ok("FO-7s3a DW1 pass (part 1): trust Unanswered: no trust word and no \"Received into\" in the panel", !TRUST.test(panelText));
  ok("FO-7s3a DW1 fail: the same scan catches a planted trust word", TRUST.test(`${panelText} Received into: Trust`));
  // keyboard only: the method by arrow keys, then the fields by Tab
  await reach(pb, pb.locator("[data-pay-method]")); await pb.keyboard.type("Cheque");   // a closed select's type-ahead
  ok("FO-7s3a K: the method is chosen by keyboard type-ahead", (await pb.locator("[data-pay-method]").inputValue()) === "CHEQUE");
  await reach(pb, pb.locator("[data-pay-amount]")); await pb.keyboard.type("1,000.00");
  await reach(pb, pb.locator("[data-pay-reference]")); await pb.keyboard.type("4471");
  const readBack = await pb.locator("[data-pay-reads]").innerText();
  axeAll.push(...(await serious(pb, '[role="dialog"]')).map((x) => `panel: ${x}`)); await shot(pb, "record-1440");
  await reach(pb, pb.locator("[data-pay-save]")); await pb.keyboard.press("Enter");
  await pb.locator("[data-pay-done]").waitFor({ timeout: 20_000 });
  const receipt = await pb.locator("[data-pay-receipt]").innerText(), invStatus = await pb.locator("[data-pay-invoice-status]").innerText();
  const p1 = sql(`select p.id || ' ' || p.method || ' ' || p.amount_minor || ' ' || p.cleared || ' ' || p.received_into || ' ' || r.number from money_payment p join money_receipt r on r.payment_id = p.id where p.invoice_id = '${INV}'`).split(" ");
  ok("FO-7s3a W1 pass: a cheque of CAD 1,000.00 (read back before Record) is recorded once: \"R-… recorded · Receipt emailed to Client B Sample\", Not yet cleared, received into operating",
    readBack === "CAD 1,000.00" && /^R-\d+ recorded · (Receipt emailed to Client B Sample|No email address on file for Client B Sample: the receipt was not emailed|The receipt email could not be sent now)$/.test(receipt)
    && receipt.startsWith(p1[5]) && p1[1] === "CHEQUE" && p1[2] === "100000" && p1[3] === "false" && p1[4] === "OPERATING" && (await pb.locator("[data-pay-uncleared]").count()) === 1, { readBack, receipt, p1 });
  ok("FO-7s3a W1 pass: the panel says the invoice is now \"Part paid · Balance due CAD 1,655.50\"", invStatus === "Part paid · Balance due CAD 1,655.50", invStatus);
  await shot(pb, "recorded-1440");
  await pb.locator("[data-pay-close]").click(); await pb.locator('[role="dialog"]').waitFor({ state: "detached" });
  await pb.locator("[data-invoice-status]").getByText("Part paid").waitFor({ timeout: 15_000 });
  ok("FO-7s3a W1 pass: the invoice page reads Part paid with Balance due CAD 1,655.50 and lists the payment", (await pb.locator("[data-balance]").innerText()) === "CAD 1,655.50" && (await pb.locator("[data-payment]").count()) === 1);
  // the payment in Payments, then its page
  await payments(pb);
  const row = pb.locator(`[data-payment-row="${p1[5]}"]`);
  ok("FO-7s3a W1 pass: Money → Payments lists it: receipt, Cheque, CAD 1,000.00, the invoice, Not yet cleared, Recorded; no \"Received into\" column with trust off",
    (await row.count()) === 1 && /Cheque/.test(await row.innerText()) && /CAD 1,000\.00/.test(await row.innerText()) && (await row.innerText()).includes(no(INV)) && /Not yet cleared/.test(await row.innerText())
    && !TRUST.test(await pb.locator("main").innerText()), await row.innerText().catch(() => ""));
  axeAll.push(...(await serious(pb)).map((x) => `list-1440: ${x}`)); await shot(pb, "payments-1440");
  await reach(pb, row.locator("[data-payment-link]")); await pb.keyboard.press("Enter");
  await pb.locator("[data-payment-receipt]").waitFor();
  const facts = Object.fromEntries(await pb.locator("[data-fact]").evaluateAll((els) => els.map((e) => [e.getAttribute("data-fact"), (e as HTMLElement).innerText])));
  ok("FO-7s3a W1 pass: the payment's page shows Cheque, CAD 1,000.00, reference 4471, the invoice, its receipt, Not yet cleared and nothing refunded; no trust word",
    facts.method === "Cheque" && facts.amount === "CAD 1,000.00" && facts.reference === "4471" && facts.for === no(INV) && facts.receipt === p1[5] && facts.cleared === "Not yet cleared"
    && (await pb.locator("[data-no-refunds]").count()) === 1 && !TRUST.test(await pb.locator("main").innerText()), facts);
  axeAll.push(...(await serious(pb)).map((x) => `detail-1440: ${x}`)); await shot(pb, "payment-1440");

  // ---------------------------------------------------------------------------------------------- DW5 duplicate reference
  await detail(pb, INV); await open(pb); await fill(pb, "CHEQUE", "1.00", "4471");
  await pb.locator("[data-pay-save]").click(); await pb.locator("[data-pay-ask]").waitFor({ timeout: 15_000 });
  const askWords = await pb.locator("[data-pay-ask]").innerText();
  ok("FO-7s3a DW5 pass: reference 4471 again warns in AG-6-19's words and records nothing yet",
    askWords === "A payment with reference 4471 is already recorded on this invoice. Record anyway?" && pays(INV) === "1", askWords);
  await pb.locator('[role="dialog"]').getByRole("button", { name: "Close", exact: true }).last().click();   // the footer's Close (the corner X has the same name)
  await pb.locator('[role="dialog"]').waitFor({ state: "detached", timeout: 5_000 });
  ok("FO-7s3a DW5 fail: closing the warning (Close, then Discard) records nothing", pays(INV) === "1");
  await open(pb); await fill(pb, "CHEQUE", "1.00", "4471"); await pb.locator("[data-pay-save]").click(); await pb.locator("[data-pay-anyway]").waitFor();
  await pb.locator("[data-pay-anyway]").click(); await pb.locator("[data-pay-done]").waitFor({ timeout: 15_000 });
  ok("FO-7s3a DW5 pass: Record anyway records it: two payments with reference 4471, one receipt each", pays(INV) === "2" && sql(`select count(distinct r.number) from money_payment p join money_receipt r on r.payment_id = p.id where p.invoice_id = '${INV}' and p.reference = '4471'`) === "2");
  await pb.locator("[data-pay-close]").click(); await pb.locator('[role="dialog"]').waitFor({ state: "detached" });

  // ---------------------------------------------------------------------------------------------- B: the breaker's round 1
  ok("FO-7s3a B-M3 pass/fail: a reference is sent without invisible marks and with look-alike widths folded: \"Ab‏-4471\", \"A­b-4471\" and \"Ａｂ-4471\" are Ab-4471; a plain one is kept",
    ["Ab‏-4471", "A­b-4471", "Ａｂ-4471", " Ab-4471​ "].every((t) => cleanReference(t) === "Ab-4471") && cleanReference("4471 / cheque") === "4471 / cheque");
  await detail(pb, INV); await open(pb); await fill(pb, "CHEQUE", "1.00", "4471‏");
  await pb.locator("[data-pay-save]").click(); await pb.locator("[data-pay-ask]").waitFor({ timeout: 15_000 });
  ok("FO-7s3a B-M3 fail: 4471 with a right-to-left mark still asks \"Record anyway?\" (nothing recorded), and focus is on Record anyway (m4)",
    pays(INV) === "2" && (await pb.locator("[data-pay-anyway]").evaluate((el) => el === document.activeElement)));
  let asked = 0; const count = () => { asked++; }; pb.on("dialog", count);
  await pb.locator('[role="dialog"]').getByRole("button", { name: "Close", exact: true }).last().click();
  await pb.locator('[role="dialog"]').waitFor({ state: "detached", timeout: 5_000 }); pb.off("dialog", count);
  ok("FO-7s3a B-m1 fail: the footer's Close with typed data asks \"Discard this payment?\" first (as Escape and the X do)", asked === 1 && pays(INV) === "2", { asked });
  await open(pb); await fill(pb, "CASH", "21,474,836.48"); await pb.locator("[data-pay-save]").click();
  ok("FO-7s3a B-m2 fail: an amount above FO-7b's limit is refused on the field before anything is sent", (await pb.locator("[data-pay-amount]").getAttribute("aria-invalid")) === "true" && /too large/.test(await pb.locator('[role="dialog"]').innerText()) && pays(INV) === "2");
  // M1: the POST reaches the API and its answer is lost on the way back
  await fill(pb, "CASH", "1.00", `M1-${run}`);
  await pb.route(`**/api${M}/invoices/${INV}/payments`, async (r) => { await r.fetch(); await r.abort("connectionreset"); }, { times: 1 });
  await pb.locator("[data-pay-save]").click(); await pb.locator("[data-pay-unsure]").waitFor({ timeout: 15_000 });
  ok("FO-7s3a B-M1 fail: an answer lost after the payment was recorded never says \"Not recorded\": \"No answer came back … recorded once at most\", the fields held as sent",
    pays(INV) === "3" && (await pb.locator("[data-pay-problem]").count()) === 0 && (await pb.locator("[data-pay-amount]").getAttribute("readonly")) !== null && (await pb.locator("[data-pay-method]").isDisabled()));
  await pb.locator("[data-pay-save]").click(); await pb.locator("[data-pay-done]").waitFor({ timeout: 15_000 });
  ok("FO-7s3a B-M1 pass: Record again answers the payment already recorded (\"not recorded twice\"): still one payment for it", pays(INV) === "3" && (await pb.locator("[data-pay-replayed]").count()) === 1 && sql(`select count(*) from money_payment where invoice_id = '${INV}' and reference = 'M1-${run}'`) === "1");
  await pb.locator("[data-pay-close]").click(); await pb.locator('[role="dialog"]').waitFor({ state: "detached" });
  // M2: west of UTC in the evening the person's day is still today, not the UTC tomorrow
  const west = await (async () => { const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, timezoneId: "America/Vancouver", deviceScaleFactor: 1 });
    await ctx.addInitScript((t) => { sessionStorage.setItem("xr-staff-session", JSON.stringify({ token: t, expiresAt: Date.now() + 3_600_000 })); }, TBILL);
    const p = await ctx.newPage(); p.on("dialog", (d) => void d.accept().catch(() => undefined)); return p; })();
  const utcDay = new Date().toISOString().slice(0, 10);
  await west.clock.setFixedTime(new Date(`${utcDay}T05:30:00Z`));   // 21:30 the evening before in Vancouver
  await detail(west, INV2); await open(west);
  const prev = new Date(Date.parse(`${utcDay}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
  const dflt = await west.locator("[data-pay-date]").inputValue(), max = await west.locator("[data-pay-date]").getAttribute("max");
  ok("FO-7s3a B-M2 fail: at 21:30 in Vancouver (05:30 UTC) the date defaults to the person's day, not the UTC tomorrow; the latest day offered is FO-7b's", dflt === prev && max === utcDay, { dflt, max, prev });
  await west.context().close();

  // ---------------------------------------------------------------------------------------------- DW4 double submit
  await detail(pb, INV2); await open(pb); await fill(pb, "E_TRANSFER", "100.00", `DW4-${run}`);
  await pb.locator("[data-pay-save]").evaluate((b) => { (b as HTMLButtonElement).click(); (b as HTMLButtonElement).click(); });
  await pb.locator("[data-pay-done]").waitFor({ timeout: 15_000 });
  const keys1 = sql(`select count(*) || ':' || count(distinct idempotency_key) from money_payment where invoice_id = '${INV2}'`);
  ok("FO-7s3a DW4 pass: two fast clicks of Record in one opening make one payment and one receipt", keys1 === "1:1" && sql(`select count(*) from money_receipt r join money_payment p on p.id = r.payment_id where p.invoice_id = '${INV2}'`) === "1", keys1);
  // the same opening's key, sent again by the API: a replay, never a second payment
  const k = sql(`select idempotency_key from money_payment where invoice_id = '${INV2}'`);
  const again = await api(TBILL, "POST", `${M}/invoices/${INV2}/payments`, { method: "E_TRANSFER", amountMinor: 10000, currency: "CAD", reference: `DW4-${run}`, idempotencyKey: k });
  ok("FO-7s3a DW4 fail: the opening's key sent again is a replay (replayed: true), no second payment", again.body?.replayed === true && pays(INV2) === "1", { status: again.status, replayed: again.body?.replayed });
  await pb.locator("[data-pay-close]").click(); await pb.locator('[role="dialog"]').waitFor({ state: "detached" });
  await open(pb); await fill(pb, "E_TRANSFER", "100.00", `DW4b-${run}`); await pb.locator("[data-pay-save]").click(); await pb.locator("[data-pay-done]").waitFor({ timeout: 15_000 });
  ok("FO-7s3a DW4 pass: a new opening makes a new key: a second payment", sql(`select count(*) || ':' || count(distinct idempotency_key) from money_payment where invoice_id = '${INV2}'`) === "2:2");
  await pb.locator("[data-pay-close]").click(); await pb.locator('[role="dialog"]').waitFor({ state: "detached" });

  // ---------------------------------------------------------------------------------------------- DW3 extra money
  await detail(pb, INV);
  const dueNow = await pb.locator("[data-balance]").innerText();
  await open(pb); await fill(pb, "BANK_TRANSFER", (Number(dueNow.replace(/[^\d.]/g, "")) + 200).toFixed(2), `DW3-${run}`);
  const seen: string[] = [];
  await pb.locator("[data-pay-save]").click(); await pb.locator("[data-pay-done]").waitFor({ timeout: 15_000 }); seen.push(await pb.locator('[role="dialog"]').innerText());
  const extra = await pb.locator("[data-pay-extra]").innerText();
  ok(`FO-7s3a DW3 pass: CAD 200.00 more than the ${dueNow} due is recorded in full and shows "CAD 200.00 extra" with Keep as credit (trust off: no trust choice)`,
    /^CAD 200\.00 extra/.test(extra) && (await pb.locator("[data-pay-keep]").count()) === 1 && !TRUST.test(extra) && (await pb.locator("[data-pay-invoice-status]").innerText()).startsWith("Paid"), { extra });
  await pb.locator("[data-pay-keep]").click(); await pb.locator("[data-pay-kept]").waitFor({ timeout: 15_000 }); seen.push(await pb.locator('[role="dialog"]').innerText());
  const credit = sql(`select coalesce(sum(amount_minor), 0) from money_credit_entry where person_id = '${PB}' and currency = 'CAD'`);
  ok("FO-7s3a DW3 pass: Keep as credit says \"CAD 200.00 kept as credit for Client B Sample.\" and the credit ledger holds CAD 200.00",
    (await pb.locator("[data-pay-kept]").innerText()) === "CAD 200.00 kept as credit for Client B Sample." && credit === "20000", { credit });
  ok("FO-7s3a DW3 fail: no step refused the amount (a scan for refusal words over every state of the panel finds none)", seen.every((t) => !REFUSAL.test(t)) && REFUSAL.test("CAD 1,855.50 can't be recorded"));
  await pb.locator("[data-pay-close]").click(); await pb.locator('[role="dialog"]').waitFor({ state: "detached" });

  // ---------------------------------------------------------------------------------------------- DW10 C5
  // C5 decides alone: "everyone sees all" off, so a person sees only the parties of the prospects they own (CS-MV1)
  const seesAll = (on: boolean) => sql(`delete from platform_firm_setting where firm_id = '${A}' and key = 'platform.everyone_sees_all'; insert into platform_firm_setting (firm_id, key, value, changed_by) values ('${A}', 'platform.everyone_sees_all', '${on}'::jsonb, 'seed:FO-7s3a')`);
  const before = sql(`select coalesce((select value::text from platform_firm_setting where firm_id = '${A}' and key = 'platform.everyone_sees_all'), 'none')`);
  seesAll(false);
  const hidPay = await api(TBILL, "POST", `${M}/invoices/${INVH}/payments`, { method: "CASH", amountMinor: 5000, currency: "CAD", idempotencyKey: `dw10-${run}-hid` });
  const hidReceipt = hidPay.body?.receiptNumber as string;
  const po = await tab(TOFF); await payments(po);
  ok("FO-7s3a DW10 fail: the Case Officer, who cannot see Client B or Client H, finds no row for their payments in Payments",
    hidPay.status === 201 && (await po.locator(`[data-payment-row="${p1[5]}"]`).count()) === 0 && (await po.locator(`[data-payment-row="${hidReceipt}"]`).count()) === 0);
  await po.goto(`${BASE}/money/payments/${p1[0]}`); await po.locator("[data-payment-missing], [data-payment-receipt]").first().waitFor({ timeout: 30_000 });
  ok("FO-7s3a DW10 fail: the Case Officer opening the payment's address gets the plain \"Payment not found\", no amount",
    (await po.locator("[data-payment-missing]").count()) === 1 && !/CAD/.test(await po.locator("main").innerText()));
  await payments(pb);
  ok("FO-7s3a DW10 pass: the Billing person, who can see Client H, finds its payment", (await pb.locator(`[data-payment-row="${hidReceipt}"]`).count()) === 1);
  sql(`delete from fo_prospect where firm_id = '${A}' and subject_person_id = '${PH}'`);
  await payments(pb);
  const hidId = hidPay.body?.id as string;
  ok("FO-7s3a DW10 fail: once Client H is out of the Billing person's view, the row is gone (visibility follows the case side's helper, not the role)", (await pb.locator(`[data-payment-row="${hidReceipt}"]`).count()) === 0);
  await pb.goto(`${BASE}/money/payments/${hidId}`); await pb.locator("[data-payment-missing], [data-payment-receipt]").first().waitFor({ timeout: 30_000 });
  ok("FO-7s3a DW10 fail: and its address is the plain \"Payment not found\", never CAD 0 or an amount", (await pb.locator("[data-payment-missing]").count()) === 1 && !/CAD/.test(await pb.locator("main").innerText()));

  // ---------------------------------------------------------------------------------------------- refusals in words, status words
  ok("FO-7s3a L pass/fail: a payment's status words: nothing refunded Recorded, all Refunded, part Part refunded",
    paymentStatus({ amountMinor: 100, refundedMinor: 0 }) === "Recorded" && paymentStatus({ amountMinor: 100, refundedMinor: 100 }) === "Refunded" && paymentStatus({ amountMinor: 100, refundedMinor: 40 }) === "Part refunded");
  await detail(pb, INV2); await open(pb); await pb.locator("[data-pay-save]").click();
  ok("FO-7s3a L fail: Record with no method and no amount asks for both on their fields in words, nothing sent",
    (await pb.locator("[data-pay-method]").getAttribute("aria-invalid")) === "true" && (await pb.locator("[data-pay-amount]").getAttribute("aria-invalid")) === "true" && pays(INV2) === "2");
  await fill(pb, "CASH", "5.00"); await pb.locator("[data-pay-date]").fill("2099-01-01"); await pb.locator("[data-pay-save]").click();
  await pb.locator("[data-pay-problem]").waitFor({ timeout: 15_000 });
  ok("FO-7s3a L fail: a date in the future is refused in the API's words on the panel, and nothing is written", /future/.test(await pb.locator("[data-pay-problem]").innerText()) && pays(INV2) === "2", await pb.locator("[data-pay-problem]").innerText());
  await pb.keyboard.press("Escape"); await pb.locator('[role="dialog"]').waitFor({ state: "detached", timeout: 5_000 });

  // ---------------------------------------------------------------------------------------------- K: widths, axe
  for (const w of [375, 1024]) {
    const pw = await tab(TBILL, w);
    await payments(pw); const l = await sideways(pw); axeAll.push(...(await serious(pw)).map((x) => `list-${w}: ${x}`)); await shot(pw, `payments-${w}`);
    await pw.goto(`${BASE}/money/payments/${p1[0]}`); await pw.locator("[data-payment-receipt]").waitFor(); const d = await sideways(pw); axeAll.push(...(await serious(pw)).map((x) => `detail-${w}: ${x}`)); await shot(pw, `payment-${w}`);
    await detail(pw, INV2); await open(pw); const pn2 = await sideways(pw); axeAll.push(...(await serious(pw, '[role="dialog"]')).map((x) => `panel-${w}: ${x}`)); await shot(pw, `record-${w}`);
    ok(`FO-7s3a K pass: at ${w} px Payments, the payment's page and the Record payment panel have no sideways scroll`, !l && !d && !pn2, { l, d, pn2 });
  }
  ok("FO-7s3a K pass: axe-core finds 0 serious or critical (WCAG 2.2 A/AA) on the panel, the list and the payment's page at 375, 1024 and 1440 px", axeAll.length === 0, axeAll);
  await pb.goto(`${BASE}/money/payments`); await pb.locator("[data-payment-row], [data-empty]").first().waitFor();
  await pb.evaluate(() => { const i = document.createElement("input"); document.querySelector("main")?.appendChild(i); });
  ok("FO-7s3a K fail: the same axe run finds an unlabelled field we add", (await serious(pb)).some((x) => x.startsWith("label")));
  ok("FO-7s3a: no page error in any tab", errs.length === 0, errs);
} catch (e) { failed++; ok(`FO-7s3a: the walk stopped: ${(e as Error).message.split("\n")[0]}`, false, process.env.DEBUG ? await Promise.all(browser.contexts().flatMap((c) => c.pages()).map((p, i) => p.screenshot({ path: `${process.env.DEBUG}/fail-${i}.png`, fullPage: true }).then(() => i).catch(() => -1))) : undefined); }
finally {
  await api(TOWNER, "PATCH", `/platform/staff/${BIL}/roles`, { roles: ["CASE_MANAGER"], reason: "FO-7s3a check: put user-T back" });
  await browser.close();
}
process.exit(summary() || failed ? 1 : 0);
