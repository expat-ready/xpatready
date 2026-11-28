# CI options: CircleCI, GitHub Actions and alternatives (23 Nov 2026)

Asked by the founder through the tech lead: what CircleCI is, how it compares with GitHub Actions, what a private repository would cost at our volume, the best alternatives, and one recommendation. Research agent, vendor pages read **23 Nov 2026** unless another date is given. "Inference" marks my own arithmetic or reasoning; "Unverified" marks anything I could not confirm on a vendor page today. Prices are list prices in US dollars before tax.

Earlier research on the same question (kept, not repeated): `ci-runners-research-2026-11-18.md` (our measured job minutes and waits) and `ci-cloud-cost-research-2026-11-19.md` (AWS, Google Cloud and Hetzner machine prices, startup credits).

**Words used.** *CI* (continuous integration) = the robot that runs all tests on every change. *Runner* = the rented machine that runs one job. *Shard* = one slice of the test suite run on its own machine so slices run at the same time. *Merge queue* = a line where approved changes are tested together with the latest main before merging. *Batch* = several queued changes tested in one run. *Flaky test* = a test that passes and fails on the same code. *Job-minute* = one machine busy for one minute.

---

## 1. CircleCI in five lines

1. CircleCI is a hosted CI service, separate from GitHub, that watches a GitHub (or GitLab/Bitbucket) repository and runs your build and tests on its machines, configured by a `.circleci/config.yml` file.
2. It bills by "credits" (25,000 credits = $15 on the Performance plan), spent per minute at a rate set by machine size, from 5 credits/min (small) to 400 credits/min (large Mac) [circleci.com/pricing; circleci.com/product/features/resource-classes].
3. Its known strength is test speed tooling: split tests across machines by past timings, rerun only failed tests, flaky-test detection, and (since late 2025/2026) paid "Smarter Testing": run only the tests a change affects and hand out tests dynamically [circleci.com/docs/guides/optimize/parallelism-faster-jobs; circleci.com/blog/smarter-testing-stop-running-tests-that-dont-matter, "Last Updated Oct 27, 2026"].
4. It offers Linux (Docker and full VM), Arm, Windows, Apple-silicon Mac (M4 Pro) and GPU machines, plus self-hosted runners on your own machines.
5. It is SOC 2 Type II and FedRAMP-tailored [circleci.com/security]; it had a serious breach in January 2023 that required every customer to rotate every stored secret [circleci.com/blog/jan-4-2023-incident-report].

---

## 2. CircleCI vs GitHub Actions

