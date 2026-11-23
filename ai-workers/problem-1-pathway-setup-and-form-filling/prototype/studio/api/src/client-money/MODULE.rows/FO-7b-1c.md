Entry points: `/api/front-office/money/payments/:paymentId` (FO-7b part 1c): `POST refunds` (offline, `agent/refund:create`; a payment received into trust is refused), `POST extra` (the one choice on the waiting extra: `KEEP_AS_CREDIT` writes one `KEPT` credit entry, `REFUND` an offline refund); `Refunds` (`invoices/refunds.ts`).
Tests: tests/check_fo7b_refunds.ts
