Entry points: no route of its own: `CaseFinder` (search/case-finder.ts) registers as "case" on the one find door (`GET /api/platform/find`, PF-30a); `CasePartySearch.search` (search/party-search.ts) is `PartySearchPort`'s real adapter; `caseScope` (case-access.ts) is the one rule for which cases a staff member sees (CS-S1 part 2).
Tests: tests/check_css1_search.ts
