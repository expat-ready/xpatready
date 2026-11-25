---
paths:
  - "ai-workers/problem-1-pathway-setup-and-form-filling/prototype/studio/api/src/{ai,cost-gate,people-ai,impact-ai,finder,finder-cost,runs,run-words,plain-run-text,rounds,upload-run,intake,sources,saved-readings,proposals,review-proposals,review-queue}.ts"
---
# Module card: api-ai-runs (P-615)
AI steps, their runs and costs, the one form intake and the one review queue. Read this before editing these files; update it in the same PR when an entry point, invariant, table or test below changes (or say `Card unchanged: <reason>` in the PR body).

**Purpose.** `rounds.ts` is the one step runner for every AI step (draft round + independent checker round, or a replay of the newest saved real run); `ai.ts` the field-map draft; `finder.ts` the form finder (canada.ca page, guide, forms named); `intake.ts` the one door for every uploaded file; `proposals.ts` the one door into the review queue; `cost-gate.ts` the cost limits; `runs.ts` the run list and Stop.
**Owner area.** forms and screens lanes (Unconfirmed: no lane map in code).
**Entry points.** `GET /api/runs`, `GET /api/runs/:id`, `POST /api/runs/:id/stop`, `GET /api/review-queue`, `GET /api/review/proposals`, `POST /api/review/proposals/decide`, `POST /api/review/proposals/undo/:batch`; `insertProposals` (proposals.ts).

**Invariants (set by).**
- Every AI proposal gets a draft round and an independent checker round, then the rules; bulk accept for High only (P-121).
- AI steps run Live or Saved, nothing else; a failed Saved step never offers itself again (P-227).
- Live AI is off on every copy: a live start is refused at the door at US$0 without the live switch (P-175).
- A cost limit warns and stops before spending; it never silently stops good work (P-179).
- Every AI, rules or person proposal enters the review queue through `insertProposals` and nowhere else (P-149 one door).
- Every upload goes through `intake.ts` (P-51); a file already in the library is reused, never stored twice (P-123).
- A retired library form is hidden from AI; a file mapped elsewhere is never drafted again (P-116, P-38).
- Each run shows its steps and never looks stuck (P-110).
- Checklists, guides and documents are read, never filed (P-118, P-156); a channel or answer line is proposed for a second person, never written (P-140).

**Tables.** draftingJob, aiBatch, formEdition, sourceAttachment, proposalItem, canonicalField, govFormDef, combination, intakeItem, libraryChange, officialDownload, approvedSource.
**Tests.** `tests/check_ai_drafting.ts`, `tests/check_ai_live_switch.ts`, `tests/check_ai_orchestration.ts`, `tests/check_c91_impact_ai.ts`, `tests/check_c117_intake_edition.ts`, `tests/check_cost_override.ts`.
**Row lists (P-712).** Never hand-edit this card's frozen `Tests.`, `Tables.` or `Entry points.` line: put your row's items in `MODULE.ai-runs.rows/<ROW>.md` next to it (one file per row; `module-cards.py` fails the PR otherwise).

**Do not.**
- Call a model with the live switch off, or in tests and CI (live AI off).
- Write a proposal straight to a draft or the library; land it through the queue's lander.
- Add a third run mode, or a demo bypass of the checker round (P-121, P-227).
- Accept a source upload anywhere but `intake.ts`.
