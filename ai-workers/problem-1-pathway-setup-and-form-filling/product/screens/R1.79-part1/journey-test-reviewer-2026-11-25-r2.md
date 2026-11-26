# R1.79 part 1 (CS-R1 part 1): journey test, reviewer, round 2, 25 Nov 2026

PR #3642, head `bfd4ae9ccdb8b267762fa32534de2fa36c36ee1b` (round 1 was `39ccdbd35`).

**API only, no screen.** Steps 2 and 3 of the skill (a visible walk, Playwright with axe, widths, keyboard) do not apply; PF-R3 puts these numbers on screen.

**How I walked them:**
* Each journey goes through the one door, `ReportsController.query`, as `xr_app` inside `withFirm`.
* The data is the PR's fixtures, plus my probes, on a scratch copy of `studio/` in the scratchpad.
* Postgres at 127.0.0.1:54329, never :4400. Cost: US$0.

## Journeys (persona · goal · expected · result)
1. **Owner, main path:** "Open cases per stage; new and closed per month."
   * Expected: Study permit 2, Work permit 1, no stage yet 1; Sep 1/0, Oct 2/0, Nov 2/1 in Toronto months.
   * **Held** (DW2, DW5).
2. **Owner, alternate:** "Corporate files only."
   * **Held** for 2 combinations and for 400; firm B splits about a third Corporate (DW5).
   * My probe, at 2,000 combinations three levels deep: Corporate 746 + Individual 738 = all 1,484. It also matches `groupOfCombination` on nested Pathways.
   * The suite itself never builds that nested shape (review N1a).
3. **Owner, person filter:** "The Case Officer's cases": 1. **Held.** Another firm's staff gives 0. **Held.**
4. **Case Officer, own scope:** gets c1 and c3 only. A scope sent in the body is ignored. **Held** (DW4).
5. **Wrong role:** the Officer names the Owner and gets 403. No case key gives 0 or empty. **Held.**
6. **Another firm:** B never reaches A, and A never reaches B. A read in B's context naming A gives 0, with the time-zone setting falling back to its default (no leak). **Held** (DW3).
7. **Empty:** a 2020 range gives 0 and an empty table. **Held.**
8. **Error and odd input:**
   * `0000-01-01..0000-12-31` and `0050-03-01` give OK for all four, not UNAVAILABLE.
   * The trend then labels a 1970-01 month the person did not ask for (review n2).
9. **Step across the boundary (drill):**
   * No figure links anywhere yet (DW6). That is honest: round 1's wider list is gone.
   * But the person has no next step from a figure, and the row that brings a scoped case list is not named (review m3).
10. **Firm in another zone:**
    * With `platform.time_zone` set to Asia/Kolkata, c6 counts in November; the solo firm stays on Toronto (probe P3). **Held.**
    * No test in the suite covers this (review N1b).

## Data underneath
* Every figure matched the fixtures. All four reads are SELECTs: nothing is written, and no audit line is expected.
* I made 26 rule removals on the scratch copy; the review's table has each one.
* **Caught:** drill (2 checks fail), the per-combination loop (1), median (1), case-load range (1), trend lo and hi (1 each), inclusive end (2), UTC zone (4), slowest order (3), silent cap (1), backwards stage (2), the no-stage label (1), the Individual filter (2), the firm predicate (11), the person filter (5), the trend cap (1), the trend clamp (1).
* **Not caught:**
  * the walk to the nearest Pathway (no recursion; farthest Pathway);
  * a hard-coded Toronto in place of the firm's setting;
  * "today" in UTC;
  * the all-ties and single-row guards on "Slowest";
  * the frame's pre-1970 clamp;
  * untrimmed names.

## Break (short; the breaker's `break-report-2.md` has the detail)
* The "N more stages" rest row has the shape of a data row and can absorb "no stage yet".
* Ties at the top mark two rows "Slowest".
* A zone whose DST change falls at midnight (breaker n1) loses a case from both single-month views.

## Score (each 0, ½ or 1)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | All four numbers are on the one door, exact for the seeded firm (DW2) |
| Next step obvious | ½ | No drill at all yet (journey 9). It is no longer a wrong list, but there is no next step either |
| Plain words | 1 | Each number says what it counts, including "closed and still closed" and the firm's zone |
| Feedback and state | 1 | OK, WITHHELD and UNAVAILABLE per number; 403 OWN_ONLY; 422 named. The cap is said in a row, not cut silently |
| Correct data | 1 | Exact on the fixtures; Toronto months; the slowest found before the cut; parity with `groupOfCombination` on nested data (probe) |
| Error recovery | 1 | Empty gives 0; odd dates give OK, never a 500; a repeat read gives the same answer |
| Accessibility and screen sizes | N/A | No screen (PF-R3) |
| Speed | 1 | Worst 13 ms per metric with client type at 2,000 combinations, against the 200 ms budget |
| Visual quality | N/A | No screen |
| Trust and sources | 1 | Sample definitions are labelled; "Only cases you may open" is in every definition |

**7.5 of the 8 criteria that apply = 9.4 / 10 scaled, no 0. Journey verdict: pass.**

The review's N1 (two rules without a biting test) still stands between this head and Approve; see `review-2.md`. The fix that would raise the one ½: name the row that brings a case list kept to open cases and the viewer's scope, so a figure can drill.

## Not tested
* A screen reader, keyboard use, widths and axe: there is no screen.
* An intended user's unaided walk: D17 and D20 stay with the founder.
* The running demo: not used, by the brief.
