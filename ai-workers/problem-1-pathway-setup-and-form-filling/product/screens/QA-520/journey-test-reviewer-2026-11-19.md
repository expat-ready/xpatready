# QA-520 journey test (reviewer, 19 Nov)

Commit `29c0b58bf`. Copy: :4481 / `xr_studio_rt_qa520` (the builder's isolated copy, running the reviewed code). Sample data, US$0, no AI. Walked headless with Playwright from the Submission panel. Screenshots were taken at 1440 and 1024 px (in the reviewer's scratchpad; not committed).

## Journeys
1. **Main path.** The case officer, on a recorded filing, uploads a good Transaction Approved page (PDF, JPEG, PNG). Each is stored: one row, one file and one audit line each. The name and type come from the bytes. Covered by qa520's pass cases at both doors. Held.
2. **Error: a header-only "PDF" as the fee receipt.** "Not stored: This file could not be read: it may be damaged. Allowed here: PDF, JPEG and PNG. Nothing was stored." appears on the filing's field as `role=alert`, with focus on it. axe finds 0 issues, and there is no sideways scroll at 1024 px. Nothing was stored. Held.
3. **Error: a PNG cut after its signature.** "This image could not be read: it may be damaged. …" on the field. Nothing was stored. Held.
4. **Error: a cut or header-only PDF as the signed scan.** Refused 400 in PF-F4's words, with nothing stored. Covered by qa520 at the API. In the browser, check_c81_sign_browser (the builder's run) shows the type refusal on the upload. Held.
5. **Error: a wrong type (an `MZ` file named .pdf).** Refused 415 with "This type of file is not accepted. Allowed here: PDF, JPEG and PNG. Nothing was stored." on the field "file". Held.
6. **Wrong role.** A client uploading either door gets 403 (C8.1-9, C8.2-18 pass). Held.
7. **Break it: an image that declares too many pixels.** A 200-byte PNG claiming 20000×20000 px at the fee receipt was told "The file is larger than 20 MB: save the Transaction Approved page as a smaller PDF, JPEG or PNG." This is false: PF-F4 refused it for its pixels. **Major** (see review.md, Major 1).
8. **Recovery.** After a refusal, uploading a good file stores it, and the earlier uploads stay listed ("3 earlier uploads kept"). Held.

## Data underneath
* The fee-receipt and signed-scan rows, the files under `var/…/cases/<id>/{fee-receipts,signed-scans}` and the audit lines are unchanged across each refusal. Each pass adds exactly one of each.
* A PNG named `.pdf` was stored as `png-as.png`, `image/png`.

## Score
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | Damaged files are refused and good ones stored at both doors (qa520 16/16) |
| Next step obvious | 1 | The words name the allowed types; "may be damaged" says to send another copy |
| Plain words | ½ | PF-F4's words, except the false "larger than 20 MB" (journey 7) |
| Feedback and state | 1 | Alert on the field, focus moved, and the toast only on success |
| Correct data | 1 | No row, file or audit line on a refusal; the type and name come from the bytes |
| Error recovery | ½ | Journey 7's advice ("a smaller file") does not name the real cause |
| Accessibility and screen sizes | 1 | axe finds 0 in `[data-submission]`; no sideways scroll at 1024 px |
| Speed | 1 | A refusal takes 0.12–0.14 s |
| Visual quality | 1 | Unchanged layout; the error sits under its button |
| Trust and sources | 1 | No AI; the specimens are labelled Sample |

**9/10, pass** (no 0). The fix that would raise both ½ scores is Major 1 in review.md.

## Not tested
* A real screen reader.
* A keyboard-only walk and 200 % zoom by hand.
* An intended user walking it unaided (D17/D20 stay with the founder).
