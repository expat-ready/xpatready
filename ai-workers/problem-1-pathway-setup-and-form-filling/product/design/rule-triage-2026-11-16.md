# Rule triage: every prose row checked, merged or retired (B193 part 5, 16 Nov 2026)

Written by the rule-triage lane (cloud, Opus 5.5 high), 16 Nov 2026 01:0x IST, from `RULES.md` on main af7df6d6, for row B193 part 5 (P-619 step 6: "the 102 prose rules triaged: each gets a check, is merged into another, or is retired as history; target under 30% prose in two weeks"; founder 16 Nov: "there are too many rules and many are not followed"). No rule's words were changed: merged and retired rows moved word for word to `rules/merged-and-retired-2026-11-16.md` (P-188, P-611); enforced-by cells were not touched (B193 part 2 owns six of them). Round 1 of the Opus review found 13 merges and 3 retirements where the target did not cover the moved rule's duty; those 16 rows were kept as CHECK (their "Why" cell says so).

## 1. Counts
| | Before (main af7df6d6) | After this PR | After the 12 stale cells are named (section 4) |
|---|---|---|---|
| Rows in the register | 145 | **131** | 131 |
| Rows enforced by a hook, CI step or script (in whole or part) | 32 | 32 | 44 |
| Rows `prose` (only the reader enforces them) | 113 | **99** | 87 |
| **Prose share** | **77.9%** | **75.6%** | 66.4% |

P-619's "102 prose rules" was counted at 18:4x IST 15 Nov on a 142-row register; main af7df6d6 has 145 rows, 113 of them prose (rows added since, e.g. P-616 and P-618 to P-622, are prose). Under 30% of 131 rows is at most 39 prose rows: about 48 checks from the queue in section 3 beyond the 12 cells in section 4. 70 of the 99 check rows are cost S.

