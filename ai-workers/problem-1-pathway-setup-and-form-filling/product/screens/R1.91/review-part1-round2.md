# R1.91 part 1: re-review round 2 (diff only), commit 805a01724d0fdf39cc72964ade9e3bc9a9f2bd88

Scope: `git diff e134f6ecd 805a01724 -- prototype/studio`, which covers `api/src/platform/billing/stripe-setup.ts`, `api/src/platform/billing/stripe.ts` (`ensurePortalConfiguration` now pages), `tests/journeys/stripe-relay.ts` and `tests/check_pf16_stripe_setup.ts`. Paths below are from `prototype/studio`. This is money code with no screen. Round-1 findings come from `review-part1.md` (reviewer, Majors 1-2) and `break-report-part1.md` (breaker, M1-M3).

## What I ran (this session, no network to Stripe)
* `check_pf16_stripe_setup.ts`: **60 passed, 0 failed**. The live line is SKIPPED by name.
* `check_pf5_signup_billing.ts`: **107 passed, 0 failed**. The `ensurePortalConfiguration` paging change does not break the portal hand-off.
* `typecheck.mjs` with a 12 GB heap: api has 15 known errors and 0 new ones; web has 0. Result: **PASS, no new type errors**.
* I walked the command lines:
  * `--dry-run=1` is refused with exit 2.
  * `PLATFORM_ENVIRONMENT=production` is refused with exit 2.
  * An unreachable database gives exit 1 and one plain line ("failed — Can't reach database server … platform_plan not written …"), with no stack.
  * The relay with no URL is refused with exit 2 and prints its usage.
* Mutations: I removed one fix at a time, ran the check, then restored it with `git checkout`. The tree is clean afterwards. The one untracked file, `break-report-part1-round2.md`, is the breaker's, not mine.

## Round-1 Majors

| Round-1 finding | Status | Evidence | A test fails when the fix is removed? |
|---|---|---|---|
| Reviewer Major 1 = breaker M1: `stop()` does not stop | **Fixed** | There is now a state machine (`idle`/`polling`/`stopped`, stripe-relay.ts:46). `tick` re-arms only while `polling` (:93). `stop()` clears the timer before and after its last pass (:101-107). `start()` is idempotent and does nothing after `stop` (:89). | **Yes, for the fix as a whole.** If I remove both the guard (:93) and the second clear (:106), 2 FAILs: "no list call in the next 300 ms" `{"before":1,"after":15}` and "start after stop does nothing". If I remove the idempotent `start` check (:89), 2 FAILs: "three times runs one loop" `{"loops":14}`. If I remove only the guard, all 60 still pass: see Minor N1. |
| Reviewer Major 2: the conflict check is incomplete (tax, interval, count, type, plan) | **Fixed** | `priceProblems` (stripe-setup.ts:53-67) checks archived, amount, currency, `type`/`recurring`, interval, `interval_count`, `usage_type`, `tax_behavior !== "exclusive"` and `metadata.xr_plan`. A made price is read back through the same function (:115-116). There is one failing case per leg (test:143-156), and a matching-price pass beside them (:157-158). | **Yes.** Removing the tax leg (:64) gives 2 FAILs (inclusive, unspecified). Removing the interval leg (:60) gives 1 FAIL ("every year under the monthly key"). |
| Breaker M2: a webhook that hangs makes the relay, `waitFor` and `stop` hang | **Fixed** | Each POST has its own `AbortController` timer, default 10 s (stripe-relay.ts:73-78). `waitFor` races each pass against its remaining time (:119). `stop` is bounded by `withinMs` (:105). Tests: test:273-285, with a hanging webhook that honours abort and one that ignores it. | **Yes.** Removing the POST signal, the `waitFor` bound or the `stop` bound each makes the check hang on that line. Node then exits **13** ("unsettled top-level await" at test:278 / :281 / :283): red, though not a named FAIL. |
| Breaker M3: an archived price under our key is not a conflict, and its id is written as "made" | **Fixed** | `prices.list` no longer filters on `active` (stripe-setup.ts:86), and `!p.active` is a conflict (:55). The fake now keeps the lookup key on archived prices and lists both kinds when `active` is not sent (test:63, :72). | **Yes.** Removing `!p.active` gives 1 FAIL ("archived … is named"). Restoring round-1's `active: true` makes the check crash red on Stripe's "already uses that lookup key". |

No Major from round 1 is open.

