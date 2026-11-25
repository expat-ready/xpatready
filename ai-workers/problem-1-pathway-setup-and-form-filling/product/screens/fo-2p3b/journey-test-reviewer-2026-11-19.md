# Journey test: FO-2 part 3b, booking arrivals through front office (reviewer)

Reviewer, 19 Nov 2026, head 7d0294fde912c69c2017c0390b66c210bff12b0d.
* Setup: isolated copy `rvw_walk` on :4433 (PLATFORM_IDENTITY=local), started and stopped by the reviewer; never :4400. Firm `sample-firm` (Sample) begins with no sales setup row.
* Playwright, headless Chromium, zone America/Toronto. The script and screenshots were in the reviewer's scratchpad and were not committed.

## Journeys (persona · goal · expected)
1. **Visitor, tick empty, 1440 px.** "Book a free consultation; no marketing email." Expected: booked; one person and one lead (door BOOKING); no consent row.
2. **Visitor, ticks the box, keyboard only, 1024 px.** "Book, and yes to news." Expected: booked; one consent row with the firm's wording, source BOOKING_FORM.
3. **Prospect at Engaged books, email typed in upper case.** Expected: no new person or lead; the prospect moves to Consult; the booking names it.
4. **The same person books again.** Expected: no new lead; no second move.
5. **Case Manager opens Leads, 1440 and 1024 px.** "See who booked." Expected: the two new leads, source "Booking page", Unassigned with Take it.
6. **Break:** races and edge cases, run on a scratch database.

## What held
* J1: booked. 1 person, 1 lead (BOOKING / "Booking page"), receipt CREATED, 0 consent rows. Audit: "Lead L-00001 arrived by a booking."
  * The firm's front office was seeded on this first booking (0 → 1 setup rows).
  * The tick was shown unticked with the firm's sentence.
* J2: booked by keyboard (Tab, Space on the tick, Enter on "Book this time"). 1 consent row: BOOKING_FORM / EMAIL / MARKETING, the firm's wording id.
* J3: 1 person, 1 lead (the earlier one) and no new lead. The stage went Engaged → CONSULT. The booking names the prospect. One `booking.arrived` line on the person.
* J4: no new lead; the BOOKING moves stay at 1.
* J5: Leads shows Client B and Client C, source "Booking page", "2 unassigned", and Take it on each row. The lead page shows Source "Booking page".
* Every state: axe clean (WCAG 2.2 A/AA serious or critical) and no sideways scroll at 1440 and 1024 px. No page or console errors.
* Timing: POST /bookings took 50–122 ms. The 3.3 s from click to answer is the form's minimum fill time (bot guard, `service.ts:872`), not this change.
* Audit: every actor is typed. No personal data in the summaries.

## Findings (detail and fixes in `review.md`)
* **Major (M1):** a staff stage move committed while a booking waits on the row lock → with two open prospects, the other one moves to Consult; with one, nothing moves (`arrival-port.ts:118-122`). Reproduced.
* **Major (M2):** an open-prospect PHONE booking drops the typed phone (`arrival.ts:67-75`). Confirmed from the code and the fake.
* **Minor:** booking vs web form or Add lead with the same email and phone → `40P01 deadlock` (reproduced). The form side gets a 500.
* **Minor:** `contactOf` gives `email: ""` for a phone-only person (reproduced), so the booking mails fail with a ZodError and are retried.

## Score (QUALITY.md "Journey score")
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | J1–J4 booked; J5 shows the leads |
| Next step obvious | 1 | The lead is Unassigned with Take it |
| Plain words | 1 | "Booking page"; "arrived by a booking" |
| Feedback and state | 1 | "You are booked"; "2 unassigned" badge |
| Correct data | ½ | Right on every walked path; wrong card moved under a race (M1); typed phone lost (M2) |
| Error recovery | ½ | The booking retries a deadlock; the form or Add side gets a 500 (m1) |
| Accessibility and screen sizes | 1 | axe clean at 1440 and 1024; keyboard booking; FO-3w covers 360 and 375 px |
| Speed | 1 | POST 50–122 ms |
| Visual quality | 1 | Unchanged screens; screenshots consistent |
| Trust and sources | 1 | No AI step; the source is shown; the wording is marked Sample |

**9/10, pass (8 or more, no 0).** To raise it: fix M1 and M2 (correct data), then m1 (error recovery).

Not tested: a real screen reader; an intended user's unaided walk (D17 and D20 stay with the founder); 400 px for this change (FO-3w covers 360 and 375 px).
