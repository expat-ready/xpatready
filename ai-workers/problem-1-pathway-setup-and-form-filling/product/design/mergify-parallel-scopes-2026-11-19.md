# Mergify parallel mode with module scopes (design, 19 Nov 2026)

Asked by Lead 84 after P-712, because the founder wants independent lanes. Paused by P-716, then unpaused by the founder's P-717 (19 Nov ~07:3x IST) as the one exception: pipeline work takes effect at once through its own lane, which never blocks product merges. Built by the PR that carries this page; the tech lead reads `.mergify.yml` before the label (P-423). P-502: evidence, a named method, then the change.

## What P-717 added (Lead 85, 19 Nov)
- **(a) A pipeline lane.** Pipeline PRs (checks, workflows, Mergify, tools, agent rules) get their own lane and are never batched with product; records keep the `records` queue.
  - *Queue:* a fourth queue, `pipeline`, after `product` in priority, takes a PR **every one of whose files** is a pipeline path: `.github/`, `.githooks/`, `.mergify.yml`, `.claude/`, `AGENTS.md`, `CLAUDE.md`, `product/tools/`.
  - *Scope:* the scope `pipeline` (capacity 1) keeps such batches apart from the module scopes.
  - *Mixed PRs:* a PR with any other file stays in `product` (or `records`), because one pattern is shared by both queues and `check-mergify-scopes.sh` checks that they match.
  - *`ci.yml` is not a barrier.* A product batch already tested under the old `ci.yml` merges safely, and the next batch tests the new one. Making it a barrier would hold every product PR behind each workflow change, which P-717 forbids.
- **(b) A report-only start.** A new or changed blocking check runs report-only for its first 24 h or 10 PR runs, and turns blocking only if it ran clean. It covers a stricter step added inside the existing `ci` job too (review, round 1): such a step starts as `continue-on-error: true`, or report-only by its own flag, for the same 24 h or 10 runs, because `ci.yml` is no barrier and a parallel product batch could otherwise meet it unannounced. Mergify has no time-based condition, so in the config this means: such a check joins no `queue_conditions` or `merge_conditions` in `.mergify.yml`, and no required check in the ruleset, until then. The tech lead adds it afterwards in its own pipeline PR. The rule is written as a comment above `scopes:` in `.mergify.yml`.
- **(c) #2112** (the #2086 follow-up, parked) resumes in the pipeline lane once this merges.

