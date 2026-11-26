# Break report: FO-3v part 1, video meeting links (PR #3418, R1.112)

Breaker, 24 Nov. Head attacked: `ba232f8bd` (branch `claude/runtime-fo3v-video`). During the run `cdba0ac7d` landed on the branch. It changes only the deactivation trigger (now SECURITY DEFINER, owned by `xr_wall_reader`). I re-ran `tests/check_fo3v_video.ts` on `cdba0ac7d`: 26 passed, 0 failed, and §12 still drops the row. No screen is in this part (the panel is part 1b), so screen attacks do not apply: keyboard, 1024 px, 200 % zoom, reload and back. Zoom (part 2) is out of scope.
Set-up: an isolated copy `runtime_brk` on :4437 (`PLATFORM_IDENTITY=local`, stopped at the end), curl as `user-R` (Owner), `user-O` (Case Officer), `user-T` and another firm's `user-S`; direct `psql` as `xr_app` for the walls; one scratch script, `scratchpad/breaker/s/lost_update.mts`, that runs `VideoService` against the copy's database. No network calls, no model calls.

## Findings (no Blocker, no Major)

**m1 Minor: the link rule lets invisible and look-alike links through, and saves the raw text, not the parsed URL** (`api/src/front-office/booking/video/service.ts:46-49`).
Steps: `PUT /api/front-office/me/video` as `user-O` with each of these values for `myMeetingLink`:
* `"https://zoom.us/j/1​X"` (zero-width space), saved, 200
* `"https://zoom.us/j/‮1234"` (right-to-left override), saved, 200
* `"https://evil.example\\@zoom.us/j/1"`, saved, 200. A browser opens evil.example, but a reader sees "@zoom.us".
* `"https:///zoom.us"`, saved, 200
* `"https://./x"`, saved, 200
* `"https://zoom.us/j/1\"><script>alert(1)</script>"`, saved, 200

Each is stored exactly as typed, and the public `joinLink`, the email text and the `.ics` carry it as typed.
Expected: the codebase's own rules refuse these marks. The phone field refuses U+200B, U+202A-202E and U+2066-2069 (`booking/service.ts:150`), and the type's link takes only `[A-Za-z0-9._~:/?#@!$&'()*+,;=%-]` (`settings/types.ts:95`). Either refuse the marks the same way, or save `new URL(s).href`.
No injection reaches anyone. The HTML email escapes the text (`&quot;&gt;&lt;script…`), the `.ics` escapes and folds it, and React escapes the `href`. What remains is a spoofed link, written by the firm's own staff member.

**m2 Minor: the database check is weaker than its comment says** (`prisma/migrations/20261124100000_fo3v_video/migration.sql:63-64`).
Steps: `select fo_video_link_ok(...)` on a migrated database (collation C).
* Accepted (true): `https://a.example/x` with U+2028 or U+2029 inside, with NBSP inside, `https://user:pass@a.example/`, and `https://"><script>`.
* Refused: CR/LF, tab, NEL.

A full scan of code points shows the check refuses only ASCII controls, space and C1. The comment says "nothing a calendar file or an email could read as a new line … so no writer can store another". Today the API's check sits in front of it, so this is defence in depth only, but FO-3vm will add a second writer.

**m3 Minor: two sessions of one person can bring a cleared link back** (`video/service.ts:97`, `:105`: the row is read, then a full row is written, with no lock).
Steps (`lost_update.mts`):
1. Save `https://lost.example/old-room`.
2. Tab B sends `PUT {sourceChoice:null}` and reads the row.
3. Tab A sends `PUT {myMeetingLink:null}` and commits.
4. Tab B writes.

The row ends as `{myMeetingLink:"https://lost.example/old-room", sourceChoice:null}`: the link A cleared is back, and new bookings use it (see m4).
Related: 20 concurrent first saves by `user-T` all return 200 and leave one row (held), but they write 6 identical "Video choice changed" audit lines (null → MY_LINK) for one real change.
Expected: the second write sees the first, for example with `SELECT … FOR UPDATE`, or an update of only the fields sent.

