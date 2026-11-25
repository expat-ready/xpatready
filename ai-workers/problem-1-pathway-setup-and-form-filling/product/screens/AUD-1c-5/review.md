# Review: AUD-1c part 5 (R1.97; Lead 5 on #2129): the alert's SA-11-6 name and the weekly check in 24 slices (round 1)

Reviewer (Opus 5.5, independent; did not build it). Head `3e877239ab0eaf4db92b110e9bad968acc4724bd` (branch `claude/runtime-aud1c-rename`), diff against `claude/runtime-j97`: 11 files, +48 -26. Worked in /home/user/wt-p56 only.
This is not a screen, so concept fit, keyboard and zoom, D1-D20 and BIC-01..20 do not apply (N/A). I did not run the graph tool because it writes GRAPH.md. I left the timed pass on staging's real bucket out of the findings: it needs AWS and is owed under P-821.

## Runs (in /home/user/wt-p56, the part 6 head on top of this one)
* `check_aud1c_verify.ts`: 22 passed, 0 failed. `check_pf0p_ports.ts`: 127/127. CDK `node --test`: 140/140. `check_pf21c_breaches.ts`: 48/48.
* `check_pf23_observability.ts`: all of its unit and port parts passed, including the AlertPort fake, the LogAlerts contract and EMF on every alert line. Its live part needs an isolated copy, so I did not run it.
* Mutation: I changed `features/audit-chain.ts:28` to `v.pass("full")`, so every Sunday hour runs the whole weekly pass and slicing is gone. `check_aud1c_verify.ts` still gave **22/22**. I then restored the file with `git checkout`.

## Major
1. **No test covers how a run picks its slice.** The only change that keeps a run small is `features/audit-chain.ts:28` (`job.runAt.getUTCHours() % DEEP_SLICES`), and the mutation above deletes it with every test still green.
   * `tests/check_aud1c_verify.ts:186` calls `v.pass("full", s)` directly.
   * `:188-191` only counts how many deep jobs were created on a Sunday.
   * Fix: in the Sunday run at `:189`, check that each deep run's `audit_chain_verify` line (or its `chains`) holds only the chains of that hour's slice, and that the 24 runs together cover every chain.
2. **A missed slice is lost silently, so the weekly pass is not resumable.** pg-boss's `missed: skip` (`pgboss-jobs.ts:291`) sends nothing for a :40 minute when the worker is down. A deploy or restart at that minute on a Sunday therefore skips about 1/24 of the chains' weekly check.
   * Nothing records the miss: no line, no job failure, no alarm, no field in `aud_chain_check`.
   * `verify.ts:26` states this ("a lost run costs one slice that week"), but Lead 5 asked for "resumable in chunks".
   * A failed slice is fine: retries keep the same `runAt` (`pgboss-jobs.ts:289-293`), and four failures within about 4 minutes reach `job-failures`.
   * Fix (either):
     * keep a per-chain "last full check" and have each Sunday-hour run also take any chain whose full check is older than 7 days;
     * or raise this with the Lead in `challenge.md` and get it ruled.
3. **No test covers the breach register's new kind.** `BREACH_ALERT_KINDS` (`register/breaches/service.ts:55`) and the wording branch (`:159`) gained `audit.chain_integrity_failure`, but every from-alert test still posts only the old name (`tests/check_pf21c_breaches.ts:296-299`, `tests/check_pf21rs_browser.ts:272`).
   * If the new name is removed from the list, no test fails. The alert the product now raises would then be refused (400) and could not open its draft.
   * Fix: switch the pf21c case to the new kind and keep one case for the old name.

## Minor
1. Slices balance the number of chains, not the number of lines. One large firm chain is its slice's whole cost, and each chain is still bounded by its own 120 s transaction (`verify.ts:76`). So "no run comes near the job runner's 15 minutes" (`verify.ts:26`, MODULE row AUD-1c-5) is a claim until the owed timed pass proves it. Word it as owed.
2. Every slice calls `anchors.chains()` (`verify.ts:68`), so the archive's whole chain list is read 24 times each Sunday instead of once.
3. No check ties `DEEP_SLICES` (24) to the hours in `CHAIN_DEEP_CRON` ("40 * * * 0"). If one changes without the other, some slices never run.

