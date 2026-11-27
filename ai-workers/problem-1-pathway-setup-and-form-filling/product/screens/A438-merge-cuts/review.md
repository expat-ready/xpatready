# A438 merge cuts: independent review (merge-gate change, not a screen)

PR #3942, branch `claude/evidence-merge-cuts`, head **d40ab537d7e608b722ffde62cbb72cadd0608ca3**, diff `origin/main...d40ab537d` (16 files).
Reviewed on an isolated export of that exact commit (`git archive d40ab537d`). The shared working tree had uncommitted edits to
weakening.py, .mergify.yml and the tests during this review. They were **not reviewed**. That copy catches many of the probes
below, but this verdict is for the commit.

## What I ran
* `check-weakening.sh` 11/0 · `check-records-queue.sh` 14/0 · `check-review-rounds.sh` and `test_review_rounds.py` 12 OK ·
  `screens/B119/check-queue-rules.py` 87/0 · `check-queue-gate.sh` 275/0 · `check-lead-read-gate.sh` 138/0 · `weakening.py --self-test` all passed.
* All 12 "A438" mutation rows of check-guards.sh, run on their own: each goes red, as intended.
* Bypass probes: (a) `weakening.judge()` on GitHub-form file entries; (b) real commits judged with `weakening.py --git`; (c) **end to end through
  `queue-gate.sh label`**, using check-queue-gate.sh's own harness (PR 7 approved, green ci). Controls: a removed mutation row is HELD
  and an added tool is labelled, so the harness is valid. Each "BYPASS" below means `queue-gate.sh` put `review: approved` on the PR with no Lead read.

## Blockers (a weakening diff reaches main without the Lead's read: A438's own rule)
**B1. Additive or structural weakening of a guard, test, hook or workflow is never flagged.** `weakening.py:194-203` only flags *removed* lines,
for tests only lines that match `ASSERT` (`:72`). `kept()` (`:107-111`) is a word-subset test, so a line that keeps its words but is negated still passes.
End to end, all of these are BYPASS: `.githooks/pre-push` gains `exit 0`; a guard's check is wrapped in `if false; … fi`; `[ -z "$ok" ] && exit 1`
becomes `false && [ -z "$ok" ] && exit 1` (kept); a guards.yml step gains `exit 0` in its `run: |`; a step gains `if: ${{ !true }}`.
Also not flagged (judge/--git): `guard-test-lib.sh` redefines `ok()`; a check-*.sh gains an early `exit 0`; an assertion becomes
`[ "$n" = 4 ] || echo 1 && echo 1` (kept); check-guards.sh:41's `TESTS=` entry drops `check-weakening.sh check-records-queue.sh`, so CI never runs them
(the line does not match ASSERT); check-records-queue.sh loses its "code PR with no review label" and "product/Tools" case rows
(its tuple rows do not match ASSERT). Fix: in guard/test/hook/workflow files treat any changed non-comment line as weakening except
whole new files and pure appends of new test cases or mutation rows, or keep these kinds read-first. Add each probe above as a self-test case.

**B2. A gate change made in comment-form lines is not read.** `if k == "gate"` (`:151`) ignores lines that match `COMMENT` (`:74`). Two cases break it.
(i) In lead-read-paths.txt, the section markers are `#` lines that carry meaning. Move `# --- pipeline` (line 29) above `/api/src/platform/identity/`
and the permission machinery becomes "pipeline", which `kind()` calls `code` and never weakening. BYPASS end to end. Moving `# --- read-after money`
above `permission` is also not flagged.
(ii) `COMMENT` treats any line that starts with `*` as a comment, so a shell `case` arm counts as one. lead-read-gate.sh:131's fail-closed `*) … s=failure`
changed to `s=success` is BYPASS. change-route.sh:38 and tooling-checks.sh:25 are the same kind of line.
Fix: a gate is read on any changed line, comments included (or at least `# ---` and `*)` lines). Test both cases.

