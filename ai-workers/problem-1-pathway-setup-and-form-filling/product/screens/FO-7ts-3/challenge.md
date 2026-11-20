# FO-7ts part 3: what departs from the brief, and the rulings it needs

The brief is `build-lead-c-briefs/FO-7ts-3.md` on `claude/build-lead-c-647b40`. Every point below is also a "Question for the tech lead" on the PR. Evidence is in `review.md`, `break-report.md` and `tests/check_fo7ts_money_settings.ts`. Nothing below was settled silently.

## Rulings (Lead 96, 19 Nov; Build Lead C may overrule 2 or 3 in a PR comment, otherwise they stand)
* **Ruling 1, lock order: yes, in this PR.** `money_credit_note_write` and `money_move_batch_owed_back` now take the parties smaller id first, as part 3 does: the credit note takes both locks, and the undo locks every party it touches before any invoice row.
  * **Race tests.** Each has one race test of 100 races with 0 deadlocks. With FO-7lk's text put back, the same tests give 41 and 78 deadlocks.
  * **Reads.** The reviewer re-reads that diff and the breaker re-checks the races.
* **Ruling 2.** DW28 and DW30 move to FO-7t part 2.
* **Ruling 3.** DW29 goes to a follow-up on the next PR on `client-money.prisma`. The design below is its starting point.

## Ruling 4 (Lead 96, 19 Nov): `money_move_line_write` is fixed in this PR
* **The fix.** A line of a pick takes the payer's and the invoice party's locks smaller id first, with a 100-race test. It gives 0 deadlocks; with FO-7lk's text put back it gives 8.
* **The size exception is granted:** ~886 changed lines, ~740 without the copied function texts.
* **What still can deadlock.** A batch of several lines locks line by line, so it can still deadlock against a pick. This is written in the function's comment and the PR body. The move route must insert lines sorted by party.
* **Where the note went.** The ruling named FO-7m, but FO-7m is the monthly check. The batch lines are written by FO-7t part 3's `POST /trust/to-move/batches`, so the note is in `design/briefs/FO-7t.md`, with a pointer in `FO-7m.md`.

## Asked in round 2 (kept as the record): `money_move_line_write` (review R2-1, Major; break R2-m1, Minor)
* **What happens.** FO-7lk's `money_move_line_write` locks a line's party (the payer), then updates the invoice row. For a pick line, that row is another party's, and that party's lock is never taken. Lines arrive one statement at a time, so a batch holding A's lock and invoice X's row can wait on D's lock, while D's pick on X holds D's lock and waits on X's row. The result is 40P01. Both the reviewer and the breaker reproduced it at 73adf83e5. No money goes wrong: one side is refused and can retry.
* **Why it isn't fixed here.** `money_move_line_write` is on the brief's do-not-edit list.
* **Asked:** leave to make `money_move_line_write` take the line's payer and its invoice's party smaller id first. That closes the two-lock case for a single line. Across lines, the move route (FO-7m) inserts lines sorted by party, or takes all their locks first: a line-at-a-time trigger cannot order locks across statements. Add one DW26 race test of 100 races. **Recommended:** yes, in this PR, the same as ruling 1. The other choice is a written "known retry, owned by FO-7m".

## Asked before these rulings (kept as the record)

### 1. The two-lock order with FO-7lk's `money_credit_note_write` (review Major 1, break m1). For the tech lead.
* **Why a pick holds two locks.** A pick holds the payer's lock and the invoice party's lock, because FO-7lk's `money_issued_invoice` takes the latter. This part takes both, smaller id first. That cures the crossing-picks deadlock: DW26 passes, and without the fix it fails, confirmed by mutation.
* **Where the order still breaks.** `money_credit_note_write` (FO-7lk) takes the withdrawal's party first, then the invoice's party. Its comment says the withdrawal is "of the invoice's party", which a pick makes untrue. A "Move back to trust" credit note racing a pick can therefore deadlock with 40P01: 53 of 100 races in the reviewer's run, 15 of 40 in the breaker's. No money goes wrong: one side is refused and can retry. `money_move_batch_owed_back` has the same cause; this was found by reading the code and was not reproduced.
* **Why it isn't fixed here.** The brief's Holds forbid editing `money_credit_note_write`. It names no rule on `money_move_batch_owed_back`, but that function is FO-7lk's too.
* **Asked:** leave to change the lock lines in both functions, taking the two party locks smaller id first, in this PR, with a DW26 race case for each. Recommended: yes. The other choice is to ship with a known retry and fix it on the next baton.

### 2. DW28, DW29 and DW30 (review Major 3). For Build Lead C, who owns the brief.
* **DW28, the move route.** No move route exists, and this part's brief says "No route, no screen". Proposed: move it to FO-7t part 2.
* **DW30, the ledger read.** No ledger read or screen exists. `money_trust_shortfall` already leaves the pair out: DW21 proves it on #2204. Proposed: move it to the first row that reads the ledger (FO-7t part 2, or FO-7b's ledger figure, which `FO-7b.md` already names).
* **DW29, a REFUNDED credit names its payout.**
  * **Why it is more than a column.** A credit payout as a `money_refund` row runs into part 2's B4 rule, which refuses refunding a payment that credit was kept from. The order of writes and the amounts need a design that no source gives.
  * **Proposed design:** `money_credit_entry.refund_id` → `money_refund`, required on `REFUNDED`, one per refund, with the refund's amount equal to the credit's; the credit entry is written first and B4 counts it. It would come either as a follow-up on the next `client-money.prisma` baton, or in this PR if ruled so.
* **Asked:** a written ruling for each one.

## Recorded deviations (no ruling needed unless you disagree)
* **DW26's second half.** The brief says "a pick from A and a deposit to B do not wait on each other". That cannot hold when B is the invoice's party: FO-7lk serialises B's ledger under B's lock, and that is FO-7lk's whole point. The test proves both sides. A deposit to B waits and then commits. A deposit to C, a party not on the invoice, does not wait.
* **The "pass unchanged" suites.** DW27 makes a method and date required on every trust refund. So the `entry` helpers in `check_fo7a2_ledger_rules.ts`, `check_fo7a_money_schema.ts` and `check_fo7mv_move_list.ts` add them on `REFUND_TO_CLIENT` rows only, one line each. No assertion changed and the counts are unchanged (35, 122, 45). `check_fo7a_money_schema.ts` also has the date-list assertion the brief names.
* **The tax treatment at issue.** A null ("the party's") is set at issue to the party's treatment, or to Taxable, so a later change to the party never moves an issued invoice. Invoices issued before this part are set to Taxable, the value issuing would have chosen.
* **The correction's case (breaker M2, review Major 2).**
  * **The rule.** Money returned from a withdrawal goes back to the withdrawal's case. A deposit's correction goes on the deposit's case. A deposit made before any case may instead be corrected on a case its party moved money to: a returned cheque comes off the case its money reached.
  * **The limit.** Moves are not linked to the deposits they came from, so the database cannot tell which case a pre-case deposit's money reached. A person can still book the reversal on the wrong one of those cases. The route should offer only the cases a move from that money reached.
* **For the route (breaker m5).** The database cannot prove the payer is on the case. FO-7t part 2's pick route must check it, with a test of a stranger tagged with the case.
