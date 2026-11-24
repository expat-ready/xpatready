# CS-D5 part 2 review (R1.68, the staff preview panel): PR #3500 at cc09ef692c6c282d744aba82803b3e8a7acc70c2

**This review is for part 2 (the screen) on commit cc09ef692, branch `claude/hopeful-meitner-bhlrei`.** It replaces the part 1 (API) review of PR #3188 that was here before; git history keeps that one. I am an independent reviewer (Opus 5.5) who did not build this, writing on 24 Nov 2026. Read against: concept r2.1, `challenge.md` (Lead 4's approval and three decisions), `STANDARDS.md`, `EXPERIENCE.md`, `QUALITY.md`, `PRODUCT.md` §3-§4, and `git diff origin/main...cc09ef692`. The PR head has since moved to ee7af77ec, which only adds `qa/built/R1.68.md` (records, no code).

**Verdict: Ship after fixes.** 4 Majors (Must), 8 Minors (Should). No Blocker. Each fix is small; none needs rework. Journey score **7/10** (fail): see `journey-test-reviewer-2026-11-24.md`.
## What I ran (the builder's isolated copy :4493, db `xr_studio_csd5_browser`; never :4400; live AI off, US$0)
* `tests/check_csd5_preview_browser.ts 4493 xr_studio_csd5_browser`: **37/37** (one run by me; the builder reports two more). I restored the screenshots it rewrites in the repo.
* My own Playwright walk (headless Chromium, script in my scratchpad, not committed): keyboard only with real Tab, rapid clicks, an opening abandoned mid-load, damaged bytes, a long non-English name, a file changed on disk after upload, 1024 px at 200 % (512 CSS px, DPR 2), 1024 and 375 px, and the roles user-A, user-C, user-P and user-S.
* On the copy I uploaded three files to Sample Spouse A's lines and appended a byte to one of them on disk (J6).
* `graph.mjs`: G1 0 · G2 0 · G3 276 · G4 0 · G5 0 · G6 24.
  * The graph only knows `C\d+.\d+` capability ids, so the link from R1.68 to its tests cannot be checked by it.
  * `GET /document-previews/:token` shows `viaBrowser: false` because the panel fetches a URL it builds at run time. The browser test's network log shows it is reached.
