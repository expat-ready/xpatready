Entry points: `TrustController` (`trust/routes.ts`, FO-7t part 2): `POST /api/front-office/money/trust/applications` (Pay from trust, agent/invoice:issue) and `POST …/trust/refunds` (refund to the client, agent/refund:create); `applyTrust(tx, audit, …)` and `refundTrust(tx, audit, …)` (`trust/money-out.ts`), `applyTrust` also called by FO-7b's issue step (`?payFromTrustMinor=`); events `TRUST_EVENT.TRUST_APPLIED`, `TRUST_EVENT.TRUST_REFUNDED`.
Tables: moneyTrustEntry, moneyInvoice, moduleEvent
Tests: tests/check_fo7t_money_out.ts
