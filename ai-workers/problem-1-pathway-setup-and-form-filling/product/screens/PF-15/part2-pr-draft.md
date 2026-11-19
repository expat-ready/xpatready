**migration** (`20261119051500_pf15_limit_changes`; stamp re-set at PR time, later than main's newest, P-600) · replaces the definer function `platform_entitlement_limit` (now takes the clock) · no shared port contract changed.

## What and why
PF-15 **part 2** (brief `product/design/lead-b-briefs/PF-15.md` part 2, plus the "Part 2 also" lines on `lead-b-front-office`), built overlapped on part 1a (#2130) as Lead 81 started it.

* **Case limits (DW8):** `PgEntitlements.check` for `active_individual_cases` / `active_corporate_cases` with the case side's count (`CaseCountPort`, its fake in the test). A closed case frees one; a reopened one counts again; corporate counts against corporate only.
* **`checkDowngrade` over all four metrics (DW3's return):** seats, both case metrics (through `CaseCountPort`), storage. Each conflict gives usage, the target's limit, the amount to reduce and SA-4-56's words: "You have 8 staff; Starter allows 3. Remove 5 staff or choose a larger plan." Cases say "Close or withdraw N of them", and storage is in MB of documents. A firm other than the session's is refused, because its usage would read 0 behind the walls. **Feature conflicts are not checked**: main has no plan feature list. It comes with PF-17, and part 2's check of it waits on PF-17 (`featuresNote` says so). I built no feature list, as the overlap brief says.
* **Limits we lower on a live plan (DW9; SA-3-43, SA-3-62):**
  * `PlanLimitChanges.change` (key `system/plan:approve-change`). There is no route until PF-4s (the web-address pattern).
  * One insert into `platform_limit_change` does the change. The table is insert-only, and only our own staff's crossing (`xr_staff_bypass`) inserts or reads it. Its definer trigger takes the plan's lock and stamps the approval time from the database clock. It then writes the new value and keeps the old one.
  * The app cannot change `platform_plan.seats_limit` directly any more: seats change only through a change row.
  * For a **lower** value, each firm then live on the plan gets its `effective_at`, stored in `platform_limit_change_firm` (walled): its first renewal at least 30 days after approval.
  * Until that date the firm keeps the **highest** value it had before any lowering still pending for it, and never less than today's value (null = Unlimited). This covers only lowerings approved while its current subscription was live.
  * From that date a firm over the limit keeps what it has and new items are refused. No downgrade check runs and nothing is deleted.
  * Renewal dates are worked out in UTC. An infinite date is not a renewal date.
  * A **raise** reaches every firm at once (additions, SA-3-43).
  * Every change writes one audit line per firm live on the plan, in the same transaction: `plan.limit.lowered` with the firm's date, or `plan.limit.raised`. A plan with no live firm has the change row (who, when, why; insert-only) as its record, because an audit line needs a firm.
  * After a lowering commits, each Owner of each firm it reaches gets the "Live-plan removal notice" email (Sample words). A failed send never stops the others: it is listed, and `sendNotices(changeId)` sends it again, once per Owner.
* **Cross-firm read closed (the P-423 read of #2130):** the definer function returns no row when a firm's session asks about another firm. The check then fails closed (limit 0). The case side, with no platform scope, still reads by key.
* **Several live subscriptions (the P-423 read of #2130):** the rule is a constraint, not a pick. `platform_subscription_one_live`, PF-3's partial unique index, allows one live row per firm. The test shows a second live row is refused and an ENDED row beside the live one is never read.

Rules: SA-3-4, SA-3-39, SA-3-43, SA-3-47 (through CS-C1's port), SA-3-58, SA-3-62, SA-4-56.

## Done when (part 2), `tests/check_pf15_cases.ts`
- [ ] `PF-15 DW8 pass/fail`: the 11th active individual case on a 10-case plan → 409 `PLAN_LIMIT_REACHED`; a closed case frees one; reopened counts again; corporate against corporate only.
- [ ] `PF-15 DW3 pass/fail` (all metrics): 8 staff to 3 seats → `{seats, 8, 3, reduce 5}` with the words; every metric over is listed; Unlimited never conflicts; at the limits → no conflict; unknown plan → 404; features note.
- [ ] `PF-15 DW9 pass/fail`:
  - a lowering takes effect at the firm's first renewal at least 30 days later (fake clock), stored;
  - before it the old limit applies, from it the new one, and existing items stay;
  - no downgrade check runs;
  - every firm reached gets an audit line and the notice;
  - 403 without the key, 422 for bad values, 409 for the same value; change rows are never changed;
  - a raise applies at once; seats follow the same rule;
  - it runs on the walled pool.
- [ ] Cross-firm definer: firm A's session asks about firm B → no firm, limit 0, refused, nothing written. Firm A still reads itself, and the case side reads by key.
- [ ] Several live subscriptions: a second live row is refused; an ENDED row is never read.

## Checks
(filled after review)

## Reviewer and breaker
(filled after review)

## Files outside the brief's touch list
* `platform.prisma`: two back-relation slot lines.
* `firm-scope.ts`: one `BYPASS_USES` line (`platform.entitlements.limit-change`).
* `check_pf12_walls.ts`: `LATER_CATALOGUES` gains `platform_limit_change`.
* `limit-changes.ts` is new under `entitlements/`, so it is inside the touch list.

Card: `api/src/platform/MODULE.md` updated (purpose, tables, tests).

Duplicate check: searched BACKLOG (PF-15, PF-16, PF-17, CS-C1), `design/lead-b-briefs/`, open PRs (#2130 part 1a; no part 1b PR or branch exists), main's code (`ports/case-count.ts` reused; no `checkDowngrade`, no limit-change code) and `qa/BUGS.md`; none.

On the demo: no screen, and nothing changes at :4400 (see question 1).
Cost: US$0 (live AI off).

## Questions
* **Question for the tech lead:**
  1. **The real case limit is not switched on in the app.** `Runtime.createCase` keeps CS-C1b's allow-all default. Binding `PgEntitlements` there fails closed: a case firm with no live platform plan could open no case. 91 suites open cases, and some may run on databases without the platform seed. I recommend one small follow-up item that binds it in `features/platform-entitlements.ts` with a full CI run. Do you want it in this PR instead?
  2. The P-423 read of the migration before the label.
  3. **Found by the breaker, outside this diff (Major):** a firm's own session (`xr_app`) can still insert a `platform_plan` row and point its own `platform_subscription` at it, for example a 10 000-seat plan. The same writable row lets it move `current_period_end`, or move its plan away and back to keep an old value. Those are PF-3/PF-12's tables, so I changed nothing there. This part caps the damage it can reach: the effective date is at most a month after the 30 days. I recommend a small item that revokes INSERT on `platform_plan`, and UPDATE of `plan_id`/`current_period_end`/`status` on `platform_subscription`, from the app's roles (sign-up and billing would write them through their own crossings). Which row should own it?
  4. Before PF-4s/PF-17 ships the change route, `staff-read/service.ts` (the staff page's "N of M seats") should read `PgEntitlements.limitOf`, not `platform_plan.seats_limit`. Otherwise Owners see a lowered seat count before their renewal. No route can lower a limit yet, so nothing is wrong today.
* **Questions for Lead B (row owner):**
  1. **Renewal date (Unconfirmed):** `platform_subscription` stores no billing period, and `current_period_end` is never written on main. The rule used is monthly renewals from `current_period_end`, else `trial_ends_at`, else `created_at`. Is that right until PF-16 writes the Stripe period? The effective date is also capped at a month after the 30 days, so a firm session that moves its own `current_period_end` far ahead can't keep an old value for ever. For a yearly plan, or a trial ending more than about 60 days after approval, that brings the lowering before the real renewal (review m10). It is the same monthly assumption.
  2. **Part 1b and DW3:** part 1a moved `checkDowngrade` to 1b. This part builds it over all four metrics, so 1b only books (DW3's booking, DW4, DW5) and calls it. OK?
  3. Our team's change has no second-person approval (SA-3's `system/plan:approve-change` request queue). That belongs to PF-17's console.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_018BSQJqz5RAhXrkx2ACq7qS