## Rename: checked and sound
* Readers: I grepped the whole studio, `web/src` included.
  * `ports/alert.ts`, the contract, the checker, the CDK filter and alarm, and the three tests all use the new name.
  * `web/src` reads neither kind (the breach views' zod has `source`, not `sourceAlert`).
  * Stored drafts keep `source_alert` as JSONB with no kind check (pf21c migration :43, :120). Old drafts stay readable, and from-alert still takes the old name.
  * The old name remains only in dated records and in the 14 Nov contracts snapshot (`design/platform-and-front-office-contracts-2026-11-14.md:64`). That snapshot is a dated record, not a library master.
* The dot in the kind breaks nothing:
  * `alertLine` dimension `AlertKind` (EMF values may hold "."; `emfProblems` passes).
  * The LogAlerts repeat key (`|`-joined, `alerts.ts:34`).
  * Redaction (no domain rule).
  * The CDK filter `$.alert = "audit.chain_integrity_failure"`, metric `Alert_audit.chain_integrity_failure` (CloudFormation forbids only `:`, `*` and `$`), and the alarm `xr-<stage>-alert-audit-chain-integrity-failure` (`[_.]` → `-`).
  * The CDK is not deployed yet, so the renamed logical ids replace nothing.
* Slice cover: `sliceOf` is a stable sha256 hash. Sunday hours 0-23 UTC map one to one to slices 0-23, so every chain is in exactly one slice a week. A chain created on Sunday after its hour waits a week.
* `runAt` is the right selector. A recurring run's `runAt` is the minute pg-boss created it in, and it is the same on every retry (`pgboss-jobs.ts:289-293`). A run a few seconds late keeps its hour, and UTC has no clock change.

## Journey test (operator journeys, simulated; no UI)
J1: a break raises an alert with the new kind, the alarm filter matches it, and our staff draft a breach from it. Held, but the draft step with the new kind is untested (Major 3).
J2: a Sunday runs 24 slices that cover every chain. Held for direct calls; the wiring is untested (Major 1).
J3: the worker is down at :40, or a slice fails. A failure is retried and pages; a miss is lost silently (Major 2).

Scores (N/A not scored): task completed ½ · next step obvious 1 (alarm text names the filter) · plain words 1 · feedback and state ½ (a miss leaves no trace) · correct data 1 (ids only; both names accepted) · error recovery ½ · speed ½ (bounded per chain, not per slice; owed) · trust and sources 1 (SA-11-6 cited, Sample labelled) · accessibility, visual N/A.

**Score: 6 of 8 = 7.5/10: below the pass mark.** Fixing Majors 1-3 raises task completed, feedback and error recovery.

**Verdict: Block** (Ship after fixes): fix Majors 1, 2 and 3. Minors are optional.

## Round 2 (diff only: `3e877239..7b9b28e9`, head `7b9b28e9f709f9cfb0955876a6eca02a00a8a0d7`)
**Runs:** `check_aud1c_verify.ts` 24/24 · `check_aud2_archive.ts` 43/43 · `run-suites.sh --only check_pf21c_breaches.ts` 49/49 · CDK 140/140.
**Mutations** (each restored with `git checkout`): handler calls `v.pass("full")` → M1 and M2 tests FAIL (22/24) · `sliceAt` always 0 → same two FAIL · archive list read by every slice → m4 test FAILS (23/24) · new kind dropped from `BREACH_ALERT_KINDS` → pf21c FAILS.

* **M1: closed.** The spy goes through the feature's real handler (`tests/check_aud1c_verify.ts:199-209`); the mutations prove it.
* **M2: closed.** I judge that a stateless daily cycle meets "resumable in chunks":
  * a run lost to a stopped worker is made good the same hour the next day; a failed run keeps its hour across retries and pages through `job-failures`;
  * a slice would have to be missed 7 days running before SA-11-6's weekly bar is missed.
  * Cost: each run costs the same as before; the total is 7 times the weekly one. Every chain is re-read from seq 1 daily, and each chain's archive ledger GETs every anchor daily (`daily-export.ts:96-120`; one anchor per export day, so about 2,555 per chain at 7 years). Small today, but stricter than the brief's "weekly" (Minor 4).
* **M3: closed.** `check_pf21c_breaches.ts:302-304` posts the new kind and expects a 201 DRAFT with the chain wording.
* **Breaker m4: sound.** `verify.ts:76` reads the archive list only in slice 0 (or an unsliced pass); a chain only the archive holds is checked there whatever its hash, then its check row puts it in its own slice (still once a day).
* **Breaker m2: done** (`design/platform-and-front-office-contracts-2026-11-14.md:64`).

### New Minors (optional)
4. Put the 7x daily cost and the stricter-than-weekly cadence in the PR for the Lead (WAY-OF-WORKING: never deviate silently).
5. Stale "weekly" wording: `verify.ts:3` and `:63`, `features/audit-chain.ts:1`, `audit/chain/routes.ts:69`; `qa/built/R1.97.md:1` ("weekly from seq 1 (… every day …)", "the weekly slices").
6. The m4 test (`check_aud1c_verify.ts:193`):
   * `r.findings.length >= 0` is always true; drop it.
   * If `sliceOf(ghost)` were 0, the test could not tell slice 0's archive branch from the ordinary slice; a fixed ghost key in another slice removes the doubt.

**Journey, round 2:** task completed 1 · feedback and state ½ (a lost run leaves no trace, but is made good in 24 h) · error recovery 1; the rest as in round 1. **7 of 8 = 8.8/10: pass.**

**Verdict, round 2: Approve.** No open Blocker or Major.
