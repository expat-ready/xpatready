# PF-4bc review: the `cognito` side of IdentityAdminPort (API only, no screen)

Reviewer: independent session, 23 Nov 2026. Branch `claude/runtime-cognito-admin`, head 964275775006a7d4964bbb7c65a436d9a6b4eaa0, PR #3217.
Diff read in full (`git diff origin/main...964275775`, 5 files) and its callers (session/service.ts, staff-read/service.ts, features/platform-staff-read.ts).

**Verdict: Ship after fixes (Changes).** No Blocker, two Majors. The adapter is careful and the row's four "Done when" points are met: the contract passes on both adapters, SUPPRESS goes on every AdminCreateUser, SDK text never comes back to the caller, and no credential reaches a log. The Majors are what the adapter does to its callers now that it makes real calls.

## What I ran
* `npx tsx tests/check_pf4bc_cognito_admin.ts`, twice: 30 passed, 0 failed, exit 0 (0.8 s).
* Mutation run on a scratch copy of provider.ts. Each change made the test fail: SUPPRESS removed, the UsernameExists reuse removed, the raw `message` logged, the passkey read removed, the `Enabled` check removed, `WebAuthnMfaSettings` always sent. **One change survived: `maxAttempts: 1`** (m4).
* Probes against the recorded fake: two attempts of 3 s each took 6042 ms and gave 502 (M1). A throttled redeem burns the code (m1). An already-enrolled Cognito user is reused with no status check (m2). An error name with spaces and a secret in it is logged as `Error` (good). The no-pool line in check_pf4b_session_reads.ts gives 503 SIGN_IN_NOT_SET_UP "no Cognito pool" (good).
* `graph.mjs --check` exit 0. `check-port-contracts.mjs` reports 0 problems, but IdentityAdminPort is not among its 30 ports (m6).
* Not run: check_pf4b_session_reads.ts in full, because there is no PostgreSQL in this session (only its one changed line was probed). No live Cognito pool.

## SDK and pool facts, checked in the installed 3.1161.0 models and deploy/cdk/lib/service.ts
* `MessageAction` "Set to SUPPRESS to suppress sending the message": correct, and sent on every call.
* `Username` "can be any of their alias attributes … else the sub". The CDK pool has `signInAliases: { email: true }` (email is the username attribute) and `signInCaseSensitive: false`. So using the email on create and the `sub`-else-email on later calls is correct (provider.ts:134,139).
* `AuthFactorType` includes SOFTWARE_TOKEN and WEB_AUTHN, and `UserMFASettingList` lists SOFTWARE_TOKEN_MFA, so the twoStep mapping uses real values.
* `WebAuthnMfaSettings` requires MULTI_FACTOR_WITH_USER_VERIFICATION. CDK sets that only when passkeys are on (service.ts:135). Sending it only to a passkey holder is right.
* Retries: smithy's THROTTLING list includes TooManyRequests/LimitExceeded, and 500 and TimeoutError are transient, so `maxAttempts: 2` means one retry. A retry of AdminCreateUser is safe: a lost first response gives UsernameExistsException on attempt 2, and that goes to AdminGetUser.

## Blockers
None.

## Majors
**M1. The provider's time budget does not fit the database transaction it runs inside.**
* provider.ts:90-91 says a call "gives up after this … inside the accept's transaction". The client is `maxAttempts: 2` with `requestTimeout: 10_000` (provider.ts:118-120), so one port call can take about 20 s, and createUser→AdminGetUser or resetTwoStep's two calls (provider.ts:160-165) double that.
* The three callers run inside Prisma interactive transactions with the default 5 s timeout. That default is `timeout ?? 5e3` in @prisma/client/runtime/client.js. The callers are accept (session/service.ts:110→141), sign-out everywhere (inFirm, :46→192) and reset two-step (:46→224).
* Probe: two 3 s answers took 6.0 s, already past 5 s.
* When that happens, Prisma rolls back while the Cognito change still goes through:
  * reset: MFA is off at Cognito, but the revocation row, the audit line and the outbox notice are rolled back. This breaks the design note "a mail failure changes nothing at the provider" in reverse.
  * sign-out everywhere: Cognito's refresh tokens end with no audit line and no revocation.
  * accept: an unmapped 500 instead of the port's 503/502.
