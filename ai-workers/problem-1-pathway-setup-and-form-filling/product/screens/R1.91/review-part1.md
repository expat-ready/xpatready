# R1.91 part 1 — review (fresh reviewer, Opus), commit e134f6ecdcdd5cc6c5d7bc4f19d295fcc4157cbd

Scope: PR #3636, R1.91-1 (shape §2): `api/src/platform/billing/stripe-setup.ts`, `ensurePortalConfiguration` in `billing/stripe.ts`, `tests/journeys/stripe-relay.ts`, `tests/check_pf16_stripe_setup.ts`, `MODULE.rows/R1-91-1.md` (paths from `prototype/studio`). Money code, no screen. So `screen-review` checks (1)-(3) and (7) (concept, keyboard, words, BIC) are N/A. Checks (4) [M] lines and (5) code were applied. The remote head has since moved to 871c723d4, which adds only `break-report-part1.md`. The code is identical. I did not read that report, so this review is independent of it.

## What I ran (this session, no network to Stripe)
* `check_pf16_stripe_setup.ts`: **32 passed, 0 failed**. The live line is SKIPPED by name.
* `check_pf5_signup_billing.ts` (existing billing; it covers `stripe.ts`): **107 passed, 0 failed**. The `portal()` refactor (stripe.ts:91 `??=` over `ensurePortalConfiguration`) behaves the same as before.
* `count-any`: 416, at or below the baseline. `graph.mjs --check`: G1/G2/G4/G5 at 0. `tsc -p api`: not confirmed here. Two runs ran out of memory (the second with an 8 GB heap, exit 134). The builder reports 0.
* CLI walked: no key, `sk_live_`, `pk_test_` and a trailing space are each refused with exit 2 before any call. No `DATABASE_URL` gives exit 2. Stripe unreachable gives a raw `StripeConnectionError` stack, exit 1, nothing written.
* Probe (scratch fake, `scratchpad/probe.mts`): `stop()` while a pass is running leads to **4 further polls**. A plan with a found yearly price and a missing monthly one makes a **second product**. A found price with `tax_behavior: unspecified` and `interval_count: 3` gives **0 conflicts**.

## What holds
* Reads come first. With a conflict or `--dry-run`, nothing is created in Stripe and nothing is written to `platform_plan`. This is tested on both sides, Stripe side (tests 105-107) and database side (tests 129-134).
* lookup_key batching is at most 10 per list call, which matches the Stripe library's documented limit. Every create carries an idempotency key. Uniqueness comes from Stripe's lookup_key, so a re-run finds and does not create.
* Partial failure in Stripe: the database is written only after every Stripe call succeeds (stripe-setup.ts:105), and a re-run finds what was made.
* Live-key guard: `keyProblem` runs before the client or the database is touched. The test spawns the real CLI with a live key and an unreachable database and proxy, so removing the guard fails that test.
* The fake's array encoding (`lookup_keys[0]`, `types[0]`) matches stripe-node 23.1.0 `stringifyRequestData` (indexed, brackets unencoded). Its newest-first event order matches Stripe's. The `types` limit is 20 and we use 11.
* Relay signatures use `generateTestHeaderString` over the exact body sent. They are verified by our own `StripeBilling.readEvent`, with a pass case and a wrong-secret fail case. There is no `lastResponse` leak, because the library defines that property as non-enumerable on the top-level list only.

## Findings

**Major**
1. **`StripeRelay.stop()` does not stop if a pass is running** (tests/journeys/stripe-relay.ts:66-77).
   * Cause: `tick` re-arms `this.timer` after its `await this.poll()`. `stop()` clears only the timer that exists at that moment, then awaits the same in-flight pass, after which `tick` schedules a new one.
   * Proven: 4 polls after `stop()` returned.
   * Failure scenario: part 4's j_91 (and R1.57's Connect walk, which shares this file) calls `relay.stop()` at teardown. Polling of Stripe continues every 2 s and keeps POSTing to a server that is shutting down. The pending `setTimeout` keeps Node's event loop alive, so the journey process does not exit until the CI job times out. `start()` called twice also runs two loops.
   * Neither `start` nor `stop` has a test (STANDARDS [M] "a rule's test fails when the rule is removed").
   * Fix: add a `stopped` flag checked before re-arming, make `start()` idempotent, and add a test that counts `/v1/events` calls after `stop()`.
