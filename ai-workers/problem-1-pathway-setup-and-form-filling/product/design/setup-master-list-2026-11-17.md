# Set-up master list: the new operating model (living, kept by the tech lead)

Started 17 Nov 2026, 10:3x IST, by Lead 75, on the founder's asks A152-A153 (10:2x IST, typed): "a huge list of everything" to set up the new operating model, with how each is done and whether it is done. The tech lead updates this file at every change. The founder's page mirrors it: https://claude.ai/artifact/EFiykMZBjR2ryKtK6oHYi1

Status words: **Done** (checked by a tool, with the evidence named) · **Doing** (who, since when) · **Next** (ready, not started) · **Needs you** (only the founder can do it) · **Later** (agreed, not today).
Who: **You** = the founder · **Setup** = the founder setup agent (local_c3e4ea74), which works with you on your clicks · **Lead** = the tech lead · **Builder** = a builder session, one row per PR · **qa** = the qa lane.

Sources: Lead 74's research (operating model v2, engineering system v1, failure modes, model matrix, CI research v3; the files sit in the shared notes folder `lead74-a142…`, `a146`, `a147`, `a149`, and are to move to the repository, item E1), the org-move checklist `design/org-move-checklist-2026-11-17.md`, STATE founder asks A137-A151.

## A. Clean-up and control (today; Lead, with Setup for claude.ai)

