# Journey test, reviewer: R1.92 firm profile, offices and time zones, licence-number check (22 Nov 2026)

Commit 93187bee5e5f8e546d99f1445d54a8c0ea70e236 (PR #3028), on main's app. Isolated copy `rvj92` on :4495 (never :4400), live AI off, local identity, US$0. The scripted walk is `tests/journeys/j_92.ts`, run twice: 13/16 both times. I also checked against #3003 on :4496: 15/17, twice. I added my own reading of the screenshots and the API.

## Journeys (persona: the firm's Owner, user-R, Sample firm)
1. **Main: set the firm's time zone.** "Our firm works on Winnipeg time." My account → Firm profile → time zone → save. **Not possible:** there is no Firm profile entry (the sections are Home, Profile, Licence, Availability, Notifications, Team, Licences, Security, Terms, Offices, Plan and billing, Help & support). The API (#3003) is not on main (404).
2. **Main: add offices in other provinces.** "We opened in Calgary and Vancouver." Offices → Add an office → name, AB. America/Edmonton is shown before saving. Save. Then BC → America/Vancouver. **Held:** the list shows the first office ("Sample immigration firm", First office, America/Toronto) and both new offices with their own zone and "Mon-Fri 09:00-17:00". The toasts name the zone. The API agrees.
3. **Office times in each office's zone.** **Held as far as it goes:** the hours are shown as the office's own and are not converted to the viewer's zone. Every office has the same default hours, so the walk cannot show different hours side by side.
4. **Error: a zone not on the list.** Through the API: 422 "Choose a time zone from the list", nothing saved. On screen the zone is a list, so a bad zone cannot be typed.
5. **Licence number in the wrong shape.** "I typed my number wrong." My account → Licence → College member (CICC), the College, `X-xxxxx` → Save licence. **Saved, never refused** ("Your licence record was saved."), and it reads back on Licences (screen and API). **No warning:** no body has a `numberPattern`, and the form has no place to show one (`licence-form.tsx:32`, `:77-78`). The field's hint "Checked against the usual format only. We never verify licences." is untrue today.
6. **Sizes.** Offices and Licence at 400 and 1440 px: no sideways scroll, axe WCAG 2.2 A/AA clean, no page error. Not covered here: 1024 px and a keyboard-only path (PF-18s covers both for Offices).
7. **Recovery and re-run.** A second run on the same copy adds new names and passes the same lines. On #3003, the profile zone put back after W2 holds across runs.

## Data underneath
* The offices rows' `time_zone` is Edmonton or Vancouver as shown. The first office was written from the firm's zone (America/Toronto, the default). The bad-zone office was not written (count 0).
* `platform_staff_credential.licence_number` = the typed value. The Licences API shows the same staff, number and body.
* On #3003: the setting `platform.time_zone` was written, with exactly one audit line `A:platform.time_zone`. The 422 left the zone unchanged.

## Findings
Full detail with file:line is in `review.md`.
* Major: W1 checks only the menu label but claims the page saves the zone (`j_92.ts:74-75`).
* Major: W6's warning is missing two parts, and the test names only one. Besides PF-4c part 2, the licence form must show the API's warning, and no row's touch list holds that.
* Minor: the hours check cannot tell offices apart. W5's check is not on the field. W6 waits a fixed 500 ms. The pattern-body choice assumes `X-…` breaks any pattern. The default port 4492 is outside the runtime range. No 1024 px or keyboard path.

## Score (0, ½ or 1 each)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | ½ | Offices and licence save. No Firm profile page (the zone cannot be set on screen). No licence warning. |
| Next step obvious | 1 | "Add an office" and "Save licence" are the clear next steps. The zone is pre-filled with a "Pre-filled from AB" hint (`w3-add-office-calgary-1440`). |
| Plain words | 1 | "Choose a time zone from the list", "Calgary … added (time zone America/Edmonton)", "Your licence record was saved." |
| Feedback and state | ½ | Toasts after each save. The licence hint promises a format check that never happens. |
| Correct data | 1 | Screen, API and DB agree for offices and licence. Profile and audit verified on #3003. |
| Error recovery | ½ | The bad zone is refused in words (API). The screen offers listed zones only. The wrong-shape number gets no warning, so there is nothing to recover from. |
| Accessibility and screen sizes | ½ | axe clean, and no sideways scroll at 400 and 1440 px. Not walked here: 1024 px or keyboard. |
| Speed | ½ | Every page loaded well inside the waits. Not timed against the STANDARDS §9 budgets. |
| Visual quality | 1 | Team look, aligned table, clean at 400 px (`w7-offices-400`, `w7-licence-400`). |
| Trust and sources | ½ | The licence page cites IRCC IMM 5476 and marks Sample bodies. The "checked against the usual format" hint is untrue today. |
| **Total** | **7 / 10** | **Not a pass (8 needed). No criterion at 0.** |

To raise the score, most valuable first: (1) the Firm profile page with the zone (S5 over #3003); (2) PF-4c part 2 plus the licence form showing its warning (fixes task, feedback, recovery and trust); (3) walk 1024 px and keyboard on Licence; (4) time the Offices and Licence pages against §9.

## Could not test
A real screen reader. An intended user's unaided walk (D17 and D20 stay with the founder). The Firm profile page, which does not exist yet.
