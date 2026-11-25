# R1.79 part 1 (CS-R1 part 1): journey test, reviewer, 25 Nov 2026

PR #3642, head `39ccdbd354f9c75358b09105d16e27b3271781e3`. **API only, no screen:** steps 2 and 3 of the skill (a visible browser walk, Playwright with axe, widths and keyboard) do not apply. PF-R3 will put these numbers on screen. I walked each journey through the one door, `ReportsController.query` (POST /api/platform/reports/query), as `xr_app` inside `withFirm`. I used the PR's own fixtures on a scratch database (Postgres 127.0.0.1:54329), never :4400. My harness copy lives in the scratchpad, not the repo. Cost: US$0.

## Journeys (persona · goal · expected · result)
1. **Owner, main path:** "How many open cases are in each stage, and how many came in and closed each month?" Expected: Study permit 2, Work permit 1; Sep 1/0, Oct 1/0, Nov 2/1. **Held** (DW2).
2. **Owner, alternate:** "Corporate files only." Expected: c2 only. **Held** with 2 combinations. With 300 combinations, each number takes 329-370 ms, over the 200 ms budget (finding 2).
3. **Owner, person filter:** "Show me the Case Officer's cases." Expected: 1 finding. **Held** (DW4). Naming another firm's staff gives 0. **Held.**
4. **Case Officer, own scope:** "My numbers." Expected: c1 and c3 only. A scope sent in the body is ignored. **Held** (DW4).
5. **Wrong role:** the Case Officer names the Owner in the person filter. Expected: 403. **Held.** No case key gives 0 or empty, never an error. **Held.**
6. **Another firm:** the solo firm never sees firm A's numbers, and firm A never sees B's 1,500 findings. **Held** (DW3). See finding 6 for which guard actually holds this.
7. **Empty:** a 2020 range gives 0 and an empty table. **Held.**
8. **Error:** a bad date or an unknown field gives 422. An unknown metric gives 400. **Held** (PF-R1's door; the breaker's report repeats these).
9. **Step across the boundary (drill):** the Owner follows case load's drill link to the case list. Expected: the same 3 open cases. **Not held:** `GET /api/runtime/cases` has no status filter and no `caseScope` (`runtime.ts:1073`), so it also lists closed c3. For an Owner who holds only case view.own, the figure is `[]` but the link opens every case of the firm (finding 1).
10. **Recovery:** reload or a repeat call gives the same answer. **Held** (reads only, nothing written).

## Data underneath
Every number matched the fixtures. Nothing was written (all four reads are SELECTs). No audit line is expected for a read.

I removed rules one at a time and re-ran the PR's test (scratch harness):
* These removals **are caught**: person filter (6 checks fail), viewer case scope (2), client type (3), the firm predicate (8), open-cases-only on findings (7), open-only on case load (3), the slowest rule (2).
* These removals **are not caught**:
  * median replaced by average;
  * case load's date range removed;
  * the trend's from/to clamps removed;
  * findings' end day made exclusive (finding 3).

## Break (summary; the breaker's `break-report.md` has the detail)
* 200+ stage names: rows are cut silently, and "Slowest" goes wrong.
* Month buckets are in UTC, not the firm's time zone.
* A reopened case drops out of the month it was closed in.
* A backwards stage gives a negative duration.

## Score (each 0, ½ or 1)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | Four numbers are answered on the one door, exact for the seeded firm (DW2) |
| Next step obvious | ½ | The drill exists, but it leads to a wider list than the figure (journey 9) |
| Plain words | 1 | Each number carries its definition in words. "Sample definition" is on the deficiency count |
| Feedback and state | 1 | OK, WITHHELD and UNAVAILABLE per number; 403 OWN_ONLY; 422 with named fields |
| Correct data | ½ | Exact on the fixtures. Wrong drill set; reopened cases leave the closed trend; the cap drops rows silently |
| Error recovery | 1 | Empty range gives 0; bad input gives 422; a failed read gives UNAVAILABLE, never a 500 |
| Accessibility and screen sizes | N/A | No screen (PF-R3) |
| Speed | ½ | 8-27 ms with no filter. Over budget with client type at 300 combinations (finding 2) |
| Visual quality | N/A | No screen |
| Trust and sources | 1 | Sample definitions are labelled; "Only cases you may open" is in every definition |

**6.5 of the 8 criteria that apply = 8.1 / 10 scaled; no 0. Journey verdict: pass, narrowly.**

The review's Majors still block the merge (see `review.md`). Fixes that would raise the low scores, most valuable first:
1. No drill link on case load until the case list can carry the open filter and the case scope.
2. One SQL read for client type, plus a budget line that uses it.
3. Count closed months from the close event, or say "closed now" in the definition words.

## Not tested
* A real screen reader, keyboard use, widths and axe: there is no screen.
* An intended user's unaided walk: D17 and D20 stay with the founder.
* The running demo: not used, by the brief.
