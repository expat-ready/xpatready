# Journey test: J-33 (R1.33, FO-9a phone part), reviewer role, 19 Nov

Isolated copy `rev33` on :4434 (PLATFORM_IDENTITY=local, Sample firms), commit `b6b6b3d4`, Chromium headless. US$0, no model call, no priced button. Scripted J-33 (`tests/journeys/j_33.ts`): 16/16 pass. My walk script and its screenshots were kept in the session scratchpad and are not committed. Each step below can be redone with the copy and the inputs given.

## Journeys (persona · goal · expected)
1. **Main path.** Owner (sales staff): "this web-form lead's phone is '12'; fix it." Fix number on the list and on the page; "12" is refused with the sentence; "+1 416 555 0100" is saved; the pill goes away on the page and on the list.
2. **Keyboard only.** Same task without a mouse: Tab to Fix number, Enter, type, Enter.
3. **Alternate.** A lead with no phone: Edit → add one; an empty Save → "Enter a phone number."
4. **Error.** Bad and unusual input: long, letters, vanity, extension, 7-digit local, 0044 prefix, Arabic-Indic and full-width digits; network failure.
5. **Wrong role.** A read-only staff member opens the lead; PATCH by URL.
6. **Other firm or other owner.** Firm B's person (J-33 W4); a Case Manager on the Owner's lead.
7. **Recovery.** Reload mid-edit; Escape and Cancel; double click on Save; two tabs saving.
8. **Across the boundary.** After the save, the Leads list (next screen) no longer flags the lead.

## What held
* J1: everything as the brief says. "12" gives 422 with the exact sentence under the field (`role=alert`, `aria-invalid`), the input is kept, and nothing is written (`12|false|-`, 0 audit lines). The save stores `+14165550100|true|+14165550100`, writes one audit line with ids only, shows the toast "Phone number saved.", and the list loses the flag.
* J2: Fix number is reached in 7 Tabs, with a visible 2 px focus ring and a tooltip ("This number could not be read as a phone number with its country. Fix it."). Enter opens the field, focused. The refusal keeps focus in the field. Save works with Enter.
* J3: the empty field is refused with "Enter a phone number."; a phone can be added where there was none.
* J4: "+44 20 7946 0000" keeps its country. Arabic-Indic and full-width digits are read as +14165550100. More than 40 characters → "at most 40 characters." Letters, vanity, 16 digits and "0044 …" are refused with the sentence. When the network fails: "Could not save the number. Please try again."
* J5: read-only viewer: no Edit, the pill is plain text, PATCH → 403 `MISSING_PERMISSION`, nothing saved.
* J6: firm B → 404 and B's row is unchanged. The Case Manager's access matches what they can read (with "everyone sees all" on, they can both read and edit; with it off, check E2 gives 404).
* J7: reload mid-edit saves nothing. Escape and Cancel save nothing.
* Screen sizes: 1024, 400 and 200 % zoom (720 px CSS at scale 2) with the error showing have no sideways scroll, and axe (WCAG 2.0, 2.1 and 2.2 A/AA, whole page) finds 0 violations at each width. No page errors; the only console lines are the expected 422 and aborted requests.

## Findings
* **Major: a 7-digit local number clears Fix number with a broken value.** "555 0100" is saved as `+15550100` (readable, in `phone_e164` too) and the pill goes away; "4165550" becomes `+14165550`. `api/src/front-office/people/edit.ts:47`, `duplicates/phone.ts:11` (`isPossible()` accepts local-only lengths). The brief says to refuse an impossible number.
* **Major (seen first by the breaker's F1, then confirmed from the library and the database check):** "+49 23456789012345" is "possible" at 16 digits; `fo_person_phone_check` allows at most 15, so the save gives a 500 instead of the field's sentence.
* Minor: focus goes to `<body>` after Save, Cancel or Escape (`web/…/sales/lead-page.tsx:33,43,45`).
* Minor: two tabs give a silent last-write-wins (no version or 409; STANDARDS §4).
* Minor: a double click on Save sends 2 PATCHes, so 2 audit lines (`lead-page.tsx:44`).
* Minor: "ext. 22" is dropped without a message.

## Score (QUALITY.md "Journey score")
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | J1, J-33 W1–W3 pass, data read underneath |
| Next step obvious | 1 | Fix number is a button with a tooltip and opens the focused field (J-33 W2) |
| Plain words | 1 | the brief's sentence, plus a hint naming the country code; the toast says what happened |
| Feedback and state | ½ | toast, inline alert and busy state are there; no conflict state from a second tab (J7) |
| Correct data | ½ | correct for the J-33 inputs; a 7-digit local number is saved as `+15550100` with the flag cleared (Major); extension dropped |
| Error recovery | 1 | input kept, field error, network failure message, Escape |
| Accessibility and screen sizes | ½ | axe 0 at 4 sizes and no sideways scroll; focus lost to body after save or cancel (WCAG 2.4.3) |
| Speed | 1 | lead page first view 248 ms; save round trip 26 ms |
| Visual quality | 1 | team Input, Button and Pill; the error wraps cleanly at 200 % |
| Trust and sources | 1 | no AI; audit line with ids only; the 404 never says whether the person exists |
| **Total** | **8.5 / 10** | Pass on score (8+, no 0). The Major still blocks the check (see review.md) |

To raise it, most valuable first: refuse local-only numbers (correct data → 1); return focus to Edit (accessibility → 1); a version or `If-Match` with a "someone else saved" state, if the Lead rules it in (feedback → 1).

## Not tested
A real screen reader; an intended user's unaided walk (D17, D20 stay with the founder); a hostile file (no upload here); Safari and Firefox.
