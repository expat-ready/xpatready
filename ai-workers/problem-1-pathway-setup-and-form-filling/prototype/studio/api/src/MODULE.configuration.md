---
paths:
  - "ai-workers/problem-1-pathway-setup-and-form-filling/prototype/studio/api/src/{structure,programs,lifecycle,start-setup,workspace,eligibility,rule-facts,worked-out,question-condition,background-questions,section-background,section-names,own-question,own-yes-no,official-pages,source-register,fact-sources,guide-sources,person-checklist,checklist}.ts"
  - "ai-workers/problem-1-pathway-setup-and-form-filling/prototype/studio/api/src/configurator/eligibility.door.ts"
---
# Module card: api-configuration (P-615)
Program structure, combinations and their setup: rules, questions, sources, checklists. Read this before editing these files; update it in the same PR when an entry point, invariant, table or test below changes (or say `Card unchanged: <reason>` in the PR body).

**Purpose.** `structure.ts` and `programs.ts` hold the Pathway › Program › Category › Sub-category tree and the combination catalogue (Screen 01); `lifecycle.ts` the one guard for remove, retire and restore; `start-setup.ts` a new combination's setup; `eligibility.ts`, `rule-facts.ts`, `worked-out.ts`, `question-condition.ts` the rules and the facts they read; `own-question.ts`/`own-yes-no.ts` questions taken from a form's own words; `source-register.ts`, `fact-sources.ts`, `official-pages.ts` where each value comes from; `checklist.ts` the checklist reading; `configurator/eligibility.door.ts` the adapter of `EligibilityPort` (`ports/eligibility.port.ts`), over the pure rules in `engine/eligibility/` (AS-1m).
**Owner area.** screens lane (Unconfirmed: no lane map in code).
**Entry points.** `GET /api/structure`, `POST /api/structure/name-check`, `POST /api/combinations/start`, `GET|PUT /api/combinations/:id/eligibility-gates`, `GET /api/combinations/:id/rule-facts`, `GET /api/combinations/:id/sources`, `GET /api/combinations/:id/fact-sources`, `GET /api/combinations/:id/official-pages`, `GET /api/combinations/:id/checklist`.

**Invariants (set by).**
- Remove, retire and restore follow the lifecycle rules L1–L6 on every master, with a where-used list first; an author's own never-released unused draft is deleted at once, with Undo (P-116, P-52).
- Every write checks the person's duty on the server; requests are parsed by the shared zod contracts (`contracts/`).
- One release for everything in the shared draft (P-23).
- A question's words are the form's printed words, quoted, never typed (P-170, B86, B116).
- Checklist lines enter the one review queue; an identity document is read by its coded lines, never AI vision (P-149, P-134).
- A fact a rule reads and the library lacks is worked out from library dates where it can be (B102), or proposed with its line (B82).
- A form's role applies only when a second person approves (P-319).
- A reason is kept only for the case officer on a fact that is not their own (P-155 (3)).
- `engine/eligibility/` never reaches `engine/runtime/`; new callers reach the rules through `EligibilityPort` (`assessments.ts` imports them directly until CS-106c) (contract v0.1 §2.6, AS-1m).

**Tables.** libraryChange, combination, canonicalField, programDef, factSource, govFormDef, draftingJob, proposalItem, formFieldMap, sourceEntry, logicalSection, derivedField, auditEvent.
**Tests.** `tests/check_b102_worked_out.ts`, `tests/check_b52_own_yes_no.ts`, `tests/check_b78_section_names.ts`, `tests/check_b124_rests_on.ts`, `tests/check_sh3_resolver.ts`, `tests/check_as1m_eligibility_move.ts`.
**Row lists (P-712).** Never hand-edit this card's frozen `Tests.`, `Tables.` or `Entry points.` line: put your row's items in `MODULE.configuration.rows/<ROW>.md` next to it (one file per row; `module-cards.py` fails the PR otherwise).

**Do not.**
- Hard-code a program, combination or form number (P-319).
- Delete or move a released node; retire it (P-116).
- Type a question or code a person could read from the form.
- Apply a checklist draft straight to the draft (the old door, P-149).
