# State — one page (rewritten by the tech lead, P-188; the history is git)

current_lead: local_69eeb2bd-5add-46f8-820b-8e6366f0eede Lead 19 · 22 Nov 05:5x IST (series 3; took over from Lead 18 (series 3, local_bdef7c01) at ~335k, P-446)

updated: 2026-11-22 05:5x IST: Lead 18 handed over to Lead 19 (series 3) · milestone: Release 1 proven 43 of 101 on main (11/15 this cycle) · rules: **`RULES.md`** (as of **P-783**; P-784 newer) · this branch: `lead/2026-11-07-lead31`





🔴 **Waiting on the founder (00:3x IST 22 Nov, P-530; founder 03:5x: tomorrow, ask him then):** AWS console session expired; sign in as root with MFA in the AWS session's (local_35aacb3f-3180-427e-a538-8dc51d38de14) built-in browser (Cmd+Shift+B), then approve CodeBuild again there. No Cloudflare records needed (no-domain mode; R1.24 out). RDS on since 21 Nov 14:39Z, 0 tasks (~US$0.11/h).

## Hand-over Lead 18 → Lead 19 (series 3), 05:5x IST 22 Nov
Word for word in `product/history/STATE-2026-11-22-0640-lead19s3-handover-18-19-block.md`. Still open from it: at the founder's next typed turn start cloud lanes for R1.10 PF-28 parts 3a, 3b, 4, 5 and the owed fix rows (start.sh npm ci on lockfile change; check_s5_slice3_browser C11.15 flake); start one more standby (Lead 20 local_29230626 is first); weekly 95% → `RESUME-ON-NEW-ACCOUNT.md` 22 Nov block; Lead B (local_3a725fd1) reads every PF PR before the label.

