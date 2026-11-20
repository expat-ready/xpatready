# Full-power plan: what to club with the org move, and what to keep outside (17 Nov 2026; review 1 committed 15:45 IST; review 2 at 15:53-16:4x IST)

Written 14:25-15:00 IST 17 Nov (clock: `TZ=Asia/Kolkata date`) by a read-only analyst for the tech lead, on the founder's ask A163 (`STATE.md:32`). Nothing was changed, run or labelled. GitHub reads: 46 REST calls (open PRs and their files) at about 14:30 IST.

**Review 1 (15:10-15:45 IST 17 Nov; review 2: it first said 16:30, a time not yet reached at its 15:45 commit, an independent completeness reviewer, P-690):** the sources of the last 76 hours were swept (DECISIONS P-596 to P-690, history 14-17 Nov, Library, design pages, clean-up plan, side notes). 103 items were added (#110-#212, marked "(added in review 1)"), 4 were moved and 21 were fixed. Evidence and sources for every change: `design/full-power-plan-gaps-2026-11-17.md`. The move is now planned for **09:30 IST 18 Nov** (P-689: undrained at 18:30 means wait; nothing had merged since 13:27 at the 15:35 check). Tonight's transfer stays possible only if C1.2 is drained at 18:30, so "tonight" below reads "at the transfer".

**Review 2 (15:53-16:4x IST 17 Nov, a second independent reviewer, P-690 (2)):** every review-1 item and change was checked against its cited file and line (124 quotes matched by script, the rest read by eye; 16 GitHub REST calls). 98 of the 103 added items are confirmed, 4 were wrong in a line number or a status word and are fixed (#111, #116, #139, #201), 1 is marked Unverified (#210). The talk lessons review 1 skipped were read from the three-talk verdict, the talk-2 check and the Library: 11 adopted lessons had no item and are added (#213-#223, marked "(added in review 2)"); 8 items were fixed or merged (#72, #76, #81, #91, #166, #181, #193, the D table's reasons). Evidence: `design/full-power-plan-review2-2026-11-17.md`.

**The answer in six lines** (updated in review 1 and review 2)
1. The move stays **one change you can verify and undo**, now at **09:30 IST 18 Nov** (tonight only if the queue is drained at 18:30, P-689). Nothing that edits the repository's content merges between the transfer and the restart of the merge queue.
2. **Before the transfer (A):** 32 items (the transfer included). N1-N9 and the checklist wording fix are already done. Left: the drain, the unpushed-work sweep, the 08:00 Proven report, two switches and a few one-minute answers from you. About 80 minutes of your clicks in total (A + B), up to about 2 hours if something has to be recreated.
3. **While the queue is off (B):** 15 items: re-pointing (remotes, routines, auto-mode lines), checks E1-E7, and one cheap power move: re-run the red or stale checks of the ~20 approved PRs on 500 machines.
4. **First 24-48 hours (C):** 63 items: merge the approved backlog first, open new work by queue wait, prove the enforcement checks (CK-1 to CK-3), start the daily ramp checkpoint (P-663), take the dated readings, then clean-up stages 0, 2a and 1 (0 of 44 open PRs touched).
5. **Later (D):** 88 items: clean-up stages 2b to 8 from 19 Nov (P-674), the CI changes still without a PR (CI-0a, CI-0b, CI-A, Q2, Q6, Q7, F5, F11-F14), the guards and weekly reviews, the founder's settings, security and outside-account cards, and (review 2) the adopted talk lessons: the lint rules and edit-loop hook, fix-telling messages, performance budgets, the replay-tested factory, graders, a trace store, a read-only outer loop and read-only review tokens.
6. **Dropped (E):** 25 items that were superseded, already done, or duplicates.

Abbreviations for sources (line numbers on the Lead branch `lead/2026-11-07-lead31` at `11cce9de`, unless marked):
**CL** `design/org-move-checklist-enterprise-2026-11-17.md` · **CU** `design/repo-cleanup-plan-2026-11-17.md` on `origin/claude/repo-cleanup-plan-05e345` at `7d3cb7174` (review 1: the branch head is now `d738232e1`; the cited lines still match, §7.3 adds the revised order) · **ML** `design/setup-master-list-2026-11-17.md` · **ES** `library/engineering-system.md` · **OP** `library/engineering-operating-model.md` · **CI** `library/ci-pipeline-strategy.md` · **FM** `library/agent-failure-modes.md` · **LOG** `library/engineering-change-log.md` · **EP** `design/enforcement-plan-2026-11-16.md` · **R1** `design/release1-operating-model-2026-11-16.md` · **DV** `design/claude-code-devops-research-2026-11-16.md` · **ST** `STATE.md` · **DEC** `DECISIONS.md` · **GH** the GitHub reads of 14:30 IST (open PRs and `/pulls/<n>/files`). Review 2 adds: **TV** `SN/local_9ae95739…/lead74-a150-engineering-system/three-talks-verdict.md` (the three-talk verdict, 26 ideas picked) · **TK** `SN/local_9ae95739…/lead74-a142-operating-model/talk-a143.md` (talk 2 checked against official docs).

Owners: **F** the founder · **TL** the tech lead · **SA** the founder setup agent (works with the founder) · **L** a lane (builder, qa, clean-up agent). Times are estimates unless they come from a source.

---

## 1. Inventory (every open action item, one line each)

Status words: Open · Doing · Done · Unverified (no record found either way).

| # | Item (source ID) | Purpose in plain words | Source | Owner | Status | Est. |
|---|---|---|---|---|---|---|
| 1 | N1 enterprise type | Confirm the enterprise uses personal accounts; if managed users, the transfer is impossible (no-go) | CL:171, CL:456 | F (SA) | **Done** (review 1: ST:12 "N1-N9 all GO"; founder-setup's enterprise-n-checks file: "no blocker found"); moved to E | - |
| 2 | N2-N9 enterprise policies | Read Actions, allowed actions, runners, member privileges, 2FA, IP allow list, tokens, enterprise rulesets; nothing may block us | CL:172-194 | F (SA); TL records | **Done**, TL records it (review 1, as #1); moved to E | - |
| 3 | P3a-f org policies | Check the org keeps the defaults (OAuth restrictions, tokens, Actions, fork approval, runner groups, 2FA) | CL:204-217 | F | Unverified | 5 min |
| 4 | P4 billing check | Enterprise shows paid, no Actions block, budget not blocking | CL:222-224 | F | **Done 18 Nov 17:3x (evidence: STATE CI-capacity line, commit f8747f7fb: payment method on file, no budget, Actions on for all orgs, standard hosted runners on)** | 3 min |
| 5 | P5c Mergify plan on the org | Confirm Open Source plan with batches and 3 parallel checks | CL:233-235; DEC:32 (a) | F | **Done 18 Nov 12:4x (evidence: C24; history/STATE-2026-11-18-1250-lead79s2-updated-line-after-move.md: Merge Queue on for xpatready in the expat-ready Mergify org, first batch #2115 of 3 PRs ran)**; the plan name itself is not recorded; earlier: the dashboard did not list the org yet (DEC:32) | 5 min |
| 6 | C1 wording fix for Mergify | C1 asks for "Merge Queue off in the new Mergify org" before the transfer, but that switch exists only after the transfer (DEC:32 (b)); move it to D1 | CL:310 vs DEC:32 | TL | **Done** (review 1: CL:310 now carries "Lead 78 correction", commit `8b154f0dc`); moved to E | - |
| 7 | P7 Lead restart | The Lead session must start after the settings-line edit | CL:246, CL:312; LOG:24 | TL | **Done (evidence: STATE Leads line: Lead 79 started 18:36 17 Nov and Lead 80 12:50 18 Nov, both after the 11:48 17 Nov settings edit, P-670)**; earlier: Lead 78 started 13:56 | 2 min |
| 8 | P8 record to private home | The settings record must sit in the private home before go | CL:261, CL:313; ST:12 | TL | Doing (review 1: the record exists as founder-setup's `p8-settings-record-2026-11-17.md`; the `org-move-p8/` folder does not exist): copy it to the private home with `private-sync.sh` | 5 min |
| 9 | P8 founder screenshots | App installations, Mergify dashboard, Namespace workspace | CL:256-259; ST:23 | F (SA) | **Superseded (evidence: D1 done 12:4x 18 Nov, the founder confirmed all three apps list xpatready and the Lead saw them in the browser; history/STATE-2026-11-18-1250-lead79s2-updated-line-move-checks.md)**; earlier: the P8 record kept text records instead of screenshots | 1 min |
| 10 | P10 mail list | Tell the founder which mails to expect | CL:269 | TL | **Superseded (evidence: C23, the transfer done 12:31 18 Nov)**; no record that the mail list was sent | 2 min |
| 11 | P12 owner inventory rerun | Re-check no tracked file and no local copy names the old path, on the newest main | CL:277 | TL | Open (last run 0 files, DEC:6) | 10 min |
| 12 | Mirror refresh | Refresh `.tools/backup-mirror.git` before the freeze | DEC:34 (3); ST:23, ST:42 | TL | Open | 10 min |
| 13 | A6 backup repository | Choose: move `xpatready-backup` with the main repository (recommended) or set `BACKUP_*` | CL:152-155 | F | Open | 1 min |
| 14 | A8 rollback trigger | Agree: E3, E5 or E8 not green within 90 min of the transfer means roll back | CL:161; ST:12 | F | **Superseded (evidence: E3 and E5 passed 12:3x 18 Nov, history/STATE-2026-11-18-1250-lead79s2-updated-line-after-move.md; the rollback trigger is now P-695: back to the personal account (F3) if the CI limit is not lifted by 10:00 IST 19 Nov)**; earlier: stated in ST:12, the founder's yes not recorded | 1 min |
| 15 | B1 stop new work | No Lead writes, Mac schedules stopped, lanes push and start no row, routines paused | CL:282-287 | TL | **Done 17 Nov 18:3x (evidence: commits e99fa2716, 833772083 "B1 freeze sent"; lifted 12:4x 18 Nov, commit e1c2bbbbe)** | 20 min |
| 16 | B2 queue-gate off | Stops new labels so the queue can drain | CL:288-291 | F | **Done 17 Nov 20:54 (evidence: C20; commit 8444c5634)**; turned back on 12:4x 18 Nov (C20) | 2 min |
| 17 | B3 drain | Two reads 6 min apart: 0 batch branches, 0 `queued`, Actions idle; postpone after 3 h | CL:292-302 | TL | **Done 17 Nov 21:53 (evidence: commits 17aaf25bc, 359c66e1f: drained twice 6 min apart; re-read empty 09:07 and 09:13 18 Nov, commit 1b0523622)**; earlier: GH 3 batch branches, 13 `queued` | 2-3 h |
| 18 | Drain helpers | #2086 by hand on green (P-214); re-run red parts of #2058, #2071, #2085; queued #2073, #2075, #2079, #2027 | ST:19-20 | TL | **Done 17 Nov (evidence: origin/main merges of #2086, #2071, #2079, #2073, #2075, #2027; drain met 21:53, commit 359c66e1f)**; #2058 is not found on main and #2085 is still open (ci red), both carried past the move | 30 min |
| 19 | C1.3 `CI_SHARD_RUNNER` empty | Keep jobs on GitHub's machines through the move | CL:316 | F | **Done 18 Nov 12:30 (evidence: C22; commit a6955f65b)**; `CI_SHARD_RUNNER` stays absent until E12/R5 | 2 min |
| 20 | C1.4 label-guard off | Stop the sweep from removing labels while the association is tested | CL:318 | F | **Done 18 Nov 12:30 (evidence: C21; commit a6955f65b)**; back on 12:4x 18 Nov | 2 min |
| 21 | C1.5 REST and status | REST at least 1,000 left; githubstatus green | CL:319 | TL | **Done 18 Nov 09:1x (evidence: history/STATE-2026-11-18-1240-lead79s2-updated-line-0910-1240-move.md: REST 3,284 left, githubstatus all green)** | 1 min |
| 22 | C1 go / no-go | Every item holds, or fall back to 09:30 18 Nov | CL:306-322; DEC:6 | TL | **Done 18 Nov 12:3x (evidence: commit a6955f65b "go for the transfer"; C23 approval: two empty reads 09:07, 09:13)**; earlier: planned ~18:30 17 Nov, moved by P-692's fallback | 10 min |
| 23 | C2 Transfer | The move itself | CL:323-332 | F | **Done 18 Nov 12:31 (evidence: C23; commit e76b4b84d)** | 5 min |
| 24 | C3/E1 landed | Organization, PUBLIC, ADMIN | CL:333, CL:377 | TL | **Done 18 Nov 12:31 (evidence: C23; commit e76b4b84d: Organization, public, admin)** | 2 min |
| 25 | C4 re-point copies | Main clone remote and backup mirror to the new path | CL:334-340 | TL | **Done 18 Nov 12:3x (evidence: C23; commit e76b4b84d: main copy and backup mirror re-pointed)** | 5 min |
| 26 | C5 backup repository | Transfer it or set the variables (per #13) | CL:341-343 | F | Open | 5 min |
| 27 | D1 apps and Mergify | Apps list `xpatready` within 5 min; Mergify sees events; set Merge Queue **off** for `xpatready` | CL:347-350; DEC:32 (b) | F | **Done 18 Nov 12:4x (evidence: commit b72a6b900; history/STATE-2026-11-18-1250-lead79s2-updated-line-move-checks.md: Claude, Mergify and Namespace list xpatready)**; Merge Queue was found already on, not set off (C24) | 10 min |
| 28 | D2 compare with P8 | Variables, secrets, rulesets, hooks, runner, collaborators; recreate anything missing | CL:351-361 | TL; F recreates | **Done 18 Nov 12:4x (evidence: commit b72a6b900; history/STATE-2026-11-18-1250-lead79s2-updated-line-move-checks.md: REVIEWERS, SHARDS 8, both rulesets, runners xr-mac and xr-mac-light Idle)**; `CI_SHARD_RUNNER` absent on purpose (C22) | 15 min (+0-15 F) |
| 29 | D3 Claude cloud | Routines' repository, the cloud environment, PR-bound sessions | CL:362-366 | TL | Open | 20 min |
| 30 | D5 read-only checks | Resume lead-watch, cockpit, factory-board | CL:368 | TL | **Done 18 Nov 12:3x (evidence: history/STATE-2026-11-18-1240-lead79s2-updated-line-0910-1240-move.md "D5: check cron recreated")** | 5 min |
| 31 | E2-E6 tests | Old path 301, Mac push, Lead writes, lane push, lane PR `ci` | CL:378-382 | TL | **Done 18 Nov 12:3x (evidence: STATE updated line "E1-E6, C4, D1, D2 pass"; commits 0fb1cf806, f991af8f0)** | 30 min |
| 32 | E7 association test | Queue-gate on, one Approve, association MEMBER/OWNER, label-guard on | CL:383 | F + TL | **Doing 18 Nov: queue-gate and label-guard back on 12:4x (C20, C21); the association read waits for the first org merge (batch #2115), none merged by 18:3x (evidence: history/STATE-2026-11-18-1335-lead80s2-handover-item1-org-move.md "Open: ... E9/E7")** | 10 min |
| 33 | Pre-warm the backlog | After E4/E6 pass, re-run the red or stale `ci` parts of the ~20 approved PRs, so each can join when the queue opens (re-run only, never cancel, P-384) | Proposal (inference) from CL:300, ST:31 | TL | **Done 18 Nov 12:4x (evidence: STATE "Plan position (Lead 80, 13:3x)": bucket B done except #29, #121, #122, #123; relabels and main-merge nudges, commit 59baf576c)** | 15 min + CI |
| 34 | Local copy hygiene | Untracked `ids.txt`, `q.txt`, `repos.txt`, `.claude/settings.json.bak-2026-11-17` at the main copy's root: keep out of git | git status at session start | TL | **Done 18 Nov (evidence: STATE "Plan position (Lead 80, 13:3x)"; the four files are still untracked, never committed)** | 2 min |
| 35 | R1 queue on | Switch Merge Queue and Merge Protections on in the new Mergify org | CL:387 | F | **Done 18 Nov 12:4x (evidence: C24: Merge Queue found already on)** | 3 min |
| 36 | E8, E9 | A records PR and a product PR merge through the queue | CL:398-399 | TL | **Doing 18 Nov 18:3x: #2113 (records, E8) and batch #2115 (#2003, #2011, #2014, E9) not merged; CI runs few hosted jobs at once (evidence: STATE; nothing on origin/main since #2008 at 21:46 17 Nov)**; earlier: doing 13:3x 18 Nov | 1-2 h |
| 37 | R3 Lead writes back | Labels, records PRs, hourly and daily records | CL:389 | TL | **Done 13:2x 18 Nov (Lead 80: #2117, #2081, #2000 labelled; records pushed)** | 5 min |
| 38 | R4 + E10 lanes and routines | Un-pause routines, "Run now" one, start fresh lanes on the new path | CL:390, CL:400 | TL | **Doing 18 Nov: lanes resumed (B1 lifted 12:4x, 8 cloud lanes told to merge main); routines' un-pause and "Run now" (E10) left (evidence: commit e1c2bbbbe; history/STATE-2026-11-18-1335-lead80s2-handover-item1-org-move.md "Open: ... E10 routines")** | 30 min |
| 39 | R6 record the move | Records PR with the move; clear the in-flight block | CL:392 | TL | **Doing 18 Nov: the move is recorded on the Lead branch (change log C20-C24, commit 34095926f); the records PR to main is left (evidence: STATE item 3 "records PR to main")** | 15 min |
| 40 | E11 Mac runner | demo-update picked up by `xr-mac-light`, or the founder re-registers it | CL:401 | TL; F if needed | Open | 0-20 min F |
| 41 | E13 backup line | lead-watch reads the backup at the new path | CL:403 | TL | Open | 5 min |
| 42 | E15 first scheduled runs | label-guard, queue-gate, nightly 01:53, xfa-engine 02:11 | CL:405 | TL | Open | 10 min |
| 43 | E16 peak jobs | Peak jobs in progress above 40 on the next busy day | CL:406 | TL | **Doing 18 Nov: first reading failed: 1-3 hosted jobs at once, runner page "31/180"; Support ticket sent 17:5x; P-695 deadline 10:00 IST 19 Nov (evidence: STATE; commits d80292d5d, 977892de1)** | 5 min |
| 44 | Admission reopens | New capability rows again when P95 queue wait < 60 min and batch wait < 15 min; ceiling about 15 lanes after the move | DEC:31 (P-663); ES:250 | TL | Open | each check |
| 45 | Prove capacity | qa lanes by journey group so Built becomes Proven; the daily target is the P-663 ramp, not P-644's 10/10 (review 1; see #137) | OP:383; R1:42; DEC:33 (P-663) | TL | Doing | each check |
| 46 | CK-1 part 2, CK-2 heartbeat | #2080 then #2081 one at a time; CK follow-up PR (3 Minors); #2081 is card T12's heartbeat; the founder already marked both ready (13:11); CK-3 and the first-run checks are #124-#127 (review 1) | ST:20, ST:37; DEC:26 (T12) | TL; L | **Doing 18 Nov: #2080 (CK-1 part 2) merged 17 Nov (origin/main fec10824c); #2081 labelled 13:1x 18 Nov (commit 1633bd28c), not merged; CK follow-up PR not opened (evidence: STATE tracker row)**; earlier: GH both unlabelled | 2 batches |
| 47 | #2086 follow-up | One PR for its six Minors | ST:19; ST:31 | L | Requested (task_b721b218) | 1 PR |
| 48 | Backlog rows P-650, P-653 | decision-impact keeps failing until they exist | ST:19 | TL | Open | 15 min |
| 49 | Library on main + board rows | Masters to main, name fix "Engineering System v1" vs "Engineering system" | ST:38 | TL; board lane | Open (#2085 carries masters, GH) | 1 PR |
| 50 | Stale item queue | `state/items.json` stale since 16 Nov 23:42 | ST:44 | TL | Open | 10 min |
| 51 | Hourly pipeline metrics + one batch-failure definition | Numbers to judge full power (queue wait, batch failures, re-runs) | ML:50 (C7); ES:331; FM:545 (CR-14 step 1; review 1 corrected the line) | TL; L | Open | 1-2 PRs |
| 52 | +24 h / +48 h readings | Keep a change only if its number improved | ML:66 (D6); ES:319-323 | TL | Open (18-19 Nov 09:00) | 20 min each |
| 53 | Unattended proof run | 6-7 h with merges flowing, no stall over 40 min, no red main over 1 h | ML:64 (D4) | TL | Later per ML; natural first chance tonight | overnight |
| 54 | Start-hook output under 1.5 KB | Every session sees the whole start text (today 12,215 characters) | OP:329; ML:55 (C11); ES:329 | L | Unverified | 1 PR |
| 55 | One full check after Approve (CI-B) | Fewer second runs (57% of PR minutes) | DEC:29 (P-665); CI:348 | L | Unverified whether merged | 1 PR |
| 56 | Lead tools follow 301 | Add `-L` so tools never parse a redirect as data | CL:441 (G8) | L | Open | 1 small PR |
| 57 | W3 fail-closed class job | High-risk change classes fail closed; separate queue later | DEC:26 (W3); ES:274 | TL | Decided, waiting | 1 PR |
| 58 | W1 agent identity canary | Each approval attributable; one canary lane after the verified move, 30-min rollback | DEC:26 (W1); ES:272 | F creates account; TL | Decided, waiting | 30 min F |
| 59 | T9 queue tuning | Two batch checks at once instead of three, alone for 24 h | DEC:26 (T9); ES:258 | TL | Decided, waiting | 1 PR |
| 60 | Clean-up stage 0 | Tag, pure-move and stale-path checks, `PATHS-MOVED.md`, one root finder | CU:215 | L (clean-up) | Prepared (review 1: branch `cleanup/stage-0-safety-net` at `e986a1336`; PR only on the Lead's word, CU:374) | ~150 lines |
| 61 | Private copy of `commercial/` | Copy the 20 files to the private home, checked file by file, before stage 1 removes them | DEC:17 (P-677); CU:275 | TL; L | Open | 20 min |
| 62 | Clean-up stage 1 | Remove ~1,000 October files that nothing reads; tag keeps them | CU:216; DEC:18 (P-676) | L | Prepared (review 1: `86802739a`; the branch head `afd4d2e2c` is the held 1b, see #150) | 1 PR |
| 63 | Clean-up stage 2a | Spend guard finds the root by a root finder, not by counting folders; ledger test | CU:217, CU:235; ST:40 | L | Prepared (review 1: `66be54145`; Done-when #149) | <800 lines |
| 64 | Clean-up stage 2b | `p2` and `contracts` become packages; ~150 import lines | CU:217 | L | Open | <800 lines |
| 65 | Clean-up stage 3 | Move the app to `apps/studio` | CU:218 | L | Open | ~2,050 renames |
| 66 | Clean-up stage 4 | Move official sources, requirements, inventories to `reference/` | CU:219 | L | Open | ~230 renames |
| 67 | Clean-up stage 5 | Move the tools to `tools/` with old-path stubs | CU:220 | L | Open | ~155 renames |
| 68 | Clean-up stage 6 | Move the docs to `docs/` | CU:221 | L; TL | Open | ~7,600 renames |
| 69 | Clean-up stage 7 | README, CODEOWNERS, rename to `expat-ready/platform` | CU:222; DEC:19 (P-675) | L; F (rename) | Open | ~200 lines |
| 70 | Clean-up stage 8 | Stop the screenshot growth | CU:223 | L | Open | ~100 lines |
| 71 | Refactor R0-R9 | Fences, folders by module and feature; knip, dependency-cruiser, jscpd report-only first | CU:326-338; DEC:12 (P-682) | L | Open | 3-4 days |
| 72 | Hook paste U1-U5 / #1865 lines | Wire the built guards in settings; precondition F14 or a lead-read-guard exemption (OP:296; review 1, see #170), and both Stop-hook timeouts raised to about 60 s first (OP:194 "Raise the Stop-hook timeout to about 60 s"; talk-1 audit; review 2) | OP:294-300; EP:207; R1:55 | F pastes; TL | Open | 15 min F |
| 73 | Enforcement rollout steps 1-15 | Each guard as its own small PR; the four questions were answered on 16 Nov (P-635, review 1) | EP:208-221, EP:286-290; DEC:60 (P-635) | L; TL | Decided, waiting (ST:43) | 15 PRs |
| 74 | T11 Lead compaction trial | One Lead a day instead of many hand-overs | DEC:26 (T11); ES:260 | TL | Decided, waiting | 1 day |
| 75 | T13 Rules v2 page | About 21 enforced rules plus 12 principles; old rows mapped | DEC:27 (P-667); OP:220-240 | TL | Decided, waiting | 1 day |
| 76 | T14 lint tools (= ML C6) | eslint 9.39.5, typescript-eslint 8.62.1, eslint-plugin-react-hooks 7.1.1; pins fast-check 3.23.2 and playwright 1.64.1; report-only first (DEC:28 P-668, review 2). The rule content is #213, the edit-loop hook #214 | DEC:26 (T14); ES:263; OP:400 | L | Decided, waiting | 1 PR |
| 77 | W4 replay, W5 spec template | Settle models by replay; tests frozen by a separate session | DEC:26 (W4, W5); ES:275-276 | TL; F budget yes | Decided, waiting | 7-14 weekly points |
| 78 | Correction-to-check registry CR-01..CR-16 | Turn the top failure classes into checks, CR-12 first | FM:526-551; ES:336 | TL; L | Open | many PRs |
| 79 | Day-5 CI re-measure; L2 paid overflow | Re-measure CI, then decide paid machines | CI:354, CI:368; ES:284 | TL; F if paid | Open (~22 Nov) | 1 h |
| 80 | Later cards L1, L4-L7, L9 | Auto-fix, dispatcher, work state out of the public repo, Projects, second reviewer, outside heartbeat | ES:283-291 | TL; F | Later | each a card |
| 81 | Master-list rules items B4, B8, C1, C3, C9 rest | Who approves pipeline changes; test ownership; reviewer-only Approve; policy job; conformance (review 2: C5 supply chain merged into #191, C8 mutation tests into #78's CR-03) | ML:29, ML:33, ML:45, ML:47, ML:49, ML:52, ML:53 | F; TL; L | Open | many |
| 82 | CodeQL | Code scanning, deferred to after the move | DEC:23 (P-671) | F (SA) | **Doing 18 Nov: CodeQL "Analyze" jobs run since the move (evidence: STATE CI-capacity line)**; who switched it on and its settings are not recorded; they take scarce CI slots; earlier: Later | 15 min F |
| 83 | A3 backup owner | Second owner or stored recovery codes | CL:136-143; CL:443 (G10) | F | Open | 5 min |
| 84 | A5 Pro | Keep Pro a week past a successful move, then decide | CL:149-151; DEC:36 | F | Doing (kept) | 2 min |
| 85 | R5/E12 Namespace + #2032 | Restore `CI_SHARD_RUNNER` only if overflow is still wanted | CL:391, CL:402, CL:130 | F; TL | Open (GH: #2032 `dequeued`; still open at the 15:36 read; trial end unknown, #123) | 1 card |
| 86 | DevOps gaps 1-5 | Claude reviewer in GitHub, headless checks, output-trimming hook, per-task cost, sandbox review | DV:49-53 | TL; L | Open | days |
| 87 | Old branches | ~1,242 remote-tracking refs in the local clone (900 `claude/`); lead-watch's 30 "no PR" lines | ST:22; `git branch -r` | TL | Open | 1 h |
| 88 | Fresh Lead branch | The Lead branch is 1,944 behind and 1,367 ahead of main; hooks run the branch's scripts | OP:109-115 | TL | Open (option 2 recommended; a new branch first needs #122, the routines read the night queue from this branch) | 1-3 h |
| 89 | Founder-side items | Time Machine or iCloud for 1.3 GB (P-678); AWS later (ML B11); the support contact is not needed (A157, review 1, #209) | DEC:16; DEC:25; ML:36 | F | Open | 10-20 min F |
| 90 | Model and effort into RULES | P-608's update from P-666 | ML:77 (E6); DEC:28 | TL | Open | records PR |
| 91 | Org rulesets / GitHub's own merge queue | Enterprise-level options now open; none added during the move. Review 2 (talk 1, adopted): read the ruleset bypass actors and decide "merge only through the queue" (**decided P-691, 16:01 IST: keep the emergency hand merge for merge-flow fixes, logged**) (TV:259 "reads the bypass actors and adds \"merge only through the queue\""; ES:57). It conflicts with P-214 and P-684 hand merges, so the founder decides | CL:278 (P13); CL:130 (S22) | F; TL | **Done 17 Nov 16:01 (evidence: P-691 "Settles full-power plan item #91": keep the emergency hand merge, logged; commit 92aa27525)**; the ruleset bypass-actor read is not recorded; earlier: not decided | card |
| 92 | P1 Support ticket (also ML B12, ES T2 ticket line) | Higher job limit | CL:199; ML:37; ES:251 | F | **Done 18 Nov 17:5x (evidence: STATE; P-695; commit 977892de1): the Support ticket for the CI job limit was sent, limit not yet lifted**; earlier: not needed | - |
| 93 | Team plan route (ES T2, CI D1 and §13 step 1, OP §9 item 1) | Buy Team, 60 jobs | ES:251; CI:347, CI:365; OP:394 | F | Superseded | - |
| 94 | Move timing cards (ES T3; OP §2 11:00-12:00 window) | Move 18 Nov 09:30 or 17 Nov 11:00 | ES:252; OP:85 (review 1 corrected the line) | F | Superseded | - |
| 95 | Narrow #2032 / unset the variable (CI D3; ES §8 10:30) | Keep long jobs on GitHub's machines | CI:367; ES:327 | TL | Superseded | - |
| 96 | Devin steps (P5d, D4, E14; DV Devin billing) | Connect Devin to the org | CL:236, CL:367, CL:404; DV:69-71 | F | Dropped | - |
| 97 | ML B2 ruleset on main | Required `ci`, no force push, no delete | ML:27; OP:395 | F | Done | - |
| 98 | ML B3 reviewer identity | Separate reviewer account | ML:28 | F | Duplicate | - |
| 99 | ML B5 settings paste (deny part) | Deny lines | ML:30 | F | Done | - |
| 100 | ML B6 / W2 cloud environment | Limited environment | ML:31; ES:273 | F | Done | - |
| 101 | ML B7, ML C6 lint | Lint yes and lint check | ML:32, ML:51 | F | Duplicate | - |
| 102 | ML B9 / T15 plan capacity | Usage and reset | ML:34; ES:264 | F | Done | - |
| 103 | ML B10 which Library; E2-E5, E8 masters; E1 research into the repo | Library home and masters (the weekly re-read and ML's own "Needs you" cells stay: #155, #178) | ML:35, ML:72-79 | TL | Done | - |
| 104 | ML C10, D5, C2, D1 | Rules v2, compaction, queue settings, machines | ML:46, ML:54, ML:61, ML:65 | TL | Duplicates / done | - |
| 105 | "Checklist still says Team, 60 jobs" | Fix the checklist text | ST:23, ST:39 | TL | Done | - |
| 106 | Declined or standing cards: L3, L8, L10, CI D5, D9 | Self-hosted runners, private repo, Build Lead read, ultracode | ES:285, ES:290, ES:292; CI:369, CI:373 | - | Declined or standing | - |
| 107 | Done prep: P2, P3g, P5 installs, P6, P7 edit, P9 block | Org, public membership, apps, REVIEWERS, settings lines, in-flight block | DEC:35, DEC:32, DEC:33 (12, 13); ST:12 | F; SA; TL | Done | - |
| 108 | W6 desk settings | Desk stays Fable high; no Fable for specifying lanes until W4's replay, which changes P-608 (3): a records change folded into #90 (review 1) | ES:277; DEC:28 (P-668) | TL | Open (records); moved E → D | records PR |
| 109 | ES §8 and OP §2/§9 dated plans for 17 Nov morning | The 09:45-18:00 runbook and the 10:30 agenda | ES:315-345; OP:76-96, OP:388-410 | TL | Superseded as timetables; their open actions are #51, #54, #55, #57 and, added in review 1, #129, #134, #135, #156-#176 | - |


### 1b. Items added in review 1 (17 Nov 15:10-16:30 IST; sources and quotes in `design/full-power-plan-gaps-2026-11-17.md` §1)

| # | Item (added in review 1) | Source | Owner | Status | Est. | Bucket |
|---|---|---|---|---|---|---|
| 110 | Every open PR either finishes or is named in the P9 in-flight block; the Build Leads' open-PR lists are the input (added in review 1) | DEC:36 P-660 "every open PR finishes or is listed in the P9 block"; ST:22 "lists by 19:30/20:00" | TL | Open | 20 min | A |
| 111 | Sweep for work that exists only locally before the freeze: PF-6 part 2a and FO-2b branches not on GitHub, qa case-side stray branch (added in review 1) | H/STATE-2026-11-17-1405-lead77s2-asks-A159-A161-rows.md:5 (review 2: line 5, not 7) "PF-6 part 2a branch not on origin"; FS/step1-claude-ai-cleanup-2026-11-17.md:14 "possible unpushed work" | TL | Open | 20 min | A |
| 112 | Disk margin for fresh lanes after the move (a standby was blocked below 7 GB) (added in review 1) | H/STATE-2026-11-17-1515-lead78s2-asks-A162-A163-rows.md:5 "blocked by disk 6.6 GB (< 7)" | TL | **Done 18 Nov (evidence: history/STATE-2026-11-18-1352-lead80s2-handover-item4-lanes.md: 40 GB free, above the 7 GB block)** | 10 min | A |
| 113 | Read false blocks and auto-mode pauses after the deny-line paste, at 16:30 and 20:30 (added in review 1) | DEC:26 P-670 "reads false blocks and auto-mode pauses at 12:30, 16:30 and 20:30 IST"; ES:302 | TL | Open | 10 min each | A |
| 114 | The 18 Nov 08:00 Proven report against the 13-16 forecast, with slip reasons; the evening forecast re-measure (added in review 1) | ES:339 "Report Proven against 30 and against 13-16, with slip reasons"; R1:59 "The forecast is re-measured each evening" | TL | Open | 20 min | A |
| 115 | A two-minute going-away checklist for the founder before he leaves tonight (added in review 1) | AS:137 "A 2-minute going-away checklist" | F with TL | Open | 2 min | A |
| 116 | Accounts register rows for the Enterprise, the org, the Mergify org and Namespace (added in review 1) | AR:22 "every new outside account gets a row here the day it is created" | TL | Open (review 2: due today 17 Nov, not yet overdue; AR has no such row, status line 15 Nov) | 10 min | A |
| 117 | Write the rate-limit facts in STATE (REST stays per user; the GITHUB_TOKEN figure under Enterprise) (added in review 1) | CL:270 "Write down in STATE that rate limits do not grow" | TL | Open | 5 min | A |
| 118 | Have the rollback steps F1-F4 ready to run, not only the trigger (#14) (added in review 1) | CL:421 "freeze again (B1 to B3, C1);" | TL | Open | 10 min | A |
| 119 | Answer the Claude app's pending permission update on GitHub (added in review 1) | FS/p8-settings-record-2026-11-17.md:10 "a permission update request is pending" | F (SA) | Open | 2 min | A |
| 120 | Fix the builder skill and the night queue so PRs open non-draft after Approve (they still say draft) (added in review 1) | SK/next/SKILL.md:25 "gh pr create --draft --base main"; NQ:8 "open the PR as a **draft**"; DEC:13 P-683 | TL; F word | Open | 15 min | C |
| 121 | Re-point the auto-mode and settings lines that name the old path; drop the old path later (added in review 1) | DC:270 "Re-point after the move (the auto-mode lines name the old path)."; LOG:24 | TL; F pastes | Open | 10 min | B |
| 122 | Re-point the three lane-starter routines, which read the night queue from the Lead branch (added in review 1) | NQ:3 "read this file from branch `lead/2026-11-07-lead31`" | TL | Open | 5 min | B |
| 123 | Read the Namespace trial end date and price during the settings compare (added in review 1) | FS/p8-settings-record-2026-11-17.md:27 "No trial end date is shown anywhere we could read" | TL | Open | 5 min | B |
| 124 | CK-2 heartbeat: dispatch the first run after #2081 merges, confirm one green run and a clean conformance check, read the first two summaries (added in review 1) | SN/local_c3e4ea74-99af-4b49-a4a8-d4c6b6b916db/ck-builder-notes.md:22 "confirm one green run on main"; ST:20 "dispatch its first run after merge" | TL | Open | 15 min | C |
| 125 | CK-3: two board lines, "enforced: yes/no, last checked", stale after 45 min (added in review 1) | FS/checks-brief.md:20 "Stale over 45 min shows \"unknown (stale)\"" | BK | Open | 1 PR | C |
| 126 | CK-1's ruleset item flips from "not yet" to checked after the move (added in review 1) | FS/checks-brief.md:6 "tolerate \"not yet\" until move day" | TL | Open | 5 min | C |
| 127 | Ratify the nightly alarm time (brief 04:00, set 10:00) (added in review 1) | FS/HANDOVER.md:26 "Nightly alarm threshold 10:00 IST (setup agent decision" | TL | Open | 5 min | C |
| 128 | After #2073 merges, check Mergify shows the `verdicts` queue; mark P-664 enforced (added in review 1) | LOG:27 "Mergify shows a `verdicts` queue"; RU:143 "(.mergify.yml priority owed)" | TL | **Doing 18 Nov: #2073 merged 17 Nov (origin/main edf0687a6); the Mergify `verdicts` queue read and marking P-664 enforced are left (evidence: origin/main log)** | 5 min | C |
| 129 | Mergify priority for near-Proven product PRs (added in review 1) | OP:178 "Priority for near-Proven **product** PRs: a `.mergify.yml` PR" | TL; L | Open | 1 PR | C |
| 130 | Change-log upkeep: version 1.2 for C18-C19; stale rows C11, C12, C16; rows for CK, P-688/P-689 and the transfer (added in review 1) | LOG:11 "C17 added"; FS/engineering-change-log-2026-11-17.md:22 "PR #2077 (head 91719a6)" | TL | **Doing 18 Nov: version 1.2 with rows C20-C24 added, C26 added, C16 shows its merge (evidence: LOG; commits 34095926f, 3dbace7f3); left: the version line for C18, C19 and C26, rows C11, C12, CK (C25 reserved for #2080), P-688/P-689** | 20 min | C |
| 131 | Next version of the Library masters: mark the Team, 40-job and dated-plan lines superseded; daily refresh (added in review 1) | ES:394 "The next version follows tomorrow's 08:00 report and the move."; ES:340 | TL | Open | 1 h | C |
| 132 | Update RULES' account facts (still "Pro, 40 jobs") after the move (added in review 1) | RU:5 "GitHub Pro, 40 Actions jobs at once" | TL | **Done 18 Nov 16:3x (evidence: RULES.md "Account facts" line, commit 1768d05cb; on the Lead branch, not yet on main)** | 5 min | C |
| 133 | Retune the routines' CI brake (30 queued runs) for 500 jobs (added in review 1) | NQ:3 "Over 30: reply" | TL | Open | 10 min | C |
| 134 | Restart the usage log and commit the baseline snapshot script (added in review 1) | ES:326 "Restart the usage log. Commit the baseline snapshot script."; SN/local_9ae95739…/lead74-a149/synthesis.md:387 "stops at 15 Nov 22:04" | TL | Open | 30 min | C |
| 135 | Set the sessions moved to xhigh back to medium; give every helper an explicit model and effort (added in review 1) | ES:208 "Set them back to medium."; ES:206 | TL | Open | 10 min | A |
| 136 | T10 builders on high: the 48-hour stop-rule comparison (review rounds, CI rounds, plan points) (added in review 1) | DEC:30 P-666 "stop rule at 48 h comparing review rounds, CI rounds and plan points"; ES:309 | TL | Open | 1 h | C |
| 137 | P-663 daily checkpoint (Proven against the ramp, reason for a miss, what changes), the resource plan, a priced card if the Claude plan cannot carry it (added in review 1) | DEC:33 "a daily checkpoint (the day's Proven against the ramp" | TL | Open | 20 min a day | C |
| 138 | Each evening, the day's three biggest time losses with a fix each (added in review 1) | R1:50 "every evening the Lead lists the day's three biggest time losses" | TL | Open | 15 min a day | C |
| 139 | Measure median Built to Proven before and after halving qa time (due 17 Nov, today; review 2: due, not yet overdue) (added in review 1) | DEC:56 P-640 "median hours Built→Proven before and after ... checked 17 Nov" | TL | Open | 30 min | C |
| 140 | Check the Lead's start read is 70k tokens or less (19 Nov) (added in review 1) | DEC:81 P-615 "a Lead's start read 70k tokens or less (desk F13, 60%, check 19 Nov)" | TL | Open | 15 min | C |
| 141 | Outside clocks due 18 Nov: AWS domain reminder or Cloudflare; BoldSign or Signority; Stripe test keys (added in review 1) | OD:7 "remind him when PF-8a's PR opens or on 18 Nov"; OD:14 "decide by 18 Nov"; DEC:78 P-618 "BoldSign -> Signority on 18 Nov" | F; TL card | Open | 15 min F | C |
| 142 | Anti-stall review (A130): merge records PR #2068, put its 7 decisions to the founder one at a time, then tick A130 (added in review 1) | H/STATE-2026-11-17-1022-lead74s2-lead74-now-block.md:7 "its 7 decisions go to the 10:30 batch"; ST:28 "A130 stall research still owed" | TL; F | **Doing 18 Nov: records PR #2068 merged 17 Nov (origin/main b48f03936); its 7 decisions to the founder and the A130 tick are left (evidence: STATE "A130 stall research still owed")** | 30 min | C |
| 143 | Release the leaked claim branch `claim/CS-W3-part-0` (added in review 1) | AS:117 "claim/CS-W3-part-0 leaked" | TL | Open | 2 min | C |
| 144 | Remove the stale "Lead 34" watchdog line; the first standby is the watchdog (added in review 1) | ST:54 "Watchdog: first standby (Lead 34 once Lead 33 tells it)"; AS:105 | TL | Open | 5 min | C |
| 145 | Records PRs merged twice a day (added in review 1) | ES:229 "merged twice a day"; CI:284 | TL | Open | standing | C |
| 146 | Fix the top flaky suites and the nightly's three reds (c613 still in the nightly list, b78 timeout) (added in review 1) | CI:129 "fix the top flaky (bk5 start, c95)"; H/STATE-2026-11-17-1255-lead76s2-nightly-and-asks-A137-A149.md:3 "re-measure at tonight's nightly" | L | Open | 1-2 PRs | C |
| 147 | Dispatch nightly C8.2 + C11.6 once under 20 runs queued; log qa Minors QA-504-506 (added in review 1) | H/STATE-2026-11-17-1435-lead78s2-takeover-note.md:3 "dispatch nightly C8.2 + C11.6 on the checkpoint once under 20 runs queued" | TL | Open | 5 min | C |
| 148 | The founder approves the clean-up plan (phase 2 needs it) (added in review 1) | CU:3 "plan approval and the Lead's go pending" | F | Open | 2 min | A |
| 149 | Stage 2a's Done-when before its PR: full suites, Docker image answering `/api/health`, `start.sh` demo smoke (added in review 1) | CU:372 "the Docker build of `studio/Dockerfile` with the image answering `/api/health`" | L | Open | runs | C |
| 150 | Open the stage 1 PR from `86802739a` only; the branch head `afd4d2e2c` is the held 1b commit (added in review 1) | CU:369 "`afd4d2e2c` (**held**)"; `git log origin/cleanup/stage-1-archive-october` | TL | Open | 2 min | C |
| 151 | Confirm the Codex/Goose scout still runs before stage 1 removes its launch entries (added in review 1) | CU:109 "Lead to confirm it still runs" | TL | Open | 5 min | C |
| 152 | Verify the allow rule for scheduled skills and the self-paced loop before the unattended proof run (added in review 1) | GR:116 "Verify the allow rule exists."; GR:117 | TL | Open | 10 min | C |
| 153 | Check `/model` for "Requires usage credits" before any Fable use outside the desk (added in review 1) | SN/local_9ae95739…/lead74-a149/synthesis.md:383 "Check the `/model` picker for a \"Requires usage credits\" label" | TL | Open | 2 min | C |
| 154 | Archive Leads 64, 72 and 74 (69 and 70 done 13:5x); delete Lead 74's 0.4 GB snapshot (added in review 1) | ML:15 "Lead 64 refused (still has a Remote Control client"; ML:17 "Lead 74's 0.4 GB snapshot" | TL | Open | 10 min | C |
| 155 | Bring the master list, outside-dependency and accounts registers up to date (they feed this plan, P-690) (added in review 1) | ML:3 "The tech lead updates this file at every change."; OD:5 "Status (15 Nov 21:5x IST)" | TL | Open | 20 min | C |
| 156 | CI-0a: `guards` required by path, wider paths, 5 orphan tests (added in review 1) | OP:167 "F6 `guards` required by path, wider paths, 5 orphan tests" | L | Open | 1 PR | D |
| 157 | CI-0b: drop label-guard's `workflow_run` (added in review 1) | OP:168 "F12 drop label-guard's `workflow_run` (CI-0b)" | L | Open | 1 PR | D |
| 158 | Read the cause of the startup_failure runs, then fix (added in review 1) | OP:169 "Read the cause first; fix in one lane PR" | L | Open | 1 PR | D |
| 159 | CI-A: container proof inside `ci` and in the merge batch (added in review 1) | OP:166 "`ci` calls it for code batches (CI-A)"; CI:127 | L | Open | 1 PR | D |
| 160 | Q2: fast checks first; file-only checks move into `kind` (added in review 1) | CI:140 "Fast checks first"; OP:137 | L | Open | 1 PR | D |
| 161 | Q6: shards sized to the work left; nightly shard rebalance (added in review 1) | CI:144 "Shards sized to the work left"; SN/local_28bf6046-9c98-4f67-8b04-7f1801873579/ci-speed-audit-2026-11-17.md:71 | L | Open | 1 PR | D |
| 162 | Q7: gate jobs off the long line (added in review 1) | CI:145 "Gate jobs off the long line" | L | Open | 1 PR | D |
| 163 | F5: fix pr-rules' false failures, start the 2-day clock, then required (P-635 (3)) (added in review 1) | OP:129 "fix the false failures, start the 2-day clock"; DEC:60 | TL; L | Open | 1 PR | D |
| 164 | F11: check-docs fails on a future time; remove the unused `m3-guard.sh` (added in review 1) | OP:246 "F11 check-docs fails on a future time"; OP:247 | L | Open | 1 PR | D |
| 165 | A3 one allow-list door for GitHub writes (curl writes pass the gh deny lines); A7 push before stop; A10 actionlint/zizmor later (added in review 1) | OP:248 "A3 one allow-list door for GitHub writes"; FS/private-out/operating-model-5c-guard-gaps-2026-11-17.md:3 | L | Open | 1-2 PRs | D |
| 166 | A5 round counter in label-guard; review brief with round caps (3 review, 2 CI-fix) (added in review 1); review 2 (talk 1, adopted): the brief also says "skip style, report defects only" and re-reviews read only the new diff (TV:117) | OP:147 "A5: round counter in label-guard"; DC:405 "a three-round review cap and a two-round CI-fix cap" | L | Open | 1 PR | D |
| 167 | A6 touch-list overlap in lane-preflight; migration stamp in pr-rules (added in review 1) | OP:177 "A6: touch-list overlap in lane-preflight" | L | Open | 1 PR | D |
| 168 | PR-W: pr-open-guard in pre-push; branch-sweep in lead-watch (added in review 1) | OP:127 "PR-W: `pr-open-guard.sh` in pre-push" | L | Open | 1 PR | D |
| 169 | lead-watch and factory-board judge red from `ci` only; ACT on any failed gh call (added in review 1) | OP:186 "`lead-watch red()` and `factory-board` read `ci` only"; AS:138 | L | Open | 1 PR | D |
| 170 | F14: measuring scripts and the board move to GraphQL reads (precondition of the hook paste #72) (added in review 1) | OP:170 "Move `app-code-prs.sh` and the board (about 150 REST calls a run) to GraphQL"; DEC:41 P-655 | L | Open | 1 PR | D |
| 171 | Test tooling: Playwright traces as artifacts; a "route twice" race suite; a screen-text and overflow check, report-only first (added in review 1) | OP:139; OP:138 "Then a \"route twice\" suite"; OP:140 | L | Open | 2-3 PRs | D |
| 172 | V1 capability index, `/verify`, studio-look; qa skill 8 KB or less; BUGS rows by capability ID (added in review 1) | OP:157 "V1: a generated capability index of about 15 KB"; OP:156 | L; TL | Open | 2 PRs | D |
| 173 | Fix P-611c and P-312 in the rule-ID map before the next RULES records PR (added in review 1) | OP:226 "Fix before the next records PR" | TL | Open | 15 min | C |
| 174 | Instruction-file trims PR A and PR C (RULES D12, S6, S12) and the other start-read trims (added in review 1) | OP:108 "Draft instruction PRs A, B, C"; SN/local_9ae95739…/lead74-a142-operating-model/instruction-files-plan.md:171 | TL | Open | 2 PRs | D |
| 175 | Ultrareview: the 3 free runs only, never `--post`, on the next money, schema or permission PRs (added in review 1) | OP:148 "**the 3 free runs only, never `--post`**" | TL | Open | 3 runs | D |
| 176 | Routines: a turn cap, a WIP brake, a run log, a starter script; quiet PRs resumed first (added in review 1) | OP:196 "KEEP; add a turn cap"; ES:152; AS:116; AS:136 | TL | Open | 1 PR | D |
| 177 | Burn guards for unattended nights: a push alert at 85%; trim lanes over 4%/h after 22:00 (added in review 1) | OP:199 "Fallback: a push alert at 85%"; DC:231 "Above 4% an hour after 22:00 the tech lead trims lanes" | TL | Open | standing | C |
| 178 | Weekly reviews: `/doctor prompt-audit`, any "enforced" rule that broke again, the permission-refusal log and top stall cause, a prompt audit at each model change (added in review 1) | OP:197; ES:310; FM:304 "Log permission refusals and hand over the top stall cause each week"; FM:300 | TL | Open | weekly | D |
| 179 | Monday "what's new" check (P-611 (3)); next due 23 Nov (added in review 1) | DEC:85 "Every Monday (IST) the Lead or a read-only watcher checks"; GR:143 | TL | Open | 10 min weekly | D |
| 180 | Score the dated forecasts on their dates: F4 18 Nov, F2 21 Nov, F3 23 Nov, the desk's own; standing against 101 on 29 Nov (added in review 1) | DEC:90 P-606 "F4 18 Nov (nightly parts < 50 min, 70%)"; DEC:99 P-597 "carry a probability and a check date"; ES:311 | TL | Open | 10 min each | C |
| 181 | Points per Proven and per merged PR against the baseline; a one-day token split by role (added in review 1); review 2 (talks 2-3, adopted): weekly cost per merged app-code PR "next to change-fail, revert plus forward-fix and escapes" (TV:121; OP:369 escaped Majors per merged PR in place of a revert target) | ES:308; OP:368 "One-day token split by role" | TL | Open | 1 h | D |
| 182 | Compare the talk 1 transcript with the official recording before quoting it (added in review 1) | ES:307 "Compare our talk 1 transcript with the official recording" | TL | Open | 20 min | D |
| 183 | T16: record #2062 as a departure (0.6 threshold Sample); Manitoba stays Sample (added in review 1) | ES:265 "Record it as a departure from the requirements"; DC:211 | TL | Open | records | D |
| 184 | T17: amend P-203 (skill overflow to its own file), run consolidate-memory, operating model master in the board Library (added in review 1) | DEC:28 P-668 "T17 amend P-203 (skill overflow to its own file)"; OP:404; OP:406 | TL; F 10 min | Open | 1 records PR | D |
| 185 | One founder settings card: the one-week deny-instead-of-prompt trial, blockWritesOutsideWorkingDirectories, CLAUDE_CODE_SUBAGENT_EFFORT, the sandbox key, the security update (added in review 1) | ES:273 "A one-week trial of deny-instead-of-prompt"; GR:114-123; DEC:85 P-611 | F | Open | 15 min F | D |
| 186 | Context diet: measure `/context` first, then rows 1-19 and its five founder questions; settle Drive (needed in required-tools, off in the diet) (added in review 1) | CD:17 "Check this first with `/context`."; CD:182-200; CD:215 | TL; F | Open | 1 h | D |
| 187 | Enforcement plan items beyond steps 1-15: B197/B198 then their settings lines, hook 18 weekly judgment audit, measures at 3 and 7 days, the daily read of every block, later linters, health owner fields, a conditional health-keeper lane (added in review 1) | EP:10 "need the founder's settings lines once they merge"; EP:197; EP:233 "Compared after 3 days and 7 days"; EP:234; EP:223; EP:267; EP:284 | TL; L | Open | several PRs | D |
| 188 | Backlog rows still prose in RULES: B193 part 4 WIP script, B194 hot-file split, B198, B200, B201 tests, B199 part 2 fewer test parts (added in review 1) | RU:127-128 "prose (B193, B194)"; RU:130; RU:133; RU:134; R1:23 | L | Open | several PRs | D |
| 189 | Board owed: per-stage Flow measures as ACT lines (P-646); wait-time targets met or missed (P-619 (8)) (added in review 1) | DEC:50 "Next (owed): the board's per-stage Flow measures"; RE:75 | BK | Open | 1-2 PRs | D |
| 190 | Cloud-environment domains asked by the FO-7s0 lane (help.clio.com, central.xero.com, help.lawpay.com): the founder's call (added in review 1) | DEC:49 P-647 "help.clio.com, central.xero.com, help.lawpay.com on the cloud environment: the founder's call" | F | Open | 5 min | D |
| 191 | Supply chain: SHA-pinning card (P-583 steps 8-11), report-only dependency audit, shape SEC-1 (Dependabot alerts) (added in review 1) | DEC:113 P-583 "steps 8-11 by PRs (SHA pinning"; DEC:25 P-671 "Not changed on purpose: SHA pinning"; H/STATE-2026-11-14-1350-lead44s2-old-hand-over-block.md:11 "SEC-1 to shape (Dependabot 28 open, 8 high in the app)" | TL; F | Open | card + rows | D |
| 192 | Audits from the decision cards: tamper audit of merges since 10 Nov, seeded defects and canaries, a factory manifest, third-party memory hooks, the self-hosted Mac runner on a public repository (added in review 1) | DC:407 "A read-only tamper audit of PRs merged since 10 Nov"; DC:408; DC:409; DC:339; DC:486 | TL; F | Open | days | D |
| 193 | Registry extras (review 2: the property-test library is already in #76's pins, so that part is dropped here): the founder names CR-11's paths, the INVARIANT tag decision, fix or demote a false block within 2 days (added in review 1) | FM:550; FM:571 "let the founder name the paths he wants to see"; FM:341; FM:519 "fixed or demoted within 2 days" | TL; F | Open | with #78 | D |
| 194 | Clean-up per-stage protocol: announce the empty window, gate checks (CI, check-docs, board, `start.sh` demo smoke, stale paths), PATHS-MOVED and change-log rows, rebase guide, restart lanes and routine prompts after stage 5, compare job lists (added in review 1) | CU:201 "The Lead announces the window"; CU:202; CU:204; CU:237; CU:236; CU:239; CU:241 | TL; L | Open | each stage | D |
| 195 | Clean-up stage 2c: seven files open PRs edit and about 250 folder-counting tests, in 2-3 PRs (added in review 1) | CU:384 "the ~250 tests that count folders switch to the finder" | L | Open | 2-3 PRs | D |
| 196 | `fromStored()` map for stored database paths, plus the live POC data, in stage 2b/3 (added in review 1) | CU:356; CU:385 "with `fromStored()` and the live POC data (7.1)" | L | Open | with #64/#65 | D |
| 197 | Remove stage 5's old-path stubs after 7 days (added in review 1) | CU:220 "removed in a later PR" | L | Open | 1 PR | D |
| 198 | Affected-only CI for the modular monolith (added in review 1) | CU:63 "run the tests of the modules a PR touches"; DEC:14 P-682 "affected-only CI" | TL; L | Open | with #71 | D |
| 199 | Dated founder items: Enterprise first payment 1 Dec; the Ultra price in the spend master; interaction limit renewal about 17 May 2027; outside-account rows OD 2, 3, 5-7 and AR 3-5, 7-9, 12 (added in review 1) | FS/founder-answers-2026-11-17.md:12 "next payment 1 Dec"; SN/local_fa783599…/spend/spend-master.json:10; FS/p8-settings-record-2026-11-17.md:50 "until about 17 May 2027"; OD:8-13; AR:9-18 | F; TL | Open | per item | D |
| 200 | Private home: pointer README in proof-copy-api, P-677 and §5c copies confirmed in expat-ready/private, daily public mirror refresh (added in review 1) | DEC:17 P-679 "gets a pointer README"; DEC:18 P-678 "moves the private copies named in P-677 and the operating-model §5c there" | TL | Open | 20 min | C |
| 201 | CI cost follow-ups (decide at #79): Namespace open-source program, `workflowSizeGuideline: small`, caches for dependencies and the database, an nproc measure (added in review 1) | CI:166 "Apply to Namespace's open-source program"; CI:185; SN/local_28bf6046…/ci-capacity-options-2026-11-17.md:78 (review 2: line 78, not 77); SN/local_28bf6046…/ci-speed-audit-2026-11-17.md:73 | TL; F | Open | 1 h | D |
| 202 | Anti-stall fixes still open: away-flag hook, launchd heartbeat with a push test, retire the P-402 local line, items.py ingests lane questions, generated module-card lines, questions without a Lead number, RULES "Enforced by" for five rules (added in review 1) | AS:108; AS:109 "run from a Mac launchd job"; AS:110; AS:112; AS:131; AS:135; AS:151 | TL; F paste | Open | several PRs | D |
| 203 | Cards 8b and 8c to the founder: re-run a failed shard once and requeue; auto-quarantine a suite that passes only on retry (added in review 1) | AS:133 "Auto-quarantine a suite that passes only on retry twice in 24 h"; AS:134; ES:231 | F | Open | 2 cards | D |
| 204 | Next-week list from the blank-sheet design: features.json, permission tests, a born-flaky check, auto-revert, graduated autonomy (added in review 1) | SN/local_9ae95739…/lead74-a146/gap-and-migration.md:347 "a born-flaky check, auto-revert" | TL | Open | cards | D |
| 205 | Hourly wake of stalled cloud lanes by the lane starter (added in review 1) | UR:21 "Hourly wake of stalled cloud lanes" | TL | Open | 1 PR | D |
| 206 | Backlog rows owed since 15 Nov: FO-2's qa53 decorator-call scan, CS-C1a's two follow-ups (added in review 1) | H/STATE-2026-11-15-1850-lead60s2-check-1840-and-feed-lines.md:5 "Still owed to BACKLOG" | TL | Open | 10 min | D |
| 207 | A best-in-class design review per module in the Prove Lead's walk (added in review 1) | R1:58 "a best-in-class design review per module is added" | Prove Lead | Open | per module | D |
| 208 | Spend card on the board (added in review 1) | DEC:15 P-681 "the board card is not built now" | - | Superseded / dropped | - | E |
| 209 | The Anthropic support message (T15) (added in review 1) | H/STATE-2026-11-17-1255-lead76s2-asks-A155-A157-rows.md:5 "support message not needed" | - | Superseded / dropped | - | E |
| 210 | Desk 03's pipeline review draft needing a fresh challenge (added in review 1) | H/STATE-2026-11-14-1350-lead44s2-old-hand-over-block.md:11 "desk 03's pipeline review draft 1 needs a fresh challenge" | - | Unverified drop (review 2: no source says it was overtaken; the reason is review 1's inference; the Lead confirms or reopens it) | - | E |
| 211 | Gmail check at every session start (added in review 1) | DEC:63 P-633 "No start-of-session Gmail check" | - | Superseded / dropped | - | E |
| 212 | 30 Proven by 08:00 18 Nov (added in review 1) | DEC:33 P-663 "Replaces \"30 Proven by 08:00 IST 18 Nov\"" | - | Superseded / dropped | - | E |

### 1c. Items added in review 2 (17 Nov 15:53-16:4x IST; the adopted talk lessons; evidence in `design/full-power-plan-review2-2026-11-17.md` §2)

| # | Item (added in review 2) | Source | Owner | Status | Est. | Bucket |
|---|---|---|---|---|---|---|
| 213 | Lint rule content for the T14 PR: bulk suppressions so only new violations fail, `noInlineConfig`, the 24 dead disable comments removed; risky APIs only in one wrapper (effects in `web/src/lib/hooks`, `new Date()` only through the clock port, `Button` carries `type`, raw Prisma only in the data layer); four import rules; old patterns named in CLAUDE.md (added in review 2) | TV:109 "Effects only in `web/src/lib/hooks`"; TV:110 "Four import rules in the lint PR"; OP:362 "Bulk suppressions; old patterns named in CLAUDE.md"; ES:48-52 | L | Open (after #76) | with #76 | D |
| 214 | Edit-loop lint hook: PostToolUse on Edit/Write runs eslint on the edited file; time it first, else run it in Stop on changed files; a settings line for the founder (added in review 2) | TK:57 "PostToolUse on Edit/Write runs `eslint --cache <file>`"; OP:360 "L1, L2, T1; RULES v2" | TL; F pastes | Open (after #76, at the paths of #72) | 1 PR + 1 line | D |
| 215 | Every check and lint rule prints the rule id, the reason, the allowed fix and a file to copy (the registry's `fix_message` field) (added in review 2) | TV:111 "prints the rule id, the reason, the allowed alternative and a file to copy"; ES:51 | L | Open (with #78) | small, per check | D |
| 216 | Performance budgets as checks: STANDARDS §9 budgets become a CI step; a query budget per route (added in review 2) | TV:126 "STANDARDS §9 budgets become a CI step; a query budget per route" | L | Open | 1-2 PRs | D |
| 217 | Scorers deterministic first: one grader library shared by CI, qa and the replay suite; correctness only from tests and qa packs; any LLM judge publishes its agreement with deterministic truth (added in review 2) | TV:127 "One grader library shared by CI, qa and the replay suite" | TL; L | Open (after #77) | 1 PR | D |
| 218 | A private trace store: each lane's transcript and tool log kept by row and PR in the founder's private home, sampled daily, never in the public repository (added in review 2) | TV:128 "Each lane's transcript and tool log kept by row and PR"; ES:65 "a private trace store" | TL | Open | 1 script | D |
| 219 | Factory changes tested before they merge: skill, agent-prompt and rule PRs run the replay suite; no factory PR may change the check that judges it (added in review 2) | TV:120 "no factory PR may change the check that judges it"; ES:64 | TL; L | Open (after #77 and #192's manifest) | 1 PR | D |
| 220 | The five human jobs (steer, approve, restrict, check, start) as a checklist: for each, the control, its gap and its evidence (added in review 2) | TV:129 "For each job record the control, its gap and its evidence"; talk1-coded U10 | TL | Open | records, 30 min | D |
| 221 | Outer loop that finds and files, never fixes: a nightly read-only `/qa explore` once batch failures are under 15%, each finding with a failing reproducer, fixes through the normal gates (added in review 2) | TV:130 "A nightly read-only `/qa explore` once batch failures are under 15%"; OP:371 | TL; qa | Open (when batch failures < 15%) | 1 routine | D |
| 222 | Reviewer, breaker and qa sessions get read-only tokens; a secret scope per stage; secrets only as cloud network secrets (added in review 2) | TV:131 "reviewer, breaker and qa sessions get read-only tokens" | TL; F | Open (with #58) | card | D |
| 223 | Property and race tests where the money is: fast-check (pinned in #76), a model-based money property test in class C1, race tests for 2-3 flows (added in review 2) | TV:125 "a model-based money property test in class C1; race tests for 2-3 flows"; OP:367 | L | Open (after #76) | 1-2 PRs | D |
| 224 | qa walks recorded in CI (added by Lead 80, 18 Nov, founder ask on best-in-class qa speed): gate A journeys replayed as Playwright runs on GitHub's machines with video, trace and screenshots as artifacts, one job per capability, so 4+ qa lanes review recordings in parallel instead of each walking an isolated copy on the Mac (cap 4 copies) | founder 18 Nov 19:2x IST: "for QA, are we completely best in class resource available now? ... is it the best in class possible for our required speed?" | TL; qa | **Doing 18 Nov (P-700): wave 1 Pipeline lane, builder started** | 1-2 PRs | C (moved from D by P-700) |

### 1d. Items added 20 Nov by Lead 100 (engineering map, P-750, P-755; founder: "Make a list of enforceable activity so that we don't miss it")

| # | Item (added 20 Nov) | Source | Owner | Status | Est. | Bucket |
|---|---|---|---|---|---|---|
| 225 | Patch the 9 high dependency security alerts GitHub flags on main (29 open: 9 high, 17 moderate, 3 low) | founder 20 Nov 12:0x IST: "Make a list of enforceable activity so that we don't miss it"; library/engineering-map.md | L | Open | 1 lane, 1-2 PRs | D: now, before any firm's data |
| 226 | Staging on AWS in Canada (ca-central-1), created from files (infrastructure as code), sized by P-755 | founder 20 Nov 12:0x IST: "Make a list of enforceable activity so that we don't miss it"; library/engineering-map.md | TL; L | Open | 2-3 days | D: at Proven 30 (P-750) |
| 227 | Production on AWS in Canada from the same files as staging (managed PostgreSQL, managed containers; P-755) | founder 20 Nov 12:0x IST: "Make a list of enforceable activity so that we don't miss it"; library/engineering-map.md | TL; L; team | Open | with 226 | D: at Proven 30 (P-750) |
| 228 | Automatic deploy: a merge to main deploys to staging; production on a click | founder 20 Nov 12:0x IST: "Make a list of enforceable activity so that we don't miss it"; library/engineering-map.md | L | Open | 1 PR | D: with 226 |
| 229 | Error and uptime monitoring on staging and production (tool through STANDARDS §1) | founder 20 Nov 12:0x IST: "Make a list of enforceable activity so that we don't miss it"; library/engineering-map.md | L | Open | 1 PR | D: with 226 |
| 230 | Nightly database backups and one restore actually tried | founder 20 Nov 12:0x IST: "Make a list of enforceable activity so that we don't miss it"; library/engineering-map.md | L | Open | 1 PR + a drill | D: with 227 |
| 231 | Release candidate: cut RC1 from main, version tags, release notes; v1.0 after the qa walk | founder 20 Nov 12:0x IST: "Make a list of enforceable activity so that we don't miss it"; library/engineering-map.md | TL | Open | half a day | D: week before 29 Nov |
| 232 | Full qa walk of RC1 on staging before v1.0 | founder 20 Nov 12:0x IST: "Make a list of enforceable activity so that we don't miss it"; library/engineering-map.md | qa | Open | 1 day | D: after 231 |
| 233 | Privacy and data-residency review before the first firm's real data (Unconfirmed: no counsel) | founder 20 Nov 12:0x IST: "Make a list of enforceable activity so that we don't miss it"; library/engineering-map.md | F; TL | Open | - | D: before first firm |
| 234 | Feature flags per firm (SA-12) | founder 20 Nov 12:0x IST: "Make a list of enforceable activity so that we don't miss it"; library/engineering-map.md | L | Open | - | D: after first firms |
| 235 | On-call and incident process | founder 20 Nov 12:0x IST: "Make a list of enforceable activity so that we don't miss it"; library/engineering-map.md | F; TL | Open | - | D: after first firms live |
| 236 | Product analytics | founder 20 Nov 12:0x IST: "Make a list of enforceable activity so that we don't miss it"; library/engineering-map.md | L | Open | - | D: after first firms |
| 237 | Guard review: each of the 28 guards with the incident it prevents, its catches and its false blocks; keep, tune or merge only with evidence, never drop blindly (founder 20 Nov) | founder 20 Nov 12:0x IST: "Make a list of enforceable activity so that we don't miss it"; library/engineering-map.md | TL | Doing 20 Nov: review done (`design/guard-review-2026-11-20.md`: 31 guards, KEEP 12, TUNE 6, MERGE 4, ASK 9, none dropped); tunes wait for the founder | read-only review | D: now |

---

## 2. Classification (each item in exactly one bucket)

### A. Before the transfer (32 items with the transfer; review 1: now by 09:30 IST 18 Nov unless drained at 18:30)

| # | Why here |
|---|---|
| 3 | Org choices are fixed only where the enterprise leaves them; read before anything lands (CL:204) |
| 4 | C1.1 needs "billing shows paid with no Actions block" (CL:308) |
| 5 | Best read before the transfer; if the dashboard still cannot list the org, it moves into #27 |
| 7 | C1.1 "the tech lead session restarted" (CL:312) |
| 8 | C1.1 "the P8 record is in your private GitHub home" (CL:313) |
| 9 | Only possible before: screenshots of the old Mergify org and installations (CL:256-259) |
| 10 | So a burst of mail is not read as an incident (CL:269) |
| 11 | Inventory is a snapshot; rerun on the newest main (CL:277, G21) |
| 12 | P-660 (3): a mirror refresh before the freeze (DEC:34) |
| 13 | C5 depends on this choice (CL:341) |
| 14 | A8 must be agreed before C2 (CL:161) |
| 15 | B1 must start at least 1 h before C1 (CL:282) |
| 16 | The drain cannot finish while new labels arrive (CL:288) |
| 17 | Go / no-go item 2 (CL:315) |
| 18 | These are the drain: approved and queued work lands before the freeze (ST:19-20) |
| 19 | C1.3 (CL:316) |
| 20 | C1.4 (CL:318) |
| 21 | C1.5 (CL:319) |
| 22 | The decision point (CL:306) |
| 110 | (added in review 1) The founder's condition for the move: no work lost |
| 111 | (added in review 1) P-557: nothing lives only in a session |
| 112 | (added in review 1) R4 starts fresh lanes; check before the freeze |
| 113 | (added in review 1) Dated today; a false block could stop the drain |
| 114 | (added in review 1) Falls before the 09:30 move |
| 115 | (added in review 1) He is away and back for the move |
| 116 | (added in review 1) Overdue since 17 Nov 11:05; part of the move inventory |
| 117 | (added in review 1) Checklist P11, not in the plan |
| 118 | (added in review 1) A rollback at night must not be improvised |
| 119 | (added in review 1) The app must work on the new path (D1) |
| 135 | (added in review 1) Due 10:30 17 Nov, no record that it was done |
| 148 | (added in review 1) Ask in tonight's minutes so C is not blocked |

The transfer itself (#23) is the dividing line and counts in A for the founder's minutes; it is listed in B's table only as its first step. Count for A: 31 items plus the transfer (review 1: #1, #2 and #6 moved to E as done; #110-#119, #135, #148 added).

### B. Post-transfer, queue still off (15 items: 24-35 and 121-123)

| # | Why here |
|---|---|
| 23 | The transfer (first step of the window) |
| 24 | First check after C2 (CL:333) |
| 25 | "At once, before anything else": tools misread a 301 (CL:334-340) |
| 26 | Per A6, right after the main repository (CL:152) |
| 27 | Within 5 min; Merge Queue off can only be set now (DEC:32 (b)) |
| 28 | Carry-over of variables, rulesets and the runner is undocumented (CL:359) |
| 29 | Routines must point at the new path before they are un-paused (CL:363) |
| 30 | Read-only, needed for the E-tests (CL:368) |
| 31 | Required before the restart (CL:373) |
| 32 | The biggest risk (G3); required before R1 (CL:383, CL:436) |
| 33 | Cheap now: nothing merges, 500 machines idle; each approved PR is ready when R1 opens. Re-runs only, after E4 lifts the write hold (CL:380). Adds nothing to a rollback |
| 34 | Two minutes while waiting on runs; keeps the clean start clean |
| 35 | R1 closes the window, only when E1-E7 are green (CL:387) |
| 121 | (added in review 1) Only possible once the new path exists |
| 122 | (added in review 1) With D3, before routines are un-paused; also blocks #88 |
| 123 | (added in review 1) Needed for #85 |

Count for B: 15 items after the transfer (24-35; review 1 added #121-#123).

### C. First 24-48 hours after the queue is back on, in this order (63 items)

| Order | # | Why here |
|---|---|---|
| 1 | 36 | Proves Mergify and queue-gate on the new path (CL:398-399) |
| 2 | 37 | Lead writes are needed for everything after (CL:389) |
| 3 | 38 | Lanes and routines back on the new path (CL:390) |
| 4 | 39 | P-557: the move goes on main as soon as records merge (CL:392) |
| 5 | 40 | Triggered by the first merge to main (CL:401) |
| 6 | 41 | Backup path check (CL:403) |
| 7 | 42 | First night runs at 01:53 and 02:11 (CL:405) |
| 8 | 53 | Tonight's first night on 500 machines is the natural proof run (ML:64) |
| 9 | 44 | Full power means more rows in flight, admitted by queue wait (DEC:31) |
| 10 | 45 | Proven, not merged, is the count (R1:42) |
| 11 | 43 | The next busy day shows whether the 500 is real (CL:406) |
| 12 | 51 | Without one batch-failure definition the readings cannot be trusted (FM:546) |
| 13 | 52 | +24 h on 18 Nov 09:00, +48 h on 19 Nov (ML:66) |
| 14 | 46 | Pipeline PRs one at a time, a green batch between (ES:345) |
| 15 | 47 | Small merge-flow follow-up (ST:19) |
| 16 | 48 | Stops decision-impact failing on records (ST:19) |
| 17 | 49 | Records PR; Library on main (ST:38) |
| 18 | 50 | Ten minutes of Lead cleanup (ST:44) |
| 19 | 54 | Every fresh lane from R4 gains; one file under `product/tools/` (OP:329) |
| 20 | 55 | If not yet merged, it cuts second runs (DEC:29) |
| 21 | 56 | Removes the silent-301 risk G8 (CL:441) |
| 22 | 60 | Clean-up stage 0: new files only, 0 of 44 open PRs touch them (GH) |
| 23 | 61 | Must precede stage 1 (DEC:17, CU:275) |
| 24 | 62 | Clean-up stage 1: 0 of 44 open PRs touch its paths (GH); P-674 puts stages 0-1 after the verified move (DEC:20; ST:40) |
| 25 | 63 | Stage 2a: 0 of 44 PRs touch `p2/policy.ts` (GH); money-critical fix comes before any move (CU:235) |
| 26 | 57 | Adds a gate; after the backlog has flowed for a day (DEC:26) |
| 27 | 58 | "Canary lane after the move" with a 30-min rollback (DEC:26) |
| 28 | 59 | Mergify change, alone for 24 h; re-read its case with 500 machines first (inference: its reason was batch clashes, ES:258) |

Order fixes in review 2: #152 (allow rules) and #177 (burn guards) come before #53, the unattended proof run they protect; #200 (private home confirmed) before #61 (private copy of `commercial/`); #51 (one batch-failure definition and hourly metrics) before #44, whose P95 thresholds it measures (inference from DEC:31 and FM:545).

Added in review 1 (order: #120 before #38's fresh lanes; #124-#128 right after the first merges; #149-#151 gate #60-#63, whose order is now stage 0 → 2a → 1 → 1b, CU:378-383; the rest as listed):

| # | Why here |
|---|---|
| 120 | (added in review 1) Before R4 starts fresh lanes; skill edit at the founder's typed turn |
| 124 | (added in review 1) Follows #46 |
| 125 | (added in review 1) The founder's view of enforcement (A154) |
| 126 | (added in review 1) Only true after the transfer |
| 127 | (added in review 1) Two values in two files |
| 128 | (added in review 1) First merges |
| 129 | (added in review 1) Speeds Proven, a merge-flow fix (P-214) |
| 130 | (added in review 1) A154: every pipeline change gets a row |
| 131 | (added in review 1) The masters still recommend Team (ES:251, ES:303) |
| 132 | (added in review 1) Wrong after R1 |
| 133 | (added in review 1) After the peak-jobs reading (#43) |
| 134 | (added in review 1) The +24/+48 h readings (#52) need it |
| 136 | (added in review 1) Due about 19 Nov 11:30 |
| 137 | (added in review 1) The ramp starts 19 Nov; only admission is in the plan (#44) |
| 138 | (added in review 1) Standing since P-644 |
| 139 | (added in review 1) Overdue |
| 140 | (added in review 1) Dated 19 Nov |
| 141 | (added in review 1) Dated 18 Nov; P-618 alarm |
| 142 | (added in review 1) Still owed; the 10:30 batch did not take them |
| 143 | (added in review 1) Routines skip a claimed row |
| 144 | (added in review 1) Wrong text in the start read |
| 145 | (added in review 1) Fewer records batches in the queue |
| 146 | (added in review 1) Batch failures cost the most after the move |
| 147 | (added in review 1) Becomes possible on 500 jobs |
| 149 | (added in review 1) Gate on #63 |
| 150 | (added in review 1) A PR from the head would remove `commercial/` before the private copy |
| 151 | (added in review 1) Before #62 |
| 152 | (added in review 1) Either can silently stop the 30-min check (#53) |
| 153 | (added in review 1) P-643: no extra usage |
| 154 | (added in review 1) Housekeeping and disk |
| 155 | (added in review 1) ML still shows done items as "Needs you" |
| 173 | (added in review 1) check-docs would fail the records PR (#49) |
| 177 | (added in review 1) The first full-power night |
| 180 | (added in review 1) F4 falls on 18 Nov |
| 200 | (added in review 1) P-557 hard rule |

### D. Later, once Release 1 work is flowing (88 items)

| # | Why here |
|---|---|
| 64 | Stage 2b: 9 open PRs edit 11 files that import `p2`/`contracts` (GH); needs an empty window (CU:217) |
| 65 | Stage 3: 27 of 44 open PRs touch `prototype/studio` (GH) |
| 66 | Stage 4: 1 open PR (#2085) adds a file under `official-sources/`; edits `ci.yml`, which 6 open PRs' config area touches (GH); P-674 timing 19 Nov+ |
| 67 | Stage 5: 11 open PRs touch `product/tools/`, 6 touch `.github`/`.claude`/`.mergify` (GH); hooks of running sessions (CU:236) |
| 68 | Stage 6: 39 of 44 open PRs touch `product/` (GH) |
| 69 | Stage 7: the rename is a second change of every integration; P-675 says after the verified move (DEC:19) |
| 70 | Stage 8: policy, not urgent (CU:223) |
| 71 | Refactor follows the layout stages (CU:326) |
| 72 | Hook paths change in stage 5; paste once, at the new paths, or with stubs (CU:220; OP:294) |
| 73 | Each guard is a PR; its paths move in stage 5 (EP:204) |
| 74 | Decided, waiting "after the move and the checks" (ST:43) |
| 75 | Same (ST:43) |
| 76 | Lockfile PR runs every suite; after the backlog (OP:400) |
| 77 | Same (ST:43) |
| 78 | Order CR-12 first; many PRs (FM:543-551) |
| 79 | "Day 5" (CI:354); paid machines are likely moot with 500 jobs (inference) |
| 80 | Each comes back as its own card (ES:279) |
| 81 | Rules items; after W1 and rules v2 (ML:45-53) |
| 82 | "CodeQL after the move" (DEC:23); it adds jobs to every PR, so after the queue is steady |
| 83 | Not a go / no-go item; one owner is today's risk already |
| 84 | About a week after a successful move (CL:150) |
| 85 | Namespace is optional at 500 jobs (CL:130); decide on fresh numbers |
| 86 | Each a gate record or a trial (DV:49-53) |
| 87 | Archive first (the backup mirror holds them), delete after stage 7; deleting unmerged work loses facts (AGENTS rule 8) |
| 88 | Not needed for full power; OP recommends option 2 (OP:113) |
| 89 | Not pipeline-critical; the founder's own settings |
| 90 | Records PR when convenient (DEC:28) |
| 91 | No ruleset added during the move (CL:278); a card after the queue is steady |
| 108 | (moved from E in review 1) W6 decided in the P-668 batch: the P-608 (3) records change goes with #90 |
| 156 | (added in review 1) Not needed for the move or the first 48 h (review 2: reason text repaired): CI-0a: `guards` required by path, wider paths, 5 orphan tests |
| 157 | (added in review 1) Not needed for the move or the first 48 h (review 2: reason text repaired): CI-0b: drop label-guard's `workflow_run` |
| 158 | (added in review 1) Not needed for the move or the first 48 h (review 2: reason text repaired): Read the cause of the startup_failure runs, then fix |
| 159 | (added in review 1) Not needed for the move or the first 48 h (review 2: reason text repaired): CI-A: container proof inside `ci` and in the merge batch |
| 160 | (added in review 1) Not needed for the move or the first 48 h (review 2: reason text repaired): Q2: fast checks first; file-only checks move into `kind` |
| 161 | (added in review 1) Not needed for the move or the first 48 h (review 2: reason text repaired): Q6: shards sized to the work left; nightly shard rebalance |
| 162 | (added in review 1) Not needed for the move or the first 48 h (review 2: reason text repaired): Q7: gate jobs off the long line |
| 163 | (added in review 1) Not needed for the move or the first 48 h (review 2: reason text repaired): F5: fix pr-rules' false failures, start the 2-day clock, then required (P-635 (3)) |
| 164 | (added in review 1) Not needed for the move or the first 48 h (review 2: reason text repaired): F11: check-docs fails on a future time; remove the unused `m3-guard.sh` |
| 165 | (added in review 1) Not needed for the move or the first 48 h (review 2: reason text repaired): A3 one allow-list door for GitHub writes (curl writes pass the gh deny lines); A7 push before stop; A10 actionlint/zizmor later |
| 166 | (added in review 1) Not needed for the move or the first 48 h (review 2: reason text repaired): A5 round counter in label-guard; review brief with round caps (3 review, 2 CI-fix) |
| 167 | (added in review 1) Not needed for the move or the first 48 h (review 2: reason text repaired): A6 touch-list overlap in lane-preflight; migration stamp in pr-rules |
| 168 | (added in review 1) Not needed for the move or the first 48 h (review 2: reason text repaired): PR-W: pr-open-guard in pre-push; branch-sweep in lead-watch |
| 169 | (added in review 1) Not needed for the move or the first 48 h (review 2: reason text repaired): Lead-watch and factory-board judge red from `ci` only; ACT on any failed gh call |
| 170 | (added in review 1) Not needed for the move or the first 48 h (review 2: reason text repaired): F14: measuring scripts and the board move to GraphQL reads (precondition of the hook paste #72) |
| 171 | (added in review 1) Not needed for the move or the first 48 h (review 2: reason text repaired): Test tooling: Playwright traces as artifacts; a "route twice" race suite; a screen-text and overflow check, report-only first |
| 172 | (added in review 1) Not needed for the move or the first 48 h (review 2: reason text repaired): V1 capability index, `/verify`, studio-look; qa skill 8 KB or less; BUGS rows by capability ID |
| 174 | (added in review 1) Not needed for the move or the first 48 h (review 2: reason text repaired): Instruction-file trims PR A and PR C (RULES D12, S6, S12) and the other start-read trims |
| 175 | (added in review 1) Not needed for the move or the first 48 h (review 2: reason text repaired): Ultrareview: the 3 free runs only, never `--post`, on the next money, schema or permission PRs |
| 176 | (added in review 1) Not needed for the move or the first 48 h (review 2: reason text repaired): Routines: a turn cap, a WIP brake, a run log, a starter script; quiet PRs resumed first |
| 178 | (added in review 1) Not needed for the move or the first 48 h (review 2: reason text repaired): Weekly reviews: `/doctor prompt-audit`, any "enforced" rule that broke again, the permission-refusal log and top stall cause, a prompt audit at each model change |
| 179 | (added in review 1) Not needed for the move or the first 48 h (review 2: reason text repaired): Monday "what's new" check (P-611 (3)); next due 23 Nov |
| 181 | (added in review 1) Not needed for the move or the first 48 h (review 2: reason text repaired): Points per Proven and per merged PR against the baseline; a one-day token split by role |
| 182 | (added in review 1) Not needed for the move or the first 48 h (review 2: reason text repaired): Compare the talk 1 transcript with the official recording before quoting it |
| 183 | (added in review 1) Not needed for the move or the first 48 h (review 2: reason text repaired): T16: record #2062 as a departure (0.6 threshold Sample); Manitoba stays Sample |
| 184 | (added in review 1) Not needed for the move or the first 48 h (review 2: reason text repaired): T17: amend P-203 (skill overflow to its own file), run consolidate-memory, operating model master in the board Library |
| 185 | (added in review 1) Not needed for the move or the first 48 h (review 2: reason text repaired): One founder settings card: the one-week deny-instead-of-prompt trial, blockWritesOutsideWorkingDirectories, CLAUDE_CODE_SUBAGENT_EFFORT, the sandbox key, the security update |
| 186 | (added in review 1) Not needed for the move or the first 48 h (review 2: reason text repaired): Context diet: measure `/context` first, then rows 1-19 and its five founder questions; settle Drive (needed in required-tools, off in the diet) |
| 187 | (added in review 1) Not needed for the move or the first 48 h (review 2: reason text repaired): Enforcement plan items beyond steps 1-15: B197/B198 then their settings lines, hook 18 weekly judgment audit, measures at 3 and 7 days, the daily read of every block, later linters, health owner fields, a conditional health-keeper lane |
| 188 | (added in review 1) Not needed for the move or the first 48 h (review 2: reason text repaired): Backlog rows still prose in RULES: B193 part 4 WIP script, B194 hot-file split, B198, B200, B201 tests, B199 part 2 fewer test parts |
| 189 | (added in review 1) Not needed for the move or the first 48 h (review 2: reason text repaired): Board owed: per-stage Flow measures as ACT lines (P-646); wait-time targets met or missed (P-619 (8)) |
| 190 | (added in review 1) Not needed for the move or the first 48 h (review 2: reason text repaired): Cloud-environment domains asked by the FO-7s0 lane (help.clio.com, central.xero.com, help.lawpay.com): the founder's call |
| 191 | (added in review 1) Not needed for the move or the first 48 h (review 2: reason text repaired): Supply chain: SHA-pinning card (P-583 steps 8-11), report-only dependency audit, shape SEC-1 (Dependabot alerts) |
| 192 | (added in review 1) Not needed for the move or the first 48 h (review 2: reason text repaired): Audits from the decision cards: tamper audit of merges since 10 Nov, seeded defects and canaries, a factory manifest, third-party memory hooks, the self-hosted Mac runner on a public repository |
| 193 | (added in review 1) Not needed for the move or the first 48 h (review 2: reason text repaired): Registry extras: a property-test library proposal, the founder names CR-11's paths, the INVARIANT tag decision, fix or demote a false block within 2 days |
| 194 | (added in review 1) Not needed for the move or the first 48 h (review 2: reason text repaired): Clean-up per-stage protocol: announce the empty window, gate checks (CI, check-docs, board, `start.sh` demo smoke, stale paths), PATHS-MOVED and change-log rows, rebase guide, restart lanes and routine prompts after stage 5, compare job lists |
| 195 | (added in review 1) Not needed for the move or the first 48 h (review 2: reason text repaired): Clean-up stage 2c: seven files open PRs edit and about 250 folder-counting tests, in 2-3 PRs |
| 196 | (added in review 1) Not needed for the move or the first 48 h (review 2: reason text repaired): `fromStored()` map for stored database paths, plus the live POC data, in stage 2b/3 |
| 197 | (added in review 1) Not needed for the move or the first 48 h (review 2: reason text repaired): Remove stage 5's old-path stubs after 7 days |
| 198 | (added in review 1) Not needed for the move or the first 48 h (review 2: reason text repaired): Affected-only CI for the modular monolith |
| 199 | (added in review 1) Not needed for the move or the first 48 h (review 2: reason text repaired): Dated founder items: Enterprise first payment 1 Dec; the Ultra price in the spend master; interaction limit renewal about 17 May 2027; outside-account rows OD 2, 3, 5-7 and AR 3-5, 7-9, 12 |
| 201 | (added in review 1) Not needed for the move or the first 48 h (review 2: reason text repaired): CI cost follow-ups (decide at #79): Namespace open-source program, `workflowSizeGuideline: small`, caches for dependencies and the database, an nproc measure |
| 202 | (added in review 1) Not needed for the move or the first 48 h (review 2: reason text repaired): Anti-stall fixes still open: away-flag hook, launchd heartbeat with a push test, retire the P-402 local line, items.py ingests lane questions, generated module-card lines, questions without a Lead number, RULES "Enforced by" for five rules |
| 203 | (added in review 1) Not needed for the move or the first 48 h (review 2: reason text repaired): Cards 8b and 8c to the founder: re-run a failed shard once and requeue; auto-quarantine a suite that passes only on retry |
| 204 | (added in review 1) Not needed for the move or the first 48 h (review 2: reason text repaired): Next-week list from the blank-sheet design: features.json, permission tests, a born-flaky check, auto-revert, graduated autonomy |
| 205 | (added in review 1) Not needed for the move or the first 48 h (review 2: reason text repaired): Hourly wake of stalled cloud lanes by the lane starter |
| 206 | (added in review 1) Not needed for the move or the first 48 h (review 2: reason text repaired): Backlog rows owed since 15 Nov: FO-2's qa53 decorator-call scan, CS-C1a's two follow-ups |
| 207 | (added in review 1) Not needed for the move or the first 48 h (review 2: reason text repaired): A best-in-class design review per module in the Prove Lead's walk |
| 213 | (added in review 2) Adopted talk lesson; after its precondition (after #76) |
| 214 | (added in review 2) Adopted talk lesson; after its precondition (after #76, at the paths of #72) |
| 215 | (added in review 2) Adopted talk lesson; after its precondition (with #78) |
| 216 | (added in review 2) Adopted talk lesson; no precondition, but not needed for the move or the first 48 h |
| 217 | (added in review 2) Adopted talk lesson; after its precondition (after #77) |
| 218 | (added in review 2) Adopted talk lesson; no precondition, but not needed for the move or the first 48 h |
| 219 | (added in review 2) Adopted talk lesson; after its precondition (after #77 and #192's manifest) |
| 220 | (added in review 2) Adopted talk lesson; no precondition, but not needed for the move or the first 48 h |
| 221 | (added in review 2) Adopted talk lesson; after its precondition (when batch failures < 15%) |
| 222 | (added in review 2) Adopted talk lesson; after its precondition (with #58) |
| 223 | (added in review 2) Adopted talk lesson; after its precondition (after #76) |

Count for D: 88 items (64-91, 108 and, added in review 1, 156-172, 174-176, 178-179, 181-199, 201-207; added in review 2, 213-223).

### E. Superseded, duplicate, done or drop (25 items)

| # | Superseded by / why |
|---|---|
| 92 | Enterprise gives 500 jobs (CL:199, DEC:37) |
| 93 | P-657, P-658: Enterprise bought (DEC:36-37) |
| 94 | P-688: tonight, 09:30 fallback (DEC:6); P-689 (review 1): undrained at 18:30 means 09:30 18 Nov |
| 95 | C1.3 empties the variable; 500 jobs (CL:316) |
| 96 | P-662: Devin not installed on the org (DEC:32) |
| 97 | Done: 2 rulesets active (CL:84-86; ST:12) |
| 98 | Duplicate of W1 (#58) |
| 99 | Done: P-670 (DEC:24); the hook part is #72 |
| 100 | Done: P-673 (DEC:21) |
| 101 | Duplicate of T14 (#76) |
| 102 | Done: P-669 (DEC:25) |
| 103 | Done: Library masters v1.0 exist (ES:2, OP, CI, FM, LOG headers) |
| 104 | Duplicates of #75, #74, #59 + #57; ML D1 done by the move |
| 105 | Done: the checklist is the Enterprise revision (CL:3) |
| 106 | Declined (L3, L8, L10, CI D5) or standing (D9) |
| 107 | Done (DEC:32-35; ST:12) |
| 109 | Overtaken by P-688 as timetables; their open parts are #51, #54, #55, #57 and #129, #134, #135, #156-#176 (review 1) |
| 1 | (moved from A in review 1) Done: N1-N9 all GO (ST:12) |
| 2 | (moved from A in review 1) Done, as #1 |
| 6 | (moved from A in review 1) Done: CL:310 corrected (commit `8b154f0dc`) |
| 208 | (added in review 1) Parked by the founder |
| 209 | (added in review 1) The founder dropped it (A157) |
| 210 | (added in review 1) Overtaken by Engineering System v1 (P-668); reviewer's inference |
| 211 | (added in review 1) P-633 amends P-620 |
| 212 | (added in review 1) Replaced by the ramp |

### Counts

| Bucket | Items |
|---|---|
| A before the transfer | 32 (3-5, 7-23 with the transfer; 110-119, 135, 148) |
| B queue-off window | 15 (24-35, 121-123) |
| C first 24-48 h | 63 |
| D later | 88 (review 2: +11, #213-#223); +13 on 20 Nov (#225-#237, Lead 100) |
| E superseded / duplicate / done / drop | 25 |
| **Total** | **237** (#224 added by Lead 80 18 Nov; #225-#237 added by Lead 100 20 Nov; 109 + 103 added in review 1 + 11 added in review 2; 4 moved in review 1: #1, #2, #6 A → E, #108 E → D; none moved in review 2) |

Status as of 18 Nov 18:3x IST (Lead 80's reconciliation): Done 36 · Doing 13 · Open 154 · Superseded 16 · unchanged-unknown 4

---

## 3. The clean-up question

### 3.1 What each stage would collide with today

Open PRs read at about 14:30 IST: 47 open, of which 3 are Mergify batch branches, so **44 real PRs** (GH). Each PR's file list was matched to the paths each stage moves or deletes (CU:215-223).

| Stage | What it moves or deletes | Open PRs touching those paths (of 44) | Rollback risk if done in window B | CI cost | Public-repo point | Verdict |
|---|---|---|---|---|---|---|
| 0 Safety net | New files and a tag | **0** | Low, but it is still a merge in a window that must stay one change | One small run | none | **C**, first clean-up item |
| 1 Archive October | ~972 files under `ai-workers/` and old root folders, plus 20 in `commercial/` (`git ls-tree`, origin/main) | **0** (also 0 touch `CLAUDE.md` or `.claude/launch.json`) | A merge would mix "move broke" with "deletion broke" in the 90-min trigger (CL:161; CU:242) | Paths sit outside `product/`, so it is not records-only (records-only.sh regex); in the queue a batch runs every suite (ci.yml:13). About one full batch | `commercial/` leaves the tree but stays in public history (DEC:17); private copy first (#61) | **C**, after stage 0 and #61 |
| 2a Spend-guard root | `p2/policy.ts` and a new root finder | **0** touch `policy.ts` | Money-critical code merged during verification is the wrong blame mix | Full suites (app code) | none | **C**, fake launcher only (CU:217) |
| 2b Packages | `p2/`, `contracts/` and ~150 import lines in the app | **9** PRs edit 11 files that import them (#1956, #1959, #1961, #2000, #2001, #2003, #2029, #2042, #2087) | Rebase load during the window | Full suites | none | **D**, empty window |
| 3 Move the app | `prototype/studio`, `p5` | **27** | 27 rebases, ~20 of them approved and waiting | Full suites on every rebased PR | none | **D**, empty window |
| 4 Reference inputs | `official-sources`, `domain`, inventories; `ci.yml` fetch step | **1** (#2085 adds `official-sources/manitoba/README.md`) | Edits `ci.yml`, a path CL:278 freezes for the window | Fetch step | none | **D** |
| 5 Move the tools | `product/tools/`; `.claude/settings.json` hooks, workflows, `.githooks` | **11** (+6 touch the config files) | Hooks of running sessions break; the guards the move relies on live here | Guard suites | none | **D**, empty window |
| 6 Move the docs | `product/*.md`, `screens`, `qa`, `design`, `history`, board data | **39** | Almost every PR rebases; the in-flight block in STATE moves | Records and full suites | Old records keep their text (P-188) | **D**, empty window |
| 7 Finish + rename | README, CODEOWNERS, repository rename | 0 files, but every integration again | **High**: the settings lines name `xpatready` (LOG:24); rollback F uses the name (CL:417) | Small | none | **D**, P-675 |
| 8 Screenshot policy | lane briefs, skills, push guard | not counted (briefs) | none | Small | none | **D** |

Method notes: counts come from `/pulls/<n>/files` for all 44 PRs (44 calls) and a `git grep` on `origin/main` for files importing `p2` or `contracts` (my pattern found 347 importer files; the plan says ~150 import lines, so the pattern may over-match: the 9-PR count is an upper bound).

### 3.2 Recommendation

**Bundle nothing from the clean-up into window B.** Reasons, by the four tests:

1. **Conflicts:** stages 0, 1 and 2a are conflict-free (0 of 44), so they gain nothing from the quiet window; stages 2b, 3, 5 and 6 hit 9, 27, 11 and 39 PRs. Window B is quiet for *merges*, not for *open PRs*: all 44 stay open across the transfer, so a move then forces the same rebases as any other time.
2. **Rollback:** the A8 trigger reads E3, E5 and E8 within 90 minutes of the transfer (CL:161). Any content merge in that time makes a red result ambiguous (CU:242). Nothing merges while the queue is off anyway, and a hand merge would break P-384 ("product code never merged by hand", DEC P-384).
3. **Public repo:** stage 1 must not run before the private copy of `commercial/` is checked (P-677); none of the stages adds team-app specifics if `PATHS-MOVED.md` lists paths only (P-504).
4. **CI cost:** with 500 machines the cost of stages 0-2a is about three runs (inference); the real cost is queue slots that the ~20 waiting PRs need first.

**So:** stage 0, stage 2a, stage 1 without 1b, then 1b once the `commercial/` copy is checked, land in **C**, on 18 Nov, once E8 and E9 have passed and the first batches of the approved backlog have merged (review 1: the clean-up plan's revised order, CU:378-383). Stages 2b, 2c (new, CU:384) and 3 to 8 stay in **D**, from 19 Nov, one per empty window, as P-674 decided. ~~The clean-up agent may *open* the stage 0 PR during window B~~ (review 1: CU:374 says the PRs "open only on the Lead's word, after the move is verified"; no PR before then).

---

## 4. One timeline for the move (IST; tonight path, with the 09:30 18 Nov re-dating below)

Clock at writing: 14:25 IST. CL's own backward schedule: B1 by about 14:30, B2 by about 15:30, go / no-go about 18:30, transfer about 19:00 (CL:162).

**Review 1 re-dating:** the move is now planned for **09:30 IST 18 Nov** (P-689; no merge since 13:27 at the 15:35 check). Read the rows below as the tonight path, taken only if C1.2 is drained at 18:30. Otherwise the same A-B sequence runs from 09:30 18 Nov: A items by 09:30 (the 08:00 Proven report #114 included), the transfer about 09:30-10:00, B about 10:00-11:30, R1 about 11:30, and C from 18 Nov midday. Added A items fit the evening: #113 (16:30, 20:30 readings), #110-#112 (by 20:00), #115 (before he leaves), #148 and #119 (one minute each).

| Time (IST) | What | Items | Founder minutes |
|---|---|---|---|
| 14:30-15:30 | Enterprise and org checks with the setup agent; billing; Mergify plan; screenshots | 1-5, 9 | 35 |
| 14:30-15:30 | Lead: C1 wording fix, P8 record to the private home, mail list, owner inventory, mirror refresh, stop new work | 6-8, 10-12, 15 | 0 |
| 15:30 | Turn off queue-gate | 16 | 2 |
| 15:30-18:30 | Drain (postpone if not drained by 18:30); #2086 by hand on green; red parts re-run | 17, 18 | 0 |
| any time before 18:30 | Two answers: the backup repository, the rollback trigger | 13, 14 | 2 |
| ~18:15 | Empty `CI_SHARD_RUNNER`; turn off label-guard | 19, 20 | 4 |
| ~18:30 | Go / no-go (REST, status, every C1 item) | 21, 22 | 5 (to hear it) |
| ~19:00 | Transfer | 23 | 5 |
| 19:00-19:15 | Remotes; backup repository; apps and Mergify queue off | 24-27 | 15 |
| 19:15-20:15 | Compare settings; cloud routines; read-only checks; E2-E6; pre-warm the approved PRs | 28-31, 33, 34 | 0-15 (only if something is missing) |
| ~20:15 | Association test | 32 | 10 |
| ~20:30 | Merge Queue on | 35 | 3 |
| 20:30-23:00 | E8, E9; Lead writes; lanes and routines; record the move; Mac runner if needed | 36-40 | 0-20 (runner only) |
| overnight | Backlog merges in batches; first night runs; proof run | 41, 42, 53 | 0 |
| 18 Nov 08:00-09:00 | Proven report; +24 h readings; peak jobs; admission reopens | 43-45, 52 | 0 |
| 18 Nov 09:00-18:00 | Pipeline PRs one at a time; metrics; start hook; clean-up 0, copy, 1, 2a; W3; W1 canary; T9 card | 46-51, 54-63, 57-59 | ~30 for W1's account, if done 18 Nov |
| 18 Nov 09:30 | **Fallback**: if tonight is no-go, the same A-B sequence runs from here (DEC:6) | - | same as tonight |
| 19 Nov onward | Clean-up stages 2b-8, one per empty window; refactor; rest of D | 64-91 | per card |

**Founder total tonight: about 80 minutes planned** (35 + 2 + 2 + 4 + 5 + 5 + 15 + 10 + 3 = 81), **up to about 2 hours** if settings must be recreated (+15) or the Mac runner must be registered again (+20). This matches P-688's "about 2 hours of clicks" (DEC:6). He also needs to be reachable from about 15:30 to 23:00 (CL:162).

---

## 5. Risks, and what could not be verified

**Risks**
1. **The drain may not finish by 18:30.** The queue had no merge from 10:24 IST to the A162 reading (ST:31); at 14:30 there were 3 batch branches and 13 PRs labelled `queued` (GH); CL expects 2-3 hours (CL:300). If B2 starts late, the 09:30 fallback is the likely outcome.
2. **C1 cannot be met as written** for the Mergify queue switch (#6). Unless the wording is fixed, go / no-go fails on an item that only exists after the transfer.
3. **P8 record location.** ST:12 names a side-notes folder that was empty when read; if the record is elsewhere, C1.1 still needs it in the private home.
4. **The founder's Approve after the move (G3, CL:436)** stays the largest single risk; E7 is the only proof.
5. **Build Leads A and C send lists at 19:30 and 20:00 (ST:22)**, inside the transfer window; they must only draft, not push to PRs, until E5.
6. **Pre-warming (#33) uses Lead writes** (re-runs) before R1. If the Lead's writes are refused after the move (G4), it waits for E4.
7. **Every number here is a snapshot** of 14:30 IST; open PRs change by the hour.

**Not verified**
* Whether CI-A and CI-B (one full check after Approve) are on main: not found in the last 400 main commit subjects; status of #55 is Unverified.
* How `change-kind.sh` classifies a deletion-only PR outside `product/` (stage 1's CI cost).
* The exact count of import lines stage 2b changes (pattern over-matches; 9 PRs is an upper bound).
* Whether the founder has stored 2FA recovery codes (A3).
* Remote branch count: 1,242 is the local clone's remote-tracking list, not a GitHub read; some may already be deleted on GitHub.
* Whether "All repositories" app installs cover a transferred repository (CL:226; checked in D1).
* All of CL's own Unverified items (CL:26-36) stand.
