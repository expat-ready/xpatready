# Review: QA-743 / R1.39 "staff calendar: own bookings and time off" (PR #2929) at 690477895

Reviewer: Opus 5.5, fresh context (did not build it). Skills `screen-review` and `journey-test` (reviewer role): `journey-test-reviewer-qa743-2026-11-22.md`, **8/10**. 22 Nov 2026.
**Scope:** `api/src/front-office/booking/feed.ts` (`offItems`), `web/.../booking/calendar/{contract.ts,calendar-page.tsx}`, `tests/check_fo3st1_calendar_browser.ts` (QA-743 section), five screenshots. No schema change (checked). The branch head is now a14ebaa6b; it adds only `qa/built/R1.39.md`, so the code reviewed is the same.
**The bar:** the tech lead's brief; concept fo-3-booking §4-§6 (FO-3st1; the concept draws no blocked period, so the neutral "not available" style); AG-4-62 rules 5, 7, 8; AG-4-67; STANDARDS, EXPERIENCE, QUALITY.

**Verdict: Block (Ship after fixes).** The feed is correct and safe, and the List is right. One Major: in Week, a part-day period's hours cannot be seen at 1024 or 1440 px. The label is cut off and the "shaded hours" are not visible. The check passes anyway, because it tests a data attribute and not what a person sees.

## Runs (my copy `rv743` on :4442, stopped after; never :4400)
- `check_fo3st1_calendar_browser.ts`: **32/32, exit 0**. All five QA-743 lines pass.
- qa's `tests/journeys/j_39.ts` (from #2914, run unchanged against my copy, then removed): **17/17, exit 0**. W4 "day off shows in Week, Day and List" passes.
- My own walk (headless Playwright, browser zone Asia/Dubai, as Client C with the list key), in Team › Week, Day and List:
  - widths 1440 and 1024, plus 1280 at 200 % (640 CSS px);
  - Tab order checked;
  - computed styles read;
  - feed answers read with Client D (Billing and finance) and with a deactivated colleague.
- DST probe of `offOn` and `offInHour` (America/Toronto, 1 Nov 2026 and 14 Mar 2027).
- Graph: G3 lists `GET /front-office/bookings/feed` as "no test reaches". This is the tool missing template-literal paths (the page and the check both call it), and it was already so before this PR. Not a finding.

## Permissions (focus asked)
- **Mine.** `offItems` reads only `staffId = ctx.staffId`, firm-scoped (feed.ts:58).
- **Team.** Team needs `agent/booking:list` before any read (403 otherwise; feed.ts:47). Client D's team feed gives 403, and her own feed holds no colleague's time off (check line 4).
- **What leaves the server.** Only `id`, staff id and name, `mine`, `label`, `startsAt` and `endsAt` (an explicit `select`). There is no reason column to leak (`FoTimeOff` has none).
- **Record rule (FO-3vr).** It does not apply to time off, and that is right. AG-4-67 rule 1 ties visibility to the lead, prospect or case a *booking* hangs on; a time-off period hangs on none. The brief's "with the list key, colleagues' show" therefore holds. Side effect, accepted: in Team, a holder with "own only" sees a colleague's name in "Host:" (it comes from their time off) even when none of that colleague's bookings are visible. No booking data leaks.
- **Cross-firm.** Both queries use `firmScope`.
- **Queries per request.** Two queries in total, none per row.

## Office zone and DST (focus asked)
- Mine and Team draw every period in the viewer's office zone. A Toronto period shows in a Dubai browser as Toronto times: the check asserts this, and I saw it.
- A multi-day period reads "from 13:00 / all day / until 12:00" on its three days.
- A whole fall-back day (25 h) and a whole spring-forward day (23 h) both read "all day", and all 24 rows are marked.
- One edge (m1): a period inside the repeated 01:00 hour on fall-back day (01:00-02:00 EST) marks no hour row. `offInHour` (contract.ts:83) takes the first 01:00. The row text is still right.

## Issues, ranked
**M1 (Must). In Week, a part-day period's "when" cannot be seen at 1024 or 1440 px. The shading is invisible, and the check passes anyway.**
- *The shading.* Shaded cells use `bg-surface` (calendar-page.tsx:209). The grid has no background of its own, so a cell already shows the body's `--color-surface`. Computed background: shaded cell `rgb(247,247,247)`, plain cell `rgb(247,247,247)`, at both 1024 and 1440 px.
- *The label.* The label has `truncate` (`:199`) and is not focusable (tabIndex -1).
  - At 1440 px: "Client I: not available · 13:00–15:00" is cut off before the times. Screenshot `fo3st1-time-off-week-team-1440.png` (Thu 26 Nov).
  - At 1024 px: it shows only "Client I: not ...", and even "Time off · all ..." is cut.
  - The full text is only in `title`, so it opens on mouse hover only. BIC-14 asks for hover *and* keyboard focus. A part-day period therefore has no visible time in Week for keyboard or touch users, or for anyone not hovering. A period that ends tomorrow shows "Time off · from 13:00" with nothing in the grid below it.
