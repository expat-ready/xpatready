# PF-16 part 1a: independent review of #2866

* **Commit reviewed:** `0f65522bd17a8a985c523bae2b76a9af28cdeac9` (`git diff origin/main...0f65522bd -- …/prototype`). The PR's head on GitHub is the same commit.
* **Reviewer:** Opus 5.5, medium effort, money breaker review (P-303). I did not build this.
* **Spec:** the BACKLOG row PF-16 (part-1a lines only), the PR body, `product/screens/PF-16/plan.md`, and SA-4-28..31, -49, -50, -55, -56 and SA-3-58..61.
* **Scope:** an API with no screen. I reviewed the code, not a UI. **Journey test:** not run, because this PR has no screen (the Plan and billing screen is PF-5s), so there is no journey score for this commit. The first PF-5s screen that calls these routes carries the journey test.
* **Paths:** `S` = `ai-workers/problem-1-pathway-setup-and-form-filling/prototype/studio`.

## What I ran
* `tests/check_pf16_billing_rules.ts` at this commit: **29 passed, 0 failed**. This matches the PR.
* I also ran a scratch copy of the same check (outside the repo, its own scratch DB, dropped afterwards) with five more scenarios. Each finding below that says "probe" was reproduced there. Probe output:
  ```
  PROBE A {"results":["fulfilled","fulfilled"],"charges":1,"events":2,"audits":2,"plan":"firm"}
  PROBE B {"refused":null,"plan":"firm","stripePrice":"price_firmMonth","stripeRenewal":{"priceId":"price_liteMonth",…},"scheduleId":"sub_sched_fake000001","openBooking":"1"}
  PROBE C {"results":["fulfilled","fulfilled"],"charges":1,"dbPlan":"firm","stripe":{"price":"price_firmMonth","interval":"month"}}
  PROBE E {"e1kind":"renewal","e2":null,"stripeRenewal":{"priceId":"price_teamMonth",…},"booking":"pf16-lite"}
  ```
* I checked the Stripe parameters against `S/node_modules/stripe/esm/resources/{Invoices,Subscriptions,SubscriptionSchedules}.d.ts` (stripe 23.1.0).

