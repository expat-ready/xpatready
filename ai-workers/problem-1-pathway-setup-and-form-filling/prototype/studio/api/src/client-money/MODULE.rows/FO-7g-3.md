Entry points: FO-7g part 3: `PUT /api/front-office/money/invoices/:id/bill-to` (agent/invoice:edit); `invoices/bill-to.ts` `billToProvince(firm, party, stored)` reads the stored Bill-to province first (P-797).
Tables: FO-7g part 3: moneyInvoice.billToProvince (money_invoice.bill_to_province, one of the 13 codes or null; fixed at issue by money_invoice_bill_to_frozen).
Tests: FO-7g part 3: `tests/check_fo7g3_bill_to.ts`.
Entry points: FO-7g part 3 (j_56 W3): `GET /api/front-office/money/tax-default?partyKind=&partyId=&invoiceId=` reads that invoice's Bill-to province (an invoice of this firm billed to this party, else 404); `tax/defaults.ts` `taxDefault({ partyProvince })` gives source PARTY_PROVINCE.