## The five declared departures, judged
1. **BR-8 Accept not built.** The cause is confirmed: `case-checklist.ts` on main has no accept route. The recommendation (Accept joins the footer in CS-D1 part 2's PR) is sound. But the departure is recorded only in a code comment (`document-preview.tsx:79`) and in an inverted test (`test:135`). It is not in the PR body (still "Draft: work in progress") or in `challenge.md` "Build discoveries", both of which are empty. **Major 2.**
2. **BR-1 scan state: agreed.** R1.66 is Not built, and Lead 10's ruling on #3188 covers this. The panel never claims "Checked: clean" and shows "Not scanned yet" instead, which is honest. The 409/410 states are drawn and tested by network injection.
3. **Images drawn on the canvas: agreed.** It is safer than the concept's Blob URL: there is no URL to revoke, and it uses the same zoom and rotate path as PDFs. `createImageBitmap` honours EXIF orientation by default.
4. **`isEvalSupported` moot: confirmed.** In pdfjs-dist 6.5.438, `pdf.mjs` and `pdf.worker.mjs` contain no `isEvalSupported`, no `eval(` and no `new Function(`. The build ships only `pdf-*.js` and `pdf.worker.min-*.mjs`, with no sandbox bundle. This belongs in the gate note (Major 3).
5. **Entry from the file name: not a departure.** It is concept S1 word for word: a link-styled button labelled "Preview <name>", one per current file.
## Issues, ranked
**Major 1 (Must): a file changed on disk is shown as "Checking for viruses…".**
* Evidence: `document-preview.tsx:36` maps every 409 from `preview-link` to the checking state. But `link()` reads the bytes first, and a SHA-256 mismatch answers 409 "This document's file changed on disk since it was uploaded" (`case-documents.ts:426`).
* Reproduced in J6: after I appended a byte to a stored file, the panel said "Checking for viruses… This file is still being checked. Try again in a minute." with a Try again button that can never succeed.
* Concept §4 S2 wants "could not open (sha mismatch …)" here. BIC-13 and BIC-18 are broken.
* Fix: use the checking state only when the API says "Checking for viruses…" (or a scan problem code). Any other 409 goes to `BROKEN`. Add a browser check that changes the stored file and expects "The file could not be opened…".
**Major 2 (Must): BR-8, Accept beside the preview (Lead 4's decision 1), is missing, and the departure is unrecorded.**
* Evidence: concept §3 BR-8, §4 footer, §6 BR-8 test. The panel footer holds only Close (`document-preview.tsx:118`), and `test:135` asserts the opposite of the concept.
* Fix: write it in `challenge.md` "Build discoveries" and put the question to the tech lead on the PR. Approve once the Lead's ruling is on the PR: either Accept and its pass/fail test move to CS-D1 part 2's PR, with that debt named on the row or qa line, or this PR waits.
**Major 3 (Must): the technology gate note is missing.**
* Evidence: STANDARDS §1 [M] gate, P-587's six checks, and concept BR-3 ("CVE-2024-4367 … in the gate note"). None of this is in the PR body or the repository.
* The lockfile also brings in pdfjs-dist's optional native `@napi-rs/canvas`, built for 12 platforms (`package-lock.json`). The web build never uses it.
* Fix: put the gate note in the PR body. It needs: problem, options (including whether the team ships a viewer, Unverified here), integration and upkeep, licence (Apache-2.0, checked in `node_modules`), when to reconsider, the six checks, the CVE line (6.5.438 is above the 4.2.67 fix), departure 4, and the native optional dependency.
**Major 4 (Must): long file names do not wrap in the panel header.**
* Evidence: concept S2 "long names wrap" and EXPERIENCE §4 [M] "long content (long names)".
* At 375 px, `IMG_20261121_bank_statement_SAMPLE_CLIENT_A.pdf` runs under the close ✕ and is cut off: the dialog's scrollWidth is 507 against a clientWidth of 374.
* At 1440 px, a 180-character name overflows by 730 px.
* Cause: the title is passed into `Panel` (`document-preview.tsx:115`), whose `<DialogPrimitive.Title>` has no overflow-wrap (`controls.tsx` header).
* Fix: add `[overflow-wrap:anywhere]` (and `min-w-0`) to the panel title, and a W1 check with a long name at 375 and 1024 px.
**Minors (Should)**
* m1. The viewer asks for a second link after any failed fetch (`document-preview.tsx:42`): a 403, a 500 or a network error, not only "expired/used". Each retry writes a second "previewed" line, but BR-7 allows a retry only on expiry. Fix: retry only on 404; anything else goes to `BROKEN`.
* m2. An opening closed while it loads is never cancelled (`:85-88`). The parsed PDF and its worker are never destroyed because `doc` never reaches state. Fix: a cancelled flag in the effect, and close the result if it arrives after unmount.
* m3. Tooltips use `title=` (scan pill, Previous, Next, zoom, Rotate: `:116-132`). They do not open on keyboard focus, and the pill cannot take focus at all, so BIC-14 is only Partly met. The team's `Tip` (`components/status.tsx:15`) does both.
* m4. The pill tooltip "Virus checks on case files are not built yet…" is builder-speak (EXPERIENCE §5). Suggested: "This file has not been scanned for viruses. It is shown only as pictures of its pages."
* m5. The BR-3 DW6 check (`test:143`) cannot fail if the rule is removed. PDF.js never runs `/OpenAction` JavaScript in the page, even with scripting on. Add a check that can fail: no `pdf.sandbox` request and no annotation layer in the panel.
* m6. The W1 keyboard step moves focus with `.focus()` (`test:193-194, 200`) instead of Tab. My real Tab walk passed (below), so the test should Tab too, to keep proving it.
* m7. Retrofit mapping is not recorded (skill check 6): there is no `build-notes.md` for `Panel wide` or for the viewer against the team's own. It can go with the gate note.
* m8. BIC-19: the panel uses five type sizes: 18 (title), 14 (toolbar), 13 (facts, `:123`), 12 (description) and 11 (pill). Making the facts line `text-xs` drops one.
## Code (check 5)
* Server authorisation is part 1's: a client, the author and the reviewer get 403, and another firm gets 404 "No such document." (J9).
* View only: the stored SHA-256 is unchanged after viewing, and one opening writes exactly one "previewed" line (test and my J0-J2 walk).
* No per-row requests: one link and one fetch per opening; page turns read from memory.
* Rapid Next/Prev/zoom/rotate clicks (J2) ended consistent: page 2, rotation 90, a landscape canvas, no error.
* No migration and no duplicate risk (no writes). `Panel wide` leaves every other panel as it was (one class switch).
## D1-D20 (1-5)
* D1 Requirement fit **3**: BR-2 to BR-7 hold; BR-8 is missing; the SHA-mismatch state is wrong.
* D2 Data integrity **4**: view only, one audit line per opening; an extra line on retries that are not 404 (m1).
* D3 Reuse **4**: the team's Panel, Notice, Pill, Skeleton and Button; tooltips do not use `Tip`.
* D4 N/A.
* D5 Stability **4**: rapid clicks and reopening hold; leak on an abandoned opening (m2).
* D6 Governance **4**: a "previewed" line names person, case and document.
* D7 N/A (no AI).
* D8 Orientation **4**: the header names the file, the document type and the person; the case stays behind the panel.
* D9 Flow **3**: no decision after viewing (Major 2).
* D10 Language **3**: wrong words on a SHA mismatch; builder-speak tooltip.
* D11 Feedback **3**: the skeleton and the refusal states are good; the SHA state is wrong.
* D12 Visual **4**: clean team panel (`screenshots/w1-preview-1440.png`); the long name overflows.
* D13 Accessibility **4**: axe 0 at 1440 px, at 1024 px with 200 % and in the refused state; keyboard complete; the long name covers the ✕ at narrow widths.
* D14 Team look **4**: the team kit throughout.
* D15 Speed **5**: first page drawn 262 ms after the click; page 150 of 200 in 96 ms.
* D16 Testability **4**: 37/37; DW6 cannot fail (m5); the SHA state is untested.
* D17 and D20: simulated only.
* D18 Provenance **4**: uploader, date and size shown; the scan state is honest.
* D19 Closure **3**: the officer cannot get from checking a file to accepting it (BR-8).
## BIC scorecard (EXPERIENCE §6)
| Check | Score | Evidence |
|---|---|---|
| BIC-01 to 10, 12, 15 to 17 | N/A | No facts, questions, AI, roles, tasks, filing or review here (concept §4c). BIC-08 is N/A: one file. |
| BIC-11 one primary action | Partly | No primary at all; the next step the status calls for (Accept) is missing (Major 2). |
| BIC-13 errors say what and how to fix | Partly | Damaged file: correct words (J4). SHA mismatch: told to wait for a virus check (J6, Major 1). |
| BIC-14 tooltips | Partly | `title` only: not shown on keyboard focus, and the pill cannot take focus (m3). |
| BIC-18 states drawn | Partly | Loading skeleton, 409, 410, scripts, PNG and could-not-open all drawn. The long-name state fails (Major 4) and the SHA state is wrong. |
| BIC-19 low cognitive load | Partly | One heading, no second primary, only the page area scrolls (`w1-preview-1024.png`). Five type sizes (m8). |
| BIC-20 accessible, keyboard complete | Partly | Tab order ✕ → Next → Fit width → 100% → 200% → Rotate → page area → Close. Escape returns focus to the file name. PageDown scrolls, then turns the page. At 1024 px with 200 % there is no sideways scroll. A long name overlaps the ✕ at narrow widths. |
## What I could not check
* A visible, headed browser: there is no display here, so the walk was headless.
* A real screen reader.
* A line holding a set of several current files: there was no set fixture on this case. The code renders one button per file.
* A real 409/410 from a scanner (R1.66 is not built).
* An unaided walk by an intended user: D17 and D20 stay with the founder.

**Verdict: Block** (the skill's "Ship after fixes"). Fix list: Major 1 (409 mapping and its test) · Major 2 (record BR-8 and get the Lead's ruling on the PR) · Major 3 (gate note) · Major 4 (wrap the header title, with a check). Minors m1 to m8: fix them, or list them with a follow-up.

Reviewer: Changes cc09ef692c6c282d744aba82803b3e8a7acc70c2

## Round 2 (944c7290f, diff only)
Reviewer, 24 Nov 2026, P-277. Read: `git diff cc09ef692..944c7290f -- prototype/studio`, `challenge.md` › Build discoveries, the PR body. Ran on :4495 (db `xr_studio_csd5_rv2`): `check_csd5_preview_browser.ts` **49/49** (screenshots restored), plus my own probe (scratchpad, not committed) at DPR 2 and 375 px. Journey score **8/10** (pass): `journey-test-reviewer-2026-11-24.md` › Round 2.

**Round-1 findings**
* M1 **fixed**. Only a 409 whose words are "Checking for viruses…" gets the scan state (`document-preview.tsx:42-43`). The new check edits the stored file and expects "could not be opened" with no Try again. It fails if the fix is reverted.
* M2 **recorded and asked** (Build discoveries 1, PR Question 1). The ruling is the Lead's. The BR-8 inversion (`test`: no Accept) stays until then.
* M3 **fixed**. The gate note is in the PR body: options, licence, upkeep, CVE-2024-4367, `isEvalSupported`, `@napi-rs/canvas`, P-587. Check (4) is Unconfirmed and (6) Scorecard is not checked; both are left openly to the Lead on the Mac. I accept that.
* M4 **fixed**. The `Panel` title has `min-w-0 [overflow-wrap:anywhere]`, so every panel gets it. At 375 px a 160-character name wraps to 168 px tall and ends 16 px before the ✕ (no overlap); dialog scrollWidth = clientWidth.
* Breaker M1 **fixed**. `density()` caps the canvas at 2^25 px and 16384 px a side. A 4000 x 3000 PNG at 200 % on DPR 2 now uses 6689 x 5017 (33.6 MP; before the fix, 192 MP).
* m1 (retry only on 404) **fixed**: a 500 gives 1 link, 1 "previewed" line and "could not be opened". m2 (abandoned load) **fixed**: 0 workers after three openings closed mid-load. m3 **fixed** for the pill, zoom and Rotate (the pill's tip opens on keyboard focus), but see R2-1. m4 (words) **fixed**. Breaker m1 (one draw at a time) **fixed**: the dblclick check passes, and a 0 ms burst of six controls ended "ready", page 2, rotation 90. Breaker m4 (facts kept on error) **fixed**.
* m5 (the DW6 check cannot fail), m7 (retrofit mapping: only partly covered by the gate note) and m8 (five type sizes; `:145` is still `text-[13px]`) are **not addressed**. Fix them, or name them on a follow-up row (Should).

**New in this diff**
* **R2-1 (Must, regression):** Previous and Next are icon-only and lost their tooltip. `title=` was removed and no `Tip` was added (`:150`, `:152`). Hovering Next shows no tooltip. This breaks EXPERIENCE §4 item 10 [M] and BIC-14 ("every … icon-only button"), so it is a Must under §6 severity. Fix: wrap both in `Tip` like Rotate, wrapping the button in a span so the tip still shows when it is disabled.
* Should: rounding lets the canvas go just over the cap: 33,558,713 px against 2^25 = 33,554,432 at DPR 2 (`Math.round` at `:29` and its callers). Use `Math.floor`. There is no practical risk.
* Should: the comment `"100%" as Mozilla's viewer means it…` moved from `CSS_PER_PT` (`:26`) to the end of the `density` line (`:29`). Move it back.
* Note for R1.66, not a finding now: the scan 409 is recognised by its exact detail words. When the scan gate lands, recognise it by its problem code.

**Breaker B1 (Question 2).** I agree with the fix: build-time copy of `pdfjs-dist`'s `wasm/`, `cmaps/`, `standard_fonts/` and `iccs/` into our own origin, leaving out `quickjs-eval.*`, then pass `wasmUrl`, `cMapUrl` with `cMapPacked: true`, `standardFontDataUrl` and `iccUrl`. Add a fail check that a CCITT page has dark pixels. BR-3 ("our own origin") still holds, and the app sends no CSP that would block the wasm. Check that the `.wasm` files are served as `application/wasm`. Without that fix, I would approve this PR only on the Lead's explicit ruling on Question 2 (ship now, with a BACKLOG X-row naming the blank-scan risk, and R1.68 not marked Complete until it lands). That is the Lead's call, not mine. It is the same as M2: both are open with the Lead, not with the builder.

**Verdict: Block** (the skill's "Ship after fixes"). Fix list: R2-1 (tooltips on Previous and Next). After that, Approve on the next head, provided the Lead has ruled on Question 1 (BR-8) and Question 2 (B1) on the PR.

Reviewer: Changes 944c7290f9e5502f9472581cb9a46e7c5a341e40

## Round 3 (dda380e1f, diff only)
Reviewer, 24 Nov 2026. Read: `git diff 944c7290f..dda380e1f -- prototype/studio` (3 files, +55/−9), plus the Lead's rulings 1 and 2 on the PR. Ran on :4497 (db `xr_studio_csd5_rv3`): `check_csd5_preview_browser.ts` **53/53** (screenshot restored), plus my own probe (scratchpad, not committed). Journey score **9/10** (pass): `journey-test-reviewer-2026-11-24.md` › Round 3.

* R2-1 **fixed**. Previous and Next sit in `Tip` around a span (`document-preview.tsx:152,154`). Next shows its tip on hover and on keyboard focus. The disabled Previous shows its tip on hover. There is a new hover check.
* B1 **fixed**, within the founder's allowance. `vite.config.ts` copies `cmaps/`, `standard_fonts/`, `iccs/` and five files from `wasm/` into `dist/pdfjs/`, and never `quickjs-eval.*`. `getDocument` gets `wasmUrl`, `cMapUrl` with `cMapPacked`, `standardFontDataUrl` and `iccUrl`. The `.wasm` files are served as `application/wasm`. `quickjs-eval.wasm` returns only the app page (text/html), and the check tells the two apart by the wasm magic bytes. The check can fail: with `/pdfjs/**` answered 404, the CCITT page draws 0 dark pixels (87,896 when served).
* The round-2 Shoulds are **fixed**: `Math.floor` (a 33,549,430 px canvas, under 2^25) and the comment back on `CSS_PER_PT`.
* BR-8 (Lead ruling 1) and the size count (ruling 3) are settled on the PR. R1.68 must not claim BR-8.

**Should (not blocking):**
* If the decoder files fail to load, the page is drawn blank and the state still says "ready". PDF.js only logs "Unable to decode image". Showing "could not be drawn" would make this honest.
* The wasm binaries go out without their licence files (`wasm/LICENSE_JBIG2`, `LICENSE_OPENJPEG` and `LICENSE_QCMS` are BSD/MIT, and need the notice when redistributed). Copy them into `dist/pdfjs/wasm/` as well.
* The Vite dev server (:4401) does not serve `/pdfjs/` (`apply: "build"`), so scans draw blank in dev mode only. Note it in the comment.
* m5, m7 and m8 from round 2 are still open. Fix them, or name them on a follow-up row.

**Verdict: Approve** (no open Blocker or Major).

Reviewer: Approve dda380e1fa0cda409657ed495da3401b9feb81ad

## Round 4 (f2ce7adfc, diff only: batch #3518 fixes)
Reviewer, 24 Nov 2026. Read: `git diff dda380e1f..f2ce7adfc -- prototype/studio` (3 files, +17/−12; `tests/` untouched). Ran: `check_pfle_libraries.ts` **20/20**, which builds into a temporary folder and left `web/dist` untouched. `check_csd5_preview_browser.ts 4499 xr_studio_csd5_rv4` **53/53**. `check_csd5_flags_browser.ts` on my own copy (:4500, `csd5_rv4f`, now stopped) **40/40**. Also my own probe (scratchpad, not committed) and `tsc --noEmit` (clean). Journey score **9/10** (pass): `journey-test-reviewer-2026-11-24.md` › Round 4.

* **Worker change: sound.** `?worker` builds `pdf.worker.mjs` as a classic IIFE worker, Vite's default format (`assets/pdf.worker-*.js`, with its own map in a `--sourcemap` build). The worker starts itself from its static block: no window, `self.postMessage`, `onmessage` in self, then `initializeFromPort(self)`. The bundle keeps that block. `PDFWorker.create({ port })` uses the port, and `GlobalWorkerOptions.workerSrc` is no longer needed. Its only other reader, the fake-worker path, is not taken. The renderer worker stays off because `rendererSrc` is unset, as before. Nothing leaks. A worker that is passed in is not freed by `loading.destroy()`, and `PDFWorker.destroy()` does not terminate a port it did not create. So the explicit `worker.destroy()` + `port.terminate()` are the right fix, and they also run on a failed load. A stale load is closed by its caller (`:110`). Probe: 3 opens, 3 workers started, 3 ended. The worker is same-origin (`new Worker("/assets/…")`). The staff app sends no CSP, so there is no origin or CSP issue. The 1.2 MB worker loads only when a PDF is opened. B1 still holds: 87,896 dark px, decoders from `/pdfjs/`, quickjs not served.
* **outDir and fallbacks: right.** The data files now follow `--outDir`. The old hard-coded `web/dist` meant the check's temporary build shipped no `/pdfjs/`, and every check build wrote into the served `dist`. Dropping the two `*_nowasm_fallback.js` files is a real change, not a way to dodge the check. They are used only when WebAssembly fails to instantiate. With no CSP and wasm in every target browser, that does not happen here. If it ever did, the image would fail to decode, the same as the round-3 Should "blank page still says ready", which is still open.
* **Target size: holds, no layout harm.** "Source" is 24 px tall and the file-name button is at least 24 px. At 375 px with the 190-character name there is no sideways scroll. The name wraps inside its button (`max-w-full`, `overflow-wrap:anywhere`), and the flags dialog passes at 375/1024/1440. Side effect: as an inline-flex box, a name too long for the rest of the "File:" line now starts on its own line. Short names stay on the line. It reads fine.
* **No check weakened.** `tests/` is unchanged in this range. The source-map assertion and the axe target-size rule still run as before.

**Should (not blocking):** in `free()`, if `loading.destroy()` ever rejects, `void free()` leaves an unhandled rejection. On the failed-load path that error would also replace the original one. `.catch(() => {})` before `.finally`, or a `try/finally` that rethrows `e`, would close this. The round-3 Shoulds are still open: decoder failure shown as "ready", the wasm licence files, the dev-server note, m5/m7/m8.

**Verdict: Approve** (no open Blocker or Major).

Reviewer: Approve f2ce7adfc28005eaeb026a54aa96e58ddef0947f
