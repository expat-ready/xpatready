# PF-13 part 3 — the firm's brand on its public booking pages: review, round 1 (22 Nov)

**Commit reviewed:** `f29ef2e485ad672127cf630d7ad1707ab04089d9` (branch `claude/screens-pf13c-booking-brand`, draft PR #3037). Only this part's diff (`git diff 7961f166f HEAD`): `booking-public/frame.tsx`, new `booking-public/brand.tsx`, new `tests/check_pf13c_booking_brand_browser.ts`, build notes, screenshots.
**Spec:** `build-notes.md` (agreed by the tech lead on #2910; no concept file, no board). Reviewer: an independent session that did not build it.

## Verdict: Ship after fixes (Changes)
The code does what the spec says, and my own probes found no leak between firms. One Must: the check's firm-isolation case (BB3) can never fail for the bug it is meant to catch, so it does not guard the main risk of this part.

## What I ran (port 4444, never :4400)
* `check_pf13c_booking_brand_browser.ts` on a fresh `pf13crev`: **23/23, exit 0** (same as the builder's run).
* `journeys/j_23.ts` on a fresh `j23rev`: **15/15, exit 0**. W4 (the client page shows the brand) passed.
* FO-3w regression: `check_fo3w_booking_browser.ts` on a fresh `fo3wrev`: **67/67**. The frame's new flex row does not break FO-3w's own pages.
* My own probes (scratchpad only, not committed):
  * client-side navigation A → B → Back → Forward, sampled on every frame;
  * hover shade;
  * a hostile branding answer (intercepted);
  * a bad colour;
  * dark theme at 1440 px, and 200 % zoom at 1024 px (512 CSS px), each with axe;
  * a real booking at firm A, its manage link opened under firm B's address.

## Findings, ranked
1. **Must — BB3 cannot fail for an isolation bug** (`check_pf13c_booking_brand_browser.ts:158-164`).
   * The check reaches firm B with `p.goto` (a full page load), so there is a new QueryClient and a new `<head>`. The two places a leak could come from are never exercised:
     * the query key `["public-brand", firmKey]` (`brand.tsx:30`): drop `firmKey` and BB3 still passes;
     * the favicon restore (`brand.tsx:41-47`): drop the cleanup and BB3 still passes.
   * "No request to firm A's branding" is trivially true after a full load.
   * **Fix:** add a BB3 step that goes from A's page to B's by client-side navigation (`history.pushState` + `popstate`, or Back/Forward between the two). Assert, while on B: no `#7a1f4e`, no A image, and the tab icon back to `/brand/favicon-dark.svg`. Show it fails with the key or the cleanup removed.
   * The behaviour is correct today. I sampled 183 frames across A → B: the A brand appears only in the one frame where the URL has changed and React has not yet re-rendered (it still shows A's own name). After that the page is blank, then B with neutral colour, no image and the app's favicon. Back/Forward restore each firm correctly.
2. **Should — the manage page takes its brand from the address, not from the booking** (`frame.tsx:12-15` with `manage-page.tsx:98`).
   * I opened firm A's real manage link under `/book/sample-solo/manage#<A's token>`. The page shows A's booking and A's name ("Sample immigration firm", title "Your booking · Sample immigration firm"), but firm B's brand (`data-brand-colour` = B's).
   * The API `GET /api/public/bookings/:token` is not scoped to a firm, so with a branded B, B's logo and colour would sit beside A's booking.
   * Practical risk is low: only the token holder can open it, by editing the address.
   * **Fix (no API change):** draw the brand only when the read's name matches the page's firm, `brand = firm !== undefined && read?.name === firm ? read : null`. Or record it as a known limit in the build notes.
3. **Should — rule (3) "a page that is not found draws no brand" has no failing test** (BB4, `check…:168-172`).
   * The 404 page draws nothing because the branding read itself answers 404 (`read` is null), not because of the `firm !== undefined` guard (`frame.tsx:15`). Remove the guard and BB4 still passes.
   * The guard does matter for the 429 / "could not be loaded" frame of a firm that exists.
   * **Fix:** route the page's own read to 429 for sample-firm and assert no `[data-brand-colour]`.
4. **Note (not a finding, no change asked).** In the dark theme (system preference, `index.html:8`), the brand colour as `border-primary` on available days, e.g. #7a1f4e on #182634, gives the day outline low non-text contrast (screenshot `rev-dark-1440-type.png`).
   * Days stay distinguishable by their bold link-coloured number.
   * The earlier dark primary tint was also low.
   * axe: 0 violations.
5. **Note.** `samePath` (`brand.tsx:21`) keeps any `/api/public/firms/…` path and does not check that it is this firm's key. Links come from the server, so this is only defence in depth.

## What held (with evidence)
* **XSS.** I fed the frame a hostile branding answer:
  * tagline `<img src=x onerror=alert(1)>` + 80 "W": rendered as text, no dialog, no `img` in the header, no sideways scroll at 375 px;
  * logo `javascript:alert(1)`: dropped;
  * banner `https://evil.example/steal.png`: dropped, and the browser made no request to evil.example;
  * colour `red;background:url(…)`: refused by `HEX`, so the frame falls back to the unbranded look (no `--color-primary` override).
* **Colour.** `--color-primary` on the frame. The Choose button is rgb(122,31,78) with white text, and axe has no contrast violation at 375, 1024 and 1440 px, light and dark. The hover shade is measured rgb(98,25,62) = ×0.8, which is darker, so contrast only rises (`brand.tsx:23-26`). Rule (6), AA on white, is part 1a's server check.
* **Neutral look.** Firm B reads `#1f4e79`, no image, no tagline, the app's favicon (BB3, my run).
* **Lost logo.** The image is removed and nothing shows broken (BB5). A replaced logo's old link answers 404.
* **Accessibility.**
  * Logo alt is "Sample immigration firm logo"; the banner has `alt=""`.
  * Images take no focus. Tab reaches Choose and Enter opens it.
  * 375 px wraps the tagline under the name (`pf13c-5-sample-firm-375.png`).
  * 200 % zoom at 1024 px: no sideways scroll, axe 0.
* **No API change, migration or library.** Correct per STANDARDS §1. No per-row requests: one branding read per firm, `staleTime` 60 s.

## D1–D20
D1 4/5 · spec rules 1-6 all behave as written; manage-address gap (2) · D2 N/A, nothing is written · D3 5 · `brand.tsx` is reusable for PF-4ps · D4 N/A · D5 5 · reload, Back/Forward and a lost image all hold · D6 N/A · D7 N/A, no AI · D8 5 · the firm's name and logo say whose page it is · D9 5 · unchanged FO-3w flow · D10 5 · no new words · D11 5 · no colour flash; the read starts with the page's · D12 4 · clean, with a slight logo/banner crop on wide banners by design (`object-cover`) · D13 5 · axe 0 at 375/1024/1440, dark, 200 %; keyboard ok · D14 5 · team tokens · D15 5 · one cached read · D16 3 · BB3 and BB4 lack real fails (findings 1, 3) · D17 simulated only · D18 4 · brand from the firm's own settings; see (2) · D19 4 · J-23 W0→W5 closes R1.23 on booking pages and emails · D20 simulated only.

## BIC scorecard (EXPERIENCE §6)
BIC-01–BIC-20: **N/A**. This is a public booking frame, not a case-side screen (no case facts, applicants, forms or documents).

## Journey test (reviewer role; the one journey score for this check)
I wrote no separate report: the caller asked for this one file only. My journeys:
* J1 (visitor, main): firm A's list → type → book → manage, branded throughout;
* J2 (visitor, other firm): B after A, by full load and by client-side navigation;
* J3 (empty): a firm with nothing set;
* J4 (error): not found; lost logo; hostile or bad branding answer;
* J5 (wrong address): A's manage link under B;
* J6 (recovery): Back/Forward;
* J7 (a11y): keyboard, 375/1024/1440, dark, 200 %.

| Criterion | Score | Evidence |
|---|---|---|
| task completed | 1 | J1 branded on all three pages (BB1/BB2, j_23 W4) |
| next step obvious | 1 | FO-3w flow unchanged, 67/67 |
| plain words | 1 | only the firm's own text added |
| feedback and state | 1 | no flash; neutral until found; nothing on 404 |
| correct data | 1 | colour, tagline and images are exactly the stored values |
| error recovery | 1 | lost logo removed; bad colour falls back |
| accessibility and screen sizes | 1 | axe 0 in every state tested; keyboard ok |
| speed | 1 | brand read in parallel with the page's; no wait seen |
| visual quality | 1 | screenshots 1440/1024/375 clean |
| trust and sources | ½ | J5: another firm's brand beside A's booking (finding 2) |

**Score 9.5/10: pass.**

## Could not check
* A real screen reader, and an intended user's unaided walk (D17/D20 stay with the founder).
* A real image server outage (BB5 simulates it with a 404).
* The founder's walkthrough.
* `graph.mjs` ran, but `qa/GRAPH.md` has no PF-13/R1.23 row to compare.

**Must fix before Approve:** finding 1 (a BB3 client-side-navigation step that fails when the query key or the favicon restore is removed). Should: findings 2 and 3.

**Verdict: Changes**

## Round 2 (diff f29ef2e48..ecad6d883)
Diff-only re-review at ecad6d8835f94f28369bde7d5fc6b151643c2e8b: `brand.tsx`, `frame.tsx`, `check_pf13c_booking_brand_browser.ts`, and the "Round 1" part of `build-notes.md`.

### What I ran (run-suites copy, never :4400)
* `run-suites.sh --only "check_pf13c_booking_brand_browser.ts"` at ecad6d883: **PASS 28/28**, 49 s (`lane.sh setup` first; the database was down).
* Three mutations of `brand.tsx`, each run the same way and then reverted. The prototype tree is clean afterwards (`git status` empty).

| Mutation | Result | Failing test |
|---|---|---|
| query key `["public-brand", firmKey]` → `["public-brand"]` | **FAIL**, exit 1 | BB3b |
| favicon cleanup → `return () => {}` | **FAIL**, exit 1 | BB3b (B's icon stays `/api/public/…/branding/favicon`) |
| name guard removed (`brand: brand`) | **FAIL**, exit 1 | BB7 |

### Findings
1. **Breaker M1 / round-1 finding 2: fixed.**
   * `useDrawnBrand` keeps the read only when `brand.name === firm`. Both names come from `PlatformFirm.operatingName`: `images.ts:94` for the branding read, `booking/service.ts:981` for the page's own reads.
   * BB7 is a real two-sided test: cross address → `none` with B's name; own address → `brand`. With the guard removed it fails (mutation above).
   * Residual, already in the build notes: two firms with the same operating name. It needs a token holder who edits the address and two firms that share a name. **Note**, no change asked; returning the firm key from the booking read is the right later fix.
2. **Breaker M2 (first paint): fixed.** BB8 tests both sides. At 1.5 s: loading, then branded, and the card position and colour are unchanged 3 s later. At 4.5 s: drawn without the brand, and the late answer changes nothing. I checked the decision logic for the three suspected bugs:
   * **Ref written during render.** The writes are idempotent: the same inputs give the same decision, and the reset happens only when the key or the name changes. React's StrictMode double render (dev only; the copy serves a production build) reuses the same ref, so the second pass returns the same object. No bug found; a `useState` "previous props" form would be more idiomatic. **Note.**
   * **Leftover `late`.** `late` holds the firmKey it was set for and is compared with `late === firmKey`, so firm A's timeout cannot decide for B. Each firm frame also mounts fresh: `Gate` returns `<PublicFrame>` while loading and `<>{children()}</>` once loaded, which is a different element type, so state starts empty. In one edge, A→B→A→B with B's list cached and B's brand still pending, the second B decides `none` without waiting again. B already waited once and the result fails safe. **Note.**
   * **Children unmounting when `waiting` flips.** `waiting` is true only between the firm frame's mount and its one decision, so the children mount for the first time after the decision. It never flips back for the same key and name. On the type page the firm frame stays mounted through Times → Details → Confirmation (`Gate` is never pending again once `last.current` is set), so typed details cannot be lost. On the manage page `b.firm.name` survives `setB`.
   * **Side effects, notes only:**
     * The banner and logo still drop into the header at the moment of decision, while the skeleton is showing, so the skeleton moves by up to the banner's height (h-20/h-28). The real content draws once, in place.
     * A firm whose brand answered after the wait on one page shows its brand on the next page (a new frame, cached answer). The brand changes between pages, never within one.
3. **Round-1 finding 1 (Must; BB3b): fixed.** BB3b now fails with the query key reduced and with the favicon restore removed (mutations above).
   * With the key reduced, the name guard does hide A's cached brand, as the caller expected. BB3b still fails because B loses its own neutral read (`data-brand-colour` is absent, not #1f4e79). So the cached-brand bug is caught, as a "wrong brand for B" failure rather than a leak.
4. **Round-1 finding 3 (BB4b): fixed.** The page's own read is routed to 429; the error frame draws nothing although the brand read answers 200 (checked server-side in the same step).
   * Removing only the `firm !== undefined` guard is masked by the name guard (`undefined !== name`), and the reverse is also true. The behaviour (rule 3) is still covered, and round-1-style code without the guard fails it. **Note.**
5. **Minors.**
   * `--color-ring`: fixed. It is used as the team's `ring-ring/50`; the brand colour is already held to ≥4.5:1 on white (`branding.ts:44`).
   * `dir="auto"` on the name and the tagline: fixed.
   * m2 (extreme logo shapes): not fixed, and listed in the build notes as the firm's own image. Accepted.
6. **New in the diff.**
   * **Minor, possible CI flake:** BB8's early probe is a fixed `wait(800)`. It assumes the page's own read has answered by then; if not, the Gate frame reports `none`, not `waiting`. Better: wait for `[data-brand-state="waiting"]` with a timeout. Not blocking: it passed here and in the builder's runs.
   * **Note:** `data-brand-state="none"` is also on the Gate's firm-less loading frame, so `branded()` on its own could return before the firm is found. Every call today comes after a firm-specific wait (`data-public-state`, `data-firm-name`, `data-type-card`), so no false pass results.
   * **Note:** the usage line drops `--ttl 30` and `--tsconfig`. `run-suites.sh` reads it and the run passed; the line now says how to stop the copy by hand.

### Journey test (reviewer role, re-scored on the diff)
J1–J7 as in round 1.
* J5 (A's manage link under B's address) now shows no foreign brand (BB7): trust and sources goes from ½ to 1.
* Speed stays at 1: the up-to-3 s skeleton applies only to a slow brand read, which starts in parallel with the page's own.

**Score 10/10: pass.**

No Blocker or Major is open. The breaker's two Majors (M1 manage link under another firm's address, M2 first paint) are **both fixed**. All three round-1 findings are fixed. The remaining items are a Minor (BB8's fixed 800 ms probe) and notes.

**Verdict: Approve**

## Merge of main (diff cc1066bcc..dfced959f)

Diff-only re-review of the three commits after the last Approve (cc1066bcc): 2b3dcdf84 (clean merge of origin/main at 17b002fc0, after #2910), b64f9933b (FO-3w screenshot put back) and dfced959f (J-23 screenshots put back). Checked with git at dfced959f; origin/main = merge base = 17b002fc0.

1. **Scope.** `git diff --name-only origin/main...dfced959f` lists 15 files: `booking-public/frame.tsx`, `booking-public/brand.tsx`, `tests/check_pf13c_booking_brand_browser.ts`, and 12 under `product/screens/PF-13c/` (break-report, build-notes, review, 9 screenshots). Nothing else. Held.
2. **Approved code unchanged.** The brief's check `git diff cc1066bcc dfced959f -- …/booking-public …/check_pf13c_booking_brand_browser.ts` is **not empty**. It shows 2 lines, in `manage-page.tsx` (cancel dialog keeps a refused reason on its field when the status is `422`, was `400`) and `type-page.tsx` (field errors on `422`, was `400`). Both come from main, not from this PR: PF-28 part 4 (b18338d10, "booking doors answer field errors 422"), and both files are byte-identical to origin/main at dfced959f. This PR's own files (`frame.tsx`, `brand.tsx`, the check) are unchanged since cc1066bcc (`git diff --quiet` passes). The approved code is unchanged. The brief's statement that the diff would be empty was imprecise; this is not a finding.
3. **Interaction with the frame.** Main's diff since the approved base (7961f166..17b002fc0, 250 files) touches nothing named brand/branding, no public branding API, and no `frame.tsx`/`brand.tsx`. Under `booking-public/` it changes only the two 400→422 lines above. These are about field errors inside the pages, which the frame wraps but does not read. The API changes (`booking/service.ts`, `settings/types.ts`, `availability.ts`, `timings.ts`, `feed.ts`, `consult/service.ts`) have no added or removed lines that mention brand, logo, colour, accent or firm name. #2910 (PF-13 part 2) was already under the approved code: its branch tip is the approved base 7961f166, an ancestor of cc1066bcc. No interaction found.
4. **Restore commits.** b64f9933b touches only `fo-3-booking/screenshots/fo3w-times-dubai-1440.png`. dfced959f touches only 10 `J-23/screenshots/*.png`. All 11 are byte-identical to origin/main at dfced959f, so they put back main's files with nothing extra.

Builder's runs at dfced959f (not re-run here; diff-only scope): check_pf13c_booking_brand_browser 28/28, check_pf13_branding_browser 40/40, check_fo3w_booking_browser 67/67, check_fo3w_manage_browser 50/50, j_23 15/15 on a fresh copy. These cover the frame and the pages that took main's 422 change. The earlier journey score stands: no PR code changed.

No Blocker, Major or Minor opened.

**Verdict: Approve** (dfced959f073fafc08e1c88d30ec8e1f4d616266)

## Card row, merge of main and the PF-30s flake fix (diff 9f2938573..90436aa81)

Diff-only re-review of the three commits after the last Approve (9f2938573): 016069619 (card row), 814389b1a (merge of origin/main at 3264e2510) and 90436aa81 (PF-30s suite fix). Checked with git at 90436aa81. Suites not re-run.

1. **Scope.** `git diff --name-only 3264e2510 90436aa81` lists this PR's files (`booking-public/frame.tsx`, `brand.tsx`, `tests/check_pf13c_booking_brand_browser.ts`, `product/screens/PF-13c/*`), plus `web/src/MODULE.rows/PF-13c.md` and `tests/check_pf30s_find_box_browser.ts`. Nothing else. 3264e2510 is an ancestor of origin/main. Held.
2. **Approved code unchanged.** `git diff 9f2938573 90436aa81` lists no path under `booking-public/` and no `check_pf13c*` path: empty for this PR's code. Held.
3. **Card row (016069619).** `MODULE.rows/PF-13c.md` is a new fragment of 2 lines. One starts `Entry points:` and one starts `Tests:`. No frozen card line is touched (P-712). The facts match the code:
   - Routes: `/book/:firmKey`, `/book/:firmKey/:slug` and `/book/:firmKey/manage` (`front-office/routes.tsx` l.39–41).
   - Exports: `usePublicBrand`, `useDrawnBrand`, `useFavicon`, `BrandImage` and `BRAND_WAIT_MS = 3000` (`brand.tsx` l.29, 36, 40, 59, 70).
   - `useDrawnBrand` decides once. It waits until the read settles or `BRAND_WAIT_MS` passes, and keeps a brand only when `brand.name === firm` (l.50). That matches "draws once; only a brand naming the page's own firm".
   - `PublicFrame` in `frame.tsx` calls `useDrawnBrand` and holds `data-brand-slot` (l.17, 26). The read goes to `firms/:firmKey/branding` through `publicCall`, which is `GET /api/public/firms/:firmKey/branding`.
   - Both named tests exist.
   - Nit, not a finding: the banner and logo are drawn by `PublicFrame` around `data-brand-slot`, not inside it. "into `data-brand-slot`" is shorthand.
4. **Merge (814389b1a).** The merge is clean. First parent 9f2938573, second parent 3264e2510 (main). Main's side brings in no change to this PR's files (point 2).
5. **PF-30s suite fix (90436aa81), +13/−2 against the merged tree.** The `slash(p)` helper is used only at the two F9 keyboard steps that press "/" and then type `Kit…`.
   - **Is it a legitimate test fix?** Yes. F9 tests choosing a row with the keyboard (BR-3/Enter/Escape), not BR-1. A person presses "/", sees the box take focus, then types. They do not type into a box that never opened. The waits are tied to a condition (`document.activeElement` has `data-find-input`), not a fixed sleep. The builder's evidence shows the flake is on main without this PR (1/8 on 5dd56f9e7). The failure was at the step after `Enter` opens the lead page (old l.209–210), which fits "a '/' pressed as the new page appears is lost".
   - **Does it fail loudly?** Yes. If the second press also leaves the box without focus, the helper throws `"/" pressed twice and the find box never took the focus`. The suite body is `try { … } finally { browser.close() }` with no `catch`, so the error rejects the top-level await and the run exits non-zero. Only `waitForFunction`'s timeout is turned into a boolean, and that boolean is checked every time.
   - **Can it mask a BR-1 regression?** No. If "/" stopped opening the box, both presses fail and the helper throws. F4 (l.140–143) still presses "/" once on a settled page and asserts focus with an empty box, with no retry. F4's fail case (a "/" in another field stays there) and the F10 step (l.293) still press "/" directly. The only thing the retry can hide is a "/" lost in the first instant after a route change. That is not what BR-1 or F9 test.
   - **Is there a product question left?** Yes, a small one. The cause on the product side is not pinned down (no repro under the in-page recorder in 23 runs). From `find-box.tsx`, one plausible cause is this: `FindBox` is mounted by both `platform/frame.tsx` and `front-office/sales/sales-frame.tsx`. A "/" handled by an instance that then unmounts or `reset()`s as the lead page settles would leave focus on BODY with an empty box, which is what the probe saw. This is a hypothesis, not verified. For a person it would mean a "/" pressed in the same instant a page appears is sometimes ignored, and the next "/" works. That is Minor at most and belongs to the PF-30s lane, not this PR. Recommendation for the tech lead: log a qa row ("'/' pressed in the first instant after a route change can be lost; pin the mechanism") so the retry does not become the permanent explanation. It does not block this PR.

No Blocker or Major opened. One recommendation for the PF-30s lane (point 5, qa row), outside this PR's scope.

**Verdict: Approve** (90436aa81bec5d33f67a2e7128c5c3009b7a32b0)
