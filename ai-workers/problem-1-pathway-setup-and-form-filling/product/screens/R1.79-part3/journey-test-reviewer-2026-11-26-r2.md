# R1.79 part 3 (PF-R2cm): journey test, reviewer, round 2 (26 Nov 2026)

Head `f72f041c75edd5b3d3ffce821e9c111446897ae4` (PR #3812). API only. These are round 1's ten journeys (`journey-test-reviewer-2026-11-26.md`), walked again with the PR's test and round 1's repro script on the head. The :4437 server was not restarted: the door's wiring was shown live in round 1, and the registration did not change.

## Journeys
| # | Journey | Round 1 | Round 2 |
|---|---|---|---|
| 1 | Owner: November billed and collected | Held | Held (DW2) |
| 2 | US-14: trust kept apart from fees | Held | Held (DW3; a payment into trust on an invoice is now counted once) |
| 3 | Overdue ageing and overdue by client | Held | Held (DW4; the cap now ranks within each currency) |
| 4 | A payment recorded later for an earlier date | **Failed** | **Held**: 1 Dec counts in December, CAD 400.00 (repro); the Toronto pair in DW2 |
| 5 | Case Officer, wrong role | Held | Held (DW6) |
| 6 | Billing / Finance: a client they cannot open | **Failed** | **Held**: "1 client you cannot open", CAD 600.00, and no name (repro, seeded BILLING_FINANCE keys) |
| 7 | Trust under a person filter after a move to a case | **Failed** | **Held**: 700.00 for the case, and firm-wide the move nets to zero (DW6) |
| 8 | Trust off in the solo firm | Held | Held |
| 9 | A bad filter | Held | Held (PF-R1: 72/72) |
| 10 | Billing / Finance dashboard registered | Held | Held (DW1; no change) |

## Data underneath
* No CAD + USD sum appears (DW5).
* Firm walls hold (DW6).
* Ageing matches DUE_SQL invoice by invoice in both firms (DW4 parity).
* Eight mutations: seven fail a line. The "a deposit takes its payment's day" rule survives (review n1).

## Score (7 criteria apply)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | All ten journeys hold |
| Next step obvious | N/A | No drill target yet (PF-R3) |
| Plain words | 1 | "1 more client", "N clients you cannot open"; the source line for each figure |
| Feedback and state | 1 | OK, WITHHELD, UNAVAILABLE, and an empty trust list when trust is off |
| Correct data | ½ | Right in every journey; held back because the deposit-day rule is untested (n1) and one client can be in both the named and the hidden rows (n2) |
| Error recovery | 1 | 422 with the field named; a failing read answers UNAVAILABLE |
| Accessibility and screen sizes | N/A | No screen |
| Speed | 1 | DW8 passes with 15,000 credit applications |
| Visual quality | N/A | No screen |
| Trust and sources | 1 | The Sample tax choice is labelled, with "Unconfirmed: no accountant" |

**6.5 / 7 = 9.3 / 10. Pass**, with no criterion at 0. Fix n1 to raise correct data to 1.

## Could not test
A screen reader, screen widths, and an intended user's unaided walk (the screen is PF-R3's). D17 and D20 stay with the founder.
