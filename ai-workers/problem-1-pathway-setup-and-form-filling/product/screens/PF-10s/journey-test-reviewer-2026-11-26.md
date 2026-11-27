# Journey test: PF-10s My account › Import (R1.35), reviewer, 26 Nov 2026

Head e069de2ca10ba86bc9e34cde00eaa462d2e070e8. Isolated copy `rev10s` :4433 (fresh database, `PLATFORM_IDENTITY=local`, live AI off, US$0), stopped after the walk. Persona: the Owner of a small RCIC firm moving off spreadsheets (P-566), Sample firm user-R. Also the solo firm's Owner (user-S, no attestation yet), the Case Officer (user-O) and user-T.

## Journeys (written from the concept before the walk)
1. **Main:** "bring my old CRM's people in". Import → template → New import → Old CRM file → columns → declaration and attestation → preview → Import 3 people → result. Expected: 2 created, 1 merged, 1 skipped, 1 error, consent only for "yes".
2. **Alternate:** the same file again → saved mapping offered → To create 0 → "Nothing new to import."
3. **Empty:** a first-time firm (solo Owner) sees the teaching empty state and the attestation box.
4. **Error:** blank source, no file, a non-UTF-8 file, a repeated header, a control character in the source, nothing mapped.
5. **Recovery:** change a column after the preview (BR-2); tick the declaration, then unmap consent; tick the attestation without Confirm; reload on Columns and Preview; browser Back.
6. **Double click** Import.
7. **A dead job:** a batch left Running (forced with SQL) → Continue import after 60 s → finishes once.
8. **Wrong role:** the Case Officer by menu, by URL (`/platform/import`, `/new`, `/:id`) and by API.
9. **Sizes:** 375, 1024, 720 (200 % of 1440) and 1440 px; axe on the file, columns, preview, list and result states.
10. **Boundary:** the walk ends on the result rows (no person page yet: challenge B1, the Lead's answer 1). Underneath: origin IMPORT and consent IMPORT_DECLARED.

## What happened
* Scripted: `j_35.ts rev10s 4433` **17/17**; `check_pf10s_import_browser.ts 4433 xr_studio_rev10s` **16/16** (keyboard-only path included).
* J1, J2, J10 held, read underneath: the known person kept "Kim" and gained the phone; Ana's origin is IMPORT from "Old CRM"; one IMPORT_DECLARED consent for Ana, none for Ben; no lead, no message.
* J3: the solo Owner sees New import and the attestation box. Its words are Sample; Details holds "Unconfirmed: no counsel".
* J4: each error shows on its field in plain words: "Name where the file comes from.", "Choose a CSV file.", "The file is not UTF-8 text. Save it as "CSV UTF-8" and upload it again." (file `aria-invalid`), "Columns 1 and 2 have the same name…", "Name the source in ordinary words…", "Map at least one column."
* J5: BR-2 works (stale reason, then Preview again enables Import). **Broken:** declaration ticked, then consent set to "Don't import", then Preview: Import stays disabled with "The columns changed. Preview again before importing." Preview again does not clear it; a reload does (Major; see review M1). Attestation ticked but not confirmed: the preview cannot run ("An Owner must confirm first; then Preview again."), and the tick is gone on Back (Should). Reload on Columns keeps the server's mapping, and a Draft row in the list reopens at Columns.
* J6: a double click on Import gives one run: "Done: 2 created…", 2 people, no error.
* J7: Running shows "Importing… 0 of 3 rows written."; Continue import appears after about 60 s; one click finishes the batch; every row is written once.
* J8: no menu entry; "You do not have access to imports" on all three URLs; `POST …/run` returns 403.
* J9: no sideways page scroll at any width; axe 0 violations on every state I opened (file, columns and preview at 1440 and 375; list and result at 375, 1024 and 1440 from j_35). At 375 px the Columns table pushes "Import as" off screen with no scroll cue. Primary buttons are 36 px tall (shared component; P-795 asks for 44 px). A long source name wraps the title over 8 lines.
* user-T has no Import entry (not an Owner or Admin), as the Lead's answer 2 says.

Screenshots (session scratchpad, not committed): `rev10s/shots/` (d-decl-trap-1440, s-tick-no-confirm-1440, r1-file-errors-1440, r7-running-1440, r7-continue-1440, r7-list-1440, w-columns-375, r5-preview-375, r6-columns-1024, r6-preview-720). Committed by j_35: `screens/J-35/screenshots/`.

## Score
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | J1 and J2 end to end, read underneath (j_35 W1–W6) |
| Next step obvious | ½ | one primary per step with reasons; but the Owner's tick-then-Confirm is a trap (J5) |
| Plain words | 1 | reasons in words, never the cell; states and tooltips in plain words |
| Feedback and state | 1 | busy buttons, "n of rows written", Continue, state pills, chip counts |
| Correct data | 1 | 2 created, 1 merged; consent only with the declaration; double click → one run; re-import → 0 |
| Error recovery | ½ | field errors and BR-2 recover; the declaration trap needs a reload, and its reason is wrong |
| Accessibility and screen sizes | ½ | keyboard path and axe clean, 1024 and 200 % fine; 375 px Columns hides the control; 36 px buttons |
| Speed | 1 | no request per row (one page of 50; poll only while running); steps answered at once in the walk (not timed against a budget) |
| Visual quality | 1 | team frame, components and tokens; aligned tables; the long title at 375 px is the only blemish |
| Trust and sources | 1 | "Imported from Old CRM"; origin and consent basis underneath; "Unconfirmed: no counsel" on the attestation |
| **Total** | **8.5 / 10** | **Pass** (8 or more, no 0) |

Fixes that raise the low scores, most valuable first:
1. The effective declaration in `runBlocked` (error recovery).
2. Preview posts a ticked attestation first (next step).
3. Hide "First values" below `sm` at 375 px (screen sizes).

## Not tested
A real screen reader; an Admin account (none in the Sample data); a 5,000-row file; two tabs at once. D17 and D20 stay with the founder or an intended user.
