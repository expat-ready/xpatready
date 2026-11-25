# qa: Wave 0 stale rows carried forward, 19 Nov (main 4c47c1bad)

**Ask (Lead 83, A173):** re-score R1.3, 4, 8, 10, 26, 32, 33, 88, 106, 108 and 110 (`design/release1-end-to-end-review-2026-11-18.md` §5, Wave 0) on current main. Opus 5.5; live AI off; US$0; no isolated copy (no row claims Works).

## Duplicate check
All 11 rows were re-scored on main 15c75cd52 on 18 Nov at ~19:2x-19:3x IST: A-F in #2136 (`2026-11-18-capability-R1-rescore-A-F.md`) and G-L in #2131. R1.4 was last scored on d66bcfd2 (16 Nov), held by QA-499 until PF-12b. So the question is only whether anything they wait for has merged since.

## What merged since 15c75cd52 (app code)
PF-18a part 1 #2009, PF-18b #2064, PF-5t part 2 #2135, PF-21s part 4 #2134, FO-1p #2138. Everything else was tooling, records or qa. **None of these is a missing part of the 11 rows.**

## Verdicts (all unchanged)
| Row | Status | Still waiting for |
|---|---|---|
| R1.3 Walls between firms | Partial | CS-W1 (#2125 approved, not merged), CS-W2, CS-W3, CS-W4 |
| R1.4 Each query runs inside its firm | Partial | PF-12b (#2029) to close QA-499 |
| R1.8 Audit trail nobody can edit | Partial | AUD-1b (#2124), AUD-1m parts 1, 2a, 2b, PF-0a |
| R1.10 Checking every input | Partial | PF-28 |
| R1.26 Public enquiry form | Partial | FO-4b |
| R1.32 Assign, take, reassign | Partial | FO-10 |
| R1.33 Phone numbers | Partial | an impossible number refused on the field, keeping the country |
| R1.88 The firm reads its own audit log | Not built | AUD-1m and an audit view row |
| R1.106 Pathway assessment AS-1 | Partial | AS-1g, AS-1s, AS-1c |
| R1.108 Conflict-of-interest check | Partial | FO-13c |
| R1.110 Client identity check | Partial | FO-13i (#2011 approved, not merged) |

**Evidence on current main:** ci 44365809886 (merge batch of #2155) is green, and its tree equals main 4c47c1bad's. **0 rows to Works.** The nearest to move: R1.110 on FO-13i #2011 and R1.3's first step on CS-W1 #2125, both in qa-4's list for tonight.

## Question for the tech lead
* None of the 11 can move tonight without their parts. R1.4 needs PF-12b #2029 (not labelled); R1.10, 26, 32, 106 and 108 need rows not yet in flight. Should any of them be started for A173, or does the target count on Wave 1 instead?
