# CS-D5 part 1 review (R1.68, API only): PR #3188 at 1cb23d33c7e49434c3e35461f1d0a34db7c7cb16

Independent reviewer (Opus 5.5, did not build it), 23 Nov 2026. Read against concept r2.1 (`concept.md`), brief `design/briefs/CS-D5.md` (part 1), `STANDARDS.md`, `QUALITY.md` and the code (`git diff origin/main...1cb23d33`, 6 files, +250/-3). **API only: no screen exists yet** (part 2 is a later PR), so there is no browser journey, no screenshots and no BIC evidence; those are "Not yet evidenced", not scored. Scope ruling taken as given: no virus-scan gate in this row (R1.66 / PF-F3); `scan: "NOT_SCANNED"` is correct and is not a finding. The PR head has since moved to 0115fda05; that commit only adds `api/src/features/MODULE.rows/CS-D5.md` (2 card lines), no code.

**Verdict: Ship** (no Blocker, no Major; 8 Minors below, each Should).

## What I ran (isolated copy `rev_csd5` on :4471, never :4400; stopped after, database dropped)
* `tests/check_csd5_preview.ts 4471 xr_studio_rev_csd5`: **19/19 passed, twice**.
* `tests/check_c65_documents_api.ts` (the download route, now going through `reachDocument`): **74/74 passed**. `file()` keeps its status codes, headers and "viewed" line.
* My own API probes (curl and tsx): 10 parallel GETs of one token gave **one 200 and nine 404**. No actor gave 401. A client or a configuration person holding the officer's valid token got 403, and the officer could still use the token afterwards. Another firm's staff got 404, a garbage token or a 5,000-character token 404, a non-UUID id 404. A PDF with `/OpenAction /JavaScript` gave `contains_scripts: true`; a plain PDF gave `false`. `expires_at` was now + 300 s. Audit rows: `previewed`, entity `case document`, key = document id, actor and `case_id` filled, one per link. A refused link wrote none.
* `graph.mjs`: G1 0 · G2 0 · G3 239 · G4 0 · G5 0 · G6 20. The POST route is linked to its test. **The GET route shows `testedBy: []`** (Minor 6).

## The three points I was asked to weigh
1. **The used-token set lives in memory, one per process.** It is correct in the reference app, which runs one process. The brief allows it word for word ("an in-process set keyed by the token's MAC until its expiry is enough in the reference app"). The race is safe: `check` and `consume` run with no `await` between them, and `consume` checks again (probe: 1 of 10 succeeded). But the synthesised deploy (`deploy/cdk/lib/service.ts:200`, `MIN_TASKS = 2`; "production always runs two tasks") breaks this in two ways. With the default random key per task, about half of all links would answer 404 on the other task (fails closed, so availability only). With a shared `CASE_PREVIEW_LINK_KEY`, each task keeps its own used set, so a link can be read once per task with one "previewed" line, which breaks single use (concept M2, AG-9-32). Nothing is deployed (P-551), and the brief ruled on it, so I rate this **Minor 1**. It becomes Major before any deploy with two tasks.
2. **`bytes()` reads the document id from the token before checking the MAC** (`case-documents-preview.ts:43-46`). I confirmed it leaks nothing beyond the existing routes. Staff of another firm get the same 404 for a forged token, whether or not the document exists. A client or a configuration person gets 403 for a real document id and 404 for an unknown one, but `/documents/:id/file` and the new `/preview-link` already give exactly that answer (measured: 403 and 404 on the download). So there is no new oracle. Two side effects remain. A forged token makes the server read the database before it is refused. And the brief's "altered → 404, leaking nothing" holds only for staff (Minor 2).
3. **A random key per process when `CASE_PREVIEW_LINK_KEY` is unset** (`case-preview-links.ts:20`). This is safe: links die on restart, which a 300 s single-use link tolerates. It follows the `FO_FILES_LINK_KEY` precedent (`front-office/files.ts:122`). But the key bypasses PF-24's settings registry, where `PLATFORM_FILES_LINK_KEY` must have at least 32 characters with 10 or more different ones (`platform/config/settings.ts:69`). A one-character key is accepted, and no runbook or settings line documents it (Minor 3).

