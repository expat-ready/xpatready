# PF-16 part 1a: break report (money)

Target: PR #2866 at commit `0f65522bd`, run on an exact copy (`git archive 0f65522bd`). Scratch DB `xr_studio_pf16brk_<pid>` on 127.0.0.1:54329 (dropped after each run). Fakes only: fakeBilling and fakePlanChange behind a thin wrapper that can delay or fail one call. No Stripe, no :4400, no demo DB. The PR's own `tests/check_pf16_billing_rules.ts` passes on the copy (29/0).
Harness: the PR test's setup plus `PaymentHoldGate`, with Admin and Billing/Finance grants and Sample plans: `pf16-lite` (cheaper, fewer limits, monthly and yearly prices), `pf16-max` (40,000), `pf16-pricey` (dearer, fewer seats), `pf16-cheapbig` (cheaper, more of everything), `pf16-off` (Stripe price inactive), `pf16-retired` (our plan inactive). In "Seen", `S` is the fake Stripe subscription and `DB` is our `platform_subscription.plan_id`. Amounts are in cents.

## Blocker

**B1. A "now" change leaves a booked renewal's Stripe schedule in place.** Our side and Stripe split, and the firm ends up paying for the lower plan. `service.ts:85-99` neither releases the schedule nor withdraws the open booking. Later, `plan-booking.ts:132-141` (r1) withdraws our booking as STALE and never touches Stripe.
- Repro A1: ACTIVE on Team monthly, 15 days left. Change to `pf16-lite` (renewal), then preview and change to `firm`, then advance 16 days and run `bookings.daily()`.
- Seen: the change answers `kind now, chargedNow`, 5000 charged. DB = firm. The booking team->lite is withdrawn as STALE. But S still has `sub_sched_fake000001` with renewal `price_liteMonth`. From the renewal the firm pays Lite and has Firm.
- Repro A1b: book `pf16-lite`, then change Team monthly to yearly ("now", same plan) and run the job after the old period end.
- Seen: 96,667 charged for a Team year and S's period ends 2027-11-21, yet DB moves to Lite on 2026-12-01. The Stripe schedule still says Lite at the old date.

**B2. Two "now" changes in parallel (two tabs) give a dearer plan than the one Stripe bills.** Both requests read the plan in `plan()` (`service.ts:41-58`) with no firm lock. In `service.ts:94` the write `updateMany(... planId: p.sub.planId)` updates 0 rows on the loser, and nobody checks the count. The audit line and `plan.changed` (`:95-98`) are written anyway.
- Repro A4: preview `pf16-max` and `firm`. Send both changes. Hold both at `changeNow`, release max first and let it finish, then release firm.
- Seen: both answer 200 `kind now, chargedNow`. DB = pf16-max, S = `price_firmMonth`. Charges: [15000]; the firm move is a credit, not a charge. The firm keeps Max at the Firm price.

**B3. If Stripe charges and our write fails, the state is permanent, and retrying does not heal it.** `service.ts:53` answers `SAME_PLAN` before the idempotent replay can run, because Stripe's price already equals the target. Nothing else syncs the plan: the webhook (`webhook.ts:146-149`) stores only status, trial end and period end.
- Repro A6: preview `firm`, then make the `platform.plan.changed` audit write throw once.
- Seen: the change fails. S = firm, 5000 charged, DB = team. A fresh preview + change gives 409 SAME_PLAN, and so does a retry with the same `prorationDate`.
- Repro A6b: `changeNow` is applied at Stripe and then the call throws (timeout).
- Seen: 402 PAYMENT_FAILED, "Your card was not charged and your plan has not changed" (`service.ts:86`). But 5000 was charged and S = firm. Retry: 409 SAME_PLAN.

## Major

