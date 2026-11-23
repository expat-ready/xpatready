# State — one page (rewritten by the tech lead, P-188; the history is git)

current_lead: local_d4a6b1cd-f814-4a94-b7d3-bb6b0b82ba7a Lead 10 · 23 Nov 09:38 IST (took over from Lead 9 (local_482034a7) at ~440k, ~320k beyond its start read, P-446; Opus 5.5 medium, P-788)

updated: 2026-11-23 10:21 IST: Lead 10, A291 analysis, demo restored, lanes answered (check 0721b6cb)

Lead 19 and the 18 → 19 hand-over, and Lead 3 check lines 13:2x-13:3x: word for word in `product/history/STATE-2026-11-22-1349-lead3-check-lines.md`.

## Hand-over Lead 9 → Lead 10, 09:3x IST 23 Nov (Lead 9 at ~440k, ~320k beyond its start read, P-446; the Lead 9 block before this: word for word in `history/STATE-2026-11-23-0940-lead9-block.md`)

**Goal (founder, A289-A291):** finished capabilities proven, not merges; he asked 10-15/day; proposed today 8 by 07:00 IST 24 Nov (asked 09:3x, no answer yet). Plan page Version 5 https://claude.ai/artifact/2aNo4YH89N7CcJG7Jnx2Dn (source `design/two-track-plan-2026-11-22.html`; its "09:4x" stamps ran ahead of the clock, data read 09:20-09:37). 48/101 proven, +2 today (R1.102, R1.21); A 5/15, B 0/12; weekly 82% (76% at 02:27).

Lead 10's 10:0x-10:21 work (demo restored, AWS session archived by mistake, lanes answered, #3175): word for word in `history/STATE-2026-11-23-1035-lead10-A291-and-1021-check.md`.

**Started 09:57 IST (founder: "Yes, start them"):** Lead 11 standby (local_3a0c13fa, idle until "take over now"); cloud lanes requested (app creates them, default environment because the xpatready environment could not be read): PF-17 p1 finish #3155 (task_6be512c1), qa Track B 3 (task_6782788f), FO-9b part 2 (task_fab6c6cc). Next check: confirm each appeared in claude.ai/code on Opus 5.5 medium, and that the default environment runs suites (else ask him to Move session).

Lead 9's "Do first", "At the founder's next typed turn", "Learned tonight" and Lead 10's first check: word for word in `history/STATE-2026-11-23-1045-lead10-lead9-handover-lines.md`.

**Waiting on the founder:** restore the archived AWS staging proof session (Archived list) before the AWS sign-in; R1.92 lane (session_01Ln6TiPzgv1F4fXY7mcuxqb) "Move session" to the xpatready env (he said yes; the page ignores an automated press, he must press it); AWS root sign-in in the AWS session's browser + CodeBuild; Lead B 2's records PR (lead-b/2026-11-23-track-b-records @a1c2ce3ae: FO-7q part 2, FO-9b part 1m rows) yes/no; today's goal.

## Founder asks (Lead 8, 10 Nov; P-450 (4): stays until ticked)
Older open items and ask rows (S10-A239, A240-A241, 10 Nov line): `product/history/STATE-2026-11-21-0850-lead10s3-for-founder-open-and-A240-rows.md`.
| # | Ask (IST) | Status |
|---|---|---|
| A292 | 23 Nov 10:2x-10:3x (typed): full approval, the Lead decides everything by outcome, best practice, scale, quality, speed; why park tooling, find a faster way to land enforcement; UX: left-menu items open in tabs like Chrome, same record in 2 tabs without conflict, an edit shows in every tab, backend only on Save with the last value; research best in class, make it the standard for every screen (UX quality gate + skills) | 10:29: lanes requested (all-in): R1.70 CS-D7, R1.85 PF-21b rest, R1.105 PF-11c+AUD-2, R1.56 FO-7g p3, R1.61 J-61, R1.46 PF-19s, qa Track A 3, tooling closer, UX PF-31 (real browser tabs, BroadcastChannel shared drafts, If-Match/409 save, EXPERIENCE + skills gate). R1.86 PF-21c start refused by the classifier (founder starts it or next typed turn). #2935 /run full + batch cover; #3065 shard 9 PF-28 probe (unknown provider 400 → 404) sent to lane |
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
**New account from 22 Nov (A279: numbering restarts, no series shown):** Lead 1 (local_51d4f3ca, from 22 Nov 10:1x IST), Lead 2 (local_d718f32a, from 22 Nov 11:17 IST), Lead 3 (local_6efc4ae3, from 22 Nov 13:05 IST), Lead 4 (local_bcc6ed82, from 22 Nov 14:18 IST), Lead 5 (local_fec215ea, from 22 Nov 17:10 IST), Lead 6 (local_d4609e9d, from 22 Nov 19:04 IST), Lead 7 (local_d7cc573e, from 22 Nov 21:14 IST), Lead 8 (local_82fee93b, from 22 Nov 23:59 IST), Lead 9 (local_482034a7, from 23 Nov 02:15 IST), Lead 10 (local_d4a6b1cd, from 23 Nov 09:38 IST).
**Series 3 (P-749):** Leads 1 to 19 (20-22 Nov): word for word in `product/history/STATE-2026-11-22-1455-lead4-series-3-leads-line.md`.
**Series 2 (P-433):** Leads to Lead 100 (local_59a9ad7a): word for word in `product/history/STATE-2026-11-21-0822-lead10s3-series-2-leads-line.md`.
**Series 1: Leads 1 to 41, before 9 Nov 17:48 IST**, never renamed or renumbered: the full list, word for word, is in `history/STATE-2026-11-09-2130-lead2s2.md` ("Leads, in order").
