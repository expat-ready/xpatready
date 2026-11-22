# Review: SPD-2 item 5, PR concurrency and drafts (PR #3007, head f8faae7555ba564886b3108bc153afb8fa91570b)

Independent review, 22 Nov. This is pipeline work, not a screen, so the screen dimensions (D1-D20, BIC, graph) and the journey test do not apply (no journey score). Judged on: correctness and safety of the CI configuration against the tech lead's ask (a) and (b).
Read: `git diff origin/main...f8faae755` (11 workflows, check-pr-concurrency.sh new, check-pr-suites-job.sh, check-guards.sh), the PR body, queue-gate.yml/.sh, label-guard.yml, comment-run.yml, ci-memory.mjs, .mergify.yml.
Ran: `check-pr-concurrency.sh` PASS (51 checks); `check-pr-suites-job.sh` 20/20. I ran the mutations on a scratch copy of `.github/workflows` (PRC_WORKFLOWS=...), never on the repo.

## What holds
* **ci, merge-queue batch:** a batch PR has its own number, so its group is `ci-<batch>-full`. Every run in that group is a batch run (head `mergify/...`), and cancel-in-progress is false for each of them. Nothing can cancel a batch run that is already running.
* **ci, `/run full` (workflow_dispatch):** group `ci-full-<head>-full`, cancel is false (`event_name != pull_request`). No PR run can land in that group. Not cancellable.
* **Main:** ci, pr-suites and module-cards have no push trigger. walks dispatch runs use `walks-<run_id>`, a group of their own, with cancel false. No run on main can be cancelled.
* **(b) drafts:** guards, trace, cockpit-tests, lead-tools-tests and cycle-timeline now have `ready_for_review` and skip drafts but not batches. For pull_request events, `paths` filters are matched against the PR's whole three-dot diff, so a `ready_for_review` run fires whenever the PR touches those paths. None of these five is a Mergify condition (only ci, xfa-engine, queue-fresh and skeleton are), so a draft-skipped check cannot pass as success for the queue.
* **queue-gate / label-guard / ci-memory with cancelled runs:**
  * queue-gate's `ci()` reads the newest "ci" check run on the *current* head, so an older head's cancelled run is never judged.
  * label-guard's sweep on `workflow_run` completed only reads labels; a cancelled run changes nothing for it.
  * ci-memory stores only `success` verdicts, so a cancelled run leaves nothing behind.
* **Mutations caught (scratch copy):**
  * ci cancel set to `true` (batch and dispatch both flagged);
  * ci's `mergify/` clause dropped;
  * ci's `event_name` clause dropped (dispatch flagged);
  * walks cancel `false`;
  * walks plan runs on drafts;
  * ci group not per PR;
  * pr-rules cancel `false`;
  * guards `if: true`.

## Blockers
1. **review-rounds: the new workflow-level group is the same group as its existing job-level group, so every run deadlocks and is cancelled.**
   * The new workflow-level group is `review-rounds-${{ pull_request.number || issue.number }}`. The job keeps `concurrency: group: review-rounds-${{ issue.number || pull_request.number }}`. Both evaluate to `review-rounds-<N>`.
   * GitHub refuses a job-level group equal to its own workflow's group. It cancels the run with "Canceling since a deadlock for concurrency group 'review-rounds-N' was detected between 'top level workflow' and 'review-rounds'".
   * Result: every pull_request_target and verdict-comment run is cancelled, and the `review-rounds` status is never set. This is the 3-green-days trial the Lead is measuring (Lead 13).
   * The block also brings back, on its own terms, the exact fault that #2749 review M1 fixed (commit 777a245ec moved concurrency from the workflow to the job). A workflow-level group takes a slot even when the job is skipped. Any unrelated comment, such as Mergify's (an App, so it starts runs) or a builder's, then cancels a running verdict run. The job's own comment, which this PR left in place, still says so: "a skipped run for an unrelated comment takes no slot, so it can never cancel a verdict's run".
   * The PR's own CI cannot show this: issue_comment and pull_request_target run main's copy of the file.
   * Fix: drop the new workflow-level `concurrency:` block from review-rounds.yml. The job-level group already gives one group per PR with cancel, which is what (a) asks (its plain `cancel-in-progress: true` on a batch PR is covered in Minor 4). Also see Major 1.

