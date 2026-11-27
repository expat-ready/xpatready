Entry points: PF-10b part 1: `/api/platform/imports`: `GET targets`, `GET|POST attestation` (Owner), `GET` (batches), `POST` (a text/csv upload; `?target=&source=`), `GET :id`, `GET :id/rows`, `POST :id/dry-run`, `POST :id/run`, `GET origin/:kind/:id`; `IMPORT_TARGETS` (ports/import-target.ts `ImportTargets`: areas register targets), `ImportService`.
Tests: tests/check_pf10b_import_engine.ts
