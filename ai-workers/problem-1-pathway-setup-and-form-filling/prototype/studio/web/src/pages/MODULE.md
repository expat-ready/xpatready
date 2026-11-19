---
paths:
  - "ai-workers/problem-1-pathway-setup-and-form-filling/prototype/studio/web/src/pages/**"
---
# Module card: web-pages (P-615)
The configuration studio's pages: programs, combinations and their workspace, library, review, release, AI runs. Read this before editing these files; update it in the same PR when an entry point, invariant, table or test below changes (or say `Card unchanged: <reason>` in the PR body).

**Purpose.** `programs.tsx`, `structure.tsx`, `start.tsx` the catalogue and start page; `combination.tsx` and `workspace/` one combination (overview, forms, questionnaires, documents, sources, finder, preview); `library*.tsx` the shared library; `review*.tsx`, `to-review.tsx`, `proposals.tsx` the review queue; `release.tsx`, `history.tsx`; `ai.tsx`, `job.tsx` AI runs and jobs; `sign-in.tsx`.
**Owner area.** screens and forms lanes (Unconfirmed: no lane map in code).
**Entry points.** routes in `App.tsx`: `/`, `/start`, `/structure`, `/c/:id`, `/c/:id/:tab`, `/c/:id/jobs/:jobId`, `/library/*`, `/review/*`, `/release`, `/releases`, `/ai`, `/ai/:batchId`, `/activity`, `/sign-in`.

**Invariants (set by).**
- Remove, retire and delete follow the lifecycle; a person approves retire and delete (P-116).
- A list row's source and a field's format are never blank; why there is none is said (P-158, P-162).
- A rename stays direct and logged unless P-266 needs a second person; Merge always waits for a second person (P-266, P-65).
- Only High exact reuse matches are accepted together, and one Undo takes the batch back (P-121).
- What a form field's box says is read from the form, never the AI (P-162).
- Where a combination sits is read-only here, in the Trail's level colours (P-125 (3)).
- The Overview only reports; it has no button (P-118 Q5).
- Proposals are decided one by one on To review (P-149 one door).

**Tables.** none directly (web).
**Tests.** `tests/check_bk4a.ts`, `tests/check_gcore_b2_door.ts`, `tests/check_c316_field_scope.ts`, `tests/check_c46_preview_channels_browser.cjs`, `tests/check_forms_s4_library_browser.cjs`, `tests/check_bk5_start_browser.cjs`.
**Row lists (P-712).** Never hand-edit this card's frozen `Tests.`, `Tables.` or `Entry points.` line: put your row's items in `MODULE.rows/<ROW>.md` next to it (one file per row; `module-cards.py` fails the PR otherwise).

**Do not.**
- Add a route outside `App.tsx` or `modules/` (README there).
- Show an AI reading as the form's own words.
- Leave a source or format cell blank.
