# CS-D5 part 2 journey test (reviewer role): PR #3500 at cc09ef692c6c282d744aba82803b3e8a7acc70c2

I am the independent reviewer (Opus 5.5) and wrote this on 24 Nov 2026, following skill `journey-test` in the reviewer role. This is the one journey score for this check. I tested on the builder's isolated copy at :4493 (database `xr_studio_csd5_browser`), never :4400. Live AI was off and the cost was US$0. All documents are Sample, on case C-2026-00005, which the builder's test created. The browser was headless Chromium (Playwright): no display was available, so I did not use a visible window. The part 1 (API) journey report is `journey-test-reviewer-2026-11-23.md`.

## Journeys (persona · goal · steps · expected)
1. **Main path.** Case officer (user-O): "check Client A's bank statement without downloading it". Open the case, click the file name on the line, read page 1, go to the next page, zoom to 200 %, rotate, close. Expected: the page is drawn, the header says what the file is, focus goes back to the file name, and one "previewed" line is written.
2. **Keyboard only.** The same officer, with no mouse. Tab from the page start to the file name, press Enter, Tab through the toolbar, press Space on Next, press Escape. Expected: every control can be reached, and focus goes back to the file name.
3. **Alternate (image).** Open a PNG. Expected: the image is drawn with no page controls, and Rotate works.
4. **Error (damaged).** The bytes arrive damaged. Expected: "The file could not be opened…".
5. **Error (file changed after upload).** A stored file changes on disk. Expected: concept S2, "could not open".
6. **Error (scan race).** The link answers 409 or 410. Expected: the requirement's words, and no bytes fetched.
7. **Wrong role.** The configuration author, the reviewer, the client, and another firm's staff open the case or call the link. Expected: no file buttons, and the link refused (403 or 404).
8. **Recovery.** Rapid clicks on Next, Previous, zoom and Rotate; close while the file is still loading, then reopen. Expected: a consistent page, no error, and the reopen works.
9. **Long content and sizes.** A long name with non-English characters, viewed at 375 px, 1024 px, and 1024 px at 200 % zoom. Expected: the name wraps and nothing scrolls sideways.
10. **Across the screen boundary.** After viewing, the officer decides on the file. Expected: Accept beside the preview (BR-8).

