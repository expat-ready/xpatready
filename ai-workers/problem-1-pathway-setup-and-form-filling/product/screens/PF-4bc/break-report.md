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
