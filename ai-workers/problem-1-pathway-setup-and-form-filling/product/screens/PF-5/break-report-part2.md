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

## Round 2: the fixes at `97b77db41a9b060580ff3850dff1ff65c1a168b8`

The check passes 81/81. The attacks are in `prototype/studio/var/break_pf5p2_r2.ts` (git-ignored). It uses its own scratch database (dropped) and no network. It simulates Stripe being unreachable, or one call failing, with a wrapper around the fake billing port.

### R-M1 (Major): a Stripe outage of about 25 minutes sets real events aside for good, and Stripe's later retry is ignored
* **Steps (R2).**
  1. Firm H2 is held; its invoice is paid at Stripe.
  2. `invoice.paid` arrives while our calls to Stripe fail (ETIMEDOUT). The inline handling fails.
  3. Five sweeps run, 5 minutes apart, still during the outage.
  4. The outage ends. Stripe redelivers the event, then one more sweep runs.
* **Actual.**
  * After step 3 the receipt reads `handled_at` set, outcome `set aside after 5 failed tries: check it in Stripe`.
  * The redelivery is answered `{duplicate:true}` and not handled (`open` is 0 because `handled_at` is set). The sweep handles 0.
  * The firm stays `PAYMENT_HOLD` after paying. Every event about that payment (`invoice.paid`, `invoice.payment_succeeded`, `customer.subscription.updated`) arrives in the same window and is set aside the same way. The firm stays held until the subscription's next event, which can be weeks away.
  * The only alert is a `console.warn`.
* **Code.**
  * `webhook.ts:91-93`: 5 tries, one per sweep (about 25 minutes), with no backoff and no clock-time limit.
  * `webhook.ts:66`: a set-aside receipt counts as handled, so Stripe's own retries (up to 3 days) are thrown away.
* **Should.**
  * Set aside only after a time span close to Stripe's own retry window, with backoff.
  * A receipt that was set aside, not handled, is handled again when Stripe redelivers it.
  * An alert goes through the observability path, not a console warning.

### Minor (round 2)
* **r1 (R5b, R5c, R5d): the address-hold release can still be lost.** `account.ts:85-87` swallows a failure of the release or of the subscription read and still answers `{saved:true, onStripe:true}`. The draft stays held (`heldDrafts` still holds the invoice) and the firm stays `PAYMENT_HOLD` after the next `invoice.updated` and a sweep.
  * A race does the same: an event's `holdDraftInvoice(draft)` call lands after the user's release, because it runs after the transaction (`webhook.ts:144`). The draft ends up held again.
  * Saving the address again recovers it, and the billing page still says "business address needed". But nothing tells the user to save again, and no job retries the release.
* **r2 (R3d): a steady stream of new failures can starve a retried receipt.** With 50 new failing receipts before each sweep, a good receipt with `retry 1` was never picked in 6 sweeps (the firm stays held). Never-tried receipts always sort first (`webhook.ts:87`). This needs about 10 failing events a minute, sustained, so it is unlikely.
* **r3 (R4c): latent, not reachable in part 2.** A firm with an ENDED row (`sub_old`) and a new ACTIVE row (`sub_new`): a late `customer.subscription.deleted` for `sub_old` matches the ENDED row, and `FIRM_OF[ENDED]` puts the paying firm in `PAYMENT_HOLD` (`webhook.ts:131-133`). Part 2 never makes a second row, so it cannot happen today. The firm move should follow the firm's current row only; this becomes Major when part 3 lets a firm subscribe again.
* **Still open:** m7, m8 and m9 are left open on purpose, as noted. Of m4, the "postal code against province" half is still open (`M5H 1A1` with BC is accepted); the letters half is fixed.

### What held in round 2
* **M1, the fixed parts.**
  * A redelivery after a failed inline handling is handled: `PAYMENT_HOLD → ACTIVE` (R1).
  * Fewest tries first works: 60 bad receipts plus a good one with `retry 1` → the good one is handled on the third sweep (R3b).
  * The adapter reads `metadata.firm_id: "acme-law"` as `firmId: null` instead of throwing (R8).
* **M2.**
  * A second subscription created and then cancelled, even with the firm's id in its metadata, leaves `ACTIVE/ACTIVE/sub_main` (R4a).
  * Two Checkouts' first events at once link exactly one subscription (R4b).
  * A cancelled subscription is never linked to an unlinked row (R4d).
  * A card Checkout on a held firm still finds the linked row, resumes it and ends the hold (R4e).
* **M3.** Address saved → draft released → invoice paid → `ACTIVE` (R5a).
* **m5 and m6.** Card, portal and invoices answer 503 when Stripe is down and when it is not set up. The address is saved with `onStripe:null` and no made-up link (R6).
* **m1 and m4.**
  * Accepted: a ZWNJ street name, a ZWJ emoji, a lower-case postal code, and a leading BOM (`trim` removes it).
  * Refused: RLO (U+202E), `D0D 0D0` and `W1A 1A1`.
* **HTTP.**
  * A held firm gets 402 on invitations, with or without the trailing slash. `me`, `billing` and the address answer 200. `firm/profile` is gone (404).
  * A signed webhook gets 200; changed bytes get 400.

Breaker verdict: 1 Blocker/Major at 97b77db41a9b060580ff3850dff1ff65c1a168b8
