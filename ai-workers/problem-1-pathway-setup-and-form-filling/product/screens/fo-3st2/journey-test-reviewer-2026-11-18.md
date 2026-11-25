# Journey test: FO-3st2 Availability and Time off (reviewer, 18 Nov, commit ea002db43)

Isolated copy :4571 (never :4400), Chromium headless driven like a person: click, type, Tab and Enter. API and database reads came after each journey. Each run created its own people. The probe scripts are in the reviewer's scratchpad and are not committed. Screenshots are the builder's set in `screens/fo-3-booking/screenshots/fo3st2-*` plus the reviewer's own (r-1440, r-1024, r-zoom200, r-stale, r-timeoff, r-long), described below.

## Journeys
1. **Main (Case Officer, own hours):** "set my week". First view shows "Normal hours" (Default) Mon-Fri 09:00-17:00, "Times in America/Toronto". Editing a day and pressing Save hours shows "Saved. Existing bookings are not moved." **Held.**
2. **Alternate (J-A2):** "evening calls for overseas clients". Add a set "Evening calls", set Tue/Thu 18:00-20:00, Save, Make default. The public slots become Tue 18:00-19:30. **Held.** Done in a different order (Make default before Save hours), the hours are lost and the default ends up empty. **Failed: M2.**
3. **Error (J-A3):** 14:00-13:00 gives "End must be after start." on the window, and an overlap gives "These hours overlap." on the later window. Nothing is saved. **Held.**
4. **Admin for a colleague (J-A4):** pick Client F under "Viewing" and add a whole day of time off. It is stored midnight to midnight in her zone, and her 10:00 booking stays SCHEDULED. **Held.**
5. **Wrong role:** a Case Manager or Case Officer opening `?staff=<colleague>` sees only their own page and no picker. The API answers 403. **Held.**
6. **Zone (J-A5):** "Mars/Olympus" is refused on the field. Asia/Kolkata gives "Times in Asia/Kolkata", and time off then reads in Kolkata. **Held.**
7. **Empty and loading:** "You offer no times on the booking page…" and "No time off planned." show, and skeletons appear while answers are held back. **Held.**
8. **Recovery:** two tabs saving the same set. The second gets "Not saved. Someone else changed these hours." with Reload, and Reload shows the first tab's 16:00. **Held.** A Remove refused in a second tab shows nothing. **Failed: m1.**
9. **Keyboard only:** hours work by keyboard. Opening, saving, removing or cancelling time off, adding a set and deleting a set each leave focus on `<body>`. **Failed: M1.**
10. **Across the boundary:** the public slots route reflects the default set (J-A2), and the staff booking route shows the booking unchanged (J-A4). **Held.**

## Data underneath
- Instants are correct for the DST weekend (2027-03-12..14 → 05:00Z..04:00Z), a part day (12:00-17:00 → 16:00Z-21:00Z) and a Kolkata whole day (18:30Z..18:30Z).
- A double click on "Add a set" creates one set.
- Refused saves change nothing.
- The Case Manager's write is refused on the server (403).

## Break-it
- 49 windows: the server's answer is not shown (Minor, m2).
- A 24:00 end shows blank and cannot be typed (Minor, m3).
- An 80-character French and Japanese set name wraps cleanly in the list (r-long).
- 81 characters gives "Name must be 1 to 80 characters." on the field.
- A deactivated colleague opened by URL shows as "Another colleague" (context only; the server allows it).
- An unknown staff id shows "Could not load the hours".

## Score
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | J-A1..A5 all finished through the screen alone |
| Next step obvious | ½ | Make default beside unsaved hours is a trap (M2) |
| Plain words | 1 | Concept strings used; a few extras (m6) |
| Feedback and state | ½ | Silent failed Remove (m1), swallowed 400 (m2), unsaved hours lost without warning |
| Correct data | 1 | Instants, DST and the unchanged booking all checked in the API and database |
| Error recovery | ½ | Stale save gives Reload (good); failed Remove is silent |
| Accessibility and screen sizes | ½ | axe clean (with the form open and with an error too); 375, 1024 and 200 % have no sideways scroll; focus lost (M1) |
| Speed | 1 | First view 274 ms; one request per list |
| Visual quality | 1 | Team tokens, matches settings.html, long names wrap |
| Trust and sources | 1 | No AI; the zone is stated on the hours and on time off; Sample data only |
| **Total** | **8/10** | Passes (8 or more, no 0) |

Fixes that raise the score, most valuable first:
1. Keep focus after each time-off and set action (M1).
2. Save or keep the draft when "Make default" is pressed or another set is chosen (M2).
3. Show a failed Remove, and the `windows` 400 (m1, m2).

## Could not test
- A real screen reader.
- A headed walk at the founder's screen.
- An intended user's unaided walk: D17 and D20 stay with the founder.
