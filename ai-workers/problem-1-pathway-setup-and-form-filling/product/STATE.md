# State — one page (rewritten by the tech lead, P-188; the history is git)

current_lead: local_bd570ff6-6fd5-430b-b1d9-b170426333cd Lead 81 · 18 Nov 20:2x IST (series 2; took over from Lead 80 (series 2, local_d018e333) at ~690k, P-446)

updated: 2026-11-18 20:2x IST: **Lead 81 (local_bd570ff6) took over 20:23 IST, check cron 58014a84 at :17 and :47**; earlier: 12:5x IST by **Lead 79 (series 2, local_25aa8878)**; **Lead 80 (local_d018e333) took over 12:50 IST, check cron 52e0f97a at :17 and :47** · **ORG MOVE DONE 12:31 IST: expat-ready/xpatready**; E1-E6, C4, D1, D2 pass; queue-gate and label-guard back on (the Lead in the browser, founder "Yes, you click"); Merge Queue on; B1 freeze lifted 12:4x; CI_SHARD_RUNNER absent until E12/R5 · **in flight:** the first org batch #2115 (#2003, #2011, #2014); #2113 records (E8); #2114 the front-office card fix (hand merge on green, P-214); #2081 heartbeat (read posted, label on green, then dispatch once); 8 cloud lanes merging main · **next:** AUD-5 part 2 to the AUD-5 part 1 lane; clean-up stage 0 PR waits for the founder's OK in its own session; the b78 night-run hang; #2109, #2106; change-log numbering (enforcement-checks' C18 for #2080 → next free number) · earlier lines word for word in `history/STATE-2026-11-1*-lead79s2-updated-line-*.md` (the newest `history/STATE-2026-11-18-1250-lead79s2-updated-line-after-move.md`) · milestone: Release 1 proven 11 of 101 · rules: **`RULES.md`** (as of **P-690**) · this branch: `lead/2026-11-07-lead31`




Pointer and 10:2x founder lines: `history/STATE-2026-11-17-1208-lead76s2-pointer-lines.md`.

## Hand-over: Lead 80 → Lead 81, 20:2x IST 18 Nov (read this first; Lead 79's block word for word in `history/STATE-2026-11-18-2025-lead80s2-handover-79-80-block.md`)
Standby left: **Lead 82 (local_f86fdc68)**; start a second standby at the founder's next typed turn (P-286). Weekly plan 49% at 20:19. Lead 80 ran 12:50-20:2x IST, handed over at ~690k (P-446).
1. **Pipeline:** org move done; CI recovered from 18:00 (median job wait 5 min at 20:19; 86 runs queued, 10 running); limit page 31/180; Support ticket #5023043 Open, Normal. **Founder question open:** keep Normal (Lead's recommendation) or ask GitHub to raise to High (his words relayed by founder-setup: "change it to high pripotruty"). P-696: move back at 10:00 IST 19 Nov only if the overnight median job wait is over 30 min: measure at each check.
2. **Target P-697: Release 1 Proven +20 on 19 Nov (11 → 31).** Review `design/release1-end-to-end-review-2026-11-18.md`, rulings P-698. Wave 1 cloud builders: CS-W1 #2125, PF-15 part 1a #2130, PF-6 part 2b #2127, PF-F4 #2128, FO-3a (held: waits #2102), FO-2 part 3, PF-21s part 4, PF-5t part 2, CS-C1s part 1 #2132, #224 recorded walks #2133 (P-700), FO-1p (started by browser, P-699), AUD-1b is #2124 (night-queue lane; a duplicate session stood down). qa: qa local_bb3bf1ad runs gate A walks for qa-2/3/4 (their sandboxes can't start copies) until #2137 (pg_isready fix, labelled on the founder's word) merges; qa-4 local_ff10dee7 scores wave 1 rows as they merge.
3. Lead 80's labelled-queue list of 20:19 (now stale): word for word in `history/STATE-2026-11-18-2210-lead81s2-handover-item3-queue-list.md`.
4. **Owed after #2137 merges:** tell qa-2/3/4 they can start copies; the Lead's Adobe Validate (QA-165) for R1.80 on an isolated copy (procedure `history/lead4-adobe-validate-c102-2026-11-10.md`). Pipeline lane QA-449 unshaped; Messages/Money lanes start as predecessors merge (#1961, #2106). Before starting any row: check for an existing claim branch (night-queue starters also start rows).
5. **For the founder:** a leftover test server on :4477 (`lsof -ti tcp:4477 -sTCP:LISTEN | xargs kill` in his Terminal); claim-branch removals (plan §7.4, claim/PF-15-part-1, claude/qa-rescore-gl-1118) need his OK; archiving ended Leads 64/76/77/79 needs his sidebar (side sessions). Memory index ~20 KB: compact at a quiet check.


