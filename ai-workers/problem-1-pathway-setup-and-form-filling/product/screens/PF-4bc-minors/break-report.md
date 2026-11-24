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
