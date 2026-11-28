# Report-only checks: false-block counts and graduate-or-retire proposals (LR-048, OS-13)

Written 28 Nov 2026 IST by a lab lane (Lab lane starter routine, A451) for the tech lead. OS-13: "OS-PM prepares, Lead
decides each"; `.mergify.yml` (lines 32-35) leaves each new Mergify condition to the tech lead's own PR. So this page
measures and proposes; it changes no workflow and no Mergify condition.

Read from origin/main 641909e320e7eaa4b4c85574a35645154ad8dfa9 at 12:48 IST. Runs: GitHub's list-workflow-runs (newest
100 completed pull_request runs per workflow; review-rounds: newest 100 of any event) read at ~13:00 IST. Merged heads:
second parents of main's merge commits since 20 Nov (1,240). Counted with `product/tools/report-only-tally.py` (new,
test `check-report-only-tally.sh`, mutation rows `guards.d/OS-13.sh`).

## Definitions

* **False block**: a red run on a PR head that merged into main unchanged. Had the check blocked, it would have stopped a
  PR that landed as it was (or cost a re-run).
* **Caught**: a red run on a head that never merged, whose PR later merged another head (a real catch or work in progress).
* **Masked**: the workflow's steps are `continue-on-error` and no run is red: the run conclusion cannot show a red at all,
  so its false blocks cannot be counted from runs, and it cannot graduate as it is. Its findings are `::warning::`
  annotations; counting them needs the check-run annotations (as queue-gate.sh already reads pr-suites' plan annotations).

## Measured (28 Nov ~13:00 IST)

| Workflow | PR runs | Window (UTC) | Red | False blocks | Caught | Masked |
|---|---|---|---|---|---|---|
| cockpit-tests | 44 | 2026-11-18T07:11 to 2026-11-28T04:41 | 0 | 0 | 0 | no |
| deploy-synth | 29 | 2026-11-20T21:48 to 2026-11-28T04:41 | 0 | 0 | 0 | no |
| pr-suites | 49 | 2026-11-27T20:50 to 2026-11-28T07:15 | 3 | 0 | 0 | no |
| red-on-old | 37 | 2026-11-27T12:24 to 2026-11-28T07:15 | 0 | 0 | 0 | yes |
| review-rounds | 6 | 2026-11-28T05:10 to 2026-11-28T07:20 | 0 | 0 | 0 | no |
| safety | 10 | 2026-11-27T18:43 to 2026-11-28T04:41 | 0 | 0 | 0 | yes |
| skeleton | 71 | 2026-11-26T17:38 to 2026-11-28T04:41 | 0 | 0 | 0 | no |
| studio-audit | 64 | 2026-11-24T08:48 to 2026-11-28T04:41 | 0 | 0 | 0 | yes |
| test-graph | 82 | 2026-11-25T04:19 to 2026-11-28T04:41 | 0 | 0 | 0 | yes |
| walks | 66 | 2026-11-26T23:11 to 2026-11-28T04:41 | 5 | 0 | 0 | no |
| workflow-lint | 6 | 2026-11-28T02:08 to 2026-11-28T06:29 | 0 | 0 | 0 | yes |

safety and workflow-lint were read by hand from the same API (14 and 9 runs, the skipped Mergify batch runs left out);
the other rows are the tool's output. Reds: pr-suites' 3 are all on #3978 (the actions bump, never merged); walks' 5 are on
#3829 (4) and #3692 (1), both product PRs not merged (product paused, P-847). review-rounds' 9 red issue_comment runs sit
on main's commit, not a PR head, and its verdict is the commit status "review-rounds", not the run: not counted.

**Caveat:** the window falls in the product pause, so most PRs were pipeline or records PRs, where product checks skip.
Zero false blocks over a mostly pipeline window is weaker evidence for a product check than for a pipeline one.

## Proposal per workflow (the tech lead decides each)

| Workflow | Today | Proposal | Why |
|---|---|---|---|
| pr-suites | Blocking at the label (queue-gate.sh `SUITES_GATE=block`, P-822) | **Already graduated**: drop from OS-13's list | 0 false blocks; the 3 reds were a real break (#3978) |
| skeleton | In the product queue's merge_conditions (path-scoped) | **Already graduated** (merge condition); optional: also a queue condition so a red PR never enters a batch | 71 runs, 0 red |
| walks | Report-only | **Graduate**: product queue condition, path-scoped like skeleton (`or: check-success = walks / -files ~= <walk paths>`) | 66 runs, 0 false blocks, 5 reds all on unmerged PRs; see caveat |
| cockpit-tests | No condition, no continue-on-error | **Graduate**: pipeline queue condition scoped to the cockpit files it tests | 44 runs in 10 days, 0 red |
| deploy-synth | Report-only (P-717 (b), P-772 (a)) | **Graduate**: product queue condition scoped to its deploy paths | 29 runs in 8 days, 0 red |
| safety | Report-only by design (A5, LR-045 Proven, LR-074 Built) | **Not yet**: add a verdict step (red only on a finding) first, then graduate after 10 clean runs | masked; 10 runs since 27 Nov |
| workflow-lint | Report-only (A9, LR-059) | **Not yet**: its own rule says after 10 clean runs (6 so far); needs a verdict step too | masked |
| studio-audit | Report-only (P-776) | **Retire** (or keep as information): Dependabot security updates now hold 0 open high alerts on main (LR-058 Proven) | masked; duplicates Dependabot |
| test-graph | A measurement (coverage graph), continue-on-error | **Reclassify**: a report, not a check; take it off the report-only list | it has no pass/fail meaning to graduate |
| red-on-old | Report only by the founder's decision (A351 C1) | **Keep** report-only unless the founder reopens A351 | masked by design |
| review-rounds | Commit status, report-only (Lead 13 on #2749) | **Lead's call** under P-423 (`status-success=review-rounds`); its status, not its runs, is what to count | not countable from runs |

Done-when (LR-048): "Each of the 8 report-only workflows is required or deleted, with its false-block count in the PR".
This page gives the counts; the required/deleted step is one tech-lead PR per workflow (`.mergify.yml` rule above).

## Re-running the count

    git log origin/main --merges --since=<date> --format=%P | awk '{print $2}' > heads.txt
    gh api 'repos/expat-ready/xpatready/actions/workflows/walks.yml/runs?event=pull_request&status=completed&per_page=100' > walks.json
    python3 -I ai-workers/problem-1-pathway-setup-and-form-filling/product/tools/report-only-tally.py *.json --merged heads.txt --workflows .github/workflows
