// PF-5s part 2 (concept pf-5s-saas r2 S6; BR-8, BR-9, BR-10, BR-14; §7b B1, M5, M6): Plan and billing in a real browser
// against PF-5 part 2's real routes on the local stand-in and the fake BillingPort. Stripe's own pages are intercepted
// (no request leaves the app; each hand-off's address is checked). Answers are rewritten where the fake cannot reach a
// state by itself: a card on file (the fake keeps no subscription for a seeded firm), Stripe down (503), and the address
// save's Stripe outcome in DW3 (the billing routes' fake keeps no customer, so without the rewrite the local server warns
// on every save); the server's own answer is fetched first and only those fields change. DW1 to DW5, a pass and a fail each. The Sample firm's
// subscription and address are put back at the end. Wording Sample; tax readings Unconfirmed: no counsel. US$0.
//   zsh studio/tools/isolated.sh screens_pf5s2 4700 start PLATFORM_IDENTITY=local && tsx studio/tests/check_pf5s2_billing_browser.ts 4700 xr_studio_screens_pf5s2
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import { seedSampleFirms } from "../api/src/platform/seed-sample-firms.ts";
import { ACCOUNT_SECTIONS, visibleSections } from "../web/src/modules/platform/account-sections.ts";
import { day, WORDS } from "../web/src/modules/platform/saas/billing-contract.ts";
import { client, recorder } from "./runtime/api.ts";
const { default: AxeBuilder } = createRequire(import.meta.url)("@axe-core/playwright") as typeof import("@axe-core/playwright");
const PORT = Number(process.argv[2] ?? 4700), DBNAME = process.argv[3] ?? "xr_studio_screens_pf5s2";
const BASE = `http://localhost:${PORT}`, STUDIO = join(import.meta.dirname, "..");
const SHOTS = join(STUDIO, "..", "..", "product", "screens", "PF-5s", "screenshots-part2"); mkdirSync(SHOTS, { recursive: true });
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const { ok, summary } = recorder();
const { sql: rawSql } = client(PORT, DBNAME);
const sql = (q: string) => rawSql(q).split("\n")[0].trim();
const run = Date.now().toString(36);
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://xr_studio@127.0.0.1:54329/${DBNAME}`, options: "-c TimeZone=UTC" }) });
await seedSampleFirms(db);
const A = sql(`select id from platform_firm where key = 'sample-firm'`);
const staffOf = (actor: string) => { const [id, email] = sql(`select id || '|' || email from platform_staff where actor_id = '${actor}' and firm_id = '${A}'`).split("|"); return { id, email }; };
const R = staffOf("user-R"), O = staffOf("user-O");   // Owner + Case Manager; Case Officer
const extra = (role: string) => {
  const email = `pf5s2-${role.toLowerCase()}-${run}@sample-firm.example.com`;
  const id = sql(`insert into platform_staff (id, firm_id, email, display_name, actor_id, updated_at) values (gen_random_uuid(), '${A}', '${email}', 'Sample ${role.toLowerCase()} ${run}', 'pf5s2-${role.toLowerCase()}-${run}', now()) returning id`);
  sql(`insert into platform_role_grant (id, firm_id, staff_id, role, granted_by) values (gen_random_uuid(), '${A}', '${id}', '${role}', 'seed:PF-5s2-test')`);
  return { id, email };
};
const AD = extra("ADMIN"), BF = extra("BILLING_FINANCE");
const SUB = sql(`select id from platform_subscription where firm_id = '${A}' and status <> 'ENDED' order by created_at desc limit 1`);
const kept = sql(`select row_to_json(s)::text from (select status, stripe_customer_id, stripe_subscription_id, trial_ends_at, current_period_end from platform_subscription where id = '${SUB}') s`);
const keptAddress = sql(`select coalesce(business_address::text, 'null') from platform_firm where id = '${A}'`);
const CUS = "cus_pf5s2test";
const trial = (interval: string) => sql(`update platform_subscription set status = 'TRIAL', stripe_customer_id = '${CUS}', stripe_subscription_id = null, trial_ends_at = now() + interval '${interval}', current_period_end = null where id = '${SUB}' returning id`);
const audits = () => Number(sql(`select count(*) from audit_event where firm_id = '${A}' and action = 'platform.firm.address_changed'`));

