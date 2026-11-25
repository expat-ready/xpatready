# J-41 build notes (part 2 of R1.41; part 1 is FO-3st2's screen, #2243)

**Lead B's lane line (P-733, P-734):** "On claude/screens-fo3st2: follow its recorded resume steps (#2103 is on main), merge origin/main, split to ≤800 lines per P-610 with J-41 (lead-b-briefs/J-rows.md §J-41) in the last PR; reviewer Approve each."

**Duplicate check:** searched BACKLOG (J-41, FO-3st2), open PRs including records PRs (19 Nov), `main`'s code (no `j_41`), qa/BUGS.md; none.

## Done when → test (`tests/journeys/j_41.ts`, on an isolated copy, 1440 px)
* `J-41 W1`: a host sets weekly hours (Monday 10:00-12:00 on My account → Availability; the server holds it).
* `J-41 W2`: adds a day off (the Tuesday, whole day; saved midnight to midnight, Toronto).
* `J-41 W3`: the public page shows no slots that day and slots only inside the hours (the Tuesday cannot be chosen; the Monday offers 10:00 to 11:30 only; the Wednesday, untouched, still 09:00 to 16:30; the slots route says the same).
* `J-41 W4`: ends at row 37's first step, the slot list (the booker picks 10:00 and reaches "Your details").
* `J-41 NR` (fails on the stand-in, P-606): before any change, W3's two judges are false.
* `J-41 DW`: none. Step 0's grep, re-run on main after FO-2 part 3b (19 Nov evening): no fake is left in the booking module's running path (`arrival` is the real `PrismaArrival`; mail is the app's MailPort). Hours, time off and busy times come from the database, and the walk makes no booking.

## Found while building
* The Monday a week ahead can be a month's last day (30 Nov, with the Tuesday on 1 Dec): the walk moves the public calendar forward and back by its own buttons.
* A new host has no slots at all until their first visit to Availability gives them "Normal hours" (FO-3a's rule); the walk's host opens the page first, as a person would.

## Checks (19 Nov)
* `j_41.ts` 11/11, exit 0, by its header line on a fresh copy (PLATFORM_IDENTITY=local).
* `walk.mjs j_41` (the recorded walk CI runs) could not record here: this cloud machine has no ffmpeg for the video and installing browsers is not allowed in it. The `walks` workflow records it on the PR.

## Review round 1 (19 Nov, fresh Opus reviewer, on 7a8c5832f): Changes requested, journey 8.5/10; fixed
* **Major M1, fixed:** a run starting in Toronto's last hour (about 4% of start times) took Wednesday and Thursday for "Tuesday" and "Wednesday" (a +1 h nudge), and the slots-route line then failed. The days are now read at local noon plus 24 h steps, and the walk stops at once if they are not Monday, Tuesday, Wednesday.
* **Minor m1, fixed:** the swaps note said the slots read uses no fake; it asks FO-2's `arrival` fake for the consent sentence "Your details" shows (no judge reads it; no swap is due in this row). The note and the test's header now say so.
* **Minor m2, fixed:** the W1 and W2 screenshots had the sticky top bar drawn over the changed rows; they are now viewport shots with the row scrolled into view.
* Held: every judge is real (the NR lines show both false before any change), "Swaps: none", waits fail loudly, selectors match both pages, the header is read by `walk.mjs`. Reviewer's own runs: 11/11 twice, exit 0.

## The chain for R1.41 (Lead B on #2243, 19 Nov 13:1x IST)
#2243 (the screen) → #2252 (FO-3a part 1c: one name per set of hours; a deactivated colleague is not a target; breaker M4 and m11) → this PR (J-41 and the records). J-41 runs on the fixed API: its host makes no second set and no colleague is deactivated, so no step changes.

## Main merged in after #2252 (19 Nov 20:2x IST)
* #2252 (FO-3a part 1c) is on main. `origin/main` merged in: one conflict, the same one-line clash in `front-office/routes.tsx` that part 1 (#2243) met with FO-4 part 2a's routes; resolved to the same file as part 1's head, so part 1's merge brings no second conflict.
* The fake note above is corrected: main's FO-2 part 3b replaced the booking module's last fake (`arrival`) with the real adapter while this row waited. The walk was re-run on the merged code (result below).

## Part 1 and FO-3a part 1c are on main (19 Nov 20:3x IST); main merged in
* #2252 merged 20:25 IST, #2243 20:29 IST. `origin/main` merged in: two add/add clashes in records, both expected. `screens/fo-3st2/build-notes.md`: main's copy taken whole (it is this branch's copy plus part 1's later sections). `qa/built/FO-3st2.md`: this branch's line kept (the suite's count corrected from 42 to 53, the reviewer's Minor on part 1).
* This PR's diff is now only the walk and the records: 12 files, under 800 changed lines.
