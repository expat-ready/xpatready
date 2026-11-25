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

## Re-review 44e66d4 (diff only)

Scope: `git diff 36321e5..44e66d4` under `prototype/studio/` (engine.ts, csv.ts, routes.ts, features/platform-import.ts, ports/import-target.ts, the check, the module card). The batch list and origin routes moved to part 2 (size cap), so they are not reviewed here. Reviewer: a session that did not build it.

**Evidence run**
* The builder's check (`tsx --tsconfig api/tsconfig.json tests/check_pf10b_import_engine.ts`): **46 passed, 0 failed**, and its scratch database was dropped.
* The reviewer's script (scratchpad `rr44.mts`, not committed) adapts the round-1 B1/B2/B3 cases and the breaker's F1/F2/F3 to the job model. It uses the fake jobs from `ports/jobs.ts` and `jobs.runDue()`, plus a target that writes a real table inside the row's transaction, with its own partial unique key and a check constraint. Nest ran on :4434.
* A second script (`rr44_real.mts`) wires the **real** feature module (`features/platform-import.ts` default export, so `ImportJobs`), PF-14's `PlatformJobs` on pg-boss, and PF-12's walls, on :4435. A 200-row run came back 201 RUNNING in 25 ms. The pg-boss job then finished it PARTIAL (199 created, 1 `write_failed`). Audit: uploaded, dry_run, started, finished.
* Both scratch databases (`xr_studio_pf10b_rr_*`, `xr_studio_pf10b_rrreal_*`) were dropped. No :4400 and no paid call (US$0). `tsc` on the whole API ran out of memory here, so the type check is left to CI.

**Round-1 findings**
| # | Finding | Status | Evidence |
|---|---|---|---|
| M1 / F2 | Resume drops a person | **Fixed** | `keyOf` now returns null when a required field is missing (engine.ts:~236), and a resumed job adds a written row's key only when its outcome is not ERROR (:205). B1 (`,dup@x.test` / `Zed,crash@x.test` / `Ann,dup@x.test`, store down at row 2, then Run again): PARTIAL, rows 2 and 3 CREATE, Ann created. F2 (`,dup2` / `Bob,dup2` / `Cy`): Bob created, row 2 CREATE. The check has a fail test (DW5 "break M1, F2"). |
| M2 | Any P2002 is taken as another run's write | **Fixed** | The catch (:218-225) re-reads the RUN row and swallows only when it exists. Otherwise it writes ERROR `write_failed`. Target's own unique key on row 2 of 3: PARTIAL 2/0/0/1, row 2 "row: could not be saved (nothing of it was imported)". |
| M3 | One failing row sticks the batch | **Fixed** | A check constraint on row 2: the click answers 201 RUNNING, the job ends PARTIAL with an undo deadline, rows 1 and 3 created. The version-bump dead end is gone: the hash is checked only on DRY_RUN_READY (:176-178), and a resume after `version` 1→2 ends COMPLETED. Only `ImportTargetUnavailable` stops the job (:220), and it is retried. |
| M4 | Run inside the HTTP request (STANDARDS §3) | **Fixed** | `run` moves the batch to RUNNING and enqueues `platform.import.run` (:187-189). `ImportJobs.onModuleInit` registers the handler before PF-14's worker starts (platform-import.ts:36-47). Fake jobs: 300 rows at 10 ms each, the click took 15 ms and the job 4.4 s. On the real pg-boss wiring with walls, see above. |
| F1 | A header over 200 characters makes every run fail | **Not fixed (partly)** | The reported case is fixed: `"h"×201` → 422 HEADER_TOO_LONG at upload. A header that passes the reader can still break the run, see **N1**. |
| 5 | Double Preview gives a 500 | Fixed | Three dry runs at once: one 201, two 409 PREVIEW_BUSY. |
| 6 | Tests miss the transaction rules | Partly | The test target now writes a real table in the transaction, so per-row rollback and `write_failed` are tested. Still no failing test for the advisory lock (:211), the version check (:178), or two jobs of one batch at once. |
| 7a / 7b / 7c | Wrong or unclear words | Fixed | (a) A second Run click at the same moment gives 409 ALREADY_RUNNING "This import has already started." (b) TOO_LARGE is now 422 and names the limit, because main.ts rewrites 413 (routes.ts:17, :22). (c) A 201-character source gives the field message "At most 200 characters." |
| 8 | 5 MB against the row's 10 MB | Fixed | MAX_BYTES is 10 MB (csv.ts:6). |
| F3 / F4 / F5 / F6 / F7a,c,d | Breaker Minors | Fixed | F3: two `work()` calls on one batch at once (43 rows, 2 with no key, a second Run click a minute later) gave 43/43 RUN rows, 41+2 records (no double), and one `finished` audit line. F4: control characters are refused before anything is stored. F5: `Object.hasOwn` (:121). F7a: a CR-only file is read. F7b (line numbers) is not changed. |

