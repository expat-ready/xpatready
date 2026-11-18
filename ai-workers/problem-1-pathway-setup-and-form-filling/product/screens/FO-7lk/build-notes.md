# FO-7lk build notes — one lock order for "Move back to trust"

Brief: `product/design/build-lead-c-briefs/FO-7lk.md` (on `claude/build-lead-c-647b40` at a7014c0bb). Branched from #2106's head 8a34b34e5 (overlapped chain, Lead 81). Builder: cloud lane, 18 Nov.

## What changed
* One migration, functions only: `prisma/migrations/20261118180000_fo7lk_trust_lock/migration.sql` (stamp to be re-stamped later than `main`'s newest before the PR opens, P-600).
  * New `money_trust_lock(firm, party, currency)`: the only place the key `'money_trust:' || firm || ':' || party || ':' || currency` is written.
  * The four call sites moved to it: `money_issued_invoice` (FO-7a), `money_trust_entry_write`, `money_move_batch_owed_back`, `money_move_line_write` (FO-7a2). Each is its earlier text with only the lock line changed; the test proves it by turning the helper call back into the inline key and comparing with the database before FO-7lk.
  * `money_credit_note_write`: for `OVERPAID_TO_TRUST`, reads the withdrawal's party and currency and takes its lock before `money_issued_invoice` touches the invoice row.
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
