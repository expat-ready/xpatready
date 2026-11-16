# FO-4sf journey test (reviewer, PR #1985, head c4d7b06bb)

16 Nov, about 13:00 UTC (18:30 IST). Run by a reviewer who did not build it. Isolated copy `rev_fo4sf` on :4437 (the runtime lane's ports), never :4400. AI was off. Cost: US$0. My walk was a headless Playwright script driven like a person: click, Tab, Space or Enter, read the screen. It is not a visible-browser walk.

Named on purpose: main already has `screens/FO-4sf/journey-test-reviewer-2026-11-16.md` for the build that merged in PR #1962. On the Mac's case-insensitive disk, `fo-4sf/` and `FO-4sf/` are the same folder.

## Journeys
| # | Persona · goal | Result |
|---|---|---|
| J1 | Case Manager (user-T) · "show me the leads added by hand" | On All open, pressing **Added by staff** narrows the list. The address becomes `?view=all&source=MANUAL` (about 400 ms). But the rows' **Source** column reads "Referral (sample)" and "Phone call (sample)" under a pressed "Added by staff" (the builder's `fo-4-sales/screenshots/leads-source-filter-1440.png`). One word, two meanings. |
| J2 | Same · switch chips with a filter on | Mine → `?view=mine&source=MANUAL`. Unassigned → `?source=MANUAL` (the first chip is left out of the address). The source survives every chip change. |
| J3 | Same · open a lead, then go back | Browser Back keeps `?view=all&source=MANUAL`. The in-app **Leads** link goes to `/front-office/leads?view=all` and **drops the filter** (`leads-page.tsx:87` passes only `from: view`). |
| J4 | Same · search inside a filter | Searching for a name that is not there says "No lead matches “zzz-nobody”." It does not say the source filter may be hiding the lead. |
| J5 | Manager · "everything that came from Referral / Website form" (AG-2-23 §2) | **Cannot be asked.** The only choices are Web form, Added by staff and Booking. The API refuses the stored values: `?source=WEBSITE` → 400 "Unknown source: WEBSITE. Choose from WEB_FORM, MANUAL, BOOKING." `?source=Referral (Sample)` → 400 too. |
| J6 | Keyboard only, 1024 px | Tab order: header → Leads → Unassigned → Mine → All open → Web form → Added by staff → Booking → search → table. The focus ring is visible (box-shadow ring), and Enter or Space toggles. The groups are announced as "Which leads" and "Source". |
| J7 | 200 % zoom at 1024 (512 CSS px) | No sideways scroll, and the chips wrap. axe-core (WCAG 2.2 A/AA) reports 0 violations. |
| J8 | Case Officer (user-O, own-only, "everyone sees all" off) · Unassigned plus a source by URL | `view=unassigned&source=MANUAL` → 200 `[]`. Unfiltered Unassigned also answers 200, because this role's keys allow it, so the filter adds nothing. A bad source → 400 before the view check. |
| J9 | Data underneath | The filtered Unassigned list is a subset of the unfiltered one (4 of 4). A filter read writes no `audit_event` row. Repeated `source=MANUAL&source=MANUAL` is de-duplicated. Junk in the address (`?source=FAX`) is dropped on screen with no error. |
| J10 | Real data · the **Booking** chip | No product path writes a `BOOKING`-door lead: `arrival.ts:18` accepts `WEB_FORM \| MANUAL` only. Only the suite's SQL inserts fill it, so on the demo the chip always shows the empty state. |

## Break-it
- **Visibility:** I swapped AND for OR at `leads.ts:61`. 12 of 29 suite lines fail (DW1 ×2, DW2 ×2, DW3 ×8). The post-query `sees` filter still hid other people's leads in "all", so it is a real second guard. The test catches the widening because it checks that the list narrows.
- **Bad input:** wrong case, an unknown value or a mixed list → 400. A blank value means all sources.
- **Wrong view plus a source:** 422 for the view (the view is checked first).

## Score
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | ½ | Filtering by the arrival door works. The requirement's "source" question (J5) cannot be asked, and Booking never matches real data (J10). |
| Next step obvious | 1 | The chips sit beside the view chips, with Clear source next to them. The empty state names the filter. |
| Plain words | ½ | Each label is plain, but "Source" names the door in the filter and the free-text source in the column (J1). |
| Feedback and state | 1 | `aria-pressed`, the address and the list all move together. |
| Correct data | ½ | Rows are right for the door and visibility holds (J8, J9). The field is the wrong one for AG-2-23 (glossary line 229–235). |
| Error recovery | 1 | The 400 names the allowed values. Junk in the address is dropped. Clear source works. |
| Accessibility and screen sizes | 1 | axe finds 0 issues at 375, 1024, 1440 and 200 %. Keyboard only works. The groups are labelled. |
| Speed | 1 | First paint 228 ms. Filter about 400 ms. One request per view and source. |
| Visual quality | 1 | Team chips and tokens, and the controls wrap at 375. |
| Trust and sources | ½ | The source is shown on every row, but the filter and the column disagree. |
| **Total** | **8 / 10** | Passes the score bar with no 0. The review's Blockers stand regardless (see review). |

## Not tested
A real screen reader. An intended user's unaided walk (D17 and D20 stay with the founder). A visible headed browser (my walk was headless and scripted like a person).
