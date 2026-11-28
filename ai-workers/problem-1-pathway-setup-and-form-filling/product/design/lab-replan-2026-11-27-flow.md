# Where the time went — lab PRs, 27 Nov 2026

Measured read-only from GitHub's REST API (PRs, commits, timelines, check runs, Mergify payloads, one job log) at 18:10 IST, 27 Nov. All times IST (UTC+5:30). Scope: every PR merged since 27 Nov 00:00 IST that is not a records PR (20), plus the 13 lab PRs still open that were opened today (dependabot and older idle pipeline PRs left out). Records/lead PRs counted only: 10 today (8 merged: #3873, #3879, #3869, #3895, #3897, #3898, #3909, #3911; 2 open: #3912, #3939); they used 7 of the 30 queue batches (about 43 min of queue).

**Headline.** The 26 lab PRs spent **99 PR-hours** open. Their CI ran about **9.6 h** of that. The rest was waiting: **29.5 h on a Lead read or answer**, **17.4 h in the merge queue**, **13.3 h blocked by a red main / red `fast` tooling route**, **11.9 h on guards part 1/4 hitting its 45-minute limit**, **10.4 h idle after Approve with nobody acting**. Merged lab PRs: median **2.6 h** open and **141 min from first Approve to merge**, for work whose own checks take a median of 9 min (`fast`/`ci`) and 29 min (`guards`).

## 1. Per PR (lab PRs first, then other PRs merged since 27 Nov 00:00 IST)

Minutes in the last column come from a minute-by-minute split of each PR's open time (rules in section 5). "Approve→merge" for an open PR runs to now (18:10 IST).

