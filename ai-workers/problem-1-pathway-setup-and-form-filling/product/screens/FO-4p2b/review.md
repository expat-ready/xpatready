# Review: FO-4 part 2b, the prospect page's notes, calls and timeline (R1.76), reviewer, round 1, 26 Nov 2026

**Verdict: Ship after fixes (Changes; three open Majors, so not Approve)** for be4b8a3c79a007467ac72b5b3c9fe9f9a5909590.
Scope: `git diff origin/main be4b8a3c7`: new `web/…/sales/prospect-activity.tsx`, one mount line in `prospect-page.tsx`, `tests/check_fo4p2b_prospect_activity_browser.ts`, two screenshots. Concept: fo-4-sales r2 §4 screen 4 ("centre timeline (one page at a time) with Log a call and Add a note") and screen 5 (panels), BR-6, §4c, §5, §6. API: FO-2 part 4 (`routes.ts:125-142`, `calls.ts`, `timeline.ts`). I did not build this.

## What I ran (isolated copy `rv_fo4p2b` on :4435, never :4400; stopped afterwards)
* Builder's `check_fo4p2b_prospect_activity_browser.ts`: **23/23**, in 7.5 s.
* My own Playwright walk (kept in the scratchpad, not committed). The Owner at 1440, 1024, 375 px and 1024 px at 200 % zoom; keyboard-only; the Case Officer with and without the keys; offline and 500 failures; RTL and markup text; 16+ lines; two tabs; a Move and a Set value from part 2a. I checked the data with SQL each time.
* `graph.mjs --check`: G1 0, G2 0, G4 0, G5 0. G3 lists all six activity routes as "no page uses it", and it lists `GET prospects/:id` the same way. The tool does not read paths built with template strings, so this is a tool gap and not this PR's.

## Findings
### Major
**M1. The timeline goes stale after the page's own actions.**
* Part 2a's actions refresh only `["fo","prospects"]` (`prospect-page.tsx:75`; Move goes through `useMove`). The timeline's key is `["fo","prospect-timeline",id]` (`prospect-activity.tsx:40`).
* *Walk:* Move to… Qualified. The header said Qualified, but the timeline kept its 3 old lines; "Moved to another stage" showed only after a reload. Set value did the same: 4 lines before and after, 5 after a reload.
* This breaks EXPERIENCE §4 / BIC-18 (state always true) and D11.
* *Fix:* put the key under the prospect's prefix (`["fo","prospects","timeline",id]`), or have each part-2a action invalidate it too. Add a test: Move, then the line is on top with no reload.

**M2. A long note or call cannot be read.**
* `line-clamp-3` (`prospect-activity.tsx:78`) cuts every note and call at 3 lines, with no "Show more", no hover text and no other place to read it. The box accepts 5,000 characters.
* *Walk:* a 60-line note showed "Line 1… Line 2… Line 3…." and had no control to see the rest (screenshot `rv-1440-many.png`, scratchpad).
* This breaks EXPERIENCE §1 [M] ("long text … with full text on hover") and §4 long content.
* *Fix:* add a per-line "Show more" button with `aria-expanded`, or drop the clamp. Test it with a long note.

**M3. Focus is lost when the Log a call panel closes.**
* After Escape, Cancel or a logged call, focus lands on `<body>`. The panel is unmounted (`:85`), so Radix has nowhere to return focus.
* Part 2a's Mark lost panel on the same page returns focus to its button (checked in the same walk).
* This breaks WCAG 2.4.3, EXPERIENCE §2.12 [M] and BIC-20.
* *Fix:* use the page's `useReturnFocus` / `focusWhenClosed` pattern, or keep `Panel` mounted and set `open`. Test focus after Escape and after saving.

