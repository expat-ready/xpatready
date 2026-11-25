# FO-3st2 review: My account → Availability and Time off (reviewer, Opus 5.5, 18 Nov)

Reviewed commit **ea002db43** (`claude/screens-fo3st2`), diff `origin/claude/runtime-fo3a1b...ea002db43` only (the later commits a9a6664e7 and ff43b8403 add build notes and screenshots, no code). Live copy :4571 (`xr_studio_screens_fo3st2`, PLATFORM_IDENTITY=local), Chromium headless, US$0, live AI off. Builder's check re-run: **42/42**. My own probes covered keyboard-only, two tabs, more than 42 windows, a 24:00 end, the DST day, multi-day and part-day time off, a set in Asia/Kolkata, `?staff=` with a deactivated person, an unknown id and a wrong role, long and non-English names, double click, 1024 px at 200 %, and axe with the form open and with an error. Journey score: **8/10** (`journey-test-reviewer-2026-11-18.md`).

## Done when, line by line (brief FO-3st2)
| Line | Named cases | Proven? |
|---|---|---|
| J-A1 (rule 1) | `J-A1 pass` x3, `J-A1 fail` x2 | Yes. One "Normal hours" set marked Default, Mon-Fri 09:00-17:00, "Times in America/Toronto", no Delete set, server 409 "You cannot delete your default set.", no picker for a Case Officer |
| J-A2 (rules 1a, 1b) | `J-A2 fail`, `J-A2 pass` | Yes. Saving a second set leaves the slots alone; making it default gives Tue 18:00-19:30 only, read from the public slots route |
| J-A3 (rule 2) | `J-A3 fail` x2, `J-A3 pass` | Yes. The server's words show on the window, the database is unchanged, the field has aria-invalid |
| J-A4 (rule 8) | `J-A4 pass` x2, `J-A4 fail` x3 | Yes. The test uses the Monday a week ahead because 26 Oct is past; this is reasoned in the build notes. Midnight-to-midnight instants checked; the booking is unchanged; a Case Manager gets no picker and a 403 |
| J-A5 (rule 4) | `J-A5 fail`, `J-A5 pass` | Yes. "Mars/Olympus" is refused on the field; Asia/Kolkata is kept as typed |
| DW6 | `DW6 pass/fail`, keyboard, axe, widths | **Partly.** Empty states, skeletons, axe and the 375/1024/1440 widths are proven. The keyboard case covers only Add hours and Save hours. Time off by keyboard is not covered, and it drops focus (M1) |

