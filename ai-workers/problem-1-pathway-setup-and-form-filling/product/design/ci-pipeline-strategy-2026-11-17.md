# CI pipeline and delivery strategy, measured (17 Nov 2026)

Research session for the Lead, started at the founder's request (07:4x IST 17 Nov). Read-only: nothing in the app, CI, `.github`, Mergify, labels or settings was changed; no run was cancelled, re-run or started; no spend. Times are IST from `TZ=Asia/Kolkata date`. Every number names its source.

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
5. **Delivery:** nothing was proven overnight because most merges were a first or middle part of a capability. The five rows nearest to Proven each need one PR that is waiting in the CI line now (section 8). Finish whole groups in journey order, and cap the number of lanes at what CI can carry (section 8c).

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
| 5a | PR check: `kind` | what changed; test merge on today's main; memory of green suites; picks shards | 1 | 1.9 / 3.5 min | 1% | [R7] |
| 5b | PR check: `shard` 1-8 | part 1: rules files, graph, official PDFs, gate B, port contracts; every part: the suites this change can affect (`--changed`) | up to 8 | 30.3 / 46.5 min | 11% of jobs | [R7] |
| 5c | PR check: `packs` | gate B's acceptance packs of the capabilities the diff touches | 1-5 | 11.5 / 17.2 min | 7% | [R7] |
| 5d | PR check: `types` | type check, api and web | 1 | 2.5 / 3.3 min | 6% | [R7] |
| 5e | PR check: `ci` | joins the parts' results | 1 | 0.1 min | - | [R7] |
| 5f | Other PR workflows | pr-rules, module-cards, skeleton (container proof), trace, guards, cockpit-tests, records-label | 1 each, by path | 1-5 min | - | `.github/workflows/*.yml` on main |
| 6 | Label and queue gate | `review: approved` only on Approve + green (label-guard, queue-gate.sh auto-label, P-637); `queue-fresh` re-runs a stale PR on today's main (B194) | small jobs, also on a timer | under 1 min | - | `.mergify.yml`, queue-gate.yml |
| 7a | Merge batch (Mergify, up to 6 PRs, 3 batches checked at once) `shard` 1-8 | every suite except the quarantined ones (11 suites in the newest logs) | 8 | 38.5 / 48.6 min | 3% of jobs | [R7], [LOG] |
| 7b | Merge batch `regression` 1-5 | every Works capability's pack (the protected set) | 5 | 14.5 / 19.2 min | 1% | [R7] |
| 7c | Merge batch `types`, `kind`, `ci` | as in the PR | 3 | 2-3 min | 0% | [R7] |
| 8 | Main | demo update on the Mac; nightly full set including quarantined suites (20:23 UTC); XFA engine nightly | 1 + nightly | - | - | demo-update.yml, nightly.yml |
| 9 | qa gate B | the capability's pack green on main's head on GitHub's machines, run id in qa's row, an independent re-run | uses stage 7's run or a nightly dispatch | - | - | P-339 |
| 10 | qa gate A | qa walks the capability by screens to the next one's first step; a fresh Opus reader gives the verdict | none on GitHub | median ~35 h from last part to Works (n=4) | - | P-348c, release1-forecast-2026-11-16 §4 |
| 11 | Proven | the row says Works in `qa/CAPABILITIES.md` | - | - | 11 of 101 | [CAP] |

**Per merged code PR** (7 days): 205,461 machine-minutes / 160 app-code PRs merged (GitHub search, merged 10-17 Nov: 160 app-code, 102 records or qa, 11 tooling) = **about 1,280 machine-minutes per merged code PR**, all stages together.

