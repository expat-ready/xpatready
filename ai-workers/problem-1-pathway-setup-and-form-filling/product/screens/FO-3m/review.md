# FO-3m review: booking service answers (API only, no screen)

Reviewer (Opus 5.5, did not build it), 15 Nov. PR #1831, branch `claude/youthful-wozniak-ke5ksj`. Reviewed `git diff origin/main..b0772076b` (5 files) plus `git diff b0772076b e6e328357` (MODULE.md card only). Bar: Lead B's brief `design/lead-b-briefs/FO-3m.md` (at 6774aee3d), AG-4-39 rule 2. US$0, no model calls, isolated pid-named scratch database (not :4400).

## Runs (my own)
* `tests/check_fo3m_answers.ts`: **14 passed, 0 failed** (DW1-DW6, a pass and a fail each).
* `tests/check_fo3_booking.ts`: 133 passed, 0 failed. `tests/check_pf23w_jobs_wired.ts`: 31 passed, 0 failed.

## Mutants (each fix reverted alone, then the file restored; tree left clean)
| Mutant | Case that fails |
|---|---|
| DW1+DW5: old `z.enum` parse, controller passes `body.outcome` | DW1 fail, DW5 fail |
| DW5: `z.strictObject` -> `z.object` | DW5 fail |
| DW2: too-early checked before cancelled | DW2 fail |
| DW3: `{ code: "MISSING_PERMISSION" }` removed | DW3 fail |
| DW4 list: `NOT_LISTED` titles removed | DW4 fail (list) |
| DW4 attendance: `NOT_RECORDED` title removed | DW4 fail (attendance), DW5 fail |
| DW6: `main`'s mailing `runAttendanceAsk` restored | DW6 pass |
All 7 killed.

## Brief cases
* DW1 met: `AttendanceBody` gives issues `outcome: ...` for a bad or missing value (service.ts:125, :311).
* DW2 met: the not-active check now comes before too-early inside the lock (service.ts:317-318).
* DW3 met: `forbidden` carries `code: "MISSING_PERMISSION"`; the test compares it with the guard's real 403 (service.ts:81).
* DW4 met: "Bookings not listed" (both list refusals) and "Attendance not recorded"; booking refusals keep "Not booked" (proven by a pass case).
* DW5 met: `z.strictObject({ outcome })`; an extra key gets 400 naming it, nothing recorded.
* DW6 met: the job parses its payload and sends nothing; `attendanceDue` (endsAt + 30 min, status active) is unchanged, so the booking stays due. Matches AG-4-39 rule 2 "Shown, not pushed (no email, no alert)" and rule 5.

## Outside the touch list (both declared in the PR)
* `staff.controller.ts:40` passes the whole body: **needed and right.** With `(body ?? {}).outcome` the service never sees extra keys, so DW5 is impossible, and DW1's `body:` path came from parsing a bare value. Guard and `@AnyStaff` unchanged.
* `check_pf23w_jobs_wired.ts:176-178`: **needed and right.** The old line waited on an `attendance_ask` mail that no longer exists (it would time out and fail). It now waits for the job's `done` line and asserts no mail, so "the question runs after the restart" is still proven; :180's job-line count is unchanged.
* MODULE.md (e6e328357): one invariant line and the new test in Tests; correct, matches the code. No behaviour change.

## DW6 soundness
* Still scheduled and cancelled: `afterCommit` (service.ts:471-479) is untouched. It keeps the `booking:<id>:<seq>:attendance` key, cancels the old sequence's key on reschedule and cancel, and schedules end + 30 min. The new test sees the job `waiting` at 29 min and `done` at 31 min; FO-3 "queued on JobPort with sequence keys" and R1.9's walk (`tests/qa/check_r19_jobs_walk.ts:52-56`, job row only) still hold.
* Nothing else reads the mail. `grep -rn` across studio (api, web, tests, qa) for `attendance_ask`, `recordAttendance`, "Not booked" finds only the job name, the files in this diff, and `refused`'s default. web/ does not call the attendance route or show that title.

## FO-3 test edits
* `check_fo3_booking.ts:335`, `:340-346`, `:374`: the old "host is asked by mail" line is inverted, and the calls pass `{ outcome }`. These are the assertions that named the old answer, as the brief allows.
* FO-3h DW4 (`:589-590`) is now "no attendance mail". **The host-zone rule is still proven elsewhere:** FO-3h DW1 (`:556-558`, booked mail), DW3 (`:580-582`, rescheduled and cancelled mails) and the `hostZone` Regina case (`:597`) cover every host mail that still exists (`booking.host_*`, service.ts:509). No host-facing time text is left unproven.

## Journey score (reviewer role, the one score for this check): 8.5 / 10, pass
Journeys run over HTTP against the real controller and PF-4 guard (the FO-3m check, re-run by me). Screen criteria are scored on the API answer, since the row has no screen.
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | Host records Attended; a non-host with edit changes it to No-show (DW1/DW5 pass) |
| Next step obvious | ½ | Due list shows the booking; there is no screen yet to act on it (FO-3 screen row) |
| Plain words | 1 | "Attendance not recorded", "Bookings not listed", "Cancelled" |
| Feedback and state | 1 | 400/403/409 with type, title, issues, code |
| Correct data | 1 | Status unchanged after every refusal (statusOf checks) |
| Error recovery | 1 | A fixed body succeeds after a 400; the answer can be changed later |
| Accessibility and sizes | ½ | N/A for the API; field-named issues let a screen point at the field |
| Speed | 1 | Whole check runs in seconds; no per-row requests added |
| Visual quality | ½ | N/A (no screen) |
| Trust and sources | 1 | Rule cited (AG-4-39 rule 2) in code and card; no AI |
Report: `screens/FO-3m/journey-test-reviewer-2026-11-15.md`.

## Issues
Blockers: none. Majors: none.
Minors (optional, none blocks):
1. A body that is not an object (for example a JSON array) still gives the issue path `body:` (service.ts:131). It is a correct answer for a malformed body, just noted.
2. `runAttendanceAsk` (service.ts:554-556) only parses its payload. The comment explains why the job is kept; a later row could drop the job if the record of the question's time is not needed. Not asked by this brief.

**Could not check:** a browser walk (there is no screen); the full `run-suites.sh` (the builder's run).

Verdict: Approve e6e3283572a6d1b1834e8ca1ec946aa897dd1e9c
