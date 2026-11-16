# FO-7mv review: the "To move" list in the database (PR #1924)

**Reviewed:** commit `194128ddb7d2de31acd30e5d23b62abe46953c14`, branch `claude/stoic-ptolemy-jdoyw9`. Diff `origin/main...194128ddb` touches the studio code in 4 files (+714/−5). It also carries one records commit, `7ffb776cf` (`screens/FO-7b/challenge.md`, +15), so the total is 729 changed lines, under 800. Line numbers below refer to `prisma/migrations/20261116030000_fo7mv_move_list/migration.sql` and `tests/check_fo7mv_move_list.ts` at that commit. Source of truth: `design/briefs/FO-7mv.md`. Background: FO-7a break report B-18 and B-19. Opus 5.5, high effort.

**The head moved during the review.** It is now `d24724c21`, which changes the test file only (+8/−2, Lead B rev 16.51: a refused correction or return leaves no row and no ledger effect). I read that diff and ran it: 36/36. It raises no finding. This verdict names `194128ddb`, as asked.

**Journey score: N/A.** The row is database only: no screen and no route, and the caller ruled out an app walk. So the journey-test report is not written, as in FO-7a's review. In its place I ran database-level journeys and break-it probes (below) on my own scratch databases (`xr_studio_rev_*` on :54329, all dropped afterwards). I did not use :4400 or `xr_studio`/`xr_studio_demo`. Cost: US$0.

## What I ran
* `npx tsx tests/check_fo7mv_move_list.ts`: **35/35, exit 0** at `194128ddb`. I ran it from a `git archive` copy of that commit, using `xr_studio_rev_` names; the 36/36 above is on the moved head.
* `npx tsx tests/check_fo7a_money_schema.ts`: **123/123, exit 0**. "21 functions named money_" still holds.
* `tests/check_prisma_schema.ts` (scratch copy): **8/8**. Only the 5 known differences.
* **Mutation runs.** I took each rule out of a copy of the migration and re-ran the suite (table below).
* **SQL and two-connection repros** on `xr_studio_rev_mv`, which had all migrations applied (table below).
* **Not checked:** CI on this commit (every `ci` job shows *skipped*, `pr-rules` *failure*, because the PR is a draft); the demo reset and the checkpoint load (they need the shared database).

## The brief, point by point
| Check | Result | Evidence |
|---|---|---|
| Rule 1 cap (B-18) | holds | `:229-240`, which counts lines net of undone batches and subtracts the returns. Mutation M1 (returns left out) → DW1 other-order, DW2 RC and DW9 fail. |
| Rule 2 no return of moved money | holds | `:275-285`, an AFTER trigger. M2 → DW1 ×2 and DW6 fail. Repro R9: move then return in one transaction → 23514 with "undo that move batch first". |
| Rule 3 correction kinds (B-19) | holds | `:207-210`; a deposit correction must carry a kind (`:269-274`). M6 → DW3, DW4 and DW6 fail. M7 → the B-19 kind test fails. |
| Rule 4 never below zero | holds | Moves write no ledger entry, so FO-7a's balance check is untouched. DW6 checks, every step for 240 steps, that the ledger never goes below zero and that **ledger + list = the bank's trust account**. |
| Rule 5 currency, direction, firm, party | holds | Batch: `:194-196`; source: `:214-216`; party and invoice: `:217-223`; firm: composite foreign keys `:97-103`. **The source-currency check has no test (m1).** |
| Locking, READ COMMITTED | holds | The party lock (`:225`) is FO-7a's key byte for byte (`fo7a …:1116`). After it, every mutable read takes a fresh snapshot. DW2 RC passes. |
| Locking, REPEATABLE READ | holds | Both a move (`:226-228`) and a return (`:276`) touch the invoice row. M3 or M4 (one touch removed) → DW2 RR move/return fails, so each touch is load-bearing. |
| Deadlock order | party lock, then invoice row | Same order as FO-7a's `money_issued_invoice`. Opposite-order multi-party batches deadlock (R7: 40P01, the cap holds); the PR notes this for FO-7t. |
| Error codes | as FO-7a | 23514 rule; 42501 insert-only; 23505 or 40001 stale writer; 23503 not visible. |
| P-603 mapping, with fail test | met | TRUST_APPLIED needs a WITHDRAWAL_TO_INVOICE; WRONG_ACCOUNT needs a WRONG_ACCOUNT correction of a deposit. The wrong pairings are refused (`test:182-186`). |
| P-607 (1) | met for this row | No path lowers the ledger. The operating → trust shortfall line is FO-7v's (see m7). |
| DW1-DW10, a pass and a fail each | met | All named, all green. DW3 and DW4 are fail-only; DW5 and the B-19 kind test are their pass side. |
| DW10 rev 16.7 | met | Measured right after its own migration (`test:103-107`), then the later migrations are applied. `migrate diff` is empty on a database with rows and on an empty one. 5 new functions, all `money_`. The guard refuses a pre-existing deposit correction with words (`test:98-102`). |
| Touch list, size | met, two notes | The FO-7a test edits are flagged as a "Question for the tech lead" in the PR. The records commit is disclosed (m8). 729 lines, under 800. |
| Unconfirmed: no counsel; no personal names | met | Migration `:3`, test `:2`; only roles appear in the diff. |