**Lanes the line can carry today.** 40 machines × 60 = 2,400 machine-minutes an hour; at 80% use (the point where waits start to grow fast), 1,920. Divided by 1,280: **about 1.5 merged code PRs an hour, about 36 a day.** The best measured days merged 31 code PRs (12 and 15 Nov, IST, GitHub search); 16 Nov merged 26 while using 45,500 machine-minutes. Above about 30 a day, more lanes bring more waiting, not more merges.

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
| Fast checks (rules files, graph, PDFs, gate B, port contracts) | inside shard 1 | **own first job, about 3 min; shards start only when it is green** | 109 attempts failed here while other shards used 6,555 min [R7] | same checks, same order of strictness |
| Suites the change can affect (`--changed`), on the PR | every push of a ready PR | **once per PR, after the reviewer's Approve** (drafts until then, P-646) | 57% of PR time is 2nd and later runs [R7] | the full PR check still runs on the exact head that is labelled; label-guard refuses a label without it |
| `--direct` instead of `--changed` on the PR | off (`vars.PR_SUITES` unset) | **not now** | it would run 27% of the suite time [SIM a], but 6 of 19 red PR checks would have gone green and broken in the queue instead [SIM b] (32% × 32% of PRs ≈ 10% leak; at 6 per batch, ~47% of batches would fail) | - |
| Every suite in the merge batch | yes | **stays** | it finds the clashes: 73% of failed batches [MQ], 16 Nov's pf12 and fo3w catches [LOG] | - |
| Works packs (regression) in the batch | yes | **stays** | caught the only "real break" roots in [MQ] (#1691) | - |
| Container proof (skeleton.yml) | PR only, skipped on batches | **add to the merge batch** | QA-449 (Major): the container proof never runs on what reaches main; holds R1.16 | a gate added, not removed |
| Configurator suites in a batch with no configurator file | yes | stays until a week of data shows no batch clash from Platform/Front office into the configurator | not measured: needs the per-batch file list; the PF-5 example shows shared files do connect them | nightly full set |
| Quarantined suites (11 now) | nightly only | stays (B122); fix the top flaky (bk5 start, c95) | 17 flaky events in 7 days [LOG] | nightly full run |

---

## 5. What we change, and why quality does not drop

Ordered by measured gain per unit of risk. "Quality" means: every merge still passes every suite and every Works pack on the combined code before it lands (P-614, P-651 (2)'s own aim).

| # | Change | Measured gain | Quality effect | Effort |
|---|---|---|---|---|
| Q1 | **One PR check per PR, at the end:** a PR stays draft until the reviewer approves its head; then one full PR check runs; a red result means a fix and a diff-only re-review (P-277), then one more check | Up to 63,000 machine-min a week (the 2nd and later runs, 57% of PR time) [R7]; a realistic half of that, ~30,000 (30% of all CI) | none: the same check runs on the head that gets the label | rule exists (P-646); needs a hook or the label-guard to refuse a ready push without a recorded Approve |
| Q2 | **Fast checks first** (part-1 rules job before shards) | 6,555 min a week and a 3-minute answer instead of 40 [R7] | none: same checks | one CI PR (Lead reads the diff, P-423) |
| Q3 | **GitHub organization on Team: 60 machines** | +50% capacity (40 → 60, docs.github.com limits) | none | about 1 hour plus the checklist (P-652) |
| Q4 | **Container proof in the merge batch** | 1 job a batch | **better**: closes QA-449, lets R1.16 be proven | one CI PR |
| Q5 | **Lower cascades while batches fail often**: `max_parallel_checks` 3 → 2 when the last 24 h failure rate is above 15% | [MQ]: 10 of 30 failed batches were cascades (about 4,000 min) | none: fewer guesses, same checks | a Mergify change (Lead reads it) |
| Q6 | **Shards sized to the work left** (kind already counts units) and balance from each night's times | [AUD]: 15 of 43 PR checks used 8 shards under 12 min each; slowest shard ~20% over the mean | none | one CI PR |
| Q7 | **Gate jobs off the long line** (queue-gate, label-guard, records-label run on a timer and on comments) | small minutes; gate waits up to 61 min [AUD] | none | low |

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
| G3 | R1.4 Each query runs inside its firm | QA-499: a bypass use writes no audit line | #2029 PF-12b part 1 (ci waiting) | **1 PR in flight, then qa** |
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

## 9. Decisions for the founder (each with a recommendation, P-254)

| # | Decision | Recommendation | Time | Cost | Quality |
|---|---|---|---|---|---|
| D1 | Move the repository into a GitHub organization on the Team plan (the 09:00 IST step, P-652) | **Yes, today** | about 1 h plus the checklist; jobs start at once again in busy hours (projection) | about US$4 a month (1 seat; github.com/pricing) | none |
| D2 | What "run the full tests once" (P-651 (2)) means | **One PR check per PR, run once after the reviewer's Approve, plus every suite once in the merge batch.** Not "no suites on the PR". | saves up to 63,000 machine-min a week; realistic ~30,000 | US$0 | none; dropping PR suites instead would let 32% of PRs' breaks into batches |
| D3 | #2032 (CI-RUN part 1) while `vars.CI_SHARD_RUNNER` is set | **Unset the variable before #2032 merges**, or narrow #2032 to one job group; keep the switch | avoids dropping from 40 free machines to 8 trial machines | US$0 | none |
| D4 | Paid overflow (Namespace Business, Blacksmith after the org move) | **Not yet.** Decide 48 h after D1-D2 with fresh numbers; apply to Namespace's open-source program meanwhile | - | US$1,600-2,400 a month if bought for batch-only load (section 6) | none |
| D5 | Self-hosted machines on a rented server | **No** while the repository is public (GitHub's own security guidance) | - | - | security risk |
| D6 | Fast checks first, container proof in the batch, cascades 3 → 2 while failures are high (Q2, Q4, Q5) | **Yes**, one small CI PR each; the Lead reads each .github diff (P-423) | small | US$0 | Q4 raises quality (closes QA-449) |
| D7 | Delivery order: unjam the approved near-Proven PRs first, then whole journey groups, no new capability while a started one waits (P-606) | **Yes** | the 5 nearest rows can be proven as soon as their PRs merge | US$0 | none |
| D8 | Lane cap from CI capacity (section 8c) | **Yes**: about 10-12 code lanes today, about 15 on Team | fewer waits | US$0 | none |
| D9 | Ultracode | **Off as a standing setting; `workflowSizeGuideline: small`; on only for a named, read-only, wide task** | - | 3-8 times the tokens of one session on the tasks that use it (estimate) | none when read-only |

## 10. What was not measured

* The jobs of runs still waiting at 08:04 IST (they are not in [R7]), so 17 Nov's waits are understated.
* Which PRs were in each batch, so this page cannot split 16 Nov's 21 failed batches into roots and cascades; [MQ]'s method does that and is the right next step for 16-17 Nov.
* `--direct` replay: 19 red PR checks replayed of 85 (time); 13 of 19 would still go red under `--direct`. A full replay is the evidence a later `--direct` decision needs.
* Per-lane merge rate (used as an estimate in 8c).
* Blacksmith's 4 vCPU price and whether any provider accepts our account before the org move (Namespace did for the trial, P-649).
* The cost of each suite's app start inside a shard, and CPU use per shard (logs give suite times only).
