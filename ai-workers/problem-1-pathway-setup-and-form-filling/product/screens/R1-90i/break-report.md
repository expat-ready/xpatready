# R1.90 invited sign-up (API only): break report

PR #3040, branch `claude/runtime-r190-invited`, head `bacf188d8a9aa8bf1bdb3afd9f94728775457b9a`. The copy was isolated as `brk_r190i` on :4436 (`PLATFORM_IDENTITY=local PLATFORM_SYSTEM_IDENTITY=local`), with the API connecting as `xr_app`. It cost US$0: no Stripe and no live AI. The author's `check_r190_invited_signup.ts` passed 11/11 on that copy before the attacks. The attack scripts were kept outside the repo, and each POST was sent from its own loopback source address (127.0.x.y) so the per-IP limit did not hide results. Paths below are under `prototype/studio/`.
## Blockers: none
## Majors
**M1. A badly formed token gets a 500, not the one 404. This is a PF-28 break on a public door.**
- How to reproduce:
  - `curl localhost:4436/api/public/signup/$(python3 -c "print('A'*65)")` gives 500.
  - The same happens for `.../signup/%41AAAA…`, `.../signup/A%2eB`, `.../signup/a%20b` and `.../signup/verify%2F`. GET and POST both give 500.
  - A 64-character token gives 404, as it should.
  - `api.log` shows `level:error` with a stack at `asBypass (firm-scope.ts:285)` ← `PlatformSignUp.invited (signup.ts:247)`.
- Expected: 404 "This link is not valid any more…". The concept says "Unknown, used and expired links are one 404", and PF-28 says a bad path value "answers 404, never 500".
- Why it happens: `invited()` and `signUpInvited()` enter `asBypass("platform.firms.signup")` (signup.ts:247, 258) before the `LINK_TOKEN` shape check (signup.ts:237, 264). The use's route list only allows `/^(GET|POST) \/api\/public\/signup\/[A-Za-z0-9_-]{1,64}$/i` (firm-scope.ts:139), checked against the raw path. A path over 64 characters, or one with a `%`, is refused as `BypassRefused`, which becomes a 500.
- Why the checks missed it: PF-28's sweep only sends a 43-character token (check_pf28_inputs.ts `:inviteToken`).
- Who can trigger it: anyone, without signing in. Each hit counts as an Error in the request metric and writes an error log line.

**M2. A refused open or form leaves no `platform.bypass` audit line, even though the code says it writes one.**
- How to reproduce:
  - Count `audit_event where action='platform.bypass'`.
  - `GET /api/public/signup/<43 unknown chars>` gives 404. Then POST the same token with a valid body: it gives 404 or 429.
  - The count does not change (it stayed at 62). The 300 unknown-token GETs I sent added 0 lines.
  - For comparison, `POST /api/public/signup/verify` with an unknown token adds one line `{step:"signup.verify-refused", key:null}` (143 → 144).
- Expected: one firm-less line for each bypass read, refused ones included. This is the Lead 15 ruling on #2814 that the verify door follows (signup.ts:285-293). It is also P-607 (3), "no action without its audit line". `liveLink` itself writes `touchPlatform(tx, {step:"signup-link.open", key: row?.id ?? null})` for exactly this case.
- Why it happens: in `liveLink` (signup.ts:238-243), `throw notFound()` happens inside the same `$transaction` that wrote the line. The rollback removes the line for every unknown, used and expired token, so only live opens are recorded. The operations log line (`platform_bypass` in api.log) remains, but the audit trail has nothing.
## Minors
**m1. A failed staff call is logged as ALLOWED, and the line never names the link.**
- What happens: `POST /api/system/signup-links` from an Owner gets 422 for an unknown planCode, for `period:"WEEKLY"`, for an extra key `firmId`, or for a bad email. Each one still writes `plat_system_audit outcome=ALLOWED, code=null`, though nothing was made. The line written for a real 201 has `target={}`: no link id and no email.
- Where: guard.ts:119 writes the line before the handler runs, and the route is not `@SystemChange` (signup-links.ts:16).
- Result: our staff trail cannot tell a link that was made from one that was refused. A line can be tied to a `platform_signup_link` row only through `created_by` plus the time.

