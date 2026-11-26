# PF-27 part 3a: review, round 4 (diff only; last round)

PR #3697, branch `claude/runtime-pf27-lock`, head **bf7d190e0234f84490b6efccb114c1f9326a8377**. The code is 9f2a04b; bf7d190 adds only `review-round3.md`.
**Scope:** `git diff bfa78fd 9f2a04b`: `firm-lock/service.ts`, `identity/service.ts`, `tests/check_pf27_lock.ts`.
**Setup:** a clean `git archive bf7d190` copy in my own scratchpad folder, with `npm ci` and `prisma generate` run inside it. Postgres 127.0.0.1:54329, on scratch databases dropped afterwards. Isolated copies ran on runtime ports **:4436** and **:4437** and were stopped. I did not use :4400, made no Stripe call and no model call (US$0). Probe script: `tests/probe_rv4.ts` in the copy, not committed.

## Verdict on bf7d190e0234f84490b6efccb114c1f9326a8377: **Approve** (Ship; no open Blocker or Major)

Both round 3 Majors are fixed, and each fix has a test that fails when the fix is removed. I found no new Blocker or Major. Three new Minors and the carried Minors are listed below for a follow-up row. None of them leaves a session alive or a firm unlocked.

## Round 3 Majors: resolved (evidence)

* **M1, a sign-in in flight as the lock commits.** `recordSignIn` now re-reads the firm status after it takes the staff row FOR UPDATE (`identity/service.ts:180-181`). Both callers map `"locked"` to 401 FIRM_LOCKED (`:151`, `:217`).
  * **Semantics.** The database default is `read committed` (`show default_transaction_isolation`), and `recordSignIn` sets no isolation level. So the plain read takes a new snapshot after the row wait.
    * If the lock got the staff row first, the sign-in waits until the lock commits, then sees SECURITY_LOCK.
    * If the sign-in got the row first, the lock's FOR UPDATE waits for it and then reads the new `last_sign_in_at`. The revocation is then dated at least the sign-in's time, so that token is dead.
  * The read takes no lock, so it adds no wait and no lock-order edge.
* **M2, a session started during the lock.** The lift now writes one revocation per staff member under the same id-ordered row lock (`firm-lock/service.ts:78-80`). The audit line counts them in `staffSessionsEnded`, and the stale header is fixed.
* **Builder's suite:** `check_pf27_lock` passed **28/0** on 3 runs.
* **Mutations I ran myself** (`check_pf27_lock`):
  * Re-check removed: **27/1**. The M1 loop failed with `[200,200,null]` in all 5 rounds.
  * Lift revocations removed: **27/1** (M2 line).
  * Both removed: **26/2**.
  * The lock's staff `FOR UPDATE` removed: **27/1** (M1 loop). Half of round 3's m1 is now covered.
* **My probe** (`probe_rv4.ts`, 2 runs, 7/7 each). Every wait in it was confirmed in `pg_stat_activity`, not timed with a sleep.
  * **P1, Cognito branch, lock in flight**, x5: the first request of a new session waits on the staff row while the lock commits. It got **401 FIRM_LOCKED**, and 401 after the lift, in 5/5.
  * **P2, Cognito `auth_time` inside the lock** (a hosted-page sign-in): FIRM_LOCKED during the lock, **401 SESSION_REVOKED after the lift**, and a fresh sign-in after the lift got 200.
  * **P4, the lift's transaction held open:** a stand-in sign-in and a Cognito first request each answered 401 FIRM_LOCKED in under 500 ms. The door and the guard read SECURITY_LOCK before `recordSignIn`, so nothing waits on the lift's row lock.
  * **P5, two lifts at once**, x20: one 200 and one 409 each time, and exactly one revocation per staff member.
  * **P6, lock then lift back to back** against 3 sign-ins and a Cognito first request, x30: no token dated at or before the lift's revocation worked afterwards.
  * **Across P1-P6:** **0 5xx and 0 deadlocks** (`pg_stat_database.deadlocks` unchanged).

## Probe answers

* **(a) Deadlock, 5xx or blocked sign-ins:** none. The re-check is lock-free. The lift's new staff-row locks follow the lock's order (billing advisory lock, firm FOR NO KEY UPDATE, staff in id order).
  * **Close and webhook:** serialised on `plat_billing:<firm>`.
  * **Staff changes (`inFirm`):** serialised on the firm row. They cannot overlap a lift anyway, because the guard refuses a locked firm's staff before `inFirm`.
  * **Sign-ins during a lift:** refused at the door before they reach the staff row (P4).
  * **On an unlocked firm,** the cost is one indexed read per recorded sign-in.
* **(b) A session that survives a lock or a lift:** none found.
  * **Cognito refresh:** a refreshed token keeps its `auth_time`, which is at or before one of the two revocations.
  * **Hosted page during the lock:** P2.
  * **Sign-in behind the lift's row lock:** cannot happen (P4).
  * **Two lifts:** P5.
  * **Only token issuer:** `localSignIn` is the only place that issues firm-staff tokens (`port.issue` grep).
  * **Residual, not a finding:** the revocation uses the server clock and `auth_time` uses Cognito's. A hosted sign-in inside the clock-skew window just before a lift would survive it. Lock and deactivation have always had the same property.
