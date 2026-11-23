Entry points: behind PF-4's guard, `GET|POST cases/:id/milestones` and `POST cases/:id/milestones/:mid/cancel` (`features/case-milestones.ts`, keys `agent/case:show` / `agent/case:edit`: a case's government steps, CS-DL3 part 1); job `case_deadlines.milestone_reminder` (`case-deadlines/reminders.ts`); `GET cases/:id/stages` adds `milestones` (open steps with a due date).
Tables: caseMilestone (insert-only apart from cancelling; its triggers refuse any other change).
Tests: tests/check_csdl3_milestones.ts
