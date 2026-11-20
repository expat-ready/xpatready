# Faster merging: tools research (19 Nov 2026)

Read-only research. Every source was read on **19 Nov 2026**. Quotes are short phrases from each vendor's own page. Anything I could not confirm on an official page is marked **unverified**. Time effects are estimates from how each tool works, not measured on our repository.

## Main finding (in plain words)

The founder wants independent lanes: a change to one code area should not wait behind, or be thrown out because of, a change to another area. **Mergify, the tool we already pay for, has this feature.** It is called *parallel mode with scopes*, and its docs describe it as "each scope is a lane". The pain we measured comes mostly from how the queue is set up, not from the tool itself:

- We run one shared queue in which every batch is tested on top of every other. That is why one failure cancels and re-runs the batches behind it.
- Shared files (records, `demo.ts`, the schema) touched by most PRs place every PR in every lane, so the lanes collapse back into one line.
- Every batch runs the full 35–50 minute test suite, even when only one area changed.

Each of the three alternatives that offer lanes (Trunk, Aviator, Graphite) also needs the "which area does this PR touch" signal. None of them fixes the shared-files problem alone.

---

## A) Merge queues

| Tool | Independent lanes per code area | Failure isolation | Batching and bisection | Stacked PRs | GitHub Enterprise Cloud | Price for 5–10 seats; bots | Effort to move from Mergify |
|---|---|---|---|---|---|---|---|
| **Mergify** (current) | **Yes.** Scopes come from file patterns or from our own upload; "each scope is a lane" | A batch depends only on batches in its own scopes; on failure it "splits it to find the pull request that broke it", and only the batches stacked on that one re-run | Yes: batch sizes from a minimum to a maximum, automatic bisection, `skip_intermediate_results` | Partial: Mergify has a stacks feature (**unverified** depth) | Yes, a GitHub App (we already run it) | Free up to 5 users; Max plan $21 per seat per month; bots "don't count" | **None.** A change to `.mergify.yml` |
| GitHub native merge queue | **No.** One queue per branch; path lanes are not documented | A failing PR is removed and later groups are rebuilt, so every failure rebuilds the queue behind it | Groups of 1–100 PRs; bisection not documented | No | Yes. Available on GHEC private repos (GA changelog, 2023) | Included in the plan | Medium: remove Mergify, change rules, add `merge_group` triggers. **A step back for lanes.** |
| Graphite | **No** partitions documented | In batching (private beta), finds the bad stack through parallel isolation or bisection | Batching is in private beta | **Yes, the strongest.** The queue is "stack-aware" | GHES is listed; GHEC **unverified** | Team plan $40 per user per month for the merge queue (basic); advanced settings on Enterprise | High: new CLI and workflow for agents; not compatible with the GitHub queue |
| Aviator MergeQueue | **Yes.** Affected targets make "logically independent queues" | In parallel mode the bot "closes all subsequent Draft PRs and restarts the queue" (a full restart, no bisection documented) | Optimistic parallel builds; batching is listed on pricing; bisection not documented | Yes (Aviator stacked PRs CLI, **unverified** detail) | **Unverified** | Team $20 per developer per month (parallel mode); affected targets need Scale at $50 per developer per month | Medium-high: new bot, labels and config; targets uploaded by us |
| Trunk Merge Queue | **Yes.** Parallel mode will "track impacted code of each pull request to create dynamic queues" | Bisection "splits the batch in half"; passing PRs still merge; a failure can be held while later PRs test | Yes: batching, bisection, separate bisection concurrency, skip redundant retests | No (**unverified**) | Yes, a GitHub App (GHEC **unverified** explicitly) | Pricing page shows Free up to 5 committers and a $0 Team tier; **unverified** whether that covers the merge queue at our volume | Medium: new app; we must upload impacted targets for every PR (API `PUT /v2/impacted-targets`); a PR that touches "ALL" serialises the queue |
| Others | Bors and Zuul (self-run, old; not recommended); GitLab merge trains (would mean leaving GitHub) | — | — | — | — | — | Not worth it |

Sources:
- Mergify scopes: https://docs.mergify.com/merge-queue/scopes/ ("each scope is a lane")
- Mergify parallel checks: https://docs.mergify.com/merge-queue/parallel-checks/
- Mergify batches: https://docs.mergify.com/merge-queue/batches/ ("splits it to find the pull request that broke it")
- Mergify pricing: https://mergify.com/pricing ("bots … don't count")
- GitHub merge queue: https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue ("automatically removes")
- GitHub GA changelog: https://github.blog/changelog/2023-07-12-pull-request-merge-queue-is-now-generally-available/
- Graphite merge queue: https://graphite.com/docs/graphite-merge-queue ("stack-aware")
- Graphite optimizations: https://www.graphite.com/docs/merge-queue-optimizations
- Graphite pricing: https://graphite.com/pricing
- Aviator affected targets: https://docs.aviator.co/mergequeue/concepts/affected-targets ("logically independent queues")
- Aviator parallel mode: https://docs.aviator.co/mergequeue/concepts/parallel-mode
- Aviator pricing: https://www.aviator.co/pricing
- Trunk parallel queues: https://docs.trunk.io/merge-queue/optimizations/parallel-queues
- Trunk batching: https://docs.trunk.io/merge-queue/optimizations/batching ("splits the batch in half")
- Trunk impacted-targets API: https://docs.trunk.io/merge-queue/optimizations/parallel-queues/api
- Trunk pricing: https://trunk.io/pricing

