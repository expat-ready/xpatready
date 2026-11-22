# Lead 17's hand-over lines (6b) and (6), word for word (moved by Lead 18, 22 Nov 04:0x IST, STATE size)

(6b) **Owed (Lead 17):** DECISIONS rows: R1.19 billing period must be state (#2857 7067556246); QA-483 closed + J-19 invite form enough (#2857 7069419717); QA-500 wording + PF-12b4 "picks" (#2845 7065582186; #2846 7064558286); R1.3 off this cycle; R1.10 row 422/400 wording; P-277 carry-over on a pure main merge (#2687 7069400906). BACKLOG: PF-28 parts 2-6 (QA-507 into part 2), CS-W2/CS-W3 p2-3/CS-W4, **hot files: split qa/CAPABILITIES.md per row and tests/check_pf12b_bypass_audit.ts / check_pf28_inputs.ts (conflicted every merge tonight)**, Minors from #2687's reviews (fo3st3 empty-state, heading order), check_fo2pv DW5 digits-in-ids flake row. `claim --strict on` for the Completes warning after a day. A gh-fallback.py fix sits only on this lead branch (c084fecda): give it its own PR.
(6) **Lead 16's owed records** (QA-697 Major row, Lead 15 rulings, BACKLOG image scan, RDS CA, QA-641-645): word for word in the 03:20 history file above.

## Founder ask pointer rows A242-A271, word for word

| A268-A271 | 21 Nov | word for word in `product/history/STATE-2026-11-21-1925-lead16s3-asks-A268-A272.md` (account switch plan, commitment 8/10/13, recovery, full walk) | |
| A265-A267 | 21 Nov | word for word in `product/history/STATE-2026-11-21-1730-lead15s3-asks-A265-A267.md` (domain parked, AWS case, SHARDS) | |
| A242-A264 | 21 Nov | word for word in `product/history/STATE-2026-11-21-1655-lead15s3-asks-A242-A264.md` (pointers inside lead to older files) | |

## Lead 17's hand-over line (5), word for word (moved 04:1x)

(5) **Open PRs and lanes:** **#2687 DEMO-LINK** (lane session_01MXNda77VALMtKJQoBfkmS4): merge c3962469b, Lead P-277 carry-over Approve + round 8, **/run full 44951016174 running** → label when green (it failed twice before on its own check_pf28_inputs interaction, fixed). **#2794** R1.10 PF-28 2b-2c queued (Lead B (11), local_3a725fd1). **#2871** PF-12b5 (QA-703 webhook_receipt RLS) merged 01:5x. R1.19 build lane (session_01MXNda7vUuZ1C9LJ8ySRdxn) at 73% context: told to stop after #2870 (done) — archive when idle. PF-16 lane (session_01MXNda5c7Yfq9rSkTjNf8eL) building PF-16 part 1 (#2866, R1.90; Lead B reads). qa Q7/Q8 done (records merged); qa Q6 (R1.4) done. proof-route lane done (#2860 merged).

## Lead 18's 04:0x line, word for word (shortened in STATE 04:2x)

* 04:0x **Night plan (A275).** Founder asleep; AWS sign-in moved to tomorrow (AWS session confirmed not signed in, 03:4x). 11 by 07:00 only via R1.19 (#2857: batch #2877 failed on shard 24 `check_s5_slice3_browser.cjs` C11.15 click timeout, outside its code; /run full 44955768170 on 2f4e76405 → relabel with Batch failures covered if green, else a main fix row). 15 by 07:00 is not reachable (every other Partial has 2+ unbuilt parts). Build for the next cycle: cloud lanes started 03:5x (Opus 5.5 medium): R1.29 FO-9a next part (task_d7a6fff3), R1.102 CS-S1 p2 (task_1b1ef7d6), R1.105 AUD-5 p2 (task_775af100), R1.92 PF-18a p2 (task_d4382526; Lead B reads), rescue #2038 FO-6 p1 R1.54 (task_9f59c078). Standby Lead 20 local_29230626 (after Lead 19 local_69eeb2bd). #2687 merged main (b8ecf6717), Lead B labels.

## Lead 18's lines 03:2x-04:2x, word for word (moved 05:1x)

* 04:2x **R1.10:** Lead B: PF-28 parts 3-6 had no lane, all independent (shared: pf28-allow-list.json + ceilings). Part 6 (money, 7 probes) given to the idle DEMO-LINK lane (P-341, new branch). **Parts 3 (split 3a/3b), 4, 5: start cloud lanes at the founder's next typed turn** (cron/message turns can't start). R1.10 lane told to stop (long context; part 2 Amazon notice schema left).
* 04:1x **Next 24 h (A276, P-784): cap 12 to 07:00 23 Nov.** Estimate 6-9 proven 07:00 22 Nov → 07:00 23 Nov (R1.13/15/24/5 need the founder's AWS sign-in first). Four more cloud lanes 04:1x: PF-25w+QA-642 R1.24 (task_486443d2), PF-4b+QA-643 R1.5 (task_97a4fd3b), PF-5s R1.90/R1.92 (task_b53b0b1c), PF-18s R1.92/R1.93 (task_af7cd905). Lead B told.
* 04:0x **Night plan (A275):** founder asleep, AWS tomorrow. 11 by 07:00 only via R1.19 (#2857 dequeued: shard 24 `check_s5_slice3_browser.cjs` C11.15, outside its code; /run full 44955768170 → relabel if green, else main fix row). Cloud lanes 03:5x: R1.29 FO-9a, R1.102 CS-S1 p2, R1.105 AUD-5 p2, R1.92 PF-18a p2, #2038 FO-6 p1 (R1.54). Standby Lead 20 local_29230626. Full line: history file 0400.
* 03:2x took over (check 28212e5f).


## Lead 17's hand-over line (3), word for word (done 05:3x)

(3) **R1.19 next (→ 11):** **#2857** (qa Q9, session_01MXNda4hZgzXj4GgJnHZh5a; j_19 checks billing_period) independent Opus Approve + labelled, **in the merge queue**. On merge: check item-proof on its merge commit, dispatch `walks.yml` journeys=j_19 on main, tell Q9 to open the Works PR (close QA-483 in it; ruled closed 02:5x). #2870 PF-5 part 3 (billing_period column; Checkout uses the stored period) merged 02:2x.
