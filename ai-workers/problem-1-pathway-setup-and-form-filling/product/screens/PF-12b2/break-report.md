# PF-12b part 2 — break report (`claude/modest-mccarthy-jnk4qb` @ ed4f8c57d)

Row PF-12b2: the seven own-firm doors leave the bypass for narrow SECURITY DEFINER lookups (migration
`20261121120000_pf12b2_door_lookups`), then read as that firm (`withFirm` / `enterFirm`). Backend only, no screen.
Method: the branch on its own copy (`isolated.sh brk 4561 … PLATFORM_IDENTITY=local PLATFORM_SAMPLE_SEED=on`), and the
merge base `2f382acdb` (origin/main before the change) in a scratch worktree on `brkmain 4562`, seeded the same way.
Both are stopped and their databases dropped. Seed (scratch script, not committed): `seedSampleFirmsFrontOffice`, consent
wording + enabled web form for both firms, invitations, one booking + `issueToken` link per firm (as tests/check_pf12b_doors.ts).
A = `sample-firm`, B = `sample-solo`. SQL as `psql -U xr_app` on the copy's database. The PR's own suite
`tests/check_pf12b_doors.ts`: 29 passed, 0 failed.

## Findings

No Blocker. No Major.

**m1 (Minor): the booking self-service link now tells a real token id from an unknown one by timing. Origin/main did not.**
`byToken` (api/src/front-office/booking/service.ts:835-837) returns early when `fo_booking_token_firm(id)` is null. It only
runs `liveToken` (one more round trip, as firm) when the id exists. On main, `liveToken` ran for both cases, and
tokens.ts:36-37 compares against a dummy hash on purpose so that "unknown" and "wrong secret" cost the same. Repro: 100
GETs each, interleaved, each pair from its own source address (the limit is 30 per IP per 10 min), all answering
the same 404 body:
`curl --interface 127.0.$i.$j http://127.0.0.1:$PORT/api/public/bookings/<random-uuid>.<verifier>` against `…/<real id>.<random verifier>`.
Median ms, two runs: branch unknown 1.89 / 1.75, real id 2.79 / 2.39 (+0.6–0.9 ms). Main: unknown 1.99 / 1.64, real id
2.01 / 1.85 (within noise). Impact: the id is a random UUID v4 (122 bits) and is rate-limited, so the id space cannot be
searched. Only an id seen on its own (for example in a log line) can be confirmed. The fix is the builder's to choose.
The suite's DW5 check compares bodies only, not cost.

**m2 (Minor, note): `platform_web_address_firm(address, at)` trusts the caller's `at`.** As xr_app,
`select platform_web_address_firm('sample-solo', '-infinity')` returns firm B for an old address. With `now()` it gives
the same answer while the 90-day hold lasts. Over HTTP, `at` is always the server clock (service.ts `resolveHost`), so no
door is affected. It only matters to direct SQL as xr_app, and xr_app can already `SET ROLE xr_staff_bypass` (PF-12
design). Recorded for completeness. Not a regression over HTTP.

## Attempts that held (branch = main unless stated)

1. **Guessed keys, HTTP.** A side-by-side probe of 33 requests (sign-in, invitation view and accept, form, booking page,
   booking link, host): status and body match main on every line except token and timestamps. Unknown, UPPER, padded,
   SQL-ish, array and NUL firm keys give 401 UNKNOWN_STAFF, 400 FIRM_REQUIRED, or 404 (the same on both). Random, short
   and SQL-ish invitation tokens give 200 NOT_VALID. Accept with `abc`, a random 43-character token, or `' or 1=1--` gives a
   byte-identical 410 on both (md5 cc9f03f6…). A random form token gives 404 FORM_NOT_AVAILABLE. Unknown, UPPER-case or
   non-UUID booking ids and a wrong verifier give the one 404.
2. **Guessed keys and crafted arguments, SQL as xr_app.** NULL, `''`, UPPER, leading space, `x' or 1=1 --`, `%` against
   all seven functions return NULL (or `f` for the email check). `platform_staff_firm(id, subject)` with both arguments uses the
   id only. No other column is reachable (the suite checks a composite access: refused). With no firm set, xr_app reads 0
   rows from walled tables.
