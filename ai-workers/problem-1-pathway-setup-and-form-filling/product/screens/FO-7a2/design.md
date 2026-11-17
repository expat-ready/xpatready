# FO-7a2 — plan and open question (runtime lane, 16 Nov 19:3x IST)

Brief: `product/design/lead-b-briefs/FO-7a2.md` (rev 16.53, order rev 16.58; on `lead-b-front-office`). Starts from `main` f255a85e8 with FO-7mv (#1924) merged. Money: Opus reviewer and breaker; the tech lead reads the migration (P-423). Unconfirmed: no counsel.

## Plan (one migration `<stamp later than 20261116030000>_fo7a2_ledger_rules`)
1. **`money_trust_entry_write` replaced** (`CREATE OR REPLACE`):
   * **1a.** A reversal is a correction of a deposit with kind `RETURNED`, `RECORDED_BY_MISTAKE`, `WRONG_CLIENT` or `OTHER` (a typed reason, AG-6-75 rule 2). It is always accepted, even below zero. `WRONG_ACCOUNT` is not a reversal and stays an ordinary outflow.
   * **1b.** Every other entry that takes money out is refused below zero, with "Only CAD 0.00 is available." The old words stay too, so FO-7a's suite keeps passing.
   * **1c.** `RETURNED` is refused on an `E_TRANSFER`, `CARD`, `CARD_TERMINAL` or `CASH` payment. The method is compared as text, so `CARD_TERMINAL` works once FO-7ts adds it.
   * **The balance CHECK is replaced:** `balance_after_minor >= 0 OR amount_minor > 0 OR <reversal>`. Money in is always accepted, even while the balance is below zero.
2. **1c, the tick.** A new `BEFORE UPDATE OF cleared` trigger on `money_payment` refuses ticking cleared once the payment's deposit has a `RETURNED` correction. It is a new function, so FO-7a's `money_payment_write` stays as it is. At REPEATABLE READ a tick racing a Returned is not serialised; this is noted and tested at READ COMMITTED.
3. **1d.** View `money_trust_shortfall` (`security_invoker`): each party below zero, per currency, with its balance and the reversal that took it below.
4. **2a/2b.** `money_credit_note_write` and `money_write_off_write` replaced. They count trust applied to the invoice (net of returns) as settled. A credit note on the trust-paid, unmoved part is accepted only after its `RETURN` is written earlier in the same transaction (that return also takes the To move line off the list, FO-7mv). Otherwise it is refused, naming the amount.
5. **2d.** Trust off: no change.
6. **Tests:** `tests/check_fo7a2_ledger_rules.ts`, DW1–DW7, a pass and a fail each. FO-7a's suite changes only where it asserted the old refusal (to be named under "Changed tests").

## Question for the tech lead (blocks rule 2c only; the rest is built meanwhile)
2c: the credited part has already moved to operating; the person chooses "Refund to the client" or "Move back to trust", recorded with the line. This needs more than the touch list:
* **A column for the choice.** `money_credit_note.overpaid_choice` (`OVERPAID_REFUND | OVERPAID_TO_TRUST`), with the moved amount it covers (the brief allows a column "if needed").
* **An operating → trust To move line.** FO-7mv refuses every operating → trust line and its list has no operating → trust rows. "Move back to trust" needs FO-7mv's `money_move_line_write`, `money_trust_entry_moves` and `money_to_move` changed. Those are FO-7mv's functions, not on the touch list.
  - The model that keeps "ledger + list = bank": the credit note writes the `RETURN` now, and owes the same amount back (`O`).
  - Its T2O open becomes A − R − M + O, and a new O2T list item is O − moved back.
  - The return rule becomes R ≤ A − M + O.
  - An O2T line naming the withdrawal is capped at O.

**Recommendation:** widen FO-7a2's touch list to those three FO-7mv functions and the one column. The row is estimated at about 450 lines, so that fits under 800. The other choice is a follow-up row (FO-7a3) for 2c, which the brief's "never leave a part for later" argues against.