Lead 81's 20:5x check, Lead 80's plan position and CI-recovered lines: word for word in `history/STATE-2026-11-18-2100-lead81s2-check-plan-ci-lines.md`.

Hand-over item 6 (rules learned 18 Nov) and the CI investigation pointer: word for word in `history/STATE-2026-11-18-2135-lead81s2-handover-item6-ci-lines.md`.

#2145 done and CI-RUN part 2 in flight (cloud task_bc4ca0c7, P-651): word for word in `history/STATE-2026-11-18-2300-lead81s2-2145-cirun-lines.md`.

**Overlap starts (Lead 81, 23:1x 18 Nov, founder "Yes, go"):** 10 cloud sessions requested: PF-15 part 2 (task_3ac7d547), FO-3st2 (task_33a9c3ba), PF-19e (task_bab945f3), PF-19b part 3 (task_c431da30), J-109 (task_a27f0c66), CS-K1 part 1 (task_63b163fa), CS-C1s part 2 (task_dbcf61b2), AUD-1m with #2124's merge (task_a1b310f4), #2129 merge (task_6f42a231), money FO-7lk then FO-7ts part 2 (task_ba56ea39). Cards (app cap of 10): PF-6b (task_d55fe841), PF-19r (task_c7aa104d). #2152 Approve 03ac386 (batch 13, P-704): label only when #2148-#2150 are done and no product batch waits. GitHub research: likely trial-era limit (180) still on; Support lifts it. **P-705: no move back to Pro** (P-696's 10:00 trigger dropped); paid-runner research running for the founder.

Tonight's push line (22:5x): word for word in `history/STATE-2026-11-18-2320-lead81s2-tonights-push-line.md`.

## Founder asks (Lead 8, 10 Nov; P-450 (4): stays until ticked)
**For the founder (open):** (a) R1.20 vs PF-4c invite rule; (b) close #2088. Done: (c) Lead 83 standby, (d) P-701, (e) ticket High asked. Full line word for word in `history/STATE-2026-11-18-2212-lead81s2-for-founder-line.md`.
| # | Ask (IST) | Status |
|---|---|---|
| S10-A136 | 10 Nov to 17 Nov 00:2x asks | done, answered, standing or superseded (A130 stall research still owed); the pointer rows word for word in `history/STATE-2026-11-17-0858-lead74s2-asks-pointer-rows-S10-A136.md` |

| A137-A165 | 17 Nov asks (speed, CI, talks, Library, clean-up, change log, tracker, disk, pipeline choke, full-power plan) | done or answered; rows word for word in `history/STATE-2026-11-18-1340-lead80s2-asks-pointer-rows-A137-A165.md` |
| A166-A168 | approvals and clean-up; CI research; speed vs 40 jobs (A166 doing; A167, A168 answered: P-693, P-695) | rows word for word in `history/STATE-2026-11-18-1850-lead80s2-asks-A166-A168-rows.md` |
| A170 | 18:5x 18 Nov (typed): "go full power once the end-to-end review is back"; confirm the clean-up plan (folder reorganisation, strategy); why more machines first, then not | doing (Lead 80): full power waits on the review (running); clean-up stage 0 given the Lead's word 18:5x (founder's OK in the clean-up session opens its PR); machines: Lead 80 undercounted (newest 100 runs only), owned |
| A171 | 22:0x 18 Nov (typed): "you made so many changes from the video transcripts ... Anything is helping, not helping? Are we properly organized? Can we have evaluation, or maybe later after 2 to 3 days? ... so that we don't silently drop off"; and (22:0x) cloud lanes that don't report: use the built-in browser | (1) done: app view enforced in lead-watch.sh (ACT after 35 min, tools/app-view.js); (2) **P-702: evaluation on 21 Nov** (plan item #181; independent Opus reviewer; 14-17 Nov vs 19-21 Nov) |
| A169 | 18:4x 18 Nov (typed), plus mid-turn: "until unless this sheet is completed, we should not be silently missing it" (done: `tools/plan-watch.py` in check-docs and lead-watch, P-690 enforced); clean up finished lane sessions on claude.ai and disk; end-to-end review (duplicates, gaps, dependency graph) of all Not built and Partial rows before going full power, then build smart; CI capacity now; tonight's pipeline challenge and parallel work until the ticket is solved | doing (Lead 80) |

