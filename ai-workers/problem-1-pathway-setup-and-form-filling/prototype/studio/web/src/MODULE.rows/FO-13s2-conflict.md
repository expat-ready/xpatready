Entry points: FO-13s part 2: `modules/front-office/compliance/conflict/` (`ConflictCheckPanel` on the prospect page, `ConvertConflictNote` in its Convert dialog, `useConflictList`); the status is FO-13c's `clearance`, never worked out here
Tests: tests/check_fo13s_conflict_browser.ts, tests/journeys/j_108.ts
Entry points: FO-13s part 2 PR B: route `/front-office/conflict-checks/:id` (`ConflictConfirmPage`, a manager confirms a check with hidden matches; the server decides who may)
