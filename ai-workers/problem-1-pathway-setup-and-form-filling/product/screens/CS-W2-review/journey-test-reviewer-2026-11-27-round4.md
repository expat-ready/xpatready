# Journey test (reviewer), CS-W2 part review, round 4: PR #3831 head b6e7dc37cf522badbaf7fec9e630835b84615b69

This change is schema only (the firm column on the seven review tables, re-stamped after CS-W1 part 2a), so nothing a
person sees changes. The journeys check that the review flow people use still works on a database migrated in the new
order, and that every row it writes carries its case's firm. Isolated copy `rt_csw2r` on :4494 (`xr_studio_rt_csw2r`),
never :4400.

## Journeys
1. **Main path (case officer, then representative of record).** Send filings for review. The officer reads the review
   without buttons. The representative opens it, ticks the checklist by keyboard and approves, and every form is stamped.
   Run as `tests/check_c83_review_browser.cjs 4494`, walks 1-8: PASS.
2. **Error: send back with no reason.** Refused on the field, in words, and nothing is recorded (walk 6): PASS.
3. **Conflict and recovery.** A fact changes while the representative reads. They see "Changed while you were reading:
   reload. Nothing was stamped." After Reload they approve (walks 7-8): PASS.
4. **Alternate: a later change withdraws one approval.** Re-approve it in one click, as a new round (walks 9-11): PASS.
5. **Solo firm.** Re-approval asks the self-review statement, and is refused without it in the server's words (11d): PASS.
6. **Empty and loading states** (walks 12-13), and axe WCAG 2.2 AA on three states at 1024 px: PASS. No script error.
7. **API: finding and round on a fresh case** (`check_csw2_review.ts` part 2). Both 201, and every row carries the case's
   firm: PASS.

## Data underneath (after the walks)
Rows whose firm differs from their case's (or filing's) firm: review_finding 0 of 2, review_round 0 of 8,
review_round_filing 0 of 10, review_round_form 0 of 30, review_check 0 of 90, filing_review 0 of 5 (none null),
readiness_pass 0 of 0. `case_review_fill_mark` is empty. The approving transaction's stamp opening still works: walk 8
stamps every form.

## Break pass (diff-scoped)
* Mutation run: removing each of seven migration pieces makes its check fail. Only the runtime_case-side follow survives,
  because it is dead (review m2).
* A replica-mode review row insert stays firm-less, and touching its case does not fill it (review m1, m3). This is a Minor.
* Moving a case's firm is refused by `case_firm_fixed`, and with that guard off, by `review_round_case_id_firm_id_fkey`
  (RESTRICT).

## Score
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | C8.3 walk 23/23; the API finding and round both 201 |
| Next step obvious | 1 | unchanged; the walk's buttons and teaching empty state pass |
| Plain words | 1 | refusals name the rule ("a filing item keeps its case and filing", "keeps its firm") |
| Feedback and state | 1 | Under review, Approved, "Approval withdrawn" as before |
| Correct data | 1 | 0 off-firm rows in all seven tables; a second backfill gives 0 |
| Error recovery | 1 | reload after a conflict; the migration stops with words naming the row (scratch B) |
| Accessibility and screen sizes | 1 | axe AA on three states at 1024 px; keyboard approve; Escape returns focus |
| Speed | 1 | `(firm_id, …)` indexes; the walk and the suite ran in their usual times |
| Visual quality | 1 | no UI change |
| Trust and sources | ½ | the wall stays partial until NOT NULL / ALWAYS fills (m3) and part keys |

**9.5/10, pass (8 or more, no 0).** Not tested: a real screen reader, and an intended user's unaided walk (D17/D20 stay
with the founder).