## Engineering set-up tracker (A160)
Page https://claude.ai/artifact/EYh8cn1M8rTc3Wba3Pp1dP; the table word for word in `history/STATE-2026-11-18-1755-lead80s2-engineering-setup-tracker.md`; the one action list is `design/full-power-plan-2026-11-17.md` (P-690).

## Start here (next Lead)
📅 **21 Nov: run P-702** (evaluation of the adopted changes, plan #181), result to the founder the same day.
Earlier pointer lines (Lead 60 evening, Lead 61 decide and night, Lead 63 owed (still open: #1865 hooks read, records PR to main, PF-12/FO-7b reads, LegalHoldPort before PF-21b part 1, nightly BR-6 read), morning questions): word for word in `history/STATE-2026-11-16-2217-lead70s2-start-here-pointer-lines.md`.
🎯 **19 Nov target (P-697): Release 1 Proven +20 (11 → 31).** Estimate on the new set-up, not 18 Nov's stall (founder 19:0x): CI 180 jobs (was 40), best pre-move app-code days 46-47 merges; 20 rows x 1-2 last-part PRs = 20-40 merges, within one good day; the limit moves to qa: 4 qa lanes x ~6 Works passes in ~10 h = ~24. Needs the review's 20 nearest-whole Partials, ~20 cloud builders, 4 qa lanes, founder "go".
🟥 **One action list (A164): `design/full-power-plan-2026-11-17.md`** (223 items from every set-up page after two independent reviews, buckets A-E; P-690) is the master for the move and the operating model; every Lead works it in order and ticks items there; nothing leaves it unless done or the founder drops it.
🟥 **Hard rule P-557 (AGENTS.md rule 10): always committed, always resumable**: push at every step; this page says what is true, in flight and next, updated with every change of state. **Private home (P-678): github.com/expat-ready/private**; `tools/private-sync.sh` pushes every session's side notes there; run it at each check. Owed: the founder's Time Machine or iCloud for sources/, code/, archive/ (1.3 GB); daily public mirror refresh; P-677 business plan and §5c private copies.
**Drafts (P-685):** an old draft with a matching Approve is marked ready by the Lead with `bash P/tools/pr-ready.sh <n>`; never ask the founder to press Ready. New PRs open non-draft after the Approve (P-683).
**Roles (P-384):** the founder gives product direction only; the Lead owns the pipeline. Every label needs a PR comment line `Reviewer: Approve <head sha>` (label guard). Records-only PRs: the Lead labels after reading the diff (P-385); `records` queue. GitHub: curl + `gh auth token` with `allowed_domains` (P-363). Times only from `TZ=Asia/Kolkata date`. Notes: `~/Library/Application Support/Claude/side-session-notes/lead10-saved-2026-11-05/` (never a folder named for a session); Lead 26's are in `history/lead-notes-2026-11-07/`.
**Context check every check (P-565 (2)):** `get_usage` on every running Mac session; 45% of the 1M window → tell it to write its hand-over; 50% → replace it; the Lead hands over at 200k beyond its start read (P-446). Full line word for word: `history/STATE-2026-11-14-1550-lead45s2-founder-asks-A59-and-context-check.md`.
**Stall guard (P-388, P-389) and hand-over (P-409, no hand-over with a subagent running)**: word for word in `history/STATE-2026-11-18-1325-lead80s2-start-here-stall-and-handover-lines.md`.
**Never run guard/test suites in the main copy** (7 Nov 09:18 incident): scratch clone only, deleted after.
Older pointers (For the founder F2-F19, Lead 11 to-do): `history/STATE-2026-11-16-2234-lead70s2-for-founder-and-todo-lines.md`.

## Leads, in order
**Series 2 (P-433):** current = `current_lead:`; the Leads-in-order line word for word in `history/STATE-2026-11-16-2052-lead69s2-check-notes-asks-A121-A122-leads-line.md`; since then: Lead 68 (local_adb435f1) → Lead 69 (local_28bf6046) → Lead 70 (local_9ae95739) → Lead 71 (local_0c9cccec) → Lead 72 (local_af927c49) → Lead 73 (local_9b98cea4) → Lead 74 (local_fa783599) → Lead 75 (local_c9752f73) → Lead 76 (local_f6824017) → Lead 77 (local_baa78a6d) → Lead 78 (local_68613e56) → Lead 79 (local_25aa8878) → Lead 80 (local_d018e333) → **Lead 81 (local_bd570ff6)**, standby Lead 82 (local_f86fdc68), then Lead 83 (local_191538a9, started 20:3x 18 Nov).
**Series 1: Leads 1 to 41, before 9 Nov 17:48 IST**, never renamed or renumbered: the full list, word for word, is in `history/STATE-2026-11-09-2130-lead2s2.md` ("Leads, in order").
