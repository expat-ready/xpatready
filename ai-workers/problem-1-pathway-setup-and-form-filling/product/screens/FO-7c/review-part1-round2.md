# Review round 2: FO-7c part 1, the firm's payment account on a fake rail (PR #2938)

Reviewer: Opus 5.5, a fresh context that did not build it. **Commit reviewed: `2766ef4f06b5e55c65adab61197e9fe80d286e33`** (branch `claude/dazzling-thompson-1ndong`).
Scope: **only** `git diff 786d1a323..2766ef4f0` (9 files, +272/-30), judged against round 1 (`review-part1.md`), the breaker's `break-report-part1.md` and Lead B's rulings on #2938 (treated as approved scope). Breaker m3 (pool pressure) is ruled to part 2 and is not counted.
**No screen in this part.** D1–D20, the BIC table and the journey test are N/A. **Journey score: no screen in this part** (no journey report written).

## What I ran (never :4400; the working tree untouched, HEAD = the commit above)
* `check_fo7c_card_payments.ts` (from `prototype/`): **exit 0, 42 passed, 0 failed** (34 in round 1).
* `check_pf28_inputs.ts` on an isolated copy of the commit (`git archive`, :4433, `PLATFORM_IDENTITY=local`, started and stopped in one command): **43/43, exit 0**.
* `check_forms_qa53.ts` on its own isolated copy (:4434, same pattern): **41 passed, 2 failed, exit 1**.
  * QA-65 "every other write names its person" passes (`[]`).
  * The PF-5 door probe lists `/api/hooks/stripe-connect 503` on an empty body.
  * The 2 FAILs are "the demo loads — 500" and the reads that follow from it. The cause is `ENOENT` on the sample inputs, which are not in a `git archive` copy. Round 1 saw the same failures, and they are not from this diff.
