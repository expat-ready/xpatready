# QA-520 review: fee receipt and signed scan refuse a damaged file (R1.67)

Reviewer: a fresh Opus reviewer that did not build this. Commit reviewed: `29c0b58bf8f0bbb0c3aa9be4efc24c5830368399` (`git diff origin/main...29c0b58bf`, 14 files). Brief: Build Lead C, `f05e14725:…/build-lead-c-briefs/QA-520.md`. Copy used: the builder's isolated copy :4481 / `xr_studio_rt_qa520`. Its server started 19:31 UTC from this tree. No `api/src` or `web/src` file changed after 262b45907 (19:30), so it runs the reviewed code. No live AI, US$0.

**Verdict: Block** (Ship after fixes). There is 1 Major, listed below. Journey score: **9/10** (`journey-test-reviewer-2026-11-19.md`).

## What I ran
* `tests/qa/check_qa520_fee_receipt_damaged_pdf.ts`: 16/16, exit 0. The 3 damaged cases at both doors are refused 400 in PF-F4's words: no row, no file, no audit line. A whole PDF, JPEG and PNG are still stored at both doors, with the type taken from the bytes. On main the fail cases return 201: the old door used `mediaOf`, which accepts a header-only file. So the test fails when the rule is removed.
* `tests/check_c82_record_api.ts`: 71/71. `acceptance/C8.1.test.ts`: 14/14.
* Probes with curl against :4481, plus a Playwright walk of the Submission panel (1440 and 1024 px, axe on `[data-submission]`). Results below.

## Correctness of the two doors
* **Order of checks.** Fee receipt: actor/role, then filing recorded, then one file in "file", then empty, then 20 MB, then `checkedCaseFile`, then the write. Signed scan: one file, then empty, then 20 MB, then `checkedCaseFile`, then the step refusal (409), then the write. This is the old `mediaOf` position. The routes keep their multipart limit of 20 MB + 1 and `files: 1`. Met.
* **Nothing written on a refusal.** The check runs before `mkdirSync`/`writeFileSync`. The existing `rmSync` on a failed insert is kept. Met, and qa520 proves it: rows, files on disk and audit lines are unchanged.
* **Stored extension and type.** They come from `checked.extension` / `checked.mediaType`. A PNG named `.pdf` was stored as `png-as.png`, `image/png`. Met.
* **The "unchecked" path (503).** `checkedCaseFile` refuses with 503 "could not be checked just now". At the signed scan this reaches the UI under the block, not on the field, which is right because it is not the file's fault. At the fee receipt see Minor 1.
* **PDF reader concurrency.** Both doors now share `pdfOpens`' module-wide pool (2 reading, 8 waiting, then "unchecked" 503). It is bounded, nothing is ever stored unchecked, and the case lock is taken only after the check. Met. Optional: Minor 3.
* **Header-only PDFs elsewhere on main.** I grepped for callers of both doors in `tests/`, `acceptance/`, `tools/`, `api/src` and `web/src`. `finished-story.ts:75` `specimen` already builds a PDF that opens (since CS-D1t). `signByHand` (used by C7.6, C7.10, C9.2, C9.5, check_c92_*) goes through `signedScan`, which this PR fixes. No other header-only sender remains. The `.cjs` walks do not upload to these doors.
* **C7.8 claim.** Only C7.8-8 uploads to a changed door, and the builder reports it passing. The 6 FAILs are C7.8-6 ("none in the library"), -14, -16, -18 and similar. They depend on which forms the library offers and do not touch the changed paths, so "environmental" is plausible. I did not re-run C7.8.

## Deviations, judged
1. **Fee receipt rethrows through `refuse("file", …)`.** Keeping `errors[{field:"file"}]` is right. But it causes Major 1: `refuse` builds an object response with no `message`, so `main.ts`'s 413 filter no longer recognises PF-F4's words.
2. **415 for a wrong type, test changes, and 415 added in `sign-steps.tsx`.** Justified. The brief says "with its status", and PF-F4's NOT_ALLOWED_TYPE is 415. Without the `sign-steps.tsx` change the type refusal would leave the upload field (a BIC-13 regression). `add-form.tsx` shows every refusal as a toast, as before.
3. **`textPdf` beyond the one line.** Justified and necessary. `signedScan` is shared, so a header-only scan would have broken every `signByHand` suite.
4. **`checked.name` and audit `flagWords`.** Justified: this matches `case-documents.ts`. The audit line still carries no file name (AG-7-95).
5. **qa520 copied and widened.** Fine. It now exits non-zero on a FAIL. The card fragment `CS-D1b.md` names it.

