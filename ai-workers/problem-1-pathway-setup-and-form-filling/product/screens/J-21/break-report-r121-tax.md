# Break report: R1.21, tax on our own invoices to firms (PR #2987, billing stand-in, P-796)

Verdict: Changes

Target commit: b9d69d2 (`claude/laughing-fermi-agvdg5`). The builder pushed 5647a0094 and ff321442e to this checkout while
the break was running. The isolated copy (`brk121`, :4725, `PLATFORM_IDENTITY=local`, no Stripe key) started at 09:12:23,
after 5647a0094, so all live results below come from **b9d69d2 + 5647a0094** (the only code change is the single-flight in
`stand-in.ts`). B1 was reproduced against b9d69d2's own `BillingStandIn` class, which was taken out of git and run in a
harness. Verdict at b9d69d2 is Changes because of M1. At ff321442e M1 is fixed and only the Minors remain, so the verdict there would be Approve.
US$0: no Stripe key, no Stripe call. The copy was stopped at the end. Tax readings: Unconfirmed: no counsel, no accountant.

## Findings

**M1 (Major, at b9d69d2; fixed by 5647a0094): two calls at the same time issue two invoices, and the first caller's link is dead.**
`issue()` reads `had` at stand-in.ts:52. It then awaits two database reads (stand-in.ts:54 and :57) before
`kept.set`/`invoiceList.set` (stand-in.ts:62-70). Steps: run `git show b9d69d2:…/stand-in.ts`, build
`new BillingStandIn(db, {standIn: fakeBilling(), …})` with a `db` whose `findUniqueOrThrow`/`findFirst` resolve after 20 ms,
then run `Promise.all([x.issue({firmId}), x.issue({firmId})])`.
Expected: one invoice, or the second call answers `created:false`. Actual: `A true in_standin000001 SAMPLE-0001` and
`B true in_standin000002 SAMPLE-0002`. The firm's list holds only `in_standin000002`. `page(in_standin000001, A's token)` returns **404**.
So caller A gets a link to an invoice that does not exist, the invoice numbers skip, and a double-clicked "issue" costs a number.
Live at 5647a0094: 20 parallel `POST /api/platform/billing/stand-in/invoice` for one new firm gave one invoice
(`in_standin000003`), all 20 links answered 200, and the list showed 1. Held.
Nit on the fix: 18 of the 20 answers said `created:true`, because every coalesced caller gets the first caller's answer. Only one invoice was created.

**m1 (Minor): the issued invoice never shows in the list when the firm has a stored Stripe customer on a stand-in server.**
account.ts:72 `customer = sub.stripeCustomerId ?? standInCustomer(...)`. `issue()` always writes to `standInCustomer(firmId)`
(stand-in.ts:51/70). Steps on :4725 (all Sample):
`update platform_plan set stripe_monthly_price_id='price_sample_team_m' where code='team'`, then sign up a firm through the
public door. The sign-up's own `fakeBilling()` stores `cus_fake000001`. Then `PUT /api/platform/billing/address` (ON), then
`POST …/stand-in/invoice` gave `200 created:true in_standin000008` with a working link.
`GET /api/platform/billing/invoices` gave `{"invoices":[]}`, and a second issue gave `created:false`.
Expected: the issued invoice is listed with its tax. Actual: the page says "No invoices yet." while the issue call
reported an invoice. Any database that once ran with Stripe price ids or customers, then run locally without a key, hits this.

**m2 (Minor): a held firm cannot get its invoice from the stand-in.** stand-in.ts:109 has `@PermissionKeys` but no
`@HoldOpen()`, unlike every route in `BillingController`. Steps: create a firm, save an ON address,
`update platform_firm set status='PAYMENT_HOLD'`, then `POST …/stand-in/invoice` gave **402 PAYMENT_HOLD**, whose words say
"…or pay the open invoice to continue". `GET …/invoices` gave `[]`. So the held-for-address path ("save the address, the held
invoice finalizes with its tax") cannot be shown on the stand-in.

**m3 (Minor): after a restart, invoice numbers and ids are reused for another firm.** Steps: sample-firm (A) issued
`in_standin000001 / SAMPLE-0001`, then `isolated.sh brk121 4725 restart`. A's old link gave 404, which is as documented.
sample-solo then issued **`in_standin000001 / SAMPLE-0001`** and A got `SAMPLE-0002`. A downloaded file `invoice-SAMPLE-0001.html` now
names another firm's invoice. Within one process the number is one global counter (stand-in.ts:62), so firm C's
`SAMPLE-0003` also tells it that two other invoices were issued. A per-firm or random suffix would avoid both problems.

**m4 (Minor): the currency is hard-coded and the plan's currency is ignored.** stand-in.ts:64 sets `currency: "cad"`, but `platform_plan.currency`
exists. Steps: `update platform_plan set currency='USD' where code='team'` → issue → `currency:"cad", amountDueCents:11187`.
The USD price is labelled CAD and taxed as CAD. This does not happen today because all Sample plans are CAD.

**m5 (Minor): the View/Download links disappear without a word on another origin.** `standInUrl` requires `origin ===
location.origin` (billing-contract.ts:88-90), and `hostedUrl` is built from `STUDIO_PUBLIC_URL`/`localhost:<port>`
(stand-in.ts:65). Steps: open `http://127.0.0.1:4725/settings/billing` as the Owner. The row shows tax and status, but the action
cell is empty (`links: []`) with no explanation. Origins other than the configured one (a LAN IP, a proxy) behave the same way.