**M1. Trial: if the booking fails after Stripe changed, the same click again leaves Stripe on the old plan and our side on the dearer one.** The first attempt's undo uses `${key}-undo`. The retry reuses `key`, so Stripe replays the first change, which has already been undone, and changes nothing (`service.ts:83,90`).
- Repro A7: TRIAL ending in 9 days. Preview `firm`. `bookings.book` throws once (a transient DB error). Send the change, then send it again with the same `prorationDate`.
- Seen: the first call errors; the undo puts S back on team. The retry answers 200 `kind trial` and DB = firm, but S stays `price_teamMonth`. At trial end the firm pays Team and keeps Firm.
- Repro A7b: the booking fails and the undo fails too. The undo's error is swallowed by `.catch(() => undefined)` at `:90`.
- Seen: an error, with S = firm and DB = team. The firm will be billed Firm for Team.

**M2. Renewal compensation can leave the two sides apart while the user is told "Nothing was changed".**
- Repro A10a: the schedule is applied at Stripe and then the call fails. Seen: 503 BILLING_UNAVAILABLE "Nothing was changed". Our booking is withdrawn (`service.ts:109`), but S keeps the schedule to `price_liteMonth`. From the renewal the firm pays Lite and keeps Team.
- Repro A10c: Stripe refuses the schedule and `bookings.withdraw` throws; the throw is swallowed at `:109`. Seen: 503 "Nothing was changed", but the booking stays open. The job applies it, so DB = pf16-lite while S stays Team with no schedule: the firm pays Team and gets Lite.

**M3. Booking a period-only change (yearly to monthly) again after withdrawing it does nothing at Stripe.** The key is `pf16-…-<periodEnd secs>` (`service.ts:108`). On the second booking, the adapter's `${key}-from` create and the `key` update both replay the earlier answers (Stripe keeps keys for 24 h), which point at the already-released schedule.
- Repro A2: Stripe on `price_teamYear` with 200 days left. Change to `team` monthly, withdraw, then change to `team` monthly again.
- Seen: the second change answers 200 `kind renewal`. 2 `platform.plan.period_booked` lines are written. But S has no schedule and no renewal, so at the anniversary the firm is billed another full year.

**M4. A period-only change made while a plan booking is open overwrites Stripe's schedule.** The same-plan branch at `service.ts:105` skips the booking and so also skips its PLAN_CHANGE_BOOKED check. `scheduleAtRenewal` then rewrites phase 2.
- Repro A3: Team yearly. Change to `pf16-lite` yearly (booked), then to `team` monthly.
- Seen: both answer 200. Our booking team->lite is still open, but S's renewal is now `price_teamMonth`. At the renewal DB = Lite while Stripe bills Team monthly.

**M5. A booking made just after monthly to yearly takes our old monthly period end, not Stripe's new year.** The "now" path never updates `current_period_end` (`service.ts:93-99`). The trigger stamps `effective_at` from it, that date never changes afterwards, and the answer reports it (`:115`).
- Repro A16: Team monthly with 10 days left. Change to `team` yearly (96,667 charged), then to `pf16-lite` yearly, before any webhook arrives.
- Seen: `effectiveAt` 2026-12-01 and booking team->lite on 2026-12-01, while S's period end and schedule are 2027-11-21. The limits drop to Lite 11 days into a paid Team year.

**M6. The amount charged can differ from the amount previewed.** The change works out the kind again from scratch (`service.ts:80`). Nothing records the preview's kind or amount, and any date inside the window is accepted (`:79`).
- Repro A8: preview `firm` during the trial (`kind trial`, 0). The webhook then sets the status to ACTIVE. Confirm with the preview's date. Seen: `kind now`, 3000 charged.
- Repro A14: preview at now (5000), confirm with now − 29 min. Seen: 5007 charged.

## Minor

- **m1. Trial detection trusts the client's date and our own status, not Stripe's.** `service.ts:56` decides "trial" without looking at `cur.status` or `cur.trialEnd`.
  - Repro A9: the trial ended 10 minutes ago, our status is still TRIAL (late webhook), S is `active`. The Owner sends `prorationDate` = now − 15 min.
  - Seen: the preview said `now`, 5000. The raise to `firm` ran as `trial` and was refused by the DB trigger (409 PLAN_RAISE_NOT_BOOKED; the undo ran), so that part held. The same-plan change to `team` yearly ran as `trial`: 200, no proration, `appliedAt` 15 minutes in the past. On real Stripe, a change of interval with `proration_behavior: none` on an active subscription invoices the full year without credit for the unused month (Unconfirmed: no test-mode run).
