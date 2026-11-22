Entry points: `reads/routes.ts`: GET /api/front-office/money/invoices (filters, keyset paging 50/200, status in SQL `reads/status-sql.ts`), GET …/invoices/:id/detail (allowedActions from the one table `reads/actions.ts`), GET …/payments, GET …/payments/:id; C5 scope `reads/visibility.ts` (fail closed until the case-visibility port).
Tests: `tests/check_fo7q_reads.ts`.
