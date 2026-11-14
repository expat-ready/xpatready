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