## What happened
1. **Held.** The case page loaded in 1.1 s. The first page was drawn 262 ms after the click. The header reads "bank-statement-sample.pdf · Not scanned yet · Passport or travel document for Sample Client A", then "PDF · 7 KB · Uploaded 24 Nov 2026 by Case officer (Sample)". The panel is 864 px wide at 1440 px. The builder's test confirms exactly one "previewed" line after three page turns and a zoom, and the stored SHA-256 unchanged.
2. **Held.** It took 29 Tabs to reach the first file name. Enter opened the panel, with focus on the panel itself. The Tab order was ✕ → Next → Fit width → 100% → 200% → Rotate → page area → Close. Space on Next went to "Page 2 of 3". Escape returned focus to the same file name.
3. **Held** (builder's test): a PNG has no page controls, and a 2 × 1 image turns to 1 × 2.
4. **Held.** The panel said "The file could not be opened. It may be damaged, or it changed since it was uploaded. Ask for it again." No second link was requested.
5. **Failed.** After I appended a byte to my own uploaded file on disk, the panel said **"Checking for viruses… This file is still being checked. Try again in a minute."** with a Try again button. The cause: every 409 is read as the scan state (`document-preview.tsx:36`), but the API's 409 here is its SHA-mismatch answer (`case-documents.ts:426`). No "previewed" line was written. (Review Major 1.)
6. **Held** (injected): "Checking for viruses…" with Try again, then "Removed — infected file"; no request for the bytes. axe found 0 violations in the refused state at 1024 px.
7. **Held.** user-A and user-C see the case list, not the case. user-P and user-S see nothing. The link answered 403 for user-A, user-C and user-P, and 404 "No such document." for user-S.
8. **Held, with one code-level gap.** Rapid clicks ended on page 2 at rotation 90, with a landscape canvas and no error. Closing mid-load and reopening worked. But the abandoned load is never cancelled, so its PDF document is never destroyed (review m2; not visible to the user).
9. **Partly held.** No size had sideways page scroll. At 1024 px with 200 % zoom (512 CSS px), the panel is full width, the Close button is visible, axe found 0 violations, and the page area was 151 px tall, which is usable. At 1024 px the panel is 614 px wide, and 9 pt print at Fit width draws at 8.06 px. That matches concept question 2: zoom is used there. **The header title does not wrap:** at 375 px, "IMG_20261121_bank_statement_SAMPLE_CLIENT_A.pdf" runs under the ✕ and is cut off (dialog scrollWidth 507, clientWidth 374). At 1440 px, a 180-character name overflowed by 730 px. On the checklist line, the same names wrap correctly. (Review Major 4.)
10. **Failed.** There is no decision in the panel, and on main no Accept exists anywhere: CS-D1 part 2's route is not built. The officer can read the file but cannot act on it from here. (Review Major 2.)

## Break pass (15 min)
Double click on the file name: one panel and one link. Non-English name: stored and shown correctly. Wrong role through the API: refused on the server. Another firm's staff: 404 with the download's words. Hostile PDF with `/OpenAction` JavaScript: drawn, its warning shown, the script never ran (builder's test). The built assets hold no `pdf.sandbox` bundle. Reload mid-view: the panel closes, nothing is written. Findings: J5 is a **Major**, J9's long name is a **Major**, and retrying on any failed fetch is a **Minor**: a second "previewed" line on a 403, a 500 or a network error (review m1).

## Score (each 0, ½ or 1)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | ½ | Checking a file works (J1, J2). The decision step is missing (J10). |
| Next step obvious | ½ | After reading, no action is offered (BR-8). |
| Plain words | ½ | Mostly the concept's copy. Wrong words on a SHA mismatch (J5). The tooltip "Virus checks … are not built yet" is builder-speak. |
| Feedback and state | ½ | The skeleton, refusals and scripts warning are good. The changed-file state is wrong (J5). |
| Correct data | 1 | One "previewed" line per opening. SHA unchanged. Single use held (second GET answered 404). |
| Error recovery | ½ | Try again on 409, and clear words for a damaged file. A changed file leads to a Try again that can never work. |
| Accessibility and screen sizes | ½ | Keyboard complete. axe 0 at 1440 px and at 1024 px with 200 %. No sideways page scroll. The long name covers the ✕ at narrow widths. Tooltips do not open on keyboard focus. |
| Speed | 1 | 262 ms to the first page. Page 150 of 200 in 96 ms. |
| Visual quality | 1 | The team's panel and tokens, a calm layout (`screenshots/w1-preview-1440.png`, `w1-preview-1024.png`). |
| Trust and sources | 1 | The scan state is honest ("Not scanned yet", never "clean"). Uploader, date and size are shown. The scripts warning shows. No AI. |
| **Total** | **7 / 10** | **Fail** (the pass mark is 8 with no 0; there is no 0 here). |

**Fixes that would raise the score, most valuable first:**
1. Read only a scan 409 as "Checking for viruses…" and show any other 409 as "could not open". This raises plain words, feedback and state, and error recovery.
2. Get the Lead's ruling on Accept, and then build Accept in the footer with CS-D1 part 2. This raises task completed and next step obvious.
3. Wrap the header title. This raises accessibility and screen sizes.
4. Use the team's `Tip` for tooltips and plain words for the pill. This raises plain words and accessibility.

**Not tested:**
* A visible browser.
* A real screen reader.
* A line holding a set of several current files.
* A real scanner's 409 or 410 (R1.66 is not built).
* An unaided walk by an intended user: D17 and D20 stay with the founder.

## Round 2 (944c7290f): re-walk of the failed and partly-held journeys
Same role, :4495 (db `xr_studio_csd5_rv2`), headless Chromium at DPR 2, US$0. Builder's check 49/49, plus my probe.
* J5 changed file: **held**. "The file could not be opened…", no Try again, and the header keeps the name and facts.
* J8 recovery: **held**. A 0 ms burst (Next, 200%, Next, Rotate, Prev, Fit) ended "ready", page 2, rotation 90. After three openings closed mid-load, 0 workers were left. A 500 on the bytes gives one link and one "previewed" line.
* J9 long name and sizes: **held**. At 375 px the title wraps and does not reach the ✕. A 12 MP photo at 200 % on DPR 2 uses a 33.6 MP canvas (it was 192 MP).
* J10 Accept: still missing, waiting for the Lead (Question 1).
* New: Previous and Next have no tooltip (review R2-1). The breaker's B1 (blank CCITT, JBIG2, JPX and CJK pages) is open with the Lead (Question 2).

| Criterion | R1 | R2 | Why |
|---|---|---|---|
| Task completed | ½ | ½ | The decision step is missing (BR-8). Some scans draw blank (B1). |
| Next step obvious | ½ | ½ | No Accept after reading. |
| Plain words | ½ | 1 | The changed-file words are right; the pill tip is plain. |
| Feedback and state | ½ | ½ | The states are right except B1: a blank page shows as "ready". |
| Correct data | 1 | 1 | One "previewed" line per opening, also on a 500. |
| Error recovery | ½ | 1 | No futile Try again; no retry on a 500. |
| Accessibility and screen sizes | ½ | ½ | Titles wrap, and the tips open on focus. Previous and Next have no tooltip. |
| Speed | 1 | 1 | Page 150 of 200 in 92 ms. |
| Visual quality | 1 | 1 | Unchanged. |
| Trust and sources | 1 | 1 | Unchanged. |
| **Total** | 7 | **8 / 10** | **Pass** (8 or more, no 0). |

**Not tested:** a visible browser, a screen reader, an intended user's unaided walk (D17 and D20 stay with the founder).
