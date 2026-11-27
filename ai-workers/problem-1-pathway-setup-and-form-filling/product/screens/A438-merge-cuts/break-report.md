# A438 merge cuts: break report (PR #3942, head d40ab537d7e6)

Adversarial check of the pipeline change: records queue without a reviewer (cut 1), weakening.py as the trigger for the Lead's read on
pipeline paths (cut 2), review-rounds counting only change rounds (cut 3). No UI. Method: GitHub-files-JSON fixtures
(`[{filename, status, patch, changes, previous_filename}]`) run as `python3 -I product/tools/weakening.py --files F.json PATH`, then
the worst ones through queue-gate.sh and lead-read-gate.sh with their own stand-in curl (the first 679 lines of check-queue-gate.sh
and the first 160 of check-lead-read-gate.sh, with breaker cases added after them; both harnesses still pass before the added cases).
review-rounds.py `judge()` was called directly. The tool's own tests pass: `--self-test` all passed, check-weakening.sh 11/11,
check-records-queue.sh 14/14, check-review-rounds.sh OK. "NOT WEAKENING" below means no Lead read: `review: approved` goes on after the reviewer's Approve alone.
T = `ai-workers/problem-1-pathway-setup-and-form-filling/product/tools/`.

## Blockers

**B1. A guard, test, hook or workflow is switched off by adding lines only.** weakening.py looks only at removed lines for guards and tests
(weakening.py:194-202), and for workflows it checks added lines against a short list only (weakening.py:50-58, 177-187). All of these are NOT WEAKENING:
- A01 `T/push-guard.sh` `@@ -18,2 +18,3 @@\n set -uo pipefail\n+exit 0\n ROOT=x` (the guard)
- A02 `T/check-docs.sh` with `+exit 0` (the check ci runs on every records PR). A26: `studio/tools/check-port-contracts.mjs` with `+process.exit(0)`
- A03 `.githooks/pre-push` with `+exit 0`
- A04 `.github/workflows/ci.yml`: `+          exit 0` as the first line of the existing `run: |` block at ci.yml:358
- A05-A07 ci.yml step gains `if: ${{ 1 == 2 }}`, `if: "false"` or `if: github.run_id == 0` (the list matches only `if: false` and `if: ${{ false`)
- End-to-end: queue-gate.sh `label` put `LABEL 7` (review: approved) on A01, A02 and A05, and lead-read-gate.sh `judge` gave `OK` on A01 (scratch harness cases "BREAK", 7/7 and 4/4 got through).

**B2. 82 files under product/tools/ count as "other pipeline code" (weakening.py:95, 203), so no change to them is ever weakening.
36 of them are run by workflows, including the ones that decide what CI checks:**
- `pr-base.sh` works out the range that the push guard, change-kind, run-suites and gate B read (ci.yml:113, 166, 290). Fixture A20,
  `+  echo "$head..$head"; return 0`, gives an empty range everywhere. NOT WEAKENING. End-to-end it got the label with no Lead read.
- `ci-memory.mjs verdict-of` (ci.yml:260): when it answers, ci sets mode=same and the test jobs are skipped (ci.yml:273). Fixture A23,
  `-  if (!match) return '';` `+  return 'green 1';`: NOT WEAKENING. lead-read-gate.sh: OK.
- The same holds for `suite-exit.mjs` (B160: a red suite must fail), `ci-and-lists.mjs` (a red check hidden behind `&&`),
  `write-token.py` (the write-token audit, which lead-read-paths.txt itself calls a guard), `migration-slots.py`, `static-sweeps.mjs`,
  `decision-impact.sh`, `graph.mjs`. Under studio/tools the same is true of `item-proof.mjs`, `count-any.mjs` and `skeleton-smoke.sh`.
  The classification goes by file name (GUARD, weakening.py:69), and these names contain none of its words.

**B3. A change to an agent's front matter in a real diff is not caught.** front_matter() reads only a hunk that starts at line 0 or 1
(weakening.py:119). GitHub's 3 lines of context put a change on line 5 or 6 in a hunk that starts at line 2. Real fixture:
`git diff --no-index` of `.claude/agents/screen-reviewer.md` with `model: opus` changed to `haiku` and `effort: high` changed to `low` gives `@@ -2,8 +2,8 @@`, and the result is NOT WEAKENING.
queue-gate.sh labelled it, and lead-read-gate.sh gave OK. The self-test case "an agent's effort lowered" (weakening.py:276) passes only because it fakes `@@ -1,4`.
On the real agents (7-line front matter) and all 12 SKILL.md files (4 lines), only `tools:` on line 4 is ever caught.

## Majors

**M1. A removed line counts as "kept" when one added line contains all its words (weakening.py:107-110). So a check stays in the
diff but no longer runs.** All of these are NOT WEAKENING:
- A17 `[ -z "$ok" ] && exit 1` becomes `false && [ -z "$ok" ] && exit 1`. A19 `if n > 3: refuse()` becomes `if n > 3 and False: refuse()`.
- A18: the line moves into a `cat >/dev/null <<'X' … X` heredoc. A27: a test assertion gains `|| echo 1`.
- A11 `run: bash check-mergify-scopes.sh` becomes `run: echo bash …`. A12 the same run line gains `|| exit 0` (only `|| true` is listed).
- A08: a step is deleted and added back with `continue-on-error: true`. The re-added step counts as "new", so the report-only exception applies (weakening.py:168-178).
- A13: ci.yml:110 checkout `with: { fetch-depth: 0, filter: "blob:none" }` gains `, ref: main`. The job then checks out main, not the PR.

