# FO-9s part 1 review: the duplicate warning on Add a lead (R1.29)

Reviewed 22 Nov 2026 by a fresh Opus 5.5 reviewer that did not build it (skills screen-review and journey-test, reviewer role). PR #2900, branch `claude/screens-fo9s-warn`, **head 4eda1fc4ebfe08f2989bf6e547a81b0657679add**. Spec: concept r3, `challenge.md` (Lead response) and board S1 on `origin/claude/runtime-fo9s-concept`. Scope: BR-1 to BR-5b, Minors 1, 2, 4, 5. Isolated copy `rv_dup` on :4571 (never :4400). Sample data, US$0.

## Verdict: Ship after fixes (Block until the two Majors are fixed; both are small)
The logic is right. Every BR holds in the running app, including the races: one box, never two; no stale hint after a key edit or a 409; the newest details win; and an edit after a pick drops the pick, so no lead lands on the wrong person. Two Majors are open. One is the [M] line "1024 px and 200 % zoom work" (EXPERIENCE §2.12, the concept's "long names wrap"). The other is where keyboard focus goes after a pick. The tests also miss two rules. **Journey score 8.5/10 (pass).**

## What I ran (exit codes)
| Run | Result |
|---|---|
| `isolated.sh rv_dup 4571 start --ttl 60 PLATFORM_IDENTITY=local` | 0 |
| `check_fo9s_duplicates_browser.ts 4571 xr_studio_rv_dup` | 20/20, exit 0 |
| `check_fo4al_add_lead_browser.ts 4571 xr_studio_rv_dup` (FO-4al's 409 path) | 27/27, exit 0 |
| Reviewer probe (Playwright, scratch, not committed): focus, races with delayed and failed check routes, stale pick, the 5000 guard, the phone offer, Enter-submit, 375/1024/1440 and 200 % zoom with long names, timing | 30/31 checks as expected, exit 0. The one failure is the missing persistent live region (m1). Also observed: the focus issue (M2) and the overflow (M1) |
| `graph.mjs`, `graph.mjs --check` | 0, 0 |
| `isolated.sh rv_dup 4571 stop` | 0. The screenshots the runs re-shot (FO-9s and fo-4-sales) are restored with `git checkout` |

## Issues (ranked)
**M1 (Major, Must): the Save button runs off the panel at 375 px and 200 % zoom once a long name is picked.**
* `add-lead-panel.tsx:109` labels the footer button "Add lead to <full name>", and the button does not wrap (`white-space: nowrap`).
* Measured with "Maria Fernanda Guadalupe … Gonzalez-Rodriguez de la Cruz" (a realistic spaced name): the button is 498 px wide in a 375 px viewport, and the same in 1024 px at 200 % (CSS 512 px). Its label is cut off at the panel edge (scratch shot `r-real-long-zoom200.png`). Names over about 35 characters trigger it.
* A long name with no spaces also overflows the choice box: `duplicate-hint.tsx:33` lacks the `[overflow-wrap:anywhere]` that the match row has at `:55`.
* This breaks EXPERIENCE §2.12 [M] and the concept §4 states ("long names wrap", 375/1024/1440, 200 %). The builder's D7 width check uses short names, so it misses this.
* **Fix:** let the footer button wrap (`whitespace-normal`, `h-auto`, `text-left`), or cap the name in the label with a truncate class plus a `title` attribute; the choice box already shows the full name. Add `[overflow-wrap:anywhere]` at `:33`. Add a long-name case to D7.

**M2 (Major, Must): focus is lost after "Use this person", "Add as new" or "Change".**
* The button that was pressed unmounts (`duplicate-hint.tsx:56`, `:62`, `:34`). Radix then moves focus to the dialog container, and the next Tab lands on **Close** at the top of the panel (probe: `DIV:Add a lead…`, then `BUTTON[Close]`).
* A keyboard user loses their place on the screen's main action: WCAG 2.4.3, EXPERIENCE §2.12 "keyboard path for every task". D7 presses Enter but never checks where focus goes next.
* **Fix:** in `choose` (`add-lead-panel.tsx:58`), after the render, focus the choice box's **Change** button (or the box, with `tabIndex={-1}`). On Change, focus the hint's first "Use this person" button. Assert `document.activeElement` in D7.

**m1 (Minor, Should): announcements are unreliable.**
* The "Checking…" line, the hint and the choice box are each a *new* `role=status` node, mounted with their text already in place (`duplicate-hint.tsx:31`, `:45`, `:51`). Many screen readers (VoiceOver in particular) do not announce a live region that arrives already filled.
* The hint's live region also wraps its buttons, so an announcement would read the whole box.
* **Fix:** add one live region that is always mounted and visually hidden (`aria-live="polite"`), holding only the title line ("1 person on file looks like this person." / "Adding to X's record." / "Checking…"), and drop `role=status` from the boxes that hold buttons.

**m2 (Minor, Should): tests do not fail when two rules are removed (D16).** I worked these out by reading the test; I did not run mutations.
* (a) D3's "three blurs" repeat the *same* details (`check_…browser.ts:104-106`), so the `last` de-duplication alone passes it. Removing the 400 ms wait or the one-at-a-time queue (`use-duplicate-check.ts:76-77`) fails no check. The concept §6 asks for "one request for three quick blurs".
* (b) No check edits a key after a pick. Removing `if (choice) choose(null)` (`add-lead-panel.tsx:99`) would put the lead on the old pick, and nothing would catch it. The code is right today (my probe: Save reads "Save lead", then 409, with no `personId` sent).
* (c) BR-5b's phone offer and the 5000-character guard are untested.
* **Fix:** add quick blurs with *new* details each time (expect 1 check); a slow-route case (`page.route` delay) for queue and latest-wins; pick, edit the email, Save, and expect no `personId`; and a guard case.

**m3 (Minor, Should): the note error stays after unticking.** At a 5000-character note plus the kept line, the guard works: the error is on First note, focus goes there, nothing is sent. But unticking the box leaves "too long to also keep…" on screen until the next Save (`add-lead-panel.tsx:119`, where `onKeep={setKeep}` does not clear `errors.note`). **Fix:** clear `errors.note` when `keep` changes.

**m4 (Minor, Could): a failed check is never retried for the same details.** `last` is set before the answer arrives (`use-duplicate-check.ts:74-75`), so leaving the field again after a network failure sends nothing. Save's 409 still covers exact keys. **Fix:** reset `last` in the `catch`.

**m5 (Minor, Lead to note): the 409 box's "Use existing person" still drops a typed phone that differs** (`add-lead-panel.tsx:132`). This is FO-4al's path, unchanged. BR-5b is written for "Use this person" only, so this is no finding against the build; it is recorded so the Lead can decide whether "never dropped" covers the 409 path too.

**Graph:** `qa/graph.json` still says of `POST /front-office/duplicates/check` "no page uses it either" after `graph.mjs` on this branch: the graph does not follow `staffApi` calls in `duplicates/`. This is tooling, not this PR's defect.

## Lead 19's M2 reading (BR-5b in the first note, not on the person): acceptable
Concept r3's BR-5b, which the Lead approved, already words it this way: "Also keep in the lead's first note … Writing them onto the person record is not in this row". `fo_person` has one email column and there is no email edit route. Checked in the data:
* ticked, the first note is the typed note, then a blank line, then "Also gave: <details>";
* with no typed note, the note is exactly "Also gave: 647 555 0199";
* unticked, nothing is kept, and the box says "Not saved: …";
* the email is offered only when no EMAIL reason matched, and the phone only when no PHONE reason matched (probe: email matched, so only the phone was offered).

The cost, already stated in the build notes: those details are text, so they never match a later duplicate check.

## D1-D20 (0-5, one line each)
D1 4: every BR in scope behaves as written; board S1 states and copy match. · D2 4: the server keeps 409; a stale pick is cleared; one requestId per panel. · D3 5: reuses FO-9a's check and FO-2's route, no new API. · D4 5: a similar name alone never 409s; Add as new sends `confirmedNew`. · D5 4: races hold; m4. · D6 n/a: no content governance in this screen. · D7 n/a: no AI. · D8 4: inside the Add a lead panel. · D9 4: one place to choose; Save names the person. · D10 4: board words; "Similar name (85%)". · D11 3: live region (m1), stale note error (m3). · D12 3: long-name overflow (M1). · D13 2: M1 and M2. · D14 4: team controls and tokens; Add as new is an outline button. · D15 4: 792 ms from blur to hint, including the 400 ms wait; one read per changed key. · D16 3: m2. · D17 simulated only. · D18 4: reasons and score shown; the hidden line is nameless. · D19 n/a: part 1 of 3. · D20 simulated only.

## Scorecard BIC-01 to BIC-20
N/A for all 20: EXPERIENCE §6 covers case-side screens, and this one is front office (concept §4c). Its intent is covered above (BR-1, BR-3; reasons in words).

## Journey test (reviewer role): 8.5/10, pass
Full report: `screens/FO-9s/journey-test-reviewer-2026-11-22.md`. Scores of ½: feedback and state (m1, m3), accessibility and screen sizes (M1, M2), visual quality (M1).

## Not checked
* A real screen reader (VoiceOver or NVDA): m1 is inferred from the DOM.
* A visible (headed) browser: no display here; every walk was headless Playwright with screenshots.
* An intended user's unaided walk: D17 and D20 stay with the founder.
* Mutation runs for m2: worked out by reading.
* The CI-wide suite set (`run-suites.sh --changed`), and the FO-4/j_27 suites the builder ran.

**Verdict: Block** (ship after fixes). To fix: M1 (the footer button and choice box wrap at 375 px and 200 %), M2 (focus after a pick or Change). Recommended in the same round: m2 to m4.

Reviewer: Block 4eda1fc4ebfe08f2989bf6e547a81b0657679add

## Re-review (round 2): head 60af218c7f7a20d5fe9993faaa4932e2632336a9
Diff read only (P-277): `git diff 4eda1fc4e 60af218c7 -- …/prototype` and build-notes "Review round 1". Same isolated copy, `rv_dup` on :4571; Sample data, US$0.

**Ran:**
* `check_fo9s_duplicates_browser.ts`: 32/32, exit 0.
* My round-1 probe, re-run unchanged: every earlier finding now passes. Its one "fail" looks for a live-region *ancestor*; the fix uses a sibling `data-dup-live` region, which D8 asserts.
* The long-name probe: exit 0.
* Start and stop: exit 0. The re-shot screenshots are restored.

**Round-1 findings:**

| Finding | Status | Evidence |
|---|---|---|
| M1 | Fixed | The "Maria Fernanda Guadalupe … Gonzalez-Rodriguez de la Cruz" Save button is 246 px wide at 375 px and 370 px wide at 200 % (CSS 512 px). Both fit, wrap normally, and show "…" with the full name as the tooltip. A 90-character name with no spaces wraps in the choice box. D8 asserts it at 375 px. |
| M2 | Fixed | Focus: Use this person → Change; Add as new → Change; Change → the first "Use this person"; the next Tab after a pick → Source. Edits that clear a pick move nothing. D8 asserts it. |
| m1 | Fixed | One always-mounted `sr-only aria-live=polite` region carries the title or choice line only (`add-lead-panel.tsx`), and `role=status` is dropped from the boxes that hold buttons. |
| m2 | Fixed | D8 now fails if the 400 ms wait goes (two numbers within the wait → one check, the newest), if the clear-after-pick goes, if the phone offer goes, or if the guard goes. The queue still has no check of its own; my slow-route probe passes. |
| m3 | Fixed | Unticking clears the note error, in both the hint and the 409 box. |
| m4 | Fixed | `last` is reset on a failed check. |
| m5 | Fixed | Fixed through the breaker's F1. |

**The breaker's F1 (409 "Use existing person" offers the additions): sound.**
* `extraFor` reuses the hint's reasons for that person, so only unmatched details are offered. D9 shows the matched email is left out, and the note holds "Also gave: +1 604 555 0142" on Lena's person.
* The 5000-character guard covers this path too, because `noteOf` now uses `extraFor`.
* Hidden matches (`personId` null) get no offer.
* `keep` resets to ticked on each 409.

**The breaker's F2 (lead number per named person): sound and safe.**
* The number comes from the caller's newest lead they may open. It uses the same `sees(...)` rule, with an inactive owner counting as unassigned, as Add a lead's 409 (`leads.ts`), so no number leaks beyond what the 409 already shows.
* It costs two set queries (active staff, and the leads of at most 10 people), with no per-row requests.
* `ports/matching.ts` gains `lead: string | null | undefined`, so existing consumers still parse (FO-9a 53/53, won 25/25 and FO-13c 46/46, per the builder).
* The row and the accessible name carry "· L-…", and D9 asserts two Wren Hales read apart.

**F3:** a 404 on a pick drops it, says "<name> can no longer be opened. Choose again, or add as new." and re-checks. D9 asserts it. **F4 and F5** are recorded as known gaps. Neither breaks a BR in scope: BR-5 says Save does not ask again after Add as new.

**New Minors (do not block):**
* n1 (Should): `build-notes.md` "Deviations" still says "There is no lead number … on a match row", which F2 made untrue.
* n2 (Could): when the hint never ran (a failed or pending check), the 409 box offers *both* typed details, including the key that matched exactly. Keeping it in the note is harmless.
* n3 (Could): the one-at-a-time queue has no test of its own.

**Journey score, round 2: 9.5/10 (pass).** Feedback and state, accessibility and screen sizes, and visual quality each go from ½ to 1. Feedback and state is still ½, because a real screen reader was not used for the new live region. D13 goes from 2 to 4, D12 from 3 to 4, D11 from 3 to 4, and D16 from 3 to 4.

**Not checked:** a real screen reader, a visible browser, the CI-wide suite set, and the FO-9a/FO-13c suites (the builder ran them).

**Verdict: Approve** (no open Blocker or Major; n1 to n3 are Minors).

Reviewer: Approve 60af218c7f7a20d5fe9993faaa4932e2632336a9

## Re-review (round 3, CI fixes): head b6ee7c89204abd58cae3b84cd97d93be4b3d1cf5
Diff only: `git diff 9fe5f82d2 b6ee7c892` (3 files, plus re-shot screenshots).

**Ran:**

| Run | Result |
|---|---|
| `module-cards.py pr <22 changed files> <empty body>` | PASS, exit 0 |
| `module-cards.py tree` (real tree) | PASS, exit 0 |
| `check-select-suites.sh` | 83/83, exit 0 |
| `check_fo9s_duplicates_browser.ts` (isolated `rv_dup` :4571) | 32/32, exit 0 |
| **`check-module-cards.sh`** | **exit 1: "FAIL module cards: 44 fixtures"** |

`check-module-cards.sh` has three failing fixtures: "tree: as on this branch", "a good row fragment" and "a fragment path relative to the card's folder". All three say: `api/src/front-office/MODULE.rows/FO-9s.md: names ports/matching.ts, which exists neither from the card's folder, the studio nor the repository root`.

**B1 (Blocker, CI): the new API row file breaks the module-cards fixture test.**
* The cause:
  * `module-cards.py` checks every backticked path in a fragment.
  * The fixture's tree copy takes only `api/src`, `web/src` and `tests` (`check-module-cards.sh:37`), so `studio/ports/matching.ts` is not in it.
  * The real tree resolves the path from the studio, which is why `module-cards.py tree` passes.
* The other row files write `ports/*.ts` without backticks for this reason (PF-18a, QA-518, FO-7b-1a). The module-cards workflow runs this test before the PR check, so CI stays red.
* **Fix:** in `api/src/front-office/MODULE.rows/FO-9s.md`, write ports/matching.ts without backticks. I tried exactly that edit in my working copy and reverted it: `check-module-cards.sh` then exits 0 (44 fixtures).

**The other two changes are sound:**
* The web row file's path `modules/front-office/sales/add-lead-panel.tsx` resolves from the card's folder (`pr` and `tree` pass).
* D3 now reads `web-form-page.tsx` and `web-form-settings-page.tsx` by name. These are the only two `web-form*` files in `sales/` today, and history.tsx stays under 30 suites (83/83).
  * A renamed file fails loudly (`readFileSync` throws).
  * n4 (Could): a *new* web-form file would not be covered. A comment pointing to the list would keep that visible.

**Verdict: Block** (only B1; one character class to remove). The code verdict from round 2 stands: no product change in this diff.

Reviewer: Block b6ee7c89204abd58cae3b84cd97d93be4b3d1cf5