## What is right
* **Access:** Owner only. `@PermissionKeys` requires every key named (`identity/keys.ts:4`), and both `agent/subscription:upgrade` and `:downgrade` are the Owner's alone. The route-level test shows an Admin gets 403 on both change and preview, with nothing sent to Stripe.
* **PF-28:** every body goes through `parseInput` with a `z.strictObject`. An unknown field gets 422 (tested). `withdraw` takes a strict empty object.
* **Hold:** `PAYMENT_HOLD` on the subscription or the firm gets 409 before anything reaches Stripe. The guard also gives 402, because the route is not `@HoldOpen`. Overdue is allowed, and `error_if_incomplete` makes a declined card change nothing.
* **Raise now:** `subscriptions.update` uses `proration_behavior: always_invoice`, `payment_behavior: error_if_incomplete`, the preview's `proration_date` and an idempotency key. All are valid in 23.1.0 (`Subscriptions.d.ts` 2022, 2243; the doc comment on `proration_date` names exactly this use).
* **Monthly → yearly:** `billing_cycle_anchor: "now"` is valid on both update and preview. The trial path correctly never sends an anchor, so the trial is not ended.
* **Schedule parameters:** `from_subscription`, then `update` with `end_behavior: release`, `proration_behavior: none`, phase 1 (`start_date`/`end_date`) and phase 2 (`duration`). All exist in `SubscriptionSchedules.d.ts` (1559-1715, 2028).
* **Order for a lower move:** the booking is written first (under PF-15b's firm lock and case lock, with `checkDowngrade`), Stripe is called second, and the booking is withdrawn if Stripe refuses. This is tested.
* **PF-15b r1 and r2:** both behave as the PR says and are tested. `plan.changed` is written last in each transaction that changes the plan.
* **PF-12:** `platformSubscription` reads and writes go through `firmScope`. `platformPlan` is a shared catalogue.
* **Size:** 665 lines added and 10 removed, 675 changed. Under 800.

## Findings

### Blocker

**B1. A change made now leaves an earlier booked renewal change live in Stripe, so the firm is billed for a plan it no longer has.**
* **Where:** `S/api/src/platform/billing/plan-change/service.ts:41-59` (`plan()` never looks at `cur.scheduleId` or the open booking) and `:85-99` (`changeNow` and the DB write leave the schedule alone).
* **Failing scenario (probe B):**
  1. An active firm on Team monthly books Lite for the renewal (a Stripe schedule to `price_liteMonth`, plus PF-15b's booking).
  2. The Owner changes their mind and raises to Firm without withdrawing first.
  3. The raise succeeds: it charges the proration, and our plan becomes `firm`.
  4. Stripe's schedule still moves the subscription to `price_liteMonth` at the renewal.
  5. Our booking (from Team) is withdrawn by the daily job as STALE, so our DB stays on `firm`.
  6. From the renewal on, the firm has Firm's limits and pays Lite's price, with nothing to flag it.
* **Second path to the same failure (probe E):**
  1. On Team yearly, the Owner books Lite monthly (booking plus schedule).
  2. The Owner then books Team monthly, a period-only change. It calls no `book()`, so nothing refuses it, and `scheduleAtRenewal` overwrites the schedule's phase 2 with `price_teamMonth`.
  3. At the anniversary Stripe bills Team monthly while our DB applies Lite.
* **Fix:** `plan()` refuses any change while `cur.scheduleId` is set or a booking is open, with 409 `PLAN_CHANGE_BOOKED` ("withdraw it first"). This matches PF-15b's own rule. Add a pass and fail test for both orders.

### Major

**M1. Plan changes are not serialised per firm, so two at once double-write the audit line and `plan.changed`, and can leave Stripe and our DB disagreeing.**
* **Where:** `service.ts:76-101`. There is no lock across read, Stripe call and write. `updateMany` at `:94` ignores its count, but the audit line (`:95-97`) and `plan.changed` (`:98`) are written anyway.
* **Failing scenario 1 (probe A), a concurrent double click on one raise:**
  * Both requests pass the `SAME_PLAN` check, because both read Stripe before either change lands.
  * Both call `changeNow` with the same key, and Stripe replays the first.
  * Result: 1 charge, but **2** `platform.plan.changed` audit lines and **2** `plan.changed` rows. In part 2 that is two "plan changed" emails.
  * Against real Stripe, a second request that arrives while the first is still running gets `idempotency_key_in_use`. That error lands in the `catch` at `:85-86` and is reported as 402 "Your card was not charged", while the first request is charging the card.
* **Failing scenario 2 (probe C), two tabs at once (Team→Firm monthly, and Team monthly→yearly):**
  * Both run, and both answer `kind: now`.
  * One is charged an amount different from what its own preview showed (here the second change's proration became 0, because Stripe's state had moved under it).
  * Our DB and Stripe end on combinations neither preview described.
* **Fix:** take the firm row lock (or a `plan-change:<firm>` advisory lock) for the whole change, and refuse with 409 if `updateMany` changed 0 rows. Add a concurrent test.

**M2. If Stripe succeeds and our side then fails, nothing repairs it, and a retry cannot either.**
* **Where:** `service.ts:85-99` and `:89-92`.
* **Failing scenario 1, the now path:**
  * Stripe charges and changes the price, then the `$transaction` at `:93` fails (DB restart, timeout, or the M1 race).
  * The Owner sees 500. Our plan stays Team, and so do the limits.
  * The webhook does not sync the plan from the price: `billing/webhook.ts` maps only status and dates.
  * A retry re-reads Stripe, finds the new price, and gets 409 `SAME_PLAN` "already on that plan". The firm has paid for Firm and is stuck on Team's limits, and the Owner has no way to fix it.
* **Failing scenario 2, a timeout:**
  * Stripe's request times out after `maxNetworkRetries: 2` (`stripe-plan-change.ts`, `fromKey`), but Stripe did charge.
  * The `catch` at `:86` answers 402 "Your card was not charged and your plan has not changed". That is false, and the DB is never updated.
* **Failing scenario 3, the trial undo and a replay:**
  * During a trial, `book()` refuses after Stripe changed the price (for example a conflict appeared between the pre-check at `:81` and `book()`'s locked check).
  * The undo at `:90` reverts Stripe under `${key}-undo`.
  * The Owner fixes the conflict and confirms again within 30 minutes with the same `prorationDate`, so the key is the same.
  * Stripe **replays** the first `changeNow` success without doing anything, `book()` now succeeds, and our DB says Lite while Stripe stays on Team.
* **Fix (any one, stated in the PR):**
  * When Stripe's price differs from our plan, `plan()` reconciles the DB to Stripe instead of answering `SAME_PLAN`; or
  * write an intent row before calling Stripe and finish it idempotently; or
  * make the undo key part of the retry key (for example, include the attempt or the booking id).
* Map only `StripeCardError` to 402. A timeout or connection error should be 503 with "we could not confirm", never "not charged".

**M3. The trial preview sends a combination the installed library says Stripe refuses, so every trial preview fails with 503 on real Stripe.**
* **Where:** `S/api/src/platform/billing/plan-change/stripe-plan-change.ts:36-38` (`details()` always adds `proration_date`), `:43` (createPreview) and `service.ts:70` (a trial previews with `prorate: false`, so `proration_behavior: "none"`).
* **Library text:** `Invoices.d.ts:3129`: "If previewing an update to a subscription, and doing proration, `subscription_details.proration_date` forces the proration … **Also, `subscription_details.proration_behavior` cannot be set to 'none'.**"
* **Failing scenario:**
  1. A trialing firm's Owner opens the change.
  2. `createPreview` sends `proration_behavior=none` and `proration_date=…`.
  3. Stripe answers 400, which `.catch` at `:70` turns into 503 "We could not reach our billing provider".
  4. The trial switch, a part-1a Done-when line, cannot be previewed in production.
* **Why the tests miss it:** the recorded Stripe answers (`tests/check_pf16_billing_rules.ts:57-60`) accept the combination, so the contract case "without proration (a trial) nothing" passes.
* **Fix:** either skip Stripe for a trial preview (the amount is 0 by rule), or omit `proration_date` when not prorating, in both preview and update. Make the recorded Stripe refuse `none` together with `proration_date`, as the library documents.

**M4. "The amount charged is the amount previewed" is not enforced. Only the proration date is carried, not the decision the preview showed.**
* **Where:** `service.ts:56` (trial = `trialEndsAt > at`, where `at` is the client's `prorationDate`) and `:76-84` (the change re-decides the kind and amount from scratch). The plan, `product/screens/PF-16/plan.md:59`, promised "The change re-reads Stripe and refuses if the preview's subscription version is stale (409 `PREVIEW_STALE`)"; only a 30-minute clock window was built (`:79`).
* **Failing scenario, the DB status still TRIAL (webhook not yet in):**
  1. The trial ends at 12:00. The Owner previews at 11:45 and sees "trial: free, nothing charged".
  2. The Owner confirms at 12:10 with `prorationDate` 11:45.
  3. The service decides "trial" (because `trialEndsAt > at`) and sends `proration_behavior: none` to an **active** Stripe subscription. That is a free upgrade for the rest of the period.
  4. PF-15b's trigger decides with `now()` (`migration 20261121130000_pf15b_plan_booking:75`), so `book()` writes a **renewal** booking instead.
  5. Result: Stripe is on Firm, our DB on Team with the lower-of-two limits, and the answer says `kind: "trial", appliedAt: null`.
* **Failing scenario, the DB status already ACTIVE:**
  * The same confirm becomes `kind: now` and charges a proration the Owner never saw (the preview showed 0).
* **Fix:** the change carries the preview's `kind` and `amountDueNowCents` (or a short-lived server-side preview token), re-previews, and refuses with 409 `PREVIEW_STALE` on any difference. Decide "trial" from the server clock and Stripe's `cur.status === "trialing"`, not from the client's date.

**M5. Two part-1a Done-when lines have no real fail test, and two assertions cannot fail through this PR's code.**
* **Where:** `S/tests/check_pf16_billing_rules.ts`. `STANDARDS.md` §10 ("Every business rule has a passing and a failing test") and line 48 ("A rule's test fails when the rule is removed") apply.
* **Monthly → yearly starts a fresh year:**
  * The "fail" at `:202-203` is yearly → monthly, which is a different rule.
  * No case shows monthly → yearly refused or unchanged when it should be, for example a declined card leaving the period and plan as they were, or a trial monthly → yearly that must **not** reset the anchor.
* **A trial switch charges nothing and keeps the end date:**
  * The "fail" at `:211-213` (unknown plan 404, same plan 409) does not touch the rule.
  * The pass's "end unchanged" assertion (`:210`) reads `platform_subscription.trial_ends_at`, which no code in this PR writes, and the fake (`ports/plan-change.ts:70`) does not model Stripe's `trial_end`. If the adapter started ending the trial, nothing would fail.
  * Needed: a fail case for a trial that has ended (at the server clock) not being free, and an assertion on what the adapter sends: no `billing_cycle_anchor`, no `trial_end`, `proration_behavior: none`.
* **The double click:**
  * `:171-175` is sequential and passes on the `SAME_PLAN` pre-check alone. Replacing the idempotency key with a random one would still pass.
  * Make it concurrent (probe A shows the result it would catch).
* **Not tested at all:** Stripe succeeding and then the DB failing, the trial undo, a change while a schedule or booking is open (B1), concurrency (M1), and the recorded adapter's parameters (`proration_date`, `payment_behavior`, `billing_cycle_anchor` are never asserted; see M3).

### Minor

**m1. A period-only renewal booked again after a withdrawal fails with 503 for 24 hours.**
* **Where:** `service.ts:108` (keys a period-only change by `periodEnd`, so the key is the same after a withdrawal) and `stripe-plan-change.ts:56` (`subscriptionSchedules.create` with `${key}-from`).
* **Scenario:**
  1. Yearly → monthly is booked, then withdrawn (the schedule is released).
  2. The Owner books it again, and Stripe replays the old create, returning the **released** schedule's id.
  3. `retrieve` has no `current_phase`, which throws. The answer is 503 until the key expires.
* The PR's own comment at `:106-107` describes this trap for bookings, but the period-only path still has it.

**m2. A period-only withdrawal writes no audit line, and `withdraw` can misreport.**
* **Where:** `service.ts:119-127`.
* Withdrawing a period-only change (which had a `platform.plan.period_booked` line) writes no line.
* The answer `{ withdrawn: false, scheduleReleased: true }` is given even when there was no schedule to release.

**m3. The audit shape differs from PF-15b's for the same event, and has no money in it.**
* **Where:** `service.ts:95-97`.
* `platform.plan.changed` uses `before/after: { plan, period }`, while PF-15b's lines for the same change use `shape(plan, bookedPlan, effectiveAt)` (`plan-booking.ts:172-173`, "One shape for every line's before and after", review m4). The action names also differ (`platform.plan.changed` here, `plan.change.applied` on the trial path).
* A charged change records neither the amount, the currency nor the proration date.
* For a period-only monthly → yearly, the summary says "The plan changed from team to team".

**m4. The firm row is read without `ownFirm`.**
* **Where:** `service.ts:43` reads `platformFirm` with `{ id: s.firmId }` instead of PF-12's `ownFirm(s.firmId)` (`firm-scope.ts:26`).
* It is the same firm, so nothing leaks. `billing/account.ts:50` does the same.

**m5. The conflict check for an immediate change runs outside the lock.**
* **Where:** `service.ts:81`, then `:94`.
* A monthly → yearly move to a plan with a lower limit applies at once via `updateMany` after a conflict check made with no lock. A staff invite or a case opened in between can leave the firm over its new limit (SA-3-58). The renewal path is safe because `book()` locks.

**m6. Locally, every change answers 503.**
* **Where:** `S/api/src/features/platform-billing-rules.ts:20`, which uses `fakePlanChange({ prices: [] })`. It has no subscriptions and is not linked to `fakeBilling`.
* With no key, every preview gets 503 "We could not reach our billing provider". This needs settling before the PF-5s screen calls these routes on the demo.

**m7. The schedule's phase 1 is rebuilt from the price alone.**
* **Where:** `stripe-plan-change.ts:60-63`.
* Phase 1 keeps only the price and `quantity: 1`. Any discount, tax rate or metadata on the current phase is dropped from the schedule.
* The PR already marks the phases "unconfirmed live". Add this to the Mac test-key run.

**m8. A declined card is replayed for the rest of the preview window.**
* **Where:** `service.ts:83-86`.
* The key carries the preview's date, so after a decline, a retry with the same preview gets Stripe's saved 402 back even after the card is updated.
* The message says "Update the card in Billing, then try again". It should say to preview again, or the screen must re-preview.

## Checklist
| Check | Result |
|---|---|
| One charge per confirmation | Sequential: yes. Concurrent: one charge but duplicate audit line and event (M1). The second of two different changes is charged off-preview (M1). |
| Charged = previewed | Not enforced beyond the proration date (M4) |
| Idempotency keys | Present on every changing call. Replay hazards: M2 (trial undo), m1, m8 |
| Failure ordering and compensation | Lower move: right. Now path, Stripe ok then DB fails: none (M2). Trial undo: replay hole (M2) |
| Trial detection | Uses the client's date and our status, not Stripe's (M4) |
| Stripe parameters (23.1.0) | Valid, except `proration_behavior: none` with `proration_date` on preview (M3) |
| Owner only | Yes |
| Hold and overdue | Yes |
| Two changes at once | Not serialised (M1). An open schedule or booking is ignored (B1) |
| PF-12 walls | Yes; m4 is cosmetic |
| Audit before/after | Present but a second shape, no money (m3); a period-only withdrawal has none (m2) |
| PF-28 input rule | Yes |
| Pass and fail per Done-when line | Two lines lack a real fail; two assertions cannot fail (M5) |
| Size < 800 | 675 |

## To fix before Approve
1. **B1:** refuse a change while a Stripe schedule or a booking is open; test both orders.
2. **M1:** a per-firm lock around the change; refuse when `updateMany` changes 0 rows; a concurrent test.
3. **M2:** repair the Stripe-ok, DB-failed state (reconcile in `plan()` or an intent row); 402 only for card errors; close the trial-undo replay.
4. **M3:** no `proration_date` with `proration_behavior: none` (or no Stripe call for a trial preview); the recorded Stripe refuses it.
5. **M4:** bind the change to the preview's kind and amount (409 `PREVIEW_STALE` on a difference); decide "trial" from the server clock and Stripe.
6. **M5:** real fail tests for monthly → yearly and the trial switch; assert the adapter's parameters; a concurrent double click.

The Minors can go in this PR or a recorded follow-up.

Verdict: Changes requested