### Minor
* **m1 (Must: EXPERIENCE §5 [M]). Raw server text on the field.** The When field shows "when: a call cannot be logged in the future." and "when: the call cannot be before the lead arrived." (`errWords`/`on`, `:35`, `:105`; screenshot `rv-1440-future.png`). *Fix:* put the screen's own words for the `when`, `seconds` and `notes` codes, or strip the `field:` prefix.
* **m2 (Should). The words map is vague** (`:20-23`).
  * "Moved to another stage" names neither the stage nor the cause. The concept's §4b promises that "every move names its cause"; the audit line has from/to and "Consult booked".
  * `prospect.value_set`, `client.created`, `client.subject_changed` and `case.opened` all read "Prospect updated" (walk: Set value).
  * *Fix:* name the stage ("Moved to Qualified") and add the four types.
* **m3 (Should). Two date styles on one page.** The timeline reads "26 Nov 2026, 08:34" (`:28`, en-GB); the page above reads "Nov 26, 2026, 8:34 a.m.". Use the page's formatter.
* **m4 (Should). Unclear hint.** "When (optional): Leave it empty for now." (`:113`) means "empty = now". Suggest "Leave it empty if the call was just now."
* **m5 (Should). Focus drops to `<body>` after Add note** (the busy button is disabled) **and after Show all** (the button unmounts). Return focus to the box, or to the first newly shown line.
* **m6 (Should). No announcement when a note is added or a call is logged.**
  * Part 2a's actions toast.
  * The hint turns `role="alert"` on in the same render as its text, which screen readers announce unreliably (`:66`).
  * Keep a live region mounted, or toast "Call logged."
* **m7 (Should, UXL-09). Add note is 32 px tall at 375 px** (`size="sm"`, `:68`); the bar for a primary is 44 px. The panel's Log the call is 36 px, but that is the shared Panel footer.
* **m8 (Should, UXL-13). Minutes "4,5" is refused** ("Minutes from 0 to 1440.").
* **m9 (Should). Layout deviations not recorded in the PR.**
  * The concept asks for Add a note as a right panel (§4 screen 5) and a centre column with "one page at a time".
  * The build has an inline box, a full-width section under the details, and first 10 + "Show all N" (up to 500).
  * The inline box is a fair choice, but say so in the PR (never deviate silently).
* **m10 (Should). Test gaps.** No case covers M1-M3, a server field error in the panel (future time), or a call's direction/minutes/when stored as entered. `OUTCOMES` is a second copy of `calls.ts`'s list (STANDARDS §7: no duplicated logic); take the codes from one contract.

## Concept and standards check
* **Concept fit:** Log a call has AG-2-37a's seven outcomes, When defaulting to now (BR-6), minutes and notes; "(optional)" is in words. A logged call does not move the stage (checked: the stage was unchanged).
* **Keys:** the screen follows `agent/prospect:edit` and `:log-call` (the API's keys, accepted in fo-2p4's review), and the server answers 403/403 without them (checked).
* **Firm B:** sees none of A's lines (builder's PA4, rerun).
* **Not built, per concept:** callback task, Book a consult, Link/Merge. These are not findings.
* **[M] lines met:** server authorisation, deny by default (403s); one request per view (one timeline GET, no per-row calls); field-level errors with input kept; axe clean in every state I opened (section, panel, error, 16 lines, 375, 1024, 200 %); no sideways scroll; personal data not logged (notes stay out of `audit_event`, checked). Speed: first view 0.7-1.4 s (cold, including the app), Add note 165-344 ms, Log a call under 400 ms.
* **[M] lines not met:** EXPERIENCE §1 long text (M2), §2.12 keyboard path (M3), §4 state (M1), §5 plain words (m1). STANDARDS §7 has no duplicated web/API logic (m10, Should).
* **Code:** `withOffset` is right for half-hour and negative offsets. Double-click is guarded and stored once (builder PA1, rerun). Markup text shows as text. RTL works with `dir=auto` and `<bdi>`. Two tabs: both notes were stored once each and both show after a save.