## D1-D20 (API part only; screen dimensions not yet evidenced)
D1 Requirement fit **4**: AG-9-24/16/53/32 behaviours are present. The response has every field the concept names. BR-2/4/5 hold. BR-1 is deferred by ruling. · D2 Data integrity **4**: read-only plus one audit insert; single use holds under a race (probe). · D3 Reuse **5**: one reach path (`reachDocument`) shared with the download; the download's four headers copied exactly; PF-F4's `detect` reused, no second scanner. · D4 Rule integrity N/A. · D5 Stability **4**: a restart only ends live links; HEAD uses up the token (Minor 4). · D6 Governance **4**: a "previewed" line with person, case and document. · D7 AI N/A (no AI). · D8-D13 Not yet evidenced (no screen). · D14 Team look Not yet evidenced. · D15 Speed **4**: link plus bytes in under 100 ms each locally; reads the file twice (link and GET), fine at Sample sizes. · D16 Testability **4**: DW1-DW5 each pass and fail. Removing the MAC check, the actor binding, single use, the audit line or expiry each turns a check red (read through, not mutated). But `contains_scripts` and route-level expiry have no failing case (Minors 5, 7). · D17, D20 simulated only (no intended user; no screen). · D18 Provenance **4**: the audit line names who, what and which case. · D19 Not yet evidenced (part 2 closes it).

## BIC-01-BIC-20 (EXPERIENCE §6)
All **N/A for this PR**: there is no screen. Concept §4c's BIC-11/13/14/18/19/20 claims are for part 2 and are checked there.

## STANDARDS [M] lines touched
Met: §3.10 (each DW has a pass and a fail), §4 ports (bytes through `bytesOf`/files), §5 no N+1 (two lookups per call), §6 Problem Details (the global filter; probe bodies are RFC 9457), §6 server authorisation and deny by default (`@CaseRead` gives 401 to no actor; `reach("officer")`; the token is bound to the firm and the person), §7 strict TS, no `any`, a module card row, §8 headers and uploads (nosniff, sandbox CSP, `private, no-store`, inline). Partly: §4 "stateless API" (Minor 1, a brief-ruled exception), §4 "config in environment" (Minor 3), §7 accurate comments and no dead code (Minor 8). Not applicable: §6 zod contract and OpenAPI (the runtime routes it sits beside have none either; retrofit). §8 rate limits are absent app-wide, an existing gap and not this row's.

## Issues (ranked; all Minor, all Should)
1. **Single use and the key are per process; the deploy runs two tasks.** `case-preview-links.ts:19-20`. Fix: write in `MODULE.cases.rows/CS-D5.md` (invariants or "do not") that this holds for one process only. Before PF-8 runs two tasks, keep used MACs in a table with a unique key (an insert that loses → 404) and read the key from PF-24 settings. A backlog line is enough here.
2. **Check the MAC before reaching the case.** `case-documents-preview.ts:43-46`. Fix: verify the MAC and expiry first (a `verify(token)` that needs no workspace), then reach, then compare firm and person. An altered token then answers 404 for every caller and never touches the database. The unused `workspaceId` from `claims()` goes away.
3. **`CASE_PREVIEW_LINK_KEY` is read raw from `process.env`.** `case-preview-links.ts:20`. Fix: register it in `platform/config/settings.ts` with the same strength rule as `PLATFORM_FILES_LINK_KEY` (unset → random, as now), so a weak key is refused at start-up.
4. **A HEAD request uses up the single-use token** (Express answers HEAD on a GET route: probe HEAD 200, then GET 404). `case-documents-preview.ts:61`. Low exposure, because the token needs the `x-actor` header. Fix: refuse HEAD (405), or consume only on GET.
5. **`contains_scripts` has no passing or failing case.** `tests/check_csd5_preview.ts:62` checks only `typeof === "boolean"`, so an always-`false` field would stay green (STANDARDS §7 "a rule's test fails when the rule is removed"). I verified by hand that a scripted PDF gives `true` and a plain one `false`. Fix: upload the CS-D1t `SCRIPTED` fixture and assert `true`, plus `false` for the plain PDF.
6. **The graph sees no test for `GET /runtime/document-previews/:token`.** The check fetches `l.url`, built at run time. Fix: name the path literally in `fetchBytes`, or assert `l.url.startsWith("/api/runtime/document-previews/")` in a way the graph reads, so G-checks link the route.
7. **Expiry is tested only on a separate in-process signer** (`check_csd5_preview.ts:84`). The route's own use of `PlatformClock` is never tested at 300 s, but the brief's DW2 says "after 300 s on the injected clock". Fix: an in-process test of `DocumentPreviews.bytes` with a stub clock, or a note in the PR on why the signer test is enough.
8. **Stale comments, and a touch list that differs without a note.** `features/case-documents-preview.ts:1` names `api/src/documents/preview.ts`, which does not exist. The brief's touch list named that file; the code is in `api/src/case-documents-preview.ts` and `case-preview-links.ts`. The `claims()` doc says "workspace and asker" but returns workspace and document (`case-preview-links.ts:53`). Fix: correct both comments and say in the PR body where the files went and why.

## Retrofit mapping
The token route stands in locally for storage signing (concept §6b). The 300 s life, the nameless URL, the firm scope and single use carry over to S3. The binding to one staff member does not. `PreviewLinks` folds into the platform link module once contract gap 1 closes (said in the code comment).

