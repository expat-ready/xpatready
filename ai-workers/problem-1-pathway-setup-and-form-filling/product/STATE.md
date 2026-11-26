# State — one page (rewritten by the tech lead, P-188; the history is git)

current_lead: local_33c127af Lead 6 · 26 Nov 22:33 IST (after Lead 5 local_1c8b2ecd at about 295k, ~190k past its start read, P-446; Opus 5.5 medium, P-788)

updated: 2026-11-26 23:0x IST (clock): **Lead 6 running (check a1b9cf16).** #3697 labelled (green). #3872 (P-214: PF-21d stamp test demanded the newest migration forever; took #3831 out of the queue) Approve + labelled; then requeue #3831. #3753: cloud builder started by the founder from card task_a54c1612. Lead 7 standby NOT started (the app's classifier refused start_session); asked the founder. 66/110 Works on main. Weekly ~75%.

## Hand-over Lead 5 → Lead 6, 22:3x IST 26 Nov (Lead 5 at ~295k, P-446; the earlier block word for word: `history/STATE-2026-11-26-2235-lead5-handover-old-block.md`)
**Do first:** create your check (cron 3,33; prompt `run lead-watch; read STATE Start here`); Lead 5's 2ee5c4a4 is deleted. Re-arm the watch: Monitor `bash /tmp/claude-501/lane-watch.sh` (allowed_domains api.github.com, github.com). Start one more standby at the founder's next typed turn (P-286).
**How lanes are reached tonight:** the built-in browser pane is signed out of claude.ai, so use **Claude in Chrome** (the founder's signed-in Chrome) on https://claude.ai/code. Type through the prompt box with JS (`execCommand('insertText')` then an Enter keydown), check that the URL is the right session before typing, and confirm the text shows once in the thread. The Chrome tab group can drop (twice at ~21:5x): call tabs_context_mcp with createIfEmpty. The "fix · tooling chain" session URL redirects to the Lead's own session: never type there. Cloud lanes don't read SendMessage; PR comments reach them only while they're active.
**Founder answers (typed, 26 Nov 21:0x-21:2x):** no 17:30 account switch (switch at 95%); Lead 3 reopened for A414, done: v3 v5 https://claude.ai/artifact/1ecP2boSQoPXXn8VfTjQ3E (product public, factory to expat-ready/private, steps 0-5). v3 approved 23:1x (P-845); #3851 out of draft. He said product delivery had stalled ("shameful" if not done): judge by Works.
**Owed by the founder:** #3733 Convert to draft, then Ready for review (the tool's safety check refused the Lead's toggle; never route around it).
**Queue and next steps (all answered on GitHub by Lead 5):**
* #3697 (R1.22 firm lock): round 4 allowed and Lead read posted (identity); reopened at 22:3x to run ci and pr-suites (skipped while draft). **Label it when green.**
* #3753 (R1.111 statements): lane ended; pr-suites red on 9e9ee41a for two real failures (Lead 6, 22:4x: StatementDocuments runs no DocumentRenderPort contract; `client-money/reports/send.ts` mail not through MessagePort). Fixes on the PR (comment 7198470565); needs a builder (card task_a54c1612).
* #3808 (R1.57 card payments): money read done; pr-suites red, the lane fixes it; label when green.
* #3831 (R1.3 review tables): labelled, in the queue.
* #3814, #3825 (OS-PM 4): conflicts after #3810; steps on the PRs; the Lead labels after a diff-only Approve.
* #3860, #3861 (R1.95): P-844 merged (#3863); they add `Size exception: P-844`; rounds allowed.
* #3639 (R1.95 part 1): Lead read done, `/run full` posted; label when green.
* #3824 (R1.35): reopened, round 4 allowed; next part PF-10b part 2 (undo, report, __proto__ fix): **shape the row** (Done when, test) before the lane builds.
* #3303 (R1.64): round 6 allowed; its select-suites false positive is fixed in a separate P-214 PR.
* #3411 (R1.22): round 8 allowed, review-rounds re-run; label when green.
* #3849 (R1.79): concept approved, lane building. #3829, #3822 (R1.76): round 3 allowed.
* qa: R1.85 should reach Works once qa re-walks j_85 (#3841 merged 22:0x).
**Owed by the Lead:** RULES.md refresh to one page (P-440, also owed by Lead 4); Lead reads #3843, #3715, #3693, #3506, #3219; the older quiet PRs in lead-watch's SLE list (#2129 ... #3636): triage or close.

## Founder asks (Lead 8, 10 Nov; P-450 (4): stays until ticked)
Older open items and ask rows (S10-A239, A240-A241, 10 Nov line): `product/history/STATE-2026-11-21-0850-lead10s3-for-founder-open-and-A240-rows.md`.
| # | Ask (IST) | Status |
|---|---|---|
| A242-A405, A410 | 21-26 Nov | answered or in force (A395 open; A410 hybrid cost answer awaits his confirm) | rows word for word in `history/STATE-2026-11-26-1530-lead4-A407-A408-rows.md` |
| A407-A408 | 26 Nov ~14:4x (typed) | Claude Ship research (answered: https://claude.ai/artifact/8PFa7NuAECtvcAG9iaPJWt) and two more standbys (done) | rows word for word in `history/STATE-2026-11-26-1530-lead4-A407-A408-rows.md` |
| A414 | 26 Nov 17:1x (typed) | product repo stays public; only the factory moves out (local or a Lead repo); industry-standard mechanism only, no force-fit; words in A412 history file | APPROVED by the founder 23:1x IST 26 Nov, all three recommendations (P-845, records PR #3873); #3851 marked ready for review; step 0 (Mac runner) is his click next |
| A409, A411-A413 | 26 Nov | answered or in force; rows word for word in `history/STATE-2026-11-26-2235-lead5-A409-A413-rows.md` |
| A406 | 26 Nov ~14:3x | first-principles forecasts (in force, Start here); row in `history/STATE-2026-11-26-1530-lead4-A407-A408-rows.md` |
| A399-A400 | 26 Nov ~12:0x-12:2x | standing approvals; watchers inside the pipeline | in force; rows word for word in `history/STATE-2026-11-26-1530-lead4-A407-A408-rows.md` |

## Start here (next Lead)
📈 **A406 (guideline): every forecast starts from first principles: a part is ~3-4 h with no waits, a row 4-6 h with parts side by side, capacity 12 builder + 3 qa lanes; subtract the waits measured this check (Approve→label, label→batch, merge→proof) and name the wait that costs the most rows. Never forecast from good or bad days alone.**
🔁 **A404 (in force): the standing account-switch strategy is the top block of `RESUME-ON-NEW-ACCOUNT.md`: proof first in the last ~35%, lanes hand over on PRs, ≤12 lanes ranked by nearness to Works on the new account, same control room page.**
🧭 **A401 (in force): every check does the manual step of each P1 OS item (`design/os-manual-enforcement-2026-11-26.md`: OS-01 green pr-suites before a label, OS-11 tools from main, OS-02 reads ≤30 min, OS-05 covered line, OS-78a one comment batch per PR) and refreshes the control room v3 sections in their order; the Lead scorecard is repeated in every full report.**
🧭 **A386 (founder, 25 Nov, in force): the v4 plan on the control-room page is THE plan.** Every Lead follows it, ticks it, and hands it on in order. Build in order: what a later step needs lands first (pipeline P-827, then the nearest Partials P-820); no rework and no waste. Tokens are never a limit: the founder switches accounts at 95-96%; the Lead pushes STATE and RESUME by 94%.
✅ **Night objective (A332, A334, A339): product first; operating system whenever the queue has room. Each check, in order:** 1 red main, qa Blocker · 2 lanes idle or asking, answer and wake ALL (type in the session) · 3 full runs: re-run the one red part, cover, label · 4 queue never empty · 5 operating system, n of 4 (alarm, parts list, #3035, packed suites) · 6 save STATE.
**P-788 (founder, 12:0x IST 22 Nov): everything on Opus 5.5 medium; any other model or higher effort only when needed, named to him with reason and place when used, never silently. After every cloud start read the model label in claude.ai/code and fix it; each check lists sessions not on Opus 5.5 medium.**
📋 **Founder report, fixed order (A260, A262, A263), in force:** word for word in `history/STATE-2026-11-26-1500-lead3-leads-report-owed-lines.md`.
🧭🖥️ **P-783 (full report at :03/:33) and A242 (manage lanes by API and in claude.ai, "Show more" until gone, type next steps, confirm the bubble), in force:** word for word in `history/STATE-2026-11-25-1000-lead4-A244-timeline-line.md`.
Older Start here pointers and the red-row lanes line: `history/STATE-2026-11-24-lead14-before-handover.md`.
🗓️ **A244 (in force):** every status report carries the 07→07 capability timeline: word for word in `history/STATE-2026-11-25-1000-lead4-A244-timeline-line.md`.
🐕🟥 **Still in force:** missed-checks order (create the check FIRST; run lead-watch inline in long founder turns) and P-757/P-758 (merge a check-only fix in the browser at the first check that sees it): word for word in `product/history/STATE-2026-11-21-1335-lead14s3-start-here-P757-and-missed-checks.md`.
🌊🟩 **Still in force:** Wave 1 then 2 only (`waves.py allow` before every start) and P-752 (a refused label, ready or reopen is done in the browser after the Lead's read): word for word in `product/history/STATE-2026-11-21-1335-lead14s3-start-here-P757-and-missed-checks.md`.
🟥 **One action list (A164): `design/full-power-plan-2026-11-17.md`** (223 items from every set-up page after two independent reviews, buckets A-E; P-690) is the master for the move and the operating model; every Lead works it in order and ticks items there; nothing leaves it unless done or the founder drops it.
🟥 **Hard rule P-557 (AGENTS.md rule 10): always committed, always resumable**: push at every step; this page says what is true, in flight and next, updated with every change of state. **Private home (P-678): github.com/expat-ready/private**; `tools/private-sync.sh` pushes every session's side notes there; run it at each check. Owed: the founder's Time Machine or iCloud for sources/, code/, archive/ (1.3 GB); daily public mirror refresh; P-677 business plan and §5c private copies.
**Roles (P-384):** the founder gives product direction only; the Lead owns the pipeline. Every label needs a PR comment line `Reviewer: Approve <head sha>` (label guard). Records-only PRs: the Lead labels after reading the diff (P-385); `records` queue. GitHub: curl + `gh auth token` with `allowed_domains` (P-363). Times only from `TZ=Asia/Kolkata date`. Notes: `~/Library/Application Support/Claude/side-session-notes/lead10-saved-2026-11-05/` (never a folder named for a session); Lead 26's are in `history/lead-notes-2026-11-07/`.
**Context check every check (P-565 (2)):** `get_usage` on every running Mac session; 45% of the 1M window → tell it to write its hand-over; 50% → replace it; the Lead hands over at 200k beyond its start read (P-446). Full line word for word: `history/STATE-2026-11-14-1550-lead45s2-founder-asks-A59-and-context-check.md`.
**Never run guard/test suites in the main copy** (7 Nov 09:18 incident): scratch clone only, deleted after.

## Leads, in order
**Leads:** account of 24 Nov: Lead 1-11; account of 26 Nov: Lead 1 (local_90e2d17d), Lead 2 (local_43b637a0), Lead 3 (local_adad5033, 14:36 IST), Lead 4 (local_b2e5d43a, 15:10 IST), Lead 5 (local_1c8b2ecd, 17:2x IST, current). Standby: Lead 6 (local_33c127af). Full line, word for word: `history/STATE-2026-11-26-1500-lead3-leads-report-owed-lines.md`.
