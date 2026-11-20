# PF-15c break report: case limits bound in `Runtime.createCase`

Commit tested: `60d5fb9ac` on `claude/runtime-pf15c-bind-limits`. My own copy: `tools/isolated.sh pf15cbk 4594` (DB `xr_studio_pf15cbk`), stopped and dropped afterwards. Never :4400. Spec: `PF-15.md` "After part 2" on `origin/lead-b-front-office`. The item has no screen, so I looked only at the backend.
The setup was all SQL on my copy: a Sample plan `brk` (individual 6, corporate 2, storage Unlimited) on `sample-solo`. To get a corporate combination I moved `work_permits` under `corporate.temporary_residence`, so `wp.lmia_inside` counts as corporate. All openings went through `POST /api/runtime/cases` (user-S for the solo firm, user-O for sample-firm). The item's own check `tests/check_pf15c_case_limits.ts` passed 11/11 on my copy before I started. I made no model calls (US$0).

## Findings

### F1 Major: a subscription on PAYMENT_HOLD still opens cases
- **Did:** `update platform_subscription set status='PAYMENT_HOLD'` for sample-solo (individual limit Unlimited), then `POST /api/runtime/cases` as user-S.
- **Expected:** 409 `PLAN_LIMIT_REACHED` with the no-subscription sentence. The glossary says Payment Hold means "staff can only pay and download data" (requirements-2026-11-02 `99-Phasing-and-Glossary_v2.25`, line 113). The team's code treats payment hold the same as ended: SA-03 v2.24 changelog, `subscription-state.source.ts:29-46` maps "payment hold/ended to INACTIVE".
- **Actual:** 201, and a case was written. TRIAL and OVERDUE also give 201, which is right (trial = full use; 14 days of full access after a failed payment). PAYMENT_HOLD is the wrong one.
- **Where:** the limit read treats any status other than ENDED as live: `prisma/migrations/20261119051500_pf15_limit_changes/migration.sql:164` (`s.status <> 'ENDED'`). `noLivePlan` is set only when there is no plan code at all (`api/src/platform/entitlements/limits.ts:49`). DW3 checks only ENDED. A status of TRIAL whose `trial_ends_at` is in the past also counts as live; the glossary says the firm goes on hold that same day. That part depends on a hold job that main does not have yet.
- **Note:** if the Lead reads "no live plan" in the brief as "no subscription row" only, this is a scope question for the brief rather than a code bug. It is a money hole either way.

### F2 minor: the firm's own status is never read
- **Did:** set `platform_firm.status` to `PAYMENT_HOLD`, `SECURITY_LOCK`, `DELETED` and `ABANDONED` in turn, with the subscription left ACTIVE, and opened a case as user-S each time.
- **Expected:** refused. A locked, deleted or abandoned firm opens no case.
- **Actual:** 201 in all four cases. `platform_entitlement_limit` (same migration, lines 158-161) filters on the firm key only and ignores `platform_firm.status`.
- **Why minor:** the case route has no staff session and no other gate, so this is only safe while some lifecycle job keeps the subscription in step with the firm status. On main nothing does.

### F3 minor: the plan-limit 409 has no upgrade path
- **Did:** opened a 7th individual case on a 6-case plan.
- **Expected:** what `planLimitReached` gives seats and storage (`limits.ts:58-61`, "SA-3-5: the metric, the limit and the upgrade path"): an `upgradePath` field, or a sentence that names Settings, Billing.
- **Actual:** the body has `code`, `metric`, `limit` and `used`, but no `upgradePath`. The sentence (`api/src/runtime.ts:317`) says only "A case stops counting once every filing has a decision or it is withdrawn." Only the no-subscription sentence names Settings, Billing.
- **Note:** this body dates from CS-C1b, but PF-15c is the change that makes real customers see it.

## Outside this item (not findings, for the Lead)
- **Reopen skips the limit.** `CaseClose.reopen` (`api/src/case-close.ts:200-212`) sets a case back to OPEN without checking the limit and without taking the `case-open:<firm>` lock, so a reopen can push a firm over its limit. The brief's line 35 says only "a reopened one counts again"; `case-close.ts:9` leaves "the count and limit check" to part 2. I read the code; I did not exercise it, because reopen needs a staff session.
- **Untested:** what a lowered limit does once its effective date has passed. The app clock (`PlatformClock`) cannot be moved on a running copy, and that part belongs to PF-15 part 2.

## What held (each tried on the running copy)
- **Parallel openings at the limit.** 20 individual and 20 corporate openings fired at once with 2 individual slots and 1 corporate slot free: exactly 2 and 1 were 201, the other 37 got 409. Individual and corporate are counted separately.
- **Limit exact under load.** 100 parallel openings with 50 slots gave exactly 50 at 201. 300 with 150 slots gave exactly 150. 400 with room for all gave 400 at 201 in 18.6 s, with no 500s (slowest 15.5 s, still inside the 15 s transaction timeout plus the lock wait). 500 parallel openings at the limit were all 409. The copy's `api.log` holds no 5xx at all.
- **Idempotency at the last slot.** 10 openings with key K1 and 5 with key K2 were fired at once with one slot free. Result: one case for K1 (1 `created:true`, 9 `created:false`) and 5 × 409 for K2. A K1 retry at the limit gets its case back, not a 409. A K2 retry gets 409 PLAN_LIMIT_REACHED. K1 with a different body gets 409 "idempotency key was already used". The table holds one row for the two keys.
- **Same key in another firm.** sample-firm reusing solo's key gets its own new case. No 409 body shows another firm's data: `limit` and `used` are always the opener's own.
- **Plan limit rows.** No `ACTIVE_INDIVIDUAL_CASES` row means 409 with limit 0. A NULL value means Unlimited (201). A value of 0 means 409.
- **No live subscription.** An ENDED subscription, for individual or corporate, gives 409 with "Your firm has no live subscription…" and limit 0. Five refused openings changed none of these tables: `party`, `case_client`, `firm_case_counter`, `case_client_counter`, `audit_event`, `runtime_case`.
- **Firm key with no platform firm.** I renamed the platform firm's key through SQL with its trigger disabled. Opening gave 409 no-subscription, not a 500, and nothing was written.
- **Lowered limit still pending (part 2's rule).** A limit lowered from 217 to 5 kept 217 for the firm (effective 2027-01-19): 1 case opened, then 409 at 217. Raising it to 219 while the lowering was still pending applied at once. A subscription started after the lowering got the lowered value (1) straight away.
- **Plan withdrawn from sale.** With `platform_plan.active = false` the firm still opens up to its limit, which I take to be correct: a firm keeps the plan it is already on.
- **Case route and firm session.** No firm session reaches the case route: the platform guard sets a firm only on platform routes, and the web-address host only on public paths. So a firm's session cannot point the limit read at another firm.
- **Unbound Runtime.** It throws, as DW4 shows. I found no other running app that builds `Runtime` without `features/platform-entitlements.ts`. The suites that build their own Nest app (`check_csc1_count`, `check_csk1_client`) bind explicitly; `check_csc1_close`, `check_csc1s_view` and `check_pf23_observability` open no cases through their own Runtime.
