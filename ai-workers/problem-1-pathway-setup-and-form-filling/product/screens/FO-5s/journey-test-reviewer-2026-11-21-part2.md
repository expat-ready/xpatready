# Journey test: FO-5s part 2 (Retainer templates, S1) as the reviewer, 21 Nov 2026

Commit 94658d9e7a5e05759bc90f7da059de8b5ff3b407 (diff since e6a03694e). Isolated copies rev2_fo5s :4571 and rev2_j53 :4572 only, never :4400. Headless Chromium driven like a person (click, type, Tab), plus reads of the database and API. Opus 5.5. US$0, no model call.

## Journeys (written before walking)
1. **Main:** the firm's Owner sets up the retainer. Sales menu → Settings › Retainer templates → Download a starter template → Upload template (name + file) → open it → read the Code line → Upload a new version → Make inactive. *Expect:* one row, v1 then v2, the "n of 26" line, inactive not offered in Prepare.
2. **Alternate:** the firm's own Word file. Upload a template with an unknown placeholder, then one with no fee placeholder. *Expect:* the unknown one is refused and named; the no-fee one is accepted with a warning; the person can see which placeholders are allowed.
3. **Empty:** a firm with no templates. *Expect:* the empty state in the concept's words, offering the starter.
4. **Error:** an unreadable file, a 6 MB file, an 11 MB file, a duplicate name, 14 unknown placeholders. *Expect:* each refused in words, on the field, with typed input kept.
5. **Wrong role:** a Case Officer by menu, by URL and by API. *Expect:* no menu item, a notice on the page, 403 from the server.
6. **Recovery:** a double click on Upload, two tabs uploading versions, Escape out of panels.
7. **Across the boundary:** the uploaded template → Prepare retainer on a Corporate prospect → pick a signer → fee 0 → Send → Edit → the card. *Expect:* emails kept after Save, "No fee", "Version 3 is not sent yet".
8. **Keyboard and sizes:** journey 1 by keyboard; 400, 720 CSS px (1440 at 200 %), 1024 and 1440 px.

## What held
* **Journey 1, keyboard:** 6 Tabs reach the menu item and 9 more reach Upload. Focus lands in Name. Enter submits. One row is stored, with an audit line.
  - The panel says "1 of 26 items marked in this template" and lists 25 unmarked items, each with section and how we check, plus the source line and "Unconfirmed: no counsel".
  - A new version made v2. Make inactive took the template out of Prepare (the template suite asserts this).
* **Journey 2:** "{client.passport} is not a placeholder we know". Fourteen unknown names are capped at 10 plus "and 4 more". The no-fee warning shows on the page and as a "warning" chip.
* **Journey 3:** "No retainer templates yet. Upload your firm's .docx to start." and the Sample starter line (template suite, fresh database).
* **Journey 4:** these show on the field:
  - "We could not read this file."
  - "A template is at most 5 MB."
  - 11 MB: "This file is too large for this upload." (a panel notice)

  The duplicate name gives "A template with this name already exists." as a panel notice. Nothing was stored for any refusal.
* **Journey 5:** no menu item; "Retainer templates are set by your firm's Owner or Admin." Upload, PATCH and starter return 403.
* **Journey 6:** a double click stored exactly 1 row.
* **Journey 7:**
  - Options read "Primary contact · email", "HR · no email" and "Billing · email", both before and after Save.
  - Picking the empty option leaves Save disabled.
  - Total fees and the Send panel read "No fee", and Send went through (v2 SENT).
  - Edit → v3. The card says "Version 3 is not sent yet: Birch … Ltd cannot sign until it is.", and v2 kept its sent time.
* **Journey 8:** axe found no serious or critical issue at 400, 720, 1024 and 1440 px. No sideways page scroll at any width, with or without the panel open. The list arrived in 34 ms.
* **Suites:** templates 16/16, retainer screens 41/41, J-53 21/21 (W0 by screens).

