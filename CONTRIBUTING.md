# Contributing

This page is for anyone, person or agent, who wants to change this repository. It points to the rule files and replaces none of them. If this page and a rule file disagree, the rule file wins: say so in your PR.

## 1. Read first
- [`AGENTS.md`](AGENTS.md): the rules for every contributor (one page).
- [`WAY-OF-WORKING.md`](ai-workers/problem-1-pathway-setup-and-form-filling/product/WAY-OF-WORKING.md): the loop, roles and the quality bar.
- [`RULES.md`](ai-workers/problem-1-pathway-setup-and-form-filling/product/RULES.md) and [`STATE.md`](ai-workers/problem-1-pathway-setup-and-form-filling/product/STATE.md): the rules in force, and where the work stands today.
- The app: [`prototype/studio/`](ai-workers/problem-1-pathway-setup-and-form-filling/prototype/studio/), how to run it in its [`DEVELOPING.md`](ai-workers/problem-1-pathway-setup-and-form-filling/prototype/studio/DEVELOPING.md).

## 2. Take a row
- Work lives as rows in [`BACKLOG.md`](ai-workers/problem-1-pathway-setup-and-form-filling/product/BACKLOG.md); each row says what it touches, what it waits on, and its **Done when** (the test that proves it). Take a row that is ready and that no open PR already touches.
- **Duplicate check first:** search the row's words in the backlog files, open PRs (records PRs too), `main`'s code and [`qa/BUGS.md`](ai-workers/problem-1-pathway-setup-and-form-filling/product/qa/BUGS.md). Found one? Ask before building.
- Agents in this repository use the `next` skill ([`.claude/skills/next/SKILL.md`](.claude/skills/next/SKILL.md)) and `/next <area>`.
- One row is one small PR (under 800 changed lines of code and tests). Branch from the latest `main`. Open the PR as a draft at your first commit, then push after every step.

## 3. The checks your PR must pass
| Check | What it asks | Where it is defined |
|---|---|---|
| `ci` | every suite your change can affect; GitHub requires it on `main` | [`.github/workflows/ci.yml`](.github/workflows/ci.yml) |
| `pr-rules` | the body has a **Done when** naming its test and a `Duplicate check:` line; under 800 lines or `Size exception: P-NNN`; a readable `Completes: R1.n` line if it has one; a new package needs a `STANDARDS §1:` line | [`.github/workflows/pr-rules.yml`](.github/workflows/pr-rules.yml) |
| guards | no `sources/`, `code/`, `archive/`, PDFs, databases, logs, secrets or personal names in the diff | [`.githooks/pre-push`](.githooks/pre-push), [`guards.yml`](.github/workflows/guards.yml) |
| module cards | a changed module's card is updated, or the body says `Card unchanged: <reason>` | [`module-cards.yml`](.github/workflows/module-cards.yml) |
| `queue-fresh` | an app PR is re-tested when `main` changed its files since its `ci` started | [`queue-gate.yml`](.github/workflows/queue-gate.yml) |

Use the [PR template](.github/pull_request_template.md): it carries every field the checks read.

## 4. What needs an owner's read
- A PR touching a path in [`lead-read-paths.txt`](ai-workers/problem-1-pathway-setup-and-form-filling/product/tools/lead-read-paths.txt) (workflows, the merge queue, the guards, the schema and migrations, money, the permission machinery) or adding or changing a permission key or a guarded route waits for the tech lead's read: a PR comment line `Lead read the diff: <full head SHA>` (rule P-423). A new push needs a new read.
- The status `lead-read` shows whether a PR needs that read and has it (report-only while it starts).
- Immigration values (programs, forms, fees, thresholds) need an official source cited with page, quote and date; anything else is labelled Sample (`AGENTS.md` rule 4).

## 5. Review and merge
- An independent reviewer, never the builder, reviews the exact head commit; money, permissions, schema and new screens also get an adversarial breaker. A PR comment line `Reviewer: Approve <full head SHA>` records the verdict.
- The label `review: approved` (only a reviewer's Approve, green `ci`, and the owner's read where §4 asks for it) puts the PR in the Mergify merge queue, which tests it on the latest `main` with the PRs ahead of it and merges it ([`.mergify.yml`](.mergify.yml)). A new push removes the label ([`label-guard.yml`](.github/workflows/label-guard.yml)). Nobody merges by hand.
- From a fork: you are welcome. Your PR is judged by the same checks, but it never joins the queue by itself; a member takes it through review.

## 6. Ask a question
Comment on your PR with a line starting `Question for the tech lead`, add your recommendation, and carry on with what is not blocked. Disagreements go in the PR with evidence: never follow blindly, never deviate silently.
