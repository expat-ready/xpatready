# J-5 break report: permissions and sessions (P-303 breaker)

PR #2627, branch `claude/nifty-fermat-feao23`, head 032102334 (identity code identical to main 3abfe81cc; the PR adds only
`tests/journeys/j_5.ts` and `screens/J-5/*`). Isolated copy `j5b` on :4416, `PLATFORM_IDENTITY=local`, a fresh database for
each probe round (`isolated.sh j5b 4416 start --ttl 40 … && trap … stop && node probe.mjs`), stopped afterwards; never :4400.
Probes ran by API (Node fetch plus psql on `xr_studio_j5b`) and in headless Chromium at 1440 and 1024 px. Live AI off, US$0.
Sample Owner R (`user-R`), Case Officer O (`user-O`), T (`user-T`, made an Admin by R), solo Owner S (`sample-solo`).

## Defects in the app on main (j_5.ts neither causes them nor finds them)

**B1 Major: a sign-in at the same moment makes deactivation and Sign out everywhere fail with 500 (deadlock).**
Steps: O runs 3 parallel loops of `POST /api/platform/session/local {firmKey:"sample-firm", email:O, secondStep:true}`.
Meanwhile R sends `POST /api/platform/staff/{O}/deactivate {reason}` 10 times, 150 ms apart, reactivating after each 200.
* Expected: 10 × 200, so the person is locked out.
* Actual: `500,500,200,200,200,500,500,500,500,500`. Sign out everywhere, the same way: `200,500,500,500,500,200,500,500,200,500`.
* `pg_stat_database.deadlocks` for the copy went up by 32, then by 28. The sign-in door itself answered 500 72 times
  (Prisma P2010/P2028 in `var/isolated-logs/j5b-api.log`).
* Baseline: with nobody signing in, 5 of 5 deactivations answered 200.
* Likely cause, a lock-order inversion: sign-in locks the person's row first (`identity/service.ts:138`
  `select … for update`), then writes rows that reference the firm (`:147`, `:148`). Deactivate and Sign out everywhere
  lock the firm row first (`identity/service.ts` `inFirm`, `session/service.ts` `inFirm`), then write the person's row or
  a revocation that references it (`service.ts:283`, `session/service.ts:65`).
* Impact: someone who is leaving, signing in from a script or from several devices, makes most lock-out attempts fail.
  The Owner sees a server error instead of the lock-out.

**B2 Major: a token minted after the deactivation comes alive at reactivation without a new sign-in.**
Steps: 6 parallel sign-ins of O, with R's deactivate sent 3 ms later (`p6.mjs`). Reproduced in 2 of 3 rounds.
* Round 2: deactivation `revoked_at` 22:07:09.574Z. Four sign-ins answered 200 with `auth_time` 22:07:10.585–.613Z,
  after the deactivation, and wrote 4 `platform.staff.sign_in` audit lines dated after it. `last_sign_in_at` moved to
  22:07:10.613Z.
* While O was deactivated, each of those tokens got `401 STAFF_NOT_ACTIVE`, as it should.
* After R's reactivate (200), the same token answers `GET /api/platform/me` → **200**. O never signed in again.
* Expected: an old token stays dead after reactivation, and a deactivated person is issued no token and gets no
  sign-in line.
* Cause: `localSignIn` checks `status === ACTIVE` before taking any lock (`service.ts:162`). `recordSignIn` locks the
  row but never checks the status again (`service.ts:136-151`). Its time `max(now, last+1, revoked+1)` is then dated
  after the deactivation's revocation (`:165`).
* The Cognito path checks the status in `authenticate` before its own `recordSignIn` (`service.ts:119,122`), so it has
  the same race, with a narrower window.

**B3 Minor: after lock-out, the sign-in card does not say why.**
After Sign out everywhere or Deactivate, the next click shows a blank "Sign in to your firm" card.
* `frame.tsx:98` renders `<SignInCard focus />` without the server's reason. Words such as "This staff account has been
  deactivated…" only appear if the person tries to sign in again.
