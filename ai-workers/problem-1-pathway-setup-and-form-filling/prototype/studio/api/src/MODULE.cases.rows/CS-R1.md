Entry points: no route of its own: `CaseReports` (`case-reports.ts`, feature `features/case-reports.ts`) registers reports.cases.case_load, new_vs_closed, stage_durations and open_review_findings on PF-R1's MetricRegistry at start-up, answered by POST /api/platform/reports/query; every number bounded by `caseScope` (the viewer's case keys) and, at report scope own or under a person filter, that person's own cases (R1.79 part 1).
Tables: case, caseStage, caseClient, caseTeamMember, reviewFinding, combination, programDef, platformFirmSetting (read only).
Tests: tests/check_csr1_reports.ts
