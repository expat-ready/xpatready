Entry points: FO-7g part 1w: `invoices/bill-to.ts` `billToProvince(firm, party)` (P-797; the firm's province until part 3); `POST /api/front-office/money/invoices/:id/lines` takes its rate from `taxDefault` through `lineRatePpm` (a sent rate is 0 or the default, else 422).
Tests: tests/check_fo7g_tax_defaults.ts tests/check_fo7b_invoices.ts tests/journeys/j_59.ts