* Screenshot: `screens/J-5/screenshots/W3-deactivated-next-click-1440.png`.
* Shape W2/W3 say "in words". PF-6's review accepted the plain card for a revoked session, so this is a shape-versus-app
  gap for the tech lead to rule on.

## Gaps in j_5.ts's coverage (the test passes; these are not checked)

1. **No concurrency at all.** B1 and B2 are invisible to the walk: it runs every sign-in and deactivation one after
   the other.
2. **The old token after reactivation is not tried.** W4 never sends the pre-deactivation `liveToken`
   (`j_5.ts:150`) again after reactivation (`:182`). In a calm run it does stay dead: `401 SESSION_REVOKED`, as my
   `p2.mjs` showed. Under the race it does not (B2).
3. **DW2's token half is missing.** The shape (DW2) asks for "a token whose `amr` lacks `otp`" → 401. `j_5.ts:17` hands
   this to `check_pf4_identity.ts`, and the journey covers only the sign-in door.
4. **DW1 tries `GET /platform/me` only.** It does not try a write, front-office, runtime, terms or sign-out route. All
   of those hold (see below), but they are untested here.
5. **W2/W3 "in words" is only checked at re-sign-in.** W3 step 2 (`:170`) checks that the card shows and the name is
   gone, not any words (see B3).
6. **No wrong-role attempts.** There is no Admin, Case Officer or other-firm attempt to deactivate or sign out (all hold
   below).

## What held

* **Second step.** `secondStep` omitted, `false`, `"true"`, `1`, `"1"`, `[true]`, `{value:true}`, `null`, form-encoded
  `secondStep=true`, and `__proto__:{secondStep:true}` → all `401 TWO_STEP_REQUIRED` with no token. Only `true` passes.
  A duplicated JSON key takes the last value, which is standard JSON.
* **Crafted tokens.** These all gave `401 TOKEN_REFUSED`: `sub` swapped to R with the old signature, `alg:none`, a
  43-character fake signature, and a token from an earlier start (new random key). A token in `?access_token=` or a
  two-value Authorization header gives `401 NOT_SIGNED_IN`. Lower-case `bearer` is accepted, which is correct.
* **A deactivated token on every kind of route.** These all gave `401 STAFF_NOT_ACTIVE`, in words:
  * `GET /platform/me`, `/staff`, `/staff/:id`
  * `GET` and `PUT /me/account`
  * `GET /me/terms`, `POST /me/terms/accept`
  * `POST /session/sign-out`, `/me/notifications`, `/staff/:id/sign-out-everywhere`, `PUT /staff/:id/credential`
  * `/offices`, `/roles`
  * `/front-office/bookings`, `/front-office/booking-types`
  * `/runtime/cases/:id/decisions`
  * a trailing slash, and `HEAD`
* **Odd paths.** `/PLATFORM/me` → 403 from the Studio's guard (no data). `//me`, `;x=1`, `%2f` → 404.
* **Ending sessions.** After Sign out everywhere, the old token → `SESSION_REVOKED`. A sign-in in parallel with Sign out
  everywhere: the old token and the parallel one both refused; the next sign-in works. After your own sign-out, the
  token is refused, and a second sign-out with it is refused too. After a calm reactivation, the old token stays dead.
* **Roles and firms.** An Admin deactivating, signing out everywhere or resetting two-step for the Owner →
  `403 OWNER_ONLY`. The Case Officer on any of these, including themselves → `403 MISSING_PERMISSION`. The other firm's
  Owner, guessed UUIDs, upper-case UUIDs, non-UUIDs, and S acting on sample-firm people → `404 No such staff member`.
  The only Owner deactivating themselves → `403 ONLY_OWNER`. A missing, blank or 5,000-character reason → 400.
