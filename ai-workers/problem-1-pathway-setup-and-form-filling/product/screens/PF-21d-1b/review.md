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

## Round 2: `a371f89019cc458b05eae2c38d6cff20a1ec387d` (PR #3235)
Scope: `git diff 2a39e1473..a371f8901`. It includes the merge of 1a's round-1 fixes; I read those only where 1b depends on
them (the registry's frozen `{module, erase}`, `isOn`). Run in a fresh worktree on scratch databases (never :4400).
1b's size against the new 1a head is 683 changed lines of code and tests (P-610, under 800: met).

**Suites:** check_pf21d_erasure 24/0 and 24/0 · check_pf21d_switch 20/0 · check_pf21b_requests 27/0 · check_pf21b_holds 67/0 ·
check_pf21b_port 32/0 · check_features_registry 27/0 · check_pf23w_jobs_wired 31/0 · check_prisma_schema 8/0 ·
check_pf8b_f6 26/26 · check_pf8b_f4 9/9.

| Round 1 | Status | Evidence |
|---|---|---|
| B1 1a's suite fails to start | Fixed | PlatformJobs stub in `tests/check_pf21d_switch.ts:102`; 20/0 |
| B2 a cancel during a run | Fixed | The claim (`plat_data_request_erasure_claim`, `FOR UPDATE`, its own commit) comes before the firm transaction. Steps and finish run only under that claim (`_step` and `_finish` compare `erasing_since`). A finish that is not `DONE` throws (`service.ts:179-180`). The guard trigger refuses everything but the OVERDUE mark while the request is claimed. The new suite line (a waiting eraser, then cancel → `ERASURE_RUNNING`, then a hand move → 409, then COMPLETED with two results) fails if the claim is removed. My probe: a fresh claim held by another run is skipped and cancel gets 409; a claim 31 minutes old is retaken and completes; the daily mark moves a claimed request to OVERDUE; a hand move is still 409 |
| M1 a false COMPLETED with no eraser | Fixed | With an empty registry: one SKIPPED step, the order stays scheduled (`service.ts:134-138`). Tested before any eraser registers |
| M2 a failure not on the request | Fixed | A step naming the module under the claim, then the claim is released (`service.ts:153-163`). The suite asserts the exact note |
| M3 a hand COMPLETED while scheduled | Fixed | The guard trigger gives 409 `ERASURE_SCHEDULED`, mapped in `requests/service.ts:119-123`. The check now holds COMPLETED ⇒ no `erase_on` (and my probe hits it). Tested |
| m1 approve on HELD or OVERDUE | Kept, with a reason | Accepted: an overdue deletion must still be erasable. Re-approve of a COMPLETED request → 409, now tested |
| m2 to m5 | Fixed | The switch is read per order. The person id is on the approve line. No SA id in user text. Held orders sort last in the due list. A merged person is refused |

**New Minors (none block):**
1. A dead rule in the check. `mig:20-21` reads `erase_on IS NULL OR (… AND (erasing_since IS NULL OR erase_on IS NOT NULL)
   AND (…))`, and AND binds before OR. So "a claim needs an erase day" is never enforced: I proved a row with
   `erasing_since` set and `erase_on` NULL is accepted. COMPLETED ⇒ no `erase_on` does hold. No code path sets the bad
   pair (claim needs `erase_on`; cancel and finish clear both). Fix: move the clause outside the OR.
2. After the day, the request is locked until the job runs. Cancel gives `WINDOW_ENDED` (`mig:71`; matches decision 4) and a
   hand move gives `ERASURE_SCHEDULED`. With the switch off, or before part 2 registers an eraser (today's real app), an
   approved deletion therefore cannot be withdrawn or moved by hand, and it erases whenever erasers arrive. Say so in the
   PR or the card; part 2 or the console may want cancel allowed after a SKIPPED step.
3. The module card (`api/src/platform/MODULE.rows/PF-21d.md`) does not mention `erasing_since`, the claim or the guard
   trigger on #3189's table (STANDARDS §7 card [M]: update it or write "Card unchanged: <reason>").
4. Remote: a job that dies after the firm commit on an order that a hold had left HELD. Once its claim is 30 minutes old,
   a cancel is allowed (status HELD) and clears the order, even though its rows are already erased. This needs a crash, a
   30-minute gap and a cancel on a formerly held order; port rule 4 covers the rerun case only. Note it with the gap risk.

Journey score (re-walked: journeys 8, 9 and 10 now hold, journey 5 shows the failure): **9/10, pass**. That is 7.5 of the
8 applicable criteria (9.4 scaled): every criterion 1 except error recovery, ½ for Minor 2.

**Verdict: Approve** (no open Blocker or Major). List Minors 1-4 in the PR or fix them.

Reviewer: Approve a371f89019cc458b05eae2c38d6cff20a1ec387d

## Round 3: `2d698e3152788b7b05b92cdfeadd4844939cb233` (PR #3235, diff only)
Scope: the commits since the last approved head `4689c3469`. Those are two merges of #3234's branch (`19f7ddc93`,
`e9a032f99`; through `18996be2f` they bring main up to `a79e246c6` and 1a's round 3) and `2d698e315`, the re-stamp. 1a's
files have their own review; I read them only where 1b depends on them. I ran everything in a fresh worktree on scratch
databases (Postgres 18 on 127.0.0.1:54329, accepting connections; never :4400) and removed the worktree afterwards.

**What changed since round 2: a rename only, confirmed.**
* `git show --remerge-diff` prints nothing for `19f7ddc93` or `e9a032f99`, so neither merge carries a hand edit.
* `2d698e315` touches 4 files, +4/−4:
  * the migration folder rename `20261123120000_pf21d_erasure` → `20261124085000_pf21d_erasure` (99% similar). Its one
    changed line is the PF-8b F4 comment, now `(as 20261123200000_pf21b_data_requests)`, which is #3189's stamp on main;
  * `NEW` in `tests/check_pf21d_erasure.ts`;
  * the stamp in `MODULE.rows/PF-21d.md`;
  * the stamp in `screens/PF-21d/brief.md`.
* The PR's whole diff against 1a (`git diff d6186236...2d698e315`, review files excluded) matches round 2's diff against
  its base (`db8ee8a8c..a371f8901`) once the stamp is normalised. The only other differences are context lines and hunk
  offsets that moved under 1a and main (the 1a row in the card, the hunk positions in `platform-register.prisma`), plus
  the brief line, which now differs from 1a's copy. No code changed.

**Ordering and fresh copies.**
* At this head the migrations end `…20261124030000_pf17_support_keys`, `20261124032000_fo3c2_require_agreement`,
  `20261124080000_pf21d_switch`, `20261124085000_pf21d_erasure`. Main's newest is still `20261124032000`. No migration on
  current main (`a26e80b6a`) is missing from this branch.
* The suite lines "own stamp, after every one before it (newest before: 20261124080000_pf21d_switch)" and "right after its
  own migration, on an empty and a demo copy" pass. So does "prisma migrate diff … is empty".
* Only #3189's migration (`20261123200000`, earlier) and 1b touch `plat_data_request` in its own right. Nothing outside 1b's
  own files names `erase_on`, `erasing_since` or `plat_data_request_erasure_*`, on this head or on a trial merge with
  current main. `git merge-tree` of this head with `origin/main` has no textual conflict.

**Suites at this head:**

| Suite | Result |
|---|---|
| check_pf21d_erasure | 24/0, run twice |
| check_pf21d_switch | 20/0 |
| check_pf21b_requests | 27/0 |
| check_fo9b_merge | 88/0 (`erasing_since` and `erase_on` are not person columns: nothing to add) |
| check_pf8b_f4_migrations | 9/9 |

**New finding:**

**M1 (Major): a clash with main since 23 Nov. With AUD-3 merged, the app stops at start-up because of 1b's three routes.**
* AUD-3 part 1 (#3209, `1c701aa08`) merged to main on 24 Nov, after `a79e246c6`, so this branch does not have it yet. Every
  route under `/api/system` that our staff call must now declare one of `@ReadsFirm`, `@ChangesFirm`, `@ReadsAcrossFirms`
  or `@NoFirmData` (`audit/access/declare.ts`). `SystemAccessLines.onModuleInit` stops the start-up on any route without
  one.
* Features register themselves (P-214), so `features/platform-erasure.ts` is always loaded.
* Probe on a trial merge of this head with `origin/main` (a commit object only, no ref, worktree removed):
  `undeclaredFirmData(platform-erasure.controllers)` returns
  `ErasureController.read (/api/system/erasure/requests/:id)`,
  `ErasureController.approve (…/:id/approve)`,
  `ErasureController.cancel (…/:id/cancel)`,
  plus 1a's `PlatSwitchController.list` and `.set`.
* `check_aud3_access` still passes on that merge (30/0), but only because its start-up line lists its controllers by
  hand and does not include `platform-erasure`. The suite therefore misses this; the real start-up does not.
* The PR's own CI runs against 1a's branch, which has no AUD-3 yet, so CI would pass and the break would only show once 1a
  or 1b meets main.
* To fix, once this branch carries #3209 (through 1a's next main merge, or by merging main directly):
  * `@ReadsAcrossFirms(…)` on `read`, matching what #3209 gave `DataRequestController.read` ("one request, which may name
    a firm and its person");
  * `@NoFirmData(…)` on `approve` and `cancel`, matching `DataRequestController.move`. They change only ExpatReady's own
    register. The erasure of a firm's rows happens in the job, not in these routes. If the builder thinks
    `@ChangesFirm` fits better, argue it in the PR;
  * add `ErasureController` to `check_aud3_access`'s start-up list and its `@NoFirmData` allow-list.

  1a's switch routes need the same, in 1a's own PR (noted here for 1a's reviewer, not 1b scope).

Round 2's Minors 1-4 are unchanged by this round; they stay listed in the PR.

Journey score: not re-walked. This round is a re-stamp with no change in behaviour, so round 2's **9/10, pass** stands.

**Verdict: Block** for `2d698e3152788b7b05b92cdfeadd4844939cb233`. Fix list:
1. M1: after main (#3209) reaches this branch, declare AUD-3 on `ErasureController.read` (`@ReadsAcrossFirms`),
   `.approve` and `.cancel` (`@NoFirmData`, or `@ChangesFirm` with a reason). Add the controller to `check_aud3_access`'s
   start-up list and its `@NoFirmData` allow-list. Then re-run check_aud3_access and check_pf21d_erasure on that head.

The re-stamp itself is correct and complete. It would be approved on its own.

Reviewer: Block 2d698e3152788b7b05b92cdfeadd4844939cb233

## Round 4: `4d72360f6d69db7b0f3e4d62aa1f0b510f80608b` (PR #3235, diff only)

Scope: the PR's own commits since 2d698e315 (452b1e122 AUD-3 declarations; 4d72360f6 Lead B 5 person re-check, plus records),
and the merges since round 2's approved head 4689c3469.

**Merges.** `git show --remerge-diff` is empty for all three merges of #3234's branch since 4689c3469
(19f7ddc93, e9a032f99, 981786e90). Nothing was resolved by hand.

**Suites at 4d72360f6** (worktree; Postgres 18 on 127.0.0.1:54329 accepting; shared Prisma client, no private client
needed): check_pf21d_erasure 25/0 and 25/0 (two runs), check_aud3_access 30/0, check_pf21d_switch 20/0.
**API start-up:** `isolated.sh rv1b 4477 start --ttl 15` started. `/api/health` 200; GET
`/api/system/erasure/requests/<uuid>` with no token 401 NOT_SIGNED_IN; POST `…/approve` with no token 401. Stopped
(database removed). Round 3's Major (start-up stop under AUD-3) is **fixed**.

**Rule test fails when the rule is removed:** commenting out `service.ts:171` (the re-check) makes the new Lead B 5 line
FAIL (`COMPLETED|-`, ERASURE_RESULT steps). Test-first holds.

### AUD-3 declarations (452b1e122): true and the best fit
* `read` `@ReadsAcrossFirms("one request's erasure state, …")`: it matches `DataRequestController.read` on main. It
  over-declares (the answer is status and `eraseOn` only), which is the safe direction.
* `approve` `@ReadsAcrossFirms(…)`: true. Approve does read one firm's `fo_person` through `personCheck`
  (`service.ts:103`). This is more accurate than round 3's suggestion of `@NoFirmData`, which I withdraw. `@ReadsFirm`
  needs the firm in a path parameter, and here it comes from the record. `@ChangesFirm` would be false, because approve
  changes only ExpatReady's register. So nothing else in the set fits. One remark, not a finding: the line goes on the
  platform trail and not on the firm's own trail. The approve line in our staff's trail carries `personId` and
  `requestId`.
* `cancel` `@NoFirmData(…)`: true. It touches only `plat_data_request` and matches `DataRequestController.move`.
  `check_aud3_access` lists it in the reviewed opt-outs.

### Lead B 5 (4d72360f6): the re-check
* **Placement:** the re-check runs first in the firm transaction, before the hold check, so a gone person never reaches an
  eraser. The step is written under the claim with `p_once`, and `finish("BLOCKED")` gives HELD and keeps it scheduled.
  The Lead's single-threaded case is closed and tested.
* **HELD leaves staff a working path:** `plat_data_request_erasure_cancel` lets a HELD request be cancelled after its day
  (migration line 71: `status <> 'HELD'`). Probe A confirmed this: cancel on the merged-person request returns 200,
  `eraseOn` null, an ERASURE_CANCELLED step, and the next run takes nothing. The step's text tells staff exactly that.
* **Sources:** `trace-requirements.py --brief PF-21d` prints SA-11-40 @13537758. Rule 6 says "asks the staff member to
  choose. It never picks one or merges silently (AG16-44)". §10 says "the system never widens a request to other people
  on its own". Not following the merge to the survivor is a fair reading of both. The legal reading stays Unconfirmed: no
  counsel (header). The tool also warns "SA-11-40 has no @hash"; the brief's own row is outside this diff.

**M1 (Major, Must): the race the Lead named is still open, and a false COMPLETED is reproduced.**
* **Where:** `personCheck` (`service.ts:55-56`, called at `:171`) runs on its own pooled connection and takes no lock. A
  merge that commits after the check and before an eraser's statement moves the person's rows to the survivor. Every
  eraser then finds nothing, and the request reads COMPLETED with nothing erased. This is exactly Lead B 5's outcome.
* **Probe C:** a test eraser commits the merge (tombstone plus moving the rows) on a separate connection just before it
  deletes. The run reported `erased: [r7]`, status `COMPLETED|-`, results `test.rows: NOTHING / test.second: NOTHING`, and
  the person's 2 rows now under the survivor.
* **Why it matters:** the window is the length of one order's erasers (timeout 120 s). Firm staff can merge at any time
  while the 07:40 job runs. The PR's own comment (`:166-167`) shows the hold check is serialised by a lock; the person
  check is not.
* **Fix (small):** run the check inside the firm transaction on `tx`, with
  `SELECT 1 FROM fo_person WHERE firm_id = … AND id = … AND merged_into_id IS NULL FOR SHARE`. Pass `tx` to the
  injectable `PersonCheck`.
* **Why this fix is enough:** FO-9b's merge already locks both records `FOR UPDATE NOWAIT` with back-off and answers
  MergeBusy (`front-office/duplicates/merge/service.ts:4, 49, 61-74`).
  * If the run holds the share lock, a merge waits and then says "try again".
  * If the merge holds its lock first, the run waits. The re-evaluated row is then merged, so the result is gone and the
    request is HELD.
  * No deadlock, and no false COMPLETED.
* **Fail test:** this probe, with the run expected HELD and no eraser called, or the merge refused with the rows erased.
  It fails on today's code.

**m1 (Minor, Should): HELD shows a stale reason after a hold is followed by a merge.**
* **Why:** `p_once` compares only the last step's kind (migration lines 128-129). Probe B: a legal hold gives HELD "On
  legal hold … hold six". The person is then merged, the hold released, and the next run returns `gone`. Its
  ERASURE_HELD step is dropped as a duplicate.
* **Result:** the request stays HELD, and its only reason names a hold that has been released. The real reason, the
  merge, is never written. Status is not false, but the "why" the Lead asked for is.
* **Fix:** skip only when the last step has the same kind **and** the same note (or the same reason class). Add a test
  line for hold, then merge, then release.

Round 2's Minors 1-4 are untouched by this diff and stay listed in the PR.

**Journey score (reviewer): re-scored for the changed path only.** The merged-person journey has no screen. It was walked
through the service as the job runs it, with the outcome read back through the register's own read:
* merged person → HELD with why → staff cancel → nothing runs: works;
* hold → merge → release: stale why (m1);
* merge mid-run: false COMPLETED (M1).

Correct data falls to ½ (M1) and feedback and state to ½ (m1). Round 2's other criteria stand. Result: **8/10 (scaled
over the applicable criteria), pass, no 0**. The Major blocks regardless.

**Verdict: Block** for `4d72360f6d69db7b0f3e4d62aa1f0b510f80608b`. Fix list:
1. M1: move the person re-check into the firm transaction on `tx` with `FOR SHARE` on the `fo_person` row
   (`merged_into_id IS NULL`). Add the mid-run merge test (HELD or MergeBusy, never COMPLETED with nothing erased).
2. m1 (Should, may ride along): make `p_once` compare the note or the reason class too, with a test for hold, then merge,
   then release.

Everything else in this round is correct and would be approved on its own: the AUD-3 declarations, start-up, the
re-check's placement and test, cancel while HELD, and the source reading.

Reviewer: Block 4d72360f6d69db7b0f3e4d62aa1f0b510f80608b
