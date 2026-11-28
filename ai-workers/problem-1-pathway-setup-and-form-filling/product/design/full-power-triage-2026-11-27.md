<!-- Triage by a read-only agent for Lead 2, 27 Nov 2026 IST, from origin/main 3ae82f28f; Lead spot-checked #2459 (open), #2123, #2458, #2461, #2427 (merged) and delivery-reset/playbook still on main. -->
# Full-power plan triage, 27 Nov 2026

Items triaged: 186 of 223 (Done or Superseded rows, #112, #132, #208, #209, #211, #212, excluded). Plan read from origin/main (3ae82f28f, 27 Nov); evidence read on origin/main only.

Counts: DONE-NOW 44 · KEEP 67 · FOLDED-V3 16 · CLEANUP 14 · DROP 30 · UNSURE 15

Notes: factory-v3-plan-2026-11-26.html exists only on disk (not on origin/main); claude-ship-best-practice-2026-11-27.md only on the local lead branch. design/os-backlog.md on main already maps many KEEP items to OS-nn rows. 'Clean-up' items already merged are marked DONE-NOW and tagged as the clean-up track.

| # | Item (short) | Old status | Verdict | Evidence or reason (one line) | Next owner |
|---|---|---|---|---|---|
| 3 | P3a-f org policies | Unverified | DROP | Org-policy defaults were checked at the move (finished 18 Nov); security basics now sit in factory v3 | - |
| 8 | P8 record to private home | Doing (review 1: the record  | DONE-NOW | Private home expat-ready/private exists (P-679); tools/private-sync.sh and #2605 on main | - |
| 11 | P12 owner inventory rerun | Open (last run 0 files, DEC: | DONE-NOW | tools/check-stale-paths.sh + stale-paths.txt on main (#2614), enforced in CI | - |
| 12 | Mirror refresh | Open | DONE-NOW | tools/backup-refresh.sh on main (daily private backup, P-589/P-590, #1743) | - |
| 13 | A6 backup repository | Open | DROP | Old plan to move xpatready-backup; P-678/P-679 chose private repo expat-ready/private plus Mac backup | - |
| 26 | C5 backup repository | Open | DROP | Old plan to move xpatready-backup; P-678/P-679 chose private repo expat-ready/private plus Mac backup | - |
| 29 | D3 Claude cloud | Open | DONE-NOW | Team plan cloud environment with repo setup script exists; #3623 merged (setup error stops session) | - |
| 32 | E7 association test | Doing 18 Nov: queue-gate and | DONE-NOW | queue-gate.yml and label-guard.yml on main and running since 18 Nov (row's own evidence C20, C21) | - |
| 36 | E8, E9 | Doing 18 Nov 18:3x: #2113 (r | DONE-NOW | #2113 merged (3d0eff797); queue has merged thousands of PRs since 18 Nov | - |
| 38 | R4 + E10 lanes and routines | Doing 18 Nov: lanes resumed  | DONE-NOW | Lanes run on expat-ready: claude/* branches merge daily (e.g. #3887, #3888 on 27 Nov) | - |
| 39 | R6 record the move | Doing 18 Nov: the move is re | DONE-NOW | Move recorded in engineering-change-log C20-C26 (commits 34095926f, 3dbace7f3, per row) | - |
| 40 | E11 Mac runner | Open | FOLDED-V3 | v3 'urgent' item: xr-mac serves the public repo; limit it to one workflow or move to GitHub machines (queue-gate still on xr-mac, 628742f00) | Founder + TL |
| 41 | E13 backup line | Open | DONE-NOW | lead-watch backup-age line and backup-refresh.sh on main (11c24c231); read live to confirm the new path | - |
| 42 | E15 first scheduled runs | Open | DONE-NOW | nightly.yml, label-guard.yml, xfa-engine.yml, pipeline-heartbeat.yml on main; heartbeat green (OS-83) | - |
| 43 | E16 peak jobs | Doing 18 Nov: first reading  | DONE-NOW | tools/capacity-watch.py on main; P-771 requires measured numbers; Enterprise gives 180 jobs | - |
| 44 | Admission reopens | Open | DONE-NOW | P-774 opened wave 3 (21 Nov); caps P-784/P-785 replaced the P95 rule; rows flow (R1.111) | - |
| 45 | Prove capacity | Doing | KEEP | qa proof rounds still running (qa: R1.111 'parts missing' 27 Nov); 56 of 101 Works on 25 Nov | TL + qa |
| 46 | CK-1 part 2, CK-2 heartbeat | Doing 18 Nov: #2080 (CK-1 pa | DONE-NOW | #2080 (fec10824c) and #2081 (f853bc67e) merged | - |
| 47 | #2086 follow-up | Requested (task_b721b218) | UNSURE | #2086 merged (52e26571f); no Minors follow-up PR found. Settle: search merged PRs for it or task_b721b218 | TL |
| 48 | Backlog rows P-650, P-653 | Open | UNSURE | BACKLOG.md on main has no P-650/P-653 rows. Settle: read DECISIONS P-650, P-653 and the last decision-impact run | TL |
| 49 | Library on main + board rows | Open (#2085 carries masters, | DONE-NOW | #2085 merged (677629bb3); library/ on main | - |
| 50 | Stale item queue | Open | UNSURE | state/items.json last changed 15 Nov on main. Settle: does cockpit or check-items.sh still read it | TL |
| 51 | Hourly pipeline metrics + one batch-failure definition | Open | DONE-NOW | flow-measure.py, queue-batches.py, merge-queue-causes.py, cycle-timeline.yml on main; why-targets-missed-2026-11-24 measures batch failures | - |
| 52 | +24 h / +48 h readings | Open (18-19 Nov 09:00) | DROP | Dated 18-19 Nov readings have passed; replaced by speed-evidence-2026-11-19.md and the daily P-663 checkpoint | - |
| 53 | Unattended proof run | Later per ML; natural first  | UNSURE | No record of a 6-7 h unattended run meeting the test. Settle: read unattended-running-2026-11-16.md and heartbeat history | TL |
| 54 | Start-hook output under 1.5 KB | Unverified | UNSURE | session-start.sh on main, size unmeasured. Settle: run it and count bytes | L |
| 55 | One full check after Approve (CI-B) | Unverified whether merged | UNSURE | Not seen in ci.yml. Settle: read ci.yml and OS-01/OS-13 for a one-full-check-after-Approve change | TL |
| 56 | Lead tools follow 301 | Open | KEEP | 31 curl calls in tools/*.sh on main lack -L | L |
| 57 | W3 fail-closed class job | Decided, waiting | FOLDED-V3 | v3 Approvals rule by path plus machine-user approval covers high-risk classes (P-845 (1)); OS-12 ruleset | TL |
| 58 | W1 agent identity canary | Decided, waiting | FOLDED-V3 | Machine user for the Lead is P-845 (1) | Founder (account) + TL |
| 59 | T9 queue tuning | Decided, waiting | DONE-NOW | .mergify.yml: batches of 2 (P-715 note), max_parallel_checks 4 (22 Nov) | - |
| 60 | Clean-up stage 0 | Prepared (review 1: branch c | DONE-NOW | Clean-up stage 0 merged (#2123); docs/PATHS-MOVED.md and tag history/pre-cleanup-2026-11 exist (clean-up track) | - |
| 61 | Private copy of commercial/ | Open | DONE-NOW | #2427 merged (P-753); commercial/ now holds only README.md (clean-up track) | - |
| 62 | Clean-up stage 1 | Prepared (review 1: 86802739 | CLEANUP | Stage 1 (#2459, size exception P-838) not merged: delivery-reset-2026-10-21/ and playbook/ still on main | Clean-up lane + TL |
| 63 | Clean-up stage 2a | Prepared (review 1: 66be5414 | DONE-NOW | Stage 2a merged (#2458) (clean-up track) | - |
| 64 | Clean-up stage 2b | Open | CLEANUP | Not started: p2 and contracts still under prototype/ | Clean-up lane |
| 65 | Clean-up stage 3 | Open | CLEANUP | Not started: no apps/ folder on main | Clean-up lane |
| 66 | Clean-up stage 4 | Open | CLEANUP | Not started: no reference/ folder on main | Clean-up lane |
| 67 | Clean-up stage 5 | Open | CLEANUP | Not started: tools still under product/tools. v3 says tools move last (72 scripts, 20 workflows) | Clean-up lane |
| 68 | Clean-up stage 6 | Open | CLEANUP | Docs partly under docs/ only for PATHS-MOVED; stage not done | Clean-up lane + TL |
| 69 | Clean-up stage 7 | Open | CLEANUP | No CODEOWNERS on main; rename to platform pending. v3 needs CODEOWNERS anyway | Clean-up lane + Founder |
| 70 | Clean-up stage 8 | Open | DONE-NOW | Stage 8 merged (#2461) (clean-up track) | - |
| 71 | Refactor R0-R9 | Open | CLEANUP | No knip, dependency-cruiser or jscpd on main | Clean-up lane |
| 72 | Hook paste U1-U5 / #1865 lines | Open | UNSURE | settings.json on main has deny lines and no old path; settle by diffing its hooks against the U1-U5 list | Founder + TL |
| 73 | Enforcement rollout steps 1-15 | Decided, waiting (ST:43) | DONE-NOW | ENF-7xx steps merged (ENF-733, 761, 772, 778a, 783a, 803; 96 ENF commits); the rest is OS-65 | - |
| 74 | T11 Lead compaction trial | Decided, waiting | UNSURE | No record it ran; Leads still change often. Settle: ask the new Lead whether a compaction trial is wanted | TL |
| 75 | T13 Rules v2 page | Decided, waiting | DONE-NOW | RULES.md is the rule register as of P-846 with IDs and 'Enforced by'; rules/ folder holds the text | - |
| 76 | T14 lint tools (= ML C6) | Decided, waiting | KEEP | No eslint, typescript-eslint or knip config anywhere on main | L |
| 77 | W4 replay, W5 spec template | Decided, waiting | DROP | Model replay obsolete (P-781 one model set); spec template covered by P-835 self-checking builders | - |
| 78 | Correction-to-check registry CR-01..CR-16 | Open | KEEP | No correction-to-check registry on main; CR-12 first | TL + L |
| 79 | Day-5 CI re-measure; L2 paid overflow | Open (~22 Nov) | DROP | Enterprise Cloud (180 jobs, rising to 500) replaced paid overflow; CI wait measured 0 min (os-backlog) | - |
| 80 | Later cards L1, L4-L7, L9 | Later | FOLDED-V3 | L1 auto-fix and L7 second reviewer are Steward and Code Review; L5 work state out of the public repo is the private-repo move | TL |
| 81 | Master-list rules items B4, B8, C1, C3, C9 rest | Open | FOLDED-V3 | B4 approver and C-rules become the machine user, Approvals and the ruleset (P-845) | TL |
| 82 | CodeQL | Doing 18 Nov: CodeQL "Analyz | DONE-NOW | CodeQL runs on main (alerts 111/112 handled in ba13b567c) | - |
| 83 | A3 backup owner | Open | FOLDED-V3 | Second owner and recovery codes are a security basic in v3 | Founder |
| 84 | A5 Pro | Doing (kept) | DROP | GitHub Pro replaced by Enterprise Cloud on 18 Nov; the one-week keep has ended. Founder cancels Pro if still billed | Founder |
| 85 | R5/E12 Namespace + #2032 | Open (GH: #2032 dequeued; st | DROP | No CI_SHARD_RUNNER reference left in .github on main; Enterprise capacity replaces Namespace | - |
| 86 | DevOps gaps 1-5 | Open | FOLDED-V3 | Gap 1 is Code Review (Manual on xpatready); other gaps are in claude-ship-best-practice-2026-11-27 | TL |
| 87 | Old branches | Open | KEEP | Remote refs grew to 2,289 (was 1,242); branch-sweep exists but does not delete | TL |
| 88 | Fresh Lead branch | Open (option 2 recommended;  | KEEP | lead31 is 7,599 behind and 3,135 ahead of main; OS-11 (#3506) still Doing; Leads now branch lead/2026-11-27-pNNN | TL |
| 89 | Founder-side items | Open | KEEP | Time Machine/iCloud, AWS later, support contact: founder items still open | Founder |
| 90 | Model and effort into RULES | Open | DONE-NOW | RULES IDX-11 keeps P-608 and notes P-725 for the new account | - |
| 106 | Declined or standing cards: L3, L8, L10, CI D5, D9 | Declined or standing | FOLDED-V3 | L8 private repo is reversed by P-845 (factory to expat-ready/private); the other declined cards stay declined | TL |
| 108 | W6 desk settings | Open (records); moved E → D | UNSURE | P-781 (one model set) may have ended the desk setting. Settle: ask whether the strategy desk still runs | TL |
| 110 | Every open PR either finishes or is named in the P9 in-fligh | 20 min | DROP | One-off before the 18 Nov transfer; the move is finished | - |
| 111 | Sweep for work that exists only locally before the freeze: P | 20 min | DROP | One-off before the 18 Nov transfer; the move is finished | - |
| 113 | Read false blocks and auto-mode pauses after the deny-line p | 10 min each | DROP | Dated 17 Nov readings and a going-away checklist; passed | - |
| 114 | The 18 Nov 08:00 Proven report against the 13-16 forecast, w | 20 min | DROP | The 18 Nov 08:00 report has passed; morning reports (design/morning-report-2026-11-25.md) and P-663 replace it | - |
| 115 | A two-minute going-away checklist for the founder before he  | 2 min | DROP | Dated 17 Nov readings and a going-away checklist; passed | - |
| 116 | Accounts register rows for the Enterprise, the org, the Merg | 10 min | KEEP | accounts-register.md has no row for Enterprise, the org or Mergify org; add Claude Team, machine user and Ultra account | TL |
| 117 | Write the rate-limit facts in STATE (REST stays per user; th | 5 min | KEEP | STATE on main has no rate-limit line; rules/tokens-money-account.md names Enterprise only | TL |
| 118 | Have the rollback steps F1-F4 ready to run, not only the tri | 10 min | DROP | One-off before the 18 Nov transfer; the move is finished | - |
| 119 | Answer the Claude app's pending permission update on GitHub  | 2 min | FOLDED-V3 | Claude app is installed (Code Review on); the open part is Approvals 'shared with another org' (v3 step 1) | Founder |
| 120 | Fix the builder skill and the night queue so PRs open non-dr | 15 min | KEEP | next/SKILL.md line 26 still opens PRs with --draft; OS-30 | TL |
| 121 | Re-point the auto-mode and settings lines that name the old  | 10 min | DONE-NOW | settings.json on main has no old-path (the old personal GitHub account) line | - |
| 122 | Re-point the three lane-starter routines, which read the nig | 5 min | UNSURE | Routines read the night queue from lead31 in the app; settle by listing the routines | TL |
| 123 | Read the Namespace trial end date and price during the setti | 5 min | DROP | Namespace not used on main; trial date irrelevant | - |
| 124 | CK-2 heartbeat: dispatch the first run after #2081 merges, c | 15 min | DONE-NOW | pipeline-heartbeat.yml and #2081 merged; OS-83 made the heartbeat green | - |
| 125 | CK-3: two board lines, "enforced: yes/no, last checked", sta | 1 PR | DONE-NOW | cockpit-data.py ENFORCE_STALE_MIN = 45 'unknown (stale)' (CK-3) | - |
| 126 | CK-1's ruleset item flips from "not yet" to checked after th | 5 min | FOLDED-V3 | Ruleset waits for an approver (machine user or Approvals), per the 27 Nov correction | TL |
| 127 | Ratify the nightly alarm time (brief 04:00, set 10:00) (adde | 5 min | UNSURE | nightly-watch.py shows no 04:00/10:00 literal. Settle: read the alarm threshold in nightly.yml | TL |
| 128 | After #2073 merges, check Mergify shows the verdicts queue;  | 5 min | DONE-NOW | #2073 merged (edf0687a6); .mergify.yml lists queue 'verdicts' first | - |
| 129 | Mergify priority for near-Proven product PRs | 1 PR | KEEP | OS-50 open; queue order is verdicts, pipeline, product, records only | TL |
| 130 | Change-log upkeep: version 1.2 for C18-C19; stale rows C11,  | 20 min | KEEP | Records upkeep: add v3 changes (machine user, Claude Team, caps) to change log and Library masters | TL |
| 131 | Next version of the Library masters: mark the Team, 40-job a | 1 h | KEEP | Records upkeep: add v3 changes (machine user, Claude Team, caps) to change log and Library masters | TL |
| 133 | Retune the routines' CI brake (30 queued runs) for 500 jobs  | 10 min | UNSURE | Depends on routines (see #122) and the 180-job limit. Settle: read the routine prompts | TL |
| 134 | Restart the usage log and commit the baseline snapshot scrip | 30 min | KEEP | OS-23 open; usage-log.sh dates from early Nov, baseline snapshot script not found | TL |
| 135 | Set the sessions moved to xhigh back to medium; give every h | 10 min | DROP | Sessions and models changed since (P-781 one model set, new accounts); stop-rule dates passed | - |
| 136 | T10 builders on high: the 48-hour stop-rule comparison (revi | 1 h | DROP | Sessions and models changed since (P-781 one model set, new accounts); stop-rule dates passed | - |
| 137 | P-663 daily checkpoint (Proven against the ramp, reason for  | 20 min a day | KEEP | Standing daily checkpoint; morning-report 25 Nov shows the form | TL |
| 138 | Each evening, the day's three biggest time losses with a fix | 15 min a day | KEEP | Standing evening review; why-targets-missed-2026-11-24 is the model | TL |
| 139 | Measure median Built to Proven before and after halving qa t | 30 min | DROP | Dated 17 Nov; replaced by why-targets-missed-2026-11-24 measurements | - |
| 140 | Check the Lead's start read is 70k tokens or less (19 Nov) ( | 15 min | KEEP | OS-16 (#3696) not merged on main | TL |
| 141 | Outside clocks due 18 Nov: AWS domain reminder or Cloudflare | 15 min F | KEEP | AWS domain, BoldSign and Cloudflare clocks still open (outside-dependencies.md); P-821 one-sitting accounts | Founder |
| 142 | Anti-stall review (A130): merge records PR #2068, put its 7  | 30 min | DROP | Anti-stall research superseded by why-targets-missed and OS-27/OS-56 | - |
| 143 | Release the leaked claim branch claim/CS-W3-part-0 (added in | 2 min | KEEP | origin/claim/CS-W3-part-0 still exists | TL |
| 144 | Remove the stale "Lead 34" watchdog line; the first standby  | 5 min | DONE-NOW | STATE.md on main has no 'Lead 34' line | - |
| 145 | Records PRs merged twice a day | standing | DONE-NOW | OS-17 (#3699) merged; records have their own queue (B119) | - |
| 146 | Fix the top flaky suites and the nightly's three reds (c613  | 1-2 PRs | DONE-NOW | Quarantine merged (4748a0c8c, P-832); OS-51 20/20 passes (9da0cbcdc) | - |
| 147 | Dispatch nightly C8.2 + C11.6 once under 20 runs queued; log | 5 min | DROP | One-time dispatch on 17 Nov | - |
| 148 | The founder approves the clean-up plan (phase 2 needs it) (a | 2 min | DONE-NOW | P-674 to P-679 answers and P-759 'Yes, Sunday window'; stages 0, 2a, 8 merged | - |
| 149 | Stage 2a's Done-when before its PR: full suites, Docker imag | runs | DONE-NOW | Stage 2a merged (#2458) | - |
| 150 | Open the stage 1 PR from 86802739a only; the branch head afd | 2 min | CLEANUP | Open stage 1 from the clean head only; #2459 pending (P-838) | Clean-up lane |
| 151 | Confirm the Codex/Goose scout still runs before stage 1 remo | 5 min | CLEANUP | .goose/ and product/scout still on main; confirm before stage 1 | TL |
| 152 | Verify the allow rule for scheduled skills and the self-pace | 10 min | KEEP | Allow rule for scheduled skills and loop not verified | TL |
| 153 | Check /model for "Requires usage credits" before any Fable u | 2 min | KEEP | Check /model on the new Ultra account before any Fable use | TL |
| 154 | Archive Leads 64, 72 and 74 (69 and 70 done 13:5x); delete L | 10 min | DROP | Leads 64, 72, 74 belong to retired series; numbering restarted at Lead 1 | - |
| 155 | Bring the master list, outside-dependency and accounts regis | 20 min | KEEP | Registers need v3 rows (same work as #116, #131) | TL |
| 156 | CI-0a: guards required by path, wider paths, 5 orphan tests  | 1 PR | KEEP | OS-34 open | TL |
| 157 | CI-0b: drop label-guard's workflow_run | 1 PR | FOLDED-V3 | Label-guard family retires when Mergify uses GitHub approval (P-845 (3)) | TL |
| 158 | Read the cause of the startup_failure runs, then fix (added  | 1 PR | DONE-NOW | OS-52 (#3676) merged; startup-failures.py on main | - |
| 159 | CI-A: container proof inside ci and in the merge batch (adde | 1 PR | DROP | CI speed is not the constraint (0 min median job wait); re-list when a measure says so. #198 is built (select-suites.mjs, test-graph.yml) | - |
| 160 | Q2: fast checks first; file-only checks move into kind (adde | 1 PR | DROP | CI speed is not the constraint (0 min median job wait); re-list when a measure says so. #198 is built (select-suites.mjs, test-graph.yml) | - |
| 161 | Q6: shards sized to the work left; nightly shard rebalance ( | 1 PR | DROP | CI speed is not the constraint (0 min median job wait); re-list when a measure says so. #198 is built (select-suites.mjs, test-graph.yml) | - |
| 162 | Q7: gate jobs off the long line | 1 PR | DROP | CI speed is not the constraint (0 min median job wait); re-list when a measure says so. #198 is built (select-suites.mjs, test-graph.yml) | - |
| 163 | F5: fix pr-rules' false failures, start the 2-day clock, the | 1 PR | KEEP | OS-12 / OS-57 open | TL |
| 164 | F11: check-docs fails on a future time; remove the unused m3 | 1 PR | KEEP | OS-35 open; m3-guard.sh still on main | TL |
| 165 | A3 one allow-list door for GitHub writes (curl writes pass t | 1-2 PRs | KEEP | OS-29 / OS-58 open | TL |
| 166 | A5 round counter in label-guard; review brief with round cap | 1 PR | DONE-NOW | review-rounds.yml/.py on main (ENF-783a, two-round cap) | - |
| 167 | A6 touch-list overlap in lane-preflight; migration stamp in  | 1 PR | DONE-NOW | lane-preflight touch-overlap (E10) and migration-slots.py, own-migration-guard on main | - |
| 168 | PR-W: pr-open-guard in pre-push; branch-sweep in lead-watch  | 1 PR | DONE-NOW | pr-open-guard.sh on main; branch-sweep wired into lead-watch (810d0801a) | - |
| 169 | lead-watch and factory-board judge red from ci only; ACT on  | 1 PR | KEEP | OS-22 open | TL |
| 170 | F14: measuring scripts and the board move to GraphQL reads ( | 1 PR | KEEP | OS-61 open, later (speed, not a rule) | TL |
| 171 | Test tooling: Playwright traces as artifacts; a "route twice | 2-3 PRs | KEEP | Product tests built by area lanes | L |
| 172 | V1 capability index, /verify, studio-look; qa skill 8 KB or  | 2 PRs | KEEP | OS-72 verify skill (founder ruling 25 Nov) | L |
| 173 | Fix P-611c and P-312 in the rule-ID map before the next RULE | 15 min | KEEP | RULES.md still names P-611c / P-312 (3 hits) | TL |
| 174 | Instruction-file trims PR A and PR C (RULES D12, S6, S12) an | 2 PRs | KEEP | Instruction-file trims still owed | L |
| 175 | Ultrareview: the 3 free runs only, never --post, on the next | 3 runs | FOLDED-V3 | Code Review (GA) replaces the free ultrareview runs | TL |
| 176 | Routines: a turn cap, a WIP brake, a run log, a starter scri | 1 PR | KEEP | OS-54 open | TL |
| 177 | Burn guards for unattended nights: a push alert at 85%; trim | standing | KEEP | OS-55 open | TL |
| 178 | Weekly reviews: /doctor prompt-audit, any "enforced" rule th | weekly | KEEP | Weekly reviews; low priority | TL |
| 179 | Monday "what's new" check (P-611 (3)); next due 23 Nov (adde | 10 min weekly | KEEP | Next Monday check is 30 Nov | TL |
| 180 | Score the dated forecasts on their dates: F4 18 Nov, F2 21 N | 10 min each | DROP | Forecast dates 18-23 Nov have passed; forecasts re-based by P-842 | - |
| 181 | Points per Proven and per merged PR against the baseline; a  | 1 h | UNSURE | Replaced in part by why-targets and P-837. Settle: does the Lead still want a token split by role | TL |
| 182 | Compare the talk 1 transcript with the official recording be | 20 min | DROP | One-off talk-transcript check; low value | - |
| 183 | T16: record #2062 as a departure (0.6 threshold Sample); Man | records | KEEP | No '0.6 threshold' departure record found in DECISIONS | TL |
| 184 | T17: amend P-203 (skill overflow to its own file), run conso | 1 records PR | UNSURE | P-668 adopted the card; settle by checking P-203's row for the amendment | TL |
| 185 | One founder settings card: the one-week deny-instead-of-prom | 15 min F | KEEP | Founder settings card (deny-instead-of-prompt trial) still open | Founder |
| 186 | Context diet: measure /context first, then rows 1-19 and its | 1 h | KEEP | Context diet; measure /context first | TL |
| 187 | Enforcement plan items beyond steps 1-15: B197/B198 then the | several PRs | KEEP | OS-65 open | TL |
| 188 | Backlog rows still prose in RULES: B193 part 4 WIP script, B | several PRs | KEEP | OS-28 open | TL |
| 189 | Board owed: per-stage Flow measures as ACT lines (P-646); wa | 1-2 PRs | KEEP | OS-53 open | TL |
| 190 | Cloud-environment domains asked by the FO-7s0 lane (help.cli | 5 min | UNSURE | Team cloud environment exists; its allowed domains not seen. Settle: read the environment | Founder |
| 191 | Supply chain: SHA-pinning card (P-583 steps 8-11), report-on | card + rows | FOLDED-V3 | Workflows use @v4 tags, not SHAs; SHA pinning is a v3 security basic (OS-67) | TL |
| 192 | Audits from the decision cards: tamper audit of merges since | days | FOLDED-V3 | Tamper audit and supply-chain audits are v3 security basics | TL |
| 193 | Registry extras (review 2: the property-test library is alre | with #78 | KEEP | Rides with #78 | TL |
| 194 | Clean-up per-stage protocol: announce the empty window, gate | each stage | CLEANUP | Clean-up protocol and later stages (2b, 2c, 5 stubs); not started | Clean-up lane |
| 195 | Clean-up stage 2c: seven files open PRs edit and about 250 f | 2-3 PRs | CLEANUP | Clean-up protocol and later stages (2b, 2c, 5 stubs); not started | Clean-up lane |
| 196 | fromStored() map for stored database paths, plus the live PO | with #64/#65 | CLEANUP | Clean-up protocol and later stages (2b, 2c, 5 stubs); not started | Clean-up lane |
| 197 | Remove stage 5's old-path stubs after 7 days | 1 PR | CLEANUP | Clean-up protocol and later stages (2b, 2c, 5 stubs); not started | Clean-up lane |
| 198 | Affected-only CI for the modular monolith | with #71 | DROP | CI speed is not the constraint (0 min median job wait); re-list when a measure says so. #198 is built (select-suites.mjs, test-graph.yml) | - |
| 199 | Dated founder items: Enterprise first payment 1 Dec; the Ult | per item | KEEP | Enterprise first payment 1 Dec; Ultra price decision | Founder |
| 200 | Private home: pointer README in proof-copy-api, P-677 and §5 | 20 min | FOLDED-V3 | Private-home pointer and copies belong to the private-repository move | TL |
| 201 | CI cost follow-ups (decide at #79): Namespace open-source pr | 1 h | DROP | CI speed is not the constraint (0 min median job wait); re-list when a measure says so. #198 is built (select-suites.mjs, test-graph.yml) | - |
| 202 | Anti-stall fixes still open: away-flag hook, launchd heartbe | several PRs | KEEP | OS-27 / OS-56 open | TL |
| 203 | Cards 8b and 8c to the founder: re-run a failed shard once a | 2 cards | DONE-NOW | P-832: 4 flakiest suites quarantined and P-822 blocks (founder A386) | - |
| 204 | Next-week list from the blank-sheet design: features.json, p | cards | KEEP | Later; gated until batch failures fall under 15% | TL |
| 205 | Hourly wake of stalled cloud lanes by the lane starter (adde | 1 PR | DONE-NOW | OS-49 (#3674) merged: a merge posts a comment that wakes the lane | - |
| 206 | Backlog rows owed since 15 Nov: FO-2's qa53 decorator-call s | 10 min | DONE-NOW | BACKLOG.md on main names qa53 (2 hits); other rows unverified | - |
| 207 | A best-in-class design review per module in the Prove Lead's | per module | KEEP | Per-module design review in the Prove walk | TL + qa |
| 210 | Desk 03's pipeline review draft needing a fresh challenge (a | - | DROP | 14 Nov desk draft overtaken (review 2 left it unverified) | - |
| 213 | Lint rule content for the T14 PR: bulk suppressions so only  | with #76 | KEEP | After #76 | L |
| 214 | Edit-loop lint hook: PostToolUse on Edit/Write runs eslint o | 1 PR + 1 line | KEEP | OS-62 open; after #76 | L |
| 215 | Every check and lint rule prints the rule id, the reason, th | small, per check | KEEP | OS-37 open; with #78 | L |
| 216 | Performance budgets as checks: STANDARDS §9 budgets become a | 1-2 PRs | DONE-NOW | OS-73 (#3729) merged LCP/CLS budgets; query budget per route remains | - |
| 217 | Scorers deterministic first: one grader library shared by CI | 1 PR | KEEP | One grader library; after #77's replacement | L |
| 218 | A private trace store: each lane's transcript and tool log k | 1 script | KEEP | Later; gated until batch failures fall under 15% | TL |
| 219 | Factory changes tested before they merge: skill, agent-promp | 1 PR | KEEP | OS-63 later | TL |
| 220 | The five human jobs (steer, approve, restrict, check, start) | records, 30 min | KEEP | Later; gated until batch failures fall under 15% | TL |
| 221 | Outer loop that finds and files, never fixes: a nightly read | 1 routine | KEEP | Later; gated until batch failures fall under 15% | TL |
| 222 | Reviewer, breaker and qa sessions get read-only tokens; a se | card | FOLDED-V3 | Read-only tokens for reviewers fit the machine user and Approvals setup (OS-64) | TL |
| 223 | Property and race tests where the money is: fast-check (pinn | 1-2 PRs | KEEP | After #76 | L |
| 224 | qa walks recorded in CI (added by Lead 80, 18 Nov, founder a | 1-2 PRs | DONE-NOW | walks.yml, walk-report.yml, item-proof.yml on main (ENF-733 walks on merge) | - |
| 225 | Patch the 9 high dependency security alerts GitHub flags on  | 1 lane, 1-2 PRs | KEEP | studio-audit.yml is report only; no patch PR found | L |
| 226 | Staging on AWS in Canada (ca-central-1), created from files  | 2-3 days | DONE-NOW | Staging live: alarm email confirmed (P-818); deploy-synth.yml (PF-8a) | - |
| 227 | Production on AWS in Canada from the same files as staging ( | with 226 | KEEP | No production evidence on main | TL + Founder |
| 228 | Automatic deploy: a merge to main deploys to staging; produc | 1 PR | KEEP | No deploy workflow on main (synth only); OS-71 | TL |
| 229 | Error and uptime monitoring on staging and production (tool  | 1 PR | DONE-NOW | Staging alarm confirmed (P-818); production part rides #227 | - |
| 230 | Nightly database backups and one restore actually tried | 1 PR + a drill | KEEP | No evidence on main (no restore drill, no RC tag, no flags, no incident process) | TL |
| 231 | Release candidate: cut RC1 from main, version tags, release  | half a day | KEEP | No evidence on main (no restore drill, no RC tag, no flags, no incident process) | TL |
| 232 | Full qa walk of RC1 on staging before v1.0 | 1 day | KEEP | No evidence on main (no restore drill, no RC tag, no flags, no incident process) | TL |
| 233 | Privacy and data-residency review before the first firm's re | - | KEEP | No evidence on main (no restore drill, no RC tag, no flags, no incident process) | TL |
| 234 | Feature flags per firm (SA-12) | - | KEEP | No evidence on main (no restore drill, no RC tag, no flags, no incident process) | TL |
| 235 | On-call and incident process | - | KEEP | No evidence on main (no restore drill, no RC tag, no flags, no incident process) | TL |
| 236 | Product analytics | - | KEEP | No evidence on main (no restore drill, no RC tag, no flags, no incident process) | TL |
| 237 | Guard review: each of the 28 guards with the incident it pre | read-only review | KEEP | Tunes wait for the founder; guard-review file not on main | TL + Founder |

## Top 10 KEEP items to do next, in order

1. #225: Patch the 9 high dependency alerts: a security gap on a public repo, one small lane PR, no dependencies.
2. #40 / v3 urgent (FOLDED-V3): Require approval for outside workflow runs and limit xr-mac: the Mac is reachable from the public repo; founder click, minutes.
3. #116 / #155: Accounts register rows (Enterprise, org, Mergify org, Claude Team, machine user, Ultra): cheap and prevents lost accounts.
4. #120: Builder skill opens PRs as draft; Code Review and Steward skip drafts, so fix before v3 reviews are useful.
5. #163 then #164: Fix pr-rules false failures and check-docs/m3-guard: both block the ruleset and graduate checks (OS-12, OS-35).
6. #62 / #150 / #151: Land clean-up stage 1 (#2459): it only deletes files the tag keeps; confirm the scout first.
7. #76: Lint tools (eslint, typescript-eslint, react-hooks): nothing exists on main and #213-#215, #223 wait on it.
8. #134 / #137: Usage baseline and daily checkpoint: gives the numbers v3 needs to size caps and prove the change.
9. #227, #228, #230: Production from the same files, automatic staging deploy, nightly backups plus a tried restore: the release gap after staging is live.
10. #87 / #143 / #56: Housekeeping: 2,289 remote branches, leaked claim branch, curl without -L: small, removes noise from lead-watch.
