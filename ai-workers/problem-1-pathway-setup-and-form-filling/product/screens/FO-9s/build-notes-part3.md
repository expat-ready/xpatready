# FO-9s part 3: build notes (the guided merge dialog, R1.29)

Branch `claude/screens-fo9s-merge-dialog`, stacked on part 2 (#3700). Spec: concept r3 §4 S3 and BR-8, BR-9 (on #2896's branch); board `design/fo9s-boards.html` S3; the Lead's hand-over on #3527 (errors to show: HAS_MONEY, NEEDS_CASE_SIDE, STALE_VERSION, KEPT_SEPARATE, MERGED_AWAY, NOT_LISTED). Web only, over FO-9b part 2's `POST duplicates/review/:id/preview` and `.../merge` on main; no API, schema or money file touched.

## Top 5 production improvements over the board
1. The preview's `updatedAt` travels with the merge, so a record changed meanwhile is refused (409 STALE_VERSION). The answer says "One of these records changed. Reload to see it.", and Reload re-reads the preview with the choices reset.
2. Switching which record stays re-reads the preview (the server's defaults for that survivor) and resets the field choices.
3. A changed field's "Why" reads "your choice", so a default and a choice are never confused.
4. Money or a case found by the preview is said before any step, and Next is off; one that arrives later is refused by the server in its own sentence.
5. Focus: after the merge the row has gone, so focus moves to the notice's Undo. Cancel and Escape return focus to Merge….

## Files
* New `web/src/modules/front-office/duplicates/merge-dialog.tsx`: the 3-step dialog.
* `duplicates/review-contract.ts`: zod for the preview and merge answers; `FIELD_LABEL`; `fieldWhy` (pure); `STALE_WORDS` and `MERGE_FAILED` word for word.
* `duplicates/people-to-merge-page.tsx`: Merge… opens the dialog (off for a case pair, with BR-7's sentence). After a merge, the notice "Merged into <name>." offers Undo.
* `tests/check_fo9s_merge_browser.ts` (G1-G7, 20 checks); `tests/journeys/j_29.ts` W3: the merge runs by the dialog.

## Deviations (said in the PR)
* **"Merged into <name>. Undo" is an inline notice, not a 10 s toast:** the app's toasts carry no button. The notice stays until dismissed or until the next action, and the Merged tab keeps Undo too.
* **"Which record stays" defaults to the first of the pair** (the list's order). The automatic merge's rule, that the newer goes into the older, is the server's and is not shown here.
* Step 2 counts leads, notes, calls and bookings from the preview. Consent and the identity and conflict checks are said in words, because the preview carries no counts for them.

## Checks run
* `check_fo9s_merge_browser.ts` 20/20 (exit 0), each with a pass and a fail:
  * BR-8: defaults say why ("only value", "same", "newer"); a non-default choice is kept by the database and an untouched field keeps its default; switching who stays swaps the columns.
  * BR-9: what moves matches the database; Back keeps choices.
  * Confirm, then the notice's Undo restores both people.
  * Stale record: refused in words, then Reload, then the merge goes through.
  * Money arriving meanwhile: refused in words, nothing merged; on reopening, Next is off.
  * Cancel and Escape merge nothing.
  * Focus after the merge; arrow keys move the radios; axe on the dialog; at 375 px it fits with no sideways scroll.
* `check_fo9s_review_browser.ts` 37/37 and `j_29.ts` 27/27 on the part 3 branch, each on an isolated copy.
* `tsc -p web`: 0 errors.

## Self-score (D1-D20, honest)
Job and flow 8 · rules 8 · words 8 · states 8 · accessibility 8 · responsive 7 (at 375 px the field table scrolls sideways inside the dialog) · consistency 8 · AI none (US$0).

## Known gaps
* The field table scrolls sideways at 375 px, inside its own region, not the page.
* No reason field on the merge (the API takes an optional `reason`; the concept does not ask for one).
