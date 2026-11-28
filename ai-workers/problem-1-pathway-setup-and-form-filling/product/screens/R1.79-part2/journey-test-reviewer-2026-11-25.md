# R1.79 part 2 (PF-R2fo): journey test, reviewer, 25 Nov 2026

PR #3734, head `eae03bb409534baa1b1d281ac400914b4de3d518`.

**API only, no screen.** The skill's steps 2 and 3 do not apply: there is no visible browser walk, and no Playwright run with axe, widths or keyboard. PF-R3 will put these numbers on screen.

**How I walked it.** I walked each journey through the one door, `ReportsController.query` (POST /api/platform/reports/query), as `xr_app` inside `withFirm`. I used the PR's fixtures, plus my own probes, on a scratch database (Postgres 127.0.0.1:54329), never :4400. The harness lives in the scratchpad. Cost: US$0.

## Journeys (persona · goal · expected · result)
1. **Owner, main path:** "How did sales go in November?"
   * Expected: 4 leads added, Phone call 3 and Web form 1, 1 unassigned waiting 24 days, one active stage and one parked, engage rate 75 %, win rate 50 %, and the per-person rows.
   * **Held** on the fixtures.
2. **Owner, alternate:** "Corporate only."
   * Expected: 1 lead and a 100 % win rate.
   * **Held.**
3. **Owner, person filter:** "The Case Officer's numbers."
   * Expected: 1.
   * **Held.**
4. **Case Officer, own scope:** "My numbers."
   * Expected: own lead 1, own row only, and unassigned WITHHELD. A `scope: all` sent in the body is ignored.
   * **Held.**
5. **Wrong role:** the Case Officer names the Owner and gets 403. No report key also gives 403.
   * **Held.**
   * A viewer with report view.all but not prospect view.all names the Officer and gets 0 and `[]`. This held, but no test covers it (review M4).
6. **Month edge, Toronto firm:** "November."
   * Expected: a lead at 31 Oct 22:00 local is out, and a lead at 30 Nov 22:00 local is in.
   * **Not held.** The count went 4 → 5 → 5: both leads land in the wrong month, because days are cut in UTC (review M1).
7. **A sales person leaves:** their open lead should count as Unassigned (BR-4), as the Unassigned list shows it.
   * **Not held.** Unassigned waiting stays 1, and the assign-holder's leads added stays 4 (review M3).
8. **Big firm:** 250 more lead sources, or 234 staff.
   * Expected: every source, and every person with activity, listed or summarised.
   * **Not held.**
     * Sources: 200 rows summing 205 of 257 leads, with no notice.
     * Staff: 200 rows, and the Owner's own row is gone (review M5).
     * With 234 staff, per-person took 666-864 ms (review m3).
9. **Empty and error:** a 2020 range gives 0, `[]` and a rate of none. A bad date gives 422, from after to gives 422, and an unknown metric gives 400.
   * **Held.**
   * `from 0000-01-01` gives UNAVAILABLE (review m4).
10. **Step across the boundary (drill):** the Owner follows the leads added link, with no filter.
    * Expected: the same 8 leads.
    * **Not held.** `/api/front-office/leads` defaults to open leads only, capped at 500 (review M2).

## Data underneath
* Every number matched the PR's fixtures, and nothing is written: all seven reads are SELECTs.
* The firm walls held: firm B's 5,000 leads never reached firm A, even with the explicit firm predicate removed (PF-12 row policies).
* **Mutations:** I removed rules one at a time. 17 of 32 removals are caught and 15 are not (the list is in review M4). Among the 15:
  * rule 18's added-to-prospect and combined-prospect keys;
  * the `to` day;
  * the owner scope on stage counts and on the win rate;
  * the person filter for a viewer who does not see all;
  * four unassigned-waiting rules;
  * the per-person period bounds.

## Break (15 minutes; summary)
* UTC day edges.
* A deactivated owner's leads.
* Silent 200-row caps on sources and people.
* A second prospect on one lead is never credited as "engaged" (review m2).
* Year 0000.
* At the reviewed head, `check_pfr1_reports.ts` is red, 71/72 (review M6; fixed on `3625d9bbd`).

## Score (each 0, ½ or 1)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | Seven numbers are answered on the one door, exact on the fixtures (journeys 1-4) |
| Next step obvious | ½ | The drill exists but opens a different list (journey 10) |
| Plain words | 1 | Each number carries its definition in words, with its AG-2-87 rule |
| Feedback and state | 1 | OK, WITHHELD and UNAVAILABLE per number; 403 OWN_ONLY; 422 and 400 (journeys 4, 5, 9) |
| Correct data | ½ | Exact mid-month. Wrong at month edges, for a departed owner's leads, and past 200 rows (journeys 6-8) |
| Error recovery | 1 | An empty range gives 0 or none; bad input gives 422; a failed read gives UNAVAILABLE, never a 500 |
| Accessibility and screen sizes | N/A | No screen (PF-R3) |
| Speed | ½ | 2-8 ms on the Sample data. Per-person is 147-864 ms once a firm has 54-234 staff (journey 8) |
| Visual quality | N/A | No screen |
| Trust and sources | ½ | The words promise "nothing is dropped" and "only leads you may open"; journeys 7 and 8 break both |

**6 of the 8 criteria that apply = 7.5 / 10 scaled; no 0. Journey verdict: below the pass mark (8).**

Fixes that would raise the low scores, most valuable first:
1. Cut days in the firm's zone (`dayRange`).
2. Treat an inactive owner as Unassigned, as the list does.
3. Cut rows visibly: the first 199, then "n more".
4. No drill link until a list carries the exact set.
5. Group the per-person counts in one aggregate, with a budget line on a firm with many staff.

## Not tested
* A real screen reader, keyboard use, widths and axe: there is no screen.
* An intended user's unaided walk: D17 and D20 stay with the founder.
* The HTTP server at a builder port: I used the controller inside `withFirm`, as the PR's test does. The demo was not used.
