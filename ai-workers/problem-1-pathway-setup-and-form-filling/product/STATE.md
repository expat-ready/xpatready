# State — one page (rewritten by the tech lead, P-188; the history is git)

current_lead: local_c09f305e-9ffc-4d7f-96fb-51841affa27d Lead 14 · 21 Nov 12:40 IST (series 3; took over from Lead 13 (series 3, local_369dd389) at ~360k, P-446)

updated: 2026-11-21 13:2x IST: Lead 14 (series 3) current since 12:44 IST (check 9fdbbd40). Earlier: Lead 13 handed over at 12:40 · milestone: Release 1 proven 34 of 101 on main (+2 this cycle: R1.27, R1.74) · rules: **`RULES.md`** (as of **P-783**) · this branch: `lead/2026-11-07-lead31`





## Lead 14 since 12:44 IST (newest first)
* 15:3x founder **go** (A264): lanes **r153-fo5s-j53** (task_85ab9933, R1.53 screens + J-53, by 04:00) and **pf8b-f1-f2** (task_72b23a4b, F1 awsLogs + F2 staging suffix, by 18:00). AWS preflight safe (49 add, 0 replace); deploy once after F1/F2; founder adds 4 NS records `staging` in Cloudflare during deploy; old zone kept until after proofs.
* 15:1x merged #2706 R1.108 (**proven 36, +4 cycle**), #2727 (R1.42 FO-3a1e), #2720 (FO-5b), #2741, #2746. **R1.53 will score Partial** (qa Q4 + fresh reader): FO-5s (retainer screens) and J-53 not built, no PR → forecast 12/15 unless a lane builds FO-5s + J-53 tonight (**needs a founder-typed turn to start**). #2750 FO-3st3b can leave draft now (#2727 merged; Lead B).
* 12:4x-15:2x (incl. P-691 hand merge of #2780, PF-8b merged, A259-A260; **owed: engineering-change-log line**): labels, rulings, A256-A260, recovery plan, path to 15 (R1.15/R1.24 via #2748, reserve R1.10), lanes; **owed: BACKLOG PF-28 parts 2-6, CS-W2, CS-W4; MVP-CHECKLIST line 273; SHARDS=24 when #2757 merges**: word for word in `product/history/STATE-2026-11-21-1345-lead14s3-early-bullets.md`.
* 13:2x: **walks** j_108 j_49 j_5 run 1 = actions run 44881942787 (dispatched in the browser; the shell's dispatch was refused); run 2 = re-run all jobs on it when attempt 1 ends, then post on #2706 #2762 #2765. **#2687** dequeued (shards 18, 4: axe contrast on FO-3st3 panel, target-size on PF-18h Home; hypothesis: its seeds) → Lead B (11) owns the fix and a green full run first (P-731). #2607 dirty (tooling-2 lane).


## Hand-over Lead 13 → Lead 14 (series 3), 12:40 IST 21 Nov (read this first; Lead 13 at ~360k, P-446)
**Lead 14: create the check FIRST (cron `3,13,23,33,43,53 * * * *`, prompt exactly `run lead-watch; read STATE Start here`), reply "check created" to Lead 13 (local_369dd389), rename yourself "Lead 14 · tech lead (current) · from 21 Nov <IST>", run /lead.** Standby after you: Lead 15 (local_666bcb32); start one more at the founder's next typed turn. RULES as of **P-783** (no new DECISIONS rows since). Lead 12's block word for word: `product/history/STATE-2026-11-21-1240-lead13s3-handover-12-13-block-final.md`.
(0) **🎯 Cycle 07→07:** proven **34**; merged awaiting proof R1.32, R1.108, R1.49; forecast ~12 of 15 by 07:00. Checks at minutes 03 and 33 are the full report with the A244 timeline (P-783). Founder at the keyboard, all permissions, budget no worry (A251, A252), tokens used well, never wasted.
(1) **Constraint (measured 12:3x):** 10 of the last 20 merge batches failed (50%, CI-SPEED-3 #2756), not machines (74 jobs at once at 12:10). qa proof is the stage behind it: 6 qa lanes (cloud): Q1 R1.32 then R1.10 · Q3 R1.5 (claude/qa-r15), R1.108 re-score (#2706), R1.49 · Q4 R1.53, R1.47, R1.19 · Q5 R1.10, R1.42 · Q6 ready: R1.3, R1.4, R1.13/24/5, R1.90 · Q2 free. Keep one ready qa lane ahead (A255).
(2)-(3) Questions and labels from the hand-over: done by Lead 14 (see its block); word for word in `product/history/STATE-2026-11-21-1325-lead14s3-handover-13-14-items-4-5.md`. Still owed: SHARDS=24 when #2757 merges; row CI-SPEED-4.
(4)-(5) Rulings in force 12:0x-12:3x (PF-8b flags, staging refuses live Stripe, no aws/cdk from cloud lanes, PF-16 builds PF-15 1b first, backups governance mode, #2720 B164 exemption, #1959 reads) and the AWS line: word for word in `product/history/STATE-2026-11-21-1325-lead14s3-handover-13-14-items-4-5.md`.
(6) **Lead B (11)** (local_3a725fd1) holds PF/FO rows: R1.42 #2717 (label on green), #2727 red, #2750 draft; R1.4 #2752. **Weekly plan 64% at 12:29, ~4%/h**: 95% ~20:15 IST, then account switch (P-458, RESUME-ON-NEW-ACCOUNT.md). Desk 08 (local_01915f6f) still owed the founder's words "I'm okay with it, but you have to enforce this as a code".


## Founder asks (Lead 8, 10 Nov; P-450 (4): stays until ticked)
Older open items and ask rows (S10-A239, A240-A241, 10 Nov line): `product/history/STATE-2026-11-21-0850-lead10s3-for-founder-open-and-A240-rows.md`.
| # | Ask (IST) | Status |
|---|---|---|
| A264 | 21 Nov 15:3x (typed): go for the R1.53 lane and PF-8b fixes F1/F2 | Both lanes started 15:3x |
| A261-A263 | 21 Nov 14:2x-14:3x (typed): enforce the Lead's prioritisation by scripts; stage table; capability board in every report | ENF-733b and ENF-783c lanes; board added to ENF-783c 14:3x; template in Start here |
| A256-A258 | 21 Nov 13:0x-13:5x | ca-west-1 enabled; alarms to the founder's inbox (decided, deploy parameter); focus list #2777: word for word in `product/history/STATE-2026-11-21-1345-lead14s3-early-bullets.md` |
| A255 | 21 Nov ~12:32 (typed): if proving is the constraint, why not more qa lanes; what limits it (tokens, load, other); industry practice; be proactive, never wait an hour | qa Q5 (R1.10, R1.42; task_3c69d860) and Q6 (ready proofer: R1.3, R1.4, R1.13/24/5, R1.90; task_f4454f0b) started ahead of merges; rule kept: one ready qa lane ahead. Measured: 10 of last 20 batches failed (50%, CI-SPEED-3), the real merge constraint |
| A254 | 21 Nov ~12:15 (typed): why only 6 batches at once, drawbacks of more, two levels by situation, industry standard; improve speed and quality, never break the pipeline | Answered in chat: 12 via CI-SPEED-1, two levels by measured failed-batch rate (over 20% of the last 20 batches drops to 6, under 10% back to 12); owed row CI-SPEED-3: lead-watch ACT line on that rate |
| A252-A253 | 21 Nov ~12:00-12:10 | word for word in `product/history/STATE-2026-11-21-1235-lead13s3-A252-A253.md` |
| A251 | 21 Nov | word for word in `product/history/STATE-2026-11-21-1213-lead13s3-A251-and-5b.md` |
| A242-A250 | 21 Nov 01:5x-11:2x | word for word in `product/history/STATE-2026-11-21-1225-lead13s3-ask-rows-A248-A250.md` and `product/history/STATE-2026-11-21-1125-lead12s3-ask-rows-A242-A247.md` |


## Start here (next Lead)
📋 **Founder report, fixed order (A260, A262, A263: plus the capability board, 5 stage boxes per R1 row, and "Outside the 15") until ENF-783c prints it:** 1 🔴 Needs you (exact click) · 2 header: Proven this cycle X/15 · Total N/101 · Forecast by 07:00 Y/15 · On track · 3 **pipeline stage table** (Shaped-ready, Building, Review, Waiting on Lead, Red after approval, Merge queue, qa proof: items · age · in/out 3 h · ✅/⚠️/❌ + why) and the constraint · 4 timeline in build-and-prove order (Lead 9 code block: HH:MM · R1.n · name · build → review → queue → walk → qa with ✔ · waits on), 8 by 19:00 / 7 by 07:00 · 5 doing → expect by · 6 since last (≤4) · 7 money and resources. Short checks: 1, 2, 4, 6.
Older Start here pointers (P-754 hold, 19 Nov lines): `product/history/STATE-2026-11-21-0835-lead10s3-earlier-start-here-pointer-lines.md`.
🧭 **P-783:** checks at minutes 03 and 33 are the full report (format: 📋 above); lanes started 11:0x-11:2x listed word for word in `product/history/STATE-2026-11-21-1335-lead14s3-start-here-P757-and-missed-checks.md`.
🟥 **Red-row lanes 11:4x (P-783 (4)):** PF-12b2 (R1.4), FO-3st3b (R1.42, draft until #2727 and #2718 merge), PF-16 (R1.90, branches after #1959), R1.3 rescue of #2349 (11:2x). AWS: root for the staging proof only, MFA checked first; Node 22 in CloudShell approved (founder 11:4x "all permission"); Identity Center admin owed before production.
🗓️ **Founder A244 (08:2x): every status report to him carries a short text timeline of the 07→07 cycle: one line per capability (ETA IST, R1 id, plain name, step, waits on), split 8 by 19:00 / 7 by 07:00, each on time or late. In chat only.**
🖥️ **Founder 21 Nov 01:5x (A242), every check and every hand-over: manage each lane both ways, by the API (PRs, runs, comments) and in the built-in browser on claude.ai/code with "Show more" clicked until gone (else only half the lanes show); type next steps into idle lanes' prompt boxes and confirm the bubble.**
🐕🟥 **Still in force:** missed-checks order (create the check FIRST; run lead-watch inline in long founder turns) and P-757/P-758 (merge a check-only fix in the browser at the first check that sees it): word for word in `product/history/STATE-2026-11-21-1335-lead14s3-start-here-P757-and-missed-checks.md`.
🌊🟩 **Still in force:** Wave 1 then 2 only (`waves.py allow` before every start) and P-752 (a refused label, ready or reopen is done in the browser after the Lead's read): word for word in `product/history/STATE-2026-11-21-1335-lead14s3-start-here-P757-and-missed-checks.md`.
🟥 **One action list (A164): `design/full-power-plan-2026-11-17.md`** (223 items from every set-up page after two independent reviews, buckets A-E; P-690) is the master for the move and the operating model; every Lead works it in order and ticks items there; nothing leaves it unless done or the founder drops it.
🟥 **Hard rule P-557 (AGENTS.md rule 10): always committed, always resumable**: push at every step; this page says what is true, in flight and next, updated with every change of state. **Private home (P-678): github.com/expat-ready/private**; `tools/private-sync.sh` pushes every session's side notes there; run it at each check. Owed: the founder's Time Machine or iCloud for sources/, code/, archive/ (1.3 GB); daily public mirror refresh; P-677 business plan and §5c private copies.
**Roles (P-384):** the founder gives product direction only; the Lead owns the pipeline. Every label needs a PR comment line `Reviewer: Approve <head sha>` (label guard). Records-only PRs: the Lead labels after reading the diff (P-385); `records` queue. GitHub: curl + `gh auth token` with `allowed_domains` (P-363). Times only from `TZ=Asia/Kolkata date`. Notes: `~/Library/Application Support/Claude/side-session-notes/lead10-saved-2026-11-05/` (never a folder named for a session); Lead 26's are in `history/lead-notes-2026-11-07/`.
**Context check every check (P-565 (2)):** `get_usage` on every running Mac session; 45% of the 1M window → tell it to write its hand-over; 50% → replace it; the Lead hands over at 200k beyond its start read (P-446). Full line word for word: `history/STATE-2026-11-14-1550-lead45s2-founder-asks-A59-and-context-check.md`.
**Never run guard/test suites in the main copy** (7 Nov 09:18 incident): scratch clone only, deleted after.

## Leads, in order
**Series 3 (P-749):** Lead 1 (local_94786348, from 20 Nov 12:18 IST), Lead 2 (local_daadc134, from 20 Nov 13:57 IST), Lead 3 (local_b0640d3f, from 20 Nov 14:43 IST), Lead 4 (local_470182c1, from 20 Nov 18:21 IST), Lead 5 (local_08ac9385, from 20 Nov 23:0x IST), Lead 6 (local_871ed54c, from 21 Nov 00:04 IST), Lead 7 (local_a8acec34, from 21 Nov 01:17 IST), Lead 8 (local_dbce8aee, from 21 Nov 02:01 IST), Lead 9 (local_52cca488, from 21 Nov 06:48 IST), Lead 10 (local_8f916b74, from 21 Nov 07:43 IST), Lead 11 (local_f172acc0, from 21 Nov 08:54 IST), Lead 12 (local_7ec53395, from 21 Nov 10:2x IST), Lead 13 (local_369dd389, from 21 Nov 11:44 IST).
**Series 2 (P-433):** Leads to Lead 100 (local_59a9ad7a): word for word in `product/history/STATE-2026-11-21-0822-lead10s3-series-2-leads-line.md`.
**Series 1: Leads 1 to 41, before 9 Nov 17:48 IST**, never renamed or renumbered: the full list, word for word, is in `history/STATE-2026-11-09-2130-lead2s2.md` ("Leads, in order").
