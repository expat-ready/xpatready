# walks.yml j_38 with W9 on main 51b04d9bc5a63de947de92c6872de1191942feb8 (after #2658, J-38 W9; dispatched twice by Lead 8, series 3, ~05:3x IST 21 Nov)
Read from the job logs with the GitHub tools (artifact downloads are blocked in this cloud lane). Both runs: conclusion success.

| Run | Job | Result |
|---|---|---|
| 44841739167 | 136651783836 | j_38 55 PASS, 0 FAIL ("55/55 passed", exit 0); artifact walk-j_38-51b04d9bc… id 14680479242 |
| 44841813322 | 136652022077 | j_38 55 PASS, 0 FAIL ("55/55 passed", exit 0); artifact id 14681716288 |

W1–W8 lines are as in `walks-github.md` (23 Nov 2026, EST; W6 staff calendar; W4, W7, W8 invites). The W9 lines, run 44841813322 (run 44841739167 identical but for booking ids):

PASS  J-38 W9: the next Toronto clock change is found from today's clock, with an open day on the booking page either side of it — {"changes":["2027-03-14","2027-11-07"]}
NOTE  W9: Toronto's clocks change on 2027-03-13/2027-03-14; booking Friday 12 March and Monday 15 March
PASS  J-38 W9: the two sides are on different UTC offsets (10:00 Toronto = 15:00Z, then 14:00Z) — ["2027-03-12T15:00:00.000Z","2027-03-15T14:00:00.000Z"]
PASS  J-38 W9 before: "Friday 12 March, 19:00 Asia/Dubai time" is offered (10:00 Toronto, shown in the booker's zone)
PASS  J-38 W9 before: "You are booked" for Friday 12 March, 19:00 Asia/Dubai time; underneath it is at 2027-03-12T15:00:00.000Z with the booker's zone kept
PASS  J-38 W9 after: "Monday 15 March, 18:00 Asia/Dubai time" is offered (10:00 Toronto, shown in the booker's zone)
PASS  J-38 W9 after: "You are booked" for Monday 15 March, 18:00 Asia/Dubai time; underneath it is at 2027-03-15T14:00:00.000Z with the booker's zone kept
PASS  J-38 W9 before: the host's week: axe finds no WCAG A/AA violation
PASS  J-38 W9 before: the host's calendar (browser in Europe/London) names America/Toronto and shows the booking in the 10:00 row of 2027-03-12 — zone9 "Your meetings and the team's. Times in America/Toronto (office).", inTen9 1
PASS  J-38 W9 before: the detail reads 10:00–10:30 America/Toronto and 19:00 for the booker (Asia/Dubai), no London time (15:00) — "Fri 12 March 10:00–10:30 America/Toronto · 19:00 for Ana Sample (Asia/Dubai)"
PASS  J-38 W9 after: the host's week: axe finds no WCAG A/AA violation
PASS  J-38 W9 after: the host's calendar (browser in Europe/London) names America/Toronto and shows the booking in the 10:00 row of 2027-03-15 — inTen9 1
PASS  J-38 W9 after: the detail reads 10:00–10:30 America/Toronto and 18:00 for the booker (Asia/Dubai), no London time (14:00) — "Mon 15 March 10:00–10:30 America/Toronto · 18:00 for Ana Sample (Asia/Dubai)"
PASS  J-38 W9 before: the host's mail reads "Friday, March 12, 2027 at 10:00 a.m. (America/Toronto)" and the booker's "Friday, March 12, 2027 at 7:00 p.m. (Asia/Dubai)"
PASS  J-38 W9 before: both invites are one event starting at 2027-03-12T15:00:00.000Z (UTC), the booking's UID — DTSTART:20270312T150000Z ×2, b3ec51eb-…@booking.expatready.com
PASS  J-38 W9 after: the host's mail reads "Monday, March 15, 2027 at 10:00 a.m. (America/Toronto)" and the booker's "Monday, March 15, 2027 at 6:00 p.m. (Asia/Dubai)"
PASS  J-38 W9 after: both invites are one event starting at 2027-03-15T14:00:00.000Z (UTC), the booking's UID — DTSTART:20270315T140000Z ×2, a7d926ca-…@booking.expatready.com
55/55 passed
