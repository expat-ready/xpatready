# Factory org templates: one role catalogue the Lead spins from (27 Nov 2026)

Design only, for the tech lead. Written 27 Nov 2026 IST by a design subagent (Opus 5.5, effort medium, P-608, P-788), read from origin/main f0c0a7fe0. Founder ask (16:1x IST): the Lead should "set templates, set the framework, set the processes, monitoring processes ... a class of resources under the lead ... this resource is reviewer ... for this resource these skills are there, these tools are required". Founder constraints (16:2x IST): "don't overcomplicate and over-engineer ... If it is useful, otherwise don't develop it ... rooted into the proven methodologies, frameworks, industry standards ... first principle of designs."

## Recommendation (5 lines)

1. Keep the mechanisms we have; they already follow the platform's documented pattern: agent files for in-session judges, skills for session roles, hooks for guards, Mergify for merging. No new agent file, plugin, team feature or GitHub feature.
2. The "template per role" the founder asked for is, for a subagent, its agent file (exists) and, for a session, its start brief. Briefs are the one thing still written by hand (`lead` skill lines 49-55), so add one script, `brief.sh <role> <row|mode>`, holding one short template per session role (builder, qa, standby, desk, integration). It fills the fixed parts; the Lead still writes the duplicate-search result and the founder's words, and `lane-preflight.sh` still decides.
3. The catalogue stays where builders already read it: the WAY-OF-WORKING "Roles" table gains two columns (starts with; skills / agent file), and the software-factory "Who does what" table points to it, so two tables become one.
4. The Lead "knows where everything is" from that one table plus the checks it already runs (lead-watch's lanes, qa and standby lines); no new watcher.
5. No new register row is needed: four existing rows are extended (LR-001, LR-103, LR-106, LR-121), shipped in one bulk PR of about half a day, best folded into LR-106's bulk FP-1 after the freeze.

## First principles: what the factory must do, and the smallest thing that does it

A change moves through eight jobs. Each job needs exactly one accountable owner (the "A" in a RACI chart; stated as a plain rule, not cited) and the judge must not be the maker (Anthropic C16 in the register: "Separating the agent doing the work from the agent judging it proves to be a strong lever"). The rest is plumbing.

| Life-cycle stage | Job that must be done | Owner (accountable) | Smallest mechanism that already exists |
|---|---|---|---|
| Plan / design | A row is ready: dup check, touch list, Done-when, decisions answered; new screens get a concept and a challenge | Lead | `lead` skill line 25; `screen-concept` skill (its §B challenge by a fresh agent); a read-only Explore subagent for drafting |
| Build | One row, one branch, one PR, self-checked | Builder (per area) | `/next <area>` skill; cloud session from a brief |
| Review | An independent verdict on the exact commit | Reviewer (+ breaker for risky) | `.claude/agents/screen-reviewer.md`, `screen-breaker.md` |
| Test | `main` works like a person expects; only qa marks "Works" | qa | `/qa <mode>` skill |
| Release | Only green, approved, current code merges; demo updates | Mergify (a service, not an agent) | `.mergify.yml`, label guard, demo deploy |
| Monitor | Something stopped or went quiet is noticed and restarted | Lead (standby covers the Lead) | `lead-watch` skill + `lead-watch.sh`, standby gap check |
| Recover | A red `main` or a bad merge is fixed first (DORA recovery time) | Lead | a revert or fix PR through the queue (`lead` skill line 30: "a red check on `main` ... is fixed first"); P-214 lets a checks fix jump the queue |
| Intake (before plan) | A founder ask is captured and every part answered | Lead | STATE "Founder asks" (`lead` skill line 18) |

Frameworks behind the choices (each cited at the end):
* **Orchestrator-workers and evaluator-optimizer** (Anthropic, "Building effective agents", [A1]): the Lead is the orchestrator, builders are workers, reviewer/breaker/qa are evaluators. Same source: add complexity "only when it demonstrably improves outcomes" ([A1]); this is the test every row below passes or is dropped by.
* **Team Topologies** ([T1]): builders are stream-aligned by area (screens, forms, runtime, evidence: they "own the outcomes"); the Lead plus the lab tools act as the platform ("services that accelerate stream-aligned teams, removing complexity"); the strategy desk is an enabling role. Its cognitive-load rule ("Each new tool, responsibility or domain your team is given taxes their mental bandwidth") is why builders get one row and one skill, and why this design adds one script and no new document for agents to read.
* **DORA** ([D1]): the factory is judged by change lead time, deployment frequency, change fail rate and recovery time, already measured by `flow-measure.py` (WAY-OF-WORKING "Daily measures"). No role is added that does not move one of them.
* **The platform's own pattern** ([C1]-[C9]): agent files for subagents with `tools`, `model`, `effort`, `skills`, `hooks` in frontmatter; skills for repeatable procedures; hooks for deterministic guards; cloud sessions load the repo's `.claude/` from a fresh clone. We use these as documented rather than inventing a layer.

## What exists today (inventory, origin/main f0c0a7fe0)

| Piece | Where (file:line) | What it does | Verdict |
|---|---|---|---|
| Reviewer agent | `.claude/agents/screen-reviewer.md:1-9` | Opus, medium; tools Read, Grep, Glob, Bash, Write; follows `screen-review` + `journey-test`; writes `screens/NN/review.md` and the journey-test report | Keep; LR-135 tunes its brief |
| Breaker agent | `.claude/agents/screen-breaker.md:1-12` | Opus, medium; same tools; attacks money/schema/permissions/new screens; writes only `break-report.md` | Keep |
| Skills (12) | `.claude/skills/*/SKILL.md` (469 lines total) | lead, lead-watch, next, qa, screen-concept/build/review, journey-test, strategy-desk, cto-review, grilling, immigration-structure | Keep; LR-117 moves the Lead-only ones private |
| Session model/effort | `.claude/settings.json:2-3` | `"model": "opus"`, `"effortLevel": "medium"` | Keep; LR-145 makes it org-wide |
| SessionStart hook | `.claude/settings.json:93` | `session-start.sh` | Keep |
| Merge guard | `.claude/settings.json:102-121` | `merge-guard.sh` on Bash, three entries with different `if` filters (merge, close, review) | Keep |
| Start guard | `.claude/settings.json:128-132`; `product/tools/lane-preflight.sh:1-14` | On `start_session`: Mac room, `brief-check.sh --brief`, focus list, touch overlap | Keep unchanged; it already checks brief content, so a generated brief needs no stamp |
| Model guard | `.claude/settings.json:139-143`; `product/tools/agent-model-guard.sh:1-10` | Agent/Task launches must be Opus medium unless "P-788 exception:"; checks only a model/effort the launch names | Keep; the literal is the one place P-788 lives |
| Cron guard | `.claude/settings.json:150-154` | `lead-check-guard.sh`: only the agreed check prompt | Keep |
| Stop hook | `.claude/settings.json:166` | `stop-check.sh` | Keep |
| Brief rules | `product/tools/brief-check.sh:1-30` | Done-when naming a test, Duplicate check line (fresh sha + IST time), model/effort line, Item line | Keep; `brief.sh` writes what it checks |
| How briefs are written | `.claude/skills/lead/SKILL.md:49-55` ("Sessions and tokens") | by hand, standard rules listed at line 52 | Replaced by `brief.sh` templates; the Lead still adds the founder's words (line 20) |
| Lane identity | `product/tools/lane.sh:3,20-44` | `whoami` → lead, screens, forms, evidence, runtime, qa, scout, unbound (`m3` only in the line-3 comment) | Keep; the catalogue lists every value; `scout` and the stale `m3` comment are mapped or retired in the PR (Lead's call) |
| Roles table | `product/WAY-OF-WORKING.md:5-17` | table of 9 roles on the page every builder reads | Keep as the one catalogue; add two columns |
| "Who does what" | `product/design/software-factory-2026-11-27.html:137` (LR-001) | second role table | Replaced by a pointer to WAY-OF-WORKING |
| Role coverage checks | `product/tools/lead-watch.sh:114` (standbys), `:137` (ACT when fewer than 4 qa lanes run while items wait), `:327` (quiet or flagged sessions) | the Lead's view of who is running | Keep; covers "where everything is" already |
| PR template | `.github/pull_request_template.md` | What and why, Plan, Checks, Questions, Done when, Duplicate check | Keep; LR-134 adds Risk/revert |
| Path owners | `.mergify.yml` (LR-157) | per-area owners for the queue | Keep; no CODEOWNERS |

Register rows already on this subject (dedupe, origin/main and `lead/2026-11-27-lead5`): LR-001 (who does what), LR-103 (model consistency in agent files and guards), LR-104/LR-123/LR-124/LR-101 (routines, watches off the Mac), LR-106 (generated task spec), LR-107 (design in plan mode), LR-108 (workflow trial), LR-117 (Lead-only skills private, plugin later), LR-121 (/goal line on every brief), LR-135 (reviewer brief), LR-142 (layer map), LR-145 (one model through managed settings), LR-152 (path-scoped rules), LR-153 (after-the-lab list: skill evals, Projects not for us). Highest on main: LR-153; LR-154-157 are on `lead/2026-11-27-lead5`. This design adds no row and extends 4.

## Role catalogue

All roles: Opus 5.5, effort medium (P-788); any other model only with a "P-788 exception:" line. "Tools" is the allow-list a subagent file sets, or for a session the permission set it inherits from `.claude/settings.json`.

| Role | Purpose (one job) | Spawned as | Skills | Tools / may write | Brief inputs (template) | Output | Done when |
|---|---|---|---|---|---|---|---|
| **Founder** (human) | Product direction, money above caps, accounts | — | — | — | — | decisions (DECISIONS.md via the Lead) | — |
| **Lead** | Orchestrate: shape rows, start/steer roles, keep main green, records, talk to founder | Mac main copy, `/lead` | lead, lead-watch, screen-concept, grilling | all; writes records on `lead/*` only | STATE "Start here" | ready rows, briefs, records PRs, 30-min check | each check: no stalled role, records pushed |
| **Standby Lead** | Take over in one step | Mac local session, idle, `run lead-watch gap` | lead, lead-watch | all after "take over now" | current_lead line | push + message on a gap | takes over within 30 min of a gap |
| **Builder** (screens / forms / runtime / evidence) | One row end to end | cloud session from `brief.sh builder <row>`; command `/next <area> <row>` | next, screen-build, journey-test (scripted), immigration-structure (forms) | session set; writes its area's files + its PR | row id, decision IDs and founder's words, touch list, Done-when test and turn cap (from the row, LR-121), Duplicate check (sha + IST), Item line, model/effort | one PR labelled after Approve | PR merged by Mergify; row's test green on main |
| **Reviewer** | Independent verdict on the exact commit | subagent `.claude/agents/screen-reviewer.md`, launched by the builder | screen-review, journey-test (scoring) | Read, Grep, Glob, Bash, Write; writes `screens/NN/review.md` + journey-test report | commit sha, concept path, changed files | review.md with score and Verdict | "Verdict: Approve <sha>" or Block list |
| **Breaker** | Try to break risky changes | subagent `screen-breaker.md`, only for money, schema, permissions, new screens | — (body is the procedure) | same; writes only `break-report.md` | commit sha, risk area | break-report.md | every attack listed with held/broke |
| **qa** | Test merged `main` like a person; only qa marks Works | cloud or Mac session, `/qa <mode>` (later a scheduled task, LR-101) | qa, journey-test | session set; writes `qa/*` only | mode, capability or merge range | BUGS rows, CAPABILITIES status | every merged row scored |
| **Shaping helper** | Draft rows ahead for the Lead to approve | built-in **Explore** subagent (read-only: "Write and Edit are denied", [C1]) launched with `model: opus` named in the call. Today `agent-model-guard.sh:14` accepts a launch that names no model (`ok_model` passes ""), so a built-in agent's own default is never checked: LR-103 is extended to deny a launch that names no model unless its `subagent_type` is one of our agent files; no new file | — | read-only | backlog area, decisions | draft rows in the Lead's context | Lead approves in a batch |
| **Concept challenger** | Fresh challenge of a screen concept (P-223 (4)) | a fresh general-purpose subagent with `screen-concept` §B as its prompt ("a new agent that did not draft the concept"); not the reviewer agent, whose file says to write review.md | screen-concept | writes `challenge.md` | concept path | challenge.md | verdict recorded |
| **Evidence session** | Official forms, Adobe checks, reading `sources/` and `code/` (needs the Mac) | Mac session, `/next evidence` | next, immigration-structure | its area's files | row, source paths | evidence PR | as builder |
| **Outside check** | Weekly report-only findings | external weekly agent (WAY-OF-WORKING roles table) | — | writes only `inbox/` | — | inbox report | report present weekly |
| **Strategy desk** | Long strategy questions, one decision at a time | Mac session, `strategy-desk` skill | strategy-desk, grilling | read-only to git; private notes folder | track file | answers, contract drafts | decision handed to the Lead |
| **Integration builder** | Integration work on the founder's private copy (P-521) | cloud session from `brief.sh integration <row>` | next | its copy only | as builder + private-copy rules | PR in the private copy | its checks green |
| **Mergify** (service) | The only thing that merges | GitHub app | — | — | label `review: approved` | merged commit | green full run |
| **Code Review** (service, LR-067) | Second opinion on risky paths | GitHub app, `@claude review` | — | — | REVIEW.md (LR-130) | review comments | Important findings resolved (LR-133) |

No new role is missing from the life cycle: release is Mergify plus the demo deploy, security review is the Code Review service on risky paths (LR-067/LR-068), monitoring is the Lead's check plus watches moving to routines (LR-123). An "evidence reader" is the evidence builder area, not a separate role.

## Mechanism map: what lives where, and why

| Need | Mechanism | Why this one (docs) | Replaces |
|---|---|---|---|
| A judge that runs inside a builder with fixed tools and a fresh context | **Agent file** `.claude/agents/*.md` (frontmatter `tools`, `model`, `effort`, optional `skills`, `hooks`) | "Each subagent runs in its own context window" ([C1]); project agents are checked into version control and cloud sessions load `.claude/agents/` from the clone ([C7]) | — (exists) |
| A repeatable procedure a session runs | **Skill** `.claude/skills/*/SKILL.md` invoked as a command | skills load on demand; `context: fork` + `agent:` can run one in a subagent ([C2]) | — (exists) |
| A rule that must hold every time | **Hook** in `.claude/settings.json` (or agent frontmatter for agent-only hooks) | "hooks can be defined directly in skills and subagents using frontmatter"; scoped to that run ([C3]) | — (exists) |
| Which roles exist, how each starts, skills / agent file | **WAY-OF-WORKING "Roles" table** (exists, two columns added) | already the page builders read; one table, not two ([T1] cognitive load) | software-factory "Who does what" (becomes a pointer) |
| A start brief per session role | **`product/tools/brief.sh <role> <row\|mode>`**: five short templates; reads Done-when, touch list and decision IDs from the BACKLOG row; fetches `origin/main` and prints "read origin/main <sha> at HH:MM IST" (what `brief-fresh.py` checks); leaves two refused placeholders, the duplicate-search result and the founder's words | `brief-check.sh` defines and enforces what a brief must hold; generating the fixed parts removes hand errors. The search itself (P-526, ENF-803) and the `--hook` checks (focus list, touch overlap, source line) stay with the Lead and preflight | hand-written fixed parts; the standard-rules list at lead skill line 52 |
| Same model for all | settings `model`/`effortLevel` now; server-managed settings later (LR-145) | "Nothing in your own settings files ... overrides a managed key" ([C5]) | — |
| Merging, ownership by path | Mergify config + label guard (exists) | — | CODEOWNERS not needed (below) |
| Recurring watches with the Mac off | cloud scheduled tasks (LR-101/LR-123/LR-124) | "A cloud scheduled task, formerly a routine, is a saved Claude Code configuration" ([C8]); research preview | — |

How the Lead knows where everything is: the WAY-OF-WORKING Roles table says what should exist and how it starts; `lead-watch.sh` already reports the standbys (line 114), qa coverage (line 137), and quiet or flagged sessions with the app view (line 327; `lead-watch/SKILL.md:16`). A separate "expected vs running" line was considered and dropped: the script cannot read sessions itself (`lead-watch.sh:3`: `list_sessions` "only the Lead's tools can read") and the counts it would add are already there.

## Rollout as lab register rows

| Row | Item | Source | Verdict | Why | Lane | Done when | Status |
|---|---|---|---|---|---|---|---|
| LR-106 (extend) | Role templates: `product/tools/brief.sh <role> <row\|mode>`, one template per session role (builder, qa, standby Lead, strategy desk, integration builder); the builder template is the brief part of the generated task spec (the feature list with a passes field stays in LR-106); Done-when, touch list and decision IDs from the row; sha and IST time fetched; duplicate-search result and founder's words left as refused placeholders; the `lead` skill's "Sessions and tokens" points to it | founder ask 27 Nov 16:1x; this page | DO | [A1] the simplest step that removes a by-hand step; `brief-check.sh` stays the enforcer | full-power | `bash product/tools/check-brief-templates.sh` exits 0: with `BRIEF_NOW`/`BRIEF_MAIN` set, each role's template with placeholders filled pipes through `brief-check.sh --brief` with exit 0; with a placeholder left, `brief.sh` exits 1; with the Done-when removed, `brief-check.sh` exits 1 | Intended |
| LR-121 (extend) | the /goal line and turn cap in every builder brief come from the row's Done-when through LR-106's template | this page | DO | per row, not per role | automation-measures | as LR-106 | Intended |
| LR-001 (extend) | WAY-OF-WORKING "Roles" table gains "Starts with" (command or agent file) and "Skills" columns and the evidence, outside-check and scout rows; software-factory "Who does what" becomes a pointer; LR-001's Done-when reworded to "WAY-OF-WORKING Roles table on main; factory page points to it" | this page | DO | one catalogue, on the page builders read | Lead | `bash product/tools/check-docs.sh` exits 0 and `grep -c 'Never does' software-factory-2026-11-27.html` is 0 | Intended |
| LR-103 (extend) | `agent-model-guard.sh --hook` denies an Agent/Task launch that names no model unless its `subagent_type` is a file in `.claude/agents/` (built-in agents carry their own default) | round 2 review | DO | closes a silent P-788 gap | full-power | `check-guards.sh` case: an Explore launch with no model exits 2; with `model: opus` exits 0 | Intended |

No new LR number is used: LR-158 is not taken by this design.

**One bulk PR (full-power, about half a day).** Touches: `product/tools/brief.sh` (new), `product/tools/check-brief-templates.sh` (new test), `.github/workflows/pr-rules.yml` or the existing guard-test list (run the test), `.claude/skills/lead/SKILL.md` lines 49-55 (shorter), `product/WAY-OF-WORKING.md` lines 5-17, `product/design/software-factory-2026-11-27.html` (Who does what → pointer), `product/design/lab-register-2026-11-27.md` (LR-001/103/106/121 notes). Also touches `product/tools/agent-model-guard.sh` and its test. Done when: `check-brief-templates.sh`, `check-g4-rules.sh`, `check-lane-preflight.sh`, `check-guards.sh` and `check-docs.sh` exit 0 on the PR. `.claude/skills/` is a protected path: the Lead reads the diff (P-823).

## What we chose not to build, and why

| Not built | Why (evidence) | Revisit when |
|---|---|---|
| A plugin bundling agents, skills and hooks | Cloud sessions load the repo's `.claude/` already; "A cloud session ... doesn't load the plugins in your local settings" ([C4]); plugin agents ignore `hooks` and `permissionMode` ([C1]); the repo is public. LR-117 keeps the private marketplace for later | LR-117's private split is done and a second repo needs the same roles |
| Agent teams | "Agent teams are experimental and disabled by default"; "No nested teams"; no teammates under `-p` / SDK; no resume ([C6]). Our lanes are cloud sessions that must survive the Lead | it leaves experimental and supports resume |
| Agent SDK orchestrator (agents defined in code) | Rebuilds the factory around a program; the `agents` option duplicates agent files ([C9]); no outcome it improves today ([A1]) | lanes must run with no claude.ai app at all |
| New agent files for shaping, evidence, qa, desk | Shaping uses built-in Plan/Explore (read-only, [C1]); qa, desk and builders are sessions, which start from a brief, not an agent file | a session role is run as a subagent instead |
| A new LR-158 row for templates | LR-106 already is "one generated task spec" and LR-121 already says "brief template and /next carry it" (round 2) | — |
| A `roles.tsv` registry read by scripts (first draft of this page) | Round 1 review: its tools, writes, model and Done-when columns had no reader (sessions inherit tools; P-788 is one literal in the guard; Done-when is per row); what was left duplicated the Roles table | a script needs a role field the table cannot give |
| A "roles expected vs running" watch line | the script cannot read sessions; standby, qa and quiet-session lines already exist (`lead-watch.sh:3,114,137,327`) | — |
| A stamp proving a brief came from `brief.sh` | anyone can type a stamp; it would refuse urgent hand briefs; `brief-check.sh` already checks content | — |
| Preloading skills into the reviewer (`skills:` field) | same tokens as reading them, needs an A/B run; left in LR-153's after-the-lab list | the reviewer's brief changes anyway (LR-135) |
| Agent-frontmatter write-scope hooks for reviewer/breaker | A Write/Edit hook is bypassed by Bash, which both need; no case of a stray write found | a stray write is found (then a Stop-time diff check) |
| CODEOWNERS | "Require review from Code Owners" needs owners who are people or teams ([G1]); all agents share one account; `.mergify.yml` already holds path owners (LR-157) | a second human reviewer joins |
| Issue forms / GitHub Projects as the backlog | Rows live in BACKLOG.md and AGENTS rule 1 forbids opening issues; issue forms are "in public preview" ([G4]); LR-153 already marks Projects not for us | the backlog moves off BACKLOG.md |
| Reusable workflows from the private repo | LR-120 DROP stands | — |
| GitHub environments for roles | for deployments, not agent roles ([G6]); LR-114 covers them | production hand-over |
| Per-role CLAUDE.md or `.claude/rules/` per role | LR-152 already scopes rules by path, which is the role's area | — |

## Risks

1. **Templates drift from `brief-check.sh`.** Mitigation: the PR's test pipes every template through `brief-check.sh --brief`, so a rule change that breaks a template fails CI.
2. **`brief.sh` becomes a second home for rules.** Mitigation: templates carry only fields and decision IDs; rules stay in WAY-OF-WORKING and RULES.
3. **Lab freeze and product pause** (P-847): the PR is lab tooling under the full-power lane; timing is the founder decision below.
4. **A generated sha looks like a done search.** Mitigation: the duplicate-search result stays a refused placeholder the Lead fills; the sha only proves freshness, as `brief-fresh.py` already intends.
5. **The founder's words get dropped** because a template looks complete. Mitigation: the template prints a `FOUNDER WORDS: <fill or "none">` line that `brief.sh` refuses to leave as the placeholder.

## Review verdicts

**Round 1 (fresh Opus 5.5 subagent, adversarial: removable parts, token cost, flow breaks, enforcement gaps): Accept with changes.** 13 findings, all addressed:
* Cut: the `roles.tsv` registry (columns with no reader; duplicated the Roles table), `check-roles.sh`, the "expected vs running" watch line (script cannot read sessions; lines 114/137/327 already cover it), the brief stamp (fakeable; would refuse urgent briefs), the reviewer skill-preload trial (left in LR-153), the LR-103 "read model from the catalogue" idea.
* Fixed: /goal and Done-when come from the row, not the role; concept challenger is a fresh general-purpose agent, not the reviewer; WAY-OF-WORKING keeps its Roles table; merge-guard's three entries are distinct filters (not a duplicate); skills total 469 lines (`wc -l`); reviewer also writes the journey-test report.

**Round 2 (fresh Opus 5.5 subagent, independent: fit to the ask, citations, dedupe, contradictions): Accept with changes.** 8 findings, all addressed:
* "Passes by construction" was not honest for the Duplicate check line: `brief.sh` now fetches the sha and IST time only, and leaves the search result as a refused placeholder; preflight's other checks still decide.
* LR-158 duplicated LR-106/LR-121: no new row; LR-106 is extended.
* Missing roles: evidence session, outside check, scout lane, and the Recover and Intake stages added.
* Built-in Explore with no model escaped the P-788 guard (`agent-model-guard.sh:14`): LR-103 extended to deny it.
* Citations: [C5] claim narrowed, [C1] frontmatter quote added, unused GitHub citations moved to a note, Mergify not claimed as a capability.
* LR-001's Done-when reworded in the same PR; empty placeholder sections and a repeated row removed. (Skills count kept at 469: `wc -l`, including blank lines.)

## Founder decision (one)

**When does the template PR ship?** Recommendation: **after the 27 Nov lab freeze, folded into LR-106's bulk FP-1 PR.** Briefs work by hand today and `brief-check.sh` already catches missing parts, so waiting costs nothing; shipping inside the freeze adds a PR to a queue that is meant to settle. Alternative: ship now as one half-day lab PR.

(Whether a script may fill the Duplicate check's sha and time is a tech-lead call, not a founder decision; recommendation: yes, with the search result left to the Lead.)

## Citations (all read 27 Nov 2026)

* [A1] https://www.anthropic.com/engineering/building-effective-agents: orchestrator-workers, "a central LLM dynamically breaks down tasks, delegates them to worker LLMs, and synthesizes their results"; evaluator-optimizer, "one LLM call generates a response while another provides evaluation and feedback in a loop"; "you should consider adding complexity only when it demonstrably improves outcomes".
* [T1] https://teamtopologies.com/key-concepts: "Stream-aligned teams deliver direct value to customers along a value stream. They own the outcomes."; "Platform teams create services that accelerate stream-aligned teams, removing complexity."; "Enabling teams temporarily boost skills in other teams, then move on."; "Each new tool, responsibility or domain your team is given taxes their mental bandwidth."
* [D1] https://dora.dev/guides/dora-metrics-four-keys/: "Throughput is a measure of how many changes can move through the system over a period of time."; "Instability is a measure of how well the software deployments go."
* [C1] https://code.claude.com/docs/en/sub-agents: frontmatter fields include "`tools`, `disallowedTools`, `model`, `permissionMode`, `maxTurns`, ... `skills`, `mcpServers`, `hooks`, `memory`, ... `effort`"; `tools`: "Inherits every tool available to subagents if omitted"; built-in Explore is "A fast, read-only agent optimized for searching and analyzing codebases", Plan and Explore have "Write and Edit are denied"; `skills`: "The full content of each listed skill is injected into the subagent's context at startup"; `hooks`: "Lifecycle hooks scoped to this subagent. Ignored for plugin subagents."; "Project subagents (`.claude/agents/`) ... Check them into version control"; "plugin subagents don't support the `hooks`, `mcpServers`, or `permissionMode` frontmatter fields"; "By default, a subagent can spawn subagents of its own, up to three layers below the main conversation."
* [C2] https://code.claude.com/docs/en/skills: `context` "Set to `fork` to run in a forked subagent context."; "The `agent` field specifies which subagent configuration to use."
* [C3] https://code.claude.com/docs/en/hooks: "hooks can be defined directly in skills and subagents using frontmatter"; "Subagent hooks: Claude Code runs them only while that subagent is running and removes them when it finishes."
* [C4] https://code.claude.com/docs/en/plugins: "A Claude Code plugin is a directory of skills, agents, hooks, MCP servers, or other components that Claude Code installs and loads as one unit."; "A cloud session, including one in the browser at claude.ai/code, doesn't load the plugins in your local settings."
* [C5] https://code.claude.com/docs/en/settings and /managed-settings: "Nothing in your own settings files or `--settings` overrides a managed key"; for cloud sessions, settings deployed "through MDM or managed settings files don't apply, because the session runs on an Anthropic-managed VM". Whether server-managed settings reach cloud sessions is LR-145's to quote (that page was not fetched here).
* [C6] https://code.claude.com/docs/en/agent-teams: "Agent teams are experimental and disabled by default."; "No nested teams: teammates cannot spawn their own teammates."; "In non-interactive mode with the `-p` flag, including Agent SDK sessions, Claude doesn't spawn teammates".
* [C7] https://code.claude.com/docs/en/claude-code-on-the-web and /cloud-environments: "Cloud sessions start from a fresh clone of your repository." (loads CLAUDE.md, `.claude/settings.json` hooks, `.claude/skills/`, `.claude/agents/`); user-level `~/.claude` is not loaded: "Commit them to the repo's `.claude/` directory instead."
* [C8] https://code.claude.com/docs/en/routines (scheduled tasks): "Scheduled tasks are in research preview."; "A cloud scheduled task, formerly a routine, is a saved Claude Code configuration: a prompt, one or more repositories, and a set of connectors".
* [C9] https://code.claude.com/docs/en/agent-sdk/subagents: "Programmatically defined agents take precedence over filesystem-based agents with the same name."
* [G1] https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners: "You can use a CODEOWNERS file to define individuals or teams that are responsible for code in a repository."
* [G4] https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/syntax-for-issue-forms: "Issue forms are currently in public preview and subject to change."
* [G6] https://docs.github.com/en/actions/managing-workflow-runs-and-deployments/managing-deployments/managing-environments-for-deployment: "You can create environments and secure those environments with deployment protection rules."

Also fetched, not needed by any choice here (rulesets: LR-131; reusable workflows: LR-120; PR templates: LR-134; Projects: LR-153). Mergify is described only as this repo configures it (`.mergify.yml`), not as a capability claim.

Not fetched (claims avoided): code.claude.com permissions/iam, workflows page, server-managed-settings page in full; GitHub "Available rules for rulesets".
