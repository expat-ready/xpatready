# PF-5 part 2: independent review (reviewer), 16 Nov 2026

PR #1959 "PF-5 part 2", commit `8c21a1e8ed4d695e6d98754734828f4922859d05` (branch `claude/happy-tesla-ofoebq`). This is an API-only PR with no screen, so the BIC scorecard and D1-D20 do not apply (N/A).

What I checked:
* the diff against `origin/main` (789 changed lines);
* the row PF-5 "Done when" on `main`;
* the "PF-5 part 2" bullet in `step0.md`;
* contracts §7 §1.1 (`origin/lead-b-front-office`, lines 128-145).

How:
* I ran `tests/check_pf5_signup_billing.ts` myself: **76 passed, 0 failed**.
* I walked the API on an isolated copy `rvpf5b` on :4431 (runtime ports; local identity, Sample seed, fake billing), read the data with psql, then stopped the copy.

Verdict: Changes requested

## What holds (evidence)
* **Signature first, raw body.** Through the real `main.ts` app, a signed body with spaces and line breaks gets 200, an unsigned one 400, and a timestamp 400 s old 400. A path in other letter case still reaches the raw parser, so the raw door sits before the JSON parser. In the harness an unsigned or changed body is 400 with no receipt.
* **Stored once.** The receipt is keyed on `@@unique([service, eventId])`, and a repeat answers `duplicate: true`.
* **Replays.** A replay with a valid signature is either a duplicate or outside the 300 s window.
* **Out of order.** Paid-before-created and created-before-paid both end Active.
* **Trial with no card.** Stripe pausing gives Payment hold that day, with `firm.payment_hold` and the change in `module_event`.
* **Grace and billing date.** Overdue is an indicator only; paid within grace returns to Active with the billing date unchanged.
* **Card on a held subscription.** It resumes the subscription with anchor `now`. The hold ends only on a paid invoice, never on an uncollectible one. The test would fail without `webhook.ts:116`, because the fake turns uncollectible into active.
* **Refused moves.** DELETED → ACTIVE and ENDED → ACTIVE are refused and audited.
* **Transactions and audit.** Each change, its audit line and its event (written last) share one transaction. A forced audit failure rolls the change back and the sweep handles the event once.
* **Payment hold.** A held firm gets 402 on `staff`, `STAFF`, `staff/`, `me/account`, `firm/profile` and `front-office/leads`. It gets 200 on `billing`, `me` and `PUT billing/address`. The gate reads the route's own metadata, not the URL, so path tricks did not get through.
* **Roles.** A Case Officer gets 403 on billing, the portal and the profile.
* **Profile.** The Owner's legal-name change is saved with one `platform.firm.profile_changed` line. A bad province or postal code is refused field by field.
* **Other Done-when lines.** The trial end is stored at sign-up (QA-481). The portal has plan switching off. There is no network call in CI and no live key.
* **Firm scope.** Every firm-table read goes through `firmScope` except these, all justified:
  * `webhook.ts:97,99`: the event is how the firm is found;
  * reads of `platform_firm` by its own `id`;
  * `webhook_receipt`, a system table.
* **Prisma interactive transaction holding a Stripe read** (`webhook.ts:105-135`): acceptable. The read sits inside the per-firm advisory lock on purpose, so an older read can never land after a newer one. Its limits are in m2.

## Blockers
None.

## Majors
**M1. A "business address needed" hold has no way out. The firm stays held and its invoice is never collected.**
* **Where:** `webhook.ts:115` and `webhook.ts:136`; `stripe.ts:53`; `account.ts:73-86`.
* **What happens now:** `holdDraftInvoice` sets `auto_advance: false`, and nothing ever sets it back. Stripe's own text (library `Invoices.d.ts` l. 185): "If `false`, the invoice's state doesn't automatically advance without an explicit action."
* **Scenario:**
  1. A trial with a card ends with no usable address. Stripe goes `active` with a draft invoice whose tax `requires_location_inputs`, so we hold the firm and hold the draft.
  2. The Owner saves the address with `PUT billing/address`. It reaches the Stripe customer, but nothing releases or re-reads the draft.
  3. Any later event hits `webhook.ts:116` ("hold ends only on a paid invoice"). The draft can never be paid, and the card Checkout does not help because the subscription is not paused.
