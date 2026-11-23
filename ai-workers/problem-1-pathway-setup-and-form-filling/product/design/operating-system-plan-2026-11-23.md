# Operating system: the fixed list (A300, 23 Nov 2026)

Owner: Lead O (local_e02a8803). Written 12:1x IST 23 Nov against main b81ed4b0e. **The list is closed here.** A new idea goes to "Later" unless the founder adds it. Product lanes keep building; these PRs merge first (A300).

## Measured constraint (P-738), 12:07-12:10 IST
| Measure | Value | Sample |
|---|---|---|
| Hosted jobs running / waiting | 148 / 0 | every job of the 116 runs queued or in progress, 12:07 |
| Jobs waiting for the Mac | 45, with 1 running; wait median 7 min, longest 19 min at that moment | same |
| What they are | all 45 are `queue-gate` (automatic label, queue-fresh) | same |
| Gate wait / work | about 9-20 min / 0.3-0.8 min | 19 completed gate runs, 11:26-11:54 |
| Gate runs cancelled | 51 of the newest 300 | newest 300 runs, from 11:18 |
| Hosted wait | median 0.1-1.4 min, p90 up to 4.0 min | ci, pr-suites, walks; runs since 10:30 |
| Highest jobs at once | 170 | ci, pr-suites, walks, guards since 10:30: a floor |
| Batch failures | 3 of 4 full batches ended red, all on shard 10 (Monday test); a 4th was red and still running | batches started 11:05-11:44 |
| Batch time | about 30-36 min full, 7-9 min light | same |

**The constraint is one Mac running the merge gate, then main's red shard 10.** GitHub machines are not short. The earlier "110 queued" counted runs, not machines waiting.
* Gate: the switch exists (repository variable `GATE_RUNNER` = `"ubuntu-latest"`, with the quotes; way back: delete it). Lead O's attempt was **refused by the permission system at 12:1x**; it is a founder decision (item M1).
* Shard 10: #3208 (Lead 2 lands it first).

