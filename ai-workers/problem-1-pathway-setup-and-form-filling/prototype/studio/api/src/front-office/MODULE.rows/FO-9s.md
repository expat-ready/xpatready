Entry points: FO-9s part 1 (R1.29, break F2): `POST /api/front-office/duplicates/check` names, for each person it names, `lead`: the number of that person's newest lead the caller may open (the lead page's possible-match rule; null when none), additive in ports/matching.ts PersonMatch
Tests: tests/check_fo9s_duplicates_browser.ts
