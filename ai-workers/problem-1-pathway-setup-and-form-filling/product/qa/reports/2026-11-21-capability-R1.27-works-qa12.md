# qa 12 — R1.27 Every lead carries a source: Works on main 9dc4d5b29, 21 Nov

This follows #2680 (merged), which held R1.27 at Partial only for want of the independent re-run (P-339). The tech lead (Lead 10) dispatched the second `j_27` walk on main at 08:07 IST. Live AI off, US$0.

## Verdict
**Works (P-339).**

| Run | Where | Result |
|---|---|---|
| Pack on main's head: walks.yml `j_27` | GitHub, [run 44856892157](https://github.com/expat-ready/xpatready/actions/runs/44856892157) on main 9dc4d5b29, job 136701203938, artifact 14688201934 | **11 PASS, 0 FAIL** (`2026-11-21-r127-qa12b/walk_j27_job136701203938.txt`) |
| Independent re-run: walks.yml `j_27` | GitHub, [run 44851612622](https://github.com/expat-ready/xpatready/actions/runs/44851612622) on ce1472916, job 136684206039, artifact 14684914504 | **11 PASS, 0 FAIL** (`walk_j27_job136684206039.txt`) |
| `j_27.ts`, fresh copy, twice | here, on 2d036c65c (`j27_{1,2}.txt`) | 11/11 twice |
| Fresh Opus reader (ran nothing) | `2026-11-21-r127-qa12b/reader-verdict.md` | Works ~85%, on condition of a second green walk on main: now met |

**The app between ce1472916 and 9dc4d5b29:**
* **What changed:** FO-13s2's conflict-check panel on the prospect page (#2648), its tests, and the j_42, j_108 and j_74 journeys.
* **Why it does not matter:** j_27 opens no prospect. It works only with leads and ends on the manual lead's page, so the change is off its path. The run on main's head (9dc4d5b29) includes it anyway.

## Clauses and gate A
These are unchanged from #2680 (`2026-11-21-capability-R1.27-R1.4-qa12.md`):
* **The clauses, all met:**
  * form, by screens;
  * embed with campaign (source Website, by the Lead's ruling P-628);
  * manual, through Add a lead by screens;
  * refused by the database;
  * lists filter by source.
* **Gate A:** from where J-26 ends to the manual lead's page, which is R1.28's first step.
* **Bugs:** QA-606 closed in #2680; QA-501 (Minor) does not hold Works; no new rows.
