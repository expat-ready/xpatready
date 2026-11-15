# FO-5f2: the placeholder cap's rest (split from FO-5f, Lead 53's ruling, PR #1791 comment 6889263876)

FO-5f lands with item 5 partly done: at 28f635a9a every brace in the text runs of the parts the scan reads counts toward 2×2000 before docxtemplater compiles. That covers the body, headers, footers, Default-typed parts with an extension, and coverPageProps customXml. The rest of item 5 (review M-1, rounds 1-4) is this row's. `main` without FO-5f is open in every part.

**Open, from the reviewer (`review.md`, rounds 3 and 4) and the breaker (round 3, stopped at the split):**
1. **Typing:** parts must be typed exactly as docxtemplater types them (`collectContentTypes`: an Override by exact name, else the first Default whose Extension ends the name; case-sensitive; an empty Extension matches all; its XML parser, so single-quoted attributes count).
   * The reverted try at 04c152982/2b5a79e1d used docxtemplater's own `getContentTypes`/`collectContentTypes` (deep import from 3.71.1). It closed the six ways in that round 3 named.
2. **Name-based skips:** a part named `*.rels`, `_rels/.rels` or `…[Content_Types].xml` but typed by an Override as a header is compiled, yet the scan skipped it by name.
   * 1.5 M lone `{` in `word/h.rels` (2.6 KB) killed the API.
   * `{client.passport}` there was accepted and printed blank.
   * Skip by name only when the type is not one docxtemplater templates.
3. **customXml typed as core-properties or diagramData** is compiled but not read for placeholders. Read customXml of any templated type.
4. **N-1, a regression found in the reverted try (round 4):** parsing `[Content_Types].xml` with xmldom before the cap let a 9 KB file (2 M `<a/>`) kill the API.
   * Refuse an oversized `[Content_Types].xml` (e.g. over 256 KB, or too many `<`) before any parse.
   * Apply the same check to `_rels/.rels` (compile parses both).
5. **Text tags (review m-1, breaker round 3):** the scan reads only `w:t`, `vt:lpwstr` and `vt:lpstr` outside docProps and cover parts. docxtemplater fills every tag in `tagsXmlTextArray`: `Company`, `dc:title`, `cp:keywords`, and the others. Unknown placeholders in those tags (in a header, settings or a core-typed part outside `docProps/`), or in CDATA inside a `w:t`, are accepted and print blank. Braces there are counted (no flood).
6. **Minor (breaker round 3):** a 25 MB `[Content_Types].xml` with 990 parts is accepted after 2 s at 360 MB.
7. **Unfinished at the split:** a delimiter-change check (`{=[[ ]]=}`) had no result.

**Done when (proposed):** each case above has a fail test, a pass test for a real Word file, and 1.5 M lone `{` refused in under 2 s in each way in. The breaker re-runs every way in over HTTP with a concurrent page read answering.

Probe scripts from both agents (session scratchpad, not kept): reviewer `rev4/probe.ts`, `ct.ts`, `http.mts`; breaker `brk/attack*.mts`.

## Breaker round 3 notes, word for word (stopped at the split)

# FO-5f round 3 (stopped early) — findings for FO-5f2

Head `2b5a79e1d` (`api/src/front-office/retainers/docx.ts`, `placeholdersOf`). The coordinator stopped this attack before the end, so the list below may not be complete.
How it was run:
* Directly: `placeholdersOf()` then `renderDocx()`, one process per case (`r3cases.mts` builds the cases, `r3one.mts` runs one; log `run6.log`).
* Over HTTP: `POST /api/front-office/retainer-templates` as user-R on the isolated copy `brk_fo5f` :4438, now stopped (`r3http.sh`).
* Every case carries `{client.name}` in the body. Each variant was built twice: once with a header holding 1,500,000 lone `{`, and once with `Passport {client.passport}`.

## Major 1 — M-1 still open: a part named like `[Content_Types].xml` in a folder, or ending `.rels`, skips the brace cap
**Cause:** `docx.ts:123` skips a name matching `(^|/)\[Content_Types\]\.xml$|\.rels$` before the brace count at `docx.ts:128`. docxtemplater compiles any Override-typed part, except the exact root name `[Content_Types].xml` (and that exception applies only in its Default branch).