**M2. Weakening forms in workflows that the added-line list misses.** All of these are NOT WEAKENING:
A09 `continue-on-error: ${{ true }}`, A10 `continue-on-error: "true"` on an existing step; A44 `permissions: { contents: 'write' }`
(quoted); A43 `uses: docker://alpine:3`; A45 `${{ secrets['PAT'] }}`; A16 an added `paths-ignore: ['**']`. A14: guards.yml:48
`part: [1, 2, 3, 4]` becomes `[1]`. Numbers are ignored for workflows (weakening.py:191), so dropping 3 of the 4 mutation parts is not weakening.
guards.yml is not a merge condition (its header), so a red check-guard-parts.sh would not block the merge.

**M3. Gaps in the `.claude/settings.json` checks** (weakening.py:64-66, 158-166). All of these are NOT WEAKENING:
- A28: `+      "Bash",` added inside an existing `"allow": [` array. No `(` follows the tool name, and the `allow` key is on another line.
- A29: `+    "defaultMode": "bypassPermissions",`. JSON reads this as defaultMode = bypassPermissions.
- A30: a hook command `"bash guard.sh"` becomes `"exit 0; bash guard.sh"` (kept by its words). A32: an added `"env": {…}` block.
- A34: a `hooks:` block is removed from an agent's front matter. A35: a `disallowed-tools:` line is removed. AGENT_FM (weakening.py:71) lists neither form.

**M4. Some "records" that now merge with no reviewer at all are inputs to gates, or rules that agents follow** (cut 1, .mergify.yml:445, 546).
records-only.sh and Mergify's `-files` both accept these:
- `product/qa/BUGS.md`: wip-guard.py:73 lets a "fix QA-n" item past the WIP limit whenever a `| QA-n |` row exists. A records PR can add a fake row.
- `product/focus-list.md`, `BACKLOG*.md` and `qa/CAPABILITIES.md` set which packs and suites ready-gate.py checks (ready-gate.py:11-14, 44, 92).
- `product/RULES.md`, `WAY-OF-WORKING.md`, `STANDARDS.md` and `DECISIONS.md`: every agent's start read and the founder's decision rows.
  A records PR can add a decision row in the founder's name. ci checks only check-docs.sh and decision-impact.sh.
- `product/cockpit/index.html`: 141 KB of JavaScript, the founder's progress board (it uses localStorage and fetch). It now merges unread.
Before this PR each of these needed a reviewer's Approve. The founder decided "records need no reviewer". Whether that decision covers
gate inputs and rule files is for the founder: list them, or move them out of the record pattern.

## Minors
- m1 Mergify's `-files` lines (.mergify.yml:446-447) are looser than records-only.sh, "the one definition". They accept
  `product/STAND-INS.md`, which change-kind.sh classes as code. records-label.yml takes a hand-put label back off on `labeled`. It does not run for a fork PR
  (its `if:` requires the same repository), so on a fork PR a maintainer's hand label on such a file would ride the records queue.
  Not checked: whether Mergify's `files` includes `previous_filename`. If it does not, a hand-labelled rename from tools/ to a .md
  under product/ passes the `-files` lines, and only records-label.yml removes the label.
- m2 A36: a mode-only change such as `.githooks/pre-push` 755 to 644 (status `changed`, no patch, `changes: 0`) is NOT WEAKENING (weakening.py:145).
  The CI push guard still runs.
- m3 A39: deleting AGENTS.md or CLAUDE.md counts as prose (weakening.py:139), so it is not weakening. Prose is out of the tool's scope by design, but deleting the rules file is a removal.
- m4 review-rounds: `Reviewer: Approved with changes: fix M1, M2` is now an uncounted Approve. Three forms were never counted, before this PR either:
  `Verdict: Block` (the screen-reviewer's own form), `Reviewer - Changes` and `Reviewer: Rejects`.
- m5 lines() (weakening.py:99) drops a changed line whose content starts with `++ ` or `-- `. GitHub's patch has no `+++` headers.

## What held
- A removed file, a rename (A37), a missing patch (A38) and a path missing from the file list all count as weakening.
  A missing weakening.py or one that fails means read first. A list without the `# --- pipeline` line falls back to the old rule.
- Gates by name (queue-gate.sh, .mergify.yml, lead-read-paths.txt, weakening.py itself, `studio/tools/gate-b.mjs` A47): any code line counts.
  Comment-only edits do not.
- The permission machinery and prisma.config moved above the marker, so they are still read first (and tested).
- A removed guard line that is kept only as a comment (A40) is caught. An allow-list entry with its date pushed out (A41) is caught.
  A deny rule moved to allow (A31) is caught. `pull_request_target`, `secrets.`, `|| true` and a third-party `owner/action` are caught.
- Mergify: a tool, JSON, `Tools/`, a code file or a later code push takes the PR off the records queue. A code PR needs `review: approved` (check-records-queue.sh).
- review-rounds: `Reviewer: Blocked`, an Approve and a Changes line in the same comment, `**Reviewer:** Changes` and an NBSP after the colon are all counted.
  Prose "changes" inside an Approve is not counted.
- Both gates call weakening.py on the same file list and give the same answer.

Verdict: Block