## Design choices (a)-(f)
* **(a) A new AFTER trigger instead of editing `money_trust_entry_write`: accept.** No FO-7a function is replaced, which suits P-600 parallel safety and keeps the 21-function check. FO-7a's refusals still come first. Being AFTER and not deferred, it sees rows written earlier in the same statement. Repros R3 and R4 (a return and a move in one data-modifying CTE, in either order) → both refused. The deviation from the brief is stated in the migration header and the PR body.
* **(b) Party lock, then touch the invoice: accept.** Mutations prove each touch is needed at RR. Repros R6: undo ‖ re-move gives RC OK/OK with 100.00 net, and RR one refused. A stale reader of an undo is only stricter.
* **(c) Unique `move_ordinal`: accept.** Ordinals stay dense among committed lines (count + 1, taken under the lock), so a stale writer always collides. For TRUST_APPLIED it backs up the touch. For WRONG_ACCOUNT it is the **only** guard at RR. Repro R1, two WRONG_ACCOUNT moves of one 150.00 correction at once: RC → 23514, RR → 23505, SERIALIZABLE → 40001; 150.00 moved each time. But no test covers it (m2).
* **(d) CARD_FEE_ON_TRUST and OPERATING_TO_TRUST refused: accept.** Neither has a source entry yet (P-567; FO-7c; FO-7v). Both refusals are tested (`test:185-186`) and both are recorded as contract gaps.
* **(e) View columns cast to integer: accept.** Each sum is bounded: returns ≤ the withdrawal, moved ≤ the cap, and every amount is an integer below 2^31. FO-7a's "every *_minor column is integer" check also reads views, so the cast is required.
* **(f) An empty batch is refused at commit: accept.** Undo batches are exempt. Repro R8b (the only line rolled back to a savepoint) → refused at commit.

## FO-7a test edits (`check_fo7a_money_schema.ts:117, :125, :402-403, :494`): they keep FO-7a's intent; recommend accept
The brief's "passes unchanged" could not hold: the brief itself makes `correction_kind` required on deposit corrections. The edits:
1. Count FO-7a's own ten `*_minor` columns. "Every money_ amount is integer" still runs over all `money_` columns.
2. Name FO-7a's own date column (`due_date`) rather than assume FO-7a is the newest migration. That is rev 16.7's rule.
3. Give the deposit-correction cap test a kind (`BOUNCED`). Its assertions are unchanged.
Edit 2 drops the "every instant is timestamptz" check for later money tables. See m5.

## Findings
**Blockers:** none. **Majors:** none.

**Minors** (test strength and forward notes; none breaks a rule):
* **m1. Rule 5's source-currency check is untested.** Mutation M11 (`:214` → `IF false`) still gives 35/35. DW8 only crosses a line with its batch. Fix: a USD withdrawal moved as a CAD line in a CAD batch → refused.
* **m2. No parallel WRONG_ACCOUNT case.** DW2 races TRUST_APPLIED only, where the invoice touch already catches a stale writer. For a WRONG_ACCOUNT source the ordinal is the one guard at RR, and no test exercises it. Fix: add repro R1 to DW2 (two 150.00 moves of one WRONG_ACCOUNT correction at RC and at RR).
* **m3. The deferred `money_move_line_not_undone` (`:248-255`) is untested.** Mutation M16 (trigger not created) still gives 35/35: `test:206` is caught by the BEFORE check at `:191`, which uses the same words. It is live: in repro R10, a line, its batch's undo and then commit in one transaction is refused only by it. Fix: test "line, then undo, then commit", or give the two checks different words.
* **m4. DW6's generator does not notice mutation M1 (rule 1 without "less returns").** DW1, DW2 and DW9 do catch it. Optional fix: sometimes move a returned withdrawal at the model's cap + 1.
* **m5. The move tables' instants are not asserted timestamptz.** After FO-7a edit 2, FO-7mv's own column check (`test:115-117`) covers `*_minor` and `date`, but not "no timestamp without time zone". The columns are correct today (`:51`, `:70`). Fix: one more clause in that check.
* **m6. Corrections are found by `corrects_entry_id` with no index.** Neither FO-7a nor this migration adds one. EXPLAIN of `money_to_move` shows a firm-wide scan plus a filter for each withdrawal, so reading the list grows with the square of a firm's trust entries. The triggers (`:232`, `:280`) do the same scan. Fix: `@@index([firmId, correctsEntryId])` in this migration; the touch list allows it.
* **m7. A forward note for FO-7v (record it, no change here).** BACKLOG FO-7v (`BACKLOG.md:742`) reverses an applied and already-moved deposit as follows: "one CORRECTION per withdrawal … then … one OPERATING_TO_TRUST to-move line". Rule 2 (`:281`) refuses that return unless the move is undone, and `:211-213` refuses every operating → trust line. An undo would wrongly say that no money moved. So FO-7v must amend `money_trust_entry_moves` and `money_move_line_write`. FO-7v's brief should say so; today the PR names only "the shortfall".
* **m8. Records commit `7ffb776cf` (FO-7b challenge) is outside the touch list.** It is disclosed in the PR body and harmless. No action.

**Observation (not a finding).** Mutation M17, which removes the party lock at `:225`, still gives 35/35. The invoice touch (TRUST_APPLIED) and the ordinal (WRONG_ACCOUNT) already serialise writers, so the lock's remaining jobs are the deadlock order and the brief's "takes the party trust lock". Keep it.

## Database journeys (in place of the UI journey test)
These are the firm's bookkeeper journeys, as FO-7t will drive them through these tables. All held, and every refusal is a 23514 that says what to do:
* record "I moved these";
* move a withdrawal that was partly returned;
* return money after a move: "undo that move batch first";
* undo, then return;
* move a WRONG_ACCOUNT correction, at most its amount;
* try a BOUNCED or ENTRY_ERROR move;
* two people at once (RC, RR, SERIALIZABLE);
* an empty batch;
* a second undo;
* undo an undo;
* a CAD/USD mix;
* another firm's entry: 23503.

Verdict: Approve 194128ddb7d2de31acd30e5d23b62abe46953c14
