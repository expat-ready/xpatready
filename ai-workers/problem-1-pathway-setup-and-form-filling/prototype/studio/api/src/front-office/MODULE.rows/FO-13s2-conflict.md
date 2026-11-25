Entry points: FO-13s part 2: `GET prospects/:id/conflict-checks` also answers `clearance` (the gate's verdict; only its 409 caught) and each check's `checkedByName`, `confirmedByName`
Tests: tests/check_fo13c_conflict.ts (clearance and names, pass and fail)
Entry points: FO-13s part 2 PR B: `GET conflict-checks/:id/for-confirmation` also answers `checkedByName`