| PR | Title (short) | Rows | State | Open→merge h | Approve→merge min | Main merges | Reviewer rounds | Label removals (why) | Dequeued | Biggest wait (min) |
|---|---|---|---|---|---|---|---|---|---|---|
| #3953 | fast route names every failing line, and the too | P-214 | open | 0.25 | - | 0 | 0 | 0 | 0 | ci (15 min) |
| #3918 | guards in 6 parts, not 4 — part 1 hit the 45-min |  | open | 5.54 | 332 | 2 | 4 | 0 | 0 | main_red (225 min) |
| #3926 | the Lead copy runs live main, writes on a branch | LR-156 P-388 | open | 4.84 | 285 | 4 | 5 | 3 (3× new head: merge of main edited/conflicted) | 3 | main_red (101 min) |
| #3902 | qa starts itself after merges, measures (DORA fi | OS-11 OS-78 P-847 | merged | 6.19 | 363 | 2 | 3 | 1 (1× new head: merge of main edited/conflicted) | 1 | guards_timeout (192 min) |
| #3910 | OS-05 — the queue gate writes "Batch failures co | OS-05 P-731 | open | 6.26 | 372 | 2 | 3 | 6 (1× failed merge batch: full run owed (B206); 4× CI-PRE full run not ended; 1× new head: merge of main edited/conflicted) | 1 | guards_timeout (93 min) |
| #3923 | account-switch enforcement OS-86 (LR-143) — dete | OS-86 LR-143 | open | 5.24 | 311 | 2 | 3 | 1 (1× new head: merge of main edited/conflicted) | 0 | main_red (198 min) |
| #3920 | lanes at every check — claude.ai lane read enfor | LR-160 (was LR-154) LR-146 LR-147 LR-150 | open | 5.3 | 316 | 3 | 7 | 0 | 0 | main_red (208 min) |
| #3921 | fast route follow-up — review minors of #3908, L | LR-151 | merged | 4.41 | 259 | 2 | 4 | 0 | 0 | queue (86 min) |
| #3944 | fix(P-214): guard 6 mutant no longer breaks chec | P-214 PS-1b LR-156 | merged | 2.21 | 132 | 0 | 2 | 1 (1× new head) | 0 | queue (94 min) |
| #3913 | lab full-power FP-1 — away hook (LR-105), task s | FP-1 LR-105 LR-106 LR-107 | open | 6.13 | 365 | 0 | 3 | 0 | 0 | guards_timeout (295 min) |
| #3950 | factory org templates design (roles, mechanisms, |  | open | 1.79 | - | 0 | 0 | 0 | 0 | lane (108 min) |
| #3937 | lab full-power FP-2 (LR-110) — both nightly reds | FP-2 LR-110 | merged | 3.01 | 179 | 0 | 1 | 0 | 0 | queue (70 min) |
| #3896 | one model rule — Opus 5.5 medium everywhere (P-7 | P-788 P-847 | merged | 4.69 | 268 | 0 | 1 | 0 | 1 | guards_timeout (104 min) |
| #3942 | A438 merge-gate cuts — records-only PRs need no  |  | open | 3.29 | - | 0 | 0 | 0 | 0 | lane (194 min) |
| #3905 | the October POC chain (p3 apart from its release | P-847 P-674 P-677 P-838 | open | 6.45 | 370 | 0 | 1 | 0 | 0 | lead (200 min) |
| #3906 | DECISIONS.md keeps P-765 and newer (80 KB); P-76 | P-765 P-764 P-847 | merged | 3.71 | 209 | 0 | 1 | 0 | 0 | lead (133 min) |
| #3941 | current-lead.sh times only current_lead: line ch | PS-1c | merged | 1.16 | 52 | 0 | 2 | 0 | 0 | queue (43 min) |
| #3925 | check-capacity-watch.sh starts from none of its  |  | merged | 2.31 | 138 | 0 | 2 | 0 | 0 | queue (66 min) |
| #3900 | test output out of git, part 1 of 2 — 2,881 scre | P-847 P-674 P-677 | merged | 3.35 | 179 | 0 | 1 | 0 | 0 | lead (103 min) |
| #3936 | A435 — lead-label.sh, the Lead's one label comma | LR-157 P-849 | open | 4.54 | 207 | 0 | 1 | 0 | 0 | lead (244 min) |
| #3924 | private split PS-1b — readers find the Lead's re | PS-1b PS-1c | merged | 1.24 | 65 | 1 | 2 | 0 | 0 | queue (56 min) |
| #3899 | ship-security — Claude Approvals policy (observe | P-847 | open | 6.54 | 371 | 0 | 2 | 0 | 0 | idle_after_approve (237 min) |
| #3901 | test output out of git, part 2 of 2 — 2,283 scre | P-847 P-674 P-677 | merged | 0.56 | 13 | 0 | 1 | 1 (1× sweep (PR closed / bot label)) | 0 | lane (14 min) |
| #3904 | high advisories — zod 4.6.7, NestJS 11.2.12, Pri | P-847 | open | 6.5 | 371 | 0 | 2 | 1 (1× failed merge batch: full run owed (B206)) | 1 | lead (329 min) |
| #3893 | cleanup stage 1: the October work leaves the mai | P-676 P-759 P-772 | merged | 2.58 | 141 | 0 | 1 | 0 | 0 | lead (96 min) |
| #3908 | fast route — path-based checks (docs, tooling, f | P-847 | merged | 0.99 | 47 | 0 | 2 | 0 | 0 | queue (36 min) |
| | **Other PRs merged today (product, qa, fixes)** | | | | | | | | | |
| #3822 | R1.76 CS-NT1 part 4 — notes and timeline panel o | R1.76 P-846 | merged | 15.3 | 871 | 2 | 4 | 2 (1× new head; 1× new head: merge of main changes own files) | 0 | lead (567 min) |
| #3878 | R1.3 CS-W1 part 2b — unique rules and firm compa | R1.3 P-559 | merged | 9.98 | 579 | 2 | 3 | 0 | 0 | idle_after_approve (391 min) |
| #3887 | R1.111 — FO-7r part 3: period exports for the ac | R1.111 | merged | 1.84 | 110 | 0 | 2 | 0 | 0 | queue (60 min) |
| #3888 | fix(P-214): check_fo7s3a stores a sign-in that o | P-214 | merged | 1.03 | 58 | 0 | 1 | 0 | 0 | queue (44 min) |
| #3883 | capability R1.111 — parts missing: FO-7r part 3, | R1.111 P-606 | merged | 0.36 | 20 | 0 | 1 | 0 | 0 | queue (12 min) |
| #3884 | capability R1.35 — Partial, parts missing: PF-10 | R1.35 P-606 P-797 | merged | 4.63 | 19 | 0 | 1 | 1 (1× new head) | 0 | lead (264 min) |
| #3870 | R1.3 CS-W1 part 2a — the platform firm required  | R1.3 P-575 P-588 | merged | 2.21 | 73 | 1 | 1 | 1 (1× new head) | 0 | lane (53 min) |

