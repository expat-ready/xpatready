// J-57 (map row 57, R1.57: card payment of invoiced fees into the firm's operating account): the join-and-walk for the
// capability, shaped in product/screens/FO-7c/shape-r1.57.md (Lead 4 approved it on #3633): over FO-7c part 1 (#2938, the
// payment account), part 2a (the pay link and the client's pay door), part 2b (paid by Stripe's event, a declined card
// with its reason, the poll), FO-7s2 parts 1-2 (the Card payments settings, the client's pay page, Copy pay link) and part
// 5 (this walk on Stripe's test mode). Written first, before those parts merge (P-606): each step whose part is missing
// fails, and its label names the part.
// Done when (CAPABILITIES R1.57): "A client pays by card through the firm's own account in test mode; the money is booked
// to operating, never trust (P-567); a failed card leaves the invoice unpaid with the reason".
//   W1 (the payment account): the Owner's Getting paid › Card payments reads Active; a non-Owner is refused (403).
//   W2 (the pay link): an issued invoice gives a no-login link for its full amount due; a trust request gives none.
//   W3 (the client opens it): no sign-in; the firm, the invoice number, the amount due and one "Pay … by card" button.
//   W4 (the card pays): Stripe's hosted page, in test mode, on the firm's own account; test card 4242 4242 4242 4242.
//   W5 (booked to operating): once Stripe's event (or the poll) lands, the invoice is Paid; one payment, method CARD,
//       received into OPERATING; no trust entry; one receipt.
//   W6 (a failed card): test card 4000 0000 0000 0002 is declined; the invoice stays unpaid and shows the reason.
//   W7 (account down): a firm with no connected account shows its offline details or contact line, no card button.
//   W8 (walls): another firm's staff get 404 on the pay link; an unknown or settled link is the one not-found.
//   W9 (by screens, to R1.58's first step): Money › Payments lists the card payment as operating.
// Stripe test mode only (a live key is refused outside production, settings.ts). Without a test key and the firm's test
// connected account (J57_STRIPE_ACCOUNT, onboarded once in the sandbox by the Lead, P-824), the copy runs on the fake
// rail: W1, W3's card, W4-W6 then fail, labelled "part missing: test-mode proof (part 5)". Sample data only, US$0, no
// model call, no live mail. Card-into-operating reading: Unconfirmed: no counsel. Run from prototype/ (HEADED=1 shows it):
//   zsh studio/tools/isolated.sh j57 4457 start --ttl 30 PLATFORM_IDENTITY=local && trap 'zsh studio/tools/isolated.sh j57 4457 stop' EXIT && tsx --tsconfig studio/api/tsconfig.json studio/tests/journeys/j_57.ts j57 4457
import "reflect-metadata";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { chromium, type Page } from "playwright";
import { seedSampleFirmsFrontOffice } from "../../api/src/front-office/firm-seed.ts";
import { seedSampleFirms } from "../../api/src/platform/seed-sample-firms.ts";
import { moneyVisible } from "../lib/money-visible.ts";
import { client, recorder } from "../runtime/api.ts";

