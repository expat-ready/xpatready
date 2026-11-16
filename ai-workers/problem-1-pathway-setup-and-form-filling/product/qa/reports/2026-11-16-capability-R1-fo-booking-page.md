# qa · capability, front office: rows 38 and 40 walked on the new booking page (16 Nov 2026, 14:3x IST)

**Mode:** `/qa capability`. FO-3w part 1 (#1921, merged 12:29 IST, 16 Nov) brought the public booking pages, the screen that rows 38 and 40 start from, and this round lands inside its 4 h window (P-613 (4)). The other qa round (11:5x IST, main 90ea6cfe6) scored before it merged, and no open qa PR covered it. This is a cloud qa lane on Opus 5.5 at high effort. **Tested on main fd2dee855.** Live AI was off, spend was US$0, and no priced button was pressed. The isolated copy was `qa_fon` on :4472, started and stopped in one command; :4400 was not touched. All times are IST.
**Verdict (fresh Opus 5.5 reader that ran nothing, P-303; `2026-11-16-capability-R1-fo-booking-page/verdicts.md`):** **R1.38 Partial · R1.40 Partial.** Bugs: **QA-496 new (Gap · Minor, R1.42)**.

## 1. On GitHub (P-339)
**Run 43824985864** (head 8c139599) has tree c5480c05, which **is** main fd2dee855's own tree. Every job was green. Counted lines are in `…/ci-43824985864-suite-lines.txt`:
- FO-3w's browser suite `check_fo3w_booking_browser.ts`: **67/67** (job 133159378935).
- `check_pf19b_mail.ts`: **28/0** (job 133159379046).

The booking API packs were not selected in that batch. Their last counted run is 43796001718 (main ddc6e919c); since then `booking/service.ts` changed by 8 lines (PF-12 walls). qa's re-runs on fd2dee855: fo3 133/0, fo3pa 45/0, fo3m 14/0, pf19b 28/0.

## 2. Walk by screens
`tests/qa/check_r138_r140_booking_page_walk.ts` is headless Chromium on the running copy, with the browser zone set to Asia/Dubai. It ran twice, with **27/28 both times** (`…/booking-page-walk-{1,2}.txt`, `…/shots/`).

A person's path: the firm's list (`/book/<firm>`) → Choose Free consultation → Next month to March 2027 → a day → a time → Your details → Book this time → **You are booked**.

| Booking | Width | Slot shown | Stored | Invite DTSTART |
|---|---|---|---|---|
| Fri 12 Mar (Toronto still EST) | 1440 | 19:00 Asia/Dubai | 15:00Z | 20270312T150000Z |
| Mon 15 Mar (after the 14 Mar change, EDT) | 1024 | 18:00 Asia/Dubai | 14:00Z | 20270315T140000Z |
| Tue 16 Mar | 400 | 18:00 Asia/Dubai | 14:00Z | 20270316T140000Z |

Each run checks:
- the page names the visitor's zone;
- "You are booked" reads the chosen time;
- the database holds the UTC instant and the booker's zone;
- **Add to calendar** gives the invite (200, text/calendar, METHOD:REQUEST), and it is the same invite as the email in the demo inbox (DTSTAMP aside);
- the email reads the Dubai time;
- axe is clean on the list and the times page at each width.

**The next step fails.** On "You are booked", **Reschedule**, which is map row 42's first step, opens `/book/<firm>/manage#<token>`, and that shows "This page is not available." (`shots/next-step-reschedule-400.png`). The page is FO-3w part 2 (`web/src/modules/front-office/routes.tsx`). The same link is in every booking email (`service.ts:598`, `:809`) → **QA-496**.

## 3. Verdicts
| Row | Verdict | Why |
|---|---|---|
| R1.38 Time zones booking page to invite | **Partial** | New: proven by screens from the booking page to the invite, across the change. Missing: FO-3st1 (no screen shows the staff zone) and J-38. Gate A not met. |
| R1.40 Calendar invite files | **Partial** | New: "Add to calendar" matches the emailed invite. Update and cancel are still shown only underneath, since no screen can change a booking (QA-496). Missing: FO-3w part 2 and J-38. Gate A not met. |

## 4. Bugs
**QA-496 · Gap · Minor · R1.42 · owner: screens (FO-3w part 2).** The live Reschedule and Cancel buttons, and the email's link, lead to "This page is not available." No data is at risk and the part is planned. Expected: the manage page, or the links held back until it exists. Check: the walk's last line.

## 5. The rest of the front-office group (P-606)
MVP-CHECKLIST still marks rows 26–37, 39, 41 and 42 Shaped, each with a part not yet merged, so they get no verdict.

## Not tested
- A headed walk and keyboard-only: this cloud copy has no display. The builder's suite covers the keyboard path (J-P3).
- 200% zoom.
- Coverage (c8).

## Questions for the Lead
1. QA-496: hold the Reschedule and Cancel links (and the email's line) until FO-3w part 2 lands, or bring part 2 forward? Either clears it.
