# QA-756 break report: booking pages on a firm's own address (PR #3212)

Commit tested: `886a61188dee949b9355b51e5ee90646f4a8875a` (branch claude/runtime-qa756). The breaker did not build it.
Isolated copy `br_qa756` on :4492 (never :4400), database `xr_studio_br_qa756`. Started 06:27 and restarted 06:30 (to reset the in-memory rate limits). Stopped at the end.
The PR suite `check_qa756_booking_on_address.ts 4492 xr_studio_br_qa756`: **12/12 PASS**.
Firm A = `sample-firm.localhost:4492`, firm B = `sample-solo.localhost:4492`, ExpatReady's own host = `localhost:4492`. Tools: curl with a hand-set `Host`, raw sockets (double Host, absolute-form), and headless Chromium (Playwright) for the browser walks.
Note: from 06:36, uncommitted edits to `public-paths.ts`, `service.ts`, `host.ts` and `public.controller.ts` appeared in this worktree (a fix in progress). They were **not** tested. Every result below is for the commit above.

## Findings

**M1 (Major): a known firm's unknown type is not the same answer as an unknown address (AG-4-17 r3, worked example).**
* Steps: `curl -H 'Host: sample-firm.localhost:4492' http://127.0.0.1:4492/book/no-such-type` gives **200**, text/html, 639 bytes (the app; the page then says "This page is not available.").
* Compare: `curl -H 'Host: notafirm.localhost:4492' http://127.0.0.1:4492/book/no-such-type` gives **404**, 450 bytes (`PUBLIC_NOT_FOUND_HTML`).
* The requirement says (AG-04 v2.1 l.1044): "`notafirm.expatready.com/book` and `maple.expatready.com/book/no-such-type` both get the same page, byte for byte."
* The doors differ too. On A, `GET /api/public/firms/nobody-here/book` has detail "This booking page or link is not available." (`service.ts:87` at the commit). On an unknown address, every /api path has detail "This page is not available." (`host.ts:30`).
* Where: `public-paths.ts:16` registers every `/book/<slug>`, and the app's catch-all (`main.ts:257`) serves `index.html` with 200.
* The reviewer found the same thing (review.md M1). I reproduced it independently.

**M2 (Major): on a firm's address, a missing file that matches a registered file pattern serves the studio app (demo shell, staff sign-in).**
* Steps (all give 200 text/html, `<title>Product Studio`): `curl -H 'Host: sample-firm.localhost:4492' http://127.0.0.1:4492/assets/nonexist.js`. The same for `/assets/a.css`, `/brand/nothing.svg` and `/fonts/inter/none.woff2`.
* In Chromium, `http://maple-law.localhost:4492/assets/nonexist.js` draws "Product Studio · Pathway Configurator · Prototype · demo workspace · Acting as Configuration author …" and the full studio menu. It then calls `/api/runs`, `/api/draft`, `/api/session` and `/api/review-queue`, and each one gets 404.
* After `history.pushState('/front-office/bookings')`, the firm's own address shows "Sign in to your firm … Firm key · Work email · Sign in". That is a staff sign-in form on a public firm address. Its API is refused there, so no data leaks, but it is the PF-25 M1 symptom again.
* Screenshot (scratchpad, not committed): `/tmp/claude-0/s/m2-studio-shell-on-firm-host.png`.
* Where: `public-paths.ts:17-19` admit any name that fits the pattern. `main.ts:254` (`useStaticAssets`) falls through when there is no file, and `main.ts:257` sends `index.html`. The D1 fail list (`check_qa756_booking_on_address.ts:73`) only has names that miss the patterns. It never has a matching name with no file.
* The reviewer found the same thing (review.md M2). I reproduced it independently, plus the sign-in form step.

**m1 (Minor): every booking-list load on a dotted ExpatReady host fires a 404 and a console error, and spends the per-IP slots budget.**
* Steps: open `http://app.localhost:4492/book/sample-solo` in Chromium (`app` is a reserved, so main, label). It sends `GET /api/public/booking-site`, gets 404, and the console shows "Failed to load resource: … 404". The list then loads and booking works.
* Production's own host (`app.expatready.com`) is dotted, so this happens on every main-host list view. `site-context.ts:18`, `site.tsx:21-22`.
* `publicSite` counts against `slots:ip` (`service.ts:265` at the commit), so each page view costs 2 of the 120-per-10-minutes budget. After my probing, the main-host type page and `127.0.0.1/book/sample-firm` answered "Please try again in a minute." (429).
* On a 429 from the probe, `site.tsx:25` shows the error even on the main host, where the path already names the firm. Same as review m2.