## Issues
**Major**
1. **The fee receipt reports a too-many-pixels image as "larger than 20 MB".** I sent a 200-byte PNG whose header declares 20000×20000 px, which PF-F4 refuses as TOO_MANY_PIXELS with status 413. The door answered 413 with "The file is larger than 20 MB: save the Transaction Approved page as a smaller PDF, JPEG or PNG. Nothing was stored." The UI shows the same words on the field (walk screenshot `pixel-bomb-1024`). This is false, and it breaks the brief's "a refusal is in PF-F4's words" and BIC-13. It is realistic: a 108–200 MP phone photo of the receipt can be under 20 MB.
   * Cause: `submission.ts:243` puts PF-F4's words in `refuse`'s object. The 413 filter at `main.ts:~193` tests `e.message`, which for that object is "Http Exception", so the fee-receipt branch rewrites the words. The signed scan uses `fail(msg)`, keeps its words and is not affected.
   * Fix: one line. Either add `message: detail` to `refuse`'s body, or have the filter test `body?.detail ?? e.message`. Add a too-many-pixels case at the fee-receipt door to qa520.

**Minor**
1. **The fee receipt's 503 is labelled a validation problem.** Through `refuse`, the "could not be checked just now" refusal carries `type …/validation`, the title "Some details need fixing" and `errors[file]`, but it is not the person's input. `refuse` already makes an exception for 409, and 503 should get one too.
2. **No test at these doors for the 503 path or for TOO_MANY_PIXELS.** This is why Major 1 was not caught. `check_csd1t_file_type` covers `checkedCaseFile` itself.
3. **Optional: the signed scan reads the PDF before the cheap step check.** A scan that will be refused 409 still takes one of the 2 reader slots. The order is the old one; it could be reordered, and nothing is written either way.

## D1–D20 (the parts this fix touches)
D1 4/5: R1.67 met at both doors, except the words for one refusal (Major 1) · D2 5: nothing stored on a refusal, proven · D5 5: a failed insert removes the file; 503 rather than storing unchecked · D10 4: PF-F4's plain words, except Major 1 · D11 5: the refusal is a `role=alert` on the field and takes focus · D13 5: axe finds 0 in `[data-submission]` and there is no sideways scroll at 1024 px · D15 5: a refusal takes 0.12–0.14 s · D16 4: the rule's test fails without the fix; 503 and pixel limits untested · D3/D4/D6–D9/D12/D14/D18/D19: no change · D17/D20: simulated only.

## BIC (EXPERIENCE §6)
BIC-13 **Partly**: on the field, with what and how to fix, except the pixel case (Major 1). BIC-16 Met: the signed scan and fee receipt are still recorded events, with audit lines. BIC-20 Met for the upload field: focus goes to the error, axe is clean. BIC-01–12, 14, 15 and 17–19 are N/A: this is a server-side file check with no layout change.

## Could not check
* Keyboard-only and 200 % zoom by hand: the builder's browser suites assert focus, and I did not repeat them.
* `graph.mjs`: it rewrites `qa/GRAPH.md`, which is outside my write scope.
* C7.8 and full CI.
* A real screen reader.

## Re-review: `fdfe32ffd`, diff only (P-277)
Diff reviewed: `git diff 29c0b58bf fdfe32ffd -- …/prototype/studio`. It changes `api/src/submission.ts` (+8/−1) and qa520 (+12). The `bomb.png` fixture is already on main (69 bytes). Copy used: :4481, restarted at 20:01. Its live answers match the new code, and `git diff fdfe32ffd -- api/src` is empty.
* **Major 1: fixed.** The fee receipt now throws the file check's refusal through `fileRefused`, whose body carries `message: detail`. `main.ts`'s 413 filter therefore sees PF-F4's words (`fromFileCheck`) and leaves them alone. My 200-byte, 20000×20000 PNG now gets 413 "This image is too large to open safely (400 megapixels; the limit is 89.5). Allowed here: PDF, JPEG and PNG. Nothing was stored.", with `errors[{field:"file"}]`. The header-only PDF still gets 400 in PF-F4's words.
* **Minor 1: fixed.** A 503 now has `type …/unavailable`, the title "Try again" and no field errors. Both screens (`submission.tsx` field and notice) show the message itself, so nothing on screen depends on `errors`.
* **Minor 2: partly fixed, accepted.** qa520 adds a too-many-pixels case at both doors: 413, PF-F4's words, not "larger than", nothing stored, and `errors[file]` at the fee receipt. The new case fails on 29c0b58bf because the old words were "larger than 20 MB". The 503 path stays untested at these two doors. It is the shared `checkedCaseFile`, already covered by check_csd1t, so this is acceptable.
* **Minor 3: left as is, accepted.** The order is unchanged from main, and nothing is written either way.
* My run: qa520 **18/18**, exit 0. The builder reports check_c82_record_api 71/71 and C8.2 19/19, which I did not re-run.

No open Blocker or Major. Journey criteria "plain words" and "error recovery" rise to 1, so the journey score is now **10/10**.

**Verdict: Approve** `fdfe32ffdd55e9f5e8eec5ed5c1ef4edd6d233be`.
