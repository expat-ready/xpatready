# QA-645 review: deploy-synth also runs on every push to main (P-339)

Reviewer: a fresh Opus reviewer that did not build this. Commit reviewed: `c52b96fa23bd825456f4e38cd986bf5c3205fea2` on `claude/clever-galileo-na9hzn`, PR #2911 (`git diff origin/main...c52b96fa2`, 2 files: `.github/workflows/deploy-synth.yml`, `studio/deploy/cdk/test/estate.test.ts`). Merge base is main `01841047d`. Row: `qa/BUGS.md` QA-645. Check-only change: there is no screen and no app code, so there is no journey score and no app was started. No live AI, US$0.

**Verdict: Approve.** No Blocker and no Major. There are 2 Minors and neither holds the merge.

## What I ran
* `cd studio/deploy/cdk && npm ci --ignore-scripts --no-audit --no-fund && npm test`: 110/110 pass, exit 0.
* **25 broken versions of the workflow** against the guard test (`node --test --test-name-pattern="PF-8a the CI job"`). The workflow file was restored after each one and is byte-identical to `c52b96fa2` (checked with `cmp`). 23 were caught and 2 were missed (see below).
* `bash product/tools/check-mergify-scopes.sh`: `PASS mergify scopes: 97 checks`, exit 0.
* `python3 product/tools/write-token.py`: `22 workflows, 0 findings`. `node product/tools/ci-and-lists.mjs`: no hidden red in 22 workflow files.
* GitHub, read-only:
  * The check runs on `c52b96fa2`. `deploy-synth` run 44988476390 is `skipped` because the PR is a draft. That run proves GitHub parsed the new file and evaluated the `if:`.
  * CodeQL on this commit says "No new alerts in code changed by this pull request", and `Analyze (actions)` passed.
  * The `main` branch rules require only `ci`.
  * `item-proof` push runs on main, for example 44983583045 on `01841047d`, whose committer is GitHub and author `mergify[bot]` ("Merge pull request #2900").
  * Recent `deploy-synth` timings: 44959373614 took 62 s; run 44887503333 has `run_duration_ms` 61000.

## 1. GitHub Actions behaviour
* **A merge by Mergify starts the job.** Only pushes made with `GITHUB_TOKEN` start no workflow. Mergify merges with its App token. The evidence is the existing `on: push: branches: [main]` workflow `item-proof.yml`, which has a push run (44983583045) on Mergify's merge commit `01841047d`. `.mergify.yml` uses `merge_method: merge` in every queue, so each merged PR is its own push, and each head of main gets its own run.
* **Batch branches do not trigger a push run.** `push.branches: [main]` with no `tags:` key, so a tag push or a push to `mergify/merge-queue/*` starts nothing. Batch PRs are drafts, and the `pull_request` side still skips them: `deploy-synth` run 44960448070 on `mergify/merge-queue/07acfa0dd0` was `skipped`.
* **`if:` is right for both events.** On `push`, `github.event_name == 'push'` is true. On `pull_request`, the old draft test is unchanged. Side note: the old `if:` alone would also have passed on push, because GitHub compares loosely and `null == false` becomes `0 == 0`. The explicit form is still the better choice because it does not depend on that coercion.
* **The concurrency group is right.** `deploy-synth-${{ github.event.pull_request.number || github.sha }}` evaluates to `deploy-synth-<sha>` on push, so every main commit has its own group. A waiting run is never replaced by a newer one, and `cancel-in-progress` stays false. A PR number and a 40-character hex sha cannot collide. A re-run stays in the same run.
  * Pre-existing, not changed by this PR: on `pull_request`, GitHub still keeps only one *pending* run per PR group and drops older pending ones. This is the same wording problem `item-proof.yml:194` documents. The new comment "(P-371: no run is cancelled)" is true for push runs only.
* **Nothing in the job depends on `pull_request`.**
  * `actions/checkout@v4` uses its default ref, which on push is `github.sha` on `refs/heads/main`.
  * `setup-node` reads `node-version-file: .nvmrc` at the repo root, which exists. Only `run:` steps use the working directory.
  * `cache-dependency-path` exists. The `npm ci`, `audit`, `synth` and `test` steps read no event field.

