# State — one page (rewritten by the tech lead, P-188; the history is git)

current_lead: local_28bf6046-9c98-4f67-8b04-7f1801873579 Lead 69 · 16 Nov 19:22 IST (series 2; took over from Lead 68 (series 2, local_adb435f1) at ~180k beyond start, P-446)

updated: 2026-11-16 21:25 IST by **Lead 69 (series 2, local_28bf6046)** (took over 19:24; check cron d99a740d at :13/:43) · weekly 82% at 20:4x (resets 17 Nov 10:30 IST) · milestone: Release 1 proven 11 of 101 (qa/CAPABILITIES.md on main, 18:24) · rules: **`RULES.md`** (as of **P-644**) · this branch: `lead/2026-11-07-lead31`; check notes 19:26-20:25 word for word in `history/STATE-2026-11-16-2052-lead69s2-check-notes-asks-A121-A122-leads-line.md`

Older pointer lines: `history/STATE-2026-11-13-2245-lead37s2-old-pointer-lines.md`.

## Hand-over: Lead 68 → Lead 69, 19:22 IST 16 Nov — read this first (the old block word for word: `history/STATE-2026-11-16-1922-lead68s2-old-hand-over-block.md`)
Rules: RULES.md (as of P-643). Lead 68 handed over at ~180k beyond its start read (P-446). Account: weekly 80% at 19:20 (resets 17 Nov 10:30 IST); **P-643 (founder 20:2x): no extra usage; he resets the account near 98-99%**; lanes run past 96%; at 96% tell him (push + report) so he resets before 98%. From 90% check every 15 min; at 96% every lane "finish this step, push, stop". Founder on Remote Control. Standby: **Lead 70 (local_9ae95739)** and **Lead 71 (local_0c9cccec)** (started 20:2x IST, founder-typed turn).
1. **Goal P-626** (10 Proven by 08:00 17 Nov): 5 Proven (board v15, data 18:01). Merged 18:22-18:35: #1943, #1951, #1955, #1962 (FO-4sf built; never start it again), #1954, #1929, #1967, #1952. qa lanes A and B score Built rows; watch their pushes. Forecast 6-7 at best.
✅ **#1990 (Lead 69, 20:3x IST):** the founder approved the decision-impact exempt fix in chat ("Approve #1990 exempt fix"); Approve posted on 88166b6e9; label on green ci. The same exempt line (plus P-642, P-643) is on `lead/2026-11-07-lead31`.
2. **Label on green CI (Approve + Lead read already on each head):** **#1945** b20abcdb2 (PF-6m; then PF-6 part 2a, which may have a lane already: check before any start); **#1961** 855019a76 (PF-19p, labelled, in queue). #1957 labelled 19:2x. **#1990** records to main (P-638..P-641, head 73ac6f656, rule map fixed): post `Reviewer: Approve <head>` as the Lead's records read (P-385) and label on green.
3. **#1865** (six hooks, read at b49064f3d, Approve at b6626ac99): its lane merged main at 4e8a44d45 and is dirty again; the lane resolves; label on green, then give the founder the settings paste. #1958 board fix labelled.
4. **Cloud lanes requested 18:2x (P-641):** `fix-c411-g5`, `fix-c95` (check they started and pushed). #1985 (duplicate FO-4sf) closed.
5. **Still open:** B199's four decisions (prompt-box paste; mergify.com hosts = founder's settings); #1950 qa batch (merge main, Approve, label); PF-19e after #1956 and #1961 merge (Lead B tells); #1972 labelled (records); Lead B rev 16.72.
6. **Founder, one at a time:** extra-usage cap; after #1865, the settings paste; mergify hosts for B199; board's 8 "talk" items; Stripe TEST keys by 18 Nov; unpin Leads 64-66.

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
| A121-A122 | 16 Nov 17:41 and 17:5x asks (status, enforcement, standbys, lane walk; how the Lead did, hooks, board) | answered; rows word for word in `history/STATE-2026-11-16-2052-lead69s2-check-notes-asks-A121-A122-leads-line.md` |
| A123-A125 | 16 Nov 20:4x-20:5x asks (11 vs 24 proven, 7 a day, confidence; Stripe, AWS, build 10 prove 10, two leads; no scope cuts) | answered: plan page, P-644; rows word for word in `history/STATE-2026-11-16-2125-lead69s2-asks-A123-A125-check-2056.md` |
| A126 | 21:2x IST 16 Nov: put the plan page's analytics on the board, a high-level picture of build, proving, merging and resourcing | in progress: "Flow" box (4 lights vs P-644 targets + forecast) specified to the board session |
## For the founder (P-390)
F2, F8, F14-F19 closed or ruled; word for word in `history/STATE-2026-11-15-2115-lead61s2-founder-asks-A89-A92-rows.md`.