## D1-D20 (1-5)
D1 4 (all of screen 4's controls; m9 unrecorded) · D2 4 (one row per save; server keys) · D3 4 (shared controls, `can`/`KEY`; OUTCOMES duplicated) · D4 N/A · D5 3 (M1; offline keeps text) · D6 4 (who and when on every line; audit checked) · D7 N/A (no AI) · D8 4 · D9 4 · D10 3 (m1, m2, m4) · D11 3 (M1, m6) · D12 3 (M2, m3) · D13 3 (M3; axe clean, zoom fine) · D14 4 · D15 4 · D16 3 (23 pass/fail cases; none for M1-M3) · D17, D20 simulated only · D18 4 · D19 4 (builder's j_76 W8 claim; I did not rerun it).

## BIC (§6; the concept's §4c applies it), evidence at 1440 and 1024 px
Met: 04 ("(optional)" in words) · 11 (one primary per section and per panel, verb + object) · 14 (full time on hover; no icon-only buttons) · 19 (one heading, one primary, no ids; 1440 and 1024 screenshots).
Partly: 13 (on the field with input kept; raw "when:" words, m1) · 18 (skeleton and error notice drawn; stale after Move, M1; read-only hides the controls without saying why) · 20 (keyboard completes the task, but focus is lost, M3; 200 % zoom fine).
N/A here: 01-03, 05-10, 12, 15-17.
UXL (1280/375): 01, 03, 10, 11, 12 Met · 09 Not met (m7) · 13 Partly (m8) · the rest N/A or Met.

## Journey score (reviewer; the one for this check): **8/10**, a pass with no zero
Details are in `journey-test-reviewer-2026-11-26.md`. The Majors still hold the verdict.

## Could not check
* A real screen reader.
* An intended user's unaided walk (D17/D20 stay with the founder).
* CI and `run-suites.sh`.
* j_76 W8, which I did not rerun.
* The retrofit mapping: none is recorded and no team screen is named.

**Verdict: Changes be4b8a3c79a007467ac72b5b3c9fe9f9a5909590**
* Major: M1, M2, M3.
* Minor: m1 (Must), m2-m10 (Should).

Reviewer: Changes be4b8a3c79a007467ac72b5b3c9fe9f9a5909590

## Round 2 (diff only): `git diff be4b8a3c7..9afa4cc56993bd44f325c17b7ab345995db603a4`, reviewer, 26 Nov 2026
This round also re-checks the breaker's round-1 Majors (`break-report.md`), so one verdict covers both.

**Ran** (isolated copy `rv_fo4p2b` on :4435, stopped afterwards):
* the builder's check: **30/30**;
* my own round-2 Playwright walk (scratchpad only) at 1440 and 375 px, keyboard included, with SQL reads after each step.

**Closed:**
* **Review M1.** The key is now `["fo","prospects","timeline",id]`; nothing on the page sets or removes data across that whole prefix. Set value added its line with no reload (1 → 2 lines), and the builder's PA6 covers Move.
* **Review M2 / break M3.**
  * A note or call longer than 3 lines or 240 characters folds, with a "Show all of it" / "Show less" toggle (`aria-expanded`, opens with Enter). A note that short is never clamped, so no text is hidden without a toggle.
  * A 40-line note and a 4,000-character paragraph at 375 px read in full, with no sideways scroll.
  * axe is clean with the note expanded.
* **Review M3 / break M1.** Focus goes back to Log a call after Escape, Cancel, the X and a save: checked each one. The Panel's `onCloseAutoFocus` handles the unmounted panel.
* **Break M2.**
  * Typed data plus the X or a click outside asks first; on No the panel stays open with the words kept. Yes closes and logs nothing (PA6).
  * Escape does not close the panel while a save is running.
  * The Cancel button closes without asking. That is a deliberate choice by the person, so I accept it.
* **Minors fixed:**
  * m1: "The call cannot be before the lead arrived." (no `when:` prefix);
  * m4: the When hint;
  * m5: focus goes back to the box after Add note;
  * m6: "Note added." / "Call logged." in a status line;
  * m7: Log a call and Add note are 44 px tall at 375 px;
  * m8: "4,5" is stored as 270 s, and `1e3`, `0x10` and `1.234` are refused with "e.g. 4 or 4.5".
  * The breaker's m5-m7 are in the diff as described. I checked them in the code; I did not repeat the breaker's NFD or typing-during-save attacks.

