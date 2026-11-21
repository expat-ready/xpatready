# J-42 journey test, reviewer role, 20 Nov 2026

Item: R1.42 (reschedule or cancel by link; outcomes; consult record), PR #2613 head `a736537ffee8051adebdfd54d8456ef634b167dd`. This is the one journey score for this check.

**Method and limits:**
* I scored from the scripted journey's code (`prototype/studio/tests/journeys/j_42.ts`), its two runs on isolated copies (:4442 18/18, `/tmp/claude-0/j42.log`; :4443 in progress, `/tmp/claude-0/j42b.log`), the committed screenshots and the app code behind each judge.
* I did not walk it in a visible browser myself. The caller said not to start a third copy, and the walk waits about 10 minutes on the real clock.
* Not tested: a real screen reader, 400 and 1024 px, keyboard-only use, and an intended user's unaided walk (D17 and D20 stay with the founder).

## Journeys (persona · goal · expected)
1. **Booker A (client):** "I need to move my consult, then I can't make it at all." Book, open the email link, Reschedule, then Cancel. Expected: "Booking updated", a new email, then "Your booking is cancelled". (W1, W2, W4)
2. **Booker A, error:** "I clicked the link in my first email." Expected: the bad-link sentence and no buttons. (W3)
3. **Booker B, inside the limit:** "My meeting is in a few minutes; can I change it?" Expected: the limit sentence with the firm's phone and no buttons. (W5)
4. **Booker B, expired:** "I open the link after the meeting." Expected: the same bad-link sentence. (W6)
5. **Host (case officer):** "Did B come? Record it." Expected: one click on Attended, COMPLETED and one audit line. (W7)
6. **Host:** "Write what we agreed." Expected: the consult record on the booking detail, then the next-step button (row 53). (W8; **not by screen**)

## What held
* **J1-J5 by screens, with the data underneath.** Exactly two bookings. The database showed `RESCHEDULED` at the new instant and then `CANCELLED`. A's two mails are `msg_outbox` rows DELIVERED by `local:`. B's booking is `COMPLETED` with one `booking.completed` audit line carrying the host's id and the time.
* **Words.** All words on screen are exactly AG-4-36 rule 9, AG-4-37 rule 5 (with 1 hour and the phone) and FO-3w's UPDATED and CANCELLED texts. Screenshots W2-updated, W3, W5 and W6 show them.
* **Accessibility.** axe finds no WCAG 2.2 A/AA violation on: choose a new time, the used link, inside the limit, and the booking detail.
* **No vacuous pass.** Each judge includes the page state attribute, which is absent while the page loads. The chosen slots are named in the PASS lines. A real-clock run near midnight or at month end stays correct, and the W5 margin before B's end was 8-13 minutes.

## Findings (details and fixes in `review.md`)
* **Major (M1):** J6 is not walked. The consult record is saved through its API route with the host's token, the next-step button is never reached, and the gap prints `GAP ` rather than `HELD `, so the recorded verdict reads 18 PASS, 0 HELD (`j_42.ts:217-225`).
* **Minor:**
  * cancel voiding the live link is not checked (`:174-179`);
  * the EUR refusal checks status only (`:227`);
  * no page-error capture, and no axe on the booked or cancelled pages (`:95-99`);
  * the screen-presence regex is loose (`:216`);
  * one screenshot is not committed (`:154`).
* **Break pass (from code, not run):** used link (W3), expired link (W6) and wrong currency (W8) are refused. Not covered: double click on "Move to this time", two tabs, reload during the move.

## Score
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | ½ | J1-J5 by screens; J6 only through the route, and the walk does not reach row 53's first step |
| Next step obvious | 1 | Reschedule and Cancel shown only when allowed; refusals say what to do (reply or call, with the phone) |
| Plain words | 1 | Exact requirement sentences (AG-4-36 rule 9, AG-4-37 rule 5); "Did Ben Sample attend?" |
| Feedback and state | 1 | "Booking updated…" status; "Attended" badge and pressed button (W7-attended) |
| Correct data | 1 | Booking rows, statuses, instants, outbox rows and audit lines are read back from the database (`:137-224`) |
| Error recovery | ½ | Refusals are in words with no dead buttons; reload, back and double click are not exercised |
| Accessibility and screen sizes | ½ | axe clean on 4 states; 1440 px only; no keyboard-only pass |
| Speed | ½ | No timings judged against the STANDARDS §9 budgets; no waits seen in the logs beyond the deliberate one |
| Visual quality | 1 | W2, W5 and W7 screenshots are clean and on the team's look |
| Trust and sources | 1 | No AI; Sample data marked; times named with their zone |

**8/10, pass (8 or more, no 0).** The fix that adds the most:
1. Report J6 honestly as HELD now (M1); it scores fully once FO-3st1's consult-record part lands and the walk reaches the next-step button.
2. Add a keyboard-only pass of J1 and the 1024 px width.
3. Time the manage page's first load against §9.
