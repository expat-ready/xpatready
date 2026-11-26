# PF-4bc follow-up (#3217 round-3 Minors): break report

Head `e83c22ccdc0e7d38ef3f6441a3e7589139039144`, own diff `git diff 7a7740278..e83c22ccd` (firm-lock.ts, session/service.ts, the PR test, MODULE row).
How I ran it: the real `PlatformSession` over HTTP (a Nest app of PF-4's and PF-4b's classes), the real `lockFirm`, `FIRM_TX` and `busyOnLockTimeout`, `CognitoIdentityAdmin` on the fake Cognito (`slow()`), fakeMail. Each run used its own scratch database on :54329 (`xr_studio_pf4bcm_*`, every migration, Sample firms seeded, dropped afterwards). No network, no AWS.
For comparison I ran the same script on base `7a7740278` (extracted with `git archive`). Script: `scratchpad/pf4bcm/a.mts`, run with `STUDIO=<studio> tsx --tsconfig api/tsconfig.json a.mts A1,A2,...`.

## Major

**M1. Accept: Cognito has the user, then our records roll back with a 503 "try again". This is new in this diff, and another firm's ordinary activity is enough to cause it.**
- Why: `lockFirm` now keeps `lock_timeout` = 1.5 s for the whole transaction (firm-lock.ts:30, :32). In `accept`, `admin.createUser` (service.ts:148) runs before `moduleEvent.create` (service.ts:150). Every module_event insert takes one server-wide advisory lock that is held until commit: `pg_advisory_xact_lock(hashtext('module_event_seq'))` (migrations/20261114015002_pf3_platform_tables/migration.sql:433-437), and every module-event writer in every firm waits on it.
- So if that lock is busy for more than 1.5 s after the Cognito call, the insert gets 55P03, `busyOnLockTimeout` answers 503 FIRM_BUSY, and the whole transaction rolls back. The header's claim "answers 503 FIRM_BUSY … before any provider call" (firm-lock.ts:10-11) is false for accept.
- Repro A1: firm B holds a module_event insert open for 2.5 s, then firm A's invitee accepts.
  - Head: **503 FIRM_BUSY in 1630 ms.** Cognito user = true, staff rows = 0, `accepted_at` null. The invitee is told "Someone else in your firm is changing staff right now".
  - Base: **200 in 2514 ms** (it waited).
- Repro A1q: no long holder, just a queue of 30 module-event writers in firm B, each holding the lock 80 ms.
  - Head: **503 in 1591 ms**, Cognito user = true, staff rows = 0.
  - Base: 200 in 2486 ms.
- Impact: a legitimate accept now fails whenever the server's event queue is about 1.5 s deep: load in any firm, or one slow commit (an IO stall). Each failure leaves Cognito changed with our records rolled back. A retry recovers (createUser takes over the existing user: the retry answered 200 and the subject matched). An invitee who gives up leaves an orphan Cognito user, and the words blame "your firm".
- Fix: bound only the waits before the provider call. Right before `admin.createUser`, run `set local lock_timeout to default`, or a remaining-budget value. Better still, apply the M2 fix too: a deadline check before the provider call. Test: A1 / A1q give 200 with one Cognito user and one staff row, and a lock timeout after `createUser` is never answered as FIRM_BUSY.

## Minors

**m1. The 12 s budget can still be passed, and then Cognito changes while our side rolls back. Sign-out everywhere then leaves the person's app sessions live.**
- Why: Postgres bounds each lock attempt, not the statement. `endSessions` takes `FOR UPDATE` on the person's row (service.ts:69). Overlapping `KEY SHARE` holders join the row's multixact without queueing: every insert into a table with a foreign key to platform_staff takes one. The waiter then waits on one member after another, each wait under 1.5 s, with no total limit. The comment's "a row lock can wait twice" (firm-lock.ts:11-12) does not hold.
- Repro A2: key-share holders on O's row, each held 1.0 s, a new one every 0.5 s for 9.8 s. Cognito answers in 0.9 s.
  - Reset: **500 at 13246 ms.** Cognito `totp=false` (reset applied), 0 audit lines, 0 revocations, O's token still works. With a 10.5 s stream: 500 at 13748 ms.
  - Sign-out everywhere: **500 at 12343 ms.** Cognito signOuts 0→1, 0 revocations, **O's app token still works.**
  - Base with the same 9.8 s stream: 500 at 10535 ms with Cognito untouched. The 8 s limit expired before the provider call. Raising the limit to 12 s moves the expiry to after it.
- It needs a busy person's row held about 9 s by overlapping writes, so Minor (as round 3's R3-m1).
- Fix: one deadline check, independent of locks. Note the transaction's start time. Before each provider call, if less than `COGNITO_DEADLINE_MS` + about 2 s is left of `FIRM_TX.timeout`, answer 503 FIRM_BUSY. Test: A2 gives 503 with Cognito untouched.