- *The check.* It asserts "its hours shaded" through `[data-off-hour]` (check:83). It would still pass with the class removed.
- *Fix.*
  - Use a neutral that differs from the page, e.g. the dashed/hatched OFF style or a sunken token that is not `surface`. Note that `--color-surface-sunken` is also neutral-50, so it would not help.
  - Let the time-off row wrap (drop `truncate` there; it is one short line per period).
  - In the check, assert that the shaded cell's computed background differs from a plain cell's, and that the label is not cut (`scrollWidth <= clientWidth`) at 1024 px.

**m1 (Should).** The fall-back repeated-hour edge above (contract.ts:83-86). Fix: mark the rows whose `hourOf` range overlaps the period, or test against both instants of an ambiguous hour.

**m2 (Should).** A deactivated colleague's time off still shows in Team as "<name>: not available". I deactivated Client I and the feed still returned her period. `offItems` does not filter by staff status (feed.ts:58-59). Suggest only ACTIVE staff, or say in the PR why not.

**m3 (Should).** `fo3st1-time-off-day-400.png` is the List at 400 px (the loop's last view, check:124), not the Day. There is no 400 px Day or Week screenshot with time off. Take it after the `day` view.

**n1.** The List under "Bookings at 13:00 on Thu 26 Nov" (the "+n more" view) also lists Client I's 13:00–15:00 period. That is reasonable; it is noted only.

## Concept fit and words
- Time off is drawn in Week (a "Time off" row above the hours), in Day, and in List (one list sorted by start). Labels:
  - Week, own: "Time off · all day";
  - Week, colleague: "Client I: not available · 13:00–15:00";
  - List: "Wed 25 Nov, all day", Host column, status "Time off" or "Not available".
- It is not a booking: there is no button or link in it, a click opens nothing, and it takes 0 of 80 Tab stops. The bookings on that day stay (AG-4-62 rule 7).
- "Time off" is the concept's §5 word, and "Not available" is the brief's. The empty state still shows when there are no bookings and no time off.

## D1–D20 (1–5)
- D1 4: Week, Day and List, own and colleagues', as briefed.
- D2 5: read only.
- D3 4: reuses `wallToIso`, `hhmm`, `Table`, `firmScope`.
- D4 4: the label comes from the server.
- D5 4: feed error path unchanged.
- D6 4: no writes.
- D7 5: no AI.
- D8 4: zone named in the header and the List column.
- D9 4: nothing to act on, and that is clear.
- D10 4: plain words.
- D11 2: M1.
- D12 3: truncation and the shading that does nothing.
- D13 3: axe clean and no sideways scroll at 400, 1024, 1440 and 200 %, but the text is hover-only (M1).
- D14 4: neutral dashed chip, team tokens.
- D15 5: Team week 0.47-0.62 s.
- D16 3: the pass/fail pair is good, but "shaded" is untested in effect (M1).
- D17: simulated only.
- D18 4: zone in each title.
- D19 4: Availability → calendar closes (j_39 W4).
- D20: simulated only.

## BIC scorecard (staff screen; BIC-01..10, 12, 13, 15-17 N/A: no questions, documents, case, filing or form here)
- BIC-11 **Met**: no new primary.
- BIC-14 **Partly**: the full label is in a hover-only `title`; the cut-off time is needed to read the period (M1).
- BIC-18 **Met**: empty and loading unchanged; time off counts as content.
- BIC-19 **Partly**: one heading and one primary, but the label is cut at 1440 and 1024 (`rv-team-week-1024.png`).
- BIC-20 **Partly**: keyboard-complete, no sideways scroll at 1024 and 200 %, axe clean; the part-day time is not readable without a mouse (M1).

## Could not check
- A real screen reader. The DOM order reads "Time off" row → period text, which should be fine.
- A headed browser. My walk was headless, with screenshots.
- An intended user's unaided walk (D17 and D20 stay with the founder).

**Verdict: Block.** Fix M1 (Must). Fix m1-m3 or list them with a follow-up row.

Reviewer: Changes 69047789522faf018d5865f3310cbef8416d8d22
