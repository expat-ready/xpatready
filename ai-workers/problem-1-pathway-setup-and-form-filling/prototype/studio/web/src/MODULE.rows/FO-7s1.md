Tests: `tests/check_fo7s1_invoices_browser.ts`
Entry points: FO-7s1 part 1: the Money area (`modules/client-money/`, `MONEY_AREA`), `/money/invoices` (invoice list over FO-7q's read, `agent/invoice:list`) and `/money/invoices/:id` (detail, actions only from `allowedActions`, "Use a credit note" on FO-7b's credit route)
