# State — one page (rewritten by the tech lead, P-188; the history is git)

current_lead: local_51d4f3ca-37fb-4942-8b52-c107cf81908d Lead 1 · 22 Nov 10:1x IST (new account from 22 Nov; founder A279: numbering restarts at Lead 1 here, no series shown; was titled Lead 21 for 30 minutes)

updated: 2026-11-22 05:5x IST: Lead 18 handed over to Lead 19 (series 3) · milestone: Release 1 proven 43 of 101 on main (11/15 this cycle) · rules: **`RULES.md`** (as of **P-783**; P-784 newer) · this branch: `lead/2026-11-07-lead31`





🔴 **Waiting on the founder (00:3x IST 22 Nov, P-530; founder 03:5x: tomorrow, ask him then):** AWS console session expired; sign in as root with MFA in the AWS session's (local_35aacb3f-3180-427e-a538-8dc51d38de14) built-in browser (Cmd+Shift+B), then approve CodeBuild again there. No Cloudflare records needed (no-domain mode; R1.24 out). RDS on since 21 Nov 14:39Z, 0 tasks (~US$0.11/h).

## Lead 19 and the 18 → 19 hand-over
Word for word in `product/history/STATE-2026-11-22-1050-lead21s3-lead19-lines-and-handover-18-19.md` (owed from it: PF-18s p2-3 and PF-28 p3a-5 lanes, now started; start.sh npm ci fix row; C11.15 flake; B194 permission-route gate gap; FO-9s founder questions).

## Lead 1 (new account) since 10:0x IST (newest first)
* 10:5x **5 more cloud lanes requested (founder-typed turn, A279):** qa proof R1.89 + R1.39 · PF-4s (R1.5; unblocks R1.24, R1.90; Lead read before label) · PF-13 p2 panel (R1.23) · CS-S1 p2 (R1.102, after #2884) · QA-645 deploy-synth on main (Lead read). 11 builders + 1 qa of cap 12 (P-784). Collision map + near-done sweep running (read-only subagent) for A279 parts 1-3. AWS sign-in page opened in the Lead's browser pane for the founder.
* 10:4x **A279 (10 parts): `product/design/A279-parts-2026-11-22.md`.** Renamed Lead 1. Lanes working: #2883 and #2885 queued; #2906 PF-18s p2 and #2904 PF-18s p3 open; #2884 lane pushing.
* 10:25 check: #2883 PF-28 p6 (R1.10) full ci green on 00711e628 with Approve + Lead B read: labelled. #2884/#2885 still red, their lanes starting. No new lane PR yet.
* 10:2x Plan validated by an independent reader (forecast 4 by 19:00, 9-11 by 07:00; corrected rows, drops and the lanes to start) and the 10:1x start line (first 7 lanes): word for word in `product/history/STATE-2026-11-22-1040-lead1-plan-validation-line.md`.
* 10:1x **Founder chose: set up the staging domain today** (R1.24 back in the 15; reverses A266 no-domain mode for today). Owed from him: domain name, on-call role email (P-782), AWS root sign-in + CodeBuild, Cloudflare/GoDaddy sign-in, all in the Lead's built-in browser pane.
* Last cycle evidence: 97 PR merges + ~70 "merge main into branch" commits on main 07:00 21 Nov → 07:00 22 Nov for 11 capabilities proven.

## Founder asks (Lead 8, 10 Nov; P-450 (4): stays until ticked)
Older open items and ask rows (S10-A239, A240-A241, 10 Nov line): `product/history/STATE-2026-11-21-0850-lead10s3-for-founder-open-and-A240-rows.md`.
| # | Ask (IST) | Status |
|---|---|---|
| A279 | 22 Nov 10:3x (typed): plan for 15 and a safe scaling experiment toward 30, collision map, two leads under a senior lead, open-source standard to 100%, outside steps one by one, Lead 1 naming, clean-up, what is missing | 10 parts tracked in `product/design/A279-parts-2026-11-22.md` |
| A278 | 22 Nov 10:1x (typed, new account): read the hand-over and set up; my next steps and what you need from me; 15 capabilities by 07:00 23 Nov without missing the time; lessons from yesterday's 11; can parts be built and merged in parallel; why two strong developers would still give 15 (what limits scaling: Mac, queues, lanes?); can I get the productivity of two people or another machine; is the pipeline/main strong; how open-source projects let anyone contribute by PR within rules, can we do the same and make it hard to miss anything; anything else to think about | In progress 10:3x: 7 lanes started; plan validation running; answers in chat |
| A242-A276 | 21-22 Nov | word for word in `product/history/STATE-2026-11-22-1027-lead21s3-founder-asks-A272-A276.md` | |
| A277 | 22 Nov 09:5x (typed): weekly 95%, plan the move to the new account; lose no work (walk claude.ai lanes, save, resume); new account does AWS + Cloudflare + GoDaddy with the founder's credentials; review #2883/#2884/#2885 and finish them in the browser; full action list with tooling/records status; a detailed plan to reach 15 a day (8 by 19:00 + 7 by 07:00) since we plateau at 10; the new account's Lead validates the whole plan first | Done 09:5x: #2883 Approve posted + #2883/#2884/#2885 marked ready in the browser; no work lost (no lane running; all on GitHub); switch block "Switch of 22 Nov, part 2" in RESUME-ON-NEW-ACCOUNT.md; plan `product/design/plan-15-a-day-2026-11-22.md` (8+7, 12 lanes, tooling status), to be validated by the new account's Lead |


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
**New account from 22 Nov (A279: numbering restarts, no series shown):** Lead 1 (local_51d4f3ca, from 22 Nov 10:1x IST).
**Series 3 (P-749):** Lead 1 (local_94786348, from 20 Nov 12:18 IST), Lead 2 (local_daadc134, from 20 Nov 13:57 IST), Lead 3 (local_b0640d3f, from 20 Nov 14:43 IST), Lead 4 (local_470182c1, from 20 Nov 18:21 IST), Lead 5 (local_08ac9385, from 20 Nov 23:0x IST), Lead 6 (local_871ed54c, from 21 Nov 00:04 IST), Lead 7 (local_a8acec34, from 21 Nov 01:17 IST), Lead 8 (local_dbce8aee, from 21 Nov 02:01 IST), Lead 9 (local_52cca488, from 21 Nov 06:48 IST), Lead 10 (local_8f916b74, from 21 Nov 07:43 IST), Lead 11 (local_f172acc0, from 21 Nov 08:54 IST), Lead 12 (local_7ec53395, from 21 Nov 10:2x IST), Lead 13 (local_369dd389, from 21 Nov 11:44 IST), Lead 14 (local_c09f305e, from 21 Nov 12:44 IST)., Lead 15 (local_666bcb32, from 21 Nov 15:47 IST), Lead 16 (local_1cd4840f, from 21 Nov 18:04 IST), Lead 17 (local_74cdbff7, from 21 Nov 20:1x IST), Lead 18 (local_bdef7c01, from 22 Nov 03:21 IST), Lead 19 (local_69eeb2bd, from 22 Nov 05:5x IST)
**Series 2 (P-433):** Leads to Lead 100 (local_59a9ad7a): word for word in `product/history/STATE-2026-11-21-0822-lead10s3-series-2-leads-line.md`.
**Series 1: Leads 1 to 41, before 9 Nov 17:48 IST**, never renamed or renumbered: the full list, word for word, is in `history/STATE-2026-11-09-2130-lead2s2.md` ("Leads, in order").
