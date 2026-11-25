# CS-D1u break report: staff case-document door on the tus rail (PR #3698)

Head d3510ea38c13767f7c7cb0a16dae7bbbc5f51747. Isolated copy `brk64` on :4466 (PLATFORM_IDENTITY=local; stopped and
dropped after). API by hand (tus) and Playwright; scripts and shots stay in the breaker's scratchpad. No concept.md for
CS-D1u: scope is MODULE.cases.rows/CS-D1u.md and the lead's brief.

## Breaks

**B1 Major: the PDF check runs inside the rail's 5-second database transaction.** `staff-door.ts:71` calls
`checkedCaseFile` (pypdf in a child process, up to 20 s, behind a queue of 2 readers and 8 waiting) from `onComplete`.
That runs inside `rail.ts:186` `$transaction`, which has Prisma's default 5 s timeout. The multipart route runs the same
check before its transaction (`case-documents.ts` `upload`).
- Steps (a): a valid 10.9 MB PDF with 90,000 pages. pypdf takes 7.0 s and answers `{"ok": true}`. Through the staff door:
  POST 201, PATCH **500** "The upload could not be finished. Try again in a moment; what you sent so far is kept." after
  7.8 s. The HEAD retry is also 500, so the file can never be stored. api.log shows `P2028` (transaction closed) at
  `storeVersion`. The same file on the multipart route: **201**.
- Steps (b): two multipart uploads of that PDF take both readers. Then a 1 KB staff-door PDF is finished: **500** after
  6.1 s. A HEAD later stores it.
- Steps (c): ten staff-door finishes of that PDF at once: all ten **500**. Meanwhile an unrelated
  `GET /runtime/cases/:id/checklist` takes **3,712 ms** (46 ms when quiet). The open transactions fill the pool, so any
  staff member can slow the whole app.

**B2 Major: the staff door takes files over the case documents' 20 MB limit.** `allowedKinds: CASE_FILE_KINDS`
(`staff-door.ts:55`) leaves only PF-F4's 25 MB cap. `case-checklist.ts:102-103` says "The doors keep their own 20 MB limit
(C6.4 break m5) … the multipart limit on each route refuses a larger file". The staff door has no such limit.
- Steps: a PDF of 22,976,102 bytes and one of 25,482,854 bytes, both over 20 MiB. Staff door: 201 then 204, and a current
  `case_document` row is written for each. The same 22.98 MB file on the multipart route: **413** "This file is too large
  for this upload."

**B3 Major: a refusal at finish leaves the bytes in the firm's file store and still says "Nothing was stored."** The rail
writes FilesPort first (`rail.ts:183`). After that the door refuses inside `onComplete`: the PDF check (`staff-door.ts:71`),
access lost (`staff-door.ts:67`) or the B1 timeout. The `plat_file` row rolls back, but the bytes stay.
- Steps: a damaged PDF. The PATCH answers 400 "…may be damaged … Nothing was stored." Afterwards `plat_file` still has 3
  rows, but the firm's `front-office-files/<firm>/case-documents/` folder grew from 3 files to 4.
- End of run: 49 files in that folder and 36 `plat_file` keys. That leaves **13 files no row knows about**: no scan, no
  cleanup, no erasure path. They are personal documents.

**B4 Minor: the server's refusal words are lost on screen.** `onComplete` answers 404 "You can no longer add documents to
this case. Nothing was stored." (`staff-door.ts:67`). The browser client turns every 404 into "This upload is no longer on
the server. Start it again." (`web/src/lib/resumable-upload.ts:43`).
- Steps (UI, user-T): end the role mid-upload: the panel says "…no longer on the server. Start it again."; Add again
  gives the same words at creation. Starting again can never work and the person is not told why.

**B5 Minor: some names that are already correct are changed.** `staff-door.ts:71` passes the rail's corrected UTF-8 name to
`checkedCaseFile`. That runs `utf8Name` (`case-checklist.ts:50-55`), which repairs multer's latin1 names. On a correct
name the repair is wrong.
- Steps: the file name `Ã©tude.pdf` is stored as `étude.pdf`. Cyrillic, Japanese, Arabic, emoji and `café.pdf` come
  through unchanged.

