Entry points: `TrustController` (`trust/routes.ts`, FO-7t part 1): `/api/front-office/money/trust` answer (GET any staff, PUT Owner only), requests (create and send, cancel, read), deposits (with the TRUST receipt), ledger and balances (C5 through MoneyVisibilityPort); services `TrustMoney` (`trust/service.ts`) and `TrustReads` (`trust/reads.ts`); event `TRUST_EVENT.TRUST_DEPOSITED` (ports/events/client-money-trust.ts).
Tables: moneyPaymentSettings, moneyTrustRequest, moneyTrustEntry, moneyPayment, moneyReceipt, moduleEvent
Tests: tests/check_fo7t_trust.ts
