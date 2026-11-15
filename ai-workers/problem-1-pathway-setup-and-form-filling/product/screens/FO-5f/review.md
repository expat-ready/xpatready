# FO-5f (retainer hardening, FO-5 part 2's Minors): independent review, round 1 (P-303)

* **PR:** #1791, branch `claude/quirky-knuth-rog8nh`. **Commit reviewed:** `7338fdfa23921d5df5326b7111e31d1be4117a5d`. The branch head is now `0145730de`; it adds only `screens/FO-5f/break-report.md` and `qa/built/FO-5f.md`. Reviewer: Opus, did not build it. Date: 15 Nov 2026.
* **Read:** row FO-5f and the Lead B decisions above it (`lead-b-rows-2026-11-14.md` "Rev 16.8", `origin/lead-b-front-office`); brief `lead-b-briefs/FO-5f.md`; `screens/FO-5/review-part2.md` and `break-report-part2.md` (B-8, B-15, B-19 to B-26, r3-m1, r3-m2); `git diff origin/main...7338fdfa2` (5 files); the part 1 triggers (`prisma/migrations/20261114210000_fo5_retainer_tables`); docxtemplater 3.71.1 `filetypes.js`, `modules/common.js`, `docxtemplater.js` `getTemplatedFiles`. The breaker's report was read after my own runs. Paths are under `prototype/studio/`.
* **Scope:** API-only row (the screens are FO-5s), so BIC-01 to BIC-20 (case-side screens) and the screen walks (keyboard, 1024 px, 200 %) are N/A.

## Runs
* `tests/check_fo5_retainers.ts` on 7338fdfa2: **203 passed, 0 failed** (exit 0, about 5 min).
* **Mutants** (one rule removed per copy, full suite rerun on each): A, Edit's `expectedStatus` check → 2 FAIL (B-25 line, then the suite stops); B, Withdraw's version check → 2 FAIL; C, Withdraw's status check → 2 FAIL; D, item 9 reverted plus B-26's 404 wording removed plus the copy path's `for update` check removed → 3 FAIL (item 9 twice, B-26). **Not caught by any test:** removing the copy path's lock check (`service.ts:559`). J3 and J4 show the part 1 triggers still hold under a race.
* `graph.mjs --check` exit 0 (G1 0, G2 0, G3 55, G4 0, G5 0, G6 17). `tsc -p api/tsconfig.json --noEmit` shows no error in a touched file.
* HTTP journeys on isolated copy `rv_fo5f` :4436 (`PLATFORM_IDENTITY=local PLATFORM_SAMPLE_SEED=on`, FO-1a's seed and prospects written as the builder's walk does), as user-R, user-T and user-O. The copy is now stopped. Full report: `journey-test-reviewer-2026-11-15.md`.
* I did not rerun case feed, b164, fo3, pf21 or pf25.

## The 13 items
| # | Item | Holds? | Evidence |
|---|---|---|---|
| 1 | `retainer.request_ended` on an edit that ends a live request | yes | J1: exactly 1 event `{version: 1, reason: "UPDATED"}`, ids only; none on a draft's edit (test) |
| 2 | `expectedStatus` on Edit and Withdraw; `expectedVersion` on Withdraw (B-25) | yes | J1: T's Draft-page edit after R's Send → 409 "This agreement is now sent (your page showed a draft)."; J4: a 3-way race gives one 200 and two 409s; mutants A, B, C caught |
| 3 | `signedVersion` on Signed offline | **partly** | J2: version 3 = a copy of version 1 (CAD 1,500.00, the same sha256), filed; audit names 1 and 3. But see **M-2** and **m-2** |
| 4 | `m:t` / `a:t` placeholders refused with the plain sentence | yes | test and probe; see **m-4** (a false refusal) |
| 5 | Cap counted before docxtemplater compiles; the refusal says why | **partly** | balanced tags are capped (1.5 M in under 3 s). Lone braces are not counted: **M-1** |
| 6 | A part that lies about its size → 422 "damaged", not 500 | yes | test (local and central sizes rewritten) |
| 7 | Name length checked after NFC | yes | tests: upload and rename, 65 → 125 characters |
| 8 | Glossary not read | yes | tests, plus a probe: a glossary with 200,000 tags is skipped in 23 ms and is not compiled |
| 9 | "missing" uses the template version the agreement was made from | yes | mutant D caught; see the note under Minor |
| 10 | `tx()` log: code and constraint only | yes | test with a personal value in message and meta |
| 11 | Refused download says "No such file" | yes | mutant D caught; see **m-3** |
| 12 | Shared 413 names no size; each route names its own | yes as worded | 11 MB template → 413 "This file is too large for this upload."; 6 MB → 422 "at most 5 MB". See **m-1** |
| 13 | B-15 header test | yes | the controller's download sends `attachment`, `nosniff`, `application/pdf` |

