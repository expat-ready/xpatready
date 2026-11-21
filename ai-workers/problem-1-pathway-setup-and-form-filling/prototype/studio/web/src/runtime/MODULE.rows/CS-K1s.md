Entry points: routes `/clients` and `/clients/:id` (`clients.tsx` `ClientsApp`, App.tsx; CS-K1s), and the case area's "Clients" menu entry (`CaseAreaNav`), all through `staffApi`, the firm staff sign-in, never the simulated person.
Tests: tests/check_csk1s_clients_browser.ts (no code marks: check-module-cards.sh copies no tests/ into its fixture tree).
