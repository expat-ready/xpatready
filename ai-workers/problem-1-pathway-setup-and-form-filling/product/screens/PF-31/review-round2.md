# PF-31 "work in many tabs": independent review, round 2 (diff only, 23 Nov 2026)

Reviewer did not build it. Round 1: `review.md` (heads api `8b95408e9`, web `5247924c9`, standard `d582a2014`).
Heads reviewed now: (c) API PR 3192 `a74a4738df86d8db38fffc49199b6a8bded5e082` · (b) web PR 3193 `7f6e9d777fca0615db5f2d2aa475dc66b55127a5` (fix commit `ef181622b`, stacked on c) · (a) standard PR 3194 `4bdb4f4c769d8a7296d972b04d3b0a20d1099a2f`.
Evidence: the running copy on :4731 (built from the (b) head, db `xr_studio_pf31`, AI_LIVE=off, US$0), curl on the API, and my own Playwright probe (`rv2.mjs`, uncommitted, in my scratchpad). I signed in as the Sample solo representative (`user-S`, firm `sample-solo`) so the concurrent check and breaker, which sign in as `user-R` and end other sessions, could not change my records. I did not rerun the builder's `check_pf31_multitab_browser.ts`, because it signs in as `user-R` and would end the concurrent runs' sessions. I read its new T5b, T7 and T9 lines instead.

## Verdict
* **(c) API: Ship (Approve).** M3 is fixed. S8 is settled by the corrected study text (an open question for the tech lead, not a finding).
* **(b) web: Ship (Approve).** M1 and M2 are fixed, with no regression found. S5, S6, S7 and S10 are fixed. S4 is mostly fixed. Three Shoulds remain (below); none is a Blocker or Major.
* **(a) standard: Ship (Approve).** The §2.13 references, the "keep mine keeps only my fields" rule, "ETag on save answers only" and the phone's optional version now match the code. It must still merge after (b), because it names files only (b) adds.
* Journey score (reviewer, the one score for this check): **9.5 / 10**, pass (round 1: 7.5).

## Round-1 Musts, checked in the running app
1. **M1 Keep mine reverts others' fields: fixed.** `drafts.tsx` `changedKeys`/`mineOnto` (rebase carries only `values ≠ old base` onto the newer record), and `office-panel.tsx:96-99` lists only the changed fields.
   * Probe M1a: I changed the name while someone changed the time zone (200). The conflict lists only `Office name`. Keep mine → Save gives name = mine and zone = `America/Halifax` (theirs kept).
   * Probe M1b: I changed the province while someone changed the name. The only row is `Where: MB, Canada | AB, Canada`. Keep mine → Save gives province AB (mine) and name = theirs.
   * The lead's phone (a plain value) is unchanged: `mineOnto` returns the value.
   * The builder's new T5b covers the different-field case.
2. **M2 the office panel's close doesn't close its tab: fixed.** `workspace.tsx:116-126` `leave()` and `offices-page.tsx:59`.
   * After Save, Close, Escape, or the panel's ×, the record's tab is gone, the list tab is selected, and there is no dialog.
   * A dirty Close asks once: No keeps the tab and the typing; Yes drops both, with no draft left and the database untouched. A dirty Escape also asks only once.
   * A record opened directly (no list tab): Close replaces that tab with the list, so there is one tab.
   * Back after a Close brings the record back in the active tab, per the documented Back rule.
   * The builder's T5 and T7 now assert that the tab is gone.
3. **M3 the global ETag gives a stale 304: fixed.** `if-match.ts:51` returns before setting the ETag unless the method is a save. Curl on `GET /platform/firm/profile`:
   * The GET answer carries Express's weak body-hash ETag (`W/"2c2-…"`), never the version tag.
   * After I added an office, `offices` went 2 → 3 while `version` stayed `5de823bd…`. A revalidation with the old weak tag gave 200, and one with the old version tag gave 200 (never a stale 304). An unchanged body still revalidates to 304, which is correct.
   * `PATCH /platform/offices/:id` with If-Match gave 200 with `ETag: "<new version>"` equal to the body's version. A stale one gave 409. A PATCH that also sends If-None-Match still gave 200.

