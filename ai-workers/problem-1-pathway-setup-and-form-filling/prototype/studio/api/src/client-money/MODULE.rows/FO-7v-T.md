Entry points: `ReversalController` (`reversals/routes.ts`, FO-7v part T): `GET /api/front-office/money/payments/:id/reverse-preview` and `POST …/payments/:id/reverse` (a trust deposit recorded by hand, agent/payment:record; P-694: may go below zero), `GET …/trust/shortfall` (`money_trust_shortfall`, agent/invoice:show); `planReversal(tx, firmId, paymentId)` (`reversals/reverse.ts`); event `REVERSAL_EVENT.PAYMENT_REVERSED`.
Tables: moneyTrustEntry, moneyPayment, moduleEvent
Tests: tests/check_fo7v_reversals.ts
