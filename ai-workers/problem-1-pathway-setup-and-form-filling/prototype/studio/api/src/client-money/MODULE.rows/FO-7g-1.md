Entry points: `GET /api/front-office/money/tax-default?partyKind=&partyId=` (FO-7g part 1; key `agent/invoice:create`; read only); `tax/canada-gst-hst.ts` `PROVINCE_TAX_RATES` (13 cited GST/HST rates, ppm) and `tableProblems`; `tax/defaults.ts` `taxDefault`, `lineRatePpm`.
Tests: tests/check_fo7g_tax_defaults.ts
