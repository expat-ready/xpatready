---
paths:
  - "ai-workers/problem-1-pathway-setup-and-form-filling/prototype/studio/api/src/{demo,demo-*,sample-*,checkpoint-*,finished-story,forms-demo}.ts"
---
# Module card: api-demo (P-615)
Demo scaffolding: the configured checkpoint, the Sample case and the finished story. Read this before editing these files; update it in the same PR when an entry point, invariant, table or test below changes (or say `Card unchanged: <reason>` in the PR body).

**Purpose.** `demo.ts` loads and resets the demo workspace; `checkpoint-*.ts` the stage-one checkpoint and its words (its steps live in `features/checkpoint/`); `sample-case*.ts` and `sample-validated.ts` the Sample case and its validated copies; `finished-story.ts` the story to a filed case; `forms-demo.ts` the forms story.
**Owner area.** evidence and runtime lanes (Unconfirmed: no lane map in code).
**Entry points.** `POST /api/demo/reset-to-six`, `POST /api/demo/sample-case`, `POST /api/demo/checkpoints/finished-story`; `Demo.loadConfigured`.

**Invariants (set by).**
- Demo-only controls are scaffolding, never part of the product (P-35); every value is Sample, never AI, never a case answer (P-102).
- Nothing is released or labelled source-backed unless it is (P-322); a validated copy is recorded, never written directly (P-322).
- A Validate in Adobe counts only for a copy with the same facts (B99, P-349).
- A block is never passed: the filing waits, said in its own words (P-315).
- "No code change" for a new sample: data only, engine and API code untouched (P-449, P-452).
- The read-back is never simulated; it waits for a person (P-46, P-171).
- The audit trail is insert-only at the database: Reset deletes the demo workspace's Sample lines only inside its own transaction setting, never a platform line (AUD-1a, P-571 (1)).
- Reset and the configured load first make both Sample firms exist (PF-3's idempotent seed on the `platform.demo.reset` bypass use; never in a production configuration), then fill the cases' platform firm id (CS-W1).

**Tables.** combination, programDef, sourceAttachment, auditEvent, combinationForm, packVersion, configRelease, sampleProfile, sampleFact, formEdition; the reset also empties caseClient and caseClientCounter with the cases (CS-K1).
**Tests.** `tests/check_b104_checkpoint.ts`, `tests/check_b104_stage_one.ts`, `tests/check_bk12_sample_case.ts`, `tests/check_c102_story_validated_match.ts`, `tests/check_forms_demo.ts`, `tests/check_csw1_firm_id.ts`.
**Row lists (P-712).** Never hand-edit this card's frozen `Tests.`, `Tables.` or `Entry points.` line: put your row's items in `MODULE.demo.rows/<ROW>.md` next to it (one file per row; `module-cards.py` fails the PR otherwise).

**Do not.**
- Offer a demo control on a product screen, or treat Sample as a release.
- Call AI from a demo path.
- Add a sample by changing engine or API code.
