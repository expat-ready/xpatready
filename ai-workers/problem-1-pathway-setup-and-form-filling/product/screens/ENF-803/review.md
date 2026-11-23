# ENF-803 review (tooling, PR #3008, head 8fd75027f36493df57e0c37340c8dc8597d996bd)

Independent reviewer; I did not build it. The screen-review verdict scale and severities are applied to tooling correctness (there is no screen, so D1–D20, BIC and the graph do not apply). Read: `git diff origin/main...8fd75027`, the PR body, the row (P-803). Ran everything in throwaway repos under the scratchpad. 22 Nov, about 15:30 IST.

**Verdict: Ship after fixes (Changes).** Parts 1, 3 and 4 work and their tests have teeth. Part 2 misses one line of the row: "every section lead-watch.sh prints" carries a stamp. Fix M1, then this is an Approve. The Minors can go in a follow-up row.

## What I ran
| Command | Result |
|---|---|
| `test-enf-803.sh` twice | 39/39 both times, exit 0, about 3 s |
| `test-enf-803.sh --mutate` | 6/6 mutations turn the test red |
| `check-guards.sh` | only `check-isolated-ttl.sh` fails (14/15, known, ignored as asked) |
| `check-g4-rules.sh`, `check-touch-overlap.sh` | 40/42 (the (1) and (5) failures are already on origin/main: neither file has pr-open-guard or branch-sweep there) · 34/34 |
| `push-guard.sh <merge-base>..8fd75027` · `bulk-delete-guard.sh range origin/main~300..origin/main` | clean · clean, 52 s, so main's history has no false refusal |
| Probe scripts (git 2.43) | `git commit -a` gives hooks `.git/index.lock`; a pathspec commit, also from a subdir, gives `.git/next-index-<pid>.lock`; a plain commit gives the relative `.git/index`; a linked worktree gives `.git/worktrees/wt/index(.lock)`. All pass the index check. 60 deletes in a folder with spaces: refused. Pure move of those 60: passes (commit-msg and range). Merge with a resolved conflict where the deletes came from the other parent: passes. |
| Real briefs: 100 saved briefs (`design/*briefs*/*.md`) with a valid `read origin/main <sha> at <now> IST` added | 99 pass. J-77 is refused (m5). |
| Extra mutations | `fresh_now` set to `TZ=UTC` stays green. Stale-board `ACT` changed to `echo` stays green, in both `test-enf-803.sh` and `check-lead-watch-board.sh` (m6). |

## Questions asked
* **Bypasses and false refusals in bulk-delete-guard.sh.**
  * The all-parents rule is correct: deletes are intersected across parents, and octopus merges are covered.
  * Root commits: in `range` mode, `cut -f2-` on a line with no space prints the commit itself, so the guard returns 0. In `staged` mode, the first commit is skipped.
  * Paths with spaces are safe: the awk strips everything up to the tab, and the status is always `$5`.
  * Trees only, so it works on a blob:none checkout.
  * Rebase does not run these hooks, so pre-push and CI cover it.
  * Problems: `--amend` (m1) and repeated blobs (m2).
* **`range $range` unquoted.** Safe. The value only ever comes from `pr-base.sh` (`<sha>..<sha>`) or from pre-push (`<sha> --not --remotes=<remote>`). It holds no glob characters, and it is the same expansion as the existing `rev-list $range` line.
* **CI ranges.** The `merge`, `range` and `queue` ranges are all `<merge-base>..<PR head>`, so only the PR's own commits are counted. A merge of main into a lane counts 0.
* **Pre-push.** The `index` call runs before the hook reads stdin, and it does not read stdin itself. Tests 1i/1j/1k show pushes are refused and allowed correctly.
* **lead-watch.sh, macOS and GNU.**
  * `stat -c %Y || stat -f %m` and `date -d @ || date -r` both fall back correctly.
  * The new lines use only bash 3.2 constructs, and the heredoc inside `$( )` has balanced parentheses and quotes. I could not run a real bash 3.2 here.
  * Board gating keeps the exit count right. A fresh board counts its ACT lines as before; the extra stamp line is not an ACT. A stale board gives exactly one ACT and `KF_BOARD=/dev/null`, and known-failures reads that as `None`, as it did for a missing file.
* **brief-fresh.py fails closed.** No git repo, or no origin/main: refused. A Python crash makes the exit non-zero, and `brief-check.sh` turns that into a reason. The `Duplicate check` regex accepts every line `brief-check.sh` accepts, so no wording slips past one and not the other.

## Issues (ranked)
**M1 (Major).** Lettered sections of lead-watch.sh print with no stamp, or with a stamp that names a different source. The row asks for every section.
* 2b WIP (waves.py), 2c runs waiting (GitHub Actions), 2d proof waits and 2e human sample print after the section 2 stamp, which names only "PRs merged … open PRs".
* 5b `flow-measure.py` (GitHub, possibly a cache up to 10 min old) has no stamp and no "cached" mark.
* 8b conformance (origin/main against approved-setup.json) sits under a stamp that names only `outside-deps-watch.py`.
* 12b `queue-depth.py` (the last 20 batches from GitHub) has no stamp.
* Test 2e cannot see this: its awk matches `^# [0-9]+\. ` only, and so does the PR body ("each numbered section").
* Fix: add a `fresh "<source>"` line after 2b, 2c, 2d, 2e, 5b, 8b and 12b, and widen 2e's awk to `^# [0-9]+[a-z]?\. ` (also match trailing `# 9.`/`# 5b.` comments, or move them to their own lines).