async function signIn(email: string) {
  const r = await fetch(`${BASE}/api/platform/session/local`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ firmKey: "sample-firm", email, secondStep: true }) });
  const b = await r.json() as { token?: string; detail?: string };
  if (!b.token) throw new Error(`STOP  local sign-in refused for ${email} (start the copy with PLATFORM_IDENTITY=local): ${b.detail}`);
  // Any terms still pending for this person are accepted first, so the terms page (PF-5t) never stands in front of this one.
  const pend = await (await fetch(`${BASE}/api/platform/me/terms`, { headers: { authorization: `Bearer ${b.token}` } })).json() as { pending?: { id: string }[] };
  if (pend.pending?.length) await fetch(`${BASE}/api/platform/me/terms/accept`, { method: "POST", headers: { authorization: `Bearer ${b.token}`, "content-type": "application/json" }, body: JSON.stringify({ versionIds: pend.pending.map((p) => p.id) }) });
  return b.token;
}
const browser: Browser = await chromium.launch({ headless: true, ...(process.platform === "darwin" ? { channel: "chrome" } : existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {}) });
const errors: string[] = [], outside: string[] = [], stripeHits: string[] = [];
async function newPage(tok: string, width = 1440): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: "light", reducedMotion: "reduce" }), p = await ctx.newPage();
  await ctx.addInitScript((t) => { if (!sessionStorage.getItem("xr-staff-session")) sessionStorage.setItem("xr-staff-session", JSON.stringify({ token: t, expiresAt: Date.now() + 3_600_000 })); }, tok);
  await ctx.route(/^https:\/\/[^/]*stripe\.com\//, (rt) => { stripeHits.push(rt.request().url()); return rt.fulfill({ contentType: "text/html", body: "<!doctype html><title>Stripe (intercepted)</title><h1>Stripe (intercepted by the test)</h1>" }); });
  ctx.on("request", (r) => { const u = new URL(r.url()); if (!["localhost", "127.0.0.1"].includes(u.hostname) && !u.hostname.endsWith("stripe.com") && u.protocol !== "data:") outside.push(r.url()); });
  p.on("pageerror", (e) => errors.push(String(e)));
  return p;
}
const axe = async (name: string, p: Page) => { const r = await new AxeBuilder({ page: p }).withTags(TAGS).analyze();
  const bad = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  ok(`${name}: axe finds no serious or critical WCAG A/AA violation`, bad.length === 0, bad.map((v) => `${v.id}: ${v.nodes[0]?.target?.join(" ")}`).join(" | ") || undefined); };
const noSideways = async (name: string, p: Page) => ok(`${name}: no sideways page scroll`, await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
const shot = (p: Page, name: string) => p.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true });
const open = async (p: Page, query = "") => { await p.goto(`${BASE}/settings/billing${query}`); await p.locator("[data-billing-summary], [data-billing-refused], [data-billing-no-view]").first().waitFor({ timeout: 20_000 }); };
const text = async (p: Page, sel: string) => (await p.locator(sel).count()) ? (await p.locator(sel).first().innerText()).trim() : null;
const filled = (p: Page) => p.locator("[data-billing-summary] button").evaluateAll((els) => els.filter((e) => e.className.includes("text-primary-foreground")).map((e) => e.textContent?.trim()));
const ends = () => day(sql(`select to_char(trial_ends_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') from platform_subscription where id = '${SUB}'`));
/** Rewrites GET /api/platform/billing: the server's own answer, with `patch` laid over it. */
const rewriteBilling = (p: Page, patch: (n: number) => Record<string, unknown>) => { let n = 0; return p.route("**/api/platform/billing", async (rt) => { const res = await rt.fetch(); const body = await res.json(); return rt.fulfill({ response: res, json: { ...body, ...patch(++n) } }); }); };

