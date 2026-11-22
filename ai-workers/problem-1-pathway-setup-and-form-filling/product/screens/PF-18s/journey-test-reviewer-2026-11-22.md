# PF-18s part 1 (My account → Offices): journey test, reviewer, 22 Nov 2026

Commit **f5a1ea6c40c2a208d0de5009ce749a280c18fa44** (branch `claude/affectionate-cerf-jw9hv7`, PR #2897). Isolated copy `review_pf18s` on :4443 (screens lane), fresh database per run, `PLATFORM_IDENTITY=local`, live AI off, US$0. Walked with headless Chromium through a reviewer script (kept outside the repo: scratchpad `journey_pf18s.mts`), with the database read underneath. Sample firm only: Owner = user-R "Representative (Sample)", Case Officer = user-O.

## Journeys (persona · goal · result)
1. **Main: Owner adds a Calgary office and places the Case Officer.** Home → menu "Offices" (133 ms) → "Your firm works from one place" + Add an office → name "Calgary", province AB → Time zone shows **America/Edmonton** with "Pre-filled from AB. Change it if this office keeps another time." (BC → America/Vancouver, back to AB) → Add office (125 ms to the list) → toast names the zone; notice "Your firm now has offices"; two rows (first office "Sample immigration firm", ON, America/Toronto, marked "First office") → Who works where → Change for Case officer → Calgary → Save (double click) → row shows Calgary, focus back on Change → reload keeps it. **Held.**
2. **Keyboard only: Owner places the Representative in London and adds Winnipeg.** 22 Tabs to "Change office for Representative (Sample)"; Enter opens the panel on the radios; arrows to London; Enter saves (native implicit submit); focus returns to Change with a 3 px focus ring. Shift+Tab to Add an office, Enter → focus on Office name; Enter in the name field submits; Winnipeg saved with America/Winnipeg. **Held.**
3. **Empty: one office.** No list, no zone, no table, only the explanation and Add an office (axe clean). **Held.**
4. **Error: bad input.** Name of spaces → "Not saved / Please check the highlighted details." and "This is required." on Office name. Duplicate "calgary" (any case) → "An office with this name already exists." in the summary only, not on the field. Outside Canada, country "ZZ" → on the field: "a country code on the ISO list" (a fragment that does not say what is wrong or how to fix it). Input kept each time; focus lands on the panel, not the summary. **Held, with wording findings.**
5. **Wrong role: Case Officer.** No Offices line in the menu; `/platform/offices` by address says "Only an Owner or Admin can manage the firm's offices." Server: GET staff 403, POST offices 403, provinces 403, PUT placement 403. GET offices stays 200 (AG-1-74 §8 "Reading: all staff", by design). **Held.**
6. **Recovery.** Double click on "Add office" with a 118-character French/Japanese name → one office. Escape on a dirty panel asks "Discard your changes to this office?"; Cancel keeps it open, OK closes, focus back on Add, nothing saved. Two tabs: tab B renames Calgary, tab A changes the zone → "Someone changed this office since you opened it. We've loaded the latest; make your change again and save." (A's zone change is dropped, as the message says). **Held.**
7. **Across the boundary: the Case Officer's times.** After the placement, `GET /api/platform/me/needs-you` answers `zone: America/Edmonton` for the Case Officer, `America/Toronto` for the Owner (unplaced). Home shows "Times in …" only when there are items (none in the Sample), so the zone is not visible on screen in this firm. **Held (API).**
8. **Sizes.** 400 px, 1024 px, 1024 at 200 % (512 px) and 1440 at 200 % (720 px): no sideways scroll, axe WCAG 2.2 A/AA clean on every state; the place panel at 200 % fits. **Held, with layout findings.**

## Data underneath (final)
Offices: Sample immigration firm CA/ON/America/Toronto · Calgary downtown CA/AB/America/Edmonton · London GB/–/America/Toronto · the 118-char Bureau CA/QC/America/Toronto · Winnipeg CA/MB/America/Winnipeg. Placements: Case officer → Calgary downtown, Representative → London. Audit: `platform.office.add` 5, `platform.office.change` 1, `platform.office.staff` 2 (the double-clicked Save wrote one line). Calgary's add audit carries `timeZoneFrom: "province"`. Page errors: none; console errors: none.

## Builder's check, re-run by the reviewer
`check_pf18s_offices_browser.ts 4443 xr_studio_review_pf18s` on three fresh copies: **24/25, 25/25, 25/25**. The failing line on run 1 was "Escape closes it and focus is back on Add" (`backOnAdd:false`): a flaky check (my own walk saw focus return every time, so the race is likely in the check reading focus right after the dialog detaches).

## Break-it findings
* **Blocker (B1, found by the parallel breaker; confirmed in the code at f5a1ea6c, not walked by me):** Offices and Team share the cache key `["pf","staff","list",token]` with different parsers (`offices-page.tsx:19` `People.parse`, `team-page.tsx:22` `StaffList.parse`). Offices → Team gives a blank Team page; Team → Offices shows placed people as "No office". My walk never moved between the two pages, so it missed this.
* **Major (M1, found by the breaker; confirmed in the code):** after a province, choosing "Your firm's time zone" (value `""`) is dropped by `office-panel.tsx:43`. The province's zone is saved, and the audit says `province`.
* **Minor:** the London office (outside Canada) is saved on **America/Toronto**: before saving the panel shows only "Your firm's time zone", not which zone that is (build notes list it as a deviation). An Owner adding a London office can easily miss it; the toast names it afterwards. `office-panel.tsx:87-90`.
* **Minor:** error words: "a country code on the ISO list" (`api/src/platform/settings/offices/service.ts:30`, PF-18a's text, now on screen) and "This is required." alone (shared `http/input.ts:40-42`); a duplicate name is not shown on the Office name field (`office-panel.tsx:61`, the 409 has no `fields`).
* **Minor:** at 200 % / 400 px the tables squeeze rather than stack (concept §4 "tables become stacked rows"): names break mid-word ("immigratio n firm", "sponsorsh ip"); at 1024 px "Mon–Fri 09:00–17:00" wraps to three lines (`offices-page.tsx:127-133`).
* **Minor:** after a 409 the panel title still reads "Edit Calgary" while the loaded name is "Calgary downtown" (`office-panel.tsx:68` uses the stale `office` prop).
* **Minor:** the builder's focus-return check is flaky (1 of 3 runs).

## Score (each 0 / ½ / 1)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | J1, J2: add, edit, place, take out, all by mouse and by keyboard |
| Next step obvious | 1 | One filled button (Add an office); "2 people have no office yet … until you place them"; Change per row |
| Plain words | ½ | Province codes (AB) and IANA ids are accepted gaps; error fragments in J4 |
| Feedback and state | ½ | Toasts, disabled Save, busy and refusal are fine; stale "No office" rows after Team (B1) |
| Correct data | ½ | What I entered was stored exactly, with one audit line each; but M1 saves a zone other than the one chosen, and B1 shows wrong offices |
| Error recovery | ½ | Input kept, 409 explained; but focus not on the summary, duplicate not on the field, 409 drops the person's edit |
| Accessibility and screen sizes | 1 | axe clean on all states; keyboard path; focus return with ring; no sideways scroll at 400/1024/200 % |
| Speed | 1 | Open 133 ms, add → list 125 ms (local copy) |
| Visual quality | ½ | Team components and tokens; mid-word breaks at 200 %, three-line hours at 1024 px |
| Trust and sources | ½ | "Pre-filled from AB", "First office"; but the audit says `province` for a person's firm-zone choice (M1) |
| **Total** | **7 / 10** | **Below the pass** (needs 8; no 0) |

Fixes that raise the low criteria, most valuable first: separate the staff-list cache keys (B1) and send or hide the firm-zone choice (M1) (correct data, feedback, trust); then name the firm's zone in the "Your firm's time zone" option (trust/plain words); rewrite the two server field messages and put the duplicate-name error on the field, focus the summary on a failed save (error recovery); stack the two tables below ~640 px and keep the hours on one line (visual).

## Not tested
A real screen reader; an intended user's unaided walk (D17, D20 stay with the founder); an Admin persona (the Sample firm has none: Owner tested); native `<select>` opened by keyboard (headless; selected programmatically while focused).
