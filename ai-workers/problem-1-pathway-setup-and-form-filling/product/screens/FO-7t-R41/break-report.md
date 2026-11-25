# Break report: FO-7t R4-1, a reversed cheque no longer counts as uncleared (money pass)

Breaker: pass b3bd3c85f

**Scope.** I checked the diff only (`git diff origin/main...HEAD` on `claude/runtime-fo7t-r41`, head `b3bd3c85f`). It changes the `uncleared` sums in `trust/to-move.ts:165-166` (askUncleared) and `trust/money-out.ts:68-70` (held), plus the check. I did not build this and changed no code.

**How I ran it.** The harness is a copy of `tests/check_fo7t_to_move.ts` with `features/client-money-reversals.ts` mounted, in the session scratchpad (`r41/break.mts`, not committed). It used its own scratch database on 127.0.0.1:54329 and the Nest app on port 0, never :4400. Every database was dropped (none left afterwards). There were no network calls and no model calls (US$0). Amounts are Sample. Corrections were written at the database with every trigger on, as the database allows. MOVE_TO_CASE pairs were also written there.

**Counts.**
* My attack: 18 checks passed and 1 failed (Minor 1 below).
* Suites at this head: `check_fo7t_to_move.ts` 46/46, `check_fo7t_money_out.ts` 51/51, `check_fo7v_reversals.ts` 28/28.
* I found **0 ways to skip the UNCLEARED question** while money from an uncleared cheque is still at risk.
* No answer was a 500: 129 tracked answers before the timing step, all 200, 201 or 409. The timing step's answers were 201 or 409 only.

## What held

* **Why it holds.** A correction of a deposit takes the same amount off the ledger and off what is left of the deposit. So `ledger + waiting − uncleared` (the move) and `available − uncleared` (Pay and refund) stay the same when a cheque is corrected or reversed. The cleared cover never grows from a correction.
* **1. Cheque corrected in part (WRONG_ACCOUNT, through SQL).** Setup: a 1000.00 cheque, −400.00 WRONG_ACCOUNT, and 300.00 cleared.
  * Refund 300.01 asks (409 UNCLEARED). 300.00 passes (201). The next 0.01 asks.
  * Pay from trust gives the same: 300.01 asks and 300.00 passes.
  * The move: 300.01 over two lines asks. 300.00 passes, recorded `false`. 0.01 more asks.
  * The WRONG_ACCOUNT line is not in `money_to_move` while the cheque is uncleared, so it never adds to `waiting`.
  * WA 400.00 plus RETURNED 600.00 on one cheque, with 200.00 cleared: a third correction is refused by the database. A refund of 200.01 gives 409 and 200.00 gives 201.
* **2. Two cheques, one reversed and one not.**
  * Cheques of 500.00 and 500.00 plus 200.00 cleared, with the first cheque reversed through the route (201):
    * Pay 200.01 asks, 200.00 passes, and 0.01 more asks.
    * A refund of 0.01 asks.
    * Moving the 200.00 passes. 0.01 of the acknowledged cheque-paid withdrawal asks.
  * Cheques of 500.00 and 300.00 with the 300.00 one reversed: a refund of 100.01 asks and 100.00 passes. Only the reversed cheque leaves the sum.
* **3. A reversal racing a move, a refund, or Pay.** Each round: a 1000.00 cheque plus 1000.00 cleared, with the reversal sent at the same moment.
  * Against a move (10 rounds): 1000.01 asked every time and 1000.00 passed every time (recorded `false`). The reversal answered 201 each time.
  * Against a refund (10 rounds): 1000.01 was never 201 (UNCLEARED or NOT_AVAILABLE, depending on which side won). 1000.00 was always 201. When the refund won first, the reversal answered 409 CHANGED (stale preview), which is correct.
  * Against Pay of 1000.01 (6 rounds): never 201 without the question.
  * Both sides take the party lock, and the figure does not change with the reversal, so the order does not matter.
* **4. A correction naming a different deposit.**
  * The cleared e-Transfer corrected instead of the cheque: a refund of 0.01 still asks.
  * Another client's cheque named from this client is refused by the database ("same party and currency"). Named on this case, it is refused too ("on the case of the entry it corrects").
  * The same client's cheque on case 1 corrected on case 2 is refused, and case 1 still asks.
* **5. Another currency or case.**
  * A USD correction naming a CAD cheque is refused, and the CAD question still applies.
  * The one cross-case path the database allows works as expected. Setup: a 1000.00 cheque before a case, 600.00 moved to a case, then 600.00 corrected there. This is refused while money is still held before a case, and accepted once the 400.00 there was refunded (acknowledged).
  * After a new 1000.00 cleared deposit before a case, a refund of 600.01 asks and 600.00 passes. The 400.00 still at risk from the cheque stays counted.
* **6. The reversal route, then Pay from trust.** Covered in 2a and 2c. In 2c, a 500.00 cheque was paid out and then reversed, leaving the balance at −500.00:
  * Pay 0.01 and refund 0.01 each give 409 NOT_AVAILABLE.
  * Moving what the cheque paid still asks (see Minor 1).
* **Timing at 200k entries** (worst case: 100k uncleared cheques, each corrected in part, all on one client's case; 200,134 entries in the firm):
  * The new `uncleared` query takes 417 ms, against 68 ms for the old one. The plan is one index lookup on `(firm_id, corrects_entry_id)` per uncleared deposit.
  * Requests: refund 836 and 866 ms, Pay 840 and 813 ms, move 1021 and 917 ms. Every answer was correct.
  * A normal client (50 part-corrected cheques) on the same 200k-entry table: refund in 19 and 21 ms.
  * No budget applies (STANDARDS §9 sets screen budgets only). The worst case is far beyond a real case. Noted, not a finding.

## Findings

**Minor 1: when the question has no uncleared cheque behind it, it says "CAD 0.00 of this is from a cheque not yet cleared".**
* Repro (2c): a 500.00 cheque is the only money. Pay 500.00 from trust (acknowledged), reverse the cheque through the route as RETURNED, then move the withdrawal's 500.00.
* Actual: 409 UNCLEARED, "CAD 0.00 of this is from a cheque not yet cleared. If it bounces, the firm will have moved money it doesn't hold. Move anyway?"
* Expected: words that name what is actually wrong. The cheque already bounced and trust is 500.00 short, so asking is right but the amount and the reason are not.
* Before this change, the same steps said "CAD 500.00".
* Cause: `to-move.ts:169` prints `min(uncleared, g.minor − covered)`. With `uncleared` now 0, the question is raised only because the ledger is below zero (P-694's shortfall).
* Control 2e: an e-Transfer paid out and reversed as RECORDED_BY_MISTAKE gives the same "CAD 0.00" wording. So the shortfall case was already worded this way, and this change extends it to returned cheques.
* It is a warning, not a skip: money is never wrong. Words only.

**Already known, not counted again: R4-2 (FO-7t-3 round 4).** A pre-case cheque moved to a case by MOVE_TO_CASE is not counted on that case. The diff leaves the `here` / case filter unchanged, so it is still latent until a move-to-case route lands.

**Verdict: pass.** 18 of 19 attack checks passed, and the one failure is Minor 1 (words). Suites: 125 of 125 passed. I found 0 skips of the question while uncleared money was at risk, 0 answers of 500, and no over-cover in any race.