try {
const rTok = await signIn(R.email), adTok = await signIn(AD.email), bfTok = await signIn(BF.email), oTok = await signIn(O.email);

// ------------------------------------------------------------------ DW1: the trial line counts days (BR-10, M5, M6)
trial("9 days - 1 hour");
{
  const p = await newPage(rTok); await open(p);
  const want = `Free trial: 9 days left (ends ${ends()}). Add a card before then to keep access.`;
  ok("PF-5s2 DW1 pass (BR-10): a trial ending in 9 days shows the days left, the end date and the Owner's next step", await text(p, "[data-trial-line]") === want, await text(p, "[data-trial-line]"));
  ok("PF-5s2 DW1 pass (BR-8): status Trial, the trial end date and the seats line come from our record", await text(p, "[data-billing-status]") === "Trial" && (await text(p, "[data-billing-dates]"))?.startsWith("Trial ends ") === true && /^\d+ of \d+ seats used$|^\d+ seats? used$/.test(await text(p, "[data-billing-seats]") ?? ""), [await text(p, "[data-billing-dates]"), await text(p, "[data-billing-seats]")]);
  await axe("PF-5s2 DW5 Owner, trial (1440 px)", p); await shot(p, "owner-trial-1440");
  await p.context().close();
  trial("1 day - 1 hour");
  const q = await newPage(rTok); await open(q);
  ok("PF-5s2 DW1 pass: one day left reads \"1 day left\", not \"1 days\"", (await text(q, "[data-trial-line]"))?.startsWith("Free trial: 1 day left (ends ") === true, await text(q, "[data-trial-line]"));
  await q.context().close();
  trial("9 days - 1 hour");
  const c = await newPage(rTok); await rewriteBilling(c, () => ({ cardOnFile: true })); await open(c);
  ok("PF-5s2 DW1 pass (M6): with a card on file the line says the card is saved and when the first payment is, with no \"add a card\"", await text(c, "[data-trial-line]") === `Card saved. Your first payment is on ${ends()}.` && (await text(c, "[data-stripe=card]")) === "Update card or pay", await text(c, "[data-trial-line]"));
  await c.context().close();
  const d = await newPage(rTok); await rewriteBilling(d, () => ({ cardOnFile: null, billingAvailable: false })); await open(d);
  ok("PF-5s2 DW1 fail (card not known): Stripe unreachable → the days are shown but no claim about the card, and a warning says details may be out of date", (await text(d, "[data-trial-line]"))?.endsWith("Add a card before then to keep access.") === false && (await d.getByText("Stripe didn't answer").count()) === 1, await text(d, "[data-trial-line]"));
  await d.context().close();
  const x = await newPage(rTok); await rewriteBilling(x, () => ({ cancelAtPeriodEnd: true })); await open(x);
  ok("PF-5s2 DW1 fail (break M3): a trial set to cancel never asks for a card; it says no payment will be taken and shows Cancels on", (await text(x, "[data-trial-line]"))?.endsWith("Your subscription is set to cancel then, so no payment will be taken.") === true && !(await text(x, "[data-trial-line]"))?.includes("Add a card") && await text(x, "[data-billing-dates]") === `Cancels on ${ends()}`, [await text(x, "[data-trial-line]"), await text(x, "[data-billing-dates]")]);
  await x.context().close();
  trial("-3 days");
  const past = await newPage(rTok); await open(past);
  ok("PF-5s2 DW1 fail (break m1, R2-m1): a trial end already passed reads \"ended on\" with no step \"before then\", and the dates line says \"Trial ended\"", await text(past, "[data-trial-line]") === `Free trial: ended on ${ends()}.` && await text(past, "[data-billing-dates]") === `Trial ended ${ends()}`, [await text(past, "[data-trial-line]"), await text(past, "[data-billing-dates]")]);
  await past.context().close();
  const pastCancel = await newPage(rTok); await rewriteBilling(pastCancel, () => ({ cancelAtPeriodEnd: true })); await open(pastCancel);
  ok("PF-5s2 DW1 fail (follow-up m1): a trial set to cancel whose end has passed speaks in the past: \"was set to cancel\", \"Trial ended … (set to cancel)\"", await text(pastCancel, "[data-trial-line]") === `Free trial: ended on ${ends()}. Your subscription was set to cancel then, so no payment will be taken.` && await text(pastCancel, "[data-billing-dates]") === `Trial ended ${ends()} (set to cancel)`, [await text(pastCancel, "[data-trial-line]"), await text(pastCancel, "[data-billing-dates]")]);
  await pastCancel.context().close();
  const pastCard = await newPage(rTok); await rewriteBilling(pastCard, () => ({ cardOnFile: true })); await open(pastCard);
  ok("PF-5s2 DW1 fail (R2-m1): with a card on file and the end passed, no payment date in the past: the first payment is being taken", await text(pastCard, "[data-trial-line]") === `Card saved. The trial ended on ${ends()}; your first payment is being taken.`, await text(pastCard, "[data-trial-line]"));
  await pastCard.context().close();
  sql(`update platform_subscription set status = 'ACTIVE', trial_ends_at = null, current_period_end = now() + interval '20 days' where id = '${SUB}' returning id`);
  const act = await newPage(rTok); await open(act);
  const pe = day(sql(`select to_char(current_period_end at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') from platform_subscription where id = '${SUB}'`));
  ok("PF-5s2 DW1 pass (BR-8): an Active firm shows Active, the next billing date and no trial line", await text(act, "[data-billing-status]") === "Active" && await text(act, "[data-billing-dates]") === `Next billing date ${pe}` && (await act.locator("[data-trial-line]").count()) === 0, await text(act, "[data-billing-dates]"));
  await act.context().close();
  const cx = await newPage(rTok); await rewriteBilling(cx, () => ({ cancelAtPeriodEnd: true })); await open(cx);
  ok("PF-5s2 DW1 pass (BR-8): an Active firm set to cancel shows \"Cancels on\" its period end", await text(cx, "[data-billing-dates]") === `Cancels on ${pe}`, await text(cx, "[data-billing-dates]"));
  await cx.context().close();
  const en = await newPage(rTok); await rewriteBilling(en, () => ({ status: "ENDED", cancelAtPeriodEnd: false })); await open(en);
  ok("PF-5s2 DW1 pass (BR-8): an ended subscription shows Ended and no dates line", await text(en, "[data-billing-status]") === "Ended" && (await en.locator("[data-billing-dates]").count()) === 0);
  await en.context().close();
  trial("9 days - 1 hour");
  // A Case Officer: no menu entry, and the server's refusal by address.
  const o = await newPage(oTok); await open(o);
  const oKeys = (await (await fetch(`${BASE}/api/platform/me`, { headers: { authorization: `Bearer ${oTok}` } })).json() as { keys: string[] }).keys;
  ok("PF-5s2 DW1 fail (M5): a Case Officer has no Plan and billing entry and, by address, sees only the plain line, no plan, trial or button", !visibleSections(ACCOUNT_SECTIONS, oKeys).some((s) => s.path === "/settings/billing") && await text(o, "[data-billing-no-view]") === WORDS.noView && (await o.locator("[data-stripe], [data-trial-line]").count()) === 0);
  await o.context().close();
}

// --------------------------------------------------------------- DW2: one primary per role (BR-8, BR-14, BIC-11)
{
  const p = await newPage(rTok); await open(p);
  ok("PF-5s2 DW2 pass: the Owner sees one filled button, Manage plan and billing, and Add a card outlined; no Owner-only line", JSON.stringify(await filled(p)) === '["Manage plan and billing"]' && await text(p, "[data-stripe=card]") === "Add a card" && (await p.locator("[data-admin-only]").count()) === 0, await filled(p));
  await p.context().close();
  const a = await newPage(adTok); await open(a);
  ok("PF-5s2 DW2 pass (SA-4-67): an Admin sees one filled button, Add a card, no portal button, and \"Only the Owner can change the plan or cancel.\"", JSON.stringify(await filled(a)) === '["Add a card"]' && (await a.locator("[data-stripe=portal]").count()) === 0 && await text(a, "[data-admin-only]") === WORDS.adminOnly, await filled(a));
  await axe("PF-5s2 DW5 Admin (1440 px)", a); await shot(a, "admin-trial-1440");
  await a.context().close();
  const b = await newPage(bfTok); await open(b); await b.locator("[data-invoices-empty], [data-invoice]").first().waitFor({ timeout: 10_000 });
  ok("PF-5s2 DW2 fail: Billing / Finance sees the invoices only: no plan, no trial line, no button to Stripe", await text(b, "[data-billing-no-view]") === WORDS.noView && (await b.locator("[data-stripe], [data-billing-summary]").count()) === 0 && (await b.locator("[data-invoices-empty]").count()) === 1);
  await axe("PF-5s2 DW5 Billing / Finance (1440 px)", b);
  await b.context().close();
  // Invoices: a Stripe link opens in a new tab; a link that is not Stripe's https page is never a link.
  const i = await newPage(rTok);
  await i.route("**/api/platform/billing/invoices", (rt) => rt.fulfill({ json: { invoices: [
    { id: "in_1", number: "PF5S2-0001", status: "paid", amountDueCents: 14900, currency: "CAD", createdAt: new Date().toISOString(), hostedUrl: "https://invoice.stripe.com/i/acct_x/test_1" },
    { id: "in_2", number: "PF5S2-0002", status: "open", amountDueCents: 14900, currency: "CAD", createdAt: new Date().toISOString(), hostedUrl: "javascript:alert(1)" },
    { id: "in_3", number: null, status: "uncollectible", amountDueCents: 100, currency: "C$", createdAt: "not a date", hostedUrl: null }] } }));
  await open(i); await i.locator("[data-invoice]").first().waitFor({ timeout: 10_000 });
  ok("PF-5s2 DW2 pass (SA-4-54): an invoice shows its number, amount in CAD and a View link to Stripe's hosted page in a new tab", (await i.locator("[data-invoice=in_1] a").getAttribute("href"))?.startsWith("https://invoice.stripe.com/") === true && (await i.locator("[data-invoice=in_1] a").getAttribute("target")) === "_blank" && (await text(i, "[data-invoice=in_1]"))?.includes("149.00 CAD") === true, await text(i, "[data-invoice=in_1]"));
  ok("PF-5s2 DW2 fail: an invoice link that is not an https Stripe page is not shown as a link", (await i.locator("[data-invoice=in_2] a").count()) === 0);
  ok("PF-5s2 DW2 fail (break m8): an invoice with an unknown currency and a bad date still shows (plain digits, \"date not known\", \"No number\"), the page stays up", (await text(i, "[data-invoice=in_3]"))?.includes("1.00 C$") === true && (await text(i, "[data-invoice=in_3]"))?.includes("date not known") === true && (await text(i, "[data-invoice=in_3]"))?.includes("No number") === true && (await i.locator("[data-billing-summary]").count()) === 1, await text(i, "[data-invoice=in_3]"));
  await i.context().close();
}

// --------------------------------------------------------- DW3: the business address before any card (B1)
sql(`update platform_firm set business_address = null where id = '${A}'`);
{
  const p = await newPage(rTok); await open(p);
  ok("PF-5s2 DW3 pass: with no address the page says it is needed before the first invoice", (await text(p, "[data-address-missing]"))?.includes(WORDS.addressNeeded) === true);
  const before = stripeHits.length, posts: string[] = [];
  p.on("request", (r) => { if (r.method() === "POST" && /billing\/(checkout|portal)$/.test(r.url())) posts.push(r.url()); });
  await p.locator("[data-stripe=card]").click();
  await p.locator("[data-address-form]").waitFor({ timeout: 10_000 });
  ok("PF-5s2 DW3 pass (B1): Add a card with no address opens the Business address panel first, saying why", (await p.getByText(WORDS.beforeCard).count()) === 1 && (await text(p, "[data-address-save]")) === "Save and continue to Stripe");
  await axe("PF-5s2 DW5 address panel (1440 px)", p); await shot(p, "address-panel-1440");
  const fill = async (k: string, v: string) => p.locator(`[data-address-field=${k}]`).fill(v);
  await fill("street_number", "100"); await fill("street_name", "Sample Street"); await fill("city", "Toronto"); await p.locator("[data-address-field=province_state]").selectOption("ON"); await fill("postal_code", "12345");
  const n0 = audits();
  const bad = p.waitForResponse((r) => r.url().endsWith("/api/platform/billing/address"));
  await p.locator("[data-address-save]").click();
  const badRes = await bad; await p.locator("[data-address-error]").waitFor({ timeout: 10_000 });
  const postalNote = await p.locator("[data-address-field=postal_code]").evaluate((e) => document.getElementById(e.getAttribute("aria-describedby") ?? "")?.textContent ?? "");
  ok("PF-5s2 DW3 fail: a postal code in the wrong shape is refused on its field (422), nothing is saved and nothing goes to Stripe", badRes.status() === 422 && postalNote.length > 0 && postalNote !== "Like A1A 1A1" && audits() === n0 && posts.length === 0 && stripeHits.length === before, [badRes.status(), postalNote]);
  ok("PF-5s2 DW3 pass (review m6): after the refusal, focus is on the refused field and the summary names it", await p.waitForFunction(() => document.activeElement?.getAttribute("data-address-field") === "postal_code", null, { timeout: 3_000 }).then(() => true, () => false) && await text(p, "[data-address-error]") === "Please check: Postal code.", await text(p, "[data-address-error]"));
  await fill("postal_code", "M5V 1A1");
  // Review M2 / break M1: the server saves but warns (Stripe not updated): the page stays and shows the warning.
  const WARN = "Saved here. We could not update our billing provider yet: save it again in a few minutes.";
  // The fake BillingPort keeps no customer for this seeded firm, so the server itself warns on every save here: the first
  // save shows that warning as the server words it; with `warn` off, Stripe is "reached" (onStripe true, no warning); the
  // save itself always runs on the server.
  let warn = true;
  await p.route("**/api/platform/billing/address", async (rt) => { const res = await rt.fetch(), body = await res.json() as Record<string, unknown>;
    if (warn) return rt.fulfill({ response: res, json: { ...body, onStripe: false, next: WARN } });
    const { next: _drop, ...rest } = body; void _drop; return rt.fulfill({ response: res, json: { ...rest, onStripe: true } }); });
  await p.locator("[data-address-save]").click();
  await p.locator("[data-address-saved]").waitFor({ timeout: 10_000 });
  ok("PF-5s2 DW3 fail (review M2, break M1): a save that answers with a warning stays on the page, shows the warning and does not go to Stripe", await text(p, "[data-address-saved]") === WARN && p.url().startsWith(BASE) && posts.length === 0 && stripeHits.length === before, [await text(p, "[data-address-saved]"), posts]);
  // R2-m3: after a warned save, the card button asks for the address again (filled in) before Stripe, saying why.
  await p.locator("[data-stripe=card]").click();
  await p.locator("[data-address-form]").waitFor({ timeout: 10_000 });
  ok("PF-5s2 DW3 fail (R2-m3): after a warned save, Add a card opens the address panel again, filled in, saying why, before any hand-off", await p.locator("[data-address-field=postal_code]").inputValue() !== "" && (await p.getByText(WORDS.retryStripe).count()) === 1 && posts.length === 0 && stripeHits.length === before);
  // Follow-up review m2: the retry warns too → the warning stays; the next press goes on to Stripe (never a loop).
  await p.locator("[data-address-save]").click();
  await p.locator("[data-address-form]").waitFor({ state: "detached", timeout: 10_000 }); await p.waitForTimeout(300);
  ok("PF-5s2 DW3 fail (follow-up m2): a retry that warns again stays on the page with the warning, no hand-off yet", p.url().startsWith(BASE) && await text(p, "[data-address-saved]") === WARN && posts.length === 0);
  await p.locator("[data-stripe=card]").click();
  await p.waitForURL(/stripe\.com/, { timeout: 15_000 });
  ok("PF-5s2 DW3 pass (follow-up m2): the next press opens no panel and hands off, so nobody is kept from Checkout; both saves ran and were audited", audits() === n0 + 2 && posts.length === 1, [audits() - n0, posts.length]);
  await p.context().close();
  // A retry that reaches Stripe goes straight on to Checkout.
  const p2 = await newPage(rTok); let warn2 = true; const posts2: string[] = [];
  p2.on("request", (r) => { if (r.method() === "POST" && /billing\/(checkout|portal)$/.test(r.url())) posts2.push(r.url()); });
  await p2.route("**/api/platform/billing/address", async (rt) => { const res = await rt.fetch(), body = await res.json() as Record<string, unknown>;
    if (warn2) return rt.fulfill({ response: res, json: { ...body, onStripe: false, next: WARN } });
    const { next: _drop, ...rest } = body; void _drop; return rt.fulfill({ response: res, json: { ...rest, onStripe: true } }); });
  await open(p2); await p2.locator("[data-address-edit]").click(); await p2.locator("[data-address-form]").waitFor({ timeout: 10_000 });
  await p2.locator("[data-address-save]").click(); await p2.locator("[data-address-saved]").waitFor({ timeout: 10_000 });
  warn2 = false;
  await p2.locator("[data-stripe=card]").click(); await p2.locator("[data-address-form]").waitFor({ timeout: 10_000 });
  await p2.locator("[data-address-save]").click();
  await p2.waitForURL(/stripe\.com/, { timeout: 15_000 });
  ok("PF-5s2 DW3 pass: a good address saves (audited; the warned saves and this one), then hands off to Stripe's card Checkout for this firm's customer", audits() === n0 + 4 && stripeHits.at(-1) === `https://checkout.stripe.com/c/pay/cs_setup_${CUS}` && posts2.length === 1 && sql(`select business_address->>'postal_code' from platform_firm where id = '${A}'`) === "M5V 1A1", [stripeHits.at(-1), posts]);
  await p2.context().close();
  // With the address kept, the Owner's portal goes straight to Stripe.
  const q = await newPage(rTok); await open(q);
  ok("PF-5s2 DW3 pass: the saved address is shown on the page", (await text(q, "[data-address-shown]"))?.includes("M5V 1A1") === true);
  await q.locator("[data-stripe=portal]").click(); await q.waitForURL(/stripe\.com/, { timeout: 15_000 });
  ok("PF-5s2 DW3 pass: with the address on file Manage plan and billing opens Stripe's Customer Portal directly", stripeHits.at(-1) === `https://billing.stripe.com/p/session/${CUS}`, stripeHits.at(-1));
  await q.context().close();
}

// ---------------------------------------------------- DW4: back from Stripe, and Stripe down (BR-9, states)
{
  const p = await newPage(adTok); await rewriteBilling(p, (n) => ({ cardOnFile: n >= 3 }));
  await open(p, "?card=saved");
  ok("PF-5s2 DW4 pass (BR-9): back from Stripe with ?card=saved, the page says it is checking until our record moves", await text(p, "[data-billing-checking]") === WORDS.checking);
  await shot(p, "admin-checking-1440");
  await p.getByText("Stripe confirmed your card.").waitFor({ timeout: 15_000 });
  ok("PF-5s2 DW4 pass: once the record shows the card, the page says so and the return marker leaves the address (a reload never shows Checking again)", !p.url().includes("card=saved") && await text(p, "[data-trial-line]") === `Card saved. Your first payment is on ${ends()}.`, p.url());
  await p.context().close();
  // Review M1: an overdue firm whose old card is on file comes back: Checking until the record moves to Active.
  const ov = await newPage(adTok); await rewriteBilling(ov, (n) => n < 3 ? { status: "OVERDUE", cardOnFile: true } : { status: "ACTIVE", cardOnFile: true });
  await open(ov, "?card=saved");
  ok("PF-5s2 DW4 fail (review M1): back from Stripe with an old card on file and the record still overdue → Checking, never \"Card saved\"", await text(ov, "[data-billing-checking]") === WORDS.checking && (await ov.getByText("Stripe confirmed your card.").count()) === 0 && await text(ov, "[data-billing-status]") === "Payment overdue");
  await ov.getByText("Stripe confirmed your card.").waitFor({ timeout: 15_000 });
  ok("PF-5s2 DW4 pass (review M1): when the record moves to Active the page confirms and shows Active", await text(ov, "[data-billing-status]") === "Active" && !ov.url().includes("card=saved"));
  await ov.context().close();
  // Break M2: a held firm with a card on file comes back while the record is still on hold: no "Card saved", marker kept.
  const hd = await newPage(adTok); await rewriteBilling(hd, () => ({ status: "PAYMENT_HOLD", firmStatus: "PAYMENT_HOLD", cardOnFile: true, hold: { reason: "payment needed", since: new Date(Date.now() - 86_400_000).toISOString(), deletionDate: new Date(Date.now() + 89 * 86_400_000).toISOString() } }));
  await open(hd, "?card=saved"); await hd.waitForTimeout(7_000);
  ok("PF-5s2 DW4 fail (break M2): on hold with a card on file, the page keeps checking and never says Card saved; the hold line names the deletion date", await text(hd, "[data-billing-checking]") === WORDS.checking && (await hd.getByText("Stripe confirmed your card.").count()) === 0 && hd.url().includes("card=saved") && (await text(hd, "[data-billing-hold]"))?.includes("Your firm's data is kept until") === true, hd.url());
  await hd.context().close();
  const f = await newPage(rTok); await open(f);
  ok("PF-5s2 DW4 fail: the return link alone sets nothing: without ?card=saved there is no Checking line and the status is the record's", (await f.locator("[data-billing-checking]").count()) === 0 && await text(f, "[data-billing-status]") === "Trial");
  await f.route("**/api/platform/billing/checkout", (rt) => rt.fulfill({ status: 503, contentType: "application/problem+json", json: { type: "https://expatready.local/problems/billing-unavailable", title: "Billing is unavailable", status: 503, detail: "We could not reach our billing provider. Try again in a few minutes.", code: "BILLING_UNAVAILABLE" } }));
  const before = stripeHits.length;
  await f.locator("[data-stripe=card]").click(); await f.locator("[data-stripe-error]").waitFor({ timeout: 10_000 });
  ok("PF-5s2 DW4 fail: Stripe down (503) → \"We couldn't open Stripe. Try again.\"; the page stays and the button works again", await text(f, "[data-stripe-error]") === WORDS.stripeDown && stripeHits.length === before && await f.locator("[data-stripe=card]").isEnabled(), await text(f, "[data-stripe-error]"));
  ok("PF-5s2 DW4 pass (break M4): after the refusal, focus is on its words, not lost to the page", await f.waitForFunction(() => !!document.activeElement?.querySelector("[data-stripe-error]"), null, { timeout: 3_000 }).then(() => true, () => false));
  await f.route("**/api/platform/billing/portal", (rt) => rt.fulfill({ json: { url: "https://evil.example.com/steal" } }));
  await f.locator("[data-stripe=portal]").click(); await f.waitForTimeout(500);
  ok("PF-5s2 DW4 fail: a hand-off answer that is not a Stripe https page is never followed", f.url().startsWith(BASE) && (await text(f, "[data-stripe-error]")) === WORDS.stripeDown, f.url());
  await f.context().close();
}

// ------------------------------------------------- DW5: keyboard only, widths, axe, no outside host
{
  const k = await newPage(adTok); await open(k);
  let reached = false;
  for (let i = 0; i < 40 && !reached; i++) { await k.keyboard.press("Tab"); reached = await k.evaluate(() => document.activeElement?.getAttribute("data-stripe") === "card"); }
  ok("PF-5s2 DW5 pass: by keyboard alone an Admin reaches Add a card", reached);
  await k.keyboard.press("Enter"); await k.waitForURL(/stripe\.com/, { timeout: 15_000 });
  ok("PF-5s2 DW5 pass: Enter on it hands off to Stripe (address on file, so no panel)", stripeHits.at(-1)?.startsWith("https://checkout.stripe.com/") === true);
  await k.context().close();
  sql(`update platform_firm set business_address = null where id = '${A}'`);
  const e = await newPage(rTok); await open(e);
  await e.locator("[data-address-edit]").focus(); await e.keyboard.press("Enter"); await e.locator("[data-address-form]").waitFor({ timeout: 10_000 });
  ok("PF-5s2 DW5 pass: the panel opens on its first field", await e.evaluate(() => document.activeElement?.getAttribute("data-address-field")) === "unit");
  // R2-m2: Close with a typed value asks first; dismissing keeps the panel and the text, accepting closes it.
  await e.locator("[data-address-field=city]").fill("Ottawa");
  const asked: string[] = []; let answer = false;
  const onDialog = (d: import("playwright").Dialog) => { asked.push(d.message()); void (answer ? d.accept() : d.dismiss()); };
  e.on("dialog", onDialog);
  await e.getByRole("button", { name: "Close", exact: true }).last().click(); await e.waitForTimeout(300);
  ok("PF-5s2 DW5 fail (R2-m2): Close with a typed address asks \"Discard the address you typed?\"; No keeps the panel and the text", asked[0] === "Discard the address you typed?" && (await e.locator("[data-address-form]").count()) === 1 && await e.locator("[data-address-field=city]").inputValue() === "Ottawa", asked);
  answer = true;
  await e.getByRole("button", { name: "Close", exact: true }).last().click(); await e.locator("[data-address-form]").waitFor({ state: "detached", timeout: 5_000 });
  e.off("dialog", onDialog);
  ok("PF-5s2 DW5 pass (R2-m2): Yes discards and closes", asked.length === 2);
  await e.locator("[data-address-edit]").focus(); await e.keyboard.press("Enter"); await e.locator("[data-address-form]").waitFor({ timeout: 10_000 });
  await e.keyboard.press("Escape"); await e.locator("[data-address-form]").waitFor({ state: "detached", timeout: 5_000 });
  ok("PF-5s2 DW5 pass: Escape closes it and focus goes back to the button that opened it", await e.waitForFunction(() => document.activeElement?.hasAttribute("data-address-edit"), null, { timeout: 3_000 }).then(() => true, () => false), await e.evaluate(() => document.activeElement?.outerHTML.slice(0, 120)));
  await e.context().close();
  for (const w of [375, 1024]) {
    const v = await newPage(rTok, w); await open(v);
    await axe(`PF-5s2 DW5 Owner (${w} px)`, v); await noSideways(`PF-5s2 DW5 Owner (${w} px)`, v); await shot(v, `owner-trial-${w}`);
    await v.context().close();
  }
  ok("PF-5s2 DW5 pass: no request went to any host but the app's (Stripe's pages intercepted)", outside.length === 0, outside.slice(0, 3));
  ok("PF-5s2 DW5 fail check: no page error in any page", errors.length === 0, errors.slice(0, 3));
}
} finally {
  const k = JSON.parse(kept) as { status: string; stripe_customer_id: string | null; stripe_subscription_id: string | null; trial_ends_at: string | null; current_period_end: string | null };
  const q = (v: string | null) => v === null ? "null" : `'${v}'`;
  sql(`update platform_subscription set status = '${k.status}', stripe_customer_id = ${q(k.stripe_customer_id)}, stripe_subscription_id = ${q(k.stripe_subscription_id)}, trial_ends_at = ${q(k.trial_ends_at)}, current_period_end = ${q(k.current_period_end)} where id = '${SUB}' returning id`);
  sql(`update platform_firm set business_address = ${keptAddress === "null" ? "null" : `'${keptAddress.replace(/'/g, "''")}'::jsonb`} where id = '${A}' returning id`);
  sql(`update platform_role_grant set ended_at = now(), ended_by = 'seed:PF-5s2-test' where staff_id in ('${AD.id}', '${BF.id}') and ended_at is null returning id`);
  await browser.close(); await db.$disconnect();
}
process.exitCode = summary() ? 1 : 0;
