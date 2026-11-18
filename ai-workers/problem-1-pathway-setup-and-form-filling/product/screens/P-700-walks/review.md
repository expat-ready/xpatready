# Review: PR #2133, recorded gate A walks (P-700); round 1 at d09c8f6cd (Block), round 2 at ba7ac696b

Reviewed by Opus, fresh context, did not build it. Merge-flow tooling (P-214), not a screen, so the screen-review parts that need a screen (D1-D20, the BIC table, 1024 px / 200 % zoom, PRODUCT.md menu words) are **N/A**. What I judged: correctness, security, robustness, the PR body's Done when, P-700's requirements and WAY-OF-WORKING / STANDARDS rules.
Evidence: the diff `origin/main..d09c8f6cd` (6 files); `tsx studio/tests/check_journey_recording.ts` here, 10/10 PASS in 1.7 s (video not judged here: pre-installed Chromium); the plan step's shell run locally with 9 inputs; `copyOf()` run on j_6, j_9, the fixture and 3 variants; three scratch journeys (crash, exit mid-run, no exit) walked through `walk.mjs`. They had no app and no copy; j_6 and j_9 were not started. The PR's `walks` run 44318409310 is still **queued**, and its ci run was the draft guard only.

## What holds
* **Input injection: safe.** `journeys` reaches the shell only through `env: WANT` (walks.yml:47). Each word must match `^(j_)?([1-9][0-9]{0,2})$` and its file must exist; at most 200 characters and 20 journeys. The matrix holds only `j_<n>` and the fixture path. Tried here: `6; rm -rf /` and `$(id)` were refused, `j_6 j_6` became one job, `j_7` got "no file", empty gave j_6 + j_9 + the fixture.
* **Token: read-only.** `permissions: { contents: read }` at the top level. No secrets and no `pull_request_target`, so a fork PR runs with a read token, as ci.yml does.
* **Header parsing is right for both journeys.** j_6 gives `j6 4436 [--ttl 30 PLATFORM_IDENTITY=local]`, j_9 gives `j9 4431 [--ttl 20]`, the fixture gives none. The arguments go to `spawnSync` as an array (no shell). :4400 is refused (walk.mjs:28).
* **Board detection is right.** j_9 has no `chromium`, so it gets the step board, labelled "API only". j_6 has `chromium`.
* **Self-test logic is right.**
  * With `continue-on-error`, `steps.w.outcome` is still `failure` (`conclusion` is the one forced to success).
  * `steps.up.outputs.artifact-id` is upload-artifact@v4's output and is set only when an upload succeeds.
  * A skipped or cancelled walk step makes `OUTCOME` something other than `failure`, so the self-test fails, as it should.
* **j_6 closing its browser mid-run** (j_6.ts:197) goes through the patched `browser.close`: every context of that browser is traced and closed first, so its video and trace are written. PF-6b's later lines get steps.jsonl rows with no screenshot. That is correct.
* **Reuse of ci.yml.** The setup-node, `cloud-setup.sh` and `playwright install chromium` steps are copied word for word from the packs job (ci.yml:390-398). The app starts only through the header's `isolated.sh` line. The test merge is left out on purpose: the walk runs on the branch head.
* **qa skill:** 53 lines and 10,166 bytes; `check-docs.sh` says docs OK.
* **A natural end without `process.exit`** (`beforeExit`) keeps the trace (scratch `noexit`: trace-1.zip written).

