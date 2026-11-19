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

## Round 3: diff-only re-review (P-277), head `d04803ca052d3054b8b8a358a13d403d4516ea92`

I read only `git diff 97b77db..d04803c -- ai-workers/`.

**The check:** I ran `tests/check_pf5_signup_billing.ts` and got **82 passed, 0 failed**.

Verdict: Approve d04803ca052d3054b8b8a358a13d403d4516ea92

### What changed, and whether it holds
**The breaker's R2: an outage no longer drops a paid event** (`webhook.ts` sweep and receive).
* **Retries keep going:** a failing receipt is retried every sweep until it is more than 72 hours old, which is Stripe's retry window. Only then is it set aside, and only after at least 5 tries.
* **Ordering:** receipts with the fewest tries still go first, so bad receipts do not block good ones. The try count stops at 9 and the regex still reads it.
* **When an outage ends:** the backlog drains at 50 receipts per 5-minute sweep, and a redelivery from Stripe is handled at once.
* **The test proves the window:** "keptRecent" would read 0, not 50, if receipts were still set aside after 5 sweeps regardless of age.
* **Redelivery of a set-aside event:** the receipt is reset (`handledAt` null, outcome "redelivered") and handled.
  * Only a signed event can do this.
  * "redelivered" sorts before "retry …" in the sweep.
  * If it fails again it counts from try 1 and is set aside again after 5 more sweeps.
  * Tested: the outcome becomes `invoice.paid: …`.
* **The alert:** `currentAlerts().raise("job_stuck", …)` fires at the 5th try and again when a receipt is set aside.
  * The payload matches `AlertDetail` (`ports/alert.ts`): rule `PF-5.webhook`, the sweep queue name and the receipt's uuid are all valid ids.
  * A failure to raise the alert is caught, so it never breaks the sweep.

**n1, first half** (`account.ts`): a failed release of the held draft now answers with a next step ("Saved. Your held invoice could not be released yet: save the address again in a few minutes."). Still open: if the subscription read fails, nothing is said, and the release is not limited to a draft held for the address. Both stay listed in the PR.

**n4** (`step0.md`): `GET|PUT firm/profile` has moved to part 3's bullet with the reason (P-610, #1959). The row's Done-when stays traceable.

