# Engineering Operating Model
Version: 1.1
Updated 20 Nov 2026 · owner: the tech lead · status: living master

How we code, test, review, prove, merge and run unattended: best practice, our numbers, today's changes and what proves them (A144). Board Library row: "Engineering operating model".

## Change log
| Version | Date (IST) | Change |
|---|---|---|
| 1.0 | 17 Nov 2026 | First master, assembled from the engineering operating model draft, version 2 (17 Nov 2026, 09:5x IST) |
| 1.1 | 20 Nov 2026 | Refresh against the feeds changed since 17 Nov 13:26 IST (workflows and `.mergify.yml` on main at 156057c4a, `.claude/settings.json` on main, RULES.md on the tech lead's branch as of P-752): "Since 17 Nov" notes under 3.5, 3.6, 3.7, 4, 5, 5a and 5b mark what landed or changed, and new section 12 describes how work flows on 20 Nov (CI jobs, merge queue, hooks, permissions, rules), each fact with its PR, commit and decision row. The 17 Nov plan text above is kept as it was. |

**About the source.** Draft version 2, 17 Nov 2026, 09:5x IST (clock from `TZ=Asia/Kolkata date`, 09:41 IST at the start of that revision). Asked for by the founder in A141, A142 and A144. It replaces the CI research's day-by-day plan (research §13, "day 2-5") with one plan on today's clock, followed by measurement. Version 2 took in two independent critiques of version 1 (both "ready with fixes"). It was read-only work: nothing was changed on GitHub or in the repository, nothing was run, and nothing was spent.

Known gaps are tracked privately by the tech lead.

**Source key** (every number names one):

| Tag | Source |
|---|---|
| [B] | `out/baseline.md`, measured 08:01-08:58 IST. It contains [R7] (every `ci` run from 10 Nov 05:57 to 17 Nov 08:04 IST, 2,521 runs), [LIVE] (Actions API, 08:01 IST), [MQ] (30 failed batches, 11-15 Nov), [G] (GraphQL, 08:58 IST), [CAP] and [BUGS] (`qa/CAPABILITIES.md`, `qa/BUGS.md` on main fc0971103), [FC] (`design/release1-forecast-2026-11-16.md`) |
| [RV2] | `out/rules-v2-draft.md` and `out/idmap.tsv` |
| [CK] | `out/checks-plan.md` |
| [IF] | `out/instruction-files-plan.md` |
| [TK] | `out/talk-a143.md` |
| [P30] | `out/proven-30-plan.md` |
| [TL] | `out/tools-options.md` |
| [R] | `design/ci-pipeline-strategy-2026-11-17.md` on `origin/research/ci-pipeline-2026-11-17`, §1-14 |
| [OWN] | my own reads, 09:26-09:50 IST: `cockpit/library.json`, `cockpit/index.html`, `.mergify.yml` on main, DECISIONS rows by number, `git rev-list` on the tech lead's branch |
| [C1], [C2] | the two critiques of version 1 (17 Nov, 09:3x-09:4x IST) |

**Official sources.** Paraphrased in my own words, with one short quote (the quoting limit). Rows marked "re-read" I read myself on 17 Nov 2026 at 09:4x IST; the others were read on 17 Nov 2026 by the agents that wrote [R], [CK], [IF], [TK], [TL] or the critiques.

| Ref | Page | What it says (paraphrased) | Read |
|---|---|---|---|
| O1 | code.claude.com/docs/en/best-practices | A line Claude keeps ignoring belongs in a hook. Ask for evidence. Keep CLAUDE.md to what the code cannot say. | 17 Nov 2026 |
| O2 | code.claude.com/docs/en/permissions | Deny is checked first; an allow cannot override a deny. Deny rules accept globs in the tool-name position (they then match every connector). | re-read 17 Nov 2026 |
| O3 | code.claude.com/docs/en/hooks | Hook output is capped at 10,000 characters. The `if` filter is best effort; use the permission system for a hard allow or deny. A hook that cannot start, with `onFailure: block`, blocks the action. PostToolUse cannot block: the tool already ran. | re-read 17 Nov 2026 |
| O4 | code.claude.com/docs/en/memory | CLAUDE.md is context, not enforcement; under 200 lines. Path-scoped rules load only when touched. Audit for conflicts. | 17 Nov 2026 |
| O5 | code.claude.com/docs/en/skills | Supporting files load only when needed. Skill edits apply in the same session. | 17 Nov 2026 |
| O6 | code.claude.com/docs/en/sub-agents | `skills:` preloads skills into a subagent. | 17 Nov 2026 |
| O7 | code.claude.com/docs/en/claude-code-on-the-web | Auto-fix acts when a check fails or a reviewer comments, and pushes a fix if one is clear. Its replies are labelled as Claude Code. Cloud sessions count toward the plan's usage limits. Auto-fix needs the Claude GitHub App. | re-read 17 Nov 2026 |
| O8 | code.claude.com/docs/en/permission-modes | Auto mode: a classifier reviews actions; trusted infrastructure is named in `autoMode.environment`. | 17 Nov 2026 |
| O9 | code.claude.com/docs/en/cloud-environments | A Limited network allows only listed hosts. Network secrets stay outside the sandbox. | 17 Nov 2026 |
| O10 | code.claude.com/docs/en/code-review | The managed review comments only; it never approves or blocks. | 17 Nov 2026 |
| O11 | docs.mergify.com/merge-queue/parallel-checks | A failed check cancels and restarts every check stacked on it. | 17 Nov 2026 |
| O12 | docs.github.com/en/actions/reference/limits | Jobs at once: Free 20, Pro 40, Team 60, Enterprise 500. The page does not say whether this is per account, organization or enterprise. GitHub Support can raise the limit on a support ticket. | re-read 17 Nov 2026 |
| O13 | github.com/pricing | Team about US$4 and Enterprise about US$21 per user a month. Minimum seats, term and annual billing not checked. | 17 Nov 2026 |
| O14 | docs.github.com (reusing workflows) | `workflow_call` lets a workflow be called; the called workflow sees the caller's context. | 17 Nov 2026 |
| O15 | docs.github.com/en/repositories/creating-and-managing-repositories/transferring-a-repository | Issues, PRs, webhooks, services, secrets and deploy keys go with the repository; old links redirect. The page says nothing about Actions variables, environments or GitHub App installations. With over 100 clones or Actions uses in the prior week, "GitHub permanently retires the owner name and repository name combination". | re-read 17 Nov 2026 |
| O16 | eslint.org/docs/latest/use/suppressions | Old violations can be suppressed in bulk, so only new ones fail. | 17 Nov 2026 |
| O17 | react.dev/learn/you-might-not-need-an-effect | Effects are an escape hatch; not needed for derived data or events. | 17 Nov 2026 |
| O18 | react.dev/reference/eslint-plugin-react-hooks | The recommended preset includes `exhaustive-deps` and `set-state-in-effect`. | 17 Nov 2026 |
| O19 | anthropic.com/engineering/building-effective-agents | Add complexity only when it shows better outcomes. | 17 Nov 2026 |
| O20 | anthropic.com/engineering/effective-harnesses-for-long-running-agents | Agents test as a user would, against a feature list where each item starts failing. | 17 Nov 2026 |
| O21 | anthropic.com/engineering/harness-design-long-running-apps | QA was about 8% of one harness's cost; parts were dropped as models improved. | 17 Nov 2026 |
| O22 | fast-check.dev | Property tests, and a scheduler for race conditions. | 17 Nov 2026 |
| O23 | docs.github.com (protected branches and rulesets) | Server-side rules for required checks, no force-push and no deletion. | 17 Nov 2026 |

---

## 1. Summary for the founder

1. **Where we are.** 11 of 101 Release 1 capabilities are Proven [CAP]. A PR check takes 91 min at the median and 176 at p90 since 16 Nov noon, against 54 / 134 over the week [R7]. At 08:01 all 40 machines were busy and 116 jobs queued [LIVE]. 23% of merge batches failed over the week, 73% of those on clashes [R7, MQ]. 57% of PR-check minutes are 2nd and later runs [R7].
2. **A structural fault.** The start hook prints 12,215 characters, over the 10,000 cap, so each session sees only a short preview [IF]. Known gaps are tracked privately by the tech lead.
3. **The target.** Jobs start within 5 min. PR check back to 54 min or less. Under 15% of batches fail. Approved to merged under 1 h. 1-2 hand-overs a day. Built to Proven 12 h or less [B].
4. **What starts today (no "day 2-5").** Every change below starts today. Lane PRs started at 09:45 merge at about **13:30-14:00 at the median and 16:30 or later at p90**, before batch failures (23-32%) [R7, B]. Changes stacked on others land this evening or overnight. Only the readings wait (+2 h, +24 h, +48 h).
5. **What waits for your yes at 10:30.** Eleven items reverse or change one of your earlier decisions. Nothing that does is acted on before your yes (section 8). Until then lanes start under P-462 as it stands, nothing is removed, and CI-B is built but not labelled.
6. **What is not today.** Auto-fix. It waits for a separate reviewer identity and its other preconditions (section 3.8).
7. **The 30-Proven truth.** About **13-16 by 08:00 tomorrow at today's rates** [B]. About **16 only if** the move and queue changes land by about 12:00 and qa runs 3-7 times faster than any measured case [P30]. The ceiling is 21. 30 is not reachable with the gates intact (P-651 (2)). It becomes credible around 20 Nov at 7 a day, or around 23 Nov at 2.5 a day [P30].
8. **Cash.** Not settled until you choose a plan (section 8, item 1). Team route: about US$4 a month. Enterprise route: about US$21-63 a month. Both exclude a possible Mergify charge after the move and any Enterprise minimum or annual term (all estimates; not checked) [TL, C2].

---

## 2. Today's timeline (IST)

Merge times are estimates from today's medians: build 30-60 min, open to first Approve 0.52 h [B], PR check 91 / 176 min, batch 81 min plus 5 min wait [R7]. Each batch has a 23-32% chance to fail and repeat [R7]. An organization move in the middle adds about 1 h (estimate).

| Time | Who | What | Depends on |
|---|---|---|---|
| 09:45 | tech lead | Start lanes under P-462 as it stands (no cap yet): CI-0b, PR-W, CI-A, metrics-off-REST, records-label fix, Mergify priority for near-Proven product PRs, CI-B (built only). Dispatch the nightly. Restart `usage-log` | nothing |
| 09:45-10:00 | tech lead | Read 2 days of `pr-rules` results; separate records PRs and batch heads from real false failures | nothing |
| 10:00 | tech lead | Rule the six [P30] §7 questions | nothing |
| 10:30-12:00 | founder + tech lead | The 10:30 session (section 9), about 75-90 min (estimate) | nothing |
| 10:35 | founder | Deny lines into the Mac copy (if yes) | item 3 |
| about 11:00-12:00 | founder, tech lead | Organization move window, if yes: 10-min push freeze, transfer, inventory re-pointed, one cloud lane push test, Mergify plan check | item 1 |
| about 11:45 / 13:15 | tech lead | Mergify priority PR (near-Proven product PRs only): own check passes (median / p90); merged under P-214 as a merge-flow fix | own check |
| about 13:30-14:00 / 16:30+ | queue | CI-0b, PR-W, A4, metrics-off-REST, records-label fix, settings PR merge (median / p90) | queue |
| about 14:30-17:00 | founder | Hook paste U1-U5 into the Mac copy | tools path fixed (2.0), REST fix merged, Stop timeout raised |
| about 15:00 / 18:00 | queue | CI-A (median / p90) | queue; land before #2032 or rebase #2032 |
| about 15:30-16:30 / 19:00+ | queue | L1 lint PR (lockfile; runs every suite) | L0 yes |
| 12:30, 16:30, 20:30 | tech lead | +2 h readings: false blocks from hooks and deny lines | changes live |
| about 19:00-21:00 / overnight | queue | CI-B (one full check after the Approve), only if Q1 and Q5 are yes | CI-A merged; Q1, Q5 |
| 22:00-04:00 | tech lead | No hand-over if avoidable. Lane count trimmed if plan burn is over 4%/h (section 2.8) | plan burn |
| 01:53 / 02:15 | nightly | Nightly fires; tech lead checks it | - |
| 18 Nov 08:00 | tech lead | Proven report against 13-16 forecast and 30 asked | - |
| 18 Nov 09:00, 12:00; 19 Nov | tech lead | Daily refresh; +24 h and +48 h readings; keep or undo | - |

### 2.0 The tech lead's own time

One owner cannot do the 09:45-13:00 work in parallel [C2]. So:

| Work | Owner | Window |
|---|---|---|
| Start lanes, nightly, `pr-rules` read, six [P30] rulings | tech lead | 09:45-10:15 |
| Prepare the 10:30 cards | tech lead | 10:15-10:30 |
| 10:30 session and move checklist | tech lead with the founder | 10:30-12:00 |
| Read every `.github` diff (P-423) and add labels | tech lead | from 12:00, about 10-15 min a PR (estimate), 7+ PRs |
| Draft instruction PRs A, B, C (stop-check blocks lanes from these files) | a standby Lead copy on the Mac (P-446 standby) | 10:00-12:30 |
| QA-165 on the Mac | a local qa lane | 09:45-10:45 |

**The tools-path prerequisite ([OWN], re-checked 09:4x IST).** Five guard scripts are on main but not on the tech lead's branch `lead/2026-11-07-lead31`: `ist-time-guard.py`, `lead-read-guard.sh`, `wip-guard.py`, `queued-push-guard.sh`, `lead-act-check.sh`. That branch is **1,944 commits behind origin/main and 1,367 ahead**. Hooks run the scripts of the copy's checked-out branch; a missing script with `onFailure: block` blocks every matching call (O3). Two options:
* **Option 1:** a fresh `lead/2026-11-17` from origin/main, carrying the branch's unmerged records. This is a large merge, and its records PR lands through the lowest-priority queue (B119). Estimate 1-3 h of tech-lead time plus queue time.
* **Option 2 (recommended):** keep the branch. Point the hook lines at a read-only checkout of origin/main kept beside the copy and refreshed by the tech lead. No merge needed (estimate; the tech lead tests one hook first).

Either way, before the paste: `test -f` each script path in the checkout the hook will use.

---

## 3. End to end, stage by stage

**Who:** "tech lead now", "founder at 10:30", "builder lane PR". **When:** IST today, median / p90 where it is a merge.

### 3.1 Coding (builders)

| Practice (source) | Baseline (source) | Change | Who | When | Metric |
|---|---|---|---|---|---|
| Rules that must always hold go in the permission system; hooks help but their `if` filter is best effort (O1, O2, O3) | P-302 broken 17 times, P-606 6, P-423 3, P-557 2 (13-16 Nov) [RV2, CK] | (a) Deny lines (section 5a). (b) Hook lines U1-U5: warnings and second defence, not counted as enforcement. (c) PR-W: `pr-open-guard.sh` in pre-push, `branch-sweep.sh` in lead-watch (E-13) | (a) founder 10:30; (b) founder after 2.0 and the REST fix; (c) builder lane PR | (a) 10:35 Mac; cloud lanes after the settings PR, about 13:30-14:00 / 16:30+, then a session restart. (b) about 14:30-17:00. (c) about 13:30-14:00 / 16:30+ | Breaks per rule, 13-16 Nov against 18-20 Nov. Server-side gates: count separately from hooks |
| Fast checks in the edit loop; old violations suppressed in bulk (O1, O16-O18) | No linter on main. 24 dead `eslint-disable`. 68 API files call `new Date()`. 172 `useEffect` in 78 web files [TK] | L0 install yes. L1: one lint PR, `--suppress-all`, `noInlineConfig`. L2: PostToolUse lint of the edited file, as feedback only (it cannot block, O3) | L0 founder; L1 builder lane PR; L2 founder paste | L1 starts 11:00, merges about 15:30-16:30 / 19:00+. A lockfile PR runs every suite, so it costs **more** than the 1,280 machine-min average per code PR [R7]. L2 only after the tech lead times it under about 1 s a call (P-635 speed rule); else rules without type information only | New violations per PR: 0. Suppression count only falls. PRs red on their own check: 32% [R] → under 15% (target is an estimate) |
| Small, single-purpose PRs (P-610) | Median 647 lines, p90 1,250; 10 of 30 over 800 [B] | F5 `pr-rules` required: **conditional**. P-635 (3) asks for 2 days with no false failure. [B] counts 19 `pr-rules` failures on queued and batch heads at 08:58 while `ci` was green or queued; 3 open PRs red, all records PRs [C2]. So: fix the false failures, start the 2-day clock, keep it advisory. When required, it goes in `queue_conditions` only, never `merge_conditions` (a batch of 6 is over 800 lines) | tech lead read 09:45; fix in a lane PR | Not required today, likely | False `pr-rules` failures: 0 for 2 days, then required |
| Unattended lanes: auto mode and one Limited cloud environment (O8, O9) | A prompt waited 7.4 h on 7 Nov; lanes wait on network changes (P-647) [R §11] | Founder creates the environment himself (P-387). Hosts: github.com and api.github.com, registry.npmjs.org for installs from the lockfile only, the demo host, canada.ca. **npm is not named in `autoMode.environment`**, so the classifier does not approve new package installs (STANDARDS §1 gate). **No paid AI key** as a network secret (no-live-switch rule; P-643). Every secret named on the card | founder at 10:30 | 11:00-11:20 | Lane stalls and auto-mode pauses a day |
| No more lanes than CI and qa can carry ([R] §8c) | Lanes uncapped (P-462) [RV2] | Cap at 10-12 code lanes, **needs the founder's yes (Q4)**. Until then P-462 stands | founder at 10:30 | after the yes | Queued jobs against lanes running |

### 3.2 Tests

| Practice (source) | Baseline (source) | Change | Who | When | Metric |
|---|---|---|---|---|---|
| Cheap checks first (O1) | 6,555 shard-min a week after a part-1 failure; `kind` 1.9 / 3.5 min [R7] | Q2: file-only checks move into `kind` (CI-A) | builder lane PR; tech lead reads the diff | about 15:00 / 18:00 | Shard minutes after a part-1 failure → about 0 at +48 h |
| Property tests; a race scheduler (O22) | Races and 500s: 37 titles. QA-278: 48 opens at once, 25 errors [TK]. `fast-check` only indirect [TL] | Pin `fast-check` 3.23.2 (already in the lockfile) [TL]; 4.x later. Then a "route twice" suite | builder lane PR | Pin with L1. Suite starts 13:00 | Race and 500 findings a day |
| Keep evidence of failed tests | Re-runs 9% of machine minutes; flaky 13% of failed batches [R7, MQ]. No traces kept [TL] | Playwright traces of failed suites as artifacts; pin `playwright` 1.64.1 | builder lane PR | starts 11:00 | Re-run share falls |
| One visible-text check ([TK] §2 row 5) | 27 titles on raw keys on screen, 144 on words [TK] | T1: one screen-text and overflow check, report-only first | builder lane PR | report-only on tonight's nightly; enforced from 18 Nov 09:00 | New hits: 0 |

### 3.3 Review

| Practice (source) | Baseline (source) | Change | Who | When | Metric |
|---|---|---|---|---|---|
| An independent reviewer that asks for evidence (O1, O6, O20) | Rounds median 2, p90 6. 10 of 30 PRs labelled more than once [B]. Reviewer reads 52 KB. Verdict words conflict [IF] | One reviewer with screen and code paths; Approve or Block; skills preloaded (PR A). If Q1 is yes: Approve needs green fast checks and the reviewer's own journey run; the full suites run after. A red full check means a fix push, a new sha, and a new Approve | standby Lead copy drafts; tech lead merges | about 14:00 / 17:00 | Rounds per PR ≤2 |
| At most two rounds, then the tech lead rules (P-293 (3)) | 4 PRs past two rounds [RV2] | A5: round counter in label-guard; ACT line in lead-watch | builder lane PR | this evening | PRs past 2 rounds: 0 |
| A machine review only comments (O10) | 10 of 12 Majors after review not visible in one diff [TL] | No purchase. Ultrareview: **the 3 free runs only, never `--post`**. After them it bills usage credits [TL], which P-643 forbids | tech lead | next 3 money, schema or permission PRs | Real bugs found that ours missed (n of 3) |
| The bot labels on the rules (P-637) | Approve to label p90 2.0 h [B]. Skills still tell builders to label [IF] C7 | Skill fix (PR A); CI-0b | builder lane PR | about 13:30-14:00 / 16:30+ | Approve to label ≤30 min at p90 |

### 3.4 QA

| Practice (source) | Baseline (source) | Change | Who | When | Metric |
|---|---|---|---|---|---|
| Test as a user, against a list where each item starts failing (O20) | Built to Proven median about 35 h (n=4); 2.5 Proven a day [FC] | Five qa lanes by journey group, walks written ahead, start on each merge signal [P30] | tech lead | 09:45 | Proven a day; Built to Proven ≤12 h |
| Read only what the task needs (O4, O5) | qa start read about 253 KB, 171 KB of it BUGS [IF] | BUGS rows by capability ID; qa skill ≤8 KB (PR A) | standby Lead copy | about 14:00 / 17:00 | qa start read about 59 KB |
| One shared vocabulary (O20) | CAPABILITIES.md 425 KB [TK] | V1: a generated capability index of about 15 KB, a `/verify` recipe, `studio-look` | builder lane PR | starts 13:00 | qa minutes per walk |
| Fix the inner loop first (O19, O21) | 32% of code PRs red on their own check [R] | Explore loop LATER, once that falls under 15% | - | not today | - |

### 3.5 CI

| Practice (source) | Baseline (source) | Change | Who | When | Metric |
|---|---|---|---|---|---|
| Enough machines that jobs start at once (O12, O13) | 40 of 40 busy, 116 queued at 08:01 (a jam snapshot, not steady demand). Job wait PR median 14, p90 46 min [LIVE, R7]. [R] projects Team plus Q1 and Q2 at about 33 of 60 machines in the 16 Nov busy hours | **Needs the founder's yes:** Team (P-652) plus a GitHub Support ticket, or Enterprise (reverses P-652). Section 9 item 1 | founder at 10:30 | 11:00-12:00 | Jobs start within 5 min; PR check ≤54 / 134 min at +24 h |
| One full PR check per PR, run once ([R] D2) | 57% of PR-check minutes are re-runs (63,309 of 111,514) [R7] | Q1: suites wait for `Reviewer: Approve <sha>` (CI-B). **Built from 09:45; not labelled until Q1 and Q5 are yes** | builder lane PR; tech lead reads the diff | about 19:00-21:00 / overnight | Re-run share under 30% at +48 h |
| Container proof inside the required check (O14) | Container proof never runs on what reaches main (QA-449, Major) [CK] | `skeleton.yml` callable; `ci` calls it for code batches (CI-A) | builder lane PR | about 15:00 / 18:00 | `ci / container` green on every code batch |
| The checks that matter are required (O23) | Mergify requires `ci`, `xfa-engine`, `queue-fresh` [CK] | F6 `guards` required by path, wider paths, 5 orphan tests (CI-0a, without F3 and F5) | builder lane PR | about 13:30-14:00 / 16:30+ | A red guard test stops a merge |
| No machines for runs that do nothing | label-guard sweeps after every `ci` run [CK] | F12 drop label-guard's `workflow_run` (CI-0b) | builder lane PR | about 13:30-14:00 / 16:30+ | Comment-run workflows a day |
| Checks must start | 47 `records-label` and 37 `label-guard` suites with `startup_failure` [B] fault 7 (cause unread) | Read the cause first; fix in one lane PR. records-label routes records PRs, so this bears on Proven | builder lane PR | read 09:45; fix this afternoon | `startup_failure` suites a day: 0 |
| The pipeline measures itself (O1) | 11 of 15 metrics have no tool. REST budget at 0 from 08:19 to 09:02 and again at 08:58 [B] | Move `app-code-prs.sh` and the board (about 150 REST calls a run) to GraphQL. A8 hourly `pipeline-metrics.yml`. `baseline-snapshot.py` committed without raw JSON | builder lane PR | REST fix about 13:30-14:00 / 16:30+; A8 this evening | REST budget never at 0; 15 metrics each hour |

**Since 17 Nov (refresh 20 Nov).** The CI plan above is partly superseded; the plan text stays as the 17 Nov record.
* "One full PR check per PR, run once" (Q1, CI-B, P-665) was not built as written. Built instead, on P-651 (2): a builder's PR runs only the fast checks (`kind`, `fast`, `types`); the suites on the parts, the packs by diff, the protected regression set and gate B's named packs run once, on the merge-queue batch (#2151, commit 3911fa145, merged 19 Nov 01:45 IST).
* Then a full run before the label (CI-PRE, P-731): `/run full` starts main's `ci.yml` by `workflow_dispatch` on the PR's head merged with main, and queue-gate and label-guard need it green (#2249, merged 19 Nov 22:46 IST). P-733 (4) narrowed it to PRs that failed a batch; P-743 set the repository variable `FULL_RUN_FROM` to 20:00 IST 22 Nov, so heads approved before then need no full run (change log C35, C36).
* The type check has an 8 GB heap (#2250, change log C30); batch suites run on 18 parts, was 8 (#2282, change log C31).
* Records rules (check-docs.sh, decision-impact.sh) run on the PR only, skipped in a merge-queue run (ENF-746c, #2410, P-746, change log C38).
* Scheduled workflows were re-registered after the org move, and label-guard and queue-gate can be started by hand (#2176, commit 479ed84b6). The label sweep gets REVIEWERS again, since the owner is now the organisation (#2209, commit 1a79efda5).
* `pr-rules` lets records-only PRs pass `pr-size` (#2086, P-686) and checks a "Completes: R1.n" line (#2233). It is still not a required check: RULES P-606 and P-610 say "not yet a required check".

### 3.6 Merge

| Practice (source) | Baseline (source) | Change | Who | When | Metric |
|---|---|---|---|---|---|
| Fewer stacked batches while failures are high (O11) | 23% failed over 7 days, 32% on 16 Nov; 10 of 30 failed batches were cascades [R7, MQ] | `max_parallel_checks: 2` until failures stay under 15% for 24 h. **Reverses P-224 (5) (founder, 1 Nov: up to 3). Needs his yes** | founder at 10:30, then a lane PR | after the yes | Failed batches under 15% at +24 h |
| Stop clashes before the queue | 73% of failed batches were clashes [MQ] | A6: touch-list overlap in lane-preflight; migration stamp in pr-rules (E-17) | builder lane PR | this evening | Clash share |
| Closest to done goes first ([R] D7) | #1961 waited 18.1 h and #1956 14.5 h for a first machine; Approved to merged median 1.98 h [B]. `.mergify.yml` has no priority rules [OWN] | Priority for near-Proven **product** PRs: a `.mergify.yml` PR, merged by the tech lead under P-214 once its own check passes. **qa verdict records PRs first reverses B119 / P-376 (1). Needs his yes** | builder lane PR; founder for records | about 11:45 / 13:15 | Approved to merged under 1 h |
| Server-side protection of main (O23) | Known gaps are tracked privately by the tech lead. | Ruleset, exactly: required status `ci`; block force-push; block deletion. **Not** GitHub's "require merge queue" (Mergify is our queue), **not** a review requirement (P-423), **not** "require branches up to date". P-214 kept | founder at 10:30 | after the move | Force-push and delete refused; merges unchanged |

**Since 17 Nov (refresh 20 Nov).** The card `max_parallel_checks: 2` was not applied. Instead:
* Mergify runs `mode: parallel` with one files scope per fenced module (platform, front-office, money, case-side, forms-engine), plus `migrations` and `pipeline` lanes (capacity 1 each, money 1 too) and barrier files that serialize the queue. Batch size is 2, was 6, with at most 2 failure-resolution rounds (#2207, merged 19 Nov 16:59 IST; P-715, P-717).
* `max_parallel_checks` went from 3 to 6 (#2290, merged 19 Nov 22:11 IST; P-739, lifting P-730's hold; change log C33).
* qa verdict records PRs go first through a new queue `verdicts`, which takes PRs labelled `records`, titled `qa:` and changing qa/CAPABILITIES.md (#2073, merged 17 Nov 19:23 IST; P-664; change log C11).
* Pipeline-only PRs have their own queue `pipeline` and never share a batch with product (P-717 (a)).
* queue-gate's gate job runs on the Mac runner xr-mac (#2145; change log C29). Emergency hand merges stay allowed for a pipeline fix while the queue is broken (P-691; change log C30, C31).

### 3.7 Main

| Practice (source) | Baseline (source) | Change | Who | When | Metric |
|---|---|---|---|---|---|
| Main stays green, shown nightly (O1) | No nightly since 16 Nov 05:31 IST [B] | `/run nightly` now; check the 01:53 run | tech lead | 09:45, 02:15 | One nightly a night |
| Judge red only from the deciding check | A FAILURE rollup came from gate jobs while `ci` was green [B] fault 3 | `lead-watch red()` and `factory-board` read `ci` only; count Release 1 Proven | builder lane PR | afternoon | False red alarms: 0 |
| Demo after every merge | 7 of 7 green; lag median 0.8 min [B] | KEEP | - | - | Within 10 min |

**Since 17 Nov (refresh 20 Nov).**
* The nightly gained a restore drill job: dump, restore and check on the pinned PostgreSQL every night (#2014, merged 18 Nov 18:39 IST; PF-8r).
* `pipeline-heartbeat.yml` checks every 30 min, outside every session, that the approved set-up is in force and the pipeline moves. It is read-only and mails the owner on red (#2081, merged 18 Nov 19:47 IST; CK-2).
* `walks.yml` records gate A walks on GitHub's machines (#2133, merged 18 Nov 23:08 IST; P-700).
* `item-proof.yml` proves an item automatically at its last merge (#2233, merged 19 Nov 19:55 IST; P-728 (3), P-729 (1); change log C32).

### 3.8 Operations (long unattended runs)

| Practice (source) | Baseline (source) | Change | Who | When | Metric |
|---|---|---|---|---|---|
| Remove structure a stronger model no longer needs (O19, O21) | 143 rule rows, 25 KB. 44 tech leads in 5 days; 10 hand-overs on 16 Nov [RV2, B] | RULES v2 (section 4). Lead-continuity trial: compaction onto STATE (D10) **reverses P-446 (1) and (6): needs Q3**. Fable 5.2 as Lead (D11) **reverses P-605 / P-608: its own card** | founder at 10:30 | after the yes | Leads a day 1-2 |
| A loop that never stalls (O3) | A check stalled 7.4 h on 7 Nov; burn log stale since 15 Nov 22:04 [RV2, B] | Restart `usage-log`. Raise the Stop-hook timeout to about 60 s ([R] §9e) **before** adding `lead-act-check.sh` | tech lead; founder paste | 09:45 log; timeout with the hook paste | Checks over 40 min late: 0 |
| Auto-fix on lane PRs (O7) | Lanes slept through red CI (P-557, 2 breaks). 9 PRs idle over 90 min with no CI pending, 3 of them known holds, so 6 or fewer unexplained [B] | **LATER, not today.** Before any canary: a separate reviewer identity (A9, T7 Option B), then a test on a scratch PR. Known gaps are tracked privately by the tech lead. | tech lead; founder for the App and identity | after A9 | PRs red over 1 h with no push |
| Headless routines with a turn cap ([R] §11) | Hourly routines take rows (P-645) | KEEP; add a turn cap | tech lead | 12:00 | Routine runs with no push |
| Self-measurement and audit (O4) | 21 contradictions, 14 stale references [IF] | A8 hourly numbers; daily refresh; weekly `/doctor prompt-audit` | tech lead | 09:00 daily | Contradictions open: 0 |
| Wide parallel agents only for read-only work ([R] D9) | CI and qa are the limits [R] | Ultracode off as a standing setting | tech lead | now | Tokens per read-only job |
| Plan capacity (P-643) | 3.2%/h overnight, **5.8%/h** at 07:12-08:35 with research running [B] | At 5.8%/h from the 10:30 reset, the 96% line comes about **03:00 IST 18 Nov**, in the night (estimate). At 3.2%/h, about 16:30 IST 18 Nov. Fallback: a push alert at 85%; above 4%/h after 22:00 the tech lead trims lanes to the near-Proven ones; P-643's manual reset stands | tech lead | from 10:30 | Plan % an hour ≤3% |

**Stalls still possible in a long unattended run** [C2]: idle cloud lanes do not wake on messages and need the prompt box; the message cap; records-queue starvation (B119); REST budget at 0; plan burn at night. Each has a lead-watch line or an owner above.

**Why the windows.** Every change starts today; only readings wait. **+2 h:** false blocks show at once. **+24 h:** one day and night of load; the batch failure rate needs about 60 batches (66 ran on 16 Nov [R7]). **+48 h:** re-run share needs finished PRs (opened to merged 6.37 h median [G]). Keep a change only if its metric moves toward the target and Proven a day, open Majors, batch failures and red-on-main do not get worse.

### 3.9 Undo for each change

| Change | Undo | Owner |
|---|---|---|
| Organization move | No full undo: the old owner/name pair may be retired for good (O15). Step back = stay on the new owner, re-point apps; a second transfer back is possible but not under the same name if retired | founder |
| Enterprise purchase | Downgrade path, term and minimum seats unverified: read them on the purchase page before paying | founder |
| Ruleset | Disable the ruleset in the browser (one switch) | founder |
| Deny and hook lines | Remove the lines from the Mac copy; revert the settings PR | founder; tech lead opens the revert |
| L1 lint PR | Revert PR; suppressions file goes with it | tech lead (P-214 if it blocks merges) |
| CI-0a, CI-0b, CI-A, CI-B | Revert PR, merged by the tech lead under P-214 when the `ci` check itself breaks | tech lead |
| `.mergify.yml` changes | Revert PR. Merge them when fewer batches are checking: what Mergify does to batches in flight is unverified | tech lead |
| Auto-fix (later) | Turn off in the PR's menu; uninstall the App | founder |

---

## 4. Rules (v2 shape)

* **Shape [RV2]: 21 enforced rules (E-1 to E-21)** covering every rule broken 13-16 Nov and everything that cannot be undone. Each names its enforcer. **Count honestly:** an enforcer is a server-side check (CI, label-guard, queue-gate, the ruleset) or a permission rule. A hook with an `if` filter is a second defence, not an enforcer (O3). So "13 of 13 wired" is replaced by two counts: server-side gates live, and hooks wired.
* **12 principles (PR-1 to PR-12)**, judged by reviewers and the weekly audit.
* **Size.** ID, one-line rule, enforcer, as-of date: 6-8 KB against 25 KB today [RV2, R §9a].
* **ID map.** All 143 rows in `out/idmap.tsv` → `rules/rule-id-map-2026-11-17.tsv` (with sha256): 61 to an enforced rule, 50 to a principle, 21 to a DECISIONS ruling, 10 to history, 1 replaced by v2 (P-611a). Every old row moves word for word to `rules/merged-and-retired-2026-11-17.md`. A fourth outcome, **ruling**, so no founder decision reads as "retired".
* **Fix before the next records PR [IF] S12.** P-611c and P-312 are marked `kept` in the 16 Nov map; main's check-docs would fail the next RULES records PR.
* **P-632 stays an enforced rule** (B198's check), not in the batch yes. The founder called it a hard rule that "should be enforced".
* **P-626** goes to a ruling with its text kept, named on the batch card.

**Cards at 10:30 (each needs the founder's yes):**
* **Q1:** adopt v2 and stop building about 80 checks. The card quotes P-611 (1): every rule a Lead must follow is enforced by script where one can be written. Q1 reverses that, and P-619 (6) and P-615.
* **Q2:** the settings paste (P-387).
* **Q3:** the one-day Lead-continuity trial (reverses P-446 (1) "never compact" and (6)).
* **Q4:** the lane cap (reverses P-462).
* **Q5:** "full tests once" means one PR check after the Approve plus every suite once in the batch. This reinterprets P-651 (2), which says CI runs fast checks on each PR and the full set once on the batch.
* **One batch yes for 20 rows** that lose a detail from the live register (each stays in DECISIONS, history and its skill), naming P-626.
* **Inform only:** 99 rows keep their meaning; 16 are the tech lead's own rulings [RV2] §5.

**Since 17 Nov (refresh 20 Nov).** Rules v2 has not replaced the register: P-667 stands only as a recorded row (RULES IDX-15). RULES.md on the tech lead's branch is still the one-line register, now as of P-752 (11:15 IST 20 Nov). Long rows have moved word for word to `rules/tech-lead.md`, `rules/goal-and-order.md` and `rules/builders-and-qa.md` under IDX rows (IDX-7 to IDX-20), so the register stays under 25 KB (commits 713dd20bf, 08f03e389). The rows that change how work flows are summarised in section 12.

---

## 5. Checks: keep, fix, remove, add

| Kind | Items |
|---|---|
| KEEP | `ci` as the hard gate, every suite and Works pack once in the batch. H2-H7 hooks, pre-push, the push guard in CI, label-guard, queue-gate, records-label, nightly, demo-update, xfa-engine, module-cards, comment-run |
| FIX | F1 = Q1 (card). F2 = Q2 + Q4. F3 = `max_parallel_checks` (card, P-224). F5 `pr-rules` required (conditional, section 3.1). F6 `guards` by path. F4, F7, F8, F9: tracked privately by the tech lead. F10 SessionStart output under 1.5 KB. F11 check-docs fails on a future time. F12 drop label-guard's `workflow_run`. F13 `records-label` and `label-guard` start failures. F14 measuring scripts off REST |
| REMOVE | `m3-guard.sh` (unused since 8 Nov). Building checks for about 100 rules never broken (only if Q1 is yes). **The P-446 context alarm stays until Q3 is yes** |
| ADD | A1 deny lines. A2 wire U1-U5 and pr-open-guard. A3 one allow-list door for GitHub writes inside `merge-guard.sh` (E-11). A5 round counter. A6 touch-list overlap. A7 push before stop. A8 hourly metrics. A4 and A9 (including a reviewer identity): tracked privately by the tech lead. A10 actionlint and zizmor, LATER |

**Since 17 Nov (refresh 20 Nov).** Workflows added to KEEP since this table: `item-proof`, `walks`, `pipeline-heartbeat` and the nightly restore drill (section 3.8). On F6, `guards` gained trigger paths and a 30-minute limit for its mutation run (#2249, commit 43a238b44; #2363). It is still not a merge condition.

**Order.** CI-0b, PR-W, A4, F13, F14 and the priority PR start 09:45. CI-0a (F6 only) starts 09:45; F3 and F5 join only after their cards. CI-A starts 09:45. CI-B is built on CI-A and labelled only after Q1 and Q5. All `.github` diffs are read by the tech lead (P-423).

### 5a. Deny lines for the 10:30 paste (founder, P-387)

The founder pastes these into the Mac copy's `.claude/settings.json` → `permissions.deny`. The settings PR for cloud lanes carries **his pasted text byte for byte**, and he sees its diff before it merges.

```json
"Bash(gh run cancel *)",
"Bash(*actions/runs/*/cancel*)",
"Bash(*actions/runs/*/force-cancel*)",
"Bash(gh workflow disable *)",
"Bash(*actions/workflows/*/disable*)",
"Bash(*actions/secrets*)",
"Bash(*actions/permissions*)",
"Bash(*actions/variables*-X*)",
"Bash(*-X*actions/variables*)",
"Bash(*branches/*/protection*)",
"Bash(*/rulesets*)",
"Bash(*git/refs*-X*)",
"Bash(*-X*git/refs*)",
"Bash(gh api * -X P*)",
"Bash(gh api * -X DELETE*)",
"Bash(gh api * --method P*)",
"Bash(gh api * --method DELETE*)",
"Bash(gh api graphql*mutation*)",
"Bash(git push *--no-verify*)",
"Bash(git -C * push *--no-verify*)",
"Bash(git commit *--no-verify*)",
"Bash(git -C * commit *--no-verify*)",
"Bash(git -c core.hooksPath*)",
"Bash(git -C * -c core.hooksPath*)",
"Bash(git config *core.hooksPath*)",
"Bash(git -C * config *core.hooksPath*)",
"mcp__*__create_file",
"mcp__*__update_file",
"mcp__*__copy_file",
"mcp__*__trash_file",
"mcp__*__share_file"
```

* Changed from version 1: `--method *` is now `--method P*` and `--method DELETE*`, so `--method GET` reads still work (POST, PUT and PATCH all start with P), and lanes are not refused on reads. Commit `--no-verify` and `core.hooksPath` config lines added.
* `*/rulesets*` and `*branches/*/protection*` also refuse reads; acceptable, since the founder sets the ruleset in the browser.
* After the paste: check the startup warnings once.
* **Since 17 Nov (refresh 20 Nov).** These 31 lines are on main for every copy, byte for byte with the founder's paste (#2075, merged 17 Nov 19:24 IST; P-670, P-672; change log C10, C12). Main's file also denies the same five Drive writes for a second connector id. It holds 75 deny lines and 2 allow lines (read 20 Nov).

### 5b. Hook lines for the later paste

Paste only after: (1) section 2.0 is solved and every script path passes `test -f`; (2) F14 has merged, or `lead-read-guard.sh` exempts non-sensitive PRs. It reads each PR through `gh.sh` with a curl fallback and fails closed, so with the REST budget at 0 it would refuse every `review: approved` label (as stated in [C2]; not re-read by me); (3) the Stop timeout is raised to about 60 s.

```json
{ "matcher": "^(Edit|Write|MultiEdit)$",
  "hooks": [ { "type": "command", "timeout": 10,
    "command": "python3 -I \"$CLAUDE_PROJECT_DIR\"/ai-workers/problem-1-pathway-setup-and-form-filling/product/tools/ist-time-guard.py" } ] },
{ "matcher": "Bash",
  "hooks": [
    { "type": "command", "if": "Bash(*review: approved*)", "timeout": 15, "onFailure": "block",
      "command": "bash \"$CLAUDE_PROJECT_DIR\"/ai-workers/problem-1-pathway-setup-and-form-filling/product/tools/lead-read-guard.sh" },
    { "type": "command", "if": "Bash(git push*)", "timeout": 15,
      "command": "bash \"$CLAUDE_PROJECT_DIR\"/ai-workers/problem-1-pathway-setup-and-form-filling/product/tools/queued-push-guard.sh" },
    { "type": "command", "if": "Bash(git -C * push*)", "timeout": 15,
      "command": "bash \"$CLAUDE_PROJECT_DIR\"/ai-workers/problem-1-pathway-setup-and-form-filling/product/tools/queued-push-guard.sh" } ] },
{ "matcher": "(^|__)(start_session|create_session)$",
  "hooks": [ { "type": "command", "timeout": 15,
    "command": "python3 -I \"$CLAUDE_PROJECT_DIR\"/ai-workers/problem-1-pathway-setup-and-form-filling/product/tools/wip-guard.py" } ] }
```

Stop, beside `stop-check.sh`, with both Stop timeouts at about 60 s:

```json
{ "hooks": [ { "type": "command", "timeout": 60, "command": "bash \"$CLAUDE_PROJECT_DIR\"/ai-workers/problem-1-pathway-setup-and-form-filling/product/tools/lead-act-check.sh" } ] }
```

If option 2 of section 2.0 is chosen, `$CLAUDE_PROJECT_DIR/…` becomes the path of the main-tools checkout. The merge-guard handlers come with F8. L2 comes with L1. `autoMode.environment`'s JSON shape is checked against O8 at paste time (unverified here).

Known gaps are tracked privately by the tech lead.

**Since 17 Nov (refresh 20 Nov).** The hook paste above has not reached main. Main's `.claude/settings.json` hooks are unchanged since 17 Nov: SessionStart, PreToolUse on Bash, session starts, Agent/Task and CronCreate, Stop and UserPromptSubmit. They call merge-guard, agent-model-guard, lane-preflight, lead-check-guard, stop-check, prompt-log and session-start; none of `ist-time-guard.py`, `lead-read-guard.sh`, `queued-push-guard.sh`, `wip-guard.py` or `lead-act-check.sh` is wired there (read 20 Nov). `.githooks/pre-push` on main is unchanged since 6 Nov. The PR-W line (`pr-open-guard.sh` in pre-push) exists only on the tech lead's branch (G-4, commit 5912f30a0, 15 Nov).

---

## 6. Instruction files: target set and sizes [IF]

**First fix (PR B; every session gains).** `session-start.sh` prints 12,215 characters, over the 10,000 cap (O3). Target ≤1,500: a pointer, not STATE's body; the current Lead from `current-lead.sh`; `git fetch` only on `startup`. A new `check-session-start.sh` holds the limit.

| File | Now (bytes) | Target | What changes |
|---|---:|---:|---|
| `CLAUDE.md` | 1,487 | ≤1.6 KB | The 3 check commands; old patterns not to copy. "Restart after skills change" → "skills apply at once" (O5) |
| `AGENTS.md` | 3,092 | ≤3.2 KB | Rule 9 becomes a start-read table per role |
| sub-folder `CLAUDE.md` | 448 | ≤0.3 KB | 2 lines |
| `WAY-OF-WORKING.md` | 26,651 | ≤12 KB | 9.1 KB meant only for the tech lead moves to `.claude/skills/lead/handbook.md`; 5 contradictions fixed |
| `lead` skill | 10,200 | ≤7 KB | Overflow to its own supporting file (the P-203 amendment needs the founder's yes) |
| `next` / `qa` / `lead-watch` | 6,319 / 9,608 / 5,928 | ≤5 / ≤8 / ≤5.5 KB | Builders no longer label (C7). `/rerun failed` (C6). qa reads BUGS by ID |
| `screen-reviewer` agent | 1,108 | ≤1.8 KB | Screen and code paths; ends `Reviewer: Approve <sha>` or `Reviewer: Block`; evidence rule for Q1 (section 3.3) |
| `EXPERIENCE.md` | 17,366 | ≤6.5 KB | Scorecard moves word for word to `EXPERIENCE-scorecard.md` |
| `RULES.md` | 25,421 | ≤8 KB | v2 (section 4) |
| `STATE.md` | 10,535 | ≤12 KB | No longer pushed by the hook |
| Module cards | 47,259 in all | ≤40 lines each | Kept (path-scoped, O4); mechanical "do not" lines move into lint messages (L1) |

| Role | Start read now | Target |
|---|---|---|
| Tech lead | about 145 KB | about 72 KB |
| Builder | about 80 KB | about 38 KB |
| qa | about 253 KB | about 59 KB |
| Reviewer | about 52 KB | 20-42 KB |

PRs A, B and C are drafted by a standby Lead copy (stop-check blocks lanes from these files), 10:00-12:30; merge about 14:00 / 17:00. Every cut moves word for word to `history/INSTRUCTIONS-2026-11-17-before-trim.md`, with a 10-line check. Re-read 18 Nov 09:00 by the same method [IF] §10.

---

## 7. Talk A143: adopt, adapt, later, reject [TK]

| # | Claim (paraphrased) | Evidence (source) | Verdict | Our change |
|---|---|---|---|---|
| 1 | Invest in layers: code, then checks, little prose | O1, O4. About 282 KB of prose, no linter [TK] | **ADOPT NOW** | L1, L2, T1; RULES v2 |
| 2 | Every correction becomes a check | O1: a small enforced set | **ADAPT** | A check only if a correction recurred twice and a machine can judge it without false alarms |
| 3 | Agents copy what is in the code | O1, O16. 24 dead disables, 68 `new Date()` files [TK] | **ADOPT NOW** | Bulk suppressions; old patterns named in CLAUDE.md |
| 4 | Ban APIs that need nuance (`useEffect`) | O17, O18. 172 effects, 25 fetching [TK] | **ADAPT** | Effects only in `web/src/lib/hooks`; react-hooks recommended as errors |
| 5 | Encode the architecture in imports | eslint `no-restricted-imports`. The engine makes 35 database calls despite "no I/O" [TK] | **ADOPT NOW** (4 import rules) · **LATER** (folders) | In L1 |
| 6 | Ban comments | No official page asks for a ban; P-615 (4) keeps reason comments | **ADAPT: no ban** | `noInlineConfig: true`; the founder rules |
| 7 | Verification by artifacts; a feature map | O20, O1, O5. 1,631 screenshots and qa walks exist [TK] | **ADAPT** | V1 index, `/verify`, `studio-look` |
| 8 | Formal methods, property tests | O22; TLA+ checks a spec, not our TypeScript | **fast-check ADAPT · TLA+ LATER · Lean REJECT** | Pin fast-check; race tests for 2-3 flows |
| 9 | Most tokens go to verification | O21: about 8% | **Contradicted: measure first** | One-day token split by role |
| 10 | 0.5% of PRs reverted | No data | **REJECT as a target** | Escaped Majors per merged PR; PRs red on their own check |
| 11 | Fix the inner loop before the outer loop | O19, O21; our numbers agree [R] | **ADOPT NOW** | Lint before new automation |
| 12 | Fuzz releases, auto-merge the fixes | Nothing official on auto-merging fixes | **LATER**; **REJECT** skipping gates | Nightly read-only explore once under 15% red |

**Public-repository note (E-9, P-504, P-539).** The talk audit compared our setup with the partner team's, read from a read-only capture. That comparison, including any version detail, stays in private notes.

---

## 8. 30 Proven by 08:00 IST 18 Nov

* **The honest number.** About **13-16 at today's rates** [B]. About **16 only if** four things hold: the move works by about 12:00, near PRs go first in the queue, five qa lanes start on each merge signal, and qa plus its records PR takes 5-10 h a row [P30]. That last one is 3-7 times faster than any measured case (median 35 h, n=4; best case 14 h to main) [P30, C2]. The row probabilities sum to about 4.95 [P30], but they share one move, one CI line and one records queue, so the spread is wider and skewed low. Ceiling 21.
* **Why not 30.** 19 more rows in about 23 h is about 7.6 times the measured 2.5 a day [B]. Only 10 of 26 Partial rows have a path of at most two PRs then qa; the other 16 need longer chains, unshaped parts or outside accounts [P30]. Reaching 30 would mean counting Built as Proven or skipping a re-run, which P-636 and P-651 (2) rule out.
* **When 30 is credible:** about 20 Nov 08:00 at 7 a day (P-644), or about 23 Nov at 2.5 a day [P30].
* **The biggest single risk: the records queue.** A row is Proven only when its qa verdict records PR lands on main. Records PRs are checked only when no product PR waits (B119, P-376 (1)). #2013 has waited since 07:09 IST [C2]. Giving qa verdict records PRs priority **needs the founder's yes** (section 9, item 4).
* **The plan (tech lead, from 09:45):** five qa lanes by journey group (G3 R1.4, R1.6 · G4 R1.40, R1.38, R1.39 · G1+G2 R1.100, R1.49 · G5 R1.80, R1.77, R1.74 · G8 R1.16, R1.109). Priority for #2029, #1961, #1956, #2045, #1918, #2000, #2012, CI-A, and #2013 once records priority is yes. Stacked chains: PF-5v p2 and the QA-495 fix on #1961; J-49 on #1956; FO-3a 1b on #1918; CS-DL1b on #2000; PF-21s p4 on #2012. A slip table every 30 min. Report at 08:00 against 13-16 forecast and 30 asked.
* **Also needed:** #2013's QA-501 ID clash renumbered; #2029 past the PF-12 wall guard (5 failed batches on 16 Nov); the move window does not stall #2043 (queued) or the near PRs.

---

## 9. The 10:30 session agenda (value order)

About 75-90 min of the founder's time (estimate). Every card that reverses a decision says so. **"Yes needed"** marks each.

| # | Item | What the founder does | Cost | Time | Recommendation |
|---|---|---|---|---|---|
| 1 | **GitHub plan and the move.** Yes needed. P-652 (17 Nov, 00:3x-00:4x IST) already chose an organization on **Team** at 09:00 IST. Options: **A** Team (as decided) plus a GitHub Support ticket for a higher job limit (O12) and the Namespace trial kept (P-651 (1)): 60 + 8 machines. **B** Enterprise (500 jobs at once, O12): reverses P-652; unsetting `vars.CI_SHARD_RUNNER` also reverses P-651 (1) and (3). Both: the move retires the old owner/name pair for good, since we had 2,521 `ci` runs last week (O15) — he says yes to that by name. Pre-move inventory: Mergify, the Claude GitHub App, Namespace's app (installed on the personal account), Actions variables, environments, claude.ai cloud environments and every lane's GitHub connection (20 lanes sat dead about 13 h on 4 Nov when GitHub was not connected). Move window: 10-min push freeze; queued PRs (#2043) and in-flight runs may need re-runs (unverified) | Buys in his own browser; the tech lead runs the inventory and one cloud lane push test | A: about US$4 a month. B: about US$21 a month, plus up to about US$42 if Mergify needs Max after the move or a reviewer identity takes a seat (estimates, [TL]); minimum seats and term unchecked | about 1 h | **B, if** the purchase page shows monthly billing with no seat minimum: it is the one change that removes the machine wait today, while Q1 and Q2 are not yet live ([R] projects Team enough only once they are). **Otherwise A.** Not because of the 116-job snapshot alone, and not for "paid overflow avoided" ([R] D4 never planned that) |
| 2 | **Ruleset on main** | Sets exactly: required status `ci`; block force-push; block deletion. Not the merge-queue rule, not a review rule, not "up to date". P-214 kept | US$0 | 15 min | **Yes** |
| 3 | **Deny lines** (Q2, P-387) | Pastes section 5a; sees the settings PR diff | US$0 | 10 min | **Yes** |
| 4 | **Queue and lanes** — four cards, each yes needed: (a) qa verdict records PRs first (reverses B119 / P-376 (1)); (b) `max_parallel_checks: 2` (reverses P-224 (5)); (c) lane cap 10-12 (Q4, reverses P-462); (d) `pr-rules` required only after P-635 (3)'s 2 clean days (keeps his rule) | Answers 4 cards | US$0 | 10 min | (a) **Yes, verdict records PRs only.** (b) **Yes** until failures stay under 15% for 24 h. (c) **Yes**, reviewed after the plan choice. (d) **Keep his rule** |
| 5 | **Rules v2: Q1, Q3, Q5, batch yes** (section 4) | Answers 3 cards and 1 batch card | US$0 | 15 min | **Yes**. Q1 quotes P-611 (1). Q3 reverses P-446 (1) and (6) for one day |
| 6 | **D11: Fable 5.2 as Lead.** Yes needed (reverses P-605 / P-608) | One card | plan use | 2 min | **Not today.** Trial D10 first on Opus 5.5 medium; one change at a time |
| 7 | **Lint install** (L0, STANDARDS §1) | Yes to `eslint` 9.39.5, `typescript-eslint` 8.62.1, `eslint-plugin-react-hooks` 7.1.1 (MIT, registry.npmjs.org, lockfile hashes, devDependencies of `prototype/studio`); pins `fast-check` 3.23.2 (MIT), `playwright` 1.64.1 (Apache-2.0); recorded in `design/required-tools.md` | US$0; the lockfile PR runs every suite, above the 1,280 machine-min average (estimate) | 5 min | **Yes.** P-358 / B112 (5 Nov), never landed |
| 8 | **Cloud environment and auto mode** (P-387) | Creates the Limited environment himself; hosts as in 3.1; npm not trusted in auto mode; no paid AI key; each secret named | US$0 | 15 min | **Yes** |
| 9 | **Plan capacity** | Hears the burn estimate: 96% about 03:00 IST 18 Nov at 5.8%/h, about 16:30 IST 18 Nov at 3.2%/h | US$0 | 2 min | **Keep P-643's manual reset.** No credit offer (P-643 (1)) |
| 10 | **Auto-fix** | Nothing today | US$0 | 1 min | **Later**, after A9 (section 3.8) |
| 11 | **P-203 amendment** | Skill overflow goes to its own supporting file | US$0 | 1 min | **Yes** |
| 12 | **Comments ban** (talk claim 6) | Rules on it | US$0 | 1 min | **No ban**; keep P-615 (4) |
| 13 | **His Mac-only files** | consolidate-memory prunes the auto-memory index (20.8 KB) [IF] §11 | US$0 | 10 min | **Yes** |
| 14 | **Which Library** | One question: the board's Library (`cockpit/library.json`), or his claude.ai or Drive library? | US$0 | 1 min | Board Library; known gaps tracked privately |
| - | **Not bought** | PR reviewers (CodeRabbit, Copilot, Greptile, managed Code Review), browser grids, Blacksmith, larger runners. Ultrareview: 3 free runs only, no posting | - | - | **Not now** [TL]. Reopen reviewers if qa logs 3+ diff-visible Majors in a week |

---

## 10. How this document stays live

* **Owner:** the tech lead. Builders and qa never edit it (E-12).
* **Home:** `ai-workers/problem-1-pathway-setup-and-form-filling/product/design/engineering-operating-model.md`, in the next records PR. Known gaps are tracked privately by the tech lead. The CI research becomes its evidence. Subject to item 14's answer.
* **Refresh triggers:** (1) each change to a pipeline file: `library-freshness.py` marks it "behind", run by lead-watch every check; (2) daily at 09:00 IST: baselines, metrics, the 30-Proven line, the change log; (3) each reading at +2 h, +24 h, +48 h: keep or undo.
* **Numbers from scripts, never by hand:** `baseline-snapshot.py` (GraphQL only; without raw JSON), `flow-measure.py`, `merge-queue-causes.py`, `cockpit-data.py`, `library-freshness.py`, `pipeline-metrics.yml` (A8), `start-read-bytes.sh`, one line per reading in `cockpit/baseline-log.tsv`, the Proven count from `qa/CAPABILITIES.md`.

**Library entry.** Registered in two places on main [OWN]: `cockpit/library.json` (read by `library-freshness.py`) and the `LIBRARY` array in `cockpit/index.html`. Names must match.

```json
{"name": "Engineering operating model",
 "path": "ai-workers/problem-1-pathway-setup-and-form-filling/product/design/engineering-operating-model.md",
 "status": "living",
 "feeds": [".github/workflows", ".mergify.yml", ".githooks", ".claude/settings.json",
           "ai-workers/problem-1-pathway-setup-and-form-filling/product/RULES.md"],
 "refresh": "re-run baseline-snapshot.py and flow-measure.py; update each stage's baseline and metric columns, the 30-Proven line and the change log; one records commit (also daily at 09:00 IST)"}
```

```js
["Engineering operating model","How we code, test, review, prove, merge and run unattended: best practice, our numbers, today's changes and what proves them (A144)","Living","design/engineering-operating-model.md","@design/engineering-operating-model.md"],
```

`baseline-log.tsv` is not a feed: it changes every check, so the master would always show "behind".

### Draft history

| When (IST) | Change | Measured result |
|---|---|---|
| 17 Nov 09:3x | Version 1: baseline (15 metrics), plan on today's clock | baseline [B] |
| 17 Nov 09:5x | Version 2: two critiques taken in; every founder-decision reversal carded; auto-fix moved to later; ruleset specified; merge times as median and p90; gap list kept private | readings due 12:30, 16:30, 20:30, 18 Nov 09:00 and 12:00, 19 Nov |

### Conflicts between the reports, and how this master settles them

| Topic | Report A | Report B | Settled here |
|---|---|---|---|
| Plan to buy | Team, US$4 [R] D1; decided in P-652 | Enterprise, US$21 [TL] | The founder's card, item 1: B if billing terms are clean, else A |
| `pr-rules` required | Today (F5) [CK] | After 2 clean days (P-635 (3)) | His rule stands; false failures fixed first |
| `fast-check` version | 4.10.2 [TK] | 3.23.2 in the lockfile [TL] | 3.23.2 today; 4.x later |
| GitHub write guard | Extend merge-guard [RV2] | A new guard [CK] | One door in `merge-guard.sh` (E-11) |
| Deny and Lead trial timing | Day 2-3 [R] §13 | Today (A144) | Deny today; Lead trial after Q3 |
| Hook paste | 10:30 [RV2] | After #2043 [CK] | After 2.0, F14 and the Stop timeout |

### What changed from version 1

* Auto-fix moved from 18:00 today to later (O7).
* Ruleset written out; GitHub's merge-queue and review rules excluded; P-214 kept.
* The move's permanent name retirement, inventory and move window added (O15).
* Hooks with an `if` filter no longer counted as enforcement (O3).
* Nothing that reverses a founder decision acts before 10:30: lane cap, P-446 alarm, CI-B label, `max_parallel_checks`, records priority, `pr-rules` timing, D10, D11.
* Merge times as median and p90; CI-B moved to 19:00-21:00 or overnight.
* "US$1,600-2,400 a month avoided" removed; the Enterprise case rewritten.
* Proven headline 13-16 at today's rates; 16 only under four conditions.
* Plan burn at 5.8%/h shown (96% at about 03:00 IST 18 Nov).
* Added: tech lead's time plan, the branch distance (1,944 behind, 1,367 ahead), REST-budget fix before `lead-read-guard`, `startup_failure` fix, Stop timeout, undo table, auto-mode hosts and secrets, P-387 ownership of settings and environment, Ultrareview free-only, Q1 reviewer evidence rule, private gap list, the Library question.
* Fixed citations: P-293 (3) for rounds; O12 and O15 lines; partner-team version detail removed.

**Not verified here:** Enterprise's per-organization limit, term and step-down; Mergify's open-source plan after the move; app installations after the transfer; whether a transfer cancels in-flight runs; Mergify's behaviour when `.mergify.yml` changes mid-batch; `autoMode.environment` shape; `lead-read-guard.sh` read order (taken from [C2]); the cause of the `startup_failure` suites; option 2 of section 2.0 works as hooks expect.

---

## 11. Critic points not taken, and why

1. **An auto-fix rule [C1 B1].** Not taken as written. Auto-fix stays off until a separate reviewer identity exists and its other preconditions are met (section 3.8).
2. **"Publish the master only after A1 and A9 land" [C1].** Partly taken. The founder asked for a living master now, so it is published now. Known gaps are tracked privately by the tech lead.
3. **"Frame the plan around Team" [C1].** Partly taken. Enterprise stays a recommendation, but only as a carded reversal of P-652 with the billing check first. The founder asked for the highest speed today, and Team is enough only once Q1 and Q2 are live [R], which is this evening at the earliest.
4. **"Move the tech lead to a fresh branch first" [C2, version 1].** Not taken as the main path: the branch is 1,367 commits ahead and the merge would go through the slowest queue. Option 2 (hooks pointing at a main-tools checkout) is recommended instead, to be tested on one hook.
5. **"`lead-read-guard` reads the PR before checking sensitivity" [C2].** Taken as stated but not re-read by me; the fix (F14 or an exemption) works either way.
6. **Records PRs first for all records [C2 implied].** Narrowed: the card asks for qa verdict records PRs only, so B119's aim (records never block code) mostly holds.

---

## 12. How work flows on 20 Nov 2026 (refresh)

Read on 20 Nov 2026. Workflows and `.mergify.yml` are from origin/main at 156057c4a; RULES.md is from the tech lead's branch, as of P-752. Each line names its source. The plan in sections 1-11 is the 17 Nov record; where it differs, this section is what runs now.

### 12.1 CI jobs (`ci.yml`)

| Step | What runs now | Source |
|---|---|---|
| Draft PR | Job `guard` only (the push guard) | P-371 (1), unchanged |
| Ready PR, code | `kind`, `fast` (push guard, rules files, tools' own checks, gate B part 1 without packs) and `types`. No suite runs on a PR | #2151 (3911fa145), P-651 (2) |
| Ready PR, records | Job `fast` alone; the records rules (check-docs.sh, decision-impact.sh) run here | ENF-746c, #2410 (831731b07), P-746 |
| Merge-queue batch, code | Every suite on 18 parts (repository variable SHARDS 18; the default is 18 since 19 Nov), packs by diff, the protected regression set, gate B's named packs (GATE_B_ONCE). The records rules are skipped | #2151; #2282 (C31); #2410 |
| Full run before the label | `/run full` comment → main's `ci.yml` by `workflow_dispatch` on the PR head merged with main, named "full-run PR #n head". queue-gate and label-guard need it green for heads approved after `FULL_RUN_FROM` (20:00 IST 22 Nov); a PR that failed a batch still needs it, with its failed parts named | #2249 (1bf23c0a4), P-731, P-733 (4), P-743; change log C35, C36 |
| Type check | `tsc` with an 8 GB heap | #2250 (C30) |
| After a merge | `item-proof` proves each "Completes: R1.n" item and posts the verdict to the branch `auto-verdicts`, never main | #2233, P-728 (3), P-729 (1); C32 |
| Outside PRs | `nightly` with a restore drill; `pipeline-heartbeat` every 30 min; `walks` by hand or on a PR changing journeys | #2014, #2081, #2133, P-700 |
| Required for Mergify | `ci` (and `xfa-engine` for engine paths); `pr-rules` and `guards` are not merge conditions | `.mergify.yml` on main; RULES P-606, P-610 |

### 12.2 Merge queue (`.mergify.yml`)

| Setting | Now | Was (17 Nov) | Source |
|---|---|---|---|
| Mode | `parallel`, by files scope | serial checking, up to 3 stacked batches | #2207, P-715, P-717 |
| Batches checked at once | 6 | 3 | #2290, P-739 (C33) |
| Scopes | platform, front-office, money, case-side (now including `api/src/case-clients/*.ts`), forms-engine, migrations, pipeline. Capacity 1 for money, migrations and pipeline. Barrier files (package files, tsconfig, base schema files, main.ts, core.ts, studio.ts) serialize | none | #2207; #2255 (C34) |
| Queues, in order | `verdicts` (qa verdict records), `product`, `pipeline` (every file a pipeline path), `records` | `product`, `records` | #2073 (P-664), #2207 (P-717 (a)) |
| Batch size | 2, at most 2 failure-resolution rounds | 6 | #2207 (P-715) |
| New blocking checks | Start report-only; join no queue condition until clean for 24 h or 10 PR runs | - | `.mergify.yml` comment, P-717 (b) |

### 12.3 Hooks and permissions

* **Deny lines:** 75 in main's `.claude/settings.json` (section 5a's 31 lines via #2075, P-670), for every copy. The founder alone widens permissions (P-387).
* **Session hooks:** unchanged since 17 Nov; the section 5b paste is not on main (see the note under 5b).
* **Git hooks:** `.githooks/pre-push` on main unchanged; the push guard still runs there and in CI.
* **Gate jobs:** queue-gate runs on xr-mac (#2145); label-guard and the sweep read REVIEWERS (#2209); both can be started by hand (#2176).

### 12.4 Rules that shape the flow (RULES as of P-752)

| Row | What it says (short) | Enforced by (as RULES states) |
|---|---|---|
| P-686 | Records PRs skip the 800-line limit; tooling rows exempt; IDX-moved rules count | script: pr-size.sh, decision-impact.sh, check-docs.sh |
| P-691 | Emergency hand merge only for a pipeline or CI fix while the queue is broken | prose (ruleset bypass; this Library's change log) |
| P-699 | Agents build, review, test and label; the tech lead does a stuck step in the signed-in browser | prose |
| P-728 | Ten a day: J-test in the item's last PR; 6 batches only after P-730's conditions (lifted by P-739); proof automatic at the last merge | prose |
| P-731 | A PR that failed a batch is relabelled only after a green full run on its head, every failing suite named (P-733 (4)) | CI: label-guard (CI-PRE) |
| P-733, P-734 | Items nearest done first; automatic proof on merge; P-733 runs unchanged to 22 Nov evening; no new workflow row before 23 Nov unless it is a fix | CI: #2233; script ENF-733 (owed) |
| P-738 | Each check: measure the flow, name the one constraint, fix it the simplest way, re-measure | lead-watch.sh constraint section (ENF-738, owed) |
| IDX-17 | P-742, P-743 (`FULL_RUN_FROM` to 22 Nov 20:00 IST), P-744 | CI: queue-gate.sh FULL_FROM; script: records-only.sh |
| IDX-19 | P-739, P-740, P-745 to P-748 (P-745: journey waves with WIP caps) | script: B204 waves check (guard 28, #2363) |
| IDX-20 | P-749 to P-752 (P-751: the pipeline adjusts itself; P-752: the Lead does a blocked label, ready or reopen in the built-in browser) | script: lead-pr.sh |
| Account | `expat-ready/xpatready` on Enterprise Cloud since 18 Nov (500 jobs documented, 1-6 measured) | RULES header |