**Design choice (Signed offline keeps the row's template, signer and representative).** The template part holds up. Moving `template_*` back to version k's would make `fo_retainer_write` demand the template's current, active version (`migration.sql:352-371`), and the filed bytes are version k's anyway. The signer and representative part does not hold up. The trigger allows those columns to change whenever `current_version` moves (`migration.sql:345-351`, `AND NOT bumped`); the real obstacle is that version rows store names, not ids. Keeping them is forced, but keeping them silently is not acceptable: see M-2.

**`main.ts` line.** Acceptable as a one-line hook only if the case-side intake keeps its number. As written it does not: see m-1.

## Findings
**M-1 Major: a template of about 2 KB made only of lone `{` stalls the server, then crashes it (item 5 not met).** `api/src/front-office/retainers/docx.ts:95,104` counts only complete `{…}` pairs (`TAG = /\{([^{}]*)\}/g`). A run of unpaired `{` or `}` counts 0, so `compile(zip)` at `docx.ts:107` lexes every delimiter and gathers one error per brace.
* Repro, direct: `placeholdersOf()` on a .docx whose body is `{client.name}` plus 300,000 × `{` (1,210 bytes) takes 13.4 s at 821 MB RSS. The same file with `}` takes 15.4 s; with `{x ` × 300,000, 13.4 s.
* Repro, HTTP as user-R: `POST retainer-templates` with the 300,000-brace file → 422 after 14,253 ms. user-T's `GET retainers/:id`, sent 200 ms later, failed with ECONNRESET.
* With 1,500,000 × `{` (2,341 bytes) the API process died after 65 s: `FATAL ERROR: … JavaScript heap out of memory` in `var/isolated-logs/rv_fo5f-api.log`. Every firm on the server goes down.
* `main` behaves the same (100,000 braces: 4.2 s on main, 4.3 s on the PR), but item 5 and B-19 ("count the `{` in the raw text before building the Docxtemplater") ask for exactly this to be closed.
* **Fix:** count delimiters, not pairs. Refuse when the `{` and `}` characters in the text runs exceed `2 × DOCX_MAX_TAGS`, with the same sentence. Add a fail test: 1.5 M lone `{` refused in under 3 s.

**M-2 Major (I agree with the breaker's M-1, reproduced on my own): after Signed offline names an earlier version, the record names other people than the signed paper.** `service.ts:562` sets only `{ status: "DRAFT", currentVersion: filed }`.
* Repro J2: v1 prepared with representative user-R; v2 edited to user-T and sent; Signed offline with `expectedVersion 2, signedVersion 1` → 200, v3 filed.
* v3's `representative.name` = "Representative (Sample)" (user-R, as on the paper), but `GET retainers/:id` gives `representativeStaffId` = user-T.
* BR-3 read access and anything downstream that reads the row (FO-6, FO-7) follow user-T. Neither the audit line nor the page says the two differ.
* **Fix, no schema:** refuse with a plain 409 when version k's representative or signer (`representative.name`/`licence_number`, `signer.name`/`email`) differs from the current version's; or get a Lead B ruling in the PR and name the mismatch in the audit line and the page. Either way, add a pass and a fail test.

**m-1 Minor: the case-side form intake loses its size limit and "Nothing was added".** At `api/src/main.ts:201`, `POST /api/intake` with a 26 MB PDF (`x-actor: author`) now gets 413 "This file is too large for this upload.". On main the answer was "A file is larger than 25 MB. Nothing was added; add files up to 25 MB each." The form intake (`web/src/components/forms.tsx:37`) has no size check in the browser, so this is the only answer a person sees. Row item 12's "each route's own limit message names its number" is then not true for the intake or the form library upload (`form-library.ts:504`). `mb` at `main.ts:200` is now unused. **Fix (still one line):** keep the 25 MB sentence when the path is the intake or the library upload (this uses `mb`), and use the new sentence plus "Nothing was stored." elsewhere.

**m-2 Minor (I agree with the breaker's m-1): the version the client signed on paper is labelled "Not signed".** `service.ts:417`. In J2 the notes are `1:Not signed`, `2:Not signed`, `3:Copied from version 1, signed on paper`. Lead B marks the *newer* versions "not signed". **Fix:** leave the `copiedFrom` version out of "Not signed" (for example "Signed on paper, filed as version 3"), with a test.

**m-3 Minor: a database fault on a download becomes "No such file".** At `service.ts:599`, `catch { notFound("file"); }` swallows every error from `visible()`, including Prisma's connection errors, so an outage answers 404 instead of 500 and leaves no log. **Fix:** remap only an `HttpException` with status 404, and rethrow anything else.

**m-4 Minor: item 4 refuses braces in parts docxtemplater never renders.** At `docx.ts:102`, a chart title `<a:t>Fees {2026}</a:t>` in `word/charts/chart1.xml` → 422 PLACEHOLDER_NOT_FILLED. docxtemplater renders only main, header, footer, footnotes, comments, settings, docProps, diagramData and diagramDrawing parts (`filetypes.js`, `modules/common.js:20`). This is the same family as B-23. **Fix:** apply the `m:t`/`a:t` check only to those content types.

**m-5 Minor: the copy path's race check has no test.** Mutant D removed the `for update` check at `service.ts:559` and every test still passed. **Fix:** add a test with two concurrent copy-path calls (J3 shows the expected outcome: one 200, one 409, three versions, one `retainer.signed_offline`).

*Notes, not findings:*
* Item 9 parses the stored template on every page read once the template has a newer version (`service.ts:426`). That is fine at today's sizes; cache by `templateFileKey` if FO-5s lists pages.
* `customXml/item*.xml` with the coverPageProps namespace is rendered by docxtemplater but skipped by the scan (since before this PR). That is for Lead B, not this row.
* The breaker's m-2 (no `expectedStatus` on Signed offline) is covered by Lead B's ruling ("`expectedVersion` stays required as the stale check").

## D1-D20 (API row; D8, D12-D14 and D17-D20 are N/A or "simulated only")
D1 3: items 3 and 5 partly met · D2 3: M-2 leaves the record inconsistent; races are refused (J4) · D3 4: one stale check, one copy path · D4 N/A · D5 2: M-1 crashes the process; double click and two tabs are safe (J3, J4) · D6 4: audit names 1 and 3; events once · D7 N/A · D9 4: every 409 says "Open it again." · D10 3: m-1, m-2 · D11 4: field-level 422s (`expectedStatus`, `signedVersion`) · D15 2: M-1 · D16 4: 203 passed, 4 of 5 mutants caught, m-5 · D18 3: M-2.

## What I could not check
* No screen exists in this row, so there was no visible-browser walk, no axe check, and no 1024 px or 200 % zoom.
* The Signed offline panel's words ("the newer version will not be the signed one") belong to FO-5s.
* CI on the PR was not observed.
* I did not rerun the other suites the builder lists.

**To fix before Approve:** M-1 and M-2 (each with its pass and fail test). The Minors may be fixed here or recorded.

**Round 1 verdict:** Block (`7338fdfa2`).

## Round 2 (diff-only, P-277, P-603): `git diff 7338fdfa2 f3505fc58 -- prototype/studio`
* **Commit reviewed:** `f3505fc583d3ad228161ebd15efcb57c0f6bbec0`. Read: the diff (4 files) and docxtemplater 3.71.1 `get-content-types.js` (to check the new cap's reach).
* `tests/check_fo5_retainers.ts` at f3505fc58: **223 passed, 0 failed** (exit 0).

| Round 1 | Fix | Holds? |
|---|---|---|
| M-1 brace flood | `braceCount` over `w:t`, `m:t`, `a:t` and docProps text, refused above 2 x cap before `compile` | **partly**: a body flood is refused in 15 ms (my probe: 200,000 lone `{` in `word/document.xml`). Parts the scan skips are still compiled: **M-1 still open** below |
| M-2 signed record's people | ids recorded in the merge values; the copy restores signer and representative in the same bump; pre-FO-5f versions filed only when the people match | yes. Tests: user-T loses read access after filing v1 (404); legacy refusal 409 and legacy pass; the audit names both ids. Restoring them within the bump is allowed by `migration.sql:345-351`; the template columns stay, as judged in round 1 |
| m-1 intake words | path match keeps the 25 MB sentence for `/api/intake` and `/api/library/forms/upload` (both under `@Controller("api")`); `mb` used | yes |
| m-2 "Not signed" | version k: "Signed on paper; filed as version N" | yes (test) |
| m-3 catch-all | only a 404 `HttpException` becomes "No such file" | yes (test with a failing database) |
| m-4 chart braces | chart parts are skipped by path and content type | yes (test); SmartArt is still refused |
| m-5 lock untested | a FilesPort hook sets VIEWED between the read and the transaction → 409 | yes (test) |
| breaker m-3, m-4 | stale wording for a higher version; `^[1-9]\d{0,8}$` | yes (tests) |

**M-1 Major (round 1's M-1, not fully fixed; not a new defect): the brace cap covers only the parts the scan reads, but docxtemplater also compiles parts the scan skips.** At `docx.ts:97` the scan reads only `*.xml` files and `Override` parts, and `docx.ts:105` skips every `customXml/` part. docxtemplater compiles more than that (`get-content-types.js` `collectContentTypes`; `docxtemplater.js` `getTemplatedFiles`):
* `customXml/item*.xml` whose namespace is `coverPageProps`, and
* any file typed by a `<Default Extension="…">` rule, whatever its name.

The braces in those parts never reach `braces` (`docx.ts:113`), so `compile(zip)` at `docx.ts:118` still lexes them all.
* Repro (direct `placeholdersOf`, script `scratchpad/rev/r2.mts`), body `{client.name}` plus 200,000 lone `{` placed in:
  * `customXml/item1.xml` (`<CoverPageProperties xmlns="http://schemas.microsoft.com/office/2006/coverPageProps"><Abstract>{{{…`, 1,299 bytes): 9,036 ms, 575 MB;
  * `word/h.bin`, typed by `<Default Extension="bin" ContentType="…wordprocessingml.header+xml"/>` (1,282 bytes): 8,937 ms, 576 MB.
* With 1,500,000 `{` in the customXml part: `FATAL ERROR: … JavaScript heap out of memory` after 72 s, the same crash as round 1, now behind one more step.
* Both parts are really rendered: `renderDocx` printed `Passport:  Email: a@example.com` from `word/h.bin` and `For ` from the cover part. So `{client.passport}` placed there is also never checked and prints blank (`placeholdersOf` returned only `["client.name"]`). That is B-3's rest and item 4's "never printed blank", by the same cause.
* **Fix:** read for the cap, and for placeholders, every part docxtemplater will compile:
  1. Resolve each zip entry's type as `collectContentTypes` does (Overrides, then `Default` by extension).
  2. Take the docx types (main, header, footer, footnotes, comments) and the common ones (settings, core, app, custom, diagramData, diagramDrawing), plus `customXml/item\d+.xml` holding the coverPageProps namespace.
  3. Alternatively, refuse a Word XML type declared on a name that is not `.xml`.
* Add fail tests: 1.5 M `{` in a coverPageProps part, and in a `Default`-typed `.bin` header, each refused in under 2 s.

*Notes, not findings:* the new merge values `signer.person_id` and `representative.staff_id` are shown in the page's `version.values`. They are staff-only ids, and a template naming them is refused as an unknown placeholder (they are not in `PLACEHOLDERS`).

**To fix before Approve:** M-1 (the parts above, with the two fail tests). Nothing else is open from round 1 or from the breaker's Minors in this diff.

**Round 2 verdict:** Block (`f3505fc58`).

## Round 3 (diff-only): `git diff f3505fc58 28f635a9a -- prototype/studio`
* **Commit reviewed:** `28f635a9a3a62fe9b12493cbfaee845db0f392a0`. Read: the diff (`docx.ts`, `service.ts`, the test file) and docxtemplater 3.71.1 `get-content-types.js` `collectContentTypes` (called at `docxtemplater.js:558`).
* `tests/check_fo5_retainers.ts` at 28f635a9a: **230 passed, 0 failed** (exit 0).

| Item | Holds? |
|---|---|
| Round 2 M-1 rest: Override-else-Default types, parts typed XML read, coverPageProps customXml read, braces counted in the raw XML | **partly**. Each round-2 repro is refused (`word/h.bin` under `Extension="bin"`: 200,000 `{` → TOO_MANY_PLACEHOLDERS in 14 ms; the cover part per the new tests). Over-counting braces outside text tags is safe: a Word file carries only a few (GUIDs in `settings.xml`, `docProps/custom.xml`). The Default lookup does not match docxtemplater's: **M-1 still open** below |
| breaker r2-m2: licensing body in the old-version comparison | yes |
| breaker r2-m3: no `blockers` unless EDITABLE | yes |

**M-1 Major (rounds 1 and 2's M-1, still the same defect: the cap and the placeholder scan miss parts docxtemplater compiles).** The two sides read a Default rule differently:
* `docx.ts:98` looks up the text after the last `.` of the name (lower-cased), and `docx.ts:96` drops an empty `Extension`.
* docxtemplater types a file by a plain suffix test, `name.slice(name.length - extension.length) === extension`: no dot, case-sensitive, first match wins, and `Extension=""` matches every file that has no Override.

A part docxtemplater types as a header can therefore still fall outside `parts` (`docx.ts:104`), so its braces never reach `braces` (`docx.ts:120`). Repro (direct `placeholdersOf`, then `renderDocx`; script `scratchpad/rev/r3.mts`), with `{client.name}` in the body:
* `<Default Extension="in" ContentType="…wordprocessingml.header+xml"/>` with a header at `word/h.bin` (docxtemplater: "h.bin" ends with "in"): the scan lists `["client.name"]`, but the render prints `Passport ` (`{client.passport}` blank). With 200,000 `{` there: 10,355 ms, 568 MB. With 1,500,000: `FATAL ERROR: … JavaScript heap out of memory` after 73 s.
* `<Default Extension="" …header+xml/>` with `word/h.bin`: the same (200,000 `{` → 10,922 ms, 581 MB).
* `<Default Extension="hdr" …header+xml/>` with a header at `word/hdr` (no dot): not read, rendered blank.
* Control: `Extension="bin"` is refused in 14 ms, so the miss is only the suffix rule.

**Fix (small, in `placeholdersOf`):** type each file exactly as `collectContentTypes` does: Override by its exact name, else the first `Default` in document order whose `Extension` is a suffix of the name, empty included, case-sensitive; then read every file typed XML. A tighter alternative: refuse as "damaged" any `Default` that gives a Word part type (main, header, footer, footnotes, comments, settings, the docProps, diagram data or drawing), or that has an empty Extension. Word declares those parts by Override only. Add fail tests: 1.5 M `{` under `Extension="in"` and under `Extension=""`, each refused in under 2 s, and `{client.passport}` there refused.

Per the coordinator, this is the same defect as round 1's M-1, not a new Major.

**To fix before Approve:** M-1 (the suffix rule, with its tests). Nothing else is open in this diff.

**Round 3 verdict:** Block (`28f635a9a`).

## Round 4 (final, fresh reviewer, diff-only): `git diff 28f635a9a 2b5a79e1d -- prototype/studio`
* **Commit reviewed:** `2b5a79e1d3a970649e306948a3e38d8a246c3ee5`. Reviewer: Opus, a fresh session that did not build this row or review rounds 1-3. Read: the diff (`docx.ts`, one message in `service.ts`, the test file) and docxtemplater 3.71.1 `get-content-types.js`, `get-relation-types.js`, `docxtemplater.js` (`compile`, `updateFileTypeConfig`, `getTemplatedFiles`), `modules/common.js`, `filetypes.js`, `content-types.js`, `file-type-config.js`.
* `tests/check_fo5_retainers.ts` at 2b5a79e1d: **247 passed, 0 failed** (exit 0, 36 s). `tsc -p api/tsconfig.json --noEmit` shows no error in a touched file.
* Probes: direct `placeholdersOf` / `renderDocx` (scripts `probe.ts`, `render.ts`, `ct.ts`, `six.mts`, `real.mts` in `scratchpad/rev4/`). HTTP: isolated copy `rv4_fo5f` on :4437 (`http.mts`), upload as user-R with user-T's read sent 200 ms later; the copy is stopped. Baseline: 28f635a9a's `docx.ts` run from a scratch copy (`docx_old.ts`).

| Round 3 item / question | Holds? |
|---|---|
| The six ways in (Extension "in", empty Extension, no dot, single-quoted Override, header under word/charts, header under customXml) | **yes**. Each is read and refused at 2b5a79e1d; at 28f635a9a all six listed only `client.name` (`six.mts`), so the new tests fail on the old code |
| Typing by docxtemplater's own `getContentTypes` / `collectContentTypes` | yes for the typing itself. But the name filter after it and the parse before it leave M-1 open and add N-1 below |
| Deep import of `docxtemplater/js/get-content-types.js` | acceptable: docxtemplater is pinned exactly (`package.json:33`, `"3.71.1"`), it has no `exports` map, and the cast uses `unknown`, not `any` (`docx.ts:21-24`). If an upgrade moves the file, the module fails at load, loudly, not silently |
| False refusals on real Word files | none found: a Word-origin file (the python-docx default template, with `customXml/itemProps1.xml` GUIDs, styles, settings, header, docProps) lists `client.name, fees, fees.amount, fees.label, firm.name` |
| breaker r2-m1 (legacy refusal wording) | yes: `service.ts:559` no longer promises "Edit the agreement back"; two tests |
| breaker r2-m2 (licensing body) | yes (already at 28f635a9a) |

**M-1 Major (rounds 1-3's M-1, still open): parts docxtemplater compiles still escape the brace count and the placeholder read, by their name.** `docx.ts:123` skips any part named `…[Content_Types].xml` or `….rels` before counting, whatever its type. docxtemplater compiles a part by its type alone (`common.js:37,60`), so an Override typed as a header on `word/h.rels`, `_rels/.rels`, `word/[Content_Types].xml` or `[Content_Types].xml` itself is compiled.
* Repro, direct `placeholdersOf`, 200,000 lone `{` in a header at each of those four names: 8.3-8.5 s each, then "duplicate open tags" (not TOO_MANY_PLACEHOLDERS).
* Repro, HTTP on :4437: `<Override PartName="/word/h.rels" ContentType="…wordprocessingml.header+xml"/>` with 200,000 `{` (1,342 bytes) → 422 after **9,667 ms**; user-T's list, sent 200 ms later, got ECONNRESET. The same file with `Passport {client.passport}` → **201**, `placeholders` without `client.passport`; `renderDocx` prints the value into `word/h.rels`, so the agreement prints it blank (B-3's rest).
* Placeholder read only, `docx.ts:133`: a `customXml/` part typed core-properties (`customXml/item1.xml`, `<dc:title>{client.passport}</dc:title>`) or diagramData (`customXml/d.xml`) is brace-counted but not read, because only coverPageProps or `wordprocessingml` types pass. docxtemplater compiles both types (`common.js:20`); `renderDocx` printed the value into each.
* **Fix:** skip by name only the exact `[Content_Types].xml` and `.rels` files *whose type is not one docxtemplater templates*; otherwise count and read them like any part. At `docx.ts:133`, read every customXml part whose type is a templated one (the `filetypes.docx` and `common.js` lists), not only `wordprocessingml`. Tests: 1.5 M `{` in a header Override on `word/h.rels` and on `_rels/.rels`, refused in under 2 s; `{client.passport}` in each and in a core-typed customXml part, refused.

**N-1 Major (new; a regression in this diff): `[Content_Types].xml` is parsed into a full DOM before any cap, and a 9 KB upload kills the API.** `docx.ts:106` caps only `<Default` (100) and `<Override` (1000); `docx.ts:108` then calls `getContentTypes`, which builds an xmldom tree of the whole part (up to the 30 MB limit), and `compile()` at `docx.ts:141` parses it a second time.
* Repro, direct: `[Content_Types].xml` plus 1,000,000 × `<a/>` (4,774-byte zip) → listed normally after 13,814 ms at 1,994 MB RSS; `getContentTypes` alone on it: 2,276 ms, 1,156 MB. With 2,000,000 × `<a/>` (8,670 bytes): heap out of memory.
* Repro, HTTP on :4437: 1,000,000 → **201 after 13,421 ms**, user-T's read reset; 2,000,000 (8,696 bytes) → socket closed after 14 s, the API process died (`FATAL ERROR: … JavaScript heap out of memory` in `var/isolated-logs/rv4_fo5f-api.log`); every firm goes down.
* Regression: at 28f635a9a the same 2,000,000-element file took 18,875 ms but did not crash; the second DOM held alongside docxtemplater's own takes it over the heap limit. 1,000,000 took 5,809 ms there and 13,814 ms here.
* **Fix:** before any parse, refuse as damaged a `[Content_Types].xml` larger than a real one can be (1,000 Overrides of about 200 bytes: for example 256 KB), or with more than `DOCX_MAX_ENTRIES + 100 + 10` `<` signs. `_rels/.rels` is parsed the same way by `compile` (`get-relation-types.js:8`): give it the same size check. Test: 2 M `<a/>` in each refused in under 2 s.

**m-1 Minor (not in this diff; recorded): the scan reads fewer text tags than docxtemplater lexes.** `docx.ts:134,137` reads the whole text only under `docProps/` or a cover part, and otherwise only `w:t`, `vt:lpwstr`, `vt:lpstr`. docxtemplater lexes `dc:title`, `Company`, `Abstract` and the rest of `tagsXmlTextArray` (`file-type-config.js:13`) in every templated part. Repro: `<Company>{client.passport}</Company>` in `word/document.xml`, or a core-typed `word/core.xml` with `<dc:title>{client.passport}</dc:title>` → `placeholdersOf` lists only `client.name`; `renderDocx` prints the value there. Braces are still counted, so this is no flood. **Fix:** read the text of every tag in that list, or treat any core/app/custom-typed part as plain.

*Notes, not findings:* a 1,000,000 × `<w:p/>` body (9.6 KB) takes 2.2 s to compile, the same at 28f635a9a: an element flood in a templated part is outside the brace cap and outside this diff. Counting braces in attributes over-counts GUIDs (diagram data carries several per node); a Word file with many SmartArt graphics could pass 4,000. This was the same before this diff and none of my real files came near it.

## D1-D20 (round 4, API row; D4, D7, D8, D12-D14 N/A; D17 and D20 simulated only)
D1 3: item 5 still partly met (M-1) · D2 3: the placeholder list can miss a printed field (M-1) · D3 4: one typing path, docxtemplater's own · D5 1: an 8.7 KB upload kills the process (N-1) · D6 4 · D9 4 · D10 4: r2-m1 wording plain · D11 4 · D15 1: M-1, N-1 · D16 4: 247 passed; the six new routes fail on the old code · D18 4.

## What I could not check (round 4)
* No screen in this row: no browser walk, axe, 1024 px or 200 % zoom.
* CI on the PR was not observed. I did not rerun other suites or mutants (diff-only ruling).

**Journey score (round 4): 8 / 10** (`journey-test-reviewer-2026-11-15.md`, "Round 4"). It passes by score, but M-1 and N-1 are open Majors.

**To fix (the row splits, per Lead 53):** M-1 (name-based skip at `docx.ts:123`; customXml read gate at `docx.ts:133`) and N-1 (size check on `[Content_Types].xml` and `_rels/.rels` before any parse), each with its fail tests. m-1 may be fixed with them or recorded.

**Round 4 verdict:** Block (`2b5a79e1d`).

## Split confirmation (Lead 53, PR comment 6889263876): head `6d37dcf7acd3f159a88453eb48f75112e0e00cae`
This is not a new code review. It checks that the split left only round 4's clean part at this head.
1. **Code is r2-m1 only: holds.** `git diff 28f635a9a 6d37dcf7a -- prototype/studio` touches 2 files (+6 −1): the `service.ts:559` refusal wording and its pass and fail tests (`check_fo5_retainers.ts:883-886`). `docx.ts` is byte-identical to 28f635a9a, and round 3's attempt and its tests are gone. Suite at this head (my run): **232 passed, 0 failed**, exit 0, with both r2-m1 tests passing.
2. **Everything else after 28f635a9a is records: holds.** It is `review.md` and the journey report (my round-4 text, identical to what I wrote) plus `fo5f2-handover.md`. 6d37dcf7a adds only the breaker's final notes to the hand-over (`git diff --stat 439c6b45c 6d37dcf7a`: that one file). The hand-over carries my findings faithfully: M-1's name-based skips (item 2), customXml types (item 3), N-1 with its fix for `[Content_Types].xml` and `_rels/.rels` (item 4), and m-1 (item 5). Two points for FO-5f2, not for this head:
   * The six ways in from round 3 are open again at this head (item 1 names the reverted try that closed them).
   * The `[Content_Types].xml` parse stall exists without N-1's crash: 1 M / 2 M `<a/>` take 6.1 s / 17.0 s on `origin/main` and 5.8 s / 18.9 s at 28f635a9a, with no crash on either. Item 4's size check fixes it too.
   * Item 7 (delimiter change), which the hand-over calls unverified, **I verified on this head and on main alike.** `{=&lt;&lt; &gt;&gt;=}` followed by 20,000 `&lt;&lt;` gets past the brace cap and takes 2.9 s to compile on both. `{=[[ ]]=}[[client.passport]]` renders the value. The scan lists `=[[ ]]=` as a placeholder, so an upload is likely refused as unknown, but the flood still reaches `compile()`. This is part of M-1's rest.
3. **No Blocker or Major left at this head: holds.** M-1's rest is moved to FO-5f2 by the ruling and is no worse here than on `main`. N-1 came only with the reverted code and is absent here (above). Round 4 found the r2-m1 change clean. m-1 (text tags) is a Minor, recorded in the hand-over.

Verdict: Approve 6d37dcf7acd3f159a88453eb48f75112e0e00cae