## B) Faster CI runners

| Runner | Speed claim (vendor's own) | Caching | Postgres as a service container | Price per minute (Linux x64) | Setup effort |
|---|---|---|---|---|---|
| **Namespace** (E12 trial) | Caches on local storage, so "they are even faster" | Cache volumes (persistent `node_modules` and pnpm store), Docker build cache, Bazel cache | Yes: full VMs with Docker (**unverified** on the page read; we can confirm in E12) | 1 unit = 1 vCPU and 2 GB. 4 vCPU = $0.004 prepaid, $0.006 overage; Team plan $100 per month includes 100,000 unit minutes | Low: GitHub App plus a `runs-on` label (we are already in a trial) |
| **Blacksmith** | "2x faster hardware", "4x faster cache downloads" | `actions/cache` redirected to its own cache with no change, 25 GB per repository per week free; Docker layer cache and sticky disks at $0.50 per GB per month | Docker available; service containers not stated (**unverified**) | $0.004 for x64 (size at that price **unverified**; it is probably the 2 vCPU rate); 3,000 free minutes per month | Low: GitHub App plus a label swap (`blacksmith-2vcpu-ubuntu-2604`), or its migration wizard |
| **Depot** | No number given; "Faster GitHub Actions cache" | Actions cache, plus best-in-class Docker build cache (NVMe cache disks) | **Unverified** | $0.006 for 2 vCPU; Startup plan $200 per month includes 20,000 minutes | Low: label swap |
| **BuildJet** | — | — | — | — | **Do not use.** It announced its shutdown on 6 Feb 2026 and stopped running jobs on 31 Mar 2026 (third-party reports; BuildJet's own pricing page still shows prices) |
| **Ubicloud** | "Change 1 line. Go twice as fast." | 30 GB (Standard) or 100 GB (Premium) of free cache; Docker caching not stated | **Unverified** | 4 vCPU $0.0025 (Standard) or $0.0040 (Premium); 1,250 free minutes | Low: one-line change; a younger company (risk) |
| **GitHub larger runners** | No speed claim; billed "only at the per-minute rate" | Standard GitHub cache only (slower, with an eviction limit) | Yes, full support | 2-core $0.006, 4-core $0.012, 8-core $0.022, 16-core $0.042 | Lowest: a runner group plus a label; no new vendor |

Sources:
- Namespace pricing: https://namespace.so/pricing
- Blacksmith pricing: https://blacksmith.sh/pricing
- Blacksmith quickstart: https://docs.blacksmith.sh/introduction/quickstart
- Depot pricing: https://depot.dev/pricing
- BuildJet pricing: https://buildjet.com/for-github-actions/pricing
- Ubicloud: https://www.ubicloud.com/use-cases/github-actions
- GitHub runner prices: https://docs.github.com/en/billing/reference/actions-runner-pricing
- BuildJet shutdown (third party, read 19 Nov 2026): https://runs-on.com/blog/buildjet-shutting-down-runson-alternative/
- GitHub announced a $0.002 per minute charge for self-hosted runners on 16 Dec 2025, then reportedly suspended it (https://github.blog/changelog/2025-12-16-coming-soon-simpler-pricing-and-a-better-experience-for-github-actions/). Its current status is **unverified**. It does not affect hosted vendors such as Namespace or Blacksmith; whether it covers third-party hosted runners is **unverified**.

## C) Run only the affected tests

| Tool | How it picks tests | Fit for our TypeScript monorepo (no Nx today) | Cost | Effort |
|---|---|---|---|---|
| **Turborepo `--affected`** | Selects packages "changed on the current branch" plus their dependents; task-level selection behind a flag | Good if the app is split into workspace packages (api, web, shared). If it is one package today, the gain is small until we split it | Free, open source | Low-medium: add `turbo.json`, mark test tasks, need full git history (`fetch-depth: 0`) |
| **Nx affected** | File-level: "Nx selects a task when your change touches one of its inputs" | Strong project graph (it understands NestJS and React), but means adopting Nx as a build tool; that needs a technology-gate review (STANDARDS §1) | Free core; Nx Cloud paid (not needed) | Medium: `nx init`, project config; migration path not on the page read (**unverified**) |
| **Trunk or Aviator impacted targets** | These only build the queue lanes; we must compute the targets ourselves (folders, or the output of Turbo or Nx) | Useful only if we move to their queue; Mergify scopes do the same job with file patterns | Part of the queue price | Same work as Mergify scopes |
| **CloudBees Smart Tests (formerly Launchable)** | A machine-learning model picks a subset of tests likely to fail; supports Jest | Weak fit for now: it needs test history to learn from, and it is a sample rather than a proof, so it suits pre-merge checks, not the final gate | Quote only (AWS Marketplace contract); **unverified** | Medium: CLI in CI, upload of results; a new outside vendor with our test data |
| **Our own path filter** (no new tool) | Map folders to test groups in the workflow (for example a GitHub paths filter step) | Best first step: no new technology, and the same mapping feeds Mergify scopes | Free | Low |

Sources:
- Nx affected: https://nx.dev/docs/features/ci-features/affected
- Turborepo run reference: https://turborepo.dev/docs/reference/run
- CloudBees Smart Tests: https://www.cloudbees.com/blog/how-cloudbees-smart-tests-works and https://docs.cloudbees.com/docs/cloudbees-smart-tests/latest/features/predictive-test-selection/use-cases-for-predictive-test-selection (the pricing figure came from the AWS Marketplace listing, https://aws.amazon.com/marketplace/pp/prodview-mi3tgu7krlo5a)

---

## Recommendation

### A) Merge queue: keep Mergify and switch on parallel mode with scopes (Max plan)
- **Effect on time-to-merge (estimate):** a failure only re-runs its own lane. PRs that touch one area (screens, forms, runtime, evidence) stop waiting behind other lanes. With four or five lanes, a typical PR could wait about 1–2 test runs instead of several hours, *provided* shared files stop putting PRs into every lane. Without that fix the gain is close to zero.
- **Cost:** $21 per seat per month for active human committers; bots are free. For 5–10 people that is $105–210 per month; if only 1–2 humans commit, it is near zero. Whether scopes and parallel mode need the Max plan rather than the free plan is **unverified**; confirm with Mergify.
- **Effort:** low, 0.5–1 day. Write the scope file patterns and a rule for shared files.
- **Risks:**
  1. Records and shared files (STATE, BACKLOG, `demo.ts`, the Prisma schema) put every PR into every scope. Keep records out of product PRs (a records-only scope with no tests), and send schema changes through their own lane.
  2. A green lane can still break main when two scopes are wrong about their dependencies. Mitigation: a nightly full run on main, triggered from outside GitHub's scheduler if scheduled runs keep being dropped.
  3. Moving to Trunk or Aviator gives the same model with more migration work and new vendor risk. Only consider it if Mergify parallel mode fails a one-week trial.

### B) Runners: Namespace if the E12 trial holds up; otherwise Blacksmith
- **Effect (vendor claims, unverified for us):** faster processors plus persistent `node_modules` and Docker caches could cut a 35–50 minute batch to roughly 15–30 minutes. Most of that comes from dependency install and cache restore, not from the tests themselves.
- **Cost:** Namespace about $0.004–0.006 per minute at 4 vCPU (the $100 per month Team plan likely covers our volume). Blacksmith $0.004 per minute with 3,000 free minutes. Both cost less than GitHub's $0.012 per minute for 4 cores.
- **Effort:** low. A label change per job; Postgres runs as a service container as today (**unverified** until we test it in E12).
- **Risks:** a small vendor could shut down (BuildJet did in 2026). Keep the label in one variable so we can switch back to GitHub runners in minutes.

### C) Affected tests: our own folder-to-test mapping now; Turborepo later
- **Effect (estimate):** a PR that touches one area runs only that area's tests plus a short smoke set. That could cut a batch from 35–50 minutes to 10–20 minutes for single-area PRs. The full suite still runs on main nightly and on PRs that touch shared code.
- **Cost:** free.
- **Effort:** low for the mapping (1 day). Turborepo would add 1–3 days and depends on the app being split into packages; it needs the STANDARDS §1 gate.
- **Risks:** a missed dependency lets a break through to main. Mitigation: shared code always maps to "all tests", and the nightly full run is the backstop. Nx and CloudBees are not worth the new technology now.

### Not a tool problem
Dropped scheduled runs after the org move is a GitHub behaviour, and the cause is **unverified**. Possible causes: schedules being re-registered, or being disabled after inactivity. Changing queue or runner vendor will not fix it. Re-save the workflow on `main`, or trigger the run from an outside scheduler through `workflow_dispatch`.

---

## 5-line plan, in order

1. Take records and shared files out of product PRs, and give the schema its own lane, so PRs stop touching every area.
2. Switch Mergify to parallel mode with four or five scopes (screens, forms, runtime, evidence, records), set by file patterns.
3. Map each scope to its own test group in CI, so a PR runs only its area's tests plus a smoke set. Shared code runs everything, and a full nightly run on main is the backstop.
4. Finish the Namespace E12 trial on the same jobs. Keep it if a batch drops below 25 minutes with Postgres working; otherwise trial Blacksmith for one week.
5. After two weeks, measure time-to-merge and how often lanes block each other. Only then consider Trunk or Aviator, or Turborepo through the technology gate.
