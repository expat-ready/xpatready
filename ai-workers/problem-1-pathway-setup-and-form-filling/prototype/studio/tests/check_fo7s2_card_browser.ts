// FO-7s2 part 1 (R1.57; concept screens/fo-7s-money/concept-settings.md "Card payments"; AG-16-14 to -18, AG-6-49): Money →
// Getting paid → Card payments, walked in a browser on an isolated copy (its own database and port, never :4400) against FO-7c
// part 1's real routes. Each line a pass and a fail:
//   S1 (states in words) the five states read the concept's words, never a code, each with its one next step (Active: none);
//       the break (RESTRICTED with charges off, DISCONNECTED) says "Payment account disconnected — Reconnect" as an alert;
//   S2 (Owner only) a person without agent/payment-rail:connect sees "Only the Owner manages card payments" and no button, and
//       FO-7c answers them 403;
//   S3 (server not set up) on a copy with no Stripe key, Connect says so in words and nothing is written;
//   S4 (step-up first) Connect answered 401 STEP_UP_REQUIRED opens "Confirm it's you"; after signing in again the Connect is
//       sent once more and the browser goes to Stripe's hosted page; an answer naming any other site is not followed;
//   S5 (back from Stripe) ?account=refresh and ?account=return say what happened in words;
//   K  keyboard reaches the button, axe-core 0 serious (WCAG 2.2 A/AA), 375/1024/1440 px no sideways scroll.
// S4's two onboarding answers are stubbed in the browser (page.route): with no Stripe key this copy answers 503 before the
// step-up check (S3 proves that path); the real step-up rule and onboarding are FO-7c part 1's, tested in
// check_fo7c_card_payments.ts. The account's state is set in the database for S1 (the screen reads it back; the states
// themselves come from Stripe's events, FO-7c). Sample firm only; US$0, no Stripe call, live AI off.
// Screenshots (deviceScaleFactor 1) in product/screens/fo-7s-money/build/. Run from prototype/:
//   zsh studio/tools/isolated.sh fo7s2 4762 start AI_LIVE=off PLATFORM_IDENTITY=local && tsx studio/tests/check_fo7s2_card_browser.ts 4762 xr_studio_fo7s2
import { existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import { backWords, said, safeStripeUrl } from "../web/src/modules/client-money/settings/card-payments/contract.ts";
import { client, recorder } from "./runtime/api.ts";
const { default: AxeBuilder } = createRequire(import.meta.url)("@axe-core/playwright") as typeof import("@axe-core/playwright");

const [PORT, DBNAME] = [Number(process.argv[2] ?? 4762), process.argv[3] ?? "xr_studio_fo7s2"];
if (PORT === 4400 || DBNAME === "xr_studio_demo") { console.log("refused: never the demo on :4400"); process.exit(2); }
const BASE = `http://localhost:${PORT}`, STUDIO = join(import.meta.dirname, "..");
const SHOTS = join(STUDIO, "..", "..", "product", "screens", "fo-7s-money", "build"); mkdirSync(SHOTS, { recursive: true });
const { ok, summary } = recorder();
const { sql: rawSql } = client(PORT, DBNAME);
const sql = (q: string) => (rawSql(q) ?? "").split("\n")[0].trim();
const api = async (t: string | null, method: string, path: string, body?: unknown) => {
  const r = await fetch(`${BASE}/api${path}`, { method, headers: { "content-type": "application/json", ...(t ? { authorization: `Bearer ${t}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text(); let j: { token?: string; code?: string } | null = null; try { j = JSON.parse(text); } catch { /* not JSON */ }
  return { status: r.status, body: j, text };
};
const signIn = async (actorId: string) => {
  const r = await api(null, "POST", "/platform/session/local", { firmKey: "sample-firm", actorId, secondStep: true });
  if (r.body?.token) return r.body.token;
  console.error(`STOP  local sign-in refused for ${actorId} (start the copy with PLATFORM_IDENTITY=local): ${r.text.slice(0, 300)}`); process.exit(2);
};
const W = "/front-office/money/payment-account";

// ------------------------------------------------------------------------------------------------ setup (Sample)
await api(null, "GET", "/platform/me");   // waits for the app's Sample seed
const A = sql(`select id from platform_firm where key = 'sample-firm'`);
if (sql(`select count(*) from money_payment_settings where firm_id = '${A}'`) === "0") sql(`insert into money_payment_settings (firm_id, updated_by, updated_at) values ('${A}', 'seed:FO-7s2', now())`);
sql(`delete from money_payment_account where firm_id = '${A}'`);
const setState = (status: string, charges: boolean) => sql(`insert into money_payment_account (firm_id, stripe_account_id, status, charges_enabled, payouts_enabled, updated_at) values ('${A}', ${status === "NOT_CONNECTED" ? "null" : "'acct_fo7s2sample'"}, '${status}', ${charges}, ${charges}, now())
  on conflict (firm_id) do update set status = excluded.status, charges_enabled = excluded.charges_enabled, payouts_enabled = excluded.payouts_enabled, stripe_account_id = excluded.stripe_account_id`);
let TOWNER = await signIn("user-R");
const TOFF = await signIn("user-O");
const audits = () => sql(`select count(*) from audit_event where firm_id = '${A}' and entity = 'money_payment_account'`);

const browser: Browser = await chromium.launch({ headless: process.env.HEADED !== "1", ...(existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : process.platform === "darwin" ? { channel: "chrome" } : {}) });
const errs: string[] = [];
const tab = async (token: string, width = 1440) => {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1, colorScheme: "light", reducedMotion: "reduce" });
  await ctx.addInitScript((t) => { if (!sessionStorage.getItem("xr-staff-session")) sessionStorage.setItem("xr-staff-session", JSON.stringify({ token: t, expiresAt: Date.now() + 3_600_000 })); }, token);
  const p = await ctx.newPage(); p.on("pageerror", (e) => errs.push(e.message));
  return p;
};
const open = async (p: Page, q = "") => { await p.goto(`${BASE}/money/settings/getting-paid${q}`); await p.locator('[data-card-words], [data-card-error]').first().waitFor({ timeout: 60_000 }); };
const words = (p: Page) => p.locator("[data-card-words]").innerText();
const shot = (p: Page, name: string) => p.screenshot({ path: join(SHOTS, `fo7s2-${name}.png`), fullPage: true });
const serious = async (p: Page) => (await p.waitForTimeout(300), await new AxeBuilder({ page: p }).include("main").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze()).violations
  .filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.nodes[0]?.target}`);
const sideways = (p: Page) => p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
const CODES = /NOT_CONNECTED|PENDING|ACTIVE|RESTRICTED|DISCONNECTED|PAYMENT_ACCOUNT/;

let failed = 0;
try {
  // ---------------------------------------------------------------------------------------------- S1: the five states
  const po = await tab(TOWNER);
  const cases: [string, boolean, string, string | null, string][] = [
    ["NOT_CONNECTED", false, "Clients can't pay by card yet.", "Connect with Stripe", "not-connected"],
    ["PENDING", false, "Stripe is checking your details.", "Continue set-up", "pending"],
    ["ACTIVE", true, "Clients can pay invoices by card. Money goes to your own Stripe account.", null, "active"],
    ["RESTRICTED", true, "Stripe needs more details. Until you finish, clients see your payment details instead of a card button.", "Update details on Stripe", "restricted"],
    ["RESTRICTED", false, "Payment account disconnected — Reconnect", "Reconnect", "restricted-off"],
    ["DISCONNECTED", false, "Payment account disconnected — Reconnect", "Reconnect", "disconnected"],
  ];
  for (const [status, charges, want, step, name] of cases) {
    setState(status, charges); await open(po);
    const text = await po.locator("[data-card-payments]").innerText(), btn = await po.locator("[data-card-step]").allInnerTexts();
    ok(`FO-7s2 S1 pass: ${status}${status === "RESTRICTED" ? ` (charges ${charges ? "on" : "off"})` : ""} reads "${want}" with ${step ? `one step "${step}"` : "no step"}`, (await words(po)) === want && JSON.stringify(btn) === JSON.stringify(step ? [step] : []), { got: await words(po), btn });
    ok(`FO-7s2 S1 fail: no status code shows (${status})`, !CODES.test(text), text.slice(0, 200));
    if (name === "disconnected") ok("FO-7s2 S1 pass: the break is announced as an alert (AG-6-49)", (await po.locator('[data-card-words][role="alert"]').count()) === 1);
    if (name === "active") ok("FO-7s2 S1 fail: Active is not announced as an alert", (await po.locator('[role="alert"]').count()) === 0);
    await shot(po, `card-${name}-1440`);
  }
  ok("FO-7s2 S1 (pure): every state of FO-7c's list maps to words without a code", ["NOT_CONNECTED", "PENDING", "ACTIVE", "RESTRICTED", "DISCONNECTED"].every((s) => !CODES.test(said({ status: s as never, chargesEnabled: false, alert: null }).words)));

  // ---------------------------------------------------------------------------------------------- S2: Owner only
  const pf = await tab(TOFF); await open(pf);
  const r403 = await api(TOFF, "GET", W);
  ok("FO-7s2 S2 pass: a person without the connect key sees \"Only the Owner manages card payments\"", (await words(pf)) === "Only the Owner manages card payments.");
  ok("FO-7s2 S2 fail: and no Connect button; FO-7c answers them 403", (await pf.locator("[data-card-step]").count()) === 0 && (await pf.getByRole("button", { name: /stripe|reconnect|set-up/i }).count()) === 0 && r403.status === 403, r403.status);
  ok("FO-7s2 S2 pass: the Money menu offers Getting paid", (await pf.locator('nav[aria-label="Money"] [data-money-menu="Getting paid"]').count()) === 1);
  await shot(pf, "card-not-owner-1440");

  // ---------------------------------------------------------------------------------------------- S3: no Stripe key here
  setState("NOT_CONNECTED", false); const before = audits();
  await open(po); await po.locator("[data-card-step]").click();
  await po.locator("[data-card-refused]").waitFor({ timeout: 20_000 });
  ok("FO-7s2 S3 pass: on a server with no Stripe key, Connect says \"Card payments are not set up on this server yet. Nothing was changed.\"", (await po.locator("[data-card-refused]").innerText()) === "Card payments are not set up on this server yet. Nothing was changed.");
  ok("FO-7s2 S3 fail: nothing was written (no account, no audit line) and the page stayed here", sql(`select status from money_payment_account where firm_id = '${A}'`) === "NOT_CONNECTED" && audits() === before && po.url().startsWith(BASE), { audits: [before, audits()], url: po.url() });

  // ---------------------------------------------------------------------------------------------- S4: step-up first, then Stripe
  const ps = await tab(TOWNER);
  let calls = 0, answer = "https://connect.fake-rail.example/setup/acct_fo7s2sample/1";
  await ps.route("**/api/front-office/money/payment-account/onboarding", async (r) => {
    calls++;
    if (calls === 1) await r.fulfill({ status: 401, contentType: "application/problem+json", body: JSON.stringify({ status: 401, code: "STEP_UP_REQUIRED", title: "Confirm it's you", detail: "Sign in again to connect the payment account." }) });
    else await r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "PENDING", url: answer }) });
  });
  await ps.route("https://connect.fake-rail.example/**", (r) => r.fulfill({ status: 200, contentType: "text/html", body: "<title>Stripe set-up (fake)</title><h1>Stripe set-up (fake)</h1>" }));
  await open(ps);
  const step = ps.locator("[data-card-step]");
  for (let i = 0; i < 60 && !(await step.evaluate((el) => el === document.activeElement).catch(() => false)); i++) await ps.keyboard.press("Tab");
  ok("FO-7s2 K pass: the keyboard reaches \"Connect with Stripe\"", await step.evaluate((el) => el === document.activeElement));
  await ps.keyboard.press("Enter");
  const dialog = ps.getByRole("dialog", { name: "Confirm it's you" });
  await dialog.waitFor({ timeout: 20_000 });
  ok("FO-7s2 S4 pass: Connect answered 401 STEP_UP_REQUIRED opens \"Confirm it's you\" with the concept's words", /Confirm it's you: sign in again, then try once more\./.test(await dialog.innerText()));
  ok("FO-7s2 S4 fail: the browser did not leave for Stripe before the step-up", ps.url().startsWith(BASE) && calls === 1, { url: ps.url(), calls });
  await shot(ps, "card-step-up-1440");
  await dialog.getByRole("button", { name: "Sign in again" }).click();
  await ps.waitForURL(/connect\.fake-rail\.example/, { timeout: 30_000 });
  ok("FO-7s2 S4 pass: after signing in again the Connect is sent once more and the browser opens Stripe's hosted set-up page", calls === 2 && /connect\.fake-rail\.example\/setup\//.test(ps.url()), { calls, url: ps.url() });
  // One session at a time: the sign-in again ended the Owner's earlier session, so later tabs use the new one.
  await ps.goBack(); TOWNER = await ps.evaluate(() => JSON.parse(sessionStorage.getItem("xr-staff-session") ?? "{}").token as string);
  answer = "https://evil.example/steal"; calls = 1;
  await open(ps); await ps.locator("[data-card-step]").click(); await ps.locator("[data-card-refused]").waitFor({ timeout: 20_000 });
  ok("FO-7s2 S4 fail: an onboarding answer naming another site is not followed; the words say nothing was changed", ps.url().startsWith(BASE) && /could not be opened/.test(await ps.locator("[data-card-refused]").innerText()), ps.url());
  ok("FO-7s2 S4 (pure): only Stripe's (or the fake rail's) https pages are followed", safeStripeUrl("https://connect.stripe.com/setup/e/acct_1/x") && !safeStripeUrl("http://connect.stripe.com/x") && !safeStripeUrl("https://stripe.com.evil.example/x") && !safeStripeUrl("javascript:alert(1)"));

  // ---------------------------------------------------------------------------------------------- S5: back from Stripe
  setState("PENDING", false);
  const pb = await tab(TOWNER); await open(pb, "?account=refresh");
  ok("FO-7s2 S5 pass: ?account=refresh says the set-up link expired and offers the step again", (await pb.locator("[data-card-back]").innerText()) === backWords("refresh") && (await pb.locator("[data-card-step]").innerText()) === "Continue set-up");
  await open(pb, "?account=return");
  ok("FO-7s2 S5 pass: ?account=return says Stripe now checks the details", (await pb.locator("[data-card-back]").innerText()) === backWords("return"));
  await open(pb, "?account=anything");
  ok("FO-7s2 S5 fail: any other value shows no Stripe line", (await pb.locator("[data-card-back]").count()) === 0);

  // ---------------------------------------------------------------------------------------------- K: widths, axe
  setState("DISCONNECTED", false);
  const axeAll: string[] = [];
  for (const w of [375, 1024, 1440]) {
    const pw = await tab(TOWNER, w); await open(pw);
    const side = await sideways(pw); axeAll.push(...(await serious(pw)).map((x) => `${w}: ${x}`)); await shot(pw, `card-disconnected-${w}`);
    ok(`FO-7s2 K pass: at ${w} px Getting paid has no sideways scroll`, !side);
  }
  ok("FO-7s2 K pass: axe-core finds 0 serious or critical (WCAG 2.2 A/AA) at 375, 1024 and 1440 px", axeAll.length === 0, axeAll);
  await pb.evaluate(() => { const i = document.createElement("input"); document.querySelector("main")?.appendChild(i); });
  ok("FO-7s2 K fail: the same axe run finds an unlabelled field we add", (await serious(pb)).some((x) => x.startsWith("label")));
  ok("FO-7s2: no page error in any tab", errs.length === 0, errs);
} catch (e) { failed++; ok(`FO-7s2: the walk stopped: ${(e as Error).message.split("\n")[0]}`, false, process.env.DEBUG ? await Promise.all(browser.contexts().flatMap((c) => c.pages()).map((p, i) => p.screenshot({ path: `${process.env.DEBUG}/fail-${i}.png`, fullPage: true }).then(() => i).catch(() => -1))) : undefined); }
finally { await browser.close(); }
process.exit(summary() || failed ? 1 : 0);
