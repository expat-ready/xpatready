Entry points: `port.ts` `ClientMoney.hasMoney` (ClientMoneyPort) is also true for a party with a tax treatment row (money_party_tax_treatment) or named as the payee of a trust entry (payee_person_id / payee_company_id), so FO-9b part 2 never merges such a party by itself (P-574 (2))
Tables: money_party_tax_treatment (read), money_trust_entry (read)
Tests: tests/check_fo9b_review.ts
