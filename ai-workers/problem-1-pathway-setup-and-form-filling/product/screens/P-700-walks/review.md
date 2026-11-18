# Review: PR #2133, recorded gate A walks (P-700) at d09c8f6cd

Reviewer: Opus, fresh context, did not build it. Merge-flow tooling (P-214), not a screen, so the screen-review parts that need a screen (D1-D20, the BIC table, 1024 px / 200 % zoom, PRODUCT.md menu words) are **N/A**. What I judged: correctness, security, robustness, the PR body's Done when, P-700's requirements and WAY-OF-WORKING / STANDARDS rules.
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

## Journey score (journey-test skill, reviewer role): 6.5 / 10, below the pass mark of 8
Report: `screens/P-700-walks/journey-test-reviewer-2026-11-18.md`. The low points are error recovery, correct data and feedback (Majors 1-3, Minors 1 and 3).

## Could not check
* The CI run: walks run 44318409310 is queued, so I have no artifacts, no video and no job times.
* `check_journey_recording.ts` in ci: the PR is a draft, so only the guard ran.
* The video: this machine's Chromium records none.
* Dispatch from a cloud lane: 403, P-439.
* The GITHUB_SHA override (Minor 1) is stated from GitHub's documented rule, not observed.

Reviewer: Block
1. Major: record.ts:93-94, handle uncaughtException / unhandledRejection / SIGTERM so that `finish()` always runs, plus a crashing fixture in the check and the matrix.
2. Major: record.ts:93, after `process.exit` stop recording steps and keep the requested exit code, plus a test.
3. Major: walk.mjs:19, never `rm -rf` a non-empty out-dir that is not an earlier walk.
4. Minors 1-9 above: fix them or record them as a follow-up row; they do not block.