* **Result:** the firm stays held for a whole billing period (a year on a yearly plan, past the 90-day close), and that period is never invoiced.
* **Fix (small):**
  * Make the port call two-way, e.g. `holdDraftInvoice(id, held: boolean)`.
  * After the address reaches Stripe in `setAddress` (or in `refresh`, when the held draft's tax no longer needs the address), release the draft (`auto_advance: true`) and refresh.
* **Fail test (≈4 lines, after F6):** `setAddress(F6)`, then make the fake's draft `taxNeedsAddress: false` and send an event. Expect the draft released. Then send a paid invoice and expect F6 `ACTIVE`. Today it stays `PAYMENT_HOLD` with no release call.

**M2. The guard that keeps an event from moving another firm has no test (STANDARDS [M] l. 48: "A rule's test fails when the rule is removed").**
* **Where:** `webhook.ts:112`.
* **What happens now:** deleting line 112 leaves all 76 checks green. This is the tenant boundary on a money row ("breaker: yes"), and it is what stops forged or mistaken `firm_id` metadata from touching another firm.
* **Scenario the guard stops:**
  1. An event names held firm F7 (`metadata.firm_id`) with a new `sub_x`.
  2. Stripe's `sub_x` belongs to `cus_f3`, which is paid and active.
  3. Without the guard, F7 becomes Active on F3's payment, and F7's row is re-linked to F3's subscription.
* **Fail test (≈4 lines):**
  * `billing.subs.set("sub_x", snap("sub_x", { customerId: "cus_f3", status: "active", latestInvoice: paid("in_x") }))`
  * send `raw("customer.subscription.updated", { object: "subscription", id: "sub_x", customer: "cus_f3", metadata: { firm_id: F7 } })`
  * expect F7 still `PAYMENT_HOLD`, F3 unchanged, and the receipt outcome `…another customer: ignored`.
* **Second case worth one line:** `snap.firmId` differing while the customer matches.

## Minors
* **m1. The subscription id is not pinned, which is latent while there is one subscription per firm.**
  * **Where:** `webhook.ts:120` and `webhook.ts:123`.
  * **Overwriting:** `refresh` writes `stripeSubscriptionId: snap.id` over a row that already has another subscription id. With two subscriptions for one customer (e.g. made in the Dashboard), the row flips between them. If an old cancel lands last, the row becomes ENDED, which is final, and a paying firm is held.
  * **Old rows:** an event for an old ENDED row moves the firm to `FIRM_OF.ENDED = PAYMENT_HOLD` even if the firm has a live subscription.
  * **Fix:** return "another subscription: ignored" when `row.stripeSubscriptionId && row.stripeSubscriptionId !== snap.id`, and make no firm move from an ENDED row.
  * **Test:** a second `sub_y` for `cus_f2` with `canceled` → F2 stays Active.
* **m2. A Stripe call inside a 30 s transaction.**
  * **Timeouts:** the Stripe client keeps its default 80 s timeout with 2 retries (`stripe.ts:20`, library `DEFAULT_TIMEOUT = 80000`), longer than the 30 s transaction.
  * **Every event refreshes:** each event type, including `charge.*` and `payment_intent.*` (matched by customer), opens a transaction, reads Stripe and writes a "synced" audit line. One payment gives about 6-10 transactions waiting on one firm's lock, each holding a pool connection (pg's default is 10).
  * **Fix:** add `timeout: 10_000` on the client, and ignore event types that cannot change a subscription.
