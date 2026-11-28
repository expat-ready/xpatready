# PF-21rs B2 Legal holds: journey test (reviewer), 26 Nov

Commit `782b79a16c69bd3f7851fa3008cbcf6a3c88ac46`. Isolated copy `pf21rsr2` on :4441 (never :4400), AI_LIVE=off, US$0, stopped after. Chromium via Playwright, headless, driven only by what a person sees (labels, roles, button names). The DB was read after each journey. The builder's `check_pf21rs_browser.ts` passed 66/66 twice on the same copy. Review: `review-b2.md`.

## Journeys (persona · goal · expected)
1. **Main (W3).** Platform Owner: "Hold this client's record while the matter runs, then let deletion go ahead when it settles." Expected: sign in on the card → Privacy › Legal holds → Hold a firm's data → firm by name → Advanced → One person record → paste the id from the request page → reason → Place → row Active, `KeepPeriods.check` HELD with the reason → Release with a reason → row under Released, the check OK.
2. **Alternate:** a whole-firm hold placed and released with the keyboard only.
3. **Empty:** Active with no hold teaches the first action.
4. **Error:** empty submit; the firm typed but not chosen; a blank or bad id; a reversed or empty date range; a bidi reason; release with no reason.
5. **Wrong role:** Support staff and our Auditor open `/system/privacy/holds` by URL; a firm Owner's token calls the API.
6. **Recovery:** double click on Place; reload with the dialog open; Escape with typed values; two tabs releasing the same hold.
7. **Screen boundary:** the person id comes from "Data requests to us" (B1's request page); after release, deletion is allowed again (the app's delete check; the firm-side screen is PF-21d's, Q3).

## What held
* J1: done in about 40 s of person time. The list opens in 104 ms; Place to listed takes about 1.1 s. The row reads "Sample immigration firm · Person record 48a5…326f · <reason> · 26 Nov 2026, 07:51 UTC, Platform Owner (Sample) · Release". The check answers `{"verdict":"HELD","holds":[{…reason…}]}` and, after release, `{"verdict":"OK"}`. The DB has 1 row, the reason stored exactly (444 characters, Polish and Chinese), and `placed_by staff:<id>`. There is 1 firm-trail line per change, plus the guard's lines.
* J2: Tab ×9 reaches "Hold a firm's data". Enter focuses the firm search; type, Tab, Enter chooses the firm and focus moves to "Change the firm (…)"; Tab ×2 reaches the reason; Enter places the hold and focus returns to the button. Enter on Release, type, Enter releases it, and focus lands on the h1.
* J3: "No active hold. A hold stops deletion of what it covers until it is released." (concept §5, word for word).
* J4: nothing is stored on any refusal. Reversed range: "The range ends on or after its start." under To. Bidi: "Write the reason as ordinary text." Release with no reason: "This needs a written reason (up to 500 characters)."
* J5: Support and Auditor get "Not available: Your roles do not include the permission this needs (system/compliance:legal-hold)…" with no table, no button and no link. The firm token gets 403 ×3, with nothing written.
* J6: a double click stores 1 row. Reload: dialog closed, nothing written. Escape asks "Discard your unsaved changes?". Second tab: "This hold is already released; nothing was changed.", and Cancel refreshes the list (the row leaves Active).
* Sizes: axe-core WCAG 2.2 A/AA shows 0 serious on the list and on the dialog with Advanced open at 1440, 1024, 720 (1440 at 200 %) and 375. No sideways page scroll. The primary button is 44 px at 375.

## Findings
* **Major:** the firm typed but not chosen gives "This is not in the expected format." (shot `12-typed-not-chosen-1440.png`). The same words appear for a blank or bad person id, and empty dates give "A date (YYYY-MM-DD) or a time with its zone." (`holds-page.tsx:25-43`). B1 fixed these words for the same picker (`requests-page.tsx:31-32`).
* **Minor:** at 1024 the table overflows its box by 46 px, so the Release cell is cut and the reason runs to 36 lines (`09-list-1024.png`). A refused release leaves focus on the dialog box. The All view has no "Released" word. The full person id cannot be read anywhere.
* **Note:** opening the request page in a second tab to copy the id asks for a second sign-in (console session per tab, #3489).

## Score (each 0, ½ or 1)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | J1 and J2 end to end on screen; HELD, then OK |
| Next step obvious | 1 | One filled button; the empty state teaches; Release on each row |
| Plain words | ½ | Four refusals in format words (Major) |
| Feedback and state | 1 | Done lines (`role=status`), busy buttons, 409 words, refresh on close |
| Correct data | 1 | DB = screen; one row on double click; audit lines present |
| Error recovery | ½ | The likeliest slip (firm not chosen) gives a misleading message |
| Accessibility and screen sizes | ½ | axe 0 and full keyboard path; 1024 table cut; focus after a refused release |
| Speed | 1 | 104 ms list; about 1.1 s place |
| Visual quality | 1 | Team frame, long text wraps at 1440, danger styling for Release |
| Trust and sources | 1 | Who placed or released by name; reasons; "the firm is never told why" |
| **Total** | **8.5 / 10** | **Pass** (8 or more, no 0) |

Fixes that raise the low criteria, most valuable first: (1) check before sending, as B1 does, and use plain refusal words (plain words, error recovery); (2) let the 1024 table fit and focus the release reason on a refusal (accessibility).

## Not tested
A real screen reader; Safari and Firefox; a hostile file (no upload here); an intended user's unaided walk (D17 and D20 stay with the founder).

**Verdict:** journey pass at 8.5/10. The review still blocks on the Major (`review-b2.md`).
