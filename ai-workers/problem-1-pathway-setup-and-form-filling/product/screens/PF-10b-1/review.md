# Review: PR #3644, R1.35 PF-10b part 1, the import engine (API only)

Head reviewed: `36321e5bce188c69a6cefe898fa160add1717fdc` (branch `claude/happy-bardeen-k0jqsn`). Reviewer: a session that did not build it. Scope: `git diff origin/main...HEAD` (7 files). Requirement: BACKLOG `| PF-10b |`, and R1.35's Done when "Preview, column mapping, each bad row's reason; good rows imported once (a re-import adds no duplicate), with source and consent set". The deferred parts (undo, report, notification, .xlsx, JobPort, ScanPort, people and consent in PF-10t) are not findings in themselves.

**Verdict: Rework.** The flow is sound: a preview before any write, the run tied to the preview's hash, the attestation, the walls, the keys, one audit line per step, the triggers respected, and the advisory lock across batches. But the run path loses or misreports rows in three reproducible ways, and it runs inside the web request, which breaks a [M] line.

## Evidence run
* The builder's check: `tsx --tsconfig api/tsconfig.json tests/check_pf10b_import_engine.ts` gave **43 passed, 0 failed**, 13.5 s, scratch database dropped.
* Reviewer break script (scratchpad, not committed): a test target writing to a real table **inside the row's transaction**, with scenarios B1 to B8 against the same Nest harness. The real app also ran on :4430 (scratch database, `PLATFORM_IDENTITY=local`) for API-level checks. Both databases were dropped afterwards.
* PF-10a's triggers: no move the engine makes is refused. The moves are DRAFT→DRY_RUN_READY, DRY_RUN_READY→RUNNING with the hash frozen, and RUNNING→COMPLETED/PARTIAL/FAILED with `finished_at` and `undo_deadline` per the finish-shape check. DRY_RUN rows are deleted only while DRAFT/DRY_RUN_READY, and RUN rows are inserted only while RUNNING. The rows are never updated. A FAILED batch has 0 created or merged.

## D1–D20 (API row; screen dimensions N/A until part 4)
| D | Score | Evidence |
|---|---|---|
| D1 Requirement fit | 3/5 | Preview, mapping, reasons in words, run-once and re-import-adds-nothing all pass. "A failing row recorded without stopping" (row text) fails: B3. |
| D2 Data integrity | 2/5 | B1 drops a person after a resume. B2 drops a row's outcome silently. B6 cross-batch lock holds (40/40 distinct). |
| D3 Reuse | 4/5 | One engine, targets register, our own CSV reader (no gate needed). |
| D4 Rule integrity | 4/5 | Hash = file + target version + mapping (engine.ts:136, 191). Required and allowed values become errors, never defaults. |
| D5 Stability and recovery | 2/5 | One bad row bricks a batch in RUNNING (B3). A double Preview gives a 500 (B5). A double Run gives wrong words (B4). |
| D6 Governance | 4/5 | Audit for upload, dry run, start and finish, attestation; counts only, no values (test DW6). |
| D7 AI trust | N/A | No AI. |
| D8–D14 | N/A | No screen (part 4). D10 noted for API words: B4, B8, item 7. |
| D15 Speed | 2/5 | 5,000 rows on a trivial local target: dry run 2.5 s, **run 17.8 s in one HTTP request** (B7). |
| D16 Testability | 3/5 | Pass and fail per rule, but the test target ignores `tx` (tests/check_pf10b_import_engine.ts:76-88). The lock (engine.ts:212) and the version refusal (engine.ts:191-192) can be removed with no test failing. |
| D17, D20 | simulated only | No user walk (API). |
| D18 Provenance | 4/5 | `GET origin/:kind/:id` gives Import + batch + source (DW6). |
| D19 Closure | N/A | Part 1 of 4. |

**BIC-01–BIC-20 (EXPERIENCE §6):** N/A, no case-side screen in this part. **Graph:** G3 lists 8 `/platform/imports` routes as "no test reaches", but the check calls all of them through its `call()` helper. This is a tool false positive, not a finding.

## [M] lines (STANDARDS)
Met: server authorisation, deny by default (401 with no session, 403 for a Case Officer, real app :4430). Firm walls (404 across firms). Problem Details with field errors. Uploads type- and size-checked, stored by FilesPort. Strict types. Module card. Personal data not in audit. **Not met:** §3 "Background work in the worker … never inside a web request" (item 4). "A rule's test fails when the rule is removed" (item 6). "No N+1" for the dry run, one `find` per row (engine.ts:173). This is minor with an in-request run, folded into item 4.

