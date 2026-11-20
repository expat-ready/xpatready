# Journey test: CS-NK1 (reviewer, 17 Nov 2026), commit 91f92691ad1d854b4afeadafa11be4e682a70b13

This is a schema row with no screen change. Its user-facing behaviour is the field rename in the shared library (Fields › a field ›
Name › Rename › dialog). I walked it with Playwright and Chromium on my isolated copy `runtime_csnk1j` (:4638), with the sample inputs loaded and fields
seeded through `tests/seed_library.cjs`. I ran it twice (suffixes `0bmt`, `1tdf`) with the same results, then read the database after each run. Screenshots are in the session
scratchpad (not committed); each finding below names its step so it can be reproduced.

## Journeys (persona: configuration author, "user-A"; all names Sample)
1. **Main:** rename field a to `Café-crème name <u>`. *Expected:* it applies as a draft. *Held:* "Renamed (a new draft version)". Stored key `cafécrèmename<u>`; one audit line.
2. **Duplicate, one after the other:** rename field b to `Café crème name <u>`. *Held:* the preview says "This change is refused: … is already the name of Café-crème
   name <u> in this group. If they mean the same, merge them; otherwise choose another name." Rename stays disabled.
3. **Never stricter:** `Cafe creme name <u>` (no accents) is accepted next to the accented one. `किसान <u>` and `कसान <u>` (one vowel sign apart) are both accepted. Keys are stored as normalizeLabel gives them.
4. **Race across two tabs:** two fields, Rename pressed at the same moment on `Race-name <u> é` and `Race name <u> é`. *Held:* exactly one is renamed
   (tab 2: "Renamed"), the other answers 409 and keeps its old name. Both runs. On the 25 Oct key the same race through the API let both land 20 of 20 (review.md).
5. **Break: Greek final sigma.** Rename field f to `ς <u>`, which is accepted. Then rename field g to `'Σ <u>`. normalizeLabel gives `σ<u>`, so the app lets it through and the preview shows "Checks passed".
   *Found:* the save is refused with the toast `"'Σ <u>" is already a field's name in this group.`, though no field has that name. The database key is `ς<u>` (review.md issue 1).
6. **Keyboard and 1024 px:** Tab to the Name box, type the duplicate, Tab and Enter open the dialog. The refusal is readable and focus stays in the dialog. axe WCAG 2.2 A/AA: no violations. No sideways scroll.
7. **Data underneath:** only successful renames write `renamed` audit lines (6 per run). Refused renames change no row. Every stored `name_key` equals normalizeLabel of the label, except journey 5.

Not walked, because this row does not touch them: wrong role (the server's `need(actor,"author")` is unchanged), AI, files, and the hand-over to the next screen.

## Score (0 / ½ / 1, with evidence)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | J1, J3, J4: renames land; duplicates refused; the race has one winner |
| Next step obvious | 1 | J2: the refusal says to merge or choose another name |
| Plain words | 1 | J2 and J4 messages are plain; no codes shown |
| Feedback and state | 1 | Preview before confirming; toast after; the dialog stays open on refusal |
| Correct data | ½ | J5: the database refuses a name the app allows (key `ς` vs `σ`); everything else exact (J7) |
| Error recovery | ½ | J5: "Checks passed", then "already a field's name" with no such field, so the user cannot find the clash |
| Accessibility and screen sizes | 1 | J6: keyboard path, axe clean at 1024 px, no sideways scroll (400 px and 200 % zoom not run) |
| Speed | 1 | The key function computes 480k keys in seconds; the rename round trip is unchanged |
| Visual quality | 1 | Unchanged team dialog and toast |
| Trust and sources | 1 | The preview names the field that holds the name (J2); no AI involved |

**Score: 9 / 10. Pass (8 or more, no 0).** To raise it: fix the start-of-string Σ key (review.md issue 1). That repairs both ½ criteria, because the
preview and the database then agree.

## Could not test
A real screen reader. An intended user's unaided walk (D17/D20 stay with the founder). The 400 px width and 200 % zoom (no UI change in this row).
The demo checkpoint load in this cloud copy (`pypdf` missing; CI decides). The breaker's 50-way race.
