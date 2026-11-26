# PF-21rs B2 (R1.85): "Legal holds" in our console: independent review, 26 Nov

**Commit reviewed:** `782b79a16c69bd3f7851fa3008cbcf6a3c88ac46` (branch `claude/runtime-pf21rs-b2`, stacked on B1 #3818 at `732dfc836`). Diff `origin/claude/runtime-pf21rs-b..HEAD`: `privacy/holds.ts` (73), `holds-page.tsx` (122), `contract.ts` (+3 −2, the menu link), `routes.tsx` (+2), the B2 part of `tests/check_pf21rs_browser.ts` (+83 −1), and 2 screenshots.
**Read:** concept r2 §3 BR-6, BR-7, BR-8, §4 "Legal holds", §5, §6 W3 (and Q3), §8; `api/src/platform/register/holds/{routes,service,adapter}.ts`; B1's `review-b1.md` for calibration. Out of scope (concept): "Hold this person" from a request page (Not built), the firm-side refusal screen (PF-21d, Q3).

**Verdict: Ship after fixes → Block** (1 Major, 5 Minors). W3 works end to end on screen, but the dialog's refusals use format words that do not tell the Platform Owner what to do. B1 was blocked for this and fixed it; B2 brings it back on the same picker.

## What I ran (copy `pf21rsr2` on :4441, never :4400; AI_LIVE=off; US$0; stopped after)
* `check_pf21rs_browser.ts 4441 xr_studio_pf21rsr2`: **66/66, twice** (about 51 s each). I restored the screenshots it rewrites with `git checkout`.
* `tsc -p web --noEmit`: exit 0. `graph.mjs`: G1 0 · G2 0 · G4 0 · G5 0. G3 lists `POST holds/:id/release` with no test and no web use. That is the tool's known `systemApi()` blind spot; the check and my walk both call it.
* `module-cards.py pr` on the diff: **FAIL** (web-shell touched, no card change; no PR body yet; Minor 5).
* My own Playwright walk at 1440 px as `ops.sample@expatready.example.com`, signed in on the console card. I went through the menu to Legal holds and clicked each chip. I tried "Hold a firm's data" empty, then with the firm typed but not chosen, a blank or bad person id, a reversed or empty date range, and a bidi reason; then Escape with typed text. I copied the person id from a request page, placed a person hold with a 444-character Polish/Chinese reason by double click, and ran `KeepPeriods.check` (HELD with the reason). I released with no reason, then with one (the check gives OK again). I tried a stale release from a second tab. I placed and released a firm hold with the keyboard only, checked 1024, 720 at 200 % and 375 px with axe, opened the page as Support and as our Auditor by URL, and reloaded with the dialog open. I read the DB after each step. Scripts and shots are in the session scratchpad.

## Concept fit (held)
* **Menu, page, table (§4):** the Privacy group links "Legal holds" by key, on the phone row too. h1 "Legal holds", crumb, tab title. Chips Active/Released/All with `aria-pressed`. Columns Firm · Covers · Reason · Placed (time + our staff name) · Release. The empty copy is §5's exactly.
* **Dialog (BR-6, BR-7):** "Hold a firm's data". The firm is picked from our list (B1's `OneFirm`) and covers the whole firm by default; Advanced offers person, case, category and dates. The reason is never pre-filled, and both place and release need one (`REASON_REQUIRED` shown under the field). Escape with typed values asks "Discard your unsaved changes?". A padded id is trimmed (UXL-13).
* **W3:** the person hold is listed Active with the firm name, "Person record 48a5…326f" and "Platform Owner (Sample)". `KeepPeriods.check` answers `HELD` with the hold's reason. Release (red outline, destructive confirm naming firm and scope) needs a reason; the row then moves to Released with time, who and "the matter settled", and the same check answers `OK`.
* **Roles (BR-8, W5):** Support and our Auditor see the API's 403 words with no table, no button and no Legal holds link. A firm token gets 403 on list, place and release, and nothing is written.
* **Data:** DB = screen. The 444-character reason is stored exactly. A double click stores one row. Reloading mid-dialog writes nothing. Each change writes one firm-trail line (`audit_event`) and the guard's `plat_system_audit` line. A stale release gives "This hold is already released; nothing was changed.", and Cancel refreshes the list.

## Standards [M]: met except as listed
**Met:** team frame and tokens; changes in dialogs; loading, error with Retry, empty, read-only (403) and conflict states; one filled button per view; names joined on the server (one request per view); server authorisation; zod shapes with no React (`holds.ts`); comments say why; axe 0 serious with no sideways page scroll at 1440, 1024, 720@2x and 375.
**Not met:** EXPERIENCE §2.10 "errors say what happened and how to fix it" (Major 1); EXPERIENCE §1 "status by shape and text" and "full text on hover" (Minors 3, 4); STANDARDS §7 module card (Minor 5).

## D1–D20 (1–5)
| D | Score | Evidence |
|---|---|---|
| D1 Requirement fit | 5 | W3, W5, W6 and BR-6/7/8 as written (W3 as reworded in Q3) |
| D2 Data integrity | 4 | Server refuses bad input; double click stores one row; the person id is not checked to exist (concept M4, runtime gap) |
| D3 Reuse | 4 | `OneFirm`, Dialog, Field, `firmWords`, `actorWords`, `momentUtc`; B1's refusal words for the same picker are not reused |
| D4 Rule integrity | 5 | The app's delete check answers HELD while held and OK after release |
| D5 Stability, recovery | 4 | Reload, double click and stale release hold; a refused release leaves focus on the dialog box (Minor 2) |
| D6 Governance | 5 | Reason both ways, never pre-filled; who, when and why on the row; firm trail and system audit lines |
| D7 AI trust | N/A | No AI |
| D8 Orientation | 5 | Crumb, h1, active menu item, tab title |
| D9 Flow | 5 | One filled action; the empty state teaches; Release on each row |
| D10 Language | 3 | "This is not in the expected format." for a missing firm or id; "A date (YYYY-MM-DD) or a time with its zone." (Major 1) |
| D11 Feedback | 4 | Done lines (`role=status`), busy buttons, 409 words; no "Released" word in the All view (Minor 3) |
| D12 Visual | 4 | Clean at 1440; at 1024 the Reason column squeezes and Release is cut (Minor 1) |
| D13 Accessibility | 4 | axe 0 at every width, keyboard place and release, focus returns; Minors 1, 2 |
| D14 Team look | 5 | Same frame and Table as Breaches and Requests |
| D15 Speed | 5 | List 104 ms; place → listed about 1.1 s |
| D16 Testability | 4 | Pass and fail lines for W3, W5, W6; the fail line accepts the format words; module-cards FAIL |
| D17 First-use | simulated only | No intended user walked it |
| D18 Provenance | 5 | Firm and staff names, reasons, "the firm is never told why" |
| D19 Capability closure | 5 | Row W3 closed on screen with the app's own check; the firm-side refusal stays with PF-21d (Q3) |
| D20 Pain solved | simulated only | |

**BIC-01–BIC-20:** N/A (concept §4c: console, not a case screen). **UXL (EXPERIENCE §7):** 01–09, 12–14 Met (one filled button; Release set apart as danger; ids chunked; 44 px primary at 375); 10 Met (the table scrolls inside its box, with cut cells showing it); 11 N/A. **Journey score (reviewer, skill journey-test): 8.5/10, a pass, no criterion at 0** (`journey-test-reviewer-b2-2026-11-26.md`).

## Issues
### Major (Must)
1. **The hold dialog's refusals do not say how to fix them** (`holds-page.tsx:25`, `:33`, `:38`, `:42-43`; EXPERIENCE §2.10 [M]).
   * With the exact firm name typed but "Choose Sample immigration firm" not pressed, the dialog says "This is not in the expected format." under the box (walk `12-typed-not-chosen-1440.png`). This is the likeliest slip on W3's path; the person would retype the name.
   * A blank or malformed person or case id gives the same words. Empty dates give "A date (YYYY-MM-DD) or a time with its zone." under a date picker.
   * B1's Major 1 named this defect, and B1 round 1 fixed it for the same picker with its own checks and words (`requests-page.tsx:31-32`, `requests.ts:95-96`).
   * Fix: check before sending, as B1 does. No firm: "Pick the firm from the list: type its name, then choose it." Blank or bad id: B1's `personIdWords` (or the case form). Empty date: "Pick a start date." / "Pick an end date." Assert the words in the W3 fail line.

### Minor (Should)
1. **At 1024 px the table overflows its box by 46 px** (`holds-page.tsx:105`). The Release column's time and "Platform Owner (Sample): …" are cut, and the Reason column narrows to about 180 px, so a 444-character reason runs to 36 lines (walk `09-list-1024.png`). Fix: let the Placed cell wrap below `lg`, or relax the Release cell's `min-w-40`.
2. **A refused release leaves focus on the dialog box**, not the reason field (`holds-page.tsx:55-58`). The place dialog moves focus to the first refused field (`:19`). Fix: do the same in `ReleaseHold`.
3. **In the All view, a released row carries no "Released" word.** Its state shows only as a date where active rows have a button (`holds-page.tsx:107`; EXPERIENCE §1). Fix: start the cell with "Released".
4. **The full person or case id cannot be read anywhere on the page.** "Person record 48a5…326f" has no hover text (`holds-page.tsx:103`), and the release confirmation names only the short id. Fix: add `title` with the full id on the Covers cell.
5. **`module-cards` FAIL:** web-shell's `contract.ts` and `routes.tsx` are touched (STANDARDS §7 [M]). Fix: put `Card unchanged: <reason>` in the PR body.

Noted, not a finding: copying a person id from a request page in a second tab needs a second sign-in, because the console session is per tab (#3489's `sessionStorage`).

## What I could not check
A real screen reader; Safari and Firefox; the true empty Released/All state on a fresh register; j_85 W4's own browser steps (waiting for qa's console sign-in, §8 M3); an intended user's unaided walk (D17 and D20 stay with the founder).

Reviewer: Block 782b79a16c69bd3f7851fa3008cbcf6a3c88ac46

**Verdict: Block** on `782b79a16`. To fix: Major 1 (`holds-page.tsx:25-43`, plus the words asserted in the W3 fail line). Fix Minors 1–5 in this PR or record them on the row.

## Round 2 — `e25fa6e45135de624d82fc5a5894f5257ee52441` (diff `782b79a16..e25fa6e45`: `holds.ts` +16, `holds-page.tsx` +29 −19, check +12 −3)
**Ran (copy `pf21rsr2` on :4441, stopped after):** `check_pf21rs_browser.ts` **67/67, twice**; `tsc -p web` exit 0; my round-1 walk again (same steps, 1440 / 1024 / 720@2x / 375) plus the typed-not-chosen slip. Screenshots the check rewrites were restored.
* **M1 closed.** `holdDraftErrors` checks before anything is sent (`holds.ts:10-17`); the API stays the backstop. Walked: the firm typed in full but not chosen → "Choose the firm from the list under the search box: typing its name is not enough."; blank or bad id → "Paste the record's id as the firm gives it: 36 characters, like 3f2a0c1e-…-c91e."; empty dates → "Pick both dates: from, and to."; reversed → "The end date must be on or after the start date."; no reason → "Write the legal matter the hold is for." Focus goes to the first refused field; nothing stored. Two check lines assert the exact words, the slip included (they fail if the words or the check go).
* **m1 closed.** At 1024 the table fits its box (inner overflow 46 px → 0); Reason is readable (`09-list-1024` r2). Release is narrow (a release runs about 8 short lines): acceptable.
* **m2 closed.** A refused release focuses "Reason for the release" (walked).
* **m3 closed.** Released rows start with "Released" in the All and Released views.
* **m4 closed.** The full id sits under the short one in a selectable `<code>`, wrapping inside its cell.
* **m5:** open until the PR body carries `Card unchanged: <reason>` (builder's stated plan); not a blocker for this commit.
* **Breaker's Minors, checked:** the Release button and the dialog name the placed time and the matter ("…, placed 26 Nov 2026, 08:05 UTC for “…”"); a stale release from a second tab closes the dialog, reloads (row leaves Active) and says "This hold is already released; nothing was changed." with focus on the h1; the long reason wraps in the dialog; Place/Release are 44 px below `sm`; the success line clears on a chip or a new try.
* **Held from round 1:** W3 on screen with `KeepPeriods.check` HELD → OK; one row on double click; Support and Auditor see 403 words only; firm token 403 ×3; axe 0 serious and no sideways page scroll at every width; keyboard place and release.
* **No new finding.** D10 3 → 5, D11 4 → 5, D12 4 → 5, D13 4 → 5, D3 4 → 5, D5 4 → 5; D16 stays 4 until the module-card line lands.
* **Journey score round 2: 9.5/10** (plain words, error recovery, accessibility and sizes now 1; visual quality ½ only for the narrow Release column at 1024).

**Verdict round 2: Ship → Approve** (no open Blocker or Major; m5 rides with the PR body).

Reviewer: Approve e25fa6e45135de624d82fc5a5894f5257ee52441
