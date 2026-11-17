# State — one page (rewritten by the tech lead, P-188; the history is git)

current_lead: local_9b98cea4-9b0d-42d1-b342-df7a78790bd7 Lead 73 · 17 Nov 08:0x IST (series 2; took over from Lead 72 (series 2, local_af927c49) at ~325k, P-446)

updated: 2026-11-17 08:0x IST by **Lead 72 (series 2, local_af927c49)** at hand-over to Lead 73 (Lead 72 ran 07:13-08:0x; cron d45abd4a deleted) · weekly 27% at 07:34 (resets 17 Nov 10:30 IST) · milestone: Release 1 proven 11 of 101 at 07:42 (+0 overnight; A134's 21 by 09:45 missed) · rules: **`RULES.md`** (as of **P-651**; P-652, P-653 newer) · this branch: `lead/2026-11-07-lead31`

Older pointer lines: `history/STATE-2026-11-13-2245-lead37s2-old-pointer-lines.md`.

**09:00 IST batch for the founder:** the provincial streams card (P-607 (9)), text in the AS-2 streams proposal on branch claude/build-lead-c-647b40 (design, build-lead-c-briefs) (Ontario Workforce Priority, BC Skilled Worker, Saskatchewan International Skilled Worker, Alberta Opportunity Stream eligibility only, Manitoba Skilled Worker; Manitoba's site refuses automated reads, so the founder opens it on his own browser or it stays Sample).

## Hand-over: Lead 72 → Lead 73, 08:0x IST 17 Nov — read this first (Lead 72's notes and the Lead 71 → 72 block word for word: `history/STATE-2026-11-17-0800-lead72s2-lead71-hand-over-and-lead72-notes.md`)
Founder **is back** (typed turns since 07:4x IST; asks A139). Lead 72 started at 07:13 (~130k start read), handed over at ~325k. Standbys: **Lead 74 (local_fa783599)**, **Lead 75 (local_c9752f73)**, both idle.
1. **Founder decided (P-653, 07:4x-07:5x):** #2044 Owners invite Case Officers (posted); FO-7s0 Q6 stays paid + red shortfall; **#2014: push its nightly.yml patch (comment 6927292457) after re-reading it on the current head: yours, now**; #2031 closed; streams as proposed (Build Lead C told); **Manitoba: read immigratemanitoba.com/immigrate/skilled-worker-overseas/ through Claude in Chrome, read-only, cite page, quote, date; blocked → Sample: yours**. #2058 approved by him ("Approve #2058"): **label it on green ci**.
2. **Waiting on research:** session **ci-pipeline-research (local_9ab95f11)**, started 07:4x, due ~09:15: pipeline map (visual), why CI jams, test value per module ("tests once" P-651 with evidence, no quality loss), Namespace / Blacksmith / GitHub Team / VPS prices, ultracode, a whole-capability landing order. It writes the strategy file ci-pipeline-strategy-2026-11-17 (in design/, not yet on this branch) on branch `research/ci-pipeline-2026-11-17` plus an HTML page for you to publish as an Artifact. Then put **Decision 1 (CI capacity)** and the **org move (P-652)** to him one at a time with its recommendation. His rule: double and triple check, never compromise quality.
3. **Founder also asked (A139), yours:** clean up resources in claude.ai (archive merged-row lanes after checking for unpushed work; idle sessions), and refresh the founder board (https://claude.ai/artifact/LceYQnmEWNpqBoUUp4hBbW; the board session local_d01fe726 republishes on a new Lead input; Lead inputs in side-session-notes `local_cdb44e83…/lead-input-<date>-<time>.json`, newest 07:33 with stuck_sessions).
4. **Measured 07:42:** Release 1 Proven **11 of 101** (26 Partial, 64 Not built), +0 overnight; 21 PRs merged since 21:30; 69 runs queued, 5 running (40-job limit); weekly 27%, resets 10:30 IST.
5. **Labels owed on green ci:** #1959, #2001 (lane labels), #2003 (Lead read posted fda3249), #2021 (Approve + green), #2058. **Lead reads still owed:** #2038 (FO-6 part 1 migration, 377 lines; told to merge main first), #2000 (draft, 8 lines over), #1991 (money), #2030 (board, once based on main). **Conflicts, lanes told to merge main 07:2x:** #1956, #1961 (requeue after), #2009, #2011, #2029 (pushed again 07:3x), #2035 (reviewer reads its MODULE.cases.md merge), #2045. Quiet cloud lanes need "continue" in their claude.ai prompt box (#2029, #2035 if still quiet).
6. **Each check:** lead-watch; write a new Lead input file for the board; Build Leads: Lead B (6) local_1520b573, Build Lead C local_d5287293; night queue edits are the Lead's (QA-53k added 07:3x).

## Hand-over Lead 70 → Lead 71 (23:30 IST 16 Nov)
Word for word, with its open items, night machinery (routines, night queue), board link and standbys, in `history/STATE-2026-11-17-0740-lead72s2-lead70-71-hand-over-block.md`.

## Founder asks (Lead 8, 10 Nov; P-450 (4): stays until ticked)
| # | Ask (IST) | Status |
|---|---|---|
| S10, A1-A4, A6, A8-A13, A18-A23, A25-A27, A29, A30, A32, A33, A35, A36, A44, A45, A47, A48 | done, answered or standing | pointer rows word for word in `history/STATE-2026-11-14-0910-lead41s2-founder-asks-pointer-rows.md` |
| A5, A7, A24, A28, A31, A34, A37-A43 | earlier asks | done or superseded (Lead 52, 15 Nov; nothing waits on him); row word for word in `history/STATE-2026-11-15-1045-lead53s2-founder-asks-A5-A43-row.md` |
| A49-A67 | 14 Nov asks (map, architecture, board A61-A64, private copy, cockpit, Library, PRD, gap scan A65, speed A66, delivery per token A67) | decided or in progress; pointer rows word for word in `history/STATE-2026-11-15-0935-lead51s2-founder-asks-pointer-rows-A49-A67.md` |

| A68-A89 | 15 Nov asks (A89: six founder-start steps, in progress under "Needs you") | rows word for word in `history/STATE-2026-11-16-0950-lead64s2-asks-A68-A89-rows.md` |

| A90-A105 | 15-16 Nov evening and night asks | answered or in progress; rows word for word in `history/STATE-2026-11-16-0925-lead64s2-asks-A90-A105-rows.md` |
| A106-A111 | 16 Nov morning asks (clean-up, research, app view, context diet) | done or answered; rows word for word in `history/STATE-2026-11-16-1100-lead64s2-asks-A106-A111.md` |
| A112-A114 | 16 Nov morning: board speed and taps; records path (every 3 h); waits on the Lead (answer all each check, report the oldest) | answered, standing; rows word for word in `history/STATE-2026-11-16-1100-lead65s2-asks-A112-A114-rows.md` |
| A115-A120 | 16 Nov late morning: board audit (A115), Devin and Claude Code practice (A116), board-reading check (A117, B201), board and check verify each other (A118, P-639), known failures each check (A119, B202), standing approval to start lanes while away (A120) | answered or in progress; rows word for word in `history/STATE-2026-11-16-1450-lead67s2-asks-A115-A120-rows.md` |
| A121-A136 | 16 Nov 17:41 IST to 17 Nov 00:2x asks (status, enforcement, standbys, 21-22 Proven target A134, more CI machines A136) | answered or standing; A130 stall research still owed; rows word for word in `history/STATE-2026-11-17-0750-lead72s2-asks-A121-A136-pointer-rows.md` |
| A137 | 00:2x IST 17 Nov (typed): "I want more faster speed"; Release 1 is 100, goal ~500; is the limit tests and CI, not coding? research servers, VPS, similar tools; not costly until 100 | research done (side notes ci-capacity-options, 17 Nov; its costs ~4x high); founder chose: org move with GitHub Team at 09:00 IST, guided in the browser |
| A138 | 00:5x IST 17 Nov (typed): fix the CI gaps found, and check we fix gaps procedurally, never repeat them and never overdo | CI speed audit running (side notes ci-speed-audit, 17 Nov); each gap a row with a measured before/after and a 7-day check; plan at 09:00 IST |

| A139 | 07:4x IST 17 Nov (typed, back): full list of his asks, progress, why CI jammed, plan vs result; clean up resources and update the board; pipeline explained visually (testing and quality steps, what changes, no quality loss: drop a check only with evidence it adds little); tests per module; Namespace, Blacksmith; ultracode; group work by end-to-end capability; strategy now that nothing was proven overnight. Decisions one by one, his pick | report given 07:4x (11/101 Proven, +0 overnight, 21 merged, 69 runs queued); research session local_9ab95f11 (ci-pipeline-research) started 07:4x, due ~09:15; clean-up and board to the next Lead |

## Start here (next Lead)
Earlier pointer lines (Lead 60 evening, Lead 61 decide and night, Lead 63 owed (still open: #1865 hooks read, records PR to main, PF-12/FO-7b reads, LegalHoldPort before PF-21b part 1, nightly BR-6 read), morning questions): word for word in `history/STATE-2026-11-16-2217-lead70s2-start-here-pointer-lines.md`.
🟥 **Hard rule P-557 (AGENTS.md rule 10): always committed, always resumable**: push at every step; this page says what is true, in flight and next, updated with every change of state. Private folders not yet on GitHub (to move to `ours/notes` of his private API copy): research stream 4 under side-session-notes `local_b5f4d7c1…/research-stream-4/`; Lead notes under `local_01c09e17…/` (one-day test brief).
**Roles (P-384):** the founder gives product direction only; the Lead owns the pipeline. Every label needs a PR comment line `Reviewer: Approve <head sha>` (label guard). Records-only PRs: the Lead labels after reading the diff (P-385); `records` queue. GitHub: curl + `gh auth token` with `allowed_domains` (P-363). Times only from `TZ=Asia/Kolkata date`. Notes: `~/Library/Application Support/Claude/side-session-notes/lead10-saved-2026-11-05/` (never a folder named for a session); Lead 26's are in `history/lead-notes-2026-11-07/`.
**Context check every check (P-565 (2)):** `get_usage` on every running Mac session; 45% of the 1M window → tell it to write its hand-over; 50% → replace it; the Lead hands over at 200k beyond its start read (P-446). Full line word for word: `history/STATE-2026-11-14-1550-lead45s2-founder-asks-A59-and-context-check.md`.
**Stall guard (P-388, P-389):** no prompt-waiting call while the founder is away; `lead-watch.sh` ACT when the last check is over 40 min old. Watchdog: first standby (Lead 34 once Lead 33 tells it).
**Hand-over (P-409):** no hand-over with an in-process subagent running; its result goes to a file named in the hand-over block; briefs say report to the current Lead. Skill edit at the founder's next typed turn.
**Never run guard/test suites in the main copy** (7 Nov 09:18 incident): scratch clone only, deleted after.
Older pointers (For the founder F2-F19, Lead 11 to-do): `history/STATE-2026-11-16-2234-lead70s2-for-founder-and-todo-lines.md`.

## Leads, in order
**Series 2 (P-433):** current = `current_lead:`; the Leads-in-order line word for word in `history/STATE-2026-11-16-2052-lead69s2-check-notes-asks-A121-A122-leads-line.md`; since then: Lead 68 (local_adb435f1) → Lead 69 (local_28bf6046) → Lead 70 (local_9ae95739) → Lead 71 (local_0c9cccec) → Lead 72 (local_af927c49) → **Lead 73 (local_9b98cea4)**, standbys Lead 74 (local_fa783599), 75 (local_c9752f73).
**Series 1: Leads 1 to 41, before 9 Nov 17:48 IST**, never renamed or renumbered: the full list, word for word, is in `history/STATE-2026-11-09-2130-lead2s2.md` ("Leads, in order").
