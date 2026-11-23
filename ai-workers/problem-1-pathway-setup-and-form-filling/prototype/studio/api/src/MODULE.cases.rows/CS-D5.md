Entry points: CS-D5 part 1 (R1.68): `POST /api/runtime/documents/:id/preview-link` and `GET /api/runtime/document-previews/:token` (`case-documents-preview.ts`, the pure signer `case-preview-links.ts`, `features/case-documents-preview.ts`): a single-use 300 s nameless link, the download's four headers, one "previewed" audit line per opening; the reach is `CaseDocuments.reachDocument`, shared with the download.
Tables: CS-D5 part 1: caseDocument (read), auditEvent ("previewed").
Tests: CS-D5 part 1: `tests/check_csd5_preview.ts`.