* **m3. A few failing receipts can block the sweep.**
  * **Where:** `webhook.ts:87`.
  * **Problem:** it takes the 50 oldest unhandled receipts with no cap on attempts. 50 receipts that always fail would stop a newer receipt left by a crash from ever being handled. Examples: an event over 30 days old that can no longer be read back, or `stripe.ts:46` throwing on a setup intent that is still `processing`. That newer receipt could be the paid event a held firm needs.
  * **Fix:** count tries in `outcome` and close after N with an alert.
* **m4. The card Checkout does not limit itself to cards.**
  * **Where:** `stripe.ts:67`.
  * **Problem:** it does not set `payment_method_types: ["card"]`. A Canadian bank debit leaves the setup intent `processing`, so `useCardAndResume` throws every time (m3) and the firm stays held after adding a payment method. The row says "card".
* **m5. A card added in the Customer Portal is not seen.**
  * **Where:** `stripe.ts:38`.
  * **Problem:** `hasCard` reads only the subscription's `default_payment_method`. A card added in the portal (`payment_method_update` on) is saved on the customer, so it shows `cardOnFile: false` and does not resume a paused subscription.
  * **Fix:** also read the customer's `invoice_settings.default_payment_method`.
* **m6. `firm.activated` claims a payment that may not exist.**
  * **Where:** `ports/events.ts:12` says "became paid and active".
  * **Problem:** TRIAL → ACTIVE (`webhook.ts:113`, `webhook.ts:132`) fires on Stripe `active` at trial end, while the first invoice is still a draft. Overdue grace makes this acceptable, but the event's words are wrong.
  * **Fix:** word it "became active", or require `paid` here as on the hold path.
* **m7. The 402 does not reach case routes.**
  * **Problem:** the row's Done-when says a held firm's staff get 402 on a case route. The gate reaches only `/api/platform` and `/api/front-office`. When walked, a held firm's `GET /api/runtime/cases` (simulated person) answered 200.
  * **Fix:** record the gap in the PR and in `step0.md`. It needs the case routes on staff sign-in. Do not claim the line as met.
* **m8. A held firm is told to pay when the real reason is a missing address.**
  * **Where:** `routes.ts:23` and `routes.ts:37`.
  * **Problem:** every 402 says "add a card or pay the open invoice", even when the hold reason is "business address needed".
  * **Fix:** pick the words from the reason.
* **m9. The profile route differs from the row.**
  * **Address:** `PUT firm/profile` refuses `businessAddress` (`account.ts:30` is strict; walked: 400 "Unrecognized key"), but the row says the address is "shown and edited also on PUT /api/platform/firm/profile".
  * **Owner only:** the route is Owner-only for every field, because the catalogue gives `firm-profile:manage` to OWNER only. So the legal-name check (`account.ts:111`) is reachable only in the service test. Record this stricter reading of AG-1-65.
* **m10. Nothing tests the raw-body line in `main.ts` (`main.ts:236`).**
  * **Problem:** without that line, `check_forms_qa53`'s empty-body 400 and the harness (which mounts `stripeRawBody` itself) stay green, while every real Stripe event would get 400.
  * **Fail test:** a signed body with spaces posted to the booted app → 200.
* **m11. Lead B's DWn fail case is only partly built.** An already finalized (`open`) untaxed invoice holds the firm but raises no alert (`webhook.ts:115`). The case is "caught and alerted".
  * **Fix:** one alert line through the observability logger.
* **m12. No test covers the per-firm lock (`webhook.ts:108`).** Removing it fails nothing.
  * **Fail test:** two `refresh` calls at once for one firm, with the fake's answer changing between them → the newer state wins.
* **m13. Smaller points.**
  * Pass the raw `Buffer` to `constructEvent`, not a re-decoded string (`webhook.ts:59`).
  * On a `local` server the fake's signature is public, so anyone can store receipts that are never handled. Walked: `evt_rev1` and `evt_rev2` were stored and left unhandled. This is local only.
  * Add a short comment at `webhook.ts:97,99` saying why those two reads are not firm-scoped.