* Meanwhile the firm row lock is held for the whole network wait.
* **Fix:** make the whole provider budget fit the transaction. For example, `requestTimeout` about 2 s, `connectionTimeout` about 1 s, and an explicit `{ timeout, maxWait }` on those three `$transaction` calls, sized to calls × attempts × budget plus a DB margin. Export the budget and add a test that it is under the transaction timeout. Fix the provider.ts:90 comment. If the Lead prefers moving the provider call after commit, raise it as a question on the PR.

**M2. The Team list now makes one Cognito request per staff member. This breaks an [M] standard, and the PR does not say so.**
* staff-read/service.ts:39 and :44 call `admin.twoStep` for every row (`Promise.all`). The same call is in `one` (:51) and `myAccount` (:89).
* Before this PR the cognito adapter refused at once. Now each row is an AdminGetUserAuthFactors call (10 s timeout, one retry).
* STANDARDS.md:35 "[M] no N+1; one request per screen view, not per row". STANDARDS.md:58 and QUALITY D15: first view under 1 s.
* A firm of 40 people means 40 parallel provider calls on every list load. Under throttling they come back as unknown (null), with one warn line each, and the list can wait the full retry budget.
* **Fix (no new feature):** declare it in the PR's Questions and in `screens/PF-4bc/challenge.md`, with a proposed row (two-step state kept on the staff row, or read on the person's page only). Until then, cap the fan-out, for example limited concurrency with a short read timeout, so the list cannot wait on the provider longer than its budget.

## Minors
* **m1. A transient error during redeem burns the sign-in code** (provider.ts:174-178): `take` deletes the code before AdminGetUser. Probe: throttled → 503, then the same code → 401. The invitee has no password, so "Sign in again" leaves them stuck. **Fix:** consume the code only after the provider answers yes, or put it back on a 503/502 (never on not-found or disabled). This matters once the declared callback row lands.
* **m2. createUser reuses any existing Cognito user for that email with no check** (provider.ts:143-146). On staging the pool is RETAINed while the DB can be reset (service.ts:133), so a CONFIRMED user with its own password and TOTP would be linked silently. **Fix:** reuse only when `UserStatus === "FORCE_CHANGE_PASSWORD"` (the state a rolled-back accept leaves); otherwise return a mapped 409/502. Add a fake case.
* **m3. The contract does not pin the state before enrolment.** Local returns TOTP for a never-enrolled user (provider.ts:73); Cognito returns null (provider.ts:156). Contract case 4 (contract.ts:62-68) enrols first, so this difference is never tested. The "no provider user" tolerance is also tested on Cognito only (test:72-77). **Fix:** add both as contract cases (and align local), or write the difference down in the contract header.
* **m4. `maxAttempts: 2` is not pinned.** The mutation to 1 passes all 30 checks. **Fix:** in one retryable case, assert that the fake saw 2 requests.
* **m5. The fake assumes passkey-reset behaviour without declaring it.**
  * fake-cognito.ts:77 drops WEB_AUTHN from ConfiguredUserAuthFactors when passkey MFA is turned off.
  * The SDK model says that setting only "activates or deactivates passkey MFA"; the credential stays, and ConfiguredUserAuthFactors lists factors "available … with USER_AUTH sign-in".
  * So on a real pool, twoStep (provider.ts:156) may still read PASSKEY after a reset. The assertion at test:99 passes on the fake only.
  * **Fix:** add this to the fixture's "Not verified" list and to C21, and mark that assertion as fake-only.
