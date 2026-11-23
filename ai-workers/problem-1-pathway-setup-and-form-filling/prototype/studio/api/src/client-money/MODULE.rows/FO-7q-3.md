Entry points: FO-7q part 3: GET /api/front-office/money/parties?q= (`reads/parties.ts` `PartyReads.search`, agent/invoice:list; won people and companies only, C5 scope, each with its province); `labelsOf` adds billTo {kind, name} and caseLabel to the invoice list rows and detail.
Tests: `tests/check_fo7q_parties.ts`.
