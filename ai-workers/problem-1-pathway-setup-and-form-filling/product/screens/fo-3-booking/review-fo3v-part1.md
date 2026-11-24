# Review: FO-3v part 1, video meeting links, runtime half (R1.112), PR #3418 at ba232f8bd

Reviewer: Opus 5.5, fresh context (I did not build it). Skills `screen-review` and `journey-test` (reviewer role): `journey-test-reviewer-fo3v-part1-2026-11-24.md`, **9.5/10**. 24 Nov 2026.

**Scope.** This is an API and schema row with no page: the My account → Video panel (DW7) is part 1b, so the visual, keyboard, 1024 px and BIC criteria are N/A.
- The bar: brief `lead-b-briefs/FO-3v.md` ("What to build, part 1"; DW1, DW2, DW3, DW5, DW6), and AG-4-29, AG-4-58, AG-4-59, AG-16-73 as printed by the trace tool. Also STANDARDS and QUALITY.
- Size: 605 lines added and 21 removed, under the P-610 cap of 800.

**Verdict: Block** for `ba232f8bdff074081e533aaf8e9f0e32c268ec4a`. There is one Major, and it is already fixed on the branch's newer head cdba0ac7d (M1). Otherwise the row is correct, the rules hold through the running app, and every rule's test fails when the rule is removed.

## Runs (my copy `runtime_rev` on :4436, stopped afterwards; never :4400)
- **`check_fo3v_video.ts` at ba232f8bd:** 26/26, exit 0, about 8 s.
- **Mutation pass** (scratch worktree at ba232f8bd, each mutation reverted). Each of these 11 mutations turns at least one line red:
  - the inactive-host check removed; cancel no longer voids; the new host's link skipped; the URL put in the audit detail;
  - the trigger's WHEN made false; `notify` removed; the type's `meetingLink` restored as a fallback; the own-record 403 removed;
  - `setVideo` called on every move; the JS length check removed; the choice no longer checked against the person's sources.
- **Other suites:** `check_fo3pa_public_answers.ts` 45/45. `typecheck.mjs`: no new errors (15 known), api and web. The drift line of `check_cssd1_no_drift.ts` passes; its last line needs a server on :4631 (my environment, not this PR).
- **`check_pf12_walls.ts` at ba232f8bd: FAIL** on "every trigger function on a firm table runs as xr_wall_reader — platform_staff trigger function fo_video_drop_on_deactivate" (M1). At cdba0ac7d that line passes, and fo3v is still 26/26.
- **API journey on the copy:** 9 journeys plus a break pass (details in the journey report).
- **Graph (P-86):** `graph.mjs` does not list the bare `@Get()`/`@Put()` routes of `api/front-office/me/video` (a tool gap, n4). Both routes are reached by `check_fo3v_video.ts`, and the MODULE cards name it.

## Done when
- **DW1 pass/fail: met.**
  - Refused with 422 and the exact words, nothing saved: `zoom.us/j/1234`, `http://`, 2,049 characters, `javascript:`, CRLF, a space, no host.
  - Saved: `https://zoom.us/j/1234567890` and exactly 2,048 characters. The database check refuses a non-https link written past the API.
- **DW2 pass/fail: met.** The link reaches the email, both invites' LOCATION and the 1-hour reminder. A Phone booking has none, and the type's link never appears.
- **DW3: met.** One item, and no second on a re-confirmation. The words are not visible (m1).
- **DW5: met.** A move keeps the link and sends one invite. A cancel sets `voided_at`. A new host's link replaces the old one, with one audit line per host change.
- **DW6: met.** I checked `audit_event` and `api.log` on the copy; the check's own capture is thin (m2).
- DW7 is part 1b; DW4 and DW8 are part 2.

## The builder's four choices
1. **Trigger on `platform_staff` instead of a STAFF_DEACTIVATED listener: accepted.**
   - It drops the row atomically for every writer of `status`. Main has no general event consumer, and the route still writes its `module_event`, so a listener can replace the trigger later.
   - Conditions: it must follow PF-12's trigger-function rule (M1), and it must be recorded where the platform owner looks (m4).
2. **Back-relation lines on FoBooking and PlatformStaff: accepted.** Prisma needs both sides for the composite foreign keys the drift check compares. One commented line each; no ALTER of either table.
3. **Optional NotificationPort on BookingPorts: accepted.** It is bound on the running copy (one `msg_notification` row from a public-door booking). Being optional only lets the fakes-based suites build without it.
4. **Item not cleared when a link is added later: accepted, as the brief allows.** NotificationPort has no clear method on main, and pasting a link is FO-3vm. Its visible effect is in m1.

## Issues, ranked
**M1 (Must, Major). At this head the deactivation trigger breaks PF-12's rule, and `check_pf12_walls.ts` is red.**
- Where: `prisma/migrations/20261124100000_fo3v_video/migration.sql:73-80`.
- Problem: `fo_video_drop_on_deactivate()` is SECURITY INVOKER and owned by the migrating role. PF-12 requires trigger functions on firm tables to be SECURITY DEFINER, owned by `xr_wall_reader`, with a pinned search_path; CI's walls suite would fail.
- Fix: as in cdba0ac7d (SECURITY DEFINER, `OWNER TO xr_wall_reader`, `REVOKE ALL … FROM PUBLIC`). Verified there: the guard passes, fo3v 26/26. Re-review only that diff and any later one.

