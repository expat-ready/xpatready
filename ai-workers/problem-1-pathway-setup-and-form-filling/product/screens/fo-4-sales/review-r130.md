# R1.30 — Source filter on the prospects List and board (QA-533), from-after-to at the field (QA-572): review

Reviewer agent, 20 Nov 2026 (IST date). PR #2454, branch `claude/keen-goodall-pgdoiq`, head `9e2e67c72ecc8f016e42e05edaaa6dfa4dd2c6ed`. I did not build this. Copy: isolated `rev_r130` on :4491 (`PLATFORM_IDENTITY=local`), never :4400; stopped after. Live AI off, US$0. The bar: row R1.30's Done-when, AG-2-23 ("The board/list SHALL be filterable by rep, source, … stage, date range"), QA-533 and QA-572 (`qa/BUGS.md:268-269`), `STANDARDS.md`, `EXPERIENCE.md`. No `concept.md` sits in `screens/fo-4-sales/`. Concept fit is judged against the row, the two bug rows and the earlier FO-4 review. Journey test: `journey-test-reviewer-2026-11-20-r130.md`, **8.5/10 (pass)**.

**Verdict: Approve** (on the skill's scale: Ship). There is no Blocker and no Major. The three Minors below can follow in a small PR or be written into QA-572's row.

## Re-runs on the exact commit (mine)
| Suite | Result |
|---|---|
| `tests/qa/check_r130_filters_widths.ts`, twice | **56/56**, **56/56** |
| `tests/check_r130_prospect_source.ts` | 24/24 |
| `tests/journeys/j_30.ts` on a fresh copy | **55/55** (on a copy the other suites had already seeded, W3/W3d fail on totals and stage counts. j_30 needs a fresh database, the same on main, so this is not this PR's fault) |
| `tests/check_fo4sf_source_filter.ts` (Leads after the move), fresh copy | 34/34 |
| `web` `tsc --noEmit` | clean |
The suites rewrite the tracked `screens/fo-4-sales/screenshots/*.png`. I restored them with `git checkout`, so my tree is clean apart from the two review files.

## What holds (walked by me, `walk.mjs` in my scratchpad)
* **List:** Source opens a checkbox list with type-to-find. Choosing "Walk-in" by keyboard only takes 18 Tabs, then Enter, type, Tab, Space, Escape. The result is a chip, `?source=Walk-in` in the address, focus back on "Source (1)", and the filter applied in 34 ms.
* **Board/List switch:** the source is kept both ways (`?source=Walk-in`). The board draws only that card, and the counts and "Open prospects by value" follow the source.
* **Long text:** a 100-character French source with a comma and apostrophes wraps in the chip. No sideways scroll at 400, 1024 or 1440 px; axe clean on the board.
* **Narrow screens:** at 1024 px and at 200 % zoom (720 px CSS) neither the List nor the board scrolls sideways, and the Source panel stays inside the screen.
* **API:** `?source=Nope` gets 400 on `/prospects` and on `/pipelines/INDIVIDUAL/board`. The corporate board accepts `source` too. Leads' Source filter still works after the move (`?source=Phone+call`, chip).
* **From after to (QA-572):** the error shows at "Engaged from" with `aria-invalid=true` and `aria-describedby` pointing to "The from date must be on or before the to date." (role status). The earlier list stays and nothing is sent. Typed into the address, the range gives a plain-words empty state, the same on Leads.
* **Judgement call (4), choices = `leads/sources`:** I tried to make an own-only person's prospect whose lead belongs to someone else. Engage keeps the lead's active owner as the prospect owner, and `assign` refuses an engaged lead (409). In what I tried, the choices always covered the person's own prospects.
* **Judgement call (3):** the board's value lookup (`pipeline-page.tsx` BoardView `rows`) now sends the same sources, so it is never an unfiltered list.
* **Judgement call (1):** the kept list can predate the "to" just typed (shot `rev-list-to-before-from-1440.png`: 212 rows under 20 Nov → 21 Oct). The field message in red beside it says what is wrong. This is acceptable under QA-572's "keep the list" and is not a finding.
* **Code:**
  * One server filter, `source-filter.ts`, used by all three routes.
  * The source narrows inside the visibility (`AND` with `ownerStaffId`).
  * Totals are grouped in the database with the same `lead.source in` filter (`board-totals.ts:12`).
  * Each list costs one GROUP BY for the choices plus one query, with no request per row.
  * Move invalidates the `["fo","prospects"]` prefix, so filtered boards refresh too.
  * Removing the filter fails tests: DW1 (FAX → 400) and DW2 (Referral totals) fail if `sourcesChecked` or the totals filter goes, and DW5 fails if `calm` goes back to alert.

## Issues (Must = Blocker/Major: none; Should = Minor)
1. **Should (Minor), QA-572 is only part fixed: a malformed day in the address still shows the raw API words and a Try again that cannot work.**
   * Steps: `/front-office/pipeline?view=list&from=2026-13-45` shows "from: a date as YYYY-MM-DD. Try again" in place of the list (shot `rev-list-bad-from-address-1440.png`). Leads with `?view=all&from=2026-13-45` does the same.
   * Where: `pipeline-page.tsx:153` (`Failed`) and `leads-page.tsx:95`. The words come from `prospects.ts:37`. The List does not even check the format (`pipeline-page.tsx:129`; Leads has a regex at `leads-page.tsx:40`, which lets 13/45 through).
   * QA-572's Expected asks to "map an API 400's `fields.from` to the field". EXPERIENCE §2.10 and BIC-13 ask for no internal name ("from:") and a fix that works.
   * **Fix:** treat a day that is not a real date like the bad range (drop it, or say it at the field in plain words), or map `StaffApiError` `fields.from` and `fields.to` onto the Field. Otherwise record the rest in QA-572's row.
2. **Should (Minor), the polite error may not be read out.**
   * Where: `controls.tsx:60` mounts `<p role="status">` and its text in the same render.
   * Problem: several screen reader and browser pairs do not announce a live region that arrives already filled. When the range turns bad from "Engaged to", focus is on that field while the message sits on the from field, so `aria-describedby` does not help either.
   * **Fix:** keep the live region mounted (empty) and set its text, or announce once through the page's existing status region.
3. **Should (Minor), the filter row goes out of line when the error shows.**
   * Where: `pipeline-page.tsx:141` and `leads-page.tsx:86` use `items-end`. The error line under "Engaged from" lifts that label about 22 px above Stage, Owner and Engaged to (shot `rev-list-to-before-from-1440.png`).
   * **Fix:** `items-start`, or give the error line a reserved height. D12 and BIC-19 ask for aligned layouts.

## D1–D20 (1–5)
* **D1** 5: AG-2-23 source on the List and the board; ?source= honoured and kept; QA-533 closed.
* **D2** 5: unknown source refused 400 on all three routes; narrowed inside visibility.
* **D3** 5: one server filter and one client control (`source-filter.ts`, `.tsx`) shared with Leads.
* **D4** N/A.
* **D5** 4:
  * Works: reload keeps the filter, the switch keeps it, and a sources outage fetches nothing unfiltered (DW4).
  * Not yet: a bad day typed into the address is a dead end (issue 1).
* **D6** N/A (reads only).
* **D7** N/A.
* **D8** 5: path "Sales › Pipeline"; chips say what is filtered.
* **D9** 5: "All sources" and the empty-state words give the way out.
* **D10** 4: plain words throughout, except the raw "from:" alert (issue 1).
* **D11** 4: skeletons, field error, empty states; live-region timing (issue 2).
* **D12** 4: team look; label shift on the error (issue 3).
* **D13** 4:
  * Met: axe clean, keyboard path, 400/1024/1440 and 200 % with no sideways scroll.
  * Not yet: issue 2.
* **D14** 5: same control and words as Leads.
* **D15** 5: List first view 418 ms; filter 34 ms; no per-row requests.
* **D16** 5: pass and fail per rule, re-run by me, and removing a rule fails its test.
* **D17** simulated only.
* **D18** 4: the source shown as a chip; a prospect's source is its lead's (stated in the legend).
* **D19** N/A (row-level).
* **D20** simulated only.

## Scorecard (EXPERIENCE §6; sales list screens, scope as the FO-4 review)
| BIC | Score | Evidence |
|---|---|---|
| 01–03, 05–10, 12, 15–17 | N/A | No facts, AI, roles, tasks, signing or review on this screen |
| 04 | Met | A typed from-after-to is refused at the field with its fix; what was typed stays |
| 11 | Met | No primary button added; the controls are outline buttons and links |
| 13 | Partly | Range error on the field in plain words (`rev-list-from-after-to-1440.png`), but no top summary is needed for one filter; the malformed-day path is raw (issue 1) |
| 14 | N/A | No new status, icon-only button or number |
| 18 | Met | Skeletons while loading (`rev-list-walkin-1440.png`), teaching empty states with the source named, the outage said |
| 19 | Partly | One heading, no primary, no ids on the main path; labels out of line on error (issue 3) |
| 20 | Met | Keyboard-only walk, 1024 px and 200 % with no sideways scroll (`rev-list-source-zoom200.png`, `rev-board-source-1024.png`) |

## Graph (P-86)
`graph.mjs` run: G1 0, G2 0, G4 0, G5 0. G3 lists `GET /front-office/pipelines/:type/board` as unreached even though `check_r130_prospect_source.ts` and the web call it. That looks like the tool missing a `:type` template (G3 168 here against 12 in the committed GRAPH.md), not this PR. `source-filter.ts` and `.tsx` are imported and so not in G6.

## Not checked
A real screen reader (issue 2 comes from reading the code, not from listening). An intended user's unaided walk (D17, D20). CI on GitHub. API `tsc` (the builder reports existing unrelated errors). Screenshots are in my scratchpad (`/tmp/claude-0/-home-user-xpatready/43763f60-dbc7-5d0e-a87a-76b5194b4110/scratchpad/r130/shots/`), not committed.
