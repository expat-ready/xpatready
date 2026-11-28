Entry points: behind PF-4's guard, `GET runtime/clients/:id/timeline?cursor=` (`case-notes/person-timeline.ts` `PersonTimeline`: a person's own notes, each of their cases' timelines through `CaseTimeline.pageAfter` (the same firm rule and caseScope), and their won prospect's lines once; newest first, 50 a page; `agent/case:show`) (CS-NT1t).
Tests: tests/check_csnt1t_person_timeline.ts.