## 2. Security (public repository)
* `permissions: contents: read` applies to the whole workflow and no job widens it. No `secrets.*` and no AWS key or OIDC token are used. `persist-credentials: false` is set. The guard test still pins all of these.
* **A push run is main's code.** The workflow file and the checkout both come from the pushed main commit, so a PR cannot change what a push run does until it has been reviewed and merged. This is safer than the `pull_request` side, where the PR's own copy of the file runs. `write-token.py` treats push-to-main as main's code, and it finds nothing.
* **Cache.** The push run's `setup-node` `cache: npm` now saves a main-scope cache that PR runs can restore. In the repo's own threat model (#2133, `walks.yml:116`, `item-proof.yml:24`) the risk is caching while *non-main* code runs in main's scope. That is not the case here: the run uses a plain checkout of main and installs from the lockfile with `--ignore-scripts`, and `npm ci` checks every tarball's integrity against the lockfile. CodeQL's Actions analysis raised no new alert. I see no loosening.

## 3. The guard test
It now pins:
* the two trigger names, in order;
* the exact `push:` block (`branches: [main]`, last in `on:`, so no path filter can sit under it);
* exactly one `push:`;
* no `branches-ignore`/`tags:`;
* the exact `if:` line;
* the exact concurrency group with `cancel-in-progress: false`.

The old test did not pin the draft `if:` or the concurrency group at all, so this is stricter than before.

| Broken version | Result |
|---|---|
| M1 push removed; M2 `[main, dev]`; M3 `["**"]`; M4 bare `push:`; M24 `[main*]`; M17 `branches-ignore` | caught |
| M5 push with `paths:`; M6 `paths-ignore`; M7 `tags:` | caught |
| M8 `merge_group`; M9 `workflow_dispatch`; M21 `pull_request_target`; M23 `schedule` | caught |
| M10 the old draft-only `if:`; M11 no `if:`; M12 drafts allowed; M13 push only | caught |
| M14 the old PR-only group (every push run would share `deploy-synth-`); M15 `|| github.ref`; M16 `cancel-in-progress: true` | caught |
| M18 the `pull_request` paths dropped; M19 the job gets `contents: write`; M20 `secrets.GITHUB_TOKEN` in env | caught |
| M22 checkout `ref: ${{ github.event.pull_request.head.sha }}` | **missed** (on push it evaluates to empty, which is the default checkout) |
| M25 `${{ github.token }}` passed to a step's env | **missed** (the token is read-only) |

* **Nothing the old test protected is now unprotected.** The old blanket `doesNotMatch(/push:/)` is replaced by the exact push block and a count of 1. M22 and M25 were not covered before either, so they are not regressions. With `contents: read` their impact is low. I list them as notes, not findings, because pinning them is new scope.

## 4. Other pins and stale references
* I searched for `deploy-synth` outside `archive/`, `product/history/`, `sources/` and `code/`. Only `estate.test.ts` pins the workflow, and no tool, guard or hook reads its triggers. `.mergify.yml` does not name it. The `deploy` path at `.mergify.yml:202` is the product queue's file scope, which this PR does not change. `check-mergify-scopes.sh`, `write-token.py` and `ci-and-lists.mjs` all exit 0.
* The rest are prose records: `qa/BUGS.md`, the `qa/reports/*`, `screens/PF-8a|PF-8b|PF-23c`, `DECISIONS.md`, `BACKLOG.md` and `design/briefs/AUD-2c.md`. They describe history and pin nothing. One user-facing doc is now incomplete (Minor 1).

## 5. "Batches no slower"
**Sound.**
* The push run starts only after a merge.
* It is not in any Mergify `queue_conditions` or `merge_conditions`: `.mergify.yml` is untouched, and `check-mergify-scopes.sh` passes.
* It is not a required check: the branch rules require only `ci`.
* It never runs in a batch: batch PRs are drafts and are skipped, and batch branches are not `main`.
* `merge_group` is correctly left out. That event belongs to GitHub's own merge queue, which Mergify does not use, and the check is not required, so no queue needs it.

The only shared cost is one `ubuntu-latest` job of about 60 s per merge. It would delay a batch's jobs only if the org's concurrent-job limit were already full. That is the same kind of cost as `queue-gate`, `item-proof` and `demo-update`, which already run on every push to main, and a batch's `ci` uses many more jobs than this one.

## Issues
**Minor**
1. **`studio/deploy/cdk/README.md:47` is now incomplete.** It still says the job "runs on pull requests that change this folder, and never in a merge-queue batch", with no mention of the run on every push to main. The brief limited the change to the workflow and its test, so this is a one-line follow-up, or it can go in this PR if the tech lead allows the extra file. It does not hold the merge.
2. **The new side effect on the board is not declared.** `cockpit-data.py:2939-2942` turns the board's "main CI" item red for any failed check run on main's head, with the action "fix main before anything else merges". A failed push run of this *report-only* check will now do that. The `npm audit --omit=dev --audit-level=high` step also runs on every push, so a newly published high advisory can turn main red with no merge at all.
   * This is consistent with the purpose: "a merge combination that breaks the synth shows on main", and P-339 wants a green run on main's head.
   * But the header says only "it adds nothing to a pull request or to a merge-queue batch". It should also say, in one line, that a red push run shows as main red on the board.
   * Also, while a run is going (about 60 s after each merge), the board's "main CI" item shows amber "running". Other push workflows already cause that.

**Notes (no action asked)**
* M22 and M25 in the table are guard gaps that existed before this PR.
* The pending-run replacement on the `pull_request` side, described in §1, is pre-existing.
* The push trigger can only be exercised for real after the merge. After the merge, the first `deploy-synth` run with `event=push` on main's head is the check that QA-645 is closed, and its run id is what the cloud lines can cite. I did not edit the QA-645 row.

Working tree: the workflow is restored and identical to `c52b96fa2`. `node_modules` is ignored by git. This file is the only new path.
