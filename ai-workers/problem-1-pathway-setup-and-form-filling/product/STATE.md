# State — one page (rewritten by the tech lead, P-188; the history is git)

current_lead: local_59a9ad7a-2010-4e9f-bdb0-6800116c75cd Lead 100 · 20 Nov 08:48 IST (series 2, the last; took over from Lead 99 (series 2, local_2e11a30f) at ~330k, P-446); next Leads are series 3 from Lead 1 (P-749)

updated: 2026-11-20 08:48 IST: Lead 99 handed over to Lead 100 · milestone: Release 1 proven ~18 of 101 · rules: **`RULES.md`** (as of **P-748**) · this branch: `lead/2026-11-07-lead31`





## Hand-over Lead 99 → Lead 100, 08:48 IST 20 Nov (read this first; Lead 99 at ~330k, P-446)
**Lead 100: rename yourself "Lead 100 · tech lead (current) · from <date> <IST start>", run /lead, create the check (`run lead-watch; read STATE Start here`). Standby: Lead 1 (series 3, local_94786348); start one more standby ("Lead 2 (series 3) · standby", P-749) at the founder's next typed turn.** RULES as of P-748; DECISIONS to P-749. Founder (A217, A218): full power, fix and enforce in code, keep updating him; weekly usage needs no watching (he applies the reset credit at 98%).
(1) **#2413 records PR (P-747..P-749)**: new head adds the two missing history pages (fast failed on a MISSING LINK); post "Reviewer: Approve <head>" after reading it (records only, P-385), label; once merged, re-run #2322's pr-rules (Size exception: P-748), then Approve-check and label #2322 (R1.38 3/4, outside waves, finishes).
(2) **Queue:** #2406 (R1.72) queued; #2296 (R1.31) merged, walks j_31 dispatched on main; R1.31 Works needs qa (pairs with qa 11's R1.30). Full runs dispatched 08:4x for #2305 (R1.110) and #2338 (R1.8): on green, relabel with "Batch failures covered: <run>: fast, ci" (P-731).
(3) **Lanes (cloud):** PF-12b1m on #2029 (R1.4; head 63771158a checked by Lead B as row owner; waits its reviewer's Approve, then Lead read + full run + label); qa 11 (R1.40, R1.30); qa 12 (R1.33); R1.74 lane on #2317; B204 told to merge main into #2363 (wave caps in code, founder-approved; Lead reads tools diff, labels, then #2365); R1.76 told to merge main on #2320 then stop; ENF-746c answered "draft PR, Lead decides".
(4) **Founder asks open:** staging domain (asked 09:0x: buy now vs at Proven 30); reconnect Claude in Chrome (built-in browser used meanwhile); permanent fix owed: move queue-gate's job off the Mac runner `xr-mac` to GitHub-hosted (a fix under P-734), plus a 10 GB disk alarm.
(5) **Close or keep (Lead's call, work saved on branches):** close #2026, #2032 (stale), #2234, #2210 (outside waves); #2372 (founder asked Ready 19 Nov: ask before closing); #2339 R1.88 only with /run full; #2361 is a fix (Lead read, label); #2368 R1.59 needs migration read + a size row.
Earlier block (Lead 98 → 99 and the Lead 99 lines) word for word in `ai-workers/problem-1-pathway-setup-and-form-filling/product/history/STATE-2026-11-20-0850-lead99s2-handover-98-99-block.md`.

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
| A217 | 20 Nov 00:5x IST: plan, monitoring, approvals, proof in 6/10 h, 2-3 standbys | answered 00:5x; requeues and relabels on unchanged approved heads pre-approved for the night (#2315 requeued); 01:0x: "work autonomously, whatever it takes", browser on GitHub as fallback (P-699); Lead 99, 100 started |
| A216 | 19 Nov 20:4x IST: key numbers on today's pipeline | answered; row word for word in `history/STATE-2026-11-20-0120-lead97s2-A216-row.md` |
| A196-A215 | 19 Nov asks | rows word for word in `history/STATE-2026-11-20-0155-lead97s2-asks-A196-A215.md` |
| A186-A191 | 19 Nov 07:4x-07:5x asks (how we build page, staging, queue first → P-718) | rows word for word in `ai-workers/problem-1-pathway-setup-and-form-filling/product/history/STATE-2026-11-19-1012-lead87s2-asks-A186-A191-rows.md` |

Engineering set-up tracker (A160): section word for word in `ai-workers/problem-1-pathway-setup-and-form-filling/product/history/STATE-2026-11-19-1122-lead87s2-setup-tracker-section.md`.

## Start here (next Lead)
📅 **21 Nov: Claude Code GitHub Action evaluation (A200; cost and STANDARDS §1 gate, nothing installed) and run P-702** (evaluation of the adopted changes, plan #181), result to the founder the same day.
🎯 **P-719 in flight (items, parts left, lanes as of 08:2x IST 19 Nov):** line word for word in `ai-workers/problem-1-pathway-setup-and-form-filling/product/history/STATE-2026-11-19-1152-lead90s2-p719-in-flight-line.md`; the current per-item state is in "Where we are" above and in Lead B (7)'s and Build Lead C (2)'s state files. Parked: R1.100, R1.72, R1.10, R1.3. Next to start when one is Proven: R1.100 (Lead B).
🔁 **Account switch (A196, P-725): done 11:37 IST 19 Nov by Lead 90; at the next one the founder types `/lead` on the new account and that Lead resumes from this page;** the line word for word in `ai-workers/problem-1-pathway-setup-and-form-filling/product/history/STATE-2026-11-19-1204-lead90s2-account-switch-line.md`.
🏭 **Binding (RULES as of P-734): P-721 to P-731, P-733 and P-734 (unchanged to 22 Nov evening) (focus on the nearest-to-done items, automatic proof, full run only after a failed batch);** the 10:4x binding line and the 11:3x triggers line word for word in `ai-workers/problem-1-pathway-setup-and-form-filling/product/history/STATE-2026-11-19-1229-lead90s2-start-here-binding-and-triggers-lines.md`; current triggers are in the hand-over block above.
🧊 **P-716 freeze to Proven 30, P-717 own lane, P-718 queue first, P-719 finish by capability** (RULES IDX-9, P-719); the 07:xx Start-here line word for word in `history/STATE-2026-11-19-0820-lead86s2-start-here-P716-P717-line.md`.
Earlier Start here lines (19 Nov target P-697, Drafts P-685): word for word in `ai-workers/problem-1-pathway-setup-and-form-filling/product/history/STATE-2026-11-19-1126-lead87s2-start-here-lines.md`.
🟥 **One action list (A164): `design/full-power-plan-2026-11-17.md`** (223 items from every set-up page after two independent reviews, buckets A-E; P-690) is the master for the move and the operating model; every Lead works it in order and ticks items there; nothing leaves it unless done or the founder drops it.
🟥 **Hard rule P-557 (AGENTS.md rule 10): always committed, always resumable**: push at every step; this page says what is true, in flight and next, updated with every change of state. **Private home (P-678): github.com/expat-ready/private**; `tools/private-sync.sh` pushes every session's side notes there; run it at each check. Owed: the founder's Time Machine or iCloud for sources/, code/, archive/ (1.3 GB); daily public mirror refresh; P-677 business plan and §5c private copies.
**Roles (P-384):** the founder gives product direction only; the Lead owns the pipeline. Every label needs a PR comment line `Reviewer: Approve <head sha>` (label guard). Records-only PRs: the Lead labels after reading the diff (P-385); `records` queue. GitHub: curl + `gh auth token` with `allowed_domains` (P-363). Times only from `TZ=Asia/Kolkata date`. Notes: `~/Library/Application Support/Claude/side-session-notes/lead10-saved-2026-11-05/` (never a folder named for a session); Lead 26's are in `history/lead-notes-2026-11-07/`.
**Context check every check (P-565 (2)):** `get_usage` on every running Mac session; 45% of the 1M window → tell it to write its hand-over; 50% → replace it; the Lead hands over at 200k beyond its start read (P-446). Full line word for word: `history/STATE-2026-11-14-1550-lead45s2-founder-asks-A59-and-context-check.md`.
**Never run guard/test suites in the main copy** (7 Nov 09:18 incident): scratch clone only, deleted after.

## Leads, in order
**Series 2 (P-433):** current = `current_lead:`; … → Lead 87 (local_019a74ed) → Lead 90 (local_3eea0506, new account) → Lead 91 (local_d2a979e6) → Lead 92 (local_9e102072) → Lead 93 (local_ce66c66a) → Lead 94 (local_8d88d9c8) → Lead 95 (local_98ab55d2) → **Lead 96 (local_3500a818) → Lead 97 (local_d04f3736) → Lead 98 (local_b18084c0) → Lead 99 (local_2e11a30f) → **Lead 100 (local_59a9ad7a)**; series 3: standby Lead 1 (local_94786348). The full line (Leads 68 to 91) word for word in `ai-workers/problem-1-pathway-setup-and-form-filling/product/history/STATE-2026-11-19-1229-lead90s2-leads-in-order-line.md`.
**Series 1: Leads 1 to 41, before 9 Nov 17:48 IST**, never renamed or renumbered: the full list, word for word, is in `history/STATE-2026-11-09-2130-lead2s2.md` ("Leads, in order").
