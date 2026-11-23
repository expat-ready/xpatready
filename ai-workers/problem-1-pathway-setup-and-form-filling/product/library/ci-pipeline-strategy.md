# CI Pipeline Strategy
Version: 1.1
Updated 20 Nov 2026 · owner: the tech lead · status: living master

Why CI is jammed, where the machine time goes, and the measured plan for capacity, tests, delivery order and long unattended runs. Board Library row: "CI pipeline strategy".

## Change log
| Version | Date (IST) | Change |
|---|---|---|
| 1.0 | 17 Nov 2026 | First master, assembled from the CI pipeline and delivery strategy research of 17 Nov 2026 (branch research/ci-pipeline-2026-11-17) |
| 1.1 | 20 Nov 2026 | Refresh from `.github/workflows` and `.mergify.yml` on main (diff 9bbdbb899..origin/main, 17-20 Nov): new section 3a lists every change to jobs, triggers, runners, parts, queues, batch sizes, timeouts, gates and quarantine, each with its PR or commit; stage rows in section 3 and the proposals in sections 4, 5, 13 and 14 carry a dated "Changed" note. The 17 Nov measurements are kept as measured. |

**About the source.** Research session for the Lead, started at the founder's request (07:4x IST 17 Nov). Read-only: nothing in the app, CI, `.github`, Mergify, labels or settings was changed; no run was cancelled, re-run or started; no spend. Times are IST from `TZ=Asia/Kolkata date`. Every number names its source.

Known gaps are tracked privately by the tech lead.

**Sources used throughout**
* **[R7]** GitHub Actions API, every run of the `ci` workflow created 10 Nov 05:57 IST to 17 Nov 08:04 IST (2,521 runs), and the jobs and steps of the 1,146 runs that did real work (more than 4 minutes; 11,797 jobs). Pulled 08:04-08:10 IST. Runs still waiting at 08:04 are not in it, so the newest waits are understated.
* **[LOG]** the suite tables in 724 shard logs: every failed shard job in [R7] plus the 250 newest green merge-batch shards. Statuses as `run-suites.sh` prints them: "failed twice" and "FAIL" (red), "passed on retry" (flaky), "quarantined".
* **[LIVE]** the API at 08:01-08:03 IST: every job of every queued or running run.
* **[SIM]** `tools/select-suites.mjs` (it reads files only, runs nothing) replayed in a scratch clone: (a) on the 80 PRs merged to main since 14 Nov, with and without `--direct`; (b) on the heads of 19 PR checks that went red, to see whether `--direct` would still pick a red suite.
* **[MQ]** `design/merge-queue-failures-2026-11-16.md` (B199): the 30 failed batches of 11-15 Nov, each traced to the commit that fixed it. Reused, not redone.
* **[AUD]** the side note `ci-speed-audit-2026-11-17.md` (300 runs, 16 Nov). Validated below; one claim corrected.
* **[CAP]** `qa/CAPABILITIES.md` on main bcc505afd (read 07:5x IST); open PRs from the API at 07:5x-08:0x IST.

---

## 1. The short answer for the founder

1. **Why CI is jammed:** we ask for more machine time than we have. GitHub Pro gives 40 machines at once. On 16 Nov we used 45,500 machine-minutes; the 40 machines were 35 or more busy in 12 of 24 hours [R7]. At 08:01 IST today all 40 were running, 116 jobs were queued and 10 more pending, and nothing ran on Namespace [LIVE]. A PR check now takes a median 91 minutes from push to result and a merge batch 81 minutes (both since 16 Nov noon); over the whole week they were 54 and 51 [R7].
2. **Where the machine time goes (7 days, 205,500 machine-minutes):** PR checks 55%, merge batches 45% [R7]. **57% of PR-check time is the second and later run of the same PR** (review fixes, merging main, re-runs). **23% of merge batches failed** (61 of 262), and they took 26% of the batch time [R7]. The failures we traced are real defects where two PRs meet, not flaky tests (section 2).
3. **"Run the full tests only once, in the merge queue" (P-651 (2)) would hurt, not help, if it means no suites on the PR.** 62 of 193 code PRs (32%) had a suite go red on their own PR check [LOG]. Those breaks would move into merge batches. With 6 PRs in a batch, a batch would then hold at least one broken PR about 9 times in 10 (1 − 0.68⁶), and each failed batch costs about 390 machine-minutes and an hour of merge time for every PR in it. Quality would hold (the queue still blocks), but merging would nearly stop. **The quality-safe version is "one PR check per PR, run once, at the end"** (section 5).
4. **Capacity: move to a GitHub organization on the Team plan (about US$4 a month for one seat; 60 machines at once instead of 40).** It is cheap and quick, and it unblocks the paid overflow providers, which need an organization. Do not let #2032 merge while `vars.CI_SHARD_RUNNER` is set: it is set now (read 08:0x IST) and would move every long job from GitHub's free 40 machines to Namespace's trial limit of 8 (section 6).
5. **Structure (widened brief, sections 9-13):** only 11 of 112 prose rules were broken even once in 13-16 Nov (rule triage), and the Lead changed about every 2-3 hours (Lead 29 on 12 Nov to Lead 73 today). Keep and enforce about 20 rules, fold the rest into a dozen principles, try compaction plus a Fable 5.2 Lead for one day, and use auto mode, deny rules, a cloud environment and auto-fix to remove the manual waits. Ultracode helps read-only work, not coding, while CI is the constraint.
6. **Delivery:** nothing was proven overnight because most merges were a first or middle part of a capability. The five rows nearest to Proven each need one PR that is waiting in the CI line now (section 8). Finish whole groups in journey order, and cap the number of lanes at what CI can carry (section 8c).

---

## 2. Why CI is jammed: measured

| Measure | Value | Source |
|---|---|---|
| Machines at once (GitHub Pro, all repositories of the account) | 40 | docs.github.com/en/actions/reference/limits, read 17 Nov |
| Running at 08:01-08:03 IST / queued / pending | 40 / 116 / 10, all on `ubuntu-latest`; 0 on Namespace; no other repository of the account running anything (6 checked) | [LIVE] |
| Machine-minutes used, 7 days | 205,461 (PR checks 113,733; merge batches 91,728) | [R7] |
| Busiest day, 16 Nov | 45,497 (PR 21,575; batches 23,922); 40 machines all day = 57,600 | [R7] |
| Hours on 16 Nov with 35 or more machines busy on average | 12 of 24 | [R7] |
| PR check, push to result, median / 90th percentile | week 54 / 134 min; since 16 Nov 12:00 IST 91 / 176 min | [R7] |
| Merge batch, created to result | week 51 / 72 min (green ones); since 16 Nov 12:00 IST 81 / 141 min | [R7] |
| Long jobs waiting for a machine after the first job ("kind") finished, median / p90 | PR checks: 0-3 / 8-22 min 13-16 Nov, **14 / 46 min on 17 Nov**; batches: under 2 / 2-13 min 10-15 Nov, 2 / 40 on 16 Nov, **29 / 101 min on 17 Nov** | [R7] |
| PR checks with 8 test shards / 1 shard (records, notes, or most suites remembered green) | 329 / 251 | [R7] |
| Code PR checks per PR branch | median 2, mean 2.8, p90 5 | [R7] |
| PR-check minutes that are the 2nd or later run on the same branch | 63,309 of 111,514 (57%) | [R7] |
| PR checks whose head commit merges main | 93 runs, 18,067 min (16% of PR time) | [R7] |
| Re-run attempts (attempt 2 or more) | 35 runs, 17,673 min (9% of all) | [R7] |
| PR checks that failed in the part-1 rules step while the other 7 shards ran on | 109 attempts; the shards of those attempts used 6,555 min | [R7] |
| Failed jobs in the set-up step (the 11 Nov Ubuntu-server outage) | 183 shard and pack jobs and 32 type-check jobs on 11 Nov; 10 on 14 Nov; none since | [R7] |
| Merge batches failed | 61 of 262 (23%); 16 Nov: 21 of 66 (32%); 15 Nov: 3 of 36 | [R7] |
| Machine time in failed batches | 23,600 of 91,728 batch minutes (26%) | [R7] |

**What the failed batches were.** [MQ] traced 30 failed batches (11-15 Nov) to their fix: **clash 73%** (two PRs, each green alone, broke when combined: mostly migrations and shared test data), flaky 13%, a member really broken 10%, a lost machine 3%. One root failure fails up to 3 batches, because 3 are checked at once and the 2 behind it carry the same broken commit (20 roots made 30 failed batches). The 16 Nov failures [LOG] follow the same pattern: `check_pf12_walls.ts` failed 5 batches ("with every migration on main, no platform_*, fo_*, money" table may lack its firm wall: a new table met the wall guard); `check_fo3w_manage_browser.ts` failed 5 ("new row for relation fo_consultation_type violates check": a new check constraint met the booking test); `check_forms_b114…` 2 and `check_pf5t_terms.ts` 2. **These are real defects the queue caught, not noise.** Flaky passes in batches were 14 suite-runs in 724 logs [LOG].