**m4 Minor: "no choice" still uses the link** (`video/service.ts:67`, `:78`).
Steps:
1. `PUT {myMeetingLink:"https://r-room.example/r"}`
2. `PUT {sourceChoice:null}`. GET now says `sourceChoice:null, sources:["MY_LINK"]`.
3. Make a public Video booking.

`joinLink` is `https://r-room.example/r`. An explicit null is kept (`settle`), but `linkFor` falls through the fixed order anyway. Either refuse null while the person has a source (rule 3: pre-set to the first), or treat null as none.

**m5 Minor: a deactivated host's personal room stays on bookings already made** (`booking/service.ts:771` reminders, `:937` `joinLink`).
Steps:
1. `user-O` saves `https://o-room.example/o`.
2. Booking `3ed270a7…` moves to O and gets that link (verified).
3. `POST /api/platform/staff/<O>/deactivate`.

O's `fo_video_pref` row is dropped (held), but `fo_booking_video` for the live booking keeps `https://o-room.example/o` with `voided_at` empty. The 24 h and 1 h reminders and the booker's manage page keep giving a departed person's own room to the client. The brief covers only "never used at confirmation"; whether §12 also reaches the booking copies is the row owner's call.

**m6 Minor: the host's "Add a video link" item is made but cannot be seen** (`api/src/platform/notifications/store.ts:92`; `ports/notifications.ts:30`).
Steps:
1. Clear `user-R`'s link.
2. Make a public Video booking.

What I saw:
* Exactly one `msg_notification` row is made (`video-link-needed`, NEEDS_YOU, item booking) through the real port on the public door. This held, and no booking was lost.
* `GET /api/platform/me/needs-you` returns `items: []`, because Home lists only MY_DEADLINES.
* `GET /api/platform/me/notifications/items` shows the row with `label:null, link:null`.

The rule-7 words ("Add a video link for <booker>'s <time> call") appear nowhere. The brief asked only for the `notify` call (DW3 counts rows), so this is noted, not a refusal.

**m7 Minor: another person's id is refused in only some shapes.**
* `PUT /api/front-office/me/video?staffId=<R>` as `user-O` returns 200 and saves O's own row.
* A body `{"id":"<R>"}` returns 422 "not allowed here", not 403.
* `StaffId` (other case) returns 422.

No request reached another person's row in any shape. Only the answer differs from "another person's id → 403".

## What held
* **Bad links refused**: `javascript:`, `https://javascript:…`, `HTTPS://`, CR/LF, LF, NEL, U+2028, U+2029, VT, tab, NBSP, BOM, `user:pass@` and `user@`, a bad port, and 2,049 code points all return 422 "Enter a full link starting with https://" with nothing saved. 2,048 four-byte emoji are saved, and the DB `char_length` agrees. A 300 kB body returns 413. Form or `charset=utf-16` bodies return 415 or 400.
* **Own record only**: `staffId`, `userId`, `staff_id`, `personId` → 403 `OWN_RECORD_ONLY`; `__proto__`, `constructor` and arrays → 422; `/me/video/<id>` → 404. Another firm's Owner reads only their own empty row. No sign-in → 401. Tokens of a deactivated person → 401 `STAFF_NOT_ACTIVE`, nothing saved.
* **PF-12 walls**: as `xr_app`, firm B sees 0 rows in both tables. Insert or move into firm A from B, or `firm_id` A→B, are refused by `platform_firm_first`; an update from B changes 0 rows; with no firm, 0 rows. `check_pf12_walls.ts`: 110 passed, 0 failed.
* **Link on each booking** (real ports, public door and token door):
  * the host's link reaches the email, the `.ics` `LOCATION`, the public `joinLink` and the host's invite;
  * with no source: "Your join link will follow.", no LOCATION, one item, and the booking is made (201);
  * a token reschedule to a new host with a link → that host's link;
  * a token reschedule to a new host with none → the row goes, the "moved" email says "Your join link will follow.", one item for the new host.
* **No refusal path in the transaction**: the pref check and the booking-link check are one function, so a saved link always fits `fo_booking_video`. No refusal path was found that could roll a booking back.
* **Deactivation**: deactivating through the API drops the row in the same request.
* **Never logged**: no link in `api.log` (187+ lines, including the 422s), in `audit_event`, or in any other public table. Links are only in `fo_video_pref` and `fo_booking_video`.

Breaker: Approve
