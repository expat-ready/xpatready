Entry points: `milestones.tsx` (Government steps on the case page, CS-DL3 part 2) reads, records and cancels a case's government steps through `staffApi`, the firm staff sign-in, never the simulated person.
Tests: tests/check_csdl3_milestones_browser.ts, tests/journeys/j_74.ts (no code marks: check-module-cards.sh copies no tests/ into its fixture tree).
Entry points: part 3 — `milestones.tsx` says who is reminded and where (`data-gov-reminded`: the case officer and the lead representative, on Home's Needs you, PF-18h); J-74 walks a government step's reminder to Needs you and on to the case.