**Validation of the earlier notes.**
* [AUD] holds on shape: gate jobs share the same line, 54% batch failures in its 12 hours (our 7 days: 23%; 16 Nov alone 32%), part-1 failures waste shard time, setup is about 5% of a shard.
* [AUD] is **wrong on one point**: it says `suite-times.tsv` was last refreshed on 10 Nov. On main it was refreshed on 15 Nov 02:39 UTC (P-436 (7)), 498 suites, 339 minutes in all (`git log origin/main -- product/tools/suite-times.tsv`). Its read came from an older local copy. Shard balance may still drift, but not from a 10 Nov file.
* `ci-capacity-options` costs: the Lead's note says about 4 times too high. At our measured load the honest figure depends on how much we pay for (section 6). Its "unit-minute" figures are not used here.
* `namespace-fit`: confirmed. The trial is 32 vCPU, which is 8 four-vCPU jobs (namespace.so/pricing, read 17 Nov). #2032's own runs used Namespace: 32 shard and 10 regression jobs in [R7].

---

## 3. The pipeline today, stage by stage (measured)

| # | Stage | What it checks | Jobs (machines) | Time per run (median / p90) | Fails | Source |
|---|---|---|---|---|---|---|
| 1 | Builder lane | writes the row's code and its tests on a branch from main; runs its own tests in its copy | none on GitHub | - | - | WAY-OF-WORKING |
| 2 | Reviewer (Opus, high) | reads the diff against the brief and the standards; posts `Reviewer: Approve <sha>` | none on GitHub | - | at most 2 rounds (P-277) | P-303, P-385 |
| 3 | Breaker (money, schema, permissions, new screen) | tries to break it | none on GitHub | - | - | P-303 |
| 4 | Draft PR | push guard only (paths, PDFs, secrets, names) | `guard`, 1 job | 0.6 / 6.6 min | 0% | [R7] |
| 5a | PR check: `kind` | what changed; test merge on today's main; memory of green suites; picks shards (**changed 18 Nov, #2151:** on a PR it plans no part; per-suite memory removed, see 3a) | 1 | 1.9 / 3.5 min | 1% | [R7] |
| 5b | PR check: `shard` 1-8 | part 1: rules files, graph, official PDFs, gate B, port contracts; every part: the suites this change can affect (`--changed`) (**changed 18 Nov, #2151, P-651 (2):** a PR runs no suite; part 1's checks are now job `fast`, see 3a) | up to 8 | 30.3 / 46.5 min | 11% of jobs | [R7] |
| 5c | PR check: `packs` | gate B's acceptance packs of the capabilities the diff touches (**changed 18 Nov, #2151:** batch and full run only, see 3a) | 1-5 | 11.5 / 17.2 min | 7% | [R7] |
| 5d | PR check: `types` | type check, api and web | 1 | 2.5 / 3.3 min | 6% | [R7] |
| 5e | PR check: `ci` | joins the parts' results (since #2151 also job `fast`'s) | 1 | 0.1 min | - | [R7] |
| 5f | Other PR workflows | pr-rules, module-cards, skeleton (container proof), trace, guards, cockpit-tests, records-label (since 18 Nov also walks, #2133; see 3a for pr-rules, guards, module-cards changes) | 1 each, by path | 1-5 min | - | `.github/workflows/*.yml` on main |
| 6 | Label and queue gate | `review: approved` only on Approve + green (label-guard, queue-gate.sh auto-label, P-637); `queue-fresh` re-runs a stale PR on today's main (B194) (**changed 18-19 Nov:** queue-gate on the Mac runner, #2145; label also needs a green full run, #2249, P-731; see 3a) | small jobs, also on a timer | under 1 min | - | `.mergify.yml`, queue-gate.yml |
| 7a | Merge batch (Mergify, up to 6 PRs, 3 batches checked at once) `shard` 1-8 (**changed 19 Nov:** up to 2 PRs, 6 batches at once in parallel mode by scope, 18 parts; #2207, #2290, #2282; see 3a) | every suite except the quarantined ones (11 suites in the newest logs) | 8 | 38.5 / 48.6 min | 3% of jobs | [R7], [LOG] |
| 7b | Merge batch `regression` 1-5 | every Works capability's pack (the protected set) | 5 | 14.5 / 19.2 min | 1% | [R7] |
| 7c | Merge batch `types`, `kind`, `ci` | as in the PR | 3 | 2-3 min | 0% | [R7] |
| 8 | Main | demo update on the Mac; nightly full set including quarantined suites (20:23 UTC); XFA engine nightly (**added 17-19 Nov:** nightly restore drill, #2014; item-proof on each push to main, #2233; see 3a) | 1 + nightly | - | - | demo-update.yml, nightly.yml |
| 9 | qa gate B | the capability's pack green on main's head on GitHub's machines, run id in qa's row, an independent re-run | uses stage 7's run or a nightly dispatch | - | - | P-339 |
| 10 | qa gate A | qa walks the capability by screens to the next one's first step; a fresh Opus reader gives the verdict | none on GitHub | median ~35 h from last part to Works (n=4) | - | P-348c, release1-forecast-2026-11-16 §4 |
| 11 | Proven | the row says Works in `qa/CAPABILITIES.md` | - | - | 11 of 101 | [CAP] |

**Per merged code PR** (7 days): 205,461 machine-minutes / 160 app-code PRs merged (GitHub search, merged 10-17 Nov: 160 app-code, 102 records or qa, 11 tooling) = **about 1,280 machine-minutes per merged code PR**, all stages together.

**Lanes the line can carry today.** 40 machines × 60 = 2,400 machine-minutes an hour; at 80% use (the point where waits start to grow fast), 1,920. Divided by 1,280: **about 1.5 merged code PRs an hour, about 36 a day.** The best measured days merged 31 code PRs (12 and 15 Nov, IST, GitHub search); 16 Nov merged 26 while using 45,500 machine-minutes. Above about 30 a day, more lanes bring more waiting, not more merges.

### 3a. What changed in the pipeline, 17-20 Nov 2026 (refresh of 20 Nov)

Source: `git diff 9bbdbb899 origin/main -- .github/workflows .mergify.yml`, read 20 Nov 2026; each line names the PR (merge on main) and, where useful, the commit. The measurements in sections 2-3 above are from before these changes and are kept as measured; none of the changes below has been re-measured on this page.

**Tests on a PR and in the batch (run tests once)**

| What | Was (17 Nov) | Now (20 Nov) | Source |
|---|---|---|---|
| Suites on a builder's PR | the suites the change can affect (`--changed`), on up to 8 parts | **none**: a PR runs job `fast` and job `types` only; `shard`, `packs`, `regression` run only on a merge-queue batch of code or a full run | #2151 (3911fa145, b178310b7, 4691bb94b), P-651 (2) |
| Fast checks | part 1 of job `shard` | own job `fast` (push guard, route-has-screen, test databases, records rules, graph, official PDFs, explicit-any count, tools' checks, port contracts, gate B); records and code, PR and batch; skipped for notes and for an "already green" head | #2151 |
| Gate B on a PR | bug check and named packs, on part 1 | bug check only (`gate-b.mjs --no-packs`); on a batch every row a member PR names runs with its steps, held rows too (`GATE_B_ONCE`, P-488) | #2151 |
| Packs by diff (`packs`) | on a PR of code | on a batch: each member's packs by diff minus the rows its PR names, at most 5 groups | #2151 |
| Per-suite memory (`ci-memory.mjs` reuse/record, P-371 (3)) | a later PR run skipped suites remembered green | removed (a PR runs no suite); "already green" head verdict kept | #2151 |
| `PR_SUITES=direct` | switch for PR suite selection | idle (still part of the memory context) | #2151 |
| Quarantine (`flaky.mjs`, B122) and `retry-comment` | worked out and posted for every code run | only when suites run (batch or full run); `retry-comment` on batches only; rule unchanged (2 retry passes in 7 days); records read from up to 24 parts | #2151, #2282 |
| Records rules (`check-docs.sh`, `decision-impact.sh`) | in every code and notes run | on a pull request only; a merge-queue batch (or `merge_group` event) skips them; every code check still runs there. Reason in the file: they failed 8 of 13 failed batches on 20 Nov. New self-check `check-queue-run-scope.sh` | #2410 (831731b07), ENF-746c, labelled P-746 in the workflow |

**Full run before the label (CI-PRE)**

| What | Now | Source |
|---|---|---|
| Trigger | `ci.yml` gains `workflow_dispatch` (inputs: PR number, head sha), run name `full-run PR #<n> <head>`; started by the PR comment `/run full` (comment-run.yml), always on ref main; refused for a fork, a closed PR or a head without a "Reviewer: Approve <head>" line by the owner's account or a known reviewer; a red full run of the same head re-runs only its failed parts | #2249 (207619aca, 02375c6e2), P-731 |
| What it runs | everything a batch runs (parts, packs by diff as a PR ran them before P-651, protected set, gate B's named packs) on the head merged with main's head; gate B's NOT TESTED is a warning there; no npm cache (a run of main saves nothing to main's cache) | #2249 |
| Gate | label-guard and queue-gate accept `review: approved` only with a green full run on the head; after a failed batch a relabel needs a "Batch failures covered:" comment naming the failed parts; repository variable `FULL_RUN_FROM`: heads approved before it keep the earlier rule | #2249 (02375c6e2, 68d640230), P-731 (4) |

**Merge queue (`.mergify.yml`)**

| What | Was (17 Nov) | Now (20 Nov) | Source |
|---|---|---|---|
| Queue mode | serial (each batch assumes those ahead pass) | `mode: parallel` with file scopes: platform, front-office, money, case-side, forms-engine, migrations, pipeline; barrier files (package files, `.nvmrc`, tsconfigs, base/links/extension/audit schema, migration lock, `main.ts`, `core.ts`, `studio.ts`) conflict with every scope; capacity 1 for money, migrations, pipeline. Undo: `mode: serial` | #2207 (4867163e3, 1330e8e03), P-715, P-717 |
| Case-side scope | - | adds `api/src/clients.ts` (238dd0e67) and `api/src/case-clients/*.ts` | #2207, #2255 (0f1a6ad1a) |
| Batches checked at once (`max_parallel_checks`) | 3 | 6 (8 in commit 0008d68f9, then 6 in f530f7732, "P-728's number"); the file notes P-730's hold | #2290, P-728 (2), P-730 (1) |
| Batch size | 6 (product, records) | 2 in every queue ("a failed batch bounces at most one other PR"); failure resolution at most 2 rounds (`batch_max_failure_resolution_attempts: 2`) | #2207, P-715 |
| Queues, in order | product, records | **verdicts** (records PR titled `qa:` changing `qa/CAPABILITIES.md`; 2 min wait), product (5 min wait; now excludes a PR whose every file is pipeline work), **pipeline** (every file a pipeline path; 2 min wait; XFA engine rule applies), records (2 min wait) | verdicts: #2073 (1b2f181bc), P-664; pipeline: #2207, P-717 (a) |
| New blocking checks | - | start report-only (no queue or merge condition) until clean for 24 h or 10 PR runs; the tech lead adds them in their own PR | #2207, P-717 (2) |

**Parts, runners, timeouts, schedules**

| What | Was (17 Nov) | Now (20 Nov) | Source |
|---|---|---|---|
| Parts (`SHARDS`) | default 8, allowed 1-9 | default 18, allowed 1-24 (20 in 845543d4a, then 18 in f84f09524: "the longest suite sets the floor", `check_b78` about 20 min; 8 parts ran 43-60 min with no machine wait, Lead 94 measurement in the file); merged by hand under P-691 | #2282 |
| `fast` timeout | (part 1 of `shard`, 75 min) | 90 min when suites run, else 45 | #2151 |
| `shard` timeout | 75 min | unchanged, 75 min | - |
| Type check (`types`) | node default heap | `NODE_OPTIONS=--max-old-space-size=8192`: tsc for api ran out of memory in batches #2245 and #2246 | #2250 (873ffcae3) |
| `guards` workflow timeout | 10 min | 30 min (about 150 mutation rows); now also runs on `design/waves.tsv` and `waves.md` changes (guard 28) | #2249 (43a238b44); #2363 (0fa3482e2) |
| queue-gate runner | `ubuntu-latest` | the Mac's self-hosted runner `xr-mac` (repository variable `GATE_RUNNER` sends it back); reason in the file: about 50 hosted jobs ran and 52 waited 15-35 min at 21:13 IST 18 Nov, so the seconds-long gate waited up to an hour; it checks out main only and reads the PR's files as names | #2145 (628742f00), P-214, P-691 |
| Schedules | as before | label-guard, queue-gate, nightly, xfa-engine and pipeline-heartbeat schedules re-registered 19 Nov (GitHub dropped scheduled runs from 18 Nov 10:00 UTC after the move to an organisation); label-guard sweep and queue-gate can also be run by hand (`workflow_dispatch`) | #2176 (479ed84b6, b36bef847) |
| Label sweep | - | passes `REVIEWERS`: since the move the owner is the organisation, so without it the sweep took off every label queue-gate put on (#2197, #2199, 19 Nov) | #2209 (1a79efda5) |

**New and changed workflows besides `ci`**

| Workflow | What it does | Runner, timeout | Gate? | Source |
|---|---|---|---|---|
| `walks.yml` (new) | qa's gate A walk by screens as a recorded journey (video, trace, a screenshot per step), one job a journey; by hand or on a ready PR that changes journeys; never a draft or a `mergify/*` batch; no npm cache; self-test fixtures that must fail | GitHub hosted; plan 5 min, walk 60 min | no (Mergify still reads only `ci`) | #2133 (d09c8f6cd … 33098061c), P-700 |
| `item-proof.yml` (new) | on each push to main (and by hand): a merged PR with a `Completes: R1.n` line gets the item's packs, named suites and journey run; verdict commented on the PR and committed to branch `auto-verdicts`, never main; never marks Works | GitHub hosted; detect 5, prove 150, report 10 min | no | #2233 (9c5345ce3, ba13b567c, 2d9b87acf, 4f645f17a), P-728 (3), P-729 (1) |
| `pipeline-heartbeat.yml` (new) | set-up conformance (CK-1) and pipeline-moving check every 30 min (cron `11,41`); red mails the owner | GitHub hosted; 5 min; never cancelled | no | #2081 (eba17a283, 93798b221) |
| `nightly.yml` | new job `restore-drill` (PF-8r): dump, restore, check, time, on the pinned PostgreSQL image; evidence kept 90 days | GitHub hosted; 30 min | no | #2014 (eaaa74fd5) |
| `pr-rules.yml` | a records-only PR is not size-limited (P-686); a `Completes:` line must name R1 items only | - | not a queue condition (unchanged) | #2086 (85834b6f7); #2233 |
| `module-cards.yml` | frozen Tests./Tables./Entry points. lines compared with the base | - | - | #2195 (3470cbe3d), P-712 |

---

## 4. Test value per module

Suite time on main's `suite-times.tsv` (15 Nov, 498 suites, 339 min) by family: configurator and case side (prefixes c, qa, b, bk, forms, w, s, m and the rest) about 320 min; Platform (`check_pf*`, 9 suites) about 3 min; Front office (`check_fo*`, 4 suites) about 1 min (newer PF and FO suites are not yet in the file). Release 1 work is mostly Platform and Front office, yet every merge batch runs all 339 minutes, and a Platform PR that touches a shared file runs configurator suites and packs too (example: PF-5 part 2's check picked C9.5, C3.2, C11.14, C10.1, C11.13, C11.17 packs through `firm-scope.ts ← core.ts`; kind job of run 43997507324).

**Which suites caught something, 7 days [LOG]:** 89 distinct suites went red at least once. Red suite-runs: 158 on PR checks, 48 in batches. Flaky (passed on retry): 3 on PR checks, 14 in batches. By family:

| Family | Red on PR | Red in batch | Flaky (retry pass) | Reading |
|---|---|---|---|---|
| Case side (`bk*`) | 22 | 17 | 5 | catches real clashes in the queue (bk13, bk4a, bk4b, bk17, bk9: all traced as clashes in [MQ]); `check_bk5_start_browser.cjs` is the one known flaky (QA-498) |
| Configurator forms (`forms*`) | 28 | 3 | 6 | mostly PR-time catches; a few flaky (qa206, qa237) |
| Configurator (`c*`) | 23 | 3 | 3 | `check_c95_release_update_browser.ts` flaky in batches ([MQ]: TimeoutError), quarantined |
| Configurator B rows (`b*`) | 23 | 4 | 0 | `check_b164_no_engine_keys.ts` red on 14 PR runs: an engine-key guard doing its job |
| qa packs (`qa*`) | 18 | 3 | 1 | PR-time catches |
| Platform (`pf*`) | 7 | 7 | 0 | `check_pf12_walls.ts` caught 5 batches on 16 Nov: the wall guard, a real catch |
| Front office (`fo*`) | 3 | 11 | 0 | schema clashes in the queue (fo1a, fo7a, fo3w) |
| Others (runtime, case, s, vv, …) | 34 | 0 | 2 | PR-time catches |

**What this says.** (1) Almost every red is a real defect or a real clash; flaky reds are rare (17 of 223 events) because B122 already quarantines repeat offenders. (2) Platform and Front office suites are cheap (about 4 of 339 minutes) and catch the clashes of Release 1 work. (3) The expensive part of the batch is the configurator and case-side suites (about 320 minutes), which run on every batch even when no configurator file changed.

**Proposal by module** (each move with its evidence and the guard that stays):

| Suites | Today | Proposed | Evidence | Quality guard that stays |
|---|---|---|---|---|
| Fast checks (rules files, graph, PDFs, gate B, port contracts) | inside shard 1 | **own first job, about 3 min; shards start only when it is green** (**changed 18 Nov:** done as job `fast`, #2151; it runs beside the parts on a batch, not before them) | 109 attempts failed here while other shards used 6,555 min [R7] | same checks, same order of strictness |
| Suites the change can affect (`--changed`), on the PR | every push of a ready PR | **once per PR, after the reviewer's Approve** (drafts until then, P-646) (**changed 18-19 Nov:** a PR now runs no suite, #2151, P-651 (2); one full run of every batch suite on the approved head is required before the label, #2249, P-731) | 57% of PR time is 2nd and later runs [R7] | the full PR check still runs on the exact head that is labelled; label-guard refuses a label without it |
| `--direct` instead of `--changed` on the PR | off (`vars.PR_SUITES` unset) | **not now** | it would run 27% of the suite time [SIM a], but 6 of 19 red PR checks would have gone green and broken in the queue instead [SIM b] (32% × 32% of PRs ≈ 10% leak; at 6 per batch, ~47% of batches would fail) | - |
| Every suite in the merge batch | yes | **stays** | it finds the clashes: 73% of failed batches [MQ], 16 Nov's pf12 and fo3w catches [LOG] | - |
| Works packs (regression) in the batch | yes | **stays** | caught the only "real break" roots in [MQ] (#1691) | - |
| Container proof (skeleton.yml) | PR only, skipped on batches | **add to the merge batch** | QA-449 (Major): the container proof never runs on what reaches main; holds R1.16 | a gate added, not removed |
| Configurator suites in a batch with no configurator file | yes | stays until a week of data shows no batch clash from Platform/Front office into the configurator | not measured: needs the per-batch file list; the PF-5 example shows shared files do connect them | nightly full set |
| Quarantined suites (11 now) | nightly only | stays (B122); fix the top flaky (bk5 start, c95) (rule unchanged on 20 Nov; worked out only when suites run, #2151) | 17 flaky events in 7 days [LOG] | nightly full run |

---

## 5. What we change, and why quality does not drop

Ordered by measured gain per unit of risk. "Quality" means: every merge still passes every suite and every Works pack on the combined code before it lands (P-614, P-651 (2)'s own aim).

| # | Change | Measured gain | Quality effect | Effort |
|---|---|---|---|---|
| Q1 | **One PR check per PR, at the end:** a PR stays draft until the reviewer approves its head; then one full PR check runs; a red result means a fix and a diff-only re-review (P-277), then one more check | Up to 63,000 machine-min a week (the 2nd and later runs, 57% of PR time) [R7]; a realistic half of that, ~30,000 (30% of all CI) | none: the same check runs on the head that gets the label | rule exists (P-646); needs a hook or the label-guard to refuse a ready push without a recorded Approve |
| Q2 | **Fast checks first** (part-1 rules job before shards) | 6,555 min a week and a 3-minute answer instead of 40 [R7] | none: same checks | one CI PR (Lead reads the diff, P-423). **Done 18 Nov** as job `fast`, #2151 |
| Q3 | **GitHub organization on Team: 60 machines** | +50% capacity (40 → 60, docs.github.com limits) | none | about 1 hour plus the checklist (P-652) |
| Q4 | **Container proof in the merge batch** | 1 job a batch | **better**: closes QA-449, lets R1.16 be proven | one CI PR |
| Q5 | **Lower cascades while batches fail often**: `max_parallel_checks` 3 → 2 when the last 24 h failure rate is above 15% | [MQ]: 10 of 30 failed batches were cascades (about 4,000 min) | none: fewer guesses, same checks | a Mergify change (Lead reads it). **Changed 19 Nov, not as proposed:** parallel mode by scope with batches of 2 and `max_parallel_checks` 6 instead (#2207, #2290; P-715, P-728 (2)) |
| Q6 | **Shards sized to the work left** (kind already counts units) and balance from each night's times | [AUD]: 15 of 43 PR checks used 8 shards under 12 min each; slowest shard ~20% over the mean | none | one CI PR. **Changed 19 Nov:** default parts 8 → 18 (#2282); sizing to work left not done |
| Q7 | **Gate jobs off the long line** (queue-gate, label-guard, records-label run on a timer and on comments) | small minutes; gate waits up to 61 min [AUD] | none | low. **Changed 18 Nov:** queue-gate moved to the Mac's self-hosted runner `xr-mac` (#2145) |

Not proposed: dropping suites from the PR (section 4: 32% of PRs went red there); `--direct` on PRs (it lets about a third of those breaks through); self-hosted machines on this public repository (section 6).

**Expected result of Q1 + Q2 + Q3:** demand about 205,000 → about 170,000 machine-minutes a week, supply 40 → 60 machines. In the 16 Nov busy hours, use would fall from 35-40 of 40 machines to about 33 of 60, so jobs would start at once again and a PR check and a batch would return to about their week medians (54 and 51 min) or better. These are projections from the measured parts, not measurements; re-measure 48 hours after.

---

## 6. Machines: options, prices, monthly cost at our load

Load used for cost: the paid part only. Paying for every minute would be 205,000 a week, about 880,000 a month (4 vCPU jobs). Paying only for merge batches (the critical path) would be 91,700 a week, about 393,000 a month [R7]. Prices read 17 Nov 2026 on the pages named.

| Option | Price (quote, page) | Machines at once | Monthly at batch-only load (393k min) | Effort to switch | Notes |
|---|---|---|---|---|---|
| **GitHub Team organization** | "$4 USD per user / month"; "Minutes are free for public repositories" (github.com/pricing) | "Team allows 60" (docs.github.com/en/actions/reference/limits) | about US$4 (1 seat) | 1 h move + checklist (Mergify, Namespace app, cloud lanes' access, variables, routines) | **Recommended now** |
| Namespace Developer (trial now) | 4 vCPU 8 GB "$0.004" prepaid, "$0.006" overage per min; Linux concurrency 32 vCPU (namespace.so/pricing) | 8 four-vCPU jobs | US$2,360 at overage (after the 30-day trial) | done (#2032) | 8 jobs is less than GitHub's free 40; OSS program exists for public repos (apply, free to ask) |
| Namespace Business | "$250/month", 250,000 unit-min, 160 vCPU (namespace.so/pricing) | 40 four-vCPU jobs | about US$2,250 (250k unit-min = 62,500 four-vCPU min included) | label change | only Business adds a full 40 |
| Blacksmith | "$0.004 /min" (blacksmith.sh/pricing; 2 vCPU in its docs' free tier); "doesn't limit how many jobs" (docs.blacksmith.sh) | no limit | US$1,570 at 2 vCPU; 4 vCPU price not shown on the page read | needs an organization ("does not support personal GitHub accounts", P-649) | possible after the org move; ask the 4 vCPU price first |
| GitHub larger runners | Linux 4-core "$0.012" per min; "only available for organizations"; "not free for public repositories" (docs.github.com/en/billing/reference/actions-runner-pricing) | 1,000 on Team | US$4,720 | after org move | most expensive |
| Self-hosted on a VPS | Hetzner CCX33 8 vCPU 32 GB "€117.99"/month, billed hourly (hetzner.com/cloud) | about 2 jobs per server (estimate) | 10 servers for 20 jobs ≈ €1,180 + upkeep | 1-3 days | GitHub: self-hosted runners "should almost never be used for public repositories" (docs.github.com/en/actions/reference/security/secure-use). **Not while the repository is public.** |

**Recommendation:** (1) Q3 now (GitHub Team, about US$4 a month, the founder's 09:00 step). (2) **Before #2032 merges, unset `vars.CI_SHARD_RUNNER`** or change #2032 so only one job group uses the overflow label; as it stands, setting the label moves all long jobs from 40 free machines to 8 trial machines. (3) Apply to Namespace's open-source program (free to ask). (4) Re-measure 48 hours after Q1-Q3. Pay for overflow only if batch waits are still over 15 minutes then; the cheapest measured choice would be Blacksmith (after the org move) or Namespace Business, at about US$1,600-2,400 a month for batch-only load. **Any spend over US$10 is the founder's decision** (P-254).

**#2032 effort, measured:** 29 lines added, 5 removed, 3 files; on Namespace one shard part took 69.5 min and the run used about 20% more machine time than on GitHub (STATE, CI-RUN lane line; batch shards on GitHub: median 38.5 min [R7]).

---
## 7. Ultracode: what it is, what it costs, and whether we use it

**What it is (official docs, read 17 Nov 2026).**
* Ultracode is a Claude Code **setting**, not a model and not a level of effort. The docs say it "turns on automatic workflow orchestration" (https://code.claude.com/docs/en/workflows.md, section "Let Claude decide with ultracode"). With it on, Claude itself decides when a task is big enough to run as a *workflow*: a script that starts many helper agents at once, each doing a slice, and then combines their results.
* Turn it on: `/effort ultracode`, or the Ultracode toggle in the `/effort` slider. Turn it off: `/effort ultracode off`. To keep it on for every session: the settings key `ultracode` (https://code.claude.com/docs/en/settings-reference). It also needs a model that supports the `xhigh` effort level (https://code.claude.com/docs/en/model-config.md); Opus 5.5 does.
* Related settings: `workflowSizeGuideline` (in `/config`: "Dynamic workflow size"): small = fewer than 5 agents, medium = fewer than 10 (the default), large = fewer than 50. `workflowKeywordTriggerEnabled` lets the word "ultracode" in one prompt start a workflow for that one task. `disableWorkflows` turns workflows off.
* History: workflows came in Claude Code 2.1.154 (28 May 2026); the trigger word was renamed to "ultracode" in 2.1.160 (2 Jun 2026); 2.1.284 made it its own toggle (https://code.claude.com/docs/en/changelog.md).
* Not the same thing: "ultrathink" is one deeper-thinking turn; "/code-review ultra" is a paid cloud review; "ultraplan" was removed in 2.1.222.

**What it costs.** The docs say "a single run can use meaningfully more tokens", and with ultracode "each request uses more tokens and takes longer than the same request without a workflow"; on a subscription "those tokens draw on your usage limits" (workflows.md). They give no dollar figure. A workflow warns as "large" past 25 agents or 1.5 million projected tokens. In plain terms: each helper agent reads its own context, so a task split across 8 helpers costs roughly 3 to 8 times the tokens of one session doing it. That multiplier is our estimate from how workflows work, not a published figure.

**Should this project use it? Recommendation: no, not as a standing setting; yes, one at a time, for wide read-only jobs, when the Lead asks for one.**
* Against a standing setting: our limit is the weekly plan, which reached 96% stop lines twice this week (P-643, "no extra usage"), and our bottleneck is CI machines and qa proof, not the speed of writing code. Ultracode on in builder lanes would multiply token use per row while every row's PR still waits in the same CI line. It also starts parallel helpers that might edit the same files, which breaks our one-builder-per-file rule (P-438b, P-278).
* For: wide, independent, read-only work where one session would take hours. Examples: re-scoring many capability rows' evidence at once; reading 30 failed batches' logs; auditing all module cards. There the helpers do not touch shared files, and the founder or Lead decides the run.
* Setting, if the founder agrees: keep `ultracode` off everywhere (the default); set `workflowSizeGuideline` to `small` in the project settings; leave `workflowKeywordTriggerEnabled` on so the Lead can write "ultracode" in one prompt for one task, and say the size and expected token cost before it starts (P-254). Model: the session's model (Opus 5.5 by P-608). Effort: workflows run at the session's effort; keep medium for builders, high for reviewers, as today.
* Time, cost, quality: no time saved on the critical path (CI and qa); token cost up 3 to 8 times on the tasks that use it; quality unchanged when used read-only, at risk when used for parallel edits.
## 8. Delivery strategy: finish whole capabilities, in journey groups

**Where we are (qa/CAPABILITIES.md on main bcc505afd, read 07:5x IST 17 Nov):** of 101 Release 1 rows, 11 Proven (Works), 26 Partial, 64 Not built. Nothing was proven overnight although 21 PRs merged, because most of those PRs were the first or a middle part of a capability, and a capability counts only when every part is on main and qa proves it (P-606, P-636).

**The problem in one line:** we start many capabilities and finish few. 40 rows have some part merged but not all (release1-forecast-2026-11-16.md §3), and each open PR sits in the same CI line whether it finishes a capability or starts a new one.

### 8a. The 26 Partial capabilities: what is missing, and where it is

Missing parts are qa's own words in each row's evidence (CAPABILITIES.md); PR numbers and states are from the GitHub API at 07:5x-08:0x IST ("approved" = label `review: approved`; "queued" = in Mergify's queue; "no ci yet" = approved but its ci run is still waiting for a machine).

| Group (journey) | Row | What qa says is missing | Where it is now | Distance to Proven |
|---|---|---|---|---|
| **G1 Messages** | R1.49 Consent gate before every send; unsubscribe | PF-19b part 2, the MailPort routing | #1956 PF-19b part 2 (approved, no ci yet); #1961 PF-19p (approved, ci waiting) | 2 PRs in flight, then qa |
| G1 | R1.28 Consent recorded per purpose | FO-2 part 3, PF-19b part 2 | #1956; FO-2 part 3 has no PR | 1 PR in flight + 1 to start |
| G1 | R1.47 One email layout | PF-19b part 2, PF-13 part 1, the case side's emails moved (QA-495) | #1956; PF-13 part 1 and QA-495's move have no PR | 1 in flight + 2 to start |
| **G2 Sign-up and the firm** | R1.19 A firm is created once, with plan, trial and owner | QA-481 (no verification email reaches an inbox), PF-5s (sign-up screens), the trial end | #1959 PF-5 part 2 (approved, ci running at 08:01); PF-5s no PR; QA-481 needs the G1 mail path | 1 in flight + 1 to start, after G1 |
| G2 | R1.100 Recorded acceptance of terms, privacy notice, data agreement | the same walk as R1.19 (24/37 lines) | as R1.19 | as R1.19 |
| G2 | R1.5 Staff sign-in with two-step, passkeys, lock-out | PF-4b (passkeys, web session, invitation acceptance), PF-4s | no PR for either | 2 to start |
| **G3 Team and permissions** | R1.6 Permissions | PF-6 part 2a, PF-6 part 2b, J-6 part 2 | #2044 PF-6 part 2a (approved, queued); #2045 PF-6m2 (ci waiting); 2b and J-6 no PR | 2 in flight + 2 to start |
| G3 | R1.4 Each query runs inside its firm | QA-499 (tracked privately by the tech lead) | #2029 PF-12b part 1 (ci waiting) | **1 PR in flight, then qa** |
| **G4 Booking** | R1.37 Public booking page; no double booking | FO-3w booking page, FO-3a booking types | #1918 FO-3a part 1a (approved, no ci yet) | 1 in flight (+ FO-3w status to confirm) |
| G4 | R1.41 Staff hours and time off | a route or screen to set them (FO-3a, FO-3st) | #1918; FO-3st no PR | 1 in flight + 1 to start |
| G4 | R1.42 Reschedule or cancel; outcomes; consult record | a staff route for outcome and attendance (FO-3w-staff), the consult record (FO-3a) | #1918; FO-3w-staff no PR | 1 in flight + 1 to start |
| G4 | R1.38 Time zones from booking page to invite | FO-3st1 (staff zone on a screen), J-38 | #2009 PF-18a part 1 (offices' time zones; ci waiting); FO-3st1, J-38 no PR | 1 in flight + 2 to start |
| G4 | R1.40 Calendar invite files | J-38; a GitHub run read on main's tree (qa only) | J-38 no PR | 1 to start |
| **G5 Case side** | R1.80 IRCC forms per applicant | C7.2's QA-315 and QA-165 | #2013 (qa: QA-315 closed; approved, queued); QA-165 needs the expert-free barcode proof | qa PR in flight + QA-165 |
| G5 | R1.77 Submission number and UCI; decision, close, reopen | QA-502 (no screen) | #2013 records QA-474 closed; QA-502 no PR | 1 to start |
| G5 | R1.74 Government deadlines that remind; working days | QA-471 | #2000 CS-DL1 part 1 (draft) | 1 draft + reminders part |
| **G6 Leads** | R1.27 Every lead carries a source | FO-4b (form embed with campaign) | no PR | 1 to start |
| G6 | R1.30 Lead lists, filters and board | FO-4 part 2 (Pipeline board, filters by stage, owner, date) | no PR | 1 to start |
| **G7 Retainer and money** | R1.53 Retainer with the regulator's 26 items | FO-5b (the 26 items), FO-5s (screens) | no PR | 2 to start |
| G7 | R1.55 Withdraw, re-issue, decline, signed offline | the decline route, FO-6 (signing link), FO-5s | #2038 FO-6 part 1 (ci waiting); others no PR | 1 in flight + 2 to start |
| G7 | R1.59 Money arithmetic | FO-7b (tax rounded per line, QA-482) | #1991 FO-7a2 (ci waiting) is not FO-7b; FO-7b no PR | 1 to start |
| **G8 Platform records** | R1.109 Complaints record | PF-21w (routes), PF-21s (screens) | #2012 PF-21i (ci waiting); 21w, 21s no PR | 2 to start |
| G8 | R1.16 Automated testing | QA-449: the container proof (skeleton.yml) never runs on what reaches main | no PR (owner: the merge-queue lane, B194) | **1 CI change** (section 5, Q4) |
| **G9 Waits on the AWS account** | R1.13 Logs and alarms (PF-23c), R1.15 Secrets store (PF-8), R1.24 Own web address (PF-8 DNS and certificate, FO-3w host pages) | the cloud half | blocked outside (design/outside-dependencies.md) | blocked |

**The five rows closest to Proven** (one PR in flight or one small change, then qa): R1.4 (#2029), R1.49 (#1956 + #1961), R1.80 (#2013, then QA-165), R1.37 (#1918), R1.16 (one CI change, which also closes a real quality gap). Every one of them is waiting for CI right now, not for building.

### 8b. Order of work (P-606 finish whole, P-623 WIP)

1. **Unjam first, today:** the approved PRs above (#1918, #1956, #1959, #1961, #2029, #2044) are the shortest path to Proven rows, and all are in the CI line. They go first in the merge queue (Mergify priority, or the Lead holds new code PRs back from "ready" for 2 hours). No new capability starts while these wait (P-606).
2. **Then whole groups, in journey order, one group per lane:** G1 Messages (it unblocks G2's QA-481 too) → G2 Sign-up → G3 Permissions → G4 Booking → G6 Leads → G7 Retainer and money → G8 → G5 case-side gaps. Within a group, the parts that finish a row come before parts that start one.
3. **qa proves a group as soon as its last part merges** (P-640): one qa lane per group; the walk is the group's journey, so one walk proves several rows.
4. **Not built rows (64) wait** until a group is fully Proven, except where an outside clock needs a start (P-618).

### 8c. How many lanes CI can carry (the rule)

Supply: 40 machines at once on GitHub Pro (60 on Team), each about 60 job-minutes an hour: **2,400 job-minutes an hour** (3,600 on Team).

Demand per merged code PR, measured (section 3): about **1,280 machine-minutes** (its PR checks, its share of batches and of failed batches, 10-17 Nov).

**Rule:** merged code PRs an hour × 1,280 must stay under 80% of supply. Today (40 machines) that is **about 1.5 code PRs an hour, 36 a day**; with Team (60) about 2.2 an hour, 54 a day; with Q1 and Q2 (about 1,050 machine-minutes per PR, projected) and Team, about 2.7 an hour, 65 a day. If a builder lane merges about 3 code PRs a day (an estimate, not measured here), then **today's line carries about 10-12 code lanes at once; Team about 15; Team plus Q1-Q2 about 18-20.** The Lead checks it each watch: when batch waits pass 15 minutes, no lane opens a new code PR; it works on review fixes, qa bugs (P-623) or the next design, which use no CI.

---

## 9. Value audit of our structure (widened brief A141, founder 08:2x IST)

**The founder's question:** what gives value, what does not, and what is an unnecessary rule. **The test used here:** a piece of structure earns its place when (a) it caught or prevented something real (a break, an incident, a Major) in the record, or (b) it guards an action that cannot be undone (money, data, security, cancelling CI, pushing to main). Anything else is a cost: tokens read at every start, wait time, hand-offs, and checks to build and keep working. The outside guidance points the same way. Anthropic says to find "the smallest possible set of high-signal tokens", that hard-coded logic in prompts "creates fragility and increases maintenance complexity" (anthropic.com/engineering/effective-context-engineering-for-ai-agents, 29 Sep 2025), and to add complexity "only when it demonstrably improves outcomes" (anthropic.com/engineering/building-effective-agents, 19 Dec 2024). The Claude Code docs say to keep CLAUDE.md under 200 lines, because "longer files consume more context and reduce adherence" (code.claude.com/docs/en/memory.md), and "if Claude keeps ignoring a line… the line belongs in a hook" (code.claude.com/docs/en/best-practices). Their model page adds that Fable "verifies its own work with less prompting" and advises "describe the outcome, not the steps" (code.claude.com/docs/en/model-config.md). All read 17 Nov 2026.

### 9a. The rules register (RULES.md: 131 rows, 25 KB)

Reused, not redone: `design/rule-triage-2026-11-16.md` (P-611, B193 part 5) checked each of the 112 prose rows against the STATE history and DECISIONS of 13-16 Nov. **Only 11 of the 112 rows were broken even once**; 101 had no break. The triage's plan turns 98 of them into new checks (70 small, 26 medium, 2 large).

| Rows | Count | Evidence of value | Recommendation |
|---|---|---|---|
| Broken 13-16 Nov: P-302 (times from the clock) 17 breaks, P-606 (finish whole) 6, P-599 (two ready rows, two rounds) 4, P-576 / P-526b (touch lists) 4, P-526 (duplicates) 3, P-423 (Lead reads money/schema diffs) 3, P-557 (always pushed) 2, P-446 (hand-over size) 2, P-610 (PR size) 1, P-371 (never cancel CI) 1 | 11 | the breaks themselves (triage §3) | **Keep, and enforce each by a check or hook** (the triage's checks for these 11; most are small) |
| Guards on actions that cannot be undone (money, live AI spend, secrets, data, security, `sources/` and `code/`, force-push, merge outside the queue) | about 10 (P-175, P-175b, P-295b, P-312a, P-539, P-583, P-589, P-607 and the push-guard rows) | the cost of a single miss is high even with no break so far | **Keep, enforced** (most already are: push-guard, deny rules, ledger) |
| Product rulings (what the app does) kept in the register | most `IDX-*` and product rows | they belong to the product, not the pipeline | **Move out** to DECISIONS and the module cards; the app's tests enforce them (the triage itself says this for P-607) |
| Way-of-working rows with no break and no irreversible action (report formats, check cadence, who asks whom, batching asks, board wording, desk rules) | the rest (roughly 70-90) | none in the record | **Merge into about 12 short principles** (one page) and **retire the rest to history, word for word** (P-188: git keeps them). Do **not** build 70 more checks: each is a PR in the same CI line (section 3: about 1,280 machine-minutes per code PR) and a script to keep alive |

**Impact:** start read falls from about 25 KB of rules to about 6-8 KB (projection). The tooling queue falls from 98 checks to about 20. The quality gates (CI, reviewer, qa gates A and B) are untouched. **Risk:** a retired row turns out to have mattered. **Guard:** each retired row keeps its ID in the ID map (the triage's `rule-id-map` already does this), so a break brings it back with a check.

### 9b. Hooks, skills, agents, settings (on main)

| Piece | What it does | Evidence of value | Cost | Recommendation |
|---|---|---|---|---|
| `merge-guard.sh` (PreToolUse Bash) | only the Lead copy merges or labels | P-402; prevents merges outside the queue | runs on each Bash call (fast) | **keep** |
| `lane-preflight.sh --hook` (session starts) | refuses a lane start with no model/effort line; Mac disk and copy caps | P-605, P-608, P-348e | small | **keep** |
| `agent-model-guard.sh` (Agent/Task) | reviewers and breakers on Opus | P-303 | small | **keep** |
| `lead-check-guard.sh` (CronCreate) | checks the Lead's timers | P-388; the 7 Nov unattended stall (a prompt waited 7.4 h) | small | **keep** |
| `stop-check.sh` (Stop) | builders never edit STATE, RULES, DECISIONS, BACKLOG; qa alone edits CAPABILITIES and BUGS | P-314 | runs each turn end | **keep** |
| SessionStart hook | prints STATE and pointers into every new session | the "start read" of P-545 | **11.8 KB of context in every session** (this session's own start, 07:52 IST) | **shrink** to a 1-2 KB pointer (current Lead, branch, "read STATE when you need it"); the skills already load on demand |
| Deny rules (39 in `.claude/settings.json`) | no force-push, no repo edits, no Drive writes | "deny rules hold in every permission mode" (code.claude.com/docs/en/best-practices) | none | **keep**. Known gaps are tracked privately by the tech lead. |
| Skills (12, 67 KB in all; lead 10 KB, qa 9.6 KB) | the roles' procedures | they load only when invoked; only their descriptions are always in context (code.claude.com/docs/en/skills.md) | low | **keep**; trim `lead` and `lead-watch` once 9c changes the hand-over |
| Agents `screen-reviewer`, `screen-breaker` | independent review in a fresh context | review rounds (P-599: 4 PRs went past two rounds); qa still found 12 Majors after review and CI, 13-17 Nov (QA-440 onwards: 10 Gap, 2 Bug) | Opus tokens per PR | **keep** (independent checking is where quality comes from; qa's Majors show review alone is not enough) |
| `.claude/rules/modules` (14 module cards) | context loaded for one module's paths | module-cards CI | low; path-scoped loading | **keep** |

### 9c. The hand-over layer: the biggest structural cost

* **Measured:** the Lead number went from 29 (12 Nov) to 73 (17 Nov 08:00 IST), **about 44 Leads in 5 days, one every 2-3 hours** (Lead numbers in STATE commit subjects on `lead/2026-11-07-lead31`). The cause is P-446: hand over at the first check after 200k tokens beyond the start read, and never compact.
* **What each hand-over costs:** a hand-over block, a STATE rewrite kept under 12 KB, items to ack (P-611b), a new start read (about 60 KB with the SessionStart output), and every in-flight session re-pointed. This research session was re-pointed mid-task ("Current Lead is now Lead 73") and received a widened brief through the new Lead. Lost context shows up as re-measurement and re-asking. The record has the 13-16 Nov breaks of P-446 itself (2) and 17 breaks of P-302 (guessed times) by 13 different Leads (triage §3): a rule a new Lead must re-learn every 2-3 hours.
* **What the guidance says:** compaction ("summarizing its contents, and reinitiating a new context window with the summary") and structured note-taking outside the context window are Anthropic's two named methods for long-horizon work (context-engineering post). Our STATE file already is that note. Context rot (recall falls as context grows) is the real reason for a limit, so a limit stays, but compacting onto STATE is a smaller step than starting a new Lead.
* **Recommendation:** a one-day trial. The Lead lets Claude Code compact (P-446's "never compacts" lifted for the trial), writes STATE at every check as today, and hands over only at the window's hard edge or a model change. **Measure before and after:** Leads a day (today 9-14), items un-acked at hand-over, guessed-time breaks, and tokens an hour. Keep whichever is better. **Projects** ("one ongoing conversation where Claude coordinates a stream of related work"; threads "share repositories, instructions, and memory"; public beta on Pro, Max and Ultra, code.claude.com/docs/en/claude-projects.md) is the product built for this. It is a beta and its context carry-over is not documented in detail, so it gets a later trial, not a switch.

### 9d. The records layer

102 of 273 PRs merged 10-17 Nov were records or qa records (48 on 16 Nov alone; GitHub search). They run cheap CI (251 one-shard runs, 1,924 machine-minutes in 7 days [R7]), but each takes a queue slot, gate jobs and Lead turns. **Recommendation:** records twice a day (P-336 already says daily); qa verdicts in the same batch. Cost of the change: none. Quality: none.

### 9e. The talk audit, folded in (Lead 73's workflow, 17 Nov)

Reused, not redone. It checked 20 claims in the talk "Rethinking Claude Code Best Practices" (AI Engineer write-up, video vlfCjWuv4es) against the Claude Code docs and Anthropic posts: 11 hold as said, 8 hold with a catch the talk skipped, 1 holds only in part, 0 are wrong. It then checked 15 practices against our setup. Where it agrees with this page, its evidence is stronger, because it read the settings files themselves. **It adds or corrects these points:**

| Point | Talk audit's finding (read-only spot checks, 17 Nov) | Effect on this page |
|---|---|---|
| Hand-overs | the Lead handed over 11 times in about 27 hours; each new session reads about 72k tokens before its first message | matches 9c (about 44 Leads in 5 days); its T8 is the same trial as D10 |
| Projects | threads do **not** load the repo's skills, hooks, deny rules or `.mcp.json`; the beta is on Pro, Max and Ultra only, with a waitlist; the main session sees only what threads report back | **Projects cannot replace the Lead today**: our guards would not apply in its threads. 9c's "later trial" stays later |
| Settings and permissions | Known gaps are tracked privately by the tech lead. | its T1-T3, T5-T7 and T10 feed D13 |
| Fable | "Fable is never a default and may bill to usage credits" (Projects and model-configuration docs, as the audit read them); the self-checking claim rests on customer quotes, not a measured figure | **D11 needs a check first:** a Fable Lead must not bill to usage credits under P-643 ("no extra usage"). If it would, run D10 (compaction) alone on Opus 5.5 |

**Mapping:** D13 = its T1 + T2 + T3 + T6, then T7, then auto-fix (its T11). D10 = its T8. Its T5 (a GitHub ruleset on main) is new and belongs **before** everything in section 13 step 4. Its T9 (no ask rules; they become waits when unattended, P-388) agrees with this page.

---

## 10. The model split: Fable 5.2 orchestrator, Opus 5.5 workers?

**Today (P-605, P-608):** Opus 5.5 is the working model at medium effort, high for reviewers, breakers, fresh readers and risky rows; Fable 5.2 only for the strategy desk, challenges and specifying.

**What the evidence says:**
* Anthropic's own multi-agent research system used a stronger lead with cheaper workers (Opus 4 lead, Sonnet 4 subagents) and beat a single agent by 90.2% on its research eval, at about 15 times the tokens of a chat (anthropic.com/engineering/multi-agent-research-system, 13 Jun 2025).
* The same post: "most coding tasks involve fewer truly parallelizable tasks than research", and agents "are not yet great at coordinating and delegating to other agents in real time".
* Claude Code's docs: Fable "verifies its own work with less prompting"; "Opus 5.5 at `medium` matches or exceeds Opus 5 at `high`" (model-config.md). The docs give no orchestrator-versus-worker recommendation beyond `opusplan` (Opus to plan, Sonnet to execute).

**Our case:** the Lead's job is judgement over many inputs (queue, lanes, qa, the founder), with many small tool calls. Workers write code against a brief. A stronger orchestrator fits the shape, and "stronger model, less structure" (the founder's words) is what the docs claim for Fable. What is unknown is the token cost on our weekly plan: the Lead holds the largest context of any session.

**Recommendation:** **trial Fable 5.2 (high) as the Lead for one day, together with the compaction trial in 9c**, with workers unchanged (Opus 5.5 medium; reviewers and breakers high). Measure: weekly-plan percent per hour (today about 2.9%/h with lanes, P-641), Leads a day, decisions the founder had to correct, rows proven a day. Keep it only if rows proven a day rise and plan use stays under the P-643 stop line. Builders stay on Opus: coding is the less parallel, more dependent work where the docs and Anthropic's post see less gain from a heavier setup.

---

## 11. Claude Code features that remove manual work (official docs, read 17 Nov 2026)

| Feature | What the docs say | What it replaces here | Recommendation |
|---|---|---|---|
| **Auto mode** | "a second model, the classifier, reviews actions instead of you"; it blocks what "escalates beyond your request", force pushes, production deploys; it trusts "your working directory and the remotes" configured at start; trusted infrastructure goes in `autoMode.environment` (permission-modes.md) | prompts that stall lanes while unattended (the 7 Nov incident, 7.4 h) | **use for lanes**, with `autoMode.environment` naming our repository, Namespace and the demo host in plain words |
| **Deny rules** | evaluated "deny, then ask, then allow"; "an allow rule can't carve an exception out of a deny rule"; hold in every mode (permissions.md, best-practices) | prose "never" rules | **move each irreversible "never" here** |
| **Sandbox** | OS-enforced around shell commands; "covers shell commands only"; file tools, MCP and hooks "run outside it" (sandboxing.md) | the Mac copies' file and network limits | **keep on** in every copy; do not count it as a guard on file edits |
| **Cloud environments** | network None / Limited (package registries, GitHub, listed domains) / Full; environment variables are readable by anyone using the environment; network secrets "stay outside the sandbox" and the proxy attaches them (cloud-environments.md) | P-647's "no lane waits on a network change"; secrets by hand | **one Limited environment** with our allowlist (GitHub, npm, Namespace, canada.ca) and any key as a network secret, never as an env var |
| **Auto-fix PRs** | "Claude can watch a pull request and automatically respond to CI failures and review comments" (claude-code-on-the-web.md) | the Lead's "re-run the failed part / wake the lane" loop; lanes that slept through CI (P-557, 2 breaks) | **turn on for lane PRs only after its preconditions are met.** Known gaps are tracked privately by the tech lead. |
| **Merge when ready** | "turns on GitHub's auto-merge for the PR"; with a merge queue it does not request a squash (desktop.md) | nothing: Mergify already queues approved PRs by itself (P-637) | **not needed** |
| **Projects** | public beta; one conversation coordinating threads that share repositories, instructions and memory (claude-projects.md) | manual Lead hand-overs (9c) | **later trial**, after 9c's compaction trial |
| **Agent teams** | "experimental and disabled by default"; "significantly more tokens than a single session"; no nested teams (agent-teams.md) | - | **not now** |
| **Headless runs** | `claude -p` with `--max-turns` and a known "what done looks like" before going unattended (best-practices) | hourly routines (P-645) | **use** for routines, with a turn cap |

---

## 12. Dynamic workflows and ultracode: throughput against tokens

* **Cost, from evidence:** agents use about 4 times the tokens of a chat, multi-agent systems about 15 times (Anthropic, multi-agent research post). The Claude Code docs say a workflow run "can use meaningfully more tokens" and give **no throughput figure** (workflows.md). Default limits: 16 agents at once, 1,000 per run.
* **Gain, from evidence:** +90.2% on research tasks that split into independent parts (same post). For coding, the post expects less gain, because tasks depend on each other and share context.
* **Our measured constraint:** CI carries about 36 merged code PRs a day today (section 3), and qa proves about 2.5 rows a day (release1-forecast §4). Writing code faster puts more PRs into a full line. **Throughput gain for builders today: none until CI and qa capacity rise.** Where it does help is wide, independent, read-only work: qa evidence reading across many rows, log audits like section 2, module-card audits. There a workflow turns hours of serial reading into minutes, and nothing it does touches shared files.
* **Recommendation:** as section 7. Ultracode off by default, `workflowSizeGuideline: small`, used by the Lead for named read-only jobs with the size and token estimate stated first. Revisit for qa after Q1-Q3 (section 5) free the CI line: qa proving is the next constraint, and a qa evidence pass per journey group is a good parallel fit.

---

## 13. Target setup for long unattended runs, and the migration order

**Target (each part named above):** 60 machines (GitHub Team) and one PR check per PR · fast checks first, container proof in the batch, every suite and Works pack once in the batch · lanes in one Limited cloud environment with network secrets, auto mode with `autoMode.environment`, deny rules for every irreversible action, auto-fix on their PRs, at most the lane cap of section 8c · one Lead per day (compaction onto STATE; Fable trial) instead of one every 2-3 hours · about 20 enforced rules plus about 12 principles instead of 131 rows · qa gates A and B unchanged, one qa lane per journey group.

| Step | When | Change | Before (measured) | After (target; measure it) |
|---|---|---|---|---|
| 1 | today | GitHub Team org (D1); unset `CI_SHARD_RUNNER` before #2032 (D3) | 40/40 busy, 116 queued (08:01 IST); PR check median 91 min, batch 81 (since 16 Nov noon) | jobs start within 5 min in busy hours; PR check and batch at or under the week medians (54 and 51) |
| 2 | today | one PR check per PR after Approve (D2: drafts until Approve, label-guard refuses an un-approved ready push) | 57% of PR minutes on 2nd and later runs (63,309 a week) | under 30% |
| 3 | today-tomorrow | fast checks job; container proof in the batch; cascades 3 → 2 while failing over 15% (D6) | 6,555 min a week in shards after a part-1 failure; QA-449 open; 10 of 30 failed batches were cascades | 0; QA-449 closed; cascades halved |
| 4 | day 2 | deny rules for irreversible actions; `autoMode.environment`; one Limited cloud environment with network secrets | P-371 broken once; prompts stall lanes (7 Nov 7.4 h) | 0 cancels; stalls counted by lead-watch go down |
| 5 | day 2 | auto-fix on lane PRs, after its preconditions are met | lanes slept through CI results (2 breaks, 13-16 Nov) | PRs red for over 1 h with no push: count falls to near 0 |
| 6 | day 3 | Lead continuity trial: compaction onto STATE, Fable 5.2 high as Lead (D10, D11) | about 9-14 Leads a day; 17 guessed-time breaks 13-16 Nov | 1-2 Leads a day; breaks down; plan use per hour within P-643 |
| 7 | day 3-4 | rules: about 20 enforced plus about 12 principles; product rulings out to DECISIONS and module cards; SessionStart output to 1-2 KB (D12, D13) | 131 rows, 25 KB, 112 prose; 11.8 KB start output | under 8 KB of rules; start read under 30 KB |
| 8 | day 5 | re-measure CI (repeat section 2), then decide paid overflow (D4) | this page | waits under 15 min with no spend, or a priced choice to the founder |
| 9 | after day 5 | Projects trial for the Lead; workflows for qa evidence passes | - | measured against step 6 |

Every step is reversible, none lowers a gate, and each has one measure taken before and after. Steps 1-3 change capacity and CI, steps 4-5 remove manual waits, and steps 6-7 shrink the structure. That order follows the constraint: the CI line first, because nothing else can move faster until it does.

---

## 14. Decisions for the founder (each with a recommendation, P-254)

| # | Decision | Recommendation | Time | Cost | Quality |
|---|---|---|---|---|---|
| D1 | Move the repository into a GitHub organization on the Team plan (the 09:00 IST step, P-652) | **Yes, today** | about 1 h plus the checklist; jobs start at once again in busy hours (projection) | about US$4 a month (1 seat; github.com/pricing) | none |
| D2 | What "run the full tests once" (P-651 (2)) means | **One PR check per PR, run once after the reviewer's Approve, plus every suite once in the merge batch.** Not "no suites on the PR". (**Built differently, 18-19 Nov:** no suites on the PR, #2151; then one full run on the approved head before the label, #2249, P-731.) | saves up to 63,000 machine-min a week; realistic ~30,000 | US$0 | none; dropping PR suites instead would let 32% of PRs' breaks into batches |
| D3 | #2032 (CI-RUN part 1) while `vars.CI_SHARD_RUNNER` is set | **Unset the variable before #2032 merges**, or narrow #2032 to one job group; keep the switch | avoids dropping from 40 free machines to 8 trial machines | US$0 | none |
| D4 | Paid overflow (Namespace Business, Blacksmith after the org move) | **Not yet.** Decide 48 h after D1-D2 with fresh numbers; apply to Namespace's open-source program meanwhile | - | US$1,600-2,400 a month if bought for batch-only load (section 6) | none |
| D5 | Self-hosted machines on a rented server | **No** while the repository is public (GitHub's own security guidance) (Since 18 Nov the queue-gate job alone runs on the Mac's self-hosted runner; it checks out main only, never the PR's code, #2145) | - | - | security risk |
| D6 | Fast checks first, container proof in the batch, cascades 3 → 2 while failures are high (Q2, Q4, Q5) (20 Nov: Q2 done, #2151; Q5 replaced by parallel scopes, #2207, #2290; container proof in the batch not in `.github/workflows` on main) | **Yes**, one small CI PR each; the Lead reads each .github diff (P-423) | small | US$0 | Q4 raises quality (closes QA-449) |
| D7 | Delivery order: unjam the approved near-Proven PRs first, then whole journey groups, no new capability while a started one waits (P-606) | **Yes** | the 5 nearest rows can be proven as soon as their PRs merge | US$0 | none |
| D8 | Lane cap from CI capacity (section 8c) | **Yes**: about 10-12 code lanes today, about 15 on Team | fewer waits | US$0 | none |
| D9 | Ultracode | **Off as a standing setting; `workflowSizeGuideline: small`; on only for a named, read-only, wide task** | - | 3-8 times the tokens of one session on the tasks that use it (estimate) | none when read-only |
| D10 | Lead continuity: allow compaction onto STATE for a one-day trial (lifts P-446's "never compacts" for that day) | **Yes, trial** | 1 day; hand-overs from about 9-14 a day toward 1-2 | US$0 (tokens measured) | none: STATE stays the record; revert if items are missed |
| D11 | Fable 5.2 (high) as the Lead for the same trial day; workers stay Opus 5.5 | **Yes, trial, only if Fable does not bill to usage credits on our plan** (P-643; talk audit 9e); otherwise D10 alone on Opus 5.5 | 1 day | plan use measured per hour; stop at the P-643 line | none |
| D12 | Rules: about 20 enforced (the 11 broken in 13-16 Nov plus the irreversible guards) and about 12 principles; product rulings out to DECISIONS and module cards; the rest retired to history, word for word | **Yes** | 1 day of Lead work | US$0; saves about 78 check PRs | none: every gate stays; a retired row comes back with a check if it is ever broken |
| D13 | The talk audit's T5 first (a GitHub ruleset on main), then its T1-T3 settings batch (including the Stop timeout); shrink the SessionStart output to 1-2 KB; one Limited cloud environment (its T6); then its T7 (Option B); auto-fix only after T7 (its T11) | **Yes**, in that order | about 1 day | US$0 | better: irreversible actions become refused, not just asked |

## 15. What was not measured

* The jobs of runs still waiting at 08:04 IST (they are not in [R7]), so 17 Nov's waits are understated.
* Which PRs were in each batch, so this page cannot split 16 Nov's 21 failed batches into roots and cascades; [MQ]'s method does that and is the right next step for 16-17 Nov.
* `--direct` replay: 19 red PR checks replayed of 85 (time); 13 of 19 would still go red under `--direct`. A full replay is the evidence a later `--direct` decision needs.
* Per-lane merge rate (used as an estimate in 8c).
* Section 9: the value of the roughly 70-90 rules with no break is judged from the triage's break count (13-16 Nov only); a longer window could show a rare but real catch. The talk audit is folded in (9e). The anti-stall review (Lead 72) had not landed by the cut-off; Lead 74 folds it in.
* Section 10: Fable 5.2's token cost as the Lead on our plan: not measured (the trial measures it).
* Blacksmith's 4 vCPU price and whether any provider accepts our account before the org move (Namespace did for the trial, P-649).
* The cost of each suite's app start inside a shard, and CPU use per shard (logs give suite times only).
