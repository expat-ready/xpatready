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

---

## Round 2: re-review of `9d8d093396cb7674e263f7d30ada76e706bde143` (diff only, P-277)

* **Read:** `git diff 0f65522bd 9d8d09339 -- …/prototype` (3879bd070 and 9d8d09339) and `product/screens/PF-16/break-report-part1a.md`.
* **Size:** 773 lines added and 10 removed from `origin/main`, so 783 changed. Under 800.
* **`check_pf16_billing_rules`:** 37 passed, 0 failed, run here at this commit.
* **Reviewer probes:** a scratch copy of the new check, outside the repo, with its own scratch database (dropped afterwards). Output:
  ```
  PROBE P1 {"refused":null,"stripeRenewal":null,"scheduleId":"sub_sched_partial000001","openBooking":"1"}
  PROBE P4 {"kind":"repair","conflicts":[],"refused":null,"plan":"pf16-lite"}
  ```
* **Correction to round 1:** I wrote that `billing_cycle_anchor: "now"` was valid on update and preview. It is not valid in 23.1.0 on API 2026-10-28. `SubscriptionUpdateParams.BillingCycleAnchor` (`Subscriptions.d.ts:2101`) and `InvoiceCreatePreviewParams.SubscriptionDetails.BillingCycleAnchor` (`Invoices.d.ts:3835`) are objects `{ type }`. 3879bd070 fixes it correctly.

### Round 1 findings
| # | Status | Evidence |
|---|---|---|
| B1 | **Fixed** | `service.ts:58-60` refuses while `cur.scheduleId` or our booking is open. Tested both ways: a raise, and a period change while a plan is booked. But see R2-M2: the guard is too wide. |
| M1 | **Fixed** | One transaction per change holding `plan-change:<firm>` (`:92-93`); `withdraw` takes the same lock (`:165`); the `updateMany` count is checked (`:129-130`). Tested with a parallel double click: one charge, one line, one event. |
| M2 | **Fixed for the now and trial paths**; **open for the renewal path** (R2-M1) | Now: Stripe is read back (`:112-116`); 402 only for `PaymentDeclined`; otherwise 503 `BILLING_UNCONFIRMED`; `repair` (`:62-64`, `:95`). Trial undo uses a fresh key (`:118`), and a replay is caught by the read-back. Tested: lost answer, unconfirmed, repair, decline replay. |
| M3 | **Fixed** | `proration_date` only with proration (`stripe-plan-change.ts:36-39`); the adapter's sent form is asserted. But see R2-M3, which follows from this fix. |
| M4 | **Fixed** | The preview's kind and amount are carried and re-checked at the same proration date (`:96`, `:107-108`); trial is decided on the server clock (`:68`). Tested: amount mismatch, and a trial that ended before confirming. |
| M5 | **Fixed** | Real fail tests for monthly → yearly and the trial switch; Stripe's trial end checked; a parallel double click; adapter parameters asserted. |
| m1 | Fixed | A fresh UUID per renewal key; tested. |
| m2 | Fixed | The period-withdraw line is written; `scheduleReleased` is true only when a schedule existed. See R2-M2 for a false line. |
| m3 | Fixed | `chargedCents` is in before, after and detail. |
| m4 | Fixed | `ownFirm`. |
| m5 | Fixed | A "now" move's conflicts are read under the firm-row and case-open locks, inside the locked transaction (`:98-104`). |
| m6 | Not changed (accepted for part 1a) | Still to be settled before the PF-5s screen calls these routes on the demo. |
| m7 | Fixed, with a new risk | See R2-m2. |
| m8 | Fixed | "preview the change again". |

The breaker's report also holds on the points it raises against `0f65522bd`:
* B2 and B3 are covered by M1 and M2.
* Its M3, M4, M5 and M6 are covered by m1, B1, its own M5 fix and M4.

### New findings (round 2)

#### Major

**R2-M1. A renewal schedule that Stripe created but whose phases it refused is reported as booked: the price never changes at the renewal.**
* **Where:** `service.ts:146-153` reads Stripe back after a failed `scheduleAtRenewal` and treats "a schedule exists" as success. The adapter makes the schedule in two calls, `create from_subscription` (`stripe-plan-change.ts:59`) and then `update` with the phases (`:66-68`).
* **Failing scenario (probe P1):**
  1. `create` succeeds and `update` is refused. Plausible causes: a validation error on the phases, which the PR itself marks "unconfirmed live", or R2-m2's discounts.
  2. The read-back finds `scheduleId`, so our booking is kept and the Owner gets **200** `kind: renewal`.
  3. Stripe's schedule is only the current phase copied from the subscription, so it releases at the period end on the **old** price.
  4. Our job applies Lite at the renewal. The firm keeps paying Team with Lite's limits. For a period change, Stripe bills another full year after the Owner was told "monthly from the renewal".