const [NAME, PORT] = [process.argv[2] ?? "j57", Number(process.argv[3] ?? 4457)];
if (PORT === 4400) { console.log("refused: never the demo on :4400"); process.exit(2); }
const DBNAME = `xr_studio_${NAME}`, BASE = `http://localhost:${PORT}`;
const SHOTS = join(import.meta.dirname, "..", "..", "..", "..", "product", "screens", "J-57", "screenshots"); mkdirSync(SHOTS, { recursive: true });
const ACCOUNT = process.env.J57_STRIPE_ACCOUNT ?? "";   // the firm's test connected account (acct_…), when the walk runs on Stripe's test mode
const LIVE = /^acct_[A-Za-z0-9]{1,64}$/.test(ACCOUNT);
const T5 = LIVE ? "" : " (part missing: test-mode proof, part 5: no test connected account on this copy)";
const { ok, summary } = recorder();
const { sql: rawSql } = client(PORT, DBNAME);
const sql = (q: string) => rawSql(q).split("\n")[0].trim();
const run = Date.now().toString(36);
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://xr_studio@127.0.0.1:54329/${DBNAME}`, options: "-c TimeZone=UTC" }) });
type Ans = { status: number; body: any };   // eslint-disable-line @typescript-eslint/no-explicit-any -- API answers are read loosely, as in the other journeys
const api = async (t: string | null, method: string, path: string, body?: unknown): Promise<Ans> => {
  const r = await fetch(`${BASE}/api${path}`, { method, headers: { "content-type": "application/json", ...(t ? { authorization: `Bearer ${t}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text(); let b: unknown = text; try { b = JSON.parse(text); } catch { /* text */ }
  return { status: r.status, body: b };
};
const cad = (m: number) => `${Math.trunc(m / 100).toLocaleString("en-CA")}.${String(m % 100).padStart(2, "0")}`;
/** Stripe's hosted page (test mode): the card, expiry, CVC and name; then Pay. Its field ids are Stripe's (Checkout). */
async function payOnStripe(p: Page, card: string) {
  await p.waitForURL(/checkout\.stripe\.com/, { timeout: 30_000 });
  await p.locator("#email").fill(`j57.${run}@example.org`).catch(() => undefined);   // shown only when Checkout asks for it
  await p.locator("#cardNumber").fill(card); await p.locator("#cardExpiry").fill("12 / 34"); await p.locator("#cardCvc").fill("123");
  await p.locator("#billingName").fill("Client Sample");
  const postal = p.locator("#billingPostalCode"); if (await postal.count()) await postal.fill("M5X 1A9");
  await p.locator("[data-testid=hosted-payment-submit-button]").click();
}

try {
  // ------------------------------------------------------------------------------------------------ setup (Sample)
  await seedSampleFirms(db);
  const fo = await seedSampleFirmsFrontOffice(db);
  const A = sql(`select id from platform_firm where key = 'sample-firm'`), B = sql(`select id from platform_firm where key = 'sample-solo'`);
  for (const f of [A, B]) sql(`insert into money_payment_settings (firm_id, updated_by, updated_at) values ('${f}', 'seed:J-57', now()) on conflict (firm_id) do nothing`);
  sql(`update money_payment_settings set operating_details = 'Interac e-Transfer to billing@sample-firm.example, message: your invoice number (Sample)' where firm_id = '${A}'`);
  // a client the staff can see (C5: a won prospect with the client as subject, the firm's "everyone sees all"), as FO-7b's checks seed it
  const person = (f: string) => moneyVisible(rawSql, f, "person", sql(`insert into fo_person (id, firm_id, given_names, family_name, email, created_by, updated_at) values (gen_random_uuid(), '${f}', 'Amara${run}', 'Sample', 'j57.${run}.${f.slice(0, 4)}@example.org', 'seed:J-57', now()) returning id`));
  const PA = person(A), PB = person(B);
  ok("J-57 setup: both Sample firms, firm A's operating details saved, one client in each firm", !!A && !!B && !!PA && !!PB && fo.failed.length === 0, fo.failed);
  const staff = (actor: string, f = A) => sql(`select email from platform_staff where actor_id = '${actor}' and firm_id = '${f}'`);
  const signIn = async (firmKey: string, email: string): Promise<string> => {
    const r = await api(null, "POST", "/platform/session/local", { firmKey, email, secondStep: true });
    if (r.body?.token) return r.body.token as string;
    console.error(`STOP  local sign-in refused for ${email} (start the copy with PLATFORM_IDENTITY=local): ${r.body?.detail}`); process.exit(2);
  };
  const emailA = staff("user-R"), TA = await signIn("sample-firm", emailA), TO = await signIn("sample-firm", staff("user-O")), TB = await signIn("sample-solo", staff("user-S", B));
  /** An issued invoice of one fee line (Sample), through FO-7b's routes (R1.56 walks the drafting). */
  const issued = async (t: string, party: string, minor: number, what: string) => {
    const d = await api(t, "POST", "/front-office/money/invoices", { personId: party, currency: "CAD" });
    await api(t, "POST", `/front-office/money/invoices/${d.body?.id}/lines`, { kind: "FEE", description: `${what} (Sample)`, unitMinor: minor });
    const i = await api(t, "POST", `/front-office/money/invoices/${d.body?.id}/issue`);
    return { id: String(d.body?.id ?? ""), number: String(i.body?.invoice?.number ?? ""), dueMinor: Number(i.body?.invoice?.dueMinor ?? 0) };
  };
  if (LIVE) sql(`insert into money_payment_account (firm_id, stripe_account_id, status, charges_enabled, payouts_enabled, updated_at) values ('${A}', '${ACCOUNT}', 'ACTIVE', true, true, now()) on conflict (firm_id) do update set stripe_account_id = excluded.stripe_account_id, status = 'ACTIVE', charges_enabled = true, payouts_enabled = true`);
  const INV = await issued(TA, PA, 125000, "Professional fee: work permit application"), INV2 = await issued(TA, PA, 30000, "Professional fee: document review");
  ok("J-57 setup: two issued invoices of firm A (1,250.00 and 300.00, Sample)", /^INV-/.test(INV.number) && /^INV-/.test(INV2.number) && INV.dueMinor > 0, [INV, INV2]);

  // ------------------------------------------------------------------------------------------- W1: the payment account
  const acct = await api(TA, "GET", "/front-office/money/payment-account"), acctO = await api(TO, "GET", "/front-office/money/payment-account");
  ok(`R1.57 W1: the Owner reads the firm's payment account as ACTIVE with charges on${T5}`, acct.status === 200 && acct.body?.status === "ACTIVE" && acct.body?.chargesEnabled === true, acct.body);
  ok("R1.57 W1 fail: a person without agent/payment-rail:connect (a case officer) is refused (403)", acctO.status === 403, acctO.status);

  // ---------------------------------------------------------------------------------------------- W2: the pay link
  const link = await api(TA, "POST", `/front-office/money/invoices/${INV.id}/pay-link`), url = String(link.body?.url ?? ""), token = url.split("/money/pay/")[1] ?? "";
  ok("R1.57 W2 (FO-7c part 2a): an issued invoice gives a no-login pay link for its full amount due", link.status === 200 && link.body?.amountDueMinor === INV.dueMinor && /\/money\/pay\/[0-9a-f]{32}\.[A-Za-z0-9_-]{43}$/.test(url), link.body);
  const part = await api(TA, "POST", `/front-office/money/invoices/${INV.id}/pay-link`, { amountMinor: 1000 });
  ok("R1.57 W2 fail (FO-7c part 2a): a part amount is refused (422): the client pays the full amount due", part.status === 422, part.status);
  const link2 = await api(TA, "POST", `/front-office/money/invoices/${INV2.id}/pay-link`), token2 = String(link2.body?.url ?? "").split("/money/pay/")[1] ?? "";
  const pub = await api(null, "GET", `/public/pay/${token}`);
  ok("R1.57 W3 (FO-7c part 2a): the client's door, with no sign-in, answers the firm, the invoice number and the amount due, and creates nothing", pub.status === 200 && pub.body?.invoice?.number === INV.number && pub.body?.invoice?.dueMinor === INV.dueMinor && !!pub.body?.firm?.name, pub.body);
  ok(`R1.57 W3: the card is offered (the firm's account is ACTIVE with charges on)${T5}`, pub.body?.card?.offered === true, pub.body?.card);

  // ------------------------------------------------------------------------------------------------- W8: the walls
  const other = await api(TB, "POST", `/front-office/money/invoices/${INV.id}/pay-link`), unknown = await api(null, "GET", `/public/pay/${A.replace(/-/g, "")}.${"A".repeat(43)}`);
  ok("R1.57 W8 fail: firm B's Owner gets 404 on firm A's invoice's pay link; an unknown link is the one not-found", other.status === 404 && unknown.status === 404 && unknown.body?.code === "LINK_NOT_WORKING", [other.status, unknown.body]);

  // ------------------------------------------------------------------------------------------------ W7: account down
  const invB = await issued(TB, PB, 50000, "Professional fee: consultation follow-up"), linkB = await api(TB, "POST", `/front-office/money/invoices/${invB.id}/pay-link`);
  const tokenB = String(linkB.body?.url ?? "").split("/money/pay/")[1] ?? "", pubB = await api(null, "GET", `/public/pay/${tokenB}`);
  ok("R1.57 W7 (FO-7c part 2a, AG-6-49): firm B, with no connected account, offers no card: its offline details, or its contact line when none are saved", pubB.status === 200 && pubB.body?.card?.offered === false && (!!pubB.body?.offline?.details || /^Please contact /.test(pubB.body?.offline?.contact ?? "")), pubB.body);

  // ---------------------------------------------------------------------------------------- W3-W6, W9: by screens
  const browser = await chromium.launch({ headless: !process.env.HEADED, slowMo: process.env.HEADED ? 150 : 0, ...(process.platform === "darwin" ? { channel: "chrome" } : existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {}) });
  try {
    // The staff side: Getting paid › Card payments (FO-7s2 part 1) and the invoice's Copy pay link (FO-7s2 part 2).
    const staffCtx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
    const s = await staffCtx.newPage();
    await s.goto(`${BASE}/account`);
    await s.getByLabel("Firm key").fill("sample-firm"); await s.getByLabel("Work email").fill(emailA); await s.getByRole("button", { name: "Sign in" }).click();
    await s.locator("[data-account], [data-terms-page]").first().waitFor({ timeout: 20_000 }).catch(() => undefined);
    await s.goto(`${BASE}/settings/payments`); await s.waitForLoadState("networkidle").catch(() => undefined);
    await s.screenshot({ path: join(SHOTS, "w1-card-payments-1440.png"), fullPage: true });
    ok(`R1.57 W1 (part missing: FO-7s2 part 1, Getting paid › Card payments): the Owner's screen shows the card payments status in words${T5}`,
      /card payments/i.test(await s.locator("[data-card-payments]").innerText().catch(() => "")) && /active/i.test(await s.locator("[data-card-payments-status]").innerText().catch(() => "")));
    await s.goto(`${BASE}/money/invoices/${INV2.id}`); await s.waitForLoadState("networkidle").catch(() => undefined);
    await s.screenshot({ path: join(SHOTS, "w2-invoice-pay-link-1440.png"), fullPage: true });
    ok("R1.57 W2 (part missing: FO-7s2 part 2, the invoice's Copy pay link): the issued invoice offers a pay link by screen", (await s.getByRole("button", { name: /copy pay link|send pay link/i }).count()) >= 1);
    await staffCtx.close();

    // The client's side: no sign-in, a phone first (375 px) and the desk (1440 px).
    const clientCtx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
    const c = await clientCtx.newPage();
    await c.goto(`${BASE}/money/pay/${token}`); await c.waitForLoadState("networkidle").catch(() => undefined);
    await c.screenshot({ path: join(SHOTS, "w3-pay-page-1440.png"), fullPage: true });
    const payButton = c.getByRole("button", { name: new RegExp(`Pay CAD ${cad(INV.dueMinor).replace(".", "\\.")} by card`) });
    ok("R1.57 W3 (part missing: FO-7s2 part 2, the client's pay page): the page shows the invoice number, the amount due and one \"Pay … by card\" button, no amount field",
      (await c.getByText(INV.number).count()) >= 1 && (await payButton.count()) === 1 && (await c.getByRole("spinbutton").count()) + (await c.locator("input[name*=amount i]").count()) === 0);
    let paidOnStripe = false;
    if (LIVE && (await payButton.count()) === 1) {
      await payButton.click();
      try { await payOnStripe(c, "4242 4242 4242 4242"); await c.waitForURL(/\/money\/pay\/.+\/done/, { timeout: 60_000 }); paidOnStripe = true; } catch (e) { console.log(`  note: Stripe's page: ${String(e).split("\n")[0]}`); }
      await c.screenshot({ path: join(SHOTS, "w4-stripe-return-1440.png"), fullPage: true });
    }
    ok(`R1.57 W4: the card pays on Stripe's hosted page (test mode, the firm's own account) and comes back to the return page${T5}`, paidOnStripe);
    ok("R1.57 W5 (part missing: FO-7s2 part 2, the return page): the return page says the payment is being confirmed until Stripe's event", paidOnStripe && /being confirmed|payment received/i.test(await c.locator("main").innerText().catch(() => "")));
    // Paid by the event, never by the redirect (AG-6-14 rule 5): wait for the event or the poll (part 2b), at most 90 s.
    const cardPay = () => sql(`select coalesce((select method || ':' || received_into || ':' || amount_minor from money_payment where firm_id = '${A}' and invoice_id = '${INV.id}' and method = 'CARD' limit 1), 'none')`);
    for (let i = 0; paidOnStripe && cardPay() === "none" && i < 45; i++) await new Promise((r) => setTimeout(r, 2000));
    ok(`R1.57 W5 (part missing: FO-7c part 2b, paid by Stripe's event): one card payment for the full amount, received into OPERATING${T5}`, cardPay() === `CARD:OPERATING:${INV.dueMinor}`, cardPay());
    ok(`R1.57 W5: never trust (P-567): no trust entry for the client, and exactly one card payment and one receipt on the invoice${T5}`,
      sql(`select count(*) from money_trust_entry where firm_id = '${A}'`) === "0" && sql(`select count(*) from money_payment where invoice_id = '${INV.id}' and method = 'CARD'`) === "1"
        && sql(`select count(*) from money_receipt r join money_payment p on p.firm_id = r.firm_id and p.id = r.payment_id where p.invoice_id = '${INV.id}'`) === "1");
    const TA2 = await signIn("sample-firm", emailA);   // the browser's sign-in as the same Owner replaced the API session
    const after = await api(TA2, "GET", `/front-office/money/invoices/${INV.id}/detail`);
    ok(`R1.57 W5: the invoice is Paid, nothing left due${T5}`, after.body?.invoice?.statusWord === "Paid" && after.body?.invoice?.dueMinor === 0, { status: after.body?.invoice?.statusWord, due: after.body?.invoice?.dueMinor });

    // W6: a declined card (Stripe's test card for a generic decline).
    let declined = false;
    await c.goto(`${BASE}/money/pay/${token2}`); await c.waitForLoadState("networkidle").catch(() => undefined);
    const pay2 = c.getByRole("button", { name: /by card/i });
    if (LIVE && (await pay2.count()) === 1) {
      await pay2.click();
      try { await payOnStripe(c, "4000 0000 0000 0002"); await c.getByText(/declined/i).first().waitFor({ timeout: 30_000 }); declined = true; } catch (e) { console.log(`  note: Stripe's page: ${String(e).split("\n")[0]}`); }
      await c.screenshot({ path: join(SHOTS, "w6-declined-1440.png"), fullPage: true });
    }
    ok(`R1.57 W6: Stripe declines test card 4000 0000 0000 0002 on its page${T5}`, declined);
    for (let i = 0; declined && Number(sql(`select count(*) from audit_event where action = 'payment.failed' and entity_key = '${INV2.id}'`)) === 0 && i < 45; i++) await new Promise((r) => setTimeout(r, 2000));
    const inv2 = await api(TA2, "GET", `/front-office/money/invoices/${INV2.id}/detail`), pub2 = await api(null, "GET", `/public/pay/${token2}`);
    ok("R1.57 W6 fail: the declined card leaves the invoice unpaid (its amount due unchanged, no card payment)", inv2.body?.invoice?.dueMinor === INV2.dueMinor && sql(`select count(*) from money_payment where invoice_id = '${INV2.id}'`) === "0", inv2.body?.invoice?.dueMinor ?? inv2.status);
    ok(`R1.57 W6 (part missing: FO-7c part 2b, the failed card's reason): the client's answer and the invoice's trail carry the reason Stripe gave${T5}`,
      /declined/i.test(JSON.stringify(pub2.body?.lastFailure ?? "")) && Number(sql(`select count(*) from audit_event where action = 'payment.failed' and entity_key = '${INV2.id}'`)) === 1, pub2.body?.lastFailure ?? null);
    await clientCtx.close();

    // W9: by screens to R1.58's first step: Money › Payments shows the card payment as operating.
    const deskCtx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" }), d = await deskCtx.newPage();
    await d.goto(`${BASE}/account`);
    await d.getByLabel("Firm key").fill("sample-firm"); await d.getByLabel("Work email").fill(emailA); await d.getByRole("button", { name: "Sign in" }).click();
    await d.locator("[data-account], [data-terms-page]").first().waitFor({ timeout: 20_000 }).catch(() => undefined);
    await d.goto(`${BASE}/money/payments`); await d.waitForLoadState("networkidle").catch(() => undefined);
    await d.screenshot({ path: join(SHOTS, "w9-money-payments-1440.png"), fullPage: true });
    const rows = (await d.locator("[data-payment-row]").allInnerTexts().catch(() => [])).join(" | ");
    ok(`R1.57 W9: the walk ends at R1.58's first step: Money › Payments lists the card payment as operating${T5}`, /card/i.test(rows) && /operating/i.test(rows) && rows.includes(cad(INV.dueMinor)), rows.slice(0, 200));
    await deskCtx.close();
  } finally { await browser.close(); }
} finally {
  await db.$disconnect();
}
process.exit(summary() ? 1 : 0);