## Journey test (reviewer; API only, walked with curl on :4431 plus the harness)
Journeys: firm owner or admin.

| # | Journey | Result |
|---|---|---|
| J1 | See my billing | Pass |
| J2 | My invoices | Pass |
| J3 | Fix my address: bad, then good | 400 naming the fields, then 200 with an audit line |
| J4 | My firm is held | 402 elsewhere, 200 billing, `me` and address |
| J5 | Card or portal while held | 409 "Start your trial first": the Sample firm has no Stripe customer |
| J6 | Legal name: Owner, then Case Officer | 200, then 403 |
| J7 | Stripe events: signed, repeated, unsigned, old | 200, duplicate, 400, 400 |
| J8 | Address hold, then the address added | M1: stays held |
| J9 | A crash after storing (harness) | The sweep handles it once |

| Criterion | Score | Evidence |
|---|---|---|
| Task completed | ½ | J1-J7 and J9 done; J8 cannot finish (M1) |
| Next step obvious | ½ | The hold's words are wrong for an address hold (m8) |
| Plain words | ½ | The province error lists raw enum text ("Invalid option: expected one of …") |
| Feedback and state | 1 | `hold.reason`, `deletionDate`, `onStripe` and `billingAvailable` are shown |
| Correct data | 1 | One receipt per event id; audit lines for the address and the profile; the harness's DB reads |
| Error recovery | ½ | The sweep works; M1, m3 and m4 leave dead ends |
| Accessibility and screen sizes | ½ | No screen; errors are keyed by field |
| Speed | 1 | 2-44 ms per call |
| Visual quality | ½ | No screen (N/A, counted as ½) |
| Trust and sources | 1 | Stripe facts cited from the library with file and line; the docs block is stated; Sample plans are labelled |
| **Total** | **7 / 10** | No criterion at 0; **below the pass mark of 8** |

Fixes that raise the score, most valuable first: M1 (task, recovery), m8 (next step), m3 and m4 (recovery), plain words for the enum error.

## Not checked
* A live Stripe test-mode run: no keys here, and docs.stripe.com is blocked.
* Stripe's real tax recalculation on a draft when the address changes.
* A browser, a screen reader, or an intended user's unaided walk (D17 and D20 stay with the founder).
* `graph.mjs`: not run, because it writes `qa/GRAPH.md` and this PR is API only.

## Round 2: diff-only re-review (P-277), head `97b77db41a9b060580ff3850dff1ff65c1a168b8`

I read only `git diff 8c21a1e8..97b77db -- ai-workers/`.

**The check:** I ran `tests/check_pf5_signup_billing.ts` twice and got **81 passed, 0 failed** both times.

**Proof that the new tests fail when their rule is removed** (on a scratch worktree, since removed; repository code unchanged):
* Without the cross-customer guard (`webhook.ts`, "belongs to another customer"), the check gives 80/81: "review M2" fails with "TRIAL → ACTIVE".
* Without the draft release in `setAddress`, it gives 80/81: "break M3" fails.
* Without both subscription pins (the `stripeSubscriptionId: null` filter in `findSubscription` and the "not this firm's live subscription" line in `refresh`), it gives 80/81: "break M2" fails with "ENDED".

**Size:** code changes against `main` are now 782 lines (761 added, 21 removed), not counting `.md` files.

Verdict: Approve 97b77db41a9b060580ff3850dff1ff65c1a168b8

