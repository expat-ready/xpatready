# Journey test: FO-13s part 2, identity checks on the client page (reviewer, 20 Nov 2026)

Reviewer role (journey-test skill, the one score for this check), PR #2568 at **c4f56a357**. Copies :4446 and :4447 (`PLATFORM_IDENTITY=local PROSPECT_WON_POLL_MS=500`), both stopped. Headless Chromium through Playwright, using only what a person sees (click, Tab, read). The data was set up by J-110 and by SQL on my copy: a company client, a case-opened person client, the visibility setting and one role key. US$0.

## Journeys (persona · goal · steps · expected → result)
1. **Main.** A case officer: "Before I open the case, did we check this client's identity?" Steps: Clients → search "Jmwp" → open the client. Expected: the check with method, document, country, expiry, who and when, and no Record. Result: **held.** "Document copy · Nov 20, 2026, 4:30 p.m. by Case officer (Sample) · Passport, IN ···4K9Z · Expires Nov 20, 2026 · Name, Email · Open copy". No Record a check. The values match the saved row.
2. **Keyboard.** The same person, keyboard only. Tab from the heading reaches "Open copy", a 3 px focus ring shows, and Enter downloads `identity-copy.pdf`. **Held.**
3. **Alternate.** A case manager who does not own the lead, with "everyone sees all" on (the default). Expected: the same check. **Held.**
4. **Empty.** A person client made when a case opened (no lead or prospect). Expected: a teaching empty state. Result: "No identity check is recorded for Casey Sideopened. Identity checks are recorded on the person's lead or prospect page." **Partly held**: this person has neither page (Should S2).
5. **Not visible (finding).** "Everyone sees all" is off, and a case manager opens a client whose lead someone else owns. Expected: a plain line on why the checks are not shown. Result: a red Notice "No such person in your firm." with Try again. Try again repeats the 404 forever, while the page above names that very client. **Major** (review issue 1).
6. **Wrong role.** A role without `agent/prospect:show` (removed on my copy). Result: "Seeing identity checks needs a role that sees prospects: ask your firm's Owner or Admin." **Held**, although a 403 is still requested and logged in the console (S3).
7. **Company client.** No panel. The page is clean, and axe found nothing. **Held** (the database allows a company no person link).
8. **Boundary.** Lead page → record → won → client page (J-110 W1–W6), and the lead, open prospect and won prospect pages still offer "Record a check". **Held.** J-110 does Convert through the API, not the prospect page's button (S1).

## Replay and checks
* `j_110.ts`: 14/14, twice, on fresh copies. `check_fo13s_identity_browser.ts` 28/28, `check_csk1s_clients_browser.ts` 33/33 (run-suites, exit 0).
* axe (WCAG 2.2 A/AA, whole page): no violation on journeys 1, 3, 4, 5, 6 and 7. Widths 375, 1024, 1440 and 512 ×2 (1024 at 200 %): sideways scroll 0 everywhere.
* Page errors: none. Console: one 404 (journey 5) and one 403 (journey 6), as expected from the requests.
* Mutations: mount removed → W6 fails; `readOnly` removed → W6 fail red; a fixed wrong check time → **W6 still passes** (review issue 2, QA-611 not met).

## Data underneath
The SQL row `fo_identity_check` for the person has method DOCUMENT_COPY, PASSPORT, IN, last 4 `4K9Z`, expiry = today, `checked_by` = the case officer, one row. The client page wrote nothing. `GET clients/:id` answers `fo_person_id` for the person client, and null for the company client.

## Break it
* Wrong role by URL: covered by journeys 5 and 6. The server refuses (404 or 403) and the identity data never reaches the browser.
* A stale cache across sign-ins: the session drops every `["fo"]` answer on a token change (`session.ts:36`). No leak.
* Another firm's person id: `firmScope` gives 404, which I read in the code but did not run.

## Score
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | Journeys 1 and 3 |
| Next step obvious | ½ | Empty line names where, with no link; wrong for case-opened clients (journey 4) |
| Plain words | 1 | Lines are plain; the 404 sentence is counted under feedback |
| Feedback and state | ½ | The not-visible state shows a false error (journey 5) |
| Correct data | 1 | Screen = DB row (data section) |
| Error recovery | ½ | Try again can never succeed on 404 (journey 5) |
| Accessibility and screen sizes | 1 | axe clean, four widths, keyboard opens the copy |
| Speed | 1 | One request for the section; no wait over 1 s noticed |
| Visual quality | 1 | Team card and tokens (heading size: minor) |
| Trust and sources | 1 | Who and when on every check; no AI |
| **Total** | **8.5 / 10** | **Pass** (8 or more, no 0). The review still blocks on two Majors |

Fixes that would raise the score, most valuable first:
1. A plain line instead of the 404 error on the read-only mount (feedback, recovery).
2. Empty-state wording that holds for case-opened clients (next step).
3. Gate the request on the viewer's keys.

## Not tested
A real screen reader; an intended user's unaided walk (D17 and D20 stay with the founder); a reload in the middle of loading; two tabs (the section is read-only, so this is not applicable).