## Start here (next Lead)
🟩 **Lead 60 evening line** word for word in `history/STATE-2026-11-15-2210-lead61s2-lead60-evening-start-line.md`. **Next:** sle-watch target R; BACKLOG owes CS-C1a's two follow-ups (#1818) and FO-2's qa53 scan row (#1813); Library 3 masters behind; hand-merge PR.
🟥 **Hard rule P-557 (AGENTS.md rule 10): always committed, always resumable**: push at every step; this page says what is true, in flight and next, updated with every change of state. Private folders not yet on GitHub (to move to `ours/notes` of his private API copy): research stream 4 under side-session-notes `local_b5f4d7c1…/research-stream-4/`; Lead notes under `local_01c09e17…/` (one-day test brief).
🟦 **14 builder lanes started 21:2x IST (founder "Yes, start them"), cloud:** `design/lane-start-queue-2026-11-16.md` (8 from Build Lead A; C and Prove Lead lines added as they arrive). FO-7 money rows: FO-7a2 stays with Lead B until #1991 merges, the rest to Build Lead C.
🟢 **P-644 seats (founder "Yes, start both", 21:0x IST):** Build Lead A = Lead B (local_1520b573, told); **Build Lead C** local_d5287293 (worktree branch build-lead-c; sends "start:" lines by message); **Prove Lead** cloud (task_66343d66; channel = branch `prove-lead/records`, file design/prove-lead-state.md: read its "Start qa" and "Next row per qa lane" sections each check). Disk 6.6 GB at 21:0x (under the 7 GB Mac floor): further Mac starts refused; cloud only. Founder: accept the AWS invitation himself. **Needs you (A89, P-618):** each outside item, its status, decision date and fallback is in `design/outside-dependencies.md`. Founder now: accept the AWS invitation email (password + MFA); answer BoldSign and AWS support replies at his work email; before launch, control of expatready.com's DNS and mailbox Workspace. Done: (1) AWS account; (6a) Stripe sandbox. Step-by-step lines word for word: `history/STATE-2026-11-15-2225-lead61s2-needs-you-a89-steps.md`.
🟡🌙 Lead 61's decide-when-you-can and night pointer lines: word for word in `history/STATE-2026-11-16-1115-lead65s2-decide-and-night-lines.md`.
🟪 **Owed (Lead 63, 07:28 16 Nov; P-626 plan):** items (1)-(11) word for word in `history/STATE-2026-11-16-1050-lead65s2-owed-line-lead63.md`; still open: #1865 hooks read (P-423), records PR to main, PF-12/FO-7b reads, LegalHoldPort before PF-21b part 1, nightly BR-6 read.
🟨 **Morning questions:** all seven answered 07:2x IST (P-627); Lead decides while he is away (P-628); P-629 email-footer ruling; line word for word in `history/STATE-2026-11-16-1058-lead65s2-morning-questions-line.md`.
**Roles (P-384):** the founder gives product direction only; the Lead owns the pipeline. Every label needs a PR comment line `Reviewer: Approve <head sha>` (label guard). Records-only PRs: the Lead labels after reading the diff (P-385); `records` queue. GitHub: curl + `gh auth token` with `allowed_domains` (P-363). Times only from `TZ=Asia/Kolkata date`. Notes: `~/Library/Application Support/Claude/side-session-notes/lead10-saved-2026-11-05/` (never a folder named for a session); Lead 26's are in `history/lead-notes-2026-11-07/`.
**Context check every check (P-565 (2)):** `get_usage` on every running Mac session; 45% of the 1M window → tell it to write its hand-over; 50% → replace it; the Lead hands over at 200k beyond its start read (P-446). Full line word for word: `history/STATE-2026-11-14-1550-lead45s2-founder-asks-A59-and-context-check.md`.
**Stall guard (P-388, P-389):** no prompt-waiting call while the founder is away; `lead-watch.sh` ACT when the last check is over 40 min old. Watchdog: first standby (Lead 34 once Lead 33 tells it).
**Hand-over (P-409):** no hand-over with an in-process subagent running; its result goes to a file named in the hand-over block; briefs say report to the current Lead. Skill edit at the founder's next typed turn.
**Never run guard/test suites in the main copy** (7 Nov 09:18 incident): scratch clone only, deleted after.
**To-do (Lead 11):** word for word in `history/STATE-2026-11-14-0910-lead41s2-founder-asks-pointer-rows.md`.

## Leads, in order
**Series 2 (P-433):** current = `current_lead:`; the Leads-in-order line word for word in `history/STATE-2026-11-16-2052-lead69s2-check-notes-asks-A121-A122-leads-line.md`; since then: Lead 68 (local_adb435f1) → **Lead 69 (local_28bf6046)**, standbys Lead 70, Lead 71.
**Series 1: Leads 1 to 41, before 9 Nov 17:48 IST**, never renamed or renumbered: the full list, word for word, is in `history/STATE-2026-11-09-2130-lead2s2.md` ("Leads, in order").
