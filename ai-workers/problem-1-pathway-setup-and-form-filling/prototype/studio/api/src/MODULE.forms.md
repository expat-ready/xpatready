---
paths:
  - "ai-workers/problem-1-pathway-setup-and-form-filling/prototype/studio/api/src/{form-*,forms,fill,fill-trials,field-*,draft-*,pqr-drafts,answer-*,lines-bulk,screen02,who-fills,edition-published,impact}.ts"
---
# Module card: api-forms (P-615)
Official forms in the library: editions, form fields and their maps, drafted masters, conditions, filling. Read this before editing these files; update it in the same PR when an entry point, invariant, table or test below changes (or say `Card unchanged: <reason>` in the PR body).

**Purpose.** `forms.ts` and `form-library.ts` hold form editions, upload and find; `screen02.ts` the form fields of an edition and their decisions; `field-drafts*.ts`, `form-masters.ts`, `draft-qd.ts`, `pqr-drafts.ts` the drafted fields, questions, documents and pre-qualification picks; `form-field-condition.ts`/`form-field-gates.ts` conditions on form fields; `impact.ts` a new edition against the library's (no AI); `fill.ts` the shared filler; `lines-bulk.ts` bulk line changes.
**Owner area.** forms lane (Unconfirmed: no lane map in code).
**Entry points.** `POST /api/library/forms/upload`, `GET /api/library/forms/:code/editions`, `GET /api/editions/:id/form-fields`, `POST /api/library/forms/:code/draft-fields`, `POST /api/combinations/:id/draft-qd`, `GET /api/combinations/:id/form-field-conditions`, `GET /api/combinations/:id/forms/:code/progress`, `POST /api/lines/bulk`, `GET|PUT /api/library/fields/:key/scope`; `writeForm` (fill.ts).

**Invariants (set by).**
- AI drafting of a form's masters starts only on a click; a saved draft replays at US$0 (P-138, P-120).
- Each reading that names a field quotes words printed on the form; codes and keys are never typed (P-170, P-34).
- At most one waiting or approved change per form field (index `library_change_one_open`, B88 BR-7).
- A worked-out Yes/No is asked only as "X is Yes", X a Yes/No field of the same group (B88 BR-1).
- The edition in use is the newest mapped PDF edition, never the oldest (P-32); a new edition is compared field by field (P-32, P-38).
- A Not needed line is never filled; an Online line is filled only as "Copy, not for filing" (C-4, P-145); a copy is never overwritten (P-65).
- Live runs only with the server's live switch open; each Live step states its worst case first (P-227).
- Fill trials name no pathway and no form (P-319, P-452).

**Tables.** libraryChange, draftingJob, combination, canonicalField, combinationForm, formFieldMap, govFormDef, formEdition, aiBatch, answerList, documentRequirement, proposalItem, sectionQuestion.
**Tests.** `tests/check_c1113_draft_fields.ts`, `tests/check_forms_c411_draft_qd.ts`, `tests/check_forms_b88_fill.ts`, `tests/check_b107_form_field_gates.ts`, `tests/check_b84_fill_intact.ts`, `tests/check_forms_pdf_hardening.ts`.
**Row lists (P-712).** Never hand-edit this card's frozen `Tests.`, `Tables.` or `Entry points.` line: put your row's items in `MODULE.forms.rows/<ROW>.md` next to it (one file per row; `module-cards.py` fails the PR otherwise).

**Do not.**
- Write a form value outside `fill.ts`'s writer, or type a signature.
- Draft with AI without the person's click, or with live AI off.
- Open a second change on a form field that has one waiting.
- Name a form or combination number in code (P-319).
