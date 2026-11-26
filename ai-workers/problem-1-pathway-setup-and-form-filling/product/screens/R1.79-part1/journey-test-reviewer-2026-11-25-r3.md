# R1.79 part 1 (CS-R1 part 1): journey test, reviewer, round 3, 25 Nov 2026

PR #3642, head `d8cc68eb13aac8e2c5d2bfc6115008da76524f98`. This round reviews only the diff from `bfd4ae9cc` (round 2). The only code change is to `studio/tests/check_csr1_reports.ts`. The app code (`api/src/`) is the same as in round 2.

**API only, no screen.** Steps 2 and 3 of the skill do not apply: there is no visible walk and no Playwright run with axe, widths or keyboard. PF-R3 is the item that puts these numbers on screen.

**How I walked them:** the PR's own suite and my mutations go through the one door, `ReportsController.query`, as `xr_app` inside `withFirm`. They ran on a scratch copy of `studio/` in the scratchpad. Postgres was at 127.0.0.1:54329; I never used :4400. Cost: US$0.

## Journeys (only the ones this diff touches; journeys 1 and 3 to 9 are as in round 2, same app code)
2. **Owner, alternate: "Corporate files only."**
   * The suite now builds the real shape: combination → PROGRAM → Pathway, with that Pathway inside an outer Pathway of the other type (`test:69-77`).
   * Corporate keeps c2 only, and Individual leaves it out. **Held** (DW5).
   * Firm B's 400 combinations still split about a third Corporate. **Held.**
10. **A firm in another zone: "My months, in my firm's zone."**
    * With `platform.time_zone` stored as Asia/Kolkata for firm A, c6 is counted in November. c6 was opened at 03:30 UTC on 1 Nov, which is 09:00 that day in Kolkata.
    * The months read Oct 1 and Nov 3, against Oct 2 and Nov 2 on the Toronto default (`test:182-186`). **Held,** and now in the suite.
8. **Odd input: a start date before 1970.**
    * `0001-01-01` gives OK (`test:187`). **Held.**
    * That line does not catch the removal of the frame's clamp, because year 1 is a valid Postgres date (review-3 R3-n1).

## Data underneath
* The suite gave 43 passed and 0 failed, twice: once on the repo files and once on the scratch copy. The reads are SELECTs only, so no audit line is expected.
* **Removals now caught:**
  * the walk cut at the first node (2 fail);
  * the farthest Pathway instead of the nearest (1);
  * the zone hard-coded to Toronto (1);
  * the month buckets hard-coded to Toronto (1);
  * the PATHWAY filter dropped (2);
  * a join on the combination's own id (1, caught only by the 400-combination line).
* **Still not caught:** removing the frame's pre-1970 clamp (43/43 with `0001-01-01`; 1 fails with `0000-01-01`). This is round 2's n1, carried to part 1b.

## Break (short)
* The outer Pathway in the fixture is a shape the editor refuses: "A pathway is the top level under its type; it has no parent" (`api/src/structure.ts:84`; BR-8 at `:89`). On data the editor can make, the nearest and the farthest Pathway are the same.
* So the outer level pins the rule of `groupOfCombination` (`case-count.ts:63`). It is not a case a person can reach (review-3 R3-n2).

## Score (each 0, ½ or 1)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | All four numbers come through the one door and are exact on the fixtures (DW2) |
| Next step obvious | ½ | No figure has a drill-through yet (DW6). The row that brings a scoped case list is still to be named (carried, m3) |
| Plain words | 1 | Each definition says what it counts and says "in the firm's time zone" |
| Feedback and state | 1 | OK, WITHHELD and UNAVAILABLE per number; 403 OWN_ONLY; the 200-row cap is stated in a row |
| Correct data | 1 | Corporate and Individual are right on the real tree shape; the months follow a stored non-default zone (now in the suite) |
| Error recovery | 1 | An empty range gives 0; dates before 1970 give OK, never a 500 |
| Accessibility and screen sizes | N/A | No screen (PF-R3) |
| Speed | 1 | DW7 is within 200 ms at every scope. Round 2's probe at three levels deep: 7-13 ms per metric |
| Visual quality | N/A | No screen |
| Trust and sources | 1 | Every value is labelled Sample; every definition says "Only cases you may open" |

**7.5 of the 8 criteria that apply = 9.4 / 10 scaled, no 0. Journey verdict: pass.**

What would raise the one ½: name the row that brings a case list kept to open cases and to the viewer's scope (carried to part 1b).

## Not tested
* A screen reader, keyboard use, widths and axe: there is no screen.
* An intended user's unaided walk: D17 and D20 stay with the founder.
* The running demo: not used, by the brief.
