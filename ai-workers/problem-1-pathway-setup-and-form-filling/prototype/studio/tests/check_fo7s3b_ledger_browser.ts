// FO-7s3b part 1a (R1.58; concept screens/fo-7s-money/concept-trust.md (e), concept-invoices.md (a), concept.md BR-1, BR-3,
// BR-4; AG-6-60 r1-4, r6-8, AG-6-25 to -27, AG-6-59 r4-6; P-634 (1), P-653 (2), P-694): Money › Trust and a client's Money view,
// walked in a browser on an isolated copy (its own database and port, never :4400), against FO-7t's, FO-7v's, FO-7r's and
// FO-7q's real routes, with the database read underneath. Each line a pass and a fail:
//   DW8 (trust off) with trust Unanswered the Money menu has no Trust, /money/trust says only "not available", and a client's
//       Money view shows the summary with no trust section and no trust word; fail: the scan catches a planted one;
//   W1 (part 1a walk) the Owner answers Yes; the Billing person who can see Client B and Client R opens Money › Trust by the
//       keyboard from the menu, finds Client R below zero after a reversal, red and labelled, opens Client R's Money view and
//       sees the ledger's newest balance red with "Trust shortfall after a reversal";
//   DW7 (a negative figure only with its label) every negative trust figure on both pages is red and carries the label; fail:
//       a planted bare negative figure is caught;
//   DW3 (the ledger adds up; two currencies apart) Client B's newest CAD and USD running balances equal "Trust held" per
//       currency and the database's sums, and the two currencies are never added; fail: a wrong figure is caught;
//   DW9 (C5) the Billing person opens Client H (not theirs to see) and gets "Client not found" with no figure;
//   K keyboard, axe-core 0 serious (WCAG 2.2 A/AA) on both pages, 375/1024/1440 px no sideways scroll.
// Sample firm and Sample figures only; re-runnable (each run makes its own clients; trust is set Unanswered for DW8 and the firm's answer put back). US$0, no model call; live AI off.
// Screenshots (deviceScaleFactor 1) in product/screens/fo-7s-money/build/. Run from prototype/:
//   zsh studio/tools/isolated.sh fo7s3b 4753 start AI_LIVE=off PLATFORM_IDENTITY=local && tsx studio/tests/check_fo7s3b_ledger_browser.ts 4753 xr_studio_fo7s3b
import { existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { chromium, type Browser, type Locator, type Page } from "playwright";
import { seedSampleFirmsFrontOffice } from "../api/src/front-office/firm-seed.ts";
import { heldWords, SHORTFALL_LABEL } from "../web/src/modules/client-money/trust/contract.ts";
import { money } from "../web/src/modules/client-money/invoices/contract.ts";
import { client, recorder } from "./runtime/api.ts";
const { default: AxeBuilder } = createRequire(import.meta.url)("@axe-core/playwright") as typeof import("@axe-core/playwright");

const [PORT, DBNAME] = [Number(process.argv[2] ?? 4753), process.argv[3] ?? "xr_studio_fo7s3b"];
if (PORT === 4400 || DBNAME === "xr_studio_demo") { console.log("refused: never the demo on :4400"); process.exit(2); }
const BASE = `http://localhost:${PORT}`, STUDIO = join(import.meta.dirname, "..");
const SHOTS = join(STUDIO, "..", "..", "product", "screens", "fo-7s-money", "build"); mkdirSync(SHOTS, { recursive: true });
const { ok, summary } = recorder();
const { sql: rawSql, call } = client(PORT, DBNAME);
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
if (sql(`select count(*) from money_payment_settings where firm_id = '${A}'`) === "0") sql(`insert into money_payment_settings (firm_id, updated_by, updated_at) values ('${A}', 'seed:FO-7s3b', now())`);
// DW8 needs trust Unanswered (never shows, whatever is held: trustShows); a copy another check answered is set back for the
// run and its answer restored at the end.
const [answerBefore, byBefore, atBefore] = sql(`select trust_answer || '|' || coalesce(trust_answered_by, '') || '|' || coalesce(trust_answered_at::text, '') from money_payment_settings where firm_id = '${A}'`).split("|");
// the database refuses a move back to Unanswered (AG-6-59 §6); a fixture's reset, outside the product, skips its trigger
sql(`set session_replication_role = replica; update money_payment_settings set trust_answer = 'UNANSWERED', trust_answered_by = null, trust_answered_at = null where firm_id = '${A}'`);
const trustAtStart = sql(`select trust_answer from money_payment_settings where firm_id = '${A}'`);
const TOWNER = await signIn("sample-firm", "user-R");
const staffOf = (actor: string) => sql(`select id from platform_staff where actor_id = '${actor}' and firm_id = '${A}'`);
const role = await api(TOWNER, "PATCH", `/platform/staff/${staffOf("user-T")}/roles`, { roles: ["BILLING_FINANCE"], reason: "FO-7s3b check: a Billing person" });
const TBILL = await signIn("sample-firm", "user-T");
const person = (n: string) => sql(`insert into fo_person (id, firm_id, given_names, family_name, email, created_by, updated_at) values (gen_random_uuid(), '${A}', 'Client${n}${run}', 'Sample', 'fo7s3b.${run}.${n.toLowerCase()}@example.org', 'seed:FO-7s3b', now()) returning id`);
// C5 (CS-MV1): a party is visible when it is the subject of a prospect the person may see. Client B and Client R: the Billing
// person's and the Owner's; Client H: the Owner's only (DW9).
const PB = person("B"), PR = person("R"), PH = person("H");
// Client M is the client of a real case (break M1 needs money on a case): Demo › Load the configured checkpoint when not yet
// loaded, then firm A's case officer opens a case, whose case client is born linked to its own person (as j_58's client C).
const released = () => sql(`select count(*) from config_release r join combination c on c.id = r.combination_id where c.combination_key = 'vv.single' and r.status = 'RELEASED'`) !== "0";
if (!released()) await call("POST", "/demo/load", { sample: "configured" }, "user-A");
const opened = await call("POST", "/runtime/cases", { combinationId: sql(`select id from combination where combination_key = 'vv.single'`), reference: `S3B-${run}-M`, clientActor: "user-P", principal: { displayName: `ClientM${run} Sample` }, representative: "user-R", caseOfficers: ["user-O"] }, "user-O");
const CASEM = (opened.body as { id?: string } | null)?.id ?? "";
const PM = CASEM ? sql(`select coalesce((select c.fo_person_id::text from runtime_case k join case_client c on c.id = k.client_id and c.firm_id = k.firm_id where k.id = '${CASEM}'), '')`) : "";
let pn = 0;
const prospect = (who: string, owner: string) => sql(`set session_replication_role = replica; insert into fo_prospect (id, firm_id, number, lead_id, type, stage_id, subject_person_id, subject_company_id, primary_contact_person_id, owner_staff_id, created_by, updated_at)
    values (gen_random_uuid(), '${A}', 'P-${String(10000 + ((Date.now() + 7919 * ++pn) % 89999))}', gen_random_uuid(), 'INDIVIDUAL', gen_random_uuid(), '${who}', null, '${who}', '${staffOf(owner)}', 'seed:FO-7s3b', now())`);
prospect(PB, "user-T"); prospect(PB, "user-R"); prospect(PR, "user-T"); prospect(PR, "user-R"); prospect(PH, "user-R"); prospect(PM, "user-T"); prospect(PM, "user-R");
ok("FO-7s3b setup: user-T is a Billing person; trust Unanswered; three Sample clients and Client M of a real case", role.status === 200 && trustAtStart === "UNANSWERED" && !!PB && !!PR && !!PH && !!PM, { role: role.status, opened: opened.status });

// ------------------------------------------------------------------------------------------------ the browser
const browser: Browser = await chromium.launch({ headless: process.env.HEADED !== "1", ...(existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : process.platform === "darwin" ? { channel: "chrome" } : {}) });
const errs: string[] = [];
const tab = async (token: string, width = 1440) => {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1, colorScheme: "light", reducedMotion: "reduce" });
  await ctx.addInitScript((t) => { sessionStorage.setItem("xr-staff-session", JSON.stringify({ token: t, expiresAt: Date.now() + 3_600_000 })); }, token);
  const p = await ctx.newPage(); p.on("pageerror", (e) => errs.push(e.message));
  return p;
};
const trustPage = async (p: Page) => { await p.goto(`${BASE}/money/trust`); await p.locator("[data-trust-home], [data-trust-off], [data-trust-refused], [data-trust-error]").first().waitFor({ timeout: 60_000 }); };
const partyPage = async (p: Page, id: string) => {
  await p.goto(`${BASE}/money/parties/person/${id}`); await p.locator("[data-party-money], [data-party-missing], [data-party-error]").first().waitFor({ timeout: 60_000 });
  if (await p.locator("[data-trust-section]").count()) await p.locator("[data-ledger-row], [data-ledger-empty], [data-ledger-error]").first().waitFor({ timeout: 30_000 });
};
const menuItems = async (p: Page) => { await p.locator('nav[aria-label="Money"] [data-money-menu]').first().waitFor({ timeout: 30_000 }); await p.waitForTimeout(500); return p.locator('nav[aria-label="Money"] [data-money-menu]').allInnerTexts(); };
const shot = (p: Page, name: string) => p.screenshot({ path: join(SHOTS, `fo7s3b-${name}.png`), fullPage: true });
const serious = async (p: Page, scope = "main") => (await p.waitForTimeout(300), await new AxeBuilder({ page: p }).include(scope).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze()).violations
  .filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.nodes[0]?.target}`);
const sideways = (p: Page) => p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
const reach = async (p: Page, target: Locator, max = 80) => {
  for (let i = 0; i < max; i++) { if (await target.evaluate((el) => el === document.activeElement).catch(() => false)) return; await p.keyboard.press("Tab"); }
  throw new Error("not reached by Tab");
};
const TRUST = /\btrust\b|\bdeposit\b|to move|received into|shortfall/i;
/** DW7's scan (a string, so no tsx helper reaches the page): every leaf showing a negative figure, whether it is red and its
 *  row or block carries the label. */
const NEGATIVES = `(() => [...document.querySelectorAll("main *")].filter((el) => el.children.length === 0 && /[−-]\\s*(CAD|USD)\\s*[0-9]/.test(el.textContent || "")).map((el) => {
  const m = /rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)/.exec(getComputedStyle(el).color), red = !!m && +m[1] > 120 && +m[1] > +m[2] + 60 && +m[1] > +m[3] + 60;
  const box = el.closest("tr, li, [role=row], [role=alert], [role=status], td") || el.parentElement;
  return { text: el.textContent, red, labelled: ((box && box.textContent) || "").includes(${JSON.stringify(SHORTFALL_LABEL)}) };
}))()`;
type Neg = { text: string; red: boolean; labelled: boolean };
const axeAll: string[] = [];

let failed = 0;
let restoreSeesAll: (() => void) | null = null;   // the firm's setting is put back whatever happens (FO-7s3a's review M4)
try {
  // ---------------------------------------------------------------------------------------------- DW8: trust off
  const pb = await tab(TBILL);
  await trustPage(pb);
  const offItems = await menuItems(pb), offText = await pb.locator("main").innerText();
  ok("FO-7s3b DW8 pass: trust Unanswered: the Money menu has no Trust and /money/trust says only \"not available\", no trust word",
    !offItems.includes("Trust") && (await pb.locator("[data-trust-off]").count()) === 1 && !TRUST.test(offText), { offItems, offText: offText.slice(0, 200) });
  await partyPage(pb, PB);
  const offParty = await pb.locator("main").innerText();
  ok("FO-7s3b DW8 pass: trust Unanswered: Client B's Money view shows the summary and no trust section, no trust word",
    (await pb.locator("[data-party-money]").count()) === 1 && (await pb.locator("[data-trust-section]").count()) === 0 && !TRUST.test(offParty), offParty.slice(0, 300));
  ok("FO-7s3b DW8 fail: the same scan catches a planted trust word", TRUST.test(`${offParty} Trust held: CAD 0.00`));
  await shot(pb, "party-trust-off-1440");

  // ---------------------------------------------------------------------------------------------- data: trust on (API, Sample)
  const yes = await api(TOWNER, "PUT", `${M}/trust/answer`, { answer: "YES" });
  const dep = (who: string, amountMinor: number, currency: string, method: string, n: string) =>
    api(TOWNER, "POST", `${M}/trust/deposits`, { personId: who, amountMinor, currency, method, reference: `S3B-${run}-${n}`, idempotencyKey: `s3b-${run}-${n}` });
  const d1 = await dep(PB, 113000, "CAD", "E_TRANSFER", "b1"), d2 = await dep(PB, 5000, "USD", "WIRE", "b2");
  // break M2: CAD entries after the USD one, then a newer USD one (each currency's ledger newest first on its own)
  const d3 = await dep(PB, 1000, "CAD", "E_TRANSFER", "b3"), d4 = await dep(PB, 2500, "USD", "WIRE", "b4");
  // Client R: a cheque of 200.00 deposited by hand, refunded, then reversed as Returned: −200.00 (P-694; FO-7v part T).
  const chq = await dep(PR, 20000, "CAD", "CHEQUE", "r1");
  const ref = await api(TOWNER, "POST", `${M}/trust/refunds`, { personId: PR, currency: "CAD", amountMinor: 20000, reason: "Client asked for it back (Sample)", reference: `S3B-${run}-rf`, method: "E_TRANSFER", unclearedAcknowledged: true });
  // break M1: Client M (the case's client) holds CAD 500.00 before a case and is short CAD 200.00 on a case (a cheque there refunded, then reversed)
  const m1 = await dep(PM, 50000, "CAD", "E_TRANSFER", "m1");
  const mchq = await api(TOWNER, "POST", `${M}/trust/deposits`, { personId: PM, caseId: CASEM, amountMinor: 20000, currency: "CAD", method: "CHEQUE", reference: `S3B-${run}-m2`, idempotencyKey: `s3b-${run}-m2` });
  const mref = await api(TOWNER, "POST", `${M}/trust/refunds`, { personId: PM, caseId: CASEM, currency: "CAD", amountMinor: 20000, reason: "Client asked for it back (Sample)", reference: `S3B-${run}-mrf`, method: "E_TRANSFER", unclearedAcknowledged: true });
  const mplan = await api(TOWNER, "GET", `${M}/payments/${mchq.body?.paymentId}/reverse-preview`);
  const mrev = await api(TOWNER, "POST", `${M}/payments/${mchq.body?.paymentId}/reverse`, { reasonCode: "RETURNED", previewHash: mplan.body?.hash });
  const caseBal = sql(`select coalesce(sum(amount_minor), 0) from money_trust_entry where person_id = '${PM}' and case_id = '${CASEM}'`);
  ok("FO-7s3b setup (break M1's data): Client M holds CAD 500.00 before a case and CAD −200.00 on a case after a reversal",
    m1.status === 201 && mchq.status === 201 && mref.status < 300 && mrev.status < 300 && caseBal === "-20000", { m1: m1.status, mchq: [mchq.status, mchq.body?.detail], mref: [mref.status, mref.body?.detail], mrev: [mrev.status, mrev.body?.detail], caseBal });
  const plan = await api(TOWNER, "GET", `${M}/payments/${chq.body?.paymentId}/reverse-preview`);
  const rev = await api(TOWNER, "POST", `${M}/payments/${chq.body?.paymentId}/reverse`, { reasonCode: "RETURNED", previewHash: plan.body?.hash });
  const bal = (who: string, cur: string) => sql(`select coalesce(sum(amount_minor), 0) from money_trust_entry where person_id = '${who}' and currency = '${cur}'`);
  ok("FO-7s3b setup (trust on): Yes recorded; Client B holds CAD 1,140.00 and USD 75.00; Client R is at −CAD 200.00 after a reversal (FO-7t, FO-7v routes)",
    yes.status === 200 && d1.status === 201 && d2.status === 201 && d3.status === 201 && d4.status === 201 && ref.status < 300 && rev.status < 300 && bal(PB, "CAD") === "114000" && bal(PB, "USD") === "7500" && bal(PR, "CAD") === "-20000",
    { yes: yes.status, d1: d1.status, d2: d2.status, chq: chq.status, ref: [ref.status, ref.body?.detail], rev: [rev.status, rev.body?.detail], R: bal(PR, "CAD") });

  // ---------------------------------------------------------------------------------------------- W1, DW7, K: the walk
  const p = await tab(TBILL);
  await p.goto(`${BASE}/money/invoices`);
  const onItems = await menuItems(p);
  const trustLink = p.locator('nav[aria-label="Money"] [data-money-menu="Trust"]');
  ok("FO-7s3b W1: trust on: the Billing person's Money menu offers Trust", onItems.includes("Trust"), onItems);
  await reach(p, trustLink); await p.keyboard.press("Enter");
  await p.locator("[data-trust-home]").waitFor({ timeout: 30_000 });
  const rowR = p.locator(`[data-shortfall-row="ClientR${run} Sample"]`);
  await rowR.waitFor({ timeout: 30_000 });
  const rowText = await rowR.innerText(), figR = rowR.locator("[data-shortfall-figure]");
  const isRed = (l: Locator) => l.evaluate((el) => { const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(getComputedStyle(el).color); return !!m && +m[1] > 120 && +m[1] > +m[2] + 60 && +m[1] > +m[3] + 60; });
  ok("FO-7s3b W1 (j_58 W5's screen): Money › Trust lists Client R at −CAD 200.00, red, labelled \"Trust shortfall after a reversal\"",
    (await figR.innerText()).trim() === "−CAD 200.00" && (await isRed(figR)) && rowText.includes(SHORTFALL_LABEL), rowText);
  ok("FO-7s3b W1 fail: Client B (CAD 1,130.00 held, not below zero) is not on the shortfall list", (await p.locator(`[data-shortfall-row="ClientB${run} Sample"]`).count()) === 0);
  const negHome = await p.evaluate(NEGATIVES) as Neg[];
  ok("FO-7s3b DW7 pass (Money › Trust): every negative trust figure is red and labelled", negHome.length > 0 && negHome.every((n) => n.red && n.labelled), negHome);
  axeAll.push(...(await serious(p)).map((x) => `trust: ${x}`)); await shot(p, "trust-1440");
  await reach(p, rowR.getByRole("link")); await p.keyboard.press("Enter");
  await p.locator("[data-party-money]").waitFor({ timeout: 30_000 }); await p.locator("[data-ledger-row]").first().waitFor({ timeout: 30_000 });
  const top = p.locator("[data-ledger-row]").first(), topBal = top.locator("[data-balance]");
  ok("FO-7s3b W1: Client R's ledger shows the reversal newest, its balance −CAD 200.00 red with \"Trust shortfall after a reversal\"",
    (await top.getAttribute("data-ledger-row")) === "CORRECTION" && (await topBal.innerText()).trim() === "−CAD 200.00" && (await isRed(topBal)) && (await top.innerText()).includes(SHORTFALL_LABEL), await top.innerText());
  ok("FO-7s3b W1: the trust section says the shortfall in words (Unconfirmed: no counsel)", (await p.locator("[data-trust-short]").innerText()).includes("Your firm needs to put CAD 200.00 of its own money into trust for this client."));
  const negParty = await p.evaluate(NEGATIVES) as Neg[];
  ok("FO-7s3b DW7 pass (Client R's Money view): every negative trust figure is red and labelled", negParty.length > 0 && negParty.every((n) => n.red && n.labelled), negParty);
  ok("FO-7s3b DW7 fail: a bare negative figure (no label) is caught by the same test", ![...negParty, { text: "−CAD 5.00", red: false, labelled: false }].every((n) => n.red && n.labelled));
  axeAll.push(...(await serious(p)).map((x) => `party R: ${x}`)); await shot(p, "party-shortfall-1440");

  // ---------------------------------------------------------------------------------------------- DW3: the ledger adds up
  await partyPage(p, PB);
  const ledger = await p.locator("[data-ledger-row]").evaluateAll((rs) => rs.map((r) => ({ table: r.closest("[role=region]")?.getAttribute("aria-label") ?? "", fig: r.querySelector("[data-figure]")?.textContent ?? "", bal: r.querySelector("[data-balance]")?.textContent ?? "" })));
  const held = await p.locator("[data-trust-held] li").allInnerTexts();
  const newest = (cur: string) => ledger.find((x) => x.bal.includes(cur))?.bal.trim();
  const byTable = (cur: string) => ledger.filter((x) => x.table === `Trust ledger in ${cur}`);
  ok("FO-7s3b DW3 / break M2: one ledger per currency, each newest first: CAD's first row is the CAD 10.00 deposit, USD's the USD 25.00 one, and no row sits in the other currency's table",
    byTable("CAD")[0]?.fig === "CAD 10.00" && byTable("USD")[0]?.fig === "USD 25.00" && byTable("CAD").every((x) => x.fig.includes("CAD")) && byTable("USD").every((x) => x.fig.includes("USD")) && byTable("CAD").length + byTable("USD").length === ledger.length, ledger);
  const fakeCases = [{ caseId: null, caseLabel: null, currency: "CAD", trustMinor: Number(bal(PB, "CAD")) }, { caseId: null, caseLabel: null, currency: "USD", trustMinor: Number(bal(PB, "USD")) }] as Parameters<typeof heldWords>[0];
  const want = ["CAD", "USD"].map((c) => heldWords(fakeCases, c, money, Number(bal(PB, c))));
  ok("FO-7s3b DW3 pass: Client B's newest CAD and USD running balances equal the database's sums and \"Trust held\" per currency, shown apart",
    newest("CAD") === money(Number(bal(PB, "CAD")), "CAD") && newest("USD") === money(Number(bal(PB, "USD")), "USD") && JSON.stringify(held) === JSON.stringify(want), { ledger, held, want });
  ok("FO-7s3b DW3 fail: the two currencies are never added (no CAD 1,215.00 anywhere) and a wrong balance is caught",
    !(await p.locator("main").innerText()).includes("1,215.00") && newest("CAD") !== money(Number(bal(PB, "CAD")) + 1, "CAD"));
  const sumRows = await p.locator("[data-summary-row]").allInnerTexts();
  ok("FO-7s3b DW3: the summary has one column per currency and Unbilled reads \"Not tracked yet\", never 0", sumRows.some((r) => /^Unbilled\s+Not tracked yet/.test(r)), sumRows);
  axeAll.push(...(await serious(p)).map((x) => `party B: ${x}`)); await shot(p, "party-1440");

  // ---------------------------------------------------------------------------------------------- break M1: a short case inside a positive total
  await partyPage(p, PM);
  const mHeld = await p.locator("[data-trust-held] li").allInnerTexts(), mShort = p.locator("[data-trust-short-cases] li");
  ok("FO-7s3b break M1 pass: Client M's short case shows on its own, red, labelled \"Trust shortfall after a reversal\", and \"Trust held\" counts no case",
    (await mShort.count()) === 1 && /−CAD 200\.00/.test(await mShort.innerText()) && (await p.locator("[data-trust-short-cases]").locator("xpath=ancestor::*[@role='alert'][1]").innerText()).includes(SHORTFALL_LABEL)
      && (await isRed(mShort.locator(".text-text-danger").first())) && JSON.stringify(mHeld) === JSON.stringify(["Trust held: CAD 300.00 (CAD 500.00 before a case)"]), { mHeld, short: await mShort.allInnerTexts() });
  const negM = await p.evaluate(NEGATIVES) as Neg[];
  ok("FO-7s3b break M1 fail: every negative figure on Client M's page is red and labelled (the case is never counted as holding money)", negM.length > 0 && negM.every((n) => n.red && n.labelled) && !mHeld.some((h) => /1 case/.test(h)), negM);

  // ---------------------------------------------------------------------------------------------- DW9: C5
  // The Sample firm lets everyone see every record (platform.everyone_sees_all); C5 is tested with it off, as FO-7s3a's DW10.
  const seesAll = (on: boolean) => sql(`delete from platform_firm_setting where firm_id = '${A}' and key = 'platform.everyone_sees_all'; insert into platform_firm_setting (firm_id, key, value, changed_by) values ('${A}', 'platform.everyone_sees_all', '${on}'::jsonb, 'seed:FO-7s3b')`);
  const before = sql(`select coalesce((select value::text from platform_firm_setting where firm_id = '${A}' and key = 'platform.everyone_sees_all'), 'none')`);
  restoreSeesAll = () => { if (before === "none") sql(`delete from platform_firm_setting where firm_id = '${A}' and key = 'platform.everyone_sees_all'`); else seesAll(before === "true"); };
  seesAll(false);
  await partyPage(p, PH);
  const hText = await p.locator("main").innerText();
  ok("FO-7s3b DW9 pass: the Billing person opening Client H (not theirs to see) gets \"Client not found\" with no figure", (await p.locator("[data-party-missing]").count()) === 1 && !/CAD|USD/.test(hText), hText.slice(0, 200));
  const po = await tab(TOWNER); await partyPage(po, PH);
  ok("FO-7s3b DW9 fail: the Owner, who can see Client H, gets the Money view", (await po.locator("[data-party-money]").count()) === 1);
  await po.context().close();
  // C5 on the shortfall list (review m8): the Case Officer, who sees none of these clients, gets no row for Client R
  const pc = await tab(await signIn("sample-firm", "user-O")); await trustPage(pc);
  ok("FO-7s3b DW9 pass (shortfall list): a Case Officer who cannot see Client R finds no row and no figure for them on Money › Trust",
    (await pc.locator("[data-trust-home], [data-trust-refused]").count()) === 1 && (await pc.locator(`[data-shortfall-row="ClientR${run} Sample"]`).count()) === 0 && !(await pc.locator("main").innerText()).includes("200.00"));
  await pc.context().close();
  restoreSeesAll(); restoreSeesAll = null;

  // ---------------------------------------------------------------------------------------------- K: widths
  const wide: string[] = [];
  for (const w of [375, 1024, 1440]) {
    const q = await tab(TBILL, w);
    await trustPage(q); if (await sideways(q)) wide.push(`trust@${w}`); if (w === 375) await shot(q, "trust-375");
    await partyPage(q, PR); if (await sideways(q)) wide.push(`party@${w}`); if (w !== 1440) await shot(q, `party-shortfall-${w}`);
    await q.context().close();
  }
  ok("FO-7s3b K: no sideways scroll at 375, 1024 and 1440 px on Money › Trust and the Money view", !wide.length, wide);
  ok("FO-7s3b K: axe-core finds 0 serious or critical issues (WCAG 2.2 A/AA) on both pages", !axeAll.length, axeAll);
  ok("FO-7s3b K: no page error in the browser", !errs.length, errs);
} catch (e) { failed++; console.log(`FAIL  FO-7s3b: the walk stopped: ${(e as Error).message}`); }
finally { restoreSeesAll?.(); if (answerBefore !== "UNANSWERED") sql(`set session_replication_role = replica; update money_payment_settings set trust_answer = '${answerBefore}', trust_answered_by = '${byBefore.replace(/'/g, "''")}', trust_answered_at = '${atBefore}' where firm_id = '${A}'`); await browser.close(); }

process.exit(summary() || failed ? 1 : 0);