* **No leaks from the sign-in door.** An unknown firm, an unknown email, and another firm's email all get the same
  `401 UNKNOWN_STAFF` words.
  * Note: without the second step, the door tells an unknown email (UNKNOWN_STAFF) apart from a known one
    (TWO_STEP_REQUIRED) and from a deactivated one (STAFF_NOT_ACTIVE). The stand-in has no password, so this exposes
    nothing extra. Cognito's managed login replaces it.
* **The UI after lock-out.** A deactivated Admin's open Team page keeps showing the staff list until their next action,
  and a focus event does not end it (L4 promises "at the next request"). Their first click shows the sign-in card: the
  Team list is gone and no panel or dialog is left. Back and reload show the card too, and the stored token is cleared.
  At 1024 px the first Tab lands on the frame's home link.

Probe scripts and screenshots (scratchpad, not committed): `/tmp/claude-0/-home-user-xpatready/77f06a84-9440-5f11-8649-acdba98d353a/scratchpad/p1b.mjs`, `p2.mjs`–`p7.mjs`, `ui-1-idle-after-deactivation.png`, `ui-2-next-click.png`.

## Re-break aff1fd011 (20 Nov, the fix for B1 and B2)

Fresh copy `j5c` on :4436, built from aff1fd011 (`PLATFORM_IDENTITY=local`, a fresh database per run, stopped after; not
4405, 4416 or 4421). I re-ran `p1b`, `p2`–`p6` and the new `p8` and `p9`. `p7` (the UI) was not re-run: the frame is
unchanged. Log: `var/isolated-logs/j5c-api.log`.

**R1 Major: B1 is not fixed. The deadlock is gone, but deactivation now starves behind sign-ins.**
* Postgres deadlocks are now +0, and no sign-in answers 500 any more (31,006 and 39,611 in the loops below).
* Steps: 4 parallel loops of `POST /session/local` while the Owner sends `POST /staff/{O}/deactivate` (`p9.mjs`, a
  client timeout of 60 s).
* While O (the person being deactivated) signs in, only 1 of 7 changes went through:
  `500/38267ms, 200/37ms, re:200, 500/44938ms, no answer in 60 s, 500/8400ms, no answer in 60 s`.
* While T (a colleague, not the target) signs in, 0 of 6 went through:
  `no answer in 60 s, 500/17340ms, no answer ×3, 500/12826ms`.
* `p4` (3 loops of O): deactivate failed 3 of 10 and Sign out everywhere 7 of 10, every failure a 500.
* An earlier run had one deactivate with no answer for 300 s (status 499 at 300,422 ms).
* With nobody signing in, the same deactivate answered 200 in 21 ms.
* The 500s are Prisma P2028 (transaction timeout) at `identity/service.ts:194` and `session/service.ts:48`. In both
  places `inFirm` asks for `platform_firm … for update`.
* Likely cause: sign-ins now take `for key share` on the same firm row (`service.ts:148`). Postgres lets a new
  key-share locker join while a `for update` waits, so a steady stream of sign-ins starves the change.
* What changed:
  * Before, only the target's own sign-ins hurt.
  * Now any colleague's sign-ins block every staff change in the firm: deactivate, reactivate, roles, invitations,
    Sign out everywhere.
* The leaving person can still block their own lock-out with a script. On Cognito the provider limits how fast
  sign-ins come, so the window is narrower.

**R2 Minor (from the code; Cognito cannot be tested here): a provider sign-in made while deactivated works after
reactivation.**
* `deactivate` neither disables the person at the provider nor signs them out there. Only Sign out everywhere calls
  `IdentityAdminPort`.
* So on Cognito the person can sign in while deactivated. Their token is refused before `recordSignIn` runs
  (`service.ts:121`), so nothing is recorded.
* After reactivation, that token's `auth_time` is later than the deactivation's revocation, so it is accepted.
* The new `"inactive"` branch only closes the narrow race. It is a real two-step sign-in by the person, hence Minor.
  This belongs with PF-4bc.

