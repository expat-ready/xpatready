# PF-4bc break report: `CognitoIdentityAdmin` (API only, no screen)

Head `964275775006a7d4964bbb7c65a436d9a6b4eaa0`, PR #3217. Scope: the Cognito side of IdentityAdminPort (`studio/api/src/platform/identity/session/provider.ts`) and its recorded fake. I ran it only on the fake or on my own SDK `requestHandler`. No AWS call and no network. Scratch scripts: `b1.mts` (hostile answers and leaks) and `b2.mts` (codes, subjects, retries, timing), in the session scratchpad, run with `npx tsx` from `studio/`. The PR's own test passes (30 passed, 0 failed).

## Majors

**M1. A Cognito call can take longer than the transaction it runs in. Cognito changes; our database rolls back.**
- What I did: put a 3 s delay on each fake answer, then called `resetTwoStep`.
- Actual: the call took 6006 ms, and the authenticator app was off at the fake.
- Why it breaks: `resetTwoStep` makes two calls in a row (AdminGetUserAuthFactors, then AdminSetUserMFAPreference) inside `inFirm`'s `$transaction` (service.ts:46, :224). Accept makes AdminCreateUser and maybe AdminGetUser inside its own `$transaction` (service.ts:110, :141). Neither transaction sets a timeout, so Prisma's interactive default of 5000 ms applies (confirmed in `node_modules/@prisma/client/runtime/client.js`: `timeout??5e3`). The adapter allows 10 s per attempt × `maxAttempts: 2`, plus backoff (provider.ts:91, :118-120). The comment at provider.ts:90 says this fits "inside the accept's transaction". It does not.
- Expected: either the whole reset happens, or none of it.
- Actual outcome when the 5 s pass: the second step is turned off at Cognito, then the commit fails. There is no audit line, the reset email in the outbox is rolled back (`dispatch` never runs), and the person's sessions are not ended. This is a silent security change, and it breaks the rule in service.ts:208-209 ("a mail failure changes nothing at the provider").
- Repro: `b2.mts` case 13.
- Fix: give every Cognito call a total deadline well inside the caller's transaction (for example an abort signal of about 3 s for all attempts, with `maxAttempts: 1` when inside a transaction). Or pass a `timeout` on these `$transaction` calls that is larger than the adapter's worst case. Add a test that measures the worst-case time against the transaction's timeout.

**M2. A stale or foreign subject makes sign-out everywhere and the two-step reset report success when nothing happened.**
- Why it happens: `who()` uses the `sub` stored in our database (provider.ts:134). If Cognito has no user with that `sub`, it answers UserNotFoundException, and the adapter treats that as "nothing to end" (provider.ts:157, :166, :170). That happens when someone deleted and re-created the Cognito user (a common fix for a user stuck in FORCE_CHANGE_PASSWORD; only accept ever writes `identity_subject`), or when the row holds a `local-…` subject.
- What I did: created a user, deleted and re-created it in the fake, enrolled an authenticator app, then called sign-out everywhere and reset with the old `sub`.
- Expected: the live user is signed out and their app is turned off, or the call is refused.
- Actual: both calls return `{}`. The live user still has 0 sign-outs and the app still on. The service records `signedOutEverywhere: true` (service.ts:193), emails "Your two-step sign-in was reset" and returns `twoStep: null` (service.ts:225). `twoStep` reads "not set up" for someone who has an app.
- Repro: `b2.mts` cases 8 and 10.
- A related point: a row holding another person's `sub` signs that other person out, and the email is never compared with the user Cognito finds (case 9).
- Fix: when a lookup by `sub` gets UserNotFound, ask again by email. If that user's `sub` differs, refuse with our own 502/409 ("the sign-in record does not match"). Only "no user by either key" counts as "nothing to end".