### New Minor (list in the PR; does not block)
* **n5. No test checks the alert.** Removing the two `raise` lines would keep all 82 checks green, which goes against STANDARDS [M] l. 48 (a rule's test fails when the rule is removed).
  * **Fail test:** pass a `fakeAlerts()` (the alert seam, `currentAlerts`) and check one `job_stuck` with `entityKey` = the receipt id at the 5th sweep. That is about 2 lines.
  * **Why it does not block:** the money behaviour, retrying within Stripe's window and handling a redelivery, is tested. Only the alert to a person is untested.

### Still open from rounds 1 and 2 (none blocks; reasons in round 2)
m5, m7 (the case-route 402: list it in the PR as an unmet Done-when line), m8, m10, m12, m13, n1 (second half), n2, n3.

**Journey score: 8/10, unchanged** (a pass). The R2 fix and the n1 message improve error recovery and feedback, both already at 1.

## Round 4: records only, head `2ac62cf73cac91ca1062798658f27143a9c5f251`

`git diff d04803ca..2ac62cf7` changes only `review-part2.md` (round 3) and `break-report-part2.md` (the breaker's round 3). There is no code change, so the check result from round 3 (82 passed) stands.

I agree with the breaker's new Minor r4: in an outage, the sweep pages once per failing receipt, because `entityKey` is the receipt id and so the 5-minute repeat key never merges the alerts. Raise the alert per queue, or once per sweep with a count. List it in the PR beside n5. It does not block.

Verdict: Approve 2ac62cf73cac91ca1062798658f27143a9c5f251

## Round 5 (diff-only, 4b8a3301): merge of origin/main only (P-270), head `4b8a33018cea3667bf14f07d97d73b97a1565a5c`

Approved before this: `a26c677f`, an earlier merge of main whose approval is not written in this file (round 4 is the last one here). The new head has parents `a26c677f` and `9cea7c02`, which is origin/main now. The merge base is `39c1203c`.

1. **Only main's changes came in.** `git diff a26c677f 4b8a3301 -- ':!*/platform/MODULE.md'` is byte-identical to `git diff 39c1203c origin/main` over the same paths (`cmp`). Both diffs touch the same files, MODULE.md included. `git diff origin/main 4b8a3301 --stat` lists this PR's 18 files, 1209+/26-.
2. **The card keeps both sides.** It is 39 lines with no conflict markers. Against main it adds only this PR's billing Purpose tail, the PF-5 part 2 entry points and keys, the hold invariant, and platformPlan, platformSubscription and webhookReceipt in Tables. Main's PF-18a lines (Purpose, entry points, invariant, platformOffice and platformStaffOffice, check_pf18a_offices) and its AUD-1a audit invariant are kept word for word. `check-module-cards.sh` exits 0.
3. **No bad interaction.**
   * **Hold.** `PaymentHoldGate` is an `APP_INTERCEPTOR`, so it also covers `OfficesController` from main's new `platform-settings-personal` feature. The offices route templates are not in `IDENTITY_OPEN` and are not `@HoldOpen`. Run on the merged tree: a scratch copy of check_pf5_signup_billing with `OfficesController` added to its Nest app. Unheld: `GET /api/platform/offices` 200, `PATCH /offices/x` 404, `POST /offices {}` 400. Held: all three 402. 85/85, which is the 84 plus this one.
   * **Unchanged by main.** Main does not touch `BYPASS_USES`, main.ts or platform-firms.ts. The PR's two new bypass uses and the `stripeRawBody` mount are as approved.
   * **AUD-1a (audit lines insert-only).** This PR's code and check only read `audit_event` and never delete from it. check_aud1a_insert_only gave 41/41 against an isolated copy of the merged app on :4436 (runtime ports), so the app boots with both features. The api log had no errors, and the copy was stopped.
   * **Other checks.** check_pf18a_offices 87/87 and check_pf0p_ports 120/120 (main changed it) pass.

Nothing new is found. The open Minors from rounds 1 to 4 are unchanged.

**Journey score: 8/10, unchanged.** The merge changes no behaviour of this PR.

Verdict: Approve 4b8a33018cea3667bf14f07d97d73b97a1565a5c

## Round 6 (diff-only, ec1f7e25): merge of origin/main only (P-270), head `ec1f7e254e5da4ecb92b6a5cbdf9ffe3dac48510`

Approved before this: `b8af607b`, which is round 5's head `4b8a3301` plus the round 5 lines in this file (`git diff 4b8a3301 b8af607b` touches only `review-part2.md`). The new head has parents `b8af607b` and `2c9231ab`, which is origin/main now. The merge base is `9cea7c02`. Main brings PF-18b support tickets, FO-1p's person port, PF-5t part 2 screens, and journey and record files.

1. **Only main's changes came in.** `git diff b8af607b ec1f7e25 -- ':!*/platform/MODULE.md'` and `git diff 9cea7c02 2c9231ab` over the same 115 paths list the same files. A raw `cmp` is not byte-identical, but the only difference is in `ports/events.ts` and it is metadata: its `index` line, and two hunk headers moved 6 lines (`@@ -35/+202` against `@@ -29/+196`), because this PR's three event keys sit above main's. With `index` lines and hunk line numbers removed, the diffs are identical (`cmp`), and the `-U0` bodies are identical too. On the PR side, `git diff origin/main ec1f7e25 --stat` lists the same 18 files as `git diff 9cea7c02 b8af607b`, with 1227+/26-. That is round 5's 1209+ plus round 5's 18 record lines. Leaving out MODULE.md and events.ts, the 16 files' diff against main is identical (`cmp`) to the PR's diff as approved.
2. **The card keeps both sides.** It is 40 lines, which is exactly the limit, with no conflict markers. Against main (word diff), it adds only this PR's lines: the billing Purpose tail, the PF-5 part 2 entry points and Lead B's keys, the hold invariant, and `platformPlan, platformSubscription, webhookReceipt` in Tables. Against `b8af607b`, it adds only main's PF-18b lines, word for word: Purpose, entry points, the insert-only and replyAsSupport invariant, the two tables and check_pf18b_support. `check-module-cards.sh` exits 0 (20 fixtures, tree as on this branch passes), and `module-cards.py tree` passes with 15 cards. The card has no room left, so the next change to the platform card has to trim a line first. I could not run the `pr` mode against the PR body, because GitHub's API is not reachable from this session. That result depends on main.ts and platform-firms.ts, which the merge did not touch, so it is the same as at round 5.
3. **No bad interaction.**
   * **The hold covers the support routes.** Main's `SupportController` (features/platform-support.ts) gives every route `@PermissionKeys`, so PF-4's guard sets `req.platform` and the app-wide `PaymentHoldGate` applies. None of its templates is in `IDENTITY_OPEN` or marked `@HoldOpen`. `GET files/:token` is not public: it needs `agent/support-ticket:list` and a sign-in, and gives 401 without one. I ran a scratch probe on the merged tree: check_pf18b's Nest app plus `PaymentHoldGate` as `APP_INTERCEPTOR`, a scratch database on 54329, an ephemeral port (not :4400), removed afterwards. Unheld, the six routes gave 201, 200, 200, 200, 200 and 200. Held, all six gave **402** with `code: PAYMENT_HOLD` and `HOLD_WORDS`. That includes the multipart `POST tickets` and `GET files/:token`, the second with a link signed before the hold. No ticket or message row was written while held. Nest runs global interceptors before route-scoped ones, so the gate rejects the request before `FilesInterceptor` parses it. That last point is inferred from Nest's order and the zero writes, not seen directly.
   * **ports/events.ts.** Both sides' additions are present: `FIRM_ACTIVATED`, `FIRM_SUBSCRIPTION_CHANGED`, `FIRM_PAYMENT_HOLD` and `SUPPORT_TICKET_RAISED` with `SupportTicketRaised`. No event string appears twice.
   * **Unchanged by main.** Main does not touch `firm-scope.ts` (`BYPASS_USES`), main.ts, platform-firms.ts or identity/guard.ts. PF-18b adds no bypass use; `replyAsSupport` is left to PF-17's later named use. `express.raw` is mounted only on `/api/hooks/stripe`, so it cannot meet the support routes' multer. Main's new terms gate in the web frame calls `GET /platform/me/terms`, which is in `IDENTITY_OPEN`, so a held person still gets the terms page. Main's one new migration (`20261118073000_pf18b_support`) is not one this PR has, and this PR adds none.
   * **Checks run here on the merged tree, all exit 0:** check_pf5_signup_billing 84/84, check_pf18b_support 41/41, check_pf12_walls 100/100. The builder's other four runs are not repeated here.

**Question for the founder (n6, not a fix): should a held firm reach support?** At present, a held firm's staff get 402 on every support route. This matches the sources. SA-4-25 and BR-7 (04-Doc-2-SuperAdmin-Console.md l. 1820, 1862) say "402 PAYMENT_REQUIRED on all but the billing/payment allow-list". l. 1714 adds that only that list stays open "so the owner can update the card and self-recover". The live `HOLD_WORDS` say the same. Against that, AG-16-63 asks for a "?" ticket button on every screen, and a held Owner who has paid but is still held has no channel left in the product. My recommendation is to keep support closed as the sources say, unless the founder decides otherwise. If it is opened, the change is `@HoldOpen()` on `SupportController`, recorded in DECISIONS as a departure from SA-4-25, with the hold invariant on the card updated. Either way, when PF-18b's "?" screen is built it must show the 402 words, not a generic error. A smaller point: no committed check would fail if a support route became `@HoldOpen` by mistake. The hold check covers only the routes it names. That is the same pattern as n5, and does not block.

Nothing new blocks. The open Minors from rounds 1 to 5 are unchanged (m5, m7, m8, m10, m12, m13, n1 second half, n2, n3, n5, r4).

**Journey score: 8/10, unchanged** (a pass, no criterion at 0). The merge changes no behaviour of this PR's journeys, and its one new interaction (the hold over support) was walked over HTTP above. I wrote no new journey-test report, because there is no new screen or flow to walk.

Verdict: Approve ec1f7e254e5da4ecb92b6a5cbdf9ffe3dac48510

## Round 7 (diff-only, 918b8dda): merge of origin/main only (P-270), local head `918b8ddaebfcbc4bf5104a109ab3d6ad011fdade`

Approved before this: `ec1f7e25` (round 6). The PR's pushed head `e8f8d069` is `ec1f7e25` plus the round 6 lines in this file (`git diff ec1f7e25 e8f8d069` touches only `review-part2.md`, 20+). The new head is a local merge, not pushed when I reviewed it. Its parents are `e8f8d069` and `34c5e1e99`, which is origin/main now. The merge base is `2c9231ab4`. Main brings FO-13i (client identity check: routes, service, migration `20261118140000`), PF-F4 (`platform/files/file-type.ts`), CS-W1 part 1 (case firm ids: `firms.ts`, migration `20261118090000`, the start-up fill in main.ts, the demo seed), CI-RUN part 2, and qa and record files.

1. **Only main's changes came in.** `git diff e8f8d069 918b8dda -- ':!*/platform/MODULE.md'` and `git diff 2c9231ab4 34c5e1e99` over the same paths list the same 78 files. A raw `cmp` is not byte-identical, but the only differences are metadata. The `index` lines of `main.ts` and `ports/events.ts` differ, because this PR changed both files. Two hunk headers in `events.ts` moved 6 lines (`@@ -50,6 +50,8` against `@@ -44,6 +44,8`, and `@@ -136,6 +138` against `@@ -130,6 +132`), because this PR's three event keys sit above main's. With `index` lines and hunk line numbers removed, both diffs are identical (`cmp`), and the `-U0` bodies are identical too. On the PR side, `git diff origin/main 918b8dda --stat` lists this PR's 18 files, with 1247+/26-. That is round 6's 1227+ plus round 6's 20 record lines. Leaving out MODULE.md, the diff against main (index and offsets removed) is identical (`cmp`) to `git diff 2c9231ab4 e8f8d069`, the PR as approved.
2. **The card keeps both sides.** It is 40 lines, which is exactly the limit, with no conflict markers. The front matter (`paths:`) is main's, unchanged. Against main (word diff), it adds only this PR's four things: the billing Purpose tail, the PF-5 part 2 entry points and Lead B's keys, the hold invariant, and `platformPlan, platformSubscription, webhookReceipt` in Tables. Against `e8f8d069`, it adds only main's PF-F4 lines, word for word: the `files/file-type.ts` Purpose clause and `tests/check_pff4_file_type.ts` in Tests. `check-module-cards.sh` exits 0 (20 fixtures), and `module-cards.py tree` passes with 15 cards. The card still has no room left: the next change to it must trim a line first (as in round 6).
3. **No bad interaction.**
   * **The hold covers FO-13i's new signed-in routes.** Main's `IdentityChecksController` (`/api/front-office`, features/front-office-identity-check.ts) gives all four routes `@PermissionKeys`. PF-4's guard therefore sets `req.platform`, and the app-wide `PaymentHoldGate` applies. None of its templates is in `IDENTITY_OPEN` or marked `@HoldOpen`. Recording someone's identity is case work, not billing, so a 402 is right (SA-4-25). I ran a scratch probe on the merged tree. It used FO-13i's check setup (every migration, the Sample firms, FO-1a's seed), the feature's own controllers and providers, PF-4's guard, and `PaymentHoldGate` as `APP_INTERCEPTOR`. It ran on a scratch database on 54329 and an ephemeral port (not :4400), and both were removed afterwards. Unheld, `GET people/:id/identity-checks`, `POST` (JSON), `POST` (multipart with a PDF copy), `POST identity-checks/:id/copy/download-link` and `GET identity-copies/:token` gave 200, 201, 201, 200 and 200. Held, all five gave **402**, with `code: PAYMENT_HOLD` and `HOLD_WORDS`. That includes the download of a link signed before the hold. Held, no `fo_identity_check` row and no file was written, so the gate rejects the request before `FileInterceptor` stores anything (the same order as the support routes in round 6). Active again, the list gave 200.
   * **IDENTITY_OPEN and BYPASS_USES.** Main does not touch `billing/routes.ts`, `firm-scope.ts`, `identity/guard.ts` or `features/platform-firms.ts`. So `IDENTITY_OPEN` is still the six PF-4 and PF-5t templates. `BYPASS_USES` still has this PR's two uses (`platform.billing.stripe-webhook`, `job:platform.billing.webhook_sweep`) and no new use from main. CS-W1's demo seed runs on the existing `platform.demo.reset` use, and its start-up fill runs outside a request, as `xr_case_lookup`'s SQL function.
   * **main.ts order.** Main changed one line: `fillCaseFirmIdsOnStart()` after `seedSampleOnStart()`, before `NestFactory.create`. The order after that is unchanged: `observe`, `publicFormBodyLimit`, then `stripeRawBody(app)`, then `app.useBodyParser("json")`. So Stripe's raw body is still mounted before the JSON parser. The merged app boots. On an isolated copy on :4437 (runtime ports, 15-minute self-stop, stopped and removed afterwards), `GET /api/public/plans` gave 200 and an unsigned `POST /api/hooks/stripe` gave 400, which means the signature is still checked on the raw bytes. The api log had no errors.
   * **Both sides' events are present** in `ports/events.ts`: `FIRM_ACTIVATED`, `FIRM_SUBSCRIPTION_CHANGED` and `FIRM_PAYMENT_HOLD` (this PR); `SUPPORT_TICKET_RAISED` with `SupportTicketRaised` (round 6); and main's `IDENTITY_CHECKED` with `IdentityCheckedPayload`. The 32 keys and the 32 strings are each unique.
   * **CS-W1's Sample seed and the hold.** start.sh now turns the Sample seed on by default, and the demo reset and load run it too. Its firms and subscriptions are `ACTIVE`, with no Stripe ids. This PR moves a firm to `PAYMENT_HOLD` only from a Stripe event that names its customer or subscription. So the demo's Sample firms are never held by this merge.
   * **Checks run here on the merged tree, all exit 0:** check_pf5_signup_billing 84/84, check_fo13i_identity 27/27, check_csw1_firm_id 47/47 (with its copy on :4437), check_pf4_identity 119/119 (with its copy on :4437, `PLATFORM_IDENTITY=local`; part B reads the real main.ts with both start-up lines), check_pf3_platform_schema 75/75. The builder's eight runs are not repeated here.

**Minor, not new (same pattern as n5 and round 6's point on support):** no committed check would fail if an FO-13i route became `@HoldOpen` by mistake. The hold check covers only the routes it names. This does not block.

Nothing new blocks. The open Minors from rounds 1 to 6 are unchanged (m5, m7, m8, m10, m12, m13, n1 second half, n2, n3, n5, r4). Round 6's question about support is settled: the tech lead decided support stays closed on hold, as built.

**Journey score: 8/10, unchanged** (a pass, no criterion at 0). The merge changes no behaviour of this PR's journeys, and its one new interaction (the hold over FO-13i) was walked over HTTP above. I wrote no new journey-test report, because there is no new screen or flow to walk.

Verdict: Approve 918b8ddaebfcbc4bf5104a109ab3d6ad011fdade

## Round 8 (diff-only, c7616fd3): merge of origin/main only (P-270), local head `c7616fd377407811df6cbb23f13700a527112a2b`

Approved before this: `918b8dda` (round 7). The PR's pushed head `3004d581` is `918b8dda` plus the round 7 lines in this file (`git diff 918b8dda 3004d581` touches only `review-part2.md`, 22+). The new head is a local merge, not pushed when I reviewed it. Its parents are `3004d581` and `9d440b2f4`, which is origin/main now. The merge base is `34c5e1e99`. Main brings FO-2 part 3 (Individual prospects: seven new routes on `SalesController`, `sales/prospects.ts`, three event keys), PF-19r (`MAIL_PORT` is now `MESSAGES_MAIL`: the staff invitation, the two-step reset notice, the complaint reminder and support mail go through the outbox, the consent gate and the daily cap), PF-6 part 2b screens (the invitation accept page, licences, security), FO-7ts money settings (two migrations, `client-money.prisma`), CS-C1s design files and qa and record files.

1. **Only main's changes came in.** `git diff 3004d581 c7616fd3 -- ':!*/platform/MODULE.md'` and `git diff 34c5e1e99 9d440b2f4` over the same paths, with `index` lines and hunk line numbers removed, are identical (`cmp`, 4,410 lines each). Both stats read 80 files, 3460+/109-. On the PR side, `git diff origin/main c7616fd3 --stat` lists this PR's 18 files with 1269+/26-, the same file list as `git diff 34c5e1e99 3004d581` (`diff` of the name lists is empty). That is round 7's 1247+ plus round 7's 22 record lines. The only files both sides touch are `platform/MODULE.md` (the conflict) and `ports/events.ts` (merged cleanly).
2. **The card keeps both sides.** It is 40 lines, which is exactly the limit, and has no conflict markers. Against main (word diff), it adds only this PR's four things: the billing Purpose tail, the PF-5 part 2 entry points and Lead B's keys, the hold invariant, and `platformPlan, platformSubscription, webhookReceipt` in Tables. Those are word for word the same as `git diff 34c5e1e99 3004d581` on the card. Main's PF-19r additions are kept word for word: the `MESSAGES_MAIL` clause ("since PF-19r also `MAIL_PORT`'s staff invitation and two-step reset notice, and the complaint reminder; `MessagesMail.sendIn` writes in the caller's transaction") and `tests/check_pf19r_senders.ts` in Tests. `check-module-cards.sh` exits 0 (20 fixtures, and the tree as on this branch passes). `module-cards.py tree` passes with 15 cards. The card still has no room left. I could not run the `pr` mode against the PR body, because GitHub's API is not open to this session. Without the body it flags api-core (main.ts) and api-features (platform-firms.ts) for a `Card unchanged:` reason, and that depends only on the PR's own 18 files, which the merge did not change. So the result is the same as in rounds 5 to 7.
3. **No bad interaction.**
   * **The hold covers FO-2p3's new signed-in routes.** Each of the seven new `SalesController` routes (`POST leads/:id/engage`, `GET prospects`, `GET prospects/:id`, `POST prospects/:id/move`, `/lost`, `/convert`, `/undo-convert`, under `/api/front-office`) has `@PermissionKeys`, so PF-4's guard sets `req.platform` and the app-wide `PaymentHoldGate` applies. None is in `IDENTITY_OPEN`, and no route outside `billing/routes.ts` uses `@HoldOpen()` (grep). Prospect work is case work, not billing, so a 402 is right (SA-4-25). I ran a scratch probe on the merged tree, removed afterwards. It used every migration, the Sample firms and FO-1a's seed, `SalesController` with `Leads` and `Prospects`, PF-4's guard, PF-5t's terms gate, `BillingController` and `PaymentHoldGate` as `APP_INTERCEPTOR`. It ran on a scratch database on 54329, which was dropped, and an ephemeral port (not :4400). Unheld: add lead 201, engage 201, list and read 200. Held: all eight (the seven new routes plus `GET leads` with main's new `owner`/`from` filters) gave **402**, `code: PAYMENT_HOLD` with `HOLD_WORDS`, and `GET billing` and `GET me` stayed 200. No `fo_prospect`, `fo_stage_move` or `audit_event` row was written while held. Active again: 200. 7/7.
   * **The invitation accept page** (PF-6 part 2b) calls the existing public `GET|POST /api/public/invitations/:token(/accept)`. Those carry no staff session, so the gate does not apply, and this is unchanged from before the merge.
   * **IDENTITY_OPEN and BYPASS_USES.** Main does not touch `billing/routes.ts`, `firm-scope.ts`, `identity/guard.ts`, `features/platform-firms.ts` or `platform/firms/`. So `IDENTITY_OPEN` is still the six PF-4 and PF-5t templates, and `BYPASS_USES` still has this PR's two uses (`platform.billing.stripe-webhook`, `job:platform.billing.webhook_sweep`), with no new use from main. FO-2p3 and PF-19r call no `asBypass`.
   * **main.ts order.** Main does not touch main.ts. The order is still `observe`, then `stripeRawBody(app)`, then `app.useBodyParser("json")` (l. 237-240). check_pf5_signup_billing's HTTP part confirms the raw-body door again (200 signed, 400 unsigned).
   * **ports/events.ts.** Both sides are present: this PR's `FIRM_ACTIVATED`, `FIRM_SUBSCRIPTION_CHANGED`, `FIRM_PAYMENT_HOLD`; the earlier `SUPPORT_TICKET_RAISED` and `IDENTITY_CHECKED`; and main's `PROSPECT_STAGE_MOVED`, `PROSPECT_LOST`, `PROSPECT_UNCONVERTED` with `ProspectMovePayload` and the extended `ProspectWonPayload`. There are 35 keys and 35 strings, each unique (parsed): round 7's 32 plus main's 3.
   * **MAIL_PORT and the jobs runner.** Billing's sweep and alerts do not use `MAIL_PORT`. `webhook.ts` uses only `JobPort` (`jobs.handle` and `jobs.recurring` on the sweep queue) and `currentAlerts()`. Main does not touch `platform/jobs/`, `platform/observability/`, `ports/jobs.ts` or `ports/mail.ts`. Sign-up's `runtime-ports.ts` keeps its own `fakeMail` (PF-5 part 1, unchanged by main). PF-19r's switch of `MAIL_PORT` to `useExisting: MESSAGES_MAIL` therefore reaches none of this PR's code. One consequence, not a defect: a held firm cannot invite staff or reset two-step (402), so it never spends its daily email cap on those while held.
   * **Migrations.** Main's two new migrations are FO-7ts's. This PR adds none.
   * **Checks run here on the merged tree, all exit 0:** check_pf5_signup_billing 84/84, check_fo2p3_prospects 44/44, check_pf19r_senders 24/24, plus the probe above. The builder's other runs are not repeated here.

**Minor, not new (same pattern as n5 and rounds 6 and 7):** no committed check would fail if an FO-2p3 route became `@HoldOpen` by mistake. The hold check covers only the routes it names. This does not block. Support stays closed on hold, as the tech lead decided, and this merge does not change that.

Nothing new blocks. The open Minors from rounds 1 to 7 are unchanged (m5, m7, m8, m10, m12, m13, n1 second half, n2, n3, n5, r4).

**Journey score: 8/10, unchanged** (a pass, no criterion at 0). The merge changes no behaviour of this PR's journeys. Its one new interaction, the hold over FO-2p3's prospect routes, was walked over HTTP above. I wrote no new journey-test report, because there is no new screen or flow to walk.

Verdict: Approve c7616fd377407811df6cbb23f13700a527112a2b

## Round 9 (diff-only, fdc6a3f6): merge of origin/main only (P-270), local head `fdc6a3f6dc71eb90ba4269808ec762054630ed4a`

Approved before this: `c7616fd3` (round 8). The PR's pushed head `c2d23133` is `c7616fd3` plus the round 8 lines in this file. The new head is a local merge, not pushed when I reviewed it. Its parents are `c2d23133` and `4aa912c92`, which is origin/main now. The merge base is `9d440b2f4`. Main brings 137 files: AUD-1b (AuditPort's firm, actor type and correlation id from PF-23's request scope, plus refusal of another firm's line), PF-15 part 1a (EntitlementPort's real adapter `PgEntitlements`, the storage watch and its daily job, the seat check moved onto it), CS-K1 (case clients, `GET /api/runtime/clients(/:id)`), FO-7lk, and qa and record files.

1. **Only main's changes came in.** `git diff c2d23133 fdc6a3f6` and `git diff 9d440b2f4 4aa912c92`, both without `platform/MODULE.md` and the new fragment, are 7,913 lines each. A raw `cmp` differs at one place only: two context lines in `firm-scope.ts`'s hunk, which are this PR's two `BYPASS_USES` entries on one side and main's neighbours on the other. With only the `diff`, `+` and `-` lines kept, the two diffs are identical (`cmp`). On the PR side, `git diff origin/main fdc6a3f6 --stat` lists 19 files, 1293+/25-: this PR's 18 files plus `api/src/platform/MODULE.rows/PF-5p2.md`.
2. **The card and the fragment.**
   * **The card adds two in-line insertions to main's card, and nothing else.** It is 41 lines, the same as main's. A word diff against main shows exactly two insertions. The first is the billing Purpose tail ("Stripe's webhook and the moves it makes (`webhook.ts`), the billing routes (`account.ts`) and the payment hold (`routes.ts`, PF-5 part 2)"). The second is the hold invariant, appended to "Firms' billing goes through BillingPort only". No other row's words change. The `Entry points.`, `Tables.` and `Tests.` lines are byte-identical to main's.
   * **The fragment is valid under #2195's rules.** I ran #2195's `module-cards.py` (from `origin/claude/module-card-fragments` at `99c53387`) against this tree. Its `tree` mode fails only on the 41 lines. Its `pr` mode with `BASE=origin/main`, given the 19 files and a test body containing `Card unchanged:`, gives no frozen-line failure and also fails only on the 41 lines. The fragment's file name matches `[A-Z][A-Za-z0-9-]*\.md`. It has 2 non-empty lines (the limit is 6), and each starts with `Entry points:` or `Tables:`.
   * **The fragment carries every item round 8 put on the card.** The webhook door with its raw body and `stripeRawBody`, the five `/api/platform` billing routes, `@HoldOpen()`, Lead B's keys (word for word), and `platformPlan, platformSubscription, webhookReceipt`. The hold invariant moved, unchanged, onto PF-5's BillingPort line. Round 8 added nothing to Tests, so nothing is missing there.
   * **Merging with #2195 works.** `git merge-tree fdc6a3f6 origin/claude/module-card-fragments` is clean. In a scratch worktree of that merge, the card is 40 lines, `module-cards.py tree` passes (15 cards), and `check-module-cards.sh` passes 44 fixtures.
   * **Until #2195 lands, the module-card check fails on this PR and on main alike.** `check-module-cards.sh` fails the same 9 of 20 fixtures on origin/main and on this branch, all on the 41 lines. The failure is main's, not this PR's. The order is #2195 first, then a re-merge of main. I could not run `pr` mode against the PR's real body, because GitHub's API is not open to this session. The same caveat was recorded in rounds 5 to 8.
3. **No bad interaction with main.**
   * **AUD-1b, the point that matters most.** check_pf5_signup_billing uses the real `auditEvent`, but its Nest app does not install PF-23's request middleware. So it does not exercise AUD-1b's context. I ran a scratch probe (`tsx`, every migration, the Sample firms, scratch database on 54329, ephemeral port, all dropped afterwards). It used check_pf5's billing app plus `observe(app)`, as `main.ts` installs it. Result: 5/5.
     * Signed-in `PUT /api/platform/billing/address` with `X-Request-Id: probe-addr-1` gives 200. Its line has the sample firm's `firm_id`, `staff:<id>`, `FIRM_STAFF` and `probe-addr-1`. The actor is the request's own, so AUD-1b's "actor must be the request's" rule holds.
     * A signed `POST /api/hooks/stripe` (no request firm, no staff) gives 200. The synced line, written after the answer by `later()`, has the event's firm, `system:billing`, `SYSTEM`, and the webhook request's correlation id. The firm moves to ACTIVE.
     * The sweep (receipt left unhandled by a forced Stripe failure) runs under `observeJob`, a platform-wide job with no firm. It handles the receipt once. Its line has the firm, `SYSTEM` and `job:probe-sweep-1`.
     * Another firm's line is refused, and the change is rolled back. Running `setAddress` for firm F2 inside a request scope acting for the sample firm throws `AuditRefused`. F2's address is unchanged and no line is written: fail-closed, as P-607 (3) requires.
     * Context check: `refresh()`'s `system:billing` line inside a signed-in request is refused (AUD-1b review M1). A grep shows `refresh`, `handle` and `sweep` are called only from the webhook door's `later()` and the sweep job, so no PF-5 part 2 route reaches that path. The sign-up door is public (no staff), so its `system:signup` lines are unaffected.
   * **check_aud1b_adapter is 33/33 and check_pf15_limits is 69/69** on the merged tree, both exit 0.
   * **PF-15's EntitlementPort and `platform_plan`.** `platform_entitlement_limit` takes the firm's subscription with `status <> 'ENDED'`. This PR's webhook and `account.ts` use the same "live" rule (`status: { not: "ENDED" }`). This PR never creates a second subscription row or changes `plan_id`. It updates status, Stripe ids and dates only, so the definer function's `LIMIT 1` cannot pick a different plan from the one Billing shows. The seat limit has one home, `platform_plan.seats_limit`, for both.
     * `PAYMENT_HOLD` and `OVERDUE` stay "live" for PF-15. That is consistent: limits still apply, and the hold blocks the routes anyway.
     * Nit n7 (does not block): `account.ts` `view` counts seats with its own two counts, not main's new `seatsUsed()`. It is the same rule, with JS `now` against the database's `now()`. A later row could switch to `seatsUsed()` so the display and the check share one count.
     * Note for the tech lead, not this PR's: PF-15's 409 `upgradePath` says "Change the plan in Settings, Billing". This PR's Billing has no plan change (the portal's plan switching is off; that is PF-16's), so until PF-16 lands those words point to something that does not exist yet.
   * **The hold.** `PaymentHoldGate` is still the app-wide `APP_INTERCEPTOR`. Main's only new signed-in routes are CS-K1's `GET /api/runtime/clients` and `GET /api/runtime/clients/:id`, both with `@PermissionKeys("agent/case:show")`. So the guard sets `req.platform` and neither is `@HoldOpen` or in `IDENTITY_OPEN`, so a held firm gets 402. I read this from the code; I did not walk these two routes held, unlike rounds 6 to 8. That is right: client records are case work, not billing (SA-4-25). PF-15 adds no route; its storage job and `EntitledFiles` sit behind upload routes that are already held. Support stays closed on hold (tech lead).
   * **IDENTITY_OPEN.** Main adds no identity route (its `identity/service.ts` change is the seat check only), so it is still the six PF-4 and PF-5t templates.
   * **BYPASS_USES.** Main adds `job:platform.entitlements.storage_daily`, next to this PR's two uses, which are unchanged. check_pf12_walls gives 100/100.
   * **main.ts.** Main does not touch it. The order is still `observe`, `publicFormBodyLimit`, `stripeRawBody(app)`, then `useBodyParser("json")` (l. 237-240). The probe's signed webhook (200) confirms the raw-body door again under `observe`.
   * **ports/events.ts and ports/billing.ts.** Main touches neither. Main's port changes are `audit.ts`, `entitlement.ts`, `files.ts` and their contracts. check_pf0p_ports gives 123/123.
   * **Migrations.** Main brings three (FO-7lk, PF-15, CS-K1). This PR adds none.
   * **Checks re-run here on the merged tree, all exit 0:** check_pf5_signup_billing 84/84, check_pf5t_terms 42/42, check_pf6m_money_line 12/12, check_pf12_walls 100/100, check_pf0p_ports 123/123, check_aud1b_adapter 33/33, check_pf15_limits 69/69, and the probe 5/5. The probe script is outside the repository; it is not committed.

**Minor, not new:** check_pf5_signup_billing's Nest app has no `observe()`, so no committed check would fail if a later change made a billing route write a `system:` line in a signed-in request, or dropped the correlation id. AUD-1b's own check covers the adapter, but not this PR's callers. This is the same pattern as n5. It does not block. Adding `observe(nest)` to the PF-5 app would be the cheap fix.

Nothing new blocks. The open Minors from rounds 1 to 8 are unchanged (m5, m7, m8, m10, m12, m13, n1 second half, n2, n3, n5, r4), plus n7 above.

**Journey score: 8/10, unchanged** (a pass, no criterion at 0). The merge changes no behaviour of this PR's journeys. AUD-1b's context on the address change, the webhook and the sweep was walked over HTTP and in job scope above. The hold over CS-K1's client routes was read from the code. I wrote no new journey-test report, because there is no new screen or flow to walk.

Verdict: Approve fdc6a3f6dc71eb90ba4269808ec762054630ed4a
