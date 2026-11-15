# FO-3sr journey test (reviewer role, 15 Nov 2026): staff booking routes, API only

Commit e96a6f5a656ff75defd37f5adc2078c7082e5416. There is no screen, so the visible-browser walk, axe, widths and keyboard steps are N/A. The journeys were walked over HTTP the way the coming screen (FO-3st1/st3, J-42) will call them: on the builder's scripted app (`check_fo3sr_routes.ts`, run twice, 28/0 both times) and on an isolated copy of the real `main.ts` on :4436 (runtime ports, local sign-in stand-in, Sample seed; stopped and dropped afterwards). I never used :4400.

## Journeys
1. **Main (case officer):** "book Lee a consultation, move it, mark them attended". Create → listed → reschedule → after the start → Attended gives `booking.completed` last in the outbox. **Held** (W1, 200/201 each step).
2. **Alternate (case officer):** "cancel the second one". `booking.cancelled` is last. **Held** (W1).
3. **Host without the list key (billing/finance):** "see my own consultations and answer whether they came". The list gives own only, `staff=` another person is ignored, and own attendance gives 200. **Held** (DW3, DW5).
4. **Empty (case officer, real app):** the list and attendance-due with no bookings give 200 `[]` in under 20 ms. **Held.**
5. **Error, bad input (real app):** an empty create body gives 400 with one issue per field; from after to gives 400 "Ask for at most 92 days, from before to."; `staff=not-a-uuid` gives 400 "staff: Invalid UUID"; an unknown type gives 404 "No such consultation type." **Held.** Attendance with no outcome gives 400 "body: Invalid option…", which names `body`, not `outcome` (m2, service wording).
6. **Wrong role:** READ_ONLY creating, editing or answering another host's attendance gets 403, and nothing changes in the DB. **Held** (DW1, DW2, DW5).
7. **Wrong firm by URL:** firm B's token on A's booking gives 404, identical to an unknown id, and the row is unchanged. On the real app, `sample-solo`'s Owner cancelling an unknown id also gives 404. **Held** (DW8).
8. **Not signed in / bad token (real app):** with no token, 401 `NOT_SIGNED_IN` on all 7 routes; with a garbage token, 401 `TOKEN_REFUSED` "Sign in again". **Held** (DW7).
9. **Too early / cancelled:** 409 "Attendance is recorded once the meeting has started." / 409 "A cancelled booking has no attendance." **Held** (DW5).
10. **Boundary:** `/ATTENDANCE-DUE` (case) still resolves to the due list, behind the guard; `/not-a-uuid` gives 404 "No such booking." **Held.**

## Data underneath
The test re-reads `fo_booking` after every refusal (unchanged), `fo_booking_token` (0 rows after staff creates) and `module_event` (event order). The audit actor is `staff:<id>` (`service.ts` 315). Roles are enforced on the server twice: the guard (`MISSING_PERMISSION`) and the service (`need`, `staffBooking`).

## Break-it (about 15 min)
Mutation runs (see `review.md`) killed 8 of 10 mutants. The 2 survivors are the reschedule and cancel declarations, still refused by the service (m1). Malformed JSON gives the app-wide 400 parser message (not this row). Double submit and races are the service's, already covered by FO-3/FO-3f (untouched).

## Score (QUALITY.md "Journey score")
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | W1 and journeys 1-3 end to end |
| Next step obvious | N/A | no screen |
| Plain words | ½ | problem details are plain ("No such booking.", "Sign in first…"), but "body: Invalid option" (m2) |
| Feedback and state | 1 | correct status codes; `status` field SCHEDULED/RESCHEDULED/COMPLETED/CANCELLED |
| Correct data | 1 | DB re-reads, byte-identical rows after refusals, no token row |
| Error recovery | 1 | 400 lists every field issue; 401 says sign in again; 409s explain why; nothing half-saved |
| Accessibility and screen sizes | N/A | no screen |
| Speed | 1 | each call 2-16 ms on the copy (STANDARDS §9 budgets) |
| Visual quality | N/A | no screen |
| Trust and sources | 1 | audit actor per staff member; outbox events; no AI, US$0 |

**6.5 of 7 applicable = 9.3 / 10. Pass** (8 or more, no 0). The one fix that would raise the score is naming `outcome` in the attendance 400 (m2, `service.ts` 305; FO-3's owner, outside this row).

Not tested: a real screen reader, an intended user's unaided walk (D17/D20 stay with the founder), Cognito sign-in.