* **This is a regression:** at `0f65522bd` this path withdrew the booking and answered 503.
* **Fix:** success only when Stripe shows the target price in the schedule's next phase.
  * The adapter returns or exposes the scheduled price, for example `PlanSubscription.scheduledPriceId`, read from `schedule.phases`.
  * On a mismatch, release the schedule we created, withdraw our booking, and answer 503.
  * Make the fake able to fail between create and update, and add a test.

**R2-M2. B1's guard treats a schedule that has already done its job as "booked", so the plan cannot change for a whole period after every renewal change.**
* **Where:** `service.ts:60` (`cur.scheduleId`). The schedule's second phase lasts one full interval with `end_behavior: release` (`stripe-plan-change.ts:68`), so Stripe keeps `subscription.schedule` set until that phase ends: one month, or **one year** for a yearly price.
* **Failing scenario:**
  1. Team monthly books Lite. At the renewal Stripe moves to Lite and our job applies the booking (no open booking left).
  2. For the following month every preview and change, including a raise, answers 409 `PLAN_CHANGE_BOOKED` "A change is booked for the renewal. Withdraw it first". Nothing is booked from the Owner's point of view.
  3. A yearly firm that moved to a cheaper plan cannot upgrade for a year.
  4. The way out, `withdraw` (`:169-174`), releases the schedule but writes `platform.plan.period_withdrawn` "The booked change of billing period was withdrawn" for a change that already happened. The audit line is false.
* **Not tested:** nothing models the schedule's phase 2.
* **Fix:** "booked" means a schedule phase still to start.
  * Expose the next phase's start (and price) from the adapter.
  * A schedule in its last phase is released quietly, either by `plan()` before the change or by the booking job when it applies, with no "withdrawn" line.
  * Test both.

**R2-M3. On real Stripe, a trial switch's preview shows the next renewal's full price as "amount due now".**
* **Where:** `service.ts:83` and `:107` call `plans.preview` for `kind: trial`. The adapter (`stripe-plan-change.ts:41-46`) now sends `proration_behavior: none` with no proration date. With nothing invoiced now, Stripe's preview is the **upcoming** invoice. The library's own doc says so: `Invoices.d.ts:104`, "preview the upcoming invoice … all the charges that are pending, including subscription renewal charges". That is the invoice at the trial end, at the new price.
* **Failing scenario:**
  1. A trialing firm previews Firm.
  2. The answer carries `amountDueNowCents` equal to Firm's full monthly price.
  3. The screen shows a charge for SA-4-56's free switch. The change then charges nothing, because both previews agree, so the stale check passes.
* **Why the tests miss it:** the fake returns 0 for `prorate: false` (`ports/plan-change.ts`, `quote`).
* **Status:** unconfirmed live, but this is the library's documented behaviour.
* **Fix:** a trial's amount due now is 0 by rule. Skip Stripe for `kind: trial` in both preview and change, as `renewal` already does. Add the "now" preview's `always_invoice` amount (the immediate invoice only) to the PR's Mac test-key run.

#### Minor

**R2-m1. `repair` writes a lower plan with no `checkDowngrade` (probe P4).**
* **Where:** `service.ts:62-64` and `:95`.
* **Scenario:**
  * Stripe bills Lite while our plan is Team. This can follow M2's lost write, an undo that failed after `book()` refused for conflicts (`:118`), or a dashboard edit.
  * The firm has 5 more seats in use than Lite allows.
  * The preview answers `kind: repair, conflicts: []`, and the change writes Lite (SA-3-58: no override).
* Matching billing may be right, but the conflicts should at least be listed, with an alert, rather than silently passed.

**R2-m2. The phase discounts may send both `discount` and `coupon`.**
* **Where:** `stripe-plan-change.ts:65` sends `{ discount, coupon }` from the retrieved phase. Phase discounts take one of `coupon`, `discount` or `promotion_code` (`SubscriptionSchedules.d.ts:573-585`).
* A schedule retrieved from a discounted subscription can carry both, which may be refused. Today that refusal turns into R2-M1's silent success.
* Send `discount` when present, otherwise `coupon`. Add this to the Mac run.

**R2-m3. One change holds two connections and keeps locks during Stripe calls.**
* **Where:** `service.ts:92-122`.
* `plan()`, `bookings.open/book` and the trial conflicts use `this.d.db` while the outer transaction holds a connection.
* A "now" change holds the firm-row and case-open locks across up to four Stripe calls (10 s timeout, 2 retries each), which can exceed the 60 s transaction timeout after Stripe has charged. `repair` recovers it, but the Owner sees a 500 first.
* Rare at this scale. Read through `tx` where possible, and take the locks only after Stripe's answer, with the conflicts re-read then.

