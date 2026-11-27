# walks.yml on main d3d0148570c63f8374e8adcd723ebff4ae0b29c3 (dispatched twice by Lead 8, series 3, 02:3x IST 21 Nov)
Read from the job logs with the GitHub tools (artifact downloads are blocked in this cloud lane). Both runs: conclusion success.

| Run | Job | Journey | Result |
|---|---|---|---|
| 44818224820 | 136572315567 | j_38 | 39 PASS, 0 FAIL ("39/39 passed", exit 0); artifact walk-j_38-d3d014857… id 14671405885 |
| 44818224820 | 136572315628 | j_110 | 14 PASS, 0 FAIL ("14 passed, 0 failed", exit 0); artifact id 14670158559 |
| 44818327469 | 136572624893 | j_38 | 39 PASS, 0 FAIL; artifact id 14670283094 |
| 44818327469 | 136572624779 | j_110 | 14 PASS, 0 FAIL; artifact id 14670193137 |

The self-test fixtures (j_0_fails, j_0_throws) failed on purpose and passed their self-test step.

## j_110, run 44818224820 (run 44818327469 identical, line for line)
PASS  J-110 setup: the Sample firm, a person with a lead owned by the Case Officer, and a retainer template
PASS  J-110 W1 pass: before any check, the retainer Send answers SENT with the warning naming the person
PASS  J-110 W1: the lead page says the same sentence in its Identity check section
PASS  J-110 W2: the Case Officer saves the check by screens: one row for one Save
PASS  J-110 W3 pass: it is listed with plain words, the last 4 only, the expiry and who checked
PASS  J-110 W3 fail: the no-check sentence is gone
PASS  J-110 W3: Open copy saves the same bytes that were uploaded
PASS  J-110 W4 fail: after the check, the retainer Send answers SENT with no warning
PASS  J-110 W5: the server refuses the expired document as the basis (422 on fields.documentExpiry, FO-13i part 2, QA-510)
PASS  J-110 W5: an expiry before the firm's today shows the sentence on the field, the panel stays open and nothing is stored
PASS  J-110 W6 setup: Convert to client wins the prospect, and the app's poll makes its client (FO-8), linked to the same person
PASS  J-110 W6 pass: the client page lists the check with method, document type and country, expiry, who checked and when
PASS  J-110 W6 fail: on the client page the panel is read-only (no Record a check; checks are recorded on the lead or prospect page)
PASS  J-110: no page error in any browser step
14 passed, 0 failed

## j_38, both runs (the same 39 lines; key ones)
NOTE  the moment walked: 2026-11-23T15:00:00.000Z = 10:00 Toronto (EST) = 19:00 Dubai, Monday, November 23, 2026
PASS  J-38 W1: "Monday 23 November, 19:00 Asia/Dubai time" is offered (10:00 Toronto, shown in the booker's zone)
PASS  J-38 W1: underneath, one booking at that instant, with the booker's zone kept — ["2026-11-23T15:00:00.000Z","Asia/Dubai"]
PASS  J-38 DW1: … outbox rows … DELIVERED … both in the app's demo inbox
PASS  J-38 W2: the booker's mail reads "Monday, November 23, 2026 at 7:00 p.m. (Asia/Dubai)"
PASS  J-38 W3: the host's mail reads "Monday, November 23, 2026 at 10:00 a.m. (America/Toronto)", in its subject and its text
PASS  J-38 W6: the host's calendar names the office zone (America/Toronto) and shows the booking in the 10:00 row of 2026-11-23 — zoneSaid "Your meetings and the team's. Times in America/Toronto (office)."
PASS  J-38 W6: the detail reads 10:00–10:30 America/Toronto and 19:00 for the booker (Asia/Dubai) — "Mon 23 November 10:00–10:30 America/Toronto · 19:00 for Ana Sample (Asia/Dubai)"
PASS  J-38 W6: the staff screen states no time in the browser's own zone (Europe/London) — londonHour 15
PASS  J-38 W4: the .ics from the booker's mail / the host's mail / "Add to calendar" is one event at 2026-11-23T15:00:00.000Z for 30 minutes, REQUEST, the booking's UID (three lines)
PASS  J-38 W4: the booker's mailed invite is the invite "Add to calendar" gives
PASS  J-38 W5: the reschedule link opens the booker's own page … offers Reschedule: row 42's first step
PASS  J-38 W7: staff move to 2026-11-23T16:00:00.000Z (11:00 Toronto) … sequence 1, RESCHEDULED; both inboxes: REQUEST, same UID, seq [0,1], DTSTART new time; mails name 8:00 p.m. (Asia/Dubai) and 11:00 a.m. (America/Toronto)
PASS  J-38 W8: staff cancel … CANCELLED, sequence 2; both inboxes: METHOD:CANCEL, STATUS:CANCELLED, same UID, seq [1,2]; the booker's cancel mail carries no manage link
plus axe clean on each page (W1 ×4, W5, W6 ×2). 39/39 passed.
Note: the walk's day is the first ≥26 h ahead (23 Nov 2026, EST); J-38 itself crosses no clock change (W7 moves an hour on the same day).