**m6 (Minor): the invoice page does not reflow a long name or address.** stand-in.ts:87 has no `overflow-wrap`. Steps: sign up with
firm name `"Ö"×120`, save the address with `street_name "W"×150` and `city "C"×100`, issue, then open the link at 720 px (200 % of 1440).
`scrollWidth 2463` vs `clientWidth 720`, so the page scrolls sideways (WCAG 1.4.10). The Plan and billing page held at 720 px
because it already wraps.

**m7 (Minor, to confirm; Unconfirmed: no counsel, no accountant):** the stand-in's invoice page shows no supplier GST/HST
registration number. A firm needs that number to claim an input tax credit on a taxed invoice. Not checked against a cited source today. Labelling it Sample would make the gap explicit.

## Held
* Roles: the Case Officer gets 403 (`agent/subscription:pay`). Billing/Finance (role added by SQL) can read the list (200) but
  gets 403 on issue. With no session, issue is 401.
* Tax money: ON HST 13 % (9900 → 1287, due 11187). Yearly Firm plan in QC: 199000 + GST 5 % 9950 = 208950, "one year". NS
  is 14 % from 2025-04-01 in the cited table. A null price gives 409 NO_PRICE in words. A zero price gives an invoice with $0.00 tax.
  `taxCents` equals the sum of `taxLines` (refine). An ENDED subscription gives 404.
* Address changed (ON→AB) or plan changed after issue: the same invoice comes back (`created:false`, ON, 9900), as documented. A
  province not in the 13 codes (lowercase `on`, set by SQL) gives 409. `PUT address` cannot store one.
* Page token: a wrong token, another invoice's id with my token, `t` sent twice (array), or a missing `t` all give 404 with identical
  words. Constant-time compare. The token is 24 random bytes. Headers: `no-store`, `no-referrer`, CSP `default-src 'none'`.
  The token is not in api.log (routes are logged as `:id`).
* XSS: the firm name `<img onerror>"'&<script>` and address fields `<script>`, `<svg onload>` were all escaped on the page. The download
  filename is `invoice-SAMPLE-0004.html` (sanitized). Non-English text (Société 東京, Montréal) rendered correctly.
* Web allow-list: `..`, `%2e%2e`, `user:pw@`, `invoicesX/`, `javascript:`, `*.stripe.com.attacker.io` and `attacker.io?stripe.com`
  were all refused.
* Cross-firm: the list is firm-scoped, and each firm's stand-in customer comes from its own id.
* The Plan and billing page at 1440, 1024 and 720 px (200 %) has no horizontal scroll, and its Tax column reads "$12.87 CAD (HST 13 %, ON)".
  Keyboard Tab reaches View, then Download. The screen-reader text says "(stand-in) (opens in a new tab)".
* The Stripe adapter's `taxOf` reads `total_taxes`/`subtotal_excluding_tax`, which exist in stripe@23.1.0's `Invoice` type.

## Round 2: diff b9d69d2..ab89849 only (copy brk121b on :4726 at ab89849; stopped and database dropped)
* **Lock (M1) held.** Tried 10 parallel issues with no address saved: all 409 ADDRESS_NEEDED (the shared refusal). Then 30 parallel issues for firm A and 10 each for firms B and C, all at once: one invoice per firm, 50/50 links 200, each list 1, a later call `created:false` with the same id. A's token on B's invoice id: 404.
* **Two-customer read (m1) held.** Steps: a plan with a Stripe price id → sign up → `cus_fake000001` stored → issue. The list shows the stand-in invoice. A second firm (`cus_fake000002`) sees nothing of the first. Firm E only reads firm D's invoice if E's stored id is forced by SQL to `cus_standin<D>`, and I found no way to store that id through the app. Not a finding.
* **Hold (m2) held.** A PAYMENT_HOLD firm issues (200) and lists 1. With no address: 409. A route that is not billing (`GET /api/platform/staff/invitations`) stays 402.
* **NOT_CAD (m4) held.** Plan `USD`/`usd` gives 409 NOT_CAD, while `cad` issues. The checks run in this order: address, then price, then currency. Once an invoice exists, changing the plan's currency returns the same CAD invoice (`created:false`), consistent with one invoice per firm.
* **Headers held:** `nosniff` and `frame-ancestors 'none'` are set, and there is no `x-powered-by` on the page. Nit: the 404 answer still sends `x-powered-by: Express`.
* **r2-m1 (Minor, m3 not fully closed): one number for two different documents after a restart.** Steps: sample-solo issues `SAMPLE-5AE24747-0001`, $55.37 (Solo). Restart the copy, move the firm to the Firm plan by SQL, then issue again: **`SAMPLE-5AE24747-0001`, $224.87**, with a new id; the old link is 404. The number is always `<firm prefix>-0001`, so after a restart it names a different amount. Cross-firm reuse is gone (random ids, firm prefix).

Round 2: M1, m1, m2, m4 and m6 are closed; m5 and m7 stay as notes. One Minor remains (r2-m1).

Verdict: Approve ab898493ae0d59a6a4e82fc7824d76d08dbeb96f