## Round-1 Minors addressed in this diff (checked, with tests)
* Reviewer 3 / breaker m1 / m2, one product per plan: products are taken from all found prices first, then from `metadata.xr_plan` (:98-103). Tests at test:160-169.
* Reviewer 5, the fake's idempotency: a key used again with other parameters gives 400, `after24h()` forgets keys, and lists page with `has_more`.
* Reviewer 6 / breaker m8, stale price ids: an unpriced period is cleared to null (`priceColumns`, :129-133). This is a database test at test:204-206. `webhook.ts` does not read these columns, so existing subscribers are not affected. Signup and plan-change read them, and clearing is the intent.
* Reviewer 7 / breaker m4, the portal configuration: it is read back and compared (`portalProblems`). A conflict blocks the platform_plan write (:142; test:188-192, :214-216). The list now pages past the first page (stripe.ts:25; test:181-187).
* Reviewer 9 / breaker m5, unbounded retries: retries are capped by `maxAttempts` and `failures` is capped at 100. Reviewer 10: there is an `only` filter. Reviewer 11: the `waitFor` doc now says "accepted, not yet handled".
* Reviewer 12, raw stacks: errors are now one line (test:117). Reviewer 13: there is a `TAX_LINE` checklist line.
* Breaker m6, relay arguments: `relayArgs` refuses bad input. Breaker m7: `cliArgs` refuses unknown flags. Breaker m8, in part: production is refused and the key's source is printed. Breaker m9: the comment is corrected.

## New findings (in the diff)

**Blocker:** none. **Major:** none.

**Minor**
* **N1. The re-arm guard alone has no test** (stripe-relay.ts:93).
  * Deleting `if (this.state === "polling")` keeps all 60 lines green. In the tested case, the second `clearTimeout` in `stop()` (:106) catches the re-armed timer, because `tick`'s continuation runs before `stop`'s.
  * The case the guard alone covers is a pass that outlasts `stop`'s bound and then resumes. That happens when a POST is slower than `withinMs`, for example a 10 s post limit against a shorter bound. In a scratch probe, `stop(100)` was called while a POST was held, then the POST was released. With the guard there were 0 lists afterwards. Without the guard there was 1 list and the loop re-armed.
  * Add one line for that case, so the guard is covered by its own test (STANDARDS [M]).
* **N2. `stop()`'s "one last pass" is not always a new pass** (stripe-relay.ts:99-105).
  * When a pass is running, `poll()` hands `stop` that same pass. Its list call was made before the stop, so an event made after that list is not delivered.
  * The comment ("so an event made just before the stop is still delivered") holds only when no pass is running.
  * Low effect, because a walk `waitFor`s its events before `stop`. Either word the comment exactly, or run one more pass after the shared one.
* **N3. A give-up is invisible to `waitFor`** (stripe-relay.ts:81, :112-121).
  * Network errors and time-outs count as attempts. With the defaults, an event the copy could not take for about 10 s (5 polls × 2 s, for example a restart) is given up for good.
  * A `waitFor` for it then waits out its full time-out and reports "no … delivered" rather than "given up after 5 attempts". Fail early with the give-up reason.
* **N4. A dry run does not read the portal configuration** (stripe-setup.ts:93-96).
  * `--dry-run` returns `portal.problems: []`, so a drifted portal configuration shows only on the full run. By then the prices have been made, because `ensurePortalConfiguration` runs after them (:119).
  * Nothing wrong is written, because :142 blocks the platform_plan write. But the dry run, which is meant to show what would happen, misses one of the two conflict kinds. Read the portal configuration (without making it) in the dry run.
* **Carried (round 1, not addressed; acceptable as Minors):**
  * The script still does not print the Stripe account id (breaker m8).
  * A database URL that points at production while `PLATFORM_ENVIRONMENT` is not `production` is still not detected (breaker m8).
  * Same-second events are ordered by id (reviewer 14, nit).
  * Whether an archived price keeps its lookup key is still unconfirmed against live Stripe. Either way, the new code takes the safe side: a conflict, nothing written.

## Journey score
This round has no screen and no new operator journey. The round-1 journey report (`journey-test-reviewer-2026-11-25.md`, **8/10**) stands. In this round I walked the diff's operator paths (mistyped flag, production, unreachable database, relay with no URL), and each now ends in one plain line with the right exit code. That clears round-1's "raw stack" gap for those paths, so the score does not drop. I did not run a new full journey test for a diff-only round.

## Could not check
I had no network access to Stripe, so the live line was SKIPPED. That leaves two things unconfirmed against test mode:
* whether Stripe lists archived prices when `active` is not sent (Stripe's documentation says it does);
* whether lookup keys are unique across archived prices.

Verdict: Approve 805a01724d0fdf39cc72964ade9e3bc9a9f2bd88
