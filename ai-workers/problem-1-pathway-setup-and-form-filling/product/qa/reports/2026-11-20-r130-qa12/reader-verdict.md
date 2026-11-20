# R1.30 Lead lists, filters and board: fresh reader's verdict (qa 12)

Fresh reader (P-339), Opus 5.5, 20 Nov. I did not build or test this. I only read: main ce8e05b1d, the diff of PR #2454 (36a2328b0, head c4b82ac2b), qa's check and its outputs, j_30, the builder's check, and the review and break records. I ran nothing.
S = `prototype/studio`.

**Verdict: Works.** **Confidence: 85 %.** I assume GitHub walks.yml j_30 (44731604918, 44731614418) and item-proof 44731122187 are green, like the local runs. If any of them is red, the verdict becomes Partial until a re-run on main's head is green. If a red run is in W3d (drag) or the Leads/List filter walks, it is Broken for that clause and needs a new BUGS row.

## Per clause
| Clause | Met | Evidence |
|---|---|---|
| Filter by stage | Yes | List Stage: `pipeline-page.tsx:140`. Check lines Stage=Consult (empty) and Stage=Qualified (positive) at 3 widths, `check_r130_filters_widths.ts:130,157`, PASS in run1/run2. On the board, the stage is the columns. |
| Filter by owner | Yes | Leads Owner `leads-page.tsx:88`, List Owner `pipeline-page.tsx:141`. Check `:104,:119` at 3 widths. |
| Filter by source (Leads, List, board) | Yes | One shared control: `web/.../sales/source-filter.tsx` (SourceFilter, `useAddressSources` :74). Its choices come from `GET leads/sources` (:9), the same as Leads. It is used by Leads `leads-page.tsx:81`, the List `pipeline-page.tsx:144` and the board `:52`, and kept across the Board/List switch (:188-189). API: one `sourcesChecked` (`api/.../sales/source-filter.ts`) used by prospects `prospects.ts:192,196`, by the board `corporate/service.ts:172-173` (cards), and by `board-totals.ts:12` (totals). An unknown source answers 400 UNKNOWN_SOURCE. The filter is ANDed with the visibility clause, so it never widens. `/prospects?source=Referral` now narrows: 1 of 6 (run1 line 58). |
| Filter by date | Yes | Leads Arrived and List Engaged from/to, `:110,:125` at 3 widths. From after to: see QA-572 below. |
| Board moves by drag | Yes | j_30 W3d at 1440, 1024 and 400 px, read back underneath (stage, PERSON move, audit), j30_1 lines 26-28. Won refused, Lost asks why (:29-30). No drag without the edit key (:53). |
| Board moves by keyboard | Yes | "Move to…" by keyboard only at 3 widths, with exactly one PERSON move underneath, `check_r130_filters_widths.ts:149`. |
| 400 / 1024 / 1440 px | Yes | No sideways scroll and axe clean on Leads and the List at each width (`:96-97,:132-134`). Board with a source chosen at 400 and 1024: builder's `tests/check_r130_prospect_source.ts:125-128`. |
| AG-2-23 board AND list | Yes, with a note | The List has stage, owner, source and date. The board has source, and its columns are the stages. The board has no owner or date filter: its notice sends people to the List for those (`pipeline-page.tsx:79`). This reads AG-2-23 "board/list" as either view, the same reading qa 11 accepted. |

## How strong the checks are (read beyond the totals)
- qa's QA-533 line (`check_r130_filters_widths.ts:211-217`) only proves that a Source control exists on the List, at 1440 px, and that the API narrows. It never clicks Source on the List or the board, never tests the board route, the 400 answer or own-only visibility. Those are shown by the builder's `check_r130_prospect_source.ts`: DW1-DW3 (API, board cards, counts and totals, own-only Case Officer, unknown → 400) and DW4 (List click, chip, address, reload, the board after the switch, axe). It runs in the CI shards (run-suites.sh picks up `tests/check_*.ts`). The reviewer ran it 29/29 twice. qa has not run it itself on ce8e05b1d. This is my main source of doubt (most of the missing 15 %).
- qa's QA-572 lines pass on `listKept = end !== alert && != loading` (`:202`), which is also true for the empty state. The line's words "the list kept" are not what the screen does (see F1).

## QA-572: fixed, with one ruled deviation
- The message sits at the from field. The Field adds `aria-invalid` and `aria-describedby` (`controls.tsx:58`), and the words are said in a status region (`:60`): "The from date must be on or before the to date." (`source-filter.tsx:95`). Nothing is sent (`pipeline-page.tsx:134`, `leads-page.tsx:56`). No "from:" words appear, whether typed into the address or into the fields (run1 :53-57, shot `shots2/r130-list-typed-from-after-to.png`). Days outside 1900-2999 are dropped before sending (`dayParam`).
- **The list is not kept.** It is replaced by "Change the dates to see the prospects/leads…" (`pipeline-page.tsx:149`, `leads-page.tsx:94`). QA-572's Expected says "keep the list". The breaker's M1 showed that a kept list goes stale under a new source, and the reviewer judged the deviation right (`screens/fo-4-sales/review-r130.md:48`). I agree that no list beats a stale one. But the deviation is not written in QA-572's row, and two records still claim the opposite (F1).

## Regressions in leads-page.tsx
None found. The ~90 lines removed are SourceFilter, moved word for word to `source-filter.tsx`; only the legend became a prop. The wait for sources is now `ready` (waits only when the address asks for a source). Its loading branch dropped `known.isPending`, which is safe because a disabled query with no data stays pending. The move of `sourcesSeen`/`seenWhere` to `api/.../source-filter.ts` keeps the same query. Leads' own source, owner and day lines pass at 3 widths. One process note: review round 3's fix (DayInput, c4b82ac2b) has no written re-review in `review-r130.md`, whose verdict names 6925dffcb. qa's 56/56 and 55/55 on ce8e05b1d do cover the final code.

## New findings
- **F1. UX · Minor (records): the "list kept" wording contradicts the code.** `pipeline-page.tsx:14` ("the last list stays on screen"), `controls.tsx:53` ("for a filter whose list stays on screen"), `qa/built/R1.30.md` ("the list stays"), and qa's line name `check_r130_filters_widths.ts:203`. Fix: reword all four to "no list while the range is wrong", and write the deviation from QA-572's Expected into its row when it closes. This does not block Works.
- **Note (not a bug):** no owner or date filter on the board itself (AG-2-23 reading above). Put it to the tech lead only if the founder reads "board/list" as both views.
- Already known and accepted by the reviewer: the field labels lift when the error shows (visible in the shot). It is not a new finding.

## Can they close?
- **QA-533: yes.** Source on the List and the board, the same choices as Leads, inside the visibility, `?source=` honoured with 400 for an unknown one. qa should ideally also run `check_r130_prospect_source.ts` once, or extend its own line to click Source on the List and the board.
- **QA-572: yes, closed with the deviation recorded:** "list replaced by plain words, not kept (break M1; reviewer agreed)". Fix F1's wording at the same time.
