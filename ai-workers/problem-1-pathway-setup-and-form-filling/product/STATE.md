# State — one page (rewritten by the tech lead, P-188; the history is git)

current_lead: local_baa78a6d-3861-4074-bd82-955fc67e247e Lead 77 · 17 Nov 13:01 IST (series 2; took over from Lead 76 (series 2, local_f6824017) at ~480k, P-446)

updated: 2026-11-17 13:0x IST by **Lead 77 (series 2, local_baa78a6d)** at take-over (check cron ba599624, :07 and :37; #2077 shards still queued for machines, pr-rules green; #2030 read and queued) · before that Lead 76 at hand-over (ran 11:10-13:01; cron a4d44989 deleted) · 5-hour 80%, weekly 8% at 12:59 · milestone: Release 1 proven 11 of 101 (07:42) · rules: **`RULES.md`** (as of **P-682**) · this branch: `lead/2026-11-07-lead31`




Pointer and 10:2x founder lines: `history/STATE-2026-11-17-1208-lead76s2-pointer-lines.md`.

## Hand-over: Lead 76 → Lead 77, 13:01 IST 17 Nov — read this first (Lead 75's block and Lead 76's check lines word for word: `history/STATE-2026-11-17-1301-lead76s2-lead75-handover-and-lead76-lines.md`)
Standbys: **Lead 78 (local_68613e56)**, **Lead 79 (local_25aa8878)** (started by Lead 77, 13:1x). qa after-merge local_bb3bf1ad. 5-hour bar 80% at 12:59 (resets 13:50): over 90% before then, slow lanes (P-669). Lead 76 handed over at ~480k context (P-446).
1. **Unblocker now: #2077** (`check_css1_index.ts` drops CS-S1's own-PR diff assertion; it fails every api/src PR and every batch holding one, so nothing merged for 85 min at 12:59). Approved 91719a6; shards wait for machines. **Merge it by hand ahead of the queue the moment ci is green (P-214)**, then re-run the red shard alone on #2000, #2003, #2011, #2029, #2062, #1918, #1959 (all told: no pushes). Then label each whose Approve and Lead read match its head (#2003 read fda3249; #2011 read 7a03350; #2062 read 3f7113b; #2000 migration read OK but needs main merged and a diff re-review first).
2. **Label on green, already read and approved:** #2073 (verdicts queue, P-664), #2075 (T7 settings; the founder typed "approve #2075"), #2079 (CK-1 part 1; the founder pressed Ready), #2038, #2062. Then #2080 and #2081 (stacked CK PRs): the **founder presses Ready** (the T7 deny blocks the agents' ready mutation); #2081's workflow read is posted; after #2081 merges, dispatch its first run. #2064: re-run pr-rules after records #2071 merges (P-654 lives there).
3. **Records:** #2071 queued. Everything since (P-656 to P-682, the five Library masters, the change log 1.1, `tools/private-sync.sh`, official-sources/manitoba) is on this branch only: open the next records PR to main (it now carries `product/tools/private-sync.sh`, so it is not records-only; read it as a tooling PR).
4. **Org move Wed 18 Nov 09:30 IST** (P-660, checklist `design/org-move-checklist-2026-11-17.md`): yours P8 (settings inventory when REST ≥ 1,000 left), P10-P13, backup-mirror refresh before the freeze; the founder does the transfer, the main ruleset and three screenshots. Mergify plan at C1 and the Merge Queue setting after the transfer (P-662).
5. **Side sessions:** founder-setup (local_c3e4ea74) does the founder's cards and Library; enforcement-checks (local_f3778712) CK PRs; board keeper (local_d01fe726) after #2030: stuck-label, lean-reads, then the five Library rows and the two CK board lines; repo-cleanup (local_7f47aef5) waits for your go after the verified move (P-674 to P-677, P-682; stage 2a first). Build Leads A (local_1520b573) and C (local_d5287293) send open-PR lists by 19:30/20:00. P-663 admission tripped (queue P95 239 min): no new capability rows.
6. **Habits that bit today:** times only from `TZ=Asia/Kolkata date` (P-672 correction); run `tools/private-sync.sh` each check (P-678); every pipeline change gets a row in `library/engineering-change-log.md` (A154); the T7 deny lines stop agents from GraphQL mutations (draft toggle).

## Founder asks (Lead 8, 10 Nov; P-450 (4): stays until ticked)
| # | Ask (IST) | Status |
|---|---|---|
| S10-A136 | 10 Nov to 17 Nov 00:2x asks | done, answered, standing or superseded (A130 stall research still owed); the pointer rows word for word in `history/STATE-2026-11-17-0858-lead74s2-asks-pointer-rows-S10-A136.md` |

| A137-A141, A149 | 17 Nov asks (more speed, CI gaps, full list, talk audit, best-in-class pipeline; model and effort research) | rows word for word in `history/STATE-2026-11-17-1255-lead76s2-nightly-and-asks-A137-A149.md` (nightly 17 Nov read there too: #2054 fixes BR-6) |
| A142-A153 | 17 Nov 08:5x-10:2x asks (baseline before the reset; talks; Library master; engineering system; failure modes; founder setup agent; board calls; clean-up and one master list) | in progress or done as recorded; rows word for word in `history/STATE-2026-11-17-1210-lead76s2-asks-A142-A153-rows.md` |
| A155-A157 | clean-up agent, code minimalism, progress picture (answered; P-674 to P-682) | rows word for word in `history/STATE-2026-11-17-1255-lead76s2-asks-A155-A157-rows.md` |
| A154, A158 | change log of every pipeline change (A154, standing: a row per change in `library/engineering-change-log.md`); #2079 Ready, Manitoba source read (A158, done) | rows word for word in `history/STATE-2026-11-17-1325-lead77s2-asks-A154-A158-rows.md` |
| A160 | ~13:1x IST 17 Nov (spoken, Remote Control): the plan for enforcing the whole operating model and CI strategy, plus the clean-up, enforcement checks, founder setup and engineering system work; a business-level visual of how they come, who keeps track so nothing is dropped silently, in what order, when, why that order, the most efficient order; always give clickable links | Lead 77: inventory agent reading the Library, org-move checklist, clean-up plan and P-656..P-683; page published https://claude.ai/artifact/EYh8cn1M8rTc3Wba3Pp1dP; tracker table below added |
| A159 | ~13:0x IST 17 Nov (typed, Remote Control): away 4-5 h; "feel free to create more standby builders, QA, proving GitHub machines, test machines, whatever ... Any approvals"; is the operating model and hooks enforcement working now? | Lead 77: second standby **Lead 79 (local_25aa8878)** and **qa after-merge (local_bb3bf1ad)** started 13:1x; no new builders (P-663 admission tripped: 70 runs queued, 6 running; machines are the limit until the org move 18 Nov); no machine purchase (P-551, the move is the capacity fix); **#2080 and #2081 marked ready by the founder, checked 13:11** (P-683 held part closed); enforcement status answered (CK-1/CK-2 PRs #2079-#2081 and #2073/#2075 not merged yet, so conformance shows enforced: no) |

## Engineering set-up tracker (A160, Lead 77, 13:2x IST 17 Nov; page https://claude.ai/artifact/EYh8cn1M8rTc3Wba3Pp1dP; every Lead updates it at each check, a row leaves only when done or the founder drops it)
| Workstream | Owner | Next step | Expected (IST) |
|---|---|---|---|
| Unblock merges #2077 | Lead | merge by hand on green (P-214); re-run 7 held PRs | 17 Nov, when machines free |
| Enforcement checks #2073, #2075, #2079 → #2080 → #2081 | enforcement-checks (local_f3778712); Lead labels | one at a time on green; first heartbeat run; follow-up PR (3 Minors) after #2081 | CK-1 ~16:00-17:30 17 Nov; CK-2/CK-3 tonight or early 18 Nov |
| Library masters on main + board rows | Lead; board keeper (local_d01fe726) | records PR to main (carries private-sync.sh, tooling read); fix name "Engineering System v1" vs "Engineering system" | 17 Nov night; board rows 18 Nov |
| GitHub move to Enterprise org | founder clicks; Lead prepares | fix the checklist text (still says Team, 60 jobs); P8 inventory (REST ≥ 1,000), P9-P13, mirror refresh, drain; 09:30 freeze, Transfer, verify, Mergify setting | 18 Nov 09:30 |
| Repository clean-up | repo-cleanup (local_7f47aef5); Lead's go | stage 0-1 after the verified move; 2a spend-guard root first, 2b-6 from 19 Nov (P-674) | 18-24 Nov |
| Founder set-up items | founder-setup (local_c3e4ea74); founder | support message, P8 screenshots, Time Machine/iCloud; later SHA-pinning and CodeQL cards | as convenient; move-day clicks 18 Nov |
| Backups / private home | Lead | `tools/private-sync.sh` each check; mirror refresh before the freeze; P-677 copies | each check |
| Decided, waiting (T9, T11, T12, T14, W1, W3, W4 budget yes, W5, rules v2, day-5 re-measure, enforcement-plan §7 four questions) | Lead | after the move and the checks | from ~19-22 Nov |
| Item queue `state/items.json` stale since 16 Nov 23:42 | Lead | clear or close the old qa items at the next check | 17 Nov |

## Start here (next Lead)
Earlier pointer lines (Lead 60 evening, Lead 61 decide and night, Lead 63 owed (still open: #1865 hooks read, records PR to main, PF-12/FO-7b reads, LegalHoldPort before PF-21b part 1, nightly BR-6 read), morning questions): word for word in `history/STATE-2026-11-16-2217-lead70s2-start-here-pointer-lines.md`.
🟥 **Hard rule P-557 (AGENTS.md rule 10): always committed, always resumable**: push at every step; this page says what is true, in flight and next, updated with every change of state. **Private home (P-678): github.com/expat-ready/private**; `tools/private-sync.sh` pushes every session's side notes there; run it at each check. Owed: the founder's Time Machine or iCloud for sources/, code/, archive/ (1.3 GB); daily public mirror refresh; P-677 business plan and §5c private copies.
**Roles (P-384):** the founder gives product direction only; the Lead owns the pipeline. Every label needs a PR comment line `Reviewer: Approve <head sha>` (label guard). Records-only PRs: the Lead labels after reading the diff (P-385); `records` queue. GitHub: curl + `gh auth token` with `allowed_domains` (P-363). Times only from `TZ=Asia/Kolkata date`. Notes: `~/Library/Application Support/Claude/side-session-notes/lead10-saved-2026-11-05/` (never a folder named for a session); Lead 26's are in `history/lead-notes-2026-11-07/`.
**Context check every check (P-565 (2)):** `get_usage` on every running Mac session; 45% of the 1M window → tell it to write its hand-over; 50% → replace it; the Lead hands over at 200k beyond its start read (P-446). Full line word for word: `history/STATE-2026-11-14-1550-lead45s2-founder-asks-A59-and-context-check.md`.
**Stall guard (P-388, P-389):** no prompt-waiting call while the founder is away; `lead-watch.sh` ACT when the last check is over 40 min old. Watchdog: first standby (Lead 34 once Lead 33 tells it).
**Hand-over (P-409):** no hand-over with an in-process subagent running; its result goes to a file named in the hand-over block; briefs say report to the current Lead. Skill edit at the founder's next typed turn.
**Never run guard/test suites in the main copy** (7 Nov 09:18 incident): scratch clone only, deleted after.
Older pointers (For the founder F2-F19, Lead 11 to-do): `history/STATE-2026-11-16-2234-lead70s2-for-founder-and-todo-lines.md`.

## Leads, in order
**Series 2 (P-433):** current = `current_lead:`; the Leads-in-order line word for word in `history/STATE-2026-11-16-2052-lead69s2-check-notes-asks-A121-A122-leads-line.md`; since then: Lead 68 (local_adb435f1) → Lead 69 (local_28bf6046) → Lead 70 (local_9ae95739) → Lead 71 (local_0c9cccec) → Lead 72 (local_af927c49) → Lead 73 (local_9b98cea4) → Lead 74 (local_fa783599) → Lead 75 (local_c9752f73) → Lead 76 (local_f6824017) → **Lead 77 (local_baa78a6d)**, standby Lead 78 (local_68613e56); a second standby owed at the founder's next typed turn.
**Series 1: Leads 1 to 41, before 9 Nov 17:48 IST**, never renamed or renumbered: the full list, word for word, is in `history/STATE-2026-11-09-2130-lead2s2.md` ("Leads, in order").
