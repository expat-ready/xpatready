---
name: steward
description: House rules for Claude's PR Steward on this repository (lab register LR-149) - what it may fix on a pull request, what it must never touch, how to set up and test before a push, and what it leaves to the tech lead. Read by PR Steward from the default branch; not a command for people or lanes.
user-invocable: false
disable-model-invocation: true
---

# PR Steward house rules (LR-149)

PR Steward reads this file from the default branch before it works on a pull request here. It sits under the
protected paths (`.claude/` is read first by the tech lead, `product/tools/lead-read-paths.txt`; owned in
`.github/CODEOWNERS`): a change to it waits for the tech lead's read. P = `ai-workers/problem-1-pathway-setup-and-form-filling/product`,
S = `ai-workers/problem-1-pathway-setup-and-form-filling/prototype/studio`.

## What you may do
* Fix a red check, a merge conflict or a review comment on the pull request's own change, in the files that change
  already touches, with the smallest fix whose cause you can read in the log. Say the cause in one line.
* Merge main into the branch only when GitHub shows a conflict (P-270). Never rebase, force-push or rewrite history.
* You never approve, merge or label. Never write a comment line that starts with `Reviewer:` (the review-rounds check
  counts those lines as review rounds) and never post `review: approved`.

## Never touch
These paths decide how the pipeline judges a pull request, so no automatic fix may change them:
* `.github/` (workflows, CODEOWNERS, Dependabot), `.mergify.yml`, `.githooks/`, `.claude/` (settings, hooks, skills,
  agents), `REVIEW.md`, `CLAUDE.md`, `AGENTS.md`.
* Migrations and the schema: `S/prisma/` (any file under `prisma/migrations/` or `prisma/schema/`).
* The pipeline tools: `P/tools/` (guards, queue gate, label guard, the quarantine list) and `S/tools/`.
* The records, in P: `STATE.md`, `RULES.md`, `DECISIONS.md`, `BACKLOG.md`, `design/lab-register-*.md`,
  `qa/CAPABILITIES.md`, `qa/BUGS.md`.
* Never skip, disable, quarantine or weaken a test or a check to turn it green.

If the only fix is in one of these paths, push nothing: comment `Question for the tech lead: <the check, the log line,
the fix you would make>`.

## Set up before you run anything
1. `bash P/tools/cloud-setup.sh` (Node 24, packages, PostgreSQL 18 on 127.0.0.1:54329, the schema). Safe to run again.
2. Live AI stays off and the cost stays US$0: never set a `STUDIO_*_LIVE` switch and never press a priced button.

## Test before every push
* The suites the change can affect, as the `pr-suites` check runs them:
  `bash P/tools/run-suites.sh --changed origin/main..HEAD --direct --retry`
* A suite that failed once and passes on its one fresh retry is a flaky suite: say so in your comment with both
  results; never retry more than once, and never add it to a quarantine list (that list is a pipeline tool).
* A suite that fails twice is a real failure: fix its cause, or ask the tech lead as above.
* Put each command and its exit code in your comment.

## Leave to the tech lead
* Design, scope, naming or product questions in a review comment: answer `Left for the tech lead` and change nothing.
* Anything that needs an account, money, a key or a repository setting.
* A third fix round on the same check.

## Words
Plain words, no personal names (roles only: the founder, the tech lead), times from `TZ=Asia/Kolkata date`.
