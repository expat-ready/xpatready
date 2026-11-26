# PF-R3 Reports page · journey test (reviewer role) · 26 Nov 2026

Commit `b6b117848271d9062b29e2e2b46de4f56c21d725` (PR #3864). Isolated copies: :4741 (`pfr3r`) and :4742 (`j79r`), never :4400. Sample data, US$0, live AI off. The reviewer's one score for this check. Review: `review.md`.

## Journeys (written from concept r2 before walking)
1. **Main path.** The Owner wants to know how this month is going.
   - Sign in on the card, go to Home → Reports (758 ms), read the Owner dashboard.
   - Pick Person "Case officer (Sample)", then reload.
2. **Alternate.** The Owner exports Tax collected from the Billing / Finance dashboard and reads the Activity log.
3. **Empty.** The Owner opens January 2020 by address.
4. **Wrong role.**
   - Billing / Finance: own scope for cases and sales, firm-wide money, no people.
   - Read-only: lands on Case Officer.
   - Case Officer: a `person=` in the address.
   - Case Manager: money WITHHELD.
5. **Error.** One figure is made UNAVAILABLE (the builder's route rewrite, re-run). Typing From after To.
6. **Recovery.** Reload keeps the filters; `?dashboard=nope`; double-clicking Export.
7. **Keyboard only.** Tab from the page top through the filters, the cards' (i), Export and the table regions.
8. **Sizes.** 1440, 1024, 512 px (1024 at 200 %) and 375 px, with axe.
9. **Break it (API).**
   - Case Officer: `staffId` of another person; `scope: all`.
   - Billing export; unknown, unregistered and extra-key exports; empty-table export.
   - Owner: another firm's `staffId`; anonymous export.
10. **Across the boundary.** Export → Activity log shows "Report table exported: Tax collected, 2 rows."

## What held
- **Routing.** Every role lands on the right dashboard. An unknown dashboard falls back. The Case Officer's `person=` is dropped, and their query has no `staffId` (request body captured).
- **No leak of people.** `GET /reports/filters` returns no `people` to the Case Officer, Billing or Read-only. The Case Manager's picker loads.
- **Money per currency.** Never summed. A narrowed person shows "No invoices in this period", never "USD 0.00".
- **Export audit.** One line, committed before the file:
  - `report.exported`, `plat_report_export`, uuid key;
  - detail `{metric, scope: financial, from, to, rows: 2}`, no figure.
  
  Refusals write no line: 403 no key, 403 WITHHELD, 400 single figure or unknown or unregistered metric, 422 extra key, 401 anonymous. A double-click gave one line and one download.
- **Server guard.** Case Officer with another `staffId` → 403 OWN_ONLY; with `scope: all` → still `own`.
- **Data underneath.** J-79 12/12: Fees billed equals the database's invoice totals (CAD 2,260.00 · USD 525.00), and the same check fails against last month. Leads equals `fo_lead`; the CSV rows equal the API's.
- **Sizes and speed.** axe 0 serious at 375, 512, 1024 and 1440, with no sideways scroll. Tables scroll inside their card at 375. LCP 372 ms. No page or console error.
- **Repeat runs.** `check_pfr3_reports_browser.ts` 27/27 on a fresh copy. The second run on the same database was 26/27, because the reused invoices double the expected figure.

## Findings (detail and fixes in review.md)
- **Major.** "What this counts" is a native `title`: nothing shows on keyboard focus, click or touch (`reports-page.tsx:22-25`). Seen in the 1440 shot with the (i) focused and no words.
- **Major.** After picking a person, the old firm-wide figures sit under "Case officer (Sample)'s work" until the new answer lands (`keepPreviousData`, `:87`, `:90`). Seen in the walk at 1440, and again with the query slowed by 2.5 s.
- **Major.** No month picker (row batch 5, BR-3, the board). From after To snaps back silently while the address keeps the bad date (`contract.ts:44`).
- **Major.** Missing tests: BR-6 empty copy, BR-1 person words, BR-2 Read-only, BR-3 person reload and Billing with no `staffId`.
- **Minor.**
  - Nested bordered table, rows 37 px.
  - "(left the firm)" shown for SUSPENDED staff.
  - An empty-table export has no header row.
  - Export 403 copy names the wrong permission.
  - Reports is not in the left menu, and the path reads "My account › Reports".
  - Retry is 32 px tall at 375 px.
  - The check cannot be re-run on the same copy.

## Score
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | Every persona reads their view; the Owner exports; J-79 12/12 |
| Next step obvious | ½ | Changing the month takes two date edits; Reports only through Home |
| Plain words | ½ | Copy is clear, but "(left the firm)" for suspended staff and the wrong permission in the export refusal |
| Feedback and state | ½ | Good empty, withheld and unavailable states; stale figures on reload; silent From>To |
| Correct data | ½ | Screen equals the database once settled; stale figures shown under the wrong words meanwhile; header-less empty CSV |
| Error recovery | 1 | Retry; dashboard fallback; person dropped; 403 and 503 messages with a reason |
| Accessibility and sizes | ½ | axe 0 at four widths, keyboard path complete, 200 % fine; tooltip words not on focus or touch |
| Speed | 1 | LCP 372 ms; one query per view |
| Visual quality | 1 | Calm team look at all widths; the nested table border is minor |
| Trust and sources | ½ | Source words and scope on each card, but the source is hover-only and the scope words come before the figures |
| **Total** | **7/10** | **Below the pass mark of 8; no criterion at 0** |

**To raise it (most valuable first):**
1. A focusable tooltip or toggletip for "What this counts" (accessibility, trust).
2. A busy state during a reload, with the badge taken from the answer's own filters (feedback, correct data, trust).
3. A Month select with "Custom dates…" and a From>To message (next step, feedback).
4. The suspended-staff label and the export refusal words (plain words).

## Not tested
A real screen reader; an intended user's unaided walk (D17/D20 stay with the founder); the walk video (no ffmpeg in this container); timings on the Mac or CI.