* `check_pf24_secrets.ts` 84/84 and `check_pf24w_environment.ts` 28/28, both exit 0 (their own copies on their default ports).
* CI on this head (REST): `pr-rules`, `module-cards`, `guard`, `review-rounds` and `outside-wave` succeed. The full check has not run: the PR is still a draft.
* Mutations, in a scratch copy only:
  * Caught (the suite fails or exits non-zero):
    * `afterBreak` always false
    * dispatch called inside the transaction
    * the 503 names the setting again
    * `broke = isBroken(next)` (round 1 Minor 1's survivor)
    * only the last `v1` counts
    * a firm lookup before the signature
  * Survived: none.
* Probes: `scratchpad/r2/probe.ts` (fake vs Stripe 23.1.0 header reading), and one inserted case in a scratch copy of the suite (second break email). Both scratch databases are dropped.

## Round 1 findings
| # | Finding | Status | Evidence |
|---|---|---|---|
| Major 1 | PF-28 sweep fails on the new door | **Resolved** | `check_pf28_inputs.ts:68` gets one `HOOK` entry and nothing else changed. Lead B's condition holds in `check_fo7c_card_payments.ts`, all over HTTP: signature **fail** at :144 (unsigned, forged, 6 min old → 400, nothing stored, no lookup); signature **pass** (signed events → 200, e.g. :149 and DW2); schema **fail** at :145-147 (a signed non-event and a signed non-JSON body → 400 `NOT_AN_EVENT`, nothing stored, no lookup); schema **pass** (signed envelopes handled and stored once in DW2). Suite 43/43. |
| Major 2 | QA-65 fails on the new public write | **Resolved** | `check_forms_qa53.ts:68` gets one `PUBLIC_DOOR_WRITES` entry and nothing else changed. QA-65 passes, and the door answers 503 to an empty body (never a 2xx). |
| Minor 1 | Failed then Disconnected (same break) untested | **Resolved** | New case through the outbox path. The survivor mutation is now caught. |
| Minor 2 | Owner-only key proven only against a Case Officer | **Resolved** | ADMIN + BILLING_FINANCE person → 403 on both routes, no account (:127-130). |
| Minor 3 | payouts-on, charges-off read untested | **Resolved** | `stateFrom(P, {charges off, payouts on})` stays PENDING (:64). |
| Minor 4 | Alert clears on starting re-onboarding | **Resolved** (Lead B: the strict reading) | `account.ts:83` writes `detail.afterBreak`. `view` (:98-102) keeps the alert while PENDING after a disconnect. Tests: it stays (:179-180) and it clears on charges enabled (m1 block). Restarting the hosted sign-up while PENDING writes no new audit line (:76), so abandoning and retrying keeps the alert. The mutation is caught. |
| Minor 5 | No proof of "no lookup on a bad signature" | **Resolved** | `lookups` counter (:144, :147). The mutation is caught. |
| Minor 6 | Fake lists by paid time | **Resolved** for the listing (`rail.ts:98-99`, by `created`). Widening `RailEvent` stays with part 2, as round 1 said. |
| Minor 7 | PR body | **Resolved** | `pr-rules` and `module-cards` succeed. The "No migration yet" line is gone. |
| Breaker m1 | Email sent for a rolled-back break | **Resolved** | `mailReady` runs before the lock, `mailIn` inside the transaction, and dispatch after commit (`account.ts:124-137`, `:169`). The suite tests it with the real `MessagesMail`: rollback gives written 1, dispatched 0, no receipt; the retry gives one email per Owner after commit. The dispatch-inside mutation is caught. |
| Breaker m2 | Same as Minor 4 | **Resolved** | See Minor 4. |
| Breaker m4 | Fake reads the header unlike Stripe | **Partly resolved** | Any matching `v1` now passes on both rails and is tested. The other differences remain: see New Minor 2. |
| Lead B | Plain-words 503, setting names to the log only | **Done** | `account.ts:59-63`. Tested (:206). The mutation is caught. |
| Lead B | Connect secret `opt(...)` and the PF-24 `generated()` line | **Done** | `settings.ts:44`, `check_pf24_secrets.ts:35`. Both PF-24 suites are green. |

## New findings

### Blocker
None.

### Major
None.

### Minor
1. **A second break email while the alert still says the first break is open.**
   * Since Lead B's ruling, `view` treats a re-onboarded PENDING account as still broken (`account.ts:98-102`). `apply` still decides a new break by the row alone: `broke = isBroken(next) && !isBroken(prev)` (`account.ts:153`), and PENDING is not broken.
   * Probe (scratch copy, after the suite's Failed → Disconnected step):
     1. The Owner re-onboards. GET shows `alert: PAYMENT_ACCOUNT_DISCONNECTED`.
     2. The half-made account is deauthorized.
   * Result: emails written 3→5, dispatched 2→4, `payment_account.broke` lines 3→4. Each Owner gets a second "Payment account disconnected" email and home item for a firm that never reconnected.
   * AG-16-16 rule 3: "Never repeat the email for the same break".
   * Money is safe and the case is narrow. Lead B should say whether this counts as the same break. If it does, read the same `afterBreak` line in `apply` for a PENDING `prev`, with a fail case.
2. **The fake's header reading is still not "as Stripe's library reads the header"** (tests only; no production effect).
   * The comment at `rail.ts:105-106` claims it does, and `check_fo7c_card_payments.ts:54-56` pins one of the differences.
   * Probe against `stripe` 23.1.0 (`Webhooks.js` `parseHeader` uses `parseInt` and the last `t`; the tolerance check is on age only):

     | Header | Fake | Stripe |
     |---|---|---|
     | `t=<t>.0,v1=<valid>` | refuses | **accepts** (the suite asserts the fake refuses it, on the fake only) |
     | timestamp 10 min ahead | refuses | **accepts** |
     | `t=1,t=<t>,v1=<valid>` | refuses | **accepts** |
     | `t=<t>,t=1,v1=<valid>` | accepts | refuses |
     | `" t=<t>"` (leading space) | accepts | refuses |

   * Fix: either match `parseHeader` (last `t`, `parseInt`, no trim, age-only tolerance), or correct the comment and the test's name so they claim only the multiple-`v1` rule.
3. **Words in the test files.**
   * `check_pf28_inputs.ts:67` still says "Only this one door: any other webhook route is judged like every door". There are now two doors.
   * `check_fo7c_card_payments.ts:89` carries the old comment pasted twice on one line.

### Not counted (observation)
* `view` reads the latest `onboarding_started` line through the `(firm_id, at)` index, filtered by action. That is one query per GET, and only while PENDING. For a firm that stays PENDING a long time with heavy activity, it walks the firm's audit lines back to that onboarding. This is acceptable for part 1, and worth knowing if GET appears on the pay page's path in part 2.

## Not checked
* A real Stripe call (step 0 still with the founder, R1.57).
* The full CI matrix: the PR is a draft, so only the guard jobs ran.
* `check_forms_qa53.ts`'s demo-load reads on a copy that has the sample inputs (they fail only in an archive copy, as in round 1).

**Verdict: Approve.** No open Blocker or Major at `2766ef4f06b5e55c65adab61197e9fe80d286e33`. New Minors 1-3 can be fixed in a follow-up. Minor 1 needs Lead B's call first.

Reviewer: Approve 2766ef4f06b5e55c65adab61197e9fe80d286e33
