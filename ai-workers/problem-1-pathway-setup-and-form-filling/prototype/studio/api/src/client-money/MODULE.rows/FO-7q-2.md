Entry points: `Refunds.standing` (`invoices/refunds.ts`, read only: what the refund and extra routes would take now); `PAYMENT_ACTIONS` / `paymentActions` (`reads/actions.ts`: REFUND, KEEP_AS_CREDIT, REFUND_EXTRA) on the invoice detail's payments and GET …/payments/:id.
Tests: `tests/check_fo7q_reads.ts` (part 2 cases).
