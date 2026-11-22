// R1.21 (P-796): the tax on our own invoices to firms, on the billing stand-in. Proves the tax amount on the port
// (BillingInvoice, the fake, the Stripe adapter's mapping), on the invoices read (GET /api/platform/billing/invoices) and
// on the Plan and billing list, for an Ontario address (HST 13 %) and a British Columbia address (GST 5 %, no PST
// computed), each rate from the cited CRA table (client-money/tax/canada-gst-hst.ts). Each rule has a failing case:
// a tax amount that is not the sum of its taxes, an invoice before the address (409), no session (401), a wrong page
// token (404), another firm's invoice (never listed), no stand-in on the server (404). Sample prices; US$0, no Stripe
// call (every browser request to stripe.com is stopped and counted). Tax readings: Unconfirmed: no counsel, no accountant.
// Run from prototype/:
//   zsh studio/tools/isolated.sh r121tax 4723 start PLATFORM_IDENTITY=local && tsx studio/tests/check_r121_invoice_tax.ts 4723 xr_studio_r121tax
import "reflect-metadata";
import { existsSync } from "node:fs";
import { chromium } from "playwright";
import { BillingInvoice, fakeBilling, standInCustomer } from "../ports/billing.ts";
import { PROVINCE_TAX_RATES } from "../api/src/client-money/tax/canada-gst-hst.ts";
import { taxForLine } from "../api/src/client-money/invoices/tax-round.ts";
import { taxOf } from "../api/src/platform/billing/stripe.ts";
import { BillingStandIn, standInTax } from "../api/src/platform/billing/stand-in.ts";
import { runtimeBillingPorts } from "../api/src/platform/firms/runtime-ports.ts";
import { invoiceUrl, standInUrl } from "../web/src/modules/platform/saas/billing-contract.ts";
import { client, recorder } from "./runtime/api.ts";

