# Journey test, reviewer: R1.20 QA-773 / QA-774 (PR #3465, head 15c7a1baf)

Reviewer, 24 Nov 2026 (skill journey-test, reviewer role: the one journey score for this check). Isolated copies with `PLATFORM_IDENTITY=local`:
:4541 (j_20, twice), :4543 (pf6), :4545 (my probe). :4542/:4544 ran main fa337044c with head's tests. All stopped. Sample rows only; US$0.
The persona throughout is the firm's Owner (Sample), signed in on the card. Plans and bookings are Sample rows added by SQL; the booking is stamped by its trigger.

## Journeys
1. **Main path (QA-773).** Goal: "invite my people; a slip I made on one row must not stop the rest". Five rows: A; B; a staff email; an already-invited email; A again in capitals. Send.
   Expected: A and B invited; the three bad rows stay, each with its own words. Held: "2 invitations sent.", 3 rows stay, one batch call of 5 rows, one invitation for A, an audit line each (j_20 W1/W2, 45/45 twice). On main: no request, all 5 rows stay.
2. **Booked lower plan (QA-774).** Goal: "know how many seats I really have before my renewal". Team, then Invite with 2 rows and 1 seat left under the booked plan.
   Held: "9 of 10 seats used on Sample Lower (…), the plan booked for your renewal"; the form says 1 free seat; row 1 invited; row 2 says "your booked plan (Sample Lower …) has 10 seats". After withdrawing the booking, the line names the plan's own limit again. On main: "6 of 11 seats used on Team (Sample)", and the refusal names Team with the lower plan's number.
3. **Keyboard only, 1024 px (probe).** Focus Invite people, Enter: focus lands in Email, person 1. Type, add rows with Enter, Send with Enter. Held: answered in 241 ms; focus goes to the first flagged row's Email field.
4. **Break-it (probe).** A, then `"  A-UPPER "`, a staff email, the staff email again with no role. Held: one invitation for A. Row flags: DUPLICATE_IN_FORM; ALREADY_STAFF; INVALID_ROLES + DUPLICATE_IN_FORM. Send again: the old duplicate now says "already has a pending invitation: resend it instead." Nothing is sent twice.
5. **Recovery (j_20 W3).** Correct the staff row and remove the others, then Send. The form is locked while the request is in flight; the row is invited and the panel closes.
6. **Across the screen boundary (j_20 W6).** A's email arrives with its link; Accept makes A a staff member.
7. **Widths and accessibility (probe).** Team with a booking at 1440/1024/400: no sideways scroll; axe (WCAG 2.2 A/AA) 0 violations on Team at 400 px and on Invite people with duplicate rows; no page errors.

## Data underneath
One `platform_invitation` per address (lower-cased count 1). Batch audit lines are marked `batch: true`. No invitation for the staff, duplicate or over-limit rows. The booking was withdrawn in each run's cleanup. pf4c1b DW7: the single 409 past the booked limit stores nothing.

## Findings (all Minor; details and fixes in review.md)
* m2: after Send the left-over duplicate row (now "person 1") says "already on an earlier row of this form", but that row has gone. When it is the only row left it cannot be removed (`invite-panel.tsx:91`). Screenshot: probe `invite-after-send-1024.png` (scratch).
* m3: "Your plan has N free seats" under a booked plan's limit; duplicate rows count as seats in the preview (`invite-panel.tsx:26-28, 42`).
* m4: a duplicate row's other server flags are hidden behind "already on another row" while the earlier row stays (`invite-panel.tsx:81`).
* m1 (code, not walked by me; the breaker reproduced it): a pending lowering that lands on the booked seat count names the current plan (`limits.ts:70`).

## Score (each 0, ½ or 1)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | Good rows invited despite a duplicate; booked limit shown and enforced (journeys 1, 2) |
| Next step obvious | ½ | The stale duplicate row tells the user to fix something that is gone; a lone row has no Remove (m2) |
| Plain words | ½ | "earlier row of this form" with no earlier row; "Your plan" for the booked plan's seats (m2, m3) |
| Feedback and state | 1 | Toast, "Not everyone was invited" notice, flags on each row, locked while sending |
| Correct data | 1 | One invitation per address, one batch call, audit lines, booked limit honoured (DB reads) |
| Error recovery | 1 | Re-send gives the correct words; correcting a row and sending works (journeys 4, 5) |
| Accessibility and screen sizes | 1 | axe 0; no sideways scroll at 1440/1024/400; keyboard path; aria-invalid on flagged rows |
| Speed | 1 | Send to answer 241 ms; Team loads within the test's waits |
| Visual quality | 1 | Team components only; screenshots W1/W4 clean |
| Trust and sources | 1 | The plan behind the limit is named on the seat line and in refusals; Sample rows labelled; no AI |

**9 / 10, no 0: pass.** To raise it: fix m2 (words + Remove), then m3's "Your plan" wording.

## Not tested
A real screen reader; an intended user's unaided walk (D17/D20 stay with the founder); 200 % zoom as a screenshot (my zoomed browser context had no session; 400 px reflow passed); CI on the PR.
