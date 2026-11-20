# J-38 W6 journey test (reviewer), 19 Nov 2026, head 4c953751b

Scope: W6, R1.38's staff-zone step, added by PR #2326 to `tests/journeys/j_38.ts`. The full review is in `review-w6.md`.

## Journeys
1. **Main.** A host whose firm runs on America/Toronto opens the browser in Europe/London to see a meeting booked by Ana Sample from Asia/Dubai. Expected: the week names the office zone, the booking sits in the 10:00 row of its Toronto day, and the detail reads "<day> 10:00–10:30 America/Toronto · 19:00 for Ana Sample (Asia/Dubai)". **Held** (27/27 on :4448; walk.mjs on :4438 gave 27 PASS).
2. **Break: a screen that uses the browser's zone.** A scratch copy forces office-zone formatting into the browser's zone. Expected: W6 fails. **Held**: 24/27, all three W6 content lines FAIL (block in the 15:00 row, detail "15:00–15:30").
3. **Boundary: the next capability.** The booker's mail link opens their own page with Reschedule (row 42's first step). **Held** (W5, last line).
4. **Error: sign-in refused** (a copy without PLATFORM_IDENTITY=local). Read from the code, not run: the walk times out after 30 s with no reason given (review m4).

## Score: 9 / 10, pass
Task completed 1 · next step obvious 1 · plain words 1 · feedback and state 1 · correct data 1 · error recovery ½ · accessibility and screen sizes ½ (axe clean at 1440 px only; no 400 or 1024 px pass, no keyboard pass) · speed 1 · visual quality 1 · trust and sources 1.

## Findings
These are minor. The sign-in and the deep link skip the product's sign-in card and menu (m1). The no-London hour is wrong in the weeks when only one of London and Toronto has changed its clocks (m2). No run across a daylight-saving change on the staff screen (m3). A refused sign-in times out late with no message (m4).

## Not tested
A visible-browser walk (qa's gate A), a real screen reader, a run dated across the change, and an intended user's unaided walk (D17 and D20 stay with the founder).
