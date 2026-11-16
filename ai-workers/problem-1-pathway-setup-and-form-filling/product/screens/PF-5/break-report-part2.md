# PF-5 part 2: break report (Stripe's webhook, the payment hold, billing and profile; API only)

Commit `8c21a1e8ed4d695e6d98754734828f4922859d05` (PR #1959). The breaker's run, 16 Nov 2026. The baseline check `tests/check_pf5_signup_billing.ts` passes 76/76. The attacks are in one scratch script, `prototype/studio/var/break_pf5p2.ts` (git-ignored). It applies every migration to its own scratch database `xr_studio_break_<pid>` and drops it at the end. It drives `BillingEvents`, `BillingAccount`, the fake billing port, `StripeBilling` on a canned `fetchFn`, and a small Nest app of PF-4's guard, these routes, the raw-body door and the 402 interceptor. No network was used, no Stripe call was made and nothing ran on port 4400. Run it with `node_modules/.bin/tsx --tsconfig api/tsconfig.json var/break_pf5p2.ts`. Paths below are under `prototype/studio/`.

## Findings

### M1 (Major): the sweep can stall for good on 50 receipts it can never handle, and Stripe's retry is ignored, so a paid firm stays held
* **Steps (B1).** Firm H is on hold. Stripe has `sub_held` active with a paid latest invoice.
  1. Store 50 unhandled receipts older than 2 minutes that can never be handled.
  2. Deliver `invoice.paid` for `sub_held` while the subscription read fails once (ECONNRESET).
  3. Stripe delivers the same event again.
  4. Advance the clock 3 minutes and run `sweep()` three times.
* **Actual.**
  * The redelivery is answered `{received:true, duplicate:true}` and is not handled.
  * The sweeps handle `[0,0,0]`. The good receipt stays `NOT HANDLED` and the firm stays `PAYMENT_HOLD/PAYMENT_HOLD` after paying.
  * Once the 50 receipts are deleted, one sweep makes it `ACTIVE`.
* **Why this happens in real use (B1b).** One subscription's data that our parser refuses makes every event about that subscription fail on every try. For example, a subscription whose metadata has `firm_id: "acme-law"` (a test subscription or one made in the Dashboard): `StripeBilling.subscription()` throws a ZodError every time. Events older than Stripe's retention period can also no longer be read again.
* **Code.**
  * `api/src/platform/billing/webhook.ts:87-89`: oldest 50 first (`take: 50, orderBy receivedAt asc`), with no attempt count, no backoff and no dead-letter.
  * `webhook.ts:67`: a repeat delivery of an unhandled receipt is acknowledged and dropped.
  * `api/src/platform/billing/stripe.ts:37`: a firm id in the metadata that is not a uuid throws instead of becoming null.
* **Should.**
  * A receipt that keeps failing is moved aside after N tries (with an alert) and never blocks the others.
  * A redelivery of a receipt that is still unhandled is handled again.
  * A bad `firm_id` in the metadata is read as null, as `eventFacts` already does.

### M2 (Major): an event about another subscription of the same customer takes over and ends the firm's live subscription
* **Steps (B2).** Firm A is `ACTIVE/ACTIVE` on `sub_main` (customer `cus_dup`, paid). Stripe also has `sub_second` for `cus_dup`, for example a second Checkout finished in another tab, or one made by support.
* **Actual.**
  * `customer.subscription.created` for `sub_second` (trialing): the move is refused, but the row now points to `sub_second` (`ACTIVE/ACTIVE/sub_second`).
  * Stripe cancels `sub_second`: the firm goes to `PAYMENT_HOLD/ENDED/sub_second`.
  * The paying `sub_main`'s next `invoice.paid` changes nothing (ENDED is final): the firm is held for good, on track for the 90-day deletion, while it is paying.
  * B2d: a single late `customer.subscription.deleted` for an old cancelled subscription of the same customer does the same in one event (`PAYMENT_HOLD/ENDED/sub_old2`).
* **Code.**
  * `webhook.ts:97-99`: when the subscription id is not found, the lookup falls back to the firm, then to the customer.
  * `webhook.ts:112`: only the customer and the firm are compared, never `row.stripeSubscriptionId`.
  * `webhook.ts:120`: `stripeSubscriptionId: snap.id` is written even when the move is refused.
* **Should.** When the row already has a different `stripeSubscriptionId`, the event is ignored and audited ("another subscription of this customer"). The id is never overwritten.

### M3 (Major): the "business address needed" hold has no way out
* **Steps (B3).**
  1. Firm T is `ACTIVE` with a draft invoice whose `taxNeedsAddress` is true. The event holds the firm and `holdDraftInvoice` sets `auto_advance: false`.
  2. The Owner saves a valid address with `PUT billing/address` (`saved:true, onStripe:true`).
  3. Stripe's `customer.updated` arrives, with the tax now computable.
* **Actual.** The firm is still `PAYMENT_HOLD` after the address and after the event.
  * Nothing re-reads the subscription after the address is saved.
  * Nothing turns `auto_advance` back on or finalizes the draft (grep: no `auto_advance: true` or finalize call anywhere in `api/src` or `ports/`).
  * The held draft therefore never becomes paid, and `webhook.ts:116` keeps the hold until an invoice is paid. A firm that did exactly what the hold asked stays held.
* **Code.**
  * `api/src/platform/billing/account.ts:73-86`: no refresh and no release of the draft.
  * `stripe.ts:53`: only ever sets `auto_advance: false`.
  * `webhook.ts:115-116`.
* **Should.** Saving the address, or an event that shows the tax is computable, turns `auto_advance` back on (or finalizes the draft) and re-reads the subscription. The address-needed hold ends when the invoice is paid.

### Minor
* **m1 (B7a).** A Persian firm name with a ZWNJ (`مهاجرت‌پارسیان`) is refused with "no control characters". `\p{Cf}` also catches ZWNJ, ZWJ (emoji) and the bidi marks that Persian, Indic and emoji text need. `account.ts:23`. Arabic text without a ZWNJ is accepted.
* **m2 (B7d).** The optimistic lock is opt-in. Without `expectedUpdatedAt`, session A's save silently overwrites session B's earlier change ("Session A name" wins). With a stale `expectedUpdatedAt` the answer is 409, which is correct. `account.ts:33,112`: it should be required.
* **m3 (B7g).** A firm row whose `updated_at` has microseconds (written by SQL or an operator; the column is `timestamptz(6)`) can never be saved again: 409 every time, even with the value just read. JS milliseconds never equal the stored value at `account.ts:116`.
* **m4 (B7h).** The postal code check takes letters Canada never uses as the first letter (`D0D 0D0`). It also does not check that the postal code matches the province (`Z9Z 9Z9` with ON). Stripe Tax then still finds no location, or the wrong one. `account.ts:28`.
* **m5 (B8).** When Stripe is unreachable, `POST billing/checkout` and `billing/portal` throw a raw Error, which becomes a generic 500. Invoices answer a clear 503. `account.ts:91,97`.
* **m6 (B8b).** A `test` or `production` server with no Stripe key has `notReady` set, but the billing routes still use the fake. `card()` hands back `https://checkout.stripe.com/c/pay/cs_setup_cus_…`, a URL that does not exist. `api/src/platform/firms/runtime-ports.ts:40`: only the webhook checks `notReady`.
* **m7 (B11).** On a local server (the default environment) the webhook door accepts a signature anyone can compute from the source: FNV hash over `fake-whsec.<t>.<body>` (`ports/billing.ts:152,180`). The forged event was stored (`{received:true}`). It cannot move a firm, because the fake has no subscriptions, but it fills `webhook_receipt`, which feeds M1. Local only.
* **m8 (B4).** A `SECURITY_LOCK` firm whose subscription goes unpaid ends `SECURITY_LOCK/PAYMENT_HOLD`. When the lock is lifted to ACTIVE, the 402 gate (it reads the firm only) lets an unpaid firm in until Stripe's next event. `webhook.ts:118-125`.
* **m9 (reading only, not run).** A held firm's Owner gets 402 on `POST staff/:id/sign-out-everywhere` and `reset-two-step`. A leaver's sessions cannot be ended until the firm pays. `api/src/platform/billing/routes.ts:22`. The spec may accept this; it is noted for the tech lead.

## What held (with evidence)
* **Signatures.**
  * Unsigned requests, bytes changed after signing, and signed non-JSON all get 400, with nothing stored. A 2 MB body gets 413.
  * The real adapter rejects a signature made with another secret and one 6 minutes old (`BillingSignatureError`).
  * Raw body: signed `application/json`, `text/plain` and a trailing slash all get 200 on the real door, so the JSON parser never takes the body first.
* **Duplicates and order.**
  * 5 parallel deliveries of one event: 1 receipt stored, 1 `firm.payment_hold` (B5).
  * The baseline check covers paid-before-created and created-before-paid.
* **Cross-firm events.** A Checkout event naming the victim firm with another customer's paused subscription is ignored; the victim stays `ACTIVE/ACTIVE/sub_victim` (B6).
* **The hold.**
  * A held firm gets 402 on the normal, trailing-slash and profile paths.
  * Upper case gets 403, and `%2F` or a doubled slash gets 404, so nothing gets past the hold (B10a).
  * `me` and `billing` get 200.
  * The uncollectible invoice keeps the hold (baseline check).
* **Validation.**
  * Profile: 201 characters, a NUL byte and a wrong type are refused (400). Two saves at once give 200 and 409 (B7f).
  * Address: BEL, 151 characters, a number type and an extra key are refused (400).
  * The legal name is Owner-only and the country cannot change (baseline check).
* **Firms stay apart.** Every read uses `s.firmId` through `firmScope` or the firm's own customer id.
* **When Stripe is unreachable.**
  * Billing view: `billingAvailable:false`. Invoices: 503.
* **Not shown: the database pool.** 10 handlings waiting 4 s each on Stripe inside the advisory-lock transaction did not slow an unrelated query (3 ms, B9). One earlier run measured 3.7 s, which was not reproduced.

Breaker verdict: 3 Blocker/Major at 8c21a1e8ed4d695e6d98754734828f4922859d05
