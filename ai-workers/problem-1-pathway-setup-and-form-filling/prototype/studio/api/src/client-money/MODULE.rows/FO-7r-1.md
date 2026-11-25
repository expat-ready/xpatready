Entry points: FO-7r part 1 (R1.111): GET /api/front-office/money/parties/:kind/:id/summary (`reports/summary.ts` `MoneySummary`) and GET …/parties/:kind/:id/statement?from=&to=&caseId=&pageSize=&after= (`reports/statement.ts` `MoneyStatement`), agent/invoice:show, C5 party scope (404 outside it), registered by `features/client-money-reports.ts`; reads only.
Tests: `tests/check_fo7r_statement.ts`.
