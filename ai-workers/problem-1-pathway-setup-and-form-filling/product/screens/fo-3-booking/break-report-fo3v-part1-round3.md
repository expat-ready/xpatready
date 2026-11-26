# Break report, round 3: FO-3v part 1, the schema and the link input (PR #3418, R1.112)

Breaker, 25 Nov. Head attacked: `adf4c983160c9d5332fd0a576de1f894644dc9e2` (branch `claude/runtime-fo3v-video`). Focus: the migration `20261125051500_shared__fo3v_video`, the API link shape (`SHAPE`, `LINK_CHARS`, `linkOk`), the own-record routes, and links or secrets in logs and audit rows. No screen is in part 1 (the panel is part 1b), so keyboard, 1024 px, 200 % zoom, reload and back do not apply. OAuth and Zoom (part 2) are out of scope.

Set-up: an isolated copy `brk_fo3v` on :4641 (`PLATFORM_IDENTITY=local`, stopped at the end, its database dropped). I called it as `user-R`, `user-O`, `user-T` (`sample-firm`) and `user-S` (`sample-solo`), and connected with `psql` as `xr_app` to test the walls. A second scratch database had main's 74 migrations (origin/main `a1a086e3d`, newest `20261124170000_aud3_audit_log_keys`) with this one applied on top; it was dropped at the end. The scratch scripts are in the session scratchpad (`brk/fuzz.mts`, `api.mts`, `book.mts`, `leak.mts`, `conc.mts`, `walls.sql`). No network, no model calls, US$0.

## Findings (no Blocker, no Major)

**F1 Minor: the database check is weaker than the API's, so "the same as the API's linkOk" overstates it** (`prisma/migrations/20261125051500_shared__fo3v_video/migration.sql:61-66`).
Repro: I ran 329 probes through both `linkOk` and `select fo_video_link_ok($1)`: every character from 0x00 to 0x7F after the host and before it, plus about 70 crafted links.
* The character sets now match exactly. No input the API accepts is refused by the database, so there is no path to a 500.
* 49 probes split the other way: the API refuses them and the database accepts them. Examples: `https:///zoom.us`, `https://x/`, `https://[::1]/`, `https://a.example:99999/`, `https://javascript:alert(1)`, `https://ex%61mple.com/`, `https://a..b/`, `https://_a.example/`, `https://a.ex!ample/`, `https://;a.example/`.
* As `xr_app`, `UPDATE fo_video_pref SET my_meeting_link='https:///zoom.us'` succeeds.

None of these can break an `.ics` line or an email, because the character set is the API's. The gap is the host-shape rules (a real host, a valid port, the raw text starting with the parsed host), which only the API checks. The comment's claim matters once FO-3vm adds a second writer. Expected: either say the database checks the characters, the length and the user/password part only, or add the host shape to the check.

**F2 Minor: a link can still show one address and open another** (`api/src/front-office/booking/video/service.ts:47`, `:51-56`).
Repro: as `user-R`, `PUT /api/front-office/me/video {"myMeetingLink":"https://evil.example?@zoom.us/j/1"}` → 200, saved; the database accepts it.
The same works with `#@zoom.us` and `/@zoom.us`. A Video booking then carries it to `joinLink`, the email text and the `.ics` `LOCATION`. A reader sees "@zoom.us", but the browser opens evil.example.
This is round 1's m1 class: the fix banned `\` and the user/password part, but not `@` after `/`, `?` or `#`. The comment at `:47` says links can no longer "show one address and open another". The link is written by the firm's own staff member, so this is noted, not a refusal.

**F3 Minor: another person's id is refused 403 only in four exact spellings** (`video/service.ts:97`, `:106-107`).
Repro as `user-O`, with R's id `e66d935e-…`:
* These get 200 and act on O's own row: `GET` and `PUT …/me/video?staffId[]=<R>`, `?staff-id=<R>`, `?staff[id]=<R>`, `?ownerId=<R>`, `?hostId=<R>`, `?actorId=user-R`, and the header `X-Staff-Id: <R>`.
* A body with `ownerId` or `actorId` gets 422, not 403.

No request in any shape read or wrote another person's row; the outcome is the same as round 1's m7. Only the answer differs from AG-4-59's "another person's → 403". The comment at `:106` ("any spelling … never ignored") overstates the fix. The `?staffId=` and `?StaffId=` forms, `%73taffId`, and body `staffId`, `STAFF_ID` and `id` do get 403.

