# FO-3st1 part 1: journey test, reviewer role (19 Nov 2026)

Commit 7071b6f91 (PR #2322), isolated copies :4551–:4553 (never :4400), Chromium headless, browser zone Asia/Dubai, office zone America/Toronto. Firm `maple` seeded by `check_fo3st1_calendar_browser.ts`, plus a Read-only staff member (Client R), Client B's person zone set to Asia/Dubai and a person with a long non-Latin name (reviewer rows, SQL). Scripts and screenshots are in the reviewer's scratchpad (`walk1.mjs`, `walk3.mjs`, `walk4.mjs`, `t1.mjs`, `walk/*.png`). They were not committed.

## Journeys (persona · goal · result)
1. **Case Officer (host)**: "Who did I meet? I'll answer attendance." Two pinned "Did … attend?" items show on this week. Attended removes the item and saves COMPLETED. On the booking, No-show changes it, with both audit lines. **Held.** But **Next week** (or Day view on another day) makes both questions vanish (`w1-co-nextweek-day.png`). They are read from the visible range's feed, not from the due list.
2. **Owner**: "Show me the team's week." There are 60 bookings: three blocks plus "+2 more" opens the hour's list (5 rows), and the address keeps view, whose, date and hour. **Held.** At 1440 px a cell with three blocks shows "Clie…" ×3 (`fo3st1-team-week-60-1440.png`). The names show only on hover.
3. **Owner**: "Move Client F's Monday 11:00 to 09:00." The dialog says "Free times for Client F". Pick another time, Mon 09:00, Move. **It saved silently with host Client D** (Billing and finance, the only free host). There was no "Book anyway?" and no notice. DB: RESCHEDULED, host Client D. This contradicts the PR's deviation 3.
4. **Owner**: "Book lead Client B (lives in Dubai)." The zone line says "Times for Client B Sample in America/Toronto" with no "(change)". The booking is stored with booker zone America/Toronto, not Asia/Dubai (BR-13). A double-click on Book books once. **Partly held.**
5. **Owner, keyboard only**: New booking. Tab order: Person search, person select, type, host, way to meet, free times, Book. Booked once. **Held.** Focus then falls to `<body>` and no "booked" confirmation shows.
6. **Owner**: J-S3 Sunday 11:00. "Book anyway?" lists "Outside Client F's hours". Cancel saves nothing. Book anyway saves, and the audit line names the warning (check run). **Held.**
7. **Billing and finance host (wrong role)**: no Bookings menu, and the plain refusal on the calendar. `feed?view=team` returns 403. Their own booking opens by its link and attendance is answered. Another host's booking says "This booking is not available." **Held.**
8. **Read-only**: no New booking. The panel says "You can view bookings but not change them." and shows no buttons. **Held.**
9. **Errors and recovery**: a bad id says "This booking is not available."; Keep booking changes nothing. Escape on New booking with typed text is guarded. Two tabs answering the same question: the last answer wins (BR-14 allows a change). **Held.**
10. **Office zone "today"**: at 21:00 Thu 19 Nov in Toronto, Day view shows **Fri 20 Nov**. At 22:00 Sun 22 Nov the week shows **23–29 Nov** (`t1.mjs`). "Today" is the UTC date.

## Replay (automated)
`check_fo3st1_calendar_browser.ts`: 21/21 on three runs. A fourth run stopped at 15/16 inside the Keep / Cancel booking step (one flake in four). Axe (WCAG 2.0/2.1 A/AA, plus 2.2 AA on the New booking dialog): none serious or critical. 375/1024/1440 px and 200 % zoom (720 px and 512 px): no sideways scroll, and the week becomes a day below 768 px. First calendar view took 781 ms including load (budget < 1 s). No page errors.

## Data underneath
Attendance changes write `booking.completed` and `booking.no_show` audit lines with the staff actor. Book anyway writes "with warnings: outside hours." The team feed is refused (403) without the list key, and a typed link outside the record rule gets 404. The Move in journey 3 changed `staff_id` without a warning. The booking in journey 4 stored `visitor_time_zone` = office zone.

## Break-it (15 min)
Long Cyrillic/Vietnamese name: the panel and list wrap with no overflow, and the "No email: … will get no confirmation." note shows. Searching by email ("clientb@client.example") gives "No person found", although the hint says "Search by name, email or phone". Wrong role by URL is refused (journeys 7, 9). Double click books once. Reload keeps the view, because state lives in the address.

## Score (QUALITY "Journey score")
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | Every journey ends with its outcome saved (1–9) |
| Next step obvious | ½ | Pinned questions vanish off-range (1); only 12 free times, about two days, then "Pick another time" |
| Plain words | ½ | "Free times for Client F" is untrue (3); the search hint promises email and phone (break-it) |
| Feedback and state | ½ | Loading is text, not skeletons; no confirmation after Book, Move or Cancel (5) |
| Correct data | ½ | Silent host change on Move (3); booker zone is always the office zone (4); wrong "today" (10) |
| Error recovery | 1 | Book anyway / Cancel, Keep booking, not-available text, double click once, refusal for the wrong role |
| Accessibility and screen sizes | ½ | Axe clean, keyboard path and 200 % work; focus is lost to `<body>` after the panel or a dialog closes; `title` tooltips are not reachable by keyboard |
| Speed | 1 | 781 ms first view; one feed request per view |
| Visual quality | ½ | "Clie…" ×3 blocks at 1440 px; cramped Host and Way to meet columns in List (`l1-long-name-list.png`) |
| Trust and sources | 1 | "Outside <host>'s hours" from the audit; "Cancelled by Client F."; attendance is a person's click and audited |
| **Total** | **7 / 10** | **Below the pass (8)**; no criterion at 0 |

**Fixes that raise the score, most valuable first:** keep the host on Move, or say plainly that the host changes (correct data, plain words). Read pinned questions independently of the visible range (next step). Use the office-zone date for today (correct data). Make the zone line changeable and send it (BR-13). Use house skeletons and a saved confirmation, and return focus to the opener (feedback, accessibility). Show readable block text when three share a cell (visual).

**Not tested:** a real screen reader; an intended user's unaided walk (D17, D20 stay with the founder); DST-day rendering and a fee of `-1` (part 2, and the breaker's list).