| Area | CircleCI | GitHub Actions | Who is ahead |
|---|---|---|---|
| **Split tests by timing** | Built in: `parallelism: N` plus `circleci tests run --split-by=timings` uses past JUnit timings to balance slices; dynamic splitting (a shared queue machines pull from) is paid [docs page above; Smarter Testing blog] | Not built in. A `matrix` starts N copies; each test tool splits by count (e.g. Playwright `--shard=i/N`); timing-based balancing needs a community action or our own script (Inference from GitHub docs, no native feature found) | CircleCI |
| **Caching** | Dependency cache built in; Docker layer caching (DLC) costs **200 credits ($0.12) per job run** [circleci.com/pricing] | `actions/cache`, 10 GB per repository included [docs.github.com/en/billing/concepts/product-billing/github-actions]; Docker layer caching through the `gha` cache backend [docs.docker.com/build/cache/backends/gha] | Even; CircleCI's DLC is easier but costly per job |
| **Parallelism** | `parallelism` key on one job; concurrency caps by plan: Free 30, **Performance 80**, Scale unlimited jobs [circleci.com/pricing] | Matrix jobs; Enterprise plan **500** concurrent standard jobs, 1,000 on larger runners, 50 macOS [docs.github.com/en/actions/reference/limits] | GitHub on raw capacity (our peak is 150+ jobs at once, see §3) |
| **Machine sizes** | Docker small 1 vCPU to 2xlarge; Linux VM medium to 2xlarge; Arm; Mac M4 Pro medium/large; GPU [resource-classes page] | Linux 2-core standard; larger runners 4 to 16+ cores; Arm; macOS 3-core M1, 12-core Intel, 5-core M2 Pro [docs.github.com/en/billing/reference/actions-runner-pricing] | Even |
| **Rerun failed tests only** | Yes (free), reruns failed test files/classes, not single tests; web-app button deprecated in favour of Smarter Testing's free "Rerun Only Failed Tests" [circleci.com/docs/guides/test/rerun-failed-tests] | Only "re-run failed jobs" (the whole shard), up to 50 times within 30 days [docs.github.com/en/actions/how-tos/manage-workflow-runs/re-run-workflows-and-jobs] | CircleCI |
| **Test insights / flaky detection** | Test Insights flags flaky tests automatically; auto-rerun of failed tests is paid [CircleCI blog/changelog above] | None built in. **Mergify, which we already use, includes CI Insights with flaky job and flaky test detection and Auto-Retry on every plan** [docs.mergify.com/ci-insights; mergify.com/pricing] | Even for us (via Mergify) |
| **Test impact analysis** (run only affected tests) | Paid Smarter Testing: free up to 10,000 "test atoms"/month on Performance, then 3,000 credits ($1.80) per 100,000 [Smarter Testing blog] | None built in; Mergify "Job Selection" skips whole jobs a PR doesn't need [docs.mergify.com/ci-insights] | CircleCI |
| **Merge queue** | No queue of its own. Can build GitHub merge-queue branches via a GitHub App trigger; known bug: blocked if "Prevent unregistered users" is on [circleci.com/changelog/new-trigger-option-pushes-to-merge-queues-available-for-github-app-pipelines; support.circleci.com/en/articles/15090775] | GitHub's own merge queue (group size 1-100, build concurrency 1-100, `merge_group` trigger) [docs.github.com/.../managing-a-merge-queue]; on private repos only for organisations on **Enterprise Cloud** (we qualify) [GitHub docs text via search result; the availability line did not render in my fetch: Unverified on the page itself]. Mergify works with either | GitHub |
| **Linux / macOS hosted** | Linux medium 10 credits/min ($0.006); Mac M4 Pro medium 200 credits/min (**$0.12**) | Linux 2-core $0.006, 4-core $0.012; macOS 3/4-core **$0.062**, M2 Pro $0.102 [GitHub pricing page] | GitHub cheaper on Mac |
| **Self-hosted runners** | Free to Performance users up to 20 concurrent (Scale unlimited); network/storage overage 420 credits/GB [circleci.com/pricing] | Free and unlimited today; a $0.002/min "platform charge" announced for 1 Mar 2026 was **postponed** on 15 Dec 2025 with no new date [github.com/resources/insights/2026-pricing-changes-for-github-actions] | GitHub (today) |
| **Security / compliance** | SOC 2 Type II, FedRAMP tailored, OIDC per job, restricted contexts for secrets [circleci.com/security]; Jan 2023 breach [incident report above] | OIDC short-lived cloud credentials per job [docs.github.com/en/actions/concepts/security/openid-connect]; secrets stay inside GitHub, one less vendor holding them (Inference). GitHub's own SOC reports: not re-read today (Unverified) | GitHub, mainly because one fewer vendor holds our secrets |
| **Ecosystem** | Orbs (reusable config packs) | Marketplace actions; every third-party runner vendor (§4) plugs into Actions with a one-line label change | GitHub |

**Bottom line:** CircleCI's real edge is test tooling (timing split, rerun-only-failed, test selection). GitHub's edge is capacity, the native merge queue, cheaper Mac minutes, and that every faster/cheaper runner vendor plugs into it.

---

## 3. Cost of a PRIVATE repository at our volume

### Assumptions (stated, change any of them and redo the line)

