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

## Round 2

* Reviewer: independent, Opus 5.5. Date: 24 Nov 2026. **Commit `e65760efd929a97105e1355099ea4268a35bca8f`.** I read only the diff since round 1: `git diff ed63b3ab7..HEAD -- '*.ts'`, which covers `review.ts`, `at-arrival.ts`, `check_fo9b_auto_merge.ts`, `j_28.ts` and `j_33.ts`. `check_fo4_sales_browser.ts` has not changed since round 1.
* The Lead's hold still applies: no label until FO-9b part 2m is on main (M2, which is not part of this PR).

### Runs (mine, never :4400)
| Run | Result |
|---|---|
| `check_fo9b_auto_merge` | 25/25 |
| `check_fo9b_pairs_model` (part 2's model, no `arrival` option) | 24/24 |
| j_28 on :4438 (isolated, real PF-14 runner) | 48/48; W2's job `completed:`, both records live, pair OPEN |
| j_33 on :4439 (isolated) | 20/20; W5's job `completed:`, both records live, pair OPEN |
| Nest app context (platform-jobs + front-office-auto-merge), then `app.close()` | `onApplicationShutdown` ran once on the factory provider's instance; `queueArrivalMerge(…, undefined, …)` returned true before the close and false after |

The screenshots these runs rewrote were put back. My probes were temporary copies of the suite on scratch databases, all deleted and dropped.

### Each finding: fixed? red without its fix?
I mutated each fix in place, ran the suite, then restored the file with `git checkout`.

| Finding | Fixed | Mutation: suite result |
|---|---|---|
| B1, overwrite (newer-wins picks) | **Overwrite: yes.** **Fill of an empty contact key: no** (B1-r below) | `choices` off: 2 red (Ann's name, Vera's name). `CONTACT_CONFLICT` off: 1 red (household phone) |
| M1, a copied consent could not be undone | Yes | CONSENT refusal off: 1 red |
| M1, rollback clean? | Yes (probe) | After the refusal: 0 `fo_dup_merge` rows naming Cora's records, 0 `person.merged` events or audit lines. The only `consent.%` audit is the newcomer's own `consent.recorded`, and its one consent row is still on the newcomer. The survivor has 0 consents. The lead stayed put. The job ended `done` (no retry) |
| break m3 / review m1, re-merge after Undo | Yes | `not exists fo_dup_merge` off: 1 red |
| review m3, the MANUAL line | Yes (renamed; "Add as new" fail line added) | n/a |
| break m1, burst | **Code: yes.** **Test: does not go red** (m-r1) | Follow-up off: **25/25 still green** |
| break m2, 2 s bound | Yes (probe) | Bound off: **25/25 still green** (m-r2) |
| review m2, shutdown hook | Yes (Nest probe above) | Hook body off: **25/25 still green** (m-r2) |

Probes of the new code:
* **12 concurrent arrivals with one email, ×3 rounds:** 1 live record each time. With the follow-up removed: 3, 3 and 2 live. This is break m1's failure, and the fix answers it.
* **The 2 s bound:**
  * A 4 s queue: the arrival returned in 2,036 ms and committed. The late send still queued the job, which then merged correctly.
  * The same slow queue on an arrival that rolled back: its late job found no person (the arrival lock and the read-committed read still protect it).
  * A queue that rejects after 2.5 s: logged `fo9b_auto_merge_queue_failed`, no unhandled rejection (`Promise.race` subscribes to both promises).

### Findings (ranked)

**B1-r (Blocker, B1 not closed): an unchecked arrival still writes a contact key onto a person's record when that field is empty** (`review.ts:216`; the PR's own line `check_fo9b_auto_merge.ts:175-176` asserts it as intended).
* Steps (scratch database, the web form's `arrive()`):
  1. Vicky submits her phone only, `+1 416 555 0231` (the web form accepts a phone alone).
  2. A stranger submits `416-555-0231` with `mal@attacker.example`.
  3. The job runs.
* Actual: Vicky's live record is `Vicky PhoneOnly | mal@attacker.example | +14165550231`.
* This is round 1's B1 harm: mails read `person.email` when they are sent (booking/service.ts:731, :765), so her mail goes to the stranger. It is reached through a person who lacks one key instead of by an overwrite. The mirror case (an email-only person gets a stranger's phone) is the PR's Vera line.
* The breaker found the same independently (break-report Round 2, R2-B1).
* Fix: under `arrival`, never take an email or phone from the newcomer. A newcomer that brings a contact key the record on file lacks is refused with a new reason, so the pair waits on To review. Names, language and time zone may still fill an empty field. Flip line 175 to that fail and keep its pass for a key both records share.

