# PF-27 part 3a: break report, round 4 (P-278: money, permissions, sessions)

PR #3697, branch `claude/runtime-pf27-lock`, head **bf7d190e0234f84490b6efccb114c1f9326a8377**. The code is 9f2a04b; bf7d190 adds only review files.
I tested on a clean `git archive bf7d190` copy in the session scratchpad, with its own Prisma client. Three scratch scripts are in
the copy's tests/ folder. `brk4_r3.ts` is my round-3 harness, unchanged. `brk4_new.ts` covers the new angles, on a scratch
database. `brk4_sweep.ts` runs the full app on **:4473** against its own database `xr_studio_brk4pf27sweep`. All of them were
stopped and their databases dropped afterwards. I did not touch :4400 or the demo database, made no Stripe call (US$0), and
made no model call. The builder's `tests/check_pf27_lock.ts` passes **28/0** on this head.

**Verdict on bf7d190e0234f84490b6efccb114c1f9326a8377: Approve.** Round 3's M1 and M2 are fixed, and every repro and sweep
from round 3 now passes. The new angles found no Blocker and no Major. Two new Minors come from the fix itself (N6c, N8). One
deadlock (N6) is older than this PR: it is in PF-11c's close, which I confirmed on bfa78fd. Round 3's m1 to m3 are still open.

## Round-3 repros on this head

| Repro | Round 3 (bfa78fd) | Now (bf7d190) |
|---|---|---|
| T1 share-mode repro: a sign-in in flight as the lock commits | 200 with a token that worked after the lift | **401 FIRM_LOCKED**, no token. The revocations are lock@10:00:00.000, then lift@10:01:01.000 |
| T2: 60 rounds of one lock and two sign-ins, then a lift | 32 of 60 rounds left a working token | **0 of 60 tokens work after the lift**. 0 5xx, 0 deadlocks |
| T3: a stand-in token dated 10 minutes into the lock | 200 after the lift | 401 FIRM_LOCKED during the lock, **401 after the lift** |
| T4 to T6 race sweeps (lock/lift ×5 at once ×20; 3 sign-ins ×25; webhook-shaped ×25) | 0 5xx, 0 deadlocks | Same. 187 lock and lift events strictly alternate. Every lift after a webhook hold went to PAYMENT_HOLD |
| Route sweep, full app on :4473, a locked firm's token on every route that declares platform access | 296 of 298 gave 401 FIRM_LOCKED | Same: **296 gave 401 FIRM_LOCKED**. The two sign-in doors gave 422 INVALID and 401 SIGN_IN_CODE_REFUSED. 0 gave 2xx, 0 gave 5xx |
| T7 bodies, T8 statuses after a lift, T9 a firm token on `/unlock` | held | held. T9 gave 403 FIRM_SESSION_REFUSED |

## Findings

