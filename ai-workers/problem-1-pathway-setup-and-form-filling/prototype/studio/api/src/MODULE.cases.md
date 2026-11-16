---
paths:
  - "ai-workers/problem-1-pathway-setup-and-form-filling/prototype/studio/api/src/{runtime,case-*,assessments,team,person-link,employer-*,earlier-facts,findings,readiness,readiness-inputs,document-review-*,filing,filing-*,fill-case,submission,submission-record,sign-steps,review-rounds,review-runs,review-run-shapes,review-stamp,review-items,release-*,stage-scope,routes-data}.ts"
---
# Module card: api-cases (P-615)
The runtime: a client's case on a released combination, from answers to a recorded submission. Read this before editing these files; update it in the same PR when an entry point, invariant, table or test below changes (or say `Card unchanged: <reason>` in the PR body).

**Purpose.** `runtime.ts` creates and reads cases, people and answers; `case-*.ts` stages, checklist, documents, filings, changes and the Prepare view; `fill-case.ts` the case's forms; `readiness*.ts` Ready to file; `review-rounds.ts`/`review-runs.ts` the representative's review; `sign-steps.ts` signed PDFs; `submission*.ts` recording the submission; `person-link.ts` adult privacy and links; `release-update.ts` adopting a newer release; `stage-scope.ts`/`routes-data.ts` multi-stage cases.
**Owner area.** runtime lane, with screens for B138, B144 (Unconfirmed: no lane map in code).
**Entry points.** all under `/api/runtime`: `GET|POST cases`, `GET cases/:id/stages`, `GET cases/:id/checklist`, `POST cases/:id/documents`, `GET cases/:id/prepare`, `GET cases/:id/forms`, `POST filings/:id/ready`, `POST cases/:id/reviews`, `POST items/:id/sign-steps/:key`, `PATCH groups/:gid/record`, `GET|POST cases/:id/release-update`; behind PF-4's guard (staff session and keys, not `x-actor`): `POST cases/:id/{decisions,withdraw,close,reopen}` (`case-close.ts`, CS-C1a).

**Invariants (set by).**
- A case is pinned to its release; every read uses the pinned release, never the newest (P-67, STANDARDS §3.7).
- One current answer per person per fact, append-only; deny by default by duty (P-72).
- A declaration is always the client's own; the officer never makes or restores one (P-97, P-130).
- A form is filled from declared and confirmed answers through `fill.ts`, never overwritten (P-242, P-411, P-65).
- An identity document is read by a person, never by AI; other reads replay saved runs only (P-134, P-175, P-295).
- The representative reviews a filing before it is recorded (P-155 (1), P-412).
- The only hard stop on Ready to file is a barcode form failing its own Validate; the rest are warnings passed with a reason (P-237).
- A never-waivable line cannot be marked Not applicable (P-172); a line of an ended stage is history (P-444).
- A case reads only its current stage's pins and rows (B139).
- A case is OPEN or CLOSED; a decision needs a recorded submission, `case_decision` is insert-only, close and reopen need a reason and write `case.closed`/`case.reopened` in the same transaction (CS-C1a; AG-7-33, -34, -13, -50).

**Tables.** case, caseParticipant, caseTeamMember, clientCanonicalAnswer, filing, filingItem, formInstance, caseDocument, answerCheck, reviewRoundFiling, reviewFinding, personLink, caseDecision, moduleEvent, auditEvent.
**Tests.** `tests/check_c76_readiness.ts`, `tests/check_c65_document_rules.ts`, `tests/check_m3s4_never_waivable.ts`, `tests/check_c95_release_update.ts`, `tests/check_c81_signing.ts`, `tests/check_a24_case_number_api.ts`, `tests/check_csc1_close.ts`.

**Do not.**
- Read the newest release from a case route.
- Send an identity document to AI, or make a live read.
- Edit an answer in place; append a new one.
- Record a filing the representative has not reviewed.
