# J-41 build notes (part 2 of R1.41; part 1 is FO-3st2's screen, #2243)

**Lead B's lane line (P-733, P-734):** "On claude/screens-fo3st2: follow its recorded resume steps (#2103 is on main), merge origin/main, split to ≤800 lines per P-610 with J-41 (lead-b-briefs/J-rows.md §J-41) in the last PR; reviewer Approve each."

**Duplicate check:** searched BACKLOG (J-41, FO-3st2), open PRs including records PRs (19 Nov), `main`'s code (no `j_41`), qa/BUGS.md; none.

## Done when → test (`tests/journeys/j_41.ts`, on an isolated copy, 1440 px)
* `J-41 W1`: a host sets weekly hours (Monday 10:00-12:00 on My account → Availability; the server holds it).
* `J-41 W2`: adds a day off (the Tuesday, whole day; saved midnight to midnight, Toronto).
* `J-41 W3`: the public page shows no slots that day and slots only inside the hours (the Tuesday cannot be chosen; the Monday offers 10:00 to 11:30 only; the Wednesday, untouched, still 09:00 to 16:30; the slots route says the same).
* `J-41 W4`: ends at row 37's first step, the slot list (the booker picks 10:00 and reaches "Your details").
* `J-41 NR` (fails on the stand-in, P-606): before any change, W3's two judges are false.
* `J-41 DW`: none. Step 0's grep: the booking module's only fakes in a running path are `mail` and `arrival` (`runtime-ports.ts`), used when a booking is made; hours, time off and the slots read use neither, and the walk makes no booking.

## Found while building
* The Monday a week ahead can be a month's last day (30 Nov, with the Tuesday on 1 Dec): the walk moves the public calendar forward and back by its own buttons.
* A new host has no slots at all until their first visit to Availability gives them "Normal hours" (FO-3a's rule); the walk's host opens the page first, as a person would.

## Checks (19 Nov)
* `j_41.ts` 11/11, exit 0, by its header line on a fresh copy (PLATFORM_IDENTITY=local).
* `walk.mjs j_41` (the recorded walk CI runs) could not record here: this cloud machine has no ffmpeg for the video and installing browsers is not allowed in it. The `walks` workflow records it on the PR.
