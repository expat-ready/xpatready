# PF-F4 review: one file-type and size check (independent reviewer, 18 Nov 2026)

Commit reviewed: **183238e06** (branch `claude/inspiring-dirac-78v6ed`, draft PR #2128). The diff `origin/main...183238e0` has 14 files, +441/−2: `api/src/platform/files/file-type.ts` (217 lines), `tests/check_pff4_file_type.ts` (146), ten fixtures plus `make_fixtures.py`, three lines in the platform MODULE.md, and `qa/built/PF-F4.md`. I judged it against BACKLOG line 1063 (the row and its acceptance list), STANDARDS §3.10, §7 and §8, AG-9-2 (both requirement snapshots), SA-8-37, SA8-D27, SA8-D32/SA-8-58 and P-607 (8). It is pure code with no screen, route or door: no walk at any width, the BIC table is N/A and the graph has nothing to map. **Journey test: not applicable** (no screen, no app change). In its place I scored the test pack's coverage: **6.5/10** (`journey-test-reviewer-2026-11-18.md`).

## What I ran
* `npx tsx tests/check_pff4_file_type.ts` in my working copy: **54 passed, 0 failed**, 0.7 s.
* **The same suite in a clean checkout of 183238e0** (a scratch `git worktree`): **it crashes at line 78** with `ENOENT … fixtures/file-types/plain.zip`, exit 1, and no test after line 78 runs. `plain.zip` is not committed: the root `.gitignore:18` holds `*.zip`, and `git ls-files` lists 10 fixtures without it. This is B1.
* **Mutation probes** (scratch copy outside the repo, one change at a time, 21 probes). 8 failed the suite: dropping the `[Content_Types].xml` requirement, the AVIF exclusion, the HEIC brand test, the double-extension loop, the path strip, the declared claim, the final size check, or the empty-file check. **13 stayed green:** the 5,000-entry cap, the ZIP64 count marker, `cdAt + cdSize > eocd`, the name bounds check, the central-directory signature, `xl/macrosheets/`, `vbaData.xml`, the JPEG fill byte, the SOF exclusions (C4/C8/CC), `#xx` decoding, the bidi/zero-width strip, the declared-type part of `corrected`, and `PK\x05\x06`. See m1.
* **Hostile inputs** (scratch probes). Every one ended in a refusal or an accept, with no throw and no hang:
  * a central-directory offset past the end of the file, a count of 0xffff, a count of 4,999 with 2 entries, a cdSize of 0xffffffff, and a JPEG segment length of 0xffff past the end;
  * 25 MB of `FF` fill bytes, 25 MB of zero-length APP0 segments and 25 MB of RST markers.
  * The JPEG walk always moves forward by at least 1 byte, and every read is bounds-checked (`:100`, `:107`). It cannot loop forever or read out of bounds.
  * A fake end-of-directory record hidden in the real one's comment, hiding `word/vbaProject.bin`, is read as benign. Python's `zipfile` and `unzip -l` read the same fake directory, so I found no parser differential.

## Done when (acceptance lines, a pass and a fail each)
* [x] One real sample of each type passes (`test:54-57`). The fails: a PDF one byte off, AVIF, and old `.doc`. The HEIC decode is unverified (the PR says so).
* [x] An `.exe` renamed `.pdf` is refused (`:66`). HTML and SVG are refused (`:68-69`).
* [x] `.docm`/`.xlsm` are refused (`:74-75`); `sample.docx` passes.
* [ ] **A plain ZIP is refused with "one by one" (`:78-79`): this crashes in a clean checkout (B1).** `:80` still checks a fake-office ZIP built in code, but it does not check the message.
* [x] 25 MB + 1 byte and 10 MB + 1 byte are refused, and exactly 25 MB and 10 MB pass, on both the declared size and the bytes (`:85-98`).
* [x] A 2 GB declared entry is read in 0.06 ms, and the plain-ZIP bomb in 0.01 ms (`:101-106`).
* [x] The refusal lists the allowed types (`:134-137`). Every refusal ends "Nothing was stored." (all 25 refusals the test makes, `:142-143`).
* [x] The bomb PNG is refused; the 81-MP JPEG passes (`:109-113`). The renamed JPEG becomes `image/jpeg` named `passport.jpg` (`:115-116`). IMM 5707 is stored and flagged, and a plain PDF is not (`:121-124`). An images-only door refuses a PDF in words and accepts a PNG (`:132-135`).

## The reviewer's points
* **ZIP central directory:** sound. Every offset is checked against the end-of-directory record (`:84`, `:87`, `:89`). ZIP64 and over 5,000 entries count as damaged. Nothing is decompressed, so a bomb costs at most one name decode per entry. Within what the row allows (names only, no decompression), there are some limits:
  * any ZIP with `[Content_Types].xml` and a `word/` entry is stored as Word (`[Content_Types].xml`, `word/`, `payload.exe` → `word`);
  * a VBA part under another name passes (`word/project.bin`). It is stored as `.docx`, and Word does not run VBA from a `.docx`.
  * Both follow the row's own definition, so neither is a finding.
* **HEIC:** the brand loop is bounded by `min(size, length, 4096)`. An MP4 with `isom` + `heic` brands is taken as HEIC. That matches the row's "ftyp with a HEIC brand", and it is stored as an image.
* **Run time on 25 MB:** the PDF scan's regex is linear (one bounded class, no nesting). Hostile 25 MB PDFs still take a synchronous **1.2 s (`/a`×13M), 1.4 s (`/JS`) and 1.8 s (`/#4a#53…`)** on the event loop. At a full door, a 25 MB JPEG is walked in full (0.55 s) before it is refused as an image over 10 MB. See m2.
* **Names:** the path, control and markup characters, bidi and zero-width marks and known extensions are stripped, so `cv.docx.exe` becomes `cv.docx` and `a‮fdp.exe` becomes `afdp.pdf`. Gaps: m3 and m4.

## D1–D20 (1–5; pure runtime row)
D1 4: every row line is built, but one acceptance test does not run from git (B1). · D2 4: refusals are typed and messages fixed; m3–m5. · D3 5: one pure module, one call per door. · D4 N/A. · D5 5: no state. · D6 N/A (the callers audit). · D7–D14 N/A (no UI). · D15 3: m2. · D16 2: B1 and m1. · D17, D20 simulated only. · D18 4: SA-8-58, P-607 and Sample are cited in code; see the note on AG-9-2. · D19 N/A: an enabler for PF-F2 and CS-D1.

## Issues
**Blocker**
* **B1** `tests/check_pff4_file_type.ts:78` reads `fixtures/file-types/plain.zip`, which `.gitignore:18` (`*.zip`) keeps out of the commit. *Failing input:* a clean checkout of 183238e0, then `npx tsx tests/check_pff4_file_type.ts` → `ENOENT`, exit 1. Lines 78–143 never run, so CI's no-server shard fails, and the "Done when" (exit 0 on CI) cannot be met. *Fix:* build the plain ZIP in the test with the file's own `zip()` helper, as the PDFs are (for example `zip([{ name: "passport.jpg", data: fx("sample.jpg") }, { name: "letter.txt", data: bytes("Sample") }])`). Drop it from `make_fixtures.py` or say there that it is not committed. Run the suite once from a clean worktree.

**Majors:** none.

**Minors (Should)**
* **m1** Tests that never fail. `test:125` claims to show that `#xx` escapes are decoded, but the same PDF holds a plain `/JS`, so it passes with the decoding removed. `test:82` claims to show "a directory outside the file", but cutting 30 bytes removes the end record entirely, so it passes with `cdAt + cdSize > eocd` removed. 11 more rules survive removal (listed above), against STANDARDS §7 [M]. *Fix:* use `/S /J#61vaScript` with no plain `/JS`. Add one crafted ZIP per guard (cdAt past the end, count 0xffff, count 5001, a bad CD signature), plus `xl/macrosheets/sheet1.xml`, `word/vbaData.xml`, a JPEG with `FF FF` fill before its SOF, a `C4` segment before the SOF, and a name with U+202E.
* **m2** `file-type.ts:118-125` and `:151`: up to 1.8 s of synchronous CPU per hostile 25 MB PDF, and 0.55 s per 25 MB JPEG that will be refused anyway. *Fix:* check the size class right after the magic bytes, before `pixelsOf` and `activeContentOf` (move `:210-211` into `detect`, or pass the limit in). Say in the module card that `checkFile` may take about 2 s at 25 MB, so PF-F2 runs it off the request thread (STANDARDS §4 [M] "never inside a web request").
* **m3** `:172-173`: a trailing dot defeats the double-extension cleaning. *Failing inputs:* `passport.exe.` with JPEG bytes → `passport.exe.jpg`; `file.pdf.` → `file.pdf.pdf`. The order matters because the dots are trimmed only after the loop. *Fix:* trim trailing dots and spaces inside the loop, before each match. `:173` `.slice(0, 190)` can cut a surrogate pair (`"x"×189 + "😀.pdf"` → a lone `\ud83d`); cut by code point instead.
* **m4** `:215` marks `corrected: true` when name and bytes agree. *Failing inputs:* `IMG_0001.JPG`, `photo.jpeg`, `fax.tif`, `IMG_0002.HEIC`, or any file the browser sends as `application/octet-stream`. Row (5) corrects only when "name or declared type disagrees with its bytes", and every iPhone photo would be reported corrected. *Fix:* compare `EXT_KIND[ext]` and `MEDIA_KIND[claimed]` to the kind (ignoring `octet-stream` and an empty type), keep the case-only normalisation, and set `corrected` only on a real disagreement.
* **m5** `:145` matches `vbaProject.bin` case-insensitively but `xl/macrosheets/` case-sensitively. OPC part names are case-insensitive. *Failing input:* `[Content_Types].xml`, `xl/workbook.xml`, `xl/Macrosheets/sheet1.xml` → accepted as Excel. *Fix:* lower-case the names once in `zipNames`. A second gap at `:120`: PDF whitespace includes NUL, but `\s` does not, so `/OpenAction\0` and `/S/JavaScript\0` are not flagged. *Fix:* add `\0` to the class. The flag stays a hint (CS-D5).
* **m6** `:148`: a `.pptx` or `.odt` gets "Upload the files inside one by one" (it is not a bundle of files). *Fix:* when `[Content_Types].xml` is present without `word/` or `xl/`, refuse as `NOT_ALLOWED_TYPE`. `:191` says "a claim alone never refuses", but `checkDeclared({ size: 15 MB, name: "passport.jpg" })` refuses at creation, even though PDF bytes under that name would pass at the end. *Fix:* reword the comment to match the code (a known claim sets the limit).

**For the tech lead (not this PR's finding):** row (5) stores a name or type mismatch instead of refusing it. AG-9-2 (02-Nov snapshot, Doc 3 :4131) says "mismatch/disallowed/over-size is rejected". The row cites Lead 52's ruling, but P-607 covers only the ZIP. Under AGENTS rule 2, a founder line may be needed. Outside this row: TIFF and HEIC pixel counts are not read, as the PR says.

## Could not check
A HEIC decode (no HEVC decoder here); how real Office handles the crafted ZIPs (m5 comes from the OPC spec, not a run); CI's shards (skipped on the draft; `module-cards` fails on `main`'s 42-line front-office card, not this PR's).

**Verdict: Block** (B1 open), for commit 183238e06. Fix B1; m1–m6 are Should.

## Round 2 (18 Nov 2026): commit cf6a01593 (diff `183238e06..cf6a01593`, 2 commits)
**Ran.**
* A clean `git worktree` of cf6a01593 has 10 fixtures and no `plain.zip`. `npx tsx tests/check_pff4_file_type.ts` gives **77 passed, 0 failed, exit 0**, twice. Its 40 refusals all end "Nothing was stored."
* I repeated the round 1 probes on the new code.
* I ran 31 new mutation probes (scratch copy); 22 fail the suite.

**Round 1 items**
* **B1 closed.** The ZIPs are built in the test (`test:87-88`), and `make_fixtures.py` no longer writes one.
* **m1 closed.** Each of these now fails when its rule is removed:
  * the 5,000-entry cap, `cdAt + cdSize > eocd`, the CD signature and lower-casing;
  * `xl/macrosheets/`, `vbaData.xml`, and the office-not-Word/Excel and `mimetype` cases;
  * the fill byte and the C4 exclusion;
  * `#xx` decoding (escaped names alone), NUL, the bidi strip, trailing dots, the code-point cut and the own-extension rule;
  * octet-stream, the declared-type disagreement, and sniff-before-scan at the door.
* **m2 closed for this row.** `checkFile` runs sniff, then the door, then the size, then `inspect` (`file-type.ts:131`, `:158`, `:237`).
  * A 25 MB JPEG of `FF` fill is now refused in 0.3 ms (it was 550 ms).
  * Residual: an allowed hostile 25 MB `/#4a#53` PDF still takes **1.7 s**. It is going to PF-F2 in the PR (run the check off the request path), and I accept that.
* **m3 closed.** `passport.exe.` → `passport.jpg`; `file.pdf.` → `file.pdf`; `a.pdf . . ` → `a.pdf`. A long name is cut by code points.
* **m4 closed.** `photo.JPG`, `photo.jpeg` and `photo.jpg` sent as octet-stream all stay `corrected: false`, and `cv.pdf.JPG` with JPEG bytes → `cv.JPG`.
* **m5 closed.** `xl/Macrosheets/` → MACROS. `/OpenAction\0` and `/S/Launch\0` are flagged.
* **m6 closed.** pptx and odt → NOT_ALLOWED_TYPE. The `:214` comment now matches the code.

**New, Minor (Should), none blocking**
* **n1** `test:184-186` claims to show "refused on its size before any whole-file walk". It still passes when `inspect` is moved before the size check, because `padTo(sample.jpg)` has its SOF at byte 20, so the walk is instant either way. *Fix:* build the 25 MB JPEG as `FF D8 FF` + 25 MB of `FF` fill. With the order reversed it takes about 550 ms and fails the 50 ms bound.
* **n2** `file-type.ts:84`: `count === 0xffff` and `cdAt === 0xffffffff` are never the deciding check. The cap (`count > 5000`) and the bounds check (`cdAt + cdSize > eocd`) already refuse both. So `test:100` ("ZIP64 entry count") passes with the ZIP64 test removed, which contradicts the PR's "each fails with its rule removed". *Fix:* drop the two markers and say in the comment that the cap and the bounds cover ZIP64, or keep them and relabel `test:100` as covered by the cap. Not tested: C8/CC (only C4 is), and RST/no-length markers before a SOF.
* **n3** `test:97` `withEnd(b, at, put)`: `at` is unused (`void at`), which is dead code under STANDARDS §7. *Fix:* drop the parameter.

**D-scores changed:** D1 5 · D15 4 (the residual PDF scan goes to PF-F2) · D16 4 (n1, n2).

**Test-pack coverage, re-scored:** **9/10**, no criterion at 0, a pass. Clean checkout 0 → 1; hostile ZIP, hostile JPEG, run time and names each ½ → 1. Mutation sensitivity stays ½ (n1, n2), and real samples stay ½ (HEIC decode unverified).

**Still open, outside this row:** the AG-9-2 mismatch-versus-correct question is with the tech lead in the PR. TIFF and HEIC pixel counts are not read.

**Verdict: Approve** (no open Blocker or Major), for commit cf6a01593ac7df2f6170697440bdbf19d0718a03. n1–n3 are Should.
