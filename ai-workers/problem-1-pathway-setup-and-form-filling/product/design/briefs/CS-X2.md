# Brief: CS-X2, the case side's eraser for an approved "delete my data" request (PF-21d's `ErasurePort`; completes map row 85; cloud builder lane; row owner the release Lead)

Drafted 16 Nov 03:5x IST by the case-side shaping lane from BACKLOG row CS-X2 (line 834; Lead B's ask (b)), checked against `main` 81505985f and CS-C1a's head e59e0c030 (#1818, approved, not merged). **Draft until the release Lead approves it.** Model: Opus 5.5, effort: high (deletion of personal data, schema exceptions to insert-only triggers, legal hold and keep periods; breaker yes). **Two parts, two PRs** (the row says 1-2).

**Ready when:**
* **Part 1 (schema)** after CS-X1 part 1 (`api/src/case-export/person-tables.ts`), CS-K1 part 1 (`case_client`, whose `display_name` and `contact` this part guards) and CS-X3 part 1 (its guard, extended there to marker writes) are on `main`.
* **Part 2 (the eraser)** also after all of these are on `main`:
  * PF-21d part 1 (`ports/erasure.ts`);
  * PF-21b (`ports/legal-hold.ts`);
  * AUD-5 part 2 (`KeepPeriodPort.check`);
  * CS-X3 parts 1 and 2 (`caseDelete`);
  * CS-K1 part 2 (`fo_person_id` filled);
  * CS-X1 part 2 (`Party.fo_person_id`, for family members; ruled below);
  * CS-D1 (documents behind `FilesPort`);
  * CS-C1a (#1818, `closedAt`);
  * `FilesPort.delete` (a contract gap below).

**Points the release Lead confirms in the approval (the requirement or `main` corrects the row):**
* **Ruled (Lead 61, comment 6900882993 on #1876, item 4): the keep period is read as SA-11 reads it, not as the row's "inside its keep period → RETAINED".** SA-11 says the firm's closed-file keep period:
  * is "a reminder, not a lock … it does **not** feed the erasure job" (SA11-D3, `SA-11-audit-compliance-and-data-governance_v2.16_2026-10-25.md:79`);
  * gives a warning **when the request is approved**: "approving is the decision" (SA-11 §3.4 `:333`, "Warning at approval"; SA-11-33@0325ce52).

  BR-7's "keep-period warning > deletion request" means the warning comes first, not that it refuses. What does refuse is a **code floor** (SA-11-16@99f5ec94 (c): "Classes with a code floor … SHALL be kept"). This precedence is a legal reading: Unconfirmed: no counsel.

  Built so, per case:
  * hold → `HELD`;
  * AUD-5 `FLOOR` → `RETAINED` with the date;
  * AUD-5 `WARN` → erased: the warning was shown and decided at approval. **PF-21d's approval must require that warning** (it cannot be saved without recording that the warning was shown; a contract gap below), so the reminder never feeds erasure. If an approval reaches the eraser without that record, the case answers `ERROR` ("Approval has no keep-period warning on record"); PF-21d keeps the request IN_PROGRESS with the error (SA-11-40 §11 failure: no false done). It is never quietly `RETAINED`.
  * `OK` → erased.

  The eraser also offers `preview(firmId, partyId)` so PF-21d's approval screen can show "N closed files are inside your keep period (until <date>)". **Question for the tech lead (for PF-21d's owner):** agree that PF-21d's approval requires the warning record.
* **Ruled with the keep-period reading (Lead 61, comment 6900882993 on #1876, item 4): an open case → `RETAINED` ("case open: close it first").** This is the row's own rule; the requirement is silent. It is the safe direction, since anonymising answers under an open case would break its forms and filings. Unconfirmed: no counsel.
* **The case-side tables refuse in-place changes through thirteen guard functions; erasure passes each one only through one function.** Re-listed on 81505985f from every `CREATE TRIGGER` on a case-side table. A table whose personal columns the eraser rewrites is marked **(erase)**:
  * `runtime_answer_append_only` (`20261023233000_runtime_r1_fix:35-42`, `20261025010000_runtime_r1d_none_apply:26`) serves `client_canonical_answer` **(erase: `value_json`)**, `client_fact_record` and `client_group_answer`. The last two hold no values, only keys, sources and a yes/no, so the new clause gives them nothing to accept.
  * `runtime_snapshot_frozen` (`20261024230000_runtime_r1d_forms:87`) serves `answer_snapshot` **(erase: `facts_json`; `input_hash` kept as proof)**.
  * `runtime_form_instance_guard` (replaced in `20261024233000_runtime_r1d_guard`) serves `form_instance` **(erase: `result_json`; the copy's file goes by the bytes step)**.
  * `validated_copy_guard` (`20261030140000_w110_channel_guards:14`, UPDATE or DELETE) serves `validated_copy` **(erase: `read_back`)**.
  * `c65_read_value_guard` (`20261108090000_c65_document_reads:147`, INSERT or UPDATE) serves `read_value` **(erase: `value_json`, `corrected_value_json`)**.
  * `c65_check_guard` (`:165`) serves `answer_check` **(erase: `typed_value_json`, `document_value_json`)**.
  * `c65_review_guard` (`:135`) serves `document_review`: no value columns, so it is left unchanged.
  * `c82_record_only_corrected` (`20261104150000_c82_filing_record:130-131`) serves `filing_record` and `filing_person_record` **(erase: `filing_person_record.uci`)**. `filing_record` keeps its application number (AG-07 BR-28), so the new clause accepts nothing on it.
  * `c82_append_only` (`:119`) serves `filing_record_correction` **(erase: `before` and `after` where `field` holds a UCI; an application-number correction is kept)**.
  * `runtime_stage_row_via_filing` (`20261109130000_c617_case_stages:180-197`, triggers `:198-206`) serves nine tables: `filing_item`, `sign_step`, `entered_section`, `signed_scan`, `filing_person_record`, `readiness_pass`, `filing_review`, `filing_record_correction` and `filing_form_addition`. It refuses **any** UPDATE when the filing's stage is not CURRENT, and an erased case is closed, so its stages have ended. The new clause lets only the two **(erase)** tables above through, and only for the marker change.
  * `signed_scan_append_only` (`20261102200000_c81_signed_scan:60`) and `fee_receipt_file_append_only` (`20261107170000_b149_fee_receipt_file:38`) serve the two file tables. Their rows are not changed: their bytes go by the bytes step and the record goes in a new table (part 1).
  * `runtime_copy_no_delete` (`20261024233000_runtime_r1d_guard:16-17`) blocks deletes of `form_instance` and `answer_snapshot`. Nothing is deleted, so it is unchanged.
  * **No guard today:** `party_profile` **(erase: `display_name` → "Erased person <short id>", `contact_channels_json` → `{}`)**, `person_link` **(erase: `address`, `address_masked`)**, `case_client` (CS-K1) **(erase: `display_name`, `contact`)**, and `demo_message` (the Sample outbox: deleted through the door, not anonymised). Part 1 **adds** a guard to `party_profile` and `case_client` for the marker only: a marker write without the flag is refused, and ordinary edits stay as today.

  **How each guard is changed:** each listed function is `CREATE OR REPLACE`d with **one clause added at its top**, and the rest is copied verbatim. The trigger bindings are unchanged. The clause returns NEW only when all of these hold:
  * (a) the transaction-local flag `case_erase.active` equals the current transaction's id (`txid_current()::text`);
  * (b) the table is one marked **(erase)**;
  * (c) every changed column is one of that table's erase columns, and each now equals the marker;
  * (d) no other column changed.

  Otherwise the old rule runs unchanged. So a function serving several tables still refuses for its other tables, and the "replace the function" and "unchanged triggers" are the same act.
* **What is "the person's data" on a case** is CS-X1's `person-tables.ts`, one list for both rows (SA-11-40@13537758 rule 3: only what is stored under that person's record). The client's subject is reached through `case_client.fo_person_id`. **Ruled (Lead 61, comment 6900882993 on #1876, item 1): a family member is reached through a nullable `Party.fo_person_id`**, which CS-X1 part 2 adds with its migration. A party matching no case client and no `Party` → `{ outcome: "NOT_FOUND", words: "No case files are linked to this person." }`, which PF-21d reports as such, never `COMPLETED`.
* **Ruled (Lead 61, comment 6900882993 on #1876, item 5): the UCI.** On erasure it is anonymised with the other personal data (SA-11-40 rule 5: government numbers travel with the person): `filing_person_record.uci` and the UCI corrections in `filing_record_correction`. In a `RETAINED` case it is kept. Unconfirmed: no counsel.
* **Kept after erasure, by rule** (Unconfirmed: no counsel):
  * case numbers, filings' application numbers and dates, team, stages and decisions (AG-07 BR-28: a case with history is closed, not deleted);
  * the audit trail (SA-11 BR-8 `:627`; BR-18 `:637`: "The audit record of the erasure survives");
  * file rows (type, date, `sha256`), with bytes removed.

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

## Part 1 (CS-X2a): one erase function and the guard clauses (schema; expected ~550 lines)
* **One migration folder** (stamp later than every migration before it and unique; functions `case_erase_*`).
  * **`case_erase_marker(p_on date) → jsonb`** returns `{"erased": true, "on": "<date>"}`; a text column takes `'Erased on <date>'`.
  * **`case_erase_subject(p_subject uuid, p_request uuid, p_on date)`** is **the only path** (as FO-13's single-function rule, `20261115013000_fo13_compliance_tables:244-245`). It:
    * sets `case_erase.active` to `txid_current()::text` with `set_config(..., true)` (local to the transaction);
    * performs every marker UPDATE for that one subject itself;
    * inserts one `case_erased_file` row per file it marks for byte removal;
    * resets the flag to `''` before it returns.

    No TypeScript code writes a marker or sets the flag: CS-X3's guard fails on either outside the eraser and the door.
  * **New insert-only table `case_erased_file`** in `evidence.prisma` (id, firm via its case, `source_table`, `source_id`, `sha256`, `request_id`, `erased_on`, `bytes_removed_at` null; an INSERT-only trigger, except `bytes_removed_at` set once). It records each file whose bytes go (case documents, signed scans, fee receipts, validated and generated form copies), so no guarded file row is updated. It replaces the earlier plan to reuse CS-D6's `disposed_*` columns, and CS-D6 is no longer needed.
  * **The guard clauses**, per the list above, and the new marker-only guards on `party_profile` and `case_client`.
  * **A row is never born as the marker.** One `BEFORE INSERT` trigger per erased table (`case_erase_no_marker_insert`) refuses a marker-shaped value, so a client cannot type one as an answer.
  * **Soundness, stated plainly:** the app's database role can still call `set_config` itself. The guarantee is therefore the single function, plus CS-X3's CI guard over the code, plus the check that the flag must equal this transaction's id. The full lock, a separate role owning `case_erase_subject` as `SECURITY DEFINER` with the app role denied UPDATE on erase columns, is named in the PR as PF-12's walls' step, the same level as FO-13's.
  * `client_canonical_answer.value_json`;
  * `answer_snapshot.facts_json` (`input_hash` kept as proof);
  * `validated_copy.read_back`;
  * `read_value.value_json` and `corrected_value_json`;
  * `form_instance.result_json`;
  * `filing_person_record`'s personal fields, as the builder lists them from the model;
  * `party_profile.display_name` → "Erased person <short id>" and `contact_channels_json` → `{}`;
  * `case_client.display_name` and `contact` → "Client CL-xxxxx (erased)".

  A marker never turns back into a value (the clause accepts only marker values).
* **Named test cases**, file `tests/check_csx2_erase_schema.ts`, a pass and a fail each:
  * **CS-X2 DW1:** `case_erase_subject` on a subject → its answer's `value_json` is the marker, and every other column is equal before and after; a direct UPDATE to the marker **without** the flag (as any caller would) → refused; with the flag set by `set_config` in a different transaction (a stale id) → refused; to any other value → refused with the old message.
  * **CS-X2 DW2:** a marker changed back to a value → refused; an UPDATE that sets the marker **and** changes `status` → refused; an INSERT of a marker-shaped answer (as a client's save would send it) → refused.
  * **CS-X2 DW3:** each **(erase)** table takes the marker through the function, on a **closed** case whose stages have ended (the `runtime_stage_row_via_filing` clause); each other table served by the same function still refuses an UPDATE carrying the flag (`client_fact_record`, `filing_record`, `sign_step`); the existing suites `check_c69_runs.ts`, the forms, signing, filing-record and C6.17 stage suites pass unchanged.
  * **CS-X2 DW3b:** `case_erased_file` takes an insert and one `bytes_removed_at`; a second set or any other UPDATE → refused; `party_profile`'s ordinary rename still works and its marker write without the flag is refused.
  * **CS-X2 DW4:** the migration test follows rev 16.7 (it measures right after its own migration and never assumes it is the newest); `migrate diff` is empty; every new function is `case_erase_*`.
* **Touch (part 1):** one migration folder; `prisma/schema/evidence.prisma` (the `case_erased_file` model); `answers.prisma`, `submission.prisma`, `filings.prisma`, `links.prisma`, `cases.prisma` (comment lines only: "erased only to the marker through `case_erase_subject`, CS-X2"); new `tests/check_csx2_erase_schema.ts`.

## Part 2 (CS-X2b): the eraser (expected ~600 lines)
* **`api/src/case-export/eraser.ts`:** `caseSideEraser`, with two calls.
* **`preview(firmId, partyId)`** returns, per case of the party's clients, `{ caseNumber, state: OPEN | HELD | FLOOR | WARN | OK, until?, reason? }` and writes nothing. It is for PF-21d's approval screen.
* **`erase(firmId, partyId, approval)`**: `approval` is PF-21d's record, carrying `keepPeriodWarned: true` (required by PF-21d's approval) and the approver's reason. It runs one transaction **per case**, so one held case never stops another (SA-11-28: partial with disclosure). For each case:
  1. **Through CS-X3's `caseDelete`** (kind `erasure`, categories `[case_answers, case_documents]`, persons = the party, the case id, record date = the case's `createdAt`; the per-case transaction is READ COMMITTED and the hold is read after the door's lock):
     * hold → `HELD` with the reason, nothing changed;
     * `FLOOR` → `RETAINED { until }`;
     * `WARN` → erased (decided at approval); an approval without `keepPeriodWarned` → `ERROR`, nothing changed;
     * an open case (status `OPEN`) → `RETAINED { words: "Case open: close it first." }` before the door is asked.
  2. **Erased:** for the party's own subject on that case only (the principal through `case_client`, a family member through `Party.fo_person_id`), one call to `case_erase_subject` inside the door's `remove` callback. It sets every erase column the part 1 list names, writes one `case_erased_file` row per file, and keeps `sha256` and type. `demo_message` rows of the person's links are deleted in the same callback (kind `erasure`).
  3. **Bytes after commit:** for each `case_erased_file` row with no `bytes_removed_at`, `FilesPort.delete` (or the door's local-path remover for files still on local disk), then `bytes_removed_at` is set. On failure it is retried idempotently: a re-run finishes the remaining rows and changes nothing else.
* **The result per case** goes back to PF-21d (`ERASED | HELD | RETAINED | NOT_FOUND | ERROR`, with dates and counts, never values) for the request's events.
* **Rows that stay**, by rule and named in the result's words: case number, filings' application numbers and dates, team, stages, decisions, and the audit trail.
* **Registration:** new `api/src/features/case-erasure.ts` registers with `ErasurePort.register("case-side", …)` once at start (the run-once pattern).
* **Named test cases**, file `tests/check_csx2_erasure.ts` (on PF-21d's, PF-21b's and AUD-5's fakes), a pass and a fail each:
  * **CS-X2 DW5:** a held person → `HELD` with the reason, and every row is byte-equal before and after.
  * **CS-X2 DW6:** an open case → `RETAINED` "Case open"; after close the same request → erased.
  * **CS-X2 DW7:** a closed case inside the firm's reminder with `keepPeriodWarned: true` → erased; an approval without it → `ERROR`, every row byte-equal, never `RETAINED` or `ERASED`.
  * **CS-X2 DW8:** erased → every answer and snapshot of the principal subject is the marker (history rows too), the UCI is the marker and the application number is kept, every file's bytes are gone (`FilesPort.get` null) with its row, `sha256` and case number kept, and the profile, link address and client name are replaced by the reference.
  * **CS-X2 DW8b:** a family member (matched by `Party.fo_person_id`) → only their own subject is erased, and the principal's is byte-equal; a `RETAINED` (open) case keeps its UCI.
  * **CS-X2 DW9:** the spouse's answers, documents and profile on the same case are byte-equal before and after (SA-11-40 §11 test 2).
  * **CS-X2 DW10:** a party with two closed cases, one under a case hold → one `ERASED` and one `HELD`, so the module's result is partial, never complete.
  * **CS-X2 DW11:** firm A's erasure never reads or changes firm B's rows, even with the same `fo_person_id` there (forced fixture).
  * **CS-X2 DW12:** the bytes step fails once (fake throws) → the re-run finishes it and changes no row; a second full run → no change, still `ERASED`.
  * **CS-X2 DW13:** `preview` writes nothing and gives the same states `erase` then acts on.
  * **CS-X2 DW14:** the audit lines of the erasure carry ids, outcome and counts only, with no name, answer or file name (string search).
* **Touch (part 2):** new `api/src/case-export/eraser.ts`, new `api/src/features/case-erasure.ts`, new `tests/check_csx2_erasure.ts`, `api/src/MODULE.cases.md` (the eraser under Entry points; under Invariants "answers change in place only to the erasure marker").

**Done when:** `tsx studio/tests/check_csx2_erase_schema.ts` (part 1) and `tsx studio/tests/check_csx2_erasure.ts` (part 2) exit 0, with each DW case passing and failing as named. These must pass unchanged: `check_c69_runs.ts`, the answer, forms, filing-record and document suites, `check_csx1_export.ts`, `check_csx3_holds.ts`, PF-21d's `check_pf21d_erasure.ts`, the demo reset and the checkpoint load (C10.1); `node studio/tools/check-port-contracts.mjs` exits 0. The module-card check passes and full `ci` is green on the head.

**Duplicate check:** BACKLOG (PF-21d runs the job and says "the case side registers its own"; FO-13's `fo_compliance_erase` is the front office's own; AUD-5 names PF-21d's erasure as a `check` caller; CS-X1 owns `person-tables.ts`; `case_erased_file` is this row's own), open PRs (`erasure`, `ErasurePort`, `case_erase`), `git grep -n "ErasurePort\|case_erase\|eraser" api/src ports prisma` on `main` (only FO-13's migration comment); no eraser on `main`; one `Duplicate check:` line.

**Parallel safety:**
* Part 1 replaces guard functions on the answer, evidence, filings, submission and links area tables and adds guards on `cases.prisma` tables. These are not the `cases.prisma` baton, but CS-W2's per-area PRs re-key the same tables. **Part 1 runs after CS-W2's `answers`, `evidence` and `submission` PRs or before them, never alongside**, in the order named in STATE (P-526b, P-576). Two migrations at once take different stamps.
* `party_profile` and `case_client` are in `cases.prisma`: no column changes, only a trigger and a comment line, so the `cases.prisma` holder named in STATE is told first. `runtime_stage_row_via_filing` serves nine tables, so part 1 never runs alongside a row that edits a C6.17 stage trigger.
* Part 2 adds only new files, plus `MODULE.cases.md`.
* `runtime.ts`, `core.ts`, `case-feed.ts` and `ports/` are untouched.

**Contract gap (for the PR body):**
* `ErasurePort` is not on `main` and in neither contract's ports list. PF-21d gives `register(module, eraser)` but no eraser shape: this brief proposes `preview(firmId, partyId)` and `erase(firmId, partyId, approval)` returning per-case `ERASED | HELD | RETAINED | NOT_FOUND`, and asks PF-21d's approval to **require** the keep-period warning and record `keepPeriodWarned` (SA-11 §3.4).
* `FilesPort.delete` does not exist (Lead B's).
* A family member's person id comes from CS-X1 part 2's `Party.fo_person_id` (ruled, Lead 61, comment 6900882993 on #1876).
* AUD-5's `check()` takes no hold result, so the hold is asked twice (CS-X3's gap).
* `LegalHoldPort` and `KeepPeriodPort` are not on `main`.

**Reviewer and breaker** (deletion, personal data, schema; P-278). The breaker tries:
* an UPDATE that sets the marker on one column and edits another;
* a marker-shaped value sent through the client's answer route (refused by the insert trigger, DW2);
* a hold placed between `preview` and `erase`;
* `set_config('case_erase.active', txid_current()::text, true)` from a plain query followed by a marker UPDATE: the database alone accepts it (the stated limit in part 1's soundness note), so the breaker proves CS-X3's guard flags any such call in the code and that the stale-id case is refused;
* a crash between commit and the bytes step;
* a spouse who is also a client on another case.

The release holder reads the migration before the label (P-600).

**Rules (standard):** Opus 5.5, no model switch mid-session (P-605). Finish whole: if an item needs more than its touch list, stop and ask in a PR comment headed "Question for the tech lead"; never widen the row silently. One part, one PR, under 800 changed lines tests included (P-610); Opus reviewer (P-303); label `review: approved` only after `Reviewer: Approve <sha>` and green CI (P-277, P-385); merge `main` only on a conflict (P-270). Never push to a PR that carries the `queued` label. Before asking for the label, run on `main` merged into your branch the suites of every CI part that was red on any earlier head plus every suite in your shard's demo database, and paste the result lines. Live AI off, US$0 (P-175). Push after every step (P-557). Report to the current Lead (`tools/current-lead.sh`). Read only the files named here and the code you change (P-556). Re-review reads only the diff since the last Approve (P-277, P-610).
---
