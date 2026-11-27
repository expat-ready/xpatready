# qa capability R1.39 (staff calendar screen), 22 Nov 2026

Run: `/qa capability R1.39` · main 01841047d · isolated copy :4439 (`j39`, `PLATFORM_IDENTITY=local`), fresh for each run, stopped · live AI off · US$0 · Sample data only.

## Verdict: Partial (was Not built). Not Works: "and time off" is not built (QA-743, Major)

Parts on main: FO-3st1 part 1 (#2322), part 2 (#2717), FO-3st2 (Availability and Time off).

## Journeys (persona: a Case Officer who hosts consultations)
1. Main: sign in, Home › Bookings calendar, New booking for a lead, see it in Week, Day and List, open it.
2. Time off: add a day off on My account › Availability, see it on the calendar.
3. Another person's calendar: Team and the Host filter with the list key.
4. Wrong role: a host without the list key (Billing and finance).
5. Keyboard, 400 / 1024 / 1440 px, axe.

## What held (`tests/journeys/j_39.ts`, twice on fresh copies, 16/17 both runs, exit 1)
* W1 signed in on the sign-in card; Home has the link "Bookings calendar"; New booking (person found by name, herself as host, the first free time) says "Booked Client P Sample for Mon 23 November 09:00 America/Toronto."; stored once.
* W2 Mine › Week: one block in that day's 09:00 cell, office zone named; Day: the same; List: "Mon 23 November 09:00–09:30 · Client P Sample · Free consultation · Client C · Video call · Scheduled". Before the booking the week is empty (P-606).
* W3 the block opens the booking's panel (person, time, type, host, lead number); the address is the booking's own; focus and Enter open it too.
* W5 with the key: Mine never shows a colleague's booking, Team does, "Host: Client I" narrows to it and stays in the address. Without the key: no Bookings menu, "You do not have permission to do this.", a colleague's booking "This booking is not available.", team feed 403; their own booking opens by its link and the own feed holds only it (concept fo-3-booking Q4, our decision, tested as decided).
* W6 Team week at 400, 1024, 1440 px: no sideways scroll, no serious axe violation. No page error.

## What failed
* **QA-743 (Gap, Major): time off never shows on the calendar.** W4: a whole day off on Tue 24 Nov is saved and listed on Availability; Week, Day and List for that day show an empty, free day. The calendar reads bookings only. On no backlog row.

## Journey score: 9 / 10 (passes the score; the row still fails a done-when clause)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | ½ | bookings yes; time off no (W4) |
| Next step obvious | 1 | New booking, views, Mine / Team |
| Plain words | 1 | refusals and "Booked …" in plain words |
| Feedback and state | 1 | saved line, status chips |
| Correct data | ½ | bookings exact; a day off reads as free |
| Error recovery | 1 | views, day and host kept in the address |
| Accessibility and sizes | 1 | W3 keyboard, W6 |
| Speed | 1 | no wait over 1 s seen |
| Visual quality | 1 | `screens/J-39/screenshots/` |
| Trust and sources | 1 | office zone named on every view |

Fix that lifts the row: show the viewer's time off (and, in Team, the hosts') on Week, Day and List.

## Also in this round: QA-641 closed (re-check passes)
#2800 merged (caee4edb1). `deploy/cdk/lib/service.ts:157, 168`: the service and the migration log with awslogs to `/xr/<stage>/app`. `npm test` in `deploy/cdk` on main 01841047d: 110 passed, 0 failed, with the F1 pass (staging, production) and fail lines. Row moved to `history/qa-bugs-closed-2026-11-22-qa641.md`. A real log line on the founder's AWS is not checked. QA-642 untouched (PR #2895).

## Could not test
The shared demo :4400 (cloud session); GitHub's runners (no Works claim); the week with accumulated real data (FO-3st1's own check covers 60 bookings); a real screen reader; D17/D20.

## Questions for the tech lead
1. R1.39 says the calendar shows "own bookings and time off"; FO-3st1's row and the concept draw no time off on the calendar. Is time off on the calendar in Release 1 (a new small row), or should the row's words drop it? qa scored the row's words.

## Suggestions
* Show time off as a shaded band with the words "Time off" in Week and Day and a row in List. *Needed for the proof · Capability.*