**New or still open (none Major):**
* **r1 (Minor, Should). `max` on When is fixed at the minute the panel opened** (`prospect-activity.tsx:131`).
  * I typed a time 2 minutes after it and pressed Enter in Minutes. The browser's own check blocked the save (`rangeOverflow`) with no message from the screen, and the earlier server error stayed on the field. Clicking "Log the call" skips that check.
  * *Fix:* work out `max` when the person submits, or add `noValidate` and let the server's 5-minute rule decide.
* **r2 (Minor, Should). After "Show all N lines", focus lands on line 11 with `outline-none`** (`:88`), so nothing shows where the new lines begin. Give it a visible focus style.
* **r3 (Minor, Should). Small details:**
  * the "Show all of it" toggle is 16 px tall (UXL-09 asks for 24 px; axe's target-size rule passes on spacing);
  * the status line sits inside the `:edit` block (`:78`), so a role with `:log-call` but no `:edit` would not hear "Call logged." (no seeded role is like that);
  * Cancel stays clickable during a save, which closes the panel and drops any error that comes back.
* **Still open by the builder's choice (to be listed in the PR), accepted as Should:** review m2, m3, m9 (to be recorded in the PR body) and m10; break m4. Break S1-S3 belong to the server (FO-2p4) and go to a follow-up row; they do not block this screen.

**Journey score (round 2): 9/10.** Feedback, accessibility and visual quality each rise to 1. Plain words stays at ½ ("Moved to another stage", "Prospect updated", two date styles).

**Verdict: Approve 9afa4cc56993bd44f325c17b7ab345995db603a4**
* No open Blocker or Major from the review or the break report.
* Minor (Should): r1-r3; review m2, m3, m9, m10; break m4; S1-S3 (follow-up row).

Reviewer: Approve 9afa4cc56993bd44f325c17b7ab345995db603a4

## Round 3 (diff only): `git diff 9afa4cc56..b629572fcff8008ac14011d98ddc41df625fb181`, the PR's own paths only, reviewer, 26 Nov 2026
The scope is `web/src/modules/front-office` and `tests/check_fo4p2b_prospect_activity_browser.ts`; everything else in the range is main's. That leaves two changes:
* **e4474c596:** `<FoldArrow open={…} />` inside "Show all of it" (BK-2).
* **0ece1563b:** the suite's arguments and usage line in run-suites.sh's form: `<port> <database>`, no `--ttl`, plain `tsx`. The line matches run-suites.sh's usage pattern (`run-suites.sh:407`), and the `:4400` refusal is kept.

No other line in the front-office folder changes in this range, so the merge of main touches neither `prospect-activity.tsx` nor `prospect-page.tsx`.

**Ran** (isolated copy `rv_fo4p2b` on :4435, started and stopped without `--ttl`, so it ran as run-suites.sh starts it):
* `check_fo4p2b_prospect_activity_browser.ts 4435 xr_studio_rv_fo4p2b`: **30/30**.
* `check_bk2_fold_outs.ts`: **16/16**.
* A browser look at 1440 and 375 px:
  * The arrow is `aria-hidden`, so the button's name stays "Show all of it" / "Show less".
  * It points right when closed and turns down on Enter (`rotate-90`), and `aria-expanded` follows.
  * No sideways scroll, axe clean when expanded, no page errors.

**Findings:** none new. Round 2's open Minors stand as listed (r1-r3; review m2, m3, m9, m10; break m4; S1-S3 to a follow-up row).

**Verdict: Approve b629572fcff8008ac14011d98ddc41df625fb181**
* No open Blocker or Major.

Reviewer: Approve b629572fcff8008ac14011d98ddc41df625fb181