## Round-1 Shoulds
* S4 focus: **mostly fixed.** Alt+PageDown focuses the new active tab. Delete on a tab moves focus into the next tab (there, the office dialog's field). Two gaps remain: Should 1 and Should 2 below.
* S5 ARIA: **fixed.** One visible `role="tabpanel"` (`aria-label` = the tab's title), and each tab's `aria-controls` resolves to a real element. axe WCAG 2.2 AA finds nothing on the strip at 1440 px or on the conflict dialog at 1024 px. Observation, not a finding: each panel contains its own strip (one strip per tab, by design), so the tablist sits inside the panel it controls.
* S6 × size: **fixed.** 24×24 px (`workspace.tsx:233`, `size-6`).
* S7 conflict announced and focused: **fixed.** `role="alert"`, and focus is on `[data-conflict]` (probe M1a).
* S8 people PATCH version optional: **open question for the tech lead.** The study (`ux-multi-tab-2026-11-23.md:40`) now says so truthfully. Acceptable.
* S9 section numbers: **mostly fixed.** Three headers still say §2.12 (Should 3).
* S10 Ctrl-click on `/api/` links: **fixed** (`workspace.tsx` click guard skips `/api/`).

## Issues, ranked (no Must)
**Should**
1. **(b) Focus falls to `<body>` when a record's tab closes through its panel (Close, Save, Escape).** The fix for M2 introduced this path. Panel's `returnFocus` target is in the tab that `leave()` removes. Probe: after each of Save, Close and Escape, `document.activeElement` is BODY (WCAG 2.4.3; EXPERIENCE §2.13 asks for ARIA tabs with managed focus). Fix: in `leave()` (`workspace.tsx:116-126`), focus the tab that comes forward (`focusTab(other.id)`), or that list's Edit link for the record. Assert it in T5/T7.
2. **(b) The × on a background tab leaves focus on `<body>`.** Clicking it focuses that tab's button, which is then removed. `close()` focuses only when the active tab closes (`workspace.tsx:104`). Probe "x on background tab": BODY. Fix: when a non-active tab closes, focus the active tab.
3. **(c/b) Three code headers still say EXPERIENCE §2.12:** `api/src/platform/http/if-match.ts:1`, `tests/lib/multi-view.ts:1`, `tests/check_pf31_multitab_browser.ts:1`. Fix: §2.13.
4. **(b) The conflict's "Where" row compares unlike forms outside Canada.** `office-panel.tsx:98`: "Saved now" uses `whereLine()` (the country's English name, "United Kingdom"), while "Yours" uses the raw code (`GB`). The same country reads as two different values, and `differ` keeps the row. Fix: format "Yours" with `whereLine({ countryCode, province })` too. Found in the code only; no office outside Canada was probed.

Note (no severity): `close(id, quiet)`'s `quiet` flag is never passed (`workspace.tsx:95, 99`). It is dead code; drop it or use it.

## Journey test (reviewer role), re-run on the changed paths
Journeys, as the firm's representative:
* J1 edit and Save: the tab closes and the list comes forward.
* J6 conflict on the same field: held.
* J7 conflict on a different field: **now held** (M1a, M1b).
* J8 Close, clean and dirty: held.
* J9 keyboard: Alt+PageDown and Delete: held.
* J10 Back: held.
* Direct-address open, then Close: held.
* Break-it: a stale 304 is gone (M3); a dirty Escape asks only once; there were no page errors.

| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | Edit, Save and conflict all finish; data saved once |
| Next step obvious | 1 | Close/Save/Escape now end the edit and show the list (M2) |
| Plain words | 1 | "Someone else saved this first", "Keep mine, then Save" |
| Feedback and state | 1 | The conflict is focused and announced; only my fields are "Yours" |
| Correct data | 1 | Their field is kept after Keep mine (M1a/M1b, checked through the API) |
| Error recovery | 1 | Keep mine and Use saved both recover without loss |
| Accessibility and screen sizes | ½ | axe clean; 24 px ×; no sideways scroll at 1024 px; focus lost after a record tab closes and after a background × (Should 1, 2) |
| Speed | 1 | Unchanged from round 1 (Edit→field 55 ms) |
| Visual quality | 1 | Conflict at 1024 px: team look, one row, clean |
| Trust and sources | 1 | Both values shown; nothing saved before Save |
| **Total** | **9.5 / 10** | **Pass**, no 0 |

## Could not check
* A real screen reader.
* Safari or Firefox.
* An intended user's unaided walk (D17/D20 stay with the founder).
* The builder's full check at this head (not rerun, for session isolation).
* The graph tool (diff-only round; round 1 covered it).

**Verdict: Approve** (no open Blocker or Major), for all three PRs.
Reviewer: Approve a74a4738df86d8db38fffc49199b6a8bded5e082 (c) · Approve 7f6e9d777fca0615db5f2d2aa475dc66b55127a5 (b) · Approve 4bdb4f4c769d8a7296d972b04d3b0a20d1099a2f (a)
