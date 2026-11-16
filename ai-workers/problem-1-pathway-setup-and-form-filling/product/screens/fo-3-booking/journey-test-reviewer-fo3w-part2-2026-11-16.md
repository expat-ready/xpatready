# Journey test (reviewer): FO-3w part 2, the booker's manage page, commit 3285d306c (16 Nov 2026, ~18:15 IST)

Skill `journey-test`, reviewer role: this is the one score for this check. Scoring rule: QUALITY.md, "Journey score".

**How it ran:**
- Isolated copy on :4541, real app and real clock. The suite's held server was on :4841, with a set clock. Never :4400 or :4533.
- Headless Chromium through Playwright. The scripts act like a person: click, Tab, type, read. No visible pane was available.
- Data read from PostgreSQL (`fo_booking`, `audit_event`).
- Bookings were made through part 1's own type page, then reached by its "Reschedule" link (the screen boundary).

## Journeys (persona: Client B, a booker with no login, browser in Asia/Dubai; Sample firm `maple`)
| # | Goal in the booker's words | Steps | Expected | Result |
|---|---|---|---|---|
| 1 | Main path: "Move my call to a later time" | Confirmation → Reschedule → manage → Reschedule → a time → Move to this time | "Booking updated…", the card shows the new time | **Held.** Opens in 135-218 ms; the move takes about 150 ms; focus goes to the heading |
| 2 | Alternate: "Move it again, then cancel with a reason" (AG-4-36 bug 5) | Reschedule twice, then Cancel → a 5×-repeated Persian and English reason → double-click "Cancel booking" | Both moves, then "Your booking is cancelled…" | **Held.** DB: CANCELLED, sequence 3, the reason stored and not shown back. Audit: scheduled, rescheduled ×2, then "Consultation cancelled by the booker. A reason was given." |
| 3 | Keyboard only | Tab to Reschedule, Enter, Tab to a time, Space, Tab to Move, Enter; then Cancel, Esc, Enter, type, Cancel booking | Done with visible focus | **Held, slowly.** 3 px focus ring. Esc returns focus to Cancel. **142-148 Tabs** through the times, and ArrowRight does nothing on a `role=radio` (S1) |
| 4 | Empty: "No time suits" | Move step with no free time | A sentence, no blank | Not reached on the real data (every day had times). The no-times sentence is in the code only and not in §5 (S3) |
| 5 | Error: "Too late to change" | 3 h before the start; the limit passing while the page is open | The limit sentence with "4 hours" and the phone, no buttons | **Held** (suite, held clock) |
| 6 | Error: "Someone took my new time" | Another booking takes the chosen time before Move | "This time was just booked." + "Please choose another time.", fresh times, booking unmoved | **Held** (suite) |
| 7 | Wrong link | Expired, garbage, `%E0%A4%A`, 5,000 characters, no token, token in `?t=` | One bad-link text | **Held.** All gave the same sentence; the token in a query is ignored |
| 8 | Recovery | Reload after each move; Back; two tabs on one link (one cancels, the other reschedules) | The booking reopens; Back never reopens a dead link; the second tab gets the bad-link text | **Held.** History length 3, and Back lands on the type page |
| 9 | Small screen and zoom | 360 px (suite); 1024 and 1440 at 200 % (512 and 720 CSS px); 1024 | No sideways scroll; 44 px targets; dialog fits | **Held.** Scroll overflow 0 everywhere; dialog 448 px wide inside 512 px |
| 10 | Across the boundary | Part 1's "Reschedule" and "Cancel booking" links | Open this page with the token in `#` | **Held.** Both point to `/book/maple/manage#…` |

**Replays:**
- The builder's suite ran **44/44 twice**, on two fresh copies.
- Axe (WCAG 2.1 A/AA, plus 2.2 AA in my runs) found nothing serious or critical. One transient `target-size` result on the move step did not repeat in four runs.
- No page or console error appeared in my walks.

## Break it (15 min)
- **Wrong firm in the address:** `/book/other-firm/manage#<Maple token>` shows Maple's booking. The token routes take no firm. Nothing leaks, because the token is the key (S7, for the API lane).
- **`/book/maple/MANAGE#…`** opens the page: the router ignores case. Harmless.
- **`/book/maple/manage/extra`** opens the Studio shell's "Page not found". This is App.tsx's catch-all, pre-existing for any deeper `/book/…` address and outside this PR.
- **Rate limit:** after about 30 token calls in 10 minutes from one address, the page shows "Please try again in a minute." (BR-6).
- **Route order mutation:** only the source-order check fails; the router's ranking keeps `manage` ahead of `:slug`.
- **By code:**
  - A switch turned off by staff mid-session leaves the refused button on screen (S4).
  - A cancel refused at the limit drops focus to `BODY` (S5).

## Score (each 0, ½ or 1)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | Journeys 1 and 2: moved twice and cancelled; DB and audit correct |
| Next step obvious | 1 | Two buttons on the card; Move stays disabled until a time is picked (`fo3w-manage-move-1440.png`) |
| Plain words | ½ | §5's words throughout. But "This booking cannot be changed online." sits beside a live Reschedule (S2), and the h1 "Your booking" repeats in the line below it |
| Feedback and state | 1 | "Booking updated" status, the cancelled heading, busy buttons, focus to the heading |
| Correct data | 1 | One row, sequence +1 per move, one audit line per action, reason stored and never shown back |
| Error recovery | 1 | Slot taken, two tabs, limit mid-page, 429 and a stale link each give their sentence; reload works after a move |
| Accessibility and screen sizes | ½ | Axe clean; 360, 200 % and 1024 all fit. But 142+ Tab stops, and `role=radio` without arrow keys (S1) |
| Speed | 1 | Every step under 220 ms (STANDARDS §9) |
| Visual quality | 1 | Clean card in part 1's frame; the dialog fits at 200 % (`fo3w-manage-cancel-dialog-1440.png`) |
| Trust and sources | 1 | The firm's name, the booking's zone named, the firm's phone in the limit sentence; no AI |
| **Total** | **9/10** | Pass: 8 or more, and no criterion at 0 |

**Fixes that would raise the low criteria, most valuable first:**
1. S1: a roving tabindex with arrow keys on the time list.
2. S2: per-switch sentences in §5 at the next concept revision.

**Not tested:**
- A real screen reader, and an intended booker's unaided walk (D17 and D20 stay with the founder).
- Safari and Firefox.
- The no-times state on live data.
