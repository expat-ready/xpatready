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

## Round 2 (cba94bbb)

Head cba94bbbe5926f683f47114fcfda786a96dd4ac4 (fixes `git diff 710f5e3c5 cba94bbbe`). Isolated copy `brk64b` on :4437
(PLATFORM_IDENTITY=local; stopped and dropped after). Same probes as round 1 plus new ones; scripts in the scratchpad.

**Round 1, re-run.** B1 closed: the 8 s, 99,500-page PDF is 204 (9.9 s), the same as multipart; a small file behind two
multipart reads is 204 (7.5 s); ten slow finishes at once are all 204 (13-49 s), a checklist GET meanwhile 58 ms. B2
closed: declared 20 MiB → 201, 20 MiB+1 → 413 in words; a valid PDF of exactly 20,971,520 bytes is stored; multipart
matches (20 MiB 201, +1 413); a body longer than declared is tus's 413. B3 closed for a refusal at the check: damaged PDF
400, no new bytes, no staging, nothing in the firm folder. B4 closed: role ended mid-upload, and Add again, say "Your role
cannot add documents to cases. Nothing was stored." B5 closed: `Ã©tude.pdf` stays as sent. B6 closed: linked to `user-A`,
to client `user-P`, to nobody, or relinked to the client before finish: 403 in words, nothing staged. B8 closed: keyboard
at 1024 px, focus is on Add after the inline sign-in and after the upload. B9 closed: 1 current row, "48 earlier
versions" folded, Add 90 px below the panel top at 1440, 1024 and 200 % zoom, no overflow.

**N1 Minor (B3 residue): a 5xx after put, then a refused retry, leaves bytes no row and no cleanup knows.** On a retry,
check()'s refusal removes only the staging copy (`rail.ts:190`), not bytes an earlier attempt put; the sweep reads only
staging (`rail.ts:237`), so it never sees them. Steps: another transaction holds the person+type lock 9 s; PATCH → 500
after 8.5 s (P2028), key put, staging kept (correct). End the role; HEAD → 403, staging gone; bytes stay. Role back: HEAD
404. A sweep 25 h later left the key: still 1 live file with no `plat_file` row at the end of the run.

**N2 Minor: the expiry cleanup can delete bytes a finish in flight is about to name.** `rail.ts:250` treats "no committed
row" as "no row": a finish between `files.put` and its commit is not seen. Steps (the rail's own `sweep()` on the copy's
staging, file store and database, clock +25 h): finish waits 3 s in its transaction, sweep runs → key tombstoned, bytes
gone, staging removed; the finish then commits: PATCH 204 with a file id, `plat_file` SCANNING and a new current
`case_document`, but no bytes under the key (2 of 2 runs). Needs a finish in the last seconds before expiry.

**N3 Minor: a slow check under a HEAD holds tus's lock; other requests get tus's raw words.** A HEAD's finish runs inside
tus's lock (`rail.ts:80`); `#words` passes tus's own answers through (`rail.ts:124`). Steps: nine multipart slow PDFs fill
the reader queue; staff PATCH, HEAD at +2 s, HEAD at +4 s, empty PATCH at +6 s. The finish takes 48 s. The second HEAD
gets 500 at 34 s and the empty PATCH 500 "failed to acquire lock before timeout". Later HEAD 200, one file. The client
retries a 500, so it recovers; no second file or version.

**N4 Minor: access is re-checked before the PDF read, not at the write.** `staff-door.ts:83` checks, then `:87` reads (8 s
here, longer behind the queue); `onComplete` no longer checks. Steps: user-T's role ended 2.5 s into an 8 s finish → 204,
version and audit line `staff:<id>` written 6 s after the role ended. Round 1's "held" (refused when ended before finish)
still holds when the role ends before the last byte.

**Held (new code).** 403 vs 404: firm B's Owner gets 404 "No such case." for a firm-A case with A's person, an own-line
type, an unknown type, a random or no person, upper-case id, and for a random case; median 7 vs 8 ms. Firm-B staff with no
right: 403 "Your role cannot…" for an A case, a random id and garbage alike. Firm B's own case works (201). The key is per
upload (`case-documents/<person>/<upload id>`), so neither removal path touches another upload's or an earlier version's
bytes; every version's key was live at the end except N1/N2's. A plain retry after the 5xx stores the same bytes under the
same key (put accepts it): one row, one version, no extra copy in the workspace folder. A 4xx after put (rail suite) is
final by design (staging goes too), so key retirement never refuses a retry that could still work.

Verdict: Approve cba94bbbe5926f683f47114fcfda786a96dd4ac4