**M3. The passkey reset is "proved" only by the fake, and the fake contradicts the SDK model it cites.**
- What the fake does: when WebAuthn MFA is turned off, it sets `passkey=false` and drops `WEB_AUTHN` from `ConfiguredUserAuthFactors` (fake-cognito.ts:72, :77). So the test "its reset turns passkey MFA … off" plus `twoStep → null` passes (check_pf4bc_cognito_admin.ts:195).
- What the SDK model says, in the same `models_0.d.ts` the fake quotes: `ConfiguredUserAuthFactors` lists the "authentication types that are available to the user", and "`WEB_AUTHN` can be used as either a first authentication factor or an MFA factor". `WebAuthnMfaSettingsType.Enabled` only "turns passkey MFA on and off".
- What is missing: there is no admin call that deletes a passkey. `DeleteWebAuthnCredential` needs the user's own access token. The staff pool allows the passkey as a first factor (deploy/cdk/lib/service.ts:123).
- Likely result on a real pool: after a reset the lost device's passkey still works as a first factor, and `twoStep` probably still reads PASSKEY. That defeats the reset for a lost passkey (OWASP "Resetting MFA").
- Honesty: this assumption is not in the fake header's "Not verified" list or the PR's question 3.
- Repro: `b2.mts` case 12.
- Fix: make the fake keep `WEB_AUTHN` after a reset. Add the passkey limit to "Not verified" and to the PR's questions for the tech lead (for example, a reset on a passkey user needs a removal step the person does, or is refused). Do not claim the reset clears passkeys.

