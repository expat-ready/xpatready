# Review: FO-3st3b, Settings → Timings and a booking type's own timings under Advanced (PR #2750, J-T5; R1.42)

Reviewer: Opus 5.5, fresh context (did not build it). Skill `screen-review`; journey test `journey-test-reviewer-2026-11-21.md` in this folder (**8.5/10**). 21 Nov 2026.
**Commit reviewed:** PR head code **b4b67150a**. The new files are byte-identical in 5cc1b1826, the current PR head, which adds only screenshots and `MODULE.rows/FO-3st3b.md`. I also reviewed the local wiring that goes in after #2718 and #2727 merge: **a0401088e** (`routes.tsx`, `booking/area.tsx`, `types-page.tsx`) and **5ddd560b3** (`j_42.ts` W0). Branch `local-int-fo3st3b` at 5ddd560b3, minus #2718's and #2727's own changes.
**The bar:** concept `fo-3-booking/concept.md` r2 BR-20, §4, §5 "Timings", §6 J-T5, "Who sees what"; board `design/settings.html` §4-5; brief `lead-b-briefs/FO-3st3.md`; Lead B's ruling (reminders "24 hours and 1 hour before (fixed for now)"); STANDARDS, EXPERIENCE, QUALITY.

**Verdict: Block (Changes needed).** J-T5, the refusals and who-sees-what all hold on the real app and in the suite, and the server enforces every key. One Major: after a stale timing save, the section's Reload followed by Save type silently overwrites another person's saved change to the type (M1).

## Runs (the builder's copy :4574, `xr_studio_screens_fo3st3b`; never :4400)
- **Suite:** the builder reports `check_fo3st3_timings_browser.ts` 40/40. I did not re-run it, because it writes screenshots into this checkout and I may write only this file and the journey report. I read it end to end: each J-T5 step has a pass and a fail; it also covers keys, stale, keyboard, axe and 375/1024/1440.
- **My walks:** three headless Playwright scripts (in my scratchpad), signed in through the local sign-in as an Admin, the Sample Case Manager and a Billing and finance member. Widths 1440, 1024, 375, and 512 CSS px (1024 at 200 %). I checked the API after each step.
- **Graph (P-86):** G3 lists `GET/PUT booking-timings` and `PATCH booking-types/:id/timings` as "no test reaches". That is the tool's blind spot: it reads `App.tsx` routes and `api(` calls, not module routes or `staffApi`, and it reports 190 such routes across the front office. The suite reaches all three routes in a browser. The new page has no G4 entry. Every element serves J-T5, BR-20 or "Who sees what"; there is no scaffolding.
- **j_42:** not re-run by me (11-14 minutes). The builder's run at 06:19 left `J-42/screenshots/W0-timings-1440.png`. W0 now sets the type's timings through the screen, and its HELD line is gone. Only the 5-minute slot interval remains as labelled database setup. AG-4-4's Timings has no interval, so that is correct.

## Concept fit
Everything below holds; I walked each step myself:
- **BR-20 defaults** 4 h / 60 d / 0 / 10 / 4 h, each with a "Default: …" hint.
- **J-T5:**
  - firm self-service 6 h → "Uses firm default (6 hours)";
  - "Change for this type" 2 h → "2 hours (this type)", API own value 120;
  - "Reset to firm default" → 6 h, own value null.
- **§8 per-field keys:** a Case Manager sees text only, and their PUT and PATCH get 403. Billing and finance has no menu item, and the direct URL shows the refusal.
- **Reminders** read-only, per Lead B's ruling.
- **Two §5 lines are on screen word for word:** "Overridden on 1 type: <name>." and "A change applies to new bookings. Reminders already set keep their time."
- **§12 warnings** come from the server.
- **Editing a timing keeps the typed Definition:** a Description typed before a timing save survives, and Save type afterwards gets 200.

## Code
- **Sound:**
  - Only changed fields are sent, so §8 checks only those.
  - A double-click on Save timings sends 1 PUT.
  - A refused range saves nothing: the server's transaction (my walk: gap after 2,000 with notice 2 → neither saved).
  - A non-number is refused before sending, and focus goes to the field.
  - No `<form>` is nested inside the panel's form; Enter saves only that row.
  - Escape leaves the row and keeps the panel open (window capture listener, `type-timings.tsx:209-218`).
  - Focus returns to the row's button after a save or reset, and to the h1 after a firm save.
