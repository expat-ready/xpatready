# Enforcement audit: written down vs enforced in code (21 Nov ~01:30 IST)

Read-only check of local `origin/main` at **12f270bb9** (20 Nov 19:05 UTC). The fetch was refused by the sandbox proxy, so anything merged after that commit is not counted. GitHub API reads (GET) for open PRs and nightly runs. Paths below: `P/` = `ai-workers/problem-1-pathway-setup-and-form-filling/product/`. The repository ruleset (which checks GitHub requires) could not be read: permission was denied.

## Items 1-5 (the founder's questions)

| Item | Decision ref | Live on main? | Enforcer (file:line) | Wired from | Gap | Open PR that closes it |
|---|---|---|---|---|---|---|
| 1. Selective testing: a PR runs only the test suites its change touches (affected-only), plus the map from capability to module to file to test suite | B203, P-744 (a)(b), P-742 (2), P-682 | **no** | `ci.yml:166` `suites=$queue` (on a PR, no test suite runs at all; only the quick checks and the type check, `ci.yml:172`). The suite picker `P/tools/select-suites.mjs` exists but nothing calls it; only its own test runs (`ci.yml:303`, check-select-suites.sh). No c8 (coverage tool), no test map, no impact map anywhere on main. | n/a | The PR stage runs no tests, so the first real test feedback comes in the merge batch, and one bad PR bounces its batch partner. The capability → module → file → suite map does not exist. | #2359 (B203 step 1: approval note for the c8 and Stryker tools), #2370 (B203 step 3: the map from coverage). Nothing yet makes a PR run its affected suites. |
| 2. The whole test set runs every night, and in the merge queue | P-651, nightly.yml (D5) | **partial** | `nightly.yml:33` cron `23 20 * * *` (01:53 IST); `nightly.yml:129-131` every suite in 8 parts, `nightly.yml:106` 59-minute limit per part. Merge queue: `ci.yml:166-167`, every suite on a Mergify batch (`HEAD_REF mergify/*`). | GitHub schedule; Mergify queues (`.mergify.yml:168-201`) | The **last scheduled nightly (run 44656287758, 20 Nov 01:48 UTC) was cancelled**: parts 3, 5 and 6 hit the 59-minute limit. None of the last 6 nightly runs was a full scheduled run that passed. Suites the queue skips as flaky run only here, so they currently run nowhere to the end. No alert fires when the nightly fails. | none |
| 3. Full tests once, in the merge queue (cuts the CI load about in half) | P-651 (2), P-648/P-649, P-742, P-743 | **yes** | `ci.yml:22-26` and `:166`: test suites run only on a batch or on `/run full`. `P/tools/queue-gate.sh:20-23`: a full run is needed only after a failed batch (the P-743 code fix is already on main). `queue-gate.yml:70` and `label-guard.yml:64,104` still read `FULL_RUN_FROM`. | queue-gate.yml, label-guard.yml, comment-run.yml; guard test check-guards.sh:104 | The register is out of date: P-651 is listed as "prose" but it is live. The leftover `FULL_RUN_FROM` variable is still read. | #2434 (B206 part 2: stop reading FULL_RUN_FROM; a full run starts by itself after a failed batch) |
| 4. Mutation-testing pilot (Stryker on one core module) | B203, P-744 (c) | **no** | Not found: no Stryker in any workflow, package.json or tool. Note: `guards.yml:43` `check-guards.sh --mutate` breaks the **guard scripts** on purpose to prove their tests catch it. That is not mutation testing of the app's code. | n/a | No mutation score and no coverage per capability. | #2359 (tool-approval note only); no pilot PR yet |
| 5. Clean-up programme in parallel | P-674 to P-677, A155 | **partial** | Stage 0 merged (#2123, 18 Nov): `P/tools/check-pure-move.sh`, `check-stale-paths.sh`, `repo-root.sh`, test `check-cleanup-checks.sh`. | **Not wired.** No workflow, check-guards.sh or check-docs.sh calls any of them (searched the whole tree). | The safety-net checks exist but run nowhere, so a moving stage would not be checked automatically. Stages 1 and 2a are drafts waiting on the tech lead's answers. Stages 3-7 not started. The rename to "platform" (P-675) has not happened. | #2459 (stage 1, draft, 3 questions), #2458 (stage 2a, draft, 1 question), #2461 (stage 8). None of them wires the stage 0 checks into CI. |

## Rule register sweep (`P/RULES.md`, 151 rows)

Count as the register claims it: 21 "script/hook/CI" (full), 31 "(part)", 4 "owed", 95 "prose".
Verified on main: **17 fully enforced** (the 21 claimed full, minus P-690, P-678, IDX-20 and IDX-19 below). P-731 counts as live even though the register says owed. **35 partial. 99 prose-only or missing.** About 60 of the prose rows are rulings or "stands as recorded" index rows, which nothing could check in code anyway. Their triage list is `P/design/rule-triage-2026-11-16.md`.

Rows that are not fully enforced, where it matters:

| Rule (plain words) | Ref | Live? | Enforcer (file:line) | Wired from | Gap | Open PR |
|---|---|---|---|---|---|---|
| One action list (full-power plan) | P-690 | **no** | claimed `plan-watch.py`: **not found** on main | none | The register names a script that does not exist | none |
| Private-home sync each check | P-678 | partial | `P/tools/private-sync.sh` exists | Not called by any script, hook or skill | Runs only if someone runs it by hand | #2112 (hardening only) |
| Lead PR helper | IDX-20 (P-749 to P-756) | partial | `P/tools/lead-pr.sh` | Only mentioned in the lead-watch skill text | Runs by hand | none |
| Waves and work-in-progress limits | IDX-19 (P-745) | partial | `brief-check.sh:32-35` (waves.py), via the lane-preflight hook (`settings.json:119`) and pr-rules.yml:31 | check-guards.sh:185-188 | The lead-watch work-in-progress section is not on main | #2433 |
| PR body rules: "Done when", "Duplicate check:", under 800 changed lines, "Completes:" | P-606, P-526, P-610 | partial | `pr-rules.yml:31,34`, `pr-size.sh:13` | pr-rules.yml runs, but it is **not a queue condition** (`pr-rules.yml:8`; absent from .mergify.yml) | Advisory only: a PR can merge with a red pr-rules check | none |
| Full run on the head after a failed batch | P-731 | **yes** (register says owed) | `queue-gate.sh:20-33` | label-guard.yml, queue-gate.yml | Register out of date | none |
| Work lock to 22 Nov | P-734 | partial (register says owed) | `check-docs.sh:65-67` lock block; check-workflow-lock.sh in check-guards.sh | ci.yml fast job (check-docs.sh, on PRs only) | ENF-733 not built | none |
| Lanes on the items nearest done first | P-733 | partial | item-proof.yml (proof runs at merge) | merged PR | The #2233 enforcer is not on main and not in the open list | none |
| Measure the flow and name the one constraint | P-738 | **no** | not found | none | Two PRs for the same work | #2285 **and** #2431 (duplicates) |
| 10-minute check | P-761 | partial | `lead-check-guard.sh` checks only the prompt text (`settings.json:130`) | CronCreate hook | Nothing checks the 10-minute cadence | none |
| Enforcement fast path, Lead merges in the browser | P-762 | partial | merge-guard.sh (only the Lead's copy may merge) | settings.json:105-119 | The review-plus-green-CI condition is checked by people | #2457 (ENF-758) |
| Agents do every outside step | P-763 | **yes** | `stop-check.sh:38` calls founder-click-guard.sh; `lead-watch.sh:208` | Stop hook (`settings.json:164`) | Links, Edit and add-a-line asks are not caught | #2587 (P-770) |
| Product and tooling never share a batch | P-764 | **yes** | `.mergify.yml:207-215` pipeline queue by file path | Mergify | none | #2445 (scopes check on every run) |
| Lock exceptions | P-765 | **yes** | `check-docs.sh:67` | ci.yml fast job | none | none |
| Size exception | P-768 | **yes** | `pr-size.sh:13` | pr-rules.yml (not required) | as P-610 | none |
| Proof-read watch: merged without a qa PR, approved PRs waiting on the Lead's read | P-769 | **no** | `proof-read-watch.py` **not found** on main | none | The decision row says it is built; main does not have it | #2578 |
| Founder-click guard v2 | P-770 | **no** | the decision row is **not on main** | none | Only in the PR | #2587 |
| Rulings with nothing to enforce | P-760, P-766, P-767 | n/a | n/a | n/a | n/a | n/a |
| Steady partial rows (gate B, model guard, Mac caps, spend ledger, cockpit) | P-488, P-305, P-339, P-605, P-303, P-462, P-348e, P-175, P-295, P-591, P-636, P-637 | partial | gate-b.mjs, agent-model-guard.sh (`settings.json:130`), lane-preflight.sh, p2/ledger.ts, cockpit-data.py | wired | The listed missing parts stand as the register says | none |

Other findings: #2479 is still open as a draft though #2483 says it replaces it. The architecture fences (P-682: knip, dependency-cruiser, jscpd) are not on main.

## Five biggest gaps, ranked by risk to the Release 1 proof rate

1. **The nightly full test set does not finish** (item 2). 3 of 8 parts were cut at 59 minutes on 20 Nov, so main is not fully tested end to end, and the suites the queue skips as flaky run nowhere. *Narrowest fix:* one line in nightly.yml, either 18 parts (as ci.yml uses, `SHARDS`) or a 75-minute limit (as ci.yml:359), plus a red line in lead-watch when the newest scheduled nightly is not green.
2. **No tests run on a PR, and there is no affected-only selection** (item 1). Failures show up only in merge batches, which bounces partner PRs and slows the proof of each item. *Narrowest fix:* in the PR stage, run `run-suites.sh --changed` (select-suites.mjs is already built and tested) as a non-blocking job. Then land #2359 and #2370 for the coverage map.
3. **The P-769 proof watch and the P-770 guard are not on main**, though DECISIONS says P-769 was built. Merged items with no qa proof PR, and 20 approved PRs waiting on the Lead's read, go unflagged. *Narrowest fix:* land #2578, then #2587.
4. **The pr-rules check is advisory only.** item-proof depends on the "Completes:" line, and the 800-line limit and the "Done when" test can be skipped. *Narrowest fix:* add `check-success = pr-rules` to the product queue's queue_conditions in .mergify.yml (one line; the tech lead reads the diff, P-423).
5. **The rule register misstates enforcement.** P-690 names a script that does not exist, P-651 is listed as prose but is live, P-731 is listed as owed but is live, and P-769 says built but is not on main. The Lead's start read is wrong. *Narrowest fix:* teach check-rule-register.sh to fail when a named `*.sh|*.py|*.mjs|*.yml` enforcer file is missing on the branch.

Also: the clean-up stage 0 checks are built but not wired; add check-cleanup-checks.sh to check-guards.sh before stage 1 lands. Mutation testing is absent but carries low risk to the proof rate this week.
