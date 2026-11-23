# State — one page (rewritten by the tech lead, P-188; the history is git)

current_lead: local_d4a6b1cd-f814-4a94-b7d3-bb6b0b82ba7a Lead 10 · 23 Nov 09:38 IST (took over from Lead 9 (local_482034a7) at ~440k, ~320k beyond its start read, P-446; Opus 5.5 medium, P-788)

updated: 2026-11-23 09:50 IST: Lead 10 first check (check 0721b6cb created 09:38)






Lead 19 and the 18 → 19 hand-over, and Lead 3 check lines 13:2x-13:3x: word for word in `product/history/STATE-2026-11-22-1349-lead3-check-lines.md`.

## Hand-over Lead 9 → Lead 10, 09:3x IST 23 Nov (Lead 9 at ~440k, ~320k beyond its start read, P-446; the Lead 9 block before this: word for word in `history/STATE-2026-11-23-0940-lead9-block.md`)

**Goal (founder, A289-A291):** finished capabilities proven, not merges; he asked 10-15/day; proposed today 8 by 07:00 IST 24 Nov (asked 09:3x, no answer yet). Plan page Version 5 https://claude.ai/artifact/2aNo4YH89N7CcJG7Jnx2Dn (source `design/two-track-plan-2026-11-22.html`; its "09:4x" stamps ran ahead of the clock, data read 09:20-09:37). 48/101 proven, +2 today (R1.102, R1.21); A 5/15, B 0/12; weekly 82% (76% at 02:27).

**Do first:** (1) **#3065** FO-6 p3 (R1.54/R1.61): dequeued (shard 10 check_forms_qa53 QA-65, signing webhook not on PUBLIC_DOOR_WRITES): lane told 09:2x to add it as FO-7c's (2766ef4f0) plus a 'Batch failures covered' line; then `/run full` and relabel; Lead B needs no read for a list entry. P-807 size exception is on main and in its body. (2) **#3165** PF-Fw queued after green full run. (3) When #3065 merges: FO-5d (design/briefs/track-b/FO-5d.md, Lead B 2's text) to the FO-6 lane (session_01Ln6TiQQuh9E2zEM4jmnmDc). (4) #3155 PF-17 p1 (R1.93) lane at 83%: answered (audit two uses; pf12b list edit); Lead B reads it. (5) #3033 FO-7t p1 (R1.58) lane at 55% building, hand-over note at ~70%. (6) PF-4s lane (session_01Ln6TiQmVhFyoYNr5KZgjmi) → PF-25w (R1.24).

**Lead 10 check 09:4x-09:50:** #3065 `/run full` posted on a255e0321 (09:4x); #3165 in batch #3172 (checking); #3155 lane ended at ~90% context, Lead answers posted (B1 per hand-over; M1: short transactions, StorageWatch snapshot for storage, 400-firm test under 2 s); #3033 (R1.58) lane answered in claude.ai (migration yes, 422, visibility covers balances and request read, direct read OK for part 1 + follow-up row, size row) and told to finish round 2.

**Started 09:57 IST (founder: "Yes, start them"):** Lead 11 standby (local_3a0c13fa, idle until "take over now"); cloud lanes requested (app creates them, default environment because the xpatready environment could not be read): PF-17 p1 finish #3155 (task_6be512c1), qa Track B 3 (task_6782788f), FO-9b part 2 (task_fab6c6cc). Next check: confirm each appeared in claude.ai/code on Opus 5.5 medium, and that the default environment runs suites (else ask him to Move session).

~~**At the founder's next typed turn:**~~ (done above) start a fresh PF-17 part 1 lane (cloud; `/next runtime PF-17 part 1: finish #3155 from its hand-over note and the Lead's 09:4x answers`), fresh qa Track B lane (cloud; take over draft #3043: j_58 client B ≥250.01 outside CASE2 so #2368's same-case pick rule fires, W1 body as PaymentIn; mark #3043-#3045 ready; rate QA-754 C6.9 focus and the pf4s 403/422 order fault on the shared demo db), fresh FO-9b part 2 lane (cloud; Lead B 2's text: rest of row FO-9b, hasMoney in client-money/port.ts also counts money_party_tax_treatment and trust payees, keys agent/duplicates:review|merge, breaker yes), and the Lead 11 standby card (task_567bcc0b). Lead 9 tried in a founder turn at 09:3x: `start_session` user_asked was refused (his message only approved the env move).

**Waiting on the founder:** R1.92 lane (session_01Ln6TiPzgv1F4fXY7mcuxqb) "Move session" to the xpatready env (he said yes; the page ignores an automated press, he must press it); AWS root sign-in in the AWS session's browser + CodeBuild; Lead B 2's records PR (lead-b/2026-11-23-track-b-records @a1c2ce3ae: FO-7q part 2, FO-9b part 1m rows) yes/no; today's goal.

**Learned tonight:** a mass cancel at 21:16Z left full runs and 3 merge batches 'failed' with only cancelled jobs: re-run failed jobs (rerun-failed-jobs) and Mergify continues; check_pf21b_holds DW6 needed every later migration (#3157); `fast` also runs the suite chooser's self-test (a page ≤30 suites); marking a PR Ready from the shell is refused by the classifier: ask the lane; claude.ai prompt box: type then click the Send button (Return only works sometimes), confirm the box empties.

## Founder asks (Lead 8, 10 Nov; P-450 (4): stays until ticked)
Older open items and ask rows (S10-A239, A240-A241, 10 Nov line): `product/history/STATE-2026-11-21-0850-lead10s3-for-founder-open-and-A240-rows.md`.
| # | Ask (IST) | Status |
|---|---|---|
| A290 | 23 Nov 02:0x (typed, to Lead 8): plain terms; Track A, B: did we achieve, gain or lose; anything in the browser or GitHub to fast-track tonight; what is our target; why this night not 10 like other nights | 02:05: #3029 R1.102 unblocked, Track B qa lane restarted, Track A qa sent to walk merged rows; answered in chat |
| A289 | 23 Nov 01:4x: tracks, progress, forecast, blockers, waits | answered 01:5x; word for word in `history/STATE-2026-11-23-0021-lead8-check-lines.md` |
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
