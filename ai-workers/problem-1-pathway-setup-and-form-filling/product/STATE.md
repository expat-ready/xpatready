# State — one page (rewritten by the tech lead, P-188; the history is git)

current_lead: local_fec215ea-92cb-4343-a057-a43480a143bd Lead 5 · 22 Nov 17:10 IST (took over from Lead 4 (local_bcc6ed82) at ~546k, P-446; Opus 5.5 medium, P-788)

updated: 2026-11-22 17:45 IST: Lead 5 check · milestone: Release 1 proven 43 of 101 on main (11/15 this cycle) · rules: **`RULES.md`** (as of **P-791**; P-792 to P-794 newer) · this branch: `lead/2026-11-07-lead31`





🔴 **Waiting on the founder (00:3x IST 22 Nov, P-530; founder 03:5x: tomorrow, ask him then):** AWS console session expired; sign in as root with MFA in the AWS session's (local_35aacb3f-3180-427e-a538-8dc51d38de14) built-in browser (Cmd+Shift+B), then approve CodeBuild again there. No Cloudflare records needed (no-domain mode; R1.24 out). RDS on since 21 Nov 14:39Z, 0 tasks (~US$0.11/h).

Lead 19 and the 18 → 19 hand-over, and Lead 3 check lines 13:2x-13:3x: word for word in `product/history/STATE-2026-11-22-1349-lead3-check-lines.md`.

## Hand-over Lead 4 → Lead 5, 17:10 IST 22 Nov (Lead 4 at ~546k context, P-446; the Lead 3 → 4 block and Lead 4's check lines stay below and in history)
**Goal (founder, P-795, A286):** 12-15 proven per track. Proven this cycle 2 (R1.39 16:34, R1.89 16:59); total 45/101 on main (41 at 00:00 IST, 34 24 h ago). Boards: `design/board-lead-a-2026-11-22.md`, `design/board-lead-b-2026-11-22.md`; plan page https://claude.ai/artifact/2aNo4YH89N7CcJG7Jnx2Dn (`design/two-track-plan-2026-11-22.html`).
**Do first:** (1) **Start CS-MV1** (MoneyVisibilityPort, R1.56 critical path; row on lead-b @ a0ca4296f) in a founder-typed turn from the desktop app (Remote Control cannot start sessions); brief text: Lead 4's 17:1x start attempt in this session. (2) **Records PR** with P-805 (size exceptions #3042 FO-9b p1 1,080 lines and #2368 FO-7ts p3 1,045 lines; granted on the PRs) and the 16:49 R1.5 AWS-half proof line. (3) **#2953** FO-7b 1b: after the diff-only re-approve of 2311bc168, Lead money read, label. (4) **AWS:** waits PF-8b-f6 (#3060, design approved); on merge send "rebuild" (founder OK stands), then resolve --rolled-back 20261119170000_pf18bk_support_keys, deploy, proofs R1.13, R1.15, R1.24, R1.5 HTTPS and cookies. R1.5 code steps are proven by qa on an isolated copy (no agent types a password on staging). (5) **#2999** CS-NT1 p1 needs re-approve of 6666ac70b, then Lead read (schema). (6) Migration slot order: #2368 → #3042 → PF-21b p2 (#3017) → FO-5d.
Lead 4's 17:10 pipeline and lane lines: word for word in `history/STATE-2026-11-22-1736-lead5-lead4-pipeline-and-lanes-lines.md`.
Lead 5's 17:18 check line: word for word in `history/STATE-2026-11-22-1736-lead5-lead4-pipeline-and-lanes-lines.md`.
**Lead 5 check 17:39-17:46 IST:** #3060 Lead read OK on 070255421 and labelled 17:44; AWS session briefed (on merge: rebuild, row counts as the RDS master before deploy, then resolve, deploy, proofs). #3042 ruled (a) NOWAIT + retry + Busy, round 5 allowed. #2971 round 4 allowed. Waiting: #3067 records to merge, then reopen #2368 for pr-rules (P-805) and label (Lead 4's read OK). #2972 (cancelled review-rounds job) and #2431/#2982 refresh still open.
**Lead B (17:1x IST message to Lead 5):** records PR also takes `lead-b/2026-11-22-track-b` (briefs, board, new BACKLOG rows, RULES fold to P-799); Lead B's money read on #2953 was OK at bb83bcec7 (re-reads if head moved, passes :17/:47); CS-MV1 is first at the founder's next typed turn (FO-7q reads fail closed without it, R1.56 cannot be walked). Notes: Lead B's hand-over note in the shared notes folder (outside the repo).
**Standbys:** Lead 6 (local_d4609e9d); top up one more at the founder's next typed turn in the desktop app.

The Lead 3 → Lead 4 block and Lead 4's check lines: word for word in `history/STATE-2026-11-22-1710-lead4-handover-3-4-block-and-lines.md`.

## Founder asks (Lead 8, 10 Nov; P-450 (4): stays until ticked)
Older open items and ask rows (S10-A239, A240-A241, 10 Nov line): `product/history/STATE-2026-11-21-0850-lead10s3-for-founder-open-and-A240-rows.md`.
| # | Ask (IST) | Status |
|---|---|---|
| A288 | 22 Nov 14:5x (typed, to Lead 4): implement and enforce everything now (track queues, speed changes, Lead-missed-Track-B rule, no stale information); restore the branch yourself; two standby Leads; one question at a time | 15:00: branch restored (7ea0d81f3); lanes Speed 1 (track queues, qa proof on batch), Speed 2 (migration slots per area, affected tests), Enforcement 2 (ENF-803 stale info, bulk-delete guard) started; P-802, P-803 on #2952; Lead 6 standby started |
| A287 | 22 Nov 14:4x (typed, to Lead 4): never ask domain questions, settle them from government sources, RCIC documents and industry practice; recommended button first; do the AWS CodeBuild OK yourself; every Track B capability gets lanes now with Track A's step board, qa and proven-by, kept in a shared library; steps 1-4 green fast for both tracks; are the 30/60/90-min triggers measured or blind? | P-797 tax = client's province (CRA 3-3-6); AWS told with his words; 10 lanes started + 3 cards (app cap 10); board `design/board-lead-b-2026-11-22.md`, page `design/two-track-plan-2026-11-22.html`; triggers tightened (P-798 owed: lead-watch.sh enforcer change) |
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
**New account from 22 Nov (A279: numbering restarts, no series shown):** Lead 1 (local_51d4f3ca, from 22 Nov 10:1x IST), Lead 2 (local_d718f32a, from 22 Nov 11:17 IST), Lead 3 (local_6efc4ae3, from 22 Nov 13:05 IST), Lead 4 (local_bcc6ed82, from 22 Nov 14:18 IST), Lead 5 (local_fec215ea, from 22 Nov 17:10 IST).
**Series 3 (P-749):** Leads 1 to 19 (20-22 Nov): word for word in `product/history/STATE-2026-11-22-1455-lead4-series-3-leads-line.md`.
**Series 2 (P-433):** Leads to Lead 100 (local_59a9ad7a): word for word in `product/history/STATE-2026-11-21-0822-lead10s3-series-2-leads-line.md`.
**Series 1: Leads 1 to 41, before 9 Nov 17:48 IST**, never renamed or renumbered: the full list, word for word, is in `history/STATE-2026-11-09-2130-lead2s2.md` ("Leads, in order").
