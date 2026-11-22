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
