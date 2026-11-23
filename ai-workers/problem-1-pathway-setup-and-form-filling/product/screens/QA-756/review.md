# QA-756 review: FO-3w booking pages on a firm's own address (PR #3212)

Reviewed commit `886a61188dee949b9355b51e5ee90646f4a8875a` (branch claude/runtime-qa756; diff `origin/main...HEAD`, main at `1e89856fc`). The reviewer did not build it.
Isolated copy `rv_qa756` on :4491 (the port the caller gave; never :4400). Built web bundle checked fresh by `isolated.sh` (QA-181).
Ship / Ship after fixes / Rework: **Rework.** Two Majors: the row's own rule AG-4-17 r3 fails on a firm address, and PF-25 review M1 (studio shell served on a firm address) comes back through the new asset patterns.

## What I ran
* `tests/check_qa756_booking_on_address.ts 4491 xr_studio_rv_qa756`: **12/12 PASS** on this commit.
* Browser walk (Playwright, headless Chromium, `*.localhost` mapped to 127.0.0.1): see `journey-test-reviewer-2026-11-23.md`. Main path booked on A's address, manage link opened and reloaded on A, A's link on B refused, main-host `/book/sample-firm` list, type and `/book/sample-firm/manage#token` unchanged. axe WCAG 2.2 A/AA: 0 violations on list, type, booked and manage. 400 and 1024 px: no sideways scroll.
* curl with a hand-set Host for the not-found, method and file cases below. `graph.mjs`: G1 0, G2 0. No G3 entry for `GET /api/public/booking-site` (the check calls it). `qa/graph.json` restored afterwards.
* j_24 is not on this branch (it is on open PR #3191), so I did not re-run it. j_37 was not re-run because it writes into `screens/J-37/`. I walked its main-host steps by hand (J4 in the journey report).

## Issues (ranked)
**M1 (Major, Must): on a firm's address, an unknown type is not the same answer as an unknown firm (AG-4-17 rule 3 and its worked example; this row cites the rule).**
`public-paths.ts:16` registers `/book/<any slug>`, and `main.ts:257`'s catch-all serves `index.html` with 200 for every slug.
* Failing case: `Host: sample-firm.localhost` `GET /book/no-such-type` gives **200** text/html, 639 bytes (SPA; then a frame with an empty firm bar and "This page is not available."). `Host: notafirm.localhost` `GET /book/no-such-type` gives **404**, 450 bytes (`PUBLIC_NOT_FOUND_HTML`, which adds "Check the address, or contact the firm…").
* The requirement says: "a request to `notafirm.expatready.com/book` and a request to `maple.expatready.com/book/no-such-type` both get the same page, byte for byte", and r3 "the identical response and the same status code".
* The doors differ too. On A, `GET /api/public/firms/nobody-x/book` has detail "This booking page or link is not available." (`service.ts:87`). On notafirm the same path has detail "This page is not available." (`host.ts:30`).
* This is the second half of PF-25 review M1 ("a known firm's unknown page answers differently from an unknown firm"). `host.ts:8-9` hands it to FO-3's routes ("`sendPublicNotFound`, which FO-3's routes use for theirs").
* Fix: on a firm address, `/book/<slug>` (slug not `manage`) is served only when the slug is a listed, active public type of `req.publicFirm`; otherwise `sendPublicNotFound`. On a firm address, the doors' not-found sends `PUBLIC_NOT_FOUND_JSON`, or the two texts are made one.
* Test: add fail lines to D1 (`/book/no-such-<run>` and a case-type slug on A, bytes and status equal to `notafirm…/book/no-such-<run>`) and to D3 (door body on A equals notafirm's).

**M2 (Major, Must): on a firm's address, a missing file under a registered asset pattern serves the studio app with demo chrome.**
`public-paths.ts:17-19` admit any name that matches the patterns. When the file does not exist, `useStaticAssets` falls through to `main.ts:257`, which sends `index.html`. The SPA has no such route, so `App.tsx:44`'s `*` draws the studio Shell.
* Failing case: `http://sample-firm.localhost:4491/assets/nonexist.js` (also `/brand/nothing.svg` and `/fonts/inter/none.woff2`) gives 200. The page shows "Product Studio · Pathway Configurator · Prototype · demo workspace · Acting as Configuration author…", the full studio menu and "The studio did not accept the simulated person".
* This breaks `host.ts:5-6` and this PR's own `public-paths.ts:3-4` ("the studio's pages … stay the one plain not-found"). It also puts demo chrome on a firm's public address. Same symptom as PF-25 review M1. No firm data leaks: every studio API call is a 404 there.
* The test's D1 fail list (`check_qa756_booking_on_address.ts:73`) only has names that miss the patterns (`/fonts/other.woff2`, `/brand/x.png`), never a matching name with no file.
* Fix: on a firm address, an asset path with no file is `sendPublicNotFound` (static with `fallthrough: false` for those prefixes, or the catch-all refuses non-`/book` paths when `req.publicFirm` is set). Add `/assets/missing-<run>.js` to the D1 fail list.

**m1 (Minor, Should): the SPA half has no test in this commit.** Both `MODULE.rows/QA-756.md:2` files name `tests/journeys/j_24.ts`, but that file is only on open PR #3191. None of these would fail any suite here: removing `base` in `Confirmation` (`type-page.tsx:251`), the `segment === "manage"` branch (`site.tsx:27`), or `mayBeFirmAddress` (`site-context.ts:18`). Fix: say "j_24 arrives with #3191" in the PR and the rows, or add one browser line to the check (A's `/book` → Choose → booked → `/book/manage#…`).

**m2 (Minor, Should): `publicSite` spends the slots per-IP bucket (`service.ts:265`).** Every page load on a firm address, and every `/book/<key>` load on a dotted ExpatReady host (`site-context.ts:18`), costs one more unit of the 120 per 10 minutes. On a 429, `site.tsx:25` shows "Please try again in a minute." even on ExpatReady's own host, where the path already names the firm. Fix: a separate (or no) bucket for this key-only read. Or, on a non-404 error, fall back to the path when the segment is a firm key.

Not findings (checked):
* `manage` is a reserved slug (`settings/types.ts:61`).
* Cross-firm: B's key or A's token on the other address gives the door's one not-found (D3, D4, J2).
* X-Forwarded-Host is ignored (D2).
* Other methods on registered paths give Nest's 404 with no data.
* Emailed manage links still use ExpatReady's own host (`service.ts:934`) and work there (J3). Moving them to the firm's address is not this row's scope.

## D1–D20 (0–5; N/A = not touched by this change)
| D | Score | Evidence |
|---|---|---|
| D1 Requirement fit | 3 | S3 met (A's `/book/sample-free-consultation` books). AG-4-17 r3 example fails (M1). |
| D2 Data integrity | 5 | No new writes. Booking on A lands under A (D4). The walls refuse B (D3). |
| D3 Reuse / D4 Rule integrity | N/A | No library or rule content. |
| D5 Stability and recovery | 4 | Manage reload keeps the booking. A probe error shows a state. m2's 429 path. |
| D6 Freshness / D7 AI trust | N/A | No content, no AI. |
| D8 Orientation | 4 | Firm name in the frame and title on every state except not-found (empty bar). |
| D9 Flow | 5 | list → Choose → time → details → booked → manage, all under `/book`. |
| D10 Language | 5 | Same words as on the main host. No ids. |
| D11 Feedback and state | 4 | Skeleton while the probe runs. The two not-found pages differ (M1). |
| D12 Visual quality | 3 | Public frame clean at 1440, 1024, 400. Studio shell on a missing asset (M2). |
| D13 Accessibility | 5 | axe 0 on 4 states. Keyboard reached "Choose …" and booked. No sideways scroll at 400 or 1024. |
| D14 Team look | 4 | Same FO-3w frame. Demo chrome leaks on M2's paths. |
| D15 Speed | 5 | `/book` on A 402 ms to cards (cold). Type page 113 ms. One extra request (probe). |
| D16 Testability | 3 | 12/12 with pass and fail lines. M1 and M2 rules untested. SPA untested here (m1). |
| D17 / D20 | simulated only | No intended user walked it. |
| D18 Provenance / D19 Closure | N/A | Sample types and values only. |

## BIC (EXPERIENCE.md §6; a public booking page, not a case screen, so only the "Always" rows apply)
| Check | Result | Evidence |
|---|---|---|
| BIC-01–10, 12, 13, 15–17 | N/A | No case facts, AI, roles, tasks, filing or review here. |
| BIC-11 one primary per panel | Met | One filled "Choose" per card, one "Book this time" (walk J1). |
| BIC-14 help in place | Met | Zone tooltip unchanged from FO-3w. |
| BIC-18 states drawn | Partly | Skeleton during the probe, empty-firm text unchanged. Not-found differs by path (M1). |
| BIC-19 low load by layout | Met | 1440 and 1024 px list and type pages. Five inputs or fewer on the details step. |
| BIC-20 accessible | Met | Keyboard walk, axe 0, no sideways scroll at 400 and 1024 px (covers 200 % at 1024 px). |

## Could not check
* A real screen reader, and an unaided walk by an intended user (D17, D20).
* j_24 on this commit alone (it lives on #3191).
* A deployed wildcard host and certificate (PF-8).
* 200 % zoom in a real browser (I used a 400 px viewport instead).

Journey score (reviewer): **9/10** (`journey-test-reviewer-2026-11-23.md`). The score passes; the Majors above block.

Blockers: none. Majors to fix: M1, M2. Minors: m1, m2.

Reviewer: Block 886a61188dee949b9355b51e5ee90646f4a8875a

Verdict: Block

## Round 2: head `ad346742db7c2609f2df91ec5d7491fcfb44a56e` (diff from `886a611`; copy `rv2_qa756` on :4493)
Ship. `check_qa756` passes **18/18**. A browser walk was run twice (journey report, Round 2). A middleware probe was run from my scratchpad (`webAddressHost` with checks that throw, reject or never settle). curl probes used a hand-set Host. Extra Sample types were added to my copy's own database only.
* **M1 fixed.** `A/book/no-such-type` and `notafirm…/book/no-such-type` give the same 404: identical bytes (450), Content-Type and Cache-Control. On A, a hidden type, a CASE_REVIEW type, a switched-off type and a slug only B has all give that plain 404. A's OTHER type and B's own type give 200. `publicPageExists` (`service.ts:273`) uses the same rule as `publicType`, and the page answer agreed with the door's for every slug. The doors' body is now the same bytes on A and on an unknown address (`notFound` words `service.ts:87`; `message` added in `host.ts:43`).
* **M2 fixed.** On A, `/assets/nonexist.js`, `/brand/nothing.svg` and `/fonts/inter/none.woff2` give the plain 404 with no studio shell (`public-paths.ts:20,38`). Existing files are still 200. The patterns do not allow `..` or subfolders, so `existsSync` cannot be used to reach outside `web/dist`.
* **m1 fixed:** the D5 browser lines cover list → Choose → type page, manage on A, manage refused on B, and the main host. **m2 fixed:** the booking-site probe has its own `site:ip:` count (`service.ts:265`).
* **Errors in a check (breaker):** a synchronous throw and an async rejection both reach `next(err)`, because the inner promise is returned into the outer chain and its `.catch(next)` (`host.ts:87,98`). Nest's error handler then gives the 500, the same path as a failed `resolveHost`. Inside the check the firm is the address's firm (`currentFirm()` = A), so the walls accept A's query, and `withFirm(A)` inside it matches. A check that never settles holds the request open. A failed `resolveHost` does the same, and Prisma's timeouts end it, so this is not a finding.
* **Other comparisons:** `check_pf25_web_address.ts` compares against the imported `PUBLIC_NOT_FOUND_JSON`/`_HTML` and sends through `sendPublicNotFound`, so the added `message` cannot break it. I did not run that suite here: it uses the Mac's `/opt/homebrew` Postgres binaries. `messages/public-routes.ts` uses only the HTML constant, which is unchanged.
* **Old wording:** a grep of the whole studio (api, web, tests, tests/journeys) finds "booking page or link" nowhere, apart from `check_fo3a_booking_types.ts`, which this PR updates. The web pages never show the 404 detail: `manage-page.tsx:55` maps 404 to `BAD_LINK`, and `contract.ts:50` already says "This page is not available." The new words are AG-4-17's own example.
* **Registration:** the paths are now registered in `Booking.onModuleInit` (`public.controller.ts:23`). Nothing else imported `public-paths.ts` for its side effect, and `onModuleInit` runs before `listen`. Without the Booking provider, `/book` on a firm address is the plain 404, which fails safe.

**n1 (Minor, Should): the doors' JSON 404 differs in headers between A and an unknown address.** The body bytes are equal (D3's new line checks only body and type). Failing case: `Host: sample-firm.localhost` `GET /api/public/firms/nobody-x/book` sends `ETag: W/"a6-…"` and no Cache-Control. `Host: nobody-zz.localhost` on the same path sends `Cache-Control: no-store` and no ETag. AG-4-17 r3 says "the identical response". No information leaks, because A's `/book` 200 already shows that the address exists, so this is not Major. Fix: send `sendPublicNotFound` for a 404 `not-found` problem when `req.publicFirm` is set (or set `no-store` and drop the ETag there), and compare the headers in D3.

D-scores that changed: D1 5, D5 5, D11 5, D12 5, D14 5, D16 5 (M1 and M2 fail lines, D5 browser). BIC-18 Met. Journey score (reviewer, round 2): **10/10**.
Blockers: none. Majors: none open. Minor: n1.

Reviewer: Approve ad346742db7c2609f2df91ec5d7491fcfb44a56e

Verdict: Approve
