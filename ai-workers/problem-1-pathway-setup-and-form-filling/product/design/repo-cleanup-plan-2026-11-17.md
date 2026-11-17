# Repository clean-up plan — 17 Nov 2026 (A155, phase 1: plan only)

Author: the repository clean-up agent (Opus 5.5, P-608), reporting to the tech lead. Status: **founder answered Q1–Q3 on 17 Nov; plan approval and the Lead's go pending**. Nothing has moved yet. Phase 2 (doing the moves) starts only after (a) the founder approves this plan, (b) the move into the `expat-ready` organisation is done and checked (Wed 18 Nov 09:30 IST, P-660), and (c) the Lead says go.

Measured on `main` at `ceaf13037` (17 Nov, ~13:00 IST). Every number below comes from `git ls-files`, `git grep` or the GitHub API on that commit.

---

## Summary in plain words

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

## 0. Architecture choice (founder asks, ~12:15 and ~12:3x IST: "best in class, most scalable, most fast moving"; size it for ~500 capabilities after Release 1, with AI as its own layer)

### 0.1 What we are sizing for
- **Today:** one deployable app (`studio`: NestJS api + React web + a pg-boss job worker on one PostgreSQL), ~78k lines of app code in 492 files, 101 Release 1 capabilities, 26 Prisma schema files (one per area), 19 ports already (`ports/*.ts`: audit, billing, events, jobs, mail, messages, files, secret-box, …), 14 module cards checked in CI.
- **After Release 1:** ~500 capabilities in about 12–15 business areas: platform (identity, firms, tenancy, billing, messages), front office (booking, sales, retainers, signing), case side (cases, documents, checklists, filings), configuration (programs, structure, rules), form library and XFA engine, runtime (questionnaires, filling), client money, audit and compliance, reporting, integrations, client portal, **and AI across all of them**.
- **Load profile** (Unconfirmed: no measured forecast; a Sample sizing): a B2B tool for immigration firms. Thousands of firms and tens of thousands of users, not millions of requests per second. The heavy parts are AI runs, PDF/XFA work and document reading: slow, bursty jobs that cost money. The core read/write traffic is modest.

### 0.2 The options compared

Scores: ●●● strong, ●● fair, ● weak, for *our* size and team (one founder, AI builder lanes, one reviewer, merge queue).