## Minors
- **m1. A busy Cognito burns the only hand-off code** (provider.ts:174 runs `take` before AdminGetUser). A throttled redeem returns 503 "Try again in a minute", then the same code returns 401 "used or expired" (case 3). Fix: put the code back when the error is in the 503 group, keeping the take atomic.
- **m2. Accept reuses a disabled Cognito user** (provider.ts:145-146 never checks `Enabled`). The staff row and the used invitation commit, and every redeem is then 401 (case 11). Fix: `Enabled === false` → refuse with our own 409 before commit.
- **m3. The log line contains text the provider chose.** Any `__type` of 1-60 letters is logged as-is (provider.ts:128-130). For example `__type: "AKIASCRATCHKEY"` → `refused (AKIASCRATCHKEY 400)` (`b1.mts`). Fix: log only names from a known list, else "Error".
- **m4. `subjectOf` accepts any 1-128 characters of `[0-9A-Za-z-]`** (provider.ts:187). 128 dashes is accepted, and with two `sub` attributes the first wins. Fix: Cognito's `sub` is a UUID, so check for a UUID.
- **m5. A credentials error that is not `CredentialsProviderError`** (no HTTP status) maps to 503 UNREACHABLE "try again in a minute", but it is a set-up problem (`b1.mts`).
- **m6. PR body.** It says "the README gives the source of every shape", but head 964275775 removed the README (the notes are now in the fake's header). "run 2: below" and "`run-suites.sh …`: below" are never filled in.

## What held (attack → result)
- **No invitation email:** every AdminCreateUser sends `MessageAction: SUPPRESS`. No raw body contains RESEND, TemporaryPassword, DesiredDeliveryMediums or ForceAliasCreation, including on repeat creates (case 7).
- **No leaks, 16 hostile answers:** `__type` with spaces; no `__type`; HTML 502; non-JSON 200; a 5 MB message; a namespaced `UsernameExistsException`; a missing `sub`; an injected `sub`; handler throws an Error without a name, a string, `null`, a name containing the secret, ECONNREFUSED; a credentials provider that throws. No secret, key id or AWS message reached a thrown problem or console output (`b1.mts`, "LOG LEAK: false").
- **One-time codes:** three parallel redeems of one code give one success and two 401s. 4:59.999 is accepted and 5:00.000 is refused. A deleted or disabled user is refused at redeem (cases 1, 2, 4).
- **No duplicates on retry:** when a create lands and the connection then drops, the SDK retries → UsernameExists → AdminGetUser, one user with the same `sub` (case 6). One throttle followed by a retry succeeds (case 14).
- **Email case:** `Person@X.com` and `person@x.com` give one subject. The pool has `signInCaseSensitive: false` (cdk service.ts:127), and invitations are stored lowercased (identity/service.ts:67).
- **Injected subject:** it is sent JSON-encoded as `Username`. The pool id cannot be changed (case 10).
- **Misconfigured pool:** no pool or a pool outside ca-central-1 → 503 with no request made (PR test). A pool that does not exist → ResourceNotFound → SIGN_IN_NOT_SET_UP.
- **PR limits 1-3** (the callback is not yet on Cognito, codes live in one process's memory, the TOTP re-enrol is not verified on a real pool) are stated honestly. Only the gaps in M3 and m6 above are not.

Verdict: Changes 964275775006a7d4964bbb7c65a436d9a6b4eaa0

## Round 2: head `fa8aefc670f09571572a407c74e5bbcd8c47604a`
I ran only on the fake or my own SDK `requestHandler`, with no AWS call and no network. One probe ran against a scratch PostgreSQL 18 that I started on :54391 and have since stopped. The scratchpad scripts are `b2r.mts` (round 1 re-run), `b3.mts` (attacks on the fixes), `b4.mts` (late answer, and the transaction with real Prisma) and `b5.mts`. The PR's test: 42 passed, 0 failed.

**Round 1, re-run:**
- **M1: closed for one call on its own.** With 3 s answers the reset stops at 3001 ms with 503 and the app stays on. With 0.99 s answers it completes in 2980 ms. My old case 13 still took 9010 ms, but its delay ignores the abort signal. The SDK's own handler honours the signal, so that run does not count. See R2-M1 for what is still open.
- **M2: closed.** A stale `sub`, a foreign `sub` and a `local-…` subject now get 409 SIGN_IN_ACCOUNT_MISMATCH, and the live user is not touched (cases 8-10).
- **M3: closed as far as honesty goes.** The fake keeps `WEB_AUTHN` after a reset, the limit is in "Not verified", and provider.ts:126-127 says the passkey stays. Still unproven until C21: whoever holds the lost passkey device may still sign in with the passkey and then set up their own second step.
- **m1 closed:** the code is given back on 503. **m2 closed:** a turned-off user gets 409. **m3 closed:** a name not on the list prints as OtherError. **m4 closed:** see S1 below.
- **m5 open:** a plain credentials error still maps to 503 UNREACHABLE.
- **m6 not re-checked:** I did not read the PR body, because this round runs without network.

### Majors
**R2-M1. Waiting for the firm's row lock is not inside the 3 s budget, so round-1 M1 can still happen: Cognito changes and our database rolls back.**
- Why: every caller first takes the firm's row lock, `for no key update` (session/service.ts:47 for reset and sign-out everywhere, :113 for accept). The transaction that holds the lock keeps it for its own Cognito calls, up to 3 s. Prisma's 5 s timeout includes the time spent waiting for the lock. So the wait (up to 3 s) plus our own calls (up to 3 s) can pass 5 s.
- What I did (`b4.mts` T1): real Prisma and Postgres, the real adapter, and the fake answering each request in 0.9 s. Two resets in the same firm, at the same time, each run the way `inFirm` runs: take the lock, `resetTwoStep`, write an audit row.
- Actual: the first finishes at 2715 ms. The second fails with "A query cannot be executed on an expired transaction". Its audit row is gone, but its authenticator app is off at Cognito. That is round-1 M1 exactly: no audit line, no notice, sessions not ended. A transaction-expired error also reaches the client as an unmapped error, not the port's 503.
- The same happens with reset plus sign-out everywhere, or with two accepts in the same firm.
- The comment at provider.ts:95-96 ("the rest left to the commit") claims a fit that does not hold under contention.
- Fix: size an explicit `{ timeout }` on these three `$transaction` calls to cover the longest lock wait plus the deadline plus the commit, or give the adapter the time left in the transaction. Test it with two concurrent resets in one firm.

**R2-M2. A slow Cognito makes the Team list wait 16-39 s and holds up every firm on the server.**
- Why: the Gate caps how many reads run at once (provider.ts:102-107, :213). Each read has a 1.5 s deadline, but the time a read waits in the queue has no deadline.
- What I did (`b3.mts` G2): Cognito not answering. With 40 rows the list took 16 518 ms, and with 100 rows 39 051 ms. A My account read that started at the same moment waited the same 16.5 s / 39 s.
- Why it spreads: the Gate is one first-in-first-out queue per server, so one large firm's list holds up every other firm's panel and My account reads. Above about 150 rows a typical 60 s proxy timeout would probably fail the whole list.
- It contradicts challenge.md ("the list itself never fails", "about 1 s … more when Cognito is slow") and review M2's fix condition ("the list cannot wait on the provider longer than its budget"). Each failed row also writes its own warn line (40 lines per list load).
- Fix: one deadline for the whole list, shared by all its rows, with rows not reached shown as unknown. Alternatively, count queue time against the 1.5 s, or stop calling Cognito for a while after repeated timeouts. Test: 40 rows with Cognito not answering → the list answers in about 2 s.

### Minors
- **R2-m1. A late answer still leaves Cognito changed while our database rolls back** (`b4.mts` D2). AdminSetUserMFAPreference is applied, then its answer arrives after 3 s. Actual: 503 "could not be reached", the app is off at Cognito, and the transaction rolls back. A retry brings the two back in line, because the reset can safely be repeated. But the words are wrong: Cognito was reached. And the PR test's claim "never turned off" (check_pf4bc_cognito_admin.ts:119) holds only when the request was never sent. Fix: say so in the comment and the PR, and word the 503 as "may have been changed; try again".
- **R2-m2. A mismatch now blocks our own sign-out too.** service.ts:189-192 writes the revocation row, then the provider's 409 rolls the whole transaction back. So for a person whose `sub` no longer matches, an admin cannot end their sessions even on our side. Our revocation row alone would have stopped their tokens. Fix: a design call for the tech lead (commit our revocation and report the provider part as not done). Deactivating the person remains a way round it.
- **R2-m3. twoStep's fast path by `sub` (provider.ts:216-217) skips the email check.** If a row holds another person's `sub`, or another person's email as its subject, it reads that person's state. In F1, "TOTP" was shown for someone with nothing set up, while reset on the same row correctly gives 409. It is a read only. Fix: compare the email from AdminGetUser, or show such a row as unknown.
- **R2-m4. Parallel redeems while Cognito is busy** (R1b): a second request during the first gets 401 "used or expired". The first then gets 503 and gives the code back, and the code works again. The person sees a refusal for a link that works. Low impact.
- **R2-m5. Logging gaps.** A malformed 200 (a bad `sub`) gives a 502 with no log line at all (L1). Names the adapter itself expects are not on the known list, so they print as OtherError: `InvalidUserPoolConfigurationException` (WebAuthn sent to a pool without user verification, test line 100) and `UserNotConfirmedException`.

### What held in round 2
- **Deadline, mid-retry:** a throttle at 2.8 s, then the backoff → stopped at 3097 ms with 503 and no write sent (D1).
- **Deadline as a whole:** it bounds the whole call (credentials, retries and backoff), provided the handler honours the abort. The real NodeHttpHandler does; a handler that ignores it ran for 9 s (D3).
- **Gate:** it releases on throw (4 × 502) and on abort (4 × 1501 ms), and the next 4 reads answer at once (G1). 1000 parallel reads: 285 ms, never more than 4 at once, no slot lost (G3). There is no deadlock path while the handler honours the abort.
- **find():** a null subject is found by email. A user deleted at Cognito → nothing to end (F3). Email case is normalised on both sides.
- **giveBack:** after expiry it gives 401, because the original expiry is kept (R1). A code is never used twice. It is also given back on a 502, which does no harm (R1c).
- **subjectOf:** a missing `sub`, two `sub`s, 128 dashes, leading or trailing whitespace and full-width digits → 502. Upper-case `sub`s are stored lower-case.
- **Round-1 leak cases:** all 16 hostile answers give LOG LEAK false. No error name from outside the list is printed.

Verdict: Changes fa8aefc670f09571572a407c74e5bbcd8c47604a