**m2 (Minor): small variations of a real address give the plain not-found.**
* On A, each of these gives 404 `PUBLIC_NOT_FOUND_HTML`: `/book/`, `/book/sample-free-consultation/`, `/book/manage/`, `/BOOK`, `/book/Sample-Free-Consultation`, `/book/%6danage`.
* These are safe, but a printed or retyped address with a trailing slash or a capital letter does not open. No redirect to the canonical form. (`public-paths.ts:15-16`, anchored with no trailing slash.)

**m3 (Minor): the main-host style link on a firm's address is a dead end.**
* On A, `/book/sample-firm/sample-free-consultation` gives the plain 404, as the row intends. Two staff-side places still show main-host links: Settings → Booking types "Web address" hint (`types-page.tsx:171`) and `publicUrl` (`booking/settings/contract.ts:33`).
* Visitors given those links still reach the main host, which works. This is noted only, because changing the share line is not in this row's list.

## Attempts that held (expected = actual)
* Studio on A: `/`, `/index.html`, `/account`, `/api/platform/session`, `/api/health`, `/api/public/signup` → plain 404.
* Path tricks on A: `/book/..%2faccount`, `/assets/../index.html`, `/api/public/bookings/a/../../platform/session`, `/book/manage%2f`, `/book/a%00`, `/book/x.y`, `/book%3Fx`, `/book#x` raw, `OPTIONS *` → plain 404. `.map` files are not served.
* Methods: HEAD on registered paths 200 with no body. POST, PUT, DELETE, PATCH and OPTIONS (with a foreign Origin) on `/book`, `/book/manage`, `/api/public/booking-site` and an asset → Nest 404 "Cannot <M> …", with no data and no CORS headers.
* Host forms: case (`SAMPLE-FIRM.`, `.LOCALHOST`), trailing dot, no port and wrong port → resolve A (the same firm). `x.sample-firm.localhost`, `…:4492@localhost`, `…:4492x` → 404.
* Two Host headers (main+A, A+main, A+B, raw socket) → plain 404. Absolute-form request line on A, either way round → refused. Main Host with `X-Forwarded-Host` or `Forwarded: host=` naming A → booking-site 404 (it is ignored).
* Cross-firm on A's host (B booked on the main host first): B's key on list, slots, POST bookings (valid and empty body) → the door's one 404. B's token on view, slots, ics, POST reschedule and POST cancel → 404, and the booking afterwards is still SCHEDULED on the main host and on B's host. B's form stamp on A's type → 422 refused.
* The 404 bodies and headers for B's key, an unknown key and an unknown type on A are byte-identical (same ETag W/"c6-…", 198 bytes).
* Firm state: B set to PAYMENT_HOLD, PROVISIONING and SECURITY_LOCK → B's `/book` and booking-site, B's token on B's host, and the main-host list and token all 404. TRIAL → all served again.
* Address change (`sample-firm` → `maple-law`, with its redirect record): `maple-law` booking-site gives `{firmKey:"sample-firm"}` and its list works. The old address gives 301 to the same path and query. In Chromium, an old-address `/book/manage#<token>` lands on `maple-law…/book/manage#<token>` and shows "Your booking".
* Browser on A: `/book` (title and h1 name the firm, links `/book/<slug>` only) → Choose → reload type → Back/Forward → pick time → details → "You are booked". Links are `/book/manage#…` and `/api/public/bookings/…/ics` → manage shows "Your booking" and still does after reload.
* On the happy path: no console errors and no non-public API call. A's token on B's address → "This link is no longer valid…". `/book/manage` with no token → the same bad-link text.
* Slug "manage" collision: reserved on create and edit, and `freeSlug` skips it (`settings/types.ts:61,195,299,324`).
* Main host unchanged: `localhost/book` → "This page is not available.". `/book/sample-firm` list, the type page, a booking end to end with manage href `/book/sample-solo/manage#<token>` → "Your booking". `/book/sample-firm/manage#<A token>` works. `127.0.0.1/book/sample-firm` list. `/book/manage` → not found (as before).
* Keyboard: Tab reaches both "Choose …" links in order, and Enter opens the type page. At 1024 px the manage page lays out; at 512 px (200 % of 1024) the list has 0 px sideways overflow.

## Not tested
* The uncommitted worktree edits made after 06:36.
* A real wildcard host and certificate (PF-8), a screen reader, real browser zoom (viewport stand-in used), and j_24 (not on this branch).

Blockers: none. Majors: M1, M2. Minors: m1, m2, m3.

Verdict: Changes
