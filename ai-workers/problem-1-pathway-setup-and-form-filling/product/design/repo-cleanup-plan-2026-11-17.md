# Repository clean-up plan — 17 Nov 2026 (A155, phase 1: plan only)

Author: the repository clean-up agent (Opus 5.5, P-608), reporting to the tech lead. Status: **founder answered Q1–Q3 on 17 Nov; plan approval and the Lead's go pending**. Nothing has moved yet. Phase 2 (doing the moves) starts only after (a) the founder approves this plan, (b) the move into the `expat-ready` organisation is done and checked (Wed 18 Nov 09:30 IST, P-660), and (c) the Lead says go.

Measured on `main` at `ceaf13037` (17 Nov, ~13:00 IST). Every number below comes from `git ls-files`, `git grep` or the GitHub API on that commit.

---

## 0. The answer in plain words

**Yes, the names no longer match the work.** The product is a production platform (Release 1, 101 capabilities), but it sits five folders deep in a path that tells the October story:

```
ai-workers/problem-1-pathway-setup-and-form-filling/prototype/studio/   ← the real app
ai-workers/problem-1-pathway-setup-and-form-filling/product/            ← the rules, state, backlog, records
```

- **"ai-workers"** was the October AI-workers workstream. **"problem-1"** was Solution 1. **"prototype"** was the POC. The app is none of these now.
- **About 1,000 files (~150 MB) are October history that nothing reads**: the Solution 1 one-pager drafts, illustrations, checks, problem 2, the delivery reset, playbook, requirement planning.
- **The live app still depends on the old POC folders.** The app imports code from `prototype/p2` (the AI spend guard), `prototype/p5` (the document reader) and `prototype/contracts`. Those folders can't simply be deleted; the parts in use have to become proper shared packages first.
- **The repository is 2.3 GB**, mostly screenshots (4,635 PNG files; `product/screens` 562 MB, `product/qa` 352 MB). Moving folders doesn't shrink that, because git history keeps every file. We can stop the growth; shrinking it would mean rewriting history, which AGENTS rule 1 forbids.

**The target is six plain folders at the top:** `apps/` (the app), `packages/` (shared code), `docs/` (rules, product, decisions, records), `reference/` (official sources and requirement snapshots, read-only), `tools/` (scripts, guards, the board), plus GitHub's own `.github/`. It takes **8 small stages**, each one PR, run in quiet windows when the merge queue is empty. Each stage can be undone with a single `git revert`.

---

## 1. Inventory (tracked files on `main`, 13,326 in total)

"Readers" means what reads the folder automatically: CI (`.github/workflows`), Mergify (`.mergify.yml`), Claude Code hooks (`.claude/settings.json`), skills and agents (`.claude/`, `.agents/`, `.goose/`), the push guard (`.githooks/pre-push`), the tools in `product/tools/`, the app's own code (imports and computed paths), `start.sh`, Prisma, and the board and Library feeds (`product/cockpit/*.json`). Mentions in old records don't count as readers.

Verdicts: **Keep** (stays where it is) · **Move** (`git mv` to the target layout) · **Archive** (removed from the main tree; git history keeps every byte, and the tag `history/pre-cleanup-2026-11` points to the last commit that has it) · **Delete** (nothing reads it and git keeps it, same as Archive, but not worth naming in the map).

### 1a. Top level

