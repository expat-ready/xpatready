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

## Re-run on c5e9aede5 (diff only, reviewer role)
**What I ran:**
* j_56 on an isolated scratch copy at :4436: 17/18. W1 passes; W9's pay link is FO-7c/FO-7s2.
* The check: 31/31, 5 runs.
* 14 probes in a scratch copy of the check (see review.md, "Re-review c5e9aede5").

**Journeys that changed:**
* **3, Empty.** Every row is already billed, or there is only a deposit plus an open-amount row, or there are no rows. Each now gives 409 `NOTHING_TO_BILL`, with no draft and no audit line. Naming the deposit then bills it. **Held.**
* **8, Recovery (twice, and at once).** A double start gives 409 `NOTHING_TO_BILL`. In 5 racing rounds, one draft holds the line and no unnamed start collides. **Held.**
* **4, Error.**
  * Fees whose total with tax is over 21,474,836.47 give 422 at `feeRowIds`, with nothing written. At exactly 21,474,836.47 the draft is accepted and it issues.
  * A label with a C1 control character is refused, and the refusal names its row (review r2).
* **1, Main path, with the firm's default at USD and no currency sent.** The draft is in CAD. **Held.**

**Break it:** Persian (ZWNJ) and emoji (ZWJ) labels are no longer copied exactly (review r1). Amounts, tax and billed-once are all unaffected.

| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | j_56 W1 201 `FEE:150000`; W7 issues |
| Next step obvious | 1 (was ½) | No empty draft. Each refusal says what to do (name the rows; fix the label on the retainer or leave its row out) |
| Plain words | 1 | Refusals end "Nothing was saved."; the NOTHING_TO_BILL wording can be sharper (r4) |
| Feedback and state | 1 | 409 for state (`RETAINER_NOT_SIGNED`, `ROW_ON_INVOICE`, `NOTHING_TO_BILL`), 422 at the field |
| Correct data | ½ (was 1) | Amounts, tax, total limit and billed-once are exact. Labels holding ZWNJ, ZWJ, LRM or a soft hyphen are changed (r1) |
| Error recovery | 1 | Every refusal writes no draft and no audit line; the next valid request succeeds |
| Accessibility and screen sizes | ½ | No screen |
| Speed | ½ | Not measured against §9; one query and one insert per row (review m5) |
| Visual quality | ½ | No screen |
| Trust and sources | 1 | `sourceFeeRowId` on each line; Sample data only; no AI |

**8 / 10, no 0: pass.** Fix r1 first (Correct data back to 1), then r4.

**Not tested:** a screen reader, a visible-browser walk, an intended user's walk (D17 and D20 stay with the founder).

## Re-run on 6dc148b1e (diff only, reviewer role)
The diff adds RetainerFeesPort's contract and its run (R11). The adapter now returns null for a firm id that is not a uuid. Its only caller, `drafts.ts:209`, passes `firmScope(ctx.firmId).firmId`, so the API never reaches that case.

**What I ran:** the check, **39/39**. Journeys 1–8 (R1–R10) pass as before. I did not re-run j_56, because no route, answer or data changed.

**Journeys that changed:** none.

**Score:** **8/10, pass**, unchanged (the table above, from c5e9aede5). The low criterion is still Correct data at ½ because of review r1.

## Re-run on c21b5cb38 (PR #3737, follow-up, diff only, reviewer role)
**What I ran:**
* j_56 on an isolated copy at :4434: **17/18**. W1–W8 pass; W9's pay link is FO-7c/FO-7s2, as before. The copy is stopped, and the W9 screenshots are restored.
* The check: **43/43** in the checkout, 5 runs, 3 of them under CPU load. Mutants and probes are in `review-followup.md`.

**Journeys that changed:**
* **1, Main path, with a label as signed.** A Persian label with a ZWNJ, a family emoji (ZWJs) and a soft hyphen reaches the line unchanged (201). Embedded LRM, RLM, ZWSP and WJ characters are kept too. **Held.**
* **4, Error, now a pass.** A label holding a C1 control (NEL) is billed with a space in its place, where before the bill was refused. A label with nothing printable left gives 422 at `feeRowIds` naming "Fee row 2", with nothing written. **Held.**
* **8, Recovery: another writer at once.** A row written by an outside writer while the start waits on the index gives 409 `ROW_ON_INVOICE` naming that row, and the row is on one line only. **Held**, every run.
* **3, Empty.** `NOTHING_TO_BILL` now fits a retainer that never billed anything. The deposit-only reading is slightly awkward (n2). **Held.**

**Break it:** isolates U+2067 and U+2069 are dropped, and leading C1 characters are trimmed. A mark between two controls leaves a double space (cosmetic).

| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | j_56 W1 201; W7 issues |
| Next step obvious | 1 | No empty draft. Refusals say what to do |
| Plain words | 1 | Refusals end "Nothing was saved."; one Nit on the deposit-only words (n2) |
| Feedback and state | 1 | 409 for state, 422 at the field, `feeRowIds` on both 409 shapes |
| Correct data | 1 (was ½) | Labels are copied as signed, except only what `money_text_ok` refuses (every code point checked). Amounts, tax and billed-once are unchanged |
| Error recovery | 1 | Each refusal writes no draft and no audit line |
| Accessibility and screen sizes | ½ | No screen |
| Speed | ½ | Not measured against §9; one query and one insert per row (round 1's m5) |
| Visual quality | ½ | No screen |
| Trust and sources | 1 | `sourceFeeRowId` on each line; Sample data only; no AI |

**8.5 / 10, no 0: pass.** The rest waits for the screen (FO-7s1, FO-7s2) and round 1's m5.

**Not tested:** a screen reader, a visible-browser walk, an intended user's walk (D17 and D20 stay with the founder).