## Not checked
The browser journey, axe, 1024 px and 200 % zoom, the BIC rows and screenshots (no UI until part 2). A sha-mismatch 409 on the preview GET: it shares `bytesOf` with the download and was not exercised separately. Full CI on the head. A real two-task deploy (synth only).

Journey test: `journey-test-reviewer-2026-11-23.md`. **No score out of 10**: there is no UI to walk; the API journeys are recorded there.

**Verdict: Approve**

Reviewer: Approve 1cb23d33c7e49434c3e35461f1d0a34db7c7cb16

## Round 2 (diff only)

Reviewed `git diff 1cb23d33c7e49434c3e35461f1d0a34db7c7cb16..3d47a42b8af656aed891de7a4b4c5870d4fd327c`: the card row, the review and break records, and the round-1 Minor fixes in `case-preview-links.ts`, `case-documents-preview.ts`, `features/case-documents-preview.ts` and `tests/check_csd5_preview.ts`. Own isolated copy `rev2_csd5` on :4473 (`xr_studio_rev2_csd5`), stopped after; Express 5.2.1, Nest 11.1.29.

**Evidence.** `npx tsx tests/check_csd5_preview.ts 4473 xr_studio_rev2_csd5`: **23/23 passed**. `tsc --noEmit -p api`: no error in any CS-D5 file (the errors it prints are older, in other checks). Real requests from a probe script against :4473:

| Request | Status | Headers seen |
|---|---|---|
| HEAD, officer, fresh link | 405 | `allow: GET`; no body |
| HEAD, no `x-actor` | 401 | problem+json (the case guard runs first) |
| GET, client, the officer's valid link | 403 "Only the case officer can do this." | `private, no-store`, `nosniff`, no CSP, no disposition |
| GET, another firm's person | 404 | `private, no-store`, `nosniff` |
| GET, one character altered (officer; client) | 404; 404 | `private, no-store`, `nosniff` |
| GET, `abc` as the token | 404 | `private, no-store`, `nosniff` |
| GET, officer, same link after all of the above | **200** `%PDF` | all four bytes headers |
| GET again (officer; client) | 404; 404 | `private, no-store`, `nosniff` |

**The three things asked.**
1. **Access logic: no regression.** `verify()` now checks shape, MAC, payload types (incl. UUID `d`), expiry and used before any database read. Then `reachDocument` runs on the verified document id. Then `check()` (built on `verify`) binds the workspace and the asker, and the `t.document !== x.document.id` and `consume` steps are unchanged. Staff refusals stay 404 and a client with a genuine link still gets the download's 403. One status changes on purpose: a client holding a forged or used token now gets 404 instead of 403, because it is refused before the reach. That is the round-1 Minor 2 fix and closes the breaker's m1 (timing) and m3 (comment). The new doc comment says so.
2. **HEAD is registered ahead of the GET-for-HEAD fallback.** The real HEAD answers 405 with `allow: GET`. The same link then answers GET 200, so HEAD did not use it up (the check's "after the refused tries" line proves the same thing). This works because `@Head` is declared before `@Get` in the class, so Nest registers its layer first.
3. **Headers set before the throw survive Nest's error response.** Every refusal above carries `cache-control: private, no-store` and `x-content-type-options: nosniff` in the global filter's problem+json, and none carries CSP or `content-disposition`. The check now asserts this for the altered token.

**Round-1 Minors.** Closed: 2 (verify first), 4 (HEAD 405), 5 (`contains_scripts` true and false), 6 (the literal `call("GET", "/runtime/document-previews/…")` and the `PREVIEWS` constant), 8 (comments; `claims()` removed). Partly: 1. The per-process limit and the plan (a table with a unique key and the key in PF-24 settings before more than one task) are now in the class comment. The new `MODULE.rows/CS-D5.md` does not repeat it and there is no backlog line yet. Still open (Should, unchanged, not a block): 3 (`CASE_PREVIEW_LINK_KEY` read raw from `process.env`) and 7 (route-level expiry on the injected clock). Say both in the PR body if they are deferred.

**New in this diff (Nits, no action needed to merge).**
* The HEAD refusal depends on `@Head` being declared above `@Get`. A one-line comment saying so would stop a later reorder from silently bringing back the round-1 bug (the check's 405 test would catch it anyway).
* `(v as { document: string }).document` is a cast where narrowing would do, if `fail` were typed `never`. Same pattern as the existing `t as {…}`.
* The 405 response has no `no-store`/`nosniff`. There is no body, so nothing to cache or sniff.

Blocker: none. Major: none.

Verdict: Approve 3d47a42b8af656aed891de7a4b4c5870d4fd327c