**m1 (Minor).** `commit --amend` is compared against HEAD instead of HEAD's parents (`bulk-delete-guard.sh` `deleted_list --staged`, `parents="HEAD"`).
* False refusal: commit 60 files by mistake together with x.txt, `git rm -r` the 60, then amend. Refused with "deletes 60", although against the parent the commit deletes 0. The advice ("git reset") does not help here.
* Local bypass: 40 deletes, then 41 more by amend, passes. Pre-push and CI do refuse it (81).
* Fix: detect an amend in `prepare-commit-msg` (`$2=commit $3=HEAD`) and use HEAD's parents, or at least name `git reset --soft HEAD~1` in the message.

**m2 (Minor).** The move exclusion matches on blob ids alone. One added file with the same content excuses every deleted file that has that content: 60 empty files deleted plus one empty file added gives 0 deletes, at commit and in range. Fix: let each added blob excuse at most one deleted path.

**m3 (Minor).** The qa-note age is checked against commit time, not merge time (`brief-fresh.py` `git log -1 --format=%H %ct MAIN -- *row`).
* Probe: lane commit on 19 Nov, qa note merged on 20 Nov, lane merged on 21 Nov. The brief passes, although the note is older than the newest merge on the row's files.
* Fix: `--first-parent` on both `git log` calls (merge commits on main).

**m4 (Minor).** The sha regex refuses natural wordings: "origin/main at <sha>", "origin/main sha <sha>", "main head <sha>". The letters a, e and d are hex, so `[^0-9a-f]{0,12}` cannot cross them. The refusal message does give the right format. Fix: allow short words between "main" and the sha, or accept any 7–40 hex token on the line that is a commit on origin/main.

**m5 (Minor).** `qa/CAPABILITIES.md`, `BUGS.md` and `GRAPH.md` count as "qa notes".
* No saved brief uses a `Touches:` line (0 of 100), so citing one of these files refuses the brief with "no Touches: line". J-77 cites `product/qa/CAPABILITIES.md` line 231 and is refused for this.
* Fix: count only note folders (`qa/built/`, `qa/verdicts/`, `qa/reports/`, `qa/evidence/`), or exclude the top-level map files.

**m6 (Minor, tests).**
* 2a accepts any `HH:MM`. 2g cannot see `fresh_now` (that line has no "IST"). So a UTC time stays green.
* The stale-board branch's ACT count is only grepped, never run.
* Fix: compare 2a with `TZ=Asia/Kolkata date` only (retry once at a minute boundary). Add a step-11 eval with a board 15 min old and expect `act=1` and no cockpit-data output.

**m7 (Minor).** `fresh-read.sh` run from a subfolder with a path from the repository root reads `<subdir>/<path>` and says "NOT ON origin/main", although the header promises both forms. Fix: if `$rel` is not in the tree at the sha and `$1` is, use `$1`.

**m8 (Minor, disclosed).** The app view is still accepted up to 35 min (12 after #2964), above the row's 10-minute rule. `test-enf-803.sh` is not in `check-guards.sh`, and `enf-803.yml` is advisory and path-filtered (to avoid #3000/#2982). The tech lead should open a row for both once those PRs land.

Not a finding (outside the row): a brief may name an old sha on main and a time from hours ago, and still pass. The row asks only that a sha and a time are named.

## Journey (reviewer score, tooling-adapted, simulated)
These are the Lead's and lanes' real flows, walked in throwaway repos: commit, amend, merge, push, start a brief, lead-watch step 11, fresh-read.

| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | 39/39, and the incident (temp index plus a large delete) is refused at commit, push and CI |
| Next step obvious | 1 | Every refusal says what to do (unset, reset, add the line, fetch) |
| Plain words | 1 | The messages are short and specific |
| Feedback and state | ½ | M1: 7 subsections have no stamp |
| Correct data | ½ | m1 (amend), m2, m3 |
| Error recovery | ½ | m1's advice does not fit; m4 and m5 refuse real wording |
| Accessibility and screen sizes | n/a | Command line only |
| Speed | 1 | Test 3 s; PR range 0.2 s; 300 commits of main 52 s |
| Visual quality | n/a | Command line only |
| Trust and sources | ½ | Sources are named for numbered sections only; the app view is at 35 min (disclosed) |

**Score 7.5/10** (6 of 8 applicable, scaled; no 0). This is under the bar of 8. M1 raises it to 8+.

## Could not check
* A real macOS bash 3.2 or BSD run of lead-watch.sh (checked by reading only).
* A real `start_session` hook round-trip in the cloud.
* GitHub Actions running `enf-803.yml`.

Fix list for Approve: M1.

Verdict: Changes 8fd75027f36493df57e0c37340c8dc8597d996bd
