# R1.79 part 3 (PF-R2cm): journey test, reviewer, 26 Nov 2026

Commit `801724efd603ce791a996ab6ad8b4e55e76e2d4b` (PR #3812). API only: there is no screen until PF-R3. Each journey is walked against the commit's own API on :4437 (an isolated database, dropped afterwards), or as a scratch repro run in the same way the PR's test runs. Browser, axe and screen-width checks do not apply.

## Journeys
| # | Persona · goal | Steps | Expected | Result |
|---|---|---|---|---|
| 1 | Owner · "what did we bill and collect in November?" | `POST /api/platform/reports/query` with fees_billed and fees_collected, Nov | One figure per currency | **Held** (DW2; live answer OK) |
| 2 | Billing / Finance · US-14 trust apart | CAD 1,000 into trust, CAD 600 paid from trust | Trust 1,000; collected includes 600, never 1,000 | **Held** (DW3) |
| 3 | Billing / Finance · chase overdue (US-14, 40 days) | overdue_ageing, overdue_by_client | The right bucket and client | **Held**: live, an invoice 27 days late is in 1-30; DW4 checks the boundary days |
| 4 | Billing / Finance · a cheque received 1 Nov, recorded later | Record the payment with `receivedOn 2026-11-01`, then ask Oct and Nov | It counts in November | **Failed**: October CAD 400.00, November `[]` (review M1) |
| 5 | Case Officer · wrong role | Query money figures, with a forged scope | WITHHELD | **Held** (live) |
| 6 | Billing / Finance (seeded keys) · overdue by client | A client with an invoice on no case, outside the person's money visibility | Not listed | **Failed**: "Hidden Client 600.00" is listed (review M2) |
| 7 | Owner · trust for one person (person filter) | Deposit on no case, moved to user-O's case, 300 refunded | 700 or nothing; never negative | **Failed**: −300.00 (break report M1; review M4) |
| 8 | Solo firm Owner · trust off | trust_received | No trust figure | **Held** (DW3) |
| 9 | Owner · bad filter | `from: 2026-13-01` | 422, with the field named | **Held** (live) |
| 10 | Boundary · Billing / Finance dashboard | `GET dashboards/billing-finance` | Every money widget registered | **Held**: 5/5 `registered:true`. The step to the next screen is PF-R3's |

## Data underneath
* **Journey 4:** `money_payment.received_at` is `2026-11-01 00:00 UTC`, which is `2026-10-31 20:00` in Toronto. The payment list and the receipt show 1 Nov; the report counts it on 31 Oct.
* **Journey 6:** `PgMoneyVisibility.scopeOf` gives that person `{"cases":[],"parties":[]}`, yet the metric reads the whole firm.
* No CAD + USD sum appears anywhere (DW5), and firm walls hold (DW6).

## Break-it notes
* Most of this was already covered by the breaker's report on the same commit.
* Mutations on a scratch copy: six rule removals keep the test at 34/34, including the operating-only filter (review M3, n1).

## Score (criteria that apply to an API row: 7 of 10)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | ½ | Journeys 1-3 work; 4, 6 and 7 give wrong answers |
| Next step obvious | N/A | No drill target yet (PF-R3) |
| Plain words | 1 | Each figure's source is in plain words; "1 more clients" is a small slip |
| Feedback and state | 1 | Answers are OK, WITHHELD or UNAVAILABLE; an empty trust list when trust is off |
| Correct data | **0** | A wrong period for back-dated payments (live), a negative trust figure under a person filter, rows the viewer may not open |
| Error recovery | 1 | 422 with the field named; a failing read is UNAVAILABLE, never a 500 |
| Accessibility and screen sizes | N/A | No screen |
| Speed | 1 | 45 ms live for 4 figures; DW8 passes (breaker's m2 at heavy credit load) |
| Visual quality | N/A | No screen |
| Trust and sources | 1 | The Sample tax choice is stated, with "Unconfirmed: no accountant"; the source of each figure is given |

**5.5 / 7 = 7.9 / 10. Fail** (below 8, and correct data is 0).

**Fixes that raise it, most valuable first:**
1. Count payments by their received-on day.
2. Bound overdue by client by money visibility.
3. Count MOVE_TO_CASE under a person filter.

With these, correct data reaches 1 and the score is about 10 × 6.5/7 ≈ 9.3.

## Could not test
A real screen reader, the screen widths, and an intended user's unaided walk. D17 and D20 stay with the founder, and the screen itself is PF-R3's.
