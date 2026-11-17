# Full-power plan: what to club with tonight's move, and what to keep outside (17 Nov 2026)

Written 14:25-15:00 IST 17 Nov (clock: `TZ=Asia/Kolkata date`) by a read-only analyst for the tech lead, on the founder's ask A163 (`STATE.md:32`). Nothing was changed, run or labelled. GitHub reads: 46 REST calls (open PRs and their files) at about 14:30 IST.

**The answer in six lines**
1. Tonight's move stays **one change you can verify and undo**. Nothing that edits the repository's content merges between the transfer and the restart of the merge queue.
2. **Before the transfer (A):** 23 items (the transfer included), mostly your enterprise checks N1-N9, the drain, and two switches. About 80 minutes of your clicks tonight in total (A + B), up to about 2 hours if something has to be recreated.
3. **While the queue is off (B):** only re-pointing, checks E1-E7, and one cheap power move: re-run the red or stale checks of the ~20 approved PRs on 500 machines, so they join the queue the moment it turns on.
4. **First 24-48 hours (C):** merge the approved backlog first, open new work by queue wait, then clean-up stages 0, 1 and 2a. **They touch 0 of the 44 open PRs.**
5. **Later (D):** clean-up stages 2b to 8 from 19 Nov, as P-674 decided. Stage 3 (the app) touches 27 of 44 open PRs, stage 6 (the docs) 39 of 44, so they need empty windows, not tonight.
6. **Dropped (E):** 18 items that were superseded by Enterprise, already done, or duplicates.

Abbreviations for sources (line numbers on the Lead branch `lead/2026-11-07-lead31` at `11cce9de`, unless marked):
**CL** `design/org-move-checklist-enterprise-2026-11-17.md` · **CU** `design/repo-cleanup-plan-2026-11-17.md` on `origin/claude/repo-cleanup-plan-05e345` at `7d3cb7174` · **ML** `design/setup-master-list-2026-11-17.md` · **ES** `library/engineering-system.md` · **OP** `library/engineering-operating-model.md` · **CI** `library/ci-pipeline-strategy.md` · **FM** `library/agent-failure-modes.md` · **LOG** `library/engineering-change-log.md` · **EP** `design/enforcement-plan-2026-11-16.md` · **R1** `design/release1-operating-model-2026-11-16.md` · **DV** `design/claude-code-devops-research-2026-11-16.md` · **ST** `STATE.md` · **DEC** `DECISIONS.md` · **GH** the GitHub reads of 14:30 IST (open PRs and `/pulls/<n>/files`).

Owners: **F** the founder · **TL** the tech lead · **SA** the founder setup agent (works with the founder) · **L** a lane (builder, qa, clean-up agent). Times are estimates unless they come from a source.

---

## 1. Inventory (every open action item, one line each)

Status words: Open · Doing · Done · Unverified (no record found either way).