**New findings**
* **N1, Major (Must): F1's failure still happens for a header whose characters are outside the Basic Multilingual Plane.**
  * Where: csv.ts:55 counts code points (`[...h].length > MAX_HEADER`), but `Mapping` (ports/import-target.ts:64) caps keys with `z.string().max(200)`, which counts UTF-16 units. A header of 101 to 200 code points that is over 200 units passes the reader and fails `Mapping`.
  * Repro: `Full name,E-mail,<"😀"×101>` plus one row. Upload gives 201, and the dry run with `{Full name: name, E-mail: email}` gives **201 DRY_RUN_READY**. `POST /run` then gives **500** from `Mapping.parse(b0.mapping)` (engine.ts:177), every time; main.ts answers "Something went wrong on the server". Sending the column back with null gives 422 "Invalid key in record". This is the breaker's F1 symptom unchanged: the preview passes and the run can never happen.
  * Real trigger: a form-tool question header close to 200 characters with a few emoji or supplementary-plane characters.
  * Fix: one unit in both places (for example `h.length > MAX_HEADER` in csv.ts, or a code-point refine in `Mapping`). Add a fail test with an astral-character header next to DW1's `"h"×201`.
* **N2, Minor (Should): a Run click on a stopped batch can silently queue nothing.** Where: the key `import:<batch>:run:<written>:<minute>` (engine.ts:188). A click in the same minute as an earlier one, with no new row written (for example a job that stopped at row 1), answers 201 RUNNING but enqueues nothing (`queued: false`). Seen in the script: the state stayed RUNNING until the clock passed the minute. pg-boss's own retries (3, with backoff) still run, so nothing is lost. Say "already queued" or drop the minute once the earlier job has failed.
* **N3, Minor (Should): a passing database fault becomes a lasting row error.** Where: the catch at engine.ts:218-225 records any error other than `ImportTargetUnavailable` as `write_failed`. That includes the engine's own transaction timeout, deadlock, or pool timeout (Prisma P2028, P2034, P2024). Such a row ends as "could not be saved" when a retry would have worked. The words are true, and re-importing the file adds no duplicate. Consider treating those Prisma codes like `ImportTargetUnavailable`.

**Journey (reviewer, API-level only, no screen in part 1): 7/10.** This is up from 5.5. A run no longer loses or misreports rows, it returns at once, and refusals are in words. The open N1 dead end keeps the score below 8. No separate journey report was written in this round (the caller limited the files written to this section).

**Verdict: Block**: fix N1 (one header-length unit for the reader and `Mapping`, with a fail test). M1 to M4 are fixed. N2, N3 and the rest of Minor 6 are recommended.

Reviewer: Block 44e66d41434b178d0ab82483cf7ee989f5ef08f4

## Round 3 27ea390 (diff only)

Scope: `git diff 44e66d4..27ea390` under `prototype/studio/`, three files: csv.ts (1 line plus a comment), engine.ts (the catch), and the check (one fail test). Round 3 was allowed by the tech lead. Reviewer: a session that did not build it.

**Evidence run**
* The builder's check (`tsx --tsconfig api/tsconfig.json tests/check_pf10b_import_engine.ts`): **46 passed, 0 failed**.
* The reviewer's script (scratchpad `rr3b.mts`, not committed) is round 2's `rr44.mts` harness (Nest on :4436, fake jobs, a target that writes a real table). It runs upload, dry run, Run and the job for each header case. A probe (`probe3.mts`) records the Prisma 7 + adapter-pg error shapes.
* The scratch database `xr_studio_pf10b_rr3_*` was dropped. No :4400 and no paid call (US$0). Two older databases, `xr_studio_pf10b_2289` and `_2685`, were created about an hour before this round with no sessions attached. They are not from this review and were left alone (`prune-test-dbs.sh`).

