# Brief: CS-X2, the case side's eraser for an approved "delete my data" request (PF-21d's `ErasurePort`; completes map row 85; cloud builder lane; row owner the release Lead)

Drafted 16 Nov 03:5x IST by the case-side shaping lane from BACKLOG row CS-X2 (line 834; Lead B's ask (b)), checked against `main` 81505985f and CS-C1a's head e59e0c030 (#1818, approved, not merged). **Draft until the release Lead approves it.** Model: Opus 5.5, effort: high (deletion of personal data, schema exceptions to insert-only triggers, legal hold and keep periods; breaker yes). **Two parts, two PRs** (the row says 1-2).

**Ready when:**
* **Part 1 (schema)** after CS-X1 part 1 (`api/src/case-export/person-tables.ts`) and CS-D6's schema part (`disposed_at`, `disposed_by`, `disposal_reason` on `case_document`) are on `main`.
* **Part 2 (the eraser)** also after all of these are on `main`:
  * PF-21d part 1 (`ports/erasure.ts`);
  * PF-21b (`ports/legal-hold.ts`);
  * AUD-5 part 2 (`KeepPeriodPort.check`);
  * CS-X3 parts 1 and 2 (`caseDelete`);
  * CS-K1 part 2 (`fo_person_id` filled);
  * CS-D1 (documents behind `FilesPort`);
  * CS-C1a (#1818, `closedAt`);
  * `FilesPort.delete` (a contract gap below).

**Points the release Lead confirms in the approval (the requirement or `main` corrects the row):**
* **"Inside its keep period → RETAINED" departs from the requirement.** The row reads BR-7 as "a keep period beats a deletion request" and answers `RETAINED` with the date. SA-11 says the firm's closed-file keep period:
  * is "a reminder, not a lock … it does **not** feed the erasure job" (SA11-D3, `SA-11-audit-compliance-and-data-governance_v2.16_2026-10-25.md:79`);
  * gives a warning **when the request is approved**: "approving is the decision" (SA-11 §3.4 `:333`, "Warning at approval"; SA-11-33@0325ce52).

  BR-7's "keep-period warning > deletion request" means the warning comes first, not that it refuses. What does refuse is a **code floor** (SA-11-16@99f5ec94 (c): "Classes with a code floor … SHALL be kept").

  Built so (the caller's "erasure respects keep periods", AUD-5's order), per case:
  * hold → `HELD`;
  * AUD-5 `FLOOR` → `RETAINED` with the date;
  * AUD-5 `WARN` → erased **only if** the request's approval recorded the keep-period warning (PF-21d passes it), else `RETAINED` with the date (the safe direction);
  * `OK` → erased.

  The eraser also offers `preview(firmId, partyId)` so PF-21d's approval screen can show "N closed files are inside your keep period (until <date>)". **Question for the tech lead:** confirm this reading, or keep the row's (a departure from SA11-D3 for the founder, P-566).
* **An open case → `RETAINED` ("case open: close it first")** is the row's own rule; the requirement is silent. It is kept as the safe direction, since anonymising answers under an open case would break its forms and filings. The Lead confirms it.
* **The answer tables refuse any change in place, by trigger.** `runtime_answer_append_only` covers `client_canonical_answer`, `client_fact_record` and `client_group_answer` (migrations `20261023233000_runtime_r1_fix:35-42`, `20261025010000_runtime_r1d_none_apply:26`). `answer_snapshot` is frozen and undeletable (`20261024230000_runtime_r1d_forms:87`, `20261024233000_runtime_r1d_guard`). `validated_copy` is guarded (`20261030140000_w110_channel_guards:14`). Filing records are append-only (`20261104150000_c82_filing_record`). The row's "value replaced … history rows too" needs a **schema part**, so the row's touch list (no migration) is short. **Part 1** adds one narrow exception per guarded table, as FO-13 did for PF-21d (`fo_compliance_erase(...)`, Lead B #1755): each trigger accepts an UPDATE **only** when the personal columns become the erasure marker and every other column is unchanged. Erasure is the only possible change, and it is one way.
* **What is "the person's data" on a case** is CS-X1's `person-tables.ts`, one list for both rows (SA-11-40@13537758 rule 3: only what is stored under that person's record). The principal subject is reached through `case_client.fo_person_id`. **A family member's erasure waits on the same ruling as CS-X1 part 2** (a family member has no person id on the case side). Until then, a party matching no case client → `{ outcome: "NOT_FOUND", words: "No case files are linked to this person." }`, which PF-21d reports as such, never `COMPLETED`.
* **Kept by rule, not erased:**
  * case numbers, application numbers and UCI on `filing_person_record`: SA-11-40 rule 5 makes the UCI an answer about the person, so it is anonymised like any answer, but the application number and the filing's dates stay (AG-07 BR-28: a case with history is closed, not deleted);
  * the audit trail (SA-11 BR-8 `:627`; BR-18 `:637`: "The audit record of the erasure survives");
  * document rows (type, date, `sha256`), with bytes removed.

  **Question for the tech lead:** is a UCI an answer to anonymise (SA-11-40 rule 5, recommended) or an identifier kept with the filing record?

---
You are a builder for the Expat Ready Pathway Configurator. Run `/next runtime CS-X2` and take **one part of row CS-X2** end to end on a fresh branch from `origin/main`, one PR per part.

**The row:** `product/BACKLOG.md` row **CS-X2**, read with the points above. Requirement text (cite these, read only this text):
* **SA-11-16@99f5ec94**: erasure runs only on an approved request after 7 days, refuses under a hold, keeps code-floor classes, has its own switch;
* **SA-11-18@96c4c698**: hold beats every deletion;
* **SA-11-28@0d12915a**: held means HELD or partial with what was kept and why, never a false COMPLETED;
* **SA-11-40@13537758** rules 3-5: one person record only; a hold on one person blocks that person; government numbers travel with the person;
* **SA-11-33@0325ce52** and SA11-D3 (`:79`): the firm's keep period is a reminder that does not feed the erasure job;
* SA-11 §3.4 (`:324-342`, "Warning at approval" `:333`);
* SA-11 BR-7 (`:626`), BR-8, BR-12 (`:631`), BR-18 (`:637`);
* AG-07 BR-28 (`AG-07-case-core-and-delivery_v3.12_2026-10-28.md:671`): a case with history is closed, not deleted;
* decisions **P-588 (2)** (people per case) and **P-607** (S1 Q10).

**Read only these:**
* the guard migrations named above;
* `prisma/migrations/20261115013000_fo13_compliance_tables/migration.sql:243-250` (the erase-only function pattern);
* `api/src/case-export/person-tables.ts` (CS-X1);
* `ports/erasure.ts`, `ports/legal-hold.ts` and `ports/keep-period.ts` (part 2);
* `api/src/documents/delete.ts` (CS-X3);
* `api/src/clients.ts` (CS-K1);
* `api/src/features/platform-complaints.ts` (the run-once registration);
* `api/src/MODULE.cases.md`.

## Part 1 (CS-X2a): the erase-only exceptions (schema; expected ~400 lines)
* **One migration folder** (stamp later than every migration before it and unique; functions `case_erase_*`), changing no table's columns. One SQL function `case_erase_marker(p_on date) → jsonb` returns `{"erased": true, "on": "<date>"}`. Each guarded table's existing trigger function is replaced by one that keeps today's rule **and** also accepts an UPDATE whose personal columns all equal the marker, every other column unchanged:
  * `client_canonical_answer.value_json`;
  * `answer_snapshot.facts_json` (`input_hash` kept as proof);
  * `validated_copy.read_back`;
  * `read_value.value_json` and `corrected_value_json`;
  * `form_instance.result_json`;
  * `filing_person_record`'s personal fields, as the builder lists them from the model;
  * `party_profile.display_name` → "Erased person <short id>" and `contact_channels_json` → `{}`;
  * `case_client.display_name` and `contact` → "Client CL-xxxxx (erased)".

  `client_fact_record` and `client_group_answer` hold no values (only keys and sources), so they keep their triggers unchanged; the PR says so. A marker never turns back into a value (the trigger refuses), and **a new row can never be born as the marker**: one `BEFORE INSERT` trigger per guarded table (`case_erase_no_marker_insert`) refuses a marker-shaped value, so a client cannot type one as an answer.
* **Named test cases**, file `tests/check_csx2_erase_schema.ts`, a pass and a fail each:
  * **CS-X2 DW1:** an UPDATE of an answer's `value_json` to the marker → accepted, and every other column is equal before and after; to any other value → refused with the old message.
  * **CS-X2 DW2:** a marker changed back to a value → refused; an UPDATE that sets the marker **and** changes `status` → refused; an INSERT of a marker-shaped answer (as a client's save would send it) → refused.
  * **CS-X2 DW3:** each guarded table in the list takes the marker, and its old rule still holds (the existing suites `check_c69_runs.ts`, the forms and filing-record suites pass unchanged).
  * **CS-X2 DW4:** the migration test follows rev 16.7 (it measures right after its own migration and never assumes it is the newest); `migrate diff` is empty; every new function is `case_erase_*`.
* **Touch (part 1):** one migration folder; `prisma/schema/answers.prisma`, `evidence.prisma`, `submission.prisma` (comment lines only: "erased only to the marker, CS-X2"); new `tests/check_csx2_erase_schema.ts`.

## Part 2 (CS-X2b): the eraser (expected ~600 lines)
* **`api/src/case-export/eraser.ts`:** `caseSideEraser`, with two calls.
* **`preview(firmId, partyId)`** returns, per case of the party's clients, `{ caseNumber, state: OPEN | HELD | FLOOR | WARN | OK, until?, reason? }` and writes nothing. It is for PF-21d's approval screen.
* **`erase(firmId, partyId, approval)`**: `approval` is PF-21d's record, carrying `keepPeriodWarned: boolean` and the approver's reason. It runs one transaction **per case**, so one held case never stops another (SA-11-28: partial with disclosure). For each case:
  1. **Through CS-X3's `caseDelete`** (kind `erasure`, category `case_answers` and `case_documents`, persons = the party, the case id, record date = the case's `createdAt`):
     * hold → `HELD` with the reason, nothing changed;
     * `FLOOR` → `RETAINED { until }`;
     * `WARN` → erased when `approval.keepPeriodWarned`, else `RETAINED { until, words: "Inside the firm's keep period; not warned at approval" }`;
     * an open case (status `OPEN`) → `RETAINED { words: "Case open: close it first." }` before the door is asked.
  2. **Erased:** for the principal subject only, every row named `EXPORT` or `VIA` in `person-tables.ts` is set to the marker (part 1's exceptions). Each document row gets `disposed_at`, `disposed_by` = "erasure" and `disposal_reason` = "Erased on request <request id>". `sha256` and type are kept.
  3. **Bytes after commit:** `FilesPort.delete` for each disposed document, and the door's local-path remover for files still on local disk. On failure it is retried idempotently: the row already says disposed, and a re-run removes the remaining bytes and changes no row.
* **The result per case** goes back to PF-21d (`ERASED | HELD | RETAINED | NOT_FOUND`, with dates and counts, never values) for the request's events.
* **Rows that stay**, by rule and named in the result's words: case number, filings' application numbers and dates, team, stages, decisions, and the audit trail.
* **Registration:** new `api/src/features/case-erasure.ts` registers with `ErasurePort.register("case-side", …)` once at start (the run-once pattern).
* **Named test cases**, file `tests/check_csx2_erasure.ts` (on PF-21d's, PF-21b's and AUD-5's fakes), a pass and a fail each:
  * **CS-X2 DW5:** a held person → `HELD` with the reason, and every row is byte-equal before and after.
  * **CS-X2 DW6:** an open case → `RETAINED` "Case open"; after close the same request → erased.
  * **CS-X2 DW7:** a closed case inside the firm's reminder with `keepPeriodWarned: false` → `RETAINED` with the date; with `true` → erased.
  * **CS-X2 DW8:** erased → every answer and snapshot of the principal subject is the marker (history rows too), every document's bytes are gone (`FilesPort.get` null) with the row, `sha256` and case number kept, and the profile and client name are replaced by the reference.
  * **CS-X2 DW9:** the spouse's answers, documents and profile on the same case are byte-equal before and after (SA-11-40 §11 test 2).
  * **CS-X2 DW10:** a party with two closed cases, one under a case hold → one `ERASED` and one `HELD`, so the module's result is partial, never complete.
  * **CS-X2 DW11:** firm A's erasure never reads or changes firm B's rows, even with the same `fo_person_id` there (forced fixture).
  * **CS-X2 DW12:** the bytes step fails once (fake throws) → the re-run finishes it and changes no row; a second full run → no change, still `ERASED`.
  * **CS-X2 DW13:** `preview` writes nothing and gives the same states `erase` then acts on.
  * **CS-X2 DW14:** the audit lines of the erasure carry ids, outcome and counts only, with no name, answer or file name (string search).
* **Touch (part 2):** new `api/src/case-export/eraser.ts`, new `api/src/features/case-erasure.ts`, new `tests/check_csx2_erasure.ts`, `api/src/MODULE.cases.md` (the eraser under Entry points; under Invariants "answers change in place only to the erasure marker").

**Done when:** `tsx studio/tests/check_csx2_erase_schema.ts` (part 1) and `tsx studio/tests/check_csx2_erasure.ts` (part 2) exit 0, with each DW case passing and failing as named. These must pass unchanged: `check_c69_runs.ts`, the answer, forms, filing-record and document suites, `check_csx1_export.ts`, `check_csx3_holds.ts`, PF-21d's `check_pf21d_erasure.ts`, the demo reset and the checkpoint load (C10.1); `node studio/tools/check-port-contracts.mjs` exits 0. The module-card check passes and full `ci` is green on the head.

**Duplicate check:** BACKLOG (PF-21d runs the job and says "the case side registers its own"; FO-13's `fo_compliance_erase` is the front office's own; AUD-5 names PF-21d's erasure as a `check` caller; CS-X1 owns `person-tables.ts`; CS-D6 owns the `disposed_*` columns), open PRs (`erasure`, `ErasurePort`, `case_erase`), `git grep -n "ErasurePort\|case_erase\|eraser" api/src ports prisma` on `main` (only FO-13's migration comment); no eraser on `main`; one `Duplicate check:` line.

**Parallel safety:**
* Part 1 replaces trigger functions on the answer, evidence and submission area tables. These are not the `cases.prisma` baton, but CS-W2's per-area PRs re-key the same tables. **Part 1 runs after CS-W2's `answers`, `evidence` and `submission` PRs or before them, never alongside**, in the order named in STATE (P-526b, P-576). Two migrations at once take different stamps.
* `party_profile` and `case_client` are in `cases.prisma`, but no column changes, only a trigger, so the baton holder is told and no schema line is edited.
* Part 2 adds only new files, plus `MODULE.cases.md`.
* `runtime.ts`, `core.ts`, `case-feed.ts` and `ports/` are untouched.

**Contract gap (for the PR body):**
* `ErasurePort` is not on `main` and in neither contract's ports list. PF-21d gives `register(module, eraser)` but no eraser shape: this brief proposes `preview(firmId, partyId)` and `erase(firmId, partyId, approval)` returning per-case `ERASED | HELD | RETAINED | NOT_FOUND`, and asks PF-21d's approval to record `keepPeriodWarned` (SA-11 §3.4).
* `FilesPort.delete` does not exist (Lead B's).
* A family member has no person id on the case side (CS-X1's question).
* `LegalHoldPort` and `KeepPeriodPort` are not on `main`.

**Reviewer and breaker** (deletion, personal data, schema; P-278). The breaker tries:
* an UPDATE that sets the marker on one column and edits another;
* a marker-shaped value sent through the client's answer route (refused by the insert trigger, DW2);
* a hold placed between `preview` and `erase`;
* a crash between commit and the bytes step;
* a spouse who is also a client on another case.

The release holder reads the migration before the label (P-600).

**Rules (standard):** Opus 5.5, no model switch mid-session (P-605). Finish whole: if an item needs more than its touch list, stop and ask in a PR comment headed "Question for the tech lead"; never widen the row silently. One part, one PR, under 800 changed lines tests included (P-610); Opus reviewer (P-303); label `review: approved` only after `Reviewer: Approve <sha>` and green CI (P-277, P-385); merge `main` only on a conflict (P-270). Never push to a PR that carries the `queued` label. Before asking for the label, run on `main` merged into your branch the suites of every CI part that was red on any earlier head plus every suite in your shard's demo database, and paste the result lines. Live AI off, US$0 (P-175). Push after every step (P-557). Report to the current Lead (`tools/current-lead.sh`). Read only the files named here and the code you change (P-556).
---
