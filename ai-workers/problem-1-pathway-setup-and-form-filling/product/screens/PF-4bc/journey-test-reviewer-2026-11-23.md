# PF-4bc journey test, reviewer role, 23 Nov 2026

Head 964275775006a7d4964bbb7c65a436d9a6b4eaa0. **PF-4bc is an API adapter with no page.** So the browser walk, axe, the screen widths and keyboard testing (skill steps 2 and 3) do not apply. I walked the journeys through the port, on the recorded fake Cognito: the PR's test plus my own probes in the session scratchpad. I could not run PostgreSQL or the app on `PLATFORM_IDENTITY=cognito` in this session, and there is no live pool. The journey continues past the adapter (callback and set-password page), but those are declared out of scope in PR #3217 Questions 1-2.

## Journeys (persona · goal · expected · what happened)
1. **Invitee accepts the invitation (main path).** createUser sends SUPPRESS once and returns the `sub`; then the hand-off.
   * Held: one AdminCreateUser with SUPPRESS and email_verified, the `sub` returned (test: contract case 1, SUPPRESS check).
2. **Invitee accepts again after a rolled-back accept (alternate).** Expected: the same subject and no new invitation email.
   * Held: AdminCreateUser → UsernameExistsException → AdminGetUser; no RESEND.
   * But an existing user who has already set up their account is reused without any check (review m2).
3. **Invitee opens the hand-off link (cross-boundary step).** Expected: the code says who signs in, once.
   * Held, on both adapters.
   * Beyond this step the journey does not close on cognito: callback goes to localSignIn and gets 403 (declared).
4. **Cognito busy while the invitee redeems (error and recovery).** Expected: "try again", and retrying works.
   * Probe: 503 SIGN_IN_PROVIDER_BUSY, then 401 "Sign in again" on the retry. The code is burned, and the invitee has no password (review m1).
5. **Owner resets a person's two-step sign-in (main path for the Owner).** Expected: app turned off at the provider; sessions ended, audit line and notice in one transaction.
   * Held on the fake.
   * With slow answers (2 × 3 s = 6.0 s, probe), the call outlasts Prisma's 5 s transaction. The provider changes but the audit line and the notice roll back (review M1).
6. **Owner signs a person out everywhere.** Expected: AdminUserGlobalSignOut for that person only, by `sub`.
   * Held (contract case 5; the `sub`-else-email test). The same timeout risk as journey 5 applies.
7. **Owner opens the Team list (read).** Expected: one request per view.
   * One AdminGetUserAuthFactors per staff row; refusals show as unknown (review M2).
8. **Server without a pool or role (wrong set-up).** Expected: a plain 503 saying why, and no request.
   * Held: no pool or a non-ca-central-1 pool → 503 SIGN_IN_NOT_SET_UP and no call. NotAuthorized/AccessDenied → 503 "not set up".
9. **Break it.**
   * Provider message carrying the key and secret: never returned or logged (held).
   * Odd error name containing a secret: logged as `Error` (held).
   * Retry count: `maxAttempts: 1` still passes the test (review m4).

## Data underneath (on the fake's record of requests)
* Requests: every request is real SDK output (X-Amz-Target, signed with the given key id). The pool id is on every request, and SUPPRESS is on every create.
* Two-step: TOTP is off after a reset. The passkey after reset is modelled by an undeclared assumption (review m5).
* DB rows: not checked, because there was no database in this session.

## Score
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | The row's adapter calls all work on recorded answers; 30/30 checks, run twice |
| Next step obvious | ½ | The port's words say "try again" / "tell support"; journey 4 leaves no next step |
| Plain words | 1 | Our own words on every error; never the SDK's text |
| Feedback and state | ½ | The Team list shows refusals as unknown; the state after a passkey reset is unverified |
| Correct data | ½ | Journey 5: a provider change can commit with no audit line (M1) |
| Error recovery | ½ | Idempotent create is good; a burned code is not (m1) |
| Accessibility and screen sizes | n/a | No page |
| Speed | 0 | One provider call per row (M2), up to about 20 s per call (M1) |
| Visual quality | n/a | No page |
| Trust and sources | 1 | Shapes are cited to the SDK model and unverified points are listed (m5 is missing from that list) |

**5 of 8 applicable criteria (6.3/10), with one criterion at 0. Not a pass.** Fixes that raise it, most valuable first:
1. Fit the provider budget inside the transaction (M1). This raises correct data and speed.
2. Declare or cap the per-row reads (M2). This raises speed.
3. Keep the code on a transient error (m1). This raises next step and recovery.
4. Declare the passkey-reset assumption (m5). This raises feedback and state.

Not tested: a real screen reader, an intended user's unaided walk (D17/D20 stay with the founder), a live Cognito pool (C21), and the database-backed check_pf4b_session_reads.ts.
