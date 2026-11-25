# CS-D1t break report: the two case upload doors and the PDF reader (commit 17e03d43)

Breaker, one round, 19 Nov 2026. Isolated copy `brk_csd1t` on :4451 (fresh database, Visitor visa setup, one case opened as `check_csd1t_file_type.ts` does), stopped afterwards; no reader process left (`pgrep -af check_pdf_opens` empty after every probe). pypdf 6.19.0, Python 3.13, 4 cores, 15 GB. Crafted files and probe scripts stayed in a scratch folder. Live AI off, US$0. Nothing fixed.

## What broke first: Major

**M1. Any PDF with an `/Encrypt` entry is answered "opens" without reading its page tree, so damaged files and non-PDFs get stored.** `tools/check_pdf_opens.py:28-29` returns `{"ok": true, "encrypted": true}` as soon as `reader.is_encrypted`; only the trailer has to parse. Reproduced 5 times at both doors.
- (a) A forged shell with no Root, no objects, no pages and an HTML body: `printf '%%PDF-1.4\n<html><script>alert(1)</script></html>\ntrailer\n<</Encrypt<</Filter/Standard/V 1/R 2/O <00…(32 bytes)>/U <00…>/P -4>>/ID[<00><00>]>>\nstartxref\n0\n%%%%EOF\n'` (about 300 bytes). Sent as `POST /api/runtime/checklist-lines/:id/documents` (x-actor `user-O`) and as `POST /api/runtime/cases/:id/documents` (`subjectId`, `documentType=letter_of_invitation`), it came back **201** both times. Stored: a `case_document` row (`application/pdf`, `<uuid>.pdf`), the file, an `uploaded` audit line, and the line moved to Received. The variant with no HTML and no xref (`enc_f`) was also stored (201).
- (b) Real IRCC forms cut short. All 12 forms tried under `official-sources/ircc/forms/` are encrypted, PDF 1.7. `head -c 1500 imm5409e.pdf` (1.45 MB form, linearized) came back **201** at both doors, stored as `imm5409e.pdf`. Sweep, run straight on the reader: the 5 linearized forms (imm0008_4e, imm0008depe, imm5409e, imm5475e, imm5476e) "open" when cut to 5 %, 25 %, 50 %, 75 % or 95 % of their length. Most non-linearized forms "open" when cut to 95 %, or with 1 or 30 bytes cut off the end. Only `imm5257_1e` refuses at 95 %. So R1.67's "a damaged PDF is refused" does not hold for the forms clients are most likely to upload.

**M2. There is no limit on concurrent readers: each upload can pin one core and up to about 1 GB of memory for 20 s.** `api/src/case-checklist.ts:65` spawns one Python process per PDF upload, with no queue and no cap. The 1 GB limit applies to each process, not in total.
- Input: `mem_dicts.pdf`. It is one catalog with `/X[` followed by `<<>>` repeated to 19.9 MB, then `]`, plus a normal Pages and Page object (18 s and 470 MB on its own). `mem_arrs.pdf` repeats `[]` instead (24.5 s, 889 MB).
- 8 concurrent `mem_arrs` uploads as `user-O`: 9-10 reader processes, all 4 cores pinned (load average 3.07), host memory in use rose from 1.5 GB to 7.1 GB in 22 s. Each upload answered 400 "may be damaged" after 21.2-21.7 s; nothing stored.
- 12 concurrent `mem_dicts` uploads as the case's client `user-P`: 13 processes and 6.8 GB, same answers. Reproduced 3 times. By extrapolation, about 16 concurrent 20 MB uploads from one client reach the host's 15 GB. I did not run that.
- The kill does fire: every process was gone within 1-2 s of the 20 s timer, with no zombies or orphans.

## Minor