| # | Item (source ID) | Purpose in plain words | Source | Owner | Status | Est. |
|---|---|---|---|---|---|---|
| 1 | N1 enterprise type | Confirm the enterprise uses personal accounts; if managed users, the transfer is impossible (no-go) | CL:171, CL:456 | F (SA) | Open (ST:12 "to founder-setup") | 2 min |
| 2 | N2-N9 enterprise policies | Read Actions, allowed actions, runners, member privileges, 2FA, IP allow list, tokens, enterprise rulesets; nothing may block us | CL:172-194 | F (SA); TL records | Open | 13 min |
| 3 | P3a-f org policies | Check the org keeps the defaults (OAuth restrictions, tokens, Actions, fork approval, runner groups, 2FA) | CL:204-217 | F | Unverified | 5 min |
| 4 | P4 billing check | Enterprise shows paid, no Actions block, budget not blocking | CL:222-224 | F | Open | 3 min |
| 5 | P5c Mergify plan on the org | Confirm Open Source plan with batches and 3 parallel checks | CL:233-235; DEC:32 (a) | F | Open: the dashboard did not list the org yet (DEC:32) | 5 min |
| 6 | C1 wording fix for Mergify | C1 asks for "Merge Queue off in the new Mergify org" before the transfer, but that switch exists only after the transfer (DEC:32 (b)); move it to D1 | CL:310 vs DEC:32 | TL | Open | 5 min |
| 7 | P7 Lead restart | The Lead session must start after the settings-line edit | CL:246, CL:312; LOG:24 | TL | Likely done: Lead 78 started 13:56 (ST:3), after the 11:48 edit (LOG:24); confirm | 2 min |
| 8 | P8 record to private home | The settings record must sit in the private home before go | CL:261, CL:313; ST:12 | TL | Open: ST:12 names side notes `local_f6824017…/org-move-p8/`; that folder was empty at 14:2x IST | 5 min |
| 9 | P8 founder screenshots | App installations, Mergify dashboard, Namespace workspace | CL:256-259; ST:23 | F (SA) | Open ("three screenshot links", ST:23) | 10 min |
| 10 | P10 mail list | Tell the founder which mails to expect | CL:269 | TL | Open | 2 min |
| 11 | P12 owner inventory rerun | Re-check no tracked file and no local copy names the old path, on the newest main | CL:277 | TL | Open (last run 0 files, DEC:6) | 10 min |
| 12 | Mirror refresh | Refresh `.tools/backup-mirror.git` before the freeze | DEC:34 (3); ST:23, ST:42 | TL | Open | 10 min |
| 13 | A6 backup repository | Choose: move `xpatready-backup` with the main repository (recommended) or set `BACKUP_*` | CL:152-155 | F | Open | 1 min |
| 14 | A8 rollback trigger | Agree: E3, E5 or E8 not green within 90 min of the transfer means roll back | CL:161; ST:12 | F | Stated in ST:12; founder's yes not recorded | 1 min |
| 15 | B1 stop new work | No Lead writes, Mac schedules stopped, lanes push and start no row, routines paused | CL:282-287 | TL | Open | 20 min |
| 16 | B2 queue-gate off | Stops new labels so the queue can drain | CL:288-291 | F | Open | 2 min |
| 17 | B3 drain | Two reads 6 min apart: 0 batch branches, 0 `queued`, Actions idle; postpone after 3 h | CL:292-302 | TL | Open (GH: 3 batch branches, 13 `queued`) | 2-3 h |
| 18 | Drain helpers | #2086 by hand on green (P-214); re-run red parts of #2058, #2071, #2085; queued #2073, #2075, #2079, #2027 | ST:19-20 | TL | Doing | 30 min |
| 19 | C1.3 `CI_SHARD_RUNNER` empty | Keep jobs on GitHub's machines through the move | CL:316 | F | Open | 2 min |
| 20 | C1.4 label-guard off | Stop the sweep from removing labels while the association is tested | CL:318 | F | Open | 2 min |
| 21 | C1.5 REST and status | REST at least 1,000 left; githubstatus green | CL:319 | TL | Open | 1 min |
| 22 | C1 go / no-go | Every item holds, or fall back to 09:30 18 Nov | CL:306-322; DEC:6 | TL | Open (~18:30) | 10 min |
| 23 | C2 Transfer | The move itself | CL:323-332 | F | Open (~19:00) | 5 min |
| 24 | C3/E1 landed | Organization, PUBLIC, ADMIN | CL:333, CL:377 | TL | Open | 2 min |
| 25 | C4 re-point copies | Main clone remote and backup mirror to the new path | CL:334-340 | TL | Open | 5 min |
| 26 | C5 backup repository | Transfer it or set the variables (per #13) | CL:341-343 | F | Open | 5 min |
| 27 | D1 apps and Mergify | Apps list `xpatready` within 5 min; Mergify sees events; set Merge Queue **off** for `xpatready` | CL:347-350; DEC:32 (b) | F | Open | 10 min |
| 28 | D2 compare with P8 | Variables, secrets, rulesets, hooks, runner, collaborators; recreate anything missing | CL:351-361 | TL; F recreates | Open | 15 min (+0-15 F) |
| 29 | D3 Claude cloud | Routines' repository, the cloud environment, PR-bound sessions | CL:362-366 | TL | Open | 20 min |
| 30 | D5 read-only checks | Resume lead-watch, cockpit, factory-board | CL:368 | TL | Open | 5 min |
| 31 | E2-E6 tests | Old path 301, Mac push, Lead writes, lane push, lane PR `ci` | CL:378-382 | TL | Open | 30 min |
| 32 | E7 association test | Queue-gate on, one Approve, association MEMBER/OWNER, label-guard on | CL:383 | F + TL | Open | 10 min |
| 33 | Pre-warm the backlog | After E4/E6 pass, re-run the red or stale `ci` parts of the ~20 approved PRs, so each can join when the queue opens (re-run only, never cancel, P-384) | Proposal (inference) from CL:300, ST:31 | TL | Open | 15 min + CI |
| 34 | Local copy hygiene | Untracked `ids.txt`, `q.txt`, `repos.txt`, `.claude/settings.json.bak-2026-11-17` at the main copy's root: keep out of git | git status at session start | TL | Open | 2 min |
| 35 | R1 queue on | Switch Merge Queue and Merge Protections on in the new Mergify org | CL:387 | F | Open | 3 min |
| 36 | E8, E9 | A records PR and a product PR merge through the queue | CL:398-399 | TL | Open | 1-2 h |
| 37 | R3 Lead writes back | Labels, records PRs, hourly and daily records | CL:389 | TL | Open | 5 min |
| 38 | R4 + E10 lanes and routines | Un-pause routines, "Run now" one, start fresh lanes on the new path | CL:390, CL:400 | TL | Open | 30 min |
| 39 | R6 record the move | Records PR with the move; clear the in-flight block | CL:392 | TL | Open | 15 min |
| 40 | E11 Mac runner | demo-update picked up by `xr-mac-light`, or the founder re-registers it | CL:401 | TL; F if needed | Open | 0-20 min F |
| 41 | E13 backup line | lead-watch reads the backup at the new path | CL:403 | TL | Open | 5 min |
| 42 | E15 first scheduled runs | label-guard, queue-gate, nightly 01:53, xfa-engine 02:11 | CL:405 | TL | Open | 10 min |
| 43 | E16 peak jobs | Peak jobs in progress above 40 on the next busy day | CL:406 | TL | Open | 5 min |
| 44 | Admission reopens | New capability rows again when P95 queue wait < 60 min and batch wait < 15 min; ceiling about 15 lanes after the move | DEC:31 (P-663); ES:250 | TL | Open | each check |
| 45 | Prove capacity | qa lanes by journey group so Built becomes Proven | OP:383; R1:42 | TL | Doing | each check |
| 46 | CK-1 part 2, CK-2 heartbeat | #2080 then #2081 one at a time; CK follow-up PR (3 Minors); #2081 is card T12's heartbeat | ST:20, ST:37; DEC:26 (T12) | TL; L | Open (GH: both unlabelled) | 2 batches |
| 47 | #2086 follow-up | One PR for its six Minors | ST:19; ST:31 | L | Requested (task_b721b218) | 1 PR |
| 48 | Backlog rows P-650, P-653 | decision-impact keeps failing until they exist | ST:19 | TL | Open | 15 min |
| 49 | Library on main + board rows | Masters to main, name fix "Engineering System v1" vs "Engineering system" | ST:38 | TL; board lane | Open (#2085 carries masters, GH) | 1 PR |
| 50 | Stale item queue | `state/items.json` stale since 16 Nov 23:42 | ST:44 | TL | Open | 10 min |
| 51 | Hourly pipeline metrics + one batch-failure definition | Numbers to judge full power (queue wait, batch failures, re-runs) | ML:50 (C7); ES:331; FM:546-547 (CR-14 step 1) | TL; L | Open | 1-2 PRs |
| 52 | +24 h / +48 h readings | Keep a change only if its number improved | ML:66 (D6); ES:319-323 | TL | Open (18-19 Nov 09:00) | 20 min each |
| 53 | Unattended proof run | 6-7 h with merges flowing, no stall over 40 min, no red main over 1 h | ML:64 (D4) | TL | Later per ML; natural first chance tonight | overnight |
| 54 | Start-hook output under 1.5 KB | Every session sees the whole start text (today 12,215 characters) | OP:329; ML:55 (C11); ES:329 | L | Unverified | 1 PR |
| 55 | One full check after Approve (CI-B) | Fewer second runs (57% of PR minutes) | DEC:29 (P-665); CI:348 | L | Unverified whether merged | 1 PR |
| 56 | Lead tools follow 301 | Add `-L` so tools never parse a redirect as data | CL:441 (G8) | L | Open | 1 small PR |
| 57 | W3 fail-closed class job | High-risk change classes fail closed; separate queue later | DEC:26 (W3); ES:274 | TL | Decided, waiting | 1 PR |
| 58 | W1 agent identity canary | Each approval attributable; one canary lane after the verified move, 30-min rollback | DEC:26 (W1); ES:272 | F creates account; TL | Decided, waiting | 30 min F |
| 59 | T9 queue tuning | Two batch checks at once instead of three, alone for 24 h | DEC:26 (T9); ES:258 | TL | Decided, waiting | 1 PR |
| 60 | Clean-up stage 0 | Tag, pure-move and stale-path checks, `PATHS-MOVED.md`, one root finder | CU:215 | L (clean-up) | Open | ~150 lines |
| 61 | Private copy of `commercial/` | Copy the 20 files to the private home, checked file by file, before stage 1 removes them | DEC:17 (P-677); CU:275 | TL; L | Open | 20 min |
| 62 | Clean-up stage 1 | Remove ~1,000 October files that nothing reads; tag keeps them | CU:216; DEC:18 (P-676) | L | Open | 1 PR |
| 63 | Clean-up stage 2a | Spend guard finds the root by a root finder, not by counting folders; ledger test | CU:217, CU:235; ST:40 | L | Open | <800 lines |
| 64 | Clean-up stage 2b | `p2` and `contracts` become packages; ~150 import lines | CU:217 | L | Open | <800 lines |
| 65 | Clean-up stage 3 | Move the app to `apps/studio` | CU:218 | L | Open | ~2,050 renames |
| 66 | Clean-up stage 4 | Move official sources, requirements, inventories to `reference/` | CU:219 | L | Open | ~230 renames |
| 67 | Clean-up stage 5 | Move the tools to `tools/` with old-path stubs | CU:220 | L | Open | ~155 renames |
| 68 | Clean-up stage 6 | Move the docs to `docs/` | CU:221 | L; TL | Open | ~7,600 renames |
| 69 | Clean-up stage 7 | README, CODEOWNERS, rename to `expat-ready/platform` | CU:222; DEC:19 (P-675) | L; F (rename) | Open | ~200 lines |
| 70 | Clean-up stage 8 | Stop the screenshot growth | CU:223 | L | Open | ~100 lines |
| 71 | Refactor R0-R9 | Fences, folders by module and feature; knip, dependency-cruiser, jscpd report-only first | CU:326-338; DEC:12 (P-682) | L | Open | 3-4 days |
| 72 | Hook paste U1-U5 / #1865 lines | Wire the built guards in settings | OP:294-300; EP:207; R1:55 | F pastes; TL | Open | 15 min F |
| 73 | Enforcement rollout steps 1-15 + its four questions | Each guard as its own small PR | EP:208-221, EP:286-290 | L; TL; F (questions) | Decided, waiting (ST:43) | 15 PRs |
| 74 | T11 Lead compaction trial | One Lead a day instead of many hand-overs | DEC:26 (T11); ES:260 | TL | Decided, waiting | 1 day |
| 75 | T13 Rules v2 page | About 21 enforced rules plus 12 principles; old rows mapped | DEC:27 (P-667); OP:220-240 | TL | Decided, waiting | 1 day |
| 76 | T14 lint tools (= ML C6) | eslint and pins, report-only first | DEC:26 (T14); ES:263; OP:400 | L | Decided, waiting | 1 PR |
| 77 | W4 replay, W5 spec template | Settle models by replay; tests frozen by a separate session | DEC:26 (W4, W5); ES:275-276 | TL; F budget yes | Decided, waiting | 7-14 weekly points |
| 78 | Correction-to-check registry CR-01..CR-16 | Turn the top failure classes into checks, CR-12 first | FM:526-551; ES:336 | TL; L | Open | many PRs |
| 79 | Day-5 CI re-measure; L2 paid overflow | Re-measure CI, then decide paid machines | CI:354, CI:368; ES:284 | TL; F if paid | Open (~22 Nov) | 1 h |
| 80 | Later cards L1, L4-L7, L9 | Auto-fix, dispatcher, work state out of the public repo, Projects, second reviewer, outside heartbeat | ES:283-291 | TL; F | Later | each a card |
| 81 | Master-list rules items B4, B8, C1, C3, C5, C8, C9 rest | Who approves pipeline changes; test ownership; reviewer-only Approve; policy job; supply chain; mutation tests; conformance | ML:29, ML:33, ML:45, ML:47, ML:49, ML:52, ML:53 | F; TL; L | Open | many |
| 82 | CodeQL | Code scanning, deferred to after the move | DEC:23 (P-671) | F (SA) | Later | 15 min F |
| 83 | A3 backup owner | Second owner or stored recovery codes | CL:136-143; CL:443 (G10) | F | Open | 5 min |
| 84 | A5 Pro | Keep Pro a week past a successful move, then decide | CL:149-151; DEC:36 | F | Doing (kept) | 2 min |
| 85 | R5/E12 Namespace + #2032 | Restore `CI_SHARD_RUNNER` only if overflow is still wanted | CL:391, CL:402, CL:130 | F; TL | Open (GH: #2032 `dequeued`) | 1 card |
| 86 | DevOps gaps 1-5 | Claude reviewer in GitHub, headless checks, output-trimming hook, per-task cost, sandbox review | DV:49-53 | TL; L | Open | days |
| 87 | Old branches | ~1,242 remote-tracking refs in the local clone (900 `claude/`); lead-watch's 30 "no PR" lines | ST:22; `git branch -r` | TL | Open | 1 h |
| 88 | Fresh Lead branch | The Lead branch is 1,944 behind and 1,367 ahead of main; hooks run the branch's scripts | OP:109-115 | TL | Open (option 2 recommended) | 1-3 h |
| 89 | Founder-side items | Time Machine or iCloud for 1.3 GB (P-678); support contact (P-669); AWS later (ML B11) | DEC:16; DEC:25; ML:36 | F | Open | 10-20 min F |
| 90 | Model and effort into RULES | P-608's update from P-666 | ML:77 (E6); DEC:28 | TL | Open | records PR |
| 91 | Org rulesets / GitHub's own merge queue | Enterprise-level options now open; none added during the move | CL:278 (P13); CL:130 (S22) | F; TL | Not decided | card |
| 92 | P1 Support ticket (also ML B12, ES T2 ticket line) | Higher job limit | CL:199; ML:37; ES:251 | F | Not needed | - |
| 93 | Team plan route (ES T2, CI D1 and §13 step 1, OP §9 item 1) | Buy Team, 60 jobs | ES:251; CI:347, CI:365; OP:394 | F | Superseded | - |
| 94 | Move timing cards (ES T3; OP §2 11:00-12:00 window) | Move 18 Nov 09:30 or 17 Nov 11:00 | ES:252; OP:83 | F | Superseded | - |
| 95 | Narrow #2032 / unset the variable (CI D3; ES §8 10:30) | Keep long jobs on GitHub's machines | CI:367; ES:327 | TL | Superseded | - |
| 96 | Devin steps (P5d, D4, E14; DV Devin billing) | Connect Devin to the org | CL:236, CL:367, CL:404; DV:69-71 | F | Dropped | - |
| 97 | ML B2 ruleset on main | Required `ci`, no force push, no delete | ML:27; OP:395 | F | Done | - |
| 98 | ML B3 reviewer identity | Separate reviewer account | ML:28 | F | Duplicate | - |
| 99 | ML B5 settings paste (deny part) | Deny lines | ML:30 | F | Done | - |
| 100 | ML B6 / W2 cloud environment | Limited environment | ML:31; ES:273 | F | Done | - |
| 101 | ML B7, ML C6 lint | Lint yes and lint check | ML:32, ML:51 | F | Duplicate | - |
| 102 | ML B9 / T15 plan capacity | Usage and reset | ML:34; ES:264 | F | Done | - |
| 103 | ML B10 which Library; E2-E5, E8 masters; E1 research into the repo | Library home and masters | ML:35, ML:72-79 | TL | Done | - |
| 104 | ML C10, D5, C2, D1 | Rules v2, compaction, queue settings, machines | ML:46, ML:54, ML:61, ML:65 | TL | Duplicates / done | - |
| 105 | "Checklist still says Team, 60 jobs" | Fix the checklist text | ST:23, ST:39 | TL | Done | - |
| 106 | Declined or standing cards: L3, L8, L10, CI D5, D9 | Self-hosted runners, private repo, Build Lead read, ultracode | ES:285, ES:290, ES:292; CI:369, CI:373 | - | Declined or standing | - |
| 107 | Done prep: P2, P3g, P5 installs, P6, P7 edit, P9 block | Org, public membership, apps, REVIEWERS, settings lines, in-flight block | DEC:35, DEC:32, DEC:33 (12, 13); ST:12 | F; SA; TL | Done | - |
| 108 | W6 desk settings | Desk stays Fable high | ES:277 | - | No action | - |
| 109 | ES §8 and OP §2/§9 dated plans for 17 Nov morning | The 09:45-18:00 runbook and the 10:30 agenda | ES:315-345; OP:76-96, OP:388-410 | TL | Superseded | - |

---

## 2. Classification (each item in exactly one bucket)

### A. Before the transfer tonight (23 items with the transfer)

| # | Why here |
|---|---|
| 1 | Go / no-go item: a managed-user enterprise refuses the transfer (CL:171) |
| 2 | An enterprise policy overrides the org and could block Actions or runners (CL:169) |
| 3 | Org choices are fixed only where the enterprise leaves them; read before anything lands (CL:204) |
| 4 | C1.1 needs "billing shows paid with no Actions block" (CL:308) |
| 5 | Best read before the transfer; if the dashboard still cannot list the org, it moves into #27 |
| 6 | Without it, go / no-go has an item that cannot be met before the transfer (CL:310 vs DEC:32 (b)) |
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

The transfer itself (#23) is the dividing line and counts in A for the founder's minutes; it is listed in B's table only as its first step. Count for A: 22 items plus the transfer.

### B. Post-transfer, queue still off (12 items, 24-35)

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

Count for B: 12 items after the transfer (24-35).

### C. First 24-48 hours after the queue is back on, in this order (28 items)

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

### D. Later, once Release 1 work is flowing (28 items)

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

Count for D: 28 items (64-91).

### E. Superseded, duplicate or drop (18 items)

| # | Superseded by / why |
|---|---|
| 92 | Enterprise gives 500 jobs (CL:199, DEC:37) |
| 93 | P-657, P-658: Enterprise bought (DEC:36-37) |
| 94 | P-688: tonight, 09:30 fallback (DEC:6) |
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
| 108 | No action (ES:277) |
| 109 | Overtaken by P-688; their open parts are #51, #54, #55, #57 |

### Counts

| Bucket | Items |
|---|---|
| A before the transfer | 23 (1-23, the transfer included) |
| B queue-off window | 12 (24-35) |
| C first 24-48 h | 28 |
| D later | 28 |
| E superseded / duplicate / drop | 18 |
| **Total** | **109** |

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

**So:** stage 0, the `commercial/` copy, stage 1 and stage 2a land in **C**, on 18 Nov, once E8 and E9 have passed and the first batches of the approved backlog have merged (P-674's "stage 0-1 after the verified move; 2a first" holds). Stages 2b to 8 stay in **D**, from 19 Nov, one per empty window, as P-674 decided. The clean-up agent may *open* the stage 0 PR during window B to let its checks run, but it is labelled only after the restart.

---

## 4. One timeline for tonight and tomorrow (IST)

Clock at writing: 14:25 IST. CL's own backward schedule: B1 by about 14:30, B2 by about 15:30, go / no-go about 18:30, transfer about 19:00 (CL:162).

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
