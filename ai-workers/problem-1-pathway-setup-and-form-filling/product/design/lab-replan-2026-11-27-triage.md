# Lab register triage, 27 Nov 2026 (read-only analysis)

Read from origin/main 20918e64c (27 Nov 12:20Z, includes #3902). Register: `product/design/lab-register-2026-11-27.md`, 154 rows, 137 live (17 DROP), 115 Intended before this triage. PRs read through the GitHub API. Nothing was changed on GitHub or in the repository.

Owner marks: **L** = only the Lead (records, decisions, Lead ops) · **W** = lane work · **F** = needs the founder (accounts, keys, settings, money, a ruling).

## 1. Flip list (lab PRs merged since 26 Nov 18:30Z)

14 non-records PRs read: #3944, #3941, #3937, #3925, #3924, #3921, #3908, #3906, #3902, #3901, #3900, #3896, #3893, #3888 (plus records PR #3895 for LR-001, whose row names it).

### Rows that should now read Built

| Row | PR | Evidence line | Proven still owes |
|---|---|---|---|
| LR-001 | #3895 (merged 27 Nov 06:18Z) | `design/software-factory-2026-11-27.html` on main contains "Who does what" (grep: 2 hits at 20918e64c). | nothing beyond the grep; can go Proven |
| LR-079 | #3893 (merged 27 Nov 07:50Z) | 1,066 October files leave the tree; tag history/pre-cleanup-2026-11 keeps them; stale-paths.txt has the 22 stage-1 paths. | check-stale-paths 0 hits and check-docs OK on main after #3944 fixed the guard-6 red |
| LR-103 | #3896 (merged 27 Nov 10:41Z) | Reviewer/breaker agents `effort: medium`; agent-model-guard checks every agent file; check-model-rule.sh (9 cases, 5 mutation rows) in check-guards. grep "effort: high" in .claude/agents on main: 0 hits. | agent-model-guard test run on main (CI link) |
| LR-151 | #3921 (merged 27 Nov 11:48Z) | product/tools/flaky-guard.sh, `--self-test` 10 cases incl. a planted `retries: 2` that fails; report-only in ci job fast (11 of the last 60 PRs would have stopped). | self-test run on main; blocking decision (drop continue-on-error) stays with the Lead (P-717) |
| LR-101 | #3902 (merged 27 Nov 12:20Z) | tools/qa-due.sh (DUE/BUSY/NONE, check-qa-due.sh 13 passed) plus an hourly scheduled task "qa after merge" (ops/qa-after-merge-task.md); the qa skill points to it. | a session link where a capability-completing merge started qa with no Lead step; the GitHub merge trigger is still not attached (PR question 1) |
| LR-129 | #3908 (merged 27 Nov 07:17Z) | Same substance as LR-154 (Proven, run 45957916535): records and tooling skip the 24 parts; the reviewer stays on pipeline files. Done-when is "as the fast-route rows". | none; recommend marking it merged into LR-154 |

### Touched by a merged PR but still Intended (Done-when not met)

| Row | PR | What is done | What is missing |
|---|---|---|---|
| LR-110 | #3937, #3888 | Both nightly reds fixed at the root; pr-suites-quarantine.txt has 0 entries on main. | 7 green nightlies in a row (from 28 Nov at best). |
| LR-091 | #3906 | DECISIONS.md 83.5 KB (P-764 and older moved word for word to decisions/). | BACKLOG.md is 778,813 bytes on main; must be under 100 KB by the same move. |
| LR-097 | #3902 | measures.py (DORA five, works, tokens) and measures.yml daily line (run summary + 90-day artifact). | A committed 7-day baseline file with the five values; cto-review skill naming the five (#3896 touched it for the model only). |
| LR-123 | #3902 | qa after merge without a person (see LR-101). | Queue/CI health watch running with the Mac off. |
| LR-118 | #3900, #3901 | 5,164 screenshots out of git (~1,069 MB), git-ignored; CI keeps failed-run images as artifacts. | No proof that pr-rules, item-proof and test-graph read the new location; per-row public proof summary; evidence destination ruling (register question 1). |
| LR-116 | #3924, #3941 | Every reader finds records via records-dir.sh / CURRENT-LEAD.md; no file deleted. | PS-1c: records still under product/ on main; no revert PR prepared per repository. |
| LR-115 | #3911 (plan, records PR) | Private repo exists; PRIVATE-RECORDS.md on main names the move. | expat-ready/private README is two lines with no folder layout; start notes naming both clones. |
| LR-032 | #3902 | OS-11 implemented as tools-on-main.sh in lead-watch step 1d (6 passed). | Done-when names #3506 merged and check-tools-fresh; #3506 still open. Reword the row or close #3506 (triaged C). |
| LR-036 | #3902 | OS-78 (a): comment-filter-check.py runs in pr-rules. | The row is OS-78c (#3814, workflows themselves), still open and dequeued. |
| (no row) | #3925, #3944, #3888, #3941 | P-214 fixes (capacity-watch test, guard-6 mutant, fo7s3a clock) and a #3924 follow-up. | #3944 cites LR-156, which is not in the register on main (it lives on open #3926). |

Also: LR-154 already says Proven (#3908). #3921 says item (a) G-4 waits on #3833.

## 2. Triage of the 110 rows still Intended

**A (must-have before product restarts): 27 · B (useful, after restart, in parallel): 52 · C (defer or drop): 31** · total 110. Plus 6 flips above (5 were Intended, LR-079 was "Built pending").

| Class | Lead-only (L) | Lane (W) | Needs founder (F) |
|---|---|---|---|
| A | 0 | 26 | 4 |
| B | 17 | 33 | 7 |
| C | 2 | 26 | 3 |

(A row can carry two marks, e.g. W+F.)

| Row | Item (short) | Lane | Class | Owner | Reason (Done-when and DORA keys) |
|---|---|---|---|---|---|
| LR-003 | Rules trim: retire or re-word expired rules (P-734, IDX-17 FULL_RUN_F… | Lead | B | L | Expired rules cost attention on every task (C2, C13); not on the change path; the enforcer-file check is cheap once rules are trimmed. |
| LR-005 | Accounts and outside-dependency registers current: Enterprise, org, M… | Lead | B | L+F | Outside-dependency register; no effect on lead time or fail rate of product changes; founder supplies account facts. |
| LR-006 | Founder items: Time Machine/iCloud backup, AWS domain, BoldSign and C… | Lead | B | F | Founder admin clocks (backup, domain, BoldSign, Cloudflare, payment); do on their own dates, not gated by the lab. |
| LR-007 | Lead checks: allow rule for scheduled skills and self-paced loop; /mo… | Lead | B | L | Allow rule for scheduled skills avoids a prompt stall; two dated lines, no build. |
| LR-008 | Records chores: T16 departure record for #2062 (0.6 threshold Sample)… | Lead | B | L | Two DECISIONS rows (departure record, P-203 amendment); records hygiene, minutes of Lead work. |
| LR-009 | STATE on main current: the live page on main, not only on the Lead's… | Lead | C | L | Superseded by the private split: STATE leaves public main (PRIVATE-RECORDS.md, #3924); CURRENT-LEAD.md is the public line. |
| LR-032 | #3506 the Lead's tools are main's, its copy under 24 h old (OS-11); L… | fast-route | C | W | Done-when names #3506, but OS-11 merged another way in #3902 (tools-on-main.sh in lead-watch) and fresh Lead branches are #3926 (LR-156); close #3506, reword row. |
| LR-033 | #3693 the Lead's records PR in one command (OS-15); lead-pr.sh replac… | fast-route | C | W | Lead records PR in one command; records move to expat-ready/private (LR-116), so public records PRs end; rebuild there only if still needed. |
| LR-034 | #3696 the Lead's start read on one page, summed by check-docs (warn 4… | fast-route | C | W | Lead start-read size check; the Lead skill and STATE move private (LR-116/117); builder start size is LR-052. |
| LR-035 | #3715 project verify skill before each app-code commit (OS-72); use t… | fast-route | B | W | Verify skill on trial lanes needs product lanes to measure; bundled /run may cover it (register question 4). |
| LR-036 | #3814 comment-triggered workflows start no job on a comment without t… | fast-route | A | W | #3814 approved, dequeued on a conflict: comment-triggered jobs on a public repo are a runner and CI-noise risk; merge main and land. |
| LR-037 | #3825 near-Proven product PRs go first (Mergify priority, OS-50); lan… | fast-route | A | W | #3825 approved (85 lines), dequeued on a conflict: near-done product PRs first cuts lead time at restart; must land before the switch edits .mergify.yml. |
| LR-038 | #3819 pipeline watch: the Lead's detectors run in CI and post each ac… | fast-route | B | W | #3819 detectors in CI: useful for recovery time, but pr-suites red and Steward/auto-fix (#3902) overlap; land only detectors Steward does not cover. |
| LR-039 | #3833 check-guards.sh reads mutation rows from guards.d, one file per… | fast-route | A | W | #3833 guards.d ends the check-guards.sh conflict chain that blocks every pipeline PR (lead time); #3921 item (a) waits on it. Over 800 lines, size exception granted. |
| LR-040 | #3837 lead-watch shows no ACT about an event over 72 h old (weekly st… | fast-route | C | W | #3837 (1,700 lines) filters stale ACT lines in lead-watch, a Lead-only tool moving private (LR-117); cost far above value. |
| LR-041 | #3843 the full run and a missing pr-suites run start by themselves on… | fast-route | A | W | #3843 full run and missing pr-suites start themselves on Approve/label: removes a manual restart on every PR (lead time). 1,787 lines: split under 800 or size exception. |
| LR-042 | #3742 A389 part 1: clauses as data (qa/clauses.tsv, guard 41) and two… | fast-route | B | L | #3742 qa clauses as data is product-side qa design; needs the Lead ruling on Questions 1-3; after restart. |
| LR-043 | pr-rules: fix its false failures, then make it required (800 lines, D… | fast-route | A | W | pr-rules false failures waste rounds; once clean and required, PR size, Done when and duplicate check fail closed for product PRs. |
| LR-044 | guards required by path, wider paths, the 5 orphan tests wired; guard… | fast-route | A | W | Guards parts sit at the 45-min limit (part 1/4 timed out on #3715) and 5 tests are orphaned: timeouts and silent gaps raise fail rate and lead time. |
| LR-045 | Destructive or non-additive database migrations refused; later migrat… | fast-route | A | W | Data safety: a destructive migration on main is the costliest failed change (CS-W1 migrations just merged); fail closed on DROP/non-additive. |
| LR-046 | Small hook and check fixes: founder-wait time from the line (OS-18b),… | fast-route | A | W | Stop timeout 20 s measured: a killed Stop hook fails open (push-before-stop, P-557); plus curl -L and founder-wait fixes; small. |
| LR-047 | Builder PRs open ready, not draft; Approve before leaving draft | fast-route | B | W | Ready-not-draft matters when Steward/Code Review run (they skip drafts, C9); with the SS-3 rollout. |
| LR-048 | Graduate the report-only checks (pr-suites parts, walks, skeleton par… | fast-route | B | W | Graduate or delete 8 report-only checks needs false-block counts measured on real product PRs; decide after restart. |
| LR-049 | Lead detectors added to the pipeline watch after #3819: human-cancell… | fast-route | C | W | More Lead detectors duplicate PR Steward (LR-071, which retires OS-20/OS-68 detectors) and #3902 builder auto-fix; LR-073 retires watch scripts. |
| LR-050 | Release-line acts: the three release rows always have an owner (OS-79… | fast-route | C | W | A "Release 1 not done" report line and release-row owners are BACKLOG ordering work, no tool needed; a line nobody acts on. |
| LR-051 | Every check prints its rule id, the reason and the allowed fix | fast-route | B | W | Rule id/reason/fix in every refusal speeds fixes, but a sweep of all checks conflicts with every bundle; apply per check as touched. |
| LR-052 | Session-start output under 1.5 KB; context diet measured with /contex… | fast-route | B | W | Session-start under 1.5 KB saves tokens per session; not on the merge path. |
| LR-053 | Hand-over warning at the context line: a Stop hook reads the transcri… | fast-route | C | W | Context hand-over warning duplicates built-in auto-compaction (C12) and the P-446 hand-over. |
| LR-054 | A Stop hook runs the task's own Done-when check before a builder stops | fast-route | C | W | Stop hook running the Done-when duplicates LR-121 (/goal until the check passes, built in); keep one mechanism. |
| LR-055 | Walks after a qa merge: the push plan walks the journeys a merged qa… | fast-route | C | W | qa PRs already carry their walk runs (e.g. #3884, 17/17); re-walking on merge duplicates that evidence. |
| LR-056 | Auto-requeue: the bot writes the 'Batch failures covered' line after… | fast-route | B | W+F | Auto-requeue removes relabel churn (#3814/#3825 sit dequeued) but is blocked on the P-731 ruling and moot after the switch (LR-072 + LR-148); build only if the switch slips. |
| LR-057 | Outside contributors need approval before workflows run; Mac runner (… | ship-security | A | W+F | Risk 2: public repo can reach the Mac runner; fence queue-gate/demo-update to a runner group; settings need the founder account. |
| LR-058 | Patch the 9 high dependency alerts; Dependabot security updates and a… | ship-security | A | W | 9 high dependency alerts and no .github/dependabot.yml on main: security baseline (C20), free. |
| LR-059 | CI actions pinned to full commit SHAs; report-only dependency audit;… | ship-security | A | W | No workflow action is SHA-pinned on main (actions/checkout@v4 x52 etc.): supply-chain baseline (C20); do last, it touches every workflow. |
| LR-060 | One allow-list door for GitHub writes (curl writes no longer pass the… | ship-security | A | W | curl writes bypass the gh deny lines: agents could write to GitHub outside the allowed script (AGENTS rule 1, compliance). |
| LR-061 | CODEOWNERS for pipeline, migration and .github files | ship-security | B | W | CODEOWNERS only bites with a required code-owner review and a second identity; after the switch (LR-072). |
| LR-063 | Second org owner and recovery codes (A3 backup owner) | ship-security | A | F | One org owner is a single point of total loss (recovery); founder, minutes, no code. |
| LR-064 | Read-only tokens for reviewer, breaker, qa sessions and routines | ship-security | B | W | Least privilege for routines is worth it later; subagents share the session token, so per-agent read-only tokens are not possible today. |
| LR-065 | Machine user for the Lead: a separate GitHub account approves money,… | ship-security | C | F | Superseded by P-849: Claude Approvals is the approver (LR-144); reopen only if an Approvals approval cannot satisfy the ruleset. |
| LR-067 | Claude Code Review, Manual: the Lead posts @claude review on money, s… | ship-security | B | L+F | Code Review Manual on risky paths: the 20-run cost read needs product PRs; REVIEW.md (LR-130) goes first; top-up is the founder's. |
| LR-068 | Deep review at milestone gates: /code-review ultra and a security pas… | ship-security | B | L | Deep review at milestone gates: a checklist line, used at the next product gate. |
| LR-070 | Claude Approvals in observe mode: Claude approves routine paths after… | ship-security | C | W | Reworded into LR-144 (P-849); same approvals.yml. |
| LR-071 | PR Steward, Manual on chosen PRs then On; auto-fix on cloud PRs now;… | ship-security | B | W+F | PR Steward needs the ruleset rules first (C8: dismiss stale approvals); after LR-072; #3902 auto-fix covers builder PRs meanwhile. |
| LR-072 | The switch, one revertible PR: GitHub ruleset on main (1 approval, di… | ship-security | A | W+F | The switch: ruleset + queue on a real approval removes the Lead label bottleneck (lead time) and gives a true approval (compliance); founder yes; last, after the baseline (LR-097) and Approvals observe. |
| LR-073 | After two measured weeks: retire the label-guard family, watch script… | ship-security | B | W | By definition two measured weeks after the switch. |
| LR-074 | All-routes sign-in sweep: every API route, signed out and with the wr… | ship-security | A | W | Broken access control is the top web risk (OWASP A01); a signed-out/wrong-role sweep of every route protects every product change; warning first. |
| LR-080 | Remove unused scout, m3-guard, m2-hot-files (and confirm the Codex/Go… | cleanup | B | W | #3847 removes unused tools: less surface and guard time; no review yet; anytime. |
| LR-081 | Old branches: 2,040 remote heads (30 claim/*), leaked claim branches,… | cleanup | B | W+F | 2,040 remote heads slow fetches and confuse lanes; auto-delete is a repo setting; not on the change path. |
| LR-082 | Old dequeued PRs with no owner: close or give an owner | cleanup | B | L | Close or own stale PRs (WIP limit); Lead sweep, no build. |
| LR-083 | Lint tools: eslint, typescript-eslint, react-hooks with bulk suppress… | cleanup | B | W | eslint/react-hooks report-only catches real bugs but is new tech through STANDARDS 1; after restart. |
| LR-084 | Refactor measure R0: knip, dependency-cruiser, jscpd as one report-on… | cleanup | C | W | knip/dep-cruiser/jscpd baseline only feeds the refactor the founder deferred (R1-R8); a measure nobody acts on now. |
| LR-085 | Refactor R1-R8: module cards, backward imports, group core, one folde… | cleanup | C | W | Founder deferred until Release 1 is near done. |
| LR-086 | Clean-up stage 2b: packages (p2, contracts) plus fromStored() for sto… | cleanup | C | W | Founder deferred (folder move). |
| LR-087 | Clean-up stage 2c and one path map: the files open PRs edit and about… | cleanup | C | W | Founder deferred (folder move). |
| LR-088 | The folder move, stages 3-6 (app, reference inputs, tools, docs) in a… | cleanup | C | F | Founder deferred until Release 1 near done. |
| LR-089 | Clean-up stage 7: remove empty folders, root README, repository renam… | cleanup | C | W | Founder deferred (folder move, rename). |
| LR-090 | One glossary and three ID levels (requirement, capability R1.n, task)… | cleanup | B | W | Glossary and ID levels serve the founder language rule; not on the change path. |
| LR-091 | Shrink the records: open backlog rows and recent decisions in the wor… | cleanup | B | W | DECISIONS done by #3906 (83.5 KB); BACKLOG is still 779 KB; builders grep their row, so the same word-for-word move can follow. |
| LR-097 | Measures: 7-day baseline before the switch and the five DORA metrics… | automation-measures | A | W | measures.py and measures.yml exist (#3902); the committed 7-day baseline must exist before the switch or LR-072/073 cannot be judged; cto-review must name the five. |
| LR-098 | Measure scripts and the board read through GraphQL where REST runs out | automation-measures | C | W | flow-measure.py is superseded by measures.py (#3902); reopen only if measures.py hits a rate limit. |
| LR-099 | Burn watch: over 3% of the weekly plan an hour twice is an ACT; push… | automation-measures | B | W | Burn watch protects the plan budget, not change quality; founder rule: plan is never a limit. |
| LR-100 | Automatic staging deploy on merge and after a secret changes | automation-measures | B | W | Staging deploy on merge is deploy frequency itself but blocked by PF-8c (product); after restart. |
| LR-102 | Lab progress from this register: the six workstreams' progress counte… | automation-measures | C | W | Lab progress counter lives only as long as the lab; this triage and a grep do it. |
| LR-104 | Routines: turn cap, WIP brake, run log, starter script; brake retuned… | full-power | B | L | Routine prompts naming an old Lead branch should be fixed; claude.ai routine settings, no repo change. |
| LR-105 | Anti-stall rest: away-flag hook, launchd heartbeat with a push test,… | full-power | C | W | Mac-local anti-stall (launchd heartbeat, away flag) is superseded by watches off the Mac (LR-123) and auto-fix/Steward. |
| LR-106 | One generated task spec per task (requirement text, decisions in word… | full-power | C | W | A generated task spec duplicates the BACKLOG row's Done-when plus LR-121; over-engineering. |
| LR-107 | Design in plan mode; the concept file is its output | full-power | B | W | One screen-concept line (plan mode, C3); product design step. |
| LR-108 | Trial one saved build workflow (/goal until the check passes) on 3 ta… | full-power | B | W | Trial on 3 product tasks; needs product. |
| LR-109 | Replace the 8,000-line board with a small page, only after the new pa… | full-power | C | W | The board is a Lead tool moving private (LR-117); replacing it is maintenance, not flow; defer. |
| LR-110 | Flaky suites and the nightly: fix the quarantined suites; the nightly… | full-power | A | W | Quarantine list now empty (#3937); main must show 7 green nightlies before product restarts or batches fail (change fail rate). Elapsed time; new PR only on a new red. |
| LR-111 | Weekly reviews: Monday what's-new check of the Claude Code docs, /doc… | full-power | B | L | Weekly docs/what's-new note; Lead routine. |
| LR-112 | Later product-quality checks: visual compare (OS-74), design-system c… | full-power | B | W | Later quality checks, stated as later phases. |
| LR-113 | Product-side items held by the product pause: prove capacity, test to… | full-power | B | L | Held product items return to BACKLOG at restart, by definition. |
| LR-114 | Production hand-over contract written now, built later: production fr… | full-power | B | W | Production contract matters before launch (12 Mar 2027), not before restart. |
| LR-115 | Factory folder layout in expat-ready/private; the Lead clones both re… | private-split | A | W | Private README is one line (no layout); PS-1 in flight; records traffic leaves the public queue (records merges reset batches). |
| LR-116 | Move the records (STATE, DECISIONS, BACKLOG, history, lanes, inbox, r… | private-split | A | W | PS-1c: readers moved (#3924), files still public; finish so Lead records stop sharing the product queue; one revert PR per repo. |
| LR-117 | Move the Lead-only skills and tools (lead, lead-watch, strategy desk,… | private-split | B | W | PS-2, Lead skills and tools later step per the plan (#3911). |
| LR-118 | Evidence: a short proof summary per row stays public; bulky screensho… | private-split | B | W | Bulk done (#3900/#3901: 5,164 images out, CI artifacts); rest waits for the evidence-destination ruling. |
| LR-119 | What stays in xpatready: product, builders' skills and agents, CI scr… | private-split | A | W | Fail-closed guard that files the required checks read stay public (risk 4); lands with PS-1c. |
| LR-121 | L-1 /goal on every builder and lab brief: 'Done when test passes, sto… | automation-measures | A | W | /goal "until the check passes, stop after N" on every brief bounds builder loops and wasted rounds (C1); tiny. |
| LR-122 | L-2 Lead's manual checks encoded: labels via Claude Approvals (the ap… | ship-security | C | W | Duplicate of LR-072 (merge with no label) + LR-144 (approvals.yml routing). |
| LR-123 | L-3 Watches off the Mac: queue/CI health and qa-after-merge as cloud… | automation-measures | B | W | qa part done by #3902 (LR-101); the health watch off the Mac remains: detection, not prevention. |
| LR-124 | L-4 Routines for recurring work: dependency upgrades, qa after merge,… | ship-security + automation-measures | C | W | Dependency upgrades are Dependabot (LR-058); qa after merge is #3902 (LR-101). |
| LR-125 | L-5 Stricter self-check: zero new console errors, Core Web Vitals bud… | automation-measures | B | W | Console-error/CWV budget in journey-test is product-side; existing walks would need clean-up first; report-first after restart. |
| LR-126 | L-6 Library docs before coding via Context7 | automation-measures | B | W | Context7 lookup: one skill line; no measure needed. |
| LR-127 | L-7 Watches end when their work completes; events over intervals | automation-measures | B | W | Watches ending on completion saves tokens; Lead ops. |
| LR-128 | L-8 Pilot before any large multi-agent run; /usage breakdown in the d… | automation-measures | B | L | Pilot rule and /usage line; Lead records. |
| LR-130 | CR-1 Short root REVIEW.md, its own PR first: what Important means for… | ship-security | A | W | REVIEW.md must exist before risky product PRs get Code Review, or reviews run without our definition of Important (noise, rounds). |
| LR-131 | CR-2 Confirm main counts as protected so Code Review reads REVIEW.md;… | ship-security | C | W | Ruleset with dismiss-stale is LR-072; fold the "main counts as protected" read into LR-130's Done-when. |
| LR-132 | CR-3 Read Code Review's verdict by script on risky PRs (title first,… | automation-measures | B | W | Script read of the Code Review verdict (catches silent skips, risk 3) matters once Code Review gates risky PRs (LR-067). |
| LR-133 | CR-4 On risky PRs every Important finding is fixed or resolved with a… | fast-route | A | W | Risky PRs (money, schema, migration) fix or answer every Important finding before approval; one brief line; quality of risky changes. |
| LR-134 | CR-5 PR template gains 'Risk' and 'How to revert' | automation-measures | A | W | Risk and How-to-revert in the PR template: recovery time starts from a known revert; tiny. |
| LR-135 | CR-6 Reviewer brief converges faster: tag Important/Nit/Pre-existing,… | fast-route | A | W | Reviewer brief tags Important/Nit/Pre-existing and never repeats: fewer review rounds per PR (lead time). |
| LR-136 | CR-7 Reviewer test set from our own reverts and main-red PRs (10-20 c… | automation-measures | B | W | Reviewer eval set needs reverts and main-red cases collected; after the brief change. |
| LR-137 | CR-8 Monthly review numbers: noise (fixed / wrong / intentional / not… | automation-measures | C | W | Monthly review-noise numbers nobody acts on yet; fold into measures.py later if needed. |
| LR-138 | A finding repeated on 3 PRs becomes a REVIEW.md line, a lint or a che… | Lead | B | L | Repeat finding -> REVIEW.md line/check: needs REVIEW.md and real findings. |
| LR-139 | The Lead's after-read note on a risky PR names what the checks would… | Lead | C | L | Duplicates LR-067 (Manual @claude review on risky paths) and LR-132 (missing verdict caught by script). |
| LR-140 | Code Review coverage: Manual on each repo the moment it is added, exp… | ship-security | B | F | Code Review on the private repo once it carries factory code (after LR-117). |
| LR-141 | Learning the code when agents write it all: a 5-line plain-words expl… | fast-route | C | W | Merge into LR-134: the same PR-template section ("what changed, why, what could break") checked by pr-rules. |
| LR-142 | Layer map, not one gate: each layer (self-check, reviewer, breaker, C… | automation-measures | C | W | Escape counts per layer: a map nobody acts on; DORA change fail rate already judges the whole. |
| LR-143 | Account-switch enforcement (OS-86, A417): `account-switch` rules file… | automation-measures | B | L | Account-switch checklist and ledger; Lead ops, recurring pain but off the change path. |
| LR-144 | Approvals policy fitted to our repo before approvals.yml lands: LR-07… | ship-security | A | W+F | approvals.yml in observe mode now, so the observe week elapses during the lab; required before LR-072; founder Connect/top-up. |
| LR-145 | One model and effort for the whole organisation through server-manage… | full-power + Lead | C | F | #3896 already commits model/effort in .claude/settings.json and a deny hook (agent-model-guard); org server settings are extra. |
| LR-146 | Nudge idle cloud lanes by script (`claude -p "<msg>" --cloud <session… | automation-measures | B | L | Script nudge of idle cloud lanes; throughput, Lead ops. |
| LR-147 | StopFailure hook: a lane that dies on a rate limit, billing or sign-i… | automation-measures | B | W | StopFailure record for dead lanes; recovery of lanes, after restart. |
| LR-148 | Keep approval across a pure merge from main (`reuse: claude/diff <= t… | ship-security | A | W | Keep approval across a pure main merge: ends the dequeue/re-approve churn (#3814, #3825 today); same approvals.yml as LR-144. |
| LR-149 | PR Steward house rules in `.claude/skills/steward/SKILL.md`, under th… | ship-security | B | W | Steward house rules ship with Steward (LR-071). |
| LR-150 | Measure reviewer overlap over the first 20 Manual Code Reviews, then… | Lead + automation-measures | B | L | Reviewer overlap needs 20 Manual reviews first. |
| LR-152 | Path-scoped rules in `.claude/rules/*.md` for file-specific builder c… | full-power | B | W | Path-scoped rules shrink builder start reads; tokens, not flow. |
| LR-153 | After-the-lab list (scope frozen 27 Nov): commit verification stamp (… | Lead | B | L | After-the-lab list moves to BACKLOG at restart; one records commit. |

**Class A rows:** LR-036, LR-037, LR-039, LR-041, LR-043, LR-044, LR-045, LR-046, LR-057, LR-058, LR-059, LR-060, LR-063, LR-072, LR-074, LR-097, LR-110, LR-115, LR-116, LR-119, LR-121, LR-130, LR-133, LR-134, LR-135, LR-144, LR-148

**Class C rows:** LR-009, LR-032, LR-033, LR-034, LR-040, LR-049, LR-050, LR-053, LR-054, LR-055, LR-065, LR-070, LR-084, LR-085, LR-086, LR-087, LR-088, LR-089, LR-098, LR-102, LR-105, LR-106, LR-109, LR-122, LR-124, LR-131, LR-137, LR-139, LR-141, LR-142, LR-145

## 3. Class A bundles and order

Rule used: each bundle ≤800 changed lines (pure moves/deletions and lockfiles named as exceptions), no two bundles touch the same file; guard rows go into guards.d/ (one file per item) after #3833, so no bundle edits check-guards.sh.

| Order | Bundle | Rows | Files | When / unblocks |
|---|---|---|---|---|
| 0 | Founder steps (no PR) | LR-063, LR-057 (runner-group setting), LR-144 (Connect, top-up), LR-072 (the yes) | GitHub org/repo settings, claude.ai admin | Now, in parallel; LR-144 Connect gates bundle A6; LR-072 yes gates A10. |
| 1 | In flight, land in this order | LR-039 #3833 → LR-036 #3814 and LR-037 #3825 (merge main, diff-only Approve) → LR-041 #3843 | check-guards.sh + guards.d/; issue_comment workflows; .mergify.yml; CI trigger workflows | First. #3833 (1,521 lines) has its size exception; #3843 (1,787 lines) needs a split under 800 or an exception. |
| A1 | Hooks fail closed | LR-046, LR-060 | .claude/settings.json (Stop timeouts ≥60, deny lines), hook scripts, small check fixes, guards.d rows (~300 lines) | After #3833; parallel with A3-A9. |
| A2 | Guards right-sized | LR-044 | guards part list in the guards workflow, 5 orphan tests wired via guards.d, path rules (~400) | After #3833 and #3843 (both touch guard/CI wiring). |
| A3 | PR rules fail closed | LR-043, LR-134 (+LR-141 folded in) | .github/workflows/pr-rules.yml, pr-rules tool scripts, .github/pull_request_template.md (~400) | After #3833; then make pr-rules required (queue condition in the switch, A10). |
| A4 | Review converges | LR-130, LR-133, LR-135, LR-121 | REVIEW.md (new), .claude/agents/screen-reviewer.md, .claude/skills/next/SKILL.md, tools/brief-check.sh, one guards.d row (~250) | After #3833; before the first risky product PR. |
| A5 | Product safety checks | LR-045, LR-074 | new tools (migration check, route sweep), new workflow safety.yml (warning first), guards.d rows; no edit to ci.yml (~600) | After #3833; parallel. |
| A6 | Switch preconditions | LR-097, LR-144, LR-148 | committed baseline file (7-day DORA five), .claude/skills/cto-review/SKILL.md, .claude/approvals.yml in observe mode (~200) | After founder Connect; starts the observe week, so early. |
| A7 | Private split PS-1c | LR-115, LR-116, LR-119 | product/ records files (pure deletions, moved to expat-ready/private), check-docs.sh or a new stay-list guard, private repo README (separate PR there) | After #3833; deletions exceed 800 lines as a pure move (P-838-style exception, as #3906); one revert PR per repository. |
| A8 | Dependencies | LR-058 | .github/dependabot.yml (new), studio package.json + lockfile for the 9 high alerts (lockfile lines excluded) | Parallel; the full route runs (product files). |
| A9 | Workflow hardening sweep | LR-057, LR-059 | every .github/workflows/*.yml (SHA pins, runs-on fence for queue-gate/demo-update), actionlint report-only (~150) | Last of the workflow-touching bundles: after #3814, #3843, A2, A3, A5. Dependabot (A8) keeps the pins current. |
| A10 | The switch | LR-072 | .mergify.yml queue condition, ruleset (setting), #3851 rebased | Last: after #3825, A3 (pr-rules required), A6 (baseline committed, observe week read), founder yes. LR-110 (7 green nightlies) must hold before product restarts; no PR unless a nightly goes red. |

Critical path: #3833 → (#3843) → A2/A3/A5 → A9 → A10, with A6 starting the observe week as early as the founder connects Approvals. Parallel after #3833: A1, A3, A4, A5, A6, A7, A8 (7 lanes at once, distinct files). Product can restart once bundle 1, A1-A5, A7, A8 are merged and LR-110 shows 7 green nightlies; A9-A10 may follow inside the first product week only if the founder accepts that order (the switch mid-product is the riskier option).