**R2-m4. The new words point to a path that may not exist (breaker m4).**
* **Where:** `service.ts:143`.
* For yearly Team → Firm monthly, the words say "move to it at the same billing period first", but Firm has no yearly price in the Sample catalogue (409 `PLAN_NOT_PURCHASABLE`). A yearly firm still cannot reach Firm.
* Either name the actual route, or keep this as a catalogue rule for the founder.

### Checklist (round 2)
| Check | Result |
|---|---|
| One charge per confirmation | Yes (lock, read-back, tested in parallel) |
| Charged = previewed | Yes for "now". Trial preview amount wrong on real Stripe (R2-M3) |
| Idempotency keys | Yes; fresh keys for undo and renewal; decline replay handled |
| Failure ordering and compensation | Now and trial: yes. Renewal: partial schedule counted as success (R2-M1) |
| Trial detection | Server clock, plus the kind re-check |
| Stripe parameters (23.1.0) | Valid; anchor object right; phase discounts risk (R2-m2) |
| Owner only, hold, overdue, PF-28, PF-12 | Unchanged and right; `ownFirm` used |
| Two changes at once | Serialised per firm |
| Booked guard | Right idea; too wide after a renewal (R2-M2) |
| Audit before/after | Amounts present; a false `period_withdrawn` line possible (R2-M2) |
| Pass and fail per Done-when line | Yes for the part-1a lines; R2-M1 and R2-M2 have no test |
| Size < 800 | 783 |

### To fix before Approve (round 2)
1. **R2-M1:** count a renewal change as booked only when Stripe's schedule shows the target price in its next phase; otherwise release it, withdraw ours, and answer 503. Add a test with create succeeding and update failing.
2. **R2-M2:** a schedule in its last phase is not "booked". Release it without a "withdrawn" line, and test the month after a renewal.
3. **R2-M3:** no Stripe preview for a trial (amount due now 0 by rule).

The round-2 Minors can go in this PR or a recorded follow-up.

Verdict: Changes requested

---

## Round 3: re-review of `412b37b42b20cc7217fb1a02b267e384558c2b03` (diff only, P-277)

* **Read:**
  * `git diff 9d8d09339 d53df7f76 -- …/prototype`, the round-3 fixes.
  * `git diff d53df7f76 412b37b42`: layout and comments only. I checked it with `-w --word-diff`: three doc comments are shorter and the contract's `} },` braces are joined. No code changed.
  * The breaker's round-2 section.
* **`check_pf16_billing_rules` at 412b37b42:** 41 passed, 0 failed, run here.
* **Size:**
  * Code and tests: 778 lines added and 17 removed from `origin/main`, so **795 changed**. Under P-610's 800.
  * The whole PR is 1,250 by GitHub's count, because it includes this review (≈320 lines) and the break report (133). That is P-775's case. See R3-m2.
* **Reviewer probe** (scratch copy of the check, its own scratch database, dropped afterwards):
  ```
  PROBE R3 {"first":{"status":0,"code":"Error: db write failed"},"stripePending":"price_teamMonth","nextPreview":{"status":409,"code":"PLAN_CHANGE_BOOKED","detail":"A change is booked for the renewal. Withdraw it first."}}
  ```

### Round 2 findings
| # | Status | Evidence |
|---|---|---|
| R2-M1 | **Fixed** | `PlanSubscription.pendingPriceId` is the first item of a phase that starts later (`stripe-plan-change.ts`, `current`). After a failed schedule call, the change counts as booked only if `pendingPriceId` is the target. Otherwise the schedule is released and our booking withdrawn (503), or the answer is 503 `BILLING_UNCONFIRMED` if the undo fails (`service.ts:154-163`). Tested with the fake's half-made schedule. |
| R2-M2 | **Fixed** | The guard uses `pendingPriceId` (`service.ts:53`). A schedule in its last phase is released quietly before a change (`:97`), and `withdraw` releases it with no audit line (`:179-184`). Tested: a raise after a schedule has done its job. |
| R2-M3 | **Fixed** | No Stripe preview for a trial (`:79`). The change requires 0 (`:108-109`). |
| R2-m1 | Fixed | `repair` runs `checkDowngrade` (409 on conflicts) and is refused when two active plans share the price (409 `PLAN_PRICE_SHARED`). Both tested. |
| R2-m2 | Fixed | One of `discount` or `coupon`. |
| R2-m3 | Partly fixed | Every query of a change and of `withdraw` now runs on the one transaction: `plan(…, tx)`, and PlanBookings `open/book/withdraw` take the outer transaction through `run()`. The 60 s timeout stays (see R3-m1). |
| R2-m4 | Fixed | "Ask us". |
| Breaker round 2, the pool freeze | **Fixed** | `pg_try_advisory_xact_lock`: a second change gets 409 `PLAN_CHANGE_IN_PROGRESS` and never waits. Tested: 12 changes at once end within 15 s with one charge, and an unrelated read answers. The builder reports that a mutant with the waiting lock fails at 60 s. |

