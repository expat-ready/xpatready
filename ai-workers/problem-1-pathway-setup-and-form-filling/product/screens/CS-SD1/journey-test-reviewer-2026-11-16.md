# CS-SD1 journey test (reviewer, 16 Nov 2026), commit b5889232d

Row: schema text only, no screen of its own. The journeys walk the one user-visible behaviour the row must keep: a shared-field rename to a name its group already uses is refused (the `canonical_field_name` guard), and the rows the four changed ids belong to are still created. Isolated copy `rev_cssd1` on :4641. A headless Playwright walk ran with the installed chromium-1243 (the repo's Playwright 1.64 expects build 1248, which is not installed here). Screenshots are in the reviewer's scratchpad only and are not committed (`journey/j1-dialog.png`, `j2-refused.png`, `j4-tab1.png`, `j4-tab2.png`, `w1024-dialog.png`, `w400-dialog.png`).

## Journeys (persona: configuration author, `user-A`)
1. **Main path.** Rename field A to a free name. The dialog shows "Checks passed", "Applies now". Confirming with Enter (keyboard) shows the toast "Renamed (a new draft version)" in 222 ms. Data: the new label is the newest version, and `canonical_field_name` holds `revtaken…` for A.
2. **Error path.** Rename field B to A's name in capitals. The dialog shows "This change is refused: "REV TAKEN …" is already the name of Rev taken … in this group. If they mean the same, merge them; otherwise choose another name." Rename is disabled. Data: B's label is unchanged.
3. **Recovery.** Cancel, then reload: B still shows its own name.
4. **Two tabs, same moment.** C and D are renamed to one free name. Tab 2: "Renamed (a new draft version)". Tab 1 stays in its dialog with the red toast "… is already the name of … Nothing was changed." The browser logs a 409. Data: exactly one holder of the name.
5. **Screen sizes.** At 1024 px and 400 px the refused dialog has no sideways scroll, and Rename is disabled.
6. **Data underneath (ids).** After a fresh start and sample load: 6/6 `person_role` rows with a UUID id (the `createMany` path, now with the database default) and 2 `form_edition_accept` rows. Prisma `create` and `createManyAndReturn` on `person_role` return the database-made id, and an explicit id is kept (a scratch script, deleted).

## What held
Every journey matched its expected result. No page errors. The one console error is the race loser's expected 409.

## Findings
None against this row. The refusal in the UI comes from the change check before the database. The database index is the backstop for the race, which journey 4 showed. That is unchanged by this PR.

## Score
| criterion | score | evidence |
|---|---|---|
| task completed | 1 | J1 renamed, J2 refused, J4 one winner |
| next step obvious | 1 | J2 says "merge them; otherwise choose another name" |
| plain words | 1 | no ids or SQL in any message (j2-refused.png) |
| feedback and state | 1 | toasts, a disabled Rename, "Nothing was changed" (j4-tab1.png) |
| correct data | 1 | one holder of the race name, B unchanged, 6/6 role ids |
| error recovery | 1 | J3 cancel and reload; the J4 loser keeps its dialog open |
| accessibility and screen sizes | ½ | keyboard confirm, 1024/400 px with no sideways scroll; axe not run (`@axe-core/playwright` is not installed); 200 % zoom not checked |
| speed | 1 | the rename answers in 222 ms; sample load 6 s (setup) |
| visual quality | 1 | team look unchanged (screenshots) |
| trust and sources | 1 | "Made by a person"; the refusal names the field holding the name |

**9.5 / 10, pass** (8 or more, no 0). To raise accessibility: an axe pass and a 200 % zoom check on the rename dialog.

## Could not test
A real screen reader, and an intended user's unaided walk (D17 and D20 stay with the founder). The sample load and the four test fields were set up through the API and `seed_library.cjs` (setup only, not the step under test). The PF-8r restored-database DW1 run is the breaker's.
