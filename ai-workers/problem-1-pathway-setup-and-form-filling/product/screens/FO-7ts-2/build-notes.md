# FO-7ts part 2 build notes — the pre-case → case pair and the credit ledger, under the party lock

Brief: `product/design/build-lead-c-briefs/FO-7ts-2.md` (on `claude/build-lead-c-647b40` at a7014c0bb) over Part 2 of `product/design/briefs/FO-7ts.md`. Branch `claude/trusting-fermat-ejsqdh-fo7ts2`, from FO-7lk's branch (which carries #2106's finished head facc5231). Cloud builder lane, 18 Nov. No PR yet: it opens only after #2106 and FO-7lk merge (never two money PRs open).

## What changed
* Migration `20261118220000_fo7ts_ledgers` (re-stamp later than `main`'s newest before the PR, P-600), with `rollback.sql` (restores FO-7lk's `money_trust_entry_write` text exactly and money_trust_entry's checks; checked by the test).
  * **The pair:** `MOVE_TO_CASE`; `moved_from_entry_id` (composite key to the same table, RESTRICT; unique, so one + per −). `money_trust_entry_write` (FO-7lk's text, changed only for the pair): under the party lock the − half (no case) takes at most the pre-case balance and is refused at zero or below (P-634: an outflow from what is held); the + half (on a case) names a − half written in the same transaction, same party and currency, opposite amount. A deferred constraint trigger refuses a − with no + at commit. The − half may show a running balance below zero only when the party's case is short (Build Lead C's ruling: a pair may run while the case is below zero); the + half brings it back, so the pair never takes the party below zero.
  * The new enum value cannot be used in the transaction that adds it, so the checks compare the kind as text.
  * **The credit ledger** `money_credit_entry`: holder = the case, or the party with no case; kinds KEPT / APPLIED / REFUNDED / REVERSED with signs, links and reasons as the brief; seq and balance per holder and currency (partial unique indexes), never below zero; insert-only; PF-12's wall (forced policy, gate trigger, trigger functions as `xr_wall_reader`). Party lock first (`money_trust_lock`), then any invoice row.
  * New helper `money_invoice_due(firm, invoice)`: total less credit notes, write-off, trust paid (less "Refund to the client" choices), operating payments net of refunds, and credit applied net of reversals.
* `client-money.prisma`: the enum value, the column and relation, `MoneyCreditKind`, `MoneyCreditEntry`, one header line. `migrate diff` is empty.
* `tests/check_fo7ts_money_settings.ts`: DW5-DW8, DW10 (part 2), DW12-DW14, DW21-DW24 and the rollback check (86 checks in all with part 1's).
* `api/src/client-money/MODULE.md`: one invariant line.

## Readings and choices (for the reviewer and the tech lead)
* **KEPT** only from a payment **into operating on an invoice**, for that invoice's holder; all KEPT on one invoice's payments (net of reversals) ≤ what its payments paid over it (`-money_invoice_due`), and KEPT on one payment ≤ the payment less its refunds. Credit is never kept from trust money (P-603).
* **APPLIED** ≤ what is due on the invoice (draft or issued); the brief named no cap, but applying more than is due would leave money nowhere.
* **Two parties on one case's credit** take different party locks; the per-holder seq index still refuses the second writer (23505), so the balance never forks.
* **`check_fo7a_money_schema.ts` is unchanged.** The brief says the `*_minor` count goes up by 2, but that assertion counts only FO-7a's own table list (`TABLES`), which `money_credit_entry` is not on, so it stays 11 and the file passes unchanged.
* **Contract gaps (from the brief):** no route writes or reads the credit ledger yet; the move on case open needs the case side's fact and `CaseSummaryPort`. A later refund of an operating payment does not yet look at credit kept from it (FO-7a's refund trigger is outside this touch list).
* **Known order exception:** `money_invoice_line_write` (FO-7a) share-locks a draft invoice row and takes no party lock; a single transaction that edits a draft's lines and then applies credit to it takes the invoice row first. No writer in the code does both; the DW13 check lists it.

## Checks run (cloud, PostgreSQL 18.3)
* (on FO-7lk c5d1bccd, with #2106 ae7cc15f) `check_fo7ts_money_settings.ts` 89/0 · `check_fo7lk_lock_order.ts` 16/0 (unchanged) · `check_fo7a2_ledger_rules.ts` 35/0 · `check_fo7a_money_schema.ts` 122/0 (unchanged) · `check_fo7mv_move_list.ts` 45/0 · `check_prisma_schema.ts` 8/0.
* No live AI, no Stripe, US$0. No screen, no route.

## Breaker round 1 on 692ea4be: fail (2 Blockers, 4 Majors), and the fixes
The breaker's report is in the session scratchpad; it will be copied here with the round 2 verdict. The move pair held against every attack. The credit ledger's rules held only when a credit entry was written, not after later writes. **Fixed:** the five new triggers below keep each rule true after every later write. Each is a trigger of this row's own; no other row's function is edited.
* **B5 (Blocker): credit from nothing.** Reversing an application re-opened its invoice while credit was kept from that invoice's payments. Fixed by `money_credit_entry_holds`: the reversal is refused while the kept credit relies on the overpayment.
* **B8 (Blocker): applied credit did not pin the draft.** The draft's party, case or currency could be changed after credit was applied. Fixed by `money_invoice_credit_pinned`: an invoice holding credit keeps its party, case and currency.
* **B7 (Major): a draft's lines could fall below the credit applied to it.** Fixed by `money_invoice_line_credit`.
* **B4 (Major): a refund of the payment that credit was kept from.** The same money was both refunded and kept as credit. Fixed by `money_refund_credit_kept`, which takes the party lock, then the invoice row, then checks.
* **B6 (Major): trust returned from a withdrawal re-opened an invoice whose overpayment was kept.** Fixed by `money_trust_entry_credit_kept`.
* **R1 (Major): the rollback dropped credit entries.** It now refuses while any exist.
* **R2: re-applying after the rollback failed.** Fixed with `ADD VALUE IF NOT EXISTS`.
* **Note: credit could be kept from an uncleared cheque.** That is now refused.
* **Left for the tech lead:**
  * B13 (a trust withdrawal on an invoice already paid by credit; the same holds today for operating payments, a Code s. 32 reading);
  * B15 (a transaction that saves a draft line and then applies credit can deadlock; FO-7a's line writer takes no party lock);
  * B11b (any party on a case may refund the case's credit: a route rule).
* **Size (P-610):** the rollback now runs FO-7lk's migration again, all `CREATE OR REPLACE`, instead of copying `money_trust_entry_write`'s text. That keeps the row at 799 changed lines of code and tests.
* **Checks:** `check_fo7ts_money_settings.ts` 97/0 (a case for each finding), `check_fo7lk_lock_order.ts` 16/0, `check_fo7a2_ledger_rules.ts` 35/0, `check_fo7a_money_schema.ts` 122/0, `check_fo7mv_move_list.ts` 45/0, `check_prisma_schema.ts` 8/0.

## Reviewer round 1 on 692ea4be: changes requested, and the fixes
* **M1, size:** now 799 changed lines.
* **m1:** the same as breaker B4/B6, fixed above.
* **m2:** APPLIED now requires the invoice's own party as well as its case and currency.
* **m3:** DW13's planted case sets a lock timeout, so a lost lock fails instead of hanging.
* **m4:** the per-payment KEPT cap now has its own case.
* **m5:** FO-7lk's `review.md` is restored; a merge had changed a stamp inside another reviewer's record.
* **m6:** the same as R1, fixed above.
* **n4:** the commit-time trigger now fires only for a move.
* **n5:** the MODULE card's Tables line names `moneyCreditEntry`.
* **Recorded, not changed:**
  * n1: a draft edited down after credit is applied stays overpaid by credit; for the Apply-credit route.
  * n2 and n3: test wording.
  * n6: the same-transaction check's 2^32 gap.
* `check_fo7ts_money_settings.ts` 98/0.

## Reviewer round 2 on 736346af: changes requested, and the fixes
* **M2, fixed: the refund trigger took the party lock after the payment row (40P01).** The party lock and the invoice row are now taken in a BEFORE trigger, `money_refund_credit_lock`, which runs before FO-7a's `money_refund_write` locks the payment row. The check stays AFTER.
  * New check: one transaction refunds payments A then B while another refunds B, and both finish.
  * With the old trigger, that check gets 40P01.
* **m-b:** the rollback's credit refusal is now proven on its own. The test removes the moves inside a transaction that is rolled back, so only the credit rows remain.
* **m-c:** a test that applied credit pays only an invoice of the holder's own party.
* **m-d:** a test for the per-payment rule. A 50.00 refund of the payment that 50.00 was kept from is refused.
* **Nit:** B8's test now also covers an issued invoice.
* **m-e, recorded for the Apply-credit route row:** at REPEATABLE READ, a cut to a draft's line can commit before an older-snapshot APPLIED is accepted.
* **Nits, recorded for the draft-editor route:** a delete-then-insert save on a credit-holding draft is refused. Re-running FO-7lk's migration in the rollback is exact only while no later migration edits FO-7lk's functions.
* **M1, size:** 815 changed lines as CI counts them (`MODULE.md` included). This needs a size exception from the tech lead, asked for.
* `check_fo7ts_money_settings.ts` 101/0.

## Breaker round 2 on 736346af (fail: N9, N4), and FO-7a's two-refund check
* **N9 (Major), fixed in 7728d948 and adjusted here: refunds deadlocked.** The refund's party lock is BEFORE FO-7a's `money_refund_write`, and the invoice row and the check are AFTER.
  * Moving the invoice row out of the BEFORE trigger keeps FO-7a's own check unchanged. Its two-refund race at REPEATABLE READ is still refused by the refund ordinal (23505), as `check_fo7a_money_schema.ts` expects. With the invoice row in BEFORE, that check got 40001 and failed.
  * New check: 10 rounds of a KEPT and a refund of the same payment at once all finish, with no 40P01.
* **N4 (Major), fixed: B7 at REPEATABLE READ.** APPLIED now share-locks the draft's lines before it reads what is due, so a line cut committed after its snapshot is refused (40001).
  * New check, which fails without the lock.
  * This also closes the reviewer's m-e.
* **Recorded for the tech lead, not changed:**
  * N6: a full credit note or a write-off on an invoice that credit already paid, the same class as B13.
  * L5: a draft that ever held credit stays pinned and can't be deleted, even after a full reversal.
* `check_fo7ts_money_settings.ts` 103/0 · `check_fo7a_money_schema.ts` 122/0 (unchanged).

## Breaker round 3 on 5397b60b (fail: N11), fixed
* **N11 (Major): the N4 line lock deadlocked with a draft's line save.** APPLIED took the draft's row and then its lines, while FO-7a's line writer takes the line and then the row.
* **Fixed:** APPLIED now share-locks the lines first, then updates the row, in the line writer's order.
* **New check:** the breaker's three-session repro (a header save holds the draft; credit applied and a line save queue behind it). Both finish now. With the old order it gets 40P01 in 3 of 3 runs.
* N9 and N4 stay fixed: the breaker ran 300 rounds and the line races at RC and RR.
* `check_fo7ts_money_settings.ts` 104/0 · `check_fo7a_money_schema.ts` 122/0 (unchanged).
* **Size:** the tech lead chose a size exception (19 Nov). The PR body names the DECISIONS row once it is added.

## Reviewer round 3 on 5397b60b (changes requested: M3, the same as N11), fixed
* **M3: the N4 line lock went invoice row → draft lines, against FO-7a's line writer.**
  * The reorder in db1162d1 fixed N11, but not D2: a transaction that already holds the draft's row from an earlier save, then applies credit while a line save waits.
  * **Fixed, with the reviewer's tested sketch:** the line lock is taken only above READ COMMITTED, where a stale read must fail, and with `NOWAIT`, so the result is 55P03, never 40P01. At READ COMMITTED every read is fresh, which already refuses N4.
  * **New check:** D2 at READ COMMITTED. Both finish; with the lock always taken, it gets 40P01.
* **n-d:** the refund-order check now runs in a fixed order, instead of depending on timing.
* **Size:** 824 at 5397b60b, as CI counts it. The final count is in the PR body.
* `check_fo7ts_money_settings.ts` 105/0.

## Round 4 on c3bb10de: Reviewer Approve (Minor m-f); Breaker fail (N12, the same issue), fixed
* **N12 / m-f: the REPEATABLE READ line lock came before the draft row.** An editor saving the header and then a line in one transaction got 40P01 against an apply.
* **Fixed:** the row comes first, then the line lock, taken above READ COMMITTED only (`NOT IN ('read committed', 'read uncommitted')`, n-e) and with NOWAIT. It now sits just before the due read. This is the reviewer's tested move and the breaker's `_alt`.
* **New check:** the editor's save commits and the stale apply gets 40001. On c3bb10de it gets 40P01.
* The migration header now names the line lock in the lock order (n-f).
* **N13 (Minor), closed in round 5:** the breaker found the rolled-back line edit case now waits and commits; 55P03 remains only where a line writer already waits behind the apply's own transaction (there waiting would deadlock). Correction (breaker N14): `api/src/busy.ts` only labels 40P01 and 55P03 as "Busy, try again" for X2b's bulk apply; nothing retries them, and no money writer uses it. The route that applies credit must answer 55P03 itself.
* Build notes for round 3 said "with the lock always taken, it gets 40P01". That holds for a waiting lock; with NOWAIT and no guard it gets 55P03. Both fail the check.
* `check_fo7ts_money_settings.ts` 106/0.

## Round 5 on b5202cc1: Reviewer Approve, Breaker pass; three notes folded in before the PR
* **n-f:** the migration's first lock-order line now names the draft line lock.
* **n-g:** a REPEATABLE READ copy of the M3 check. The apply is refused at once (55P03) and the line save then commits. Without NOWAIT it would deadlock.
* **N14:** the `busy.ts` line above is corrected.
* **Seen by the breaker, not counted:** credit applied to two drafts in one transaction can deadlock with an editor saving the same two drafts in the opposite order. It happens the same way without this row, and no route touches two invoices yet. This is for the Apply-credit route row.

## Before the PR: FO-7lk (#2175) merged (02:25 UTC 19 Nov)
* `origin/main` is merged in (P-270). The stamp `20261118220000_fo7ts_ledgers` is already later than `main`'s newest, `20261118210000_fo7lk_trust_lock` (P-600).
* Checks on the merge: `check_fo7ts_money_settings.ts` 107/0, `check_fo7lk_lock_order.ts` 16/0, `check_fo7a2_ledger_rules.ts` 35/0, `check_fo7a_money_schema.ts` 122/0, `check_fo7mv_move_list.ts` 45/0, `check_prisma_schema.ts` 8/0.

## queue-fresh re-merge (P-721), 19 Nov ~07:2x UTC
* `queue-fresh` failed on 7ea0132d because `main` merged #2103, which has a migration, after `ci` started. Merged `origin/main` once.
* `main` now has two migrations stamped after this row: `20261118230000_csk1_case_client` and `20261119031000_fo3a_hour_sets`. The tech lead asked for no re-stamp (Lead 91, P-423 read: this row's `money_trust_entry_write` is the last text applied). Neither migration mentions money, invoices or trust.
* Checks on the merge: `check_fo7ts_money_settings.ts` 107/0, `check_fo7lk_lock_order.ts` 16/0, `check_fo7a2_ledger_rules.ts` 35/0, `check_fo7a_money_schema.ts` 122/0, `check_fo7mv_move_list.ts` 45/0, `check_prisma_schema.ts` 8/0.
* **module-cards (P-712, from the merge):** a card's `Tables.` line is now frozen. This row's n5 hand-edit (adding `moneyCreditEntry`) is undone, and the table goes in the row fragment `api/src/client-money/MODULE.rows/FO-7ts-2.md` (`Tables: moneyCreditEntry`). `module-cards.py tree` and `pr` (BASE `origin/main`) both pass.
* **Re-stamp (Lead 92, 13:0x IST, P-600):** the migration folder is renamed from `20261118220000_fo7ts_ledgers` to `20261119080000_fo7ts_ledgers`, later than #2000's `20261119071700`, which is queued ahead (`main`'s newest is `20261119031000`). The SQL and the rollback are unchanged; only the test's `NEW2` and the rollback's header path change. Checks with the new stamp: `check_fo7ts_money_settings.ts` 107/0, `check_fo7lk_lock_order.ts` 16/0, `check_fo7a2_ledger_rules.ts` 35/0, `check_fo7a_money_schema.ts` 122/0, `check_fo7mv_move_list.ts` 45/0, `check_prisma_schema.ts` 8/0.
