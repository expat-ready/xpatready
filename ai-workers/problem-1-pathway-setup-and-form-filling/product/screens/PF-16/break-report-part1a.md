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