## Lead 19 since 05:55 IST (newest first)
* 09:4x **#2900 FO-9s p1 (R1.29) merged.** PF-18s lane finished part 1 (#2897) and asks for fresh sessions per part: **owed cloud lanes at the founder's next typed turn: PF-18s part 2 ("?" + Help & support, #2064 double-send guard) and part 3 (Notifications), independent;** plus PF-28 parts 3a, 3b, 4, 5. Pipeline otherwise idle (weekly 95% flat).
* 09:2x **Lead B (11) hand-over pushed:** branch `lead-b-front-office` 198f43adc, file lead-b-handover-2026-11-19 in its design folder (on that branch only), section "Lead B (11) final hand-over". At the founder's next typed turn start Lead B (12) from it (local, Opus 5.5 medium, P-608); Lead B (11) keeps hourly checks to ~50%.
* 09:1x #2900 FO-9s p1 (R1.29) queued after round 4 (Lead allowed rounds 3-4). Weekly 95% flat. Context: Lead B 46% (told to write its hand-over; replace at the founder's next typed turn), AWS 37%, Lead 19 24%. Quiet PRs #2883/#2884/#2885 (ready refused: founder), #2895 and #2896 (records PRs from lanes: need a Reviewer line; label route refused in Lead's shell). AWS signed out: idle ~US$2.70/day + RDS.
* 07:4x #2897 (PF-18s p1, R1.92) and #2899 (PF-5s follow-up) **merged**. #2900 FO-9s p1 (R1.29): reviewer Approve on 9fe5f82d2, labelled by its own lane 18 s after the gate refused it on red ci (same pattern as #2897); full run in progress, Mergify still needs green ci; it adds to the shared contract ports/matching.ts (3 lines). Weekly 94% flat since 06:58.
* 07:2x **Gate gap (owed fix row):** #2897 (PF-18s p1, adds a staff:manage route) was marked ready and labelled at 01:25Z by its own cloud lane (actor: the owner's account via the claude app), 7 s after its Reviewer: Approve, with no Lead read; the B194 queue gate did not hold it because its kept paths do not cover permission routes. Lead B read it after (OK, 4f0705259), nothing to undo. Fix row: B194 gate also keeps new `@Perm`/permission-key routes for the Lead read (P-423, P-637).
* 06:1x-06:5x: word for word in `product/history/STATE-2026-11-22-0920-lead19s3-lines-0610-0650.md` (rulings on #2884, #2885 (PF-25w out of R1.24), #2332, FO-9s; refusals; cycle closed 11/15).

## Lead 18 since 03:21 IST
Word for word in `product/history/STATE-2026-11-22-0615-lead19s3-lead18-lines.md`.

## Founder asks (Lead 8, 10 Nov; P-450 (4): stays until ticked)
Older open items and ask rows (S10-A239, A240-A241, 10 Nov line): `product/history/STATE-2026-11-21-0850-lead10s3-for-founder-open-and-A240-rows.md`.
| # | Ask (IST) | Status |
|---|---|---|
| A277 | 22 Nov 09:5x (typed): weekly 95%, plan the move to the new account; lose no work (walk claude.ai lanes, save, resume); new account does AWS + Cloudflare + GoDaddy with the founder's credentials; review #2883/#2884/#2885 and finish them in the browser; full action list with tooling/records status; a detailed plan to reach 15 a day (8 by 19:00 + 7 by 07:00) since we plateau at 10; the new account's Lead validates the whole plan first | In progress 09:5x (Lead 19) |
| A276 | 22 Nov 04:0x (typed): a plan for 15 in the next 24 h; is the build ready for the next phase? | Answered 04:1x: not ready, 6-9; cap 12 chosen (P-784), 4 lanes |
| A275 | 22 Nov 03:5x (typed): work all night on other capabilities; AWS tomorrow (bring it back to him); clean up browser, claude.ai, GitHub; drain the queue; standbys as needed; plan to reach the goal (15 by 07:00) | Night plan 04:0x (Lead 18 line above); AWS waits for him |
| A273-A274 | 21 Nov | word for word in `product/history/STATE-2026-11-22-0320-lead17s3-asks-A273-A274.md` (diligence walk; pipeline answer, proof lanes, proof-route fixes) | |
| A272 | 21 Nov 18:3x (typed): keep checking every angle, unblock stuck queues intelligently, full pipeline status | Full report 18:3x; #2834 unblocked |
| A242-A271 | 21 Nov | pointer rows word for word in `product/history/STATE-2026-11-22-0400-lead18s3-owed-6b-6-lines.md` | |


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
**Series 3 (P-749):** Lead 1 (local_94786348, from 20 Nov 12:18 IST), Lead 2 (local_daadc134, from 20 Nov 13:57 IST), Lead 3 (local_b0640d3f, from 20 Nov 14:43 IST), Lead 4 (local_470182c1, from 20 Nov 18:21 IST), Lead 5 (local_08ac9385, from 20 Nov 23:0x IST), Lead 6 (local_871ed54c, from 21 Nov 00:04 IST), Lead 7 (local_a8acec34, from 21 Nov 01:17 IST), Lead 8 (local_dbce8aee, from 21 Nov 02:01 IST), Lead 9 (local_52cca488, from 21 Nov 06:48 IST), Lead 10 (local_8f916b74, from 21 Nov 07:43 IST), Lead 11 (local_f172acc0, from 21 Nov 08:54 IST), Lead 12 (local_7ec53395, from 21 Nov 10:2x IST), Lead 13 (local_369dd389, from 21 Nov 11:44 IST), Lead 14 (local_c09f305e, from 21 Nov 12:44 IST)., Lead 15 (local_666bcb32, from 21 Nov 15:47 IST), Lead 16 (local_1cd4840f, from 21 Nov 18:04 IST), Lead 17 (local_74cdbff7, from 21 Nov 20:1x IST), Lead 18 (local_bdef7c01, from 22 Nov 03:21 IST), Lead 19 (local_69eeb2bd, from 22 Nov 05:5x IST)
**Series 2 (P-433):** Leads to Lead 100 (local_59a9ad7a): word for word in `product/history/STATE-2026-11-21-0822-lead10s3-series-2-leads-line.md`.
**Series 1: Leads 1 to 41, before 9 Nov 17:48 IST**, never renamed or renumbered: the full list, word for word, is in `history/STATE-2026-11-09-2130-lead2s2.md` ("Leads, in order").
