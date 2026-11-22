# Contributing

This page is for anyone, person or agent, who wants to change this repository. It points to the rule files and replaces none of them. If this page and a rule file disagree, the rule file wins: say so in your PR.

## 1. Read first
- [`AGENTS.md`](AGENTS.md): the rules for every contributor (one page).
- [`WAY-OF-WORKING.md`](ai-workers/problem-1-pathway-setup-and-form-filling/product/WAY-OF-WORKING.md): the loop, roles and the quality bar.
- [`RULES.md`](ai-workers/problem-1-pathway-setup-and-form-filling/product/RULES.md) and [`STATE.md`](ai-workers/problem-1-pathway-setup-and-form-filling/product/STATE.md): the rules in force, and where the work stands today.
- The app: [`prototype/studio/`](ai-workers/problem-1-pathway-setup-and-form-filling/prototype/studio/), how to run it in its [`DEVELOPING.md`](ai-workers/problem-1-pathway-setup-and-form-filling/prototype/studio/DEVELOPING.md).

## 2. Take a row
- Work lives as rows in [`BACKLOG.md`](ai-workers/problem-1-pathway-setup-and-form-filling/product/BACKLOG.md). Each row says what it touches, what it waits on, and its **Done when** (the test that proves it). Take a row that is ready, is yours or unowned (one owner per row), and that no open PR already touches.
- **Duplicate check first:** search the row's words in the backlog files, open PRs (records PRs too), `main`'s code and [`qa/BUGS.md`](ai-workers/problem-1-pathway-setup-and-form-filling/product/qa/BUGS.md). Found one? Ask before building.
- Agents in this repository use the `next` skill ([`.claude/skills/next/SKILL.md`](.claude/skills/next/SKILL.md)) and `/next <area>`.
- One row is one small PR: under 800 changed lines, counting everything but `product/screens/` and `product/qa/` records. Branch from the latest `main`. Push after every step.
- Builders never edit `STATE.md`, `DECISIONS.md` or `qa/CAPABILITIES.md`: status goes in the PR body.

## 3. The checks on your PR
GitHub requires one check, `ci`. The merge queue also needs `queue-fresh` for app code, and `xfa-engine` and `skeleton` where their files change. The reviewer expects every other check green as well.

| Check | What it asks | Where it is defined |
|---|---|---|
| `ci` | every suite your change can affect, and the push guard: no `sources/`, `code/`, `archive/`, PDFs, databases, logs, secrets or personal names | [`ci.yml`](.github/workflows/ci.yml), [`push-guard.sh`](ai-workers/problem-1-pathway-setup-and-form-filling/product/tools/push-guard.sh), [`.githooks/pre-push`](.githooks/pre-push) |
| `pr-rules` | the body has a **Done when** naming its test and a `Duplicate check:` line; the size rule above or a `Size exception: P-NNN` line; a readable `Completes: R1.n` line if it has one; a `STANDARDS §1:` line for a new package | [`pr-rules.yml`](.github/workflows/pr-rules.yml) |
| module cards | a changed module's card is updated, or the body says `Card unchanged: <reason>` | [`module-cards.yml`](.github/workflows/module-cards.yml) |
| `queue-fresh` | an app PR is re-tested when `main` changed its files after its `ci` started | [`queue-gate.yml`](.github/workflows/queue-gate.yml) |

Use the [PR template](.github/pull_request_template.md): it carries every body line these checks read.

## 4. What needs an owner's read
- **The tech lead reads the diff first** when a PR touches money, permissions, the schema or a migration, `.github/` or `.mergify.yml` (rule P-423), or another path in [`lead-read-paths.txt`](ai-workers/problem-1-pathway-setup-and-form-filling/product/tools/lead-read-paths.txt) (the guards and CI's gate scripts, the agents' rules and skills). The read is a PR comment line `Lead read the diff: <full head SHA>`; a new push needs a new read.
- Immigration values (programs, forms, fees, thresholds) need an official source cited with page, quote and date; anything else is labelled Sample (`AGENTS.md` rule 4).

## 5. Review and merge
- An independent reviewer, never the builder, reviews the exact head commit. Money, permissions, schema and new screens also get an adversarial breaker. A PR comment line `Reviewer: Approve <full head SHA>` records the verdict.
- **Then mark the PR ready for review.** The full `ci` runs only on a ready PR, and a draft never joins the queue.
- The label `review: approved` puts the PR in the Mergify merge queue ([`.mergify.yml`](.mergify.yml)), which tests it on the latest `main` with the PRs ahead of it and merges it. The label needs a reviewer's Approve on the head, a green `ci`, and the owner's read where §4 asks for it. Without a path from §4, the queue gate puts it on by itself; otherwise the builder or the tech lead does.
- A new push removes the label unless it is a pure merge of `main` ([`label-guard.yml`](.github/workflows/label-guard.yml)). PRs merge through the queue, not by hand.
- From a fork: you are welcome. Your PR is judged by the same checks, but it never joins the queue by itself: a member takes it through review.

## 6. Ask a question
Comment on your PR with a line starting `Question for the tech lead`, add your recommendation, and carry on with what is not blocked. Disagreements go in the PR with evidence: never follow blindly, never deviate silently.
