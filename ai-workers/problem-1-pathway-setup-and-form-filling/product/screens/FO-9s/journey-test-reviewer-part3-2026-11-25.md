# Journey test, reviewer: FO-9s part 3, the guided merge dialog (25 Nov 2026)

* **Commit:** `b6522db08` (code identical at `c83c73740`).
* **Copies:** isolated copy `rev3` on :4587 (PLATFORM_IDENTITY=local, Sample people), and `j29r` on :4591 for `j_29.ts`. Both are stopped.
* **How:** headless Playwright (Chromium at /opt/pw-browsers) clicked, typed and read what a person sees. I read the database only to verify the results.
* **Cost:** US$0, no AI.

## Journeys (main path first)
1. **The Owner merges a pair (main):** "These two are one person; keep the right details." The walk: Sales menu → People to merge → Merge… on "Zoë Ñúñez-李 / Zoë Nunez" → keep the other last name → Next → Next → Merge 2 people.
   * Held: the dialog opened in 154 ms and the merge took 250 ms.
   * Defaults said why ("same", "newer", "only value", "neither has it"); my change read "your choice".
   * Step 2: "1 lead, 1 note from … Nothing is deleted."
   * Step 3: "… will be merged into …".
   * The notice read "Merged into …", and focus was on its Undo.
   * Database: the loser points at the survivor, the pair is `MERGED`, my chosen last name was kept, the untouched fields kept their defaults, 2 leads sit on the survivor, and there is one `person.merged` audit line.
2. **The same task by keyboard only:**
   * Open with Enter.
   * Tab order: Close, who stays, one radio per field, Cancel, Next. The arrow keys move a radio.
   * Escape returned focus to Merge….
   * Next by Enter kept focus. Back by Enter put focus on the dialog container (finding 6).
   * Enter on Merge 2 people moved focus to Undo, and Enter there restored both records.
3. **The other record should stay (alternate):** switching who stays re-reads the preview, swaps the columns and resets the picks (the reset is not said, finding 7).
4. **A stale record (error):** the record was edited after the dialog opened. The dialog said "One of these records changed. Reload to see it." with Reload, and Merge stayed off. Reload showed the new value and the merge went through (the builder's G5, run twice).
5. **Refused while open (error):** each refusal said why in the server's words, and nothing was merged:
   * Keep separate in another tab: "This pair was already decided."
   * Merged into a third record: "One of these people was merged into another record after this pair was listed. Nothing was changed."
   * A case added: "This person has a case; merge them from the client record."
   * Money added: G6's sentence.
   * Aborted request: "Could not merge. Nothing changed."

   But "Merge 2 people" stays offered, and after closing, the row is still on To review (finding 3).
6. **Wrong role:** a Case Officer sees no Merge…; the API answers 403 to preview and 403 to merge.
7. **Recovery:**
   * Reloading the page while the dialog is open merges nothing.
   * A double click on Merge 2 people sends one POST (200) and shows one notice.
   * Cancel and Escape merge nothing (G7).
8. **Screen sizes:**
   * At 1024 px, and at 720 px and 640 px (200 % zoom of 1440 and 1280): no sideways page scroll, and the dialog body scrolls with the footer kept in view.
   * At 375 px: the field table overflows by 251 px inside its box, with no cue (finding 4).
   * axe (WCAG 2.0, 2.1 and 2.2 A and AA): no violations at any of these widths.
9. **Across the boundary:** the merged-away record's lead opens on the survivor's lead page, with the survivor's contact details. In j_29 W3 → W5, Undo from the Merged tab restores both records (27/27).
10. **Long and non-English names:** "Zoë Ñúñez-李" and 60-character names wrap in the title, the radios and the headers.

## Findings (file:line in `review-part3.md`)
1. Minor (Should): the notice names the survivor's old name when the person chose the other record's name (`merge-dialog.tsx:34`).
2. Minor (Should): for two records with the same name, step 3 reads "Lena Park will be merged into Lena Park." (`:77-82`; J-29 W3 screenshot).
3. Minor (Should): after a final refusal, the list is not refreshed and Merge 2 people stays enabled (`:35-37`, `:47`).
4. Minor (Should): at 375 px the other record's column is out of view (`:65-66`).
5. Minor (Should): no tests for the generic refusals or MERGE_FAILED; G2 does not assert that the choices reset.
6. Minor: focus after Back. 7. Minor: switching who stays drops the choices silently. 8. Minor: primary buttons are 36 px at 375 px.

## Break pass (15 min)
I tried two tabs (Keep separate during a merge), a third merge meanwhile, a case and money added meanwhile, an aborted request, a double click, a reload mid-dialog, the wrong role by API, and non-English and long names. No data was harmed: every refused merge left both records live and the pair unchanged.

## Score (0, ½ or 1)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | J1 and J2 done by screens; j_29 W3 by the dialog; database verified |
| Next step obvious | 1 | 3 named steps, one primary per step, Back keeps the choices |
| Plain words | 1 | §5 copy word for word; reasons in words; issue 2 is counted under feedback |
| Feedback and state | ½ | the notice and errors in words, but the notice names the old name (1), same-name sentences (2), and a stale list after a refusal (3) |
| Correct data | 1 | choices and defaults exactly as shown; tombstone, audit line and moved leads; Undo restores both |
| Error recovery | 1 | stale → Reload → merge; every refusal says why and nothing changes; Cancel always works |
| Accessibility and screen sizes | ½ | axe clean, keyboard complete, 1024 px and 200 % fine; 375 px table (4), focus after Back (6), 36 px targets (8) |
| Speed | 1 | 154 ms to open, 250 ms to merge, one preview request |
| Visual quality | 1 | team dialog, aligned table, quiet Why column (screenshots at 1440 and 1024 px) |
| Trust and sources | 1 | each default says why, "your choice" marked, "Nothing is deleted", Undo offered |
| **Total** | **8.5 / 10** | **Pass** (8 or more, no 0) |

Fixes that would raise the low criteria, most valuable first: name the result correctly (1) · tell same-name records apart (2) · refresh the list after a refusal (3) · a narrow-width layout for the field table (4).

## Not tested
* A real screen reader: step changes have no live announcement.
* A visible headed browser: there is none in the cloud container.
* NOT_LISTED by screens.
* An intended user's unaided walk: D17 and D20 stay with the founder.
