# R1.5 shape: staff sign-in with two-step, passkeys, lock-out on leaving (J-5)

Shaped 21 Nov by the screens lane on `main` 295661385 (P-604, P-606). Requirement text read: `trace-requirements.py --brief PF-4`
(AG-1-15, AG-1-40, AG-1-42) and the PF-4b, PF-4bc, PF-4s, PF-6 and J-5 rows of `BACKLOG.md`. `--brief R1.5` prints nothing:
R1.5 is not a BACKLOG row id; its parts are PF-4, PF-4b, PF-4bc, PF-4s, PF-6 and J-5.

## Where each line of R1.5's Done when stands on main (qa/CAPABILITIES.md row R1.5)

| # | Done when line | On main | Proof today |
|---|---|---|---|
| L1 | Sign-in only with the second step | Met by the API. Local: a token without `otp` in `amr` → 401 `TWO_STEP_REQUIRED`. Cognito: the pool is trusted to require it (setting `PLATFORM_POOL_MFA_REQUIRED`) | `check_pf4_identity.ts`. Not on screen: the stand-in card always sends `secondStep: true` (`web/src/modules/platform/session.ts:96`) |
| L2 | Wrong code, expired code, repeated wrong tries refused in words | **Not in our app, by design.** The approved concept (`pf-6-staff` r2, Journey) puts the password, the second step and the passkey on the identity provider's own pages (Cognito managed login). Our app receives only `/sign-in/callback#code=…` | Can be shown only on a real Cognito pool |
| L3 | A passkey signs in on the real pool | Not provable in CI. Needs PF-4bc (the `cognito` side of `IdentityAdminPort`; today it answers 503 `SIGN_IN_NOT_SET_UP`) and a pool in the founder's AWS account (C21) | none |
| L4 | A removed or deactivated member is signed out of every device at the next request | Met by the API: a revocation row; the guard refuses every token signed in at or before it (PF-4, PF-4b) | `check_pf4_identity.ts`, `check_pf4b_session_reads.ts`. Not walked by screens |
| L5 | Walked by screens once a sign-in screen exists | Screens are on main: the stand-in sign-in card, Team, the Person panel (Sign out everywhere, Deactivate, Reactivate), Accept invitation, Signed in elsewhere (PF-6 parts 1, 2a, 2b) | No journey test: `tests/journeys/j_5.ts` does not exist |

The qa row's "Missing: PF-4b" is out of date: PF-4b merged in #1816 (15 Nov) and PF-Lc in #1820. Still missing: PF-4bc, PF-4s,
J-5, and the live proof.

## Parts

**Part 1: J-5 part 1, the journey test (screens lane, this PR).** It adds no feature. `tests/journeys/j_5.ts` walks the
screens on main on an isolated copy (`PLATFORM_IDENTITY=local`, its own database and port, never :4400) at 1440 px:
* `J-5 W1`: the Owner signs in → Team → Invite people (Case Officer) → in a second browser the invitee opens the link from the
  demo inbox → Accept → signed in, their name in the header.
* `J-5 W2`: a second device's sign-in ends the first ("Signed in elsewhere"); the Owner, Person panel → Sign out everywhere →
  the invitee's next click shows the sign-in card (no reason on it: see "Found while building"); they sign in again.
* `J-5 W3`: the Owner → Deactivate with a reason → the invitee's next request is refused (401 in words by the API) and the
  sign-in card shows, without a reason; their sign-in is refused on screen with "This staff account is not active. Ask your
  firm's Owner or Admin."
* `J-5 W4`: Reactivate → the invitee signs in again with the same roles (AG-1-15: reversible). The walk ends at R1.6's first
  step, the Person panel's roles.
* `J-5 DW1`: the deactivated person's old token, not yet expired, gets 401 on `/api/platform/me` at the next request (not at
  expiry). The revocation row and the audit line (before and after) are read back from the database.
* `J-5 DW2`: no second step → 401 `TWO_STEP_REQUIRED` in words at the sign-in door (missing, false, the text "true"), with a
  control (the same request with it works). A token whose `amr` lacks `otp` is PF-4's `check_pf4_identity.ts`, not repeated.
* axe-core on the sign-in card, Signed in elsewhere and the Person panel. Screenshots go in `screens/J-5/screenshots/`.

**Touch:** `prototype/studio/tests/journeys/j_5.ts` (new) and `product/screens/J-5/*`; after the breaker's B1 and B2 (below),
`api/src/platform/identity/service.ts`, `tests/check_pf4r_lockout_race.ts` (new) and `api/src/platform/MODULE.rows/R1.5.md`. Files of the open PRs for the 32 (#2608, #2556, #2326, #2568, #2478) were read: none is touched.
**Done when:** `J-5 W1..W4` and `J-5 DW1..DW2` exit 0 on a fresh isolated copy built from the branch, and once in a visible
browser at 1440 px. Reviewer Approve at the head, plus a breaker run (permissions).

**Part 2: PF-4bc (runtime lane; ready: PF-4b and PF-Lc merged).** As its BACKLOG row says: the port's contract tests pass on
the `cognito` adapter as on the stand-in, using recorded responses; `MessageAction=SUPPRESS`; no raw AWS message; no credential
in a log line.

**Part 3: the live proof (the founder's AWS, C21; not a merge gate).** On a real pool in ca-central-1: L2 (wrong code, expired
code, repeated wrong tries, as Cognito words them) and L3 (passkey sign-in), recorded with screenshots and dates, plus the pool
settings checked against AWS's own pages (PF-4b's first step).

## What is not met after part 1
L2 and L3. qa can score part 1's walk tomorrow, but R1.5 stays Partial until part 3 runs. That is why part 1 carries no
`Completes: R1.5` unless the tech lead rules otherwise (question 1 in the PR).

## Found while building (breaker, 20 Nov; `break-report.md`)
* **B1 Major, fixed here:** a Deactivate or Sign out everywhere raced by the person's parallel sign-ins answered 500 (7 of 10):
  the sign-in locked the person, then the firm; staff changes lock the firm, then the person; Postgres deadlocked. The
  sign-in now takes the firm's row first (key share), as every staff change does.
* **B2 Major, fixed here:** a sign-in checked "active" before its lock and was dated after the deactivation, so reactivation
  brought its token back. The sign-in now re-checks the person under the lock (refused 401 STAFF_NOT_ACTIVE; the Cognito path
  too), and a deactivation's revocation is never earlier than the person's latest sign-in. Fail test:
  `check_pf4r_lockout_race.ts` (1/5 on main's code, 5/5 after, twice).
* **B3 Minor, not fixed here (a question for the tech lead):** after a lock-out the sign-in card gives no reason; the frame
  keeps only the 401's code (`web/src/modules/platform/session.ts:82`, `frame.tsx:98`). EXPERIENCE §2.7 "Reasons everywhere".