### Findings from round 1
| Finding | Round 2 |
|---|---|
| M1: the address hold had no way out | **Fixed.** `setAddress` releases the latest draft once the address reaches Stripe (`holdDraftInvoice(id, true)`, `auto_advance: true`), and the paid invoice then ends the hold. Tested, and the test fails without the release. |
| M2: the cross-customer guard had no test | **Fixed.** The new "review M2" check fails with the guard removed. |
| m1: the subscription id was not pinned | **Fixed.** A subscription id we do not know matches only a row not yet linked, and `refresh` ignores a subscription other than the one stored. An ENDED row still moves its firm to hold, but this stays latent while a firm has one subscription. |
| m2: a Stripe call inside a 30 s transaction | **Fixed.** The client now times out after 10 s, and only `customer.subscription.*`, `invoice.*` and `checkout.session.*` events are looked up. 10 s × 3 attempts can still go past the 30 s transaction, but that only rolls back. |
| m3: failing receipts could block the sweep | **Fixed.** Receipts with the fewest tries go first and a receipt is set aside after 5 failed sweeps; the test fills the sweep with 50 that always fail. A redelivered event that was never handled is handled at once. |
| m4: the card Checkout accepted bank debits | **Fixed.** `allowed_payment_method_types: ["card"]` is a real `SessionCreateParams` field in library 23.1.0 (`Checkout/Sessions.d.ts` l. 2157), so Stripe will not refuse it as unknown. |
| m6: `firm.activated` claimed a payment | **Fixed.** The comment now says what it means. |
| m9: the profile route | **Moot.** `GET|PUT firm/profile` is removed and moves to part 3. |
| m11: no alert on an untaxed invoice | **Fixed.** A finalized invoice that still needs the address logs an `ALERT` warning. |
| m5, m7, m8, m10, m12, m13 | Not fixed. They go into the PR as open items. |

### Should any unfixed Minor block? No.
* **m5 (a card added in the portal shows as no card):**
  * The designed way to add a card is our card Checkout, which is Owner or Admin, tested, and resumes a held subscription.
  * The portal is Owner-only.
  * The cost is a wrong "card on file" flag and a held firm adding its card in the wrong place. No money is wrong either way.
* **m7 (case routes are outside the 402):**
  * The agreed part 2 scope (`step0.md`) is "the hold in the guard", and that is met.
  * The row's "a case route" line has to be listed in the PR as an **unmet Done-when line** that needs the case routes on staff sign-in, so it is not claimed.
* **m8 (402 words do not follow the reason):** wording only, and there is no screen yet. `GET billing` already gives `hold.reason`.
* **m10 (no booted-app test of the raw-body line):** in round 1 I walked the booted app on :4431 and a signed body with whitespace got 200, so it works today; the risk is only a future regression. List it.
* **m12 and m13:** robustness and nits.

### New Minors (list in the PR; none blocks)
* **n1.** `setAddress` swallows a failed subscription read or a failed release, so it still answers `onStripe: true`.
  * **Problem:** the draft then stays held until the address is saved again. It also releases the latest draft without checking that it was held for the address. If Stripe Tax still cannot place the customer, that draft finalizes untaxed: the webhook re-holds it only if an event lands before it finalizes, and an open untaxed invoice only gives the `ALERT` warning.
  * **Fix:** return `released: false` with a next step, and release only a draft held for `ADDRESS_NEEDED`.
* **n2.** Removing only the "not this firm's live subscription" line in `refresh` keeps all 81 green, because the `findSubscription` filter covers that case. It is defence in depth with no test of its own.
* **n3.** A row not yet linked ignores a `canceled` or `incomplete_expired` subscription. A trial cancelled before any of its events was handled leaves the row in TRIAL. Part 3's trial clock should cover it.
* **n4 (records only).** `step0.md`'s part 2 bullet still lists `GET|PUT firm/profile`. Move it to the part 3 bullet in the same PR, and list it in the PR as moved, so the row's Done-when stays traceable.

### Journey score
Re-scored on the harness evidence; I did not re-walk the running app in round 2.
* Task completed rises from ½ to 1: J8, the address hold, now ends after the address is saved and the invoice is paid.
* Error recovery rises from ½ to 1: M1, m3 and m4 are fixed.
* **Total 8/10**, with no criterion at 0: a pass.
* Still at ½: next step obvious (m8), plain words (raw enum text in the province error), accessibility and visual quality (no screen).
