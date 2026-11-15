# Journey test (reviewer), PF-4f: exact sign-in door checks

Reviewer: Opus, fresh context. Head `7eb0cf8a755349683500c276eefbe38de41d83e3`, 15 Nov 2026. Own copy `forms_qa53_rv` on :4479 (never :4400), stopped afterwards. Live AI off, US$0.

This row changes only a test file (`tests/check_forms_qa53.ts`), so the "user" is whoever runs or relies on the regression check: a builder adding a platform route, qa, or CI. No screen changed. The browser, axe, width and keyboard steps do not apply; that is noted against each criterion.

## Journeys
1. **Main path (qa / CI):** run the suite from its usage line on a fresh copy. Expected: green, and the door asked with its exact status. Result: 38 passed, 0 failed, exit 0. The live PF-4t line covers 2 reads and 8 writes. The door answers 403 `LOCAL_SIGN_IN_OFF` to nobody, author, officer and client.
2. **Error, door breaks to 404/5xx (builder):** the m1 unit fail test covers 404, 500, 503, 401 and 400. With the old `status < 400` rule put back, it fails. Result: held.
3. **Error, door status drifts (builder changes the stand-in):** with DOORS set to 400 (the equivalent of the server answering something else), the live line fails. It lists route, actor, status and the start of the body for each of the four actors. Result: held; the failure says what to look at.
4. **Alternate, new door added the house way (`@Post(...) @StaffSignIn(...)` on one line):** the planted fail test (l.220) is caught. A second DOORS entry with no route also fails l.217. Result: held.
5. **Break it, new door laid out differently:** `@StaffSignIn` on its own line above `@Post`, or a GET door. Result: **not counted** by the m2 list (`doorsOf` = `[]`). It is asked only as a plain platform route that should answer 401. See finding F1.
6. **Wrong environment:** would CI's copy start with `PLATFORM_IDENTITY` set? Not set in `.github/`, `product/tools/` or `studio/tools/`. `run-suites.sh` passes only the usage line's settings, and this usage line has none. The door is therefore 403 there too. Under `PLATFORM_IDENTITY=local` it would be 400 and the check fails loudly, which is intended.
7. **Recovery, re-run on the same copy:** "setup: the demo loads 409". This is already how the suite behaves (its usage line starts fresh each time), not this row; not a finding.

## Data underneath
The check writes nothing new; it only reads routes from the code and asks them. After my runs, `git status` showed nothing changed except the two report files. The copy's database and files were removed by `isolated.sh … stop`.

## Findings
* **F1 (Minor):** door detection works only on the same line (`check_forms_qa53.ts` l.160), and GETs are never doors (l.203). An added door in another layout skips the reviewed-list check.
  * **Fix:** assert that the count of `@StaffSignIn(` in `api/src` (excluding `platform/identity/keys.ts`) equals `Object.keys(DOORS).length`. Add a planted own-line door and a GET door as the fail test.
  * Same as m-1 in `review.md`.

## Score (0 / ½ / 1)
| Criterion | Score | Evidence |
|---|---|---|
| task completed | 1 | m1 and m2 each have a pass and a fail test; 38/0 on the reviewer's copy |
| next step obvious | 1 | the failure lines name method, route, actor, status and body start (journey 3) |
| plain words | 1 | test names say what is caught and why ("status < 400 let 404 and 5xx pass") |
| feedback and state | 1 | the live line prints the list of wrong answers; the m2 line prints the doors found |
| correct data | ½ | exact status enforced live and in the unit check (mutants); an off-convention door is not counted (F1) |
| error recovery | 1 | an unreviewed same-line door gets `-1` and fails every actor; nothing to undo |
| accessibility and screen sizes | 1 | N/A: no UI touched, nothing can regress |
| speed | 1 | the suite runs in seconds after the copy starts (suite-times.tsv: 12 s) |
| visual quality | 1 | N/A: no UI touched |
| trust and sources | 1 | the DOORS comment cites `service.ts` `localSignIn` and `LOCAL_SIGN_IN_OFF`; the 403 is cross-checked by `check_pf4_identity.ts` l.198 |

**Score: 9.5 / 10. Pass** (8 or more, no 0).
* To raise "correct data": F1.

## Could not test
* CI's own run on this head: the PR's jobs were skipped (draft).
* A real screen reader, and an intended user's walk: D17 and D20 stay with the founder. Neither applies to a test-only row.
