# Journey test (reviewer role): FO-7w1, an invoice from the signed retainer, PR #3654 at ac93518c4

This is the reviewer's one journey score for this check. FO-7w1 has no screen; the "Start from retainer" button comes with FO-7s1 and FO-7s2. So I walked each journey as API steps, as j_56 does. I used three tools:
* j_56 on an isolated copy at :4437 (never :4400);
* the row's check;
* reviewer probes added to a scratch copy of that check.

I read the data underneath with SQL.

## Journeys (persona · goal · expected)
1. **Main path.** The firm's biller wants to bill Client A's signed retainer without retyping the fees. Expected: 201, with one FEE line of 150000 for the 1,500.00 "when submitted" row, taxed at the draft's default.
   * **Held** (j_56 W1; check R1).
   * The line then retaxes with the Bill-to province and issues: j_56 W3 shows 140000 ppm on that line, and W7 gives INV-0001.
2. **Alternate.** The biller bills the deposit on purpose by naming the "on signing" row, then a deposit row and a fee row together.
   * Expected: the named rows are copied and the invoice is `deposit: true`.
   * **Held** (R2; probe: two lines, `deposit: true`, a duplicate upper-case id is counted once).
3. **Empty.** Nothing is left to bill: the only rows are a deposit and a row with no amount, or every row is already billed.
   * Expected: the rows are skipped, as the row says.
   * **Held.** The answer is 201 with an empty draft (R7; probe). This matches the row, but a second empty draft is clutter (D5 in the review).
4. **Error.** Bad input:
   * a USD draft on a CAD retainer gives 422 at `currency`;
   * a named row with no amount gives 422 at `feeRowIds`;
   * a row not on this retainer gives 422;
   * `feeRowIds` with no retainer gives 422;
   * a row above the line limit gives 422 (probe);
   * a sent `ratePpm` gives 422.

   Nothing is written in any of these cases. **Held** (R3, R6; probe).
5. **Not signed.** Retainers in DRAFT, SENT, CLIENT_SIGNED and WITHDRAWN each give 409 `RETAINER_NOT_SIGNED`, with no draft. A retainer signed on paper (SIGNED_OFFLINE) is billed. **Held** (R4).
6. **Wrong party or firm.** Each of these gives 404, with no draft and no audit line: another client's retainer, a consultation agreement, firm B's retainer, an unknown id, and a company retainer billed to its signer as a person (probe). A company retainer billed to the company gives 201 (probe). **Held** (R5, R9; probe).
7. **Wrong role.** A Case Officer starts the draft (201) but cannot issue it (403). No session gives 401. **Held** (R8).
8. **Recovery: twice, and at once.** The same retainer again gives an empty draft; a named billed row gives 409 `ROW_ON_INVOICE`. Three requests at once gave `[201 with 2 lines, 201 with 0 lines, 409]`, and the database holds one line per row. **Held** (R7; probe).
9. **Across the boundary.** The draft from the retainer is then edited by the existing routes: Bill-to, a typed line with a null source, and issue.
   * j_56 continues to W9. W9's list and detail pass; its last step, the card pay link, is FO-7c and FO-7s2.
   * **Held** (R10; j_56 17/18).

## Data underneath
For each journey I checked the stored lines and the invoice:
* stored lines: `kind:amount:rate:tax:source` as expected;
* `money_invoice.deposit`: true only for a named ON_SIGNING row;
* the database refuses any change to a line's source or an invoice's deposit mark;
* one `invoice.draft_created` per draft, naming `retainerId`, `feeRowIds` and `deposit`, and none on a refusal.

Tax matches a typed line in an ON firm (13 %), a BC firm (5 %) and an unregistered firm (0).

## Break it
* Mutations, one at a time:
  * Removing the lock, the rate source or the MINOR_MAX check leaves the check at 25/25 (review m1–m3).
  * Removing the deposit exclusion, the party check, the signed check, the currency check, the skip, the unique index or the trigger turns its test red, by reading each test.
* Upper-case and duplicate ids: handled.
* Demo-copy migration: applied, rolled back and applied again, all clean. The demo holds no retainers.

## Score (each 0 / ½ / 1)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | j_56 W1: 201 with `FEE:150000`, and the draft issues (W7) |
| Next step obvious | ½ | API only. An empty draft is returned with 201 when nothing is left to bill, and there is no screen to judge |
| Plain words | 1 | Every refusal says what happened and ends "Nothing was saved." (R3, R4, R6, R7) |
| Feedback and state | 1 | Codes follow the row: 404, 409 `RETAINER_NOT_SIGNED` and 409 `ROW_ON_INVOICE`, 422 at the field |
| Correct data | 1 | Billed once at once and in sequence; integer cents; tax equals a typed line's across 3 firm setups; audit line complete enough to trace |
| Error recovery | 1 | Each refusal writes nothing (draft and audit counts); the next valid request succeeds |
| Accessibility and screen sizes | ½ | Not applicable (no screen); not testable here |
| Speed | ½ | Not measured against §9. Two round trips per fee row while holding the lock (review m5) |
| Visual quality | ½ | Not applicable (no screen) |
| Trust and sources | 1 | No AI. Each line names its source row (`sourceFeeRowId`); Sample data only; the trust reading is marked Unconfirmed |

**8 / 10, no 0: pass.** To raise it, most valuable first:
1. Add a failing test for the rate source (m1) and for the lock (m2).
2. Batch the per-row queries (m5) and time a 50-row start against §9.
3. Screen criteria are scored once FO-7s2 puts the button on a page.

**Not tested:**
* a real screen reader and an intended user's unaided walk (D17 and D20 stay with the founder);
* a visible-browser walk, because there is no screen.
