# FO-7t R4-1 review (money): a cheque reversed as Returned no longer counts as uncleared

Reviewer: a fresh session that did not build this change. Branch `claude/runtime-fo7t-r41`, head `b3bd3c85f` (`git diff origin/main...HEAD`, 3 files, 30 lines). Date 24 Nov (UTC).

## Verdict: Approve

No Blocker or Major. Two Minor findings below, neither blocks.

## What changed
Both readings of "uncleared money" now count, for each uncleared trust DEPOSIT, only what is left of it: `greatest(0, deposit + sum of the corrections naming it)`.
* `studio/api/src/client-money/trust/to-move.ts:165-166` (`askUncleared`, the move's question)
* `studio/api/src/client-money/trust/money-out.ts:68-70` (`held`, used by Pay from trust and the refund)
* `studio/tests/check_fo7t_to_move.ts:326-338`: Client v, a CAD 500.00 cheque plus a CAD 500.00 e-Transfer, CAD 400.00 paid from trust, then the cheque reversed as RETURNED. Two new checks: the refund does not ask, and the move does not ask and records no acknowledgement.

## Checks asked for

| Check | Result | Evidence |
|---|---|---|
| Full reversal | Correct | The deposit plus its -500.00 correction leaves 0, so nothing is counted as uncleared. The new tests pass at head. The ledger (100.00 after the reversal) plus waiting (400.00) covers the 400.00 move from cleared money. |
| Partial correction | Correct | Scratch probe (not committed): a new CAD 500.00 cheque and a CAD 100.00 e-Transfer on Client v's case, with a WRONG_ACCOUNT correction of -200.00 on the cheque. Exact figures at head: a 100.00 refund passes without asking; then 99.01 asks, because 99.00 cleared is left; then a move of 300.00 paid from trust asks for **201.00**, which is 300.00 less the 99.00 cleared. All 4 probe checks pass (50/50). |
| WRONG_ACCOUNT correction | Correct, and better than before | `money_to_move` lists a WRONG_ACCOUNT line only once its payment has cleared and was never Returned (`prisma/migrations/20261116133000_fo7a2_ledger_rules/migration.sql`, view `money_to_move`, the "shown once its payment has cleared" branch). The DB also refuses moving one before then (`20261122170000_fo7ts_part3`, `money_move_line_write`, `arrived`). So while the cheque is uncleared, its corrected part is in neither ledger nor waiting, and leaving it out of "uncleared" keeps the move's `ledger + waiting - uncleared` consistent. Before this change it was over-counted (it asked too often). Probe 4 confirms the line is not on the list. |
| Never under-counts | Holds | The DB caps a deposit's corrections: negative, and in total at most the deposit (`money_trust_entry_write`, "A deposit corrected" in `20261122170000_fo7ts_part3`). So `greatest(0, …)` never fires and is only a guard. A correction of a pre-case deposit booked on another case is allowed only up to what was moved there. So the pre-case figure can only stay high (asks more), never drop below what is really left. |
| Cleared money first; ruling (b) cover unchanged | Unchanged | `covered = max(0, ledger + waiting - uncleared)` (to-move.ts:167) and `clearedPart = max(0, available - uncleared)` (money-out.ts:111) are untouched. Only the `uncleared` term changed. Ruling (b)'s existing checks (Client u: fail, cleared-first pass, mixed, acknowledged, refund fail and pass) all pass. |
| PF-12 walls | Met | The outer row is fixed to `firm_id = ${f}`. The subquery joins `c.firm_id = x.firm_id` / `c.firm_id = e.firm_id`. The FK is `(firm_id, corrects_entry_id) → (firm_id, id)`. |
| Index | Present | `money_trust_entry_firm_id_corrects_entry_id_idx` on `(firm_id, corrects_entry_id)` (`20261116030000_fo7mv_move_list/migration.sql:86`; schema `client-money.prisma:565`), and no later migration drops it. The correlated subquery is one index lookup per uncleared deposit, the same lookup shape `reverse.ts:70` and the trigger use. |
| Same locks | Met | The query sits where it was. `askUncleared` runs after `takeLocks` (to-move.ts:104-105). `held` runs after `money_trust_lock` (money-out.ts:91, 132). A correction is always on the deposit's party and currency (DB rule), and the reverse route takes that party's lock, so corrections are read under the same lock. |
| The two tests bite | Yes, each on its own | On a scratch copy, reverting only `to-move.ts` turns only "R4-1 pass: moving the CAD 400.00 …" red (409 UNCLEARED, "CAD 400.00 … not yet cleared"), 45/46. Reverting only `money-out.ts` turns only "R4-1 pass: … a refund of the client's cleared money" red (409 UNCLEARED, "CAD 1.00 …"), 45/46. |

Runs at head (prototype/, scratch DB on :54329, no app port, never :4400):
* `check_fo7t_to_move.ts` 46 passed, 0 failed
* `check_fo7t_money_out.ts` 51 passed, 0 failed
* regression: `check_fo7v_reversals.ts` 28 passed, 0 failed

## Findings

1. **Minor: the new tests do not pin "what is left" for a partial correction.** Both new tests use a full reversal. A mutant that counts any corrected cheque as fully gone (`case when exists (correction) then 0 else amount end`, in both places) passes all 46 builder checks. My partial WRONG_ACCOUNT probe catches it: the refund that should ask passed, and the 300.00 move went through without asking (201). That is the under-count this change must never allow. Fix: add one partial-correction check (the probe's figures work: 99.01 asks; the move names 201.00) to `check_fo7t_to_move.ts`.
2. **Minor: the correction is seeded by SQL, not through FO-7v's reverse route.** `check_fo7t_to_move.ts:332-333` inserts the CORRECTION the way the route writes it: the deposit's case, -(what is left), RETURNED. That is acceptable, because the route has its own suite (`check_fo7v_reversals.ts`, green). But if the route's write changes, this test won't notice. Optional: say so in the comment, or call `POST /payments/:id/reverse` there.

Noted, not in this diff and not rated: both readings tie a deposit to its own case (`case_id` filter). Money moved from an uncleared pre-case cheque to a case by `MOVE_TO_CASE` therefore does not count as uncleared on that case. Seen from reading the code only, not run. It behaves the same before and after this change. For the tech lead to decide whether ruling (b) covers it.

## Journey score (reviewer role, the one score for this check): 8 / 10, pass

These journeys were run as API calls through the check, not walked in the UI: this diff changes no screen. Each item below is a journey, then its result.
* J1, the main path: Owner refunds cleared money after a cheque comes back Returned. Result: 201, no question.
* J2: Owner moves money paid from trust after the reversal. Result: 201, and the audit line has no acknowledgement.
* J3, alternate: partial WRONG_ACCOUNT correction. Result: asks with the exact amount (201.00).
* J4, error: money still uncleared. Result: 409 UNCLEARED, nothing written, and an acknowledged retry gives 201.

| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | J1 and J2 return 201 |
| Next step obvious | ½ | Not walked on screen |
| Plain words | 1 | The question names the right amount (201.00 / 400.00 / 1.00) |
| Feedback and state | 1 | 409 with `acknowledge`, nothing written |
| Correct data | 1 | Balances 39 800 / 29 999 as computed; audit `unclearedAcknowledged` false |
| Error recovery | 1 | Acknowledged retry gives 201 |
| Accessibility and sizes | ½ | No UI change, not walked |
| Speed | ½ | Not timed; one indexed lookup per deposit |
| Visual quality | ½ | Not seen |
| Trust and sources | 1 | Amounts Sample; the acknowledgement is audited |

## Not checked
* No UI walk, no screen reader, no 1024 px or 200 % check (no screen changed).
* D17 and D20 stay with the founder.
* No EXPLAIN plan on a large ledger; the index was confirmed from the migrations.

Reviewer: Approve b3bd3c85fbe61924f0141d92d18d6a3085d3464f