**Round-2 findings**
| # | Status | Evidence |
|---|---|---|
| N1 (Major) | **Fixed** | csv.ts:55 now uses `h.length` (UTF-16 units), the same unit as `Mapping`'s `z.string().max(200)` (ports/import-target.ts:64). Upload results by header: `"😀"×101` (202 units, the round-2 repro) gives **422 HEADER_TOO_LONG**. `"😀"×100 + "a"` (201 units) and `"h"×199 + "😀"` (201 units, 200 code points) give 422. `"h"×201` gives 422. Headers that pass, and the run gets through for each: `"😀"×100` (200 units), `"h"×200` and `"é"×200` each go 201 → DRY_RUN_READY → Run 201 RUNNING → job done → **COMPLETED** 1 created. A 200-unit astral header sent back as `null` in the dry run also ends COMPLETED. The check's DW1 fail test now includes the 101-emoji header (tests/check_pf10b_import_engine.ts:55). The error text still says "over 200 characters", which a non-technical importer reads as close enough: no finding. |
| N2 (Minor) | Not changed | Not in this diff; it stays a Should. |
| N3 (Minor) | **Partly fixed** | engine.ts:221 now re-throws P1001, P1002, P1008, P1017 and P2024, so the job stops and is retried. With Prisma 7 + `@prisma/adapter-pg` (the app's wiring), the codes that can happen are the socket ones: ECONNREFUSED → P1001 (probe: "Can't reach database server"), ECONNRESET → P1017, ETIMEDOUT → P1008. Those now stop and retry, which is sound and adds no new risk. When the stop happens after the retries run out, the batch stays RUNNING and a Run click resumes it, the same path as `ImportTargetUnavailable`. Still open: a server-side termination (a restart or failover, SQLSTATE 57P01) arrives as **P2010** with `meta.driverAdapterError.cause.code = "57P01"` and still becomes a lasting row error. Repro: `pg_terminate_backend` on the job's connection during row 1's transaction. The job did not stop: row 1 is `ERROR write_failed`, rows 2 and 3 CREATE, the batch is **PARTIAL**, and Run again gives 409 ALREADY_RUN. Deadlock and serialization faults are also still row errors: 40001 → P2034 is not in the list, and 40P01 is not mapped by the adapter. P1002 and P2024 cannot occur with this adapter (the pg pool has no acquire timeout here), so they are harmless dead entries. |

**New findings**
* **N4, Minor (Should), the rest of N3:** engine.ts:221 should also treat a driver-adapter SQLSTATE in classes `08` (connection) or `57P0x` (admin or crash shutdown), plus `40001` and `40P01`, as stop-and-retry. Those reach the catch as `meta.driverAdapterError.cause.code` or as P2034. The impact is unchanged from N3: the words are true ("could not be saved"), nothing is duplicated, and re-importing the file creates the row. Add one fail test with a target that throws a P1017-coded error, so the new branch is covered (no test exercises it today).
* No new Blocker or Major. The csv.ts change only makes the reader stricter (astral headers of 101 to 200 code points are now refused at upload, with words), and nothing else reads `MAX_HEADER`.

**Journey (reviewer, API-level only, no screen in part 1): 8/10.** This is up from 7. Round 2's dead end (a preview that passes, then a Run that can never happen) is gone. Every header that passes upload can now be run. The open Minors keep the score below 9: a same-minute Run click that queues nothing (N2), and a database restart mid-run that leaves a row as an error rather than retrying it (N4). No separate journey report was written (the caller limited the files written to this section).

**Verdict: Approve**: N1 is fixed with a fail test. M1 to M4 stay fixed (the builder's check, 46/46). N2, N4 and the rest of Minor 6 are recommended, not blocking.

Reviewer: Approve 27ea390fbd2e8e56e49983a693ff218d2a326988