**M-r1 (Major, new in round 2): one arrival joins two people who never matched each other** (the follow-up `at-arrival.ts:88-93` acting on B1-r's fill).
* Steps (scratch database):
  1. Ada submits a phone only, `+1 416 555 0232`.
  2. Bea submits an email only, `bea@example.org`. Their jobs run; there is no pair between them.
  3. Zed submits `bea@example.org` with `416 555 0232`, and his job runs.
* Actual: Zed is merged into Bea, and Bea's empty phone is filled with Ada's number. The follow-up then merges Bea into Ada (one phone; Ada has no email, so there is no conflict). Result: 1 live record, "Ada", carrying Bea's email, her lead and her note.
* With the follow-up removed: 2 live records (Bea still gets Ada's phone).
* Expected: P-574 (2) merges only on an exact match of the records' own keys. Here the match was made by the job's own fill. A household where one spouse fills in a form with mixed contacts is the honest version of this case.
* The breaker reproduced it over HTTP (R2-B2).
* Fix: B1-r's rule removes the bridge. Also let the follow-up try only pairs whose two people matched before this run began. Add this case as a fail line.

**m-r1 (Minor): the burst test passes without the follow-up** (`check_fo9b_auto_merge.ts:201-205`).
* P1's own job is still queued when P3 arrives, so `runDue()` merges P2 through P1's job, not through the follow-up.
* With `await jobs.runDue();` after line 201 (P1's job done before the burst), the line went red with the follow-up removed and green with it. Add that line.

**m-r2 (Minor): no fail line for the 2 s bound or the shutdown hook.** Both are proven only by my probes above.
* Add a planted slow queue: the arrival commits in under about 2.5 s, a `queue_failed` line is logged, and the late job is harmless.
* Add `auto.onApplicationShutdown()`, then an arrival queues nothing. A Nest `app.close()` line in `check_pf23w_jobs_wired` is the stronger form.

**m-r3 (Minor): the follow-up also merges old pairs that a person left on To review** (`at-arrival.ts:92-93`).
* Steps (scratch database):
  1. O1 and O2, with one email, arrive with no queue registered (as after a shutdown or a timed-out send). Their pair is OPEN.
  2. O3 arrives with the same email.
* Actual: `o3→o2`, then `o2→o1`, and the old pair is MERGED with no person.
* The same happens to a pair whose Busy retries were spent, and to every OPEN exact pair already in a firm (the seed has dozens) once a third record matches. The row says "a new safe duplicate", and the header (`at-arrival.ts:10-12`, "the first merge ends it"; "once its tries are spent the pair stays on To review") still describes round 1.
* The breaker found the same (R2-m1).
* Fix: limit the follow-up to pairs naming a person whose arrival is in this run's chain (or one with an auto-merge job), or get a Lead ruling that old exact pairs may go too. Correct the header either way.

Not findings:
* Different names on one email still merge by design (P-574 (2); P-668 T16 only warns on similar names).
* break m4 (throughput) is unchanged and was not asked of this round.

**Journey score (reviewer), round 2: 8.0 / 10.** That meets the score's pass rule (8 or more, no 0), but the open Blocker decides the verdict. Correct data drops to ½ (B1-r, M-r1). Error recovery stays at ½: Undo now holds against a retry, but nobody is told about a wrong join by itself. Report: `journey-test-reviewer-2026-11-24.md`, Round 2.

**Verdict: Block** (one Blocker and one Major open). To fix: B1-r, M-r1, then m-r1, m-r2 and m-r3.

Round 2 verdict: Block
