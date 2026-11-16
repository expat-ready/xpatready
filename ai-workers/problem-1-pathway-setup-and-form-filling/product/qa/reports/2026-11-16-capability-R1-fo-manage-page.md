# qa · capability, front office: rows 38 and 40 after FO-3w part 2, QA-496 closed (16 Nov 2026, 22:4x IST)

**Mode:** `/qa capability`. FO-3w part 2 (#1982, merged 21:32 IST, 16 Nov) adds the booker's manage page, the page QA-496 found missing. Lead B ruled on #1968 (rev 16.68) that this walk's last line is the acceptance line. This round runs inside the 4 h window (P-613 (4)). Cloud qa lane, Opus 5.5, high effort. **Tested on main f7dde02c8.** Live AI off, US$0, no priced button. Isolated copy `qa_fom` on :4473, started and stopped in one command; :4400 untouched. All times are IST.
**Verdict (fresh Opus 5.5 reader that ran nothing, P-303; `2026-11-16-capability-R1-fo-manage-page/verdicts.md`):** **R1.38 Partial · R1.40 Partial · QA-496 closed.** No new findings. (The reader saw the 34/34 runs; the 35/35 re-run adds only the guard check.)

## 1. On GitHub (P-339)
No GitHub run has been read on main f7dde02c8's tree. The only batch run after #1982 (#2004, which holds #1968) went red on FO-3w part 2's own suite, `check_fo3w_manage_browser.ts`: a `fo_consultation_type` check constraint, an interaction inside that batch (see the comment on #1968). Neither row could move to Works today without a green run on main's tree, even with every part merged.

## 2. Walk by screens
`tests/qa/check_r138_r140_booking_page_walk.ts` (extended): **34/34, twice** at 22:4x IST. Then, after the reviewer's change (the manage-page steps used to be skipped silently if Reschedule were missing; now that is a check of its own), **35/35, twice** at 01:3x IST on 17 Nov, on the same app code (main f7dde02c8 merged into this branch). The current files are `…/booking-page-walk-{1,2}.txt` and `…/shots/`.

Unchanged from the 14:1x round: three bookings from the booking page in an Asia/Dubai browser, either side of Toronto's 14 Mar 2027 change, at 1440, 1024 and 400 px, with axe clean on each page. "You are booked", "Add to calendar" and the email all agree.

New, by screens:
- **Reschedule** on "You are booked" now opens "Your booking: Tuesday 16 March, 18:00 Asia/Dubai time…", with Reschedule and Cancel on it. **QA-496 is closed.**
- **Move to this time** says "Booking updated. We have sent a new email…".
- After the moved mail arrives, **Cancel booking** turns the booking CANCELLED underneath.
- The booker's demo inbox then holds three invites: one UID, SEQUENCE 0, 1, 2, METHOD REQUEST, REQUEST, CANCEL. The moved invite carries the new time in UTC, not the old one.

As this morning, the walk waits for each mail before the next change. A mail whose booking has already changed is skipped by design (`runMail`).

## 3. Verdicts
| Row | Verdict | Why |
|---|---|---|
| R1.38 Time zones booking page to invite | **Partial** | The booker's side holds by screens, now also through a move. Missing: FO-3st1 (no staff-zone screen) and J-38. Gate A not met. |
| R1.40 Calendar invite files | **Partial** | Every Done-when clause is now shown by screens (book, change, cancel), and the walk reaches the next step. Missing: J-38 (P-606 (2)), plus a GitHub run on main's tree (P-339). |

## 4. Bugs
**QA-496 closed** (row moved to `qa/BUGS-CLOSED.md`): fixed by FO-3w part 2 #1982. No new findings.

## Not tested
- The manage page at 1440 px, and axe on it.
- The host's invites after a move or cancel by screens (they were shown underneath in earlier walks).
- The moved time is the first slot the page offers, so it depends on the clock rather than on a fixed daylight-saving case.

## Questions for the Lead
None.