**Held on aff1fd011**
* **B2 is fixed.**
  * `p3`, 8 rounds × 25 sign-ins against a deactivation: 0 tokens dated after it, 0 alive after reactivation, and 0
    sign-in audit lines while deactivated.
  * `p6`: 0 live race tokens. `p4`: 0.
  * The sign-in that loses the race now answers `401 STAFF_NOT_ACTIVE`.
* **Sign-ins during reactivate** (8 rounds of 6): `200×8, 401×48`. No token was dated at or before the deactivation.
* **Sign-ins during role changes:** 56 × 200. The newest token reads the new roles each time.
* **Sign-ins during invite, resend and revoke:** `200×80, 201×5`, no 5xx.
* **Load:** no 5xx in any of these:
  * 60 parallel sign-ins of 3 people across two firms: p50 219 ms, max 343 ms.
  * 60 parallel sign-ins of one person: p50 404 ms, max 616 ms.
  * 150 parallel sign-ins of 2 people: p50 540 ms, max 896 ms.
  * People do not wait for each other. One person's sign-ins still run one after another, as designed.
* **Everything that held before still holds:** the second-step variants (`p1b`, `p5`), crafted tokens, deactivated
  tokens on every route, Sign out everywhere and your own sign-out, the old token after a calm reactivation (`p2`), and
  the role and firm limits (`p5`).
* I wrote no token file outside the scratchpad (searched: none).

## Re-break 6a71adf5 (20 Nov)

**Setup.** Fresh copy `j5d` on :4446, built from 6a71adf57 (a fresh database per run, stopped after). I re-ran `p3`,
`p4`, `p8` and `p9`, plus three new probes:
* `p10`: a sign-in stream against each staff change and against terms accept;
* `p11`: invite, resend and revoke under a stream, with 200 seats lent so the plan limit does not refuse;
* `p12`: invitation accept under a colleague's stream.

Each stream was 4 parallel sign-in loops. In every run, Postgres deadlocks were +0 and no sign-in answered 5xx.

**R1 is fixed.** With nothing left to starve, every change landed in tens of milliseconds:

| Sign-in stream from | Change | Result |
|---|---|---|
| the target O | deactivate | `p4` 10/10; `p8` 20/20; `p9` 6/6, max 164 ms |
| the target O | Sign out everywhere | `p4` 10/10; `p8` 20/20 |
| a colleague, T | deactivate | `p9` 6/6, max 38 ms |
| either | deactivate and reactivate | `p10` 16/16, max 89 ms |
| either | roles | `p10` 8/8, max 116 ms |
| either | Sign out everywhere | `p10` 8/8 |
| either | invite, resend, revoke | `p11` 6/6 each, max 121 ms |
| T | invitation accept | `p12` 6/6, max 50 ms |

**B2 has not come back.**
* `p3` (8 rounds × 25 sign-ins against a deactivation): 0 tokens dated after it, 0 alive after reactivation, 0 sign-in
  lines while deactivated.
* `p4` found 0 race tokens.
* `p8`, sign-ins during reactivate: `200×8, 401×48`, none dated at or before the deactivation.

**Terms accept**, which still takes `FOR UPDATE` on the firm row:
* under O's or T's stream, the Owner accepting a new privacy notice: 8/8 each, max 31 ms;
* T accepting while T's own sign-in loops run: 20 × `401 SESSION_REVOKED`, never 500. Their own new sign-ins end the
  session, so it is not a lock problem.

**Load:** no 5xx at any size.
* 60 parallel sign-ins (3 people): p50 237 ms. 60 parallel sign-ins (one person): p50 287 ms.
* 150 parallel sign-ins: p50 619 ms, max 909 ms.

**Nothing new broke.** R2 (Cognito deactivation does not disable the person at the provider) stays a note for PF-4bc.

**A probe artefact, not a defect.** `p8`'s role-change line shows some 401s because it picks the last answer in array
order. `p9` picks the newest token by `auth_time`, and that token read the new roles 6 of 6.
