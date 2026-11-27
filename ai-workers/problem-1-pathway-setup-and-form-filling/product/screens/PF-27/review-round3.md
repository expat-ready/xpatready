# PF-27 part 3a: review, round 3 (diff only, merge head)

PR #3697, branch `claude/runtime-pf27-lock`, head **bfa78fd23c87505cffa528890e243d0c0ade41ab**: ceb74af's round 2 fix plus a merge of main with no conflicts. The PR diff is unchanged (12 files, +408/-2).
**Scope:** `git diff 91c42cf ceb74af`, plus whatever the merge of main could change in the lock's paths.
**Setup:** a clean `git archive` copy in the session scratchpad, with `npm ci` and `prisma generate` run inside it. Postgres 127.0.0.1:54329, on scratch databases that were dropped afterwards. The full app ran on runtime port **:4435** and was stopped afterwards. I did not use :4400, made no Stripe call and no model call (US$0).
**Not read:** the checkout in the main copy. It holds uncommitted builder edits made after this head, which this review does not cover.

## Verdict on bfa78fd23c87505cffa528890e243d0c0ade41ab: **Changes** (Ship after fixes; not Approve: two open Majors)

The round 2 Major (lock vs sign-in deadlock) is fixed, tested, and the test is real. Two Majors remain, both on sessions. In each, a session that did not start after the lift becomes live again when the lock is lifted. The breaker's round 3 report (`break-report-round3.md`) has the same two, found separately; I reproduced both myself.

## Round 2 Major: resolved (evidence)

* **Code** (`firm-lock/service.ts:55-78`): `plat_billing:<firm>` first, then the firm row FOR NO KEY UPDATE, then the staff rows FOR UPDATE in id order, then revocations at `max(now, last_sign_in_at)`. This is the same order as `inFirm` and `endSessions`. A sign-in (staff row FOR UPDATE, then key-share on the firm) no longer closes a cycle.
* **The test fails when the rule is removed.** With the firm row put back to `FOR UPDATE`, `check_pf27_lock` failed on all 3 runs (25/1, with 20, 18 and 22 5xx in 12 rounds). As built: **26/0**.
* **Race probe** (`tests/probe_r3.ts` in the copy): all of these gave **0 5xx and 0 deadlocks** (`pg_stat_database.deadlocks` unchanged).
  * Lock vs 4 sign-ins of a three-person firm, x100 (half with the clock frozen).
  * Lift vs 3 sign-ins, x50.
  * Lock vs Owner deactivating a person vs sign-ins, x30.
* **Lock vs close:** the close is a tx shaped like `closure.ts:109-121` (billing lock, firm FOR UPDATE, DELETED, revocations). Over x30 it serialised every time: 15× close won (lock 409 NOT_LOCKABLE) and 15× lock won (close saw the change). Never both.
* **Lock vs Stripe:** the webhook is a tx shaped like `webhook.ts:138-156` (billing lock, plain firm read, a wait, subscription to hold, firm move per FIRM_MOVES). Over x30, the lock held every time and the lift landed on billing's PAYMENT_HOLD. The probe used the webhook's statements, not the job.
* **Two locks at once**, x30: exactly one 200 and one 409. Lock vs lift at once: never a 5xx. FOR NO KEY UPDATE still conflicts with itself and with the close's FOR UPDATE, and the billing advisory lock comes first in all three.
* **Pre-lock tokens:** every token signed in before a lock was **401 after the lift** (400 tokens, P1b). This includes the frozen-clock case, where the newest token is dated ahead of the clock (P2).
* **Other suites on this head:** `check_pf11c_close` 47/0 and `check_bypass_uses` 52/0.

## The merge of main

* **Lock paths untouched by the merge.** `git diff ceb74af bfa78fd` is empty for `billing/` (webhook.ts, FIRM_OF), `identity/` (service and session), `firm-closure/`, `firm-scope.ts`, `audit/`, `system-identity/`, `firm-lock/` and `ports/events/`.
* **Every route that takes a staff token refuses the locked one.** Method: full app, firm `sample-firm` locked, all 856 registered routes dumped (system and Stripe hook routes left out). GET was tried everywhere; every method was tried on `/api/platform|front-office`.
  * **288 routes answered 401 FIRM_LOCKED.** These include main's new routes: imports, `files/uploads`, `find`, `front-office/me/video`, signing, money statement, write-off and credit notes, lead and prospect notes and timelines, and runtime case and client notes and timeline.
  * The other 168 answer the locked token exactly as they answer a valid token of the unlocked firm (`sample-solo`): 0 differences. They are config, demo and link-plane routes that never take the staff bearer.
  * Control: the other firm's `me` gave 200.
  * Only `guard.ts:108` verifies a staff token. The two sign-in doors (`session/local`, `session/callback`) both reach `localSignIn`'s firm check.

## Findings (ranked)

