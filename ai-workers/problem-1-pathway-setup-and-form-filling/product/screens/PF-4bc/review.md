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