| # | What | How | Who | Status |
|---|---|---|---|---|
| A1 | Every running local session reports to the current Lead | One message to each: "Current Lead is now Lead 75" | Lead | **Done** for Build Lead A, Build Lead C, the board session (they reported at 10:2x) and CI research (message 10:3x). The founder setup agent was asked at 10:3x for its done list |
| A2 | Archive ended Lead sessions | `archive_session`; reversible from the Archived list | Lead | **Done** for Leads 65, 66, 67, 68 and 73 (10:3x). **Doing:** Lead 64 refused (still has a Remote Control client: you can archive it from the sidebar). Leads 69, 70 and 72 wait until what hangs off them moves (69 started Build Lead C; 70's notes folder holds Lead 74's research; 72 started CI research). Lead 74 waits for its joining workflow (about 10:45) |
| A3 | Clean-up of claude.ai cloud sessions | Browser, claude.ai/code: archive finished cloud builders once their PR is merged or closed | Setup | **Done** at 10:32 IST on your "Yes, archive 22": 21 finished cloud lanes plus the Mac CI research session; kept every Lead, standby, Build Lead, the board session, live lanes and the PF-21s part 3 lane (list word for word in side notes `local_fa783599…/founder-setup/step1-claude-ai-cleanup-2026-11-17.md`). The Lead re-checks at each check |
| A4 | Disk back above a safe floor | Removed seven old scratch copies from 16 Nov (about 13 GB; each was a copy of a commit already on GitHub, or an exported tree); kept `sim` (used at 08:35 today). Still to go: Lead 74's 0.4 GB snapshot once its workflow ends | Lead | **Done** at 10:4x IST: 7.7 GB to 21 GB free |
| A5 | Board refresh uses too many GitHub calls | Today one rebuild is about 150 REST calls, run on every Lead input; the account's GitHub calls are shared by every lane and are running out | Lead + board session | **Done**: you chose once a day at 09:00 IST plus on ask (P-655, 10:3x); the board session also moves to combined queries |
| A6 | Two standby Leads | Lead 76 and Lead 77 are idle and ready | Lead | **Done** |
| A7 | Records to main carry P-654 (#2064's size exception waits on it) | Records PR #2071 (stacked on #2058), labelled for the records queue | Lead | **Doing**: waits for #2058 and CI |

## B. Your decisions and clicks (the 10:30 joint session; Setup walks you through each)

| # | What | Why | Cost | Status |
|---|---|---|---|---|
| B1 | GitHub: move the repository into an organization on **Enterprise, bought outright** (500 machines at once) | Machines are the bottleneck | US$21 a seat a month, 0 seats today, monthly; Pro US$4 kept a week past the move | **Done** for the purchase: Enterprise "Expat Ready" active at 10:56 IST (P-657, P-658); Pro kept. organization **expat-ready** created inside it at 11:05 (P-659), your membership Public. **Doing:** preparation P5 apps, P6 REVIEWERS, P7 settings lines; the move itself the next weekday from about 09:30 IST |
| B2 | Ruleset on main: required `ci`, no force-push, no deletion | Stops a direct push around the checks | US$0 | **Needs you** (after B1) |
| B3 | A separate reviewer identity (a machine account or GitHub App) | Today one "Claude" identity both builds and approves; the approval is a comment anyone on the team can write | US$0 | **Needs you** (your account action, P-551) |
| B4 | Who must approve changes to the pipeline itself (`.github/`, `.mergify.yml`, `.claude/`, gate scripts): you, in two short slots a day | The builder must never control its own judge | about 10-20 min a day of your time | **Needs you** |
| B5 | Settings paste: deny lines, hook lines, auto-mode environment | The Lead's sandbox cannot write your settings file | US$0 | **Needs you** (15 min) |
| B6 | One Limited cloud environment for builders, with each secret named | Builders in the cloud need a known, narrow network | US$0 | **Needs you** |
| B7 | Yes to the lint and test tools (ESLint 9, typescript-eslint, react-hooks plugin; pin fast-check and Playwright; StrykerJS for money tests) | There is no linter on main today; 26 "disable" comments sit in code nothing reads | US$0 (open source) | **Needs you** (STANDARDS §1 gate) |
| B8 | Rule changes: acceptance tests owned by qa, not builders; money and permission tests go first in their own PR; retire the Lead-process rules a check now covers | Builders today edit the tests that decide their own merge (653 commits since 10 Nov) | US$0 | **Needs you** |
| B9 | Plan capacity: keep the manual reset, or a capped usage limit | Burn at 3.2-5.8% an hour | US$0 or capped | **Needs you** |
| B10 | Which Library: the board's Library, or your claude.ai or Drive library | Where the living documents live | US$0 | **Needs you** |
| B11 | AWS and other purchases | For production later; none needed for today's pipeline | as quoted per card | **Needs you**, with Setup |
| B12 | GitHub Support ticket for a higher job limit; Namespace trial kept | Runs alongside B1 | US$0 | **Needs you** (your account) |

## C. Enforcement: make the rules checks, not prose (builders; 8 small PRs once B decisions land)

The finding: 143 rules, 112 of them prose and only 11 ever broken visibly; six guards built but never switched on. This section turns the rules that matter into checks.

| # | What | Status |
|---|---|---|
| C1 | **Approve only from the reviewer identity** (queue gate reads one named login) | **Next** after B3 |
| C2 | **Queue settings**: batches of 3, 2 checked at once, a one-at-a-time queue for money, permission and migration changes | **Next** (needs B9-style yes on P-224 (5)) |
| C3 | **Policy job**: blocks a builder PR that edits tests or acceptance packs it is judged by, deletes or skips tests, edits an applied migration, or mixes money with other work | **Next** after B4 and B8 |
| C4 | **CI shape**: fast checks first, one PR check after Approve, the container proof in the batch | **Next** |
| C5 | **Supply chain**: actions pinned to exact versions, an audit of new packages | **Next** |
| C6 | **Lint** with today's breaks recorded and only allowed to fall | **Next** after B7 |
| C7 | **Pipeline watcher** (`pipeline-metrics.yml`): queue wait, batch failures, re-runs, tamper events, missing nightly, spend, cost per Proven, written hourly; the Lead wakes on red | **Next** |
| C8 | **Test strength**: mutation testing on client money and firm walls, nightly report | **Next** after B7 |
| C9 | **Conformance check**: each rule in RULES.md names the check that enforces it, or says "prose only" and why; a nightly job fails when a rule names a check that does not exist | **Next** (Setup drafts, Lead reviews) |
| C10 | Rules v2: RULES.md cut to the rules a check enforces plus the few that cannot be checked; the Lead-process rows retired | **Next** (Lead, records PR) |
| C11 | Instruction files cut (start read under 1.5 KB per role; skills and WAY-OF-WORKING without Lead-only text) | **Next** (Lead, records PR) |

## D. CI pipeline that stays on (the 6-7 hour unattended run)

| # | What | Status |
|---|---|---|
| D1 | Enough machines (B1, B12) | **Needs you** |
| D2 | No stall while you are away: the 30-minute Lead check (cron ca6fade8, :23 and :53) plus the watcher (C7) | **Done** for the check; C7 **Next** |
| D3 | Nightly full run every night, and an alarm when it is missing or late (it ran 3-4 h late on 8 Nov) | **Doing**: tonight's run (created 08:29 IST) is still in progress; alarm in C7 |
| D4 | A proof run: 6-7 hours unattended with merges flowing, measured by C7; pass if no stall over 40 minutes and no red main left over 1 hour | **Later** (after C1-C7) |
| D5 | Lead continuity: hand-over by standby at 200k context; trial of compaction instead | **Done** (standbys); trial **Later** |
| D6 | +24 h and +48 h reads of every change: keep a change only if its number improved | **Later** (18 and 19 Nov, 09:00 IST) |

## E. Library: living, versioned documents

| # | Document | Status |
|---|---|---|
| E1 | Move Lead 74's research files from the shared notes folder into the repository (P-557: nothing lives only on the Mac) | **Next** (Lead) |
| E2 | **Operating model** (who does what, the loop for one change, trust zones) | Draft v2 **Done** (page LKVMNczY…); Library master **Doing** by Setup |
| E3 | **CI pipeline strategy** (machines, queue, checks, costs) | Research v3 **Done** (page DMP9Hv2S…, records PR #2065 approved); Library master **Doing** by Setup |
| E4 | **Agent failure modes** and the check that answers each | Research **Done** (Lead 74, a147); Library master **Doing** by Setup |
| E5 | **Engineering System v1** (the blank-sheet design and the gap from today) | Research **Done** (a146); Library master **Doing** by Setup |
| E6 | **Model and effort per role** | Research **Done** (a149); goes into RULES as P-608's update **Next** |
| E7 | The three talks joined into one approach (A145), with the target system, models per role and the ranked decision cards (T1-T17, W1-W6, L1-L10) | **Done** at 11:0x IST: page https://claude.ai/artifact/4T3qRcNySBR7bdnqjTYn3D (read in full by the Lead; note added that T2 is superseded by P-657). Its cards go to you through Setup, one at a time |
| E8 | Each document says its version, date and owner, and a change log; the Lead re-reads it weekly | **Next** |

## F. Product keeps moving meanwhile

| # | What | Status |
|---|---|---|
| F1 | Release 1 Proven: 11 of 101 at the last read; realistic by 08:00 IST 18 Nov about 16 (13-19); 30 is not reachable with the gates intact | **Doing** |
| F2 | Merge queue jam: 68 runs queued; about 13 approved PRs waiting | **Doing** (machines are the fix: B1, B12) |
| F3 | No new capability rows start until the queue wait is under 60 minutes; finishing parts, qa and fixes go first (A1 of the migration plan) | **Doing** |
| F4 | Build Lead A and Build Lead C keep their rows moving; the Lead answers their questions within 30 minutes | **Doing** |

## Change log
* 17 Nov 10:3x IST, Lead 75: first version.
* 17 Nov 10:4x IST, Lead 75: A3 done (Setup); A5 decided (P-655); #2030 (Stuck now card) read and labelled; #2014's failed shard re-run.
* 17 Nov 10:4x IST, Lead 75: A4 done (21 GB free); A7 records PR #2071 opened and labelled.
* 17 Nov 10:4x IST, Lead 75: B1 decided, Enterprise trial first (P-656), then revised to buy outright (P-657); bought 10:56 (P-658).
* 17 Nov 11:0x IST, Lead 75: E7 done (Engineering System v1 page published).
* 17 Nov 11:1x IST, Lead 75: org expat-ready created (P-659).