**m2. Links can be made for emails that already have an account, and they stay live after the email's firm exists.**
- What happens:
  - A link for an email that already owns a firm gets 201. So does a link for `sample-firm`'s contact email. The staff member is not warned.
  - Two links for one email (S4): after one is used, the other still gives GET 200 with the plan offer, and its form gives 202. The person then gets only an "already have an account" email.
- Expected: either a refusal or a note at creation time, or the second link ending when the first is used.
- Where: makeLinkWork (signup.ts:218-233) has no `knownAccount` check.

**m3. The invited link's GET is not rate limited.**
- What happens: 300 GETs from one client all got 404, with no 429. The form POST shares the self-serve `signup:<ip>` limit (10 per 10 min). `X-Forwarded-For` is not trusted, which is correct.
- Risk: guessing a 256-bit token is not feasible, so the risk is low. But each live open writes an `audit_event` row, so anyone holding a link can grow the trail without limit.
- Where: signup.ts:247-249 has no `limit()` call.

**m4. The audit line for a firm made from a link says it came from self-serve, and does not name the link.**
- What happens: the `firm.created` summary reads "Firm created by self-serve sign-up (setting up)" for a firm made from an invite. No audit line names the link id, or the staff member who made it.
- Where: signup.ts:314.
## What held
- **Who can make links:** of the six PF-4s roles plus a staff member with no role, only Platform Owner and Admin got 201. Support, Billing, Content publisher, Auditor and the no-role member got 403 `MISSING_PERMISSION`.
- **Other tokens and sessions:** a firm Owner token got 403. No token, a junk token and `x-actor` alone each got 401. Upper-case paths kept the same results. A staff token on `/api/public/signup/:token` got 403 from the wall. Signing in without the second step (`secondStep:false` or missing) got 401 `TWO_STEP_REQUIRED`, so no token was issued.
- **Reason:** a missing, empty, spaces-only, control-only, zero-width-only, Hangul-filler-only, punctuation-only, emoji-only, number or array reason got 400 `REASON_REQUIRED`. 501 characters got 400 `REASON_TOO_LONG`. 500 characters worked. Control and bidi characters are removed before the reason is stored on the line. A non-English reason worked.
- **Body and size limits on the staff route:** an array body got 422. Null or a plain string got 400. Bodies of 300 KB and 1.1 MB got 413 on both doors.
- **Token storage and logs:** only the sha256 is stored. The raw token and its hash appear in none of `audit_event`, `plat_system_audit` or api.log. Request lines log the route pattern (`/api/public/signup/:token`), not the path. The link carries the token in the fragment (`#token=`), not a query string.
- **One 404:** unknown and expired tokens got identical 404 bodies, and a used token got 404 in the same words (author's IS3). Median GET times were 7.4 ms unknown, 7.9 ms expired, 11.6 ms live (200), and 2.7 ms for a wrong shape (the shape is public). Unknown and expired cannot be told apart by timing.
- **Single use:** 10 concurrent Confirms made 1 firm (200 + 9×404), and the link was marked used with its firm. Two forms followed by two Confirms made 1 firm: the older pending was REPLACED, and its code got 404. Two concurrent forms left 1 live pending, then made 1 firm.
- **Expiry and plan changes:** a link that expired between the form and Confirm got 404, with no firm and the link left unused. A plan made inactive got 409 `PLAN_GONE` on GET, POST and Confirm, made no firm and left the link unused. After the plan was made active again, the same code worked once.
- **The body cannot override the link:** `email`, `planCode`, `period`, `countryCode`, `website`, `formStamp` and `signupLinkId` in the body each got 422 "not a field of this form". The firm gets the link's plan and period (S4: MONTHLY from the second link).
- **Other body checks:** firmName (1 or 121 characters, NUL, bidi, zero-width only, spaces), password (11 characters, 257 characters, spaces only), terms (missing one, or a string), array, null and bad JSON all got the right 422 or 400. A non-English or emoji firm name worked.
- **Firm walls as `xr_app`:** with no `app.firm_id`, 0 link rows are visible. As `sample-firm`, 0 link rows and 0 pending rows are visible. As the firm a link was used for, only its own link row is visible, and its pending rows are not visible. A direct INSERT is refused by RLS. Clearing `used_at` on a used link is refused by `platform_signup_link_used_once`.
Verdict: Changes bacf188d8a9aa8bf1bdb3afd9f94728775457b9a
## Round 2: head `0eb3cdb1410f7afcbe97e960cf61cb06e5879a27`
Reviewed: the diff since bacf188d only. Copy: `brk2_r190i` on :4436, now stopped and dropped. The author's check passed 17/17 on it.
### Blockers: none. Majors
**R2-M1. Round-1 M1 is only partly fixed: a token that decodes to a valid shape still gets a 500.**
- Reproduce: `GET` or `POST /api/public/signup/%41AAAA…` (`%41` followed by 42 `A`). Also any token made only of `%41`, `AAAA…%2D`, or a **live** token with its first character percent-encoded. Each gives 500, and api.log shows `level:error` at `asBypass (firm-scope.ts:285)`.
- Why it happens: Express decodes `:token`, so the new `LINK_TOKEN` check in `invited`/`signUpInvited` (signup.ts, added in this diff) passes. `asBypass` then checks the raw path (`routeOf` → `req.path`, firm-scope.ts:406-408) against `[A-Za-z0-9_-]{1,64}` (firm-scope.ts:139). The `%` fails that check, so the bypass is refused and a 500 follows.
- What is fixed: 65 characters, 4000 characters, a dot, a tilde, `%00`, `%2F`, `é`, zero-width characters, `;x` and a trailing slash now all get the 404.
- Why IS6 missed it: its `%41`+40 `A` decodes to 41 characters and fails the shape check first.
- Rule broken: PF-28 ("never 500").

**R2-M2. `tests/journeys/j_90.ts` no longer parses.**
- What happens: at line 167, the new `// Lead 6 on #3040…` comment sits in the middle of the `j(...)` call, so the rest of the call (body, `tok`, `)`) is commented out.
- Reproduce: an esbuild transform fails at 168 `Unexpected "const"`.
- Result: walks.yml runs the journeys a PR changes, so j_90 stops before W1, not just at W4.
### Minors
- **R2-m1. Anyone holding a used link can add lines to the firm's own trail.**
  - What happens: each refused open of a used link now writes a `platform.bypass` line with that firm's `firm_id`. In my runs, 25 timing opens left 29 lines on that firm's trail. The limit is 30 per IP per window, with no cap per link.
  - Risk: low, since the person holding the link is usually that firm's Owner.
- **Round-1 m1 and m2 stand.** The coordinator chose to leave both as Minors.
### What held in round 2
- **Audit lines per refusal (each counted on its own):**
  - Live, unknown and expired-unused links: one firm-less `signup-link.open` line, on both GET and POST.
  - Used link: exactly one line on the firm's trail, and no firm-less line.
  - Invited POST with a bad body: 422 and no read, so no line. A malformed token: 404 and no line.
  - Gone at Confirm, link expired: 404 in the new words, no firm, link unused, pending still live, one `signup.verify-link-gone` line per try.
  - Gone at Confirm, link used meanwhile by another firm: 404 with one `verify-link-gone` line.
  - No `platform.bypass` line points at a firm that does not exist.
- **The page's limit:** from one IP, 30 × 404 then 429 in the standard problem shape; 60 concurrent GETs gave 30 × 404, 30 × 429 and 30 lines. Another IP is not affected. The key `invite-open:<ip>` is shared with neither self-serve sign-up (`signup:`) nor verify (`verify:`), checked in both directions.
- **The invited form's POST limit:** it still shares `signup:<ip>` with self-serve. This is unchanged and was accepted in round 1.
- **The one 404, new words:** unknown, used and expired tokens give identical bodies. Median times are 10.5, 11.9 and 11.0 ms, which is no usable signal.
- **`firm.created`:** reads "invited sign-up, from a private link".
- **rollback.sql:** applied cleanly on the copy and dropped exactly the 3 added columns, with the FK and the index. Re-applying `migration.sql` restored them.

Verdict: Changes 0eb3cdb1410f7afcbe97e960cf61cb06e5879a27
## Round 3: head `3b13faf61c560179ea6ae8cbdd04714be51d5067` (diff since 0eb3cdb1; copy `brk3_r190i` on :4436, stopped and dropped)
Author's check: 17/17, including IS6's two new encoded tokens. `tests/journeys/j_90.ts` parses again (esbuild transform OK), so **R2-M2 is fixed**.
- **R2-M1 is fixed.** Each case below was sent as both GET and POST.
  - `%41`+42 `A`, `%41` ×43 and `A…%2D` now get the one 404. **No 500s** appear in api.log for the whole run.
  - A live token with its first character percent-encoded (upper- or lower-case hex), or fully encoded, now works as the link: GET 200 shows the email, and the form gets 202 and makes 1 pending.
  - Every round-2 malformed case still gets the 404: 65, 401 and 4000 characters, `%41`×140 (420 raw), dot, tilde, `%00`, `%2F` (inside and splitting a live token), `é`, zero-width characters, `;x`, `%2E%2E`, `..%2Fverify`, an encoded `verify`, and a 43-character token with a trailing slash.
- **The widened pattern `[^/]{1,400}` lets nothing new through.**
  - Only signup.ts calls `platform.firms.signup` (sign-up, verify, and the invite page and form). `platform.account.mail` is entered only inside it.
  - A second segment (`/<tok>/x`, `/<live>/verify`) is answered by Express's own 404 ("Cannot GET"), so no handler and no bypass run.
  - A verify body POSTed to an encoded `verify` or to `VERIFY` reaches the token door: 404, no firm. `verify/` with a slash is the real verify, as before this PR.
  - A bare `%` or `%zz` gets Express's own 400 "Failed to decode param". This is the framework's answer on every param route, not this door's, and not a 500.
- **Round-2 checks re-run with no change:**
  - Lines per refusal: unknown, expired and live: 1 firm-less line each. Used: 1 line on the firm's trail. Bad body or malformed token: 0. Gone at Confirm: 1 `verify-link-gone` per try, with no firm and the link unused.
  - Limits: the page limit gives 30 × 404 then 429. Its key does not touch the self-serve or verify limits in either direction.
  - Timing and words: 404 bodies are identical, with medians of 9.4, 8.8 and 10.1 ms.
- **Still open, all Minors:** R2-m1 (a used link's lines on the firm's trail, capped per IP), and round-1 m1 and m2. These are the coordinator's decisions.
Verdict: Approve 3b13faf61c560179ea6ae8cbdd04714be51d5067
## Round 4 (diff only): head `2dd912dc07a9f825cedf160bcc8abc79b444ccb9` (diff since 35694aca3, where main brings in AUD-3a/3c (#3296); copy `brk_r190i` on :4438, stopped and dropped)
Author's check: 18/18 on the copy, including the new `created_by` line. Each POST came from its own loopback address and carried its own `x-request-id`, so every `audit_event` row below is tied to one call. Cost US$0.
### Blockers: none. Majors: none. Minors: none new.
### What held in round 4
- **Our staff make a link (Owner):** 201 and exactly **one** `audit_event` row for the call. The row has actor `ourstaff:<ownerId>`, `actor_type OUR_STAFF`, firm null, case null, and the platform audit workspace (the same `workspace_id` as the system lines). It has `platform.bypass`, entity `plat_bypass_use`, key `platform.firms.signup-link`, `detail.step signup-link.create`, `detail.key` set to the link id, and `correlation_id` set to the request's id. No `system:` row and no firm-trail row is written. The link id appears in no other line.
- **Concurrent creates:** 10 at once gave 10 × 201, 10 links, and 10 lines with 10 distinct keys. Since touchPlatform's once-per-transaction set is per transaction, no line is lost and none is doubled.
- **Rollback on failure:** a test trigger made the `plat_bypass_use` insert fail. The answer was 500 `not-recorded`, no link row was written (6 → 6), and no `audit_event` row was written (64 → 64). api.log had one `audit_write_failed` alert with ids only, and neither the email nor the token. After the trigger was dropped, the same call got 201. The `plat_system_audit` row still reads ALLOWED: this is round-1 m1, already accepted.
- **Admin:** 201. `created_by` is `ourstaff:<adminId>`, and the line's actor is the same word. The Owner's links carry `ourstaff:<ownerId>`. `created_by` never starts with `system:`.
- **Refused callers on `POST /api/system/signup-links`:** each of these wrote 0 `audit_event` rows and 0 links, and each one's `plat_system_audit` REFUSED line names its code.
  - A firm token got 403 `firm-session-refused`, with or without a reason.
  - Support got 403 `MISSING_PERMISSION`, with or without a reason.
  - A staff member with no role got 403.
  - The Owner with no reason got 400 `REASON_REQUIRED`.
  - The Owner with an unknown plan got 422.
- **Public token doors with no session still write and commit their lines under the `system:` branch:**
  - An unknown GET got 404, and an unknown POST got 404. Each wrote one firm-less `system:platform.firms.signup` row (SYSTEM, `signup-link.open`, key null).
  - A live GET got 200 with one row (the link id as key).
  - A live form got 202 with three rows: `signup-link.open`, `platform.account.mail` and `signup.new-email`.
  - A used link's GET got 404 with one row on the firm's trail (`platform_firm`, SYSTEM).
  - An unknown verify got 404 with one `signup.verify-refused` row.
  - None of these doors wrote an `ourstaff:` row.
- **Our staff's token on the public doors:** GET (unknown, live and used), POST verify (unknown) and Confirm (a live pending) each got 403 `system-session-elsewhere`, and no firm was made. So the `ourstaff:` branch in touchPlatform/touchFirm cannot be reached from a public door. A firm token on the GET got 403 from the wall.
- **Confirm on an invited link (no session):** 200, one firm, and the link `used_at` is set with `firm_id` = the new firm. The firm's trail has these rows, all on the firm with the platform workspace:
  - `platform.bypass` (`system:platform.firms.signup`, SYSTEM, entity `platform_firm`)
  - `firm.created` ("Firm created by invited sign-up, from a private link (setting up)")
  - owner_created, money_keys_granted, terms.accepted and subscription.created
  - No `ourstaff:` word.
- **Whole-table check:** no row has an `ourstaff:` actor with any `actor_type` other than OUR_STAFF, or the reverse. No `ourstaff:` platform.bypass row has an entity other than `plat_bypass_use`.
- **Migration on an empty database:**
  - `prisma migrate deploy` applied every folder, ending with `20261124070000_r190_signup_link_plan`. The added columns are `plan_code` text default `'team'`, `billing_period` default `'MONTHLY'`, and `signup_pending.signup_link_id` uuid.
  - `prisma migrate diff` from the migrated database to `prisma/schema` is empty, so there is no drift.
  - `rollback.sql` (in one transaction) dropped the 3 columns, the FK and the index. Run a second time it gives only notices. Re-applying `migration.sql` worked.
  - The SQL is byte-identical to the old `20261123030000` folder. Only the stamp changed, which ends that stamp's clash with `20261123030000_aud_ourstaff_actor_word`.
- **Notes (no finding):**
  - A database that had already applied the branch's old stamp would see the new folder as pending, and its ADD COLUMN would fail. Only throw-away copies of this branch could be in that state.
  - IS4's fixture inserts its expired link with `created_by 'staff:<id>'` (tests/check_r190_invited_signup.ts:114). This is test data only.
Verdict: Approve at 2dd912dc07a9f825cedf160bcc8abc79b444ccb9