* **(c) Cognito rewrite:** it behaves the same as before except for `"locked"`. The old `&&` chain returned only on `"inactive"`, and the new block does the same plus `"locked"`. **DELETED does give the wrong code:** see m-a. That is acceptable as a Minor. Before this diff the same race returned a 200 token, which then got FIRM_CLOSED.
* **(d) Other suites on this head:**
  * `check_pf4r_lockout_race` **7/7** (:4436, real main.ts).
  * `check_pf4_identity` **120/120** (:4437).
  * `check_pf4s_system_signin` **104/104**.
  * `check_pf11c_close` **47/0**.
  * `check_bypass_uses` **52/0**.
  * `typecheck.mjs`: web 0 errors. api has no error in the diff's files; its only 2 new errors are in `p2/runner.ts`, because `@anthropic-ai/sdk` is not installed in my copy (environment, not this diff).
  * Nothing else reads `platform.firm.unlocked`, its `detail`, or the revocation reasons (grep).
  * Browser suites: **not run.** The proxy refuses the Playwright browser download (`cdn.playwright.dev`, 403). For an unlocked firm the diff only adds a read, so I expect no change there; CI runs them.
* **(e) Carried Minors:** still acceptable as carried (none affects sessions or money). Round 3's m2 (stale header) is fixed. Round 3's m1 is half fixed: see m-c.

## Findings (ranked)

| # | Sev | Finding | Evidence | Fix |
|---|---|---|---|---|
| m-a | Minor | **A sign-in racing PF-11c's close is told the account is *locked*.** `recordSignIn` returns `"locked"` for DELETED too (`identity/service.ts:181`), and both callers send FIRM_LOCKED: "…ExpatReady will contact the firm's Owner". The account is closed, not locked. | P3: a close-shaped transaction (billing lock, firm FOR UPDATE, DELETED, revocations) is held while a stand-in sign-in waits. **3/3 got 401 FIRM_LOCKED.** | Return the status, or a separate `"closed"`, and map DELETED to FIRM_CLOSED at `:151` and `:217`. |
| m-b | Minor | **A refused Cognito session from inside the lock still writes a "signed in" line.** On its first request after the lift, the guard records the sign-in before it checks revocations (`:148-153`). It writes `platform.staff.sign_in` and moves `last_sign_in_at` to a time inside the lock, then refuses with SESSION_REVOKED. The firm's staff list and trail then show a sign-in during the lock (SA-2-34: no staff login meanwhile). This ordering was already on main and is now reachable from the lock. | P2 note: 1 sign_in line; `last_sign_in_at` 10:00:41 → 10:10:50 (a time inside the lock). | In the Cognito branch, skip `recordSignIn` when `authMs` is at or before the newest revocation. Or return `null` from inside `recordSignIn` in that case. |
| m-c | Minor | **Round 3's m1, half carried: the revocation's `max(now, last_sign_in_at)` still has no failing test.** With `new Date(now)`, `check_pf27_lock` stays **28/0**. | Mutation run | Round 3's P2: three sign-ins in one frozen millisecond, lock, lift; the newest token must be 401. |
| m-d | Minor | **The M1 loop waits with fixed sleeps (150/300 ms)** (`check_pf27_lock.ts:187-193`). On a slow runner the sign-in could reach the door after the lock commits and pass through the door's check, without testing the re-check. Both paths give FIRM_LOCKED. | Read. It failed 5/5 with the re-check removed here. | Wait on `pg_stat_activity` (a `Lock` wait count) instead of sleeping, as `probe_rv4.ts` does. |
| m3–m6 + breaker m2 | Minor | **Carried, unchanged:** the lift's fixed `firm.payment_hold` reason text; the strict-body test does not check the REFUSED line; refusals write no `platform.bypass` line; the invitation GET says VALID for a locked firm while `callback` uses up the code before refusing; an unknown email on a locked firm's door gets FIRM_LOCKED. | Round 3 review and break report | As written there. |

**Notes, not findings:** Cognito sign-ins made in the same second as a lift are refused once with "Sign in again" (whole-second `auth_time`, P7; deactivation has always behaved this way). The re-check depends on READ COMMITTED; the comment at `:177-179` could say so. The close's deadlock with sign-ins (on main) stays with the tech lead, as in round 3.

## Journey score (reviewer role; the one score for this check): **8.75 / 10** (7 of the 8 criteria that apply)

Part 3a is API only, with no screen, so I walked these as API journeys: main (lock; staff get 401 in plain words; lift; everyone signs in again); wrong role, error and boundary as in round 3, suite green; recovery P1-P6.

| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | Lock and lift 200; billing's status or the prior status restored |
| Next step obvious | 1 | 409s say "Nothing was changed"; after the lift, "Sign in again" |
| Plain words | 1 | FIRM_LOCKED sentence; the reason is never shown to the firm |
| Feedback and state | ½ | The M1 race now says locked. m-a: a closed firm's racing sign-in is told "locked" |
| Correct data | ½ | No token survives (fixed). m-b: a trail line and last sign-in inside the lock; carried reason text |
| Error recovery | 1 | Refusals change nothing; REFUSED line on our console |
| Accessibility and screen sizes | N/A | No screen in part 3a |
| Speed | 1 | Lock and lift 17-27 ms in the suite log; P4 refusals under 500 ms while a lift is held open |
| Visual quality | N/A | No screen |
| Trust and sources | 1 | Sample labels; one firm line, one event and one console line per change |

The score is the same as round 3, but the two ½ scores are now for Minors, not for the Majors. Fixing m-a and m-b would raise both.

## Could not check

* **No real Cognito pool.** The Cognito branch was driven by a stand-in port that returns `via: "cognito"`. Refresh and clock skew come from reading the code.
* **Browser suites:** the proxy blocks the browser download.
* **Close:** the close race used PF-11c's statements in a held transaction, not the job.
* **Not applicable:** D1–D20, the BIC table and the graph do not apply to a diff-only round of an API part with no screen. No intended user walked it (D17/D20 stay with the founder).

Reviewer: Approve bf7d190e0234f84490b6efccb114c1f9326a8377
