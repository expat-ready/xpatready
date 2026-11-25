# PF-21d part 1b: break report (approve, cancel, the daily erasure job)

Commit 2a39e147 (branch `claude/runtime-pf21d-erasure`). Scope: `git diff 43e53cec9...2a39e1473` only. Brief:
`screens/PF-21d/brief.md` (decisions 2-4, test list). Run in a throwaway worktree on scratch databases
(`xr_studio_brk21d_*`, Postgres 18 on :54329), never :4400. The shipped `check_pf21d_erasure.ts` passes 21/0. I added my own
attacks in two scratch scripts (`brk_pf21d.ts`, `brk2_pf21d.ts`, not committed, deleted with the worktree). The app runs as
xr_app through `WalledPool`; the job's firm transaction runs as xr_app in the order's firm. Paths below are relative to
`prototype/studio/`; "mig" means `prisma/migrations/20261123120000_pf21d_erasure/migration.sql`.

## Findings

| # | Attack | Expected | Actual | Sev | Where |
|---|---|---|---|---|---|
| 1 | Cancel lands while the job's firm transaction runs (the eraser makes a real `POST …/cancel` over HTTP with the Owner's token) | Either the cancel is refused (409) or nothing is erased | Cancel **200** (ERASURE_CANCELLED step, eraseOn cleared). The eraser still deletes the person's rows (2 → 0). The finish then sees `erase_on` NULL, returns `NOT_SCHEDULED`, and both result steps return `false`. The service ignores both. The request ends `IN_PROGRESS\|-`, steps `RECEIVED,STATUS_CHANGED,ERASURE_APPROVED,ERASURE_CANCELLED`, with no ERASURE_RESULT and no actions taken. `run()` still lists it under `erased` and logs nothing. **The data is deleted against a cancel the system accepted, and the register holds no record of the deletion** (SA-11-28, SA-11-40) | **Blocker** | service.ts:149-157 (transaction A neither locks nor re-reads the request); service.ts:164-168 (the outcome of `_step`/`_finish` is ignored); mig:46 (cancel is allowed on and after `erase_on`, but the brief's decision 4 says "cancel before `erase_on`"); mig:79-80, 95 (both return quietly) |
| 2 | Same window, but staff move the request by hand to COMPLETED (#3189's `POST …/status`) while the eraser runs | The job's result is recorded, or the move is refused | Move 200. The rows are erased. The request reads `COMPLETED\|2026-12-08` with `actions_taken` = the staff's hand text, no ERASURE_RESULT step, and `erase_on` still set. The erasure's own record is lost | Blocker (same cause as #1) | as #1 |
| 3 | A scheduled request moved by hand to COMPLETED before its day, then the job runs | The move is refused while an erasure is scheduled (the brief's touch list has "one status rule" in `register/requests/service.ts`), or the move clears the schedule | The move is accepted. The job skips the request and the person is **never erased**. `GET /api/system/erasure/requests/:id` returns `{status: COMPLETED, eraseOn: "2026-12-15"}`, i.e. "Erasing on" a date that will never come. Cancel → 409. This is a false COMPLETED on an approved deletion. `requests/service.ts` is not in the diff | **Major** | mig:57-58 (`_due` excludes COMPLETED; `erase_on` is never cleared); service.ts:86-88; the brief's touch list |
| 4 | A scheduled request moved by hand to HELD (note "on hold pending a check"), then the job runs | A request staff put on hold is not erased, or the move is refused while scheduled | Erased anyway. HELD → COMPLETED. Only a legal hold or a cancel stops the job, and nothing tells staff that | Minor (same missing status rule as #3) | mig:58 |
| 5 | Approve an OVERDUE request; approve a hand-HELD request | Brief decision 4: approve only from PENDING or IN_PROGRESS | OVERDUE: 200, the status stays OVERDUE, and it is then erased. HELD: 200, moved to IN_PROGRESS, which lifts the staff's hold without saying so. The function comment lists HELD; OVERDUE is not mentioned anywhere | Minor | mig:28-33 |
| 6 | Turn the "Data erasure" switch off in the middle of a run (during order 1 of 5) | The remaining orders stop (the switch is an emergency stop) | All 5 orders are erased. The switch is read once before the loop | Minor | service.ts:130 |
| 7 | Approve a merged-away person (`merged_into_id` set) | Refused, or the survivor is used (otherwise part 2 erases a tombstone and reports COMPLETED while the data lives on the survivor) | 200, scheduled | Minor (applies to part 2) | service.ts:55-56 |
| 8 | Cancel an order the job left HELD (legal hold) | Status goes back to a working state, or the cancel says it stays HELD | `HELD\|2026-12-01` becomes `HELD\|-`: nothing is scheduled and it stays HELD until someone moves it by hand | Minor | mig:46-48 |
| 9 | Database, as xr_app with no firm (the system plane's role) | The definers keep the 7-day window and the job's steps | `_approve(id, received_on+1)` → APPROVED, due at once (`p_erase_on` is taken unchecked). `_finish(id,'COMPLETED','forged: all erased',…)` → DONE, COMPLETED with no ERASURE_RESULT step and before its day. `_step(…,'ERASURE_RESULT','forged: ERASED',…)` → written. #3189's `_move` already gives the same power, so this is defence in depth only | Minor | mig:19-37, 71-106 |
| 10 | The table owner (xr_studio) runs `UPDATE … SET erase_on = received_on+1` | Brief test 10: "`erase_on` changes only through approve/cancel" | Accepted, with no step (only the CHECK at mig:15 applies). xr_staff_bypass and xr_data → permission denied; xr_wall_reader cannot log in | Minor | mig:15 (no trigger) |
| 11 | More than 501 orders held under legal hold (by reading) | New due orders still run | Blocked orders keep `erase_on` and sort first (`ORDER BY erase_on`), so 501 old held orders would push newer orders out every day | Minor | mig:57-59; service.ts:128 |

## What held
* **Who may:** no token → 401. A firm's staff, Support and Auditor → 403 on approve, cancel and read, each with a REFUSED line.
  A firm route `/api/platform/erasure/...` → 404. Only the Platform Owner holds `system/compliance:dsr-manage`.
* **Bad ids and bodies:** `abc`, an SQL quote, an id with `%20`, the zero uuid → 404. An upper-case uuid is normalised (200).
  A cancel note that is `""`, blanks, a number, `null`, an extra key, 2001 characters, a U+202E mark, or an array → 422
  ERASURE_FIELDS. A bare string → 400. A Chinese and Arabic note of 1998 characters is kept whole.
* **Requests that do not qualify:** ACCESS, CORRECTION, no person, a person in another firm → 422 with a code; unknown
  → 404; COMPLETED → 409. **Six concurrent approves → one 200 and five 409, with one ERASURE_APPROVED step** (the row lock).
* **Days:** approve at 23:59 Toronto erases on day +7; at 00:01, day +8. Across DST (7 → 14 Mar 2027) the date is right. The
  job at 23:59 Toronto the evening before does nothing; at 00:01 on the day it erases. Days 0-6 do nothing.
* **Legal hold:** a hold placed while a 7 s eraser runs waits for the job's transaction (placed after 6.5 s, the job's
  erasure finished first, no error), so the job's view of holds stays consistent. A PERSON hold → HELD, no eraser called, one step over two runs.
  Release → the next run erases.
* **Erasers:** a bad outcome (`DONE`) or an email in the note → the whole order rolls back (rows stay), it is counted failed,
  the job throws so it is retried, and no step is written. The log carries the error's name and stack frames only, never
  its message or value. An eraser reading or updating firm B's `fo_person` from firm A's transaction sees and changes 0 rows
  (the walls hold). One module failing rolls back the other. KEPT → HELD (partial), never COMPLETED.
* **Database:** every definer is refused in a firm's session, including after `SET LOCAL ROLE xr_staff_bypass`.
  xr_staff_bypass cannot write the table directly. An owner cannot update an event, cannot clear `erase_on` on a
  COMPLETED request, and cannot forge an event with a bad actor (the CHECK refuses it). Steps refuse non-erasure kinds;
  the function is EXECUTE for xr_data only (not PUBLIC, not xr_case_lookup). The migration runs right after the previous
  one on an empty and a demo copy; `migrate diff` is empty.
* Switch off → one SKIPPED step over two runs, still scheduled; on → the next run erases.

## Notes for the fix (not done here)
#1 and #2 come from one gap: the eraser's firm transaction and the register's record are two transactions, and neither
the request row nor an advisory key ties them together. Cancel and the hand move can land between them. Two possible
closes, for the builder to choose: (a) cancel and the move refuse once `erase_on <= today`, which is the brief's "before
`erase_on`", with the job re-checking `erase_on` and status under a lock the cancel and move also take; (b) the job treats
a `NOT_SCHEDULED` finish as a failure and logs it. The shipped check has no concurrency case; adding #1 as a test would
catch it.

**Verdict: Changes** (Blockers #1 and #2, Major #3)

## Round 2: a371f8901 (PR #3235), only `2a39e1473..a371f8901`
Fresh worktree. Shipped checks pass: `check_pf21d_erasure` 24/0, `check_pf21d_switch` 20/0, `check_pf21b_requests` 27/0.
The probes run mid-run: the second eraser waits inside the firm transaction, after the first has deleted the rows.
* **Held, B1:** cancel mid-run → 409 ERASURE_RUNNING (the claim is set). The erasure is recorded: two RESULT steps and COMPLETED.
* **Held, B2:** hand moves mid-run → COMPLETED and HELD both get 409 ERASURE_SCHEDULED; the job's result is recorded.
* **Held, M3:** hand moves while scheduled (before the day) → 409 ERASURE_SCHEDULED. The owner's direct `UPDATE … status='COMPLETED'`
  is refused by the guard trigger. Cancel on the day → 409 WINDOW_ENDED.
* **Held:** the daily sweep marks OVERDUE mid-run (allowed by the guard), then the finish goes OVERDUE → COMPLETED.
  A hold placed mid-run waits for the firm transaction, then is saved. Finish or step under a wrong claim → NOT_CLAIMED / false.
  Claim from a firm session → refused. Empty registry → SKIPPED. The switch is read per order (service.ts:134). Merged-away
  person refused (service.ts:56). Held orders sort last (mig:84).

| # | Attack | Expected | Actual | Sev | Where |
|---|---|---|---|---|---|
| R1 | Stale claim retaken while run 1 is still alive. Run 1 has deleted 2 rows; I age its claim by 31 minutes and run 2 starts | A late finish fails loudly and the record keeps what was erased | Run 1's finish returns NOT_CLAIMED and throws (counted failed, so the job fails), which is loud. But run 2 re-runs the idempotent erasers and records `test.rows: NOTHING (no rows)`, COMPLETED. **The register says nothing was erased while 2 rows were.** The log line carries only the error's name and frames. This needs a live run stalled for over 30 minutes between the erase commit and the record (the erase transaction caps at 120 s), so it is rare | Minor | service.ts:177-180; mig:101-102 |
| R2 | Release fails (EXECUTE on `_release` revoked) after an eraser throws | Failure step written, claim released, or the failure visible | Step and release share one transaction that is caught and swallowed, so the failure step is lost and the claim stays. Run 1 is still counted failed (loud). Runs within 30 minutes then skip the order **silently**: `one()` returns null, so it is neither failed nor skipped and the job succeeds. Cancel → RUNNING. After 30 minutes it is retaken and erased | Minor | service.ts:158-161, 141, 153 |
| R3 | After the day, with the switch off or a module failing daily | The person can still withdraw | Cancel → WINDOW_ENDED and hand moves → ERASURE_SCHEDULED, so no route stops the order until it runs. This follows the brief ("cancel before `erase_on`"); flagged for the tech lead | Minor | mig:71; guard mig:31-33 |
| R4 | Round-1 Minors not touched by this diff: #5 approve of OVERDUE/HELD, #8 cancel leaves HELD, #9 definers trust `p_erase_on`, #10 owner `erase_on` edit (the guard only covers status) | n/a | Still as in round 1 | Minor | mig:52-56, 72 |

No Blocker or Major is open: B1, B2 and M3 are closed. R1-R4 are Minor.

**Verdict: Approve** (a371f8901)

## Round 3: 2d698e315 (PR #3235), only `4689c3469..2d698e315`
The diff checks out as stated: the migration's only change is the F4 comment line (154); the suite, rows file and brief
swap the stamp; service, routes, feature and schema code are unchanged apart from main's and #3234's merges. Fresh
worktree. The shared `studio/node_modules` Prisma client is stale (no `erase_on`, no breach tables), so the full-app
checks ran on a private overlay with a client generated from this head. Nothing written to the shared copy.
* **Held, migration:** `check_pf21d_erasure` 24/0 (the stamp is after `20261124080000_pf21d_switch`; empty and demo copies
  show "850"; `migrate diff` is empty). `prisma migrate deploy` of all 24 Nov migrations on a new database: all applied.
  `check_pf21d_switch` 20/0, `check_pf21b_requests` 27/0, `check_pf8b_f4_migrations` 9/9, `f5_pg18_grants` 14/14,
  `f6_pg18_nobypass` 26/26, `f7_data_walls` 17/17, `f8_seeds_nobypass` 15/15.
* **Held, main since 23 Nov:** no later migration touches `plat_data_request`, its triggers, `erase_on`/`erasing_since` or
  `plat_data_request_erasure*`. pf21c, fo6d and pf17 only GRANT and REVOKE CREATE for xr_wall_reader around their own
  definers. `check_fo9b_merge` 88/0, `check_pf17_support` 29/0, `check_pf17_console` 38/0, `check_pf4s_system_signin`
  104/104, `check_features_registry` 27/0, `check_pf14_jobs` 95/0, `check_pf23w_jobs_wired` 31/0, `check_pf1_module_routes`
  28/28, `check_pf12_walls` 110/0, `check_pf12b_doors` 33/0. The queue `platform.register.erasure_daily` is used only by
  this item.
* **Held, mid-run probes** (scratch copy of the shipped suite, deleted). The second eraser waits inside the firm transaction:
  - cancel → 409 ERASURE_RUNNING; hand move to HELD → 409 ERASURE_SCHEDULED. Both tried through the HTTP routes and
    through the services. A GET mid-run → 200 IN_PROGRESS. The run then ends COMPLETED with two RESULT steps.
  - The daily `sweep()` mid-run marks OVERDUE. A cancel and a move to COMPLETED are then refused (RUNNING, SCHEDULED),
    and the finish goes OVERDUE → COMPLETED.
* **Not a finding:** no shared database can hold the old stamp `20261123120000`, because the branch never reached main.
  Only scratch copies applied it.

| # | Attack | Expected | Actual | Sev | Where |
|---|---|---|---|---|---|
| R3-1 | Merge current main (a26e80b6a, which includes #3209 AUD-3 part 1, merged after this branch's base a79e246c6) into 2d698e315 (merges cleanly), then start the API (`api/src/main.ts`, scratch database, port 4493) | The API starts | **The API exits at start-up.** `SystemAccessLines.onModuleInit` → `assertFirmDataDeclared` throws: "AUD-3: each of our staff's routes declares what it does with firms' data … ErasureController.read (/api/system/erasure/requests/:id), ErasureController.approve (…/approve), ErasureController.cancel (…/cancel), PlatSwitchController.list (/api/system/switches), PlatSwitchController.set (…/:key)". Control: the unmerged head starts on :4494 and answers 401. On the merged tree `check_pf12_walls` goes 110/0 → 105/5 ("the API starts as xr_app" fails at the init hook). `check_aud3_access` stays 30/0 because its list (line 216) names fixed features and omits platform-erasure. A builder's PR runs no suites, and this PR's base is #3234's branch, not main. Its CI therefore cannot see the failure until it retargets. Once merged, the demo, which updates itself, would not start. Each route needs one of `@ReadsFirm` / `@ChangesFirm` / `@ReadsAcrossFirms` / `@NoFirmData`. The register's own routes use `@ReadsAcrossFirms` for reads and `@NoFirmData` for changes. The switch routes are #3234's, the same gap in 1a | Blocker | api/src/platform/erasure/routes.ts:15,18,21 (1a: switches/routes.ts:15,18); main's audit/access/lines.ts:115-128 |
| R1 | Re-run: a stale claim is retaken while run 1 is alive (claim aged 31 minutes; run 2 starts while run 1's delete is uncommitted) | The record keeps what was erased | Unchanged from round 2. Run 1 fails NOT_CLAIMED (failed 1, loud). Run 2 records `test.rows: NOTHING (no rows)` and COMPLETED while 2 rows were erased | Minor | service.ts:177-180 |
| R2-R4 | Round-2 Minors | n/a | Untouched by this diff; still as in round 2 | Minor | as round 2 |

R3-1 is a Blocker that only appears once this branch takes current main. It does not come from the re-stamp. The
migration itself holds.

**Verdict: Changes** for 2d698e3152788b7b05b92cdfeadd4844939cb233 (Blocker R3-1)
Note: at the end of this round the branch was already at 452b1e122 (1b's routes declared) on eb19e71ad (1a's switch
routes declared). Those heads were not broken here. A re-run should start from that head.

## Round 4: 4d72360f6 (PR #3235), only `2d698e315..4d72360f6`
Fresh worktree at the head, which already contains current main (a26e80b6a) and #3234 (eb19e71ad). Private Prisma client
generated into an overlay; the shared copy was not written. Scratch copy of the shipped suite, deleted with the worktree.
* **Held, R3-1 closed:** `isolated.sh brk1b 4479 start` → API up; `/api/health` 200; GET `…/erasure/requests/<uuid>`,
  POST `…/approve` and GET `/api/system/switches` → 401 without a token; stopped, database dropped. `check_pf12_walls`
  110/0 (105/5 in round 3), `check_aud3_access` 30/0 (opt-out list names ErasureController.cancel and both switch routes),
  `check_pf21d_erasure` 25/0, `check_pf21d_switch` 20/0, `check_pf21b_requests` 27/0.
* **Held, merged person:** merged after approval → one ERASURE_HELD step with why, no eraser, rows stay, still scheduled.
  Repeated runs write no second step (r5 over 6 runs). Merge and Undo before the day → erased on the day. Undo after the
  HELD → the next run erases (COMPLETED, 2 rows). That is the approved order on a live record again. Person deleted →
  HELD, no eraser. Moving a person to another firm is refused by the fo_person trigger. Gone-HELD then cancel after the day
  → 200 (the cancel allows HELD), erase day cleared, the next run takes nothing, and a hand move to COMPLETED is then allowed.
* **Held, round-2 mid-run probes:** while the second eraser waits, the daily sweep marks OVERDUE, cancel → 409
  ERASURE_RUNNING, a hand move → 409. The run then ends COMPLETED with two RESULT steps (the GET was not re-run: the token
  had expired after the 31-day clock jump).

| # | Attack | Expected | Actual | Sev | Where |
|---|---|---|---|---|---|
| R4-1 | A merge commits between the run's person check and the erasers. The hook sits on `holds.isHeld`, which runs right after the check: P6's 2 rows are moved to the survivor and P6 is tombstoned, on another connection | HELD, never a false COMPLETED | **COMPLETED**, `test.rows: NOTHING (no rows)`, while P6's 2 rows now sit on the survivor. The check runs on its own pooled connection (`foPersonCheck` → `this.db`, not `tx`). It takes no lock, and the merge's `pg_advisory_xact_lock('fo_dup_merge:<id>')` is not taken, so nothing orders the merge against the erasers. Once an eraser has deleted a row that the merge must re-point, the merge waits. So the window is from the check to the first eraser that locks one of this person's rows: milliseconds, once a day, and only for a merge of that person. It stays latent until part 2 registers real erasers (today the app records SKIPPED). Possible fix: take the merge's advisory lock for the person inside the firm transaction, then check through `tx` | Minor | service.ts:55-56, 171 |
| R4-2 | Legal hold → HELD. Then the hold is released and the person merged away | A HELD step with the new why | No new step. `erasure_step` p_once compares the kind only, so the request still reads "On legal hold … Sample: litigation hold" although that hold is released and the real block is the merge. The same happens when one hold is replaced by another | Minor | service.ts:186; mig:128-129 |
| R1-R4 | Round-2 Minors | n/a | Untouched by this diff | Minor | as round 2 |

No Blocker or Major is open. R3-1 is closed; R4-1 and R4-2 are Minor.

**Verdict: Approve** for 4d72360f6d69db7b0f3e4d62aa1f0b510f80608b

## Round 5: 77997e39d (PR #3235), only `4d72360f6..77997e39d`
Fresh worktree at the head. The shared Prisma client was current enough for this suite (no private client needed). The
scratch copy of the shipped suite drove FO-9b's real `PersonMergeAdapter` (xr_app, `walledPool`, `withFirm`). The
worktree and scratch databases are removed.
* **Held, suites:** `check_pf21d_erasure` 27/0 (the two new lines pass), `check_fo9b_merge` 88/0.
* **Held, R4-1 closed (real merge path):**
  - B1: the real merge (loser = the order's person) fires from inside the eraser → `MergeBusy` after its NOWAIT back-off
    (about 0.9 s). COMPLETED, 2 rows erased, the person still live. The same merge after the run → ok.
  - B2: the order's person as survivor → `MergeBusy`, COMPLETED.
  - The shipped raw-UPDATE line (lock_timeout) → refused by the lock.
* **Held, merge holds its locks first:** the merge is done but uncommitted while the run starts.
  - B3, the order is on the loser: the run waits on `FOR SHARE` (seen in pg_stat_activity). After the commit, the
    re-check finds the row merged → HELD with the "merged away" why, rows stay, no eraser.
  - B3b, the order is on the survivor: the run waits, then erases the survivor → COMPLETED.
* **Held, Undo racing:**
  - B4a, Undo uncommitted while the run checks the tombstoned loser: the check does not wait (the visible version fails
    the WHERE) → HELD "merged away". The next run, after the Undo commits → COMPLETED, 2 rows. Conservative, recovers.
  - B4b, the run holds the survivor, Undo is attempted from inside the eraser → `MergeBusy`, COMPLETED.
* **Held, deadlock:** FO-9b's merge and Undo take every lock NOWAIT, so they never wait and cannot deadlock with the run.
  - B5, a raw writer that is not FO-9b's (locks the person's rows, then updates the person) does deadlock with the run.
    PostgreSQL aborts the run's eraser: failed 1, step `test.rows: FAILED — nothing was erased; the next run retries`,
    still IN_PROGRESS with its erase day, rows intact. No false COMPLETED.
* **Held, R4-2 closed:**
  - One hold over 6 runs → 1 HELD step. Hold B added → 2. A released → 3. B swapped for C → 4. Merged + C released → 5,
    each naming its current reason. Unmerged → the next run erases.
  - Three holds placed in one statement (same `placed_at`) over 5 runs → 1 step: xr_app's `plat_legal_hold_active`
    orders by `placed_at, id`.
  - The SKIPPED reasons are fixed strings, so switch off and no erasers still write one step per reason.
* **Not a finding:**
  - Approve's check now runs in its own short firm transaction, so its FOR SHARE ends before approve commits. A merge
    landing there is caught by the run's re-check (HELD). That is the design.
  - The run's FOR SHARE makes staff edits of that person wait while the run erases. Bounded by the 120 s transaction.
* **Left alone:** 12 older `xr_studio_pf21d*_<pid>` / `pf21ds_*` databases (pids 4204, 9007, 32172, 32723; no live
  process). None was created this round, so they were not dropped.

| # | Attack | Expected | Actual | Sev | Where |
|---|---|---|---|---|---|
| R4-1 | Re-run with FO-9b's real merge and a raw UPDATE, mid-run | No false COMPLETED | Closed: `MergeBusy` / lock refusal; COMPLETED with rows erased, or HELD when the merge committed first | n/a | service.ts:57-58, 173 |
| R4-2 | Hold → HELD, then the reason changes | A new HELD step per new reason; one per unchanged reason | Closed (5 steps for 5 reasons, 1 over 6 runs) | n/a | mig:128-129 |
| R1-R4 | Round-2 Minors | n/a | Untouched by this diff | Minor | as round 2 |

No Blocker or Major is open.

**Verdict: Approve** for 77997e39d1282cfbb2ff4bb867480f324b9f8ef1

## Round 6 (diff only: `git diff 54ad5b8c2 d3680b44e`, Lead 27)

How it was tested: a scratch copy of the shipped suite (never committed), run on two worktrees, d3680b44e and its parent
0d594e988. Postgres 18 on :54329, scratch databases only. The service's Db connected through a **real TCP proxy**: the
eraser's transaction sends a marker, the proxy passes its COMMIT on, waits for the server's `COMMIT` CommandComplete
(so the commit is durable), then cuts both sockets before the answer reaches the client. A second test used a
**real `pg_terminate_backend`**, fired from another session while COMMIT ran a deferred 3 s constraint trigger.
Order shape as in the suite: HELD, the hold lifted, now due. Cancel was called over HTTP with a fresh Owner token.
The shipped suite at head: 29/0.

| # | Attack | Expected | Actual | Sev | Where |
|---|---|---|---|---|---|
| R6-1 | The erasers commit and COMMIT's answer is lost; **before the next run a new legal hold is placed on the person** | The claim stays until a run records that the data may be gone; cancel stays 409 | The retake goes down the hold path. It writes `ERASURE_HELD` "On legal hold; **nothing was erased**", and `finish('BLOCKED')` clears the claim. Then cancel → **200**: ERASURE_CANCELLED, register `HELD\|-`, person's rows 0. The register reads cancelled, its last step says nothing was erased, and the data is gone: the very outcome Leads 26 and 27 closed. Not a regression (the parent does the same, and worse, at once), but the fix's promise "a run after 30 minutes retakes it and records the result" does not hold here | **Major** | service.ts:185, 203-205 (the hold path runs before anything checks that an earlier run may have erased); mig:142 |
| R6-2 | Same, but the person is **merged away** before the retake (or, in part 2, an eraser removes or merges the person record itself) | As R6-1 | The retake goes down the gone path. It writes "merged away … nothing was erased; Staff choose the person: cancel", clears the claim, and cancel → **200** over erased rows. Same cause as R6-1 | **Major** (same fix as R6-1) | service.ts:183, 198-200 |
| R6-3 | A COMMIT that really fails, every run (a deferred FK raised at COMMIT), 3 retakes | Cautious, not harmful | Each run: failed 1, claim kept, cancel 409, rows stay. One "The erasers ran, but their result could not be recorded" step per run. Once the fault is gone the next run erases → COMPLETED. Not stuck for the job. But while the fault lasts, a HELD order cannot be cancelled and no one has a way out (the 409 text names no remedy). At the parent it was released at once and cancel → 200 | Minor | service.ts:160-164, 190 |
| R6-4 | The run dies **before** the erasers (claim 2 h old, nothing erased), then cancel | Trade-off | Cancel → 409, and the next run erases a request staff wanted to cancel. Before 0d594e988 a 30-minute-old claim was cancellable. A claim alone cannot tell "died before" from "died after", so refusing is the safe side. Accepted trade-off, written in mig:70 | Minor | mig:70 |
| R6-5 | COMMIT's answer is lost, then the switch is turned off before the retake | No false "nothing erased" | A `ERASURE_SKIPPED` step "switch is off; **nothing was erased**" lands on the claimed order, since the step skips the claim check for SKIPPED. Claim kept, cancel 409. With the switch back on → COMPLETED | Minor | service.ts:139; mig:126 |
| R6-6 | The record after a retake (S1, and a run that died after commit, claim 10 days old) | The register shows what was erased | COMPLETED, but actions_taken reads `test.rows: NOTHING — no rows` for every module, although that run's first attempt deleted 2 rows. This follows port rule 4. In the died case no "could not be recorded" step precedes it. After `pg_terminate_backend` the kept step was not written either: the next pooled query failed with `Connection terminated unexpectedly` (seen with a temporary log; the step is best-effort) | Minor | service.ts:163 (`.catch`) |

* **Held:**
  - **Lead 27, for real.** The proxy cut the connection after the server committed. At 0d594e988 the run releases the
    claim and writes "nothing was recorded as erased". Cancel → **200**, ERASURE_CANCELLED, rows 0: reproduced. At
    d3680b44e: failed 1, rows 0, claim kept, the "could not be recorded" step written, HTTP cancel → **409
    ERASURE_RUNNING**. Claim aged 31 min → the retake records **COMPLETED**.
  - **Backend killed during COMMIT (a certain rollback).** Rows stay, claim kept, cancel 409. The retake erases →
    COMPLETED. Cautious, recovers. The same holds when Prisma's 120 s timer ends the transaction after the last eraser
    returns (by reading).
  - **Died after commit, claim 10 days old:** cancel 409, the next run → COMPLETED.
  - **Cancel with no claim still works.** Before the day: 200. On a HELD-blocked order with its hold still on (after
    BLOCKED, no claim): 200, rows stay.
  - **The `gone` and `held` returns inside the erasers' transaction leave `state.erased` false.** A lost answer there
    releases the claim, which is correct: nothing was erased.
  - **`state.erased` is set after the last eraser and nothing runs between it and the callback's return** (service.ts:190).
* **Cleaned up:** both worktrees (with their symlinks and `.tools`) and every scratch database this round created
  (dropped in `finally`).

R6-1/R6-2 are open, each Major: a retake can still end with the register cancelled over erased data.

**Verdict: Changes** for d3680b44ef3965777fdbfbbdbba46030c9b26ae2

## Round 7 (diff only: `git diff d3680b44e 88cfadbe5`, Lead 27)

How it was tested: **Postgres 18 on 127.0.0.1:54329 refused connections** (`pg_isready`: no response; psql: connection
refused). I did not start it, so no scratch database or proxy run happened this round. Runtime evidence comes from CI at
88cfadbe5: `check_pf21d_erasure.ts | PASS | 31 passed, 0 failed` (parts job 138376018710). That run covers probe 1
(r10: retake under a new hold), probe 4 (r11: retake whose eraser throws), and probe 3 without the hold (r8: COMPLETED
with the "not recorded" prefix). I walked probes 2, 3 (hold placed then lifted), 5, 6, 7 and 8 through
service.ts and the migration at head. CI's `types` failure is tsc running out of heap (exit SIGABRT), not this diff.

| # | Attack | Expected | Actual | Sev | Where |
|---|---|---|---|---|---|
| R7-1 | Probe 7 with the hold **still on**. After a retaken PARTIAL end, staff re-approve (the code invites it: "staff may approve it again") | Never cancellable over data that may be gone; no "nothing was erased" | Approve sets HELD → IN_PROGRESS with a new erase day. The day's run is not retaken (no claim), so it takes the plain hold path: `ERASURE_HELD` "On legal hold; **nothing was erased**." and `BLOCKED`. Cancel then returns **200** (a HELD order skips WINDOW_ENDED). The data the first run erased may be gone. This needs a deliberate staff action, and `actions_taken` keeps "An earlier run may have erased…" (BLOCKED and cancel do not touch it). The words are the same R6-5 ambiguity that this diff fixed for SKIPPED only | Minor | service.ts:215-217; mig:50-56, 69-72, 148 |
| R7-2 | Probe 7 with the hold lifted: re-approve, then a later run | Erases what is left; the record keeps the unknown | The run erases what is left → COMPLETED, which is correct. But `actions_taken` is overwritten with this run's `NOTHING (no rows)`, so "an earlier run may have erased" survives only in the trail (the r6 M2 second symptom, back after a re-approve). The re-approve also announces a fresh 7-day recovery window over data that may already be gone | Minor | service.ts:223-225; mig:148 |
| R7-3 | Probe 4 wording. A retake whose eraser throws | The failure is visible on the request | Claim kept, cancel 409: correct (CI r11). But the kept-claim step is written with `p_once = true` and the same note, so it collapses onto the first run's step: the retake's `<module>: FAILED` never becomes a step and is only in the log. Where the first step was never written (the run died before erasing, or the step's connection was also lost), the retake writes "The erasers **ran** …" although its own eraser failed. While the eraser keeps failing there is no way out (R6-3 continues; the 409 text names no remedy) | Minor | service.ts:161-165 |
| R7-4 | Probe 2 as a test | Each fixed outcome has a fail line | There is no fail line for "retake → person gone". By reading: narrowing `done.kind !== "ran"` to `=== "held"` sends a gone retake to `BLOCKED`, which releases the claim, so cancel → 200. The suite stays green, because r10 covers only the hold case. Not run (no database) | Minor | service.ts:203; check_pf21d_erasure.ts:286-299 |
| R7-5 | Many or long hold reasons on a retake | Words stay whole | `${unknown} ${why} Nothing more was erased.`.slice(0, 2000) can cut off the closing sentence. What is left is still true | Minor | service.ts:205 |
| R7-6 | Probe 6: the run died **before** erasing; the retake says "may have erased" | Honest | Acceptable. "May" is true, and a claim alone cannot tell before from after (as R6-4). The cost: if a hold lands first, the order ends HELD with no erase day, so a cancel that would have been legitimate is lost and staff must re-approve | accepted | mig:105 |

* **Held (CI or by reading):**
  - **(1) New hold, then retake** (CI r10): the order ends HELD with erase_on null (`HELD|-`). The step and
    `actions_taken` say an earlier run may have erased and its result was not recorded. There is no "On legal hold;
    nothing was erased" step, cancel → 409 NOT_SCHEDULED (erase_on null, mig:69), and no eraser is called (the hold
    returns before the loop, service.ts:186).
  - **(2) Person merged, then retake:** the same branch (service.ts:203-208). `finish('PARTIAL')` clears erase_on, so
    cancel → 409. A re-approve is refused with 422 PERSON_NOT_IN_FIRM (service.ts:105), so this order cannot be
    re-opened into a cancel.
  - **(3) Hold placed, then lifted, then retake:** the erasers run again (idempotent) → COMPLETED. `actions_taken` is
    prefixed "An earlier run's result was not recorded; it may have erased first." (service.ts:224; prefix shown in CI r8).
  - **(4)** CI r11: failed 1, `erasing_since` still set, cancel → 409 ERASURE_RUNNING.
  - **(5) Switch off:** `run()` writes SKIPPED "this run erased nothing" before `claim()` is called, so the claim is
    untouched and cancel → 409 RUNNING (mig:70). The words are true.
  - **(8) Every retaken outcome:** COMPLETED, KEPT-PARTIAL and held/gone PARTIAL all clear erase_on. A throw, a failed
    record, a refused finish and a lost record-COMMIT answer (finish committed: the order is ended, and the kept step
    no-ops) all keep or end the claim. None leaves the order cancellable. The only way to a cancel is R7-1's deliberate
    re-approve.
  - **`retaken`** is true exactly when a claim older than 30 minutes was replaced (mig:102-105). A fresh claim
    returns no row, so a second concurrent run skips the order.
* **Cleaned up:** the worktree, its symlinks and `.tools` are removed. No scratch database was created.

R6-1 and R6-2 are closed. Of the open findings none is a Blocker or Major (R7-1 needs a deliberate re-approve, and the
record keeps the unknown).

**Verdict: Approve** for 88cfadbe57a24e2fd6dcbf6a14e4d7c87de7b021
