# FO-7a2 break report: reversals, the shortfall and credit notes on trust-paid money (breaker: money, database)

Commit `371cbbd6bae4cb0499210b34d39419ca10c6e2db` on `claude/runtime-fo7a2` (PR #1991). Scratch databases on :54329: `xr_studio_brk_a2` (all 101 migration folders, `psql -1 -v ON_ERROR_STOP=1`) and `xr_studio_brk_pre` (every folder before FO-7a2, for the timing comparison). Both were dropped at the end. I attacked them with psql and with two `pg` clients at READ COMMITTED, REPEATABLE READ and SERIALIZABLE, in "wait" and "stale" orders, plus a 1,500-step random run. Line numbers refer to `prisma/migrations/20261116090000_fo7a2_ledger_rules/migration.sql`. Cost: US$0.

**Shorthand** (the same fixtures as `tests/check_fo7a2_ledger_rules.ts`; `:F` is a firm with trust on, `:P` a person):
- `dep(:P,amt,method,cleared)`: a payment into TRUST plus its DEPOSIT.
- `inv(:P,total)`: an issued one-line invoice.
- `wd(:P,:I,amt)`: a WITHDRAWAL_TO_INVOICE of `-amt`.
- `ret(:P,:W,amt)`: a CORRECTION of `+amt` naming `:W`.
- `corr(:P,:D,amt,kind)`: a CORRECTION of `-amt` naming deposit `:D`.
- `refund(:P,amt)`: a REFUND_TO_CLIENT.
- `move(:W,amt[,dir])`: a batch plus one TRUST_APPLIED line, in one transaction.
- `undo(:B)`: an undo batch.
- `cn(:I,amt[,choice,cover,:W])`: `INSERT INTO money_credit_note (…, amount_minor, overpaid_choice, overpaid_minor, overpaid_entry_id)`.

## Breaks

**B-1 Major: a refund or move-back choice may cover more than the credit note credits, or a credited part that was never paid.**
- (a) `dep(:P,100000)`; `inv(:P,30000)`→`:I`; `wd(:P,:I,30000)`→`:W`; `move(:W,30000)`. Then `cn(:I,1000,'OVERPAID_TO_TRUST',30000,:W)` → CN-0001.
  - Result: a 10.00 credit note writes a 300.00 RETURN. The client's trust balance goes from 700.00 to 1,000.00 and 300.00 is listed operating → trust. `money_trust_paid` is 0 and the invoice shows 290.00 due again.
- (b) Same set-up. `cn(:I,100,'OVERPAID_REFUND',30000,:W)` → CN-0002.
  - Result: "Refund to the client 300.00" is recorded for a 1.00 credit note. A later `cn(:I,29900)` with no choice is then accepted, because the 300.00 is already counted as freed.
- (c) `inv(:P,30000)`; `wd(:P,:I,20000)`; `move(:W,20000)`, so 100.00 is still unpaid. `cn(:I,10000)` alone is accepted (it credits the unpaid part). `cn(:I,10000,'OVERPAID_REFUND',10000,:W)` is accepted too.
  - Result: 100.00 is recorded as refunded to a client who paid 200.00 of the 200.00 still due, so the client pays 100.00 less than owed.
- Where: lines 170-181 cap `overpaid_minor` only by what has moved and has no choice yet (`freed`). Lines 226-235 write the RETURN for whatever cover was given.
- Should: `overpaid_minor` is at most the part of this credit note that the trust-paid, moved money makes overpaid: `amount_minor − (open_amount − trust)`, never more than `amount_minor`. Otherwise refuse with 23514 and name the amount.

**B-2 Major: undoing the trust → operating batch after "Move back to trust" leaves the owed-back amount standing. The list then sends client money to operating for nothing, and money back for nothing.**
- Repro: `dep(:P,100000)`; `inv(:P,20000)`; `wd(:P,:I,20000)`→`:W`; `move(:W,20000)`→`:B1`; `cn(:I,5000,'OVERPAID_TO_TRUST',5000,:W)`. The list shows 0 trust → operating and 50.00 operating → trust; trust paid is 150.00.
  - `undo(:B1)`. The list now shows **200.00** trust → operating (for 150.00 paid from trust) and 50.00 operating → trust, for money that is no longer in operating.
  - `ret(:P,:W,15000)` is accepted. Trust paid is now 0, yet the list still shows **50.00 trust → operating** and 50.00 operating → trust. `move(:W,5000)` and `move(:W,5000,'OPERATING_TO_TRUST')` both commit.
- Races: an undo racing `cn(…'OVERPAID_TO_TRUST',20000,:W)` leaves moved 0 and owed back 200.00, at RC (wait), RR and SERIALIZABLE (both commit). The 1,500-step random run hit the same state at step 1240.
- Result: "ledger + T2O open − O2T open = bank" still holds. But the list asks for a transfer of client money to operating with no fee behind it (commingling, Code s. 32, Unconfirmed: no counsel). If only the O2T line is followed, firm money goes into trust.
- Where: `money_owed_back` (lines 25-27) counts every OVERPAID_TO_TRUST choice, whether or not the moved money is still out. It feeds the T2O eligible amount (line 369), the O2T item (lines 383-385) and the T2O cap (line 332). The undo (`money_move_batch_write`, FO-7mv) does not look at choices.
- Should: refuse the undo of a batch while a choice covers its moves (name the credit note), so the money is moved back first. Or count only what is still moved: owed back = least(O, moved live).

**B-3 Major (PF-12): the three new helper functions read any firm's money for `xr_app`.**
- Repro: firm B has trust paid 1,234.00 on `:Ib`, moved 1,000.00 of `:Wb`, and a 42.00 refund choice. `SET ROLE xr_app; SELECT set_config('app.firm_id', :FA, false);`
  - `SELECT count(*) FROM money_trust_entry WHERE firm_id=:FB` → 0 (the wall holds).
  - `SELECT money_trust_paid(:FB,:Ib), money_moved_live(:FB,:Wb,'TRUST_TO_OPERATING'), money_owed_back(:FB,:Wb,false)` → **123400, 100000, 4200**.
- Where: lines 22-33 and 398-401. They are SECURITY DEFINER, owned by `xr_wall_reader` (BYPASSRLS), with EXECUTE left to PUBLIC. FO-7a's helpers are invoker (`money_invoice_total(:FB,:Ib)` → 0 under the wall). `money_take_number` revokes PUBLIC. PF-12's own `platform_web_address_taken` revokes PUBLIC and returns no firm data.
- Should: `REVOKE EXECUTE … FROM PUBLIC` on all three (the triggers call them as the owner). Or keep them SECURITY INVOKER and let only the trigger functions run as the reader. A PF-12 test should list every definer function `xr_app` can execute.

**B-4 Major: after a "Returned" on a part-applied cheque, the bounced money stays on the To move list and moves while the party is below zero.**
- Repro: another client `:O` has 500.00. `dep(:P,30000,'CHEQUE',false)`→`:C`; `inv(:P,10000)`; `wd(:P,:I,10000)`→`:W`, not moved. `corr(:P,:C,30000,'RETURNED')` is accepted, and the shortfall shows −100.00.
  - `money_to_move` still shows 100.00 for `:W`, and `move(:W,10000)` commits. The trust bank then holds 400.00 against `:O`'s 500.00.
  - With `ret(:P,:W,10000)` first, the same Returned leaves 0.00 and no shortfall.
- Where: `money_move_line_write` (lines 312-339) and the view (lines 366-391) never read the party's balance. AG-6-75 rule 3 has the reversal undo the applications it funded and remove their open To move lines. Rule 4 has a shortfall only for money already moved.
- Not the cover check that P-638 removed (moving uncleared money before a bounce): here the bounce is already recorded.
- Should: a trust → operating line is refused while it would leave the party's balance plus its open T2O below zero, and the list caps the line the same way.

**B-5 Minor: "Returned" is a deny-list.** `dep(:P,10000,'OTHER')`, then `corr(…,'RETURNED')` → accepted. Brief 1c says "Returned" only on a cheque or a wire. Two partial "Returned" entries (1.00 then 299.00) on one 300.00 cheque are also accepted. Line 108. Should: `method IN ('CHEQUE','WIRE')`.

**B-6 Minor: a tick racing a "Returned" both commit.** A runs `corr(:P,:C,30000,'RETURNED')` and holds; B runs `UPDATE money_payment SET cleared=true …` and commits; A commits. Result: cleared and Returned, at RC (wait order) and at RR in both orders. SERIALIZABLE aborts one of them. The design notes RR only; RC fails too. Lines 214-223 take no lock. Should: the Returned locks the payment row (`FOR UPDATE`) before writing.

**B-7 Minor: the shortfall names the newest reversal, not the one that caused it.** A 300.00 cheque is refunded, then Returned (−300.00). Money in of 10.00, then `corr(…,1000,'RECORDED_BY_MISTAKE')` → −300.00. `reversal_entry_id` is the 10.00 "Recorded by mistake" entry. Lines 243-244.

**B-8 Minor: negative amounts in the words.** After `cn(:I3,10000,'OVERPAID_REFUND',10000,:W3)` on a 300.00 invoice paid and moved from trust, a 1.00 write-off is refused with "(-10000 left)" (line 204).

## What held
- **Reversal vs refund, two connections:** refund 800 then Returned 300, and the reverse order, at RC, RR and SERIALIZABLE, in wait and stale orders. The result was either the refund then the reversal (−300.00, listed), or the refund refused with "Only CAD 500.00 is available." (23514), or 23505/40001. No non-reversal entry ever ended below zero, and the seq chain never forked.
- **Races at RC and RR:**
  - Two choices on one moved application: one written, the other refused (23514 at RC; 40001 at RR and SERIALIZABLE).
  - A move vs a credit note's choice: the cover always matched what had moved.
  - A return of a moved application vs a choice: the return was refused.
- **Choices:** a choice for more than has moved, a second choice on money already covered, a choice on an unmoved application, or one naming another invoice's application → refused. With no choice → refused. `KEEP_IN_OPERATING` does not exist. A choice without all three columns → refused.
- **Operating → trust lines:** a line naming no credit note, after only a refund choice, or of kind WRONG_ACCOUNT → refused. A move-back beyond the amount owed → refused.
- **Credit note larger than the trust part** (300.00 invoice, 100.00 from trust): CN 250.00 alone → "return 50.00 first". With that return in the same transaction → CN-0001. 300.01 → refused.
- **Other kinds:** WRONG_ACCOUNT below zero → "Only CAD 0.00 is available." A reversal kind on a withdrawal return, or on a correction naming nothing → refused. Money in while below zero → recorded.
- **Reasons:** a blank or 5,000-character reason is refused. A French and Japanese reason is accepted.
- **Firm walls:** a move-back line naming another firm's withdrawal, or another firm's invoice id, a credit note naming another firm's withdrawal, and a row naming firm B are all refused. `money_trust_shortfall` and `money_to_move` show 0 rows of firm B to `xr_app`.
- **Ledger + T2O open − O2T open = bank:** held at every one of 1,500 random steps (deposits, applications, returns, moves, undos, credit notes with and without choices, move-backs, refunds, reversals, WRONG_ACCOUNT) with a difference of 0.
- **Budget:** one firm with 7,420 entries (5,000 applications). `money_to_move` total: 175 ms (23 ms before FO-7a2), 206 ms as `xr_app`. `money_trust_shortfall`: 14 ms. Both are under STANDARDS §9's 1 s.