Rule-removal spot checks (read through the code): removing the `may &&` gate (page:296), the picker gate (page:305), `nextDay` (page:241) or the `sent` index map (page:136) each makes a named case fail. Removing the zone from `wallIso` (computing instants in the browser's zone) passes every case, because the browser runs in the firm's zone (tests:23, 73). See m4. The live behaviour is correct: with a Kolkata default set, a whole day on 3 May 2027 is stored as 2027-05-02T18:30Z..2027-05-03T18:30Z from a Toronto browser, and the DST weekend 12-14 Mar 2027 is stored as 05:00Z..04:00Z.

## Findings
**Blocker:** none.

**M1 (Major). Keyboard focus is lost to `<body>` after six time-off and set actions** (EXPERIENCE §2.12 [M]; WCAG 2.4.3; the brief asks for focus to be kept). The probe pressed Enter on each of these: "Add time off", "Save time off", "Remove", "Cancel" in the time-off form, "Add a set" in the dialog, and "Delete" in the confirm. After each one, `document.activeElement` was BODY.
- `availability-page.tsx:248`: `addButton.current?.focus()` runs before the "Add time off" button is mounted again (page:261 renders it only when `!open`), so the ref is null.
- page:253 (Remove), page:261 (opening the form), page:270 (Cancel), page:132 (Delete set) and page:83 (Add a set) remove or hide the focused control and move focus nowhere.
- Failing scenario: Tab to "Add time off", Enter, type a date, Tab to "Save time off", Enter. Focus is now on the page body, and a screen-reader user hears nothing after "Time off saved."
- Fix: focus "Add time off" or the new row in an effect after the commit, the same way `was`/`busy` is handled at page:104-109. Focus the From field when the form opens. After Delete, focus the set heading. Add a keyboard case for time off to DW6.

**M2 (Major). Unsaved hours are thrown away by "Make default" or by choosing another set** (QUALITY D5 "no edit lost"; EXPERIENCE §4 states).
- `makeDefault` (page:125-128) sends only `isDefault`. The new version then resets the draft (page:110). Choosing another set in the list (page:220) resets it the same way. Neither gives a warning.
- Failing scenario (J-A2's natural order): Add a set "Weekend", Add hours: Saturday 09:00-17:00, then click "Make default" without "Save hours". Weekend becomes the default with **no hours**, Saturday shows "Unavailable", and the person's booking page offers no times. In the probe, Saturday rows went from 1 to 0. A typed Monday end of 12:00 is also lost when you switch to another set and back.
- Fix: while the draft differs from the set, send the draft with `isDefault: true` in the same PATCH (the server accepts both), or disable Make default with the hint "Save hours first", and keep the draft or ask before switching sets.

**m1 (Minor). A refused "Remove" of time off is silent.** page:254 calls `setProblem`, but the Notice is rendered only inside the open form (page:269). Scenario: remove the row in tab 1, then click Remove in tab 2. The server answers 404, the row stays and no message shows (probe "R").

**m2 (Minor). The server's `windows` answer is swallowed.** page:190 hides the Notice when any field key starts with `windows`, and `errorOf` (page:136) reads only `windows.<i>.*`. Scenario: add 7 windows on each day (49 in all) and click Save hours. The 400 "At most 42 windows in one set." shows nowhere; there is no "Saved." and no error (probe "B2").

**m3 (Minor). A window ending at 24:00 cannot be shown or entered.** `type="time"` (page:172-176) cannot hold 24:00, which the server accepts (availability.ts:41; rule 1c "any time"). A set saved with Sat 20:00-24:00 shows a blank end field, and typing 00:00 gives "End must be after start." The draft still keeps 24:00, so no data is lost.

**m4 (Minor). The time-off zone logic has no failing test.** Both browser contexts use `timezoneId: TZ`, the firm's zone (tests:73, 218). Fix: run J-A4's Admin context in another zone (for example Asia/Tokyo), or add a whole-day case under a Kolkata default.

**m5 (Minor). Concept §4c BIC-13 and BIC-14 are only partly met.**
- BIC-13: hour errors show on the field but in no summary; page:190 suppresses the Notice.
- BIC-14: the zone line's tooltip is a `title` on a `<span>` (page:148), so keyboard users cannot reach it. The "Default" chip has no tooltip (page:68).

**m6 (Minor). Strings outside concept §5, which lists "every string".**
- New strings: "No hours", "Not saved", "Saved.", "Time off saved.", "Time off removed.", "Could not load the hours", "Another colleague", "Time zone" and its hint, the Add-a-set description, the Viewing hint, the time-off zone line and the To hint.
- The no-hours text says "You offer…" even while an Admin is viewing a colleague.
- Empty From/To are stopped by the browser's native `required` message (page:267-268), not by the server's.
- Fix: add these strings to the concept through Lead B, or drop them.

**m7 (Minor). Graph and retrofit gaps.** graph.json has `testedBy: []` for all 14 availability routes, and the page is not linked to them: `base()` builds the paths and the test's `call()` uses template strings. The routes are reached, but the graph cannot see it. No retrofit mapping is recorded for the team's `availability-schedules-page.tsx` (AG-4-62 §3).

Context only, not this row's: opening `?staff=<deactivated id>` loads and allows editing that person's hours, labelled "Another colleague", because the server's `target()` ignores status. Duplicate set names such as "Normal hours" twice are also accepted (FO-3a).

## Scores (D17, D20 simulated only)
D1 4 (J-A1..A5 behave as the concept says; 24:00 gap) · D2 4 (server-side rules; 409 with Reload works across two tabs; a double click makes one set) · D3 4 (shared controls, time helpers and the PF-6 staff list reused) · D4 N/A · D5 **3** (M2, m1) · D6 4 (every change audited by FO-3a) · D7 N/A (no AI) · D8 4 (My account › Availability; menu entry) · D9 4 (one primary per panel; the M2 trap) · D10 4 (plain words; m6) · D11 **3** (m1, m2, no summary) · D12 4 (team tokens; matches settings.html) · D13 **3** (axe clean at every state; 375/1024 and 200 % with no sideways scroll; M1) · D14 4 · D15 5 (first view 274 ms; one request per list) · D16 4 (pass and fail per line; m4) · D17 simulated only · D18 4 (zone shown on the hours and on time off) · D19 not yet evidenced (J-41's walk) · D20 simulated only.

## BIC (concept §4c's choice)
| Id | Score | Evidence |
|---|---|---|
| BIC-01, 02, 03, 05-10, 12, 15-17 | N/A | Concept §4c: no facts, documents or applications |
| BIC-04 | Met | No optional inputs here; bad values are refused at the field (J-A3, J-A5) |
| BIC-11 | Met | One primary per panel: Save hours; Save time off inside its form (r-1440, 1024 screenshots) |
| BIC-13 | Partly | Errors on the field, but no summary (m5) |
| BIC-14 | Partly | Zone tooltip on a span; Default chip has none (m5) |
| BIC-18 | Partly | Empty states, skeletons and saved state are drawn; a failed Remove and a swallowed 400 show nothing (m1, m2) |
| BIC-19 | Met | One h1 and two h2; three type sizes; red only for errors (r-1440, r-1024) |
| BIC-20 | Partly | Keyboard path exists, but focus is lost (M1); 200 % at 1024 has no sideways scroll |

## Could not check
- A real screen reader; a headed browser walk (I used headless Playwright plus screenshots).
- An intended user's unaided walk (D17, D20 stay with the founder).
- CI on the PR, which is not opened yet (the build notes say it opens after #2103).
- `MODULE.md` "Card unchanged" is accepted as stated.

To fix before Approve: M1, M2. The Minors can be fixed now or listed with a follow-up row.

Round 1 result (ea002db43): Changes requested.

## Re-review (round 2) of 5da71ac08: diff only (P-277)
I reviewed `git diff ea002db43..5da71ac08 -- prototype/studio`, which touches `availability-page.tsx` (+68/-23) and the test (+43). The copy at :4571 serves this build. The suite re-ran **53/53**. I also ran my own probe again by keyboard, with dialogs both dismissed and accepted.

| Round 1 | Now | Evidence |
|---|---|---|
| **M1** focus lost | **Fixed** | Add time off → From (`autoFocus`). Save time off, Cancel and Remove → "Add time off" (the `backTo` effect, page:262-264). Add a set and Delete → the set's title (`focusNext`, page:117-119). Remove hours → that day's "Add hours". Each move has a named `break M3` case. |
| **M2** unsaved hours dropped | **Fixed** | Make default, choosing another set, Add a set and changing Viewing now ask "Discard your unsaved changes?". These are the house guard's words, and `controls.tsx:77` also uses `window.confirm`. A reload is covered by `beforeunload`. If dismissed, the edit stays and the default is unchanged (probe: Saturday row kept, default still Normal hours). Cases: `break M1 fail/pass`. |
| m1 refused Remove silent | **Fixed** | Shows "Not removed: No such time off. The list shows what is saved now." and the list refreshes; axe is clean (`break M2 fail`). |
| m2 `windows` error swallowed | **Fixed** | With 49 windows, "Not saved: At most 42 windows in one set." shows (page:212). |
| m4 zone logic untested | **Fixed** | J-A4's Admin browser runs in Asia/Dubai, so reading time off in the browser's zone would fail the midnight-to-midnight Toronto case. |
| m3, m5, m6, m7 | **Left, with reasons** (build notes, Round 1) | All Minor. The 24:00 limit belongs to the browser's time field. The BIC-13 summary, the BIC-14 tooltips and the extra strings stay open for Lead B. The graph gap is in the tool. |

Duplicate set names and editing a deactivated colleague by URL belong to FO-3a's API (`availability.ts` `target()`). They are raised as a question for the tech lead and Lead B and are not this row's touch list. I agree.

New, Minor only:
* **n1.** Unsaved hours are still dropped, with no prompt, by in-app navigation: the "Profile" menu link or the "My account" crumb. In the probe, the page went to `/account` with no question. `beforeunload` covers only a reload or a closed tab. Fix: guard the router's navigation (a blocker), or list it with m5.
* **n2.** After a refused Remove the row disappears on refresh, and focus falls to `<body>`. `back()` runs only on success (page:281). Fix: call `back()` in the `catch` as well.
* **n3.** `unsaved` and `focusNext` are module-level singletons (page:26, 31). This is safe while one editor is mounted, which is the case today, but fragile. A ref passed through `Hours` would be cleaner.

Journey score re-scored at this commit: **9.5/10**. Next step obvious, error recovery, and accessibility and screen sizes each rise to 1. Feedback and state stays at ½ because of n1 and the missing BIC-13 summary. No Blocker or Major is open.

Round 2 result (5da71ac08): Approve.

## Re-review (round 3) of 5ff1d61b7: base moved, diff only
- **This row's own code is unchanged.** `git diff 5da71ac08..5ff1d61b7` over `front-office/`, `account-sections.ts` and the test differs by one line only: main's `{ label: "Terms", … key: "agent/settings:list" }` (PF-5t part 2), added after "Availability" in `account-sections.ts`. The page, the contract, the routes line and the test are byte-identical. `git diff origin/claude/runtime-fo3a1b...5ff1d61b7 --stat` lists the same row files as before, plus records (the base is now 3e0bc800d).
- **What the merge brings that touches this screen:** `PlatformFrame` now waits for the terms check and draws the terms page over a hidden, still-mounted page (`frame.tsx`, `terms/terms-gate.tsx`). Accepting the terms invalidates the `["fo"]` and `["pf"]` queries, and this screen's keys (`["fo","availability",…]` and `["pf","staff","list"]`) fall under both.
- **Fresh copy :4581 at 5ff1d61b7 (started, then stopped):** the suite passed **53/53**. I also ran a live gate probe: a new Case Officer with a newer Sample privacy notice published got 428 from the hours API, and the terms page showed. After "I accept", the address stayed `/account/availability`, "Normal hours" Default with "Times in America/Toronto" and the time off loaded, and there was no "Could not load" and no page error. The menu reads Profile · Availability · Terms (Case Officer) and Profile · Availability · Team · Terms (Admin).
- Round-2 Minors n1-n3 and the left-open m3, m5, m6 and m7 are unchanged. Nothing new found.

Round 3 result (5ff1d61b7): Approve.

## Re-review (round 4) of 1995b5edf: base moved again, diff only
- **This row's code is unchanged.** `git diff 5ff1d61b7..1995b5edf` over `web/src` and the test is empty. The three-dot stat against the base branch (now at 0f634c6cc) lists the same row files plus records.
- **Nothing in the merge reaches this screen.** It changes no availability or slots route, no identity guard, no staff list and no terms gate. Its API-side changes are `platform/files/file-type.ts`, `ports/events.ts`, a cases `firm_id` migration and `tools/isolated.sh`.
- **Suite re-run by the reviewer** on a fresh copy at :4581 at 1995b5edf (started, then stopped): **53/53**. The builder's other suite results in build-notes are taken as recorded.
- Minors n1-n3, m3, m5, m6 and m7 are unchanged. Nothing new found.

Round 4 result (1995b5edf): Approve.

## Re-review (round 5) of c7481a33a: base moved again, one conflict, diff only
- **This row's code is unchanged.** `git diff 1995b5edf..c7481a33a` over `front-office/`, `account-sections.ts` and the test touches only `account-sections.ts`. That is the conflict resolution (44faeaa6d): it keeps this row's "Availability" line as written and adds main's PF-6 part 2b entries "Licence" (`/account/licence`, no key), "Licences" and "Security". The menu now reads Profile · Licence · Availability · Team · Licences · Security · Terms. The test's "menu lists Availability once" case still passes. The three-dot stat against the base branch (now at c1607c3a6) still lists only this row's one-line `account-sections.ts` add plus its own files.
- **`booking/settings/types.ts` does not touch this screen.** The only change is in `BookingTypesService.get`, which adds `hostSets` to the single booking-type read. The screen never calls that route; it calls only `availability.controller.ts`, and `availability.ts` and the controller are unchanged. The test's public slots route and staff booking read are unchanged too. `frame.tsx`, `session.ts` and the identity guard are unchanged.
- **Suite re-run by the reviewer** on a fresh copy at :4581 at c7481a33a (started, then stopped): **53/53**. The builder's pf1, pf6a, fo3w and pf6 staff results in build-notes are taken as recorded.
- The open Minors (n1-n3, m3, m5, m6, m7) are unchanged. Nothing new found.

Round 5 result (c7481a33a): Approve.

## Re-review (round 6) of 36dc2484c: base moved again, clean merge, diff only
- **This row's code is unchanged.** `git diff c7481a33a..36dc2484c` over `web/src` and the test is empty, and none of this row's files changed. The three-dot stat against the base branch (now at c72bca8cd) still lists only this row's files and its one-line `account-sections.ts` add.
- **Nothing in the merge reaches what this screen calls.** The availability routes and service, slots, the staff booking read, `frame.tsx`, `session.ts`, the terms gate and the identity guard are all unchanged. Two files the screen's path touches did change, neither in a way that matters here:
  - `firm-scope.ts` gains one `BYPASS_USES` entry, for a background job (`job:platform.entitlements.storage_daily`), with no request routes.
  - `platform.prisma` gains two back-relation slots for PF-15 entitlements. The staff and role-grant models the test writes are untouched.
- **Suite re-run by the reviewer** on a fresh copy at :4581 at 36dc2484c (started, then stopped): **53/53**. The builder's other suite results in build-notes are taken as recorded.
- The open Minors (n1-n3, m3, m5, m6, m7) are unchanged. Nothing new found.

Verdict: Approve

## Re-review (round 7, 19 Nov) of part 1's head 3cabaebe50408c0ddb809c3a26305f15e961d6c3 (#2243): the P-610 split, diff only, read-only on the tree
- **The row's own code is unchanged since the Approve on 36dc2484c.** `git diff 36dc2484c 3cabaebe5` is empty for `booking/availability/`, the suite, `front-office/routes.tsx` and `platform/account-sections.ts`. Against `claude/screens-fo3st2` the PR's 15 files differ only in the build notes' new "Resumed 19 Nov" section.
- **Nothing main changed underneath reaches the screen or its suite.** 36dc2484c → 3cabaebe5 changes 21 studio files: AUD-5 part 2's keep-period check, csw3 spike fixtures and one line on each module card. None is in the booking API, `session.ts`, `frame.tsx`, the terms gate, the local sign-in, the identity guard, the schema or the seed. The availability and time-off answers (`setView`, `offView`, the two lists) match `contract.ts`'s shapes; the route paths match.
- **The PR is what it says:** 15 files, 760 insertions and 1 deletion; every code file is on the brief's touch list.
- Minors: `qa/built/FO-3st2.md` said "42 checks" (the suite reports 53; corrected in part 2); the notes' "1,008 lines" is 1,008 insertions. The open Minors (n1-n3, m3, m5, m6, m7) are unchanged.
- **The split, for the tech lead:** sound, not a quality risk. The brief's split was conditional on the screen passing 800 lines, and it is 688; part 1 carries every Done-when line. The one cost: until part 2 merges, part 1's review trail is only on this branch and the PR thread.
- Not run by the reviewer: the five suites (the builder's runs on that head: FO-3st2 53/53, pf1 28/28, pf6a 52/52, fo3w 67/67, pf6 staff 90/90, all exit 0). No journey score this round (no app started); the last is 9.5/10.

Verdict: Approve (`Reviewer: Approve 3cabaebe50408c0ddb809c3a26305f15e961d6c3`, posted on #2243)

## Re-review (round 8, 19 Nov) of part 1's head bb11748157c62a845b03fe0e0f147104538c6cfd (#2243): the Licence form's focus after Save
- **Why:** merge batch #2265 failed `check_pf6_staff_browser.ts` "PF-6 DW8 keyboard (review MJ-2): after Save the focus stays on Save" 3 of 3 tries; this PR was the only one in it touching My account. The row owner asked for the cause to be fixed and the test left as it is.
- **The race is real.** A busy button is disabled (`components/ui/controls.tsx:36`). React 19 on `createRoot` schedules the `setBusy(false)` render after the `await` as its own task; the frame callback the form used could run first, focus a button still disabled (nothing happens) and leave the keyboard on the page for good. The builder's probe: main alone 2 of 12 saves lost at a 6× slowed CPU; main with this PR 6 of 12; with the fix 0 of 48 (×1, ×6, ×6, ×20).
- **The fix closes it** (`platform/account/licence-form.tsx`, +11/−3; PF-6's file, changed on the row owner's written instruction): a layout effect on `busy` puts focus on Save in the commit that enables the button, before paint. Every path of `send` holds: success (the form keeps its key and stays mounted), conflict, other error, "nothing to save" (the button is never disabled), and the Licences panel's success (the form unmounts; the panel's own return of focus takes over, as before). It takes focus only when focus has fallen to the page.
- **The test is unchanged** (`git diff origin/main...bb1174815 -- '*check_pf6_staff_browser.ts'` is empty). Reviewer's own run on that head: 90/90, exit 0.
- Minors: a click on blank page during a save brings focus back to Save (deliberate); the notes' probe table does not say which form of the fix each row used. The same frame-callback pattern is in `sales/web-form-page.tsx`, `booking-public/type-page.tsx` and `components/rule-facts.tsx` (none in My account; not touched).

Verdict: Approve (`Reviewer: Approve bb11748157c62a845b03fe0e0f147104538c6cfd`)

## Re-review (round 9, 19 Nov) of part 1's head 950206e702fb4f6124d0f53bc2671b66791a76b7: main merged in after a conflict, git only
- One conflict, the brief's foreseen one-line clash in `front-office/routes.tsx` (FO-4 part 2a's `/front-office/pipeline` and `/front-office/prospects/:id` beside `/account/availability`): both kept. The file is main's plus only this PR's import, route line and header words; no path duplicated or shadowed.
- Every other file of the PR unchanged since bb1174815; 16 files, 785 in, 4 out. Main's FO-2 part 3b moved the public booking's arrival port from the fake to the real one; the suite's one public booking passed on it (builder: FO-3st2 53/53, PF-6 staff 90/90, PF-6a frame 52/52, PF-1 module routes 28/28, type check no new errors).

Verdict: Approve (`Reviewer: Approve 950206e702fb4f6124d0f53bc2671b66791a76b7`); #2243 merged 19 Nov 20:29 IST.