- **Tests fail when the rule goes (by reading):**
  - removing the `timingVersion` skip (`types-page.tsx:112`) fails "the description typed before the timing save is still there";
  - removing the `onSaved` version patch fails "Save type after a timing save is accepted";
  - removing the `may` gate fails the Case Manager's "no Change or Reset".
  - No test covers the M1 path.

## D1–D20 (1–5)
D1 4: J-T5, keys, reminders ruling met · D2 3: correct values and server refusals; lost update M1 · D3 4: house controls, one contract file, shared area menu · D4 4: units come from one table (`timings-contract.ts:20`) · D5 3: reload, double-click and stale words hold; Reload → Save type path M1 · D6 4: the server writes one audit line per change (FO-3a1e) · D7 5: no AI · D8 4: crumbs "Bookings › Timings" and a menu entry · D9 4: one form, one primary; m3 while editing a row · D10 3: §5 words, plus deviations m1, m2 · D11 4: "Timings saved. …", row status lines, busy states · D12 4: team tokens, calm grid, readable at 375 · D13 4: axe clean (suite and my CM page), keyboard path, 200 % with no sideways scroll · D14 4: settings form + per-row override, as on the board · D15 4: page ready in 358 ms; panel adds 2 reads (n1) · D16 4: a pass and a fail per J-T5 step; M1 untested · D17 simulated only · D18 4: refusals are the server's words · D19 4: j_42 W0 timings now go through the screen · D20 simulated only.

## BIC scorecard (staff settings screen; BIC-01–03, 05–10, 12, 15–17 N/A: no case facts, AI, filing or review here)
| Check | Score | Evidence |
|---|---|---|
| BIC-04 | Met | A malformed value is refused at the field with its fix; what was typed stays (`shots/w1-hours-range.png`) |
| BIC-11 | Partly | One primary on the page. While a type row is open, the panel shows two filled buttons, "Save" and "Save type" (`shots/edit-1024.png`; m3) |
| BIC-13 | Partly | Errors show on the field with the input kept; there is no summary at the top; the range words are in minutes under an hours field (m1, m4) |
| BIC-14 | N/A | No chip, icon-only button or number that needs a tooltip |
| BIC-18 | Met | Loading skeleton; "Could not load the timings." + Try again; read-only line; refusal; saving and saved states |
| BIC-19 | Met | One heading and one primary per panel; three type sizes; red only for errors (1440 and 1024 shots) |
| BIC-20 | Met | Keyboard-only firm save and row change, Enter and Escape; 512 px at 200 % and 375 px with no sideways scroll; h1 → h3 → h4 |

## Issues (Must = Blocker/Major; Should = fix or list with a follow-up row)
**M1 (Must). Lost update: the timings section's Reload, then a timing save, then Save type overwrites another person's change.** This breaks STANDARDS §2 "Optimistic concurrency" and the concept's "Someone else changed this type" rule.
- **Why it happens:** the section reads the type under its own key, and its Reload refetches only that key (`type-timings.tsx:200,249`). The next successful timing save then hands the panel the new version through `onSaved` (`types-page.tsx:200`). The panel's Definition draft is still the old one.
- **Seen on :4574 (`lost.mjs`):**
  1. Tab B renames the type → version 2.
  2. Tab A saves a timing → 409 with the stale words; A presses Reload.
  3. A saves the timing again → 200.
  4. A presses Save type → **200**. The name goes back to A's old one, and B's rename is lost with no message.
- **Fix:**
  - the section's Reload invalidates `["fo","booking-types"]`, as the panel's own Reload does (`types-page.tsx:152`);
  - `onSaved` patches the panel's version only when `o.version === version - 1`, and otherwise invalidates the panel's query;
  - add this path to the suite: Save type must be refused, or show B's name, and the server must keep B's name.