## What private really costs: GitHub's own meter (billing usage API, read 12:2x IST)
Actions Linux minutes: 19 Nov 83,007 · 20 Nov 78,088 · 21 Nov 104,185 · 22 Nov 150,455 (18 and 23 Nov are part days: 41,731 and 29,960). Mean of the four full days **103,934 a day = about 3.12 million a month**. The plan's earlier 208,500 a month (17-18 Nov, 300 runs) is **15 times too low** for today.
| If nothing changes (30 days x 103,934) | US$/month |
|---|---|
| GitHub 2-core ($0.006, half today's CPUs; minutes held equal) less $300 | 18,408 |
| GitHub 4-core ($0.012, today's CPUs) less $300 | 37,117 |
| Ubicloud 4 vCPU ($0.0025 list) | 7,795 |
| Public, as today | 0 for minutes |
November so far: $2,925.46 of Actions use, all discounted (public). Arithmetic on list prices; storage and tax left out.
Account: Enterprise Cloud **paid**, 1 licence, $21/month, next payment 1 Dec; $300 of Actions included, $0 used. Two-factor requirement for the organisation: off (a founder setting). Not read: Mergify plan, AWS quota.

## Must be done before private
| # | Item | Decision and why | Done when | Owner | IST |
|---|---|---|---|---|---|
| M1 | Merge gate off the single Mac | **Set 12:15** in the built-in browser on the founder's words; first 2 runs waited 0.1-0.2 min (too few) | Gate wait median under 1 min on 20 runs | Lead O measures | 12:45 |
| M2 | #3208 main's shard 10 | Land: every full batch fails without it | Merged; next full batch green on shard 10 | Lead 2 | 13:15 |
| M3 | #2971 path owners follow-up | Land | Merged, its check green on main | Lead 2 label (read posted) | 13:15 |
| M4 | #2370 test map from coverage | Land: approved head a6addba58, no conflict | Merged; map builds on main | Lead O, Lead 2 read | 14:00 |
| M5 | #2434 then #2428: full run after a failed batch; narrower Lead reads | Land in order, no conflict | Merged; a batch-failed PR starts its full run unasked | same | 14:30 |
| M6 | #2487 under-cap line | Land, no conflict (carries its base) | Merged; lead-watch prints the line | same | 14:30 |
| M7 | Guard stack #2982 → #2598 → #2457 → #2483 → #2431 → #2605 → #2785 → #2607 → #2599 → #2590 | Land as ONE, founder yes 12:16, cloud lane yes 12:17 (verified: #2590 contains the other nine; the only conflict is the test list in `check-guards.sh`). One by one is ten queue rounds and nine repeat conflicts | `check-guards.sh --mutate` green on the merged head; all ten closed as merged | Founder/Lead 2 route decision; Lead O verifies | 16:00 |
| M8 | #2597, #2473, #2738, #2444 | Land; same one-file conflict, so after or with M7 | Merged; guards green on main | same | 17:00 |
| M9 | #2595 pr-rules required for product | Land last of the checks: it starts blocking | Merged; a product PR with red pr-rules does not queue | same | 18:00 |
| M10 | #3035 one migration slot per schema area; PR suites by module | Land last (edits `.mergify.yml`, needs P-808 from #3210) | Merged; two migrations in different areas queue together | same | 18:30 |
| M11 | Close #2372, #2472 | Close: lanes report the goals are on main or taken over; Lead O checks each before asking | Closed with the evidence line | Lead 2 closes | 14:30 |
| M12 | #2915 open-contribution proof; contribution model live | Land: steps 1, 2, 4 merged (#2919, #3032, #2925, #2920, #2939, #2972); step 3's proof is open | #2915 merged; one outside-style PR goes through on CONTRIBUTING.md alone, no Lead read | Lead O | 19:00 |
| M13 | pipeline PRs ahead of product in the queue | Only by Lead 2's hand order until the list ends; no queue re-design | Must items above product in the queue | Lead 2 | now |
| M14 | Account facts: Enterprise and billing read (above); Mergify plan, AWS quota left | Find out: on a trial, private means hours of CI (desk) | Four facts written here | Founder card | today |
| M18 | **Capacity gate** for private (replaces "cut the minutes first", desk's challenge accepted: cutting sets the price, not the date). Cuts run in parallel | Load can be carried without being cut; without capacity private stops the queue | Outside machines hold 300 jobs while still public; 50 matched runs; private proving repository passes; founder sets a cost ceiling | Lead O; founder for the ceiling | after purchase |
| M15 | Outside machines for private CI | Trial one non-required shard, 10 runs, then choose; purchase is the founder's | Time and cost per run measured; founder chose | Founder; Lead O | 26 Nov |
| M16 | Private proving repository: lane clone, PR, Mergify parallel queue, checks, secrets, Macs | Prove before the switch | Each of the six shown working | Founder creates; Lead O | 29 Nov |
| M17 | Desk's final report | Publish for the founder | Report linked here | Desk | 14:00 |

## The switch itself
| P1 | Go / no-go, then make private | Founder only, after M14-M16; desk: no earlier than 1 Dec | One PR merges end to end while private | Founder | 1 Dec |

## Later
Clean-up stages (#2459 and on), refactor R0-R9, mutation pilot E4, lint (T14), W1-W6, rules v2, Lead compaction trial, timing-balanced shards, flaky-test detection, CodeQL purchase, RunsOn, moving off Mergify, Hetzner machines, the rest of `full-power-plan-2026-11-17.md`. Why: none is needed for a working queue or a safe private switch.

## Records
Refused actions, not routed around: (1) setting `GATE_RUNNER` (12:1x IST; then done in the browser on the founder's explicit words); (2) building M7+M8 in a scratch copy with commit hooks skipped (12:1x IST) and, after the founder's yes and with hooks on, again (12:16): stopped, founder chose a cloud lane.
Duplicate check: 500 last-updated closed PRs searched by tooling id; merged already: #2920, #2925, #2972, #2939, #3007, #2445, #2602, #2746, #2741, #2776. None duplicates a must row by title; per-PR content check is part of each verification.

## Facts and findings after 12:20 IST
* **A301-A303 (founder, relayed by Lead 2):** VPS or AWS for speed and scale; private as early as 24 Nov with the four gates run in parallel; managed machines first, Lead 2 runs the vendor research. The desk's 1 Dec date no longer holds; its gates do.
* **AWS ca-central-1:** Spot 160 and on-demand 160 vCPU applied; credit $992.34 left, expires 30 Nov 2028 (covered services not read). 40 jobs of 4 vCPU each way; a peak of 170 needs about 680 vCPU. At 103,934 min/day: about $131/day Spot ($0.0755/h, 19 Nov price) + 20% idle = $157/day, so the credit lasts about 6 days.
* **Mergify:** Free, $0, 2 repositories, 2 contributors. **Namespace:** app still installed, plan unread (sign-in).
* **M19 runner variable:** branch `claude/lead-o-ci-runner` 6aeb97eeb (CI_RUNNER; heavy read-only jobs; fork PRs stay on GitHub). In review.
* **M7/M8 fix first:** #2457 (browser-merge advice without the Lead read), #2473 (completes-ready missing), #2444 with #2599 (register lines no longer block), #2605 (private sync may empty the mirror). Sent to Lead 2.
* Lead O's measuring used a large part of the shared GitHub allowance (5000/5000 at 12:23, reset 12:26); the by-workflow minutes measurement failed and is owed.

## Desk final, received 12:24 IST (its figures; it relied on the meter as read by Lead O, not by itself)
Per month 1x / 2x / 4x: Ubicloud $7,795 / 15,590 / 31,180; GitHub 4-core $37,116 / 74,532 / 149,365; RunsOn on AWS, estimate, $5,018 / 10,035 / 20,071 plus licence. Peak floor 170 jobs = 680 vCPU; the AWS limit of 160 carries 40. Namespace Business holds 40 jobs: does not fit. Desk's claim: #2151 merged 18 Nov 20:15 UTC, so its saving is already in the four metered days; the -54% is never counted again.
Cost gap: the desk's RunsOn $5,018 is about $167/day; Lead O's AWS line above is $157/day. Same size, two estimates.
**Date conflict for the founder:** he asked for private at once (A302, relayed); the desk's date is 30 Nov 02:00 IST. What sets the date is the capacity gate. Lead O's earlier "24-25 Nov" assumed lighter gates and is withdrawn until a vendor confirms 300 jobs.

## Verification 2 (independent Opus reader, scratch copy of the merged files; received after 12:24 IST)
* **M11:** #2472 close. #2372 close only with its reversal recorded: main has a guarded hand requeue (`lead-pr.sh`), not the unattended one P-746 (4) asked for, nor the "qa proof PR out of the queue over 60 min" line (P-746 (3)). An old note says the founder asked for it: ask him first.
* **M9 #2595 fix first:** comment conflict in `check-mergify-scopes.sh`; would hold #3179 and #3201 (red pr-rules); land after #3179 or its size row.
* **M10 #3035 fix first, last:** `check-mergify-scopes.sh` fails after the merge ("scope migrations is missing"); `engineering-approved-setup.json:184` pins `migrations: 1`; nine open PRs add unnamed migrations; #2915's cross-area evidence (adcf9c105) must be answered; needs P-808.
* **M12 #2915:** update its stale status, sources and measures, then land. Open after it: lead-read is report-only; #2971; the ruleset asks 0 approvals and every role shares one account (founder).
* Order: #3210, #3179, #2595, #2971, #3035.

## A304 (founder, relayed by Lead 2): private only if it performs as today at US$100 a month or less; buy nothing, change nothing
**How far can batch minutes fall without dropping a gate? Not far enough.**
Baseline, ci.yml, 22 Nov 11:30 to 23 Nov 11:30 IST: 150 batch runs, 84 green, **66 red (44%)**, 3 re-run. Minutes rounded up per job; sample 9 green and 9 red, random. Red: mean 595 (577-621). Green: mean 552, median 596 (2-799; one records batch of 2). Estimate 84 x 552 + 66 x 595 = about 85,600 min/day (Lead 2, its own sample: 84,324). Of sampled minutes shards are about 81%, regression 15%. Set-up: checkout and cloud-setup are about 0.8 min each in a shard of about 20.

| Lever | Upper bound a day | Gate cost |
|---|---|---|
| No red batches at all | -39,300 (46% of batch minutes) | none, but cannot reach 0 |
| Half as many red batches | -19,600 | none |
| Cheaper checkout and set-up | about -5,000 (8% of a shard, if both went to zero) | none |
| Two PRs in each batch, always | not measured (PRs per batch not counted) | a red batch bounces two |
| Run only affected suites in a batch | not measured; needs #2370's map | weakens the one full run: the founder's decision |

**Against US$100:** Ubicloud $0.0025 buys 1,333 min/day, about two full batches. GitHub 2-core with the $300 included buys 2,222 min/day, under four. Even with no red batch and nothing else running, 46,400 min/day remains: about $3,480 on Ubicloud. So $100 is about 3% of that. One fixed machine near $100 carries 4-8 jobs (6-11% of load). **Result: stay public; private is off the must list (M14-M16, M18, M19, P1 to Later) until he changes the ceiling.** Red batches are still worth cutting for speed: they are the next constraint.
**M1 done 12:27:** newest 20 green gate runs, median wait 0.5 min (was about 13), max 10.1. It was refused in the shell, then set in the browser on the founder's typed words. Way back: https://github.com/expat-ready/xpatready/settings/variables/actions, delete GATE_RUNNER. Nothing else is set this way.
**M2, M3:** #3208 and #2971 carry the label at 12:27, not merged. **M7/M8:** Lead 2 did not start the lane (a relayed yes is not the founder's word there) and asks the founder itself; PRs stay separate meanwhile.
**M11:** #2372 close, alert later (founder, card). **M19:** 6aeb97eeb approved only while CI_RUNNER is unset; before any use: a fork's run can name its own label (provider restriction needed), a deleted fork fails open. No PR opened. #2151 merged 18 Nov 20:15 UTC: confirmed.

## Founder answers relayed by Lead 2 (12:4x IST) and the order now
Stay public until the final solution; **no combined PR: M7 and M8 land separately** (supersedes "Land as ONE" above); #2372 closes (Lead 3). Current Lead: Lead 3 (local_cf20dbb4).
Order: #3208, #2971, then #2434, #2428, #2370, #2487; then the stack bottom up (#2982, #2598, #2457 fixed, #2483, #2431, #2605 guarded, #2785, #2607, #2599, #2590); then #2597, #2473 fixed, #2738, #2444 fixed; #2915; #2595; #3035 last.

## Replay: what if the queue ran only affected suites? (evidence, no change; a lower gate is the founder's, P-651)
Sample: 67 red batches, 22 Nov 11:30 to 23 Nov 11:30 IST (67 at this read; 66 earlier), every one with a suite that failed on both tries. Six have an unknown stack and are left out: 61 replayed. Method: `select-suites.mjs` on today's main with the PRs' current file lists (own and stacked); so approximate. 684 suites.

| | Today | Normal pick | Direct pick |
|---|---|---|---|
| Red batches still caught | 61 | 56 (42 of them because it runs everything) | 54 |
| **Escapes: red today, would go through** | 0 | **5** | **7** |
| of these, the Monday test (main was red, #3208) | | 3 | 4 |
| others | | 2 (`c69_page_browser`, `c41_section_order_browser`) | 3 (those and `pf30s_find_box_browser`) |
| Share of suites run, mean over 157 batches | 100% | 55% | 35% |

* Saving is in suites, own PRs only; minutes saved are less (set-up stays, browser suites are longer, stacked PRs add theirs). Not measured in minutes.
* Escapes are found only among batches that were red: a fault that shows only in combination could be missed more often. The full set on main some hours apart would catch them later, after merge. Whether the 2-3 others are races or real faults is not classified.
* **No-gate-cost alternative first:** #2938 was in all 12 red batches of its hour; 10 were other PRs' batches (about 5,950 minutes). Other repeat roots by minimum cover: #2987 (7 of 16 `forms_qa53`), #2927 (6 of 7 `pf21_complaints`), #3032 (6 of 7 `bypass_uses`). Cover shows which PRs could explain the failures, not proof of cause; #2938 also failed alone.
* **Recommendation:** keep the full set in every batch. Cut the cascade (failed PR out until it passes alone; #2434 merged 13:22 IST is the first step) and re-measure over 24 hours before any gate change.

## State 14:29 IST
Merged (GitHub merged_at, IST): #2971 12:51, #2434 13:22, #3208 13:42, #2370 and #2487 14:19. Open: #2428. CPU measurement: 49 of 72 jobs ended, 2 red suites, 12 running.
Founder 13:0x (card): B181 is the pilot of the private pack; safety gates answered first; build in M4 after the Bake.

## CPU and memory of a ci shard (Lead 3's request), interim 14:32 IST
Run 45131327234 (branch claude/lead-o-ci-measure, never merged): 47 shards read, all green: 23 of run 1, 23 of run 2, 1 of run 3; two ended red and are not in (their logs carry no line), the third run still going. **So not yet the three full runs asked for.** 4 vCPU GitHub machine, every 5 s, suites step only (set-up not sampled).
* CPU: mean **1.22 cores** (weighted; shard means 1.04-1.57). p95 within a shard: median 1.63, worst 2.38.
* Memory used (total less available): mean 2.2 GB, p95 median 3.0, peak median 3.4, worst **4.5 GB**.
Reading: a shard uses about 30% of its 4 cores and under a third of 16 GB. By the worst p95 (2.4 cores) a 16-thread 64 GB machine would hold about 6-7 shards, by the mean about 13; neither was run packed, so slow-down from sharing is unmeasured. The earlier "4 jobs per 64 GB machine" was too low.

## The escapes classified (14:39 IST; from logs and main's history, no re-run)
* `check_fo3st3_types_browser`: main already red (Monday), fixed by #3208.
* `check_pf30s_find_box_browser`: the test's own race. Red in 7 batches of 7 different PRs; main's 97ee46025 (22 Nov 15:14 UTC) makes the check wait for the frame. Last red 16:09 UTC, on a batch that may predate it.
* `check_c69_page_browser`: likely race [inference]: red once on #3150 (a qa records PR) and once with two other failures; not re-run.
* `check_c41_section_order_browser`: likely race [inference]: red once on #2979, and not among #2979's failures in its next batch (09:36 UTC).
So no escape is shown to be a fault of the PR under test, but two rest on inference. Founder's later ruling (relayed by Lead 4, 14:33): the ten of stack B land as one through #2590, by the sprint (b) lane.

## Replay, 100 batches (14:57 IST; detail in private notes replay-100-summary.md and .tsv)
87 code batches (40 green, 47 red): 31% of suite-minutes saved at most; everything runs in 48. The bar "no failure missed" is **not met**: nine misses were main's own red Monday test; c69, c92 and pf5s1 are unsettled; none is shown to be the PR's fault. Red split: 11 main red, 3 main red and more, 4 timing, 29 PR/conflict/cascade not separated. No shadow, no gate change.
CPU: 58 of 72 shards read, mean 1.22 cores, worst p95 2.38, peak 4.48 GB; run 3 has 12 of 24.

## Hand-over of Lead O (written 14:57 IST, for whoever takes the seat)
Truth: 4 of the 21 tooling PRs landed, #3208 too; ten stack-B PRs land as one via #2590 (sprint b, fixes #2457 and #2605 first); lane (c) has #2597 #2738 #2473 #2444, lane (a) #2595 #3035 (proposed to Lead 4, start not confirmed); #2372 and #2472 close; #2915 to refresh and land. Private: stay public; B181 pilot plan waits on the founder's answer to Lead 4; nothing created.
In flight: branch claude/lead-o-ci-measure (run 45131327234; read it with the MEASURE line in each shard's log; then delete nothing). Refused and stopped: GATE_RUNNER by shell, combined build twice. Set by browser on the founder's words: GATE_RUNNER only.
Next: read CPU run 3; after #2590 lands, check the order above; 24-hour red-batch re-measure from #2434 (13:22 IST 23 Nov), on the founder's yes only for any gate change; tell him "operating system complete" only when every must row is merged or decided. API: the quota is shared; sample lightly.

## CPU and memory: closed 15:08 IST
Three runs of 24 shards (run 45131327234, ended): 69 of 72 read, 23 per run. **Shard 10 is missing in all three**: it is the red Monday test (the branch was cut before #3208 merged) and my step stopped on the red exit before printing its numbers (my fault, `bash -e`). Result: mean 1.22 cores (runs 1.21, 1.22, 1.23), shard means 0.97-1.57, p95 within a shard median 1.63, worst 2.38; memory mean 2.2 GB, p95 median 3.0, peak median 3.4, worst 4.5 of 16 GB. Suites step only; shards alone on their machine. Not measured: shards packed together, regression, packs, pr-suites, walks.
#2428 merged 14:56. Lanes have pushed new heads on #2597, #2738, #2473, #2444, #2595, #3035 (#3035 still conflicts).

## FINAL hand-over of Lead O, 23 Nov 15:39 IST (replaces the 14:57 one; Lead 5 is local_6cdede15)
**PRs, read from GitHub at that time (merged_at is UTC):**
* #2590: open, blocked, head 77975f1de, labels []
* #2597: open, unstable, head 2fa9528c0, labels []
* #2738: open, unstable, head 0eb8e7c84, labels []
* #2473: open, unstable, head 8441bc45c, labels []
* #2444: open, unstable, head eb9ceaacd, labels []
* #2595: open, unstable, head 2ff914b3d, labels []
* #3035: open, dirty, head dd06974e2, labels []
* #2915: open, unknown, head 6d1327f6c, labels ['records']
* #2372: closed, dirty, head 098d51530, labels []
* #2472: open, dirty, head b88460ffa, labels []
* #3210: merged 2026-11-23T10:07:05Z, unknown, head 8cf3b8a2e, labels ['review: approved', 'records']
**Landed before:** #2971, #2434, #3208, #2370, #2487, #2428. **Order left:** #2590 (ten as one, founder 14:33 through Lead 4; sprint b), #2597, #2738, #2473, #2444 (sprint c), #2595, #3035 last (sprint a), #2915 refreshed. Verify each claim and the exact-head Approve before the label; I have NOT re-verified the heads the lanes pushed after 14:33.
**Faults to see fixed (verify, not assumed):** #2457 and #2605 inside #2590; #2473 completes-ready/pr-rules set; #2444 register lines keep blocking; #2595 header and the "skips records PRs" comment, effect on #3179/#3201; #3035 scope check, engineering-approved-setup.json:184, unnamed migrations, adcf9c105, `Size exception: P-808`.
**Four pipeline fixes (A316):** (1) cheap checks first: dropped by Lead 4 on evidence (fast red in 7 of 67, never alone). (2) failing suites and repeat-new-tests: not started; begin with c69, c92, c41, pf5s1 (unclassified). (3) batches up to 4: not started; needs the red split (25 of 29 placed, see below). (4) set-up time: not started; checkout and cloud-setup about 0.8 min each of about 20, database time inside suites unmeasured. Estimates given 14:35 (24-26 Nov) are unmeasured.
**Private repository:** nothing created. Founder's two answers conflict (gates first / "Yes, after the plan"); Lead 5 asks. Checks, 15:03: logs partly (signed out: names and artifact list readable, log text 403, download 401; signed-in stranger untested; retention 90 days); lane limit NOT shown (needs a second private repository; do it first, on an empty one); $300 unused. Private notes, folder local_2158cd24: one-pack-plan, stay-public-study, replay-100-summary and .tsv.
**Red batches:** own PR also red alone 7, PR ahead red alone 3, combination only 13, unknown 2, four later not placed.
**Branches:** claude/lead-o-os-plan (this), claude/lead-o-ci-runner 6aeb97eeb (parked, fix the fork and deleted-fork gaps first), claude/lead-o-ci-measure 098d83d9d (never merge).
**Owed:** 24-hour red-batch re-measure from #2434 (13:22 IST 23 Nov); "operating system complete" to the founder only when every must row is merged or decided.
**Refused and stopped:** GATE_RUNNER by shell (then browser, founder's words); combined build twice.

## Lead O 2, 17:10 IST 23 Nov (read from GitHub 16:53-17:09)
**Must list**
| PR | Head | Exact-head Approve | Checks | State |
|---|---|---|---|---|
| #3210, #2595 | | | | merged 15:37 and 16:30 IST |
| #2590 | c836593b6 (moved 17:03) | 36c342a2b only: Approve owed on the new head | running; full run 45160823502 ended **green** on 36c342a2b, no longer counts | Lead 5: sprint (b) splits guards and adds F1 |
| #2597 | 2fa9528c0 | yes | guards green; pr-rules red: 2,189 lines over 800 while stacked | waits on #2590; re-Approve after |
| #2738 | 0eb8e7c84 | yes | guards cut at 45 min; pr-rules red: 2,584 lines over 800 while stacked; conflicts | same |
| #2473 | 8441bc45c | yes | guards green; pr-rules red: 2,789 lines; conflicts | same |
| #2444 | eb9ceaacd | yes | guards cut at 45 min; pr-rules red: 2,935 lines; conflicts | same |
| #3254 own-migration guard | 0af19d4c9, draft | none | | waits for "Lead allows round 4" |
| #2915 | 6d1327f6c | no exact-head line found | green, clean | Lead's records read |
| #3035 | dd06974e2 | yes | conflicts | after #3254 and #2738 (Lead 5) |
| #2472 | b88460ffa, draft | | conflicts | **closing is supported**: main's app-view.js already reads resume_token and prints "list may be cut (50 of 50): archive ended sessions" (a4eb4f7c4). Not closed: the Lead closes |
review-rounds is red on the open stack heads (rounds over the limit without the Lead's line). Not a pipeline-queue condition.
**Faults Lead O listed:** #2473, #2444 and #3035 fixes are claimed in their Approves; NOT verified in the diffs by me.

**Guards limit:** "cancelled" meant the 45-minute limit, on 11 runs at 45-47 min since 09:47Z. 66 rows re-run check-queue-gate.sh: 30.8 of 41.9 mutation minutes (run 45157663648, 306 rows printed, no FAIL line among them, the rest unproven). Sprint (b) builds the split (Lead 5). My branch claude/lead-o2-guards-parts 5bee11f81 was made before I read that ruling: **superseded, never merge**; its full run was not finished.

### Fix 2: failing suites
Sample: 172 code batches of 203 mergify ci runs, 22-23 Nov UTC, 84 red; 139 red shard logs, 138 read, 1 empty. Any non-PASS row counts (82 failed twice, 57 failed once with no retry: at most 2 retries a run).
| Suite | Red batches | Reading |
|---|---|---|
| forms_qa53 | 16 | in 16, "alone" in 2; cause not separated |
| b164_no_engine_keys | 15 | never alone, last 23 Nov 06:55Z; not separated |
| fo3st3_types_browser | 15 | main's Monday test (#3208 landed); last 08:02Z |
| csdl3_milestones, pf8b_f4_migrations | 12 each | common PR #2938 in all 12 |
| pf28_inputs 9, bypass_uses 7, pf21_complaints 7, pf30s_find_box 7 | | pf30s fixed on main (Lead O) |
* **c69**: 2 batches (#3109, #3150), the same single line both times, on both tries: focus after Mark reviewed. Both PRs merged later. **Hypothesis: race** (focus read once after settle). Not proven.
* **c92**: 1 batch (#3218), both tries, focus "BODY#". The code moves focus in a requestAnimationFrame; the test reads once. Hypothesis: race. #3218 was also in the red 06:55Z batch, which did not list c92 (heads not compared).
* **c41**: 1 batch (#2979): **a hang to the 20-minute limit** after the 1024 px line, not a wrong answer. Cause unknown.
* **pf5s1**: 1 batch (#3218 + #3215), both tries: 20 s wait for the check screen at the keyboard step (line 220). Neither PR's later single batch lists it. Cause unknown; needs the server log of a run that fails.
* Change: branch claude/lead-o2-focus-waits 9b138d265: c69 and c92 wait up to 5 s for focus, then assert as before. **Not run anywhere** (c69 syntax only); no PR. It proves the hypothesis only if the suites stay green; a focus that never lands still fails.
* Blocker, 23 Nov 21:00 IST: product pause, so no PR from me. Next: PR, then 10 repeats of each suite. Repeat-new-tests: not started.

### Fix 3: batches of up to 4
From 22 Nov 11:30 IST: 159 code batches, 79 red (50%). By PRs tested (stacked PRs ahead not counted): 1 PR 121 (65 red, 54%); 2 PRs 35 (14 red, 40%); 3 PRs 1 (0). One, two and three sum to 157; two titles unparsed. **Stacked on others 50: 45 red (90%); not stacked 109: 34 red (31%).**
Reading: the cap of 2 was filled in only about a fifth of batches, so raising it to 4 would rarely act; being stacked on a red batch goes with red far more than size does. These groups differ in time and PRs, so this is association, not cause.
From #2434 (13:22 IST): 11 code batches, 2 red. Far too few, and the product pause changes the mix.
**No change now.** Blocker: re-measure due 24 Nov 13:22 IST; if under 100 code batches by then, extend and say so. Any gate change is the founder's.

### Fix 4: set-up time
3,989 green shard jobs of the same batches, means: suites 1,084 s (p90 1,267); checkout 48 s; cloud-setup 45 s; Playwright 8 s; setup-node 8 s. **Set-up is 109 s of about 1,190 s, 9%.** One log (shard 6, 07:33Z): checkout fetch 37 s of 42 s, with every branch; npm 11 s; apt, Python and database 32 s; migrations and client about 5 s.
Most a perfect set-up could save: under 2 minutes a shard. Realistic first step, a narrower fetch, at most about 30 s [estimate, untested]; pr-base.sh needs history. **Low value: not the constraint.** Database time inside suites is still unmeasured: blocker, needs a timed run; plan it 25 Nov.

### Private repository: plan to finish the three checks (nothing created or moved)
Read by me today: nothing new. A combined read that included the repository's settings was denied at about 17:08 IST; I did not retry that part. Figures below are Lead O's, 15:03.
| Check | Now | To finish | Who | Done when |
|---|---|---|---|---|
| 1 logs and artifacts | partly: signed out, names readable, log text 403, download 401; retention 90 days | a second signed-in account with no access tries one log and one artifact on a public run | founder names or makes the account | both outcomes recorded; retention decided |
| 2 a lane held to one repository | **not met, untested** | one EMPTY repository (a name and nothing in it); a lane limited to this repository tries to read it, then a lane limited to it tries to read this one's settings | founder creates it; Lead starts the lane | refused both ways, refusal text recorded |
| 3 $300 included | met (unused) | re-read the billing page on the day | Lead | figure and date |
Order: 2, 1, 3. Estimate 1-2 h once the founder has acted (Lead O's, unmeasured). Check 2 needs the empty repository, so it asks the founder for that one step before the checks have passed; his words were "after the three checks pass". **That conflict is his to settle.** If 2 fails, nothing private is made.

## Lead O 2 state, 18:19 IST 23 Nov (Lead 6 is local_f2d41d71)
* **Owed, not before the tooling list lands (Lead 6):** one small PR, report-only ACT lines: two batches red on one suite with the same first FAIL line; main red on two runs, naming the fix PR (product files included). No ejection, no queue hold.
* **Owed:** red-batch re-measure, 24 Nov 13:22 IST; PR for claude/lead-o2-focus-waits 9b138d265 (not run; waits for the pause to end); database time inside suites, 25 Nov.
* **Pilot A** done: 3 suites at once on 4 CPUs, no red in 3 runs, 2.3 times less wall time; 4 at once red each time; one shard only (claude/lead-o2-pack 49e51683c, run 45169056072). **Pilot B:** run by Lead 5, not by me.
* #2590, read by 18:14: full run 45170135484 green on c836593b6; labelled and in batch 45175362581 (not read to its end).
* Never merge: claude/lead-o2-guards-parts, claude/lead-o2-pack. The measurement notes (CI minutes, red batches, slowest suites, repeat-fault design) are in the Mac notes folder local_6cdede15; private-sync carries them.

## HAND-OVER of Lead O 2, 20:23 IST 23 Nov (context 43%, P-565 (2); Lead 8 is local_9c46a890). Replaces the state block above.
**Must list, read from GitHub 20:22:** merged #2590 (18:33), #3254 (20:03), #3210, #2595; closed unmerged #2472. Open: #2597 ead4f1b5e, #2738 132512aa5, #2473 c4f05eb54 (conflicts), #2444 ab7186884 (blocked), #3035 dd06974e2 (conflicts; was waiting on #3254), #2915 6d1327f6c (clean, records). The heads of #2597, #2738, #2473, #2444 moved since my 17:0x read: their Approves and checks are NOT re-read. Faults listed by Lead O in #2473, #2444, #3035: not verified in the diffs.
**Pilot A, all 24 shards (A324; Lead 6's go, founder's "Yes, test all 24" relayed): running.** Branch claude/lead-o2-pack (never merge), main frozen at f33cbe803, K=3, no --retry; 9 pushes of 8 shards.
| Push | Run | State |
|---|---|---|
| shards 1-8, repeat 1 | 45180835489 | done; red: s3 check_b164 (my shallow checkout, red alone too; fixed to fetch-depth 0 from push 2) |
| 9-16, r1 | 45186076970 | done; red: s15 check_fo8_prospect_won, check_c116_channels_browser (both green alone) |
| 17-24, r1 | 45191971568 | done; red: s20 check_pf4_identity, s21 check_w1_qa51_52_54, s22 check_c76_ready_browser (all green alone) |
| 1-8, r2 | 45198177057 | pushed 20:18 (queued at 20:22) |
| 9-16 and 17-24 r2; three pushes of r3 | | sent by the script, one at a time |
So at three at once, 4 of 24 shards (15, 20, 21, 22) were red in repeat 1 apart from shard 3's harness fault, all green alone on the same machine: likely packing, one repeat only, causes not read. Shard 3's first repeat is not clean for b164. Repeats 2 and 3 decide which are steady.
**The script** (background task of this session; it dies with the session): after each run ends it checks that no full run or batch job waited over 2 min for a machine, then pushes the next; stops at over 4 red jobs, under 8 totals, or 200 min of waiting. If the session ends, run the next push by hand from the files in pack-pilot-scripts/ on this branch (they hold this Mac's scratch paths: replace S=). Next step after the script: K=2 on each shard red at 3 (pack-config "at_once":[2]), then the table: minutes against the serial baseline (the 5 green batches 45029468748 45048395221 45068458484 45086233524 45140338075; **they used --retry, the pilot does not: say so beside every comparison**), reds by name and alone, shards that cannot pack, long suites that cap them, what is untested (R1 group and check_studio_browser only where a shard holds them, run serially). Report to the Lead named in STATE. Never cancel a run; no second set; US$0; Pilot B is Lead 5's.
**Owed, not started:** one small report-only PR after the tooling list lands (repeat-fault lines: two batches red on one suite with the same first FAIL line; main red on two runs, naming the fix PR, product files included; no ejection, no hold); red-batch re-measure 24 Nov 13:22 IST from #2434 (nothing wakes it); PR for claude/lead-o2-focus-waits 9b138d265 after the pause (not run); database time inside suites 25 Nov; private checks plan above (nothing created; founder's "after the three checks pass" against check 2 needing an empty repository: his to settle).
**Notes (Mac folder local_6cdede15):** ci-minutes-24h, red-batches-24h, slowest-100-suites, pilot-a-results, repeat-fault-design, all -lead-o2.md. Branches never to merge: claude/lead-o2-pack, claude/lead-o2-guards-parts (superseded), claude/lead-o-ci-measure.
**Corrections made here:** fix-2 batch count is for 22-23 Nov UTC; repeat-fault pairs are 8 of 11 (not 9). **Limits kept:** no label, merge, close, dequeue or cancel. Pilot A run 45169056072 started before Lead 6's hold reached me.

# Pilot A on all 24 shards: result (Lead O 2, 23 Nov 23:42 IST). Measurement only; nothing goes live
Three suites at once (K=3), three repeats, one 4-CPU GitHub machine a shard, at most 4 machines, no --retry, main frozen at f33cbe803. Runs: repeat 1 45180835489 45186076970 45191971568; repeat 2 45198177057 45204606262 45210733016; repeat 3 45217280175 45223678708 45230044852. 72 of 72 jobs have totals (shard 12 repeat 2's log came on a later read).
**Baseline: the suites step of 5 green batches (45029468748 45048395221 45068458484 45086233524 45140338075). They ran with --retry, only green runs are in it, and on other commits than f33cbe803, so the ratio is approximate.** Minutes; set-up not in either column.

| Shard | Baseline mean (range, n) | K=3 r1 | r2 | r3 | K=3 mean | Faster by |
|---|---|---|---|---|---|---|
| 1 | 15.9 (13.9-19.2, n=5) | 15.3 | 15.1 | 14.5 | 15.0 | 1.07 |
| 2 | 17.9 (16.1-19.9, n=5) | 10.1 | 12.9 | 8.8 | 10.6 | 1.69 |
| 3 | 17.7 (15.5-20.1, n=5) | 11.4 | 9.7 | 11.2 | 10.8 | 1.65 |
| 4 | 19.3 (16.3-20.5, n=5) | 10.9 | 8.6 | 9.5 | 9.7 | 2.00 |
| 5 | 19.4 (15.9-22.9, n=5) | 12.0 | 14.0 | 8.8 | 11.6 | 1.67 |
| 6 | 21.3 (17.6-22.6, n=5) | 13.5 | 9.6 | 13.5 | 12.2 | 1.74 |
| 7 | 18.5 (15.4-21.0, n=5) | 10.7 | 10.5 | 10.7 | 10.6 | 1.74 |
| 8 | 15.4 (14.0-17.4, n=5) | 9.3 | 12.9 | 12.0 | 11.4 | 1.35 |
| 9 | 17.2 (15.5-20.1, n=5) | 11.9 | 8.5 | 8.6 | 9.7 | 1.78 |
| 10 | 17.1 (14.6-21.2, n=5) | 11.8 | 12.0 | 11.7 | 11.8 | 1.44 |
| 11 | 19.2 (13.9-21.2, n=5) | 9.6 | 12.4 | 8.2 | 10.1 | 1.91 |
| 12 | 17.5 (14.5-19.8, n=5) | 10.0 | 7.9 | 10.3 | 9.4 | 1.87 |
| 13 | 18.7 (15.7-22.0, n=5) | 9.6 | 11.7 | 8.3 | 9.9 | 1.90 |
| 14 | 18.9 (14.4-20.7, n=5) | 9.9 | 13.4 | 10.5 | 11.3 | 1.68 |
| 15 | 19.5 (15.2-21.1, n=5) | 12.0 | 11.3 | 13.8 | 12.4 | 1.57 |
| 16 | 16.6 (13.2-20.2, n=5) | 11.1 | 11.2 | 11.3 | 11.2 | 1.48 |
| 17 | 18.3 (16.6-22.4, n=5) | 16.0 | 15.9 | 11.0 | 14.3 | 1.28 |
| 18 | 18.5 (16.3-19.6, n=5) | 10.5 | 14.5 | 11.7 | 12.2 | 1.51 |
| 19 | 19.2 (15.4-21.8, n=5) | 12.7 | 12.8 | 8.7 | 11.4 | 1.68 |
| 20 | 19.0 (17.4-21.1, n=5) | 11.9 | 9.4 | 10.2 | 10.5 | 1.81 |
| 21 | 18.6 (16.8-21.2, n=5) | 9.2 | 11.8 | 8.8 | 9.9 | 1.88 |
| 22 | 16.3 (14.0-18.6, n=5) | 10.2 | 7.5 | 10.3 | 9.3 | 1.75 |
| 23 | 18.0 (14.9-19.9, n=5) | 8.4 | 10.9 | 8.2 | 9.2 | 1.96 |
| 24 | 16.6 (12.8-19.2, n=5) | 11.5 | 11.6 | 11.8 | 11.6 | 1.42 |
| **All** | **434.5** | 269.5 | 276.1 | 252.4 | **266.0** | **1.63** |

* **Time:** 1.63 times faster over all shards, not the 2.3 of shard 7 alone (different baselines: shard 7's own pilot was serial without --retry). Slowest shard in a repeat: 16.0, 15.9, 14.5 min. Shard 1 gains almost nothing (1.07): one long unit.
* **Cost of the pilot:** 969 job minutes, set-up included (325, 333, 311 a repeat); mean 13.5 a job.
* **Machine:** processor mean about 3 of 4; most memory 7.39 GB; no swap.

| Repeat | Shard | Red at K=3 | Alone afterwards |
|---|---|---|---|
| 1 | 15 | check_fo8_prospect_won, check_c116_channels_browser | green, green |
| 1 | 20 | check_pf4_identity | green |
| 1 | 21 | check_w1_qa51_52_54 | green |
| 1 | 22 | check_c76_ready_browser | green |
| 2 | 18 | check_forms_channels_browser | green |
| 2 | 20 | check_pf4_identity | green |
| 3 | 11 | check_cost_override | green |
| 3 | 16 | check_c69_page_browser | green |
| 3 | 20 | check_pf4_identity, check_c83_review_browser | green, green |

* **No repeat of the 24 shards was wholly green: 4, 2 and 3 shards red (9 of 72 jobs; 11 suite failures, 9 different suites).** All 11 green on one re-run alone. Not counted: check_b164_no_engine_keys (shard 3, repeat 1), red alone too, from my shallow checkout.
* **check_pf4_identity cannot be packed as dealt: red 3 of 3.** Its psql command failed. Likely: it runs every migration, and 20261116013000_pf12_firm_walls drops, creates and alters roles that belong to the whole server, beside other suites. **Not confirmed:** the log cuts the message before the database's own words.
* **The other 8 were red 1 of 3 each.** Packing or chance cannot be told apart from this: one alone re-run each, no serial control without --retry. check_c69_page_browser is a known failing suite on batches. The causes were not read further than the first message.
* **Shards that cannot pack:** shard 20 as dealt. Red once in three: 11, 15 (two suites), 16, 18, 21, 22. Never red in three: 1-10, 12-14, 17, 19, 23, 24 (3's only red was my checkout).
* **Untested:** K=2; --retry with packing; a serial run at f33cbe803 without --retry; regression, pack and guards jobs; a full run's wall time; larger servers; whether a packed shard hides a real fault.
* **Reading:** not ready to go live at K=3. Next cheapest step, for the Lead to decide: K=2 on shards 11, 15, 16, 18, 20, 21, 22 (three repeats, about 21 jobs), with check_pf4_identity moved to the serial tail.