**m1. A sound PDF is blamed as "damaged" when the reader runs out of time or hits a limit.** `case-checklist.ts:66` treats a timeout as "damaged".
- `pages90k.pdf` (90,000 blank pages written by pypdf, about 11 MB) opens in 7.8 s on its own. Sent as `user-P` alongside 12 `mem_dicts` uploads, it came back **400** "This file could not be read: it may be damaged" after 20.8 s, and again after 21.0 s (reproduced twice).
- `pages60k` (4.7 s alone) took 18.3 s under the same load, only just stored.
- Also refused as damaged: a well-formed 120,000-page PDF (pypdf's 100,000 page-tree entry limit), and a well-formed 20 MB PDF with one huge array that takes 58 s.
- The words blame the person's file when the cause is server load or size.

**m2. An incremental update cut part-way is stored as the earlier revision.** Input: a good 1-page PDF plus an appended update (a new page, a new Pages node, an xref section, `/Prev`), cut 60 bytes into the appended part. It came back **201**, read as 1 page; the second page is silently lost. A file with random bytes or HTML after `%%EOF` is also stored. pypdf ignores the tail, so this is lower risk.

**m3. Stored `file_name` keeps C1 controls and invisible characters.** `platform/files/file-type.ts:189` strips only U+0000-001F, U+007F, U+200B-200F, U+202A-202E, U+2066-2069 and U+FEFF. Checked as hex in the database, these were kept at both doors (201): U+0085 NEL and U+009B CSI (`a\u0085b\u009B31mc.pdf`), U+2028/2029, U+061C, U+2060, U+00AD, and tag characters U+E0041/U+E0042 (`pass\u{E0041}\u{E0042}port.pdf`). The on-disk path is `<uuid>.<ext>` every time.

**m4. JPEG and PNG are judged by their header only, so header-plus-HTML files are stored as images.**
- A 24-byte PNG (signature and IHDR) followed by `<html><script>…` was stored as `image/png` (201).
- A 21-byte `FF D8 FF C0` SOF segment followed by HTML was stored as `image/jpeg` (201).
- PDF+ZIP, PDF+SVG and PDF+trailing-HTML polyglots were stored as `application/pdf`.
- Low impact: `GET documents/:id/file` serves the stored type with `nosniff` and `CSP default-src 'none'; sandbox` (`case-documents.ts:722`), and the extension comes from the detected kind.

## What held
- **Nothing written on refusal.** Checked on every refusal at both doors: no row, no file, no `uploaded` audit line, every line's state and version unchanged. That covers 400 damaged, 415, 413, 409, 403 and 404. After 69 stores: 69 rows, 69 audit lines, files on disk equal to rows, no orphans, and one current file per person and type.
- **Signature checks.** Junk, a UTF-8 BOM or `GIF89a` before `%PDF-` is refused 415.
- **pypdf limits.** These were refused as damaged within 1 s, nothing stored: zero pages (`/Kids[]` with `/Count 999999999`), cyclic page trees (self-reference and A→B→A), a 5,000-deep page tree, a 2³⁰ exponential page tree, and 200k nested arrays (RecursionError caught). A lying `/Count` with 1 real page reads as 1 page.
- **Memory cap.** A 20 MB `()` array hit MemoryError at about 980 MB, was answered damaged, and the process exited cleanly.
- **Sound real-world shapes stored.** An xref-stream / object-stream PDF 1.5, a `%PDF-2.0` header, an ImageMagick scanned-image PDF, a pypdf rewrite of an IRCC form, an owner-password AES-256 PDF, a 20,000-page PDF (1.7 s), and full encrypted IRCC forms.
- **Forcing a verdict.** Neither "opens" nor "unchecked" could be forced by file content. The script prints one `json.dumps` line; stderr is ignored; `-I` is set; error text is cut to 160 characters and JSON-escaped; MemoryError and RecursionError are caught. No 503 and no 500 in the API log for the whole run. The only ways to get a 503 left are a kernel OOM kill or a failed spawn (not run).
- **File names.** Path traversal (`../`, `..\`, `filename*=..%2F`), `filename*` with %00/%0A/%1B, RTL override, names that are only dots or `.pdf`, `x.pdf.exe` (stored as `passport.pdf`), `setup.exe.pdf`, HTML in the name, Cyrillic and latin1 names, 10,000 characters (cut to 190 + `.pdf`) and floods of emoji or combining marks were all handled. Raw NUL in the header is refused 400 by multipart. The path is always `<uuid>.<ext>`. `CON.pdf` is kept, but it is only a database value.
- **Who may upload.** `user-S` and `user-Q` got 404 and `user-A` got 403 at both doors, nothing written. The reader is never started for them: `user-Q` with the 18 s file was answered in 111 ms.
- **Stale version.** `version=0` is refused 409 before the read: 42 ms with a good file, 115 ms with the slow one.
- **Races.** In 3 rounds of 4 parallel uploads on one line, exactly one 201 each round and three 409s with no leftover file. Not applicable marked during a 5 s check made the upload 409, nothing stored.
- **`main.ts:191`.** A JPEG over 10 MB is answered 413 in PF-F4's words at both doors. A PDF over 20 MB is 413 "larger than 20 MB" at the line door and, unchanged from before, "This file is too large for this upload." at the case door. Only server-written text can match the pattern, so no client text can trigger it, and no other route's 413 changed (intake, fill-case, sign-steps and submission messages have no "Allowed here:").

## Not got to
- A real host-OOM run, and spawn failure (EAGAIN) under a process limit: deliberately not run.
- How long PF-F4's scan of a 20 MB file (latin1 decode plus regex) blocks the API's event loop, measured apart from the reader. A checklist read stayed at about 1 s under load.
- Linearized but unencrypted real PDFs cut short (no tool here to linearize), and PDFs protected with a user password (stored by design).
- The screen's words and layout for these answers (API only).
