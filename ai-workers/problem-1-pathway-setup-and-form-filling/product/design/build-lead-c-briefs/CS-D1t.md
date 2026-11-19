# Brief: CS-D1t, the case upload doors use the one file-type check, with J-67 inside (cloud builder lane; row owner Build Lead C)

Written 19 Nov 13:0x IST by Build Lead C (2). **Ready for the current Lead's line.** This is Release 1 row **R1.67** ("File-type check"), whose only missing part, per qa (`qa/CAPABILITIES.md` line 224), is a door that calls PF-F4's check. It is the first slice of BACKLOG `CS-D1` (shaping in `CS-D1-shaping.md`). Where this page differs from the row, this page wins.

**Model:** Opus 5.5, effort medium. **Review:** Opus reviewer **and breaker** (files from clients).

**Ready when:** now (PF-F4 #2128 is on `main`).

## What to build
* In `api/src/case-documents.ts` `upload()` (~line 290) and `api/src/case-checklist.ts` `upload()` (~line 260): replace the size check, `mediaOf(bytes)` and the "Send a PDF, JPEG or PNG file…" refusal with one call to PF-F4's `checkFile({ bytes, name, mediaType }, allowed)` from `api/src/platform/files/file-type.ts`.
  * `allowed` is the case side's kinds today: `pdf`, `jpeg`, `png`. Keep that list in one constant; do not widen it in this PR.
  * A refusal answers in PF-F4's words plus `NOTHING_STORED`, with the HTTP status the reason calls for (413 for TOO_LARGE, 415 for NOT_ALLOWED_TYPE, ZIP or MACROS, 400 for EMPTY or DAMAGED), and **nothing is written** (no file on disk, no row, no audit line).
  * Store the media type and extension PF-F4 detected; the stored file name uses `correctedName` when the name and the content disagree.
  * A PDF with active content (`activeContent` not empty) is stored, with PF-F4's `SCRIPTS_FLAG` on the document so the screen can say "opened only in the safe viewer" (if the document has no place for that flag, ask first: no schema in this PR).
  * The damaged-PDF check through the form engine's Python door, if a door calls it today, stays as it is.
* Remove `mediaOf` and the old size constants only if nothing else uses them; otherwise leave them and say so.

## J-67 inside (P-728, P-733 (2))
`tests/journeys/j_67.ts` on an isolated copy (`tools/isolated.sh`), as `tests/journeys/j_6.ts` does, Sample files only:
* **DW lines** (each also fails against its stand-in): DW1, both doors call `checkFile` (a stand-in door that skips it lets a renamed GIF through); DW2, a refusal stores nothing (no row, no file, no audit line).
* **W lines** (HEADED=1 and scripted): staff upload a real PDF on a person's document → stored; a GIF named `passport.png` → refused in words, nothing stored; an empty file → refused; a truncated PDF → refused as damaged; the client uploads a JPEG on their checklist line → stored; a 30 MB PDF → refused as too large. The walk ends at the next capability's first step (the checklist line shows the stored file).

## Done when (P-606)
* `tests/check_csd1t_file_type.ts`: each refusal reason through each door, a pass and a fail; a refusal leaves no file and no row.
* `tsx --tsconfig studio/api/tsconfig.json studio/tests/journeys/j_67.ts` exits 0 on its own isolated copy.
* Unchanged: `check_pff4_file_type.ts`, `check_c64_storage_api`, `check_c65_document_rules`, `check_c65_documents_api`, the checklist suites, demo reset and checkpoint load; axe-core clean on the screens walked; 1024 and 1440 px; module cards (row fragments, P-712); full `ci` green.
* PR body: "Completes: R1.67".

**Touch list:** `api/src/case-documents.ts`, `api/src/case-checklist.ts` (the upload checks only), `tests/check_csd1t_file_type.ts`, `tests/journeys/j_67.ts`, a row fragment for the cards. No schema, no migration, nothing in `platform/files/`.

**Duplicate check:** `git grep -n "checkFile\|file-type" origin/main -- api/src` finds only `platform/files/file-type.ts` and its card (19 Nov).

**Standard rules:** as `AUD-1m-2.md`. Repository `expat-ready/xpatready`.