**Reproduction:** a header Override (`…wordprocessingml.header+xml`) on one of:
* `word/h.rels`
* `word/_rels/x.rels`
* `word/[Content_Types].xml`

**Flood (2.6 KB .docx):**
* Direct: `FATAL ERROR: … JavaScript heap out of memory` after 74 s, for both `word/h.rels` and `word/[Content_Types].xml`.
* HTTP: the API process's memory grew from 0.7 GB to 2.3 GB, and the process died about 60 s after the upload; curl got `000` after 62 s.
* During the flood, user-T's sign-in timed out (5 s), so every other user was blocked as well.

**`{client.passport}`:** HTTP 201, `placeholders` = `["client.name","fees","fees.amount","fees.label"]`, and the render prints `Passport ` (blank). This held for all three names.

**Fix idea:** count braces in every part docxtemplater will compile (its `filesContentTypes` targets) before any name-based skip, and skip only the exact root `[Content_Types].xml`.

## Major 2 — an unknown placeholder is accepted and printed blank (the cap holds; B-3 and item 4 rest)
The brace count is fine in every case below: each flood was refused in under 60 ms. But the text scan reads less than docxtemplater renders:

| Case | What the scan does | Render |
|---|---|---|
| A part typed `core-properties+xml` outside `docProps/` (`props/core.xml`, `<dc:title>`) | non-plain at `docx.ts:134`, reads only `w:t`/`vt:*` | `Passport ` (blank); HTTP 201 |
| The same under `customXml/item2.xml` | skipped at `docx.ts:133` (not cover, not `wordprocessingml`); core, app, custom and diagram types are all compiled as docxtemplater common targets | `Passport ` (blank); HTTP 201 |
| `<dc:title>` inside `word/header1.xml` (a header Override) | docxtemplater's docx `tagsXmlTextArray` treats `Company`, `dc:*`, `cp:*`, `Abstract`, `PublishDate` and the rest as text in **every** templated part; the scan reads only `w:t`/`vt:*` | `Passport ` (blank) |
| `<Company>` inside `word/settings.xml` | same cause (settings is a common target) | `Passport ` (blank) |
| `<w:t><![CDATA[Passport {client.passport}]]></w:t>` in a header | `runs()` regex `[^<]*` (`docx.ts:117`) never matches CDATA | the visible text becomes `Passport ]]&gt;`: blank, and the CDATA is broken |

**Fix idea:** read text by docxtemplater's own `tagsXmlTextArray` for every compiled part, and use its parsed tags rather than our own regexes. Or refuse CDATA in Word parts, and refuse the property-text tags outside the property types.

## Minor — a huge `[Content_Types].xml` is accepted at a cost
**Reproduction:** 98 Defaults, 990 header Overrides and parts, and a 25 MB comment inside `[Content_Types].xml`. The upload is 252 KB.

**Observed:** 201 after 2.0 s at 360 MB, measured directly and over HTTP (2.04 s). It stays under the 30 MB cap, so this is a cost, not a crash.

## Held
* **The six ways in:**
  1. `Default Extension="in"` on `word/h.bin`
  2. `Extension=""`
  3. `word/hdr` with no dot
  4. a single-quoted Override on `word/x.bin`
  5. a header under `word/charts/`
  6. a header under `customXml/`

  The flood was refused with TOO_MANY_PLACEHOLDERS in 31-43 ms at under 105 MB, directly and over HTTP (422 in under 0.08 s). `{client.passport}` was refused with 422 "{client.passport} is not a placeholder we know."
* **Same result (flood refused, passport refused):**
  * Extension case (`BIN` on `h.BIN`);
  * PartName case (`/word/H.bin`);
  * duplicate Overrides (the last one wins on both sides, consistently);
  * entity-escaped `PartName`/`ContentType`;
  * a Default with no `ContentType` or an empty one;
  * footnotes on `word/fn.bin`;
  * comments on `word/c.dat`.
* The reverse duplicate (header, then octet-stream): the flood is accepted, but docxtemplater does not compile that part either (the raw text stays `{client.passport}`), so nothing is printed blank.
* The delimiter change (`{=[[ ]]=}`) was still running when the stop came, so it has no result.
