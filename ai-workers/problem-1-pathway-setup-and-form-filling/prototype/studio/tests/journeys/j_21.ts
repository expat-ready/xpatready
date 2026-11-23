// J-21 (map row 21, R1.21: our own invoices with sales tax): the join-and-walk for the row, over PF-5 part 2 (the
// billing routes: address, invoices, Stripe Tax on at Checkout, #1959) and PF-5s part 2 (Plan and billing with the
// business address and the invoices list, #2881, #2899), on an isolated copy of the running app (its own database and
// port, never :4400). Written by the qa lane (22 Nov) because no j_21 was on main.
// Done when (CAPABILITIES R1.21, re-worded by P-796, founder 22 Nov): a firm's invoice carries its province's sales tax,
// worked out from the firm's saved address by the billing stand-in (the fake BillingPort on a local copy); the tax shows
// on the invoice, its read and the Plan and billing list, and the invoice opens and downloads; no Stripe call, US$0.
//   W1 (by screens): a new firm's Owner (signed up by the public door) signs in and opens Plan and billing: prices are
//       said to be plus applicable taxes; the business address is "needed before your first invoice: we use it to
//       work out tax"; Invoices says "No invoices yet."
//   W2 (the address the tax is worked out from): Add a card with no address opens the address first (never a card
//       before the address); an empty address is refused on its fields; an Ontario address saves, is shown on the
//       page, is stored as typed on the firm and writes one audit line naming the province.
//   W3 (the invoice with its tax): after the address, the billing stand-in issues the period's invoice (as Stripe would
//       at the trial's end: POST /api/platform/billing/stand-in/invoice, P-796), and an invoice of the firm is listed on Plan and billing with its
//       number, date, amount, status and a link that opens it (downloadable), and it carries the province's tax (the
//       tax amount on the row or in the invoices read).
//   W4 (roles): the invoices read is refused with no session (401).
//   W5: the walk ends at R1.22's first step: Plan and billing offers the Owner "Manage plan and billing" (cancel).
// Fails on the fake (P-606): the address is read missing before it is saved; no audit line before the save.
// Sample data only; US$0, no model call, no live mail, no Stripe call: the copy has no Stripe key and runs the fake
// BillingPort; every request to stripe.com is stopped in the browser and counted. Tax readings Unconfirmed: no counsel.
// Screenshots: product/screens/J-21/screenshots/. Run from prototype/ (HEADED=1 opens a visible browser):
//   zsh studio/tools/isolated.sh j21 4421 start --ttl 30 PLATFORM_IDENTITY=local && trap 'zsh studio/tools/isolated.sh j21 4421 stop' EXIT && tsx --tsconfig studio/api/tsconfig.json studio/tests/journeys/j_21.ts j21 4421
import "reflect-metadata";
import { existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { chromium, type Page } from "playwright";
import { client, recorder } from "../runtime/api.ts";
const { default: AxeBuilder } = createRequire(import.meta.url)("@axe-core/playwright") as typeof import("@axe-core/playwright");

const NAME = process.argv[2] ?? "j21", PORT = Number(process.argv[3] ?? 4421), DBNAME = `xr_studio_${NAME}`, BASE = `http://localhost:${PORT}`;
const SHOTS = join(import.meta.dirname, "..", "..", "..", "..", "product", "screens", "J-21", "screenshots"); mkdirSync(SHOTS, { recursive: true });
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const { ok, summary } = recorder();
const { sql: rawSql } = client(PORT, DBNAME);
const sql = (q: string) => rawSql(q).split("\n")[0].trim();
const run = Date.now().toString(36);
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- answers read loosely, as the other journeys
const j = async (method: string, path: string, body?: unknown, token?: string): Promise<{ status: number; body: any }> => {
  const r = await fetch(`${BASE}${path}`, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await r.text(); let b: unknown = t; try { b = JSON.parse(t); } catch { /* text */ } return { status: r.status, body: b };
};
const inbox = async (address: string) => ((await j("GET", `/api/demo/platform-inbox?address=${encodeURIComponent(address)}`)).body.messages ?? []) as { subject: string; body: string }[];

const browser = await chromium.launch({ headless: !process.env.HEADED, slowMo: process.env.HEADED ? 150 : 0, ...(process.platform === "darwin" ? { channel: "chrome" } : existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {}) });
const errors: string[] = [], stripe: string[] = [];
const shot = (p: Page, name: string) => p.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true });
const email = `owner.j21.${run}@example.com`, firmName = `Sample Tax Firm ${run}`;
try {
  // The firm: signed up by the public door (R1.19 and R1.90 walk those screens; not under test here).
  const pub = await j("GET", "/api/public/plans");
  await wait(3300);
  const up = await j("POST", "/api/public/signup", { email, password: "Correct-horse-9!", firmName, countryCode: "CA", planCode: "team", acceptedTerms: (pub.body.terms ?? []).map((t: { id: string }) => t.id), formStamp: pub.body.formStamp });
  let mail: { subject: string; body: string } | undefined;
  for (let i = 0; i < 75 && !mail; i++) { await wait(200); mail = (await inbox(email)).find((m) => m.subject === "Your ExpatReady verification code"); }
  const m = mail?.body.match(/sign-up\/verify#token=([A-Za-z0-9_-]{43})&code=(\d{6})/);
  const made = m ? await j("POST", "/api/public/signup/verify", { token: m[1], code: m[2] }) : { status: 0, body: {} };
  const firmKey: string = made.body.firmKey ?? "";
  if (!firmKey) throw new Error(`STOP  no firm from the sign-up door (signup ${up.status}, verify ${made.status}): the walk needs it`);
  const F = `(select id from platform_firm where key = '${firmKey}')`;

  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light", reducedMotion: "reduce" });
  await ctx.route(/stripe\.com/, (r) => { stripe.push(r.request().url()); return r.abort(); });   // nothing leaves the app
  const p = await ctx.newPage(); p.on("pageerror", (e) => errors.push(String(e)));

  // ------------------------------------------------------------------------------------------ W1: Plan and billing
  await p.goto(`${BASE}/account`);
  await p.getByLabel("Firm key").fill(firmKey); await p.getByLabel("Work email").fill(email); await p.getByRole("button", { name: "Sign in" }).click();
  await p.locator("[data-account], [data-terms-page]").first().waitFor({ timeout: 20_000 });
  const tok = await p.evaluate(() => JSON.parse(sessionStorage.getItem("xr-staff-session") ?? "{}").token as string);
  await p.getByRole("link", { name: "Plan and billing" }).click();
  await p.locator("[data-billing-summary]").waitFor({ timeout: 30_000 });
  const page1 = (await p.locator("main").innerText()).replace(/\s+/g, " ");
  ok("R1.21 W1: Plan and billing (reached from the menu) says prices are plus applicable taxes and why the address is needed", /plus applicable taxes/i.test(page1) && /work out tax/i.test(page1), page1.slice(0, 200));
  ok("R1.21 W1 fail (before the address, P-606): the address is missing, no address audit line, and Invoices says 'No invoices yet.'", (await p.locator("[data-address-missing]").count()) === 1 && (await p.locator("[data-invoices-empty]").count()) === 1 && sql(`select count(*) from audit_event where firm_id = ${F} and action = 'platform.firm.address_changed'`) === "0");
  await shot(p, "w1-billing-no-address-1440");

  // ------------------------------------------------------------------------------------------ W2: the address first
  await p.locator("[data-stripe='card']").click();
  await p.locator("[data-address-form]").waitFor({ timeout: 15_000 }).catch(() => undefined);
  ok("R1.21 W2: Add a card with no address asks for the business address first; no Stripe page is opened", (await p.locator("[data-address-form]").count()) === 1 && stripe.length === 0, { stripe });
  await shot(p, "w2-address-first-1440");
  await p.locator("[data-address-save]").click(); await wait(600);
  const emptyWords = (await p.locator("[data-address-form]").innerText()).replace(/\s+/g, " ");
  ok("R1.21 W2 fail: an empty address is refused on its fields in words; nothing is stored", (await p.locator("[data-address-form] [aria-invalid='true']").count()) > 0 && sql(`select coalesce(business_address->>'province_state', 'none') from platform_firm where key = '${firmKey}'`) === "none", emptyWords.slice(0, 260));
  await shot(p, "w2-address-empty-1440");
  const A = { number: "100", street: "Rue Évora 移民 Street", city: "Toronto", province: "ON", postal: "M5V 2T6" };
  const fields = p.locator("[data-address-form] input");
  const labels = await p.locator("[data-address-form] label").allInnerTexts();
  await p.getByLabel(/street number/i).fill(A.number); await p.getByLabel(/street name/i).fill(A.street); await p.getByLabel(/^city/i).fill(A.city);
  const prov = p.getByLabel(/province or territory/i);
  if ((await prov.evaluate((e) => e.tagName)) === "SELECT") await prov.selectOption({ value: A.province }).catch(() => prov.selectOption({ label: "Ontario" }));
  else { await prov.click(); await p.getByRole("option", { name: /ontario/i }).click(); }
  await p.getByLabel(/postal code/i).fill("not a code");
  await p.locator("[data-address-save]").click(); await wait(600);
  ok("R1.21 W2 fail: a postal code in the wrong shape is refused on its own field", /postal/i.test((await p.locator("[data-address-form]").innerText())) && (await p.locator("[data-address-form] [aria-invalid='true']").count()) === 1 && sql(`select coalesce(business_address->>'province_state', 'none') from platform_firm where key = '${firmKey}'`) === "none", { labels, inputs: await fields.count() });
  await p.getByLabel(/postal code/i).fill(A.postal);
  await p.locator("[data-address-save]").click();
  await p.locator("[data-address-shown], [data-address-saved]").first().waitFor({ timeout: 20_000 }).catch(() => undefined);
  await wait(1200);
  const stored = sql(`select coalesce(business_address->>'street_number', '') || '|' || coalesce(business_address->>'street_name', '') || '|' || coalesce(business_address->>'city', '') || '|' || coalesce(business_address->>'province_state', '') || '|' || coalesce(business_address->>'postal_code', '') from platform_firm where key = '${firmKey}'`);
  ok("R1.21 W2: the Ontario address is stored on the firm exactly as typed (accents and non-English kept)", stored === `${A.number}|${A.street}|${A.city}|${A.province}|${A.postal}`, stored);
  const shown = (await p.locator("main").innerText()).replace(/\s+/g, " ");
  ok("R1.21 W2: the page shows the saved address and says what happened", shown.includes(A.street) && shown.includes(A.postal), shown.slice(shown.indexOf("Business address"), shown.indexOf("Business address") + 320));
  const audit = sql(`select count(*) || '|' || coalesce(max(detail->>'province'), '') from audit_event where firm_id = ${F} and action = 'platform.firm.address_changed'`);
  ok("R1.21 W2: one audit line 'platform.firm.address_changed' names the province (ON)", audit === "1|ON", audit);
  await shot(p, "w2-address-saved-1440");

  // ------------------------------------------------------------------------------------------ W3: the invoice and its tax
  const issued = await j("POST", "/api/platform/billing/stand-in/invoice", {}, tok);   // the provider's act (P-796), not a person's
  if (issued.status !== 200) console.log(`  the stand-in did not issue the invoice: ${issued.status} ${JSON.stringify(issued.body).slice(0, 300)}`);
  await p.goto(`${BASE}/settings/billing`); await p.locator("[data-billing-summary]").waitFor({ timeout: 30_000 });
  await p.locator("[data-invoice], [data-invoices-empty], [data-invoices-error]").first().waitFor({ timeout: 20_000 }).catch(() => undefined);
  const rows = await p.locator("[data-invoice]").count();
  const invoicesWords = (await p.locator("section[aria-labelledby='pf5s-invoices']").innerText()).replace(/\s+/g, " ");
  ok("R1.21 W3: an invoice of the firm is listed on Plan and billing (number, date, amount, status)", rows >= 1, invoicesWords);
  const view = rows >= 1 ? await p.locator("[data-invoice] a[href]").first().getAttribute("href") : null;
  const opened = view ? await fetch(view) : null, openedText = opened ? await opened.text() : "";
  const saved = view ? await fetch(`${view}&download=1`) : null;
  ok("R1.21 W3: the listed invoice opens from the page (View: downloadable)", rows >= 1 && opened?.status === 200 && /Invoice SAMPLE-/.test(openedText) && /HST 13 %/.test(openedText) && /attachment/.test(saved?.headers.get("content-disposition") ?? ""), { rows, view, open: opened?.status ?? null, download: saved?.headers.get("content-disposition") ?? null });
  const read = await j("GET", "/api/platform/billing/invoices", undefined, tok);
  const first = read.body?.invoices?.[0];
  ok("R1.21 W3: the invoice carries the province's tax (Ontario HST on the row or in the invoices read)", !!first && first.taxCents === first.taxLines?.[0]?.amountCents && first.taxLines?.[0]?.name === "HST" && first.taxLines?.[0]?.jurisdiction === "ON" && first.amountDueCents === first.subtotalCents + first.taxCents && /HST 13 %, ON/.test(invoicesWords), { status: read.status, invoices: read.body?.invoices?.length ?? null, fields: first ? Object.keys(first) : "no invoice to read", stripeCustomer: sql(`select coalesce(stripe_customer_id, 'none') from platform_subscription where firm_id = ${F}`) });
  await shot(p, "w3-invoices-1440");

  // ------------------------------------------------------------------------------------------ W4: roles
  const anon = await j("GET", "/api/platform/billing/invoices");
  ok("R1.21 W4 fail: the invoices read is refused with no session (401)", anon.status === 401, anon.status);

  // ------------------------------------------------------------------------------------------ W5: R1.22's first step
  ok("R1.21 W5: the walk ends at R1.22's first step: Plan and billing offers the Owner 'Manage plan and billing' (cancel)", (await p.locator("[data-stripe='portal']").count()) === 1 && await p.locator("[data-stripe='portal']").isEnabled());
  for (const width of [400, 1024, 1440]) {
    await p.setViewportSize({ width, height: 900 }); await p.goto(`${BASE}/settings/billing`); await p.locator("[data-billing-summary]").waitFor({ timeout: 30_000 }); await wait(300);
    const wide = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    const axe = await new AxeBuilder({ page: p }).withTags(TAGS).analyze();
    ok(`R1.21 W6: Plan and billing with the address at ${width} px: no sideways scroll, axe clean`, wide <= 1 && axe.violations.length === 0, { wide, axe: axe.violations.map((v) => `${v.id} (${v.nodes.length})`) });
  }
  ok("R1.21: no page error in the browser, and no request reached stripe.com", errors.length === 0 && stripe.length === 0, { errors, stripe });
  await ctx.close();
} finally {
  await browser.close();
}
process.exit(summary() ? 1 : 0);
