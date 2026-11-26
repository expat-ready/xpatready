# FO-9s part 2: build notes (Sales › People to merge, R1.29)

Branch `claude/compassionate-rubin-tcheu7`, PR #3700. Spec: concept r3 §4 S2 (on #2896's branch), board `design/fo9s-boards.html` S2, brief `design/briefs/track-b/FO-9s-2.md`. Web only, over FO-9b part 2's routes on main; no API, schema or money file touched.

## Top 5 production improvements over the board
1. Keep separate asks first (a dialog naming both people): there is no route to reverse it, and the pair is not suggested again.
2. A refused Undo shows the server's reason in the button's place (BR-10), never a toast that disappears.
3. The Match pill's tooltip opens on keyboard focus too (a focusable trigger with the tip in its accessible name).
4. The tab is in the address (`?tab=merged|kept`): a link or a reload keeps it.
5. Undone merges stay on the Merged tab as "Undone <time>" (history), counted out of the tab's number.

## Files
* New `web/src/modules/front-office/duplicates/review-contract.ts`: zod for the review list and the merge records, the keys, BR-7's sentence, `mergedBy` (pure), `reviewQuery` (shared by the page and the menu).
* New `web/src/modules/front-office/duplicates/people-to-merge-page.tsx`: the page (tabs, tables, Keep separate dialog, Undo merge, every state).
* `web/src/modules/front-office/routes.tsx`: one route `/front-office/duplicates`.
* `web/src/modules/front-office/sales/sales-frame.tsx`: one menu item with the open count, one phone link, both only with `agent/prospect:edit`.
* `web/src/modules/front-office/duplicates/contract.ts`: one word, `Reason` exported (deviation from the brief's "not edited": reusing part 1's zod instead of a second copy).
* `web/src/MODULE.rows/FO-9s-2.md`; `tests/check_fo9s_review_browser.ts` (R1-R7, 30 checks); `tests/journeys/j_29.ts` W2 and W5 by screens.

## Deviations (said in the PR)
* **Merge… is shown to merge-key holders and off** in this part (the brief: "opens nothing"); a case pair's carries BR-7's sentence, tied by `aria-describedby`. Part 3 turns it on.
* Merged tab rows read "<loser> into <survivor>" with "Merged by you / by <name> / automatically …"; names are the records' current ones (after a merge both can carry the chosen name), so the Undo toast names no one.
* Kept separate rows say "Decided by staff" or "Decided automatically" (the list carries no actor name).

## Mock vs real
All real: FO-9b part 2's routes on an isolated copy. Fixture: the test sets a pair OPEN (as a web-form arrival writes it) because Add a lead's "Add as new" writes its pair Kept separate (FO-9b concept B1).

## Checks run
* `check_fo9s_review_browser.ts` 30/30 (exit 0): BR-6 pass and fail (Case Officer sees only pairs of their own leads; no Merge… or Undo without the merge key; no menu and the no-key sentence without the edit key), BR-7 pass and fail, BR-10 pass and fail (Undo restores by API; a case since the merge → the reason in place), BR-11 pass and fail (Cancel changes nothing; Keep separate moves the pair and clears the lead's "Possible match"), menu count = tab = API `openCount`, empty sentences, arrow-key tabs, axe (no serious) on all three tabs, 375/1024/1440 no sideways scroll, no page error.
* `j_29.ts` 26/26 (exit 0) on an isolated copy of the branch.
* `tsc -p web` 0 errors; `graph.mjs --check` G1/G2/G4/G5 0; `count-any` 416 = base.

## Self-score (D1-D20, honest)
Job and flow 8 · rules 8 · words 8 · states 8 · accessibility 8 · responsive 8 · consistency with Sales 8 · performance not measured beyond three small list reads per page (known gap) · AI none (US$0).

## Known gaps
* No pagination: the API caps at 500 rows; fine for a firm's pairs today.
* Who decided a Kept separate pair is not named (the API gives only automatic or not).
* Merge… opens nothing until part 3.
