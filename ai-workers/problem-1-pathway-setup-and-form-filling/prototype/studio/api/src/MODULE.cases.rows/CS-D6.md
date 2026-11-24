Entry points: CS-D6 part 1 (R1.69), behind PF-4's guard: `GET documents/:id/reads?before=` (`agent/document:view-access-log`; the trail's read lines for one document, newest first, 50 a page) and `POST documents/:id/check-unchanged` (`agent/document:show`; re-hash, one "checked unchanged" or "found changed" line) (`case-document-reads.ts`, `features/case-document-reads.ts`).
Tables: CS-D6 part 1: caseDocument (read), auditEvent (read by entity key; "checked unchanged", "found changed").
Tests: CS-D6 part 1: `tests/check_csd6_reads_keep.ts`, `tests/check_csd6_reads_browser.ts`.