| Folder / file | Files | What it is | Live? | Readers | Verdict |
|---|---:|---|---|---|---|
| `ai-workers/problem-1-…/` | 11,691 | Everything live: app, product records, sources | **Live** | everything below | Split up (see 1b) |
| `ai-workers/illustrations/` | 753 (123 MB) | Solution 1 one-pager drafts, audits, screenshots (Oct) | No | only `ai-workers/checks`, `ai-workers/tools/snapshot.sh`, `playbook/` (all dead) | **Archive** |
| `ai-workers/checks/` | 124 (23 MB) | Oct one-pager and M0 check results | No | only illustrations, other checks | **Archive** |
| `ai-workers/tools/` | 62 | Oct one-pager builders (`s2/`, `s3/`, `s3-working/`) + **`prompt-log.sh`** + `freshness.sh` | **2 files live** | `prompt-log.sh`: the UserPromptSubmit hook; `freshness.sh`: the screen-concept skill | **Move** the 2 live files to `tools/`; **Archive** the rest |
| `ai-workers/requirements/`, `research/`, `commercial/`, `problem-2-…/` | 74 | Oct requirement critiques, AI research, problem 2 page | No | 2 expert-pack docs mention them (text only) | **Archive** (map entry keeps the mention resolvable) |
| `ai-workers/*.md` (NEXT, PROGRESS, README, START-HERE, assumptions, decisions, terminology-register) | 7 | Oct workstream records (AIW-D decision rows) | No | old records only | **Archive** (AIW-D rows stay reachable through the tag) |
| `packages/xfa-engine/` | 515 | The XFA form engine package | **Live** | `xfa-engine.yml`, Mergify, studio tests | **Keep** |
| `commercial/` | 20 | Business plan (`plan.docx`, `model.xlsx`), market research R1–R7, model builder | No CI reader | none | **Question 3** for the founder: this repo is **public** |
| `delivery-reset-2026-10-21/` | 13 | 21 Oct switch-over records | No | none | **Archive** |
| `playbook/` | 8 | Oct delivery playbook and templates | No | CLAUDE.md mentions it (one line) | **Archive** |
| `requirements-planning/` | 3 | 10 Oct AG detailing plan | No | none | **Archive** |
| `fresh-start-prompt.md` | 1 | Old restart prompt | No | none | **Delete** |
| `AGENTS.md`, `CLAUDE.md`, `SECURITY.md`, `LICENSE`, `.nvmrc`, `tsconfig.base.json` | 6 | Root rules and config | **Live** | every agent; xfa-engine build | **Keep** (paths inside updated) |
| `.github/` (14 workflows), `.mergify.yml`, `.githooks/pre-push` | 16 | Pipeline | **Live** | GitHub, Mergify, git | **Keep** (paths inside updated; A154 change-log row for each) |
| `.claude/` (settings, 12 skills, 2 agents, 14 module-card symlinks, launch.json) | 30 | Agent config and hooks | **Live** | Claude Code | **Keep** (paths inside updated; launch.json's `ai-workers-static` and `p3-review` entries are dead: remove) |
| `.agents/skills/scout`, `.goose/recipes/scout.yaml` | 2 | Scout for Codex/Goose | Live if the scout still runs | the scout | **Keep** (paths updated); Lead to confirm it still runs |
| *not tracked:* `sources/`, `code/`, `archive/`, `.tools/` | — | Read-only references, local tools, secrets, Postgres data | Local only | push guard refuses them | **Must not move** (section 4) |

### 1b. Inside `ai-workers/problem-1-pathway-setup-and-form-filling/` (call it `P1/`)

| Folder | Files | What it is | Live? | Readers | Verdict → target |
|---|---:|---|---|---|---|
| `P1/prototype/studio/` | 2,009 (80 MB) | **The app**: NestJS api, React web, engine, Prisma (128 files), tests (762), acceptance, ports, tools, deploy, Dockerfile, `start.sh` | **Live** | ci.yml (`S:` env in 5 jobs), demo-update.yml, Dockerfile `ARG P`, Mergify `/prototype/` rule, 14 module cards, skills, `start.sh` | **Move** → `apps/studio/` |
| `P1/prototype/contracts/` | 12 | Shared rule, fact-key and history types + JSON schemas | **Live** | 26 imports of `rules.ts`, plus `fact-key.ts` and `history.ts`, from studio api/engine/web | **Move** → `packages/contracts/` |
| `P1/prototype/p2/` (only 10 `.ts` files: `policy, ledger, guard, prompt, launch, convert, runner, reconvert, pathcode, screen, isolation`) | ~12 | **The AI spend guard** (cost caps, shared ledger, prompt guard, launcher) | **Live, money-critical** | 100+ imports from studio; `policy.ts` computes `ROOT` by counting folder levels (`PROTOTYPE/../../..`) | **Move** → `packages/ai-spend/` (with the root fix: section 3, stage 2) |
| `P1/prototype/p2/prompts`, `jobs`, `parts`, `screen-inventories`, `question-lists`, `review-sheets` | ~150 | Data folders that `policy.ts` names (`PROMPTS_DIR`, `JOBS_DIR`, …) | **Live (read at run time)** | `policy.ts` | **Move** with the package (data under `packages/ai-spend/data/`) |
| `P1/prototype/p2/runs`, `scores`, `stubs`, `config`, `ledger`, `*.json` | ~450 (21 MB) | POC P2 run records (Oct) | No (the ledger now lives in `.tools/p2-ledger`) | records only; check `stubs` before archiving (tests may use them) | **Archive** after a grep in stage 2 |
| `P1/prototype/p5/transforms.ts`, `p5/reader/` | ~36 | Document reader and value transforms | **Live** | 28 + 3 imports from studio; `transforms.ts` itself imports `../studio/engine/options.ts` (a loop) | **Move** into `apps/studio/engine/reader/` (it belongs to the app; this breaks the loop) |
| `P1/prototype/p5/evidence`, `ui`, `drafts`, `server.ts`, `release_d30.ts` … | ~50 | POC P5 demo and evidence | No | none | **Archive** |
| `P1/prototype/p1/inventory/*.json` | 2 of 127 | Form inventories that 2 tests read; `policy.ts` names `INVENTORY` | **2 files live** | studio tests, `policy.ts` | **Move** the inventory → `reference/form-inventories/`; **Archive** the rest of p1 |
| `P1/prototype/p3`, `p4`, `evidence-lane`, `expected`, `tests`, `env`, root `*-manifest.sha256`, `*-handoff-*.md`, `package.json`, `trace.csv` | ~360 | POC P0–P4 code, manifests and hand-overs | No (launch.json's `p3-review` is dead) | Dockerfile.dockerignore excludes them; one journey doc mentions evidence-lane | **Archive** (POC evidence stays in git history, P-188) |
| `P1/official-sources/` | 95 (48 MB) | Official IRCC/ESDC files + `fetch_official_sources.py` | **Live** | ci.yml (fetch step), push guard, `policy.ts` (`OFFICIAL`) | **Move** → `reference/official-sources/` |
| `P1/domain/requirements-2026-11-02`, `-10-19` | 133 (28 MB) | Name-free requirement snapshots (read-only, P-82) | **Live (read)** | `sync-requirements.sh` | **Move** → `reference/requirements/`; the older 10-19 snapshot is **Archived** ("newest only", CLAUDE.md) |
| `P1/product/tools/` | 153 | Guards, hooks, board builder, merge tools, `check-docs.sh`, `current-lead.sh` | **Live** | 8 hook commands, 10+ workflow steps, skills | **Move** → `tools/` |
| `P1/product/cockpit/` | 44 (8 MB) | The board (v14): `index.html`, `plan.json`, `library.json`, `history.jsonl` | **Live** | cockpit-tests.yml, `cockpit-data.py`, Library feed (8 paths into `product/`) | **Move** → `tools/board/` (code) and `docs/board/` (data); paths in `library.json` rewritten |
| `P1/product/*.md` (RULES, STATE, BACKLOG, DECISIONS, WAY-OF-WORKING, PRODUCT, STANDARDS, EXPERIENCE, QUALITY, …: 18 files) | 18 | Living rules and state | **Live** | every skill, every lane, CLAUDE.md, AGENTS.md | **Move** → `docs/` (only after a Lead sign-off: the Lead edits these) |
| `P1/product/decisions/`, `rules/`, `lanes/`, `domain/`, `state/`, `inbox/`, `reference/`, `ops/`, `research_notes/` | ~70 | Supporting rules and notes | Live (read by people and skills) | skills, lanes | **Move** → `docs/…` |
| `P1/product/screens/` | 3,929 (562 MB) | Per-screen concept, build and review records, screenshots | Live (skills read `screens/NN`) | screen-* skills, agents | **Move** → `docs/records/screens/` |
| `P1/product/qa/` | 2,955 (352 MB) | QA bugs, capabilities, verdicts, walks | **Live** (GRAPH.md, verdicts feed the queue, P-664) | qa skill, `queue-gate.sh`, `trace-requirements.py` | **Move** → `docs/records/qa/` |
| `P1/product/design/`, `reports/`, `scout/`, `history/` | ~1,100 | Design notes (this file), reports, scout output, old STATE blocks | Records (history is never read, rule 9) | a few tools (`merge-queue-causes`, `TEAM-PATTERNS`, scout reports) | **Move** → `docs/records/…` |
| `P1/devin-review/2026-10-30-d1/` | 41 (6 MB) | One outside review's screenshots | No | none | **Archive** |
| `P1/*.md`, `*.html` at the P1 root (README, CLAUDE.md, one-pager html, truth-review, conflict table, …) | 9 | Oct Solution 1 pages | No (the old one-pager link's builder is archived too) | none | **Archive** (P1's `CLAUDE.md` is folded into the root one) |

**Reference counts (the cost of moving):** the long prefix `ai-workers/problem-1-pathway-setup-and-form-filling` appears **7,258 times in 699 files**. Only about **90 of those files are live** (workflows, hooks, skills, agents, tools, app code, Dockerfile, root rules). The other ~610 are records and are **not rewritten** (section 4.3). The Mac's absolute home path (`/Users/<founder>/…`) appears in 440 files, almost all old records; only `lanes/qa.md` and `lanes/runtime.md` are live (the `.tools` symlink line).

---

## 2. Target layout

```
expat-ready/<repo>/                     ← name: Question 1
├── apps/
│   └── studio/                          the app (api, web, engine, prisma, tests, deploy, start.sh)
├── packages/
│   ├── xfa-engine/                      (already here)
│   ├── contracts/                       rule, fact-key, history types + JSON schemas
│   └── ai-spend/                        cost caps, shared ledger, prompt guard, launcher (+ data/)
├── reference/                           read-only inputs, never edited by hand
│   ├── official-sources/                IRCC / ESDC files + fetch script
│   ├── requirements/                    newest name-free requirement snapshot
│   └── form-inventories/
├── docs/
│   ├── README.md                        "start here" map of the docs
│   ├── RULES.md  STATE.md  BACKLOG.md  DECISIONS.md  WAY-OF-WORKING.md
│   ├── product/                         PRODUCT, STANDARDS, EXPERIENCE, QUALITY, glossary
│   ├── decisions/                       decision detail files (ADR-style)
│   ├── lanes/  board/
│   ├── records/                         screens/, qa/, design/, reports/, scout/, history/
│   └── PATHS-MOVED.md                   old path → new path, for every move
├── tools/                               guards, hooks, merge tools, board builder, check-docs.sh
│   └── board/
├── .github/  (workflows, CODEOWNERS)   .claude/  .githooks/  .mergify.yml
├── README.md  AGENTS.md  CLAUDE.md  SECURITY.md  LICENSE  .nvmrc  tsconfig.base.json
```

### 2.1 Why each choice (a named practice, not taste)

| Choice | Practice it follows | What we gain | Trade-off |
|---|---|---|---|
| `apps/` + `packages/` | The **apps/packages monorepo convention** of npm/pnpm workspaces, Turborepo ("Structuring a repository") and Nx | Anyone who has worked on a TypeScript monorepo knows where things are at once; CI path filters stay simple (`apps/studio/**`); `packages/xfa-engine` already follows it | `p2`/`contracts` must become real packages (stage 2): about 150 import lines change |
| Shared code as **packages with names** (`@expat-ready/contracts`, `@expat-ready/ai-spend`), not `../../../p2/` imports | **Explicit module boundaries** (npm workspaces; "acyclic dependencies principle", R. C. Martin) | A move can no longer break imports silently; the p5 ↔ studio loop goes away | One-time change to `package.json` workspaces and `tsconfig` paths |
| Paths **from one root finder**, never by counting `..` | **Single source of truth for configuration** (12-Factor III, config in the environment) | Today `policy.ts` decides where the secrets file and the shared spend ledger live by counting folder levels. One wrong count after a move makes each copy keep its **own** ledger, which silently breaks the shared spend cap (QA-90) | A new test that fails if the root has no `AGENTS.md` |
| `docs/` at the root | **GitHub's documented convention** (`docs/` is a Pages source and a community-health location); **Diátaxis** split between living guides and reference | One obvious place for rules, product, decisions and state; the root stays short | Every skill and lane brief must use the new path (stage 6, when the queue is empty) |
| `docs/decisions/` | **ADR practice** (M. Nygard; MADR uses `docs/decisions/`) | DECISIONS.md rows keep their numbers; detail files sit next to them | None (no row is renumbered or cut, P-188) |
| `docs/records/` apart from living docs | **Records management**: keep live records apart from evidence (ISO 15489 idea; Diátaxis separates "reference" from "explanation") | People see the 18 living files first, not 7,000 evidence files | Deeper paths for evidence (still shorter than today: about 40 characters saved per path) |
| `reference/` (read-only inputs) | **Vendored-input convention** (read-only third-party inputs are kept apart, like `third_party/` in Google's monorepo) | The push guard and CODEOWNERS can protect one folder | `sync-requirements.sh` and `fetch_official_sources.py` change their target path |
| `tools/` at the root | **"Scripts to Rule Them All"** (GitHub's `script/` pattern) and Google's `tools/` | Hooks and CI call `tools/x.sh`, not a 60-character path | 8 hook commands change at once: old-path stubs keep running sessions working (stage 5) |
| `.github/CODEOWNERS` and a root `README.md` | **GitHub community standards** (README, LICENSE, SECURITY, CODEOWNERS) | A new engineer or the partner team can find their way in a minute; the reviewer is assigned by path | None |
| `docs/PATHS-MOVED.md` instead of rewriting records | **P-188 / AGENTS rule 8** (records keep their facts) and the **"permalink" practice**: never break an old reference, redirect it | Old records stay true as written; any old path can be looked up | Readers of an old record take one extra lookup |
| Pure `git mv` stages, separate from content edits | **Rename detection** in git (`-M`, ort merge) works best when a file moves without changing | Reviewers check a move in seconds; open PRs rebase cleanly | More, smaller PRs (8 instead of 2) |

**Rejected:** (a) a full rename into `src/` (single-app style), because we already have two packages and a monorepo layout fits better; (b) splitting into several repositories, because it would double the CI, review and merge-queue cost and break atomic changes across app and contracts (the monorepo argument from Google and Meta); (c) Git LFS for old screenshots, because it needs a history rewrite to help, which rule 1 forbids (LFS only for new files: stage 8).

### 2.2 What the founder will see

The app is in `apps/studio`. The rules, state and backlog are in `docs/`. The board is in `docs/board` (built by `tools/board`). The official sources are in `reference/`. Nothing named "ai-workers", "problem-1" or "prototype" is left.

---

## 3. Staged migration

**Ground rules for every stage**
- **One stage = one PR**, opened by the clean-up agent on its own branch. The reviewer approves it, Mergify merges it. Each PR is either a **pure move** (only `git mv`, no content change) or a **small reference PR** (under 800 changed lines), never both. A pure move counts as moves under the 800-line rule.
- **How a reviewer checks a pure move:** `git diff --stat -M100% origin/main...HEAD` must show only `R100` rows (renamed, 100% the same). `git diff -M100% --diff-filter=AMD origin/main...HEAD` must print nothing. A one-line script, `tools/check-pure-move.sh`, does both and goes into the PR body.
- **How a reviewer checks an archive PR:** `git diff --diff-filter=AMR --name-only` prints nothing (deletions only); `git grep` shows no live reader of the removed paths (the stage's reader list, pasted in the PR).
- **When:** stages 3 to 6 move files that open PRs are editing. They run **only when the merge queue is empty** (a drain window like today, P-660). The Lead announces the window, lanes stop pushing for ~30 min, the stage lands, then lanes rebase (guide below).
- **After every stage:** the full CI is green on `main`; `tools/check-docs.sh` passes; the board builds (`cockpit-data.py` + cockpit-tests); `start.sh` brings the app up on `:4400` in a scratch worktree (never the main copy) and `demo-smoke.mjs` passes; `tools/check-stale-paths.sh` (new, stage 0) finds no old path in any live file.
- **Rollback for every stage:** `git revert -m 1 <merge commit>` in one PR. Pure moves revert cleanly by construction. No stage touches the database schema, secrets or `.tools/`.
- **Records:** each stage adds its rows to `docs/PATHS-MOVED.md`, and an A154 change-log row for any `.github/`, `.claude/` or `.mergify.yml` change.

**Rebase guide for open PRs** (posted by the Lead after each move stage):
```
git fetch origin
git -c merge.directoryRenames=true rebase origin/main
```
`merge.directoryRenames=true` makes git put new files that a PR added under an old folder into the new folder (git's default only reports a conflict). An edit to a moved file follows the move by itself. If the PR also changed a path string that the stage changed, keep the new path.

| # | Stage | Kind | Size (est.) | What moves / changes | Reference updates in the same or next PR | Proof it didn't break | Needs empty queue? |
|---|---|---|---|---|---|---|---|
| 0 | **Safety net** | tooling | ~150 lines | Tag `history/pre-cleanup-2026-11` on `main`; add `tools/check-pure-move.sh` and `tools/check-stale-paths.sh` (fails if a live file names a moved path; the list grows each stage); add `docs/PATHS-MOVED.md` (empty table); one `paths.ts` root finder (looks up the folder that holds `AGENTS.md`) with a test | none | CI green | No |
| 1 | **Archive October history** | deletions only | ~1,000 files deleted, 0 added | `ai-workers/illustrations`, `checks`, `requirements`, `research`, `commercial`, `problem-2-…`, `ai-workers/*.md`, `ai-workers/tools/` except `prompt-log.sh` and `freshness.sh`, `delivery-reset-…`, `playbook/`, `requirements-planning/`, `fresh-start-prompt.md`, `P1/devin-review`, P1 root pages, dead `launch.json` entries | CLAUDE.md "Folders" line; PATHS-MOVED rows ("archived at tag …") | `git grep` for each removed path in live files = none; CI green | No (nobody edits these) |
| 2 | **Fix the spend-guard root, then make packages** | code | 2 PRs, each <800 lines | (2a) `p2/policy.ts`: `ROOT`, `KEY_FILE`, `OFFICIAL`, `INVENTORY`, the shared-ledger lookup all use `paths.ts`; a test proves the ledger resolves to `.tools/p2-ledger` from every copy. (2b) `git mv` the live p2 files → `packages/ai-spend/`, `contracts/` → `packages/contracts/`; npm workspaces; ~150 import lines from `../../../p2/x.ts` to `@expat-ready/ai-spend` | Dockerfile `COPY`, ci.yml cache paths | **The fake launcher only** (never a live switch, P-175); the ledger test; full CI | **Yes** (studio imports change) |
| 3 | **Move the app** | pure move | ~2,050 renames, 0 edits | `P1/prototype/studio` → `apps/studio`; `p5/transforms.ts` + `p5/reader` → `apps/studio/engine/reader` | Next PR (<300 lines): ci.yml `S:` (5 jobs), demo-update.yml, Dockerfile `ARG P`, Mergify `/prototype/` rule, 14 module-card symlinks and their `paths:` globs, `start.sh` comment, skills (screen-build, next, qa, journey-test…), AGENTS.md, CLAUDE.md, lanes | `check-pure-move.sh`; then full CI; `start.sh` on :4400 + demo smoke; module-cards workflow | **Yes** |
| 4 | **Move reference inputs** | pure move + small edit | ~230 renames + ~40 lines | `official-sources` → `reference/official-sources`; newest requirement snapshot → `reference/requirements/`; p1 inventories → `reference/form-inventories/`; older snapshot archived | ci.yml fetch step, push guard, `sync-requirements.sh`, `paths.ts` | fetch step in CI; push guard test | No |
| 5 | **Move the tools** | pure move + shims | ~155 renames + ~120 lines | `P1/product/tools` → `tools/`; `prompt-log.sh`, `freshness.sh` → `tools/`; board code → `tools/board/` | `.claude/settings.json` (8 hook commands), 10+ workflow steps, `.githooks/pre-push`, skills. **Old-path stubs** (`exec bash "$root/tools/x.sh" "$@"`) stay 7 days so sessions started before the move keep working; removed in a later PR | `tools/check-guards.sh` in a scratch clone (never the main copy); a new session start in a scratch worktree runs every hook | **Yes** |
| 6 | **Move the docs** | pure move | ~7,600 renames | `P1/product/*.md` → `docs/`; `screens`, `qa`, `design`, `reports`, `scout`, `history` → `docs/records/`; `cockpit` data → `docs/board/` | Separate PR (Lead-owned files): every skill, agent, lane brief, AGENTS.md, CLAUDE.md, `library.json` (8 paths), `queue-gate.sh`, `trace-requirements.py`, `check-docs.sh`. The Lead writes STATE/RULES pointer lines itself | `check-docs.sh`; board build; cockpit-tests; Library links open | **Yes**, and the Lead edits STATE/RULES in the same window |
| 7 | **Finish** | small | ~200 lines | Remove the empty `ai-workers/` and `P1/` folders; root `README.md` (what, where, how to start); `.github/CODEOWNERS` by folder; repository rename (Question 1) as a GitHub setting, after the org move is checked | Claude cloud environments, routines, Mergify app, Remote Control repo names | Clone by new name; old URL redirects (GitHub keeps redirects after a rename); one cloud session starts | No |
| 8 | **Stop the screenshot growth** | policy + guard | ~100 lines | New screenshots: keep the 3 named per screen in git (≤300 KB each); the rest go to CI artifacts (30-day retention) or Git LFS for new files only. A size guard in the push guard. ADR in `docs/decisions/` | lane briefs, screen-build skill | push guard test | No |

**Order and timing:** stage 0 and 1 can land on Wed 18 Nov after the org move is checked. Stages 2 to 6 need empty-queue windows; at one window a day that is **Thu 19 to Tue 24 Nov**, one stage per window. Stage 7 and 8 follow. If a stage's checks fail, it is reverted at once and retried in the next window; later stages wait.

---

## 4. Risks, costs and what must NOT move

### 4.1 Risks (most serious first)

| Risk | How likely / how bad | Mitigation |
|---|---|---|
| **The spend cap breaks silently**: `policy.ts` counts folder levels to find the secrets file and the shared ledger. After a move, each copy could keep its own ledger, so the shared spend cap stops working | Certain if not fixed first; bad (real money, QA-90, P-175) | Stage 2a fixes it **before** any move, with a test; checks use the fake launcher only |
| **Running sessions call hooks at the old path** (merge guard, lane preflight, model guard) | Certain for sessions started before stage 5; a missing merge guard is a safety gap | Old-path stubs for 7 days; the Lead restarts lanes after stage 5 |
| **Open PRs conflict** (40 open today, most in `prototype/studio`) | High if we move during busy hours | Moves only when the queue is empty; rebase guide with `merge.directoryRenames=true`; pure moves only |
| **Mergify / GitHub merges** use their own merge settings, not ours | Medium | Again, move only when the queue is empty, so nothing queued straddles a move |
| **Cloud sessions, routines and the board** hold old paths in their prompts | Medium | `check-stale-paths.sh` over `.claude/`, `.agents/`, `.goose/`; the Lead updates routine prompts; `PATHS-MOVED.md` |
| **Old records point to missing paths** | Certain, low harm | Records are not rewritten (P-188); `PATHS-MOVED.md` maps every old path; the tag keeps archived files one command away (`git show history/pre-cleanup-2026-11:<path>`) |
| **CI path filters miss a moved folder** (a job stops running) | Medium | After each stage, compare the list of jobs that ran with the one before |
| **Doing this during the org move** | Two changes at once make failures hard to blame | Nothing starts until the move is checked (P-660) |

### 4.2 Costs (estimates)

- **Time:** about 2 working days of clean-up-agent work spread over ~6 calendar days (one stage per quiet window), plus ~30 min of lane pause per move stage (4 stages).
- **Tokens:** about 1.5–2.5 M tokens for the agent (mostly reading CI output and grepping). Reviews of pure moves are cheap (one script output).
- **CI minutes:** about 10 full CI runs (one per stage plus follow-ups). The repo is public, so the minutes are free; the real cost is queue time, which is why stages wait for empty windows.
- **Money:** none. No paid AI run is needed at any stage.

### 4.3 What must NOT move or change

- **`sources/`, `code/`, `archive/`** stay outside git and outside this plan (AGENTS rule 1, rule 3). The push guard keeps refusing them.
- **`.tools/`** (Node, Postgres data, secrets, the shared spend ledger) stays local and stays where it is.
- **Records keep their facts** (P-188, AGENTS rule 8): no DECISIONS row, STATE history block, QA verdict, screen record or report is reworded, shortened or renumbered. Old paths inside records stay as written and resolve through `PATHS-MOVED.md`.
- **No history rewrite**: no `filter-repo`, no force-push, no LFS migration of old files (AGENTS rule 1).
- **The Lead's files** (STATE, RULES, DECISIONS, BACKLOG) are moved by `git mv` only; any change to their content is the Lead's.
- **Database schema and migrations** don't change; only their folder does (Prisma's `prisma.config.ts` paths are relative to the app and move with it).

---

## 5. Questions for the founder (asked one at a time)

1. **Repository name** after the move into `expat-ready`: `expat-ready/xpatready` says "expat ready" twice. Recommendation: rename it to **`expat-ready/platform`** in stage 7, after the org move is checked (GitHub redirects the old name).
2. **October history** (~1,000 files that nothing reads: one-pager drafts, illustrations, checks, problem 2, delivery reset, playbook): recommendation: **remove them from the main tree, with a git tag that keeps them one command away** (P-188: git history is the archive), not copy them into `docs/history/`.
3. **Business plan in a public repository**: `commercial/` (`plan.docx`, `model.xlsx`, market and funding research) is in a **public** repo. Recommendation: **move it to the founder's private GitHub home** and remove it from this tree. (It stays in public git history: anyone who already cloned the repo has it. Removing it from history would need a rewrite, which rule 1 forbids.)

Answers are recorded below as the founder gives them.

### Founder's answers
- Q1 (17 Nov, ~13:4x IST): **"platform (Recommended)"**: rename to `expat-ready/platform` in stage 7, after the org move is checked.
- Q2: **"Remove + git tag (Recommended)"**: stage 1 removes the October files from the main tree; tag `history/pre-cleanup-2026-11` keeps them.
- Q3: **"Move to private home (Recommended)"**: `commercial/` is copied to the founder's private GitHub home (the copy is checked file by file), then removed from this tree in stage 1. Old copies remain in public history (no rewrite, rule 1).
