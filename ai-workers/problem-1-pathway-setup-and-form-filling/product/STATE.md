# State — one page (rewritten by the tech lead, P-188; the history is git)

current_lead: local_94786348-b0e8-4685-9713-f5aaa6303967 Lead 1 · 20 Nov 12:18 IST (series 3; took over from Lead 100 (series 2, local_59a9ad7a) at ~390k, P-446)

updated: 2026-11-20 12:3x IST: Lead 1 took over; standbys Lead 2 + Lead 3, Lead B (9) started · milestone: Release 1 proven ~18 of 101 · rules: **`RULES.md`** (as of **P-756**) · this branch: `lead/2026-11-07-lead31`





## Hand-over Lead 100 → Lead 1 (series 3), 12:18 IST 20 Nov (read this first; Lead 100 at ~390k, P-446)
**Lead 1: rename yourself "Lead 1 · tech lead (current) · from <date> <IST start>", run /lead, create the check (`run lead-watch; read STATE Start here`). Standbys: Lead 2 (series 3, local_daadc134) and Lead 3 (series 3, local_b0640d3f, started by Lead 100 on the founder's 12:2x turn).** Lead 1 took over 12:19 IST; check 1a2349b2 (:23/:53). Founder 12:2x: around for approvals; autonomous, focused work on Waves 1-2. RULES as of P-756; DECISIONS to P-759 (all on branch; P-753 and older on main). Founder today: full power, fix and enforce in code, keep him updated; he applies the reset credit at 98% weekly (93% at 12:15, ~1.4%/h: 96% ~14:20, 98% ~15:45 IST; message him at 96%).
(1) and (3) of this hand-over (unblock, lanes): done or superseded by the 🌊 and ⏭️ lines in Start here; word for word in `product/history/STATE-2026-11-20-1235-lead1s3-start-here-lines.md`.
(2) **Labelled, waiting:** #2425 (B206 part 1). **#2427** (commercial/ out of public main, P-753): reopened 12:00 for a fresh pr-rules; get an independent Approve on its head (subagent), Lead read, label. **#2442** library refresh (8 of 9): answer its 3 questions (P-697/P-608 medium is newer than P-666; the sourcing map artifact needs the Mac), Lead read, label.
(4) **Standing:** P-752 browser fallback for blocked labels; `tools/lead-pr.sh` (reopen, approve-records) is allowed in settings.local.json; gh's TLS fails in the sandbox, use curl with `gh auth token`. Library: `library/engineering-map.md` (P-755 scale) and plan items #225-#237; guard review `design/guard-review-2026-11-20.md` (ASK and MERGE rows wait; guards 18-23 not wired: a settings question for the founder).
Earlier block (Lead 99 → 100) word for word in `ai-workers/problem-1-pathway-setup-and-form-filling/product/history/STATE-2026-11-20-1218-lead100s2-handover-99-100-block.md`.

## Founder asks (Lead 8, 10 Nov; P-450 (4): stays until ticked)
**For the founder (open):** (a) R1.20 vs PF-4c invite rule: done, P-727; (b) close #2088; owed isolated.sh `stop` timer row. Full earlier line word for word in `ai-workers/problem-1-pathway-setup-and-form-filling/product/history/STATE-2026-11-19-1110-lead87s2-for-founder-line.md`.
| # | Ask (IST) | Status |
|---|---|---|
| S10-A168 | 10 Nov to 18 Nov asks | pointer rows word for word in `history/STATE-2026-11-19-0755-lead86s2-asks-pointer-rows-S10-A168.md` |
| A169-A193 | 18-19 Nov asks (A182 open; A181 founder's clean-up) | rows word for word in `ai-workers/problem-1-pathway-setup-and-form-filling/product/history/STATE-2026-11-19-1120-lead87s2-asks-A169-A193-rows.md` |
| A202-A203 | 19 Nov 12:0x-12:1x IST: the Lead starts walks.yml runs for qa lanes (standing); P-732 chosen then held | rows word for word in `ai-workers/problem-1-pathway-setup-and-form-filling/product/history/STATE-2026-11-19-1228-lead90s2-asks-A202-A203-rows.md` |
| A199-A201 | 19 Nov 11:5x IST: spot-check delegated (done), Action pilot (21 Nov), why not 10 a day (→ P-731) | row word for word in `ai-workers/problem-1-pathway-setup-and-form-filling/product/history/STATE-2026-11-19-1211-lead90s2-asks-A199-A201-row.md` |
| A205-A206 | 19 Nov ~12:35 IST: "take one decision ... and run" | → P-734 ; ENF-733 started; A206 12:42 IST "You have all my approvals of which you asked about. So you do yourself.": lanes and standby started; words in `ai-workers/problem-1-pathway-setup-and-form-filling/product/history/STATE-2026-11-19-1238-lead91s2-ask-A205-words.md` |
| A208-A211 | 19 Nov 15:19-15:26 IST: label both; AWS open; PF-8a, FO-9a started | row word for word in `history/STATE-2026-11-19-1820-lead94s2-ask-A208-row.md` |
| A222 | 20 Nov 11:5x IST: industry vs us (RC, what applies), scale 50-100 firms, 1-10 staff each | answered: engineering map artifact; → P-755 |
| A221 | 20 Nov 10:5x IST: CI minutes public vs Enterprise, support reply, pipeline green, lanes in app view, over-engineering | answered 11:0x: public = Actions minutes free (Nov so far 135,824 Linux min, gross US$815, net US$0; private would bill past 50,000); GitHub ticket #5023043 answered (new-enterprise concurrency rises gradually, routed for full limit, ghost queued runs to be cleared), no action owed; red batches cause = FO-3st2 date-dependent suite, fix lane started; #2363 labelled |
| A220 | 20 Nov 10:3x IST: make fixes live, agile Lead enforced in code, backlog one question at a time, resources and 10-hour forecast | → P-751; tooling lane started; questions in progress |
| A219 | 20 Nov 08:5x IST: staging, dev and AWS after Wave 1/2, at 30-40 Proven ("let's first meet that 30") | ticked → P-750; plan to the founder at Proven 30 |
| A217 | 20 Nov 00:5x IST: plan, monitoring, approvals, proof in 6/10 h, 2-3 standbys | answered 00:5x; requeues and relabels on unchanged approved heads pre-approved for the night (#2315 requeued); 01:0x: "work autonomously, whatever it takes", browser on GitHub as fallback (P-699); Lead 99, 100 started |
| A216 | 19 Nov 20:4x IST: key numbers on today's pipeline | answered; row word for word in `history/STATE-2026-11-20-0120-lead97s2-A216-row.md` |
| A196-A215 | 19 Nov asks | rows word for word in `history/STATE-2026-11-20-0155-lead97s2-asks-A196-A215.md` |
| A186-A191 | 19 Nov 07:4x-07:5x asks (how we build page, staging, queue first → P-718) | rows word for word in `ai-workers/problem-1-pathway-setup-and-form-filling/product/history/STATE-2026-11-19-1012-lead87s2-asks-A186-A191-rows.md` |

Engineering set-up tracker (A160): section word for word in `ai-workers/problem-1-pathway-setup-and-form-filling/product/history/STATE-2026-11-19-1122-lead87s2-setup-tracker-section.md`.

## Start here (next Lead)
🩺 **/pulse skill (founder 13:5x: one in-chat report, constraint-first, five whys, waves, manual unblocks): cloud lane "Skill · /pulse"; Lead reads and labels the PR; the next Lead runs /pulse once with the founder and explains it.**
📦 **P-759: clean-up move window Sun 22 Nov 09:00-13:00 IST (stages 2b-7, R0-R9): from Sat evening let no new lane start that would open a PR spanning the window; drain the queue by 08:30, pause lanes, one stage per PR. Safe stages 0/1/2a/8: cloud lane now (Lead reads each PR).**
🟥 **P-757/P-758 (founder 13:4x): at the first check that sees checks blocking the queue, merge the check-only fix in the built-in browser that same check; every check read github.com and claude.ai/code in the browser and act within the rules (founder: "I have given this authority and sanction"). Enforcer: ENF-758 lane (lead-watch ACT line). B204 wave gate: #2432/#2433 dirty, lane told to merge main and re-Approve; Lead reads and labels on green.**
🌊 **Focus (founder 13:1x 20 Nov: "focused ... always producing proven capabilities"): Wave 1 first, then Wave 2; check every lane start with `waves.py allow`; outside-wave lanes (R1.88, R1.76, R1.3, R1.92) finish their step and stop. Wave 1 not proven (10 of 17), owner each: R1.72 #2406 (Lead C, Approve then relabel; full run covered: FO-3st2 only) · R1.4 #2029 · R1.8 #2423 (dequeued: j_37, j_38 red) · R1.33 #2416 + qa 12 · R1.74 draft #2063 · R1.40 lane "R1.40 · J-38 proof green" · R1.26 lane FO-4b · R1.47 lane PF-19r · R1.100 lane re-check · R1.30 card task_17e00278 (start refused by classifier; founder clicks).**
⏭️ 13:1x-13:15 actions (blockers merged in the browser, relabels, requeues): word for word in `product/history/STATE-2026-11-20-1235-lead1s3-start-here-lines.md`.
🟧 **P-754 hold (#2435): `check_fo3st2_availability_browser.ts` is out of PR and batch runs; the fix lane (cloud, "Fix · FO-3st2 staff-hours test fails by date") must remove it in its PR by 21 Nov: never label that PR with the hold still in it.**
🟩 **P-752 standing: when the shell refuses a label, Ready for review or reopen, do it at once in the built-in browser on github.com as the founder (after the P-423 read; never in place of a reviewer's Approve on code); records-only and reopens via `tools/lead-pr.sh`.**
📅 **21 Nov: Claude Code GitHub Action evaluation (A200; cost and STANDARDS §1 gate, nothing installed) and run P-702** (evaluation of the adopted changes, plan #181), result to the founder the same day.
📚 **P-719 in flight, account switch (A196, P-725) and P-716 to P-719 lines:** word for word in `ai-workers/problem-1-pathway-setup-and-form-filling/product/history/STATE-2026-11-20-1235-lead1s3-start-here-lines.md`.
🏭 Binding line (P-721 to P-734): word for word in `product/history/STATE-2026-11-20-1235-lead1s3-start-here-lines.md`.
Earlier Start here lines (19 Nov target P-697, Drafts P-685): word for word in `ai-workers/problem-1-pathway-setup-and-form-filling/product/history/STATE-2026-11-19-1126-lead87s2-start-here-lines.md`.
🟥 **One action list (A164): `design/full-power-plan-2026-11-17.md`** (223 items from every set-up page after two independent reviews, buckets A-E; P-690) is the master for the move and the operating model; every Lead works it in order and ticks items there; nothing leaves it unless done or the founder drops it.
🟥 **Hard rule P-557 (AGENTS.md rule 10): always committed, always resumable**: push at every step; this page says what is true, in flight and next, updated with every change of state. **Private home (P-678): github.com/expat-ready/private**; `tools/private-sync.sh` pushes every session's side notes there; run it at each check. Owed: the founder's Time Machine or iCloud for sources/, code/, archive/ (1.3 GB); daily public mirror refresh; P-677 business plan and §5c private copies.
**Roles (P-384):** the founder gives product direction only; the Lead owns the pipeline. Every label needs a PR comment line `Reviewer: Approve <head sha>` (label guard). Records-only PRs: the Lead labels after reading the diff (P-385); `records` queue. GitHub: curl + `gh auth token` with `allowed_domains` (P-363). Times only from `TZ=Asia/Kolkata date`. Notes: `~/Library/Application Support/Claude/side-session-notes/lead10-saved-2026-11-05/` (never a folder named for a session); Lead 26's are in `history/lead-notes-2026-11-07/`.
**Context check every check (P-565 (2)):** `get_usage` on every running Mac session; 45% of the 1M window → tell it to write its hand-over; 50% → replace it; the Lead hands over at 200k beyond its start read (P-446). Full line word for word: `history/STATE-2026-11-14-1550-lead45s2-founder-asks-A59-and-context-check.md`.
**Never run guard/test suites in the main copy** (7 Nov 09:18 incident): scratch clone only, deleted after.

## Leads, in order
**Series 3 (P-749):** Lead 1 (local_94786348, from 20 Nov 12:18 IST).
**Series 2 (P-433):** current = `current_lead:`; … → Lead 87 (local_019a74ed) → Lead 90 (local_3eea0506, new account) → Lead 91 (local_d2a979e6) → Lead 92 (local_9e102072) → Lead 93 (local_ce66c66a) → Lead 94 (local_8d88d9c8) → Lead 95 (local_98ab55d2) → **Lead 96 (local_3500a818) → Lead 97 (local_d04f3736) → Lead 98 (local_b18084c0) → Lead 99 (local_2e11a30f) → **Lead 100 (local_59a9ad7a)**; series 3: standby Lead 1 (local_94786348). The full line (Leads 68 to 91) word for word in `ai-workers/problem-1-pathway-setup-and-form-filling/product/history/STATE-2026-11-19-1229-lead90s2-leads-in-order-line.md`.
**Series 1: Leads 1 to 41, before 9 Nov 17:48 IST**, never renamed or renumbered: the full list, word for word, is in `history/STATE-2026-11-09-2130-lead2s2.md` ("Leads, in order").
