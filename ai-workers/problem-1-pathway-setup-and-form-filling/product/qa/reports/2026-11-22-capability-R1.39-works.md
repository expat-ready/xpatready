# qa capability R1.39 (staff calendar screen), re-walk after #2929, 22 Nov 2026

Run: `/qa capability R1.39` (Lead 3, task LX939) · main 71984ae8a (#2929 merged as 344f2641a) · isolated copy :4439 (`j39`, `PLATFORM_IDENTITY=local`), fresh for each run, stopped · live AI off · US$0 · Sample data only.

## Verdict: Pass (Works once the GitHub run on this PR's head is green and named in the row, P-339)

Done when: "Day, week and list views of own bookings and time off; open a booking; another person's calendar only with the key". Every clause holds.

## j_39, three times on fresh copies of main's head (twice, then once more after the W4 fail-before fix in 836ec50b7): 20/20, exit 0, same lines; GitHub walks run 45001401036: 20/20
* W1: a Case Officer signs in on the sign-in card and opens Home › Bookings calendar. New booking for a lead at a free time says "Booked Client P Sample for Mon 23 November 09:00 America/Toronto.", stored once.
* W2: Mine › Week, Day and List each show the booking in office time, with the zone named. The week is empty before the booking.
* W3: the block opens the booking (person, time, type, host); so do focus and Enter.
* W4 (QA-743), tied to the day's own cell:
  * before the day off exists, that day's cell holds no time off;
  * a whole day off is added on My account › Availability;
  * Week: that day's cell says "Time off · all day" and no other day's does; its 11 hours are shaded and the booking day's are not; the booking's block stays;
  * Day: the same;
  * List: one row "Tue 24 Nov, all day … Client C … Time off" beside the booking.
* W5, with and without the list key:
  * with the key, Team shows a colleague's booking and "Host: Client I" narrows to it; Mine never shows it;
  * a Billing and finance host without the key has no Bookings menu and gets a plain refusal; a colleague's booking is "not available", and the team feed answers 403;
  * their own booking opens by its link (concept Q4).
* W6: Team week at 400, 1024 and 1440 px, with no sideways scroll and no serious axe violation. No page error.

## Bugs
QA-743 closed (`history/qa-bugs-closed-2026-11-22-r139.md`). No new finding.

## Journey score: 10 / 10
Task completed 1 · next step obvious 1 · plain words 1 · feedback and state 1 · correct data 1 · error recovery 1 · accessibility and sizes 1 · speed 1 · visual quality 1 · trust and sources 1.

## Could not test
A colleague's time off on the Team view by screens (#2929's own check `check_fo3st1_calendar_browser.ts` covers "Not available"); the shared demo :4400 (cloud session); a real screen reader; D17/D20. Screenshots are the GitHub walk's own (not committed: a screens path holds the queue for the Lead's read).
