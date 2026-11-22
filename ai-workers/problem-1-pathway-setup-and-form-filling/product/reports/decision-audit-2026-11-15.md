# Decision and ask audit, 15 Nov 2026 (as of 14:02 IST)

Scope: every DECISIONS row P-540 to P-612 (read word for word on branch `lead/2026-11-07-lead31`, head 012b4f00a), the STATE "Founder asks" table and its 14-15 Nov history files, and the founder's own typed or spoken turns from 14 Nov 14:00 IST to 15 Nov 13:52 IST (prompt log `~/.claude/projects/-Users-ranjansingh-Desktop-Xpatready/prompt-log/2026-11-1[45].jsonl`, 101 distinct entries; session-to-session messages, subagent reports, check prompts and standby briefs left out). Evidence checked against `origin/main` (d52b7274e, 15 Nov 13:48 IST), the lead branch, the GitHub API and files on disk. A Lead's "done" note was not taken as evidence. Read-only audit; nothing committed.

Status words: **Done** (artifact found), **Partly** (what is missing named), **Not done**, **Superseded** (by which row), **Standing** (a rule; "enforced" means a hook, script or CI check makes it happen, "written" means only text).

## (a) Major asks, in plain words

| # | The founder's ask | Status | Evidence, one line |
|---|---|---|---|
| 1 | All 101 capabilities together by 29 Nov (P-609) | Partly | Date set in `cockpit/plan.json` H1 = 2026-11-29; pace is behind: 7 built, 6 proven by qa, against ~6.8 a day needed (`MVP-CHECKLIST.md` counts; RESUME line 8) |
| 2 | 10 capabilities in 10 hours (A68, 15 Nov 07:45) | Not done | 4 built at 14 Nov 19:43 → 7 built at 15 Nov 13:4x; app PRs merged per day: 19 (14 Nov), 18 (15 Nov) |
| 3 | About 13 merged changes a day (RESUME pace line) | Done as merges, not as capabilities | 23 and 25 PRs merged on 14 and 15 Nov (API), but capabilities finish slowly (parts land without their join, P-606) |
| 4 | 30 capabilities in 24 hours, many more lanes (A86, 13:52) | Not done (in progress) | Only 4 product PRs open (#1758, #1808, #1809, #1810); no lane plan for 30 yet |
| 5 | Nothing gets lost: enforced, not remembered (P-611) | Partly | G-1/G-2 queue and scripted hand-over sit on branch `tools/g1-g2-needs-lead-queue`, 4 commits not merged; G-3, G-4 not started |
| 6 | Claude Code best practice: rules enforced by CLAUDE.md, agents, skills, hooks, session messages (A85) | Partly | Hooks exist (session-start, merge-guard, lane-preflight, lead-check-guard, stop-check, prompt-log in `.claude/settings.json`); research `design/governance-research-2026-11-15.md`; most Lead rules still text only |
| 7 | Weekly "what's new" check with a box on the board (P-611 (3)) | Partly | First check written (`cockpit/whats-new.json` on `board/v62-whats-new`, 13:02 IST), not merged, board v62 not published; no Monday schedule in `lead-watch` |
| 8 | Model and effort at every start (P-608) | Standing, written | RULES line 74, `lead` skill line 52; `lane-preflight.sh` does not check effort |
| 9 | Keep PRs under 800 lines; narrowest fix (P-610) | Standing, written | RULES line 70; no size check; open #1758 is 2,598 lines, #1809 957 lines |
| 10 | Board numbers never mislead (A62, P-596 (2)) | Partly | Schema, 70 tests, reconcile, CI `cockpit-tests.yml` on main; live banner "numbers disagree" still unresolved (RESUME) |
| 11 | Board: ⓘ icons on every page, Needs you = his items only, every red item worked (A84) | Partly | v61 live with ⓘ icons; the red "numbers disagree" item and the 2 stale Library documents are still open |
| 12 | Board: org view, pace, early estimate, delivery per token (A61, A67, A77, A78) | Done | v57 Team view merged; early estimate band and `pace.delivery_24h` in `tools/cockpit-data.py` |
| 13 | Library documents kept current, cheaply (A83, "Yes, refresh both" 11:07) | Partly | `tools/library-freshness.py` built; the two documents behind (checklist, contracts) still not refreshed |
| 14 | Requirements traced per capability (P-595, A69, A70) | Partly | TR-1 #1750 merged, `trace-requirements.py` on main, `next` skill line 16; no CI check fails a shaped row with no `Source:` |
| 15 | Finish whole, contracts enforced (P-606) | Partly | Skill lines on main, contract guard PF-0c #1797 merged, nightly #1788 merged; no front-office screen built yet (item 9) |
| 16 | Gap scan of what top companies run that we miss (A65) | Not done (lost) | Desk 05's top-5 gap page (no real customer in the loop, nothing deployed, no human code read, no threat model, no buyer security proof) was put to him, then the desk was archived (P-604 (2)); no decision recorded |
| 17 | Always committed, always resumable (P-557) | Partly | AGENTS rule 10; switch done with nothing lost; STATE still lists private folders not on GitHub; P-609 to P-612 and the G rows are not on `main` yet |
| 18 | Security settings and private copy (P-583, P-589, P-590) | Partly | Two rulesets active, secret scanning and push protection on, SECURITY.md on main; Actions not SHA-pinned; backup repo not refreshed since 14 Nov 12:03 IST; CI-minute cuts (B190) not merged |
| 19 | Vendor accounts started by the Lead with him watching (P-580) | Not done | No AWS, Stripe, BoldSign or Meta account started; deploy rows wait on AWS (`MVP-CHECKLIST.md` row 1) |
| 20 | Audit every decision and his asks (A86 (1)) | Done by this file | This report |

## (b) Missed or lost, most important first

1. **A65 gap scan lost.** Desk 05's top-5 gaps (no design-partner firm, nothing deployed to the cloud, no human read of the code, no threat model, no buyer security proof) reached him as one question, then the desk was archived on 15 Nov (P-604 (2)). No DECISIONS row, no BACKLOG row, no STATE line. Track file: side-session notes `local_b5840dd3…/strategy-desk-05-track-2026-11-14.md`, step 5.
2. **Release 1 pace is off the 29 Nov line, and no 30-in-24 h plan exists.** 7 built and 6 proven, against about 95 left in 14 days. 4 product PRs are open. The 17 Nov day-3 check (P-609 (4)) is the only gate.
3. **P-611 enforcement is not live.** G-1 (one queue with acknowledgement and timeout) and G-2 (hand-over that refuses while an item is un-acknowledged) are unmerged on `tools/g1-g2-needs-lead-queue`. G-3 (rule register with an enforcer column) and G-4 (top-5 prose rules made mechanical) are not started. So "nothing gets lost" still depends on memory.
4. **Founder-owned items are hidden.** STATE says "Waiting on the founder: nothing", but these wait on him: the AWS account (P-571, P-580, P-607 (2) Route 53), the BoldSign sandbox key (P-563 FO-6v), Stripe and Meta accounts (P-580), counsel and the security test on Monday 16 Nov (P-551, P-558 (5)), named people for on-call and breach (P-551), the cold-walk time (P-542), the saved portal screens (P-544), the log-retention click (P-546), and the settings P-611 recommends (`denyInsteadOfPrompting`, `blockWritesOutsideWorkingDirectories`, `Skill(lead-watch)` allow). None of these is on the board's Needs you.
5. **Vendor accounts with review clocks never started (P-580).** AWS SES production access and the Google mail review have outside waiting times. P-580 said they start first. Nothing is started, and deploy (map row 1) waits on AWS.
6. **28 Dependabot alerts (9 high) are untracked.** GitHub printed them on the founder's push at 07:48 IST. No BACKLOG row, no STATE line, no owner. `dependabot_security_updates` is disabled (API).
7. **The Bake's walk 2 stalled (P-542).** The BK-20 Adobe re-run, qa's walk 2 and the co-founder's cold walk are not done since 14 Nov, and STATE "Start here" names no owner. BK-383 #1810 (Critical) has conflicts with main.
8. **The weekly what's-new check has no schedule.** One check is done (13:02 IST), but `lead-watch` has no Monday line and board v62 is unpublished.
9. **PR size rule (P-610) is text only.** #1758 FO-7a is 2,598 lines (split by rev 16.14, still one PR) and #1809 is 957 lines. Nothing checks size.
10. **Model and effort (P-608) is not enforced.** The `start_session` hook (`lane-preflight.sh`) does not check effort. The founder caught Leads started at high on 15 Nov 10:24.
11. **"Do every step yourself; never cite Remote Control" (founder 09:09-09:11 IST)** is only in a STATE history row (A71) and in local memory. It is not in RULES or DECISIONS.
12. **A value typed into chat (15 Nov 08:24 IST).** He asked that it be deleted from chat history. It stays in the prompt log (`prompt-log/2026-11-15.jsonl`) and in session transcripts, and no record shows it was handled. His follow-up ("check if everything is done from password side", 08:26) has no recorded answer.
13. **"Yes, refresh both" (11:07 IST, library) not carried out.** RESUME still lists the checklist and contracts as behind.
14. **P-598's own IMM 5707 row is missing.** The LMIA and Visitor visa need the IMM 5707 mapping at their next release, and no BACKLOG row was found (only B62/B69-B71).
15. **P-604 (1)'s Fable check of TR-1's `--gaps` output was not run**, so no order of work came from it. No CI check fails a shaped row with no `Source:` (P-595 (1)).
16. **Backup copy is not refreshed daily (P-589 (1), P-590 (2)).** `xpatready-backup` is private, last pushed 14 Nov 12:03 IST. `tools/backup-refresh.sh` is on main but not on the lead branch.
17. **B190 CI-minute cuts stopped (P-589 (2)).** The report merged 13 Nov, the lane was archived 15 Nov, and no cut is merged. P-590's private switch depends on it.
18. **P-583 steps 8-9 (SHA pinning, require pinning) not done.** Every workflow uses `@v4`/`@v5` tags; `sha_pinning_required: false`.
19. **Records off `main`.** P-609 to P-612, RULES lines 70-71 and BACKLOG G-1 to G-5 / rev 16.9-16.16 are only on the lead branch. Builders on main do not see P-610's 800-line rule.
20. **The 16 Dec date question (13:23) has no recorded answer.** He asked why the board shows 16 December and how much is expected by then.
21. **P-606 (9) front-office screens first: none built.** Every merged FO PR (FO-1a, FO-1b, FO-3, FO-3f, FO-3h, FO-5, FO-5f, FO-13) is API or runtime.
22. **P-547's `documents` skill was never built.** The Library (P-593) covers the register, and 3 of the 14 retired pages still wait for export.
23. Minor: disk at 92% (18 GiB free); RULES line 44 still says the integration "pauses" though P-569 stopped it.

## (c) Full table

Dates are 2026, in IST. "Words" quotes the founder where the row has his words, otherwise the decision in short.

### Decisions P-540 to P-612

| Id | Date | Words / gist (≤20 words) | Status | Evidence |
|---|---|---|---|---|
| P-612 | 15 Nov 13:08 | "Yes, keep the check": signing as representative needs a licence record | Partly | PF-6b #1808 open (blocked, 627+ lines); row not on main's DECISIONS |
| P-611 | 15 Nov 12:5x | "so that nothing get lost ... or nothing get halted"; weekly what's-new box | Partly | Research file and BACKLOG G-1..G-5 (l.249-253); G-1/G-2 and G-5 branches unmerged; G-3/G-4 not started; no Monday schedule; settings not put to him |
| P-610 | 15 Nov 11:0x | "touch only the parts, run only the parts which are dependent"; PRs under 800 lines | Standing, written | RULES l.70; no size check; #1758 2,598 lines, #1809 957 lines |
| P-609 | 15 Nov 10:3x | "deliver everything 101 together ... take 15 days instead of 10" | Partly | plan.json H1 2026-11-29; pace 7 built against ~6.8 a day needed; 17 Nov check pending |
| P-608 | 15 Nov 10:2x | "Fable medium and Opus 5.5 medium ... check where high is required" | Standing, written | RULES l.74; lead skill l.52; lane-preflight hook has no effort check |
| P-607 | 15 Nov 09:35 | Nine specifying answers (trust never negative, Route 53, fail-closed audit, LMIA last…) | Done | BACKLOG has AUD-1b, AUD-3b, AS-2c, AS-2d1, CS-98*, FO-7v, FO-7s1, PF-F4; Route 53 move is the founder's, pending |
| P-606 | 15 Nov 09:33 | "take a informed decision ... and do it": finish whole, contracts enforced | Partly | (2)-(4) next l.17, qa l.29 on main; (7) #1788; (8) PF-0c #1797; (5) join-and-walk rows; (1) constraint line exists, not named "merged to proven"; (9) no FO screen built |
| P-605 | 15 Nov 09:1x | "I leave ultimate decision on you": Opus 5.5 working model, effort split | Superseded | By P-608 (effort for Leads and standbys); (1)(3)(4) carried in P-608 |
| P-604 | 15 Nov 09:0x | TR-1 "Yes, both"; desk 05 archived; fast track "Yes, all 4" | Partly | Skill line next l.16 on main; S1-S3 rows copied (MVP-CHECKLIST: Not shaped 0); qa #1792 merged; Fable `--gaps` check not run |
| P-603 | 14 Nov 20:1x | Money leaves trust only by withdrawal to invoice or refund; no round 5 | Partly | FO-7a #1758 still draft, 2,598 lines, split by rev 16.14; restarted task_1ac28ecb |
| P-602 | 14 Nov 19:5x | "Run on, switch in morning"; hold at 12; delete throwaway branches; plan % per row | Partly | Switch done at 93%; branches deleted 15 Nov 07:48 by the founder; `delivery_24h` built; the reviewer's span Blocker fix not verified |
| P-601 | 14 Nov 18:5x | PF-21 complaint keys, events, handler key; College duties Sample | Partly | #1753 merged (part 1 of 2); events in ports/events.ts (c026c684a); College pages not read |
| P-600 | 14 Nov 18:2x | Schema rows in parallel under five conditions | Done | Re-stamps d906da423, 799ae710c; rev 16 in BACKLOG |
| P-599 | 14 Nov 18:1x | "24 Nov (10 days)" | Superseded | Date by P-609; 15-20 cloud lanes never reached |
| P-598 | 14 Nov 17:5x | IMM 5707 shared edition: snapshots byte-identical; its own row later | Partly | BK-25 #1747 merged; IMM 5707 own row for LMIA/Visitor not in BACKLOG |
| P-597 | 14 Nov 16:06 | "Yes, all five (Recommended)": desk rules, Fable 5.2 high | Done | strategy-desk skill has P-597 lines on main (9 matches); (5) copy script waits on the backup |
| P-596 | 14 Nov 15:5x | "Fold it in"; numbers must never mislead | Partly | Schema, tests, reconcile, cockpit-tests.yml on main; live "numbers disagree" banner unresolved |
| P-595 | 14 Nov 15:3x | "Yes, build both": traceability as data, board tabs | Partly | TR-1 #1750 merged; no CI fail on a missing `Source:` |
| P-594 | 14 Nov 15:1x | "I will follow your suggestion": name "Release 1 (production grade)" | Done | Used in RULES and STATE |
| P-593 | 14 Nov 15:1x | One door, Library, 14 pages retired | Partly | Library on the board; 11 retired, 3 wait for export |
| P-592 | 14 Nov 15:1x | "Yes, make it the one": MVP-CHECKLIST the tracking page; qa R1 | Done | MVP-CHECKLIST counts; qa R1 #1748, #1789, #1792 merged; row mismatches 9, 11, 16, 38, 40, 99 open |
| P-591 | 14 Nov 12:5x | "complete production grade ... one cockpit ... standing rules ... fix me up" | Partly | Board live from script; refresh lagged (founder 09:14, 12:47); weekly fresh review due 21 Nov |
| P-590 | 14 Nov 11:3x | "let's go by C option ... full power" | Partly | SECURITY.md and notice on main (#1737); backup exists, not refreshed daily |
| P-589 | 14 Nov 11:1x | "I agree with your backup now cut minutes" | Partly | `xpatready-backup` private, last push 14 Nov 12:03; B190 report only, cuts not merged |
| P-588 | 14 Nov 10:0x | Case-side contract v0 §9 rulings | Done | design/case-side-contract-v0.1-2026-11-14.md |
| P-587 | 14 Nov 09:5x | "please dont use anything that is cheap and not gold class from public repo" | Standing, written | RULES l.56; STANDARDS.md has no six-check / OpenSSF line |
| P-586 | 14 Nov 09:5x | Capability map baseline draft 6: 101 Build | Done | MVP-CHECKLIST cites it |
| P-585 | 14 Nov 09:5x | Lead B owns portal and calendar; case-count port | Done | Rows copied (rev 13) |
| P-584 | 14 Nov 09:4x | Module homes and firm walls | Done | platform-and-front-office-contracts-2026-11-14.md |
| P-583 | 14 Nov 09:4x | "Yes, basically, you can. I will log in": free GitHub safety settings | Partly | API: 2 rulesets active, secret scanning and push protection on, vulnerability reporting on; SHA pinning not done |
| P-582 | 14 Nov 09:3x | "make sure that whatever you are leaving ... it is in the backlog" | Done | BACKLOG l.1036 section X |
| P-581 | 14 Nov 09:3x | "Take recommended set" (ten groups) | Done | In scope; rows shaped |
| P-580 | 14 Nov 09:2x | "You can do four of us on my behalf in front of me" | Not done | No vendor account started; review-clock accounts not first |
| P-579 | 14 Nov 09:2x | "Yes, add all three": conflict, complaints, identity check | Done | Rows shaped; PF-21 part 1 merged; College reads pending |
| P-578 | 14 Nov 09:2x | "Yes, keep them": payment plans, autopay | Done | FO-7p in BACKLOG |
| P-577 | 14 Nov 09:2x | "Yes, two phases": assessment AS-1, AS-2 | Done | AS-1, AS-2 rows |
| P-576 | 14 Nov 09:2x | "critical features coming first ... What give devs speed and quality" | Standing, written | Applied in rev 16 order; no check |
| P-575 | 14 Nov 09:2x | Client money own module; walls at launch; case-side contract | Done | Contract v0.1; CS-W1-W4 rows |
| P-574 | 14 Nov 09:1x | "keep all of these five in ... Except SMS" | Done | Scope; rows shaped |
| P-573 | 14 Nov 09:1x | "Keep all 5 out" | Superseded | By P-574 |
| P-572 | 14 Nov 09:1x | "Keep all 8 out" | Done | Map §0 A |
| P-571 | 14 Nov 09:0x | Demo reset leaves an audit line; audit export AUD-2 | Done | AUD-2 row; PF-4 merged |
| P-570 | 14 Nov 09:0x | Six optional rows are Build; "anything else like above missing" | Done | Map draft 6 |
| P-569 | 14 Nov 08:3x | "let's stop the integration work ... first do this" | Done | No integration lane; baseline P-586 |
| P-568 | 14 Nov 08:3x | Quebec later; LMIA later in month; BoldSign sandbox when needed | Standing | Amended by P-607 (5) |
| P-567 | 14 Nov 08:2x | "Require for all", "Build checklist", "Ledger now, trust card later" | Done | Rows recorded; build pending |
| P-566 | 14 Nov 08:0x | "build everything as the best in class practices": self-serve SaaS sign-up | Done | PF-5 shaped |
| P-565 | 14 Nov 07:5x | Vendor facts from public sources; replace sessions past ~50% context | Standing, written | lead-watch get_usage step; no hook |
| P-564 | 14 Nov | "Yes, on by default": one-time email code before signing | Done | FO-6 rows (3 mentions) |
| P-563 | 14 Nov 07:4x | "Yes, BoldSign" | Partly | FO-6v still needs his sandbox key |
| P-562 | 14 Nov 07:25 | "Think about every thing ... from the perspective of 100 customers" | Standing | Written |
| P-561 | 14 Nov 07:0x | "BoldSign, 4 conditions" | Superseded | Confirmed by P-563 |
| P-560 | 13 Nov 22:31 | Front office follows AG-02 v2.6: `prospect.won` | Done | FO-1 to FO-4 re-shaped |
| P-559 | 13 Nov | Firm tables and multi-firm are ours | Done | PF/FO rows merged with firm tables |
| P-558 | 13 Nov 22:1x | "Start tonight": two tech leads | Partly | Lead B (6) running; (5) his own items not done or tracked |
| P-557 | 13 Nov 22:1x | "always committed ... I should resume the work where it left off" | Partly | AGENTS rule 10; private folders not on GitHub (STATE); P-609-P-612 not on main |
| P-556 | 13 Nov 22:1x | "Every token should be justified in producing the outcome" | Standing, written | RULES token rules |
| P-555 | 13 Nov 22:1x | "I will keep supplying the tokens" | Standing | Written |
| P-554 | 13 Nov 22:0x | "Yes, after Monday": usage bundles | Superseded | By P-555 (cap not the Lead's); purchase is his |
| P-553 | 13 Nov 22:0x | "Enough for month one": own build | Standing | Written |
| P-552 | 13 Nov 21:4x | "Yes, approve cap" US$6,000 | Superseded | By P-555 |
| P-551 | 13 Nov 21:2x | Counsel and security test Monday; named people | Partly | His, due 16 Nov; not on Needs you |
| P-550 | 13 Nov 21:2x | "Yes, 2-3 leads" | Done | Lead B in place |
| P-549 | 13 Nov 21:1x | "Yes, pause integration" | Superseded | By P-558, P-569 |
| P-548 | 13 Nov 18:4x | "Accept all five" F14-F18 | Done | Branches deleted 15 Nov 07:48 |
| P-547 | 13 Nov 15:54 | "Yes, go ahead": document system | Partly | Library = register (P-593); `documents` skill not built |
| P-546 | 13 Nov 16:0x | "Yes, switch Actions on", "Yes, label #1637" | Done | #1637 merged 13 Nov 17:05; log-retention click pending |
| P-545 | 13 Nov 15:3x | Seven cards: clean-up, start read, first module first | Done | Worktrees gone; AGENTS rule 9 |
| P-544 | 13 Nov | SP-2 saved screens are his, not blocking | Standing | Later |
| P-543 | 13 Nov 15:12 | "Yes, once checked" | Done | P-546 |
| P-542 | 13 Nov 15:1x | Pipeline never stops product; Adobe spot-check never blocks | Partly | BK-20 re-run, walk 2 and cold walk not done |
| P-541 | 13 Nov 14:5x | "I don't want to book any immigration expert" | Partly | B191 row (l.980) not built |
| P-540 | 13 Nov 14:5x | "make the Chrome extension as if it is allowed" | Standing | Extension rows from 16 Nov |

### Founder asks A49 to A86 (STATE)

| Id | Date | Words / gist | Status | Evidence |
|---|---|---|---|---|
| A49 | 14 Nov 08:3x | Independent challenge of the map, then baseline; one cockpit; stop integration | Done | P-569, P-586 |
| A50 | 14 Nov 08:4x | Product name; repo and architecture; pipeline checklist | Partly | Repo route by P-589/P-590; name and checklist items not closed in records |
| A51 | 14 Nov 09:2x | Module contracts, owners, parallel scale | Done | P-575, P-584 |
| A52 | 14 Nov 09:5x | Public immigration repositories that help? | Done | P-587 |
| A53 | 14 Nov 10:2x | Private at US$20-30 a month | Partly | P-589: backup stale, B190 cuts not merged |
| A54 | 14 Nov 12:5x | Production grade; one live visual cockpit | Partly | P-591; refresh lags |
| A55 | 14 Nov 12:4x | Cockpit part 2: value stream, architecture "here I am" | Done | cockpit/architecture.json; "you are here" on board |
| A56 | 14 Nov 15:10 | POC vs production tracking | Done | P-592 |
| A57 | 14 Nov 15:15 | Documents in one place (DORA, PRINCE2) | Partly | P-593: 3 pages wait for export |
| A58 | 14 Nov 15:24 | What should he care about; framework | Done | Board version 24 top blocks |
| A59 | 14 Nov 15:31 | PRD or mapping; framework for his role | Partly | P-595: no `Source:` CI check |
| A61 | 14 Nov 15:44 | Org chart, speed, capacity, health, Top 3 | Done | P-596; v57 Team view |
| A62 | 14 Nov 15:48 | Numbers never mislead | Partly | Banner "numbers disagree" open |
| A63 | 14 Nov 15:49 | Keep heat map; show where we work today | Done | "working today" marker in index.html |
| A64 | 14 Nov 15:50 | Use and improve the strategy desk | Done | P-597 |
| A65 | 14 Nov 16:03 | "Is there anything which ... top notch technology companies uses ... which we are missing" | Not done | Gap page asked once; desk archived; no decision |
| A66 | 14 Nov 18:14 | Target, delivery rate, 15-20 a day | Superseded | P-599 → P-609 |
| A67 | 14 Nov 19:43 | Delivery per token; 10 h autonomous plan; push back | Partly | delivery_24h built; overnight plan ran; per-token measure unproven |
| A68 | 15 Nov 07:45 | "Ten hours. I want at least 10 capabilities" | Not done | 4 → 7 built |
| A69 | 15 Nov 07:55 | Board metrics; clean the claude.ai left pane | Partly | v53 lane; 26 sessions archived 08:04; terms ruling |
| A70 | 15 Nov 08:07 | Requirement sections per capability; S/M/L | Done | Sources on 87 rows; TR-1 |
| A71 | 15 Nov 08:54 | Refresh rate; one capability an hour; open questions one at a time | Done | P-604, P-605 |
| A72 | 15 Nov 09:14 | "what takes the maximum time and how to solve it" | Done | Desk 06 → P-606 |
| A73 | 15 Nov 09:24 | "stop guessing throughout this project" | Standing | P-502; stop hook caught a guess (f29df8751) |
| A74 | 15 Nov 09:31 | Are contracts used; why no speed gain | Done | P-606 |
| A75 | 15 Nov 09:35 | Nine specifying questions | Done | P-607 |
| A76 | 15 Nov 10:09 | Raise all 101 to 70-80%; Lead diligence | Done | Answered; P-609 |
| A77 | 15 Nov 10:24 | Proper model and effort; tooltips; Team org view | Done | P-608; v57 merged |
| A78 | 15 Nov 10:35 | Daily view with an estimate | Done | Early estimate band in index.html |
| A79 | 15 Nov 10:43 | "None of those requests I can see implemented" | Done | v57 merged; v59-v61 published |
| A80 | 15 Nov 10:45 | Why review takes an hour | Partly | Measured (25 PRs); 800-line rule text only |
| A81 | 15 Nov 10:45 | Board as source of truth the Lead runs on | Partly | Banner disagree; checks work Health items |
| A82 | 15 Nov 10:47 | Lineage, nothing deleted, one live version | Done | git history; history/ files |
| A83 | 15 Nov 10:54 | Library current, token-efficient | Partly | Two documents still behind |
| A84 | 15 Nov 10:59 | Click-only ⓘ icon; red items solved | Partly | v61 icons live; red items open |
| A85 | 15 Nov 12:56 | Nothing lost; Claude Code best practice; weekly check; hand-over prompt | Partly | RESUME done; G-1/G-2/G-5 unmerged; G-3/G-4 not started |
| A86 | 15 Nov 13:52 | Audit decisions; why only 7; 30 in 24 h; what to care about; his behaviour | Partly | (1) this file; (2)-(8) open |

### Asks from his turns not in STATE or DECISIONS (new ids)

| Id | Date | Words (≤20) | Status | Evidence |
|---|---|---|---|---|
| N1 | 14 Nov 15:35 | "using the appropriate terms which is understood by everyone ... you say lowest on 5.9%" | Partly | A69 words ruling (capability vs row); board reviewer's M3 "built/verified/proven clash" |
| N2 | 14 Nov 15:38 | "what is 101, what is 97? ... very confused" | Done | P-592 (3): two numbers, never mixed |
| N3 | 15 Nov 08:11 | "something which is not there in the requirement ... we should be able to basically block" | Partly | TR-1 conflicts list; no blocking check |
| N4 | 15 Nov 08:14 | "please stop me if I overdo it" (again 13:52: "what I'm doing wrong") | Not done | Part of A86 (6), unanswered |
| N5 | 15 Nov 08:20 | "I can see only one TR1, should I delete that?" | Not done | No record of an answer |
| N6 | 15 Nov 08:25 | Value typed in chat: "you can delete it from chat history"; check password side | Not done | Still in prompt-log/2026-11-15.jsonl and transcripts; no record |
| N7 | 15 Nov 09:09 | "Please always try to do everything yourself until unless it's impossible" | Partly | STATE history A71 and local memory only; not in RULES |
| N8 | 15 Nov 11:07 | "Yes, refresh both" (library documents) | Not done | RESUME: checklist and contracts still behind |
| N9 | 15 Nov 13:23 | "next date is 16 December ... can we do 20-30 build in next 24 hours" | Partly | Switch done, nothing lost; 16 Dec question and 20-30 plan unanswered |
| N10 | 15 Nov 07:48 | (his push output) "28 vulnerabilities ... 9 high" | Not done | No row or owner; Dependabot security updates disabled |
| N11 | 15 Nov 13:05 | "G-1, G-2, G-5 first" | Partly | Branches pushed 13:16-13:17, not merged; v62 not published |

## Counts

| Status | Decisions (73) | STATE asks (37) | New asks (11) | All (121) |
|---|---|---|---|---|
| Done | 30 | 19 | 1 | 50 |
| Partly | 23 | 14 | 5 | 42 |
| Not done | 1 | 2 | 5 | 8 |
| Superseded | 7 | 1 | 0 | 8 |
| Standing | 12 (enforced by a tool: 0 fully; written: 12) | 1 | 0 | 13 |
