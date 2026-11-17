---
paths:
  - "ai-workers/problem-1-pathway-setup-and-form-filling/prototype/studio/api/src/client-money/**"
---
# Module card: api-client-money (P-615)
The firm's client money: invoices, payments, refunds, receipts, the trust ledger, write-offs and the "To move" list (contracts §8; nothing outside this module writes `money_*`, other modules ask `ClientMoneyPort`). Read this before editing these files; update it in the same PR when an entry point, invariant, table or test below changes (or say `Card unchanged: <reason>` in the PR body).

**Purpose.** No code here yet: FO-7a, FO-7mv and FO-7a2 put the tables and their rules in the database (`prisma/schema/client-money.prisma` and their migrations). The routes come with FO-7b (invoices, payments), FO-7t (trust, the To move list's routes), FO-7r (write-offs) and FO-7c (card).
**Owner area.** client money, rows FO-7* (Lead B, contracts §8).
**Entry points.** None yet (no route). The database's views: `money_to_move` (FO-7mv) and `money_trust_shortfall` (FO-7a2), both `security_invoker`.

**Invariants (set by).**
- Amounts are integers in minor units with their currency; CAD and USD are never added (FO-7a).
- Ledger rows are insert-only; a mistake is a new row (FO-7a).
- Money leaves trust only by a withdrawal to an issued invoice or a refund to the client (P-603, FO-7a); moves out of trust never exceed what the ledger took out (FO-7mv: B-18, B-19).
- A reversal may go below zero, shown: a correction of a deposit with kind `RETURNED`, `RECORDED_BY_MISTAKE`, `WRONG_CLIENT` or `OTHER` is always recorded and the shortfall is listed in `money_trust_shortfall`; every other outflow stops at the ledger balance, "Only CAD x is available." (FO-7a2; AG-6-75 rule 4, AG-6-60 rule 7, AG-6-68 rule 8).
- Trust-paid money returns to trust or the client, never stays in operating: a credit note on a trust-paid, unmoved part needs its `RETURN` first, and trust paid counts as settled for credit notes and write-offs (FO-7a2; AG-6-48 rule 4, P-634).
- Every table is behind PF-12's walls; every trigger function runs as `xr_wall_reader` (PF-12).

**Tables.** moneyPaymentSettings, moneyPaymentAccount, moneyNumberSeries, moneyInvoice, moneyInvoiceLine, moneyCreditNote, moneyPayment, moneyRefund, moneyReceipt, moneyTrustRequest, moneyTrustEntry, moneyWriteOff, moneyMoveBatch, moneyMoveLine.
**Tests.** `tests/check_fo7a_money_schema.ts`, `tests/check_fo7mv_move_list.ts`, `tests/check_fo7a2_ledger_rules.ts`, `tests/check_pf12_walls.ts`.

**Do not.**
- Write a `money_*` table from outside this module.
- Hide a shortfall by refusing a reversal.
- Keep trust-paid money in operating after its invoice is credited.