- **m2. A "now" change can skip checkDowngrade if an invite lands mid-change.** The conflicts are read in a separate transaction (`:62,81`), before Stripe and before the write, without the firm and case-open locks that `book` takes.
  - Repro A11b: an invite is inserted while `changeNow` is in flight to `pf16-pricey`. Seen: 200, and the firm sits on a 4-seat plan with 6 seats used.
- **m3. Duplicate records on parallel changes.** A5: two parallel raises to `firm` with two preview dates charge once (held), but write 2 `platform.plan.changed` lines and 2 `plan.changed` events. In A4 the losing request also writes them, although DB did not change.
- **m4. Dead ends with wrong words.** A12: `pf16-cheapbig`, yearly Team to Firm monthly, and yearly Team to Max monthly all answer 409 PLAN_RAISE_NOT_BOOKED, "A move to a larger … plan applies at once". There is no at-once path for these moves, and Firm yearly is 409 PLAN_NOT_PURCHASABLE. A yearly firm can never reach Firm.
- **m5. Withdraw route gaps.** Withdrawing a period-only change releases Stripe's schedule but writes no audit line (A13: 0 lines, though the booking wrote `period_booked`). It answers `withdrawn:false`. `scheduleReleased:true` is also answered when there was no schedule. Two parallel withdraws: one 200, one 404 NO_PLAN_CHANGE_BOOKED, after both had released at Stripe.
- **m6. The fake does not match Stripe on failed requests.** fakePlanChange does not keep a failed `changeNow` under its key. Stripe keeps a 402 card error under the key, so "update the card, then try again" with the same preview date would replay the decline (Unconfirmed). The port contract has no case for a change made while a schedule is attached (B1).

## What held

- **Roles.** Admin and Billing/Finance get 403 on preview, change and withdraw; anonymous gets 401. Owner of a held firm gets 402 (PaymentHoldGate). Subscription held while the firm row is ACTIVE gets 409 BILLING_NOT_ACTIVE. Nothing reached Stripe.
- **Input.**
  - 409 PREVIEW_STALE: +2 min, 1970, year 9999.
  - 422: 2026-02-30, no zone, number, "yesterday", period `week`, a 65-character plan, an extra field, withdraw with a body.
  - 404: `FIRM`, an unknown plan, an inactive plan.
  - 409 PLAN_NOT_PURCHASABLE: Stripe price inactive; no yearly price.
  - A padded code is trimmed.
- **Repeated clicks.** The same preview confirmed twice charges once, and parallel identical raises charge once. A declined card gives 402 and changes nothing (PR test).
- **checkDowngrade on "now", sequential.** `pf16-pricey` while over its seats: 409 DOWNGRADE_CONFLICTS, nothing at Stripe.
- **Back-dated raise in an expired trial.** Stopped by the trigger's own clock, and the undo ran.
- **Withdraw.** With nothing booked, or twice: 200, no change. Release failing: 503, booking kept.
- **PF-15b r2.** A held firm's due booking waits (PR test).

## Round 2 (fixed head `9d8d09339`)

**Setup.** Fresh `git archive 9d8d093396cb` copy and the same harness (`tests/break_pf16a_r2.ts` in scratch, never committed). Every change now sends the preview's `kind` and `amountDueNowCents`. The PR's check passes: 37/0. Scratch DBs `xr_studio_pf16brk2_<pid>` were dropped.

**New fields.** These are refused:
- 422: a missing `kind`; `kind: "free"`; an amount of −1, 1.5, 10^12 or the string "5000".
- 409 PREVIEW_STALE: a wrong amount (4999 for 5000); `kind: "trial"` or `"repair"` on a raise.

