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

Verdict: Block