**B3. Guards that are not named like guards are classed "code" and are never weakening** (`kind()` `:77-95`, the name regex `GUARD` `:69`, `return ""` `:203`).
Of the 134 pipeline files classed `code`, these hold protection: `migration-additive.py` (P-823: whether a migration is read first),
`write-token.py` (W0), `suite-exit.mjs`, `decision-impact.sh` (records' ci), `current-lead.sh`, `gh.sh`/`fresh-lib.sh`/`repo-root.sh` (libraries the
guards source), `ci-and-lists.mjs`, `static-sweeps.mjs`, `item-proof.mjs`, `skeleton-smoke.sh`. BYPASS end to end: migration-additive.py drops
DROP/RENAME/DELETE; write-token.py loses its W0 failure. Once merged, a destructive migration is labelled with no read first.
Fix: default unknown pipeline code to "guard" (removed or changed lines weaken). Use a named allow-list for reports, counters and watches instead.

**B4. Fail-closed holes: a guard is removed or switched off.** (i) `status == "renamed" and k != "prose"` (`:140`) takes the *new* name's kind, so a rename of
`push-guard.sh` to `push-guard.md` is "prose" and not weakening, under both names. BYPASS end to end. A rename of a SKILL.md out of `.claude/` is the
same. (ii) A mode-only change has no patch and `changes == 0`, so `:145` returns "". `.githooks/pre-commit` going from 100755 to 100644 (git then
ignores the hook) is BYPASS end to end. Fix: rename by either name's kind (never prose when the old name is not prose). Any status other than
`modified` or `added` without a patch fails closed.

## Majors
**M1. Agent front matter is read only in a hunk that starts at line 1** (`front_matter()` `:113-128`, `inside = …` `:119`). Both real agents keep `tools`,
`model` and `effort` on lines 4-6, so lowering screen-reviewer's `effort` (line 6) yields `@@ -3,7 +3,7 @@`, which is not read. BYPASS end to end (and with --git
on the real file). The self-test case (`@@ -1,4`) cannot catch it. Fix: read the front matter from the hunk ranges (any hunk overlapping lines 1..closing `---`).

**M2. Workflow checks miss common widenings** (`:50-58`, `:166-192`). Not flagged: `continue-on-error: ${{ true }}`; an earlier hunk that adds a new step
leaves `new_step` True across `@@`, so `continue-on-error: true` on an existing step in a later hunk passes; `uses: "someone/x@v1"` (quoted) and `uses: docker://…`;
`paths-ignore: ['**']` on a trigger; `run: x` becomes `run: x || :`; `${{ toJSON(secrets) }}`; a matrix `part: [1, 2, 3, 4]` becomes `[1, 2]` (`numbers=False` at
`:191` keeps it), which drops guard parts. Fix with B1's rule: an existing workflow line changed is weakening; only whole new steps or jobs are not.

**M3. An added file is never weakening, and `kind()` is case-sensitive while lead-read-paths.txt is not.** A PR that adds `.GitHooks/pre-push` (`exit 0`) or
`product/Tools/push-guard.sh` is "an added tool". On the Mac's case-insensitive disk it replaces the real hook or guard at checkout. records-only.sh and the new
`[Tt][Oo][Oo][Ll][Ss]` line already guard this exact case. Fix: an added path that equals an existing path when case is ignored is weakening.

**M4. The tests prove only the cases the tool was written for.** Every self-test and gate case is a single-hunk, hand-written patch from line 1. There is no
negative case for additions, renames to another kind, mode changes, multi-hunk patches, comment-form gate lines or the `code` bucket. A438 says loosening
ships with tests that prove the protected cases hold. These are the protected cases. Fix: add B1-B4 and M1-M3 as self-test cases (expected
weakening) and one end-to-end case each in check-queue-gate.sh and check-lead-read-gate.sh.