* **m6. The port-contract check cannot see IdentityAdminPort.** check-port-contracts.mjs only looks in ports/*.ts and identity/port.ts. **Fix:** add session/provider.ts to its port discovery, or say so in the PR.
* **m7.** features/platform-staff-read.ts:2 still says the adapter "refuses, saying why, until PF-4bc". Update it.
* **m8. The PR body overstates two things.**
  * "the README gives the source of every shape": there is no README; it is the header of fake-cognito.ts:10-28.
  * "run 2: below" and "run-suites.sh: below": no such results were posted.
  * Correct the body.

## Standards and dimensions (API-only scope)
* Most of the skill does not apply here: D8–D14, D17 and D20, and the BIC-01–20 table, because there is no page.
* D2 Data integrity: 3/5 (M1).
* D5 Stability and recovery: 3/5 (M1, m1).
* D15 Speed: 2/5 (M2).
* D16 Testability: 4/5 (strong pass/fail pairs; m4, m5).
* D18 Information provenance: 4/5 (shapes cited to the SDK model; m5 missing from the list).
* D19 End-to-end capability closure: 2/5 (the PR declares that R1.5 does not yet close on cognito).
* STANDARDS [M] "personal data … never logged" and "no credential in a log": met (the log line has the operation name and the error name only, with a regex guard).

## Journey score (reviewer's one score): 5/8 applicable criteria, about 6.3/10. Not a pass
Details in `screens/PF-4bc/journey-test-reviewer-2026-11-23.md`. Below 8 because of M1, M2 and m1. Accessibility and visual quality do not apply (no page).

Verdict: Changes 964275775006a7d4964bbb7c65a436d9a6b4eaa0

## Round 2 (head fa8aefc670f09571572a407c74e5bbcd8c47604a)

Reviewer: independent session, 23 Nov 2026. Read `git diff 964275775..fa8aefc67` (provider.ts, the test, the fake, challenge.md, one comment) and the callers again (session/service.ts:46-47, :110-144, :187-224; staff-read/service.ts:24-45).

**Verdict: Ship (Approve).** All round-1 Majors (review M1, M2; break M1, M2, M3) are fixed or declared, and each fix has a test that fails without it. No new Blocker or Major. Five minors stay open (r2-m1 to r2-m5). The first two are what is left of M1 and M2 once Cognito is slow.

### What I ran
* `npx tsx tests/check_pf4bc_cognito_admin.ts`: 42 passed, 0 failed, exit 0 (4.8 s).
* **Mutations** (scratch copy of provider.ts each time, then restored; `git status` clean). Every one made the suite fail:

  | Mutation | Test that failed |
  |---|---|
  | (A) no deadline (a signal that never aborts) | break M1 |
  | (B) the email check after a lookup by `sub` removed | break M2, foreign `sub` |
  | (C) the by-email `sub` comparison removed | break M2, stale `sub` and the right-`sub` pass |
  | (H) a stale `sub` treated as "nothing to end" again (round-1 behaviour) | break M2, stale `sub` |
  | (D) the Gate removed | review M2: `most: 10` |
  | (E) `giveBack` removed | break m1 |
  | (F) `maxAttempts: 1` | review m4 and break m1 |
  | (G) the `Enabled` check removed | break m2 |

* **Probes** on the recorded fake (`r2probe.mts`, session scratchpad):
  * P1: a throttle answered at 2.5 s, then the SDK's retry, ends at 3001 ms with 503 and no user created.
  * P1b: a reset whose answers take 1.1 s each ends at 3001 ms with 503, and the authenticator app is still on (AdminSetUserMFAPreference was never sent).
  * P2: 10 throttled reads, then 8 reads aborted at 1.5 s, then 10 reads: all TOTP. The Gate is released on the error path and the abort path.
  * P5: a code given back keeps its expiry (refused 2 s after it). P6: three parallel redeems give one success.
  * P7: a `local-…` subject on cognito gets 409 MISMATCH for both the read and the reset. That is the safe direction.
* **SDK fact:** `@smithy/core` retry `isTransientError` excludes `AbortError` (submodules/retry/index.js:60). An aborted request is never retried, and an attempt after the deadline fails at once.
* `graph.mjs --check` exit 0.
* Not run:
  * `tsc` (the kernel stopped it for memory);
  * check_pf4b_session_reads.ts (untouched since round 1);
  * a live pool.

### Round-1 items
* **Review M1 / break M1: fixed for a lone caller.** One 3 s AbortSignal covers every request and retry of a call (provider.ts:157-160). Two-step reads have 1.5 s. The deadline test fails without the fix (A). The remainder is r2-m2.
* **Review M2: declared, and capped per read.** challenge.md and PR Question 3 propose a `two_step_method` column as a new row. That is an acceptable stop-gap for a declared [M] deviation, because the schema change is outside this row. The cap is pinned (D). The remainder is r2-m1.
* **Break M2: fixed.** `find()` (provider.ts:179-188):
  * a lookup by `sub` must match the email;
  * a stale `sub` is looked up again by email, and a different `sub` there → 409;
  * only "nobody under either" counts as nothing to end.
  * Pinned by (B), (C) and (H).
* **Break M3: fixed honestly.**
  * The fake keeps the passkey listed after a reset.
  * The fixture header's "Not verified" list and PR Question 4 name the open point.
  * The docstring no longer claims a reset clears passkeys.
* **Minors fixed with tests:** m1 (code given back; break m1), m4, break m2 (`Enabled`), break m3 (`OtherError`), break m4 (exactly one UUID `sub`). m5 and m6 are declared, m7 is fixed and m8 (the PR body) is corrected.
* **Contract m3: the explanation is acceptable, but it is in the wrong place** (r2-m4).
  * The local stand-in signs in with the second step done (PF-4's rule), so "before enrolment" cannot happen on local.
  * But the note is only in the PR body.

### Minors (Should; none blocks)
* **r2-m1. The read deadline starts after the Gate, so the Team list has no total budget.**
  * The Gate is one FIFO queue for the whole server (provider.ts:141, :213-215).
  * P3, 40 rows: 1.0 s with Cognito at 100 ms, 14.0 s at 1.4 s, and 15.0 s at 2 s, with all 40 unknown.
  * Because the queue is server-wide, one firm's list also delays other firms' My account reads.
  * Fix (cheap): start the 1.5 s deadline before `acquire`, so a queued read gives up as unknown. Put the measured figures in challenge.md, which now only says "more when Cognito is slow".
* **r2-m2. The 3 s budget fits 5 s only if nothing waits for the firm row lock.**
  * accept and `inFirm` lock the firm row `for no key update` before the provider call (session/service.ts:47, :112), and each holds that lock for its own call of up to 3 s.
  * Two writes in one firm while Cognito is slow can take up to 3 s waiting plus 3 s calling, which is over 5 s. That is round-1 M1's outcome again: Cognito changed, the database rolled back, an unmapped 500.
  * The same outcome follows when an aborted call had already been applied. That case returns 503, and a retry is safe: create, reset and sign-out are idempotent.
  * Found by reading the code; not reproduced, because no database was run.
  * The M1 test compares constants and never reads the callers' transaction options.
  * Fix or declare: a `set local lock_timeout`, or an explicit `{ timeout }` on the three `$transaction` calls, plus a line in the PR.
* **r2-m3. twoStep's fast path skips the email check** (provider.ts:216-217).
  * P4: person A, not enrolled, whose row holds B's live `sub`, reads B's PASSKEY. A reset with that row gets 409.
  * This is acceptable for a read. A foreign `sub` needs a corrupted row, the actions that change something refuse, and the fast path saves one request per row.
  * But the comment at :208-210 ("one held by someone else … reads as a refusal") is true only for a stale `sub`. Fix: correct the comment.
* **r2-m4. Move the pre-enrolment difference (round-1 m3) into the contract.** Add one line to the header of `ports/contracts/identity-admin-port.contract.ts`. Today it is only in PR Question 5, and the repository is the record (AGENTS rule 10).
* **r2-m5. Two items are neither fixed nor answered:**
  * Round-1 m2: a CONFIRMED user is reused, and only `Enabled` is checked. This is defensible, because the invitation proved the person controls that email, but say so in the PR.
  * Break m5: a credentials error with no status maps to 503 UNREACHABLE.

### Dimensions changed since round 1
* D2: 4/5 (r2-m2).
* D5: 4/5.
* D15: 3/5 (r2-m1, declared).
* D16: 4/5 (every fix pinned; the M1 test only compares constants).
* D18: 5/5.
* D19: 2/5, unchanged (R1.5 still does not close on cognito; declared).
* The rest are as in round 1.

### Journey score: 8.1/10, a pass (6.5 of 8 applicable criteria, none at 0)
Details are in `screens/PF-4bc/journey-test-reviewer-2026-11-23.md`, section "Round 2".

Verdict: Approve fa8aefc670f09571572a407c74e5bbcd8c47604a

## Round 3 (head 8d6af7978f6a47bd13e0a6fa0fc046f8b6e79277)

Reviewer: independent session, 24 Nov 2026. Read `git diff fa8aefc67..8d6af7978` for the row's own parts only: d297ce36e (firm-lock.ts, the Gate, error names, contract note, tests), the merge 3e5b97a58 (`git show --cc`: its one conflict in session/service.ts) and 8d6af7978 (module-card rows, randomBytes). Main's own changes in the merge were not reviewed.

**Verdict: Ship (Approve).** Break R2-M1 and R2-M2 are fixed, and the test fails when either fix is removed. No new Blocker or Major. Three new minors (r3-m1 to r3-m3). The first two are about the new 409 FIRM_BUSY reaching callers that never wanted the bounded wait.

### What I ran
* `npx tsx tests/check_pf4bc_cognito_admin.ts`: **46 passed, 0 failed, exit 0** (10 s; PostgreSQL 18 on 127.0.0.1:54329). Also run in a scratch copy of studio (node_modules linked), with the same result.
* Callers on main's code after the merge: `tsx --tsconfig api/tsconfig.json tests/check_pf11c_close.ts` 47/0 (including "an Owner's pending invitation of the closed firm cannot be accepted (410)" and "an invitation accept holding the firm's row makes the close wait"); `check_pf4b_session_reads.ts` 55/0.
* `graph.mjs --check` exit 0. `tsc` was not run: it ran out of memory (exit 134), as in round 2.
* **Mutations** (scratch copy only; every file restored and diffed; the repository's `git status` is clean):

  | Mutation | Result |
  |---|---|
  | (A) the round-2 code: no `lock_timeout`, timeout 5 s | **2 fail.** The R2-M1 race reproduces: "A query cannot be executed on an expired transaction … 5324 ms", and the audit holds only person A while B's app is off at Cognito |
  | (A1) no `lock_timeout`, timeout 8 s | 1 fails (`rb: null`). Both resets complete and the data is consistent, but the test requires FIRM_BUSY |
  | (A2) the bound kept, timeout back to 5 s | 1 fails (the constants check only; the race itself fits 1.5 + 2.7 s) |
  | (B2) a fresh 1.5 s deadline started after the queue (the round-2 shape) | **1 fails:** 40 rows took 15 018 ms |
  | (B1) the Gate's abort listener removed, with the shared signal kept | **passes 46.** See r3-m3 |
  | (C) session/service.ts `inFirm` back to a plain lock with no `FIRM_TX` | **passes 46.** See r3-m3 |

* **Probes** (scratchpad `probe_lock.ts`, `probe_gate.ts`, `probe_race.ts`; scratch databases dropped):
  * **`to default`:** with `ALTER DATABASE … SET lock_timeout = '9s'`, the value is 9s before lockFirm and 9s after it. On a connection back from a rolled-back FIRM_BUSY transaction, `show lock_timeout` is the session's own value (0), so the 1500ms did not leak into the pool.
  * **Lock timeout:** with the row held elsewhere, the result is 409 FIRM_BUSY at 1529 ms. Catching that error and querying again in the same transaction gives **25P02**: the transaction is aborted. That is correct here: lockFirm is the first statement, no caller catches the error, and the 409 rolls the transaction back before any provider call. The regex (firm-lock.ts:17) matches the pg adapter's message, and neither a statement timeout nor a deadlock matches it.
  * **Gate:** 40 rows with Cognito down → all 503 in 1521-1526 ms. Afterwards `held 0`, `waiting []`, and the next reads answer. Four runs of 600 staggered readers, with deadlines of 8-40 ms against answers of 5-12 ms, interleave aborts and releases constantly: at most 4 requests in flight, never a slot lost or doubled, no waiter left behind. In code: `take` removes the abort listener before resolving, and `give` splices `take` out first, so release and abort cannot both win (single thread). A waiter handed a slot just as its signal fires takes the slot, fails fast on the aborted signal and releases it in `finally`.
* **PF-11c merge:** accept takes `lockFirm(pre.firm_id)`, then reads `platform_firm.status` (service.ts:113-116). The closed-firm check is still under the lock that the close also takes. If the close holds the lock longer than 1.5 s, the accept gets FIRM_BUSY, and a retry after the close gets 410.
* **Budget:** the transaction limit (8 s) covers the lock wait (≤ 1.5 s), the provider (≤ 3 s, on a handler that honours abort) and the commit, leaving about 3.5 s for our own queries. The other locks taken after the firm lock (the person's row, the outbox's per-message advisory lock) are short and taken by short transactions. Prisma's `maxWait` 2 s is its default, so nothing changed there.

### Round-2 items
* **Break R2-M1: fixed and pinned** by a real two-reset race on PostgreSQL (mutation A). Two limits remain:
  * The race runs lockFirm and FIRM_TX on their own, not through session/service.ts (r3-m3).
  * The late-answer case (break R2-m1) stays as declared: a retry is safe.
* **Break R2-M2: fixed and pinned** (mutation B2). One FIFO queue per server remains, so one large list can still turn other firms' reads "unknown" for up to 1.5 s, bounded now and honest. 40 warn lines per list load remain.
* My r2-m1 and r2-m2 are closed by the above. r2-m3: the docstring now says the fast path skips the email check. r2-m4: the note is in the contract header. r2-m5 / break m5: `CredentialsError` maps to "not set up", and the expected names are on the list. The CodeQL change (randomBytes) is fine.

### Minors (Should; none blocks)
* **r3-m1. FIRM_BUSY (409) on accept shows "This link cannot be used" with no Continue button.** accept-page.tsx:75 treats every 4xx as the end of the link. So under contention the invitee sees that title above "Someone else in your firm is changing staff right now. Try again in a moment." They recover only by reopening the email link. Before this round, the same contention waited and usually succeeded. Fix: send FIRM_BUSY as 503 "Try again shortly" (as SIGN_IN_PROVIDER_BUSY is), or have the page keep Continue for FIRM_BUSY. Words for the invitee without "your firm".
* **r3-m2. A person's own sign-out now inherits the 1.5 s bound** (service.ts:180-181 → `inFirm` → lockFirm). signOut calls no provider. While a reset with a slow Cognito, an accept, a plan change (Stripe, under the firm lock) or a close holds the lock for more than 1.5 s, sign-out gets 409. frame.tsx:92 then ends the session in the browser, but the server-side revocation row is never written, so the token stays valid until it expires. Fix: keep the plain wait for signOut (only the provider-calling transactions need the bound), or retry once.
* **r3-m3. The wiring of the fix is not pinned.** Mutations B1 and C pass. If session/service.ts drops `lockFirm` or `FIRM_TX` at either call site, no test notices: the race test imports the helper itself. Fix: a cheap source check in the PF-4bc test (the three provider-calling transactions use lockFirm and FIRM_TX), or run the race through `PlatformSession.inFirm`. The Gate's abort listener only saves a hop of the queue (with equal deadlines every queued read still reaches `call` at once and logs), so a short comment is enough there.

### Dimensions changed since round 2
* D2: 4/5 (r3-m2).
* D15: 4/5 (bounded at 1.5 s).
* D16: 4/5 (both fixes pinned, the wiring not; r3-m3).
* D19: 2/5, unchanged (declared).
* The rest are as in round 2.

### Journey score: 8.8/10, a pass (7 of 8 applicable criteria, none at 0)
Details are in `screens/PF-4bc/journey-test-reviewer-2026-11-24.md`.

Verdict: Approve 8d6af7978f6a47bd13e0a6fa0fc046f8b6e79277

## Round 4 (diff-only, b78fbee32)

Reviewer: independent session, 26 Nov 2026. Head b78fbee32ba169643c08334114a48c451777db5b, a pure merge of origin/main (791c6f82f) into 7a7740278.

**Scope:** whether main's changes since 7a7740278 break or interact with the PR's code. The unchanged PR diff was not re-reviewed.
* `git diff --stat 7a7740278 b78fbee32 -- <the PR's 15 files>` is empty: the merge touched no PR file.
* Main's side of the merge is 1 075 commits and 1 024 files. It includes 65bbd0bcc (#3428, the pool P1 fix), which was not in 7a7740278.

**Verdict: Ship (Approve).** Nothing on main breaks the PR or interacts badly with it. No new Blocker or Major. r3-m1, r3-m2 and r3-m3 stay open as Shoulds (no PR file changed).

### What I ran (b78fbee32, PostgreSQL 18 on 127.0.0.1:54329, lane prefix `runtime`, slot 5)
* `run-suites.sh --only "check_pf4bc_cognito_admin.ts check_pf4b_session_reads.ts check_pf4_identity.ts"`:
  * pf4bc: **46/0**
  * pf4b_session_reads: **57/0**
  * pf4_identity: **FAIL** in part B, with "database xr_studio_pf4 does not exist". This is the harness, not the PR. With a lane prefix, run-suites starts the copy `runtime_pf4` on :18541 and maps the port in the usage line. But the suite reads the copy's database from `STUDIO_DB ?? "xr_studio_pf4"` (check_pf4_identity.ts:25), and run-suites.sh (lines 404-417) sets no STUDIO_DB for usage-line suites.
  * Re-run with `STUDIO_DB=xr_studio_runtime_pf4`: **120/120**. CI runs with no prefix, so the default name is right there. Lead note: lanes running this suite through run-suites will see the same false failure.
* `tsx tests/check_contract_seams.ts`: 125/0.
* `graph.mjs --check`: exit 0.
* deploy/cdk `sign-in-task.test.ts` cannot run here (aws-cdk-lib is not installed in deploy/cdk). I reproduced its PF-4bs grant check by hand (below).
* **Probe** `probe_walled_lock.mts` (session scratchpad; scratch database dropped). It runs lockFirm/FIRM_TX through main's `walledPool` + `oneQueryPerCaller`, which is core.ts Db's pool. The PR's own race test uses a plain PrismaClient, so it never meets main's new pool guards.
  * The success path commits.
  * With the row held elsewhere: **409 FIRM_BUSY at 1535 ms**.
  * After FIRM_BUSY, four follow-up reads on the pool see `lock_timeout` 0 (default) and a fresh transaction each time.
  * No `platform_pool_open_transaction` warning, so no client was destroyed. The P1 release check sees the rolled-back client as idle.
  * The M1 end guard does not misread `set local lock_timeout to default` as the end of a transaction.
  * After release, a retry commits.
  * The M2 array-batch refusal fires, and the PR has no `$transaction([...])` (grep).
  * The only error in the probe was at its own teardown (`dropdb --force` with the external pool still open).

### Interactions checked
* **Callers of IDENTITY_ADMIN_PORT / PlatformSession / StaffReads:** still only session/service.ts, session/routes.ts, staff-read/service.ts, staff-read/routes.ts, and features/platform-staff-read.ts (the one factory, `adminFrom`).
  * Main's staff-read change only rewrites `seats()` (seatLimitOf + seatsUsed, QA-774). `twoStep()` and its HttpException → null stay as before.
  * The mentions in limits.ts and terms/service.ts are comments.
  * No new module provides or injects the port. System-identity (PF-17, our own staff) uses no admin port.
* **Duplicate implementations:** none. provider.ts is still the only file that imports `@aws-sdk/client-cognito-identity-provider`. OneTimeCodes and CognitoIdentityAdmin appear nowhere else.
* **Deploy grant (main's PF-4bs, deploy/cdk/lib/service.ts:49):**
  * The PR's provider.ts imports AdminCreateUser, AdminGetUser, AdminGetUserAuthFactors, AdminSetUserMFAPreference and AdminUserGlobalSignOut. All five are granted.
  * Imports plus PENDING equal SIGN_IN_ACTIONS exactly (8 actions), so the test's "missing" and "extra" checks both hold.
  * The test's PF4BC_PROVIDER_IMPORT is byte-for-byte provider.ts lines 1-7 at b78fbee32 (checked).
  * After merge, the PENDING row for #3217 is harmless, as its own comment says.
* **Signatures and error codes:**
  * The PR's imports from main are unchanged: `problem` (keys.ts) and `IdentityConfig` (port.ts).
  * Main's identity/service.ts change is the seat words only (QA-774).
  * FIRM_BUSY, SIGN_IN_PROVIDER_BUSY, INVITATION_NOT_VALID and INVITATION_EXPIRED are unchanged. The suite's 410 checks pass.
* **Transactions and locks:**
  * Main changes no transaction timeout and no pool size. FIRM_TX (maxWait 2 s, timeout 8 s) stands.
  * Main's P1 note concerns a transaction started after maxWait. Under the P1 fix such a client is now destroyed rather than reused. That only helps FIRM_TX.
  * No new code on main locks the platform_firm row.
  * The new foreign keys that reference platform_firm (plat_import_*, ON UPDATE RESTRICT) take FOR KEY SHARE, which does not conflict with lockFirm's FOR NO KEY UPDATE.
* **Web:**
  * Main's frame.tsx sign-out now calls `signOutHere()` (PF-31 drafts) before the POST. That does not change r3-m2: a 409 still ends the session in the browser only.
  * accept-page.tsx is unchanged, so r3-m1 stands.

### Open minors carried (Should; none blocks)
r3-m1 (accept-page.tsx:75), r3-m2 (session/service.ts signOut under the 1.5 s bound) and r3-m3 (wiring not pinned) are unchanged. New, as a note only: the PR's race test still runs on a plain PrismaClient. Running it once through `walledPool` (as the probe does) would pin the pool interaction.

### Dimensions and journey score
* Dimensions: unchanged from round 3.
* Journey score: **8.8/10, a pass** (7 of 8 applicable criteria, none at 0), unchanged. Details are in `screens/PF-4bc/journey-test-reviewer-2026-11-26.md`.

Verdict: Approve b78fbee32ba169643c08334114a48c451777db5b
