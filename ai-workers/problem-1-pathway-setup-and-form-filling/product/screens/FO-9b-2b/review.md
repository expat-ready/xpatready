# Review: FO-9b part 2b, the merge by itself at arrival (R1.29; P-574 (2))

**Verdict: Approve** (Ship). No Blocker and no Major. Three Minors, listed below.

**Journey score (reviewer): 8.5 / 10, pass.** Report: `journey-test-reviewer-2026-11-24.md`.

* Reviewer: independent, Opus 5.5. I did not build this row. Date: 24 Nov 2026.
* PR #3527, branch `claude/loving-galileo-pxe8w5`, **commit `ed63b3ab7783121c294a1a46b84d7bbaa7083fc9`**, against `origin/main`.
* The branch head has since moved to `26a499ed2`. The four commits after `ed63b3ab7` carry only screenshots and two `MODULE.rows/FO-9b-2b.md` lines, no code. An Approve on that head still has to name that head.
* **The Lead's hold still applies.** Lead 1 ruled on #3527 at 17:27Z (keeping Lead 12's ruling on #3174): no `review: approved` label until FO-9b part 2m (PARTY_MERGED) is on main. Part 2m is not on main today: `git grep PARTY_MERGED origin/main` finds nothing. That is a gate, not a finding of this review.

## What I checked
* **Scope.** This is an API-only runtime row with no screen. So there is no BIC scorecard (front office, not case side) and no retrofit mapping (new code).
* **Sources.** BACKLOG row FO-9b part 2b. Lead 10 and Lead 12 on #3174. `pair-model.md` §4. AUD-3a in `audit-event.ts`. STANDARDS.
* **Code read.** The diff, plus `mergeIfSafe`, Undo, the PF-14 adapter (`pgboss-jobs.ts`, `platform-jobs.ts`), `PrismaArrival` and the booking service's transaction.

## Code: what holds
* **Waiting for the arrival** (`at-arrival.ts:42-47`, `:56-59`):
  * The arrival takes `fo_dup_arrival:<id>` *before* it queues the job and holds it to the end of its transaction. pg-boss sends on its own pool, so a job that starts at once blocks on the lock, then reads the person on a fresh read-committed snapshot: committed, the person is there; rolled back, nothing is done.
  * The booking door passes its own transaction (`booking/service.ts:578`), so the lock lasts until the booking commits, including the update, token, audit and outbox written after `arrive()`. A booking retry gets a new person id; the rolled-back attempt's job does nothing. No other path takes this namespace, so no lock cycle.
  * Mutations on a scratch worktree, each red: the job's wait removed (`:57`), the arrival's lock removed (`:44`), the Busy throw removed (`:93`).
* **Queueing inside the arrival's transaction is safe.** The lock is in a savepoint; a failed send is caught and logged and the arrival commits. An orphan job from a rollback does nothing. The key `fo-dup-auto:<person>` is used once per person, ever (`ports/jobs.ts` JobKey).
* **Firm and actor.** The job carries the person's firm; `PlatformJobs.handle` runs it inside `withFirm`, and every read is `firmScope(firmId, …)`. The audit line is `system:fo-duplicates` with no request actor in context, so AUD-3a passes. Proven on the real runner: j_28 W2 and j_33 W5 (my runs) log an `automatic` merge row; my FO-4al copy finished 6 `fo.duplicates.auto_merge` jobs `completed`.
* **Busy and refusals.** Busy (55P03 or 40P01) with nothing merged throws: PF-14 retries 3 times with backoff from 30 s (DEFAULT_RETRY), then dead-letters it. A refusal (money, case, not exact, Kept separate) returns normally and never loops. Any other error gets the same bounded retries.
* **Doors.** `arrive()` is the one path for the web form, the hand-added lead and the booking page (`PrismaArrival`). There is no import door; a won prospect creates no person; corporate contacts (`corporate/service.ts:239`) and `FoPersonPort.ensureForClient` write no pair (the latter is a case client, refused by CASE anyway). No pair-writing door is missed.
* **Module default (`registerAutoMerge`).** Only `features/front-office-auto-merge.ts` sets it; suites that build their own services (fo2, fo2p3b, fo9a, fo9b_review with only `front-office-merge`) see `null`. Nest builds every provider at init and `handle()` runs before the runner starts. The cross-app risk is m2 only.
* **Suite expectations are honest.**
  * j_28 W2 asserts the automatic merge, the booking's lead on the visitor and the copied BOOKING_FORM row; W3-W4 narrow to the WEB_FORM row, and W5 still proves the gate blocks marketing after the unsubscribe. My run's NOTE: a send to the merged-away booking record is blocked too (`ADDRESS_UNSUBSCRIBED`), so no consent leak.
  * j_33 W5 asserts one person and no possible-match line (screenshot: the survivor, E.164).
  * FO-4 DW2 gives Lena a Sample tax setting, so her repeat stays a flagged second lead: the one remaining path to the flag at arrival, stated in the test.

