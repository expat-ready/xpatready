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

## Round 2 (head fa8aefc670f09571572a407c74e5bbcd8c47604a)
I walked the same journeys through the port on the recorded fake: the PR's test (42/0) plus probes P1–P7 (`r2probe.mts`, session scratchpad). There is still no page, no database run and no live pool.

* **2. Accept again:** reuses the existing account; a turned-off user → 409 SIGN_IN_ACCOUNT_DISABLED (test). A CONFIRMED user is still reused (r2-m5).
* **4. Cognito busy at redeem:** 503, then the same code works (test). If the code expires meanwhile it is refused (P5). Three parallel redeems give one success (P6). **Fixed.**
* **5. Owner resets two-step, with slow answers:**
  * 503 at 3001 ms, the app still on, nothing sent (test; P1b).
  * At normal speed the reset completes.
  * Under firm-lock contention the budget can still pass 5 s (r2-m2, from code).
* **6. Sign out everywhere, stale or foreign `sub`:** 409 SIGN_IN_ACCOUNT_MISMATCH, nobody touched. With the right `sub` it reaches the live user (test). **Fixed.**
* **7. Team list:** one request per person, at most 4 at a time.
  * 40 rows: 1.0 s with Cognito at 100 ms, 14–15 s when Cognito is slow (P3, r2-m1).
  * A row holding another person's live `sub` shows that person's state (P4, r2-m3).
* **9. Break it:**
  * An unknown error name is logged as OtherError.
  * A `sub` that is not exactly one UUID → 502.
  * The Gate is released after throttles and aborts (P2).
  * An abort is never retried (smithy `isTransientError`).

| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | Every adapter call works on recorded answers; 42/42 |
| Next step obvious | 1 | A busy redeem keeps the code. A mismatch or a turned-off account says "contact support" |
| Plain words | 1 | Our own words on every error |
| Feedback and state | ½ | "Not set up" after a passkey reset is unverified on a real pool (declared). A foreign `sub` reads another person's state (r2-m3) |
| Correct data | ½ | Fixed for a lone caller. Contention can still roll back after the provider changed (r2-m2) |
| Error recovery | 1 | The code is kept. Create, reset and sign-out are safe to retry after a 503 |
| Accessibility and screen sizes | n/a | No page |
| Speed | ½ | 40 rows in 1.0 s when Cognito is healthy; 15 s when it is slow, queued across firms (r2-m1) |
| Visual quality | n/a | No page |
| Trust and sources | 1 | The passkey limit and the N+1 are declared (fixture header, challenge.md, PR Questions 3–4) |

**6.5 of 8 applicable criteria (8.1/10), none at 0. A pass.** Fixes that would raise it:
1. Start the read deadline before the Gate (r2-m1). This raises speed.
2. A lock or transaction bound on the three callers (r2-m2). This raises correct data.
3. Correct the fast-path comment, or add the email check (r2-m3). This raises feedback and state.

Not tested: a screen reader, an intended user's unaided walk (D17/D20 stay with the founder), a live Cognito pool (C21), and the database-backed suites.
