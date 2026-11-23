---
paths:
  - "ai-workers/problem-1-pathway-setup-and-form-filling/prototype/studio/api/src/{library-*,document-providers,document-type-defaults,document-sets,document-supplies,document-type-names,document-values,must-verify,where-used,change-sets,rename-door,no-free-add}.ts"
---
# Module card: api-library (P-615)
The shared library: fields, sections, document types, and the one guarded change door for all of them. Read this before editing these files; update it in the same PR when an entry point, invariant, table or test below changes (or say `Card unchanged: <reason>` in the PR body).

**Purpose.** `library-changes.ts` is the versioned change (propose, second person decides, apply); `library-items*.ts` retire and delete; `change-sets.ts` and `rename-door.ts` the change-set door, rename and merge; `where-used.ts` what reads a shared item; `document-*.ts` document types, their sets, providers and supplied facts; `must-verify.ts` the "Must verify before filing" flag; `library-sources.ts` read-only rules and checks views.
**Owner area.** screens and forms lanes (Unconfirmed: no lane map in code).
**Entry points.** `POST /api/change-sets/check`, `POST /api/change-sets/:id/undo-rename`, `GET /api/library/fields/:key/uses`, `DELETE /api/library/fields/:key`, `GET /api/library/reuse/:kind`, `GET|POST /api/library/document-types/:key/sets|supplies|providers`, `GET|POST /api/library/fields/:key/must-verify`; `itemCombinations`, `usedInLabels` (where-used.ts).

**Invariants (set by).**
- One guarded change pattern for every reusable item, human or AI: Add, Edit or Retire (P-253).
- A second person decides, never the proposer; a corrected change goes back to a second person (P-53, P-193, B50).
- Every library item comes from a source; no free manual add (P-158, `no-free-add.ts`).
- A rename of a shared field a released combination uses needs a second person; other renames stay direct and logged (P-266).
- A released field is retired, not deleted; an author's own never-released unused draft is deleted at once, with Undo (P-116).
- New features call `where-used.ts`, never copy it; uses are named in words, never keys (P-258, B83).
- Must-verify is a yes/no flag on a field (P-242, P-237, B142).

**Tables.** libraryChange, canonicalField, documentType, logicalSection, documentRequirement, sectionQuestion, auditEvent, combination, changeSet, formFieldMap, answerList.
**Tests.** `tests/check_gcore_b2_door.ts`, `tests/check_c79_must_verify.ts`, `tests/check_s6_p149.ts`, `tests/check_sh2_where_used.ts`, `tests/check_c119_library_items.ts`.
**Row lists (P-712).** Never hand-edit this card's frozen `Tests.`, `Tables.` or `Entry points.` line: put your row's items in `MODULE.library.rows/<ROW>.md` next to it (one file per row; `module-cards.py` fails the PR otherwise).

**Do not.**
- Write a library row outside a LibraryChange, or let the proposer approve.
- Add a library item with no source.
- Copy where-used logic into a feature.