| # | Sev | What I did | Expected | Actual | Where |
|---|---|---|---|---|---|
| N8 | Minor | **A Cognito-path session started during the lock, first used after the lift.** I used a stand-in port that reports `via: "cognito"`. Firm B was locked; 10 minutes in, I issued a token dated then. I called `me` during the lock, lifted, then called `me` again. | Refused after the lift, with nothing written that says the person signed in. | Refused (401 SESSION_REVOKED), but **one `platform.staff.sign_in` line is written** on the firm's trail: "a staff member signed in (cognito); their older session was ended", `at` 15:29:24, a time inside the lock. `last_sign_in_at` moves to that time, and an `another-device` revocation is added. `recordSignIn` runs before the revocation check, so a refused session is still logged as a sign-in. Anyone looking into a takeover lock reads this as a sign-in during the lock. | `identity/service.ts:148-155` (sign-in recorded before the check), `:190` (the line) |
| N6c | Minor | **A sign-in in flight when PF-11c's close commits.** I paused a sign-in after it passed the door (a gate on `recordSignIn`), set firm B to DELETED, then released it. | 401 FIRM_CLOSED: "This firm's ExpatReady account is closed…" | **401 FIRM_LOCKED**: "…locked… ExpatReady will contact the firm's Owner". The new re-read maps DELETED to `"locked"`, and both callers send the lock's words. On bfa78fd this sign-in got a 200 token, which the guard then refused, so this head is safer and only the words are wrong. | `identity/service.ts:181`, `:151`, `:217` |
| N6 | Minor (older than this PR, PF-11c) | **A close-shaped transaction against a sign-in.** It matches `closure.ts:109-121`: billing advisory lock, firm row **FOR UPDATE**, status DELETED, then a revocation for the person. A local sign-in ran at the same time. | No deadlock, as with the lock and the lift. | **Deadlock**: the sign-in got **500** after about 1 s and `pg_stat_database.deadlocks` went up by 1. The sign-in holds the staff row and waits for a KEY SHARE on the firm row (the revocation's firm FK). The close holds the firm row FOR UPDATE and waits for a KEY SHARE on the staff row (the revocation's staff FK). The same run with FOR NO KEY UPDATE (the lock's order) gives 200 and no deadlock. It reproduces on **bfa78fd** too, so the new firm read is not the cause. This is for PF-11c, not for this PR. | `firm-closure/closure.ts:110`, `:121`; `identity/service.ts:174`, `:189` |
| m1-m3 (round 3) | Minor | Same checks as round 3. | — | Still open. Two refused unlocks write **0** `platform.bypass` lines (T7). An unknown email on a locked firm gets **401 FIRM_LOCKED** (T9). Invitation `state` and the code `callback` uses are not in the diff, so they are unchanged. Round 3's m4 (header) is fixed. | `firm-lock/service.ts:55-61`; `identity/service.ts:207`; `session/service.ts:94-100, 171-174` |

## New angles that held

* **A sign-in blocked behind the lift's staff row lock (N1).** A gate paused a sign-in after the door, before the lock. Then the lock committed and the lift took the staff rows, held by a share lock on the revocations; `pg_locks` showed 2 waiters. When I released them, the sign-in waited for the lift, then read the firm as ACTIVE and was dated `lift revocation + 1 ms`. Its token works after the lift and dies at the next lock and lift (401 SESSION_REVOKED). This is expected: the stand-in dates a sign-in when it is recorded, and on Cognito `auth_time` is fixed earlier, so it is covered by the revocation. A sign-in that was not paused cannot get here, because the door reads the committed SECURITY_LOCK and refuses.
* **Lift against sign-ins, 120 rounds (N2).** Each round: lock, then a lift and two sign-ins 0 to 47 ms apart. 165 sign-ins got 200 and 75 got 401 FIRM_LOCKED. In every round with a 200, the newest token works, so no sign-in was revoked by the lift that it came after. **0** of these tokens survived the next lock and lift. 0 5xx, 0 deadlocks.
* **Two or three lifts at once, 30 rounds (N3).** Each round gave exactly one 200 and two 409 NOT_LOCKED, one revocation per staff member (not two), and one `firm.unlocked` event.
* **Lock, lift, lock fired together, with three sign-ins between them, 40 rounds (N4).** The end state was SECURITY_LOCK 36 times and ACTIVE 4 times. No token worked while the firm ended locked, and none worked after a final lift. Events alternate. 0 5xx, 0 deadlocks.
* **Deadlocks (N5).** 40 rounds on `sample-firm`, each running at once: a lock or lift, sign-ins of user-O, user-T and user-R, a deactivate or reactivate of user-O, and a role change of user-T (CASE_MANAGER and CASE_OFFICER) by the Owner. **0 5xx, 0 deadlocks.** The codes were 200, 401 SESSION_REVOKED (the Owner's token ended by the lock, lift or own sign-in), 409 NOT_LOCKED and 409 NOT_DEACTIVATED. By code reading, the new firm read in `recordSignIn` is a plain select: it takes no lock, so it cannot join a deadlock. The lock, the lift and `inFirm` meet on the firm row (FOR NO KEY UPDATE), which is compatible with a sign-in's KEY SHARE.
* **Zero staff, and staff with no last sign-in (N7).** A firm with no staff: lock 200 and lift 200 back to ACTIVE, 0 revocations, and both lines say `staffSessionsEnded: 0`, with no error. With `last_sign_in_at` set to null for all of `sample-firm`: lock and lift 200, the revocations are dated at now, and a sign-in afterwards gets 200 and its `me` gets 200.
* **5xx.** The only 500 in all runs was N6's deliberate close-shaped deadlock. There were none in the round-3 harness, the new harness or the full-app sweep.

## A fail test for each finding

* **N8:** With a port that reports `via: "cognito"`, lock, issue a token dated inside the lock, lift, and call `me`. Assert 401, and that the firm's `platform.staff.sign_in` count and `last_sign_in_at` are unchanged. Today it is +1 line and a moved time. One option is to check the person's newest revocation before `recordSignIn`.
* **N6c:** Pause a sign-in after the door, set the firm to DELETED, release it, and assert `code === "FIRM_CLOSED"`. Today it gets FIRM_LOCKED.
* **N6 (PF-11c):** Hold the close's order on a side connection (advisory lock, firm row FOR UPDATE), start a sign-in, then write DELETED and a revocation. Assert there is no 500 and the deadlock count is unchanged. FOR NO KEY UPDATE in `closure.ts:110` passes this.

## Notes (not findings)

* **Clock skew (code reading).** Cognito's `auth_time` uses Cognito's clock, and the lift's revocation uses ours. Rounding `auth_time` down to the second absorbs small skew. If our clock ran more than a second behind Cognito's, a hosted-page sign-in made just before the lift could be dated after the lift's revocation. This applies to every revocation in PF-4, not only to this PR.
* As in round 3, the pause of the hold countdown (part 3c) and the Owner's "Account security-locked" email are not in 3a.
