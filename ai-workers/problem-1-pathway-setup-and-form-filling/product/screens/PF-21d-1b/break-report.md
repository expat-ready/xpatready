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
