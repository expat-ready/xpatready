# CS-D1t review: the case upload doors use PF-F4's file-type check (R1.67), with J-67

**Verdict: Approve.** No Blocker, no Major. Commit reviewed: `14dcae83da06322bae73173a5ef5dbb437966c66` on `claude/ecstatic-hamilton-p44gi3`, compared with `origin/main`. Reviewer: an independent Opus session that did not build it. Bar: the brief `build-lead-c-briefs/CS-D1t.md` (on `origin/claude/build-lead-c-647b40`), STANDARDS, EXPERIENCE §6. **Journey score: 8.5 / 10, pass** (`journey-test-reviewer-2026-11-19.md`).

This is a backend item with no `concept.md`. The screen-review checks apply only where the Documents panel shows what the doors answer.

## Findings, worst first (all Minor)
1. **Minor: the in-code 20 MB check can never run; the test credits it but tests multer.** At `api/src/case-checklist.ts:62` the check sits behind the multipart limit (`MAX_DOCUMENT_BYTES + 1`, lines 358 and `case-documents.ts:713`). Multer already refuses a file of 20 MB + 1 byte. Mutation M4 removed line 62 and every suite stayed green: `check_csd1t_file_type.ts:81` still got its 413, from multer. The extra check does no harm. Fix: keep it as a backstop but say so in its comment, or drop it. Either way, the test line should say it pins the multipart limit.
2. **Minor: on the door with no line, an upload over 20 MB gets vague words.** That door answers "This file is too large for this upload." (`main.ts:204`): no limit, and no "Nothing was stored.", which the brief requires of every refusal. Input: POST `/api/runtime/cases/:id/documents` with a 21 MB PDF gives 413 with those words (walk step A1). The gap was there before this PR, and no screen calls this door yet. Fix: add `/cases/[^/]+/documents` to the checklist-line path test at `main.ts:196`, which gives the same 20 MB words.
3. **Minor: PF-F4's own words, now shown to people through these doors, read oddly** (`platform/files/file-type.ts:53,165`; outside this PR's touch list). A JPEG of 10 MB + 1 byte is refused as "This file is 10 MB; the limit for images is 10 MB." A pixel bomb gets "(400 megapixels; the limit is 89.5)", with no unit after 89.5. Fix: a follow-up on PF-F4 (round up, add the unit). It is not this PR's file.
4. **Minor (declared, needs the Lead): the "contains scripts" flag is only in the audit line's words** (`case-checklist.ts:305`, `case-documents.ts:306`). The brief wants it on the document so the screen can show it, and says "ask first" if there is nowhere to put it. The builder did not change the schema, so the rule held. But the builder declared the gap instead of asking, so it still needs the Lead's decision (a schema row for CS-D1).
5. **Minor (declared): a truncated PDF is still stored**, so the brief's W line "truncated PDF refused as damaged" is walked with a damaged PNG instead. I checked this by reading: no case door calls a PDF structure check today. The only damaged-PDF check is the form library's (`api/src/upload-run.ts:116-123`). Doing it here would be new scope, so it belongs with CS-D1.
6. **Minor: J-67 crashes when a W line fails, instead of recording a FAIL** (`tests/journeys/j_67.ts:132`, `waitFor` with 60 s and nothing to catch it). With a mutant it exits 1 with a TimeoutError and no summary, and lines W3 to W7 never run. It is still red, just less clear.
7. **Minor: the DW1 "code" line matches the source text** (`j_67.ts:90`). It breaks if the code is reformatted, if `f[0]` is renamed, or if any comment mentions `mediaOf`. The DW1 door judges and DW2 already show real behaviour, so this line adds brittleness and no protection. Fix: drop it, or narrow it to the import.
8. **Minor: the brief asks for axe "1024 and 1440 px", but J-67 runs axe only at 1440.** At 1024 it checks only for sideways overflow (`j_67.ts:174-176`). My own walk ran axe on the panel at 1024 and 400 px with a refusal shown: 0 violations.
9. **Minor: the graph tool still lists both doors under G3, "route no test reaches".** The cause: the new suites build the path through a helper (`/api/runtime/${path}`), which `graph.mjs` does not resolve. The tests do reach both routes (run below). Optional: one literal path in each suite.
10. **Minor (declared, accepted): two pinned tests were edited, though the brief lists them as unchanged.** The PNG fixture in `check_c64_storage_api.ts` is now a real PNG header: a bare signature is DAMAGED under PF-F4 by design. The regex in `C6.4-screen.test.ts:88` now accepts "and" as well as "or". Both keep what the tests are for. The brief contradicted itself here ("replace the size check" against "check_c64 unchanged", which pins "20 MB"). Keeping the doors at 20 MB (departure 2) is the sound reading. Departure 1 (`main.ts`) is needed: without it, a 12 MB JPEG on a line was reworded to "larger than 20 MB" (mutation M3). The fix is narrow: a 413 whose words end in PF-F4's "Allowed here: … Nothing was stored." passes through untouched. Only these two doors produce such words, so no other route's answer changes. Matching on a code instead of the words would be sturdier, but it is not required.
11. **Minor: `mediaOf`, `MEDIA` and `cleanName` stay** (used by `sign-steps.ts`, `submission.ts`, `web/src/runtime/submission.tsx`). That is correct, but the built note does not say so, and the brief asks for it. I could not check the PR body: there is no PR for this branch yet.

