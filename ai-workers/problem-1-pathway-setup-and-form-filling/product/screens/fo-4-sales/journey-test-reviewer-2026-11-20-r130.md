# Journey test — R1.30 Source filter on prospects (PR #2454 at 9e2e67c72), reviewer, 20 Nov 2026

Isolated copy `rev_r130` on :4491, never :4400. Sample firm, signed in as the Second representative (sees all) and the Case officer. Live AI off, US$0. The walk was headless Playwright acting as a person: click, Tab, type, read. Screenshots are in the reviewer's scratchpad `/tmp/claude-0/-home-user-xpatready/43763f60-dbc7-5d0e-a87a-76b5194b4110/scratchpad/r130/shots/`. Replayed checks: `check_r130_filters_widths.ts` 56/56 twice, `check_r130_prospect_source.ts` 24/24, `j_30.ts` 55/55, `check_fo4sf_source_filter.ts` 34/34.

## Journeys
1. **Main.** A representative wants to see only walk-in prospects (Pipeline → List → Source → "walk" → tick Walk-in → Escape).
   * Expected: only Walk-in rows, a chip, the choice in the address, focus back on Source.
   * Held: 18 Tabs to Source, then keyboard only. Focus returns to "Source (1)". The skeleton shows, then the list appears 34 ms after the tick.
2. **Across the switch.** Same person → Board.
   * Held: `?source=Walk-in` kept, one card, totals for that source only ("no values yet").
   * Shown at 1024 px and at 200 % zoom with no sideways scroll; the Source panel stays inside the screen.
3. **Long and non-English text.** A 100-character French source with a comma.
   * Held: the chip wraps; no sideways scroll at 400, 1024 or 1440; axe clean.
4. **Empty.** Walk-in plus Stage: Lost.
   * Held: "No lost prospects match these filters." On the board an empty source says "No open prospects from … Choose All sources…".
5. **Error: from after to typed.**
   * Held: the message shows at "Engaged from" (aria-invalid, described, role status) and the list stays. A "to" before an existing "from" keeps the earlier list (212 rows) with the message beside it. Nothing is sent.
6. **Error: a bad day in the address** (`from=2026-13-45`).
   * **Not held:** "from: a date as YYYY-MM-DD. Try again" replaces the list on the List and on Leads. Try again re-sends the same query.
7. **Error: unknown source.**
   * API: 400 UNKNOWN_SOURCE on `/prospects` and the board.
   * Screen: an unknown `?source=` in the address is dropped (the same as Leads; builder's DW4).
8. **Wrong role and visibility.** The builder's DW3 (own-only Case officer) passes on my run.
   * I tried to make a prospect whose lead belongs to someone else. Re-engaging keeps the lead's owner, and `assign` refuses an engaged lead (409), so the choices covered the person's prospects.
9. **Recovery.**
   * Reload keeps the source (qa check).
   * A sources outage keeps the asked source and fetches nothing unfiltered (DW4).
   * After a move, the filtered board refreshes (prefix invalidation).
10. **Across the boundary.** From a filtered List row the prospect opens and its Value panel (R1.31) opens (qa check, last line).

## Data underneath
* `?source=Webinar` returned exactly the one prospect whose lead came from Webinar.
* The totals follow the source (builder's DW2: Referral CAD 1,000 / USD 500 only, re-run by me).
* Nothing is written by a filter.

## Break it (15 min)
* Long French source: fine.
* Comma in a source: one value (DW1).
* Double source `?source=Referral&source=Walk-in`: both shown.
* Re-engaging the same lead by a second person: the owner stays.
* Bad day in the address: dead end (Minor).
* No Blocker, no Major.

## Score
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | Journeys 1–2: List and board filtered by source, kept in the address |
| Next step obvious | 1 | Chips with ×, "All sources", empty states naming the source and the way out |
| Plain words | ½ | All plain except the raw "from: a date as YYYY-MM-DD." (journey 6) |
| Feedback and state | 1 | Skeleton, field error, empty and outage states |
| Correct data | 1 | API and totals match the source; narrowed inside visibility |
| Error recovery | ½ | From-after-to recovers well; a bad day in the address offers a Try again that cannot succeed |
| Accessibility and screen sizes | 1 | Keyboard-only, axe clean, 400/1024/1440 and 200 % with no sideways scroll; live-region timing is noted as a Minor in the review |
| Speed | 1 | List 418 ms first view; filter 34 ms |
| Visual quality | ½ | Team look; the filter row's labels jump out of line when the from error shows |
| Trust and sources | 1 | No AI; the source is shown as the lead's, and the legend says so |
| **Total** | **8.5/10** | **Pass** (8 or more, no 0) |

To raise it, most valuable first:
* Make a bad day in the address plain and recoverable (field error or dropped).
* Keep the filter row aligned when an error shows.

## Not tested
A real screen reader. A visible headed browser (headless only). An intended user's unaided walk (D17, D20 stay with the founder). CI on GitHub.
