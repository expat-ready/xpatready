# How rules hold: industry practice against ours (A92, 15 Nov 2026)

Written by the tech lead (Lead 60) at the founder's request, 18:4x IST 15 Nov 2026 ("Research first"). Sources were fetched and read on 15 Nov 2026 by a research agent; each line names its page. Nothing here is built yet: the plan at the end waits on the founder's go.

## 1. The question, in plain words
The founder asked who makes sure the whole pipeline follows the rules we agreed (the tech lead does, P-384), what is missing, and whether we work to best-in-class practice. This page compares what the industry's own documentation says with what we do, and proposes the fix.

## 2. Where we stand (counted from `RULES.md`, 15 Nov 18:4x IST)
| | Rules |
|---|---|
| Rules in the register | 142 |
| Enforced by a CI check | 7 |
| Enforced by a hook | 7 |
| Enforced by a script the Lead runs | 17 |
| **Written down only (someone must remember)** | **102 (72%)** |

**What failed this evening (15 Nov), each a written-only rule or a missing measure:**
1. Three builders waited 1-3 hours for a release-holder read (P-423). No rule sets a time limit on the Lead's answer, and the checks did not look inside lanes.
2. Cloud builders went to sleep waiting for a CI result that never woke them (known since 2 Nov; still prose).
3. An approved, green PR (#1811) stayed out of the merge queue for over 2 hours: Mergify read a later "skipped" CI run. A re-run, a refresh and a manual queue did not clear it.
4. STATE went over its size limit three times; that one *is* enforced by a hook, and the hook caught it every time. This shows that enforced rules hold and prose rules don't.

## 3. What the industry does (sources)
| Area | Practice | Mechanism | Source (fetched 15 Nov 2026) |
|---|---|---|---|
| Guardrails | A merge is impossible unless the rules are met | GitHub rulesets / branch protection with required status checks | GitHub Docs, "About protected branches": "All required status checks must pass before collaborators can merge changes" |
| Guardrails | The right reviewer is asked by file path, not memory | CODEOWNERS + "require review from code owners" | GitHub Docs, "About code owners": "Code owners are automatically requested for review" |
| Guardrails | Team norms checked on every PR | A Danger script in CI fails the PR | danger.systems: "You can use Danger to codify your teams norms." |
| Guardrails | Rules as testable policy files | Open Policy Agent / Conftest in CI | openpolicyagent.org docs: "decouples policy decision-making from policy enforcement" |
| Merge queue | Approval alone does not queue a PR | An explicit auto-queue rule | Mergify docs, "Merge Queue": "Nothing queues a PR on approval" |
| Reliability (Google SRE) | Set a target and alert when it is missed; every alert is actionable | Service-level objective + alert on the symptom | SRE Book, "Monitoring Distributed Systems": "Every page should be actionable." |
| Reliability | Repeated manual work becomes code | Runbook → script → automatic detect-and-fix | SRE Workbook, "Eliminating Toil": instructions are "essentially pseudocode to someone with software development skills" |
| Reliability | Every incident gets a blameless record and a tracked fix | Postmortem → backlog item | SRE Book, "Postmortem Culture": "Blameless postmortems are a tenet of SRE culture." |
| Flow (DORA) | Hard limit on work in progress | WIP cap, kept even when people are idle | dora.dev, "WIP limits": "Don't relax your WIP limits when people are idle." |
| Flow (DORA) | Small batches, merged at least daily | One small item per PR; short branches | dora.dev, "Trunk-based development": "Merge branches to trunk at least once a day." |
| Flow (DORA) | Lightweight approval, visible status | Peer review + automated tests; a shared board | dora.dev, "Visual management": "Visual management boards can create a shared understanding" |
| Flow (Kanban) | Written policies per state, and a time expectation per item | Explicit policies; service level expectation from history; watch item age | Kanban Guide v2025.5: "Ensuring work items do not age unnecessarily, using the SLE as a reference." |
| Decisions | Never delete a decision; mark it superseded | Decision log with status; the current rules page is generated | Nygard, "Documenting Architecture Decisions" (2011): "we will keep the old one around, but mark it as superseded" |
| AI agent teams (Anthropic) | Hooks are deterministic; instruction files are advice | Command hooks: PreToolUse blocks, Stop refuses "done" until checks pass | Claude Code docs, "Best practices": "If something has to happen every time, make it a hook" |
| AI agent teams | Instruction files are not enforcement | Move any rule that keeps being missed into a hook | Claude Code docs, "Memory": "Claude treats them as context, not enforced configuration." |
| AI agent teams | Long-running agents rely on artifacts, not memory | Progress file, feature list, a mergeable state at each session's end | Anthropic Engineering, "Effective harnesses for long-running agents" (26 Nov 2025): "leaving clear artifacts for the next session" |
| Partial work | Unfinished work merges behind a release toggle | Feature flags | Hodgson, martinfowler.com (2017): toggles "allow in-progress features to be checked into a shared integration branch" |
| Done | One written definition of done | A checklist mapped one-to-one to CI checks | Scrum Guide 2020: "The Definition of Done is a formal description of the state of the Increment" |

(One page could not be read: Atlassian's definition-of-done page returned only menus; the Scrum Guide was used instead.)

## 4. Ours against best practice
| Practice | Us today | Gap |
|---|---|---|
| Required checks, merge queue, small PRs | Yes (ruleset "main: PR + ci required", Mergify, 800-line cap) | Small: one stuck-queue case not caught by any alarm |
| Code owners | No CODEOWNERS; the release holder's reads are prose (P-423) | Medium |
| PR norms checked in CI | Partly (pr-rules: body, agent, size) | Medium: "Done when", touch list and reviewer model partly prose |
| Service levels with alerts | **None** for waits; only a 90-minute push rule, read by the Lead | **Large** |
| Hard WIP limits | Written (P-613 finish-first), not enforced | Large |
| Hooks for agent rules | 7 hooks, mostly for money, settings and records | Large: most agent rules are CLAUDE.md/skill prose, which Anthropic's own docs call advice |
| Decision log with status, generated rules page | Decisions append-only (yes); RULES.md is hand-kept, with an enforcer column (G-3) | Small |
| Blameless postmortem with an automated fix | Lessons go into memory files and prose rules | Large: fixes become more prose |
| Feature flags for partial work | Fakes/ports per row; no release toggles | Small for now (one Sample firm) |
| Definition of done mapped to checks | "Done when" per row, checked by the reviewer | Medium |

**Answer to "are we best in class?":** for building and merging code, mostly yes. For **making rules hold and stalls visible**, no: we rely on agents remembering 102 prose rules, which is the opposite of what Google SRE, DORA, Kanban and Anthropic's own guidance recommend.

## 5. The plan (waits on the founder's go)
Ranked by how much each stops rule-breaking and silent stalls. Each is one small PR, tested by breaking the rule on purpose. Cost: no money; about 1-1.5 days of Lead and builder time across the week; the product queue is not paused.

| # | What | Industry basis | Stops |
|---|---|---|---|
| 1 | **Wait-time targets with alarms (SLEs):** a question to the Lead answered in 30 min; an approved green PR queued in 30 min; a lane with work left pushes every 90 min. A script reads GitHub *and* lane sessions; a miss is a red line atop each check and a push notification | SRE SLO + actionable alert; Kanban SLE and item age | this evening's 1-3 h waits |
| 2 | **Stuck-queue detector and auto-fix:** an approved green PR not queued after 15 min is diagnosed (for example a skipped CI shadowing a pass) and given the known fix | SRE toil → automation | #1811-type stalls |
| 3 | **Stop and PreToolUse hooks for the Lead's top agent rules:** no label without a release-holder read line on money, permissions or schema; a Lead turn cannot end with an unanswered "Question for the tech lead" older than 30 min | Anthropic: "make it a hook" | P-423 and P-294 slips |
| 4 | **PR norms in CI (Danger-style):** "Done when", touch list, duplicate check, reviewer model Opus, size; fail the PR | Danger; GitHub required checks | brief and review slips |
| 5 | **Hard WIP limit by script:** a new row cannot start while more than N items wait on the Lead or on review | DORA, Kanban | too much open, too little finished |
| 6 | **The 102 prose rules triaged:** each gets a check, is merged into another, or is retired as history; target under 30% prose in two weeks | Definition of done mapped to checks | rule sprawl |
| 7 | **Every stall gets a short blameless record whose fix is a check, not a new prose rule** | SRE postmortems | repeats |
| 8 | **The board shows the wait-time targets** (met or missed today), so the founder sees it without asking | DORA visual management | invisibility |

**Order:** 1 and 2 first (they would have caught all of this evening's stalls), then 3 and 4, then 5-8.
