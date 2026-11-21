Entry points: FO-13c (compliance/conflict/): POST conflict-checks/preview, POST conflict-checks (requestId, prospectId, result, disclosureText), POST conflict-checks/:id/confirm (key agent/conflict:check); GET prospects/:id/conflict-checks (key agent/prospect:show); gate.ts `clearance` refuses Send, Signed offline and every win (`winProspect`) without a clearing check (409 CONFLICT_*); placeholder {conflict.disclosure}
Tables: foConflictCheck
Tests: tests/check_fo13c_conflict.ts
