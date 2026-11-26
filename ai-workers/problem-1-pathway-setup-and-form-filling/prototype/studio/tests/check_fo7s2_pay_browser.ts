// FO-7s2 part 2 (R1.57, R1.56 W9; concept screens/fo-7s-money/concept-pay-page.md; AG-6-14 r2-3, AG-6-17, AG-6-49 r1;
// P-567 (3)): the client's pay page, Stripe's return page and "Copy pay link", walked in a browser on an isolated copy (its own
// database and port, never :4400) against FO-7c part 2a's real routes. Each line a pass and a fail:
//   P1 (staff link) the Owner opens an issued invoice, "Copy pay link" makes the link for the full amount due and says an
//       earlier link stops working; a person without agent/payment:online sees no button (and the API answers 403);
//   P2 (account down, real) the account not ACTIVE: "Online payment is temporarily unavailable", the firm's operating details
//       and the invoice number as the payment message, and no card button or card field; with no details, the contact line;
//   P3 (card offered) one "Pay CAD … by card" button, no amount field, no trust word; the click goes to Stripe's page only
//       (another site is not followed); the account going down between read and click shows the offline details;
//   P4 (return page) "/done" says "Payment received — your receipt is on its way" and "being confirmed", the invoice still
//       open (the redirect pays nothing, AG-6-17), and no pay button;
//   P5 (one invoice, one link) an unknown, replaced or settled link is the one not-found page; the page shows only its own
//       invoice, never another invoice of the same client;
//   K  375 px first (no sideways scroll), 1440 px, keyboard to the button, axe-core 0 serious, no-referrer.
// P3's two answers are stubbed in the browser (page.route): a copy with no Stripe key never offers the card (FO-7c checks
// the rail before the account); the offer rule itself is FO-7c's (check_fo7c_pay_link.ts). Sample firm only; US$0, no Stripe
// call, live AI off. Screenshots (deviceScaleFactor 1) in product/screens/fo-7s-money/build/. Run from prototype/:
//   zsh studio/tools/isolated.sh fo7s2p 4764 start AI_LIVE=off PLATFORM_IDENTITY=local && tsx studio/tests/check_fo7s2_pay_browser.ts 4764 xr_studio_fo7s2p
import { existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { chromium, type Browser, type Page } from "playwright";
import { seedSampleFirmsFrontOffice } from "../api/src/front-office/firm-seed.ts";
import { money, NOT_VALID, payWords, RECEIVED, safeCheckoutUrl } from "../web/src/modules/client-money/pay/contract.ts";
import { client, recorder } from "./runtime/api.ts";
const { default: AxeBuilder } = createRequire(import.meta.url)("@axe-core/playwright") as typeof import("@axe-core/playwright");

const [PORT, DBNAME] = [Number(process.argv[2] ?? 4764), process.argv[3] ?? "xr_studio_fo7s2p"];
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
const signIn = async (actorId: string) => {
  const r = await api(null, "POST", "/platform/session/local", { firmKey: "sample-firm", actorId, secondStep: true });
  if (r.body?.token) return r.body.token as string;
  console.error(`STOP  local sign-in refused for ${actorId} (start the copy with PLATFORM_IDENTITY=local): ${r.text.slice(0, 300)}`); process.exit(2);
};
const M = "/front-office/money";

// ------------------------------------------------------------------------------------------------ setup (Sample)
await api(null, "GET", "/platform/me");
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://xr_studio@127.0.0.1:54329/${DBNAME}`, options: "-c TimeZone=UTC" }) });
await seedSampleFirmsFrontOffice(db); await db.$disconnect();
const A = sql(`select id from platform_firm where key = 'sample-firm'`), run = Date.now().toString(36).slice(-5);
if (sql(`select count(*) from money_payment_settings where firm_id = '${A}'`) === "0") sql(`insert into money_payment_settings (firm_id, updated_by, updated_at) values ('${A}', 'seed:FO-7s2', now())`);
sql(`update money_payment_settings set operating_details = 'Interac e-Transfer to billing@sample-firm.example (Sample)' where firm_id = '${A}'`);
const TOWNER = await signIn("user-R"), TOFF = await signIn("user-O");
const PB = sql(`insert into fo_person (id, firm_id, given_names, family_name, email, created_by, updated_at) values (gen_random_uuid(), '${A}', 'Client B', 'Sample', 'fo7s2p.${run}@example.org', 'seed:FO-7s2', now()) returning id`);
const invoice = async (unit: number) => {
  const d = await api(TOWNER, "POST", `${M}/invoices`, { personId: PB, currency: "CAD" });
  await api(TOWNER, "POST", `${M}/invoices/${d.body?.id}/lines`, { kind: "FEE", description: `Work permit application ${run}`, unitMinor: unit, ratePpm: 130000 });
  await api(TOWNER, "POST", `${M}/invoices/${d.body?.id}/issue`);
  const v = (await api(TOWNER, "GET", `${M}/invoices/${d.body?.id}/detail`)).body?.invoice;
  return { id: d.body?.id as string, number: v?.number as string, due: v?.dueMinor as number };
};
const I1 = await invoice(100000), I2 = await invoice(50000), I3 = await invoice(20000);
const tokenOf = (a: Ans) => String(a.body?.url ?? "").split("/money/pay/")[1] ?? "";
ok("FO-7s2 P setup: three issued invoices for Client B (CAD 1,130.00, 565.00, 226.00); operating details set; the account not connected",
  I1.due === 113000 && I2.due === 56500 && I3.due === 22600 && sql(`select count(*) from money_payment_account where firm_id = '${A}' and status = 'ACTIVE'`) === "0", [I1, I2, I3]);

const browser: Browser = await chromium.launch({ headless: process.env.HEADED !== "1", ...(existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : process.platform === "darwin" ? { channel: "chrome" } : {}) });
const errs: string[] = [];
const tab = async (token: string | null, width = 1440) => {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1, colorScheme: "light", reducedMotion: "reduce", permissions: ["clipboard-read", "clipboard-write"] });
  if (token) await ctx.addInitScript((t) => { sessionStorage.setItem("xr-staff-session", JSON.stringify({ token: t, expiresAt: Date.now() + 3_600_000 })); }, token);
  const p = await ctx.newPage(); p.on("pageerror", (e) => errs.push(e.message));
  return p;
};
const pay = async (p: Page, token: string, done = false) => { await p.goto(`${BASE}/money/pay/${token}${done ? "/done" : ""}`); await p.locator("[data-pay-state]:not([data-pay-state=loading])").first().waitFor({ timeout: 60_000 }); };
const shot = (p: Page, name: string) => p.screenshot({ path: join(SHOTS, `fo7s2p-${name}.png`), fullPage: true });
const serious = async (p: Page) => (await p.waitForTimeout(300), await new AxeBuilder({ page: p }).include("main").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze()).violations
  .filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.nodes[0]?.target}`);
const sideways = (p: Page) => p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
const TRUST = /\btrust\b|\bdeposit\b/i, amountField = async (p: Page) => (await p.getByRole("spinbutton").count()) + (await p.locator("input[name*=amount i], [data-pay-amount]").count());
const axeAll: string[] = [];

let failed = 0;
try {
  // ---------------------------------------------------------------------------------------------- P1: Copy pay link
  const so = await tab(TOWNER);
  await so.goto(`${BASE}/money/invoices/${I1.id}`); await so.locator("[data-invoice-number]").waitFor({ timeout: 60_000 });
  await so.locator('[data-action="COPY_PAY_LINK"]').click(); await so.locator("[data-pay-link-url]").waitFor({ timeout: 20_000 });
  const url1 = await so.locator("[data-pay-link-url]").inputValue(), T1old = url1.split("/money/pay/")[1] ?? "", said1 = await so.locator("[data-pay-link-said]").innerText();
  ok("FO-7s2 P1 pass: Copy pay link makes the link for the full amount due (CAD 1,130.00) and says any earlier link no longer works",
    /\/money\/pay\/[0-9a-f]{32}\.[A-Za-z0-9_-]{43}$/.test(url1) && said1.includes(money(I1.due, "CAD")) && /earlier link .* no longer works/.test(said1), { url1, said1 });
  await shot(so, "copy-pay-link-1440");
  await so.locator('[data-action="COPY_PAY_LINK"]').click(); await so.waitForFunction((u) => (document.querySelector("[data-pay-link-url]") as HTMLInputElement | null)?.value !== u, url1);
  const T1 = (await so.locator("[data-pay-link-url]").inputValue()).split("/money/pay/")[1] ?? "";
  const sf = await tab(TOFF); await sf.goto(`${BASE}/money/invoices/${I1.id}`); await sf.locator("[data-invoice-number], [data-invoice-missing]").first().waitFor({ timeout: 60_000 });
  const off = await api(TOFF, "POST", `${M}/invoices/${I1.id}/pay-link`);
  ok("FO-7s2 P1 fail: a person without agent/payment:online sees no Copy pay link (the API answers 403 or the one 404)", (await sf.locator('[data-action="COPY_PAY_LINK"]').count()) === 0 && [403, 404].includes(off.status), off.status);

  // ---------------------------------------------------------------------------------------------- P5: the old link, unknown
  const c = await tab(null, 375);
  await pay(c, T1old);
  ok("FO-7s2 P5 pass: the replaced link is the one not-found page in plain words", (await c.locator('[data-pay-state="not-found"]').innerText()) === NOT_VALID);
  await pay(c, `${A.replace(/-/g, "")}.${"x".repeat(43)}`);
  ok("FO-7s2 P5 fail: an unknown link of the same shape is the same page, no invoice shown", (await c.locator('[data-pay-state="not-found"]').count()) === 1 && (await c.locator("[data-pay-number]").count()) === 0);
  await shot(c, "not-found-375");

  // ---------------------------------------------------------------------------------------------- P2: account down (real API)
  await pay(c, T1);
  const page2 = await c.locator("main").innerText();
  ok("FO-7s2 P2 pass: account not connected: \"Online payment is temporarily unavailable\", the operating details and the invoice number as the message",
    (await c.locator("[data-pay-offline-message]").innerText()) === "Online payment is temporarily unavailable." && (await c.locator("[data-pay-details]").innerText()).includes("billing@sample-firm.example") && (await c.locator("[data-pay-reference]").innerText()) === I1.number, page2.slice(0, 300));
  ok("FO-7s2 P2 fail: no card button, no amount field, no trust word", (await c.locator("[data-pay-card]").count()) === 0 && (await c.getByRole("button", { name: /by card/i }).count()) === 0 && (await amountField(c)) === 0 && !TRUST.test(page2));
  ok("FO-7s2 P5 pass: the page shows only its own invoice (one number, never the client's other invoices)", page2.includes(I1.number) && !page2.includes(I2.number) && !page2.includes(I3.number));
  ok("FO-7s2 K pass: at 375 px the pay page has no sideways scroll", !(await sideways(c)));
  axeAll.push(...(await serious(c)).map((x) => `offline-375: ${x}`)); await shot(c, "offline-375");
  sql(`update money_payment_settings set operating_details = null where firm_id = '${A}'`);
  await pay(c, T1);
  ok("FO-7s2 P2 pass: with no details filled, the firm's contact line instead (AG-6-49 r1b)", /^Please contact .+ to arrange payment\.$/.test(await c.locator("[data-pay-contact]").innerText()), await c.locator("[data-pay-contact]").innerText().catch(() => ""));
  sql(`update money_payment_settings set operating_details = 'Interac e-Transfer to billing@sample-firm.example (Sample)' where firm_id = '${A}'`);

  // ---------------------------------------------------------------------------------------------- P3: card offered (stubbed)
  const T2 = tokenOf(await api(TOWNER, "POST", `${M}/invoices/${I2.id}/pay-link`));
  const real = await api(null, "GET", `/public/pay/${T2}`);
  const offered = { ...real.body, card: { offered: true }, offline: null };
  let session: { status: number; body: unknown } = { status: 200, body: { url: "https://pay.fake-rail.example/cs_fake_1" } }, sessions = 0;
  const cc = await tab(null, 375);
  await cc.route(`**/api/public/pay/${T2}`, (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(offered) }));
  await cc.route(`**/api/public/pay/${T2}/session`, (r) => { sessions++; return r.fulfill({ status: session.status, contentType: "application/json", body: JSON.stringify(session.body) }); });
  let referer: string | null | undefined;
  await cc.route("https://pay.fake-rail.example/**", (r) => { referer = r.request().headers()["referer"] ?? null; return r.fulfill({ status: 200, contentType: "text/html", body: "<title>Stripe Checkout (fake)</title><h1>Checkout (fake)</h1>" }); });
  await pay(cc, T2);
  const btn = cc.getByRole("button", { name: payWords({ dueMinor: I2.due, currency: "CAD" }) });
  const page3 = await cc.locator("main").innerText();
  ok(`FO-7s2 P3 pass: card offered: one "${payWords({ dueMinor: I2.due, currency: "CAD" })}" button, the invoice number and the amount due`, (await btn.count()) === 1 && page3.includes(I2.number) && (await cc.locator("[data-pay-due]").innerText()) === money(I2.due, "CAD"));
  ok("FO-7s2 P3 fail: no amount field, no offline block, no trust word", (await amountField(cc)) === 0 && (await cc.locator("[data-pay-offline]").count()) === 0 && !TRUST.test(page3));
  axeAll.push(...(await serious(cc)).map((x) => `card-375: ${x}`)); await shot(cc, "card-375");
  ok("FO-7s2 K pass: the page asks the browser for no referrer (the link's token never leaves in a Referer)", (await cc.locator('meta[name="referrer"][content="no-referrer"]').count()) === 1);
  for (let i = 0; i < 30 && !(await btn.evaluate((el) => el === document.activeElement).catch(() => false)); i++) await cc.keyboard.press("Tab");
  ok("FO-7s2 K pass: the keyboard reaches the pay button", await btn.evaluate((el) => el === document.activeElement));
  session = { status: 200, body: { url: "https://evil.example/cs" } };
  await cc.keyboard.press("Enter"); await cc.locator("[data-pay-refused]").waitFor({ timeout: 20_000 });
  ok("FO-7s2 P3 fail: a session answer naming another site is not followed; \"Nothing was charged\"", cc.url().startsWith(BASE) && /Nothing was charged/.test(await cc.locator("[data-pay-refused]").innerText()), cc.url());
  session = { status: 409, body: { status: 409, code: "CARD_NOT_OFFERED", detail: "Online payment is temporarily unavailable.", offline: { message: "Online payment is temporarily unavailable.", details: "Interac e-Transfer to billing@sample-firm.example (Sample)", contact: null, reference: I2.number } } };
  await btn.click(); await cc.locator("[data-pay-offline]").waitFor({ timeout: 20_000 });
  ok("FO-7s2 P3 fail: the account going down between the read and the click shows the offline details and takes the card button away", (await cc.locator("[data-pay-card]").count()) === 0 && (await cc.locator("[data-pay-reference]").innerText()) === I2.number);
  await pay(cc, T2); session = { status: 200, body: { url: "https://pay.fake-rail.example/cs_fake_1" } }; const before = sessions;
  await cc.getByRole("button", { name: /by card/i }).click(); await cc.waitForURL(/pay\.fake-rail\.example/, { timeout: 20_000 });
  ok("FO-7s2 P3 pass: the click asks for one payment page and goes to Stripe's hosted page, with no Referer", sessions === before + 1 && /pay\.fake-rail\.example\/cs_fake_1$/.test(cc.url()) && !referer, { sessions: sessions - before, url: cc.url(), referer });
  ok("FO-7s2 P3 (pure): only https pages of Stripe (or the fake rail) are followed", safeCheckoutUrl("https://checkout.stripe.com/c/pay/cs_test_1") && !safeCheckoutUrl("https://checkout.stripe.com.evil.example/x") && !safeCheckoutUrl("http://checkout.stripe.com/x"));

  // ---------------------------------------------------------------------------------------------- P4: the return page (real API)
  const before4 = sql(`select count(*) from money_payment where invoice_id = '${I2.id}'`);
  const d = await tab(null, 375); await pay(d, T2, true);
  const page4 = await d.locator("main").innerText();
  ok("FO-7s2 P4 pass: the return page says \"Payment received — your receipt is on its way\" and the invoice is being confirmed", (await d.locator('[data-pay-state="done"]').innerText()) === RECEIVED && /being confirmed/.test(page4), page4.slice(0, 200));
  ok("FO-7s2 P4 fail: the redirect paid nothing (no payment, the invoice still open) and the page offers no pay button",
    sql(`select count(*) from money_payment where invoice_id = '${I2.id}'`) === before4 && (await api(TOWNER, "GET", `${M}/invoices/${I2.id}/detail`)).body?.invoice?.dueMinor === I2.due && (await d.getByRole("button", { name: /by card/i }).count()) === 0);
  axeAll.push(...(await serious(d)).map((x) => `done-375: ${x}`)); await shot(d, "done-375");

  // ---------------------------------------------------------------------------------------------- P5: settled link
  const T3 = tokenOf(await api(TOWNER, "POST", `${M}/invoices/${I3.id}/pay-link`));
  const paid = await api(TOWNER, "POST", `${M}/invoices/${I3.id}/payments`, { method: "CHEQUE", amountMinor: I3.due, receivedOn: new Date().toISOString().slice(0, 10), reference: `fo7s2p-${run}`, idempotencyKey: `fo7s2p-${run}` });
  await pay(c, T3);
  ok("FO-7s2 P5 fail: once paid in full another way the link is the one not-found page", paid.status < 300 && (await c.locator('[data-pay-state="not-found"]').count()) === 1, paid.status);

  // ---------------------------------------------------------------------------------------------- K: 1440, axe
  const w = await tab(null, 1440); await pay(w, T1); axeAll.push(...(await serious(w)).map((x) => `offline-1440: ${x}`)); await shot(w, "offline-1440");
  ok("FO-7s2 K pass: at 1440 px no sideways scroll", !(await sideways(w)));
  ok("FO-7s2 K pass: axe-core finds 0 serious or critical (WCAG 2.2 A/AA) on the card, offline and return pages", axeAll.length === 0, axeAll);
  await w.evaluate(() => { const i = document.createElement("input"); document.querySelector("main")?.appendChild(i); });
  ok("FO-7s2 K fail: the same axe run finds an unlabelled field we add", (await serious(w)).some((x) => x.startsWith("label")));
  ok("FO-7s2: no page error in any tab", errs.length === 0, errs);
} catch (e) { failed++; ok(`FO-7s2 P: the walk stopped: ${(e as Error).message.split("\n")[0]}`, false, process.env.DEBUG ? await Promise.all(browser.contexts().flatMap((x) => x.pages()).map((p, i) => p.screenshot({ path: `${process.env.DEBUG}/fail-${i}.png`, fullPage: true }).then(() => i).catch(() => -1))) : undefined); }
finally { await browser.close(); }
process.exit(summary() || failed ? 1 : 0);