| Option (source) | Speed of change | Scales to 500 capabilities | Quality / safety | Ops cost | Agent-friendly | When it is right |
|---|---|---|---|---|---|---|
| **Classic monolith** (one codebase, no internal fences) | ●●● at first, then ● | ● (Shopify's "big ball of mud" problem, *Deconstructing the Monolith*, 2019) | ● changes leak everywhere | ●●● | ● an agent can't see what it may touch | Early POC only. **This is roughly where `api/src` is today** (151 files in one flat folder, one `@Module`) |
| **Modular monolith** (one deployable, hard module fences, public contracts; Shopify *Under Deconstruction*, 2020, and its Packwerk tool; K. Grzybek, *Modular Monolith* primer) | ●●● one PR can change a contract and both sides atomically | ●●● Shopify runs one of the largest Rails apps this way | ●●● fences checked in CI; one transaction, one database | ●●● one deploy, one database | ●●● small fenced modules with cards fit AI lanes exactly (P-615) | **Our size now and at 500 capabilities.** Split a module out only on a measured trigger (0.4) |
| **Service-based** (a handful of coarse domain services sharing one database; Richards & Ford, *Fundamentals of Software Architecture*, 2020, ch. 13) | ●● | ●●● | ●● | ●● 3–6 deploys | ●● | The usual next step **if** two or three areas need separate deploys; the cheap halfway house before microservices |
| **Microservices** (Lewis & Fowler, *Microservices*, 2014) | ● for a small team: every change crosses repos and contracts (Fowler, *Microservice Premium*, 2015; *MonolithFirst*, 2015) | ●●● per service | ●● distributed failures, eventual consistency | ● many deploys, a service mesh, tracing, on-call | ● an agent has to reason across network contracts and environments | Many independent teams. Cautionary cases: Segment's *Goodbye Microservices* (2018) and Amazon Prime Video's monitoring moving back to one process (2023) |
| **Hexagonal / ports-and-adapters** (A. Cockburn, 2005) | ●●● | ●●● | ●●● tests swap adapters; vendors swappable | ●●● | ●●● | **Not an alternative but the inside of each module.** Already in use (`ports/`); keep it and make it the rule |
| **Event-driven between modules** (Fowler, *What do you mean by "Event-Driven"?*, 2017; transactional outbox, C. Richardson, microservices.io) | ●● | ●●● decouples modules in time | ●● needs idempotency and replay | ●● (pg-boss and Postgres are enough; no Kafka) | ●● | **For side effects across modules** (a booking confirmed → a retainer drafted → a message sent). Calls stay synchronous for reads; events for "after this, also do that" |
| **Cell-based for tenants** (AWS Well-Architected, *Reducing the Scope of Impact with Cell-Based Architecture*, 2023; Slack's cellular move, 2023) | ●● | ●●● blast radius per cell | ●●● a bad deploy or noisy firm hits one cell | ● you run N copies | ●● | **Later, as a deployment topology**, not a code structure: when a large firm, data residency (Canada vs other regions) or a contract requires isolation. The same modular monolith is deployed per cell |
| **Monorepo** vs **polyrepo** (Potvin & Levenberg, *Why Google Stores Billions of Lines of Code in a Single Repository*, CACM 2016; Nx and Turborepo "affected" builds) | Monorepo ●●●: atomic changes, one CI, one review queue | ●●● with affected-only CI | ●●● one set of rules and guards | ●●● | ●●● an agent sees everything it needs in one checkout | Polyrepo only when separate organisations own the code |

### 0.3 Recommendation: a modular monolith in one monorepo, hexagonal inside each module, events between modules, cells later

1. **One monorepo, one main deployable, several entry points from the same code**: `apps/api` (HTTP), `apps/web` (browser shell), `apps/worker` (jobs: AI runs, PDF/XFA, messages). The worker is the first thing to scale on its own, and it does that without becoming a separate codebase.
2. **Modules as workspace packages with enforced fences**, one per business area: `modules/platform`, `modules/front-office`, `modules/cases`, `modules/configuration`, `modules/forms` (with `packages/xfa-engine`), `modules/runtime`, `modules/client-money`, `modules/audit`, `modules/ai`, …. Each module owns its `api/`, `web/`, `domain/` (pure rules, the "engine"), its Prisma schema file(s), its `contracts/` (zod types, STANDARDS §1 "zod contracts in a shared package"), its events, its tests and its `MODULE.md` card. Another module may import **only its public `index.ts`**, which a boundary check enforces (0.5).
3. **AI is its own module and a cross-cutting layer, behind one port.**
   - **Where AI code lives:** `modules/ai/`, which grows out of today's `rounds.ts` step runner, `cost-gate.ts`, `p2/ledger.ts`, `p2/policy.ts`, `p2/prompt.ts` and `p2/guard.ts`. It holds the model gateway (one door to every provider), prompts as versioned data, the spend caps and shared ledger, the checker round, and the evaluation sets (today's answer keys).
   - **How modules call it:** through an `AiPort` (`propose(task, inputs, evidence) → proposal`), never a provider SDK directly. The port returns a **proposal** that a person accepts (STANDARDS §3 rule 8), which goes into the one review queue.
   - **Its own data:** runs, prompts, costs, evaluations and model versions live in its own schema (`ai.prisma`). Other modules keep only the proposal ids they asked for.
   - **Cost:** every call carries the firm, the module and the capability, and is checked against per-firm and per-capability caps before it runs (P-175).
   - **Evaluation:** each AI capability ships with an evaluation set and a pass bar. CI runs the fake launcher; scored live runs happen only with a founder Go.
   - **Tenancy:** a run never sees another firm's data. The firm id comes from the request scope, never from the prompt.
   - **Why this shape:** it is the "AI gateway" pattern used by platform teams (one gateway for keys, quotas, logging and evals). Because there is one port, the AI module can later run as its own service (the first split candidate) without any module changing.
4. **Hexagonal inside every module** (already started with `ports/`): vendors such as Stripe, SES, Postgres jobs and the AI providers stay adapters.
5. **Events between modules for side effects**, through a transactional outbox in PostgreSQL drained by pg-boss (already in the stack, so no new technology). There is a `ports/events.ts` already.
6. **Trunk-based development with the merge queue we have** (trunkbaseddevelopment.com; DORA, *Accelerate*, 2018: loosely coupled architecture and small batches predict delivery performance), plus **affected-only CI**: run the tests of the modules a PR touches and of modules that depend on them, with the full suite in the queue. This is where the "most fast moving" comes from. Today every PR runs the whole suite, which is part of why the queue jams.
7. **Cells later**: the same build deployed per region or per large firm when a measured trigger fires (0.4).

### 0.4 When to split something out (measured triggers, not taste)
| Trigger | Measure | First candidate |
|---|---|---|
| Different scaling profile | the worker's queue wait time or CPU stays above target for a week while the api is idle | `apps/worker` gets its own scaling (still the same code) |
| Fault isolation from a vendor | provider outages or slow responses hurt request latency | `modules/ai` as its own service behind the same `AiPort` |
| Data residency or contract isolation | a firm or region requires it in writing | cells (deploy per region or firm) |
| Release cadence clash | a module is blocked by others' merges more than X% of the time (merge-queue data) | that module as a service-based split |
| Team topology | more than one full team works on one module (Team Topologies, Skelton & Pais, 2019) | split that module |

### 0.5 Boundary tooling (proposed through the STANDARDS §1 gate, not installed)
- **dependency-cruiser** (MIT, a small library, no framework): rules such as "a module imports only another module's `index.ts`", "no imports of `apps/` from `modules/`" and "no cycles". It is the closest match to Shopify's Packwerk for TypeScript. **Preferred**, because the gate says a small library before a framework.
- **Nx** `enforce-module-boundaries` and **Turborepo** `--filter=...[origin/main]` give affected builds. Nx is a framework, so it has a bigger upkeep cost. Turborepo is a smaller step for affected-only CI. Decide in the gate record (problem, options, upkeep, licence, when to reconsider).
- All of them start **report-only** (founder ruling T14) and become blocking only by a later decision.

**Question to the founder (asked once, below):** approve the modular monolith in one monorepo, with AI as its own module behind one port and splits only on the triggers in 0.4?

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
| `P1/prototype/p5/evidence`, `ui`, `drafts`, `server.ts`, `release_d30.ts` … | ~50 | POC P5 demo and evidence | No, **except `p5/fill.py` and `p5/reader/`** (read at run time; corrected 17 Nov, §7) | `p2/policy.ts`, studio | **Archive** the rest after a run-time grep; `fill.py` and `reader/` move with the app |
| `P1/prototype/p1/inventory/*.json` | 2 of 127 | Form inventories; **the engine reads them at run time, and database rows store their paths** (`inventory_file`, corrected 17 Nov, §7) | **Live** | engine, `policy.ts`, `p5/engine.ts`, tests | **Move** the inventory → `reference/form-inventories/`; **Archive** the rest of p1 |
| `P1/prototype/p3`, `p4`, `evidence-lane`, `expected`, `tests`, `env`, root `*-manifest.sha256`, `*-handoff-*.md`, `package.json`, `trace.csv` | ~360 | POC P0–P4 code, manifests and hand-overs. **Corrected 17 Nov (§7): `p3/releases/c1-v3` (the demo's sample release), `expected/` (read by `own-yes-no.ts` and the AI guard) and `tests/check_p2_shared_ledger.ts` are live** | Mostly no (launch.json's `p3-review` is dead) | Dockerfile.dockerignore excludes them; one journey doc mentions evidence-lane | **Archive** (POC evidence stays in git history, P-188) |
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

**How this grows (section 0.3):** `apps/studio` is the first step. Section 6's refactor stages R3–R7 then split it into `apps/api`, `apps/web`, `apps/worker` and one `modules/<area>/` package per business area (with `modules/ai`). `packages/` keeps libraries that hold no business area (`xfa-engine`, `contracts`).

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

4. **Architecture** (section 0, asked 17 Nov at the Lead's request): approve the modular monolith in one monorepo, with AI as its own module behind one port?

Answers are recorded below as the founder gives them.

### Founder's answers
- Q1 (17 Nov, ~13:4x IST): **"platform (Recommended)"**: rename to `expat-ready/platform` in stage 7, after the org move is checked.
- Q2: **"Remove + git tag (Recommended)"**: stage 1 removes the October files from the main tree; tag `history/pre-cleanup-2026-11` keeps them.
- Q3: **"Move to private home (Recommended)"**: `commercial/` is copied to the founder's private GitHub home (the copy is checked file by file), then removed from this tree in stage 1. Old copies remain in public history (no rewrite, rule 1).
- Q4 (architecture, 17 Nov): **"Modular monolith (Recommended)"**: one monorepo, fenced modules with contracts, AI as its own module behind one `AiPort`, events between modules, affected-only CI; splits only on the triggers in section 0.4.

---

## 6. Code structure (founder ask, ~12:1x IST: module by module, feature by feature, each with its own notes; read-only review, measured on `ceaf13037`)

Founder rulings respected: **P-668 T17: no comment ban** (why-comments stay, P-615); **T14: linting starts report-only**; **P-674: code moves after the org move, in stages**.

### 6.1 What is there today (measured)
| Area | Files / lines | How it is organised | Card (P-615) |
|---|---|---|---|
| `api/src/` root | **151 files, 31,877 lines, flat** | No folders: configurator, forms, library, cases, AI and demo code side by side (`studio.ts` 1,284 lines, `runtime.ts` 1,065, `proposals.ts` 1,038, `case-prepare.ts` 1,021, …) | 7 cards (`MODULE.ai-runs/cases/configuration/core/demo/forms/library.md`) claim files by **brace-glob filename lists**, not folders |
| `api/src/platform/` | 66 files | **By feature** (identity, messages, observability, jobs, firms, terms, web-address, …) | 1 card |
| `api/src/front-office/` | 28 files | **By feature** (booking, sales, retainers, signing) | 1 card |
| `api/src/features/` | 106 files | **Registration by feature** (P-214), but split by layer from their code: `features/platform-identity.ts` registers code in `platform/identity/`; plus the checkpoint steps (48) | 1 card |
| `api/src/main.ts` | 249 lines | **The only NestJS `@Module`**: 34 controllers and 50 providers listed by hand, the rest through `features/` | in core |
| `engine/` | 94 files | Pure rules, flat (53 at the root) + `runtime/` | none |
| `web/src/` | 181 files | `pages/` (35) and `components/` (52) **by type**; `modules/front-office`, `modules/platform` **by feature** (routes gathered by `import.meta.glob`); `runtime/` | 4 cards |
| `ports/` | 19 ports | Hexagonal adapters | none |
| `prisma/schema/` | 26 files | **By area already** (`cases`, `forms`, `front-office-*`, `platform-*`, …) | n/a |
| Module-card CI | `module-cards.yml` + `module-cards.py` | A PR that touches a module's file must change its card or say `Card unchanged: <reason>`; cards ≤40 lines; every rule links to a card | 14 cards |

**In short:** platform and front office are already organised module by module and feature by feature. The configurator core, which is the oldest and largest part, is a flat folder fenced only by filename lists. Web is half by type (pages, components) and half by feature (modules).

### 6.2 Gaps
1. **Boundaries are not enforced in code.** The cards say what belongs where, but nothing stops an import. Imports that go the wrong way, from the measured import graph: core → platform 6, core → features 5, core → front-office 1, platform → core 11, front-office → core 4. Imports into another module's internals (not a public `index.ts`): almost all of the 216 features → core and 39 features → platform edges.
2. **The flat core.** 151 files in one folder: a new builder (or an AI lane) cannot see which files make one capability.
3. **A feature lives in two places:** `features/platform-x.ts` and `platform/x/`. Feature-by-feature (vertical slice, J. Bogard, *Vertical Slice Architecture*, 2018) means one folder per feature.
4. **Web by type:** `pages/` and `components/` mix configurator, library and review screens.
5. **Big files:** 16 production files over 600 lines (largest: `api/src/studio.ts` 1,284; `web/src/runtime/questionnaire.tsx` 1,135; `front-office/booking/service.ts` 932).
6. **Code still outside the app:** the p2/p5/contracts imports (section 1b, stage 2) and `p5/transforms.ts` ↔ `studio/engine/options.ts` (a loop).
7. **Two more depth-counting paths** (like `policy.ts`): `check-module-cards.sh` sets `ROOTD` by counting `../../../..`. Stage 0's root finder covers it.
8. **No card** for `engine/` or `ports/`.

### 6.3 Dead code, duplicates, comments (a measured sample: my own scripts over `git ls-files`, imports resolved with the `@/` alias. A proper tool would find more; see 6.4)
- **Files nothing imports:** 6 of 492. Of these, `web/src/components/ui/badge.tsx` and `card.tsx` are really unused. The other 4 are loaded on purpose (`modules/*/routes.tsx` by glob; `engine/xfa/run-engine.mjs` as a child process). **Delete candidates: 2 files.**
- **Exports used nowhere** (the name appears once in the whole app): **20** of 3,374. Examples: `platform/settings.ts` `LANGUAGE`, `CURRENCY`, `REQUIRE_TWO_STEP`; `platform/firm-scope.ts` `ownFirm`, `currentBypass`; `engine/pqr-picks.ts` `matchFact`. Some may be read by tests through other names, so each one is checked before removal.
- **Exports used only inside their own file:** ~526 more. These are harmless, but the `export` keyword can go so a module's surface is honest. That job belongs to knip, not a hand pass.
- **Duplicated code:** 3 identical 8-line blocks across files (`change-sets.ts` ↔ `where-used.ts`, 2 blocks; `qd-draft.tsx` ↔ `questionnaires.tsx`, 1). **Very low.**
- **Comments:** 15,229 of 77,870 non-blank lines (19.6%). Within the usual range for code that records *why* (rule ids, decision rows). Per **P-668 T17 there is no comment ban and no bulk removal**. A reviewer may flag a comment that only restates the code or names a closed bug, case by case.
- **Verdict:** the code is **not** bloated. Dead code and duplication are small. The real work is **structure**: fences, folders by module and feature, and smaller big files.

### 6.4 Tools proposed (STANDARDS §1 gate: one record each, report-only first, T14; nothing installed)
| Tool | Gap it closes | Licence / upkeep | Mode |
|---|---|---|---|
| **knip** | unused files, exports, dependencies (finds what 6.3 sampled, exactly) | ISC, one config file | report-only CI job, a weekly list |
| **dependency-cruiser** | module fences and cycles (0.5, 6.2 gap 1) | MIT, one rules file | report-only, then blocking by decision |
| **jscpd** | duplicate blocks | MIT | report-only, monthly |
| *(rejected)* **ts-prune** | unused exports | in maintenance mode; its README points to knip | not proposed |

### 6.5 Staged refactor (after the layout stages 0–6 in section 3; same rules: one PR each, pure moves apart from edits, an empty queue for moves, a revert per stage)
| # | Stage | What | Size | Proof |
|---|---|---|---|---|
| R0 | **Measure** | knip + dependency-cruiser + jscpd as one report-only CI job (after the gate records); a baseline file | ~150 lines | job runs, numbers match 6.3 |
| R1 | **Cards for engine and ports** | 2 new cards; `check-module-cards.sh` root finder | ~80 lines | module-cards CI |
| R2 | **Fix backward imports** | core → platform/features/front-office (12 edges) inverted through ports or moved | <800 lines, code | full CI |
| R3 | **Group the flat core by its cards** | `git mv` the 151 files into `configuration/`, `forms/`, `library/`, `cases/`, `ai-runs/`, `demo/`, `core/`, which are exactly the 7 cards' lists; card `paths:` become folder globs | pure move + an import-fix PR | `check-pure-move.sh`; full CI |
| R4 | **One folder per feature** | each `features/<x>.ts` moves next to its code (`platform/identity/feature.ts`); `registerFeatures` globs `**/feature.ts` | pure move + a ~50-line loader change | start-up registers the same controllers and providers as before (a test compares the lists) |
| R5 | **Web by module** | `pages/` and `components/` move under `web/src/modules/<area>/`; shared UI stays in `components/ui` | pure move + import fixes | Playwright journeys, axe |
| R6 | **Modules become packages** | `modules/<area>` with `index.ts` (0.3), app shells in `apps/api`, `apps/web`, `apps/worker`; dependency-cruiser turns blocking (a founder decision) | one module per PR, smallest first (audit, then platform) | affected-only CI shows the right modules |
| R7 | **AI module** | `rounds.ts`, `cost-gate.ts`, `packages/ai-spend` → `modules/ai` behind `AiPort` | 2–3 PRs | ledger test; fake launcher only |
| R8 | **Big files, when touched** | split the 16 files over 600 lines when a capability next changes them (boy-scout rule), never in one sweep | per PR | each PR's own tests |
| R9 | **Dead code** | remove the 2 files and 20 exports (each checked), then knip's list | <300 lines | full CI |

**Cost (estimate):** R0–R5 take ~3–4 working days of agent time and ~3–4 M tokens. R6–R7 are spread over the Release 1 work (one module per quiet window). There are no paid AI runs.

---

## 7. Corrections and preparation (17 Nov, afternoon; branches local, nothing pushed to main)

### 7.1 Corrections to sections 1 and 3 (measured on `499bf07ef`)
1. **The POC folders are partly live at run time**, not only through imports:
   - `p3/releases/c1-v3` is the demo's sample release (`demo.ts`, `p5/engine.ts`).
   - `expected/` is read by `own-yes-no.ts` and by the AI guard (`p2/guard.ts`).
   - `p1/inventory` is read by the engine.
   - `p5/fill.py` and `p5/reader/` run.
   - `prototype/tests/check_p2_shared_ledger.ts` is the shared-ledger test.

   These move as data with the app (stage 2b/3) and are never archived. Section 1b now says so.
2. **Database rows store repository paths.** `form_inventory.inventory_file` and its twin hold paths relative to problem 1 (`prototype/p1/inventory/…`, `official-sources/…`). The engine joins them onto `SOLUTION`. Seeds and released configurations hold about 4,600 `official-sources/…` and 440 `prototype/p1/inventory…` strings.
   - **Rule for every move stage:** a stored path is never rewritten in place. `repo-paths` gets a `fromStored(path)` map from the old prefix to the new one, used wherever the code reads a stored path, together with a test that loads a seeded row.
   - A data migration, if ever needed, is a separate reviewed PR (no schema change).
3. **Folder counting is everywhere, not in two files.** About 400 lines in about 340 files work out a folder by counting `..`. About 300 of them reach outside their own folder: 265 in studio tests, 19 product tools, 15 acceptance files, 13 API files, 9 studio tools.
   - "ROOT" means three different folders in different files (the repository, problem 1, the prototype).
   - In tests, a wrong path fails loudly. In production code and tools it can fail quietly: the spend ledger, the official sources and the hooks.
4. **The Docker image** copies only problem 1's `prototype/` and `official-sources/`. It now also copies `AGENTS.md` and `packages/repo-paths` (stage 2a).
5. **Other hidden folder counts:** `check-module-cards.sh`, `check-docs.sh` and 14 more tools did the same. They are covered by stage 2a or 2c.

### 7.2 What is ready (local branches in the clean-up copy, from `origin/main` `499bf07ef`; each passes its own checks)
| Branch | Commit | What | Proof run here |
|---|---|---|---|
| `cleanup/stage-0-safety-net` | `e986a1336` | `packages/repo-paths` + `repo-root.sh` (root by AGENTS.md, `REPO_ROOT` override with refusals), `check-pure-move.sh`, `check-stale-paths.sh` + `stale-paths.txt`, `docs/PATHS-MOVED.md`, tests | `check-cleanup-checks.sh` 14/14; `check_repo_paths.ts` 18/18 (against the **old** spend-guard code: the finder gives the same paths) |
| `cleanup/stage-1-archive-october` (on stage 0) | `86802739a` | 1,083 October files removed, `ai-workers/decisions.md` kept (PRODUCT.md cites it), CLAUDE.md folder line, stale list (23 paths), path map rows | `check-pure-move.sh --delete`: 1,103 D (with 1b), 3 allowed, 0 other; `check-stale-paths.sh` 0 hits; `check-docs.sh` OK |
| same branch | `afd4d2e2c` (**held**) | 1b: `commercial/` (20 files) removed | only after the private copy is checked (P-677); SHA-256 list in the Lead's notes folder |
| `cleanup/stage-2a-root-finder` (on stage 0) | `66be54145` | 33 callers switched: `p2/policy.ts`, `core.ts`, `canada.ts`, `field-format.ts`, `validate.ts`, `sample-validated.ts`, `own-yes-no.ts`, `files.ts`, `scan-logs.ts`, 6 studio tools, 16 product tools (3 hooks), Dockerfile + ignore | `check_repo_paths.ts` 18/18 (ledger = `.tools/p2-ledger`, as before); runtime probe of `core.ts` and `canada.ts` 7/7; typecheck error list **identical** to main's (80 known-environment lines in both); 8 of 10 changed tool tests pass, and `check-isolated-ttl` and `check-comment-run` give **the same results as main** here (they need the demo database or GitHub); `bash -n` on all 15 shell files |

**Stage 2a, Done when (Lead 78, 17 Nov), before its PR opens:** the full suites (`run-suites.sh`, every shard), the Docker build of `studio/Dockerfile` with the image answering `/api/health`, and `start.sh` bringing the app up on :4400 in a scratch copy with `demo-smoke.mjs` passing. All green, each with its run link or log in the PR.

**PRs for stages 0, 1 and 2a** open only on the Lead's word, after the move is verified, the queue is back on and the first merges are through on 18 Nov (full-power plan §C). **1b stays held** until the private copy matches the SHA-256 list file by file (P-677).

**Not run here (CI or the Lead):** the full suites, the Docker build, `start.sh` on :4400 with the demo smoke test (the demo database is not running in this copy, and the main copy is never used for tests).

### 7.3 Revised order (Lead 78, P-688, P-674)
- **18 Nov, after the move is verified and the first merges land:**
  1. Stage 0. The tag `history/pre-cleanup-2026-11` is made on main right after stage 0 merges.
  2. Stage 2a. It touches no file any of the 44 open PRs edit.
  3. Stage 1, without 1b.
  4. Stage 1b once the private copy is checked.
- **Stage 2c (new), in an empty window:** the files open PRs edit (`check-docs.sh`, `check-g4-rules.sh`, `check-guards.sh`, `retainers/service.ts`, `seed-sample-firms.ts`, `compose.test.yml`, `restart-api.sh`) and the ~250 tests that count folders switch to the finder, in 2–3 PRs under 800 lines.
- **Then stages 2b to 8** as in section 3, with `fromStored()` and the live POC data (7.1) added to stage 2b/3.
- **Stage 7 (the rename)** stays separate (P-675).

