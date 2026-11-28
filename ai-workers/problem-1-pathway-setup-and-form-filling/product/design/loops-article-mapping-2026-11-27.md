# Loops article mapped to our pipeline — 27 Nov 2026 (Lead 3)

Source: "Loop engineering: Getting started with loops", claude.com/resources/articles/getting-started-with-loops (Claude Code team, dated 30 Jun 2026; read in full, line by line, 27 Nov 2026). Founder ask (A424): go through every section, say what we should pick up for faster, more controlled, higher-quality, more predictable delivery; "read line by line... don't guess". Rule: adopt only what fits our setup; no force fitting. Each row is one concept from the article, in its order.

| # | Section | Concept in the article | We have today | Verdict |
|---|---|---|---|---|
| 1 | Intro | A loop = an agent repeating cycles of work until a stop condition is met; typed by trigger, stop, primitive, task fit | Lanes, checks and watches are loops but not named by trigger/stop | ADOPT as vocabulary: each lab loop in the register states its trigger, stop condition and primitive |
| 2 | Intro | "Not all tasks require complex loops; start with the simplest solution" | — | ADOPT as a rule for the lab register (no force fitting) |
| 3 | Turn-based | Triggered by a prompt; stops when Claude judges it is done | Builder turns | KEEP |
| 4 | Turn-based | Fewer turns through specific prompts and verification skills | Briefs carry "Done when"; skills screen-build, journey-test, screen-review | KEEP |
| 5 | Turn-based | Encode your manual checks as a SKILL.md so Claude checks its own work end to end | The Lead's manual checks (money read, covered lines, relabels, lane nudges) are not encoded | ADOPT: encode each Lead manual check as a script or skill step (lab-automation) |
| 6 | Turn-based | Give the skill tools to see, measure, interact; quantitative checks self-verify best | Playwright, the built-in browser, API checks in journey-test | KEEP |
| 7 | Turn-based | Example skill: dev server, interact, screenshot before/after, zero new console errors, a performance trace and Core Web Vitals | journey-test has screen sizes and accessibility; no performance or console-error gate | ADOPT: add "zero new console errors" and a Core Web Vitals budget to journey-test (lab-automation; budget numbers from web.dev, cited) |
| 8 | Turn-based | "If any step fails, fix and rerun from step 1 — no partially verified work" | Reviewer re-reviews the diff only (P-277) | KEEP diff-only review; ADOPT the rerun rule for the builder's own verification |
| 9 | Turn-based | Choosing skills vs hooks vs subagents: the steering guide | "Enforce rules, not text" (hooks, CI) | KEEP; the lab register cites the steering guide when it picks one |
| 10 | Goal-based | /goal: an evaluator model checks the condition each time Claude tries to stop; stops at goal or a turn cap | Nothing holds a lane to its Done when | ADOPT: every builder and lab brief ends with `/goal <Done when check passes>, stop after N tries` (brief template, `/next`) |
| 11 | Goal-based | Deterministic criteria (tests passed, a score threshold) work best | Done when must name a test (pr-rules) | KEEP |
| 12 | Time-based | /loop re-runs a prompt on an interval; stops when cancelled or the work completes (PR merged, queue empty) | Lead check is a session cron; watches run to timeout | ADOPT: watches end themselves when their work completes |
| 13 | Time-based | /loop runs on your computer and stops when it is off; /schedule moves it to the cloud as a routine | The Lead's check and lane-watch die with the Mac session | ADOPT in part: queue/CI health and qa-after-merge as cloud routines or GitHub events; the Lead's judgment check stays |
| 14 | Time-based | "/loop 5m check my PR, address review comments, and fix failing CI" | Founder turned on Auto-fix (27 Nov); Steward off until the approval rule lands | KEEP Auto-fix now; Steward Manual when ship-security lands |
| 15 | Time-based | Longer intervals, or react to events rather than time | Polling every 30 s-30 min | ADOPT: event triggers (GitHub workflow events) where they exist |
| 16 | Proactive | Event- or schedule-triggered routines with no human in real time, for recurring well-defined work (triage, migrations, dependency upgrades) | Dependabot and qa started by hand | ADOPT: dependency upgrades (ship-security) and qa-after-merge (lab-automation) as routines |
| 17 | Proactive | Route routines to smaller, faster models; the most capable model for judgment | P-788: Opus 5.5 medium everywhere | NOT ADOPTED: founder 11:35 IST 27 Nov, "No, Opus everywhere" (P-788 stands; routines run on Opus 5.5 medium) |
| 18 | Proactive | Compose /schedule + /goal + skills + dynamic workflows + auto mode | Lanes stall on permission prompts when unattended (7 Nov lesson) | ADOPT auto mode for routines inside their allow-list; dynamic workflows only after a pilot (row 25) |
| 19 | Proactive | For a bug: three solutions in parallel worktrees, an adversarial judge | Breaker agent for money, schema, permissions | NOT ADOPTED by default (cost); use only for a hard Blocker bug |
| 20 | Quality | Keep the codebase clean: Claude copies existing patterns | Clean-up lane running | KEEP (lab-cleanup) |
| 21 | Quality | Give Claude a way to verify its work: skills | Row 5-8 | KEEP |
| 22 | Quality | Make framework and library docs easy to reach | Context7 is installed, not in builder steps | ADOPT: builders read library docs via Context7 before using an API |
| 23 | Quality | A second, fresh-context agent reviews; /code-review or Code Review for GitHub; "loops that write code need loops that check it" | Reviewer agent on Opus; Code Review Manual on risky PRs | KEEP |
| 24 | Quality | When one result misses the standard, encode the fix into the system | "Enforce rules, not text" | KEEP |
| 25 | Tokens | Right primitive and model; smaller tasks need no multi-agent loops | One row = one session | KEEP |
| 26 | Tokens | Clear success and stop criteria | Row 10 | ADOPT via /goal |
| 27 | Tokens | Pilot before a large run (dynamic workflows can spawn hundreds of agents) | — | ADOPT as a rule |
| 28 | Tokens | Scripts for deterministic work | lead-watch.sh, lead-pr.sh, tools/ | KEEP |
| 29 | Tokens | Don't run routines more often than needed | 30-min check | KEEP; review each routine's interval in the register |
| 30 | Tokens | Review usage: /usage, /goal status, /workflows | get_usage each check | ADOPT: /usage breakdown in the daily measures line |
| 31 | Tokens | Model and effort are the biggest cost levers | P-788 | Row 17 |
| 32 | Getting started | Hand off the check (skills), the stop condition (/goal), the trigger (/loop, /schedule), the prompt (all, + workflows) | — | ADOPT as the lab's order |
| 33 | Getting started | Pick the task where you are the bottleneck | The Lead: labels, relabels, money reads, lane nudges, qa starts | ADOPT: these are the first hand-offs (Approvals, Auto-fix, /goal, routines) |
| 34 | Getting started | Run it, watch where it stalls or over-reaches, iterate | Measures lane | KEEP |
| 35 | Further reading | Docs: parallel agents, loop, schedule, goal, dynamic workflows; verification loops with skills; related article on verification (end-to-end, property, differential tests) | Not yet read | Lab-automation lane reads them before using each feature, quotes and dates them |