## Issues (Must = Blocker/Major, Should = Minor)
1. **Major (Must), resume diverges from the preview and loses a record.** File: engine.ts:234-242 (`keyOf`), used at :208 and :221. `keyOf` adds a row's natural key to `seen` even when `decide` (:165-168) made that row an ERROR for a missing required field.
   * B1: rows `,dup@x.test` (no name), `Zed,crash@x.test`, `Ann,dup@x.test`. The preview says 2 create, 1 error. The run crashes on row 2. On resume, row 3 becomes SKIP "is the same as an earlier row of this file (that row is imported)", which is false, and Ann is never created (0 in the table).
   * Fix: make `keyOf` follow `decide`'s order (required and check errors give no key), or rebuild `seen` from the written RUN rows.
2. **Major (Must), any P2002 from the target is taken as "another run wrote this row".** File: engine.ts:218-222. The catch tests only `code === "P2002"`, not that the key is `plat_import_row (firm_id, batch_id, phase, row_number)`.
   * B2: a target whose create hits its own unique key on row 2 of 3. The batch ends **COMPLETED** with counts 2/0/0/0 and RUN rows 1 and 3 only. Row 2 has no outcome or reason, and a COMPLETED batch cannot be resumed.
   * Fix: swallow only when the RUN row now exists (re-read it), else record the row as ERROR or rethrow.
3. **Major (Must), one failing row stops the run and leaves the batch stuck.** File: engine.ts:210-222. The row text says "each row in its own transaction, a failing row recorded without stopping".
   * B3: the target refuses row 2 on write. Every run call answers 500 at row 2, the batch stays RUNNING, and rows after it are never imported. A new dry run is refused 409 ALREADY_RUN, and the trigger allows no RUNNING→DRAFT, so the batch can never finish and undo (COMPLETED/PARTIAL only) can never reach row 1's record.
   * The same dead end follows a target `version` bump between start and resume (:191-192 answers DRY_RUN_CHANGED forever).
   * Fix: write an ERROR RUN row with a named rule (for example `write_failed`) in a fresh transaction and continue. Give a stuck batch a way to finish.
4. **Major (Must), the run happens inside the HTTP request.** File: engine.ts:184-232 (STANDARDS §3 [M]). B7: 5,000 rows took 17.8 s on a no-op local target. A real person target (consent, audit, remote database) multiplies that, past proxy and browser timeouts, and the person then sees a failed request while the run is half done.
   * The PR asks the tech lead to accept this (PR body "Questions"). The item stands until that ruling is recorded on the PR. If it is accepted, the reason goes in build notes and this becomes N/A.
5. **Minor (Should), a double click on Preview answers a raw 500.** File: engine.ts:137-146. Two concurrent dry runs: the second `createMany` (:142) hits the first's committed rows (unique key) → 500 (B5). The data stays consistent. Fix: lock the batch row `FOR UPDATE` at the start of the transaction, or map P2002 to 409.
6. **Minor (Should), tests miss the rules that need a real transaction.** File: tests/check_pf10b_import_engine.ts:76-88. The test target's find, create and merge ignore `tx` and write to a Map. So the per-row rollback, the advisory lock (engine.ts:212, which the PR claims as "two imports never create one record twice") and the version refusal (engine.ts:191-192) have no failing test. Add a tx-backed test target, two concurrent batches and a version bump.
7. **Minor (Should), wrong or unclear words.**
   * (a) A second, concurrent Run click answers 409 DRY_RUN_CHANGED "The preview has changed since you looked at it" when nothing changed (engine.ts:198; B4).
   * (b) In the real app, a file over 5 MB answers "This file is too large for this upload." with no code and no limit named. `main.ts:204`'s ProblemErrors rewrites every 413, so routes.ts:17/22 and csv.ts:20 never reach the person, and AG-18-58 ("the refusal names the limit") is unmet (:4430, 5.3 MB and 6 MB).
   * (c) A 201-character source answers zod's "Too big: expected string to have <=200 characters" (engine.ts:50, B8).
8. **Minor (Should), a silent deviation from the row text.** File: csv.ts:7. The Sample byte ceiling is 5 MB where BACKLOG PF-10b says "Sample ceilings 10 MB". Say so in the PR, or use 10 MB.

Held under breaking (B4, B6, B8): a double Run creates each row once (30/30). Two batches with the same 40 new people create 40 people once. A formula is stored as text. `<script>` in the source is stored as text. A French `;` file works. A bad id gives 404. Firm B sees firm A's import as 404.

## Could not check
No screen, so there is no browser, keyboard, axe, widths or BIC (part 4). No real person target (PF-10t), so the AG-18-45 consent write and "quiet" are not exercised. No remote database latency. CI suites (run-suites, graph, count-any) are not re-run here.

Journey-test (reviewer, API-level only): **5.5/10**, see `journey-test-reviewer-2026-11-25.md`.

**Verdict: Block**: fix 1, 2, 3, and either fix 4 or record the tech lead's ruling on it. Minors 5 to 8 are recommended in the same round.

Reviewer: Block 36321e5bce188c69a6cefe898fa160add1717fdc
