# AUD-4s part 1 — journey test (reviewer), 16 Nov 2026

Scope: a **concept only** (PR #2027, head `cd3ea6709b14f5672e4b2c90a640d80bb23bfe5e`). No app is running and no code exists. The journeys below were walked on paper against `concept-draft.md` and the six boards in `design/draft-1.html` (screenshots at 1024 and 1440). Criteria that need a running screen are N/A. Steps 2 to 5 of the skill (visible browser, Playwright replay, data underneath, break-it) wait for part 2.

## Journeys (from the concept and AG-16 `:467-468`)
1. **Main: the Owner checks who changed what.** Settings › Security & your data › Activity log. Expect the last 7 days, newest first; a sentence reading the filters back; open one line to see "field: old → new", with raw data under Advanced. *Held:* boards 1 and 2 show each step.
2. **Alternate: "Did your support people touch our data?"** Press "ExpatReady staff access". Expect only "ExpatReady support" lines, a chip, and the sentence naming the filter. *Held:* board 3. The session's start and end are deferred to AUD-3b, which the board says.
3. **Alternate: the Admin, after a rep leaves.** Find the departed person's changes. *Did not hold:* the Person list on board 1 has only active people (`draft-1.html:94`), and no board shows "Show only this person's changes" (BR-14). See review Major 1.
4. **Export.** Export CSV, then the confirm with "This export is recorded in the activity log", then one file and one new line. Cancelling gives nothing. *Held:* board 4 and BR-6. The page and the dialog both have a button named "Export CSV"; this is clear on screen but ambiguous in the written walk (review Major 2).
5. **Empty.** A range with no lines names its dates and offers "Clear filters". *Held:* board 6.
6. **Error.** A range over one year is stopped on the field with the limit named; a load error offers Retry; an export that is too large says to narrow the dates. *Held:* board 6.
7. **Wrong role.** A Case Officer sees no menu item and a plain no-access page. *Held:* board 6 and DW1.
8. **Recovery.** The session ends and another firm signs in in the same tab: lines are cleared first. A double click on Export gives one file. *Held on paper:* BR-13, DW1b, DW3b.
9. **Across the boundary.** Settings index → this page, and AUD-3b's session screen later. *Held:* the trail and the contract gap are recorded.

## Findings
* **Major:** journey 3 cannot be walked on the board (`draft-1.html:94,114-118,130-136`).
* **Major:** the written acceptance walk (`concept-draft.md:74-78`) carries the shortcut over from step 3. Step 5's export line would then be hidden, and step 7's data is too small. Details and fixes are in `review.md`.
* **Minor:** overdue and "Not checked yet" share one mark (`draft-1.html:39-40,169,172`). Board 3's sentence leaves out the time zone (`:143`).

## Score (paper walk)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | ½ | Journeys 1, 2 and 4–8 hold; journey 3 (the Admin's story) is not drawn. |
| Next step obvious | 1 | One action (Export CSV); "Show more"; "Clear filters"; Retry. |
| Plain words | 1 | §5 copy; action codes only under Advanced; "ExpatReady support", "The system". |
| Feedback and state | 1 | Every state in the brief is drawn, plus overdue and load error (boards 5–6). |
| Correct data | N/A | No app or database. |
| Error recovery | 1 | Range error on the field, Retry, "Narrow the dates", Cancel writes nothing. |
| Accessibility and screen sizes | ½ | No sideways scroll at 1024 or 1440 (screenshots). When cell is the disclosure; focus plan written. But overdue has the same shape as "Not checked yet", and the keyboard walk is not replayable as written. |
| Speed | N/A | Nothing to time. |
| Visual quality | 1 | Team tokens, 44 px rows, quiet pills; matches the screenshots. |
| Trust and sources | 1 | Integrity pill with detail and areas covered; raw before and after; no AI; claims marked Unverified or Sample. |

**7 / 8 scorable = 8.8 / 10. Pass (8 or more, no 0), on paper only.** Fixes that raise the score, most valuable first:
1. Draw the departed person and the "Show only this person's changes" control.
2. Make the walk replayable.
3. Give overdue its own mark.

## Could not test
A real browser walk, axe-core, keyboard replay, timings, data underneath, the break-it pass and a screen reader all wait for part 2 against AUD-4's routes. D17 and D20 stay with the founder.
