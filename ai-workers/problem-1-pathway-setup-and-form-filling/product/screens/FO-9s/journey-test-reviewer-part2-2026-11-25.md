# Journey test, reviewer: FO-9s part 2, Sales › People to merge (25 Nov 2026)

Commit `46097f1b6`, isolated copy `rev_ptm` on :4583 (PLATFORM_IDENTITY=local, Sample people from `check_fo9s_review_browser.ts`, plus my own Sample pairs: long names, non-English names, two race pairs). Headless Playwright (Chromium at /opt/pw-browsers) clicked, typed and read what a person sees; the database was read only to verify. US$0, no AI.

## Journeys (main path first)
1. **Owner clears a pair (main):** "I want this list empty." Sales menu → People to merge (count 11) → read the pair, hover the score → Keep separate → confirm → the pair is in Kept separate. Held: 179 ms from menu to table; tooltip "An exact email or phone is a 100 match. …"; toast "<A> and <B> are kept separate."; database `KEPT_SEPARATE`, `staff:<id>`, one `fo.duplicates.kept_separate` audit line.
2. **Same task by keyboard only:** focus Keep separate → Enter → Tab order in the dialog Close · Cancel · Keep separate → Enter. Done, **but focus lands on `<body>`** after Escape, after Cancel and after confirm (finding 1).
3. **Owner undoes a merge (alternate):** Merged tab → Undo merge → "Undone <time>" and the toast. Database: both records live, the pair back OPEN, a `person.unmerged` audit line.
4. **Undo refused (error):** a case added after the merge → Undo merge → "This person has a case now; undo the merge from the client record." in place of the button; nothing changed (the builder's R5, re-run green).
5. **Empty:** the solo firm → "No pairs to review. When two records look like one person, they appear here." word for word; no count on the menu.
6. **Failed load (error):** review list forced to 500 → "Could not load the pairs." + Try again → after the fault is removed, Try again loads 10 rows.
7. **Wrong role:** read-only member: no menu item; the address shows "You need access to People to merge. Ask an Owner or Admin."; the API answers 403 to GET review and to keep-separate. Case Officer: no Merge…, no Undo ("An Owner or Case Manager can undo it."); API undo 403, keep-separate on a pair they cannot open 404.
8. **Recovery:** reload on `?tab=kept` keeps the tab. Two tabs Keep separate the same pair → the second shows "This pair was already decided." and refreshes. Two tabs Undo the same merge → the second shows "This merge was already undone." in place (the row does not refresh, finding 5). Double-click on the confirm → two POSTs (200, 409) and **a green and a red toast together** (finding 2).
9. **Screen sizes:** 1440, 1280, 1024, 720 and 640 (200 % zoom of 1440 and 1280): no sideways page scroll, names wrap cleanly. **375:** the table scrolls inside its box with no cue, actions are off screen, and names and lead numbers break inside words (finding 3). axe WCAG 2.0/2.1/2.2 A and AA: no serious violations on the three tabs, the dialog, or at 375.
10. **Across the boundary:** the step to part 3 (Merge…) is off by design; Keep separate's effect on the lead page ("Possible match" gone) is the builder's R4, re-run green. J-29 W2 and W5 now walk this screen (the builder ran it; I did not re-run it).

## Findings
1. Major: focus is lost after the dialog closes and after Undo (`people-to-merge-page.tsx:125-127`, `:104`; no `returnFocus`). WCAG 2.4.3.
2. Minor (Should): double submit gives contradictory toasts (`:127`; Undo at `:104` has the same pattern).
3. Minor (Should): the 375 px table (`:34` `overflow-wrap:anywhere`, `:73` no `headClass`).
4. Minor (Should): Merged rows read "Max Webber into Max Webber" when the survivor took the loser's name (`:98`).
5. Minor: a refused Undo does not refresh the row (`:64`); "Owner or Case Manager" leaves out Admin (`:105`).
Break pass (15 min): long and non-English names, wrong role by address and by API, two tabs, double click, reload, forced 500. No data was harmed: every second write was refused by the server with nothing changed.

## Score (0, ½ or 1)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | J1, J3 done by screens; database verified |
| Next step obvious | ½ | Merge… is greyed with no reason on most pairs (by design in part 2); the Merged row "X into X" (finding 4) |
| Plain words | 1 | §5 copy word for word; reasons in words; one wording slip (finding 5) |
| Feedback and state | ½ | toasts, reasons in place; double-submit double toast (finding 2); stale refused row |
| Correct data | 1 | exactly one decision and one audit line per action; Undo restores both and the pair |
| Error recovery | 1 | J6 Try again works; second-tab 409s explained and refreshed |
| Accessibility and screen sizes | ½ | axe clean, 1024 and 200 % fine; focus lost (finding 1); 375 (finding 3) |
| Speed | 1 | 179 ms menu → table; no request per row |
| Visual quality | 1 | team controls, aligned table at 1024 to 1440 |
| Trust and sources | 1 | score with tooltip, "Merged automatically" labelled, who merged named |
| **Total** | **8.5 / 10** | **Pass** (8 or more, no 0) |

Fixes that raise the low criteria, most valuable first: return focus (finding 1) · guard double submit (2) · a narrow-width layout (3) · tell the two merged records apart (4).

## Not tested
A real screen reader; a visible headed browser (none in the cloud container); an intended user's unaided walk (D17 and D20 stay with the founder).
