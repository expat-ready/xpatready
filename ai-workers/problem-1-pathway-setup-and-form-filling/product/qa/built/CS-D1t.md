CS-D1t (R1.67, file-type check): the two case upload doors now judge a file by PF-F4's one check (`checkFile`, `api/src/platform/files/file-type.ts`), through one shared call (`checkedCaseFile` in `api/src/case-checklist.ts`). The doors are a checklist line's upload (`POST /api/runtime/checklist-lines/:id/documents`, the Documents panel's "Upload a file…") and the person's document with no line (`POST /api/runtime/cases/:id/documents`).

What a person can now do, on a case's Documents panel:

* Upload a PDF, JPEG or PNG: it is stored with the type of its own bytes. A file whose name disagrees with its bytes is stored under a corrected name (a JPEG named `passport.png` becomes `passport.jpg`).
* Choose a file that is not one of those (a GIF named `passport.png`, a Word file, a ZIP, a file with macros): refused on the line in PF-F4's words, which name the allowed types and end "Nothing was stored."
* Choose an empty file, or an image whose header cannot be read: refused as empty or damaged.
* Choose a PDF that does not open (cut short, or a header with nothing behind it): refused as damaged. The doors read the PDF's structure with the reader the form library already uses (pypdf, `tools/check_pdf_opens.py`), in its own process, before anything is written. A password-protected PDF is not damaged and is stored. If the reader cannot be run, the PDF is not stored unchecked: the person is asked to try again (503).
* Choose an image over 10 MB, or one whose header declares over 89.5 megapixels: refused as too large. A file over the doors' own 20 MB is refused as before.
* A PDF with active content (scripts) is stored, and its audit line says "Contains scripts: opened only in the safe viewer".

A refusal writes nothing: no row, no file, no audit line.

Not in this part: the "contains scripts" flag is on the audit line only (the document row has no place for it without a schema change; it goes with CS-D1 part 1), and the doors keep their 20 MB limit (the move to PF-F4's 25 MB goes with CS-D1).

Tests: `tests/check_csd1t_file_type.ts` (43 lines: each refusal reason through each door, the PDF reader and what happens when it cannot run, with passing cases beside them) and the journey `tests/journeys/j_67.ts` (21 lines: DW1, DW2 with their stand-ins, and the walk W1 to W7 at 1440 px).
