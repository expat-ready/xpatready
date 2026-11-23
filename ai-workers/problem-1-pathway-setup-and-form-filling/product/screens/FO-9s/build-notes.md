# FO-9s part 1: build notes (the duplicate warning on Add a lead, R1.29)

Branch `claude/screens-fo9s-warn`, PR #2900. Concept r3 and challenge: PR #2896 (`screens/FO-9s/concept.md` BR-1 to BR-5b, board `design/fo9s-boards.html` S1; Lead 19 approved part 1 on #2896). Built by the runtime lane on Lead 19's ask. Web, plus one additive field on FO-9a's check (round 1, break F2): `ports/matching.ts` PersonMatch gains optional `lead` (the newest lead number the caller may open), filled in `duplicates/service.ts`. No schema change.

## Files
* New `web/src/modules/front-office/duplicates/`:
  * `contract.ts`: zod for FO-9a's `DuplicateCheckOut`, and `reasonWords`.
  * `use-duplicate-check.ts` (BR-2): `checkBody`, `useDuplicateCheck` (wait 400 ms, one request at a time, the newest details win, `clear`).
  * `duplicate-hint.tsx` (BR-1, BR-3 to BR-5b): `DuplicateHint`, `unmatchedDetails`, `keptLine`.
* `web/src/modules/front-office/sales/add-lead-panel.tsx`:
  * The hint under Phone; key fields check on blur.
  * Save sends the hint's choice and reads "Add lead to <name>" after a pick.
  * A key edit clears the choice and the hint.
  * The 409 box replaces the hint.
  * The kept details join the first note, with a 5000-character guard on the field.
* `web/src/MODULE.rows/FO-9s.md` (the web-shell card's row file).
* `tests/check_fo9s_duplicates_browser.ts` (D1-D7, 20 checks).

## Review round 1 (reviewer Block, breaker 2 Majors at 4eda1fc4e) → fixed in 20527b379 and the next commit, each with a check
* **Reviewer:**
  * M1: long names wrap on Save and in the choice box; Save also shortens them at 40 characters, with a tooltip (F6). Check: D8.
  * M2: focus goes to Change after a pick, and to the first match after Change. Check: D8.
  * m1: one always-mounted live region. Check: D8.
  * m2: new checks for the 400 ms wait, the edit-after-pick clear, the phone offer and the 5000 guard (D8).
  * m3: unticking clears the note's error. Check: D8.
  * m4: a failed check retries on the next blur.
* **Breaker:**
  * F1: the 409 box's "Use existing person" offers the same additions. Check: D9.
  * F2: lead numbers on each row and in the accessible names. Check: D9.
  * F3: a pick that can no longer be opened is dropped with a plain line. Check: D9.
  * F6: the long-name label is shortened.
  * F4 (a match created after an "Add as new" choice) and F5 (a zero-width space in Phone gives the server's own 422 on Save) are left as known gaps below.

## Top 5 production improvements over the board
1. **Add as new is an outline button**, not the primary one. Save stays the panel's one primary action (EXPERIENCE §1), so the screen does not nudge toward a duplicate.
2. **Each "Use this person" button carries an accessible name with the person's name** ("Use this person: Lena Park"), so a screen reader tells the rows apart.
3. **The chosen state is a quiet bordered box with Change**, not the warn colour: the question is answered.
4. **The kept details show live:** unticked, the line turns to "Not saved: …" in warn text.
5. **The hint and the choice are inside the panel's fieldset**, so they lock while a Save is out, as the fields do (FO-4's break m1).

## Deviations from the board (with reasons)
* There is no lead number or owner on a match row: FO-9a's check returns the name only (the board was corrected in r2).
* The title says "1 person … looks" or "N people … look", and "Someone on file may be this person." when only a hidden record matched (BR-4).
* The S1 menu has no People to merge item: that is part 2 (Minor 5).

## Team-name mapping
Patterns: Panel, Button (`size="sm"`, `variant="outline" | "ghost"`) and the Notice-like warn left bar (`border-l-warn`), all from `@/components/ui/controls` and the team tokens (`text-text-warn`, `text-text-muted`, `bg-surface-raised`). The team's code has no duplicate screen (AG-2-68: "Not built").

## Mock vs real
All real. The FO-9a check route and FO-2's `POST leads` run on an isolated copy with Sample people. No AI step; US$0.

## Checks run (exit codes; this copy, Linux, isolated copies)
| Check | Result |
|---|---|
| `check_fo9s_duplicates_browser.ts` | 32/32, exit 0 (after round 1; 20/20 before) |
| `check_fo9a_duplicates.ts`, `check_fo9a_won_duplicates.ts`, `check_fo13c_conflict.ts` (the users of `ports/matching.ts`) | 53/53, 25/25, 46/46 |
| `check_fo4al_add_lead_browser.ts` (Add a lead, the 409 path kept) | 27/27, exit 0 |
| `check_fo4_sales_browser.ts` | 45/45, exit 0 |
| `tests/journeys/j_27.ts` | 11/11, exit 0 |
| `tsc -p web` | 0 errors |
| `graph.mjs --check` | exit 0 |
| `count-any --against origin/main` | 416 = 416 |

`run-suites.sh --changed` picks 235 suites for a web change. The suites that drive Add a lead and the leads screens were run here; the PR's GitHub check runs the rest.

* **STANDARDS §4** (idempotency): one `requestId` per panel as before. The check is a read and writes nothing (FO-9a).
* **EXPERIENCE §2.8, §2.9:** the duplicate check runs before save; warn, don't block (D2).
* **§2.12:** keyboard path (D7), axe clean with the hint open (D7), and 375/1024/1440 with no sideways scroll (D7). The 200 % zoom case is FO-4al's AL7 (still green).
* **§4 states:** idle, checking ("Checking for people on file…"), matches, hidden only, failed (nothing shown), chosen person, chosen new, and the 409 replacing the hint.

## Self-score D1-D20 (honest; 0-5)
D1 job fit 4 · D2 rules 4 · D3 data 5 (no change) · D4 API 5 (reuse) · D5 states 4 · D6 copy 4 · D7 errors 4 · D8 keyboard 4 · D9 a11y 4 · D10 responsive 4 · D11 performance 4 (one small read per changed key) · D12 security 5 (the server's visibility rule; no new data) · D13 tests 4 · D14 consistency 4 · D15 team look 4 · D16 maintainability 4 · D17 docs 4 · D18 governance 4 · D19 AI n/a · D20 proof 4.

## Known gaps
* **Layout shift:** the hint appears above Source when Phone loses focus, moving Source down while the adder may be heading there. Focus is never moved.
* **BR-5b keeps the details in the first note, not on the person** (one email column, no email edit route). This is the builder's reading of Lead 19's "offered additions", written in challenge.md's Lead response for the Lead to confirm.
* The company match (Engage as Corporate, add contact) mounts with FO-4c's screens. People to merge and the guided merge are parts 2-3.
* **F4:** an "Add as new" choice made before another session adds an exact match is not asked again (the choice stands). **F5:** a zero-width character in Phone gets the server's own 422 on Save, on the field.
* "Add as new" writes no Kept-separate pair yet: FO-9b part 2 does that (founder question 1, B1).

## AI cost
None (US$0).
