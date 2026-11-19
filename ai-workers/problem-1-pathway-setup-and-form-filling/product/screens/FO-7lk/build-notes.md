# FO-7lk build notes — one lock order for "Move back to trust"

Brief: `product/design/build-lead-c-briefs/FO-7lk.md` (on `claude/build-lead-c-647b40` at a7014c0bb). Branched from #2106's head 8a34b34e5 (overlapped chain, Lead 81); merged #2106's finished head facc5231 in on Lead 82's order (23:4x IST). Builder: cloud lane, 18 Nov.

## What changed
* One migration, functions only: `prisma/migrations/20261118210000_fo7lk_trust_lock/migration.sql` (stamp to be re-stamped later than `main`'s newest before the PR opens, P-600).
  * New `money_trust_lock(firm, party, currency)` (`CREATE OR REPLACE`; currency typed `"MoneyCurrency"`, not `text` as the brief wrote, so a wrong value is refused rather than locking a different key): the only place the key `'money_trust:' || firm || ':' || party || ':' || currency` is written.
  * The four call sites moved to it: `money_issued_invoice` (FO-7a), `money_trust_entry_write`, `money_move_batch_owed_back`, `money_move_line_write` (FO-7a2). Each is its earlier text with only the lock line changed; the test proves it by turning the helper call back into the inline key and comparing with the database before FO-7lk.
  * `money_credit_note_write`: for `OVERPAID_TO_TRUST` naming a withdrawal to this invoice, reads its party and currency and takes its lock before `money_issued_invoice` touches the invoice row. An entry the checks refuse takes no lock (round 1 Minor / B-1).
* `rollback.sql` in the same folder (Prisma reads only `migration.sql`): restores the five functions' text exactly and drops the helper; the test applies it and compares every public function with the database before FO-7lk.
* `api/src/client-money/MODULE.md`: one invariant line.
* `tests/check_fo7lk_lock_order.ts`: 15 checks.

## Challenge (evidence, for the tech lead): the deadlock was already closed on #1991
* Before FO-7lk, "Move back to trust" already took the party lock before the invoice row: `money_credit_note_write` calls `money_issued_invoice` first, and `money_issued_invoice` takes the **invoice party's** lock before its `UPDATE money_invoice` (FO-7a review round 3, break B-14). A move-back's withdrawal is always of the invoice's party and currency (FO-7a2's withdrawal check), so it is the same key the trust entry later takes.
* Measured: with a gate connection holding the party lock and both writers seen waiting (the barrier), #1991's text (rollback applied) gave **0 deadlocks in 40 runs** (20 each order). A planted writer that touches the invoice row first gave **20 of 20** 40P01 in the "withdrawal first" order, so the harness does see a deadlock when there is one.
* So the brief's planted fail ("at least one 40P01 in 20 runs on #1991's text") cannot be shown; as the brief says, it is reported with the run count and not counted as proof. FO-7lk's value is the single key (the helper part 2 needs) and the explicit order in the credit note.
* "Neither" as worded ("an `OVERPAID_REFUND` credit note and a plain credit note take no party lock") is not true on `main` either: both take the invoice party's lock inside `money_issued_invoice`. The test asserts instead that they hold exactly the advisory locks they held before FO-7lk (no new lock, no new wait).

## Checks run (this branch, cloud, PostgreSQL 18.3)
* `check_fo7lk_lock_order.ts` 15/0 · `check_fo7a2_ledger_rules.ts` 35/0 · `check_fo7a_money_schema.ts` 122/0 · `check_fo7mv_move_list.ts` 45/0 · `check_fo7ts_money_settings.ts` 44/0 · `check_pf12_walls.ts` 100/0 · `check_prisma_schema.ts` 8/0; `prisma migrate deploy` applies cleanly with `rollback.sql` in the folder.
* No live AI, no Stripe, US$0. No screen.

## Round 1 (reviewer Approve 9f30e673, breaker pass 9f30e673) and the fixes after it
* **Minor / B-1 (both):** the early lock was taken for whatever entry the credit note named, before the check that it is a withdrawal to this invoice; a refused move-back naming another party's withdrawal held that party's lock, a new two-party order (the breaker made a valid undo fail with 40P01 10 of 10 times). **Fixed:** the read takes only a withdrawal to this invoice; a new check proves a refused move-back holds no lock of the other party while it waits (it holds one on 9f30e673).
* **Nit:** the "#1991's text" line is now named a note, not a fail case: it checks only that the harness ran there.
* **Nit:** the new order is proven by the text checks (the function bodies, the one key) and by the B-1 check; it cannot be proven by a deadlock on #1991's text, which had none.
* **Nit:** the helper's currency type is noted above.
* The helper is now `CREATE OR REPLACE` (the money migrations' rule, FO-7ts DW10).
* After the merge of facc5231: `check_fo7lk_lock_order.ts` 16/0, `check_fo7a2_ledger_rules.ts` 35/0, `check_fo7a_money_schema.ts` 122/0, `check_fo7mv_move_list.ts` 45/0, `check_fo7ts_money_settings.ts` 46/0, `check_prisma_schema.ts` 8/0, `check_pf12_walls.ts` 100/0.

## After #2106's round 1 (1ed3d3af)
* #2106 re-stamped its two steps to `20261118200000` and `20261118200100`, so FO-7lk is re-stamped after them, to `20261118210000_fo7lk_trust_lock` (P-600). It will be re-stamped again on top of `main` when its PR opens.
* Merged 1ed3d3af. Results: `check_fo7lk_lock_order.ts` 16/0, `check_fo7ts_money_settings.ts` 47/0, `check_fo7a2_ledger_rules.ts` 35/0, `check_fo7a_money_schema.ts` 122/0, `check_fo7mv_move_list.ts` 45/0, `check_prisma_schema.ts` 8/0, `check_pf12_walls.ts` 100/0.

## Before the PR: #2106 merged (22:26 UTC 18 Nov)
* Merged `origin/main` (P-270). The stamp `20261118210000_fo7lk_trust_lock` is already later than `main`'s newest, `20261118200100_fo7ts_card_terminal_trust`, so no re-stamp was needed (P-600).
* Round 3 (diff-only on c5d1bccd): Reviewer Approve, nothing open. Round 2: Breaker pass on 19d39511d.