**B6 Minor: the door accepts any linked case user, not only staff ones, and its refusals are not always 404.** Rule 1 in the
header says such a sign-in "answers 404". `uploaderOf` (`staff-door.ts:30`) accepts whatever actor the staff row is linked
to, and `caseUploadTarget` gives its own words before the firm check (`staff-door.ts:50`).
- Steps (seed data only; no route sets `actor_id`): staff row linked to `user-A` → **403** "Configuration author
  (simulated) works on configuration…". Linked to client `user-P` → 201/204, audit `staff:<id> Client A uploaded …`.

**B7 Minor: a closed case still takes uploads.** CS-C1a says "a closed case has no moves". `caseUploadTarget` does not check
`runtime_case.status`, so the finish re-check does not see the close either.
- Steps: create, withdraw the case (CLOSED), finish: **204**, version written; a new creation is 201. The multipart route
  also answers 201 (gap already there; the new door copies it).

**B8 Minor: keyboard focus is lost after the inline sign-in.**
- Steps (1024 px, keyboard only): 42 Tabs to Add, Enter shows the card, type firm key and email, Enter. The card goes
  and focus lands on `<body>` (`other-documents.tsx:352`); Tab from the top again. Then Enter on Add uploads. WCAG 2.4.3.

**B9 Minor: every replaced version is listed, and the Add button sits below all of them.** `other-documents.tsx:340` and
`case-checklist.ts:225` have no fold or limit.
45 "replaced" rows for one person after this run; at 200 % zoom the Add button is ~5,000 px down (scratchpad shot).

**B10 Minor: reload mid-upload drops the upload with no warning.** Reload at 20 % of a 6 MB upload: no beforeunload
prompt; afterwards no words, row or file (`other-documents.tsx:328` aborts on unmount). The rail documents "a reload
starts the file again"; the panel tells the person nothing.

## What held
- **Other firm:** another firm's Owner gets 404 for a forged firm-A `caseId` (B1 probe), and 404 "That person is not on
  this case." for its own firm-B case with firm A's `subjectId`. HEAD or PATCH of another person's upload id is 404 (suite).
- **Metadata, roles:** `xr_target`, `XR_Firm` 400; upper-case `caseId` works; bad/missing/random ids 400/404 in words;
  door CLIENT_LINK 404. Read-only 404 (suite); a sign-in with no linked case user 404.
- **Changes mid-upload:** ending the role or unlinking the sign-in before finish is refused 404 and stores no version.
  With the role back, a HEAD stores it.
- **Type, person, mid-upload metadata:** own-line type 422 in the route's words; random person 404; an
  `Upload-Metadata` header on a PATCH is ignored (key and type stay the creation's).
- **Hostile files:** EXE bytes named `.pdf` are 415 in PF-F4's words. A PNG named `.pdf` is stored as `letter.png`,
  image/png. A PDF with JavaScript is stored, and the audit line carries "Contains scripts: opened only in the safe
  viewer". A PDF with planted instructions is stored, and no read or model call is made (`read_value` 0).
- **Polyglot, size:** a PDF with a ZIP appended is stored by both routes (same PF-F4 function); over 25 MB declared is 413.
- **Double finish:** a PATCH, 6 HEADs and 3 empty PATCHes at once give one file id, one `plat_file` row and one version.
  One empty PATCH was 409 offset conflict, which tus retries.
- **One current:** 8 parallel same-type uploads by two staff give 8 versions, exactly 1 current.
- **Names:** `../../../etc/passwd.pdf` → `passwd.pdf`. `C:\…\x.pdf` → `x.pdf`. 3,000 characters → 190 + `.pdf`. An RTL
  override is stripped. Markup is stripped. An empty name → `document.pdf`.
- **Audit, layout:** one "uploaded" line per version, actor `staff:<id>`. No horizontal overflow at 1024 px, 200 %
  (640 css px) or 320 px; the Add button wraps.
- **Multipart route, otherwise unchanged:** 201 with the same response keys, audit actor `user-O`, 422 for an own-line
  type, 400 for a damaged PDF with no row, a client upload 201 with audit `user-P`, and 413 over 20 MB.
- **Not tested live:** a person kept private from clients. By code reading, staff (case duty) may upload for them by design
  (`case-documents.ts:294`), and the checklist read that lists them is officer-only (`case-checklist.ts:143`).

Verdict: Changes d3510ea38c13767f7c7cb0a16dae7bbbc5f51747
