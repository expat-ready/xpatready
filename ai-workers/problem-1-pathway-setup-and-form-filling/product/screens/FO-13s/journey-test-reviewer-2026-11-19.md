# FO-13s part 1: journey test, reviewer role (19 Nov 2026)

Commit 70c36466e (PR #2309), worktree with Part A's 422 rule applied locally (uncommitted, not reviewed here). Isolated copies rv13s on :4571 and rvj110 on :4572 (`PLATFORM_IDENTITY=local`), both stopped at the end. Headless Chromium (Playwright). The builder's scripts and my own probe script (kept outside the repo) both ran. No visible-browser walk by a person, and no screen reader.

## Journeys (persona · goal · expected)
1. **Main.** A case officer on a lead: "I checked this client's passport in person. Record it with a copy." Record a check → passport, CA, last 4, expiry today, Name, a PDF → Save. Expected: toast, a listed row in plain words, the no-check sentence gone.
2. **Open copy.** The same officer opens the stored copy and gets the same bytes, named `identity-copy.pdf`.
3. **Across the boundary.** Before any check, a retainer Send warns "No identity check is recorded for <name>." and the lead page says the same. After the check, Send has no warning. (Send runs through the API, which is named scaffolding: P-33, FO-5s not built.)
4. **Error: expired.** Expiry yesterday (the firm's day) → "This document has expired. Check a current one." on the field and in the summary. Focus goes to Expiry date, and nothing is stored.
5. **Error: other refusals.** Expiry with no type → refused on Document type. A text file named .pdf → "A PDF, JPEG or PNG." Other with no note → "Say what the other method was." 11 MB → "At most 10 MB." before upload.
6. **Wrong role.** Billing and finance sees the list, with no Record and no Open copy, and a reason line for each. Read-only may open a copy but not record. By URL, BF's POST gets 403 and its download-link gets 403 `MISSING_PERMISSION`.
7. **Recovery: lost answer.** The server stores the check but the browser gets no answer → "Could not reach the server. Your details are kept: Save again to retry the same check." Save again → still 1 row, with the same `requestId` sent twice.
8. **Recovery: double click and reload.** Double-click on Save check → 1 row and 1 audit line. List load fails (500) → plain reason and Try again, which recovers.
9. **Empty and no name.** A person with no name: the lead page says "…for the signer." (matches the server), but the prospect page says "…for (no name)." (does not match).
10. **Sizes.** 375, 1024 and 1440 px, and 512 px at scale 2 (1024 px at 200 %), with no sideways scroll on the page or in the panel.

## Automated replay
* `check_fo13s_identity_browser.ts 4571`: **24/24 twice** (axe WCAG 2.2 AA: no serious or critical issue in 4 states; keyboard-only Save; 375, 1024 and 1440 px).
* `j_110.ts rvj110 4572`: **10/10 twice**.
* Probes: journeys 7 to 10 above, all as stated. Warm lead page with the panel: 225 ms. The only console error is the expected 400 resource line from a refused Save.

## Data underneath
For each Save, `fo_identity_check` has exactly one row, and the values are as typed (country upper-cased, last 4 upper-cased by the server). After a refusal (422, 400, 415), the row count is unchanged. One `audit_event` per check. The server refuses roles by URL (403).

## Findings (severity)
* **Major.** The lost-answer retry (BR-7, challenge M2) works, but no test covers it. If the panel made a new id per Save, both suites would still pass. Fix: in the browser check, `route.fetch()` and then `abort()` the first POST, Save again, and assert 1 row.
* **Major.** Loading is a line of text, not skeleton rows (`identity-panel.tsx:177`). The concept §4 says skeleton rows, and EXPERIENCE §4 [M] asks for skeletons. `sales/loading.tsx` `Loading` already exists.
* **Minor.** On the prospect page, a person with no name gets "(no name)" where Send says "the signer" (`prospect-page.tsx:113`).
* **Minor.** The expiry shows "2026-11-19" next to "Nov 19, 2026, 3:24 p.m." in the same row (`identity-panel.tsx:60`).
* **Minor.** The error summary reads "One thing to fix". It has no links and no "There is a problem", and it is not the team's Notice (`:121-122`). The complaints drawers use `Notice title="There is a problem"`.
* **Minor.** The file input text is not centred vertically in its box (`expired-1440.png`).

## Score (0 / ½ / 1)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | J-110 W2-W3; journeys 1 and 2 |
| Next step obvious | 1 | Empty notice "Record a check before the retainer is sent."; one outline header button; one primary in the panel (`empty-1440`, `panel-1440`) |
| Plain words | 1 | Codes as words (In person, Passport, Name); hints; P-735 respected (no Code cited anywhere in the diff) |
| Feedback and state | ½ | Toast, busy Save, locked form, load error with Try again; loading is text, not skeletons; the summary is a one-off box |
| Correct data | 1 | One row per Save, including double click and lost answer; nothing stored on a refusal; copy bytes equal; audit line |
| Error recovery | 1 | Input and file kept; focus on the first error; lost-answer retry gives one row; Try again on load |
| Accessibility and screen sizes | 1 | axe clean in 4 states; keyboard Save with focus return; 375, 1024 and 1440 px and 200 % with no sideways scroll; headings in order |
| Speed | 1 | 225 ms warm; one list request per view; no request per row |
| Visual quality | ½ | Team tokens and Panel; mixed date formats in a row; summary box not the team Notice; file input alignment |
| Trust and sources | 1 | Who and when on every check; "Sample" lists; firm's own rule shown without a legal claim; no AI on this screen |

**Score 9 / 10, no criterion at 0: pass.** To raise it: skeleton rows plus the team's "There is a problem" Notice (feedback), and one date format (visual).

## Not tested
A real screen reader. An intended user's unaided walk (D17 and D20 stay with the founder). The 410 expired-link path (needs a 10-minute wait or a clock). A real 10 MB+ upload to the server (the client pre-check stops it).

## Round 3 (1efbf26e7, 20 Nov 2026): re-run after the merge of main (#2305, the lead page's Messages panel and Phone edit)
* **Journeys:** I re-ran 1 (record on the lead page) and 5 (expired document) through `j_110.ts` (11/11) and the browser check (28/28 twice) on isolated :4446/:4447.
* **What held:**
  * The server itself now refuses the expired expiry: 422 on `fields.documentExpiry`, shown on the field and in the summary, with nothing stored.
  * The keyboard Save returns focus to Record a check, and focus stays there (probe at +0 to 3000 ms).
  * The merged page shows Person, Identity check, Enquiry and Messages in that order at 375, 1024 and 1440 px, with no sideways scroll and axe clean.
* **Seen, not scored:** in J-110 W5 at 1440 px, W2's "Identity check recorded." toast is still on screen while the refusal shows. This is the scripted walk's speed, and the toast belongs to a different Save.
* **Score: unchanged at 9.5 / 10, no criterion at 0: pass.** Visual quality stays at ½: the file input alignment, round-2 Should (e).
