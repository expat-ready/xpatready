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
* (after the re-stamp to `20261118220000`, on FO-7lk 19d39511d) `check_fo7ts_money_settings.ts` 87/0 · `check_fo7lk_lock_order.ts` 16/0 (unchanged) · `check_fo7a2_ledger_rules.ts` 35/0 · `check_fo7a_money_schema.ts` 122/0 (unchanged) · `check_fo7mv_move_list.ts` 45/0 · `check_prisma_schema.ts` 8/0.
* No live AI, no Stripe, US$0. No screen, no route.
