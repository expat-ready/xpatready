Entry points: `case-notes.tsx` `CaseNotesPanel` (Notes and timeline, directly under the case header, CS-NT1 part 4) calls the notes, history, timeline and people reads and the four note acts through `staffApi`, the firm staff sign-in, never the simulated person.
Tests: tests/check_csnt1d_panel_browser.cjs (no code marks: check-module-cards.sh copies no tests/ into its fixture tree).
