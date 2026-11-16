# FO-4sf review: PR #1985, the lead list's Source filter (AG-2-23 rule 1)

Reviewer (Opus, did not build it), 16 Nov, about 13:00 UTC (18:30 IST). **Commit reviewed: `c4d7b06bb43befca104579830653281816a4f6b4`** on `claude/great-feynman-hr03yj`.
- **Diff:** `origin/main...c4d7b06bb`, 14 files, +191 −15. The merge base is `47b00ddae` (09:12 UTC), not today's main.
- **Requirement:** AG-02 v2.6, AG-2-23 rules 1, 2 and 10 and their tests, plus the glossary terms **Source** and **Door** (lines 229–235).
- **Copy:** isolated `rev_fo4sf` on :4437 (the runtime lane's ports), never :4400.
- **AI and cost:** live AI off; cost US$0.
- **Journeys:** `journey-test-reviewer-2026-11-16-pr1985.md`, score **8/10**.

**Path note:** main already has `screens/FO-4sf/review.md`. On the Mac's case-insensitive disk this file is the same path, so commit it under another name or not at all.

**Verdict (screen-review scale): Rework.** The mechanics are sound. The PR duplicates a build that has already merged, and it reads the field the requirement says is not the source.

## Requirement fit
- **Rule 1, "Filters on leads: … source": not met as written.**
  - The glossary says: "**Source** (`leadSourceId`) … such as Meta lead ad, Website form or Referral … *Not the same as:* the door, which is the technical path the lead arrived on."
  - This PR filters `fo_lead.door` (`leads.ts:22`, `:61`) and labels it Source.
  - The free-text `fo_lead.source` column is today's stand-in for `leadSourceId`. It holds `WEBSITE`, "Referral …" and "Phone call …", and it is what the list's own Source column shows.
  - **Answer to the brief's question:** the door is the wrong field.
- **Rule 2 (no country filter): met.**
- **Rule 10 (filters only show; the chip is visible and clearable): met.** No write and no audit row on a filter read. Clear source works.
- **Visibility (rule 6, DW2): met.**
  - The filter is `AND [where, door in …]` inside `firmScope`, before the 500-row cap. The post-query `sees` filter is untouched.
  - The `unassigned` view keeps its own `where` and its 403 gate, so the AND can only narrow it. The filtered list is a subset of the unfiltered one (J9).
  - Mutating AND to OR fails 12 of 29 lines.

## Issues, ranked
1. **Blocker (Must): the PR duplicates FO-4sf, which is already merged, and cannot merge.**
   - PR #1962 ("screens: FO-4sf — the leads list filters by source") merged at 12:53 UTC.
   - Main's build filters the stored source (`origin/main:…/sales/leads.ts:20-61`). It also has a `sources` endpoint, a checkbox list with Find, and its own `tests/check_fo4sf_source_filter.ts`.
   - Main's version went through a review **Blocker against exactly this door approach** (`origin/main:product/screens/FO-4sf/review.md`, issue 1; fixed in `e227799a2`).
   - GitHub reports #1985 `mergeable: false, dirty`. `git merge-tree` conflicts in all 10 changed files: `leads.ts`, `routes.ts`, `MODULE.md`, `contract.ts`, `leads-page.tsx`, the test (add/add) and 4 screenshots.
   - Any resolution either throws this work away or reverts main's FO-4sf and its test.
   - **Fix:** close #1985 as superseded by #1962, and record it in STATE or BACKLOG so the row is not built a third time. Keep anything here that main lacks only as a small follow-up on main (see 3 and 4).
2. **Blocker (Must): "Source" filters the door, not the lead's source (EXPERIENCE §5 [M], one word per thing; AG-2-23 rule 1).**
   - **Two meanings on one screen:** in the builder's own `fo-4-sales/screenshots/leads-source-filter-1440.png`, "Added by staff" is pressed over rows whose Source reads "Referral (sample)" and "Phone call (sample)".
   - **The stored values are refused:** `?source=WEBSITE` and `?source=Referral (Sample)` both → 400 "Unknown source … Choose from WEB_FORM, MANUAL, BOOKING" (J5).
   - **The manager's question in AG-2-23 §2 cannot be asked.** "Everything from this campaign" or "from Referral" has no choice.
   - **The Booking chip never matches real data:** no writer sets `door = BOOKING` (`arrival.ts:18` takes `WEB_FORM | MANUAL`). Only the test's SQL inserts fill it (J10).
   - **The conflict was settled in a code comment** (`leads.ts:20-21`), not in a `challenge.md` or a PR question (AGENTS rule 2).
   - **Fix:** main already has the stored-source filter, so issue 1's fix closes this too.
3. **Minor (Should): the in-app Leads link drops the filter.**
   - The link passes `state={{ from: view }}` only (`leads-page.tsx:87`), so it goes to `?view=all` (J3). Browser Back keeps the filter.
   - If main has the same gap, fix it as a follow-up on main (this touches `lead-page.tsx`).
4. **Minor (Should): the search-empty line inside a filter does not mention the filter.**
   - It says "No lead matches “…”." (`leads-page.tsx` empty branch, J4).
   - Name the source and offer Clear source, as the no-rows empty state already does.
5. **Note:** an unknown `view` answers 422 "Check the details" and an unknown `source` answers 400 "Check the filter" on the same route. The brief asked for 400, so this is not a finding against this row.

## Questions answered
- **400 shape:** correct RFC 9457. `type …/invalid`, `title`, `status 400`, `detail` names the bad value(s) (capped at 120 characters) and the allowed values, plus `code: INVALID`, `fields.source` and `allowed[]`. The source is checked before the view's 403, so an own-only user with a bad source gets 400, which leaks nothing.
- **Address and react-query:**
  - `go(view, sources)` writes both. A view chip keeps the source, and Clear source keeps the view (J2).
  - `sourcesIn` puts the values in canonical order, so the cache key is stable whatever order the address uses.
  - An unfiltered key equals the frame's `["fo","leads","unassigned"]`, which is the same URL, so no clash.
  - Take it invalidates the `["fo","leads"]` prefix, so filtered lists refresh too.
- **Accessibility:**
  - The two groups are labelled ("Which leads"; `aria-labelledby` → "Source").
  - Toggle buttons carry `aria-pressed`. Clear source is a real button.
  - Focus ring is visible. axe finds 0 issues at 375, 1024, 1440 and at 200 % zoom (J7).
- **Is the test honest? Yes.**
  - Every Done-when line has a real pass and a real fail.
  - The browser waits are on the address and on `aria-pressed`, and a timeout is caught as a FAIL line, not swallowed.
  - `shown()` scopes rows to the test's own leads, and `allDoors()` checks every visible row.
  - **Weakness:** the BOOKING lead is a raw SQL insert, so DW1's "a booking" is not a product path.

## Code checks (item 5)
- **Correctness:** comma lists, repeated keys, blank and de-duplication all work.
- **No per-row requests:** one request per list.
- **Nothing to keep or race:** no migration and no write.
- **Server authorisation unchanged:** `@OwnOrAll`, `show` key.
- **Index:** the door predicate rides the existing indexes under the 500 cap. That is fine at this scale.
- **Runs (all mine, on this head, :4437):**
  - `check_fo4sf_source_filter` 29/29
  - `check_fo2_leads_prospects` 113/113
  - `check_fo2v_lead_visibility` 14/14
  - `check_fo4_sales_browser` 45/45
- **Mutation:** AND→OR fails 12/29.
- **`graph.mjs --check`:** G1 0 · G2 0 · G3 93 · G4 0 · G5 0 · G6 17, the same as before this PR, so the PR adds no element without a capability.
- **Side effect:** the suites overwrite committed screenshots; I restored them.

## D1–D20 (this head)
| D | Score | Evidence |
|---|---|---|
| D1 | 2 | Door, not source (issue 2), and it duplicates the merged row (issue 1). |
| D2 | 5 | Read-only; the AND never widens what a person sees. |
| D3 | N/A | No fields or sections in the library. |
| D4 | N/A | No question or document rules. |
| D5 | 4 | Reload and Back keep the filter; the in-app link does not (issue 3). |
| D6 | N/A | No reviewed content or history. |
| D7 | N/A | No AI. |
| D8 | 5 | Sales › Leads; the pressed state shows. |
| D9 | 5 | One click to filter, one to clear. |
| D10 | 3 | One word for two things (issue 2). |
| D11 | 5 | `aria-pressed`, the address and the list stay in step. |
| D12 | 5 | Team chips. |
| D13 | 5 | Keyboard, axe, 375/1024/1440 and 200 %. |
| D14 | 4 | Team look, but the team's model uses `leadSourceId`. |
| D15 | 5 | 228 ms. |
| D16 | 4 | Pass and fail per line, the mutation is caught, but the Booking lead is SQL-only. |
| D17 | simulated only | No intended user walked it. |
| D18 | 3 | The filter and the column disagree about where a lead came from. |
| D19 | N/A | Not a configure-to-PDF flow. |
| D20 | simulated only | No intended user walked it. |

**BIC-01 to BIC-20: N/A** (`EXPERIENCE.md` §6 covers case-side screens; this is a front-office list filter). **Retrofit mapping:** N/A (a new filter on FO-4's Leads screen).

**Not checked:** a real screen reader; a headed visible-browser walk (mine was a headless, person-like script); an intended user's unaided walk (D17/D20); Lead B's reading of the brief beyond the requirement text.

**Blockers:** 1 (duplicates the merged FO-4sf and cannot merge), 2 ("Source" filters the door). **Majors:** none. **Minors:** 3 (the in-app Leads link drops the filter), 4 (the search-empty line does not mention the filter).

Verdict: Changes requested
