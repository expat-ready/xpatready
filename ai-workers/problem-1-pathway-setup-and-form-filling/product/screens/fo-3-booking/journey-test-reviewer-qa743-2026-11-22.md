# Journey test (reviewer): QA-743 / R1.39, time off on the staff calendar, PR #2929 at 690477895

Reviewer role, 22 Nov 2026. Isolated copy `rv743` on :4442 (stopped after; never :4400). Sample firm `maple` written by `check_fo3st1_calendar_browser.ts`, and `maple39` by qa's `j_39.ts`. Office zone America/Toronto; browser zone Asia/Dubai. US$0, no model call.

## Journeys (persona · goal · expected)
1. **Main path.** Case Officer Client C, list key: "I took Wednesday off; my calendar should say so."
   - Expected: Mine › Week, Day and List show "Time off · all day" on Wed only, in office time. Bookings that day stay.
2. **Alternate.** Same person: "Who in the team is out on Thursday afternoon?"
   - Expected: Team › Week shows "Client I: not available · 13:00–15:00", and the List shows the same with "Not available". No reason is ever shown.
3. **Not a booking.** Client C clicks or tabs onto her time off.
   - Expected: nothing opens, and there is no focus stop.
4. **Wrong role.** Client D (Billing and finance, no list key).
   - Expected: team feed 403; her own feed holds only her own time off.
5. **Empty.** A week with no time off.
   - Expected: no time-off row; the empty state as before.
6. **Screen boundary.** My account › Availability › Add time off → Bookings calendar (qa's j_39 W4).
7. **Sizes.** 400, 1024 and 1440 px, and 1280 at 200 % zoom.
   - Expected: no sideways scroll, axe clean, and the period readable.
8. **Data and time.**
   - Feed fields: who and when only.
   - DST days: all-day stays "all day".
   - A deactivated colleague: probe what the feed does.

## What held
- **J1** holds:
  - check line "QA-743 R1.39 pass: a day off saved on Availability…" PASS;
  - j_39 W4 PASS;
  - screenshots `fo3st1-time-off-week-mine-1440.png` and `fo3st1-time-off-list-mine-1440.png`;
  - Wed's bookings are still drawn and still clickable.
- **J2** holds in the List ("Thu 26 Nov, 13:00–15:00 – – Client I – Not available"). In Week the label is cut off (see F1).
- **J3** holds: 0 of 80 Tab stops land on time off; no button or link in an off row; a click opens no detail.
- **J4** holds: 403, and her own feed is empty before she adds a period and then holds that one period only (check line 4). j_39 W5 PASS.
- **J5** holds: check line "fail (before)…" with 0 periods.
- **J6** holds: j_39 17/17.
- **J7** holds for layout: no sideways scroll at any width, axe with nothing serious or critical. It fails for readability (F1).
- **J8** holds:
  - only `id, staff{id,name}, mine, label, startsAt, endsAt` are sent;
  - on fall-back and spring-forward days a whole day reads "all day", with all 24 hours marked;
  - one edge in the repeated hour (F2);
  - a deactivated colleague's period is still sent (F3).
- **Speed:** Team week ready in 0.62 s (1440 px) and 0.47 s (1024 px), including the page load.

## Findings
- **F1 (Major).** In Week, a part-day period's time is not visible at 1024 or 1440 px.
  - The label is cut off ("Client I: not ..." at 1024 px), and the full text is in a hover-only `title` on a non-focusable span.
  - The "shaded hours" have the same computed background as other cells: `rgb(247,247,247)` both (`calendar-page.tsx:199,209`).
  - The check asserts the `data-off-hour` attribute only, so it passes.
  - Evidence: `screenshots/fo3st1-time-off-week-team-1440.png` (Thu 26 Nov), plus my 1024 px crop.
- **F2 (Minor).** On fall-back day, a period within the second 01:00 hour marks no hour row (`contract.ts:83`). The text row is correct.
- **F3 (Minor).** A deactivated colleague's time off shows in Team (`feed.ts:58`).
- **F4 (Minor).** `fo3st1-time-off-day-400.png` shows the List, not the Day.

## Score (each 0, ½ or 1)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | J1, J2 (List), J6 all pass |
| Next step obvious | 1 | Nothing to act on, and it does not look clickable (J3) |
| Plain words | 1 | "Time off", "Client I: not available · 13:00–15:00", "all day", "from 13:00" |
| Feedback and state | ½ | The shaded hours do nothing visible (F1) |
| Correct data | 1 | Office zone, DST all-day, who and when only (J8) |
| Error recovery | 1 | Feed failure path unchanged ("Try again"); 403 in plain words (j_39 W5) |
| Accessibility and screen sizes | ½ | Axe clean, no sideways scroll; part-day time hover-only and cut off (F1) |
| Speed | 1 | 0.47-0.62 s |
| Visual quality | ½ | Labels cut off at 1440 and 1024 px in Team (F1) |
| Trust and sources | 1 | Zone named in header, list column and each title; Sample data; no AI |
| **Total** | **8 / 10** | **Pass** (8 or more, no 0) |

To raise it, most valuable first: fix F1. A visible neutral fill or hatch for the hours, and a time-off row that wraps, lift feedback, accessibility and visual quality to 1 each (10/10).

## Not tested
- A real screen reader.
- A headed, visible-browser walk. Mine was headless Playwright with screenshots.
- Two tabs editing time off. That is the Availability screen, out of scope.
- An intended user's unaided walk (D17 and D20 stay with the founder).
