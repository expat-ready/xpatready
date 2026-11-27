# Repository clean-up plan (step 0b before the factory switch) — 27 Nov 2026, Lead 2

**SUPERSEDED 10:4x IST 27 Nov (founder: "don't duplicate the work"):** the clean-up plan already exists: `design/repo-cleanup-plan-2026-11-17.md` (branch `claude/repo-cleanup-plan-05e345`), decisions P-674 to P-677, stages 0-8 = full-power plan items 60-70. Stage 0 is on main (#2123); stage 1, 1b, 2a and 8 branches exist but are ~5,400 commits behind. This file is kept only for its fresh inventory (sizes, path counts, 27 Nov), to refresh that plan's stages; it is not a second plan.

Founder (typed, 10:1x IST 27 Nov): a deep clean so agents, names and structure are clear, with nothing stale, archival or hallucinated left in what agents read, and a production-style layout. Founder 10:3x: "Yes, plan it".
Facts below come from `origin/main` at 3ae82f28f (git ls-tree, git grep, git log); sources/, code/ and archive/ are not tracked and were not opened. Git keeps everything deleted here (AGENTS.md rule 8: git history is the archive).

## What is there now
- **Tracked: about 17,100 files, about 1.5 GB**, almost all under `ai-workers/`.
- **The weight is test output in git.** `product/screens` holds 5,594 files (652 MB) and `product/qa` 3,769 files (378 MB, of which reports are 3,623 files). Studio tests write screenshots and reports into the tree: about 220 files write under `product/screens`, and 34 more under `product/qa/reports`.
- **The Release 1 app** is `prototype/studio` (3,400 files, 93 MB). Its `evidence/` folder (223 files, 53 MB) is test output.
- **Earlier experiments:**
  - `prototype/p1`, `p2`, `p5`, `expected` and `evidence-lane` are still read by studio tests (p2 by 81 files, p1 by 53). They become fixtures.
  - `p3` and `p4` are unused.
- **Zero-reference history**, nothing in CI, config, the app or tools points at it:
  - `ai-workers/` root notes, illustrations (117 MB), checks, research, requirements, commercial, and problem-2
  - `ai-workers/tools`, except `prompt-log.sh`
  - the dated proposals and one-pagers at the problem-1 root
  - `devin-review/`
  - the superseded requirements snapshot `requirements-2026-10-19`
  - `delivery-reset-2026-10-21/`, `playbook/`, `requirements-planning/` and `fresh-start-prompt.md`
- **Path coupling (lines that name the long path):** 189 in 26 workflows, 223 in `.mergify.yml`, 114 in 86 tool files, 108 inside studio, 8 in settings.json, 5 in git hooks, and 14 in skills and agents. Studio also reads sibling folders through relative `../..` joins.
- **The same idea in several places:**

  | Idea | Where it lives |
  |---|---|
  | Decisions | 3 places (`ai-workers/decisions.md`, `product/DECISIONS.md`, `product/decisions/`) |
  | Requirements | 3 places |
  | Tools | 3 folders |
  | Tests | 3 folders |
  | Evidence | 4 places |
  | Rules | 3 places (RULES.md, `rules/`, `.claude/rules`) |

- **Agents can't read the two biggest records whole:** BACKLOG is 779 KB and DECISIONS is 798 KB.
- **Names:**
  - The prefix `ai-workers/problem-1-pathway-setup-and-form-filling` is 50 characters and describes nothing.
  - The production app is called "prototype".
  - p0–p5 are opaque.
  - Several folder names are dated.

## Target layout
```
app/              Release 1 app (was prototype/studio): api, web, engine, prisma, deploy
  tests/          studio tests + acceptance
  fixtures/       only the p1/p2/p5/expected files tests read
packages/         xfa-engine; repo-paths = the one path map
reference/        read-only: official-sources/, requirements/ (newest snapshot only)
records/          STATE, BACKLOG (open rows), DECISIONS (last 30 days), ASSUMPTIONS
rules/            RULES (one page), WAY-OF-WORKING, STANDARDS, EXPERIENCE, PRODUCT, ENVIRONMENT
design/           one folder per screen: concept + build notes, no screenshots
factory/tools/    was product/tools + prompt-log.sh
.claude/ .github/ .githooks/ .mergify.yml
evidence/         git-ignored: screenshots, qa reports; CI keeps them as run artifacts
```
Records, rules and the Lead's tools later move to the private repository (factory v3 item). Keeping them as their own top-level folders makes that a single move.

## Phases (each phase is one revertible pull request)
Every phase that deletes more than 50 files carries `BULK-DELETE-OK: <reason>` (ENF-803). For a phase to count as done, every required check must have run on it and passed, and `git grep <deleted path>` must return 0.

| # | Phase | Size | Changes outside the folder | Risk | Done when |
|---|---|---|---|---|---|
| 1 | Delete the zero-reference history listed above | ~1,150 files, ~170 MB | none | Low | ci, guards, pr-suites, xfa-engine and enf-803 are green; Mergify merges it |
| 2 | Stop committing test output: writers go to git-ignored `evidence/`, CI uploads it as artifacts; remove `screens/*/screenshots`, `qa/reports`, `studio/evidence` and `product/reports`; update the journey-test, screen-review and qa skills in the same PR | ~1 GB | 5 workflows, 3 skills, ~250 test files (through one helper) | Medium | walks and walk-report produce artifacts; pr-suites green; first check that no test **reads** a concept file under `screens/` |
| 3 | Retire stale experiment pieces: p3, prototype root handoffs and manifests, `history/`, the scout lane (if confirmed retired); fix `.claude/launch.json` | small | launch.json, the qa skill (1 path), the pre-push scout branch | Low to medium | green, plus a fresh session starts cleanly |
| 4 | Shrink the records: closed BACKLOG rows and DECISIONS older than 30 days move out of the tree (git keeps them); merge `decisions/` into DECISIONS; RULES becomes one page generated from the live rows; prune design folders no open row cites | ~350 files | 6 workflows, records-label, lead-read, check-docs | Low to medium | lead-tools-tests, records-label and trace green; check-docs passes |
| 5 | Make every path indirect, without moving anything yet: all hard-coded paths go through `packages/repo-paths` (TypeScript) and one paths file for shell | ~170 files edited | tools, studio, hooks, settings.json | Medium (behaviour unchanged) | full CI and nightly green; hooks fire in a fresh session |
| 6 | The move, with no lanes open: `git mv` into the target layout; workflows and Mergify globs generated from repo-paths, not hand-edited; old-to-new table in `docs/PATHS-MOVED.md` | all paths | 26 workflows, Mergify (~220 lines), settings, hooks, skills, CLAUDE.md, AGENTS.md | **High**: a Mergify glob that stops matching can silently skip a required check | every required check **ran** on the PR; a dry run of the merge queue; `git grep problem-1` = 0; one green nightly |
| 7 | Remove the emptied `prototype/` shell and its extra package.json files | small | none | Low | one green nightly after phase 6 |

## Order and timing
- **Phases 1–4 run alongside product work.** Each one is a pipeline PR, which goes through the pipeline queue ahead of product PRs.
- **Phase 5** needs one builder for about a day.
- **Phase 6** needs a quiet window: no lanes open, the queue empty, the founder told in advance. Open branches would conflict with every path.
- **Estimated effort:**

  | Phases | Lead time | Builder time |
  |---|---|---|
  | 1–4 | about half a day | 1–2 days |
  | 5–7 | about half a day | 1–2 days, plus the window |

- The switch to factory v3 (step 5) comes after phase 6, so its new rules and paths are written once, on the clean layout.

## Open points (settled before the phase that needs them)
- Is the scout lane retired? (phase 3)
- Is root `commercial/` still used? (phase 1: kept until answered)
- Which prototype root handoff file a tool still references (phase 3)
- Do any studio tests read files under `screens/` rather than write them? (checked first in phase 2)