## Why, measured (19 Nov, 07:2x IST)
- **Batches fail often.** In the last 72 h, 118 merge-queue batch PRs ran `ci`: 71 success, **47 failure (40%)**. In serial mode a failed batch resets every batch behind it, whatever modules they touch. The P95 wait from approved to merged was 481 min (heartbeat run 44410296821).
- **The open PRs would split this way** (37 open, batch PRs excluded; scopes as proposed below):

  | Group | PRs | In parallel mode |
  |---|---|---|
  | Barrier | 4 (`.mergify.yml`, `ci.yml`, `audit.prisma`, `api/src/main.ts`); under P-717 the first two go to the pipeline lane instead | the queue serializes at them |
  | No module scope | 12 (records, tools, other workflow files) | batched only with each other: a lane of their own |
  | One module scope | 8 | each module tests and merges at the same time |
  | Several module scopes | 1 (#2195, which touches all 15 cards) | tested on top of each of its scopes |
  | A migration (plus their modules) | 12 | serial among themselves (capacity 1), in parallel with the rest |

  Today all of them form one chain.

## Preconditions, checked
| Check | Result | Source |
|---|---|---|
| Fast-forward not used | every queue has `merge_method: merge` (parallel mode rejects fast-forward) | `.mergify.yml` on main; Mergify [queue modes](https://docs.mergify.com/merge-queue/queue-modes) |
| "Require up to date" off | main's `required_status_checks` has `strict_required_status_checks_policy: false` | `GET rules/branches/main` |
| Plan supports parallel mode and scopes | **not confirmed**. [Pricing](https://mergify.com/pricing) says every plan has the Merge Queue and lists "Scopes" and "Parallel Checks" rows, but the tier for each is not readable from the page. The PR's own Mergify configuration check is the test: if the plan refuses the keys, that check fails before any label, and nothing changes. | Mergify pricing |
| queue-gate and label-guard still hold | Unchanged: `review: approved`, Mergify's `queued` label, `queue-fresh` on the product queue. Batch PRs are still Mergify's draft PRs; label-guard's sweep, the heartbeat and module-cards key on the branch prefix `mergify/merge-queue/`, to be confirmed on the first parallel batch. | `label-guard.yml`, `queue-gate.yml`, `pipeline-heartbeat.py` |
| Named queues (verdicts > product > records) | **not documented for parallel mode.** The docs' examples use one queue rule. A batch never jumps "ahead of a higher priority" ([batches](https://docs.mergify.com/merge-queue/batches)). Kept as they are; watched in the trial. | Mergify docs |

## The change: one PR to `.mergify.yml`
```yaml
merge_queue:
  mode: parallel
  max_parallel_checks: 3
scopes:
  source:
    files:   # the fenced modules: the cards' own `paths:` (product/tools/module-cards.py), plus each module's schema file
      platform:      { include: [studio/api/src/platform/**, studio/prisma/schema/platform.prisma, studio/prisma/schema/platform-*.prisma] }
      front-office:  { include: [studio/api/src/front-office/**, studio/prisma/schema/front-office-*.prisma] }
      money:         { include: [studio/api/src/client-money/**, studio/prisma/schema/client-money.prisma] }
      case-side:     { include: [the api-cases card's file list, studio/prisma/schema/{cases,case-search,filings,evidence,submission,review}.prisma] }
      forms-engine:  { include: [the api-forms card's file list, packages/xfa-engine/**, .github/workflows/xfa-engine.yml, studio/prisma/schema/{forms,answers}.prisma] }
      migrations:    { include: [studio/prisma/migrations/**] }
      pipeline:      { include: [.github/**, .githooks/**, .mergify.yml, .claude/**, AGENTS.md, CLAUDE.md, product/tools/**] }   # P-717 (a)
  barrier_files:
    include: ["**/package.json", "**/package-lock.json", .nvmrc, tsconfig.base.json,
              studio/{api,web}/tsconfig.json, studio/prisma/schema/{base,links,extension,audit}.prisma,
              studio/prisma/migrations/migration_lock.toml, studio/api/src/{main,core,studio}.ts]
  capacities: { money: 1, migrations: 1, pipeline: 1 }
queue_rules:   # each of verdicts, product, pipeline (new, P-717 (a)), records
  batch_size: 2                                # was 6: a failure bounces at most one innocent PR
  batch_max_failure_resolution_attempts: 2     # then dequeue, not endless splits
```
`studio/` stands for `ai-workers/problem-1-pathway-setup-and-form-filling/prototype/studio/`. The PR uses full paths, plus a test in `check-guards.sh` style that every scope's pattern matches at least one file on main.

**Why migrations get a capacity-1 scope rather than a barrier.** The queue-gate measurement (`design/merge-queue-causes-2026-11-16.md`): a PR failed in the queue 60% of the time when a second migration merged after its `ci` started. So migrations must not test past each other. As a barrier, they would also stall every module that adds none.

## Risk and how it is watched
- **The scope-less lane is the largest cross-scope risk** (review, round 1). A PR in no scope is batched only with other scope-less PRs, and that lane runs in parallel with the module lanes without being tested on top of them. It holds: all of `studio/web/`; the unfenced `api/src` files (demo, features, configuration, library, ai-runs); `tests/`; `engine/`; and the unscoped schema files (pathways, library, governance, proposals, testing). A break between one of those and a module batch shows on main, in the next batch or in the nightly. The 48 h trial counts red `ci` on main for exactly this.
- **Cross-module breaks.** Two scopes' batches are each tested without the other's change. A real cross-module break shows only on main, in the next batch or the nightly. The barrier list holds the known shared seams; `features/` adds one file per feature, so it is not a seam.
- **Trial measure.** The trial runs 48 h. The heartbeat already reports the P95 queue wait and the batch wait; I also count red batches per scope and any red `ci` on main.
- **Undo.** Set `mode: serial` (one line, through the Lead) if main goes red from a cross-scope pair, or the P95 wait does not fall.

## Recommendation (as built)
Build it as one PR, with the Mergify config check as the plan test. If that check refuses `mode: parallel` or `scopes`, stop and ask the founder about the plan (Mergify's dashboard, Plan page). Do not change the queue to fit a missing plan.