**m1 (Should). Range refusals arrive in minutes under fields typed in hours.** Example: "Shortest notice must be a whole number of minutes from 0 to 525,600." under "Shortest notice (hours)" (`shots/w1-hours-range.png`; the server's words at `timings.ts:28`, shown as-is at `timings-page.tsx:126-129` and `type-timings.tsx:232`). **Fix:** for hour fields, show the range in hours (0 to 8,760), or ask the runtime lane for words per unit.

**m2 (Should). Words that differ from §5, unlisted.**
- **Differs:** §5 has "Enter a whole number of 0 or more." The hour fields say "Enter a number of hours of 0 or more, in whole minutes (for example 1.5)." and accept fractions (`timings-contract.ts:57-63`). That is defensible, because the server keeps minutes, but it is not in the concept and there is no challenge note.
- **Added, not in §5:**
  - "Undo changes", "Nothing to save: no value changed."
  - "No booking type overrides these.", "You can view timings but not change them."
  - "Timings for this type", "Change", "<value> (this type)", "Default: <value>."
  - the save and reset status lines
  - "This type uses the firm's timings. Save it first to change them for this type."
- **Fix:** list them in the PR (or `challenge.md`) for Lead B, or use the §5 string.

**m3 (Should). Two filled buttons in the panel while a timing row is open** (BIC-11; `type-timings.tsx:272`, default variant beside "Save type"). **Fix:** `variant="outline"` on the row's Save.

**m4 (Should). No "There is a problem" summary on the Timings form** (BIC-13). This is the same pattern as part 3a's m3. Fix it with that one.

**m5 (Should, follow-up row; the server's, not this PR's).** Two tabs on Settings → Timings: B saves notice 6 h over A's 5 h, and B gets "Timings saved." (my walk W8). `PUT booking-timings` takes no version (FO-3a1e, `timings.ts:108-152`), so a firm value is last-write-wins, against STANDARDS §2. **Fix:** propose a version (or an if-match on the read) for the runtime lane, and add a qa/BUGS line.

**n1.** Opening a type now costs 3 reads: the panel's GET, the section's second GET of the same type, and the firm's timings (`type-timings.tsx:200-201`). The section could take the panel's answer (STANDARDS §2 "one request per screen view").

**n2.** "Overridden on <n> types" counts retired types (they show with a "Retired" pill in the list). `active` is parsed but never used (`timings-contract.ts:40`). Acceptable; say so in a comment if it is intended.

## Not checked
- A real screen reader.
- An intended user's unaided walk (D17, D20 stay with the founder).
- Re-running the builder's suite twice, and j_42 (see Runs).
- A rebuilt mutation run: the rule-removal checks are by reading.
- Below 768 px (and at 200 % zoom) the Bookings side menu is hidden. That is the frame's existing pattern, also noted in part 3a's review.

My walks left Sample rows on the copy: four "Review walk …" types (one retired, two with timing overrides). Firm notice and gap after are back to 4 h and 10 min; gap before 15 and self-service 6 h are the suite's.

**Verdict: Block** at b4b67150a (+ a0401088e, 5ddd560b3). Fix: **M1**. Blockers: none. Majors: M1. Minors: m1-m5, n1, n2.

---

# Re-review: diff `b4b67150a..4053db1f2` only (head 4053db1f2cc7834465b91e11090f524960f66af2)
Read: `git diff b4b67150a 4053db1f2 -- '*.ts' '*.tsx'` and the wiring `git diff 875c444e7 4e779778e -- '*types-page.tsx'`. The three new web files and the suite on `local-int-fo3st3b` are identical to 4053db1f2. I walked the fresh copy on :4574 (Owner), re-ran my `lost.mjs`, and checked the hours words and the row Save. I did not re-run the suite: the builder reports 45/45, and the breaker re-tested M1 (`break-report.md`).

**M1: fixed.**
- The section's Reload now invalidates `["fo","booking-types"]` (`type-timings.tsx`), so the panel refetches and its form takes the other tab's values.
- `onSaved(version, sent)` adopts the version only when `sent === t.version`, and otherwise invalidates the panel's query (`types-page.tsx:200`).
- **Re-walk:** tab B renames → A's timing save gets 409 → Reload: the Name field now shows B's name → the timing saves → Save type gets 200, and the server keeps **B's name**.
- **New suite check:** it fails if the Reload stays section-only, because the Name field would not show B's name. The `sent` guard is a second safety net and has no test of its own; that is acceptable.

**Other review findings:**
- **m1 fixed:** `inUnit()` gives the range in hours ("Self-service limit must be from 0 to 8,760 hours." under 9000; walked). Range words for fields typed in minutes or days pass through unchanged.
- **m3 fixed:** the row's Save is an outline button, so "Save type" is the only filled button in the panel (`shots/rr-edit-1024.png`).
- **n2 fixed:** "Overridden on" counts active types only.
- **Still open, all Should:**
  - **m2:** the added strings are still not listed in the PR or in a challenge note. Not blocking.
  - **m4** (error summary): the same as part 3a.
  - **m5:** asked of the tech lead on the PR as an API follow-up.
  - **n1:** the panel's extra reads.

**Breaker fixes:**
- `fromInput` takes an exact whole number of minutes only: at most 9 digits, plus at most 4 decimals for hours. `toInput` shows at most 4 decimals, and an own value that has not changed is not sent. All sound.
- One consequence, **n3 (note, outside the concept, not a finding):**
  - Sub-hour values that are not multiples of 3 minutes cannot be typed in an hours field. 10, 20 and 40 minutes are 0.1667 h and so on; "0.1667" is refused with the hours hint (walked).
  - An existing 10-minute value shows as "0.1667" and cannot be saved back once changed.
  - Concept §5 asks for whole hours, so this is beyond the bar. If minute-level notice is ever wanted, it needs a minutes unit.

Journey re-score: journey 8 now holds, so correct data and error recovery rise to 1 each. Plain words stays at ½: the range words are now in hours, but the "0.1667" refusal is puzzling and the m2 words are not in §5. New score **9.5/10**.

**Verdict: Approve** at 4053db1f2cc7834465b91e11090f524960f66af2 (wiring as in local-int-fo3st3b 4e779778e). Blockers: none. Majors: none open. Should: m2, m4, m5 (tech lead), n1.

---

# Re-review 2: diff `ec0c243b2..720e03a52` only (head 720e03a52ba8fa16fb6181df53074bbe80a62384)
Read: `git diff ec0c243b2 720e03a52 -- '*.ts' '*.tsx'`. ec0c243b2 is a merge of main only (#2718 and #2727 are now on main). 2f1512f09 adds the wiring, and 720e03a52 adds screenshots.
- **Wiring:** `routes.tsx`, `booking/area.tsx` and `types-page.tsx` at 720e03a52 are byte-identical to the approved local-int-fo3st3b 4e779778e (`git diff 4e779778e 720e03a52` is empty for these three files). That includes the M1 `onSaved(version, sent)` guard.
- **New web files:** `timings-contract.ts`, `timings-page.tsx` and `type-timings.tsx` are unchanged since 4053db1f2.
- **`j_42.ts`:** the W0 hunk is the one approved in 5ddd560b3: timings set by screens, the HELD line removed, and only the 5-minute slot interval left as labelled setup. The file's other differences from local-int come from main.
- **Suite (`check_fo3st3_timings_browser.ts`):** test code only.
  - `settle()` waits up to 2 s for running finite CSS transitions to end before axe and before each screenshot.
  - A new check fails if any transition is still running when axe starts. This is the same pattern as #2782.
  - It is sound: axe now reads the settled screen, and a run that does not settle fails visibly instead of being hidden.
- **Smoke test on the fresh copy :4574 (Owner):**
  - M1 holds: B renames → A's timing save gets 409 → Reload shows B's name → the timing saves → Save type gets 200, and the server keeps B's name.
  - The range words are in hours: "Self-service limit must be from 0 to 8,760 hours."
  - Settings → Timings loads.
- **Builder's results, not re-run by me:** timings suite 52/52, types suite 48/48, j_42 33/33 with no HELD line, web tsc clean, graph G1/G2/G4/G5 0.

No new findings. Still open, all Should, none blocking: m2 (added strings not listed), m4 (error summary, as in part 3a), m5 (firm PUT takes no version; asked of the tech lead on the PR), n1 (extra reads), n3 (note).

**Verdict: Approve** at 720e03a52ba8fa16fb6181df53074bbe80a62384. Blockers: none. Majors: none open. Journey score 9.5/10 (unchanged).