## Minors
* m1 `.mergify.yml:444,544`: the comment says a hand-put "records" label "can never ride this queue". The `-files` lines copy only RECORD_FILE and the tools
  exclusion, not change-kind.sh, so `product/STAND-INS.md` and the suite-read `.html` boards (records-only.sh says "no") pass Mergify. Only records-label.yml
  removing the label stops them. Not verified (docs.mergify.com is blocked by this sandbox's proxy): whether Mergify's `files` includes `previous_filename`
  (a rename out of `product/tools/`), and that it is capped at 3000 files. Fix: state the real defence in the comment, or require a commit status that
  records-label.yml sets on the head.
* m2 `weakening.py:313`: with no PATH arguments and a stdin that is not a TTY but stays open, it blocks forever. I hit this with `--git` from a non-interactive shell.
* m3 review-rounds.py: "Reviewer: Approve with changes" or "Reviewer: Approved, fix X first" counts as an Approve and is not counted. There is no test for a
  conditional Approve.
* m4 proof-read-watch.py:82-91 still treats every pipeline line as owing a Lead read (ACT noise for an approved, not yet labelled pipeline PR).
* m5 lead-read-gate.sh:8-10: the comment repeats "(.github/, .mergify.yml, the guards…" mid-sentence.

## What held
* The Mergify regexes are right under Python `re.search`: anchored; the negative lookahead with `$` means "every file is a record"; `product/` is exact case and
  `tools` is any case. product and pipeline keep `label = review: approved`; `check-success = ci` stays in every queue's queue and merge conditions. B119 and
  check-records-queue.sh cover these, with mutations.
* Fail closed: weakening.py missing or crashing (both gates), the `# --- pipeline` marker missing (old rule), a path not in the file list, a removed file, a
  non-prose rename (judged under both names through `previous_filename`), a patch missing with changes > 0. The permission and money lines still apply to a
  pipeline path that is not weakening.
* review-rounds: a mixed Approve-plus-Changes comment counts; outsiders and bots are ignored; "Lead allows round N" works; records stay exempt.

## Journey test
Not applicable: there is no screen or user journey here (the caller scoped this as a merge-gate review). The gate "journeys" were walked as the end-to-end
queue-gate probes above. Journey score: N/A.

## Could not check
Mergify's live behaviour (rename and 3000-file semantics); the real GitHub `files` JSON for a mode-only change (assumed `changes: 0` with no patch).

Verdict: Block

## Round 2 (aed88ed40)

Diff only: `git diff d40ab537d aed88ed40` (14 files). The local tree was clean at aed88ed40cd9945a6b194bb8b1a648e842928888. Note: the PR head on GitHub
is now **5ee15be36**, one line later in `design/lab-register-2026-11-27.md`. This verdict is for aed88ed40 only.

### What I ran
* `check-weakening.sh` 11/0 · `check-queue-gate.sh` 278/0 · `check-lead-read-gate.sh` 140/0 · `check-records-queue.sh` 16/0 ·
  `check-review-rounds.sh` 13 OK · `screens/B119/check-queue-rules.py` 89/0 · `weakening.py --self-test` all passed.
* All round-1 probes from this review (20) and the breaker's (A01-A08, A11, A13, A16, A23, A29, A35, A44, m5), through `judge()`: **every one now weakens**.
* New probes against the new code: `judge()` fixtures; real patches from `git diff --no-index` on edited copies of ci.yml, check-records-queue.sh and
  test_review_rounds.py, run through `weakening.py --files`; and **end to end through `queue-gate.sh label`** (check-queue-gate.sh lines 1-709 as the harness, my cases
  after them, harness 281/0). Control: push-guard.sh gaining `exit 0` is HELD. "BYPASS" means `LABEL 7` (review: approved) with no Lead read. I also checked the
  real effect of each line: PyYAML for workflows, and bash or python3 for exit codes.

### Round-1 findings
| # | Status |
|---|---|
| B1 | **Fixed for code and hooks.** Any change to existing code is read, and every round-1 probe weakens. **Not fixed for tests and workflows**: see R2-B1 and R2-B2. |
| B2 | Fixed. In code, comment lines count. `*)` is code. A moved marker and a changed case arm are both caught, with self-tests. |
| B3 | Fixed. Unknown pipeline code is "code", so any change to it is read. migration-additive.py and write-token.py both weaken. |
| B4 | Fixed. Any rename fails closed, and so does a missing patch (mode-only). Still open: a mode change that comes with a blank-line patch (R2-M1). |
| M1 | Fixed: front matter is found by line numbers, and line 6 in `@@ -3,7` is caught. Still open: a two-step path through a blank line (R2-M1). |
| M2 | Fixed for every listed form. New holes in the same area: R2-B2. |
| M3 | Partly fixed. Capitals added where the pipeline has none are caught. The reverse collision is not (R2-M2). |
| M4 | Fixed: about 30 self-test cases, multi-hunk ones included, and E2E cases in both gates. |
| m1 | Fixed. The comment now names records-label.yml as the real defence. Mergify's rename and 3000-file behaviour is still not verified. |
| m2 | **Open.** The caller says it is outside the touch list, but weakening.py:359 is in this PR. |
| m3 | Partly fixed. "Approve with/after/once…" counts now. My own round-1 example still does not count, see R2-m2. |
| m4 | Deferred. proof-read-watch.py is not in the PR, and the PR body lists it. Accepted. |
| m5 | Fixed. |
| Breaker B1-B3, M1-M3, m2, m3, m5 | Fixed (re-probed). Breaker M4: `.html` now needs the review label (Mergify or-block, with B119 and check-records-queue cases and a mutation row). The gate-input records go to the founder as Question 4 of the PR body. That is correct, because it is the founder's call. |

### Blockers
**R2-B1. An existing test can still be switched off by adding lines alone** (`weakening.py:168-175`). The rule "only gains lines, none matches OFF" is a deny-list,
and it has holes. Three are of the tool's own making:
* **COMMENT-shaped lines are never checked** (`:130`, COMMENT `:58`). In bash, `//usr/bin/false || exit 0` is a command (`//usr/bin/false` is
  `/usr/bin/false`), so the test exits 0. **BYPASS end to end** with a real patch to check-records-queue.sh (after `set -u`). I ran it: the script exits 0 and checks nothing.
  `  * ) exit 0 ;;` added as a case arm is not checked either (`\*\s`).
* **ROW is exempt in every test, not only in check-guards.sh's MUT rows** (`:173`). `exit 0 #|a|b|c.sh` matches ROW, so OFF is waived. **BYPASS end to end.**
* **OFF misses common forms.** Python `exit(0)`: **BYPASS end to end** on a real patch to test_review_rounds.py, which then exits 0. Also, by `judge()`:
  `raise SystemExit(0)`, `assertEqual = lambda *a, **k: None` in the TestCase, bash `trap 'exit 0' EXIT` (exit 0 even after FAIL, run), `exit 00`,
  `{ exit 0; }`, `eval 'ok() { echo PASS; }'` (redefines ok, run), and `fail=0` before the final check.
Two kinds of test cannot be told apart from added lines: one that gains a case and one that gains a line which overrides the result. Fix (choose one, then self-test each
probe above): (a) an **allow-list of added-line shapes** per test kind: an `ok "…"` call, a case-tuple row inside the cases list, a MUT row inside check-guards.sh's
`MUT=` block (ROW only there), or a new `def test_…` method that adds no module- or class-level line; or (b) existing tests are read like code. That costs cut 2's
savings, which is the founder's Question 3. In either case, test lines that start with `//`, `/*` or `*` are not comments in shell and Python.

**R2-B2. An existing workflow can still be weakened by lines that pass the "whole new step or job" rule** (`:176-197`).
* (i) **COMMENT-shaped lines are skipped by every workflow check** (`add` `:130`, and `continue` at `:192`). In YAML, a more-indented line continues the plain scalar above it.
  Real ci.yml:300 `run: bash "$P/tools/check-mergify-scopes.sh"` plus the added line `          // || true` makes the run
  `bash "$P/tools/check-mergify-scopes.sh" // || true` (PyYAML), so the step is always green in the required `ci` (job fast). **BYPASS end to end.**
* (ii) **The rule checks only that the added run starts a step or job, not where the run goes.** Four lines (`  types-parked:` / `    if: false` /
  `    runs-on: ubuntu-latest` / `    steps:`) after ci.yml:558 take the type check's 5 steps into a job that never runs. `types` keeps only the checkout and passes,
  and `ci` needs `types`, not the new job (PyYAML). **BYPASS end to end.** A new step inserted after an existing `run: |` takes over that step's script in the same way (judge).
* Fix: in workflows, only a line that starts with `#` is a comment. An added run passes only when the context line after it is a step start of the same indent, a job
  start, or the end of the file, and the line before it does not open a block (`run: |`, `steps:`, a key with no value). The robust fix is to parse the base and head
  workflow with YAML (the contents API, or `git show` for --git): every base job and step must be the same in the head, and all top-level keys except `jobs` unchanged.
  Add both probes as self-tests and as one check-queue-gate.sh case.

### Majors
**R2-M1. Blank lines are never a change** (`:200-201` and `:150` `t.strip()`). (i) GitHub's files list shows no file mode. So `.githooks/pre-push` 755→644
with one added blank line (status `modified` or `changed`, with a patch) is not weakening. **BYPASS end to end.** git then ignores the hook. This is round-1 B4(ii) again with one
blank line. CI's push guard still runs, which is why this is Major. (ii) Two PRs, neither of them weakening (judge): PR 1 adds a blank line inside screen-reviewer.md's front matter
(valid YAML). PR 2 lowers `effort:` in a hunk whose context holds that blank, and `:155` takes the blank as the end of the front matter. Fix: in code and
front matter, every `+`/`-` line counts, blank ones included. In front matter, only `---` closes (keep the blank-line rule only for hunks that start after line 15).

**R2-M2. The case check is one-way** (`odd_case` `:84-90`). It catches capitals added where the pipeline has none. It misses a lower-case path added where the
pipeline has capitals. An added `.claude/skills/lead/skill.md` is "prose", so its `allowed-tools: Bash` is never read. On the Mac's disk it is the lead skill's
SKILL.md. An added `product/screens/b119/check-queue-rules.py` collides with B119's in the same way. Both are not weakening (judge). Not verified on a Mac. Fix: an
added path is weakening when its lower case equals the lower case of a path in the base tree (`git ls-tree`, or the gate's own file list plus the
contents API), and `kind()` runs on the lower-cased path.

### Minors
* R2-m1 `norm()`'s `rstrip("'")` (`:113`) applies to every test and workflow line, not only to MUT rows. A line's closing quote can move to a later added line, so the
  code in between becomes string data. I tried this on check-guards.sh's last MUT row: it breaks the syntax, because the code after MUT has its own quotes, so it is
  not shown as a bypass. Limit it to ROW lines in check-guards.sh.
* R2-m2 review-rounds.py `conditional` (`:50`) needs a space and then with/after/once/pending/subject to. These still count as an uncounted Approve (I ran each):
  "Reviewer: Approved, fix X first" (my round-1 m3 example), "Reviewer: Approve, with changes: x", "Reviewer: Approve - fix M1 first",
  "Reviewer: Approve (fix M1 first)". The breaker's `Verdict: Block` is still not counted (this was so before the PR).
* R2-m3 TRIGGER (`:61-63`) has no `watch`, `fork`, `gollum`, `deployment`, `milestone` or similar. An existing workflow that gains `  watch:` under `on:` is not weakening (judge).
* R2-m4 The records pattern accepts `.svg`, which can carry script just as `.html` can (breaker M4's reasoning). Add it to the or-block, or put it into the founder's Question 4.
* R2-m5 False positives, not bypasses: every new test under a pipeline folder with capitals (any `screens/<Item>/` except B119) now needs the read. Accepted as fail-closed.

### What held
* Code, hooks, settings, gates, .mergify.yml and lead-read-paths.txt: any non-blank line changed (comments included) is read. A rename, a removal, a missing patch or a
  path not in the list fails closed.
* Front matter, by line numbers and the closing `---`: the real `@@ -2,8` and `@@ -3,7` hunks, a removed `hooks:` block and a removed `disallowed-tools:` line are caught. I found
  no real agent or skill with a blank line in its front matter (all 14 checked).
* Workflows: a changed or removed existing line (norm-compared), every round-1 risk form, an existing step gaining `if:`, `continue-on-error` in a later hunk,
  and `toJSON(secrets)`.
* Mergify: the `.html` or-block is in both queues (verdicts and records), with a B119 problem check, a mutation and check-records-queue cases.
  check-guards.sh has 8 new A438 mutation rows in place of the 3 old ones, and they match the new code.

### Journey test
Not applicable: this is a merge-gate change with no screen. The gate "journeys" were walked end to end through `queue-gate.sh label`, as described above. Journey score: N/A.

### Could not check
Mergify's live behaviour (rename and the 3000-file cap); GitHub's `status` value for a mode change that also has a patch; Claude Code's handling of a blank line inside front matter
and of a `skill.md`/`SKILL.md` pair on a case-insensitive disk.

Verdict: Block
