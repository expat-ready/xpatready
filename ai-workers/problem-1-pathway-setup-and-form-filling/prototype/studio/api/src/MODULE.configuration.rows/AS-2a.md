Tests: tests/check_as2a_cited_gates.ts (R1.107 AS-2a: cited gates and assessment-only releases; the routes on an isolated copy), tests/journeys/j_107.ts (R1.107's journey).
Entry points: `GET|PUT /api/combinations/:id/eligibility-gates` take a gate's `source` and `assessmentOnly` (AS-2a); `EligibilityPort` (`configurator/eligibility.door.ts`) returns `rules[]` and `assessment_only`.