## Majors
1. **check-pr-concurrency.sh requires the faulty shape and refuses the correct one.**
   * It reads only workflow-level `concurrency`. Removing the workflow block from review-rounds.yml (keeping the job-level group) fails it with "review-rounds.yml: no concurrency group".
   * The new mutation row `36 comment` in check-guards.sh also locks the workflow-level `|| github.event.issue.number` in place.
   * Fix: accept job-level concurrency (for review-rounds, read the job's group and cancel). Make sure no workflow's group equals one of its job groups. Make sure a run whose job is skipped (an unrelated issue_comment) takes no group slot. Re-point row 36 to match.
2. **The (b) draft check passes when the draft guard is deleted or written without `${{ }}`.** The last loop (`ci.yml` kind, `pr-suites.yml` plan, walks) does `if "if" not in j: continue`, skips on an exception, and fails only when `run is True`. Mutations that survive:
   * deleting ci's `kind:` `if` line, so kind, fast, types and ci all run on every draft: PASS, 50 checks;
   * deleting pr-suites plan's `if` line: PASS here (check-pr-suites-job.sh does catch this one);
   * replacing pr-suites plan's `if` with the bare `if: github.event_name == 'pull_request'`, which GitHub evaluates as an expression and which runs on drafts: PASS, 51 checks. `ev()` returns the raw string, not `True`.

   The PR names this property, "ci on a draft runs only its guard job", as one the check keeps. Fix:
   * a missing `if` on those jobs fails the check;
   * an `if` without `${{ }}` is evaluated as an expression (GitHub's rule for `jobs.*.if`);
   * an exception fails the check instead of being skipped.

## Minors
1. **Stale comments that now state the opposite of the configuration:**
   * ci.yml lines 52-53, P-371 (2): "A ready head's check is never cancelled: a newer push waits for it".
   * ci.yml's group note: "an older run re-entering the group replaces a newer one still waiting". It now *cancels* a newer run even while that run is running.
   * module-cards.yml lines 4-5: "No concurrency group ... a CI run is never cancelled".
   * queue-gate.sh line 15: "never a cancel".

   Correct them in this PR. WAY-OF-WORKING is the Lead's records, already raised in the PR body.
2. **Re-runs of an older head now cancel the newer head's running ci.** A re-run keeps its original event (`pull_request`, not `mergify/`), so cancel-in-progress is true for it. This covers queue-gate's automatic `actions/runs/<id>/rerun` and a person's "Re-run failed jobs" on an older run.
   * queue-gate loads the head, then re-runs that head's run. If a push lands in between and label-guard has not yet removed the label, the re-run of the old head cancels the new head's ci. The new head then shows ci "cancelled", and Mergify will not queue it until someone re-runs.
   * The window is seconds long, and the PR body's question 3 covers only the by-hand case.
   * Suggest: queue-gate re-reads the PR's head just before `rerun` and skips when it moved.
3. **No group-name uniqueness check:** renaming pr-suites' group to `walks-<N>` survives (PASS, 51 checks). pr-suites and walks would then cancel each other's PR runs. Adding a cross-workflow and job check is cheap, and it would also have caught Blocker 1.
4. **The five path-filtered workflows still cancel batch runs.** They now run on batches explicitly but keep the plain `cancel-in-progress: true` on `<name>-<PR number>`, so a resync of a batch PR cancels its running batch run. None is a Mergify condition and none is among the six named in (a), so there is no merge impact. Noted only because the ask says batch runs are never cancelled. The same applies to review-rounds' job group on a comment to a batch PR.
5. **The evaluator rewrites GitHub expressions into Python unfaithfully.** Measured with its own `ev()`:
   * `==` and `startsWith()` are case-insensitive in GitHub but case-sensitive here. `startsWith(ref,'MERGIFY/')` on a batch is GitHub true, here False, so changing the case of `'mergify/'` in ci's cancel is a false FAIL.
   * GitHub coerces `null == ''` to true (dispatch: `head.ref == ''`); here it is False.
   * `true`, `false` and `null` literals inside `${{ }}` raise NameError.
   * `contains()` is always False.
   * The test context has no `github.head_ref`, so module-cards' job `if` (`!startsWith(github.head_ref,'mergify/merge-queue/')`) is judged to *run* on a batch, which is wrong. It does not change today's result, because cancel is checked first.

   Most of these fail closed. The fail-open ones are in Major 2. Suggest: lower-case both sides for `==` and `startsWith`, map the literals, put `head_ref` in the contexts, and fail on any name the evaluator does not know.

## Answers to the five questions
1. Batch, dispatch, main: not cancellable by this change (see "What holds"). Only the out-of-scope workflows in Minor 4 can cancel a batch.
2. No required check is left stale. The five draft-skipping workflows have `ready_for_review` and are not Mergify conditions.
3. queue-gate: the re-run race (Minor 2). label-guard: a cancelled completion is harmless. review-rounds: broken (Blocker 1). comment-run: `/rerun failed` targets the newest run (same race as Minor 2). ci-memory: unaffected.
4. Evaluator misjudgments: Minor 5 and Major 2 (a bare `if` read as a truthy string, a missing `if` skipped).
5. Both scripts pass. 8 mutations are caught, 4 survive (Major 2 x3, Minor 3).

Reviewer: Block f8faae7555ba564886b3108bc153afb8fa91570b
Verdict: Block

## Round 2 (diff-only, f8faae755..839fe12603360472bf4eee89a8a6ae706e716f1c)

Read: `git diff f8faae755 839fe1260` (8 workflows, check-pr-concurrency.sh rewrite, queue-gate.sh, check-queue-gate.sh, check-guards.sh rows).
Ran: `check-pr-concurrency.sh` PASS (78 checks); `check-queue-gate.sh` 137/137; `check-pr-suites-job.sh` 20/20; 20 mutations on a scratch copy (PRC_WORKFLOWS=...); each of the ten guard-36 rows applied by hand in a scratch copy (not `--mutate`).

### Round-1 findings
* **B1 fixed.** review-rounds has only the job-level group. Its cancel `${{ !startsWith(github.event.pull_request.head.ref || '', 'mergify/') }}` is correct:
  * pull_request_target on a batch: false;
  * on a PR: true;
  * issue_comment has no `pull_request` in its payload, so `null || ''` gives `''` and cancel is true. That is fine: one group per PR, a newer run reads every verdict again, and a skipped job takes no slot. The exact round-1 block, re-added, now fails the check.
* **Trailing comment on the five:** PyYAML and Ruby Psych both read `cancel-in-progress` as just the `${{ ... }}`. YAML ends a plain scalar at ` #`, so GitHub reads the expression, not a string. All five are pull_request-only, so `head.ref` is never null there.
* **M1 partly fixed.** Job-level groups are accepted and the same-name deadlock is checked, but only for pull_request_target. See Major R2-1.
* **M2 fixed.** These now FAIL: a missing `if`; a bare `if` (evaluated as an expression); an unreadable `if`. Each was mutation-checked: kind `if: true`, kind bare `event_name == 'pull_request'`, walks plan `if` deleted, pr-suites plan bare `if`.
* **m1 fixed:** ci.yml (2) and the group note, module-cards header, queue-gate.sh. queue-gate.yml:8 "never a cancel" is about the gate itself and is still true.
* **m2 fixed.** The head is read again just before `rerun`; a moved head gets no re-run. The new fixture goes red when that line is removed (136/1 in a scratch copy, with only that test failing). The non-moved path still re-runs (`RERUN 77`).
* **m3 fixed:** pr-suites renamed to `walks-`, and guards renamed to `trace-`, both now FAIL.
* **m4 fixed:** the five no longer cancel a batch. Guards `cancel: true` and guards cancel keyed on `head.label` both FAIL.
* **m5 mostly fixed:** `==` and `startsWith` ignore case (`'MERGIFY/'` now passes, as on GitHub); `null == ''` is true; `true`/`false`/`null` literals work; `contains()` works; `head_ref` is in the contexts. One gap is left, in R2-1(a).
* **Guard-36 rows:** each of the ten edits changes its file, keeps the YAML valid, and turns its test red for the intended reason. `36 comment` also strips `issue.number` from the `PR:` env line, which is harmless. `36 rerun` turns exactly the m2 fixture red.

### Major
1. **R2-1, the rest of M1: the check still passes three edits that break review-rounds.** issue_comment and pull_request_target run main's copy, so this check is the only guard. Each edit below PASSES (79 checks):
   * (a) A workflow-level `group: ${{ github.workflow }}-${{ github.event.pull_request.number || github.event.issue.number }}`. On GitHub this is `review-rounds-7`, equal to the job group: B1's deadlock, which cancels every run. The checker's contexts have no `workflow`, and an unknown `github.<key>` silently evaluates to null, so it sees `-7`. The script's header says a context it cannot know fails the check.
   * (b) A workflow-level `group: review-rounds-${{ github.event.issue.number }}`. This deadlocks every verdict-comment run. The same-name comparison runs only in the pull_request_target cases, not in the issue_comment case.
   * (c) A workflow-level group with another name and the mergify cancel. This brings back #2749 M1: an unrelated comment's skipped run takes the slot and cancels a running verdict run. Round 1 asked for this check ("a run whose job is skipped takes no group slot").

   Fix (small):
   * put `workflow` (the file's `name:`) into the contexts, and fail on any `github.<key>` the evaluator does not model;
   * run the deadlock comparison in the issue_comment context too;
   * for a workflow with issue_comment, add an unrelated-comment context (body "thanks") whose `groups()` must be empty.

### Minors / nits (not blocking)
1. review-rounds' new comment says a batch "is never cancelled". That holds for pull_request_target runs only: a verdict comment on a batch PR gets cancel true. This is harmless (no verdicts on batch PRs; not a Mergify condition), so reword the comment or leave it.
2. The M2 cases test a draft and a ready PR, not a batch. ci kind `if: github.event.pull_request.draft == false` passes, yet batches would then skip kind. The `ci` job fails when kind is not `success`, so this fails closed (red batches), not unsafe. Adding a batch case would catch it.
3. The m3 loop's `except Exception: continue` silently skips a workflow whose group it cannot read (for example a `vars.` group outside the eleven). It should FAIL instead.
4. Row `36 deadlock` needs GNU sed's `\n` in a replacement. With BSD sed (Mac) it writes broken YAML, and since a `.yml` is not syntax-checked (`sh=true`), the row would pass for the wrong reason. CI on ubuntu is fine.
5. queue-gate.sh: if the head cannot be read again, it prints "the head moved to  after ...". This is fail-safe (no re-run; the 30-minute sweep tries again), but the message is misleading.

Reviewer: Block 839fe12603360472bf4eee89a8a6ae706e716f1c
Verdict: Block (fix Major R2-1; the minors are optional)
