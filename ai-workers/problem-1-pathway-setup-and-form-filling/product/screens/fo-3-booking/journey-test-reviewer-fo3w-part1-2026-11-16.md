# Journey test (reviewer): FO-3w part 1, the public booking pages, commit 52d96246d (16 Nov 2026, ~09:30 IST)

Skill `journey-test`, reviewer role: this is the one score for this check. Scoring rule: QUALITY.md, "Journey score".
How it ran:
- Isolated copies on :4541 (main and keyboard walk), :4542 (FO-4), :4543 (second suite run) and :4544 (mutation). The suite's held servers were on 4841-4845. Never :4400.
- Headless Chromium through Playwright scripts that act like a person: click, Tab, type, read. No visible pane was available.
- Data read from PostgreSQL (`fo_booking`, `audit_event`) and from the `.ics` answer.

## Journeys (persona: a visitor with no login; Sample firm `maple`)
| # | Goal in the visitor's words | Steps | Expected | Result |
|---|---|---|---|---|
| 1 | Main path: "Book a free call at a time that suits me in Dubai" | `/book/maple` → Choose → a day → a time → details → Book this time | "You are booked" with the time in Asia/Dubai | **Held**, on the real app (R2) and on the held clock (J-P2) |
| 2 | Alternate: "Show me London times" | "(change)" → Europe/London → Use this zone | Labels redraw, nothing is refetched, the same instant books | **Held.** No API call on the change; stored 18:00Z |
| 3 | Keyboard only | Tab and Enter through every step | Booked; focus visible on every stop | **Held.** Focus ring on every control. Focus drops to `BODY` after choosing a time, after Back to times and after the dialog closes (m1) |
| 4 | Empty: "This firm offers nothing online" | `/book/maple-empty` | Empty text and "Email <firm email>" | **Held** |
| 5 | Error: "I made typos" | Empty names, `client.b@example`, Phone call with no phone | Four sentences on the fields and in "There is a problem"; input kept | **Held.** Summary lines are not links (BIC-13 Partly) |
| 6 | Error: "Someone took my time" | Two tabs on the same time, both book | One booking; the other tab shows "This time was just booked." with next times, answers kept | **Held.** DB: one row and one audit line per booking (14/14) |
| 7 | Wrong address | Unknown firm, hidden, retired or unknown slug, a UUID | One identical "This page is not available." | **Held** |
| 8 | Recovery | Double click; reload after booking; Back | Books once; nothing duplicated | **Partly.** Books once, but reload and Back lose the confirmation (break m1). By code, a lost network answer shows nothing (B-M3) |
| 9 | Small screen, zoom, embed | 360 and 375 px; 1024 and 1440 at 200 %; the page in an iframe from another origin, on the real app | No sideways scroll; 44 px targets; embed books | **Partly.** Page targets are fine and nothing scrolls sideways. **Zone dialog: Close 24 × 24, "Use this zone" 126 × 40 (R1).** The embed renders: the real app sends no frame header |
| 10 | Across the boundary | Confirmation → Add to calendar; Reschedule or Cancel | The .ics has the same instant; manage opens | `.ics` 200 `text/calendar`, DTSTART 20261116T150000Z, the booked 10:00 Toronto. Reschedule and Cancel give "This page is not available." (part 2, stated) |

Replays:
- The builder's suite ran 60/60 twice, on two fresh copies.
- axe found nothing serious or critical, including WCAG 2.2 tags on the zone dialog.
- No console or page error appeared in my walks.

## Break it (15 min)
- **Zones:** `Etc/GMT+14` is refused at the field. "Dubai" is refused (the label says "city", break m6). `Asia/Kolkata` shows as "Asia/Calcutta", the browser's own spelling (break m5). The shapes the picker takes and the server refuses are B-M2.
- **Inputs:** a Persian name with ZWNJ and a 100-character family name, in two tabs: one booked, one told the time was taken. No overflow.
- **Honeypot:** never reached by Tab.
- **Token:** never in the address bar or history (R3). It is in the `.ics` link path, which is FO-3pa's route design.
- **Mutation:** with consent always sent, J-P3 fails. The rule's test bites.

## Score (each 0, ½ or 1)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | Journeys 1-3, 6 and 9 book; R2 on the real app |
| Next step obvious | ½ | Booking flow is clear; Reschedule and Cancel on the confirmation lead to "not available" until part 2 |
| Plain words | 1 | Concept §5 copy; times always carry the zone; three fallback strings undeclared (m2) |
| Feedback and state | 1 | Busy button, skeletons, summary focused, confirmation heading focused |
| Correct data | 1 | Exact UTC instant; consent only when ticked; one row and one audit per booking; `.ics` matches |
| Error recovery | ½ | Slot-taken and field errors keep answers; a lost answer shows nothing (B-M3); the picker takes server-refused zones (B-M2) |
| Accessibility and screen sizes | ½ | axe clean, 200 % fine, keyboard path complete; dialog targets under 44 px (R1); focus lost between steps (m1) |
| Speed | 1 | List 280 ms cold, times 83 ms; a zone change sends no request |
| Visual quality | ½ | Calm team look; header name 16 px off the content column at ≥ 928 px (m4) |
| Trust and sources | 1 | No AI; firm named; consent wording is the firm's Sample sentence; times labelled by zone |
| **Total** | **8 / 10** | **Pass (8 or more, no 0).** The review still blocks on its Majors |

Fixes that would raise the low scores, most valuable first:
1. Map a failed fetch to the §5 sentence (B-M3).
2. Offer and accept only server-valid zones (B-M2).
3. 44 px dialog targets, and return focus to each step's heading (R1, m1).
4. Align the header (m4).
5. Part 2's manage page.

## Not tested
- A real screen reader.
- A visible-browser walk.
- An intended visitor's unaided walk (D17 and D20 stay with the founder).
- Safari and Firefox.
- Mail content (J-38).
