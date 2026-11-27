# Full-power plan, review 1: what was missing, what was wrong (17 Nov 2026)

Written 15:10-15:4x IST 17 Nov (Lead 78 correction: committed 15:45; "16:30" was an estimate) (clock: `TZ=Asia/Kolkata date`, 15:36 at the GitHub read) by an independent completeness reviewer for the tech lead, on the founder's asks A164-A165 and P-690. The reviewer did not write the plan. Nothing was committed, pushed, labelled or sent. GitHub reads: 4 search calls at 15:3x IST (merged PRs since 12:30 IST: only #2077; open: #2032, #2065, #2080, #2081).

**Window:** the founder widened it to the last 76 hours (from about 11:00 IST 14 Nov): DECISIONS P-596 to P-690, history files of 14-17 Nov, the Library, the design pages, the clean-up plan and the side notes. Every item below names a source file and line with a short quote. Nothing is added without one.

**Result:** 103 items added (#110-#212). 4 items moved to another bucket. 21 items or passages fixed. The plan now has 212 items: A 32, B 15, C 63, D 77, E 25.

Abbreviations (line numbers as of `7b08abc7b` on `lead/2026-11-07-lead31`, 15:3x IST; DECISIONS now starts with P-690 at line 6, so a row P-n sits at line 696-n down to P-636):
**DEC** `DECISIONS.md` · **ST** `STATE.md` · **RU** `RULES.md` · **H/** `history/` · **ES**, **OP**, **CI**, **FM**, **LOG** the five `library/` masters (engineering-system, engineering-operating-model, ci-pipeline-strategy, agent-failure-modes, engineering-change-log) · **CL** `design/org-move-checklist-enterprise-2026-11-17.md` · **ML** `design/setup-master-list-2026-11-17.md` · **EP** enforcement-plan · **R1** release1-operating-model · **UR** unattended-running · **GR** governance-research · **RE** rule-enforcement-research · **CD** context-diet-research · **OD** `design/outside-dependencies.md` · **AR** `design/accounts-register.md` · **NQ** night-queue · **CU** the clean-up plan, `git show origin/claude/repo-cleanup-plan-05e345:…/design/repo-cleanup-plan-2026-11-17.md` at `d738232e1` · **SN** `~/Library/Application Support/Claude/side-session-notes/` · **FS** `SN/local_fa783599-baa3-4c70-9368-851b7312c152/founder-setup/` · **AS** `SN/local_9ae95739-227d-49dc-a332-03c706a6d512/anti-stall-review-2026-11-17.md` · **DC** `SN/local_9ae95739-227d-49dc-a332-03c706a6d512/lead74-a150-engineering-system/decision-cards.md` · **SK** `.claude/skills/` at the repository root.

Owners: **F** founder · **TL** tech lead · **SA** founder setup agent · **L** a lane · **BK** board keeper.

---

## 1. Missing items

### Bucket A: before the transfer (now by 09:30 IST 18 Nov, unless drained at 18:30)

| ID | Purpose in plain words | Source (quote) | Why A | Owner | Est. |
|---|---|---|---|---|---|
| 110 | Every open PR either finishes or is named in the P9 in-flight block; the Build Leads' open-PR lists are the input | DEC:36 P-660 "every open PR finishes or is listed in the P9 block"; ST:22 "lists by 19:30/20:00" | The founder's condition for the move: no work lost | TL | 20 min |
| 111 | Sweep for work that exists only locally before the freeze: PF-6 part 2a and FO-2b branches not on GitHub, qa case-side stray branch | H/STATE-2026-11-17-1405-lead77s2-asks-A159-A161-rows.md:7 "PF-6 part 2a branch not on origin"; FS/step1-claude-ai-cleanup-2026-11-17.md:14 "possible unpushed work" | P-557: nothing lives only in a session | TL | 20 min |
| 112 | Disk margin for fresh lanes after the move (a standby was blocked below 7 GB) | H/STATE-2026-11-17-1515-lead78s2-asks-A162-A163-rows.md:5 "blocked by disk 6.6 GB (< 7)" | R4 starts fresh lanes; check before the freeze | TL | 10 min |
| 113 | Read false blocks and auto-mode pauses after the deny-line paste, at 16:30 and 20:30 | DEC:26 P-670 "reads false blocks and auto-mode pauses at 12:30, 16:30 and 20:30 IST"; ES:302 | Dated today; a false block could stop the drain | TL | 10 min each |
| 114 | The 18 Nov 08:00 Proven report against the 13-16 forecast, with slip reasons; the evening forecast re-measure | ES:339 "Report Proven against 30 and against 13-16, with slip reasons"; R1:59 "The forecast is re-measured each evening" | Falls before the 09:30 move | TL | 20 min |
| 115 | A two-minute going-away checklist for the founder before he leaves tonight | AS:137 "A 2-minute going-away checklist" | He is away and back for the move | F with TL | 2 min |
| 116 | Accounts register rows for the Enterprise, the org, the Mergify org and Namespace | AR:22 "every new outside account gets a row here the day it is created" | Overdue since 17 Nov 11:05; part of the move inventory | TL | 10 min |
| 117 | Write the rate-limit facts in STATE (REST stays per user; the GITHUB_TOKEN figure under Enterprise) | CL:270 "Write down in STATE that rate limits do not grow" | Checklist P11, not in the plan | TL | 5 min |
| 118 | Have the rollback steps F1-F4 ready to run, not only the trigger (#14) | CL:421 "freeze again (B1 to B3, C1);" | A rollback at night must not be improvised | TL | 10 min |
| 119 | Answer the Claude app's pending permission update on GitHub | FS/p8-settings-record-2026-11-17.md:10 "a permission update request is pending" | The app must work on the new path (D1) | F (SA) | 2 min |
| 135 | Set the sessions moved to xhigh back to medium; give every helper an explicit model and effort | ES:208 "Set them back to medium."; ES:206 | Due 10:30 17 Nov, no record that it was done | TL | 10 min |
| 148 | The founder approves the clean-up plan (phase 2 needs it) | CU:3 "plan approval and the Lead's go pending" | Ask in tonight's minutes so C is not blocked | F | 2 min |

### Bucket B: after the transfer, queue still off

| ID | Purpose | Source (quote) | Why B | Owner | Est. |
|---|---|---|---|---|---|
| 121 | Re-point the auto-mode and settings lines that name the old path; drop the old path later | DC:270 "Re-point after the move (the auto-mode lines name the old path)."; LOG:24 | Only possible once the new path exists | TL; F pastes | 10 min |
| 122 | Re-point the three lane-starter routines, which read the night queue from the Lead branch | NQ:3 "read this file from branch `lead/2026-11-07-lead31`" | With D3, before routines are un-paused; also blocks #88 | TL | 5 min |
| 123 | Read the Namespace trial end date and price during the settings compare | FS/p8-settings-record-2026-11-17.md:27 "No trial end date is shown anywhere we could read" | Needed for #85 | TL | 5 min |

### Bucket C: first 24-48 hours

| ID | Purpose | Source (quote) | Why C | Owner | Est. |
|---|---|---|---|---|---|
| 120 | Fix the builder skill and the night queue so PRs open non-draft after Approve (they still say draft) | SK/next/SKILL.md:25 "gh pr create --draft --base main"; NQ:8 "open the PR as a **draft**"; DEC:13 P-683 | Before R4 starts fresh lanes; skill edit at the founder's typed turn | TL; F word | 15 min |
| 124 | CK-2 heartbeat: dispatch the first run after #2081 merges, confirm one green run and a clean conformance check, read the first two summaries | SN/local_c3e4ea74-99af-4b49-a4a8-d4c6b6b916db/ck-builder-notes.md:22 "confirm one green run on main"; ST:20 "dispatch its first run after merge" | Follows #46 | TL | 15 min |
| 125 | CK-3: two board lines, "enforced: yes/no, last checked", stale after 45 min | FS/checks-brief.md:20 "Stale over 45 min shows \"unknown (stale)\"" | The founder's view of enforcement (A154) | BK | 1 PR |
| 126 | CK-1's ruleset item flips from "not yet" to checked after the move | FS/checks-brief.md:6 "tolerate \"not yet\" until move day" | Only true after the transfer | TL | 5 min |
| 127 | Ratify the nightly alarm time (brief 04:00, set 10:00) | FS/HANDOVER.md:26 "Nightly alarm threshold 10:00 IST (setup agent decision" | Two values in two files | TL | 5 min |
| 128 | After #2073 merges, check Mergify shows the `verdicts` queue; mark P-664 enforced | LOG:27 "Mergify shows a `verdicts` queue"; RU:143 "(.mergify.yml priority owed)" | First merges | TL | 5 min |
| 129 | Mergify priority for near-Proven product PRs | OP:178 "Priority for near-Proven **product** PRs: a `.mergify.yml` PR" | Speeds Proven, a merge-flow fix (P-214) | TL; L | 1 PR |
| 130 | Change-log upkeep: version 1.2 for C18-C19; stale rows C11, C12, C16; rows for CK, P-688/P-689 and the transfer | LOG:11 "C17 added"; FS/engineering-change-log-2026-11-17.md:22 "PR #2077 (head 91719a6)" | A154: every pipeline change gets a row | TL | 20 min |
| 131 | Next version of the Library masters: mark the Team, 40-job and dated-plan lines superseded; daily refresh | ES:394 "The next version follows tomorrow's 08:00 report and the move."; ES:340 | The masters still recommend Team (ES:251, ES:303) | TL | 1 h |
| 132 | Update RULES' account facts (still "Pro, 40 jobs") after the move | RU:5 "GitHub Pro, 40 Actions jobs at once" | Wrong after R1 | TL | 5 min |
| 133 | Retune the routines' CI brake (30 queued runs) for 500 jobs | NQ:3 "Over 30: reply" | After the peak-jobs reading (#43) | TL | 10 min |
| 134 | Restart the usage log and commit the baseline snapshot script | ES:326 "Restart the usage log. Commit the baseline snapshot script."; SN/local_9ae95739…/lead74-a149/synthesis.md:387 "stops at 15 Nov 22:04" | The +24/+48 h readings (#52) need it | TL | 30 min |
| 136 | T10 builders on high: the 48-hour stop-rule comparison (review rounds, CI rounds, plan points) | DEC:30 P-666 "stop rule at 48 h comparing review rounds, CI rounds and plan points"; ES:309 | Due about 19 Nov 11:30 | TL | 1 h |
| 137 | P-663 daily checkpoint (Proven against the ramp, reason for a miss, what changes), the resource plan, a priced card if the Claude plan cannot carry it | DEC:33 "a daily checkpoint (the day's Proven against the ramp" | The ramp starts 19 Nov; only admission is in the plan (#44) | TL | 20 min a day |
| 138 | Each evening, the day's three biggest time losses with a fix each | R1:50 "every evening the Lead lists the day's three biggest time losses" | Standing since P-644 | TL | 15 min a day |
| 139 | Measure median Built to Proven before and after halving qa time (due 17 Nov) | DEC:56 P-640 "median hours Built→Proven before and after ... checked 17 Nov" | Overdue | TL | 30 min |
| 140 | Check the Lead's start read is 70k tokens or less (19 Nov) | DEC:81 P-615 "a Lead's start read 70k tokens or less (desk F13, 60%, check 19 Nov)" | Dated 19 Nov | TL | 15 min |
| 141 | Outside clocks due 18 Nov: AWS domain reminder or Cloudflare; BoldSign or Signority; Stripe test keys | OD:7 "remind him when PF-8a's PR opens or on 18 Nov"; OD:14 "decide by 18 Nov"; DEC:78 P-618 "BoldSign -> Signority on 18 Nov" | Dated 18 Nov; P-618 alarm | F; TL card | 15 min F |
| 142 | Anti-stall review (A130): merge records PR #2068, put its 7 decisions to the founder one at a time, then tick A130 | H/STATE-2026-11-17-1022-lead74s2-lead74-now-block.md:7 "its 7 decisions go to the 10:30 batch"; ST:28 "A130 stall research still owed" | Still owed; the 10:30 batch did not take them | TL; F | 30 min |
| 143 | Release the leaked claim branch `claim/CS-W3-part-0` | AS:117 "claim/CS-W3-part-0 leaked" | Routines skip a claimed row | TL | 2 min |
| 144 | Remove the stale "Lead 34" watchdog line; the first standby is the watchdog | ST:54 "Watchdog: first standby (Lead 34 once Lead 33 tells it)"; AS:105 | Wrong text in the start read | TL | 5 min |
| 145 | Records PRs merged twice a day | ES:229 "merged twice a day"; CI:284 | Fewer records batches in the queue | TL | standing |
| 146 | Fix the top flaky suites and the nightly's three reds (c613 still in the nightly list, b78 timeout) | CI:129 "fix the top flaky (bk5 start, c95)"; H/STATE-2026-11-17-1255-lead76s2-nightly-and-asks-A137-A149.md:3 "re-measure at tonight's nightly" | Batch failures cost the most after the move | L | 1-2 PRs |
| 147 | Dispatch nightly C8.2 + C11.6 once under 20 runs queued; log qa Minors QA-504-506 | H/STATE-2026-11-17-1435-lead78s2-takeover-note.md:3 "dispatch nightly C8.2 + C11.6 on the checkpoint once under 20 runs queued" | Becomes possible on 500 jobs | TL | 5 min |
| 149 | Stage 2a's Done-when before its PR: full suites, Docker image answering `/api/health`, `start.sh` demo smoke | CU:372 "the Docker build of `studio/Dockerfile` with the image answering `/api/health`" | Gate on #63 | L | runs |
| 150 | Open the stage 1 PR from `86802739a` only; the branch head `afd4d2e2c` is the held 1b commit | CU:369 "`afd4d2e2c` (**held**)"; `git log origin/cleanup/stage-1-archive-october` | A PR from the head would remove `commercial/` before the private copy | TL | 2 min |
| 151 | Confirm the Codex/Goose scout still runs before stage 1 removes its launch entries | CU:109 "Lead to confirm it still runs" | Before #62 | TL | 5 min |
| 152 | Verify the allow rule for scheduled skills and the self-paced loop before the unattended proof run | GR:116 "Verify the allow rule exists."; GR:117 | Either can silently stop the 30-min check (#53) | TL | 10 min |
| 153 | Check `/model` for "Requires usage credits" before any Fable use outside the desk | SN/local_9ae95739…/lead74-a149/synthesis.md:383 "Check the `/model` picker for a \"Requires usage credits\" label" | P-643: no extra usage | TL | 2 min |
| 154 | Archive Leads 64, 72 and 74 (69 and 70 done 13:5x); delete Lead 74's 0.4 GB snapshot | ML:15 "Lead 64 refused (still has a Remote Control client"; ML:17 "Lead 74's 0.4 GB snapshot" | Housekeeping and disk | TL | 10 min |
| 155 | Bring the master list, outside-dependency and accounts registers up to date (they feed this plan, P-690) | ML:3 "The tech lead updates this file at every change."; OD:5 "Status (15 Nov 21:5x IST)" | ML still shows done items as "Needs you" | TL | 20 min |
| 173 | Fix P-611c and P-312 in the rule-ID map before the next RULES records PR | OP:226 "Fix before the next records PR" | check-docs would fail the records PR (#49) | TL | 15 min |
| 177 | Burn guards for unattended nights: a push alert at 85%; trim lanes over 4%/h after 22:00 | OP:199 "Fallback: a push alert at 85%"; DC:231 "Above 4% an hour after 22:00 the tech lead trims lanes" | The first full-power night | TL | standing |
| 180 | Score the dated forecasts on their dates: F4 18 Nov, F2 21 Nov, F3 23 Nov, the desk's own; standing against 101 on 29 Nov | DEC:90 P-606 "F4 18 Nov (nightly parts < 50 min, 70%)"; DEC:99 P-597 "carry a probability and a check date"; ES:311 | F4 falls on 18 Nov | TL | 10 min each |
| 200 | Private home: pointer README in proof-copy-api, P-677 and §5c copies confirmed in expat-ready/private, daily public mirror refresh | DEC:17 P-679 "gets a pointer README"; DEC:18 P-678 "moves the private copies named in P-677 and the operating-model §5c there" | P-557 hard rule | TL | 20 min |

### Bucket D: later

| ID | Purpose | Source (quote) | Owner | Est. |
|---|---|---|---|---|
| 156 | CI-0a: `guards` required by path, wider paths, 5 orphan tests | OP:167 "F6 `guards` required by path, wider paths, 5 orphan tests" | L | 1 PR |
| 157 | CI-0b: drop label-guard's `workflow_run` | OP:168 "F12 drop label-guard's `workflow_run` (CI-0b)" | L | 1 PR |
| 158 | Read the cause of the startup_failure runs, then fix | OP:169 "Read the cause first; fix in one lane PR" | L | 1 PR |
| 159 | CI-A: container proof inside `ci` and in the merge batch | OP:166 "`ci` calls it for code batches (CI-A)"; CI:127 | L | 1 PR |
| 160 | Q2: fast checks first; file-only checks move into `kind` | CI:140 "Fast checks first"; OP:137 | L | 1 PR |
| 161 | Q6: shards sized to the work left; nightly shard rebalance | CI:144 "Shards sized to the work left"; SN/local_28bf6046-9c98-4f67-8b04-7f1801873579/ci-speed-audit-2026-11-17.md:71 | L | 1 PR |
| 162 | Q7: gate jobs off the long line | CI:145 "Gate jobs off the long line" | L | 1 PR |
| 163 | F5: fix pr-rules' false failures, start the 2-day clock, then required (P-635 (3)) | OP:129 "fix the false failures, start the 2-day clock"; DEC:60 | TL; L | 1 PR |
| 164 | F11: check-docs fails on a future time; remove the unused `m3-guard.sh` | OP:246 "F11 check-docs fails on a future time"; OP:247 | L | 1 PR |
| 165 | A3 one allow-list door for GitHub writes (curl writes pass the gh deny lines); A7 push before stop; A10 actionlint/zizmor later | OP:248 "A3 one allow-list door for GitHub writes"; FS/private-out/operating-model-5c-guard-gaps-2026-11-17.md:3 | L | 1-2 PRs |
| 166 | A5 round counter in label-guard; review brief with round caps (3 review, 2 CI-fix) | OP:147 "A5: round counter in label-guard"; DC:405 "a three-round review cap and a two-round CI-fix cap" | L | 1 PR |
| 167 | A6 touch-list overlap in lane-preflight; migration stamp in pr-rules | OP:177 "A6: touch-list overlap in lane-preflight" | L | 1 PR |
| 168 | PR-W: pr-open-guard in pre-push; branch-sweep in lead-watch | OP:127 "PR-W: `pr-open-guard.sh` in pre-push" | L | 1 PR |
| 169 | lead-watch and factory-board judge red from `ci` only; ACT on any failed gh call | OP:186 "`lead-watch red()` and `factory-board` read `ci` only"; AS:138 | L | 1 PR |
| 170 | F14: measuring scripts and the board move to GraphQL reads (precondition of the hook paste #72) | OP:170 "Move `app-code-prs.sh` and the board (about 150 REST calls a run) to GraphQL"; DEC:41 P-655 | L | 1 PR |
| 171 | Test tooling: Playwright traces as artifacts; a "route twice" race suite; a screen-text and overflow check, report-only first | OP:139; OP:138 "Then a \"route twice\" suite"; OP:140 | L | 2-3 PRs |
| 172 | V1 capability index, `/verify`, studio-look; qa skill 8 KB or less; BUGS rows by capability ID | OP:157 "V1: a generated capability index of about 15 KB"; OP:156 | L; TL | 2 PRs |
| 174 | Instruction-file trims PR A and PR C (RULES D12, S6, S12) and the other start-read trims | OP:108 "Draft instruction PRs A, B, C"; SN/local_9ae95739…/lead74-a142-operating-model/instruction-files-plan.md:171 | TL | 2 PRs |
| 175 | Ultrareview: the 3 free runs only, never `--post`, on the next money, schema or permission PRs | OP:148 "**the 3 free runs only, never `--post`**" | TL | 3 runs |
| 176 | Routines: a turn cap, a WIP brake, a run log, a starter script; quiet PRs resumed first | OP:196 "KEEP; add a turn cap"; ES:152; AS:116; AS:136 | TL | 1 PR |
| 178 | Weekly reviews: `/doctor prompt-audit`, any "enforced" rule that broke again, the permission-refusal log and top stall cause, a prompt audit at each model change | OP:197; ES:310; FM:304 "Log permission refusals and hand over the top stall cause each week"; FM:300 | TL | weekly |
| 179 | Monday "what's new" check (P-611 (3)); next due 23 Nov | DEC:85 "Every Monday (IST) the Lead or a read-only watcher checks"; GR:143 | TL | 10 min weekly |
| 181 | Points per Proven and per merged PR against the baseline; a one-day token split by role | ES:308; OP:368 "One-day token split by role" | TL | 1 h |
| 182 | Compare the talk 1 transcript with the official recording before quoting it | ES:307 "Compare our talk 1 transcript with the official recording" | TL | 20 min |
| 183 | T16: record #2062 as a departure (0.6 threshold Sample); Manitoba stays Sample | ES:265 "Record it as a departure from the requirements"; DC:211 | TL | records |
| 184 | T17: amend P-203 (skill overflow to its own file), run consolidate-memory, operating model master in the board Library | DEC:28 P-668 "T17 amend P-203 (skill overflow to its own file)"; OP:404; OP:406 | TL; F 10 min | 1 records PR |
| 185 | One founder settings card: the one-week deny-instead-of-prompt trial, blockWritesOutsideWorkingDirectories, CLAUDE_CODE_SUBAGENT_EFFORT, the sandbox key, the security update | ES:273 "A one-week trial of deny-instead-of-prompt"; GR:114-123; DEC:85 P-611 | F | 15 min F |
| 186 | Context diet: measure `/context` first, then rows 1-19 and its five founder questions; settle Drive (needed in required-tools, off in the diet) | CD:17 "Check this first with `/context`."; CD:182-200; CD:215 | TL; F | 1 h |
| 187 | Enforcement plan items beyond steps 1-15: B197/B198 then their settings lines, hook 18 weekly judgment audit, measures at 3 and 7 days, the daily read of every block, later linters, health owner fields, a conditional health-keeper lane | EP:10 "need the founder's settings lines once they merge"; EP:197; EP:233 "Compared after 3 days and 7 days"; EP:234; EP:223; EP:267; EP:284 | TL; L | several PRs |
| 188 | Backlog rows still prose in RULES: B193 part 4 WIP script, B194 hot-file split, B198, B200, B201 tests, B199 part 2 fewer test parts | RU:127-128 "prose (B193, B194)"; RU:130; RU:133; RU:134; R1:23 | L | several PRs |
| 189 | Board owed: per-stage Flow measures as ACT lines (P-646); wait-time targets met or missed (P-619 (8)) | DEC:50 "Next (owed): the board's per-stage Flow measures"; RE:75 | BK | 1-2 PRs |
| 190 | Cloud-environment domains asked by the FO-7s0 lane (help.clio.com, central.xero.com, help.lawpay.com): the founder's call | DEC:49 P-647 "help.clio.com, central.xero.com, help.lawpay.com on the cloud environment: the founder's call" | F | 5 min |
| 191 | Supply chain: SHA-pinning card (P-583 steps 8-11), report-only dependency audit, shape SEC-1 (Dependabot alerts) | DEC:113 P-583 "steps 8-11 by PRs (SHA pinning"; DEC:25 P-671 "Not changed on purpose: SHA pinning"; H/STATE-2026-11-14-1350-lead44s2-old-hand-over-block.md:11 "SEC-1 to shape (Dependabot 28 open, 8 high in the app)" | TL; F | card + rows |
| 192 | Audits from the decision cards: tamper audit of merges since 10 Nov, seeded defects and canaries, a factory manifest, third-party memory hooks, the self-hosted Mac runner on a public repository | DC:407 "A read-only tamper audit of PRs merged since 10 Nov"; DC:408; DC:409; DC:339; DC:486 | TL; F | days |
| 193 | Registry extras: a property-test library proposal, the founder names CR-11's paths, the INVARIANT tag decision, fix or demote a false block within 2 days | FM:550; FM:571 "let the founder name the paths he wants to see"; FM:341; FM:519 "fixed or demoted within 2 days" | TL; F | with #78 |
| 194 | Clean-up per-stage protocol: announce the empty window, gate checks (CI, check-docs, board, `start.sh` demo smoke, stale paths), PATHS-MOVED and change-log rows, rebase guide, restart lanes and routine prompts after stage 5, compare job lists | CU:201 "The Lead announces the window"; CU:202; CU:204; CU:237; CU:236; CU:239; CU:241 | TL; L | each stage |
| 195 | Clean-up stage 2c: seven files open PRs edit and about 250 folder-counting tests, in 2-3 PRs | CU:384 "the ~250 tests that count folders switch to the finder" | L | 2-3 PRs |
| 196 | `fromStored()` map for stored database paths, plus the live POC data, in stage 2b/3 | CU:356; CU:385 "with `fromStored()` and the live POC data (7.1)" | L | with #64/#65 |
| 197 | Remove stage 5's old-path stubs after 7 days | CU:220 "removed in a later PR" | L | 1 PR |
| 198 | Affected-only CI for the modular monolith | CU:63 "run the tests of the modules a PR touches"; DEC:14 P-682 "affected-only CI" | TL; L | with #71 |
| 199 | Dated founder items: Enterprise first payment 1 Dec; the Ultra price in the spend master; interaction limit renewal about 17 May 2027; outside-account rows OD 2, 3, 5-7 and AR 3-5, 7-9, 12 | FS/founder-answers-2026-11-17.md:12 "next payment 1 Dec"; SN/local_fa783599…/spend/spend-master.json:10; FS/p8-settings-record-2026-11-17.md:50 "until about 17 May 2027"; OD:8-13; AR:9-18 | F; TL | per item |
| 201 | CI cost follow-ups (decide at #79): Namespace open-source program, `workflowSizeGuideline: small`, caches for dependencies and the database, an nproc measure | CI:166 "Apply to Namespace's open-source program"; CI:185; SN/local_28bf6046…/ci-capacity-options-2026-11-17.md:77; SN/local_28bf6046…/ci-speed-audit-2026-11-17.md:73 | TL; F | 1 h |
| 202 | Anti-stall fixes still open: away-flag hook, launchd heartbeat with a push test, retire the P-402 local line, items.py ingests lane questions, generated module-card lines, questions without a Lead number, RULES "Enforced by" for five rules | AS:108; AS:109 "run from a Mac launchd job"; AS:110; AS:112; AS:131; AS:135; AS:151 | TL; F paste | several PRs |
| 203 | Cards 8b and 8c to the founder: re-run a failed shard once and requeue; auto-quarantine a suite that passes only on retry | AS:133 "Auto-quarantine a suite that passes only on retry twice in 24 h"; AS:134; ES:231 | F | 2 cards |
| 204 | Next-week list from the blank-sheet design: features.json, permission tests, a born-flaky check, auto-revert, graduated autonomy | SN/local_9ae95739…/lead74-a146/gap-and-migration.md:347 "a born-flaky check, auto-revert" | TL | cards |
| 205 | Hourly wake of stalled cloud lanes by the lane starter | UR:21 "Hourly wake of stalled cloud lanes" | TL | 1 PR |
| 206 | Backlog rows owed since 15 Nov: FO-2's qa53 decorator-call scan, CS-C1a's two follow-ups | H/STATE-2026-11-15-1850-lead60s2-check-1840-and-feed-lines.md:5 "Still owed to BACKLOG" | TL | 10 min |
| 207 | A best-in-class design review per module in the Prove Lead's walk | R1:58 "a best-in-class design review per module is added" | Prove Lead | per module |

### Bucket E: superseded or dropped (added so nothing reappears)

| ID | Item | Source (quote) | Why |
|---|---|---|---|
| 208 | Spend card on the board | DEC:15 P-681 "the board card is not built now" | Parked by the founder |
| 209 | The Anthropic support message (T15) | H/STATE-2026-11-17-1255-lead76s2-asks-A155-A157-rows.md:5 "support message not needed" | The founder dropped it (A157) |
| 210 | Desk 03's pipeline review draft needing a fresh challenge | H/STATE-2026-11-14-1350-lead44s2-old-hand-over-block.md:11 "desk 03's pipeline review draft 1 needs a fresh challenge" | Overtaken by Engineering System v1 (P-668); reviewer's inference |
| 211 | Gmail check at every session start | DEC:63 P-633 "No start-of-session Gmail check" | P-633 amends P-620 |
| 212 | 30 Proven by 08:00 18 Nov | DEC:33 P-663 "Replaces \"30 Proven by 08:00 IST 18 Nov\"" | Replaced by the ramp |

---

## 2. Items in the plan that were wrong, stale, duplicated or mis-bucketed

| # | Finding | Evidence | Fix made |
|---|---|---|---|
| 1, 2 | N1-N9 are done, not open | ST:12 "**N1-N9 all GO**"; FS/enterprise-n-checks-2026-11-17.md:16 "Overall: no blocker found in N1-N9." | Moved A → E (done); TL records them |
| 6 | The C1 wording fix is done | CL:310 now reads "set as the first step after C2 ... Lead 78 correction"; commit `8b154f0dc` | Moved A → E (done) |
| 8 | The record is not in `local_f6824017…/org-move-p8/` (that folder does not exist); it is in founder-setup's notes | FS/p8-settings-record-2026-11-17.md (14:19-14:24 IST) | Status: record exists; copy it to the private home with `private-sync.sh` |
| 9 | The screenshots were replaced by text records | FS/p8-settings-record-2026-11-17.md:3 "Text records instead of screenshots" | Status: likely met; the founder confirms in one line |
| 18 | #2073, #2075 and #2079 were labelled at 14:00; none merged | H/STATE-2026-11-17-1435-lead78s2-takeover-note.md:3; GitHub read 15:36 IST: only #2077 merged since 12:30 | Status updated |
| 45 | The daily target is the P-663 ramp, not P-644's 10/10 | DEC:33 P-663; R1:31 still says 10/10 | Text corrected; #137 added |
| 46 | CK-3 was missing; the founder already marked #2080 and #2081 ready | H/STATE-2026-11-17-1405-…:5 "**#2080 and #2081 marked ready by the founder, checked 13:11**" | #124-#127 added |
| 51 | Wrong line: the batch-failure step is FM:545, not FM:546-547 | FM:545 "Then settle the batch-failure measure** (CR-14's first step)" | Citation fixed |
| 60, 62, 63 | The branches are built (Doing). The clean-up plan's revised order is 0 → 2a → 1 → 1b, not 0 → copy → 1 → 2a. No PR opens before the Lead's word after the first merges | CU:378-383 (§7.3); CU:374 "open only on the Lead's word, after the move is verified" | Status, order and §3.2 corrected; #149-#151 added |
| 13 (line) | Wrong commit: the plan cites CU at `7d3cb7174`; the branch head is `d738232e1` | `git log -1 origin/claude/repo-cleanup-plan-05e345` | Fixed |
| 72 | The hook paste depends on F14 (GraphQL reads), which had no row | OP:296 "F14 has merged, or `lead-read-guard.sh` exempts non-sensitive PRs" | Dependency noted; #170 added |
| 73 | The "four questions" were answered on 16 Nov | DEC:60 P-635 (four defaults accepted) | Text corrected |
| 85 | #2032 is still open, unlabelled | GitHub read 15:36 IST | Status confirmed; #123 added |
| 88 | A fresh Lead branch would break the routines, which read the night queue from the Lead branch | NQ:3 | Dependency on #122 noted |
| 89 | The support contact is not needed | H/STATE-2026-11-17-1255-lead76s2-asks-A155-A157-rows.md:5 "support message not needed" | Text corrected; #209 in E |
| 94 | Wrong line: the move window is OP:85, not OP:83 | OP:85 "Organization move window, if yes" | Citation fixed |
| 103 | Done items still read "Needs you" in the master list | ML:27-37 | #155 added (upkeep) |
| 108 | W6 is not "no action": the batch yes chose "no Fable for specifying lanes until W4's replay", which changes P-608 (3) | DEC:28 P-668 "W6 the desk stays Fable high, no Fable for specifying lanes until W4's replay"; ES:277 "One change to decide" | Moved E → D; the records change is folded into #90 |
| 109 | It said the open parts of the dated plans were only #51, #54, #55 and #57; many more had no row | OP:80, OP:127-248; ES:326-336 | Text corrected; #156-#176 added |
| §4 | The timeline assumed a 19:00 transfer tonight. The move is now planned for 09:30 IST 18 Nov (P-689: undrained at 18:30 means wait); at 15:35 nothing had merged since 13:27 | DEC:7 P-689; ST:14 "no merge since 13:27" | The timeline is re-dated with tonight as the conditional path |
| six lines | The counts and the "tonight" wording are out of date | this review | Rewritten |

**Checked and left as they are:** #7 (Lead 78 started 13:56, after the 11:48 edit); #55 (still Unverified: no open or merged PR titled CI-B found by the GitHub search at 15:36 IST); #84, #92 to #97.

**Conflicts for the tech lead, not settled here:** Drive is listed as needed (`design/required-tools.md`:8) but the context diet turns it off (CD:189). #2075's change-log row still says "unlabelled until the founder has seen the diff" (LOG:28), but P-672 records his "approve #2075" and it was labelled at 14:00. In the three-talks verdict, "merge only through the queue" (SN/local_9ae95739…/lead74-a150-engineering-system/three-talks-verdict.md:259) conflicts with P-214 hand merges.

---

## 3. Sources I could not read, or read only in part

* **Talk transcripts** (`talk1-3-transcript.txt`, `lead74-a147/talk*-coded.md`): not read on purpose (they name speakers; copyright). Their actions come from the a147 and a150 syntheses and the Library.
* **Large research folders, read by headings or targeted sections only:** a146 lenses and blank-sheet design; a147 research and forum files; a149 lenses and model matrix; a142 operating-model drafts and baseline §3; a150 `reconcile.md` beyond §0-5; desk-06 files of 15 Nov (overtaken by P-606).
* **`RULES.md` lines 13-124:** searched for owed, prose-only and dated cells, not read line by line.
* **Org-move checklist:** the step lists §A-§G were read; its Sources section was not.
* **History files of 14 Nov (45 files) and 15 Nov before about 15:00:** searched for owed, still open and waiting lines, not read one by one (the founder's 48-hour fallback for drift risk). Two 14 Nov items came from this search (#191's SEC-1, #210).
* **Product steering kept out of scope:** night-queue and lane-start rows (QA-498q, PF-12b, AS-2d1/d2, QA-53k due 23 Nov, CS-W3 part 0), the AUD-4s part 2 start (P-687) and the CICC records-retention by-law. These are product rows: they live in BACKLOG and the night queue, not in this engineering plan.
* **Not verified on GitHub:** whether #2068, #2058, #2071 and #2085 are still open; the CI-B PR's number; the Dependabot count today. Reads were kept to 4 calls (REST is shared).
* **Older board items** (P-596 data trust, P-602 plan % per delivered row, P-615 (5) behaviour numbers): status not checked. They are board features of 14-15 Nov, not pipeline actions, so they were not added.