**m2. Sign-out can still hang and then leave a live token** (r3-m2 is only partly fixed).
- Why: `{ bounded: false }` passes no transaction options (service.ts:57, :187), so Prisma's default 5 s limit applies. The lock wait has no limit, and Prisma's limit does not stop a statement that is waiting. Bounded holders may now hold the firm lock for up to 12 s; PF-11c's close and plan change may hold it for up to 60 s.
- Repro A3: a firm-lock holder of 6 s.
  - Sign-out: **500 at 6026 ms**, no revocation, token still works. frame.tsx:92 then ends the session in the browser only.
  - With a 3 s holder: 200, and the token ended (held).
- Repro A2: a real sign-out-everywhere that **succeeded** at 11846 ms made a colleague's own sign-out answer **500 at 11884 ms**, and that token stayed valid.
- Fix: give signOut its own options, for example `{ maxWait: 2_000, timeout: 30_000 }` (above `FIRM_TX.timeout`), or end the session under the person's row lock only, without the firm lock. Map P2028 to a 503 so the page can retry.

**m3. P2028 is still a 500, not a 503** (round 3's R3-m3 is not addressed). `busyOnLockTimeout` maps lock timeouts only (firm-lock.ts:17-21).
- The 12 s limit running out (m1) answers 500.
- Repro A6: 40 sign-out-everywhere requests at once behind a 6 s firm-lock holder → 10 × 200, 27 × 503 FIRM_BUSY, **3 × 500** (maxWait, "Unable to start a transaction").
- Fix: map P2028 in the same `.catch` (busy.ts:28 already does this for case routes).

**m4. The invitee's words** (r3-m1's fix condition: "words for the invitee without 'your firm'").
- accept-page.tsx:75 shows the 503 detail under "Not done": "Someone else in your firm is changing staff right now". That goes to a person who is not in the firm yet. In M1 the cause is another firm entirely.
- Fix: accept's own words, for example "This invitation is busy for a moment. Nothing was saved; try again."

