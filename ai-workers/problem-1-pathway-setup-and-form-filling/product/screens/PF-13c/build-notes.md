# PF-13 part 3: the firm's brand on its public booking pages — spec and build notes (22 Nov)

**Agreed by** Lead 4 on #2910 (15:04 IST and 16:00 IST): the part that completes R1.23's "client pages … show them". No new board: it fills FO-3w's existing `data-brand-slot` (FO-3w option (b), rev 16.39), with the look of PF-13 part 2's "Client page" preview.

**What it does.** On `/book/:firmKey`, `/book/:firmKey/:slug` and `/book/:firmKey/manage`, `PublicFrame` reads `GET /api/public/firms/:firmKey/branding` (merged, part 1b) and draws:
* the banner above the header (decorative, `alt=""`);
* the logo beside the firm's name (`alt="<firm> logo"`), and the tagline under it (P-629);
* the colour on the header's rule and as the page's primary colour (buttons, ticks), through `--color-primary`; the hover shade is the colour 20% darker;
* the favicon as the tab's icon, restored when the page closes.

**Rules.**
* (1) Firm values are text or `<img>` sources, never HTML; links are kept only when their path is `/api/public/firms/…`.
* (2) A firm with nothing set gets what the read answers: ExpatReady's neutral colour `#1f4e79` (AG-16-2, part 1a's `NEUTRAL_COLOUR`, the same as emails) and no images.
* (3) A page that is not found draws no brand.
* (4) An image whose link stops answering is taken away, never shown broken.
* (5) The read starts with the page's own, so the colour is there at first paint.
* (6) A stored colour is at least 4.5:1 on white (part 1a), so white text on the brand buttons keeps AA.

**Files.** `web/src/modules/front-office/booking-public/frame.tsx` (FO-3w's frame: the slot), new `booking-public/brand.tsx`, new `tests/check_pf13c_booking_brand_browser.ts`. No API change, no migration, no new library.

**Journey.** qa's `tests/journeys/j_23.ts` (on main from #2944) is reused, not rewritten; its W4 is this part.

**Checks.** `check_pf13c_booking_brand_browser.ts` 23/23, exit 0 and `j_23.ts` 15/15, exit 0, each on a fresh isolated copy at `2f110acca`. The check covers BB1-BB6: brand on all three pages; firm B never shows firm A's; neutral look; not found; lost logo; keyboard, axe, 375/1024/1440.

**Not here.**
* The client portal (PF-4ps, not on main): it can reuse `brand.tsx`.
* Generated PDFs.
* The accent colour (the read has it; nothing on these pages uses a second colour).

## Round 1 (reviewer Changes, breaker Changes) — what changed
* **Break M1 / review finding 2 (manage link under another firm's address).** The frame draws a brand only when the branding read's name equals the page's firm name. The booking read gives a name, never a key; both are the firm's `operatingName`. Fail test BB7: firm B's booking under `/book/sample-firm/manage#…` shows none of A's; under its own address it shows B's. Residual: two firms with the same operating name. Recommendation: the booking read could return the firm's key (API, not this part's touch list).
* **Break M2 (first paint).** Once the page has found its firm, it waits for the brand read behind its loading state, at most 3 s (`BRAND_WAIT_MS`). It then draws once, with the brand or without it; a late answer changes nothing (`useDrawnBrand`, `data-brand-state`). Fail test BB8: 1.5 s → loading, then branded, nothing moves after; 4.5 s → drawn without the brand at about 3 s and stays so.
* **Review finding 1 (BB3 could not fail).** New BB3b: firm A → firm B inside the app (pushState + popstate, no reload), then Back. The favicon restore and the per-firm cache are both exercised.
* **Review finding 3 (rule 3 untested).** New BB4b: the page's own read answers 429 → no brand, although the brand read answers 200.
* **Break m1:** the focus ring takes the brand colour (`--color-ring`). **Break m3:** `dir="auto"` on the firm's name and tagline. **Break m2 (extreme logo shapes), not fixed, listed:** a 2000×40 logo draws as a thin line; the image is the firm's own.
* Check now 28/28, exit 0 (`run-suites.sh --only`). On the round-1 code it fails (exit 1: it stops at the first wait for the brand decision).
