# PF-13 part 2: Branding panel — build notes (22 Nov)

**Files (all new unless said):** `web/src/modules/platform/branding/contract.ts` (shapes, pure rules), `preview.tsx` (three previews), `branding-page.tsx` (page); one line each in `web/src/modules/platform/routes.tsx` and `account-sections.ts` (the menu line is outside the brief's touch list: concept §7 Q2, the challenger agrees, asked on the PR); `tests/check_pf13_branding_browser.ts`; `web/src/MODULE.rows/PF-13.md`; `qa/built/R1.23.md`. No API change, no migration, no new library.

**What gets built:** concept §3 BR-1 to BR-8 and §4. **Not built** (concept §6b): accent colour, tagline, footer, email signature fields; drawing the brand on the real client pages and PDFs; the journey `tests/journeys/j_23.ts`.

**Real vs mock:** everything reads and writes the merged API (parts 1a, 1b). The previews are drawings of a client page, an email and a PDF header, not the real pages; the email one follows `email-layout.ts` (logo, name, the colour as the header's rule).

**Top production choices over the concept text:** (1) the firm's name comes from the open door with no token (it refuses a staff session's token: found in the first run); (2) each "Choose a … file" button names its kind in its visible words (axe label-content-name-mismatch); (3) Save is never disabled, it says "Nothing has changed." (a disabled button loses keyboard focus); (4) a lost answer drops every change and shows the read; (5) the whole file is read (at most 2 MB) so the header's declared size is checked before anything is drawn.

**Team-name mapping:** settings keys `platform.branding.*` as part 1a; no new names.

**Checks run:** `tests/check_pf13_branding_browser.ts` on a fresh isolated copy: 36/36, exit 0 (contrast and file parity with the server's functions; DW6a to DW6g; keyboard only; axe-core WCAG 2.2 A/AA in 9 states; 375/1024/1440). `tsc --noEmit` clean. Screenshots: `screenshots/pf13-*.png`.

**Known gaps:** moving to another page inside the app with unsaved changes does not ask (challenge m3; as the app's other editors). No version on the branding API: two people saving at once, the last one wins (part 1a's design). §4b's Stripe note is unverified. D17 and D20 not self-scored.

**AI cost:** US$0; live AI off.