* **Scenario A (the founder's rough numbers):** 40 PRs/day; each PR run = 12 shards × 8 min + browser journeys ~20 job-min = **116 job-min**; batch runs: 40 PRs ÷ batch of 2 = 20 batches, +50% for failed batches retried/split = 30 runs × 116. Day = (40 + 30) × 116 = **8,120 job-min**; month (30 days, agents work every day) = **243,600 job-min**. High case (PRs pushed twice on average): 110 runs × 116 × 30 = **382,800**.
* **Scenario B (measured, 17-18 Nov, last 300 runs, `ci-runners-research-2026-11-18.md`):** shard median 41-46 min, so a full PR run is ~210 job-min and a batch ~445. **15,100 job-min/day = 453,000/month.** After "run tests once" (#2151, about -54%): **6,950/day = 208,500/month.** Scenario B is the honest basis; the founder's 8-minute figure is well below what CI measured.
* **Machine size matters on going private.** On a public repo `ubuntu-latest` is 4 vCPU/16 GB; on a private repo it is **2 vCPU/8 GB** [docs.github.com/en/actions/reference/runners/github-hosted-runners]. Keeping today's speed means paying for **4-core** machines; staying on 2-core makes shards slower (Inference: up to ~2× on CPU-bound tests).
* The 2 self-hosted Macs cost nothing in GitHub minutes today (self-hosted is free). GitHub Enterprise includes **$300/month** of Actions usage [GitHub billing page]. Seat costs of Enterprise are already paid and left out. Storage beyond 50 GB artifacts is left out (small, Unverified).

### Price per minute (read 23 Nov 2026)

| Machine | GitHub Actions | CircleCI (credits × $0.0006) |
|---|---|---|
| Linux 2 vCPU | $0.006 | Docker medium 10 cr = $0.006 |
| Linux 4 vCPU | $0.012 | Docker large / Linux VM large 20 cr = $0.012 |
| Linux 8 vCPU | $0.022 | Docker xlarge 40 cr = $0.024 |
| macOS | $0.062 (3-4 core), $0.102 (M2 Pro) | M4 Pro medium 200 cr = $0.12 |
| Included | Team $18/month, **Enterprise $300/month** | Free and Performance 30,000 credits ($18) |
| Plan fee | (already on Enterprise) | Performance from $15/month, 5 users then $15/user (the page also says 25,000 credits per extra user: conflicting, Unverified); Scale custom, annual |

GitHub sources: docs.github.com/en/billing/reference/actions-runner-pricing; docs.github.com/en/billing/concepts/product-billing/github-actions. Hosted prices fell up to 39% on 1 Jan 2026 [GitHub 2026 pricing page]. CircleCI: circleci.com/pricing and resource-classes page.

### Arithmetic

**GitHub Actions, private repo**

| Case | Job-min/month | 2-core ($0.006) | 4-core ($0.012) |
|---|---|---|---|
| A (founder) | 243,600 | 243,600 × 0.006 = $1,462 − $300 = **$1,162** | $2,923 − $300 = **$2,623** |
| A high | 382,800 | $2,297 − $300 = **$1,997** | $4,594 − $300 = **$4,294** |
| B measured now | 453,000 | $2,718 − $300 = **$2,418** (slower) | $5,436 − $300 = **$5,136** |
| B after "run tests once" | 208,500 | $1,251 − $300 = **$951** (slower) | $2,502 − $300 = **$2,202** |

**CircleCI** (Performance plan, same minutes; credits = minutes × rate; extra credits $15 per 25,000)

| Case | Medium 2 vCPU (10 cr) | Large 4 vCPU (20 cr) |
|---|---|---|
| A | 243,600 × 10 = 2.436 M cr − 30,000 = 2.406 M ÷ 25,000 × $15 = **$1,444** + $15 plan | **~$2,906** |
| B now | **~$2,700** | 453,000 × 20 = 9.06 M cr → **~$5,418** |
| B after #2151 | **~$1,233** | **~$2,484** |

Plus on CircleCI: user seats beyond 5 (how AI-agent identities count is Unverified); Docker layer caching at 200 cr/job would add 29,400-46,200 jobs × $0.12 = **$3,500-5,500/month** if used on every job (Inference: use it only on image-build jobs); paid Smarter Testing usage beyond 10,000 atoms. **Concurrency:** Performance caps at **80** concurrent jobs; we ran 153 jobs with 142 waiting at 13:03 IST today (`STATE.md`), so we would need **Scale (custom price, annual)**. Moving to CircleCI is therefore **no cheaper than GitHub's own machines**, before migration effort.

---

## 4. Alternatives and what each is best at

All "faster runner" vendors below keep GitHub Actions and Mergify as they are: you change `runs-on:` to their label. They register as **self-hosted runners** in GitHub (see `ci-runners-research-2026-11-18.md`), so if GitHub ever revives the postponed $0.002/min self-hosted charge, add $0.002/min to their price (Inference from the GitHub announcement).

| Option | Price per minute (read 23 Nov 2026) | Claimed speed | Best at | Monthly, Scenario B at 4 vCPU (now / after #2151), Inference |
|---|---|---|---|---|
| **Blacksmith** [blacksmith.sh/pricing; docs.blacksmith.sh] | Ubuntu x64 $0.004 per 2-vCPU minute (4 vCPU = $0.008, assuming linear: the docs give rates relative to a 2-vCPU minute); Arm $0.0025; macOS M4 $0.08; 3,000 free 2-vCPU min/month; Docker layer cache and sticky disks +$0.50/GB-month | "2x faster than GitHub's runners", "4x faster cache downloads" | Fastest managed swap, good caching, no concurrency cap stated; SOC 2 not on the pages read (Unverified) | **$3,612 / $1,656** |
| **WarpBuild** [warpbuild.com/pricing] | x64 2/4/8/16 vCPU $0.004/0.008/0.016/0.032; Arm from $0.003; macOS M4/M5 Pro $0.08; BYOC (runs in your AWS/GCP/Azure) $0.002 + your cloud bill | "2x faster builds", "50% cheaper" | Managed or in your own cloud account | **$3,624 / $1,668** (managed) |
| **Ubicloud** [ubicloud.com/docs/about/pricing] | Standard x64 2/4/8/16 vCPU $0.00125/0.0025/0.005/0.010; Premium $0.002/0.004/0.008/0.016; Arm same as standard; $2.50/month free credit | "10x cheaper" than GitHub (marketing; at today's GitHub prices it is ~5x on 4 vCPU, Inference); no speed figure | **Cheapest managed** option | **$1,130 / $519** (standard) |
| **Namespace** [namespace.so/pricing] | 2/4/8/16 vCPU prepaid $0.002/0.004/0.008/0.016, overage $0.003/0.006/0.012/0.024; macOS from $0.04; Team $100 (100,000 unit-min), Business $250 (250,000) | No figure; strong caching | Fast cache volumes, Mac at low price; Business caps 160 vCPU = 40 jobs (18 Nov research), too few for our peak | ~$2,600 / ~$1,130 (Business) |
| **Depot** [depot.dev/pricing; depot.dev/docs/github-actions/overview] | $0.006 per 2-vCPU minute after included; Startup $200/month with 20,000 min; larger sizes use minutes faster "via multipliers" (values not shown) | "up to 3x faster", "10x faster caching" | Docker image builds plus runners | ~$5,400 / ~$2,500 (assuming 2× multiplier at 4 vCPU, Unverified) |
| **RunsOn** [runs-on.com/pricing] | Runs in **our own AWS account**: no compute markup; spot 2/4/8/16 vCPU ≈ $0.0008/0.0012/0.0023/0.0034 per min (us-east-1, incl. 30 GB disk); licence €300/yr (<50k jobs/month) to €900/yr (<200k); AWS control plane ~$7/month | No wall-clock figure; CPU benchmark +44% to +68% vs GitHub | **Cheapest overall at scale**, but needs an AWS account and quotas (our quota request to 160 vCPU was pending on 19 Nov) | **~$545 / ~$250** + licence (~€25-75/month) |
| **Buildkite** [buildkite.com/pricing] | Pro $30 per active user/month; hosted Linux $0.004 per vCPU-min (4 vCPU $0.016); hosted Mac $0.02 per vCPU-min; self-hosted agents 10 included then $3.50/agent/month; Test Engine 1M test runs included then $15/M | No figure | Very large teams that want their own machines with a strong control plane and test analytics; also a full migration away from Actions | ~$7,200 / ~$3,300 hosted, plus users |
| **GitLab CI** [about.gitlab.com/pricing] | Premium $29/user/month (10,000 compute min/user), Ultimate custom (50,000); extra minutes $10 per 1,000 | No figure | Teams moving code hosting too; merge trains (GitLab's merge queue: plan tier not shown on the page, Unverified) | Not sensible: needs moving the repo off GitHub |

The cheapest-machine options (AWS/Google Cloud spot, Hetzner) were priced on 19 Nov in `ci-cloud-cost-research-2026-11-19.md`.

---

## 5. Does GitHub lack anything material?

* **Has:** its own merge queue (usable on private repos because we are on Enterprise Cloud), larger runners up to 16+ cores and Arm, 500 concurrent standard jobs on Enterprise (1,000 on larger runners), OIDC, re-run failed jobs.
* **Lacks, and it matters for us:**
  1. **Timing-based test splitting**: only count-based splitting by each test tool; we must build or adopt timing balance ourselves (unequal shards make the whole run wait for the slowest).
  2. **Rerun only failed tests**: GitHub reruns the whole shard (~40 min measured), not the 2 failed tests.
  3. **Flaky-test detection and test analytics**: none built in; Mergify CI Insights (already paid for in our tooling) covers it.
  4. **Test impact analysis**: none built in.
* **Not a GitHub gap but our account's:** the 18 Nov research found the Enterprise **trial** excludes increased job concurrency; only GitHub Support can lift it. Waiting for machines (PR wait median 16 min, p90 69 min; 142 jobs waiting today) is that cap plus our heavy shards, not a missing feature.

---

## 6. Recommendation

**Stay on GitHub Actions with Mergify. Do not move to CircleCI.** CircleCI would cost the same per minute as GitHub's own machines (~$2,500-5,400/month on 4 vCPU), needs the custom Scale plan for our 150+ concurrent jobs, adds a vendor that holds our secrets (2023 breach), and needs a full config rewrite while ~35 PRs/day keep merging. Its advantages are test-tooling features we can copy on GitHub.

**What to adopt, in this order (Inference, each goes through `STANDARDS.md` §1 technology gate):**
1. **Cut minutes first:** land "run tests once" (#2151, about -54% of minutes) and balance shards by recorded timings (save each shard's JUnit timings as a CI artifact/cache and assign test files greedily by time). This halves every price below.
2. **Turn on Mergify CI Insights flaky-test detection and Auto-Retry** (included in every Mergify plan): fewer red batches, fewer whole-batch retries.
3. **Move the Linux shards to a third-party runner** with a one-line label change, after a one-week side-by-side on real runs: **Ubicloud** if cost leads (cheapest managed, ~$520/month after #2151), **Blacksmith** if speed leads (claims 2x, ~$1,660/month after #2151). Measure wall time and cost per merged PR, then pick. RunsOn on AWS is cheapest (~$250/month) but is a project, not a label change.
4. **Ask GitHub Support to lift the concurrency cap** (free; already ranked first on 18 Nov).

**Is going private affordable? Yes,** if done after step 1. Monthly Actions bill for the Linux shards (Scenario B, 4 vCPU to keep today's speed, Enterprise $300 credit applied):

| Runner choice | Now (453k job-min) | After "run tests once" (208.5k) |
|---|---|---|
| GitHub 4-core larger runners | ~$5,136 | ~$2,202 |
| GitHub 2-core standard (slower shards) | ~$2,418 | ~$951 |
| Blacksmith 4 vCPU | ~$3,612 | ~$1,656 |
| **Ubicloud 4 vCPU (recommended start)** | **~$1,130** | **~$519** |
| RunsOn spot on own AWS | ~$545 + licence | ~$250 + licence |
| CircleCI Large (for comparison) | ~$5,418 + Scale plan | ~$2,484 + Scale plan |

Self-hosted Macs stay free while GitHub's self-hosted charge is postponed; if it returns at $0.002/min, third-party runners would add ~$420-910/month at these volumes (Inference: 208,500-453,000 × $0.002). Mergify private-repo pricing: free up to 5 active contributors, then $21 per seat/month [mergify.com/pricing]; how bot/agent identities are counted is Unverified, so check before switching.

**What to learn from CircleCI:** split tests by measured time, not by count; rerun only the failed tests, not the whole shard; track flaky tests automatically and retry or quarantine them; run only the tests a change can affect; and size machines to the job instead of one size for all.

---

## Sources (all read 23 Nov 2026 unless stated)

* GitHub runner prices: https://docs.github.com/en/billing/reference/actions-runner-pricing
* GitHub Actions billing and included usage: https://docs.github.com/en/billing/concepts/product-billing/github-actions
* GitHub 2026 pricing changes and postponement: https://github.com/resources/insights/2026-pricing-changes-for-github-actions
* GitHub limits: https://docs.github.com/en/actions/reference/limits
* GitHub runner specs (public vs private): https://docs.github.com/en/actions/reference/runners/github-hosted-runners
* GitHub merge queue settings: https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue
* GitHub re-runs: https://docs.github.com/en/actions/how-tos/manage-workflow-runs/re-run-workflows-and-jobs
* GitHub OIDC: https://docs.github.com/en/actions/concepts/security/openid-connect
* Docker gha cache: https://docs.docker.com/build/cache/backends/gha/
* CircleCI pricing: https://circleci.com/pricing/ ; resource classes: https://circleci.com/product/features/resource-classes/
* CircleCI test splitting: https://circleci.com/docs/guides/optimize/parallelism-faster-jobs/ ; rerun failed tests: https://circleci.com/docs/guides/test/rerun-failed-tests/
* CircleCI Smarter Testing: https://circleci.com/blog/smarter-testing-stop-running-tests-that-dont-matter/
* CircleCI merge queue trigger: https://circleci.com/changelog/new-trigger-option-pushes-to-merge-queues-available-for-github-app-pipelines ; https://support.circleci.com/en/articles/15090775-github-merge-queue-compatibility-with-circleci
* CircleCI security: https://circleci.com/security/ ; 2023 incident: https://circleci.com/blog/jan-4-2023-incident-report
* Mergify pricing: https://mergify.com/pricing ; CI Insights: https://docs.mergify.com/ci-insights/
* Blacksmith: https://www.blacksmith.sh/pricing ; https://docs.blacksmith.sh/blacksmith-runners/overview
* WarpBuild: https://www.warpbuild.com/pricing
* Ubicloud: https://ubicloud.com/docs/about/pricing ; https://www.ubicloud.com/docs/github-actions-integration/runner-types
* Namespace: https://namespace.so/pricing
* Depot: https://depot.dev/pricing ; https://depot.dev/docs/github-actions/overview
* RunsOn: https://runs-on.com/pricing/
* Buildkite: https://buildkite.com/pricing
* GitLab: https://about.gitlab.com/pricing/
* Internal: `ci-runners-research-2026-11-18.md`, `ci-cloud-cost-research-2026-11-19.md`, `STATE.md` (origin/main as fetched locally, 23 Nov)
