# FO-5 part 2 (retainer API) — break report

Commit `c97154b77` (branch `claude/funny-franklin-ckwwev`, PR #1777). Target: `api/src/front-office/files.ts`, `retainers/{docx,placeholders,service,routes}.ts` (cited `svc:`, `docx:`, `files:`, `main:` = `api/src/main.ts`). Isolated copy `brk_fo5` on :4435 (`PLATFORM_IDENTITY=local PLATFORM_SAMPLE_SEED=on`), database `xr_studio_brk_fo5`; FO-1a's front-office seed run by tsx; persons, ENGAGED leads, prospects and first stage moves by SQL as `tests/check_fo5_retainers.ts` `prospect()` does. Actors: R (Owner + Case Manager, licence), T (Case Manager, licence), O (Case Officer), S (firm B). Rules: row FO-5 (`origin/lead/2026-11-07-lead31`), concept fo-5s r2 BR-1..BR-11, §6.

**Result: 0 Blocker, 7 Major, 8 Minor; 13 held.**

## Major

**B-1 Major — a lost transaction leaves its file under the next key, and from then on that retainer cannot be edited (or recorded Signed offline with another scan): 500 every time.** `svc:362` and `svc:423` write the file before the transaction (`svc:363`, `svc:425`). `files:40` refuses other bytes under a written key, and nothing maps `FileKeyTaken` to a refusal.
Reproduced on :4435's database with the real service and LocalFiles. A wrapper ran the competing action right after the file write (`race.mts`).
(a) Edit RF (v1→v2) while a Send lands: the edit gets 409 CHANGED, but `retainers/<id>/v2.docx` stays. The next edit ("fix the fee", 300) gives 500 `FileKeyTaken … v2.docx`, and the one after it does too. The same happens over HTTP after a 409 on an Expired retainer's edit (another retainer had taken the prospect).
(b) Signed offline while an edit lands: 500 (the DB trigger "only the current version (2) is sent or ended", reported as 500, not 409). `signed-offline.pdf` stays. A clearer re-scan gives 500 `FileKeyTaken` for good; only the identical first bytes go through.
Expected: a refused change leaves nothing in the way of the next one. For example, name the file by the version row's own id or a random suffix, or write it after the version number is locked. `FileKeyTaken` is a 409 at most.

**B-2 Major — a 400 KB .docx (zip bomb, 400 MB `document.xml`) is accepted. Every draft or edit from it then blocks the whole server.** `docx:21-31` opens the zip without checking the size of the expanded parts. `svc:154` only checks the compressed size.
Upload as R: 201, 3 s, RSS 2.2 GB. Four at once: 11 s with the event loop blocked (another user's `GET …/placeholders` took 8.9 s), peak RSS 3.0 GB, and one of the four got a 500 (P2028 transaction timeout while the loop stalled; its file stays). Then O (Case Officer, draft key only) prepared a retainer from it: 11.4 s, everyone else's request waited 9.4 s, peak 2.4 GB. Every `PATCH` re-renders it.
Expected: refuse when the parts' expanded total goes over a Sample cap (for example 20 MB) or the compression ratio is extreme, with "We could not read this file."

**B-3 Major — unknown placeholders pass BR-1 when they sit in parts docxtemplater renders but `placeholdersOf` does not read.** `docx:38` scans only `word/(document|header\d*|footer\d*).xml`. docxtemplater 3.71.1 also renders footnotes, comments and docProps/core, and it finds the main part and headers by content type, not by file name.
Each of these was accepted with 201 and no warning, and rendered `{client.passport}` as empty text:
- footnotes.xml (Word writes this part itself when someone types in a footnote)
- a header named `word/hdrA.xml`
- `docProps/core.xml` title, which also carried `{representative.licence_number}` into the file's metadata
- a decoy `word/document.xml`, with the real main part at `word/main.xml`: the listed placeholders are the decoy's

Expected: read the same parts docxtemplater renders (its compiled parts), so that "{client.passport} is not a placeholder we know" holds wherever the tag is.

**B-4 Major — Send does not check that the representative is still eligible.** `svc:271-279` (completeness), `svc:354-358` (edit re-checks only when the field is sent), `svc:381-395`.
R drafted RH with T as representative, then T's CASE_MANAGER grant was ended (`ended_at, ended_by`). `GET /retainer-representatives` now lists only R. Yet RH showed `canSend: true, blockers: {}`, a fee-only edit kept T, and `POST /send` gave 200 SENT.
Expected: BR-3 and BR-6. The representative is an active person with a licence and the case-manager keys at Send, and otherwise it is a field blocker ("Choose the representative").

**B-5 Major — two people saving the same thing get 500, not a 409 they can act on.** Same cause as B-1, seen on its own:
- 4 parallel `PATCH /retainers/RB` with different fees: one 200 and three 500 (`FileKeyTaken`)
- 3 parallel `POST /retainer-templates/TA/versions`: one 200 and two 500
- 3 parallel Signed offline with different PDFs: one 200 and two 500
- Signed offline racing an edit: 500 (B-1b)

The data stayed consistent each time. Expected: 409 "Someone changed this … at the same time. Open it again." (`svc:197`, `svc:365` already have the words).

**B-6 Major — Sample fee "On a date" with no date is sendable.** `svc:75-81` makes the date optional for ON_DATE. `svc:271-279` neither blocks it nor lists it as missing.
`PATCH RA {"fees":[{"label":"Later","amountMinor":100,"when":"ON_DATE"}]}` gave `canSend: true`, `missing: []`. The document prints "Later: CAD 1.00 (On a date)" and that version was then sent.
Expected: BR-5 "On a date (date)". A missing date is refused at the field, or at least blocks Send. This is a money term in a signed agreement.

**B-7 Major — isolated copies write their files into the shared `studio/var/front-office-files`, and stopping a copy leaves them there.** `files:27` defaults to `FO_FILES_DIR` or `STUDIO/var/front-office-files`. It ignores `STUDIO_VAR`, which `tools/isolated.sh:83` sets per copy. That script promises "the demo database, its files … never touched" and "a stopped copy leaves nothing behind".
This run's files, including the four zip bombs, are in `studio/var/front-office-files/b77235c0-…` and `…/9dceb5bc-…`, next to a third firm folder from another run. Expected: under `STUDIO_VAR` (or the copy sets `FO_FILES_DIR`), removed by `stop`.

## Minor

**B-8 Minor — size refusals name the wrong limits.** `main:201` (shared upload filter, no FO-5 branch). Template 5 MB+1 and 6 MB, and signed PDF 10 MiB+1, each gave 413 "A file is larger than 25 MB … add files up to 25 MB each." Two `file` parts gave "Add at most 20 files at a time." Expected: "A template is at most 5 MB." / "The signed copy is at most 10 MB." / "Send one file." (`svc:154`, `svc:420` already have the words).

**B-9 Minor — a second live retainer is refused in generic words, after a full render.** `svc:296-298`, `main:209`. Both `POST /prospects/XH/retainers` while RH was live, and editing an Expired retainer after a new one took the prospect, gave 409 "Already exists — This already exists, or someone else saved the same thing at the same moment", with no `code`. The document was rendered and stored first (and with B-2's template, the server stalled first). Expected: check the live slot before rendering; 409 "This prospect already has a retainer in progress", code `RETAINER_LIVE`.

**B-10 Minor — fee amounts are checked through `String()`.** `svc:68-69`. `amountMinor: [100]` and `[[100]]` are stored as 100 cents. `amountMinor: 0` makes "CAD 0.00" count as the must-fill fee (`svc:274`: `canSend: true`). Exponent, float, negative, hex, full-width, "+5", " 100", over 10,000,000,000 and 1e21 were all refused (held). Expected: a number or a digit string only; whether CAD 0 fills "the fee" is for Lead B to say.

**B-11 Minor — with "everyone sees all" off, the representative can do everything, not only read.** `svc:121-131` grants the representative every action. R (representative of RC, not its prospect's owner) edited RC with 200. By the same path R may send, withdraw, record Signed offline and so make T's prospect Won. BR-3 grants "open that retainer page and the prospect's header". Expected: read only for the representative alone, or Lead B confirms that acting is meant.

**B-12 Minor — an empty edit makes a version and ends the client's request.** `svc:348-371`. `PATCH RK {}` on a SENT v3 gave DRAFT v4 identical to v3, with v3 ended UPDATED. `[1,2]` as the body did the same on a draft. Expected: 422 "Nothing to change." (as `svc:208` does for templates).

**B-13 Minor — template names that look alike pass the duplicate rule.** `svc:171` trims, and the index lowercases and folds spaces. "Café" in NFC and in NFD were both 201. "Race​ name" was 201 next to "Race name". Case, outer spaces, double inner spaces and 3 concurrent same-name uploads were refused correctly (1×201, 2×409 NAME_TAKEN; held). Expected: NFC and drop zero-width characters before saving.

**B-14 Minor — malformed ids give the reset wording.** `PATCH /retainer-templates/not-a-uuid`, `POST …/not-a-uuid/versions`, `GET /retainers/------------------------------------` (passes `svc:122`'s `[0-9a-f-]{36}`) all gave 404 "Not found (it may have been removed by a reset)" without a code (Prisma P2023 through the shared filter). This is not a 500 or a leak, but it is not the module's "No such … in your firm", code NOT_FOUND.

**B-15 Minor — the signed copy is checked only by its first 5 bytes, and the download has no `nosniff`.** `svc:421`. `%PDF-<html><script>…` was accepted as the signed copy and served as `application/pdf` with `Content-Disposition: attachment`, without `X-Content-Type-Options: nosniff`. Attachment makes this low risk. Expected: add `nosniff`, and check for `%%EOF` / a minimal structure.

## Held

1. Cross-firm: S against firm A's ids gets 404 "No such … in your firm" on retainer read, edit, send, withdraw, signed-offline, download-link, draft on A's prospect, template rename and new version. A naming B's template, B's staff as representative or B's person as signer: 422.
2. Download links: S using A's link 404; altered body with old MAC, flipped MAC, `..%2F`, `.extra`, an 801-character body: 404; no session 401. Expiry: the signed-copy link (`expiresAt` 20:03:37 UTC) gave 200 at 20:02:44 and 410 LINK_EXPIRED at 20:03:41. Keys stay in the firm's folder (`files:30-33`), covering part 1's B-2.
3. Permission keys: O 403 on upload, starter, withdraw, Signed offline; T 403 on upload. O may draft and send (PF-3's seed).
4. Visibility off: O 404 on every retainer, including one O drafted; R as representative read RC; R did not read RB (drafted by R, owned and represented by T); T did not read RA; O could not draft on R's prospect.
5. Races: 5 sends at once gave one SENT and four 409 (one event, one audit line). 4 Signed offline with the same PDF gave one 200 and three 409; the prospect was Won once, with one stage move from ENGAGED. Withdraw vs Signed offline: withdraw won, offline 409.
6. After SIGNED_OFFLINE: a second Signed offline, withdraw and edit were each 409 in the right words.
7. Part 1's rules hold under the API: no fee-row delete, one live retainer per prospect, only the current version is ended (as a 500 in B-1b). Part 1's B-7 and B-12 are covered: send touches only the current version, and edit can switch the template.
8. Uploads: PDF, ZIP fragment and 5 MiB of random bytes: "We could not read this file."; unclosed loop and mismatched close tag: unreadable; `{client.passport}`, `{__proto__}`, `{constructor}`, `{toString}`, `{@raw}`, nested loops, `{label}` outside the loop and an unknown tag in `header1.xml`: refused with the name. `{^fees}` and `{}` are accepted and render.
9. Rendering: a client named `José 李 O'Brien <b>&amp;` and a fee label `{client.email} <w:t>&amp; ]]> 费用` were escaped and printed as typed, with no second evaluation. Two rows at CAD 100,000,000.00 total CAD 200,000,000.00. The stored file's sha256 equals `original_sha256`.
10. Corporate prospect: no SIGNATORY gives a warning and the contact list, and Send is blocked at "Choose who signs."; a contact without an email: "The signer needs an email."; another prospect's person: 422; the client name is the company's.
11. Drafting on a Won prospect: 409 PROSPECT_CLOSED. A consultation agreement signed offline left the prospect ACTIVE (`prospectWon: false`). A retainer template used for a consultation agreement: 422.
12. Audit lines (`retainer.*`, `prospect.won`) and `module_event` payloads carry only ids, versions, hashes and flags; a regex for names, emails and licence numbers matched 0 rows. `read` removes the licence number. api.log logs `/files/:token`, not the token.
13. Inputs: a signed PDF of exactly 10 MiB is accepted. Refused at the field: an empty or 201-character reason; a missing file; a leading space before `%PDF-`; a ZIP named .pdf; zero-width, NBSP or ideographic-space-only labels; 121-character labels; 2026-02-29 and 1999-12-31; more than 50 rows. 2028-02-29 is accepted.

Note: this run's files, including the zip bombs, stay in `studio/var/front-office-files/b77235c0-…` and `…/9dceb5bc-…` (B-7: `stop` does not remove them).

## Round 2 — head `a79fa9e48` (copy `brk_fo5b` on :4436, stopped; its files went with it)

**Result: 9 fixed and 6 partly fixed of B-1..B-15; new: 1 Major (B-17), 2 Minor (B-16, B-18), 1 Minor note (B-19). No 500 left in api.log.**
- **Fixed:** B-1, B-4, B-5, B-6, B-7, B-10, B-11, B-12, B-14.
  - Races: the deterministic replays now give a 409 to the loser, and the next edit works (v2, v3). The next Signed offline with another scan also works. 6 parallel edits: 1×200, 5×409. 3 parallel versions and 3 Signed offline with different PDFs: 1 success each, 2×409.
  - Representative and dated fee: both block Send (`SEND_BLOCKED`).
  - Inputs: `[100]`, `[[100]]`, `true` and `{}` are refused. `{}`, `[1]` and `{"foo":1}` get "Nothing to change."
  - Representative with visibility off: reads, but gets 404 on edit, send and withdraw.
  - Bad ids: "No such … in your firm", code NOT_FOUND.
  - Files: under `isolated-brk_fo5b/`, gone after `stop`.
- **B-2 partly:** honest headers are refused at once, but a lying header is not. → B-17.
- **B-3 partly:** footnotes, odd header names, docProps, decoy main part and comments are now refused with the name. A header registered by content type as `word/hdr1.bin` is still rendered (the tag prints empty) and not read, because the scan keeps `\.xml$` (`docx.ts`). Crafted only, so Minor. Reading every part also brought false refusals → B-18.
- **B-8 partly:** between the limit and twice the limit the words are right ("A template is at most 5 MB.", "… at most 10 MB."). Above twice the limit (11 MB template, 20 MB PDF) and for two `file` parts, `main.ts:201` still says "25 MB" / "20 files".
- **B-9 partly:** a second draft gets RETAINER_OPEN before rendering. Editing an Expired retainer after a new one took the prospect still renders first, then gets "This changed at the same time (someone else saved it)" → B-16.
- **B-13 partly:** NFD "Café" gives NAME_TAKEN against NFC; U+200B gives "hidden characters".
- **B-15 partly:** `%PDF-<html>…` without `%%EOF` is refused, and downloads send `nosniff`. `%PDF-<html><script>…</script></html>\n%%EOF` is still accepted as the signed copy (the check is header plus trailer only); low risk with `attachment` and `nosniff`.
- **Suffix keys held.** The client never supplies a key. Links name only the key stored in the row, and the database ties each key to its row, version and kind. The suffix is 48 random bits, so a reused or forced key would need a collision. A link now also binds its person: O got 404 with R's link.

**B-16 Minor (new) — the 409 mapping turns every database refusal into "someone else saved it".** `service.ts` `tx()` maps any message naming `fo_retainer…` to CHANGED. The DB text rule (`fo_retainer_text_ok`: single-line labels, no control characters) is stricter than `str()`, so each of these got 409 "This changed at the same time (someone else saved it). Open it again.":
- a fee label with `\n`, `\t` (as pasted from a spreadsheet) or U+2028, on draft and on edit
- a withdraw reason with U+0007
- a Signed offline reason with U+0001 (its PDF stays stored)

Retrying never helps. Expected: 422 at the field (refuse in `str()` what the DB refuses), and keep CHANGED for real races only.

**B-17 Major (new; B-2 reopened) — the zip limit trusts the declared sizes, and pizzip inflates the whole part before it compares them.** `docx.ts` `load()` reads `_data.uncompressedSize`. pizzip's `prepareContent` runs `pako.inflateRaw` in full, then throws "size mismatch".
- Round 1's bomb with its size patched to 4,000 bytes: 422, but after 1.4 s and RSS 0.6 → 1.4 GB.
- A 3.1 MB file (under the 5 MB limit) holding 3 GB of spaces declared as 4,000 bytes: 422 after 16.6 s, peak RSS 6.6 GB. Another user's `GET …/placeholders` waited 14.6 s.

I did not run two at once: the shared machine has 16 GB. Expected: inflate with a real output cap (`zlib.inflateRawSync(…, { maxOutputLength })` per part, total ≤ 30 MB) before handing the zip to pizzip, or refuse when the actual size differs from the declared one.

**B-18 Minor (new) — reading every XML part refuses ordinary Word files over text that is never rendered.** docxtemplater renders `w:t`, `a:t`, `m:t`, `vt:lpwstr` and the docProps fields. The scan strips tags from every part, so these were refused with UNKNOWN_PLACEHOLDER (each also had valid `{client.name}` and fee tags):
- A Zotero citation field (`w:instrText` `… CSL_CITATION {"citationID":…,"properties":{"formattedCitation":"(Smith, 2020)"}}`): refused as `{"formattedCitation":"(Smith, 2020)"}`.
- A Word bibliography source (`customXml/item1.xml` `<b:Guid>{1B2C3D4E-…}</b:Guid>`, written by Insert Citation): refused as `{1B2C3D4E-…}`.
- A tracked deletion (`w:delText`) of an old tag: refused.

A python-docx file, the python-docx default template and the repo's `commercial/plan.docx` were accepted. A GUID in a `vt:lpwstr` custom property was refused correctly (it renders). Expected: read the text elements docxtemplater renders, in the parts it renders.

**B-19 Minor note (new) — a refusal names every unknown placeholder.** A 3.3 MB file with 1.5 million `{uN}` tags stalled the server for 11 s and returned a 153 MB 422 body. Expected: name the first few (for example 20) and say "and N more".

## Round 3 — head `0b5518de9`, diff only (copy `brk_fo5c` on :4437, stopped; its files went with it)

**Result: B-9 (second case), B-16, B-17 and B-18 fixed; B-3 fixed for the `.bin` header but still open for two other parts (B-21); B-19 partly fixed. New: 4 Minor (B-20..B-23), no Major. api.log has 4 × 500 (B-20, B-22).**
- **B-17 fixed.** Each of these came back 422 "We could not read this file." in ≤ 0.08 s, and another user's request in parallel took ≤ 0.01 s:
  - round 1's bomb (400 MB, honest header)
  - the same bomb declaring 4,000 bytes
  - 3 GB declaring 4,000 bytes in 3.1 MB
  - 4.9 GB declaring 4,000 bytes in a 5.1 MB upload (under the 5 MiB limit)
  - 8 lying parts of 600 MB each in 4.9 MB

  One leftover → B-20.
- **B-18 fixed.** These were all accepted with the right placeholders: Zotero field, bibliography `{GUID}`, tracked deletion, python-docx file, python-docx default template, repo `commercial/plan.docx`. A GUID in a `vt:lpwstr` custom property is still refused, and that is right: docxtemplater renders it.
- **Consistent with docxtemplater (held):** text split across runs with `w:proofErr` and bold, `w:t xml:space="preserve"`, a smart tag, a DATE field with its displayed result, braces inside a field code (`instrText`), and `&#123;…&#125;` entities. The scan and the render agree on each.
- **B-3 fixed for the `.bin` header** declared in `[Content_Types].xml`; it is now refused with its name. Two parts are still missed → B-21.
- **B-19 partly fixed.** The answer now names 10 placeholders "and N more", and there is a cap of 2000. But the cap counts only after docxtemplater has compiled every tag (`docx.ts` `open()` comes before the counter). The 3.3 MB file with 1.5 million tags still took 8.6 s, and another user's `GET …/placeholders` waited 7.1 s. Above 2000 tags the answer is the bare "We could not read this file." with no reason. Owner and Admin only, file refused, so Minor. Count the `{` in the raw text before building the Docxtemplater, and say "more than 2000 placeholders".
- **B-16 fixed.**
  - Labels with `\n`, `\t`, U+2028 or U+000B, a withdraw reason with U+0007 and an offline reason with U+0001 → 422 at the field ("One line, no tabs." / "Remove control characters.").
  - A multi-line reason with `\r\n` and `\t` is accepted.
  - U+0085 (NEL) and U+200B in a label are accepted, and the database accepts them too: no 500.
- **B-9 second case fixed.** Editing an Expired retainer after a new one took the prospect → 409 RETAINER_OPEN.

**B-20 Minor (new) — a part whose declared size is too small, inside the 30 MB cap, gives 500.** `docx.ts:78` (`zip.file(name)?.asText()` outside the `UnreadableDocx` guard). A 34 KB upload with 29 parts of 1 MB each, each declaring 4,000 bytes: the new zlib pre-pass passes it (29 MB < 30 MB). Then pizzip's own inflate throws "Bug : uncompressed data size mismatch" (`zipEntry.js:69`), and the answer is 500. Crafted files only, nothing is stored, and the server is not slowed. Expected: refuse a part whose inflated size differs from its declared size in `load()`, or wrap the reads in `placeholdersOf` → 422 "We could not read this file."

**B-21 Minor (B-3 rest) — two kinds of text docxtemplater renders are still not read.** docxtemplater renders `m:t` (equations) and the SmartArt data part (`diagramData+xml`, `a:t`). The scan reads only `<w:t>`.
- `{client.passport}` inside an equation in the body: upload 201, placeholders `[client.name, fees, fees.label]`, and the render prints it empty.
- `{client.passport}` in `word/diagrams/data1.xml` (declared as diagramData): the same.

Word produces both (Insert Equation, SmartArt), but they are rare in a retainer. An unknown tag prints empty; no data leaks. Expected: read `m:t` and, in diagram data, `a:t` (docxtemplater's own `tagsXmlTextArray`).

**B-22 Minor (new) — a template name that grows under NFC gives 500.** `service.ts` `nameOf120` checks the 120 limit in `str()`, then calls `.normalize("NFC")`. NFC expands U+FB2C to 3 code points and U+0958 to 2. Three cases each gave 500, logged as "unexpected database refusal … fo_retainer_template_name_check":
- upload with a 41 × U+FB2C name (41 → 123 characters)
- upload with a 120 × U+0958 name
- rename `PATCH` with the 41 × U+FB2C name

The upload leaves its stored file behind. Expected: normalise first, then check the length (422 "at most 120 characters").

**B-23 Minor (new) — a declared part that is never rendered can still refuse a template.** The glossary document (`word/glossary/document.xml`, the building blocks Word keeps for content controls and Quick Parts; content type `…document.glossary+xml`) is read because it is declared. docxtemplater does not render it. A glossary entry "Insert {Client Name} here" → 422 "{Client Name} is not a placeholder we know." Rare. Expected: read only the content types docxtemplater renders (main, header, footer, footnotes, comments, the docProps, diagram data).

**Held:** no 500 other than B-20 and B-22. Every refusal of the new checks is 422, with a code.

## Round 4 (two paths) — head `1d42f813f` (copy `brk_fo5d` on :4438, stopped)

**Result: both fixes hold for what they cover. New: B-24 Major (FO-5f), B-25 Minor, B-26 Minor note. No 500.**
- **Stale save on Edit holds.**
  - `expectedVersion` missing, `"1"`, `1.5`, `null`, `true` or `[1]` → 422.
  - `-1`, `0`, `1e0` against v3, and 2^53+1 → 409 CHANGED. (−1 and 0 should be 422; cosmetic.)
  - `1.0` is the JSON number 1, so it was accepted.
  - 6 tabs saving v3 at once → one 200 (v4), five 409; one fee row set. A later save that still says 3 → 409.
  - The lock check in the transaction still catches a send that lands mid-edit.
- **Download re-check holds.** With "everyone sees all" off:
  - T's link (T owner and representative) gave 200. After the owner moved to R it still gave 200, because T was still the representative.
  - After the representative also moved to R (Edit with `expectedVersion`), the same link gave 404.
  - After the setting went back on: 200.
  - Firm B and O with R's link: 404 and 404.
  - After withdraw and after Signed offline, R's links (version and signed copy) still give 200, which is correct: the retainer stays readable (BR-10). The representative keeps read access after an owner change.
  - Crafted keys: links name only keys stored in rows, and the DB ties each key to its retainer. `FileKey` refuses `.`/`..` segments and upper case, so `retainers/<visible id>/../<other id>/…` cannot be expressed. Keys outside `retainers/` get 404.

**B-24 Major (new, scope FO-5f) — Send and Signed offline act on whatever version is current, not the version the person saw.** Only Edit takes `expectedVersion` (`service.ts` `send()`, `signedOffline()`; `routes.ts` send, signed-offline). STANDARDS l.27 [M]: stale save → 409.
- **Send:** R's screen showed draft v5 with a fee of CAD 44.44. T saved v6 with "Changed by T" CAD 999,999.00. R pressed Send: 200, and **v6 was sent**, a fee R never saw. `POST …/send {"expectedVersion":99}` is ignored (200).
- **Signed offline:** R's screen showed draft v1 with "Paper fee" CAD 1,500.00, and the paper signed was v1. T saved v2 with CAD 5,000,000.00. R recorded Signed offline (`expectedVersion=1` in the form is ignored): 200. **v2 is filed as the version signed on paper**, the prospect is Won, and the audit line says `version: 2`. This cannot be undone (BR-11), so the permanent record shows a fee the client never signed.

Expected: both routes require the version shown (`expectedVersion`) and answer 409 CHANGED on a mismatch, the same check as Edit. Withdraw has the same gap but changes no money: Minor, the same fix.

**B-25 Minor (new) — an Edit made against a draft silently ends a request a colleague has just sent.** Send does not raise `current_version`, so `expectedVersion` still matches. Tab A showed draft v4; T sent v4 (200). Tab A saved with `expectedVersion: 4`: 200, v4 ended UPDATED, the retainer is back to DRAFT v5, and the client's live link is ended. The response shows the change, and every version is kept, so no data is lost. Expected: the stale check covers status too, or the version is raised on Send, so tab A gets 409 "This agreement was sent meanwhile".

**B-26 Minor note — the link answer after a permissions change says "No such retainer in your firm."** That comes from `visible()`, not "No such file". It leaks nothing, so it is only wording.

## Round 5 (edit, send, Signed offline, download) — head `06f086177` (copy `brk_fo5e` on :4439, stopped)

**Result: B-24 fixed. No Major on money or access remains in these four paths. Still open, both Minor, for FO-5f: B-25 and the withdraw gap. No 500.**
- **B-24 Send fixed.** R saw v1 (CAD 44.44). T saved v2 (CAD 999,999.00). R's Send with `expectedVersion: 1` → 409 CHANGED "This agreement has a newer version (2) than the one you saw (1)", and nothing was sent.
  - Missing body, `{}`, `"2"`, `2.5`, `null`, `0`, `-1`, `true`, `[2]` → 422 INVALID at `expectedVersion`.
  - `3` (ahead of the current version) → 409.
- **B-24 Signed offline fixed.** The paper was v1 (CAD 1,500.00). T saved v2 (CAD 5,000,000.00). Signed offline with `expectedVersion=1` → 409; nothing filed and the prospect not Won.
  - Multipart: missing, empty, `+2`, `2.0`, `0`, `1e0`, Arabic-Indic `٢`, `2,3`, and two `expectedVersion` fields → 422.
  - `02` is read as 2. curl trims spaces around `-F` values, so `" 2"` arrived as `2`.
- **Races (HTTP, in parallel, same retainer at v1):**
  - Edit + Send + Signed offline, 5 rounds: exactly one success each time; the other two got 409 CHANGED. When Signed offline won, the version filed was v1 with its fee (100), the version everyone saw. When Edit won, nothing was sent or filed.
  - Edit + Send, 4 rounds: Edit won every time (Send's lock check failed), and nothing was sent.
- **Edit re-check holds** (round 4): the type checks now go through the shared `expectedVersionOf`, so `0` and `-1` now get 422.
- **Download re-check holds** (round 4 replay, "everyone sees all" off):
  - The owner+representative's link gave 200. After the owner moved, it still gave 200 (still the representative).
  - After the representative also moved: 404. With the setting on again: 200.
  - Links still work after withdraw. Firm B and O with R's link: 404 and 404.
- **B-25 Minor still open (FO-5f).** T sent v1 (`expectedVersion: 1`). R, still on the draft view, saved with `expectedVersion: 1`: 200. v1 ended UPDATED and the client's request ended. This is the cause from round 4: Send does not raise `current_version`. No money is sent or filed unseen: the next Send or Signed offline needs `expectedVersion: 2`, which only comes from opening v2.
- **Withdraw Minor still open (FO-5f).** `POST …/withdraw {"reason":"x","expectedVersion":1}` on a SENT v2 → 200 WITHDRAWN; the version is ignored. It changes no money or access, and the withdrawn retainer stays readable.
- **B-26 note unchanged.**