2. **The conflict rule does not check everything that makes a price right, and one leg has no failing test** (stripe-setup.ts:55).
   * A price found under our key is accepted when `tax_behavior` is `inclusive` or `unspecified`, `recurring.interval_count` ≠ 1, or its product is another plan's.
   * Money effect: subscriptions run with `automatic_tax: { enabled: true }` (stripe.ts:125). With an inclusive price, a firm on Team (Sample) is charged CAD 99.00 *including* HST instead of 99.00 + HST. The script writes that price id to `platform_plan` as correct, even though its own header and the module row promise "tax-exclusive".
   * Test gap: no test makes a found price with another interval, so deleting `interval !== w.interval` keeps all 32 green.
   * Fix: add `tax_behavior !== "exclusive"`, `(recurring.interval_count ?? 1) !== 1` and `type !== "recurring"` to the conflict check, and add one failing test per leg (interval, tax behaviour).

**Minor**
3. **A second product for one plan** (stripe-setup.ts:63-71). `products` is filled from a found price only when that price comes earlier in the loop. With yearly found and monthly missing, monthly calls `products.create`. Within 24 h the idempotency key returns the original product, but after that a new product is made (probe confirmed). The same happens on a re-run more than 24 h after a partial failure. Fix: fill `products` from all found prices first, or find the product by `metadata.xr_plan`.
4. **An archived price holding our lookup key is invisible** (stripe-setup.ts:49, `active: true`). `prices.create` then fails on Stripe's lookup-key uniqueness. My understanding is that this covers inactive prices too (Unconfirmed against live Stripe; the fake models it that way at test:56). The run stops mid-way with Stripe's raw error instead of a CONFLICT line. Fix: list without `active` and treat an inactive found price as a conflict.
5. **The fake's idempotency is more forgiving than Stripe's** (check_pf16_stripe_setup.ts:46-47). It replays for the same key whatever the parameters and never forgets keys. Stripe answers 400 `idempotency_error` for the same key with other parameters (for example a plan renamed within 24 h gives `xr-product-<code>-v1` with a new name), and it drops keys after 24 h. As a result the fake cannot show finding 3.
6. **A stale price id is kept** (stripe-setup.ts:83-91, 105). A period whose Sample cents become null keeps its old `stripe_*_price_id`. That period stays priced and purchasable, because `signup.ts:136` and `plan-change/service.ts:48` read the id. This contradicts the header's "gets none for it". Either clear the id or state the behaviour.
7. **The portal configuration is found by metadata and never compared with `PORTAL_FEATURES`** (stripe.ts:24-29). This existed before, but the script now relies on it. If `PORTAL_FEATURES` changes, the old configuration stays in use without a word.
8. **The live proof line proves little** (test:183-186). On an account where set-up never ran, the dry run passes: 6 lines, no conflict, every id null. Assert found ids once the set-up job has run, or rename the line to "reads".
9. **Relay retries are unbounded** (stripe-relay.ts:59-60). An event the route refuses (for example 400) is resent every poll and adds a `failures` entry each time.
10. **Relay is not scoped to the run** (stripe-relay.ts:49). Every billing event in the shared test account since the start is relayed, including other runners' and R1.57's events. Each foreign event writes a firm-less `billing.no-firm-matched` line (webhook.ts:91), and a `waitFor(type)` with no `when` can match another run's event. Recommend a customer filter option for part 4.
11. **`waitFor` resolves on receipt, not handling.** The webhook answers 2xx and handles the event later (webhook.ts:81). Say so in the doc comment so part 4 reads the outcome rather than the delivery.
12. **CLI errors print raw stacks** (stripe-setup.ts:118-126, walked). A Stripe or database failure prints a raw stack trace instead of one plain line saying what was and was not done.
13. **The tax set-up depends on the dashboard and the checklist does not say so.** "Stripe Tax adds GST/HST/QST" (header line 5) depends on the account's tax registrations and default product tax code. No product `tax_code` is set, and only Smart Retries is on the checklist.
14. Nit: same-second events are ordered by id (stripe-relay.ts:50), not by Stripe's reversed list order. This is harmless because the webhook reads current state.

## Journey score (journey-test, reviewer role; no screen, operator journeys on recorded answers)
Full report: `journey-test-reviewer-2026-11-25.md`. Score: **8/10**. Two N/A criteria (accessibility and screen sizes, visual quality) are counted as met, so the applicable eight score 6/8. This passes on the score alone, but the two Majors above stand.

## Could not check
Live Stripe: no network. That leaves unconfirmed the lookup-key rule for archived prices, the idempotency expiry and parameter rules (from Stripe's documentation), and real event delivery timing. Real-runner concurrency was not checked either. `tsc`: two runs ran out of memory (an 8 GB heap, exit 134), so I rely on the builder's 0 errors.

Not Approve: two open Majors, so this commit should not get `review: approved`. Both are small fixes; re-review the diff only.

Verdict: Changes e134f6ecdcdd5cc6c5d7bc4f19d295fcc4157cbd
