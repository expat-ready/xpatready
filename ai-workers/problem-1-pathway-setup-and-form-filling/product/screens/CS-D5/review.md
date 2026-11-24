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
