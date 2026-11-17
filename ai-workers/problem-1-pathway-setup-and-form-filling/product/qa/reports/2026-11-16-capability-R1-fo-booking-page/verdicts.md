# Verdicts: R1.38 and R1.40 after FO-3w part 1 (main fd2dee855, 16 Nov, 14:2x IST)

Fresh qa reader (P-303): ran nothing; judged only from this folder's evidence, the test source and the code. All times IST.
Evidence: `booking-page-walk-1.txt`, `-2.txt` (14:15, 14:16 IST; 27/28 each); `shots/`; ci run 43824985864 (tree c5480c05 = main fd2dee855's; fo3w browser 67/67, pf19b 28/0 at 14:03-14:05 IST); local re-runs fo3 133/0, fo3pa 45/0, fo3m 14/0, pf19b 28/0. The fo3, fo3pa, fo3m API packs have no GitHub run on main's head (last counted 43796001718 on ddc6e919c; booking/service.ts changed 8 lines since, PF-12 walls): supporting evidence only (P-339).

## R1.38 Time zones from booking page to invite: Partial (stays)
* Reason: the booker's side now walks by screens; the staff-zone clause of the Done when has no screen, and parts are still missing (P-606: no score).
* Newly proven (screens): `/book/<firm>` in an Asia/Dubai browser states the visitor's zone and offers 10:00 Toronto as 19:00 (before Toronto's 14 Mar 2027 change) and 18:00 (after); "You are booked" repeats it; stored 15:00Z / 14:00Z with zone Asia/Dubai; the booker's email reads the same; 1440, 1024 and 400 px, axe clean, twice. Gate A by screens is now possible for the booker's half.
* Missing: FO-3st1 (no staff screen shows the time in the staff zone; only the host's email does, from the earlier API walks), J-38 (join and walk not merged; grep: only BACKLOG rows, no commit, no branch). Set-up still goes underneath (no firm, hours or type screens: FO-3st2, FO-3st3).
* Gate A: **not met.** The walk cannot reach the staff zone by screens, and the next step (Reschedule, map row 42) dead-ends.

## R1.40 Calendar invite files: Partial (stays)
* Reason: the first invite is proven from the screen; "a change replaces, a cancel removes" is reachable only underneath, because no screen can change or cancel a booking.
* Newly proven (screens): "Add to calendar" on "You are booked" downloads the invite (200, text/calendar, METHOD:REQUEST, DTSTART in UTC on both sides of the change), and it equals the emailed invite in the demo inbox (DTSTAMP aside), at three widths, twice.
* Missing: FO-3w part 2 (`/book/:firmKey/manage`, not built: routes.tsx comment) and FO-3st1 (staff move and cancel), so the update (same UID, SEQUENCE up) and the CANCEL stay proven only by the API walks (inbox walk, staff move); J-38 not merged.
* Gate A: **not met.** The walk ends at the next capability's first step, Reschedule, which shows "This page is not available." (`shots/next-step-reschedule-400.png`; the one FAIL in both runs).

## Ruling on the dead end
* **Finding for BUGS.md: yes.** Gap · **Minor** · capability **R1.42** (map row 42 "Reschedule or cancel by link", Shaped; part FO-3w part 2) · owning lane **screens** (FO-3w part 2).
* Why Minor, not Major: no data is at risk and the booking itself is right; the reschedule and cancel step is a known, shaped, unbuilt part rather than broken work. Why log it at all: main ships two live entry points to it today, the Reschedule and Cancel buttons on "You are booked" and the "To reschedule or cancel: …/book/<firm>/manage#<token>" line in every booking email (booking/service.ts:598, :809), and each lands a real person on "This page is not available." It closes when FO-3w part 2 merges and qa's walk passes its last step.
* It does not change the two verdicts above: they are Partial for their own missing parts; the dead end is why gate A cannot pass yet.
