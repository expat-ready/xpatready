Entry points: FO-7r part 2 (R1.111): GET /api/front-office/money/parties/:kind/:id/statement.pdf (agent/invoice:show) and POST …/parties/:kind/:id/statement/send (agent/invoice:issue; `reports/send.ts` `StatementSend`, `reports/statement-document.ts` the "Your statement" text and PDF, audit line statement.sent); reads only, no money_* write.
Tests: `tests/check_fo7r_statement_send.ts`.