## What held (attack → result)
- **Mixed burst in one firm with Cognito at 0.9 s** (A4: 3 resets, 2 sign-out-everywhere, 2 accepts, 2 own sign-outs): only 200 or 503 FIRM_BUSY, never a 500, in 3795 ms. For each person, Cognito and our audit or revocation rows agree. The accept that got 503 left no Cognito user.
- **The person's row held 2 s by a key share before the provider call** (A5): reset → 503 FIRM_BUSY at 1516 ms, 0 Cognito calls, the app still on. R3-m1's single-holder case is closed.
- **The audit insert waits for no lock**: with the platform-audit workspace row held `FOR UPDATE`, sign-out everywhere still answered 200 at once (A5b).
- **Own sign-out behind a holder under 5 s** (3 s, A3b): it waits instead of answering 409, and the session ends (r3-m2's main case).
- **Concurrency** (A6): 40 sign-out-everywhere requests behind a 1.4 s holder → all 200.
- **A retry after M1** takes over the existing Cognito user (the subject matches), so there is no second account.
- **`isLockTimeout` false positives**: none found. `problem()` throws an HttpException whose `message` is "Http Exception", so firm names and emails in a problem's detail never reach the regex (read from the code, not run).
- **Wiring pins**: the PR's source checks match service.ts. signOut has `bounded: false`, and inFirm and accept use lockFirm, FIRM_TX and busyOnLockTimeout.

Not run: the PR's own test, because it creates `xr_studio_pf4bc_scratch_*` databases, outside my prefix.

Verdict: Changes e83c22ccdc0e7d38ef3f6441a3e7589139039144

## Round 2 (head `b902813c001a0b5747564f0a2c2a80f85abe9e34`)
Diff `git diff e83c22ccd..b902813c0` (firm-lock.ts, service.ts, provider.ts comment, PR test). Same harness, databases `xr_studio_pf4bcm2_*` (all dropped), script `scratchpad/pf4bcm2/a.mts` (round-1 cases plus B1–B5). No network, no AWS. The PR's own test was not run (its databases are outside my prefix).

**Re-runs: every round-1 finding is closed for its repro.**
- M1. A1 (another firm holds the event lock 2.5 s): **200 in 2512 ms**, 1 Cognito user, 1 staff row. A1q (30 writers × 80 ms): **200 in 2522 ms**.
- m1. A2 key-share streams of 7, 9.8, 10.5, 13 and 17 s, Cognito 0.9 s per request: reset and sign-out everywhere both answer **503 FIRM_BUSY** (7.5–17.6 s). Cognito untouched every time (totp true, signOuts 0→0), 0 audit lines, 0 revocations. Same result with 6–6.3 s streams and Cognito at 0.95 s or 1.4 s.
- m2. A3, own sign-out behind a 6 s holder: **200**, token ended (was 500). With a 3 s holder: 200.
- m3. A6, 40 sign-out-everywhere requests behind a 6 s holder: 10 × 200 and 30 × 503, **no 500** (was 3 × 500).
- m4. The accept 503 now reads "Your firm's account is busy right now. Try again in a moment." (B3).
- A4, the mixed burst: only 200 or 503, 3769 ms. Cognito and our rows agree for each person, and the accept that got 503 left no Cognito user.
- A5: a 2 s key share gives 503 at 1533 ms with 0 Cognito calls. A5b: the audit insert waits for no lock.

**Minors**

**m1. Sign-out can still answer 500 and leave its token live.** P2028 is mapped only on the bounded path. For `bounded: false`, inFirm's `.catch` is `Promise.reject(e)` (service.ts:57; signOut service.ts:187-190).
- Also, the 15 s limit rests on "a bounded holder may keep the firm lock that long" (firm-lock.ts:18), which is false. Prisma's 12 s limit does not cancel a statement that is still waiting, so a bounded transaction keeps the firm lock until its statement returns.
- s17 (A2s with a 17 s stream): sign-out everywhere held the firm lock until 17.6 s (it then answered 503, correctly). A colleague's own sign-out queued behind it got **500 at 17602 ms**, with 0 revocations, and **the token still works**.
- B1, own sign-out behind a 16 s firm-lock holder (PF-11c's close may hold it 60 s, closure.ts:44): **500 `Internal server error` at 16030 ms**, no revocation, token still works.
- B2, 40 different people sign out at once behind a 3 s holder: 37 × 200 and **3 × 500** (the pool's maxWait), and those 3 tokens still work.
- In each case frame.tsx:90-92 ends the session in the browser only, so the token stays valid on the server.
- Minor: it needs a firm lock held for more than 15 s, or pool exhaustion.
- Fix: map P2028 on the unbounded path as well, or end the session under the person's row lock without the firm lock. Correct the comment at firm-lock.ts:18. Test: B1 and B2 give no 500.

**m2. Accept: Cognito changed and our records rolled back, still reachable after `createUser`, as the header accepts** (firm-lock.ts:13-14, service.ts:147-153).
- B3: another firm holds the global event lock for 14 s. Accept answers **503 FIRM_BUSY at 14016 ms**, with the Cognito user created and 0 staff rows.
- The 503 arrives when the holder lets go, not at 12 s: the waiting statement is not cancelled.
- A retry recovers, because createUser takes over the existing user (round 1). An invitee who gives up leaves an orphan Cognito user.
- It needs the server-wide event lock stalled for about 11 s, so Minor, and it is a documented trade-off. Recorded so it stays visible.

**What held**
- **Per-transaction clock (B4).** An old reset in firm A, behind a 9.8 s stream, got 503 at 10565 ms with Cognito untouched. Three fresh sign-out-everywhere requests in firm B, started at 6, 7.6 and 9 s while it ran, all got 200, and Cognito and the revocations agree (3 and 3). A shared clock would have refused the fresh ones or let the old one through. The PR's own two-at-once check is the same idea.
- **The clock matches Prisma's timer (B5).** After a 1.75 s pool wait, a query at callback start + 11.7 s succeeds and one at + 12.4 s gets P2028. So Prisma's 12 s runs from the callback, as txClock does: the pool wait is not hidden from roomForProvider.
- **No legitimate change refused.** The refusal starts only past 7 s elapsed. That needs a statement that waited through several bounded lock attempts, which cannot happen without overlapping holders. The A4 burst, A5b, B4 and A3 all got 200 where a 200 was due.
- **No "no clock" refusal.** roomForProvider is called only inside txClock, at service.ts:149, :202 and :235. These are the only provider-changing calls in api/src (grep). handOff is local (provider.ts:217). The adapter's deadline is the constant (platform-staff-read.ts:15 passes no `deadlineMs`), so PROVIDER_ROOM_MS matches.
- **No 500 on the bounded paths** in any run (A2, A4, A6, B3, B4).

Verdict: Approve b902813c001a0b5747564f0a2c2a80f85abe9e34

## Round 3 (diff-only, 53e603a8)
Head `53e603a8ed33169ebbf4f2f704c9f60d8f855f96`. #3479's own code diff (`git diff origin/claude/runtime-cognito-admin HEAD`: firm-lock.ts, service.ts, the provider.ts comment, the PR test) is unchanged since round 2. origin/main (97ea7bbe6) is only 3 tools commits ahead, so the API at this head is current main plus the PR.
How I ran it: the real `PlatformSession` and PF-4's `PlatformIdentity` over HTTP, with main's `Db` (walledPool, oneQueryPerCaller, the transaction-end guard), on the fake Cognito, with fakeMail. Scratch databases `xr_studio_brk3479r3_*` on :54329 got every migration and were all dropped. Script: `scratchpad/r3_3479/r3.mts` (`CASES=E1,…`). The key-share holders are real inserts into main's new tables: `msg_mailbox` (owner_staff_id) and `plat_import_mapping` (saved_by), each with a foreign key to platform_staff. No network, no AWS.

**Minor**

**m1. Accept behind a busy firm lock shows the staff words, not the invitee words.** Review m3 is fixed on one path only.
- Why: `lockFirm` maps its own 55P03 with the default words: `catch (e) { busyOnLockTimeout(e); }` (firm-lock.ts:46). accept calls `lockFirm(tx, pre.firm_id)` (service.ts:116). The `.catch(… busyOnLockTimeout(e, BUSY_WORDS_INVITEE))` at service.ts:155 then sees an HttpException, not a lock timeout, so it rethrows it unchanged.
- Repro E5: a firm-lock holder for 2.5 s, then an invitee accepts. Result: 503 FIRM_BUSY at 1541 ms with detail "Someone else in your firm is changing staff right now. Try again in a moment." The accept page shows that detail under "Not done" (accept-page.tsx:73, :88). Nothing was changed: no Cognito user, 0 staff rows.
- Round 2's B3 tested only the event-lock and P2028 path, which does get the invitee words. The PR's pin (tests/check_pf4bc_cognito_admin.ts:264) only looks for the constant's name in accept's source.
- Fix: give `lockFirm` a words parameter and have accept pass `BUSY_WORDS_INVITEE`. Test it over HTTP: an accept behind a firm-lock holder gets the invitee words.

**m2 (carried from round 2's m1, unchanged). A person's own sign-out can still answer a bare 500 and leave its token live.**
- Why: on the unbounded path the `.catch` is `Promise.reject(e)` (service.ts:57), so P2028 is never mapped. Main's new tables make the key shares easy to produce: any write to `msg_mailbox` or `plat_import_*` that names the person.
- Repro E3: overlapping `msg_mailbox` inserts on T's own row for 17 s, then T signs out. Result: **500 "Internal server error" at 17257 ms**, 0 revocations, T's token still works. The browser forgets it (frame.tsx).
- With a 6 s stream: 200, and the token ends.
- It needs more than 15 s of overlapping holds on one person's row, so Minor, as in round 2.

**What held (attack → result)**
- **Key shares from main's new tables, before the provider call (E1).** One `msg_mailbox` insert held 2.5 s on T. Reset and sign-out everywhere both answer 503 FIRM_BUSY at 1.52–1.56 s. Cognito untouched (totp true, signOuts 0), 0 revocations.
- **Overlapping key-share streams past the 12 s limit (E2).** `plat_import_mapping` streams of 9.8 s and 12.5 s, and a `msg_mailbox` stream of 17 s, with Cognito at 0.9 s per call. Reset and sign-out everywhere: always **503 FIRM_BUSY** (10.2–17.3 s), never a 500. Cognito unchanged every time, 0 revocations, 0 audit lines, and the person's token still works, so nothing split. After each run:
  - 0 connections idle in transaction, 0 pool destroys, 0 refusals by the transaction-end guard;
  - `lock_timeout` reads `0` on every pooled connection (`set local` never leaks);
  - firm B's staff list then answers 200 with no firm-A rows (walledPool scope held).
- **Deactivate against reset and sign-out everywhere (E4), in three orders.**
  - Reset first: both 200, deactivate waits for the firm lock, 2 revocations.
  - Deactivate first: reset gets 409 STAFF_NOT_ACTIVE with Cognito untouched.
  - Sign-out everywhere first: both 200, and Cognito signOuts matches the revocation.
  - Never a 500. Deactivate during a 5 s `msg_mailbox` stream answers 200 in 32 ms (E8): FOR NO KEY UPDATE does not conflict with key shares.
- **Accept (E5).** Behind a firm-lock holder: 503 before createUser, with no Cognito user (only the wording is wrong, m1). During a 9.8 s key-share stream on the inviter's row: 200, 1 Cognito user, 1 staff row (accept takes no lock on the inviter).
- **Pool full: 10 transactions holding the pool 3.5 s (E6).** Sign-out everywhere 200 and own sign-out 200. No 500, no idle-in-transaction connection, no destroys.
- **The budget.** roomForProvider refuses past 7 s, then at most 3 s with the provider, then nothing but the commit in reset and sign-out everywhere. No run reached the provider late.
- **The PR's own test:** 56 passed, 0 failed. Its scratch database was dropped.
- **No secret or provider text in the logs.**

Not run: B3 (another firm holds the global event lock for 14 s after createUser). It is the documented trade-off from round 2's m2, and this head does not change it.

Verdict: Approve 53e603a8ed33169ebbf4f2f704c9f60d8f855f96
