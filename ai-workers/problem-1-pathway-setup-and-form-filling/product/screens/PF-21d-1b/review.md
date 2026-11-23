# PF-21d part 1b: review (approve, cancel, the daily erasure job)

Commit `2a39e1473e3e32652381214ef07318106e1a0dc3` (branch `claude/runtime-pf21d-erasure`, stacked on 1a `43e53cec9`, on
#3189). Scope: `git diff 43e53cec9...2a39e1473` only: 7 files, +576/-5 = 581 changed lines (P-610: under 800, met).
Spec: `screens/PF-21d/brief.md` decisions 2-4, test list, "Split of part 1"; SA-11-16, -18, -28, -40 (trace tool).
Run in a throwaway worktree on scratch databases (Postgres 18, :54329), test app on :4431 (runtime range), never :4400.
Paths below are under `prototype/studio/`; "mig" = `prisma/migrations/20261123120000_pf21d_erasure/migration.sql`.

**Verdict: Rework** (two Blockers, three Majors). No screen is in this item, so the D/BIC scoring is mostly N/A.

## Suites at this commit
| Suite | Result |
|---|---|
| check_pf21d_erasure (twice) | 21 passed, 0 failed; 21 passed, 0 failed |
| check_pf21b_requests / check_pf21b_holds / check_pf21b_port | 27/0 · 67/0 · 32/0 |
| check_pf12_walls · check_features_registry · check_pf23w_jobs_wired · check_prisma_schema | 110/0 · 27/0 · 31/0 · 8/0 |
| check_pf8b_f4 / f5 / f6 / f7 / f8 (migration on an RDS-like runner, grants, walls, seeds) | 9/9 · 14/14 · 26/26 · 17/17 · 15/15 |
| **check_pf21d_switch** (1a's suite) | **exit 1, silent** (see B1) |
`select-suites.mjs` on this diff picks **ALL** (the migration is shared), so CI runs check_pf21d_switch and goes red.

## Issues, ranked (each with the fix and a fail test)
1. **Blocker B1: 1a's suite breaks.** 1b adds `ERASURE_DAILY` (needs `PlatformJobs`) and `Erasure` to the feature's
   providers (`api/src/features/platform-erasure.ts:18`). `tests/check_pf21d_switch.ts:101` spreads `feature.providers`
   with no PlatformJobs, so Nest aborts during start-up. With `logger: false` it exits 1 with no FAIL line. Re-run with
   logging on: `Nest can't resolve dependencies of the Symbol(Erasure.daily) (Erasure, ?) … PlatformJobs at index [1]`.
   Fix: give that suite the same PlatformJobs stub as check_pf21d_erasure, then run it again.
2. **Blocker B2: a cancel during a running order still erases, and the register keeps no record.** The firm
   transaction (`api/src/platform/erasure/service.ts:149-157`) does not lock the request. Cancel (mig:39-50) locks the row,
   clears `erase_on` and returns 200. The erasers commit. The result transaction's `_step` returns false and `_finish`
   returns `NOT_SCHEDULED`, and `service.ts:164-168` ignores both. Probe (an eraser that waits while `cancel` runs): cancel
   200, rows 2 → 0, request `IN_PROGRESS|-`, steps `…ERASURE_APPROVED,ERASURE_CANCELLED`, no ERASURE_RESULT, and
   `run()` reports it as erased. The breaker found the same (break-report #1-#2). Fix: take the order in a system
   transaction (a `_claim` definer, `FOR UPDATE`) and keep it open across the firm transaction. Write the steps and the
   finish in that same transaction. A cancel then waits and gets 409. Treat any `_finish` answer other than `DONE` as a
   failure. Fail test: the waiting eraser plus a cancel → 409, and ERASURE_RESULT plus COMPLETED recorded.
3. **Major M1: a false COMPLETED when no eraser is registered.** At this commit no module registers an eraser.
   Part 2 adds them; `grep` finds no `ErasureRegistry.register` outside tests. Yet the job is live in the real app
   (`check_pf23w_jobs_wired` passes) and the switch is on by default. `service.ts:167-168` finishes such an order COMPLETED
   with "No module holds data for this person; nothing to erase.", even though `fo_person` still holds the data. That
   breaks decision 3 and SA-11-28 ("never falsely COMPLETED"). Fix: with no eraser registered, never finish. Write one
   `ERASURE_SKIPPED` ("no module has registered its eraser; nothing erased"), keep the order scheduled, and add a fail
   test with an empty registry.
4. **Major M2: a failure is not shown on the request.** SA-11-40 Failure says "the request shows IN_PROGRESS with the
   error". The brief's test 7 says "the failure is a step". The catch (`service.ts:139-141`) only logs, and the
   suite's failure line (`tests/check_pf21d_erasure.ts:186`) asserts that there is no step. Fix: after the rollback,
   write a step once in a system transaction naming the module only (e.g. ERASURE_RESULT "<module>: FAILED, rolled back,
   nothing erased; retried next run", `p_once`), and assert it.
5. **Major M3: a manual COMPLETED leaves an erasure scheduled on a completed request.** #3189's move
   (`pf21b migration:151-166`) still allows COMPLETED while `erase_on` is set. Probe: move 200, the row reads
   `COMPLETED|2026-12-08`, `GET /api/system/erasure/requests/:id` says `eraseOn: 2026-12-08`, and the job never runs
   (the rows stay). The brief's touch list kept "one status rule" in `register/requests/service.ts` for this. Fix: the
   move refuses COMPLETED while an erasure is scheduled (409 "cancel the erasure first"), and
   `plat_data_request_erase_on_set` (mig:15) adds `status <> 'COMPLETED'`. Add a fail test.
6. Minor m1: approve also accepts HELD and OVERDUE (mig:28-33). Decision 4 says PENDING or IN_PROGRESS. A re-approve after
   a partial run re-runs every eraser and overwrites `actions_taken`, so the first run's ERASED drops out of it (the steps
   keep it). The step names also differ from the brief (`ERASURE_RESULT`, `ERASURE_SKIPPED`; `ERASURE_HELD` is added). Both
   are reasonable, but neither is declared: record them in the PR or a challenge, or narrow approve.
7. Minor m2: the switch is read once per run (`service.ts:130`), so a trip mid-run does not stop the rest of that run's
   orders (SA-11-16 (d), "emergency stop"). Read it per order.
8. Minor m3: the approve and cancel audit targets carry `requestId` and `eraseOn` but not the person-record id (SA-11-40 §9).
9. Minor m4: user-facing text names a requirement id: "…(SA-11-40: one person, chosen by staff)" (`service.ts:102`, D10).
   A whitespace-only optional cancel note answers "This is required."
10. Minor m5 (tests): approving a COMPLETED request (`APPROVE_REFUSED`) is untested. Remove mig:28 and the trigger answers
   500, not 409. Also untested: a FIRM hold, a hold placed while erasers run (the lock wait), cancel's REFUSED lines, and
   `_step`/`_finish` in a firm session (my probe: both are refused).
11. Minor m6 (known risk, accepted by port rule 4): a crash between the two commits makes the rerun record the idempotent
   NOTHING results, so the register understates what was erased. Held orders keep their slot at the head of the
   501-row due list. Both are worth a line in the card.

## Judged correct
* **MOVES:** approve moves PENDING or HELD → IN_PROGRESS. Finish moves IN_PROGRESS, OVERDUE or HELD → HELD or COMPLETED. Every
  move is in #3189's MOVES. OVERDUE stays OVERDUE on approve. `completed_on` is set exactly when COMPLETED.
* **Hold check:** `isHeld(PERSON)` runs first inside `withFirm(order firm)` and one default (READ COMMITTED) transaction.
  The adapter takes the shared lock itself and keeps it until the erasers commit. A FIRM hold matches by the port's
  `scopeMatches`. When held, no eraser is called; the request reads HELD, stays scheduled, and is erased after release.
* **Firm scope:** `WalledPool` sets `app.firm_id` from the ALS scope that `withFirm` opens. The suite proves each eraser
  sees firm A only. A family member's rows and firm B's rows stay.
* **Definers:** all six are owned by xr_wall_reader, EXECUTE for xr_data only, each calls `plat_data_request_system_only`,
  and `search_path` is pinned. My probe: `_step` and `_finish` are refused in a firm session, and xr_app's direct
  UPDATE of `erase_on` is denied.
* **Day maths:** Toronto day + 7, with the date arithmetic in UTC. Approve at 23:30 Toronto on 30 Nov → `2026-12-07`.
* **Idempotency and input:** `p_once` writes one SKIPPED or HELD over several runs. A double-click approve gives 200 and
  409 with one step. Problem Details for bad notes (number, extra field, bidi, 2001 chars) and bad ids. One audit line per
  change, ALLOWED or REFUSED. Non-English notes are stored as entered.
* **Migration:** additive with a rollback note. `migrate diff` is empty. It runs right after itself on empty and demo copies.

## D1-D20 (API item; "N/A" = no screen in this item)
D1 Partly (M1, M2, M3 against SA-11-28/-40) · D2 Not met (B2: a deletion with no record) · D3 Met (reuses the register and
ports) · D4 N/A · D5 Partly (rollback and retry are good; B2) · D6 Met (each step has its actor and time) · D7 N/A (no AI) ·
D8-D14 N/A · D15 Met (approve 17 ms; no per-row requests) · D16 Partly (B1 red suite; m5 gaps) · D17, D20 simulated only ·
D18 Partly (the steps name module and counts; a failure leaves no trace, M2) · D19 N/A (part 2 completes it).
**BIC-01 to BIC-20:** N/A (no case-side screen). **Graph (P-86):** GRAPH.md does not list `/api/system/*` routes, so nothing to check.
**Journey score (reviewer): 6/10, fail.** See `journey-test-reviewer-2026-11-23.md`.

## Could not check
No screen, so no browser walk, axe or widths. No real eraser (part 2). No real PF-14 runner retry or backoff (the suite
stubs PlatformJobs). D17/D20 stay with the founder.

**Verdict: Block.** To fix: B1, B2, M1, M2, M3, each with a fail test. Then fix the Minors or list them in the PR.

Reviewer: Block 2a39e1473e3e32652381214ef07318106e1a0dc3