**F4 Minor: a stale pointer to the old migration name** (`prisma/schema/front-office-video.prisma:6`).
The file still says the rules "are in the migration 20261124100000_fo3v_video". That folder was renamed to `20261125051500_shared__fo3v_video` (commit `4d5ce051d`), so the pointer leads nowhere.

## What held
* **The database refuses everything on the list.** As `xr_app` in the firm's own session, the check refuses each of these on `fo_video_pref`: `\x01`, `é`, U+200B, each of `" < > \ ^ ` { | }`, `javascript:alert(1)`, `http://`, 2,049 characters, `user:pass@`, `\n` + `DTSTART:1`, and `\r\n`. On `fo_booking_video` it refuses `\n` and `''`. 2,048 characters pass, and a NUL never reaches the check (the driver refuses it).
* **The API refuses the same inputs** with 422 "Enter a full link starting with https://", nothing saved: control characters, U+0085, U+200B, a lone surrogate, leading or trailing spaces, `\@`, 2,049 characters, a number, an array.
  * A bad `sourceChoice` (`ZOOM`, `CALENDAR`, `my_link`) → 422.
  * `text/plain`, `application/jsonx` → 415; `charset=latin1` → 415; broken JSON → 400.
  * Duplicate JSON keys: the last one wins, and it is checked.
* **Percent-encoded line breaks stay text.** `https://a.example/%0D%0ALOCATION:evil;x,y` goes out unchanged in `joinLink`, and the `.ics` has `LOCATION:https://a.example/%0D%0ALOCATION:evil\;x\,y` on one line.
* **A 2,048-character link of `;`** is escaped, and the `.ics` is folded to at most 75 octets per line.
* **The firm walls (PF-12).** Both tables have row-level security enabled and forced.
  * With no firm, 0 rows are visible.
  * As firm B:
    * B sees only its own row.
    * An insert for firm A, or moving B's own row to A, is refused by `platform_firm_first`.
    * Updates or deletes of A's rows change 0 rows.
    * An `INSERT … SELECT` of A's booking inserts 0.
  * `check_pf12_walls.ts`: 110 passed, 0 failed. `check_fo3v_video.ts`: 32 passed, 0 failed (both run with `--tsconfig api/tsconfig.json`).
* **The trigger `fo_video_drop_on_deactivate`.** Owner `xr_wall_reader`, SECURITY DEFINER, `search_path = pg_catalog, public, pg_temp`; ACL `{xr_wall_reader=X}`, so PUBLIC has no execute. Only the owner can create objects in `public`.
  * As `xr_app`, each of these is refused: a direct call, a trigger on an own temp table using it (`permission denied for function`), and `SET ROLE xr_wall_reader`.
  * Firm B deactivating R in firm A → `UPDATE 0`, and R's row is kept.
  * Deactivating O while changing O's `id` to R's → duplicate-key error, rolled back.
  * Deactivating T while moving T to firm B → refused.
  * Deactivating O drops only O's row.
* **The migration on main's newest.** It applies cleanly on main's 74 migrations. The schema catalog is identical to a fresh branch database: columns, constraints, triggers, policies, functions with owners and ACLs, row-level security flags and indexes. The only differences are the `_prisma_migrations` table and an existing `NOT VALID` on `case_client`. `prisma migrate diff` (database → `prisma/schema`) is empty.
* **Own record.**
  * No sign-in → 401; a bad bearer → 401.
  * `/me/video/<R>` → 404.
  * Firm B's `user-S` reads and writes only its own row.
  * After all the attacks, R's row was unchanged.
  * 20 concurrent first saves by `user-T`: all 200, one row, exactly one "meeting link changed" and one "video choice changed" audit line (the round 1 m3 fix holds).
* **No link or secret is logged.**
  * I scanned every public table after the saves and three Video bookings. Links appear only in `fo_video_pref` and `fo_booking_video`.
  * `audit_event` (`video.*`, `booking.video_link_set`) holds `hasLink`, `sourceChoice` and `provider` only.
  * `msg_outbox` keeps `rendered_hash`, not the body.
  * `api.log` (308 lines) has no link. This includes the 400 broken-JSON bodies, the 422s and a link sent in the query string (which is ignored); request lines carry only the route pattern.
  * For part 2's tokens: nothing in this schema or code copies a request body, URL or query into a log or an audit row. `external_meeting_id` is a plain id column.

Breaker: Approve adf4c983160c9d5332fd0a576de1f894644dc9e2
