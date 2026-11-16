# Verdicts: R1.38, R1.40, QA-496 after FO-3w part 2 (main f7dde02c8)

Fresh reader (Opus 5.5, ran nothing, P-303), 16 Nov 22:4x IST. Main f7dde02c8 = merge of #1982 (FO-3w part 2, 21:32 IST). Evidence: `booking-page-walk-{1,2}.txt` (both 34 passed, 0 failed; run ~22:43 IST, after the merge, on isolated copy qa_fom), `shots/`, `check_r138_r140_booking_page_walk.ts` (untracked in the working copy). Earlier rows: PR #1968 (branch claude/blissful-fermi-d74j7h).

**GitHub run: none read on main f7dde02c8's tree.** P-339 counts a row as Works only with a green pack on main's head on GitHub's runners, its run id in the row, plus a re-run and this reader. With no run read, neither row could move to Works today even if every part were merged. qa's two local runs are the independent re-run only.

## 1. R1.38 Time zones from booking page to invite: **Partial (stays)**
* Reason: the booker's side holds by screens end to end, but no screen shows the staff zone, and J-38 is not merged.
* New: the walk now goes on to the manage page. Reschedule opens "Your booking: Tuesday 16 March, 18:00 Asia/Dubai time". "Move to this time" (Tuesday 17 November, 01:30 Asia/Dubai time) says "Booking updated", and the moved invite carries `DTSTART:20261116T213000Z`, the new time in UTC. The 14 Mar 2027 Toronto change is still shown both ways on the booking page (19:00 Dubai = 15:00Z, 18:00 Dubai = 14:00Z) at 1440, 1024 and 400 px, twice.
* Missing: FO-3st1 (bookings calendar with times in the office zone; not merged, no staff booking screen in `web/src/modules/front-office/`), and J-38 (join and walk; not merged).
* Gate A: **not met.** The staff-zone half of Done when has no screen to walk (P-606: qa scores only when all parts are merged).

## 2. R1.40 Calendar invite files: **Partial (stays)**
* Reason: book, change and cancel now all run by screens, but J-38 (a part of this row) is not merged and there is no GitHub run on main's tree.
* New: by screens on the manage page, the booker's inbox holds three invites (booked, moved, cancelled) with one UID, SEQUENCE 0, 1, 2, METHOD REQUEST, REQUEST, CANCEL. "Cancel booking" gives CANCELLED underneath (`manage-moved-400.png`, `manage-cancelled-400.png`). "Add to calendar" still matches the emailed invite (DTSTAMP aside).
* Missing: J-38. The host's invites after a move or cancel by screens are not read in this walk (only underneath, in earlier walks). The walk looks at the manage page only at 400 px, with no axe check there.
* Gate A: **by screens, the walk now reaches the next step: met on the booker's path.** The row is still not counted Works, because J-38 is not merged (P-606) and no GitHub run has been read (P-339).

## 3. QA-496 (Reschedule and Cancel links dead-end): **closed**
Evidence (walk lines 29 to 30, both runs): `NOTE next step: Reschedule → /book/<firm>/manage#<token> shows: "Your booking … Reschedule Cancel"` and `PASS next step (map row 42): Reschedule opens a page that can change the booking`. This is the acceptance line that Lead B ruled on #1968. It was the one failure on fd2dee855 (27/28) and passes now (34/34, twice). The row moves to `history/`.

## 4. New findings: **none** (product)
Evidence limits only, not bugs: no axe check and no 1440 px view of the manage page in qa's walk. The new time is the first slot offered, so it depends on the clock rather than on a fixed daylight-saving case. The host's mails after the screen move are not read.
