# State — one page (rewritten by the tech lead, P-188; the history is git)

current_lead: local_2158cd24-6120-467d-ab3f-043acd7b417b Lead 2 · 23 Nov 11:59 IST (took over from Lead 1 (local_a085acf2) at 378k, P-446; Opus 5.5 medium, P-788)

updated: 2026-11-23 11:59 IST: Lead 1 → Lead 2 hand-over (new check is Lead 2's)

Lead 19 and the 18 → 19 hand-over, and Lead 3 check lines 13:2x-13:3x: word for word in `product/history/STATE-2026-11-22-1349-lead3-check-lines.md`.

## Hand-over Lead 1 → Lead 2, 11:59 IST 23 Nov (Lead 1 at 378k, ~260k beyond its start read, P-446; Lead 1 block and A298-A299 in full: `history/STATE-2026-11-23-1155-lead1-block-and-asks.md`)

**Goal (A295-A299):** 18 proven by 11:00 IST 24 Nov from 48/101 (`design/plan-24h-2026-11-23.md`; checkpoints 15:00 ≥3 at risk, 19:00 ≥7, 23:00 ≥11); operating system live first; going private is the founder's first priority (detailed report). Weekly 6% at 11:54 (1% at 11:34: ~15%/h, over 3%/h at two checks: find the cause, tell him).
**FIRST: land #3208** (head 1ea222cfc, Reviewer Approve, Lead read posted, full ci running): when green, ahead of the queue (P-214). THEN label #3197, #3190, #3189 (Lead read lines posted) when green; `/run full` then label #3065, #2935, #2933, #3037, #3173; requeue #3043, #3044, #3183.
**Tooling (A297):** #2972, #2925 merged 11:49; #2920 in batch (round 4 allowed); next #2971 (read its check-mergify-scopes diff, label), then #3035 (P-808 in #3210), then tool-b's and tool-c's "ready to land" list: #2597 #2473 #2738 #2444 #2370 #2487 #2428 #2434; close asks #2372 #2472 (evidence on each). Lane claims: verify before landing.
**Reads the Lead owes:** #3185 (R1.86 migration; head moved to 21adefa9c after its Approve: needs a diff-only re-review), #3195 (R1.105, Approve eef90d8c8), #3178 (AUD-3a migration, Approve 6c91c1c4e) and #3191 (PF-25w, Approve 7a9614ff5; one of them carries the shared migration), #3033 (Lead B money re-read asked), #3174 (round 6 allowed; same stamp as #3033).
**qa:** R1.1, R1.13, R1.15 judged Partial (#3206); AWS proof 3 `local_f09b5b4c` was asked to close them in one pass; it may ask the founder a yes for cost.
**Desk** `local_d92dde4f` (git host, private, 2x/4x): not done, waits on its run sample; publish its detailed report for the founder when it ends.
**Local:** Lead B 3 `local_281c4e7e` (asked: #3033 re-read, refund-route visibility check, four rows to shape), standby Lead 3 `local_cf20dbb4`. 27 cloud lanes started (25 + PF-4bc + PF-4bs), read claude.ai with Show more: Awaiting input: R1.29, tool-c; many "Unread response" lanes wait on labels.
**Founder-typed turn owed:** start PF-27 (firm lock, `firmAllows`; two starts failed: environments not readable), FO-7s1 screens lane after #3197, FO-9s parts 2-3 (the Lead's 3 answers, #2896), one standby. #2129 and #3030 ask the Lead (parked; Source cells). RULES still as of P-795 (file at its 25 KB limit): fold P-796 to P-808 into an IDX row.
**Waiting on the founder:** nothing. AWS idles at ~US$0.18/h.

## Founder asks (Lead 8, 10 Nov; P-450 (4): stays until ticked)
Older open items and ask rows (S10-A239, A240-A241, 10 Nov line): `product/history/STATE-2026-11-21-0850-lead10s3-for-founder-open-and-A240-rows.md`.
| # | Ask (IST) | Status |
|---|---|---|
| A298-A299 | 23 Nov 11:37-11:45 | going private research, tooling first, AWS signed in, R1.5 cards pressed, money approved; in full: `history/STATE-2026-11-23-1155-lead1-block-and-asks.md` |
| A297 | 23 Nov 10:5x (typed): unarchive AWS via his computer; remove the two-queue decision from pending; one-time exception: land all agreed tooling/enforcement/open contribution first, estimate, 'fix the car or keep moving' | 10:52: Claude app cannot be controlled by the Lead (fixed rule), claude.ai lists no archived Mac sessions: started AWS · staging proof 2 `local_b9ba7abd` in the same folder/branch; #3006 closed by decision (one queue, split only if measured); enforcement sprint written into RESUME 'Switch of 23 Nov' (3 lanes, 4-6 h, open contribution live ~17:00-18:00) |
| A293, A295-A296 | 23 Nov | word for word in `history/STATE-2026-11-23-1131-lead1-before-new-account-block.md` |
| A292, A294 | 23 Nov | word for word in `history/STATE-2026-11-23-1131-lead1-before-new-account-block.md` |
| A291 | 23 Nov 10:0x: stock, 24 h max, tracks, 1/hour, 70-80%, account switch, honesty, cleanup | answered 10:2x; word for word in `history/STATE-2026-11-23-1035-lead10-A291-and-1021-check.md` |
| A289-A290 | 23 Nov 01:4x-02:0x | word for word in `history/STATE-2026-11-23-1015-lead10-founder-asks-A289-A290.md` |
| A287-A288 | 22 Nov 14:4x-14:5x | word for word in `history/STATE-2026-11-23-0007-lead8-founder-asks-A287-A288.md` |
| A283-A286 | 22 Nov 11:0x-14:2x | word for word in `history/STATE-2026-11-22-1500-lead4-founder-asks-A283-A286.md` |
| A242-A282 | 21-22 Nov (A279 parts: `product/design/A279-parts-2026-11-22.md`) | word for word in `product/history/STATE-2026-11-22-1027-lead21s3-founder-asks-A272-A276.md` | |

## Start here (next Lead)
**P-788 (founder, 12:0x IST 22 Nov): everything on Opus 5.5 medium; any other model or higher effort only when needed, named to him with reason and place when used, never silently. After every cloud start read the model label in claude.ai/code and fix it; each check lists sessions not on Opus 5.5 medium.**
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
**New account from 23 Nov:** Lead 1 (local_a085acf2, from 23 Nov 11:24 IST), Lead 2 (local_2158cd24, from 23 Nov 11:59 IST).
**New account from 22 Nov (A279: numbering restarts, no series shown):** Lead 1 (local_51d4f3ca, from 22 Nov 10:1x IST), Lead 2 (local_d718f32a, from 22 Nov 11:17 IST), Lead 3 (local_6efc4ae3, from 22 Nov 13:05 IST), Lead 4 (local_bcc6ed82, from 22 Nov 14:18 IST), Lead 5 (local_fec215ea, from 22 Nov 17:10 IST), Lead 6 (local_d4609e9d, from 22 Nov 19:04 IST), Lead 7 (local_d7cc573e, from 22 Nov 21:14 IST), Lead 8 (local_82fee93b, from 22 Nov 23:59 IST), Lead 9 (local_482034a7, from 23 Nov 02:15 IST), Lead 10 (local_d4a6b1cd, from 23 Nov 09:38 IST).
**Series 3 (P-749):** Leads 1 to 19 (20-22 Nov): word for word in `product/history/STATE-2026-11-22-1455-lead4-series-3-leads-line.md`.
**Series 2 (P-433):** Leads to Lead 100 (local_59a9ad7a): word for word in `product/history/STATE-2026-11-21-0822-lead10s3-series-2-leads-line.md`.
**Series 1: Leads 1 to 41, before 9 Nov 17:48 IST**, never renamed or renumbered: the full list, word for word, is in `history/STATE-2026-11-09-2130-lead2s2.md` ("Leads, in order").