**m1 (Should). The host's "Add a video link" item cannot be read or opened.**
- Where: `booking/service.ts:959`, `platform/notifications/store.ts:92`, `web/src/modules/platform/notifications/contract.ts:30-35`.
- What the host sees: the bell reads "Something needs you" with `label`/`link` null. Home's "Needs you" lists only MY_DEADLINES, so it is not there.
- Gap: AG-4-29 rule 7 and AG-16-73 1a want "Add a video link for <booker>'s <time> call" on the home screen. The brief limits this part to the port lines, so list it in the PR as a gap for part 1b (the words) and FO-3vm (a labeller and a page). Not new scope.

**m2 (Should). DW6's check does not read `audit_event`, as the brief asks.** `tests/check_fo3v_video.ts:73` uses `fakeAudit()` and `:101` sets `logger: false`, so only 3 log lines are captured. Fix: bind `auditEvent` (as `check_fo3pa_public_answers.ts:55` does) and query `audit_event` for the URLs.

**m3 (Should). The §12 check deactivates past the product.** `tests/check_fo3v_video.ts:207` updates `platformStaff` as the owner connection. Fix: drive it through `POST /api/platform/staff/:id/deactivate` (as `xr_app`, behind the wall), as my journey J8 did.

**m4 (Should). Record the trigger where platform owners will look.** `prisma/schema/platform.prisma:261` names only the relation. Fix: add "a trigger in 20261124100000_fo3v_video drops this row on deactivation" there, and state the deviation (listener → trigger) in the PR body or `challenge.md`.

**m5 (Should). `sourceChoice: null` with a saved link makes the panel and the bookings disagree.**
- Where: `booking/video/service.ts:296-297` stores no choice, while `linkFor` (`:308`) still uses the link.
- Gap: AG-4-58 rule 3 says the choice lists only the sources the person has and is pre-set to the first. Fix: keep "none" only when the person has no source. (The breaker found it too, m4.)

**Nits.**
- **n1.** A host change to a host with no source deletes the old link row with no audit line (`booking/service.ts:958`). The state is right; the history line is missing.
- **n2.** `booking/settings/types.ts:95` still accepts and audits a type `meetingLink` nothing reads now. The brief keeps the column; the Lead may retire the input in FO-3vm. No web field shows it.
- **n3.** The requirements disagree: AG-16-73's test says "Use a link that starts with https://", AG-4-58 says "Enter a full link starting with https://". The brief chose AG-4-58. This is for the founder (AGENTS.md rule 2).
- **n4.** `graph.mjs` misses routes declared with a bare `@Get()`/`@Put()`. A tool gap, not this PR.

## Code (STANDARDS [M] lines, where they apply to an API row)
- **Data and migrations:** two new tables and a trigger, existing rows untouched. Stamp 20261124100000 is later than main's newest (20261124032000). The rollback is in the header, and the branch merges with main (35 commits ahead) without conflict.
- **Integrity:** one row per person and one per booking, by unique keys. https, length and control-character checks in the database. Six parallel first saves give one row and no 500.
- **Authorisation:** on the server. `AnyStaff` with no key; a body naming `staffId`/`userId`/`staff_id`/`personId` gives 403; no route takes an id; other firms are walled by PF-12 and `firmScope`.
- **Transaction:** the link is written inside the booking's transaction from saved values only (no network, nothing caught). The emails, `.ics`, reminders and public answers all read one helper (`videoLink`).
- **Requests and errors:** no request per row (one extra query per answer). Field errors on `fields.myMeetingLink` and `fields.sourceChoice`; 415 for a non-JSON body.
- **Seed:** `booking-seed.ts:69-70` and `:92-95` give the Sample host a reserved `.example` link, labelled Sample.

## Scores (D1–D20; backend row)
- **D1 8:** every part-1 rule is met except the rule-7 words (m1) and the "none" choice (m5).
- **D2 9:** unique keys, database checks and the race hold. **D5 9:** repeats are idempotent; a refusal saves nothing.
- **D15 9:** 11-44 ms per setting call, 105-158 ms per booking.
- **D16 8:** each rule has a pass and a fail that bite. DW6 and §12 are thinner than asked (m2, m3), and the walls suite was red (M1).
- **D18 9:** each link records its source (provider, audit "source: my link"); MODULE rows added.
- **D19:** booking → link → email → cancel closes through the API; the panel comes with part 1b.
- **N/A:** D3, D4, D6, D7, and D8 to D14 (no page). **D17, D20:** simulated only (no intended user). **BIC-01 to BIC-20:** N/A (not a case-side screen).

## Could not check
- The PR body: its Done-when list, the Duplicate check line, the seed lines and journeys named (no GitHub access here).
- `check_fo3w_booking_browser.ts` (no Playwright browser here), a real Cognito sign-in, and CI for this head.
- The branch moved while I reviewed: cdba0ac7d (M1's fix), plus edits in the shared checkout after the breaker's report. I reviewed only cdba0ac7d's migration lines.

**Verdict: Block** for ba232f8bd. To fix:
1. M1: the trigger function per PF-12's rule (done in cdba0ac7d; re-review that diff).

Should, in the same round: m1 (record the gap), m2, m3, m4, m5.

Reviewer: Block ba232f8bdff074081e533aaf8e9f0e32c268ec4a
