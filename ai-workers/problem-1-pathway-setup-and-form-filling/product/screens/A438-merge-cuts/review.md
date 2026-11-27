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