### Closed (reproduction re-run, result)

| Finding | Reproduction | Result now |
|---|---|---|
| B1 | A1: book Lite, then raise to Firm, by preview + change and by a direct change | 409 PLAN_CHANGE_BOOKED; DB team, Stripe unchanged, 0 charged |
| B1 | A1b: book Lite, then Team monthly→yearly | 409 PLAN_CHANGE_BOOKED |
| M4 | A3: book Lite yearly, then Team monthly | 409 PLAN_CHANGE_BOOKED; Stripe's renewal still `price_liteYear` |
| B2 | A4: Max and Firm in parallel | Max 200 (15,000 charged). Firm 409 PREVIEW_STALE "no longer the same kind". DB = Stripe = Max; 1 event |
| m3 | A5: the same raise twice in parallel | 200, then 409 SAME_PLAN; 1 charge, 1 audit line, 1 event |
| B3 | A6: Stripe charged, our audit write fails | The preview now shows `kind: "repair"`, 0 due. The retry answers `repair`: DB = firm with one repair line, no second charge |
| B3 | A6b: Stripe applied, the answer was lost | Read back, then 200 `now`, DB = firm |
| B3 | A6c: generic failure, Stripe not changed | 503 BILLING_UNCONFIRMED, not "not charged" |
| M1 | A7: trial, the booking fails once, then the same click | 409 PREVIEW_STALE "did not take the change". A fresh preview 2 s later completes (DB = Stripe = firm) |
| M1 | A7b: the booking fails and the undo fails | The next preview is `repair`; the change sets DB = firm, matching Stripe |
| M2 | A10a: schedule applied, the answer was lost (fake) | 200 renewal, booking kept, Stripe schedule to Lite: the two sides agree |
| M2 | A10b: Stripe refuses the schedule | 503, booking withdrawn |
| M3 | A2: period change, withdraw, book again | The second booking makes a schedule (renewal `price_teamMonth`). 1 `period_withdrawn` line (m5) |
| M5 | A16: monthly→yearly, then Lite yearly | DB `current_period_end` 2027-11-21; booking effective on Stripe's date |
| M6 | A8: trial preview, then the status goes ACTIVE | 409 PREVIEW_STALE |
| M6 | A8b: the trial ends by our clock with the status still TRIAL | 409 PREVIEW_STALE |
| M6 | A14: the preview's amount sent with a date 29 min earlier | 409 "5007 cents, not the 5000 shown"; 0 charged |
| m1 | A9: expired trial, back-dated `trial` change, raise or period | 409 PREVIEW_STALE. The back-dated `now` change with the preview's amount gives 409 (94997 ≠ 95000) |
| m2 | A11b: an invite that takes the firm-row lock, sent during a "now" change | The invite waits until the change commits |
| m5 | A13 | Nothing booked: `withdrawn:false, scheduleReleased:false`. Two parallel withdraws: 200 `withdrawn:true`, then 200 `withdrawn:false` (no 404) |
| m6 | A decline, then the same date | 402 both times, "preview the change again". A fresh preview charges once |

**Roles and hold.** Admin and Billing/Finance get 403 on all three routes; anonymous gets 401. A held Owner gets 402.

### Still open

- **Major: M2 is not closed on the real adapter.** After a failure, the code counts any schedule as success without checking its second phase (`service.ts:148-153`).
  - Repro N2: StripePlanChange on recorded answers. `subscriptionSchedules.create(from_subscription)` succeeds; the phase update (`POST /v1/subscription_schedules/sub_sched_r1`) answers 400.
  - Seen: 200 `kind renewal`, our booking team->Lite kept. Stripe has `sub_sched_r1` with no Lite phase. At the renewal DB = Lite while Stripe keeps billing Team.
