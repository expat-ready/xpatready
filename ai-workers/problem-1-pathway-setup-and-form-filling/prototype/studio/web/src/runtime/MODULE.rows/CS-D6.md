Entry points: CS-D6 part 1 (R1.69): a document line's "File details…" (`checklist.tsx`) opens `document-reads.tsx`: the fingerprint (SHA-256) with Copy, "Check the file is unchanged" and "Read by" (holders of `agent/document:view-access-log` only), through `staffApi` to `/api/runtime/documents/:id/{reads,check-unchanged}`.
Tests: CS-D6 part 1: `tests/journeys/j_69.ts`.
