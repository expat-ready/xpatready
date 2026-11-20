Entry points: `/api/front-office/money/invoices` (FO-7b part 1a): `POST` (a draft), `POST :id/lines` (a line; tax by `invoices/tax-round.ts` `taxForLine`, per line, half to even), `GET :id`; `InvoiceDrafts` (shared shapes in ports/client-money.ts).
Tests: tests/check_fo7b_invoices.ts tests/journeys/j_59.ts