- **Minor: A10c is now visible, but the two sides still split.** Stripe refuses and our withdraw fails: 503 BILLING_UNCONFIRMED "withdraw the change there if it shows", and the next preview gives 409 PLAN_CHANGE_BOOKED. If nobody withdraws, the job applies Lite (DB = pf16-lite) while Stripe stays Team with no schedule.
- **Minor: m4's new words still lead to a dead end.** A12: `pf16-cheapbig` is monthly→monthly, yet the answer is "move to it at the same billing period first (it applies at once)". It does not apply at once; it is cheaper in Stripe, so it is refused again. Yearly Team → Firm monthly gets the same words, but Firm has no yearly price, so that path is impossible.

### New

- **Blocker: ten concurrent change requests freeze the whole API (every firm) for 60 s, repeatably.** `change()` holds one pooled connection for the whole interactive transaction (`service.ts:92-122`, timeout 60 s). Inside it, `plan()`, `bookings.open/book/withdraw` and `withdraw()`'s read use `this.d.db`, which needs a second connection. The app's pool is pg's default of 10 (`walledPool`, no `max`). Requests waiting on the advisory lock each hold a connection, so the one holding the lock can never get its second.
  - Repro N3: one Owner sends 10 `change` requests for Firm at once.
  - Seen: all 10 fail at about 60,040 ms with `PrismaClientKnownRequestError`, and nothing is charged. An unrelated `platformPlan.count()` was still waiting after 20 s. With 8 or 9 at once: 200 at about 1 s, then SAME_PLAN.
  - Repro N3b: 10 renewal changes at once.
  - Seen: after 60 s, 9 answers are PLAN_CHANGE_BOOKED. The tenth is a 500 ("A commit cannot be executed"), yet its booking and Stripe schedule were both made.
  - Inferred, not run: 10 changes from different firms in flight together, or fewer alongside other traffic, should deadlock the same way. Stripe calls inside the transaction (10 s × 3 tries) widen the window.
- **Minor: "repair" trusts a shared Stripe price and skips every check.** `service.ts:62-64` answers "repair" whenever Stripe's price equals the target's, with no Stripe call, no checkDowngrade and no check of the kind sent. Nothing makes `stripe_monthly_price_id` or `stripe_yearly_price_id` unique.
  - Repro N1: plans `pf16-twin` (40 more seats) and `pf16-tiny` (1 seat, zero limits) both carry `price_teamMonth`. Change from Team to each, with `kind: "trial"` or `"renewal"` and 0.
  - Seen: both answer 200 `repair`. DB moves to the bigger plan for free, and to the 1-seat plan with 5 staff and no conflict check.

## Round 3 (head `d53df7f76`)

**Setup.** Fresh `git archive d53df7f76a10` copy. I re-ran the round-2 script with the new probes added (`tests/break_pf16a_r3.ts`) and `r2_a7.ts`, both in scratch. The PR's check passes: 41/0. Scratch DBs `xr_studio_pf16brk3*` were dropped.

**Every round-2 closure still holds**, with the same results as before: roles and hold, the new fields, B1, M4, M3, B3 (repair, read-back, BILLING_UNCONFIRMED), M1 (A7b), M5, M6, m1, m2, m5 and m6.

In the main run, A7's "fresh preview" gave PREVIEW_STALE only because the fake clock had not moved, so the preview reused the same second and Stripe key. Re-run 2 s later in `r2_a7.ts`, it completes: DB = Stripe = firm.

### Closed in round 3

- **Pool freeze (round-2 Blocker).** Every query of a change now runs on its one transaction, and a second concurrent change for the same firm is refused at once instead of queueing.
  - N3, one firm, 10 requests at once, Stripe 3 s: one 200 at 3020 ms; nine 409 PLAN_CHANGE_IN_PROGRESS at 7-12 ms. An unrelated query took 3 ms. 1 charge.
  - With 8 and with 9 requests: one 200, the rest PLAN_CHANGE_IN_PROGRESS.
  - A4 and A5 now give PLAN_CHANGE_IN_PROGRESS for the second request, with 1 charge and 1 event.
  - Two parallel withdraws: 200, then 409 PLAN_CHANGE_IN_PROGRESS.