## 2. Totals: hours per wait type (summed across PRs; PRs overlap in time)

| Wait type | 26 lab PRs (h) | 7 other merged PRs (h) | All 33 (h) |
|---|---|---|---|
| (d) Waiting on the Lead (read owed after a "not put on by itself" queue-gate note, or a question → Lead answer) | 29.5 | 15.8 | 45.3 |
| (b) Merge queue (`queued` label on → off) | 17.4 | 4.4 | 21.7 |
| Red main / red `fast` tooling route (from the PR's own "red … not this PR's" comment to the fix landing) | 13.3 | 0 | 13.3 |
| guards part 1/4 at its 45-minute limit (HOLD until relabel/new head) | 11.9 | 0 | 11.9 |
| Idle after Approve (no CI running, no ask open, not queued) | 10.4 | 8.2 | 18.6 |
| (a) CI running on a head (ci, fast, guards parts, pr-suites, walks), not already counted above | 9.6 | 3.9 | 13.4 |
| (e) Lane before first Approve (in the PR's life; most building happens before the PR opens) | 6.3 | 2.1 | 8.3 |
| (c) Rework after a main merge (merge commit → next Approve, when not already counted) | 1.0 | 1.1 | 2.1 |

Lab merged PRs: 13 of 26. Main merges: 18 (lab). Reviewer verdicts: 54. `review: approved` removals: 14 (lab). Dequeues: 7.

Per-PR minutes per category (main_red, guards_timeout, queue, lead, rework, ci, lane, idle):

| PR | main red | guards timeout | queue | lead | rework | ci | lane | idle |
|---|---|---|---|---|---|---|---|---|
| #3953 | 0 | 0 | 0 | 0 | 0 | 15 | 1 | 0 |
| #3918 | 225 | 0 | 0 | 17 | 16 | 65 | 1 | 9 |
| #3926 | 101 | 0 | 97 | 82 | 3 | 5 | 1 | 2 |
| #3902 | 16 | 192 | 83 | 52 | 12 | 16 | 1 | 0 |
| #3910 | 39 | 93 | 68 | 64 | 5 | 43 | 1 | 63 |
| #3923 | 198 | 0 | 0 | 5 | 4 | 80 | 1 | 27 |
| #3920 | 208 | 16 | 0 | 20 | 15 | 48 | 1 | 10 |
| #3921 | 0 | 0 | 86 | 54 | 2 | 52 | 1 | 70 |
| #3944 | 0 | 0 | 94 | 28 | 0 | 10 | 1 | 0 |
| #3913 | 0 | 295 | 0 | 71 | 0 | 1 | 1 | 0 |
| #3950 | 0 | 0 | 0 | 0 | 0 | 0 | 108 | 0 |
| #3937 | 0 | 0 | 70 | 28 | 0 | 14 | 1 | 68 |
| #3896 | 0 | 104 | 98 | 49 | 0 | 9 | 1 | 21 |
| #3942 | 0 | 0 | 0 | 4 | 0 | 0 | 194 | 0 |
| #3905 | 0 | 0 | 0 | 200 | 0 | 77 | 1 | 110 |
| #3906 | 0 | 0 | 74 | 133 | 0 | 13 | 1 | 2 |
| #3941 | 0 | 0 | 43 | 5 | 0 | 21 | 1 | 0 |
| #3925 | 12 | 15 | 66 | 45 | 0 | 0 | 1 | 0 |
| #3900 | 0 | 0 | 76 | 103 | 0 | 20 | 1 | 1 |
| #3936 | 0 | 0 | 0 | 244 | 0 | 0 | 29 | 0 |
| #3924 | 0 | 0 | 56 | 2 | 0 | 16 | 1 | 0 |
| #3899 | 0 | 0 | 0 | 138 | 0 | 17 | 1 | 237 |
| #3901 | 0 | 0 | 10 | 0 | 0 | 8 | 14 | 2 |
| #3904 | 0 | 0 | 43 | 329 | 0 | 10 | 9 | 0 |
| #3893 | 0 | 0 | 43 | 96 | 0 | 14 | 1 | 1 |
| #3908 | 0 | 0 | 36 | 3 | 0 | 20 | 1 | 0 |
| #3884 | 0 | 0 | 10 | 264 | 0 | 3 | 1 | 0 |
| #3878 | 0 | 0 | 62 | 69 | 12 | 45 | 20 | 391 |
| #3887 | 0 | 0 | 60 | 44 | 0 | 4 | 1 | 2 |
| #3888 | 0 | 0 | 44 | 2 | 0 | 14 | 1 | 1 |
| #3883 | 0 | 0 | 12 | 0 | 0 | 8 | 1 | 1 |
| #3822 | 0 | 0 | 36 | 567 | 56 | 118 | 48 | 94 |
| #3870 | 0 | 0 | 37 | 0 | 0 | 39 | 53 | 4 |

### Red periods today (main or the `fast` tooling route)

| # | Period (IST) | Cause | How it got in | Fixed by | PRs it blocked |
|---|---|---|---|---|---|
| R0 | all day (14 runs) | guards part 1/4 cancelled at its 45-min limit (infra, no test failed) | the mutation suite grew; 4 parts, part 1 heaviest | #3918 (6 parts) — **still open**, itself blocked by R1–R3 | #3908, #3902, #3896, #3910, #3913, #3920, #3921 (HOLDs by Lead 5 at 14:11–14:13) |
| R1 | 12:47 → 15:29 (2 h 42 m) | `fast` tooling route: check-capacity-watch.sh fails "a repository that cannot be read" (inherited `S`) | #3908 fast route (merged 12:47) runs check-guards.sh's suite inside `fast` | #3925 (merged 15:29) | #3918, #3920, #3923 (fast red); merge batches #3943 and #3945 failed on it, dropping #3910 and #3906; #3896 dequeued by hand to let #3925 go first |
| R2 | 14:23 → 17:18 (2 h 55 m) | guard row 6: "the edit '/STATE TOO BIG/d' breaks check-docs.sh's syntax" | PS-1b #3924 (bc1ce3536) **merged with its own guards part 3/4 red**: job 140377812531 printed this FAIL at 13:24; #3924 entered the queue at 13:27 and merged at 14:23 because the queue's only merge condition is `ci` | #3944 (merged 17:18) | #3926, #3902, #3910, #3918, #3920, #3923, #3921 |
| R3 | latent since 12:47; visible 17:18 → now (open) | zsh missing on the `fast` tooling route: check-isolated-ttl.sh exits 2, check-guards.sh counts a FAIL; `tooling-checks.sh` prints only `tail -20`, so the failing line was cut | same #3908 route: no cloud-setup.sh, no zsh | #3953 (opened 17:54, open) | #3910, #3918, #3920, #3923 (and #3926 if its `fast` goes red); earlier reds on these PRs at 16:45 were attributed to R2, likely partly R3 |

### Merge queue today

* 30 batches since 00:00 IST; **5 failed (95 min of queue time)**: #3886 (culprit #3829, `shard (12)`), #3889 (#3633, queue conditions no longer matched), #3927 (#3904, `shard (10)`), #3943 and #3945 (#3910 with #3906, then #3910 alone: `fast`, R1 — main's bug, not the PR's). 25 passing batches merged 31 PRs; only 3 merged two PRs together.
* The pipeline queue has scope capacity 1, so lab PRs go one batch at a time, ~32 min each (CI ~31–33 min of it). Between 11:30 and 18:00 IST the queue ran batches **356 of 390 minutes (91% busy)**.
* The two main-fix PRs waited behind ordinary batches: #3925 queued 14:22, merged 15:29 (1 h 6 m, 6 min CI; behind #3900 and the two failing #3910 bisects); #3944 queued 15:43, merged 17:18 (1 h 35 m, 33 min CI; behind #3896 and #3937). Same `pipeline` rule, no priority.

## 3. Top 5 time sinks

### 1. The Lead read arrives late, and reads were done twice — 29.5 lab PR-hours
Evidence: 36 read-owed events; median 25 min, **p75 97 min, max 212 min**. The morning wave approved 11:44–13:00 IST waited: #3902 212 min, #3905 200, #3896 149, #3923 141, #3918 140, #3910 134, #3906 133, #3920 95. Lead 5 posted "read OK … HOLD" at 14:11–14:13 on #3899, #3902, #3910, #3918, #3923, but those are not the gate's line; the exact "Lead read the diff: <sha>" lines came at 15:20 from "an independent Opus reader for Lead 6" — a second read. Five Lead sessions worked today (Lead 3 → Lead 7, 11:44–18:00 IST). Questions themselves were answered fast (47 of 50, median 2 min).
5 whys: PRs wait → every lab PR touches a read-first path (tools, workflows, .claude), so B194 holds the label → only the Lead may post the line → the Lead is one session that also runs checks, records and hand-overs, and changed 5 times → a HOLD read was written as prose, so the gate did not count it and the next Lead re-read. **Smallest fix:** when the Lead reads, it always posts the exact gate line `Lead read the diff: <full sha>` (adding "HOLD: <reason>" below it), so a HOLD for CI never costs a second read; and the Lead's 10-minute check (P-761) takes owed reads first, oldest first. The read gate is unchanged.

### 2. A red `fast`/main made of three stacked causes, found one at a time — 13.3 PR-hours plus most of 18 main merges
Evidence: R1, R2, R3 above. Each cause took one full cycle: diagnose → fix PR → queue → every blocked PR merges main → diff-only re-Approve → `review-rounds` red ("3 rounds, limit 2") → Question → "Lead allows round N" → Lead read → label → CI-PRE full run → queue. Merge-of-main → relabel: median 23 min when main was green, 102–237 min when it was red (#3920 237, #3921 124, #3918 113, #3926 102). #3910 lost its label 6 times (4× CI-PRE full run not ended, 1× merge of main, 1× failed batch).
5 whys: PRs red → `fast`'s tooling route (#3908) runs check-guards.sh's whole suite in a job without zsh and with an inherited `S` → nobody saw which test failed because `tooling-checks.sh` prints only the last 20 lines → the 16:45 reds were blamed on guard row 6, so R3 surfaced only after #3944 → three fix cycles in series instead of one. **Smallest fix:** #3953 as written (print every FAIL line; install zsh on the tooling route), then put it ahead in the queue (sink 3). No gate lowered.

### 3. One serial pipeline queue with no lane for main fixes — 17.4 PR-hours
Evidence: 91% busy 11:30–18:00 IST; ~32 min per batch; #3925 waited 60 min and #3944 62 min behind ordinary batches while seven PRs were red because of what they fixed; 2 of 5 failed batches (#3943, #3945; 22 min) were main's own R1 bug.
5 whys: fixes wait → the pipeline scope has capacity 1 and P-214 "lands ahead of the queue" has no Mergify rule behind it → a fix joins the back of the line → every PR it unblocks waits too. **Smallest fix:** a higher-priority queue rule (or `priority_rules` entry) for PRs labelled as a P-214 main fix, with the same conditions (review: approved, ci, XFA rule). Same checks, earlier slot.

### 4. guards part 1/4 times out at 45 minutes — 11.9 PR-hours
Evidence: 14 runs hit 44–45 min today (e.g. 45952181778, 45958652410, 45980256436); 41 of 57 part 1/4 runs ended cancelled (timeout or a newer push). guards median 29 min after push, p90 59 min. HOLDs on #3902 (192 min), #3896 (104), #3910 (93), #3913 (295 incl. no action after 13:14). The fix, #3918 (6 parts, part times 21–35 min), opened 12:37 and is still open: it changes check-guards.sh, so it hits R1–R3 itself.
5 whys: HOLD → part 1 cancelled → parts are split by count, part 1 holds the heaviest mutation rows → the split was never rebalanced as rows grew → the rebalancing PR is stuck behind the red tooling route. **Smallest fix:** land #3918 straight after #3953 through the priority rule from sink 3. Timeout and coverage stay.

### 5. A PR merged with its own guards red, which broke main for 2 h 55 m — the cause of R2
Evidence: #3924's head 246488a3: `guards part 3/4` = failure at 13:44 (FAIL guard 6 logged 13:24, job 140377812531); queued 13:27, merged 14:23. `.mergify.yml` `pipeline` rule: queue and merge conditions require `check-success = ci` only; `guards` is not required. #3908 also merged with `guards` failing (part 1 timeout, parts 2–4 green).
5 whys: main broke → #3924 merged with a red guards → the queue asks only for `ci` → `guards` (≈30 min) was left optional so slow parts would not hold PRs → a real failure in it goes unseen once the Lead read is done. **Smallest fix (raises a gate):** add `check-success = guards` (or `-check-failure = guards`) to the pipeline rule for PRs that change the paths guards.yml runs on, after #3918 makes guards finish under the limit.

Smaller, also seen: check-guards.sh is a hot file — #3896's merge (16:11) forced conflict merges on #3902, #3910 and #3926 (mutation rows, pr-rules.yml); OS-85 (#3833, no hot spot) has been open since 26 Nov.

## 4. Could not measure, and why
* **Lane build time before the PR opens.** Lanes approve in their own copy, then open the PR; the first Approve comes within about a minute of `created_at` on 20 of 26 lab PRs. The "lane" column therefore undercounts building; session logs were not read.
* **Push time.** Commit committer dates stand in for push times; a commit made long before its push shifts CI and rework minutes.
* **Category overlaps** are resolved by a fixed order (queue > red main > guards timeout > Lead > rework > CI > lane/idle), so one minute counts once per PR. Red-main minutes start at the PR's own "red … not this PR's" comment (after first Approve) and end when the fix merged; the true red started a little earlier.
* **Idle-after-Approve** (10.4 h lab) has no recorded reason: e.g. #3899 after 15:43 and #3904 after its dequeue at 13:51 (full run owed under B206, nobody started it). Session state was not read.
* **Queue waiting vs CI split per batch** comes from Mergify's own text ("x in the queue, y of it CI"); I did not read every batch's check runs.
* **R3 start.** That the 16:45 IST reds were partly the zsh gap rests on #3953's analysis (82 of 83 tests pass locally); I did not open those job logs.
* **Account/plan limits, runner queue waits** (job queued before start) were not measured; check-run started_at already excludes runner queueing.
* Product PRs not merged today (runtime/screens) were out of scope (P-847 product pause).

Method files: scripts and raw extracts in the session temp folder (an.json, timelines per PR); nothing on GitHub or in the repo was changed.
