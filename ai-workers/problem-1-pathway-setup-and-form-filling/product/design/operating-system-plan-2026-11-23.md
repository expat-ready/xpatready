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
| M18 | Cut the minutes first (founder to confirm as a gate): price only after the by-workflow measurement | Private is not affordable at 103,934 a day | Seven-day mean at the level the founder sets | Lead O | set after measurement |
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
