# FO-3f journey test (reviewer), 15 Nov 2026

Commit `12c3615c9d742436945a5a2c5a0d349bac744732`, PR #1785. This is an API row with no screen, so the journeys were walked over HTTP and on the service; there was no browser walk, and axe, the widths and the keyboard are N/A.
* **Live:** :4431 on its own database (`xr_studio_rv_fo3f`, dropped afterwards). Never :4400.
* **Suite:** `check_fo3_booking.ts`, 122 / 122, twice.
* **Not mine:** the breaker's live runs (`break-report.md`) are cited where used.

## Journeys
| # | Persona, goal | Steps | Expected | Result |
|---|---|---|---|---|
| 1 | Client with a Persian name: "book my free consultation" | GET slots, wait 4 s, POST with given name "علی‌رضا" | 201; name kept as typed; confirmation email queued | **Held** live: 201 in 0.11 s; `mail-person` and `mail-host` jobs completed through pg-boss; test checks the name is stored exactly |
| 2 | Same client double-clicks Send | POST the same form again | 409 "This form was already sent. Reload the page to book again." | **Held** live, exact text |
| 3 | Bot replays one form in parallel | 7 parallel POSTs, one stamp | 1 booking | **Held** live: 1 × 201, 6 × 409 (breaker: 1 of 30 and 1 of 60) |
| 4 | Client whose chosen time was just taken | POST taken time, then the next time with the same form | 409 slot taken, then 201 | **Held** (test B-8 pass; breaker live) |
| 5 | Client's email server fails | Booking with a failing mail adapter | Booking stays; email retried with a working link; host not emailed twice | **Held** on the fake JobPort (test m3); live pg-boss path completes. A failed send was not forced live (fakeMail never fails) |
| 6 | Staff books for a person | `staffCreate` | Staff see no client link; the person gets it by email | **Held** (test m7 pass and fail) |
| 7 | Many clients book the last free place in the firm's window | 20 in parallel at cap − 1 | Exactly one booked, others told to wait | **Held** (test; breaker live 300 at 85/200: exactly 200) |
| 8 | Recovery: client resends just as a doomed form is in flight | Form A for a taken time in flight; form B (same stamp, or own stamp at cap − 1) | B books | **Not held** (breaker F2/F3): B gets 409 "already sent" or 429; resending afterwards books |
| 9 | Edge: a used form at exactly 2 h | Same stamp at ms + 2 h | 409 | **Not held**: 201 (probe; review m1) |

## Data underneath
* Live: one `fo_booking` row per success.
* Tokens: 2 live (the answer's and the email's).
* Jobs: keyed `booking:<id>:0:mail-person|mail-host`, ids only in the payload.
* Tests check that nothing is booked past the cap and that no advisory lock is left in `pg_locks`.
* Audit and outbox are unchanged from FO-3 and still asserted by the suite.

## Score (each 0, ½ or 1)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | J1-J7 held |
| Next step obvious | 1 | The 409 says to reload; slot-taken gives fresh times |
| Plain words | 1 | Exact row wording; no codes shown as text |
| Feedback and state | 1 | Distinct 409 codes (`FORM_ALREADY_SENT`, `SLOT_TAKEN`) and 429 |
| Correct data | 1 | One row per success; cap exact; tokens voided on failed sends |
| Error recovery | ½ | J8: a doomed form in flight wrongly refuses a good one (F2/F3); J9 edge (m1) |
| Accessibility and screen sizes | N/A | No screen |
| Speed | ½ | 0.11 s per booking live, but one firm's burst stalls other firms by about 2.6 s (breaker F4, review m3) |
| Visual quality | N/A | No screen |
| Trust and sources | N/A | No AI and no sourced values in this row |

**6 of 7 applicable = 8.6 / 10. Pass** (8 or more, no 0).

To raise it, most valuable first:
1. Error recovery: the pre-checks read committed reservations only (review m2), and the 2 h edge is fixed (m1).
2. Speed: take the firm lock only after the cheap refusals, or note the pool cost as accepted (m3).

Not tested: a real mail adapter, several API processes, a real screen reader, and an intended user's own walk (D17/D20 stay with the founder).