3. **Altering, shadowing, becoming the owner.** As xr_app: `CREATE OR REPLACE` / `CREATE public.<fn>(varchar)` →
   `permission denied for schema public`. `CREATE SCHEMA` → denied. `ALTER … OWNER/SECURITY INVOKER`, `COMMENT` → `must be
   owner`. `GRANT … TO public` → "no privileges were granted". `SET ROLE xr_wall_reader`, also after `SET ROLE xr_staff_bypass`,
   `SET SESSION AUTHORIZATION` → denied. `pg_has_role(xr_app|xr_staff_bypass, xr_wall_reader)` = f. As xr_staff_bypass, CREATE
   in public is denied. In one session with `search_path = pg_temp, public, pg_catalog`, I made a temp function
   `platform_firm_of_key`, a temp operator `=` that always returns true, and a temp table `platform_staff` holding a ghost
   row. The unqualified call still used the real function, `email_taken('ghost@…')` = f, `email_taken(any)` = f, and
   `staff_firm(null,'ghost')` = NULL. Pinned search_path with pg_temp last works, and Postgres never looks up temp
   functions or operators unless qualified.
4. **Firm A's web address with firm B's keys.** Host `sample-firm.localhost` with B's form token, booking page, booking
   link, invitation view and accept, and local sign-in: every one gives the one public 404 (host.ts serves only
   `/api/public/site` on a firm address). Host UPPER is served as A. A renamed address gives a 301 to the new one (query
   kept). A firm in SECURITY_LOCK gives 404 on both its current and its old address (the same on main). Firm B's slug under
   A's key gives 404. 60 parallel booking-page reads mixing A and B: 30/30, each with its own firm's name.
5. **Invitation races and the cross-firm email.** Six parallel accepts of one token: one 200, five 410, one staff row
   (on main too). The same email invited by A and B, both accepted at once, 8 rounds on each copy: one 200 and one 409 each
   round, one staff row. Note that this holds because of `platform_staff.identity_subject` UNIQUE and the provider handing
   back the same subject for an email (session/provider.ts:43), not because of `platform_staff_email_taken`, which both
   transactions pass. The loser gets the generic 409 "Already exists". Identical on main, so not a regression. A sequential
   accept of an email held by another firm gives 409 EMAIL_IN_ANOTHER_FIRM (suite). Case: both `platform_staff.email` and
   `platform_invitation.email` carry CHECK `email = lower(btrim(email))`, so case or padding variants cannot be stored.
6. **authenticate.** HTTP on both: deactivated → 401 STAFF_NOT_ACTIVE. Revocation row → SESSION_REVOKED. Older session
   after a new sign-in → SIGNED_IN_ELSEWHERE. Firm B's session → B's own `/me`. Garbage and `alg:none` → TOKEN_REFUSED.
   The Cognito path, run directly through `WalledPool` as xr_app with a fake port (`via: "cognito"`, identitySubject):
   first sign-in OK, and `recordSignIn` writes its revocation row and `platform.staff.sign_in` line as the firm under the
   walls (1 and 1). The same session again: OK. An older session: SIGNED_IN_ELSEWHERE. UPPER, padded, empty or SQL-ish
   subject: UNKNOWN_STAFF. UPPER-case staffId: accepted (lower-cased, as before). Deactivated: STAFF_NOT_ACTIVE.
7. **Everything else answers as main.** The form submission (Unicode name) gives 201 with one lead on both. Slots under
   A's key: the same 400/404 on both. Timing for a known firm key with an unknown actor against an unknown key: +1.4 ms on
   the branch, +0.9 ms on main. Firm keys are public (the booking page already answers 200/404), so not a finding.
   No remaining caller names any of the seven uses (`git grep`). Only the suite's list holds them.

## Not attacked / out of scope
Production Cognito (no pool: covered by the fake-port run above). `rollback.sql` was not run. Its own comment says to use
it only with the earlier code.