const PORT = Number(process.argv[2] ?? 4723), DB = process.argv[3] ?? "xr_studio_r121tax", BASE = `http://localhost:${PORT}`;
const { ok, summary } = recorder();
const { sql: rawSql } = client(PORT, DB);
const sql = (q: string) => rawSql(q).split("\n")[0].trim();
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const run = Date.now().toString(36);
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- answers read loosely, as the journeys
const j = async (method: string, path: string, body?: unknown, token?: string): Promise<{ status: number; body: any }> => {
  const r = await fetch(`${BASE}${path}`, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await r.text(); let b: unknown = t; try { b = JSON.parse(t); } catch { /* text */ } return { status: r.status, body: b };
};

// ---------------------------------------------------------------------------------------------- the port (no server)
const on = standInTax(9900, "ON"), bc = standInTax(9900, "BC");
ok("R1.21 port: Ontario's tax is HST 13 % from the cited table (99.00 → 12.87)", on.name === "HST" && on.ratePpm === 130000 && on.amountCents === 1287 && on.jurisdiction === "ON" && PROVINCE_TAX_RATES.ON.source.url.startsWith("https://www.canada.ca/"), on);
ok("R1.21 port: British Columbia's tax is GST 5 % only (99.00 → 4.95; no PST computed)", bc.name === "GST" && bc.ratePpm === 50000 && bc.amountCents === 495 && bc.jurisdiction === "BC", bc);
ok("R1.21 port: the tax is rounded by the one rule, half to even (0.50 at 13 % → 0.06; 1.50 → 0.20)", standInTax(50, "ON").amountCents === 6 && standInTax(150, "ON").amountCents === 20);
const base = { id: "in_t1", number: "T-1", status: "open" as const, amountDueCents: 11187, currency: "cad", createdAt: new Date(), hostedUrl: null };
ok("R1.21 port: an invoice carries its amount before tax, its tax amount and each tax", (() => { const i = BillingInvoice.parse({ ...base, subtotalCents: 9900, taxCents: 1287, taxLines: [on] }); return i.taxCents === 1287 && i.subtotalCents === 9900 && i.taxLines[0].name === "HST"; })());
ok("R1.21 port fail: a tax amount that is not the sum of its taxes is refused", !BillingInvoice.safeParse({ ...base, subtotalCents: 9900, taxCents: 1300, taxLines: [on] }).success && !BillingInvoice.safeParse({ ...base, taxCents: null, taxLines: [on] }).success);
ok("R1.21 port: an invoice whose tax the provider has not said reads null (never 0 by guess)", (() => { const i = BillingInvoice.parse(base); return i.taxCents === null && i.subtotalCents === null && i.taxLines.length === 0; })());
const st = taxOf({ subtotal: 9900, subtotal_excluding_tax: 9900, total_taxes: [{ amount: 1287 }] }), none = taxOf({ subtotal: 9900, subtotal_excluding_tax: null, total_taxes: null });
ok("R1.21 port: the Stripe adapter reads Stripe Tax's total_taxes (no rate or province guessed); none yet reads null", st.taxCents === 1287 && st.taxLines[0].ratePpm === null && st.taxLines[0].jurisdiction === null && none.taxCents === null && none.subtotalCents === 9900, { st, none });
const fake = fakeBilling(); fake.invoiceList.set("cus_t1", [{ ...base, subtotalCents: 9900, taxCents: 1287, taxLines: [on] }]);
const back = (await fake.invoices("cus_t1"))[0];
ok("R1.21 port: the fake BillingPort hands the tax back on its invoices read", back.taxCents === 1287 && back.taxLines[0].amountCents === 1287, back);
const a = "11111111-1111-4111-8111-111111111111", b = "22222222-2222-4222-8222-222222222222";
ok("R1.21 port: each firm has its own stand-in customer, from its id (never a shared counter)", standInCustomer(a) !== standInCustomer(b) && standInCustomer(a) === "cus_standin11111111111141118111111111111111");
// Review M1: the stand-in exists only on a local server with no Stripe key; with a key, or outside local, never.
const cfg = (environment: string, key: string | null) => ({ environment, stripe: { secretKey: key ? { reveal: () => key } : null, webhookSecret: key ? { reveal: () => "whsec_test_r121" } : null } }) as never;
const localFake = runtimeBillingPorts(cfg("local", null), {});
ok("R1.21 port: a local server with no Stripe key runs the stand-in (the same fake as its BillingPort)", !!localFake.standIn && localFake.standIn === localFake.billing);
ok("R1.21 port fail: with a Stripe key (local), or outside local (test, production), there is no stand-in", [cfg("local", "sk_test_r121"), cfg("test", null), cfg("production", null), cfg("test", "sk_test_r121")].every((c) => runtimeBillingPorts(c, {}).standIn === null));
// Review m3: the list follows the stand-in's page on this app's own address only; Stripe's https pages as before.
const o = "http://localhost:4723";
ok("R1.21 list fail: an invoice link to another address or another path is never followed", standInUrl(`${o}/api/demo/billing/invoices/in_x?t=y`, o) !== null && [`http://evil.example/api/demo/billing/invoices/in_x`, `${o}/api/platform/billing`, `http://u:p@localhost:4723/api/demo/billing/invoices/in_x`, "javascript:alert(1)"].every((u) => standInUrl(u, o) === null) && invoiceUrl("https://invoice.stripe.com/i/x") !== null);
const noStandIn = new BillingStandIn({} as never, { standIn: null, clock: { now: () => new Date() }, appUrl: BASE });
ok("R1.21 port fail: a server with no stand-in (a Stripe key, or not local) issues nothing: 404", await noStandIn.issue({ firmId: a } as never).then(() => false, (e: { getStatus?: () => number }) => e.getStatus?.() === 404));

// ---------------------------------------------------------------------------------------------- the read and the list
const browser = await chromium.launch({ headless: true, ...(process.platform === "darwin" ? { channel: "chrome" } : existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {}) });
const stripe: string[] = [];
type Firm = { key: string; email: string; token: string; invoiceId?: string };
async function firm(tag: string): Promise<Firm> {
  const email = `owner.r121.${tag}.${run}@example.com`;
  const pub = await j("GET", "/api/public/plans"); await wait(3300);
  await j("POST", "/api/public/signup", { email, password: "Correct-horse-9!", firmName: `Sample Tax ${tag} ${run}`, countryCode: "CA", planCode: "team", acceptedTerms: (pub.body.terms ?? []).map((t: { id: string }) => t.id), formStamp: pub.body.formStamp });
  let mail: { subject: string; body: string } | undefined;
  for (let i = 0; i < 75 && !mail; i++) { await wait(200); mail = ((await j("GET", `/api/demo/platform-inbox?address=${encodeURIComponent(email)}`)).body.messages ?? []).find((m: { subject: string }) => m.subject === "Your ExpatReady verification code"); }
  const m = mail?.body.match(/sign-up\/verify#token=([A-Za-z0-9_-]{43})&code=(\d{6})/);
  const made = m ? await j("POST", "/api/public/signup/verify", { token: m[1], code: m[2] }) : { status: 0, body: {} };
  if (!made.body.firmKey) throw new Error(`STOP  no firm from the sign-up door (${tag}): the check needs it`);
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } }); await ctx.route(/stripe\.com/, (r) => { stripe.push(r.request().url()); return r.abort(); });
  const p = await ctx.newPage(); await p.goto(`${BASE}/account`);
  await p.getByLabel("Firm key").fill(made.body.firmKey); await p.getByLabel("Work email").fill(email); await p.getByRole("button", { name: "Sign in" }).click();
  await p.locator("[data-account], [data-terms-page]").first().waitFor({ timeout: 20_000 });
  const token = await p.evaluate(() => JSON.parse(sessionStorage.getItem("xr-staff-session") ?? "{}").token as string);
  await ctx.close();
  return { key: made.body.firmKey, email, token };
}
const listTax = async (f: Firm) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } }); await ctx.route(/stripe\.com/, (r) => { stripe.push(r.request().url()); return r.abort(); });
  const p = await ctx.newPage(); await p.goto(`${BASE}/account`);
  await p.getByLabel("Firm key").fill(f.key); await p.getByLabel("Work email").fill(f.email); await p.getByRole("button", { name: "Sign in" }).click();
  await p.locator("[data-account], [data-terms-page]").first().waitFor({ timeout: 20_000 });
  f.token = await p.evaluate(() => JSON.parse(sessionStorage.getItem("xr-staff-session") ?? "{}").token as string);   // a new sign-in ends the earlier session
  await p.goto(`${BASE}/settings/billing`); await p.locator("[data-invoice], [data-invoices-empty], [data-invoices-error]").first().waitFor({ timeout: 30_000 });
  const rows = await p.locator("[data-invoice]").evaluateAll((es) => es.map((e) => ({ id: e.getAttribute("data-invoice"), tax: (e.querySelector("[data-invoice-tax]") as HTMLElement | null)?.innerText ?? "" })));
  await ctx.close(); return rows;
};
try {
  const cases = [{ tag: "on", province: "ON", tax: "HST", rate: 130000, words: /HST 13 %, ON/, address: { street_number: "100", street_name: "King Street West", city: "Toronto", province_state: "ON", postal_code: "M5V 2T6" } },
    { tag: "bc", province: "BC", tax: "GST", rate: 50000, words: /GST 5 %, BC/, address: { street_number: "800", street_name: "Robson Street", city: "Vancouver", province_state: "BC", postal_code: "V6Z 2E7" } }] as const;
  const firms: Firm[] = [];
  for (const c of cases) {
    const f = await firm(c.tag); firms.push(f);
    const early = await j("POST", "/api/platform/billing/stand-in/invoice", {}, f.token);
    ok(`R1.21 read fail (${c.province}): no invoice before the business address is saved (409, in words)`, early.status === 409 && /business address/i.test(early.body?.detail ?? ""), early);
    const put = await j("PUT", "/api/platform/billing/address", c.address, f.token);
    const burst = await Promise.all(Array.from({ length: 8 }, () => j("POST", "/api/platform/billing/stand-in/invoice", {}, f.token)));   // break M1: simultaneous calls
    const issued = burst[0], again = await j("POST", "/api/platform/billing/stand-in/invoice", {}, f.token);
    ok(`R1.21 stand-in fail (${c.province}): 8 simultaneous issue calls make one invoice, never two`, burst.every((r) => r.status === 200 && r.body?.invoice?.id === issued.body?.invoice?.id), burst.map((r) => `${r.status} ${r.body?.invoice?.id}`));
    f.invoiceId = issued.body?.invoice?.id;
    ok(`R1.21 stand-in (${c.province}): the address saves, the stand-in issues one invoice (a second call answers the same one)`, put.status === 200 && issued.status === 200 && again.body?.created === false && again.body?.invoice?.id === f.invoiceId, { put: put.status, issued: issued.status, again: again.body?.invoice?.id });
    const price = Number(sql(`select p.monthly_price_cents from platform_subscription s join platform_plan p on p.id = s.plan_id where s.firm_id = (select id from platform_firm where key = '${f.key}')`));
    const read = await j("GET", "/api/platform/billing/invoices", undefined, f.token), inv = read.body?.invoices?.[0];
    const want = taxForLine(price, c.rate);
    ok(`R1.21 read (${c.province}): the invoices read carries the ${c.tax} amount (${c.rate / 10000} % of the plan's price), the tax line and the total`, read.status === 200 && read.body.invoices.length === 1 && inv.subtotalCents === price && inv.taxCents === want && inv.taxLines.length === 1 && inv.taxLines[0].name === c.tax && inv.taxLines[0].jurisdiction === c.province && inv.taxLines[0].ratePpm === c.rate && inv.amountDueCents === price + want && inv.currency === "CAD", { price, want, inv });
    const page = await fetch(inv.hostedUrl), html = await page.text(), wrong = await fetch(inv.hostedUrl.replace(/t=[^&]+/, "t=wrong-token"));
    ok(`R1.21 read (${c.province}): the invoice page opens with its tax and source; a wrong token is 404`, page.status === 200 && html.includes(c.tax) && html.includes("canada.ca") && html.includes("Unconfirmed: no counsel, no accountant") && wrong.status === 404, { page: page.status, wrong: wrong.status });
    const rows = await listTax(f);
    ok(`R1.21 list (${c.province}): Plan and billing lists the invoice with its tax (${c.tax})`, rows.length === 1 && rows[0].id === f.invoiceId && c.words.test(rows[0].tax) && rows[0].tax.includes(((want / 100).toFixed(2))), rows);
  }
  const otherRead = await j("GET", "/api/platform/billing/invoices", undefined, firms[1].token);
  ok("R1.21 read fail: a firm never reads another firm's invoice", otherRead.status === 200 && firms[0].invoiceId !== firms[1].invoiceId && !otherRead.body.invoices.some((i: { id: string }) => i.id === firms[0].invoiceId), otherRead.body?.invoices?.map((i: { id: string }) => i.id) ?? otherRead);
  const anon = await j("POST", "/api/platform/billing/stand-in/invoice", {});
  ok("R1.21 read fail: the stand-in's issue is refused with no session (401)", anon.status === 401, anon.status);
  ok("R1.21: no request reached stripe.com, no customer was stored for either firm", stripe.length === 0 && sql(`select count(*) from platform_subscription where stripe_customer_id is not null and firm_id in (select id from platform_firm where key in ('${firms[0].key}', '${firms[1].key}'))`) === "0", { stripe });
} finally {
  await browser.close();
}
process.exit(summary() ? 1 : 0);