## Issues (ranked)
1. **m1 (Should): a job that runs again after a person's Undo merges the pair again** (`at-arrival.ts:60-67`).
   * The only guard is `person.mergedIntoId`. Undo sets the pair back to OPEN (`review.ts:378`), and nothing remembers the automatic merge.
   * Probe, on a scratch database:
     1. two safe web arrivals are merged by the job;
     2. R undoes the merge from the Merged tab path (`DuplicateReview.undo`): `{"restored":true}`, pair OPEN;
     3. `auto.run({...job, attempt: 2})` returns a new `mergeRef`, and the record is merged into the survivor again.
   * pg-boss delivers at least once. A worker stopped after the merge commits but before `complete` re-runs the job when it expires (15 min), overriding the person's Undo.
   * Fix: refuse when `fo_dup_merge` already has an automatic merge with this person as loser (undone or not). Add this sequence as the fail side of "running the job again merges nothing" (`check_fo9b_auto_merge.ts:78-79` covers only the not-undone case).
2. **m2 (Should): the comment says the registered queue is "null when it closes" (`at-arrival.ts:33`), but nothing clears it.**
   * `ArrivalAutoMerge` has no shutdown hook (`features/front-office-auto-merge.ts:11-15`).
   * In a process that closes an app and keeps calling `arrive()` (a restart suite, a tool), each new person sends to a stopped runner. `JobRefused` is caught and an error line `fo9b_auto_merge_queue_failed` is logged, while the arrival still commits.
   * Fix: `onApplicationShutdown() { registerAutoMerge(null) }` (only when it is still this instance), or correct the comment.
3. **m3 (Should): the "hand-added lead" pass line overstates its door** (`check_fo9b_auto_merge.ts:59`, `:87`).
   * `manual()` calls `arrive()` directly. Through the real door (`POST leads`), an exact email or phone is a 409 KNOWN_PERSON, and "Add as new" writes the pair Kept separate.
   * My FO-4al copy: 2 KEPT_SEPARATE pairs, 0 merges.
   * The MANUAL door's merge is therefore reachable only in a race. The code is right. Name the line as `arrive()`'s MANUAL path, or add an "Add as new is never merged by itself" fail line through `Leads`.

Notes, not findings:
* The row text says the actor is `system:fo-dup-merge`; Lead 12 names `system:fo-duplicates` and keys unchanged.
* A non-Busy error on one pair skips the later pairs until the retry (`:69`). That is fail-closed.

## D1-D20 (1-5; API evidence, no screen)
* D1 Requirement fit **4**: each Done-when line has a pass and a fail; the three real doors are wired · D2 Data integrity **4**: fail-closed, firm-scoped; m1 · D3 Reuse **5**: `mergeIfSafe` unchanged, PF-14, `firmScope` · D4 Rule integrity **4**: refusals end the job; Busy retries bounded.
* D5 Stability **4**: a rolled-back arrival does nothing, Busy retries, a planted lock never fails the arrival; m1.
* D6 Governance **4**: one `person.merged` event, one audit line, a merge row with `automatic` and `by`.
* D7, D8, D9, D12, D13, D14: N/A (no AI, no screen; the Merged tab is FO-9s part 2).
* D10 Language **4**: the merge reason is plain · D11 Feedback **4**: the job's result is returned and logged.
* D15 Speed **4**: the arrival adds one lock and one send (it committed under a held lock in under 2 s); the job holds a connection only while it waits (at most 30 s).
* D16 Testability **4**: 17/17; three mutations red; door suites re-run by me; m1 and m3.
* D17, D20 simulated only · D18 Provenance **4**: automatic, by and reason on each merge · D19 not yet (FO-9s parts 2-3).

## Runs (mine)
| Run | Result |
|---|---|
| `check_fo9b_auto_merge` | 17/17 |
| `check_features_registry` | 27/27 |
| `check_pf23w_jobs_wired` | 31/31 |
| j_28 on :4439 | 47/47 |
| j_33 on :4439 | 19/19 |
| `check_fo4al_add_lead_browser` on :4436 | 27/27 |
| `check_fo9s_duplicates_browser` on :4437 | 32/32 |
| `qa/check_r133_phone_doors_http` on :4438 | 17/18, E3 = open QA-540 (the edit route; no arrival involved) |
| `graph.mjs --check` (scratch worktree) | exit 0; no route added |

Screenshots these runs wrote were put back as they were.

## Could not check
* A real pg-boss redelivery (crash between commit and `complete`). I simulated it with `run()`.
* Several API instances.
* I did not re-run `check_fo4_sales_browser` or j_29 (the builder's 47/47 and 13/22 = main).
* D17 and D20 need an intended user.

Reviewer: Approve ed63b3ab7783121c294a1a46b84d7bbaa7083fc9

**Verdict: Approve**
