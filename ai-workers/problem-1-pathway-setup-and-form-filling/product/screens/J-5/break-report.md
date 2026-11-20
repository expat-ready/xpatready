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
