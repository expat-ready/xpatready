# CS-C1a journey test (reviewer, 15 Nov 2026), commit af33e80

**Scope.** CS-C1a has no screen (an API-only row), so each journey was walked through the API as a staff member's client would call it: once on a real isolated copy (:4437, `main.ts`) and once in the row's own harness. Nothing ran in a browser. Accessibility, screen sizes and visual quality are N/A.

## Journeys (persona · goal · steps · expected)
1. **Main path, W1.**
   * Persona and goal: a Case Manager wants to "record the answer, close the file, reopen it for a late letter, close again".
   * Steps: decision before the submission → submission recorded (C8.2) → decision → close → reopen → close.
   * Expected: 409, then 201, 200, 200, 200. The outbox holds `case.closed`, `case.reopened`, `case.closed`.
   * Result: **held** (test W1).
2. **Alternate, withdrawal.**
   * Persona and goal: an Owner says "the client stopped before IRCC answered".
   * Steps: withdraw with a date and a reason.
   * Expected: the case is CLOSED, `WITHDRAWN`, with one WITHDRAWAL row carrying the date.
   * Result: **held** (DW3). The date is on the row; `withdrawn_at` holds the recording time (review m3).
3. **Empty.**
   * A case with no submitted filing: a decision → 409 `NOT_SUBMITTED`.
   * Closing before any decision → 409 `NOT_DECIDED`, and the message points to Withdraw.
   * Result: **held**.
4. **Error, bad input.**
   * Inputs: no reason, or spaces only; an impossible date (2027-02-30); an outcome outside the Sample list; a note of 2001 characters; an array body; a numeric date.
   * Expected: 400 with the field named.
   * Result: **held**.
5. **Wrong role.**
   * Read Only, Billing, or Case Officer deciding, withdrawing or closing → 403 `MISSING_PERMISSION`.
   * Admin reopening → 403.
   * Result: **held**, on the real server too.
6. **Wrong firm, or no sign-in.**
   * Firm B's token on firm A's case → 404 on all four routes.
   * No token, or `x-actor` only → 401 `NOT_SIGNED_IN`.
   * A malformed id → 404.
   * Result: **held**.
7. **Recovery, double click.**
   * Four closes at once → 200, 409, 409, 409, with one event.
   * Three reopens at once → one 200.
   * A decision racing a withdrawal (5 runs) → never both.
   * Result: **held**.
8. **Across the boundary.**
   * The `case.closed` and `case.reopened` payloads parse with the shared types in `ports/events.ts`, carry the case's platform firm and the client type, and contain no reason text.
   * Result: **held**. `case.reopened` lacks the contract's `reason` (review m4).

## Data underneath
* Each action writes:
  * exactly one row where one is expected;
  * one audit line on entity `case`;
  * at most one event.
* A forced rollback writes no event, no audit line and no state change.
* `case_decision` refuses UPDATE, DELETE and TRUNCATE.

## Break pass (15 min)
* Duplicates and races: see journey 7.
* Non-English reason ("客户已移居 — العميل انتقل"): stored exactly.
* A future decision date (2999-12-31): accepted. The cards set no rule for this, so it is not a finding.
* A decided filing set inactive by SQL then let the case be withdrawn (review m2, Minor). App code cannot reach this today.

## Score (each 0, ½ or 1)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | W1 and journeys 2-8 held, on the real server and in the harness |
| Next step obvious | 1 | Each refusal says what to do: "Reopen it first", "withdraw the case", "Close it with a reason instead" |
| Plain words | 1 | Problem titles and details are short and plain; there is no jargon beyond the cited rule numbers |
| Feedback and state | 1 | Each answer returns the case view (`status`, `closeOutcome`, `closedFromStageId`) |
| Correct data | ½ | `withdrawn_at` is not the date staff gave (m3); inactive-filing decisions are ignored by the withdrawal check (m2) |
| Error recovery | 1 | Every failure leaves the case unchanged (checked after each refusal); races give 409 `CASE_CLOSED` or `CASE_OPEN` |
| Accessibility and screen sizes | N/A | No screen |
| Speed | 1 | The whole suite, with migrations and 47 checks, takes about 12 s; single calls answer at once on the isolated copy |
| Visual quality | N/A | No screen |
| Trust and sources | ½ | Outcomes are labelled a "Sample list" only in the error text; there is no AI; the audit names the staff member and keeps the old values |

**7 of 8 applicable = 8.5/10, scaled. Pass: 8 or more, no 0.**

Fixes that would raise it, most valuable first:
1. Store the staff's withdrawal date in `withdrawn_at` (m3).
2. Refuse withdrawal on any recorded decision (m2).
3. Name the Sample outcome list on the 201 answer as well, not only in errors.

**Not tested:** a real screen reader and an intended user's unaided walk (D17 and D20 stay with the founder; no screen exists yet). Full CI did not run either: the PR is a draft.
