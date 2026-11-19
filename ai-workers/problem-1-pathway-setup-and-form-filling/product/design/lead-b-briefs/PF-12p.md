# PF-12p: plan and subscription writes only through crossings (Lead B, walls owner)

Written 19 Nov 11:5x IST by Lead B (7) from the breaker's N1 on #2224 (PF-15 part 2; comment 7001515873). The BACKLOG row is asked of the tech lead. Title: `migration — runtime: PF-12p — plan and subscription writes only through crossings`.

## The hole
A firm's own session (`xr_app`) can insert a `platform_plan` row and point its own `platform_subscription` at it (for example 10 000 seats). It can also move its own `current_period_end` or `status`, or move its plan away and back to keep an old limit. PF-15's one-month cap on the effective date limits the damage until this lands. No copy holds real people yet (PF-19e's gate).

## What `main` has (check at start)
* Sign-up writes the subscription as the app role (`platform/firms/signup.ts`: `platformSubscription.create` and `updateMany` under `firmScope`).
* #1959 (PF-5 part 2, the Stripe webhook) writes the subscription's status and period. **This item starts only after #1959 is on `main`.**
* PF-15 part 2 (#2224) already moved `seats_limit` changes behind `platform_limit_change`.

## Build
1. A migration revokes INSERT, UPDATE and DELETE on `platform_plan`, and INSERT plus UPDATE of `plan_id`, `status`, `current_period_end` (and any period column PF-16 adds) on `platform_subscription`, from `xr_app` and the other app roles. Check the grants by reading every role in `check_pf12_walls`.
2. Every writer moves onto a named crossing with its `audit` field (P-12b, #2029's `BYPASS_USES` rule): sign-up's subscription create and customer link (`per-firm`); the billing webhook's status and period writes (`per-firm`, the matched firm); the Sample seed (`system`). No other writer is allowed. A writer that is not in the list fails `check_pf12b`.
3. Plans are written only by our own staff's crossing (`xr_staff_bypass`) or the seed.

## Done when (`tests/check_pf12p_plan_writes.ts`)
* A firm session's INSERT into `platform_plan` → refused (permission denied); an UPDATE of its own subscription's `plan_id`, `status` or `current_period_end` → refused; nothing changes.
* Sign-up still creates the trial subscription, and the webhook still moves status and period, each writing its audit line.
* `check_pf12_walls`, `check_pf12b`, `check_pf5*`, `check_pf15_*` and the sign-up browser suites stay green.
* Under 400 lines, tests included (P-610). The split point if it grows: grants plus sign-up first, then the webhook.

Rules: SA-3-4, SA-3-39 (the plan is ours to set), PF-12's walls, P-12b. Standard rules line as in `FO-3f.md`, plus P-610.
