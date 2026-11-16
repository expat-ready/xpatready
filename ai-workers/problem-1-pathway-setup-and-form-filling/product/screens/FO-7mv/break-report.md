# FO-7mv break report: the "To move" list in the database (breaker: money, schema)

Commit `194128ddb7d2de31acd30e5d23b62abe46953c14` on `claude/stoic-ptolemy-jdoyw9` (PR #1924). I used scratch databases `xr_studio_brk_1` (all 99 migration folders, applied in name order with `psql -v ON_ERROR_STOP=1`) and `xr_studio_brk_2` (every folder before FO-7mv, for the guard), both on :54329. Both were dropped at the end. I attacked them with psql, and with `pg` clients from the studio's node_modules at READ COMMITTED, REPEATABLE READ and SERIALIZABLE, holding snapshots in "stale" and "waiting" orders. Line numbers refer to `prisma/migrations/20261116030000_fo7mv_move_list/migration.sql` unless FO-7a's is named. Cost: US$0.

**Shorthand in the SQL** (the same fixtures as `tests/check_fo7mv_move_list.ts`; `:F` is a firm with `trust_enabled`, `:P` is a person):
- `dep(:P, amt, method)`: `INSERT INTO money_payment (…, method, amount_minor, 'CAD', received_into 'TRUST', cleared = (method <> 'CHEQUE'), …)`, then the `DEPOSIT` entry naming it, in one transaction.
- `inv(:P, total)`: an issued one-line invoice.
- `wd(:P, :I, amt)`: a `WITHDRAWAL_TO_INVOICE` of `-amt`.
- `corr(:P, :D, amt, kind)`: a `CORRECTION` of `-amt` naming deposit `:D`, with `correction_kind`.
- `refund(:P, amt)`: a `REFUND_TO_CLIENT`.
- `move([src], [amt])`: in one transaction, a batch (`TRUST_TO_OPERATING`, CAD, transfer date 2026-11-20) plus one line per source. The kind is `TRUST_APPLIED` for a withdrawal and `WRONG_ACCOUNT` for a correction.
- `undo(:B)`: a batch with `undoes_batch_id = :B` and a reason.

## Breaks

**B-1 Blocker: money that rests on an uncleared cheque is moved out of trust, and the bounce can then never be recorded (B-19 a again, in a new order, with every label correct).**
- Repro: `dep(:P,10000,'CHEQUE')` (the payment has `cleared = false`); `inv(:P,10000)` → `:I`; `wd(:P,:I,10000)` → `:W`. Then `SELECT open_minor FROM money_to_move WHERE source_entry_id=:W` → 10000, and `move([:W],[10000])` → committed.
- The cheque then bounces. `corr(:P,:C,10000,'BOUNCED')` → 23514 "the trust balance would go below zero (held 0 CAD, entry -10000)".
- Result: 100.00 that never arrived has left the trust bank, so it came out of other clients' money. The ledger still shows their full balances, and there is no way to record the bounce. The trust bank ends up holding less than the ledger says clients own.
- Where: lines 179-244 (`money_move_line_write`) and the view (lines 295-314) never read `money_payment.cleared` (FO-7a lines 171 and 604).
- Should: a move is refused, and kept off the list, while it would take the party's cleared money below what the ledger holds. For example, refuse it while the party's balance less its uncleared cheque deposits would be below zero after the move. The words should say to wait for the cheque to clear.

**B-2 Major: an uncleared cheque deposit labelled `WRONG_ACCOUNT` moves at once.**
- Repro: `dep(:P,50000,'E_TRANSFER')`; `dep(:P,30000,'CHEQUE')` → `:C` (`cleared = f`); `corr(:P,:C,30000,'WRONG_ACCOUNT')` → `:X`. The list shows 30000 and `move([:X],[30000])` commits. The ledger shows 500.00 held.
- Result: if the cheque bounces, the bank holds 200.00 against a ledger of 500.00. The database knows the cheque has not cleared (line 207 checks only the kind).
- Should: a `WRONG_ACCOUNT` line on a deposit whose payment is `cleared = false` is refused until the cheque clears, and it is not listed until then.

**B-3 Major (for the tech lead: the brief's rule 3 as worded allows it): a refunded deposit, corrected with kind `WRONG_ACCOUNT`, moves another 200.00 of the client's money to operating (B-19 b again; only the label changed).**
- Repro: `dep(:P,50000)`; `dep(:P,20000)` → `:D`; `refund(:P,20000)`; `corr(:P,:D,20000,'WRONG_ACCOUNT')` → `:X`; `move([:X],[20000])`. All four committed.
- Result: the client's ledger fell from 700.00 to 300.00. The client received 200.00 back, and another 200.00 went to operating with no invoice. FO-7a's cap (lines 1178-1181) still counts corrections only, never refunds, and a refund names no deposit. So "WRONG_ACCOUNT linked to its deposit" cannot tell this case apart.
- Should, as #1758 B-19 proposed: bound a deposit's corrections by what is still held from it. Or make a refund name the deposit it returns, and count refunds against `WRONG_ACCOUNT`.

**B-4 Major: a credit note or write-off after trust paid the invoice leaves the whole withdrawal on the list, and the move commits.**
- Repro: `dep(:P,50000)`; `inv(:P,10000)` → `:I`; `wd(:P,:I,10000)` → `:W`. Then `INSERT INTO money_credit_note (firm_id,invoice_id,amount_minor,currency,"full",reason,created_by) VALUES (:F,:I,10000,'CAD',true,'Service cancelled','u')` → CN-0001.
- After that, `money_to_move` still shows `open_minor` 10000 for `:W`, and `move([:W],[10000])` commits.
- The same happens with a partial credit note of 60.00 (the full 100.00 still moves, for 40.00 due) and with `INSERT INTO money_write_off (…,10000,…)`. It also happens when the move and the credit note race at READ COMMITTED, in either order: both commit. At RR and SERIALIZABLE the second one fails with 40001.
- Result: client money for a cancelled fee is moved to operating. FO-7a's own rule, "trust never pays more than is open after credit notes and the write-off" (FO-7a lines 1183-1191), is broken after the fact. The view's eligible amount (line 298) is the withdrawal less returns only.
- Should: a `TRUST_APPLIED` line, and the view's open amount, are capped at what is still due on the invoice after credit notes and the write-off, net of other moves of that invoice. Or a credit note or write-off on a trust-paid invoice is refused until the trust money is returned (AG-6-48).

**B-5 Minor: deadlocks (40P01).**
- (a) Two-party batches written in opposite orders. T1 writes a batch with a line for P1's withdrawal, T2 writes a batch with a line for P2's withdrawal. Then T1 adds a line for P2's and T2 adds one for P1's. One of them gets 40P01, at READ COMMITTED and at REPEATABLE READ. In an 8-connection random run, 53 of 1,200 RC transactions and 32 of 1,200 RR transactions failed this way.
- (b) An issued invoice's due-date edit takes no party lock (FO-7a lines 792-797). T1 runs `UPDATE money_invoice SET due_date='2027-01-31' WHERE id=:I`, T2 runs a return of `:W`, then T1 runs `move([:W],[1000])`: T2 gets 40P01. The same happens with T2 moving and T1 returning.
- Should: the line trigger takes every party lock of the batch in one sorted order. FO-7t could also sort its lines, but that is a rule outside the database. The due-date edit takes the party lock first, as `money_issued_invoice` does.

**B-6 Minor: the migration's guard can be passed by a write that is in flight.**
- Repro: on the pre-FO-7mv copy, connection X runs `BEGIN; INSERT INTO money_trust_entry (…'CORRECTION',-5000,…,corrects_entry_id=<deposit>…)` and does not commit. Connection M then runs the whole `migration.sql`, and X commits 0.5 s later.
- Result: "migration ok". Afterwards `SELECT kind, correction_kind FROM money_trust_entry …` shows a deposit correction with `correction_kind = NULL`. The guard (lines 19-27) does not see an uncommitted row, and ALTER TABLE then waits for X.
- Should: `LOCK TABLE "money_trust_entry" IN SHARE ROW EXCLUSIVE MODE` in the same transaction before the DO block.

**B-7 Minor: `money_to_move` grows quadratically with the firm's trust entries.**
- Repro: one firm with 20 people, 200 invoices, 5,000 withdrawals and 2,500 returns (7,700 entries). `SELECT sum(open_minor) FROM money_to_move WHERE firm_id=:F AND currency='CAD'` takes 3.76 s; one person's list takes 0.24 s. The line and return triggers stay fast (7.6 ms and 3.2 ms).
- Cause: `returned_minor` (line 299) looks up `corrects_entry_id`, which has no index, so every withdrawal scans the firm's entries. STANDARDS §9 sets a first view under 1 s.
- Should: add an index on `("firm_id","corrects_entry_id")`.

**B-8 Minor: at REPEATABLE READ a stale snapshot is refused with wrong words, not 40001.**
- Repro: T2 opens at RR and takes its snapshot. T1 runs `undo(:B)` and commits, which puts 100.00 back on the list. T2 then runs `move([:W],[10000])` and gets 23514 "would move more than this entry still holds (0 CAD to move …)". The same happens to a return in the place of the move.
- Result: this is safe, but a caller that retries on 40001 will not retry, and the person sees "0 to move" while the list shows 100.00. An undo touches no row that the move reads under lock.
- Should: an undo touches the rows a move or return touches (for example each line's invoice or source row), so the stale writer gets 40001.

**B-9 Minor: `transfer_date` accepts any date.** `money_move_batch` took transfer dates of `'infinity'` and `'4713-01-01 BC'` on committed batches with lines (line 116 checks only that a date is present). Should: a real date, no earlier than the newest source entry's date and not far in the future.

## What held
- **B-18:** "withdraw, move, return" in every order I tried, both stale and waiting, at RC, RR and SERIALIZABLE. Either the move or the return is refused (23514), or the later writer fails with 40001. Moved plus returned never passed the withdrawal. These also held:
  - partial cases (move 60.00, return 60.00 → "only 40.00 can come back");
  - a line and a return in one CTE statement;
  - two lines of one source in a multi-row INSERT, and in a CTE pair;
  - an undo and a new move in one CTE (refused, the safe way);
  - an undo then a return, in one CTE.
- **Undo:** two undos in parallel give one written and one 23505, at every level. An undo of an undo is refused, also in a multi-row insert and in a CTE. A second undo of one batch is refused in the same multi-row insert. An undo of another firm's batch is refused.
  - An undo racing a move or a return is either correct (RC, after the commit) or refused the safe way.
  - A return racing an undo: the return is refused and the undo is written.
  - A blank, a 201-character or a zero-width reason is refused; a French and Japanese reason is accepted.
- **B-19 as labelled:** `BOUNCED` and `ENTRY_ERROR` never license a move. A kind on a withdrawal return, on a refund, or on a correction of a correction is refused. A deposit without a kind is refused. A `WRONG_ACCOUNT` line on a deposit, or one carrying an invoice id, is refused. Corrections of one deposit stay capped at the deposit, across kinds.
- **Racing writes:** a `WRONG_ACCOUNT` correction racing a refund keeps the balance at 0 or above (23514, 23505 or 40001). Two `WRONG_ACCOUNT` moves of one correction give one written, and the other is refused (23514 at RC, 23505 or 40001 at RR and SERIALIZABLE).
- **Currency, party and firm:** a CAD line in a USD batch, a USD source in a CAD batch, and a mixed-currency batch are refused. So are `OPERATING_TO_TRUST` and `CARD_FEE_ON_TRUST` lines. For party and firm, a person line on a company source, another invoice id, another firm's entry or batch, and a line added later or in a released savepoint are all refused. So is a batch left empty.
- **Overflow:** a 21,474,836.47 deposit, invoice and withdrawal moves in full; 0.01 more is refused; the view casts do not overflow.
- **Invariants:** two 8-connection random runs (1,200 transactions each, three parties, multi-source batches, at RC and RR) ended with no source over-moved, no negative balance, an unbroken `seq` and balance chain, and the database's own ledger + list = trust bank equation at 0 difference. The guard itself refuses a committed kindless deposit correction (the builder's DW10).

## Round 2 (at `2abc41df32e8df1d80d02126db850fe29b4fe3e7`)
Same setup: `xr_studio_brk_3` (all 99 folders), `_4` and `_5` (before FO-7mv, for the guard); all dropped. Lines refer to the migration at that commit. At 04:32 the working tree gained uncommitted edits to `migration.sql`, the test and `review.md` (not mine, not tested; B-2's repro below still moved, so `_3` had the committed file).

**B-10 Blocker: B-1 in a new order, move first, then the cleared money leaves.** `dep(:P,50000)`; `dep(:P,30000,'CHEQUE')` → `:C`; `wd(:P,:I,30000)` → `:W`; `move([:W],[30000])` (passes: 500.00 held + 300.00 to move − 300.00 ≥ 300.00 uncleared); `refund(:P,50000)` → committed; `corr(:P,:C,30000,'BOUNCED')` → 23514 "below zero (held 0 CAD …)". `corr(:P,:D,50000,'ENTRY_ERROR')` in the place of the refund ends the same. At REPEATABLE READ the refund and the move also race through: T1 refund commits, T2 (older snapshot) moves 300.00 and commits (RC refuses, SERIALIZABLE 40001). The bank is 300.00 below the ledger's other clients. The check (lines 238-255) runs only on a move; a refund or deposit correction never asks whether the party's cleared money still covers what has moved. Should: the same rule in `money_trust_entry_write`/`_moves` for every exit (refund, deposit correction), and those touch the row the move touches.

**B-11 Major: B-2 not fixed at this commit.** Round-1 repro (`dep 50000`; uncleared cheque `30000` corrected `WRONG_ACCOUNT`; `move([:X],[30000])`) commits: cleared cover counts the party's 500.00, and the cheque's correction cap is now used, so `corr(:P,:C,30000,'BOUNCED')` → 23514 "at most the deposit". Should: a `WRONG_ACCOUNT` line waits for its own payment to clear (the uncommitted edit seems to do this).

**B-12 Major: the list shows more than can move.** (a) Invoice 100.00 paid by `wd 6000` and `wd 4000`, credit note 50.00: `money_to_move` lists 50.00 + 40.00 = 90.00; `move([:W1,:W2],[5000,4000])` → 23514 "5000 due, 5000 moved"; only 50.00 moves (lines 329-337 cap each source by the whole invoice, so the invoice's due is counted once per withdrawal). (b) The uncleared check is not in the view: round-1 B-1 lists 100.00 and the move is refused; two invoices on one uncleared 100.00 cheque plus 100.00 cleared list 200.00, one 100.00 moves. A firm that transfers what the list says cannot record it. Should: the view applies the per-invoice and per-party caps once per invoice and party, as the trigger does.

**B-13 Major: after a credit note on a trust-paid invoice the excess is on neither the ledger nor the list.** Same (a) after the 50.00 move: P's ledger 400.00, list 0, trust bank 450.00: 50.00 of the client's money is shown nowhere, and DW6's "ledger + list = bank" fails. A credit note after a move is still accepted (`move 10000`, then a full credit note → CN-0002; also in both orders at RC), leaving 100.00 moved for 0.00 due. Should: the over-applied part appears as a return to trust (or a to-do), or the credit note is refused until it is returned.

**B-14 Minor: B-5 is worse.** Every move updates the firm's settings row (line 242) after the party lock. T1 writes a line for A, T2 one line for B, T1 a line for B → T2 40P01 at RC and RR (no opposite order needed). Random 8-connection run: 40P01 53 → 137 of 1,200 at RC, 32 → 58 at RR; 40001 at RR 102 → 206. Moves of two different parties of one firm now fail 40001 at RR and SERIALIZABLE, and a settings edit then a stale move → 40001.

**B-15 Minor: the settings row's `updated_at` becomes every move's time** (line 242, `updated_by` unchanged), so "settings last changed by user-O at …" is false.

**B-16 Minor: the B-6 lock ends with the DO block when the file runs statement by statement (psql -f, as the test applies it).** `_5`: a reader holds `SELECT … FROM money_trust_entry` open; psql -f runs the migration (DO commits, ALTER waits); a deposit correction is sent and queues; the reader commits → migration exit 0, a deposit correction with `correction_kind` NULL. Run as one transaction (round-1 repro, `_4`) it is refused. Should: the guard after `CREATE TRIGGER money_trust_entry_moves` (line 303).

**B-17 Minor: kinds contradict payments.** `corr(…,'BOUNCED')` on an E_TRANSFER deposit commits, and a cheque corrected BOUNCED can then be ticked cleared (`UPDATE money_payment SET cleared=true …` → UPDATE 1).

**Held in round 2:** round-1 B-1 repro refused; a partly bounced, then cleared cheque moves only after clearing; two invoices on one uncleared cheque at RC, RR, SERIALIZABLE, stale and waiting: one moves, the other 23514 or 40001; credit note or write-off then move: capped at RC, 40001 at RR/SERIALIZABLE in both orders; round-1 B-4 repro refused; B-6 round-1 repro refused; B-9 by reading (CHECK, line 95). Cost at 7,421 entries in one firm: `money_to_move` 0.24-0.28 s (was 3.76 s), one person 16 ms, one line 17.5 ms, a 400-line two-party batch 2.36 s. Stress invariants unchanged (none over-moved, none negative, chain intact, books gap 0).
