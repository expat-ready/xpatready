# Journey test (reviewer role): FO-7b part 1a, draft invoice lines (J-59), 20 Nov

Reviewer's single journey score for this check. Commit `8a243502ffebdb617436004a8b6507e55a218ac0`. This row has **no screen**, so every step is an API step ("API step: the invoice has no screen yet"). Nothing was walked in a browser: there were no axe, width, keyboard or zoom passes, and accessibility and visual quality are N/A.
Copies used: isolated copies on :4469 (J-59, three runs; one from a `git archive` of exactly 8a243502f) and on :4468 (break pass). Port :4400 was never used.

## Journeys (persona: a firm's staff member, the Owner, user-R; plus wrong roles)
1. **Main path (W1-W4).** Goal: "Bill Client A for my fee, with HST, and get it right to the cent."
   * Steps: draft in CAD; add an 850.00 FEE line at 13 %, then two 0.50 lines; add a 255.00 government fee beside a 1,000.00 fee.
   * Expected: tax 110.50 and total 960.50; 0.06 + 0.06 = 0.12; 130.00 tax with the government fee untaxed.
   * **Held.** Each figure was read back from `money_invoice_line` and through `GET`.
2. **Error: wrong currency (W5).** A USD line on a CAD draft → 400 "This invoice is in CAD; a line in USD can't be added. Nothing was saved." Nothing was saved. **Held.**
3. **Error: bad rate or amount.** −1, 1,000,001, 1.5, text, 1e400, quantity 0 or 100,001 → 400 at the field, in words. **Held.**
4. **Alternate: rate in basis points.** 1300 is stored as 1300 ppm, not corrected. **Held** (the brief's R12).
5. **Wrong firm (DW).** Firm B reading or adding to firm A's draft, or drafting for firm A's client → 404. **Held.**
6. **Wrong role.**
   * READ_ONLY → 403 `MISSING_PERMISSION` on create and read. **Held.**
   * A Case Officer adding a 9,999.99 line to the Owner's draft → 201. Open question (review Minor 1).
7. **Recovery: double submit.** 10 lines sent at once to one draft → 10 × 201, positions 1-10, total = sum of the lines (3,107). **Held.**
8. **Break: hostile or odd text.** Each of these gave **500**, with nothing stored (review Major 1):
   * a zero-width space;
   * a C1 control;
   * a bidi override;
   * combining marks only.

   Also:
   * 300 emoji → 400, a false refusal (review Minor 4).
   * French, CJK and Arabic text → 201.
9. **Client-sent figures (DW).** A sent `taxMinor` or `amountMinor` is ignored and the stored tax is the server's. `firmId` or `totalMinor` in the body → 400. **Held.**
10. **Across the boundary.** Issuing is part 1b's job.
    * R8's draft (24,696,061.94) can never be issued: the database caps an invoice at 21,474,836.47.
    * Recorded as hand-over to 1b, not scored.

## Data underneath
* Every write leaves one row, with exactly the values sent and the server's tax.
* One audit line per write, actor `staff:<id>`, type FIRM_STAFF.
* Roles are enforced on the server.
* `taxForLine` matches Python `Decimal` ROUND_HALF_EVEN in all 360,072 cases tried.

## Score (0 / ½ / 1)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | W1-W5 and DW pass: J-59 exit 0, 15/15, three runs |
| Next step obvious | ½ | Each answer returns the whole draft (lines, sums, status), but nothing points to the next step; there is no screen yet |
| Plain words | ½ | The brief's own sentences are exact. zod's own "Invalid option: expected one of "CAD"\|"USD"" and "Unrecognized key" get through unchanged |
| Feedback and state | 1 | 201 with the stored view; status DRAFT; totals from `money_invoice_total` |
| Correct data | 1 | Read back from the table; 10 lines at once still sum exactly; the rounding cross-check agrees |
| Error recovery | ½ | Never a 500 for rates, currency or ids, but four description strings give 500 |
| Accessibility and screen sizes | N/A | No screen |
| Speed | 1 | 15-40 ms per call in the check's request log (STANDARDS §9) |
| Visual quality | N/A | No screen |
| Trust and sources | ½ | The rule is cited in code (AG-6-4a, BR-4), rates are labelled Sample in the tests, and there is no AI. The answer shows no source for the rate |

**6 of 8 applicable points = 7.5 / 10. Below the pass bar of 8, with no criterion at 0.**

## What would raise it, most valuable first
1. Error recovery to 1: answer 400 at `description` for any text `money_text_ok` refuses. 36f7b3b58 does this; with it the score is 6.5/8 = 8.1.
2. Plain words to 1: reword zod's enum and unknown-key messages, for example "Choose CAD or USD." and "totalMinor isn't something you can send."

## Not tested
* A real screen reader, widths, keyboard and zoom: there is no screen.
* An intended user's unaided walk (D17/D20 stay with the founder).
* The full `ci`.