## Checked and holding (code: correctness, safety, callers)
* **Nothing is written before a refusal.** In both doors the check runs (`case-checklist.ts:279`, `case-documents.ts:292`) before any mkdir, write, row or audit line. Only reads come earlier. Shown for 8 reasons × 2 doors in `check_csd1t`, and in DW2 and W2–W5. A database failure still removes the file (as before).
* **No non-PDF/JPEG/PNG bytes get stored.** Detection uses the bytes' signature, against `CASE_FILE_KINDS` (pdf, jpeg, png), and SQL's media check also holds. Nothing refused before is now accepted: the new rules are stricter than `mediaOf`. Newly refused: unreadable PNG or JPEG headers, images over 10 MB, and over 89.5 MP (all from PF-F4, all intended). The only caller hit was c64's 12-byte PNG (fixed). Every other caller in `tests/`, `acceptance/` and `web/src` sends PDFs.
* **`mimetype` from multer is safe.** `checkFile` uses it only to set `corrected`, which the doors ignore. It is never stored and never decides the type.
* **Stored names** (probed with `checkFile` directly):
  * "passport" becomes "passport.pdf", ".pdf" becomes "document.pdf", " " becomes "document.pdf", and "letter.txt.pdf" becomes "letter.pdf".
  * Non-Latin names keep their own script ("护照 扫描.PDF", "جواز.pdf").
  * Long names keep their extension (190 characters + extension). The old 200-character cut dropped it.
  * Direction and control characters are removed. `file_name` is TEXT, with no length limit.
  * The only caller that pins a name is c64 line 107; it passes.
* Type check (`tools/typecheck.mjs`): no new errors.

## Scorecard
D1 4 (every "What to build" line done, two gaps declared) · D2 5 (no partial write, shown 3 ways) · D3 5 (one shared check, one kinds list) · D4 N/A · D5 4 (after a refusal, the next upload works) · D6 4 (audit line on success only, flag in words) · D7 N/A · D8–D9 4 (the words name the allowed types) · D10 3 (finding 3) · D11 5 (`role="alert"` on the line, state unchanged) · D12 4 · D13 4 (keyboard, axe clean at 400/1024/1440, no 200 % zoom run) · D14 5 · D15 4 (12 MB refusal 2.1–2.7 s, including the upload) · D16 4 (each reason passes and fails, mutations caught; findings 1, 6) · D17, D20 simulated only · D18 3 (finding 4) · D19 N/A.
**BIC:** BIC-13 Met: the error is inline on the line, says what was wrong and which types are allowed (`screenshots/W2-gif-refused-1440.png`). BIC-20 Met: keyboard path (line menu, Enter, ↓ to "Upload a file…", Enter) works; axe clean; no sideways scroll at 1024 and 400 px; 200 % zoom not run. BIC-11 and BIC-19 unchanged (no layout change). Others N/A (no question, value or signing step changed).

## What I ran (all on isolated copies, never :4400; US$0)
| Run | Result |
|---|---|
| `check_csd1t_file_type.ts` on 4447 | exit 0, 34/34 |
| `journeys/j_67.ts` on 4467 | exit 0, 20/20 |
| `check_c64_storage_api.ts` on 4438 | exit 0, 48/48 |
| `check_c65_documents_api.ts` on 4436 | exit 0, 74/74 |
| `check_pff4_file_type.ts` (pure) | exit 0, 78 passed |
| `product/tools/typecheck.mjs` | exit 0, 15 known, 0 new |
| reviewer walk (scratch, not committed) on 4439 | exit 0 (journey report) |

## Mutations (each on a fresh copy; then `git checkout --`, tree back at 14dcae83d)
| Mutation | check_csd1t | j_67 |
|---|---|---|
| M1 the no-line door skips the check (`case-documents.ts:292`) | red, 19/34 (all 15 lines for that door) | red, 17/20 (DW1 code, DW1 door, DW2) |
| M3 the `main.ts:192` change undone | red: TOO_LARGE and TOO_MANY_PIXELS on the line say "larger than 20 MB" | not covered (W5 uses the 20 MB limit) |
| M2 the line door back to `mediaOf` (`case-checklist.ts:279`) | red, 24/34 | red, exit 1 (3 FAIL, then crash at W2: finding 6) |
| M4 line 62's 20 MB check removed | **green** (finding 1) | not covered |

DW1's stand-ins only show that the judge can fail. The real evidence is M1 and M2: the same judges go red on the real door.

**Not checked:** the full `ci`, demo reset and checkpoint load, the checklist suites, a headed walk (HEADED=1), a real screen reader, 200 % zoom, the PR body ("Completes: R1.67"). D17 and D20 stay with the founder.

**Verdict: Approve**
