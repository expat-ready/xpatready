# PF-21rs A1 — build notes (R1.86; concept r2 §7 Q1: R0, then A1, A2, B)

**What A1 builds** (concept §4 "Breaches", board §1-§2, challenge M5's A1 line): the console menu's "Privacy" group (Breaches only; Requests to us and Legal holds come with part B), the Breaches list `/system/privacy/breaches`, and "Record a breach" (one dialog; the same fields serve Edit and Confirm a draft on the breach's page in A2). `systemApi` takes a create's own header (challenge m3).

**Not in A1:** the breach's own page `/system/privacy/breaches/:id` (decide, notices with their words, history, Edit, Confirm a draft) is A2: the list's rows are not links yet, and after "Record the breach" the list shows "Recorded. Next: decide whether firms are told." (the board's "the breach's page opens" lands with A2). Requests and holds are B.

**Files** (`prototype/studio/`): `web/src/modules/system/privacy/{contract.ts, breaches-page.tsx, record-breach.tsx}`; `web/src/modules/system/{frame.tsx (menu groups), routes.tsx (one route), session.ts (headers)}`; `tests/check_pf21rs_browser.ts`; `web/src/MODULE.rows/PF-21rs-A1.md`.

**Rules and where they live** (every one is the API's; the page shows it):
* BR-1: only "Discovered at" and "What happened" are needed; firms empty = "Under investigation".
* BR-4: no delete anywhere; the lead line says "kept 7 years; never deleted" (no computed end date, m4).
* BR-7, m2: the reason is the guard's (`@SystemReason`), never pre-filled; a missing one is the guard's 422 `fields.reason` (R1.10 A4, #3487), shown under the field with the route's other field errors.
* BR-8: without `system/breach:read` the API's 403 words, no table; the Auditor (read only) sees no "Record a breach" and the line "Read only: you hold system/breach:read."
* m5: status calculated in `privacy/contract.ts` `statusOf` (Draft · Decision owed · Firms to be named · Notices owed · Recorded), word + shape.
* m7: the firm picker searches `GET /api/system/firms?q=` only after 300 ms and 2+ letters (each call writes one cross-firm read line).
* STANDARDS §4: one Idempotency-Key per opening of the dialog: a double click or a retry of the same body records once.

**Judgment calls:** "Discovered at" starts at the current minute (record the moment it is known; the person changes it when earlier); the field errors go with the field the person changes; the focus moves to the first refused field after a refusal and back to the firm search box after "Add"/"Remove".

**Checks:** `tests/check_pf21rs_browser.ts` 22/22 twice on a fresh isolated copy (P, A1-1, A1-2, W5 (a)-(c), W6). j_86 on its own copy: 25/28 (W1 and W9 now pass; W6 is A2's page; W10 waits on AUD-3, R1.87).