## Findings
* **Major, journey 2** (`templates-page.tsx:86-112`): no "Placeholders you can use" and no "Placeholders found" (concept S1, BR-1). `GET …/retainer-templates/placeholders` exists, but no page calls it. Someone writing their own template can only guess, or copy the starter. That breaks "prevent errors before messaging them" (EXPERIENCE §2.8 [M]).
* **Minor, journey 1 F:** after Upload version 2, the input still shows starter.docx. Clicking "Upload version 3" then says "Choose a .docx file." (`f-file-after-version`).
* **Minor, journeys 1 and 6:** focus goes to BODY after Upload, Escape or Close (no `returnFocus`).
* **Minor, journey 6:** a stale tab's "Upload version 3" made version 4 without a notice.
* **Minor, journey 4:** the duplicate-name error is not on the Name field.
* **Minor, break:** one 119-character name (Japanese and Arabic with spaces; an English name of this length does the same) pushes Kind…Updated out of view on every row at 1024 and 1440 (`l-long-1440`). The name button does not wrap.
* **Minor:** versions are not downloadable (no FO-5 route). The starter is not offered inside the Upload panel. The part-1 minor fixes have no test.

Walk screenshots (evidence, not committed): `/tmp/claude-0/-home-user-xpatready/a113d365-4482-5420-851d-2ad773f40c80/scratchpad/walk/` and `/tmp/claude-0/-home-user-xpatready/a113d365-4482-5420-851d-2ad773f40c80/scratchpad/walk3/`.

## Score (QUALITY "Journey score")
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | Journey 1 and journey 7 end to end by screens; J-53 W0 by screens |
| Next step obvious | ½ | Writing your own template has no list of what is allowed (Major). The file-input contradiction after a version upload |
| Plain words | 1 | The refusals, "Make inactive", "No fee", "Version 3 is not sent yet" |
| Feedback and state | ½ | Toasts and busy states work. A stale version number, a cleared file still shown |
| Correct data | 1 | One row per upload, a double click stores once, n+1 versions, audit lines, inactive not offered, v2 unchanged after Edit |
| Error recovery | 1 | Every refusal says why and keeps the typed name. 14 unknown placeholders capped |
| Accessibility and screen sizes | ½ | axe clean at four widths and keyboard-complete. Focus lost after panels close; a long name hides columns |
| Speed | 1 | List in 34 ms, no per-row requests |
| Visual quality | ½ | Team look. The name link is padded and misaligned; nowrap names |
| Trust and sources | 1 | Code citation with date, "Unconfirmed: no counsel", starter marked Sample |
| **Total** | **8/10** | **Pass** (8 or more, no 0) |

To raise the score, most valuable first: the placeholder lists (M1); `returnFocus` on both panels; reset the file input after upload; wrap long names; send the expected version.

**Not tested:** a real screen reader, a non-Chromium browser, an intended user's unaided walk (D17/D20 stay with the founder), consultation-kind templates (no screen makes one).

## Re-test at 24a1ed3d89690f474b89e5091e09a806a817a6b7 (diff since 94658d9 only)
Fresh copy rev3_fo5s :4571; J-53 on rev3_j53 :4572 (21/21). Suites: templates 22/23 then 23/23 twice (flaky focus check, n4 in the review); retainer screens 41/41.
* **Journey 2 (own template) now has its help:** "Placeholders you can use" lists every allowed name with its meaning, the fee loop and its fields. The starter is offered inside the panel. The template panel lists "Placeholders found (17)".
* **Journeys 1 and 6:**
  - Focus returns to "Upload template" after Escape, Cancel and upload, and to the template's name after Close.
  - The file input is empty after a version upload.
  - A stale tab is refused in words ("now at version 3, not version 2. Open it again.") and the panel refreshes. Nothing is stored.
* **Journey 4:** a duplicate name is shown on the Name field.
* **Break:** 106- and 118-character names wrap, and Status stays visible at 1024 and 1440 px.
* **Still open (Minor):** the help's wording around the fee loop and the clause markers (n5); a flaky focus check (n4); the part-1 minor fixes have no test.

| Criterion | Before | Now | Evidence |
|---|---|---|---|
| Task completed | 1 | 1 | Own-template path now guided |
| Next step obvious | ½ | 1 | Placeholder list and starter in the panel; a fresh file input |
| Plain words | 1 | 1 | Unchanged; small wording overlap in the fee loop (n5) |
| Feedback and state | ½ | 1 | Stale version refused in words; the panel refreshes |
| Correct data | 1 | 1 | 409 leaves the version unchanged; one row per upload |
| Error recovery | 1 | 1 | Duplicate name on the field |
| Accessibility and screen sizes | ½ | 1 | Focus returns on both panels; long names wrap |
| Speed | 1 | 1 | Unchanged |
| Visual quality | ½ | ½ | The starter link in the panel sits off the text baseline; the name link padding remains |
| Trust and sources | 1 | 1 | Unchanged |
| **Total** | **8** | **9/10** | **Pass** |