The share falls little from merging alone: most prose rules are distinct duties, so the lever is checks, not fewer rows. Outcomes for the 113 prose rows: **99 CHECK, 9 MERGE, 5 RETIRE.** Of the 99 checks, 12 already exist in whole or part and only the cell is stale, 1 is built but not wired (P-557), 4 are being built by B193 parts (P-423, P-619, P-620, P-622), 82 are new (P-302's existing warning among them, since a warning does not block).

**No rule lost:** `rules/rule-id-map-2026-11-16.tsv` lists all 145 old IDs, each `kept`, `merged` (with the row that says the same) or `retired` (with the row that supersedes it), and the sha256 of each moved line. `tools/check-docs.sh` fails when a kept ID is not a RULES.md row, a moved row is not byte for byte in the side file, a merge target is gone, or the count is not 145; its test `tools/check-rule-triage.sh` (8 cases; in `check-guards.sh`, with a mutation that switches the check off and turns the test red). A later triage that removes a row kept here edits this map (marks it merged or retired) or adds its own dated map.

Cost classes: **S** one small tooling PR (under ~150 lines, under half a day, US$0); **M** one PR of ~150-400 lines or one that reads GitHub or sessions; **L** several PRs or only partly mechanical.

## 2. Every prose row and its outcome
| ID | Section | Outcome | Into / enforcer | Cost | Breaks 13-16 Nov | Why |
|---|---|---|---|---|---|---|
| IDX-1 | Goal and order | CHECK | check-docs.sh: every ID an IDX row lists exists in DECISIONS.md (index integrity, with IDX-2, IDX-4, IDX-5) | S | 0 | Kept: its milestone IDs are in no other row (review, round 1). |
| P-418 | Goal and order | CHECK | lead-watch.sh prints the pick list in P-418's order (red main, awaiting qa, blockers, Partials, drafted, new) from data it already reads | M | 0 | The order is computable from the queue, BUGS and BACKLOG; today the skill text holds it. |
| P-464 | Goal and order | CHECK | pr-rules step: a PR touching packages/xfa-engine/ carries an "XFA reuse:" line naming the head-to-head | S | 0 | Judgement stays the reviewer's; the check makes the comparison visible. |
| P-470 | Goal and order | CHECK | pr-rules step: a change under packages/xfa-engine/src/ also changes PATCHES.md; push-guard refuses the ER v2 repository URL | S | 0 | Two greps. |
| P-468 | Goal and order | CHECK | a prune-copies.sh that deletes a copy only when it is pushed, clean, untracked files archived and no session uses it (as prune-test-dbs.sh does for databases) | M | 0 | Deletion by hand is the risk; a script makes the four conditions the only path. |
| IDX-2 | Goal and order | CHECK | check-docs.sh index integrity (with IDX-1, IDX-4, IDX-5) | S | 0 | Kept: some entries stand (P-545, P-569 integration stopped) and no other register row holds them (review, round 1). |
| P-473 | Goal and order | CHECK | CI dependency deny-list: no motion library in web/package.json; copy test that every client question has a "Why we ask" | S | 0 | The style judgement stays with the reviewer; the two mechanical parts become checks. |
| P-550 | Goal and order | MERGE | P-558 | - | - | Both say: more than one tech Lead for the four weeks from 13 Nov, each owning named modules; P-558 names who holds what (and P-622 (4) now trims the number). |
| P-558 | Goal and order | CHECK | module-cards.py: each module card names its owning Lead; label-guard refuses a label by a Lead copy that does not own the PR's module | M | 0 | Module cards are already checked by CI (module-cards.yml). |
| P-547 | Goal and order | CHECK | ci.yml: confirm the document-system check (check-docs.sh) runs only in the notes and records jobs, never as a product-PR gate; a test fails if it is added to a product job | S | 0 | The approval itself is history; its one standing clause is mechanical. |
| P-583 | Goal and order | CHECK | a settings-read script (GitHub API): secret scanning, private vulnerability reporting, workflow actions pinned to SHAs; MVP-CHECKLIST C7 says steps 8-11 are still open | M | 0 | Kept: not done (MVP-CHECKLIST C7 "In progress", actions still on @v4 tags) (review, round 1). |
| P-589 | Goal and order | CHECK | check-docs.sh: MVP-CHECKLIST's gate row "repository private before the first real firm's data" must be done before any real-firm-data row turns green | S | 0 | Kept: going private at the gate is a duty P-539 does not state (review, round 1). |
| IDX-5 | Goal and order | CHECK | check-docs.sh index integrity (with IDX-1, IDX-2, IDX-4) | S | 0 | Reading the row when its capability is touched stays prose; the index itself can be kept true. |
| IDX-3 | Goal and order | RETIRE | P-569 | - | - | Integration stopped (P-569); the rows are kept word for word in `rules/goal-and-order.md` for a resume. |
| IDX-4 | Goal and order | CHECK | check-docs.sh index integrity (with IDX-1, IDX-2, IDX-5) | S | 0 | Kept: its product-ruling IDs are in no other row (review, round 1). |
| F-12Nov | Goal and order | CHECK | decision-impact check: each new DECISIONS row states time, cost and quality impact (shared with P-254) | S | 0 | "Value against cost" is judged; stating it on every decision is checkable. |
| P-500 | Goal and order | CHECK | exists in part: cockpit-data.py tags every board number with source and class (P-596); extend to reports/*.md numbers | M | 0 | Board part already mechanical. |
| P-502 | Goal and order | CHECK | reviewer verdict template: a fix PR's review names the root cause and the evidence; label-guard refuses an Approve without that line on fix PRs | M | 0 | Proxy check; "no guessing" stays judgement. |
| P-503 | Goal and order | CHECK | report-check.sh (Stop hook in the Lead copy): a Lead report has Needs you, Decide when you can, decided (≤5), doing (3-4), Works, merged, blocked, next three with IST times (P-478, P-503, P-338 in one check) | M | 0 | Three report rules, one linter. |
| P-504 | Goal and order | CHECK | push-guard: a deny-list of team-app terms (kept as hashes, so the list itself reveals nothing) checked on every pushed diff | M | 0 | The classifier half ("never routed around") stays prose, as P-387. |
| P-505 | Goal and order | CHECK | same scanner as P-504 over every commit base..head of a PR, so a PR that ever carried the detail fails | S | 0 | One extra loop on P-504's check. |
| P-508 | Goal and order | CHECK | AskUserQuestion hook in the Lead copy (with P-388, P-390, P-512) | M | 0 | Kept: P-509 says P-508 stands as insurance, and its reference-folder clause is in no other row (review, round 1). |
| P-511 | Goal and order | RETIRE | P-558, P-622 | - | - | "One Lead" was amended by P-550 (merged into P-558), replaced by P-558's two Leads and trimmed by P-622 (4); the strategy desk itself stands in P-514 and P-597. |
| P-512 | Goal and order | CHECK | AskUserQuestion hook in the Lead copy: refuses a card when the founder's last turn is older than 10 min (one hook with P-388, P-390) | M | 0 | The canada.ca half is P-170's check. |
| P-514 | Goal and order | CHECK | lead-watch.sh prints the desk track file's last commit time and an ACT line when it changed since the last check | S | 0 | - |
| P-515 | Goal and order | MERGE | P-502 | - | - | DECISIONS P-515 says it "extends P-502": both say every step rests on evidence and a framework compared against options, never assumption. |
| P-530 | Goal and order | CHECK | lead-watch.sh: an items.py founder item waiting over 30 min with no red "Waiting on the founder" line atop STATE is an ACT line | S | 0 | items.py already holds the times (P-611b). |
| P-536 | Goal and order | MERGE | P-486 | - | - | Both list the same founder-only exceptions (money, a lower bar, a day or more, permissions, security) to the Lead deciding alone. |
| P-539 | Goal and order | CHECK | exists in part: push-guard refuses sources/, code/, archive/; extend to the private-notes paths | S | 0 | - |
| P-541 | Goal and order | MERGE | P-170 | - | - | Both say: an immigration value leaves Sample only with an official citation (page, quote, date). |
| P-542 | Goal and order | CHECK | brief-check.sh: a product row's "waits on" may not name a tooling (B-, G-) row | S | 0 | - |
| P-551 | Goal and order | CHECK | check-docs.sh: MVP-CHECKLIST's launch-condition rows (on call, support, breach owners) must be filled before the gate row turns green | S | 0 | "No account but the founder's" is held by the sandbox already. |
| P-553 | Goal and order | CHECK | pr-rules step: a PR that adds a dependency carries a "STANDARDS §1:" line (with P-587) | S | 0 | Kept: "launch on our own build" is not in P-587 (review, round 1). |
| P-555 | Goal and order | MERGE | P-461 | - | - | Both say there is no usage cap and lanes push every step so any account resumes. |
| P-556 | Goal and order | MERGE | F-12Nov | - | - | Both say every cost (tokens included) is judged by the value it buys. |
| P-565 | Goal and order | CHECK | lead-watch.sh reads each session's context and prints an ACT line past half its window (one script with P-446, P-446f) | M | 0 | The vendor-facts half is judgement. |
| P-566 | Goal and order | CHECK | decision-impact check: a DECISIONS row the Lead ruled names what settled it (with P-294) | S | 0 | Kept: its firm sign-up clause is not in P-294 (review, round 1). |
| P-576 | Goal and order | CHECK | touch-list check (lane-preflight.sh): a lane whose declared touch list overlaps an open PR's changed files is refused (one script with P-526b, P-438b) | M | 4 | 4 approved PRs stuck on merge conflicts in shared files (P-622 evidence, 15-16 Nov). |
| P-580 | Goal and order | CHECK | not mechanical without computer-use hooks: a PreToolUse hook on computer-use type actions into password fields | L | 0 | Low value: no break seen. |
| P-582 | Goal and order | CHECK | check-docs.sh: every MVP-CHECKLIST item marked left out names a BACKLOG X-row that exists | S | 0 | - |
| P-587 | Goal and order | CHECK | pr-rules step: a PR that adds a dependency to any package.json carries a "STANDARDS §1:" line | S | 0 | - |
| P-592 | Goal and order | CHECK | library-freshness.py: MVP-CHECKLIST is the only Library entry of kind "tracking" | S | 0 | - |
| P-593 | Goal and order | CHECK | exists in part: library-freshness.py and cockpit/library.json (one master per document); verify and name it | S | 0 | - |
| P-595 | Goal and order | CHECK | check-docs.sh: every Release 1 row in BACKLOG has a Source: (the row itself says the step is missing) | S | 0 | Named in the rule as a missing CI step. |
| P-597 | Goal and order | CHECK | strategy-desk skill start check (agent-model-guard style): a desk session not on Fable 5.2 high stops | S | 0 | - |
| P-599 | Goal and order | CHECK | lead-watch.sh: fewer than two ready rows for a lane is an ACT line; review rounds counted by label-guard (with P-277) | S | 4 | 4 PRs went past two review rounds 14-15 Nov (#1758 round 4, #1760, #1753, #1777 round 3). |
| P-600 | Goal and order | CHECK | CI migration-stamp step: a PR's migration folder is new, additive and stamped later than main's newest and than every other open PR's (with P-348h) | S | 0 | - |
| P-602 | Goal and order | RETIRE | P-557 | - | - | A one-night plan for 14 Nov; its standing half (lanes push, STATE says where to resume) is P-557. |
| P-604 | Goal and order | CHECK | PreToolUse hook in builder and qa copies: Read or Grep under sources/ or domain/requirements-*/ is refused; trace-requirements.py --brief is the door | S | 0 | - |
| P-605 | Goal and order | CHECK | exists in part: lane-preflight.sh --hook refuses a brief with no model and effort line (G-4 (7)); agent-model-guard.sh pins reviewers | S | 0 | Enforced-by cell is stale (still "prose"). |
| P-606 | Goal and order | CHECK | exists in part: brief-check.sh in pr-rules (Done when names its test); the WIP part is B193 part 4 | S | 6 | 6 lanes started 15 Nov broke P-606 (10) (DECISIONS P-613). |
| P-607 | Goal and order | CHECK | app tests: trust score never below 0, audit write fails closed, support session read-only (each a test in the studio suites) | M | 0 | Product invariants belong in the product's tests. |
| P-610 | Goal and order | CHECK | exists in part: pr-size.sh in pr-rules (800 lines); re-review diff-only is label-guard's | S | 1 | #1815 at ~1,050 lines (P-617); 15 of 25 PRs over 800 before the check (G-4 (6)). |
| P-611c | Goal and order | CHECK | cockpit-data.py: whats-new.json older than 8 days shows as stale on the board | S | 0 | - |
| P-609 | Goal and order | CHECK | cockpit-reconcile.py: plan.json's Release 1 target equals the DECISIONS date (29 Nov, all 101) | S | 0 | - |
| P-613 | Goal and order | CHECK | items.py: a non-urgent ask is held to the next 09:00 or 21:00 IST batch | S | 0 | Its feeding-Lead part is trimmed by P-622 (4). |
| P-614 | Goal and order | CHECK | cockpit-reconcile.py: plan target equals the DECISIONS date (with P-609) | S | 0 | Kept: "no gate lowered" is not in P-609 (review, round 1). |
| P-608 | Goal and order | CHECK | exists in part: lane-preflight.sh --hook (model and effort line), agent-model-guard.sh (reviewers Opus high) | S | 0 | Enforced-by cell is stale (still "prose"). |
| P-557 | Goal and order | CHECK | built, not wired: pr-open-guard.sh (G-4 (1)) into push-guard.sh, branch-sweep.sh (G-4 (5)) into lead-watch.sh | S | 2 | Cloud lanes slept through CI results 15 Nov (research page item 2; STATE hand-over item 3, three FO-3 lanes). |
| P-348c | When a capability counts as Works | CHECK | check-docs.sh: a CAPABILITIES row at Works names its gate-A walk file | S | 0 | - |
| P-442 | When a capability counts as Works | CHECK | gate-b.mjs: a capability with no PDF is never held on a Validate line | S | 0 | - |
| P-405 | When a capability counts as Works | CHECK | gate-b.mjs / comment-run: a run line with WAIT, HELD, no pack or fixture-only is Not tested, never green | S | 0 | - |
| P-439 | When a capability counts as Works | CHECK | by platform, not by a check: cloud lanes cannot dispatch Actions; comment-run.yml is the asking door; a hook refusing a dispatch call from a lane copy would make it a check | S | 0 | Not counted as an existing enforcer (review, round 1). |
| P-526 | Builders and qa | CHECK | exists in part: brief-check.sh requires a "Duplicate check:" line in every PR body and brief | S | 3 | #1578 (duplicate of BK-19/BK-20), B170e's part, and a duplicate TR-1 lane, 13-15 Nov. |
| P-526b | Builders and qa | CHECK | touch-list check (lane-preflight.sh, with P-576, P-438b) | M | 4 | Same 4 conflict-stuck PRs as P-576. |
| P-526c | Builders and qa | CHECK | lead-watch.sh: a records PR open over 24 h is an ACT line | S | 0 | - |
| P-337 | Builders and qa | CHECK | stop-check.sh in lane copies: a turn that starts new work after the lane's PR was labelled is warned | M | 0 | - |
| P-436d | Builders and qa | MERGE | P-610 | - | - | Both say: a PR under about 800 changed lines (P-436d adds "split by layer", kept word for word in the side file). |
| P-438b | Builders and qa | CHECK | touch-list check (with P-576, P-526b); m2-hot-files.txt already lists the hot files | M | 0 | - |
| P-348h | Builders and qa | MERGE | P-600 | - | - | Both say two PRs carrying migrations take different (later) stamps. |
| P-270 | Builders and qa | CHECK | label-guard.sh: counts main merges into a PR; the third puts it next in line | S | 0 | - |
| P-303 | Builders and qa | CHECK | exists in part: agent-model-guard.sh (PreToolUse hook and pr-rules CI) pins reviewer and breaker to Opus high; "breaker only for money, schema, permissions or a new screen" is unchecked | S | 0 | Enforced-by cell is stale (still "prose"). |
| P-277 | Builders and qa | CHECK | label-guard.sh: counts Approve rounds on a PR; a third round needs a "Lead: round 3" comment (the Lead's ruling, which P-277 allows) | S | 0 | The 4 round-3/4 PRs 14-15 Nov were ruled by the Lead, as P-277 allows; they count against P-599's target. |
| P-352 | Builders and qa | CHECK | brief-check.sh: a new-screen PR's concept has a best-in-class section and a walk file | S | 0 | - |
| P-319 | Builders and qa | CHECK | CI grep guard on engine code for combination keys, form numbers and program branches (the slice guards retired 8 Nov, revived as one grep) | S | 0 | - |
| QA-221 | Builders and qa | CHECK | forms lint: each form's who-fills and question set cites the form's own official text | L | 0 | Kept: who fills a form is a different scope from P-170's values (review, round 1). |
| P-335 | Builders and qa | CHECK | CI grep: tenant fields (firm id, tenant) outside the PF-* and FO-* module folders fail | M | 0 | - |
| P-251 | Builders and qa | CHECK | lane-preflight.sh: a brief naming a row listed as held in STATE is refused | S | 0 | - |
| P-434b | Builders and qa | CHECK | qa skill start (lane-preflight.sh --hook for qa briefs): one row per qa lane; packs run on GitHub's machines (comment-run) | S | 0 | - |
| P-479 | The tech lead | RETIRE | P-480 | - | - | Parked by P-480 ("let's park it"); nothing to do or enforce while parked; DECISIONS keeps both rows. |
| P-478 | The tech lead | CHECK | report-check.sh (with P-503, P-338) | M | 0 | - |
| P-486 | The tech lead | CHECK | label-guard.sh: a PR touching money, permissions or security paths needs a founder-yes line linked to a DECISIONS row | M | 0 | - |
| P-486b | The tech lead | CHECK | lane-preflight.sh --hook: a brief carries the context limit line; Remote Control session starts refused | S | 0 | - |
| P-384 | The tech lead | CHECK | exists in part: merge-guard.sh (only the Lead copy merges); the rest is a role statement | S | 0 | Kept: "the founder gives product direction only" is not in P-532 (review, round 1). |
| P-423 | The tech lead | CHECK | in progress: B193 part 2 (a hook: no label on money, permissions, schema or migration without a Lead read line); cell left for that lane | S | 3 | Three builders waited 1-3 h for a release-holder read, 15 Nov (research page item 1). |
| P-294 | The tech lead | CHECK | decision-impact check: a DECISIONS row the Lead ruled names what settled it (a decision, canada.ca, or a named practice) | S | 0 | - |
| P-390 | The tech lead | CHECK | AskUserQuestion hook in the Lead copy: one question per card, a "(Recommended)" option (with P-388, P-512) | S | 0 | - |
| P-254 | The tech lead | CHECK | check-docs.sh: each DECISIONS row added after this PR states time, cost and quality (DECISIONS rows already carry "Time: … cost: … quality:") | S | 0 | - |
| P-170 | The tech lead | CHECK | CI: every immigration value in seed and config files carries a citation (page, quote, date) or a Sample label | L | 0 | Several PRs: the seed files are many. |
| P-338 | The tech lead | CHECK | report-check.sh (with P-478, P-503) | M | 0 | - |
| P-286 | The tech lead | CHECK | lead-watch.sh: fewer than two idle standby Leads is an ACT line | S | 0 | - |
| P-388 | The tech lead | CHECK | AskUserQuestion hook (with P-390, P-512); handover.sh refuses a hand-over while a subagent runs | M | 0 | - |
| F-7Nov | The tech lead | CHECK | guard-test-lib.sh and run-suites.sh refuse to run when the working directory is the main copy | S | 0 | - |
| P-363 | The tech lead | CHECK | gh.sh falls back to curl on a TLS failure (a helper, blocks nothing); a hook refusing raw gh writes in the Lead copy would make it a check | S | 0 | Not counted as an existing enforcer (review, round 1). |
| P-302 | The tech lead | CHECK | exists as a warning: check-docs.sh (STATE "updated:" against the commit time); make it a failure, and extend stop-check.sh to every IST time a Lead writes | S | 17 | Leads 28 (twice), 29, 30, 31, 32 (twice), 36, 39 (twice), 40 (twice), 41, 46, 47, 52 (twice) wrote guessed times, 13-15 Nov (STATE history lines). |
| P-371 | The tech lead | CHECK | PreToolUse hook: refuses a Bash or API call that cancels a workflow run | S | 1 | The nightly 15 Nov 05:28 IST run was cancelled (STATE line, 15 Nov). |
| P-616 | The tech lead | CHECK | gate-b.mjs: a capability with no screen may pass gate A on an API walk file | S | 0 | - |
| P-618 | The tech lead | CHECK | exists: outside-deps-watch.py, run by lead-watch.sh step 9 (test check-outside-deps-watch.sh) | S | 0 | Enforced-by cell is stale ("prose (B192 builds the alarm)"). |
| P-619 | The tech lead | CHECK | in progress: B193 parts 1-6 | M | 0 | - |
| P-620 | The tech lead | CHECK | in progress: B193 part 6 (session-start check for the Gmail connector) | S | 0 | - |
| P-621 | The tech lead | CHECK | CI grep: no provider SDK (Microsoft Graph, Google APIs) imported outside the adapter folders, so the ports stay provider-neutral | S | 0 | Kept: "ports stay provider-neutral" is a live builder duty (review, round 1). |
| P-622 | The tech lead | CHECK | in progress: B193 part 4 (WIP limit per module group), B194 (queue) | M | 0 | - |
| P-436a | Tokens, money, account | RETIRE | P-446, P-446f | - | - | A finding (where spend goes), not a rule; the rules acting on it are P-446 and P-446f. |
| P-446 | Tokens, money, account | CHECK | lead-watch.sh reads the Lead's context and prints an ACT line at start read + 200k (one script with P-446f, P-565) | M | 2 | Lead 45 handed over at ~490k (~360k beyond its start read), Lead 60 at ~345k (~228k beyond), 14-15 Nov. |
| P-446f | Tokens, money, account | CHECK | same context script (with P-446, P-565) | M | 0 | - |
| P-440c | Tokens, money, account | CHECK | PostToolUse hook in the Lead copy: a tool output over 20 KB is warned | S | 0 | - |
| P-440d | Tokens, money, account | CHECK | exists in part: usage-log.sh logs; lead-watch.sh turns two readings over 3%/h into an ACT line | S | 0 | - |
| P-436f | Tokens, money, account | MERGE | P-605 | - | - | Both say Opus builds and reviews, Fable never builds or reviews (P-436f's Sonnet and Haiku clause kept word for word in the side file). |
| P-445b | Tokens, money, account | CHECK | session-start.sh lists connected connectors and warns on any not in the needed list (Gmail, P-620) | S | 0 | - |
| P-377 | Tokens, money, account | CHECK | p2/ledger.ts: a paid run on fixture-only data is refused (with P-175b, P-405) | M | 0 | Kept: "never fixture-only" is not in P-175b (review, round 1). |
| P-461 | Tokens, money, account | CHECK | lead-watch.sh: weekly meter at 98% is a Needs you line | S | 0 | - |
| P-458 | Tokens, money, account | CHECK | session-start.sh: on a new account (account id changed since the last start), prints the RESUME-ON-NEW-ACCOUNT steps first | S | 0 | - |
| P-312 | Tokens, money, account | CHECK | decision-impact check: a process-change DECISIONS row carries a "Test after" line (a measured number, a fixed period) | S | 0 | Kept: its standing half (checked after a fixed period, kept or undone) is not P-502's, and the compass is headed P-312 (review, round 1). |

## 3. The check queue, by how often each rule was broken 13-16 Nov
Breaks were counted in the STATE history pages of 13-16 Nov (`history/STATE-2026-11-1[3-6]-*`, 132 pages), today's `STATE.md`, and the 115 DECISIONS rows dated 13-16 Nov, by a search per rule (patterns below), then each hit read to keep only a real break (a mention or a rule being followed is not a break). Ties are ordered by cost, cheapest first. A row with 0 means none was recorded, not that none happened; most prose rules leave no trace when broken, which is the point of a check.

| # | ID | Breaks 13-16 Nov | Check | Cost |
|---|---|---|---|---|
| 1 | P-302 | 17 | exists as a warning: check-docs.sh (STATE "updated:" against the commit time); make it a failure, and extend stop-check.sh to every IST time a Lead writes | S |
| 2 | P-606 | 6 | exists in part: brief-check.sh in pr-rules (Done when names its test); the WIP part is B193 part 4 | S |
| 3 | P-599 | 4 | lead-watch.sh: fewer than two ready rows for a lane is an ACT line; review rounds counted by label-guard (with P-277) | S |
| 4 | P-576 | 4 | touch-list check (lane-preflight.sh): a lane whose declared touch list overlaps an open PR's changed files is refused (one script with P-526b, P-438b) | M |
| 5 | P-526b | 4 | touch-list check (lane-preflight.sh, with P-576, P-438b) | M |
| 6 | P-526 | 3 | exists in part: brief-check.sh requires a "Duplicate check:" line in every PR body and brief | S |
| 7 | P-423 | 3 | in progress: B193 part 2 (a hook: no label on money, permissions, schema or migration without a Lead read line); cell left for that lane | S |
| 8 | P-557 | 2 | built, not wired: pr-open-guard.sh (G-4 (1)) into push-guard.sh, branch-sweep.sh (G-4 (5)) into lead-watch.sh | S |
| 9 | P-446 | 2 | lead-watch.sh reads the Lead's context and prints an ACT line at start read + 200k (one script with P-446f, P-565) | M |
| 10 | P-610 | 1 | exists in part: pr-size.sh in pr-rules (800 lines); re-review diff-only is label-guard's | S |
| 11 | P-371 | 1 | PreToolUse hook: refuses a Bash or API call that cancels a workflow run | S |
| 12 | IDX-1 | 0 | check-docs.sh: every ID an IDX row lists exists in DECISIONS.md (index integrity, with IDX-2, IDX-4, IDX-5) | S |
| 13 | P-464 | 0 | pr-rules step: a PR touching packages/xfa-engine/ carries an "XFA reuse:" line naming the head-to-head | S |
| 14 | P-470 | 0 | pr-rules step: a change under packages/xfa-engine/src/ also changes PATCHES.md; push-guard refuses the ER v2 repository URL | S |
| 15 | IDX-2 | 0 | check-docs.sh index integrity (with IDX-1, IDX-4, IDX-5) | S |
| 16 | P-473 | 0 | CI dependency deny-list: no motion library in web/package.json; copy test that every client question has a "Why we ask" | S |
| 17 | P-547 | 0 | ci.yml: confirm the document-system check (check-docs.sh) runs only in the notes and records jobs, never as a product-PR gate; a test fails if it is added to a product job | S |
| 18 | P-589 | 0 | check-docs.sh: MVP-CHECKLIST's gate row "repository private before the first real firm's data" must be done before any real-firm-data row turns green | S |
| 19 | IDX-5 | 0 | check-docs.sh index integrity (with IDX-1, IDX-2, IDX-4) | S |
| 20 | IDX-4 | 0 | check-docs.sh index integrity (with IDX-1, IDX-2, IDX-5) | S |
| 21 | F-12Nov | 0 | decision-impact check: each new DECISIONS row states time, cost and quality impact (shared with P-254) | S |
| 22 | P-505 | 0 | same scanner as P-504 over every commit base..head of a PR, so a PR that ever carried the detail fails | S |
| 23 | P-514 | 0 | lead-watch.sh prints the desk track file's last commit time and an ACT line when it changed since the last check | S |
| 24 | P-530 | 0 | lead-watch.sh: an items.py founder item waiting over 30 min with no red "Waiting on the founder" line atop STATE is an ACT line | S |
| 25 | P-539 | 0 | exists in part: push-guard refuses sources/, code/, archive/; extend to the private-notes paths | S |
| 26 | P-542 | 0 | brief-check.sh: a product row's "waits on" may not name a tooling (B-, G-) row | S |
| 27 | P-551 | 0 | check-docs.sh: MVP-CHECKLIST's launch-condition rows (on call, support, breach owners) must be filled before the gate row turns green | S |
| 28 | P-553 | 0 | pr-rules step: a PR that adds a dependency carries a "STANDARDS §1:" line (with P-587) | S |
| 29 | P-566 | 0 | decision-impact check: a DECISIONS row the Lead ruled names what settled it (with P-294) | S |
| 30 | P-582 | 0 | check-docs.sh: every MVP-CHECKLIST item marked left out names a BACKLOG X-row that exists | S |
| 31 | P-587 | 0 | pr-rules step: a PR that adds a dependency to any package.json carries a "STANDARDS §1:" line | S |
| 32 | P-592 | 0 | library-freshness.py: MVP-CHECKLIST is the only Library entry of kind "tracking" | S |
| 33 | P-593 | 0 | exists in part: library-freshness.py and cockpit/library.json (one master per document); verify and name it | S |
| 34 | P-595 | 0 | check-docs.sh: every Release 1 row in BACKLOG has a Source: (the row itself says the step is missing) | S |
| 35 | P-597 | 0 | strategy-desk skill start check (agent-model-guard style): a desk session not on Fable 5.2 high stops | S |
| 36 | P-600 | 0 | CI migration-stamp step: a PR's migration folder is new, additive and stamped later than main's newest and than every other open PR's (with P-348h) | S |
| 37 | P-604 | 0 | PreToolUse hook in builder and qa copies: Read or Grep under sources/ or domain/requirements-*/ is refused; trace-requirements.py --brief is the door | S |
| 38 | P-605 | 0 | exists in part: lane-preflight.sh --hook refuses a brief with no model and effort line (G-4 (7)); agent-model-guard.sh pins reviewers | S |
| 39 | P-611c | 0 | cockpit-data.py: whats-new.json older than 8 days shows as stale on the board | S |
| 40 | P-609 | 0 | cockpit-reconcile.py: plan.json's Release 1 target equals the DECISIONS date (29 Nov, all 101) | S |
| 41 | P-613 | 0 | items.py: a non-urgent ask is held to the next 09:00 or 21:00 IST batch | S |
| 42 | P-614 | 0 | cockpit-reconcile.py: plan target equals the DECISIONS date (with P-609) | S |
| 43 | P-608 | 0 | exists in part: lane-preflight.sh --hook (model and effort line), agent-model-guard.sh (reviewers Opus high) | S |
| 44 | P-348c | 0 | check-docs.sh: a CAPABILITIES row at Works names its gate-A walk file | S |
| 45 | P-442 | 0 | gate-b.mjs: a capability with no PDF is never held on a Validate line | S |
| 46 | P-405 | 0 | gate-b.mjs / comment-run: a run line with WAIT, HELD, no pack or fixture-only is Not tested, never green | S |
| 47 | P-439 | 0 | by platform, not by a check: cloud lanes cannot dispatch Actions; comment-run.yml is the asking door; a hook refusing a dispatch call from a lane copy would make it a check | S |
| 48 | P-526c | 0 | lead-watch.sh: a records PR open over 24 h is an ACT line | S |
| 49 | P-270 | 0 | label-guard.sh: counts main merges into a PR; the third puts it next in line | S |
| 50 | P-303 | 0 | exists in part: agent-model-guard.sh (PreToolUse hook and pr-rules CI) pins reviewer and breaker to Opus high; "breaker only for money, schema, permissions or a new screen" is unchecked | S |
| 51 | P-277 | 0 | label-guard.sh: counts Approve rounds on a PR; a third round needs a "Lead: round 3" comment (the Lead's ruling, which P-277 allows) | S |
| 52 | P-352 | 0 | brief-check.sh: a new-screen PR's concept has a best-in-class section and a walk file | S |
| 53 | P-319 | 0 | CI grep guard on engine code for combination keys, form numbers and program branches (the slice guards retired 8 Nov, revived as one grep) | S |
| 54 | P-251 | 0 | lane-preflight.sh: a brief naming a row listed as held in STATE is refused | S |
| 55 | P-434b | 0 | qa skill start (lane-preflight.sh --hook for qa briefs): one row per qa lane; packs run on GitHub's machines (comment-run) | S |
| 56 | P-486b | 0 | lane-preflight.sh --hook: a brief carries the context limit line; Remote Control session starts refused | S |
| 57 | P-384 | 0 | exists in part: merge-guard.sh (only the Lead copy merges); the rest is a role statement | S |
| 58 | P-294 | 0 | decision-impact check: a DECISIONS row the Lead ruled names what settled it (a decision, canada.ca, or a named practice) | S |
| 59 | P-390 | 0 | AskUserQuestion hook in the Lead copy: one question per card, a "(Recommended)" option (with P-388, P-512) | S |
| 60 | P-254 | 0 | check-docs.sh: each DECISIONS row added after this PR states time, cost and quality (DECISIONS rows already carry "Time: … cost: … quality:") | S |
| 61 | P-286 | 0 | lead-watch.sh: fewer than two idle standby Leads is an ACT line | S |
| 62 | F-7Nov | 0 | guard-test-lib.sh and run-suites.sh refuse to run when the working directory is the main copy | S |
| 63 | P-363 | 0 | gh.sh falls back to curl on a TLS failure (a helper, blocks nothing); a hook refusing raw gh writes in the Lead copy would make it a check | S |
| 64 | P-616 | 0 | gate-b.mjs: a capability with no screen may pass gate A on an API walk file | S |
| 65 | P-618 | 0 | exists: outside-deps-watch.py, run by lead-watch.sh step 9 (test check-outside-deps-watch.sh) | S |
| 66 | P-620 | 0 | in progress: B193 part 6 (session-start check for the Gmail connector) | S |
| 67 | P-621 | 0 | CI grep: no provider SDK (Microsoft Graph, Google APIs) imported outside the adapter folders, so the ports stay provider-neutral | S |
| 68 | P-440c | 0 | PostToolUse hook in the Lead copy: a tool output over 20 KB is warned | S |
| 69 | P-440d | 0 | exists in part: usage-log.sh logs; lead-watch.sh turns two readings over 3%/h into an ACT line | S |
| 70 | P-445b | 0 | session-start.sh lists connected connectors and warns on any not in the needed list (Gmail, P-620) | S |
| 71 | P-461 | 0 | lead-watch.sh: weekly meter at 98% is a Needs you line | S |
| 72 | P-458 | 0 | session-start.sh: on a new account (account id changed since the last start), prints the RESUME-ON-NEW-ACCOUNT steps first | S |
| 73 | P-312 | 0 | decision-impact check: a process-change DECISIONS row carries a "Test after" line (a measured number, a fixed period) | S |
| 74 | P-418 | 0 | lead-watch.sh prints the pick list in P-418's order (red main, awaiting qa, blockers, Partials, drafted, new) from data it already reads | M |
| 75 | P-468 | 0 | a prune-copies.sh that deletes a copy only when it is pushed, clean, untracked files archived and no session uses it (as prune-test-dbs.sh does for databases) | M |
| 76 | P-558 | 0 | module-cards.py: each module card names its owning Lead; label-guard refuses a label by a Lead copy that does not own the PR's module | M |
| 77 | P-583 | 0 | a settings-read script (GitHub API): secret scanning, private vulnerability reporting, workflow actions pinned to SHAs; MVP-CHECKLIST C7 says steps 8-11 are still open | M |
| 78 | P-500 | 0 | exists in part: cockpit-data.py tags every board number with source and class (P-596); extend to reports/*.md numbers | M |
| 79 | P-502 | 0 | reviewer verdict template: a fix PR's review names the root cause and the evidence; label-guard refuses an Approve without that line on fix PRs | M |
| 80 | P-503 | 0 | report-check.sh (Stop hook in the Lead copy): a Lead report has Needs you, Decide when you can, decided (≤5), doing (3-4), Works, merged, blocked, next three with IST times (P-478, P-503, P-338 in one check) | M |
| 81 | P-504 | 0 | push-guard: a deny-list of team-app terms (kept as hashes, so the list itself reveals nothing) checked on every pushed diff | M |
| 82 | P-508 | 0 | AskUserQuestion hook in the Lead copy (with P-388, P-390, P-512) | M |
| 83 | P-512 | 0 | AskUserQuestion hook in the Lead copy: refuses a card when the founder's last turn is older than 10 min (one hook with P-388, P-390) | M |
| 84 | P-565 | 0 | lead-watch.sh reads each session's context and prints an ACT line past half its window (one script with P-446, P-446f) | M |
| 85 | P-607 | 0 | app tests: trust score never below 0, audit write fails closed, support session read-only (each a test in the studio suites) | M |
| 86 | P-337 | 0 | stop-check.sh in lane copies: a turn that starts new work after the lane's PR was labelled is warned | M |
| 87 | P-438b | 0 | touch-list check (with P-576, P-526b); m2-hot-files.txt already lists the hot files | M |
| 88 | P-335 | 0 | CI grep: tenant fields (firm id, tenant) outside the PF-* and FO-* module folders fail | M |
| 89 | P-478 | 0 | report-check.sh (with P-503, P-338) | M |
| 90 | P-486 | 0 | label-guard.sh: a PR touching money, permissions or security paths needs a founder-yes line linked to a DECISIONS row | M |
| 91 | P-338 | 0 | report-check.sh (with P-478, P-503) | M |
| 92 | P-388 | 0 | AskUserQuestion hook (with P-390, P-512); handover.sh refuses a hand-over while a subagent runs | M |
| 93 | P-619 | 0 | in progress: B193 parts 1-6 | M |
| 94 | P-622 | 0 | in progress: B193 part 4 (WIP limit per module group), B194 (queue) | M |
| 95 | P-446f | 0 | same context script (with P-446, P-565) | M |
| 96 | P-377 | 0 | p2/ledger.ts: a paid run on fixture-only data is refused (with P-175b, P-405) | M |
| 97 | P-580 | 0 | not mechanical without computer-use hooks: a PreToolUse hook on computer-use type actions into password fields | L |
| 98 | QA-221 | 0 | forms lint: each form's who-fills and question set cites the form's own official text | L |
| 99 | P-170 | 0 | CI: every immigration value in seed and config files carries a citation (page, quote, date) or a Sample label | L |

Patterns read (case-insensitive): P-302 `guessed|time corrected|wrong time` (one count per Lead per "twice"); P-446 `handed over at ~NNNk` against the start read; P-557 `sleep through|went to sleep|asleep|wake them|unpushed`; P-599 `round 3|round 4|three rounds` (the Lead ruled each extra round, which P-277 allows, so they count against P-599's target only); P-526 `duplicate (of|row|PR|work)|duplicated`; P-526b/P-576 `merge conflict|shared files` (P-622's evidence); P-606 `broke P-606` (DECISIONS P-613); P-610 `over 800|N,NNN changed lines` (P-617); P-423 the research page's item 1 (`design/rule-enforcement-research-2026-11-15.md`); P-371 `was cancelled`.

## 4. Stale enforced-by cells (not changed here)
These 12 rows are marked `prose` but a hook, CI step or script on main already enforces them in whole or part. Naming the enforcer is one edit per cell (no rule text changes) and drops prose to 66.4%. Left for the tech lead because the brief says only merge and retire are applied here and B193 part 2 edits enforced-by cells: P-303 (agent-model-guard.sh, hook and pr-rules: the model part), P-605 and P-608 (lane-preflight.sh --hook model line; agent-model-guard.sh), P-606 (brief-check.sh in pr-rules, part), P-610 (pr-size.sh in pr-rules, part), P-526 (brief-check.sh "Duplicate check:", part), P-618 (outside-deps-watch.py in lead-watch.sh step 9), P-384 (merge-guard.sh: only the Lead copy merges, part), P-500 (cockpit-data.py class field, part), P-539 (push-guard.sh paths, part), P-593 (library-freshness.py, part), P-440d (usage-log.sh, part). Not counted: P-302 (a warning), P-439 (a platform fact, not a check), P-363 (gh.sh is a helper that blocks nothing). Note pr-rules is not yet a required check (its header: "The product queue does not wait for this check yet").

## 5. Notes on the merges
* The merged row's text stays in the side file; the target row in RULES.md is unchanged, so a clause only the merged row had (P-436d "split by layer", P-436f's Sonnet and Haiku for read-only side work) is found through the side file and the map, not in RULES.md.
* IDX-3 is retired with the integration (P-569); P-569 itself stays on the register through IDX-2.
* Rows another lane is making mechanical (P-423 by B193 part 2; the G-4 rows P-303, P-526, P-557, P-606, P-608, P-610) are CHECK, never merged, so their cells stay as on main.
