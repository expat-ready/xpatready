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
