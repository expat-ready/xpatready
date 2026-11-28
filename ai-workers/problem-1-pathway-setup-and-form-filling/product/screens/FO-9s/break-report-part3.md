# FO-9s part 3: break report (the guided merge dialog, R1.29)

Commit `b6522db08` (PR #3716), isolated copy `brk3` on :4589 (PLATFORM_IDENTITY=local, fresh database, Sample pairs made the way `tests/check_fo9s_merge_browser.ts` makes them), Chromium `/opt/pw-browsers/chromium`. I attacked through the API (fetch) and the UI (Playwright, with request routing to delay, fail or drop answers). Scope: concept r3 §4 S3, BR-8, BR-9, and §4's states, copy and widths. US$0, no model call. I changed no product code. The copy is stopped.

## Findings

**M1 Major: a merge whose answer is lost says "Nothing changed." when the merge went through, and no refusal re-reads the list, so a decided pair stays on To review with a dead "Try again".**
* Steps: open Merge… on a pair and go to step 3. Make the merge's answer get lost after the server has committed it (Playwright `route.fetch()`, then `route.abort("connectionreset")`; a timeout or a dropped connection in real life). Click Merge 2 people.
* Expected: the screen does not claim nothing changed when it cannot know. After any failure or refusal it reads the pair list again (Keep separate already does this on error: `people-to-merge-page.tsx:77`).
* Actual: the dialog says "Could not merge. Nothing changed.", but the database says the pair is `MERGED` and the loser has `merged_into_id` set. Clicking Merge 2 people again gives "This pair was already decided.". After Cancel the row is still on To review with Merge… enabled. Reopening it shows "This pair was already decided." with a **Try again** button that can never succeed.
* The same stale list appears after the other refusals:
  * another tab merged the pair (U6a) or kept it separate (U6b): "This pair was already decided.", and the row stays listed;
  * a case was added mid-dialog (U6c): the server's case sentence shows, but after Cancel the row's Merge… is still on.
* Code:
  * `merge-dialog.tsx:35-37`: `onError` maps any non-`StaffApiError` (a network failure) to `MERGE_FAILED` and invalidates nothing.
  * `people-to-merge-page.tsx:159-160`: only `onMerged` calls `refresh()`.

**M2 Major: the steps change under a focused button that becomes "Merge 2 people" in place, and nothing announces the new step.**
* Steps: open Merge…, focus Next, then press Enter three times, or hold Enter (key repeat about every 33 ms).
* Expected: each step's content (what moves, the confirm sentence) is announced, or focus moves to it, before the merge button can be pressed (WCAG 2.4.3 and 4.1.3; the confirm step is the safety on a money-adjacent merge).
* Actual:
  * Focus stays on the footer button throughout. At step 3, `document.activeElement` is "Merge 2 people" (U11b).
  * The dialog has no live region (`U12_liveRegionForStep: false`), so a screen-reader user hears neither step 2 nor the confirm sentence.
  * Holding Enter on step 1's Next sent the merge (POST 200, records merged) in about 200 ms, so steps 2 and 3 were never seen.
* Code: `merge-dialog.tsx:46-47` (one `<Button>` slot that turns from Next into Merge 2 people, so React keeps the same focused DOM button) and `:52`, `:76-82` (no focus move and no `aria-live` on step change).

**Minor**
* **m1: a double-click on Next closes the dialog and drops the choices.**
  * Steps: at step 1 or step 2, double-click Next (and the same when clicking twice 120 ms apart).
  * Cause: the dialog is centred and shrinks between steps. The primary button sits at y 614 → 539 → 499 px at 1440×900, so the second click lands on the overlay.
  * Actual: Radix closes the dialog. Reopening has lost the field choices. No `guard` is passed (`merge-dialog.tsx:50`), and a plain click outside also discards the choices silently.
* **m2: "Why" says "newer" for a tie.** Two records with the same `updated_at` and different values show "newer" for language and last name (U14). The server keeps the survivor's value on a tie (`ports/person-merge.ts:93`). Code: `review-contract.ts:50`.
* **m3: an empty value can be chosen over a real one, while step 2 still says "Nothing is deleted."** Choosing "Language: keep Not given" over the survivor's `en` erased the language after the merge (U13), while step 2 still said "Nothing is deleted." Code: `merge-dialog.tsx:70`, `:80`.
* **m4: a stray preview on every reopen.** Opening a second pair sends one preview with the previous pair's survivor (`422 … survivorId`) before the effect resets the survivor (U10). Code: `merge-dialog.tsx:20-27`.
* **m5: long unbroken names make the table scroll sideways at 1024 px.**
  * Names used: 60 Latin characters with no space, plus Arabic and CJK.
  * At 1024 px the field table scrolls 87 px and the second record's column is clipped. The column header `card()` has no wrap rule (`merge-dialog.tsx:67`). The build notes claim sideways scroll only at 375 px.
  * At 375 px the "… stays" radio labels run past the dialog's right edge. The inner `<span>` in the flex label cannot shrink (`merge-dialog.tsx:63`).
  * The concept says "long names wrap" (§4 States).
  * Screenshots: scratch `u6-1024-s1.png`, `u6-375-s1.png`.
* **m6: the notice keeps saying "Merged" after the merge is undone elsewhere.** Undo the merge through the API, then click the notice's Undo (still enabled, because the merges list was not re-read). The page then shows the green "Merged into Undoel Alpha." above the warning "This merge was already undone." Code: `people-to-merge-page.tsx:144-149`.
* **m7: the notice names the survivor by its old name.**
  * Steps: keep the loser's first name ("Nameb"), so the surviving record becomes "Namea Same".
  * Actual: the confirm sentence and the notice say "Merged into Nameb Same.", a name no record carries any more.
  * Code: `merge-dialog.tsx:34`, `:40`, `:82` (names come from the list snapshot).
* **m8: a 5xx with an HTML body is not worded as a failed merge.** It reads "Something went wrong on our side. Please try again." instead of the concept's word-for-word "Could not merge. Nothing changed." (§4, AG-2-16 §11). Code: `merge-dialog.tsx:35-37`.
* **m9: no one-POST-per-click guard on Merge 2 people.** Three clicks in one task sent 3 POSTs (200, 409, 409). The page's `sending` ref guard is not used. A real Playwright double-click sent only one POST, and the server keeps the result safe. Code: `merge-dialog.tsx:47`.
* **m10: Reload after a stale refusal does not say what changed.** Reload shows the new values with nothing marking which field changed (STANDARDS §4 "stale save → 409 with what changed"). The copy follows the concept's sentence, so this is a note for the concept rather than a build defect.

## What held
* **Wrong role:** the Case Officer gets 403 on preview and on merge, sees no Merge… button (0 of 71 rows), and keeps the list and Keep separate.
* **Wrong survivor:** a survivor taken from another pair gets 422 "Pick one of the pair's two people." Unknown choice fields and a value of `BOTH` get 422.
* **Concurrency:**
  * Three parallel merges of one pair, two of them with the survivor swapped: one 200, two 409 `DECIDED`, one merge row.
  * Merge and Keep separate at once: exactly one wins, with no half state.
* **Stale record:** a record edited after the preview gets 409 `STALE_VERSION` (the API skips the check when `updatedAt` is absent; the dialog always sends it).
* **Case or merge elsewhere mid-dialog:** a case added mid-dialog is refused `NEEDS_CASE_SIDE` with BR-7's sentence. A side merged elsewhere shows the `MERGED_AWAY` sentence word for word. Nothing is merged in either case.
* **Out-of-order previews:** switching who stays A→B→A→B with the third preview held 2.5 s: the table, the radio, the sent `survivorId`, the database survivor and the notice all agree (query key per survivor). Switching resets the choices.
* **In-flight merge:** Escape, the X and an overlay click all leave the dialog open. Cancel and Back are disabled. When the answer lands, the notice shows and focus goes to Undo.
* **Failures mid-merge:** a 401 ends the session to the sign-in card. A 503 problem answer shows the server's sentence and Merge stays offered.
* **Reload and Back:** reload during an in-flight merge, and Back or Forward mid-dialog: no stuck overlay and nothing merged.
* **Hostile text:** HTML, script and `{{7*7}}` names are rendered as text (no element, no alert).
* **Widths and accessibility:** axe finds 0 violations in the dialog at 375, 1024 and 200 % zoom (720×450 at scale 2). Next stays reachable at every width, with no page-level sideways scroll. Tab order: survivor, then each field group, then Cancel, Next, Close.
* **Budgets:** with 71 open pairs, the list answers in 20-29 ms and the preview in 21-37 ms. The dialog opens in 161 ms and switching who stays takes 195 ms.

Verdict: Changes