- **Pool freeze, across firms.** I made 10 and 12 extra firms, each with its own Stripe subscription, and sent all their changes at once with Stripe slowed to 3 s.
  - 10 firms: all 200 at about 3.08 s.
  - 12 firms: ten 200 at about 3.1 s; two at 6.12 s, after waiting for a free connection.
  - No deadlock and no failure. The remaining cost is listed under Minor below.
- **M2 on the real adapter (N2, recorded Stripe).** The schedule is made, then its phase update gets a 400. Now: 503 BILLING_UNAVAILABLE, booking none, schedule released.
  - The fake's half-made mode (R3-A10c-c) gives the same: 503, booking none, no schedule.
- **A10c as found in round 2 (Stripe refuses, our withdraw fails).** Now: 503 BILLING_UNCONFIRMED, booking none, and the daily job applies nothing (DB stays team). The booking lives in the change's transaction, so the refusal rolls it back. "Booked by us, not by Stripe" can no longer happen.
- **Repair (round-2 Minor N1).**
  - Two plans sharing `price_teamMonth`: preview and change both give 409 PLAN_PRICE_SHARED "Ask us"; nothing moves.
  - Stripe already on Lite while ours is Team, with 6 staff against Lite's 5 seats: the preview shows `repair`, the change gives 409 DOWNGRADE_CONFLICTS ("…your billing already shows…"); DB stays team.
- **m4 (words).** `pf16-cheapbig`, and yearly Team → Firm monthly: "gives more than your plan on some limit, so it cannot start at the renewal. Ask us to make this change." That is accurate, and there is no self-service path left to describe.
- **New behaviour checked.**
  - A schedule left in its last phase is released quietly: withdraw answers `withdrawn:false`, and a raise afterwards gives 200 with 5000 charged and the schedule gone.
  - A half-made schedule whose release failed (R3-A10c-d) does not block: the next raise is released quietly, charged once, and DB = Stripe = firm.
  - Trial previews are 0 (A8, A8b).

### Still open

- **Minor: Stripe can keep a schedule we do not record, and nothing alerts.** The remaining split is one-directional: Stripe moves to the lower price at the renewal while our plan stays Team. The firm keeps Team limits at Lite's price, which costs us revenue but never harms the customer. Two ways to reach it:
  - **R3-A10c-b:** the schedule is applied, the answer is lost, and the read-back fails too. Seen: 503 BILLING_UNCONFIRMED, booking rolled back. Stripe has `sub_sched_fake000001` with Lite pending. The next preview gives 409 PLAN_CHANGE_BOOKED "Withdraw it first".
  - **Commit after Stripe:** Stripe answers, but the transaction has passed its 60 s timeout. Stripe-node's 10 s timeout × 3 tries over up to 5 calls makes this reachable during a Stripe incident.
    - Seen, renewal: a raw 500 Prisma error ("A commit cannot be executed on an expired transaction"), not a problem answer. Booking 0, Stripe Lite pending, next try 409 PLAN_CHANGE_BOOKED.
    - The "now" variant heals itself: 5000 charged, ours rolled back, and the next change is `repair` (DB = firm).
  - **Asked: is this acceptable?** Yes for part 1a in my view. It needs a Stripe failure after Stripe did the work, the customer is told (503, then "withdraw it first"), and the loss is ours. But it is fixed only if the Owner withdraws: nothing logs, alerts or reconciles it, and the slow path answers 500 instead of BILLING_UNCONFIRMED.

### New

- **Minor: changes hold pooled connections while they wait on Stripe.** No freeze any more, but the app's 10 connections are shared with every other request. With 10 or more changes from different firms in flight, all other traffic waits for Stripe's latency.
  - Seen, 10 firms × 3 s: an unrelated `platformPlan.count()` waited 1880 ms.
  - Seen, 12 firms: 1906 ms, and two changes waited until 6.1 s.
  - During a slow Stripe the waits grow toward the 30 s `maxWait` and the 60 s timeout. Each firm is limited to one change at a time, so this needs about 10 firms acting together.
- **No Blocker or Major found in round 3.**
