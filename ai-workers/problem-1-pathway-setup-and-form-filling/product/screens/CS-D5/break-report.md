# CS-D5 part 1 break report (R1.68, PR #3188, commit 1cb23d33c)

Breaker, 23 Nov 2026. API only: `POST /api/runtime/documents/:id/preview-link`, `GET /api/runtime/document-previews/:token`, and the download `GET /api/runtime/documents/:id/file` refactored onto `reachDocument`. Scope: concept §2 "API new (part 1)", BR-2, BR-4, BR-5. The scan gate (409/410) is out of scope (Lead 10's ruling; R1.66). Nothing fixed.

Setup: `isolated.sh brk_csd5 4472 start --ttl 60`, then `check_csd5_preview.ts 4472 xr_studio_brk_csd5` once (19/19 passed), then attack scripts in the scratchpad (`attack.mts`, `attack2.mts`, `p.mts`, `t.mts`; Node `fetch` with the `x-actor` header, `psql` on the copy's database). Copy stopped at the end. Actors: the officer user-O (owns the link), user-R and user-T (colleagues, same firm), user-S (other firm), user-P and user-Q (clients), user-A (configuration person).

## Attempts

| # | Attempt (command / method) | Expected | Actual | Result |
|---|---|---|---|---|
| A1 | Officer's fresh link GET as user-R, user-T, user-S | 404, token not used up | 404 "No such document." for each | Held |
| A2 | Same link GET as user-P, user-Q, user-A | refused, no bytes | 403 problem+json (the download's status for these people) | Held (see m3) |
| A3 | Same link with no `x-actor`, `nobody`, `USER-O` | 401 | 401 "Who is this?" | Held |
| A4 | After A1-A3, owner GETs with `x-actor: officer` (persona alias of user-O) | 200 once, then 404 | 200 (609 bytes); next GET 404 | Held: refusals do not use the token up |
| B1 | Token body re-encoded with `d` = another document, MAC kept | 404 | 404 | Held (MAC covers the body) |
| B2 | Duplicate `"d"` key appended; `d` uppercased; `=` padding added; MAC kept | 404 | 404 for all three; original token still 200 afterwards | Held |
| C1 | Link made, then case moved to another firm (`runtime_case.firm_key`, SQL) before GET | 404 | 404; a new POST also 404; moved back, the same token answers 200 | Held (reach checked again on GET) |
| C2 | Link made, then the document's person detached from the case (SQL) | 404 | 404 | Held |
| C3 | Link made, then the `case_document` row deleted (SQL) | 404 | 404 | Held |
| D1 | 2, 20 and 50 concurrent GETs of one fresh token (`Promise.all`) | exactly one 200 | `{200:1,404:1}`, `{200:1,404:19}`, `{200:1,404:49}` | Held (check + consume run in one synchronous step after the await) |
| E1 | POST link: unknown id, malformed id, other-firm doc as user-S, unknown as client | same 404 words | all 404, identical `detail` "No such document." | Held |
| E2 | GET with a forged token (MAC `A`x43) naming an unknown id, an other-firm id, an own-firm id, plus a garbage token | identical 404 | identical 404 body (140 bytes) for all | Held on status and words |
| E3 | Timing, median of 40, forged token as user-S: unknown id vs existing other-firm id | no difference | 3.7 ms vs 19.4 ms (garbage token 2.5 ms) | m1 |
| E4 | Forged token naming an existing document vs an unknown one, as client user-Q | same status | 403 vs 404 | m3 |
| F1 | Headers on the GET's 404 / 401 / 403 | no bytes, nothing kept | JSON problem body only, no `content-disposition`; but no `cache-control`, no `nosniff`, a weak ETag | m2 |
| G1 | Path tricks: `..%2F..%2Fdocuments%2F<id>%2Ffile`, `<token>/..`, `<token>.x`, trailing `/`, empty, `%00`, unicode `ëÿ漢字.🙂`, MAC of `+`, 10 000-char token | 404, no bytes | 404 for all; 100 000 chars → 431 from Node before the app | Held |
| H1 | Download `/documents/:id/file` as user-O | 200, 4 headers, +1 "viewed", +0 "previewed" | 200 `application/pdf`, `nosniff`, `default-src 'none'; sandbox`, `private, no-store`, `inline; filename*=UTF-8''brk-a.pdf`; viewed +1, previewed +0 | Held |
| H2 | Download as user-P, user-S, no actor | 403 / 404 / 401, no "viewed" line | 403 / 404 / 401; viewed count unchanged | Held |
| I1 | POST link, never fetched | one "previewed" line | +1; text "Case officer previewed Letter of invitation (Sample) on case 745fd1a9" (no file or client name) | Held (BR-5: written when the link is made) |
| I2 | POST link refused as user-S, user-P, user-Q, none, `nobody`, user-A | no line | 404/403/403/401/401/403; +0 lines | Held |
| I3 | Successful GET of a link | no "viewed", no second "previewed" | +0 | Held |
| I4 | File changed on disk after the link; GET; then a new POST | refused, no line | GET 409 "This document's file changed on disk…" (token used up); POST 409, +0 lines | Held (a new link is the remedy, BR-7) |
| J1 | `file_name` set (SQL) to `a"\r\nSet-Cookie: x=1;.pdf`, `фото паспорта.pdf`, U+2028 | no header injection | `filename*=UTF-8''a%22%0D%0ASet-Cookie%3A%20x%3D1%3B.pdf`, Cyrillic percent-encoded, no `Set-Cookie` | Held |
| J2 | Raw multipart upload with filename `x\"; q=\"y%0d%0aSet-Cookie: z=1.pdf` | stored safely | stored as `x; q=y%0d%0aSet-Cookie z=1.pdf`; header `x%3B%20q%3Dy%250d%250a…` | Held |
| J3 | `file_name` `it's (copy)*.pdf` | valid RFC 8187 value | `filename*=UTF-8''it's%20(copy)*.pdf`: `'`, `(`, `)`, `*` left raw | m4 |
| K1 | `HEAD` on a fresh link, then `GET` | HEAD does not use the link | HEAD 200 with no body; the following GET 404 | m5 |
| L1 | POST with the document id in upper case; GET its link | 200 | 200 / 200 (`d` lower-cased in the token) | Held |
| R1 | Restart the copy (default config, random key); replay a used and an unused link | 404 | 404 / 404 | Held |
| R2 | Restart with `CASE_PREVIEW_LINK_KEY=brk-fixed-key`, use link 1, restart with the same key, replay links 1 and 2 | used link 404 | used link 1 answers **200 again** (once), link 2 200 | m6 |

## Findings

Blocker: none. Major: none.

* **m1 Minor: existence shown by timing.** Before the MAC is checked, `bytes()` reads the unverified `d` from the token (`claims`, case-preview-links.ts:54-57) and runs the full `reachDocument` (case-documents-preview.ts:104-106). A forged token naming an existing other-firm document takes about 5x longer than an unknown id (19.4 vs 3.7 ms). The download and the POST route have the same gap from the same `reachDocument` (measured: 17.7 vs 3.0 ms, 15.9 vs 2.5 ms), so this PR adds no new exposure, and ids are random v4 UUIDs. Cheap fix: run `check()`'s MAC test before any lookup.
* **m2 Minor: refusals carry no `cache-control: no-store` / `nosniff`** (Nest's default problem+json with a weak ETag). No bytes leak, and the download's refusals are the same. 404 is heuristically cacheable under RFC 9111, so a later PR could add `no-store` on this route's refusals.
* **m3 Minor: the comment does not match the behaviour.** "Every refusal is the download's 404" (case-documents-preview.ts:102) is false for clients and configuration people: they get 403 "Only the case officer can do this." for any existing document id, even with a forged token, and 404 for an unknown one. The concept says BR-4 ("a client gets whatever status the download gives") and the download behaves the same, so the behaviour is in scope and as designed. Only the comment is wrong.
* **m4 Minor:** `encodeURIComponent` leaves `'()*` raw in `filename*` (case-documents-preview.ts:126; the download's line 732 is identical). RFC 8187 attr-char does not allow them. No injection is possible: CR/LF, `"` and `;` are encoded.
* **m5 Minor: HEAD uses the link up.** Express runs the GET handler for HEAD, so a HEAD request consumes the single-use token without sending bytes (case-documents-preview.ts:122). Only the token's own person can do it (actor-bound), and the audit line already exists. A link preview or prefetch tool would make the panel's one fetch fail.
* **m6 Minor (latent): with a fixed key, a used link works again after a restart.** Used tokens live only in process memory (case-preview-links.ts:19). Today nothing sets `CASE_PREVIEW_LINK_KEY` (random key per process: R1 held). But the constructor offers the variable, and with it set, a used link opens a second time after a restart, inside its 300 s. The same applies per instance if several API processes share one key. That second read has no line of its own (M2). The concept's scaffolding note ("single use where the store allows") covers it for now. Worth a comment at line 20, or a refusal when the key is set without a shared used-store.

## What held

Binding to firm, staff member and document; MAC integrity (swap, duplicate key, case, padding); single use under 50-way concurrency; refusals do not use the token up; reach checked again on every GET (firm moved, person detached, row deleted); identical 404 status and words for unknown, other-firm, malformed and forged; no bytes and no disposition on any refusal; path, length and unicode tricks; the download unchanged in status, headers and its "viewed" line; one "previewed" line per link made, none on refusal, none on GET; no names in the audit text; header injection through file names (SQL-planted and multipart); tokens not written to request logs (the observability hook logs only the route pattern, hook.ts:29-35).

Verdict: Approve