**Round 1 status:** every Blocker and Major is fixed and tested. m6 (locally, with no Stripe key, the plan routes answer 503) is still open and still has to be settled before the PF-5s screen calls these routes.

### New findings (round 3)
There is no Blocker and no Major.

**R3-m1. With one transaction, a failure after Stripe's call rolls back our side while Stripe keeps its change.**
* **Where:** `service.ts:88-123` and `:148-168` (renewal), and `:172-186` (`withdraw`). This follows from the pool fix: the booking used to commit before Stripe was called.
* **Renewal scenario (probe R3, shown on a period change):**
  1. The schedule is made at Stripe.
  2. Our write fails afterwards (here the audit write). The same happens if the commit fails, or if the 60 s timeout runs out over about 7 Stripe calls at up to 10 s each, with 2 retries.
  3. Result: the Owner gets 500, Stripe has a pending phase, and our booking or audit line is rolled back.
  4. The next preview says "A change is booked for the renewal. Withdraw it first", so a way out is shown.
  5. For a plan booking where the Owner does nothing, Stripe moves to Lite at the renewal while we stay on Team. The firm pays Lite with Team's limits, and unlike the now path, nothing repairs it.
* **`withdraw` scenario:** the schedule is released at Stripe, then `bookings.withdraw(tx)` or the commit fails. Our booking stays and lowers the limits, and the job applies it at the renewal while Stripe stays on the old price. Retrying `withdraw` fixes it, and the booked guard keeps pointing there.
* **Why only Minor:**
  * It needs a database failure or timeout after Stripe has succeeded.
  * There is a visible way out in both cases.
  * No amount is charged that was not shown.
* **Suggestions, for this PR or a follow-up:**
  * Treat "Stripe has a phase ahead and we have no booking" as a renewal repair: book ours under `checkDowngrade` with no Stripe call, or show the Owner the exact state.
  * Have the booking job compare Stripe's price before it applies.

**R3-m2. The PR body's size line is out of date and lacks P-775's line.**
* The body says "Size: 675 changed lines".
* GitHub counts 1,250 for the PR, which `tools/pr-size.sh` refuses without a size-exception line.
* P-775 covers this case: code and tests 795, plus this row's own `product/screens/PF-16/` records. The body needs "Size exception: P-775" and the split (code and tests 795, records about 455).
* This is a body edit. It changes no commit, so it does not block this commit's Approve.

**R3-m3. A renewal change holds the firm's staff and case locks during the Stripe calls.**
* `book(…, tx)` takes the firm row lock (`for no key update`) and the `case-open` advisory lock inside the outer transaction. They are held across `scheduleAtRenewal` until commit.
* For that firm only, invites and case openings wait up to the Stripe time (60 s at most).
* Acceptable at this scale; noted with R2-m3.

### Checklist (round 3)
| Check | Result |
|---|---|
| One charge per confirmation | Yes: try-lock, read-back, 12 in parallel give one charge |
| Charged = previewed | Yes: "now" re-previewed at the same date; trial 0 by rule |
| Idempotency keys | Yes: fresh keys for undo and renewal; decline replay handled |
| Failure ordering and compensation | Now and trial: yes, with repair. Renewal: half schedule undone. Stripe-ok then DB-fail on the renewal and withdraw paths can still split (R3-m1, recoverable) |
| Trial detection | Server clock, plus the kind re-check |
| Stripe parameters (23.1.0) | Valid; anchor object; one discount key; schedule phases read for `pendingPriceId` |
| Owner only, hold, overdue, PF-28, PF-12 | Unchanged and right |
| Two changes at once | One at a time per firm, no waiting (409) |
| Audit before/after | Amounts present; no false withdrawal line |
| Pass and fail per Done-when line | Yes; plus repair, pool, half schedule, last phase |
| Size < 800 (P-610) | Code and tests 795; records under P-775 (body line owed, R3-m2) |

No Blocker or Major is open. The three round-3 Minors can be fixed in a follow-up. R3-m2 is a PR-body edit and needs no new commit.

Verdict: Approve 412b37b42b20cc7217fb1a02b267e384558c2b03