## Majors (each blocks Approve)
1. **record.ts:93-94: an uncaught exception loses the trace (and probably the video).**
   * The problem: record.ts patches `process.exit` and `beforeExit` only. When a journey throws (any Playwright timeout, j_9's `try/finally` rethrow, or a failed board launch), Node kills the process without calling `finish()`, so `tracing.stop` never runs and no context is closed.
   * Proof: scratch `throw.ts` (one PASS, then a click on a missing button) gave walk.json `exit 1, 1 PASS, 0 FAIL, traces: []`, with only the step screenshot left.
   * Why it matters: a crash is exactly the failure qa most needs to replay, and the fixture only exercises the clean `process.exit(1)` path, so P-700's "whatever the verdict" is not proven.
   * Fix:
     * add `process.on("uncaughtException", crash)`, `process.on("unhandledRejection", crash)` and `process.on("SIGTERM", crash)`, where `crash` logs the error with `realLog` and calls `finish().then(() => realExit(requestedCode ?? 1))`. I checked here that a top-level-await rejection reaches `uncaughtException` on Node 22.
     * add a second fixture, `fixtures/j_0_throws.ts`, to check_journey_recording.ts and to the walks matrix: exit 1 and trace-1.zip kept.
2. **record.ts:93: `process.exit` returns, so the journey keeps running after it.**
   * Proof: scratch `exitmid.ts` ran `process.exit(2)` with its browser open. Two more steps ran and were counted (walk.json `3 PASS`, steps.jsonl rows 2-3 "after-exit"). Then the journey crashed on the context `finish()` had closed, so the walk ended with **exit 1, not 2**.
   * Today j_6's only early exit (j_6.ts:69, the STOP before the browser) happens to finish within microtasks. But any journey with a STOP mid-walk gets wrong PASS counts, wrong screenshots and a changed exit code.
   * Fix: on the first exit call, set `exiting = true` and keep `requestedCode`. While exiting, `console.log` stops recording steps (it still prints), the patched `fetch` returns a promise that never settles, and the crash handler from Major 1 keeps `requestedCode`. Add the exit-mid-run case to the check: the exit code is kept and no step is recorded after the exit.
3. **walk.mjs:19: `rmSync(OUT, { recursive: true, force: true })` on any out-dir the user gives.**
   * `node walk.mjs j_6 .` from prototype/ deletes the whole prototype folder, and `… j_6 ~` deletes the home folder. The usage line invites an out-dir, and qa runs this on the Mac.
   * Fix: refuse an existing out-dir that is not empty and has no `walk.json` (`walk: <dir> is not empty and not an earlier walk; refused`, exit 2), or always write into a new `walk-<id>-<time>` folder below it.

## Minors (fix in this PR or record as a follow-up row)
1. **walks.yml:94 / walk.mjs:65: `GITHUB_SHA` cannot be overridden.** GitHub's docs say the default `GITHUB_*` variables cannot be overwritten. On `pull_request`, walk.json, README.md and the summary would then carry the merge commit while the artifact name carries the head sha. Fix: pass `WALK_SHA` and read it in walk.mjs, or always use `git rev-parse HEAD` (the checkout is the head). Confirm against this PR's walk.json once run 44318409310 finishes.
2. **check_journey_recording.ts:41-42: the self-test assertion only checks that strings are present.** It passes if the self-test step loses `if: always()` or its `|| exit 1` lines. "Only the fixture has continue-on-error" (claimed in the PR body) and the :4400 refusal are not tested. Fix: cut out the self-test block and assert its `if: always() && matrix.j.expect == 'fail'`, `[ "$OUTCOME" = failure ] ||` and `[ -n "$ART" ] ||`; assert `continue-on-error` occurs exactly once; run `walk.mjs` on a temporary header with port 4400 and expect exit 2.
3. **walk.mjs:43: `spawnSync` buffers everything.** The Actions log stays silent for up to 40 min. At the 40-min timeout tsx gets SIGTERM, and without Major 1's handler the trace is lost. Fix: `spawn` with piped output, copied to the log as it arrives and kept for the counts.
4. **record.ts:68-82: step screenshots are taken asynchronously while the journey moves on.** A "PASS" shot can show the next step's state. Fix: say in README.md that step shots are taken just after the line and the trace is the exact record, or chain the shots one after another.
5. **walk.mjs:22-27: a header with no parsable copy line silently runs with no copy.** It then hits a dead port with a confusing error. Fix: for `j_<n>.ts` outside `fixtures/`, no copy line means exit 2, "header has no isolated.sh … start … && line".
6. **walk.mjs:34-38 and 51: a failed `start` never calls `stop`.** On the Mac a half-started copy then waits for its ttl. Fix: run `iso("stop")` whenever a start was attempted.
7. **walks.yml:101-108 (upload): add `overwrite: true`.** "Re-run failed jobs" in the same run would otherwise upload the same artifact name again; v4 may refuse that.
8. **walks.yml:55: `for w in $WANT` expands globs.** Input `*` is answered with "'AGENTS.md' is not j_<n>". It is harmless but confusing. Fix: `set -f` first.
9. **walks.yml:26-30: drafts and merge-queue batches.** P-371 (WAY-OF-WORKING.md:46) says a draft push runs only the guard. This workflow walks every journey on every draft push that touches its paths, and on `mergify/*` batch PRs too. The PR discloses this and asks the tech lead, so it is not silent. Recommendation: follow P-371 as written, with `types: [opened, synchronize, reopened, ready_for_review]` plus `if: !github.event.pull_request.draft && !startsWith(github.event.pull_request.head.ref, 'mergify/')` on `plan`, unless the tech lead records otherwise.

Round 1 verdict: Block, for Majors 1-3.

## Round 2: diff-only, `d09c8f6cd..ba7ac696b` (b0deb8b85, a8b10a6ec, ba7ac696b)
Evidence:
* `check_journey_recording.ts`: 17 passed, 0 failed, run twice here (6.9 s).
* My round-1 scratch journeys, walked again: crash gives exit 1 with trace-1.zip; exit mid-walk followed by Playwright clicks gives **exit 2, 1 PASS**, with the trace kept.
* SIGTERM sent to `tsx --import record.ts` (scratch `hang.ts`): tsx 4.23 passes it on, and record.ts answers with exit 143, trace-1.zip and the step screenshot.
* CI: walks run 44320843067 on ba7ac696b is pending; the earlier runs were cancelled by newer pushes.

**Round-1 findings, all closed:**
* **M1 closed.** record.ts:102-114 adds `uncaughtException`, `unhandledRejection` and `SIGTERM` handlers, and the first way out wins. The fixture j_0_throws is checked as R3 and runs in the matrix with `expect: fail`.
* **M2 closed.** After the first exit, `console.log` is silent and `fetch` never settles. Later Playwright errors are swallowed by `crash`, which ignores everything once exiting. R4 checks it, and my click-after-exit scratch confirms it.
* **M3 closed.** walk.mjs:20 refuses a non-empty folder that holds no walk.json and leaves it untouched (R5); an earlier walk's folder is reused.
* **Minors closed:**
  * m1: `WALK_SHA`.
  * m2: `continue-on-error` occurs once, and the self-test step's `if` and both `|| exit 1` lines are asserted.
  * m3: the output streams, with TERM, then KILL 2 min later.
  * m4: shots are queued one after another, and finishContext waits for them before tracing stops.
  * m5: R6 refuses a `j_<n>.ts` with no copy line.
  * m6: `tried` makes stop run after any start attempt.
  * m7: `overwrite: true`.
  * m8: `set -f`.
  * m9 is open, for the tech lead, as the PR asks.
* **CodeQL commits are right.**
  * No npm cache, plus a shape check: walks.yml no longer reads or writes a cache from a dispatch on any ref.
  * ba7ac696b: a dispatch does a plain checkout, which is `github.ref` at `github.sha`, equal to plan's `sha` output, so the artifact name, WALK_SHA and the tree all agree. A `pull_request` run checks out the PR head with a read-only token and no cache.

**New Minors** (they do not block; fix in this PR or as a follow-up row):
1. **record.ts:77-90: a failed queued step poisons the queue and is reported as a journey crash.** The causes: `await board` rejects (board launch failed), the board `evaluate` fails, or `appendFileSync` fails. Each later `queue.then` then rejects, and the unhandled rejection reaches `crash`, so the walk exits 1 with "the journey crashed" when the fault was the recorder's. Fix: `queue = queue.then(fn).catch((e) => realLog(\`record: step ${n} not recorded: ${e.message}\`))`.
2. **record.ts:20-23: two closes of the same context at once.** For example, the journey's own `ctx.close` while `finish()` is closing it. Both pass `live.has`; the second returns early and calls the real close while the first is still in `tracing.stop`, so the trace can be lost. Fix: keep one finishing promise for each context (a `Map<BrowserContext, Promise>`) and return it.
3. **walk.mjs:53-54: stdout and stderr chunks go into one `log` array.** A stdout line split across two chunks, with a stderr chunk between them, is miscounted. This is rare, since a pipe chunk is up to 64 KB. Fix: keep two buffers and count PASS/FAIL from stdout plus stderr, each joined separately.
4. **walks.yml:133: the self-test now checks `steps/001-*.png` for both fixtures.** In CI, j_0_fails' failed-step shot (`002-fail-*`) is no longer checked; R1 still checks it on a machine. Fix: add `expect_shot` to the matrix entry, or `ls` the `002-fail` shot when `matrix.j.name == 'j_0_fails'`.
5. **check_journey_recording.ts:52: R6 writes `tests/journeys/j_999.ts` into the tracked folder** and removes it in `finally`. A kill between the write and the remove leaves a file that walks.yml would pick up. Fix: write the temporary journey under a `mkdtemp` folder and give walk.mjs a way to treat it as "of this folder" (for example `WALK_JOURNEYS_DIR`), or accept the risk as is.

## Journey score (journey-test skill, reviewer role), round 2: 8.5 / 10, which passes (8 or more, no 0)
Report: `screens/P-700-walks/journey-test-reviewer-2026-11-18.md`; it holds round 1 (6.5) and round 2.

## Could not check (round 2)
* The walks run on ba7ac696b: CI has not walked it yet. So the Done-when lines about green j_6 and j_9 jobs, their artifacts, the **video** and both self-test jobs are not shown yet. The video has been observed nowhere.
* That is a Done-when line to confirm on the run, not a code finding. The tech lead labels only after that run is green.
* j_6 and j_9 themselves: not started, as instructed.
* Dispatch: 403 from a cloud lane.

Reviewer: Approve ba7ac696b09762cf70fdf1d9cc4acbe433f9d1e7
