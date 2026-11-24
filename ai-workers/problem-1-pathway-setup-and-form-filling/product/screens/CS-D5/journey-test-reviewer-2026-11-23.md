# CS-D5 part 1: journey test, reviewer role (23 Nov 2026)

PR #3188 at 1cb23d33c7e49434c3e35461f1d0a34db7c7cb16. Isolated copy `rev_csd5` on :4471 (never :4400), stopped after. **API only: there is no screen yet** (part 2 builds `document-preview.tsx`). Steps 2-3 of the skill (a visible-browser walk, a Playwright replay with axe at 400/1024/1440 px, keyboard) cannot run. So **no score out of 10 is given**: "Not yet evidenced", not a projected score. The journeys below were walked against the API as the screen will call it.

## Journeys (persona: case officer of the Sample firm unless noted)
| # | Journey | Expected | Result |
|---|---|---|---|
| J1 main | Officer asks to preview a client's PDF and fetches it once | 200 link: url, expires_at (+300 s), media_type, file_name, size_bytes, uploaded_at, scan NOT_SCANNED, contains_scripts; bytes 200 with nosniff, sandbox CSP, inline, `private, no-store`; one "previewed" line | Held (check DW1, DW3; probe) |
| J2 alternate | Same with a PNG | image/png bytes | Held (DW1) |
| J3 flagged | A PDF carrying `/OpenAction /JavaScript` | contains_scripts true; plain PDF false | Held (probe); no test asserts it (review Minor 5) |
| J4 recovery | Second fetch / reload of the same link | 404 in the download's words, no second line | Held (DW3) |
| J5 double click | 10 parallel GETs of one link | exactly one 200 | Held (probe: 1 x 200, 9 x 404) |
| J6 wrong person | Colleague in the same firm, another firm, client, configuration author use the officer's link | 404 / 404 / 403 / 403; the officer can still use it after | Held (DW2, probe) |
| J7 wrong role on link route | Client, author, nobody, unknown id, non-UUID id | 403 / 403 / 401 / 404 / 404; no audit line | Held (DW4, probe) |
| J8 tampering | One character altered; forged body with a real doc id | 404 for staff; 403 vs 404 for non-staff, the same as the download (no new oracle) | Held (review point 2, Minor 2) |
| J9 expiry | Link used at 300 s | 404 | Held on the signer only, not on the route clock (Minor 7) |
| J10 boundary | Hand-over to part 2's viewer (fetch once into memory, a renewal only on expiry) | API supports it: single use plus a fresh link per POST | Held for the API side; the viewer is not built |

## Break-it pass (15 min)
* HEAD on a link uses it up (HEAD 200, then GET 404): Minor (review 4).
* 5,000-character and garbage tokens: 404, no crash.
* Two app tasks (deploy synth runs 2): single use and the key are per process, so links fail on the other task, or are used twice with a shared key: Minor today, Major before any two-task deploy (review 1).
* Hostile filenames and a PNG bomb are refused at upload (PF-F4); not this row.

## Data underneath
`audit_event`: action `previewed`, entity `case document`, entity_key = document id, actor `user-O`, case_id set, summary "Case officer previewed Letter of invitation (Sample) on case 767c7e29". One row per link, none for refusals or bytes fetches. No other table changed (read-only route).

## Score
Not given: the ten criteria (next step obvious, plain words, visual quality, accessibility and screen sizes) need the screen. The API behaviours above support part 2's score. Part 2's reviewer scores the journey (W1, DW6) in a browser.

## Could not test
A visible browser, axe, keyboard, 360/1024/1440 px, a screen reader, an intended user's unaided walk (D17, D20 stay with the founder).