| # | Sev | Finding | Evidence | Fix |
|---|---|---|---|---|
| M1 | **Major** | **A sign-in racing the lock gets a 200 token that comes back to life after the lift.** `localSignIn` reads the firm status (`identity/service.ts:199`) before `recordSignIn`, outside any lock. `recordSignIn` re-checks only the person's status (`:173`), then dates the session `max(now, last+1, revoked+1)` (`:207`), which is after the lock's revocation. The round 2 comment ("a sign-in in progress is seen ... no session started before the lock lives on", `firm-lock/service.ts:73-74`) does not hold. This is J-5 B2's shape: a lift plays the part of a reactivation. | P1b: **5, 7 and 8 of 400** raced 200 tokens answered 200 on `me` after the lift (three runs). During the lock they get 401 FIRM_LOCKED, so the person also saw a successful sign-in to a locked firm. | Under the staff row lock in `recordSignIn`, re-read the firm status with a plain read (no firm row lock, so J-5 B1's order is kept). Return a distinct `"locked"`, mapped to FIRM_LOCKED (or FIRM_CLOSED) on both the stand-in and Cognito paths. **Verified in the copy:** P1b dropped to **0** leaks, no 5xx and no deadlock, and `check_pf27_lock` stayed 26/0. Add a timing loop like P1 that asserts no raced 200 token works after the lift. |
| M2 | **Major** | **A session the identity provider started during the lock is live after the lift.** On Cognito, `authenticateIn` refuses with FIRM_LOCKED during the lock (`:144`). After the lift, `auth_time` is later than the lock's revocation, so `recordSignIn` takes it as a new sign-in (`:148-149`). A refreshed token keeps its `auth_time`, so this session lasts for the refresh token's life, not one hour. SA-2-34: the lock ends every staff session and no staff sign-in is possible meanwhile. The lift writes no revocation (`firm-lock/service.ts:101-113`). | `tests/probe_r3b.ts`: lock, clock +10 min, `firmLocal.issue(user-S, { authTimeMs: now })`. Result: during the lock **401 FIRM_LOCKED**; after the lift **200**. | In the lift's `record`, write one revocation per staff member too, under the same staff row lock in id order, dated `max(now, last_sign_in_at)` (reason e.g. `firm security lock lifted`). Everyone then signs in again after a lift. M1's fix is still needed, so that a racing sign-in gets FIRM_LOCKED instead of a 200. Test: the probe above, asserting 401 after the lift. |
| m1 | Minor | **Two round 2 rules have no failing test.** If `Math.max(now, last)` is replaced by `now`, or the staff `FOR UPDATE` is removed, `check_pf27_lock` stays **26/0** (both mutations run). | `firm-lock/service.ts:75-77` | Add P2: three sign-ins in one frozen millisecond, lock, lift, newest token 401. M1's loop covers the row lock. |
| m2 | Minor | The header still says "the firm row FOR UPDATE" (`firm-lock/service.ts:15-16`) and "from PROVISIONING" (`:4`), though PROVISIONING gets 409. | read | Update the comment. |
| m3–m6 | Minor | **Carried from rounds 1 and 2** (diff unchanged, still open): the lift's fixed `firm.payment_hold` reason text; the strict-body test does not check the REFUSED line; refusals write no `platform.bypass` line (`touchFirm` is rolled back with the tx); `GET /api/public/invitations/:token` says VALID for a locked firm, while `accept` answers 410. | PR comments 7155854279, 7156152204 | As written there. |

**Pre-existing on main, not this PR (for the tech lead or a qa bug row; not counted in the verdict).** PF-11c's close (`closure.ts:110-121`: firm FOR UPDATE, then revocations taking key-share on staff rows) has the deadlock with sign-ins that this PR removed from the lock. A tx shaped like the close, racing 3 sign-ins, x20, gave **42 deadlocks, 17 close transactions failed, 25 sign-in 5xx**. The fix is the same as ceb74af's.

## Journey score (reviewer role; the one score for this check): **8.75 / 10** (7 of the 8 criteria that apply)

Part 3a is API only (system console routes, no screen). I walked these as API journeys:
* **Main:** the Platform Owner locks; staff get 401 in plain words; the Owner lifts; staff sign in again.
* **Wrong role:** Support, Admin, Billing and a firm token are refused.
* **Error:** no reason, malformed id, double lock, lift when not locked, PROVISIONING or DELETED firm.
* **Recovery:** the races above.
* **Boundary:** billing during and after the lock.

| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | Lock and lift 200; prior status or billing's status restored (P5) |
| Next step obvious | 1 | Each 409 says "Nothing was changed" |
| Plain words | 1 | FIRM_LOCKED sentence; the reason is never shown to the firm |
| Feedback and state | ½ | M1: a raced sign-in gets 200 to a locked firm |
| Correct data | ½ | M1, M2: tokens live after the lift; carried fixed reason text |
| Error recovery | 1 | Refusals change nothing; REFUSED line on our console |
| Accessibility and screen sizes | N/A | No screen in part 3a |
| Speed | 1 | Lock and lift 17-27 ms in the suite log |
| Visual quality | N/A | No screen |
| Trust and sources | 1 | Sample labels; one firm line, one event, our line per change |

Pass on the numbers, but M1 and M2 stand: the journey score does not override the Majors. To raise the two ½ scores, fix M1 and then M2.

## Could not check

* No real Cognito pool. M2 was shown with the stand-in issuing a token at a lock-time `auth_time`, and the refresh-token lifetime point comes from reading the code.
* The close and webhook races used transactions shaped like `closure.ts` and `webhook.ts`, not the job or a real Stripe event.
* D1–D20, the BIC table and the graph do not apply to a diff-only round of an API part with no screen.
* No intended user walked it (D17/D20 stay with the founder).

Reviewer: Changes bfa78fd23c87505cffa528890e243d0c0ade41ab
