# State — one page (rewritten by the tech lead, P-188; the history is git)

current_lead: local_1baa984b-182a-4f72-af99-af155226d9d4 Lead 28 · 24 Nov 16:06 IST (after Lead 27, near the 200k line; Opus 5.5 medium, P-788)

updated: 2026-11-24 16:24 IST: Lead 28. **A371: Partials to Proven first. Last sections of `history/STATE-2026-11-24-0835-lead18-recovery-plan.md`; action list (A370): `design/action-list-2026-11-24.md`.** About 54/101 Works. **M1 #3467 full run going.** Weekly 78%, disk 6.6 GB.

## Hand-over Lead 18 → Lead 19, 08:31 IST 24 Nov (follow-ups: the recovery plan file; fuller: `history/STATE-2026-11-24-lead16-before-handover.md`)

**Founder 01:25 (A346): all approvals for the open items; he is asleep.** In scope: P-814, P-815 (12 Dec, aim 6-7 Dec; merged in #3314, RULES current here), the fresh qa, standbys, monitoring. NOT in scope: RQ-01's build, the case-rule edges, security test and counsel, fast-check trial. Never add to or cut the 101.
**A347's answers and what is still his:** plan file, end (moved by Lead 20).
**Next:** #3209 (lane 01MXNda5tq8F5fk2jArzKHto) a9a830bc6 Approved, Lead B 5 OK, never in a batch with #3225; its Lead read is owed (no Lead has posted one); after #3225 lands it merges main, declares those routes, fresh verdict ("Lead allows round 8" line), LAST to land · #3033 (01MXNda9PEWJuWCAsf8AenTj) 3978daf95 Approved, Lead read posted; full run 45311346283 red on shard 8 (pf4s race, fix #3366) and 19 (#3302's bell check, its lane ordered 08:22), re-run those two after both fixes land; Lead B 5 OK; label after green and #3225 · #3193 conflicts with main: its lane merges main once after its verdict · #3220 (FO-6ds concept): APPROVED with its 5 answers 07:24 (comment; P-628 founder review); owed: BACKLOG X-row (client and document entry points, P-582) and a cloud build lane (founder turn; `waves.py allow R1.54` ok) · #3318 questions 1-6: with the founder's case-rule answer · X-row owed: evidence file key checked against the firm's files before any reader · #3193 435823a34: both reviews approve (lane's words), 32 suites running, then verdict, batches 45239861287 and #3311 to cover · #3305 (R1.56) may count now #3321 is on main · #3234 #3235 #3184 #3219 #3276 #3174 #3277: migration order; a stamp below main's newest is re-stamped · pf12 OWN list lacks plat_data_request_event: next PF-21 PR.
**Check script (read first; argument minutes):** `/private/tmp/claude-501/-Users-ranjansingh-Desktop-Xpatready/7197abb3-bd94-44f0-8494-0a9194e38c06/scratchpad/chk.sh`.
**Lead reads owed:** #3277, #3174 review.ts.
**qa asks and work with no lane:** the recovery plan file, end.
**Sessions:** Lead B 6 local_5637ca59 (after Lead B 5); Lead O 2 local_f6d6bb60; qa A 5 (session_01MXNda8oJbGMtZ6ov38m3BR), qa B 4 (01MXNda7YhUVUEMkU93gbfaj). Lane ids: FO-7q 01MXNda7PhEdXQAhL6GMtRyG, R1.90 01MXNda67yexjnYrdQ3B9MNt, PF-31 01MXNda6DzofSEsZJa14VVec, PF-18n2 01MXNda5Q4zsDUw8f6CTRCiv, CS-D6 01MXNda6PPrG2yzjfwiFG9e9. Start limit: disk 7 GB.

## Founder asks (Lead 8, 10 Nov; P-450 (4): stays until ticked)
Older open items and ask rows (S10-A239, A240-A241, 10 Nov line): `product/history/STATE-2026-11-21-0850-lead10s3-for-founder-open-and-A240-rows.md`.
| # | Ask (IST) | Status |
|---|---|---|
| A371 | 24 Nov ~16:13 (typed to Lead 28) | Partials to Proven first, rules held by code, manage resources | plan file, end; in progress |
| A359 | 24 Nov, after 13:06 (typed to Lead 24) | prove faster; follow the Lead's recommendations; final tooling decision, dates, outcomes | plan file, end; #3305 line pushed; three sessions started; CodeAnt C1 and C3 yes |
| A370 | 24 Nov ~15:27 (typed to Lead 26, relayed) | one action list in every 30-minute report | `design/action-list-2026-11-24.md`; in force |
| A369 | 24 Nov ~15:25 (typed to Lead 26, relayed) | keep the copy current; enforce by code; speed, SLA | dated plan owed |
| A363 | 24 Nov ~14:49 (typed to Lead 26) | why rules were missed, never again; speed ("50"); a standby Lead | measured; plan file, end; fix proposed; standby refused by disk |
| A362 | 24 Nov ~14:41 (typed to Lead 25, relayed) | rules enforced; reports as decided; tools; proven | answered by Lead 25; repairs owed: plan file, end |
| A361 | 24 Nov ~14:37 (typed to Lead 25, relayed) | open fresh qa + PF-17 part 4; consultation gate and signing code: research best practice, keep flexible, recommend and implement; update | sessions requested by Lead 25; research stops for ruling; plan file, end |
| A356 | 24 Nov, after 11:45 (relayed by Lead 22) | why not delivering, the bottleneck, unblock by hand, finish partials, one tool | ledger in the plan file, end; lanes woken; in progress |
| A353, A354 | 24 Nov | open; rows word for word in the plan file, end |
| A352 | 24 Nov ~10:11 IST (typed to Lead 21) | yes to #3379's wording; concurs with the Lead's 'decide when you can'; the Lead drives the sandbox set-up (Stripe test mode, BoldSign, Google and Microsoft OAuth test apps) in the browser, one step and one question at a time; he watches and logs in | #3379 reworded; Stripe first; in progress |
| A351 | 24 Nov 09:27 (typed to Lead 17) | five delivery problems: implement from now without delaying product | `design/delivery-five-2026-11-24.md` (end); C4 done: `design/p702-evaluation-2026-11-24.md`; open |
| A350 | 24 Nov ~09:22 (typed to Lead 19) | do every needs-me step in the browser; AWS run US$2 yes; RQ-01 inside the 101, no blocker, parallel tracks; **commit 29 Nov**, 10-15 a day; research security and counsel; on-call given in chat | in progress; full in the plan file |
| A348 | 24 Nov ~08:25 (typed to Lead 18) | recovery plan, clean up lanes and disk, near-done first, lessons live, keep the dates | plan file above; in progress |
| A346 | 24 Nov ~01:25 | night approvals (line above); plan file | in force |
| A342, A343, A347 | 24 Nov | open rows, word for word at the end of the plan file | in force |
| A331-A336, A341, A344, A345 | 23-24 Nov | in force; row word for word in the plan file, end |
| A337-A340 | 23 Nov | in force; row word for word in the plan file, end |
| A318 | 23 Nov | in force; word for word in the plan file, end |
| A308-A329 | 23 Nov | A328 in force (scope line above); A316 visual plan owed; the rest answered or recorded, rows word for word: `history/STATE-2026-11-23-lead9-ask-rows-A308-A329.md` |
| A242-A305 | 21-23 Nov | A300 (operating system first) in force; pointer rows word for word: `history/STATE-2026-11-23-lead4-older-ask-rows.md` |

## Start here (next Lead)
✅ **Night objective (A332, A334, A339): product first; operating system whenever the queue has room. Each check, in order:** 1 red main, qa Blocker · 2 lanes idle or asking, answer and wake ALL (type in the session) · 3 full runs: re-run the one red part, cover, label · 4 queue never empty · 5 operating system, n of 4 (alarm, parts list, #3035, packed suites) · 6 save STATE.
**P-788 (founder, 12:0x IST 22 Nov): everything on Opus 5.5 medium; any other model or higher effort only when needed, named to him with reason and place when used, never silently. After every cloud start read the model label in claude.ai/code and fix it; each check lists sessions not on Opus 5.5 medium.**
📋 **Founder report, fixed order (A260, A262, A263: plus the capability board, 5 stage boxes per R1 row, and "Outside the 15") until ENF-783c prints it:** 1 🔴 Needs you (exact click) · 2 header: Proven this cycle X/15 · Total N/101 · Forecast by 07:00 Y/15 · On track · 3 **pipeline stage table** (Shaped-ready, Building, Review, Waiting on Lead, Red after approval, Merge queue, qa proof: items · age · in/out 3 h · ✅/⚠️/❌ + why) and the constraint · 4 timeline in build-and-prove order (Lead 9 code block: HH:MM · R1.n · name · build → review → queue → walk → qa with ✔ · waits on), 8 by 19:00 / 7 by 07:00 · 5 doing → expect by · 6 since last (≤4) · 7 money and resources. Short checks: 1, 2, 4, 6.
🧭 **P-783:** checks at minutes 03 and 33 are the full report (format: 📋 above); lanes started 11:0x-11:2x listed word for word in `product/history/STATE-2026-11-21-1335-lead14s3-start-here-P757-and-missed-checks.md`.
Older Start here pointers and the red-row lanes line: `history/STATE-2026-11-24-lead14-before-handover.md`.
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
**New account from 23 Nov:** Leads 1 to 17 word for word in `history/STATE-2026-11-24-0800-lead18-leads-line.md`; Lead 18 (local_799486c7, from 24 Nov 07:20 IST), Lead 19 (local_abd52603, 08:31), Lead 20 (local_aa6d586e, 09:23), Lead 21 (local_11ef6843, 10:02), Lead 22 (local_a55ecb03, 10:39), Lead 23 (local_1d6d1d97, 11:45), Lead 24 (local_9d85b0d8, 12:40), Lead 25 (local_f8cf715f, 13:18), Lead 26 (local_b17225db, 14:35), Lead 27 (local_d274b187, 15:17), Lead 28 (local_1baa984b, from 24 Nov 16:06 IST).
**Leads of 22 Nov (account before):** word for word in `history/STATE-2026-11-23-1705-lead6-cs-mv2-and-older-leads.md`.
**Series 3 (P-749):** Leads 1 to 19 (20-22 Nov): word for word in `product/history/STATE-2026-11-22-1455-lead4-series-3-leads-line.md`.
**Series 2 (P-433):** Leads to Lead 100 (local_59a9ad7a): word for word in `product/history/STATE-2026-11-21-0822-lead10s3-series-2-leads-line.md`.
**Series 1: Leads 1 to 41, before 9 Nov 17:48 IST**, never renamed or renumbered: the full list, word for word, is in `history/STATE-2026-11-09-2130-lead2s2.md` ("Leads, in order").
