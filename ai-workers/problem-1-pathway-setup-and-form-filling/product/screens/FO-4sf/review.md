# FO-4sf review: the Leads list filters by source (AG-2-23 rule 1)

Reviewer (Opus, did not build it), 16 Nov, 07:3x UTC. **Commit reviewed: `036a5a782737ec97085414371eea4f6969ef828a`** (diff `origin/main...036a5a78`: 10 files, +169 −10). The branch moved to `282dc487a` while I worked. That commit changes only `api/src/front-office/MODULE.md` (it names the filter "the lead's door"), so this verdict covers both heads' code. The concept is the brief `lead-b-briefs/FO-4sf.md` rev 16.63 (on `lead-b-front-office`); there is no `concept.md`. The requirement is AG-02 v2.6: AG-2-23 rules 1–2 and its tests, plus the glossary term **Source** (line 230), which rule 1 uses. I used isolated copy `review_fo4sf` on :4436 (runtime lane), never :4400. Live AI was off; cost US$0. Journeys: `journey-test-reviewer-2026-11-16.md`, score **8.5/10**.

**Verdict (screen-review scale): Ship after fixes.** The filter mechanics, visibility, accessibility and tests are sound. The filter reads the wrong field (Blocker 1).

## Requirement fit
- **AG-2-23 rule 1, "Filters on leads: … source …": not met as written.** AG-02's glossary (line 230) says: "**Source** (`leadSourceId`) — The source says where a lead came from, such as Meta lead ad, Website form or Referral … *Not the same as:* the door, which is the technical path the lead arrived on." This build filters `FoLead.door` (`api/src/front-office/sales/leads.ts:21`, `:60`) and calls it Source.
- **Rule 2 (no country filter): met.** No country filter was added.
- **Visibility (rule 6 and the brief's "inside FO-2v, never widening"): met.** The filter is `AND [where, door in …]` inside the firm scope and before the 500-row cap. An own-only Case Officer sees only their own leads under any source (my J7, and a DB check finding 0 foreign rows). If I swap AND for OR, 7 suite lines fail: DW1 ×2, DW2 ×3, DW3 ×2.
- **Rule 10, Safety ("filters only show; they change no record"; "the filter chip is visible and clearable"): met.** Filter reads wrote no audit line and changed no lead (J-data). The chips are visible, and All sources clears them.

## Issues, ranked
1. **Blocker (Must): "Source" filters the door, not the lead's source. The requirement, the screen's own Source column and the brief's "stored source values" all disagree with it.**
   - **On screen:** with "Added by hand" pressed, the Source column reads "Phone call" and "Referral" (J1). The builder's own `screens/fo-4-sales/screenshots/leads-source-filter-1440.png` shows the same thing: "Added by hand" pressed over rows whose Source says "Phone call". Two different things carry one name on one screen (EXPERIENCE §5 [M], plain words, one word per thing).
   - **The API refuses the lead's real source values:** `?source=Referral` → 400 "Unknown source: Referral. Choose from WEB_FORM, MANUAL, BOOKING." `?source=WEBSITE` (what a web-form lead stores, `FoWebForm.source` default) → 400 too (J6).
   - **A real question cannot be asked:** AG-2-23 field 2 gives the manager's question, "everything from …", and its glossary examples include Referral. There is no Referral choice (J3). A web form whose source the Owner sets to "Webinar" would list under "Web form", while its Source column says Webinar.
   - **The brief points both ways.** It says "the stored source values" and "with their plain labels". The stored values are `FoLead.source` (free text: web form `WEBSITE`, manual typed text, `leads.ts:134`). Its examples (`MANUAL`, "a booking") also match AG-2-2's seeded sources (Manual, Website form, Booking), not only the door enum.
   - **The conflict was settled in code.** It went into a code comment and the MODULE.md line, not into a "Question for the tech lead" or a `challenge.md` (AGENTS rule 2; "never deviate silently").
   - **Fix (one of these, after Lead B's ruling on the PR):**
     - (a) Recommended, inside the touch list: filter `source: { in: … }` on the stored source. The allowed values are the firm's stored sources (one firm-scoped distinct read). Unknown → 400 naming them. Chips use `words()`, so they match the Source column ("Website form", "Phone call", …).
     - (b) Keep the door filter, but label it for what it is (for example "How it arrived"). Record that AG-2-23's source filter waits on a `LeadSource` list (AG-2-2, a schema row).
     - (b) alone does not close AG-2-23 rule 1.
     - Either way, add a test where a lead's source and door differ (manual + "Referral"; web form + "WEBSITE"). It must fail if the filter reads the other column.
2. **Minor (Should): the in-app "Leads" link loses the filter.**
   - Open a lead from a filtered list, then use the crumb or the frame's Leads link: you land on `?view=all` with no source (J4).
   - The link passes only `state={{ from: view }}` (`web/.../sales/leads-page.tsx:87`), and the lead page rebuilds `?view=${from}` (`lead-page.tsx:85`).
   - Browser Back does keep it. The qa note's "a reload or Back keeps it" is true only for browser Back.
   - **Fix:** carry the list's search in the state and use it in `back.to`. This touches `lead-page.tsx`, which is outside the touch list: ask, or record it in the PR.
3. **Minor (Should): search inside a source filter.** It answers "No lead matches “Wren…”." for a lead that exists under another source (J10). Name the filter and offer All sources in that line (`leads-page.tsx:81`), as the empty state already does.
4. **Note (no action in this row):** no product path writes a `BOOKING`-door lead yet. Booking's arrival is the fake port (`booking/runtime-ports.ts:6`), so in the running app the Booking chip always shows the empty state. Only the suite's SQL inserts fill it. Fix (a) makes this moot.

## Code checks (item 5)
- **Correctness:**
  - Comma lists, repeated keys and a blank value work.
  - Unknown values or the wrong case → RFC 9457 400 with `code` and `allowed`. The message is bounded (`slice(0,200)`), and values are de-duplicated.
  - The source is checked before the view, so a bad view plus a bad source gives 400.
  - `source[a]=b` is a different key under the simple parser: ignored, 200.
- **No per-row requests:** one list request per view+source; the query key includes the sources. Take it invalidates the `["fo","leads"]` prefix, so filtered lists refresh too.
- **Index:** the door predicate rides the existing `(firm_id, state, owner_staff_id)` and arrival ordering under the 500 cap. That is fine at this scale. AG-2-2 names `(firm_id, leadSourceId, arrivedAt)` for the real source filter.
- **No migration, no write path:** nothing to keep or race.
- **A rule's test fails when the rule is removed:** the OR mutation above. Removing the filter fails DW1 by construction.
- **Runs (all mine, on this head, :4436):**
  - `check_fo4sf_source_filter` 22/22, twice (before and after the mutation)
  - `check_fo2_leads_prospects` 113/113
  - `check_fo2v_lead_visibility` 14/14
  - `check_pf6b_permission_rules` 28/28
  - `check_fo4_sales_browser` 45/45
  - `graph.mjs --check`: G1 0 · G3 93 · G6 17, unchanged from FO-2v's review. The PR adds no element without a capability.

## D1–D20 (first score at `036a5a78` → at `e227799a`; the first full table with its evidence lines is in git at `e227799a`)
D1 2→4 (the source is right now; chip wall, Major 4) · D2 5 · D3 4 · D4 N/A · D5 4 (Leads link, Minor 2) · D6 N/A · D7 N/A · D8 5 · D9 5 · D10 4 · D11 4→5 · D12 5 · D13 5→4 (26 tab stops at scale) · D14 2→4 · D15 5→4 (in-memory distinct, Minor 5) · D16 4→5 (door≠source case) · D17 simulated only · D18 3→5 · D19 N/A · D20 simulated only.

**BIC-01 to BIC-20: N/A.** `EXPERIENCE.md` §6 scopes them to case-side screens; this is a front-office list filter.
**Retrofit mapping (item 6):** N/A. This is a new filter on FO-4's Leads screen, with no team screen to map.

**Not checked:** a real screen reader; an intended user's unaided walk (D17/D20); a live Lead B ruling on the brief's intent. I found no PR for the branch through the REST API.

**Verdict: Block** (= Changes requested). Must: Blocker 1. Should: Minors 2 and 3, in the same push or listed in the PR. A re-review reads only the diff.

## Re-review at `e227799a207a6d270e5565508d3c262d75aef1c8` (diff `036a5a78..e227799a`, P-277; PR #1962; full text in git at `40c11741`)
- **Fixed:** Blocker 1 (the list filters the stored `source`; allowed = the person's visible sources; `GET leads/sources`; a booked lead with the source "Phone call" in the suite) and Minor 3. **Open:** Minor 2.
- **New, then:** Major 4 (chip wall), Minor 5 (in-memory distinct, `take: 200`), Minor 6 (`words()` changed typed capitals).
- **Verdict:** Changes requested for `e227799a` (Major 4).

## Re-review at `40c117414a66654b30785d64d0ad555b52e2357b` (diff `e227799a..40c11741`, P-277; full text in git at `1a5d6e85`)
- **Fixed:** Major 4 (one disclosure Source control; 36 sources, first row at 271 px at 1024×800), Minor 5 (SQL GROUP BY, no cap), Minor 6 (`words()` maps known codes only).
- **New, then:** Major 7 (panel anchored `left-0` ran to x 729 at 720×450, `scrollWidth` 938), Minor 8 (chip removal dropped focus), Minor 9 (panel stayed open when focus left).
- **Verdict:** Changes requested for `40c11741` (Major 7).

## Re-review at `1a5d6e85ec3cb2cdeea9c8b20f49f1db86f3d1f9` (diff `40c11741..1a5d6e85` only, P-277) · copy `review_fo4sf4` on :4436, never :4400; US$0
- **Major 7: fixed.** On open, a layout effect shifts the panel left by what would cross `innerWidth − 16` (`leads-page.tsx:36-41`). Opened by me:
  Panel x by width, opened by me: 720×450 (200 %) 384–704 (axe clean) · 720 with two chips 384–704 · 800: 464–784 · 900: 564–884 · 1024: 578–898 · 1280: 706–1026 · 1440: 786–1106. No sideways scroll at any of them. The suite now has the 720 px open case.
- **Minor 9: fixed.** `onBlur` closes the panel when focus leaves it; Tab past it keeps the choice. Mouse clicks inside, the wheel and Find keep it open. Escape closes it and returns focus to the button.
- **Minor 8: fixed.** Enter on "Remove source: …" leaves focus on `[data-source-toggle]`.
- **Runs (mine):** `check_fo4sf` 32/32 · `check_fo2` 113/113 · `check_fo2v` 14/14 · `check_pf6b` 29/29 · `check_fo4_sales_browser` 45/45. No page errors. Rewritten screenshots restored.

### New in this diff
10. **Minor (Should): the shift was measured only on open.** Narrowing the window from 1024 to 720 while open left the panel at x 618–938 (`scrollWidth` 938). Fix: measure on `resize` too.

**Still open, listed in the PR:** Minor 2 (the in-app Leads link drops `?source=`, `lead-page.tsx:85`) and Minor 10.

**Journey score at this head: 9/10** (pass, no 0). Task completed 1 · next step obvious 1 · plain words 1 · feedback and state 1 · correct data 1 · error recovery ½ (Minor 2) · accessibility and screen sizes ½ (Minor 10) · speed 1 · visual quality 1 · trust and sources 1.

**Verdict: Approve** for `1a5d6e85ec3cb2cdeea9c8b20f49f1db86f3d1f9`. No Blocker or Major is open. Minors 2 and 10 are Should: fix them, or list them in the PR.

## Re-review at `af346f7a15f1e3e72c8293a6c9f15557bb545834` (diff `1a5d6e85..af346f7a` only, P-277) · copy `review_fo4sf5` on :4436; US$0
- **Minor 10: fixed in the code.** The place effect also runs on `resize` while the panel is open and removes the listener on close (`leads-page.tsx:37-42`). I opened the panel at 1024 and resized it through 720, 1440, 800, 720 and 1024: it stays inside every width with no sideways scroll. Closing and reopening at 720 gives x 384–704.
- **Runs (mine):** `check_fo4sf` 32/32 · `check_fo2` 113/113 · `check_fo2v` 14/14 · `check_pf6b` 29/29 · `check_fo4_sales_browser` 45/45. Rewritten screenshots restored.
- **Minor 11 (Should, not blocking): the new 720 px test does not fail when the resize listener is removed.**
  - With the listener removed and the bundle rebuilt, the suite still passes the 720 px line. By that step a "Phone call" chip is chosen, so the control wraps onto its own row at 720 and the panel fits anyway (mutated bundle with a chip chosen: x 392–712).
  - Without a chip, the same mutated bundle overflows (x 618–938, `scrollWidth` 938/720). I reverted the change and rebuilt the bundle from clean code.
  - **Fix:** clear the sources (All sources) before the 1024→720 step, so the button sits beside the view chips. The remaining run of the suite after the mutation also failed "DW2 fail", but only because the suite reuses a database where an earlier run had reassigned a lead; it is not a code fault.
- **Still open, listed in the PR:** Minor 2 (the in-app Leads link drops `?source=`).

**Journey score at this head: 9.5/10** (pass, no 0). Error recovery ½ (Minor 2); every other criterion 1.

**Verdict: Approve** for `af346f7a15f1e3e72c8293a6c9f15557bb545834`. No Blocker or Major is open. Minor 11 (the test) and Minor 2 are Should: fix them, or list them in the PR.
