# PF-21rs B2: break report (branch claude/runtime-pf21rs-b2, head 782b79a16)

Scope: Legal holds `/system/privacy/holds` (`holds.ts`, `holds-page.tsx`, the reused `one-firm.tsx` picker) over `/api/system/register/holds` (list, place, release). Not findings: "Hold this person" from a request (cut, concept §4); no idempotent create for holds (challenge m3, Not built: the button goes busy instead); the API not checking that a person or case id belongs to the firm (challenge M4, a logged runtime gap); tables that scroll inside their box at 375/400 px (concept §4 States).
Setup: isolated copy `pf21rsk2` on :4442 (AI_LIVE=off, local identities; never :4400; stopped at the end, database removed). Platform Owner, Support, an Auditor added by SQL, a firm Representative's token (`sample-firm`). Playwright with Chromium 1243 from /opt/pw-browsers, plus axe-core. Firm names were made long by SQL: one of 150 characters with spaces, one of 80 characters with no break. Paths are under `prototype/studio/web/src/modules/system/privacy/` unless stated.

## Verdict
**Pass, with Minors.** I found no Blocker and no Major. Roles, server validation, release races, chips, keyboard, widths and hostile text all held. There are seven Minors, mostly wording and a stale release dialog.

## Blocker
None.

## Major
None.

## Minor
* **m1. Pressing "Place the hold" with no firm picked shows "This is not in the expected format." under Firm.** Repro: open "Hold a firm's data" and press "Place the hold" with nothing filled in. You get two alerts: "This is not in the expected format." and the reason's error. With a reason and no firm, only the first appears. Cause: `holds-page.tsx:98` sends `firmId: ""` when no firm is picked, and the API answers with zod's format words. The message does not say "pick a firm" (EXPERIENCE §2 item 10 [M]: errors say how to fix). A Person or Case id that is not a uuid gets the same words, while the hint only says "not checked here". Leaving both dates empty gives "A date (YYYY-MM-DD) or a time with its zone." to someone using a date picker (`api/.../holds/service.ts:71`). This is the same pattern as B1 m3.
* **m2. A release refused by 409 leaves a dead dialog and a stale list.** Repro: open Active in tabs A and B, then press Release on the same hold in both. A releases it with a reason. B types a reason and presses "Release the hold". B's dialog shows "This hold is already released; nothing was changed." (the API's words, correct), but it stays open with the red button still enabled, and pressing it fails again each time. The row only goes away after Cancel (`holds-page.tsx:131`; refresh happens only in `onOpenChange`, `:187`). Concept §4 States: "conflict (409 words on the row + reload)". Same as B1 m1. Screenshot: scratchpad `shots/tab-b-409.png` (not committed).
* **m3. Two holds with the same firm and scope can't be told apart when releasing.** Two separate matters can each hold a whole firm; the API makes two holds (I placed them concurrently, both 201). Both rows' buttons get the same accessible name, "Release the hold on Sample solo practice: All of the firm's data" (`:179`). The release dialog repeats only "<firm>: <covers>." (`:135`), with no reason and no placed date. A screen-reader user can't pick the right matter, and nobody can confirm it in the dialog. The release (and its audit line) then records against the wrong matter.
* **m4. A firm name with no breaks overflows the release dialog.** With the 80-character name, the dialog's description doesn't wrap. The dialog scrolls sideways by 255 px at 375, 230 px at 400 and 86 px at 1024. At 375 and 400 the close X sits off-screen. The description has no `[overflow-wrap:anywhere]` (`:135`); the table cell has it (`:175`). Screenshot: scratchpad `shots/release-375.png`. The page itself and "Hold a firm's data" don't scroll sideways at 375, 400 or 1024.
* **m5. The dialogs' main buttons are 36 px tall at 375 px.** "Place the hold" and "Release the hold" (`:104`, `:137`) measure 36 px. UXL-09 (P-795) asks for at least 44 px on primary buttons at 375 px. The page's own "Hold a firm's data" does it with `max-sm:min-h-11` (`:158`). Chips and row Release buttons are 32 px, which meets the 24 px minimum.
* **m6. The success line never clears.** "The hold is placed. …" stays under the heading while you change chips. It is still there after a later failed place, and after a release it changes to "The hold is released." (`:157`, `:186-187`). A screen reader hears it once. Sighted users see an old confirmation next to a newer error.
* **m7. The firm picker's error is not linked to its field.** With no firm picked, the search box has `aria-invalid="true"` but no `aria-describedby`. The error `<p role="alert">` is announced once, then can't be found from the field (`one-firm.tsx:29`, `:33`). The Reason and date fields do link theirs (`Field` notes). This is B1's component, reused here.
* **API, PF-21b, noted for runtime (not this screen's code).** The guard counts a reason's length in characters, but the service counts UTF-16 units (`api/.../holds/service.ts:65`). So "a" followed by 260 emoji (261 characters) is refused as too long, while the guard says "up to 500 characters". A reason made only of emoji is refused as "This needs a written reason". Both are rare.
* **Observation (not counted).** With 505 active holds, the list shows "Showing the newest 500." and the five oldest can't be seen or released on screen. The API takes `?firm=` but the page has no filter. That's honest, and well beyond any real volume.

## Attacks that held
* **Place, bad input (UI and API).** Each case gave a 422 with the error under its own field, nothing saved, typed text kept, and focus on the first invalid field:
  * no firm;
  * a firm and no reason;
  * a reason that is spaces only;
  * control characters only ("needs a written reason");
  * a control character or a bidi mark inside text ("Write the reason as ordinary text.");
  * 600 characters ("A reason is at most 500 characters.").
* **Firm that does not exist.** A random firm uuid gives 404 "No such firm."
* **Text that must be accepted.** An exactly 500-character unbroken reason, a 300-character CJK reason, Arabic text, a tab and `<img onerror>` HTML were all accepted. The HTML shows as plain text and the long text wraps in its cell.
* **Advanced scopes.** Each was stored and shown in words:
  * a Person id that is not a uuid, an empty Case id, an empty date range and a range with From after To are each refused under their own field ("The range ends on or after its start." under To);
  * Person, Case, every category and a valid range ("Records dated 1 Dec 2026 to 31 Dec 2026", UTC, matching the server's whole-day reading) were all stored.
  * Unticking Advanced sends `FIRM` even after a narrower kind was chosen (`:98`).
* **Double submits.** A double-click on "Place the hold" and Enter twice in Reason each made exactly one hold. The button goes busy at once.
* **Releasing twice.** Three concurrent API releases gave one 200 and two 409s, with one audit line. A later release gives 409. A malformed id gives 404 "Not found."; an unknown uuid gives 404 "No such legal hold."
* **Chips.** Active, Released and All each filter correctly, with `aria-pressed` and the right count. A placed hold switches the view to Active. Released rows show when, who and why. An unknown `?state=` gives 422.
* **Roles.**
  * Auditor and Support with no key: the API's 403 words on the page, with no table, no chips, no "Hold a firm's data" and no Legal holds link.
  * A firm token: 403 on list, place and release (B2 W5 checks place and release by API).
  * A firm token stored as the console session: "A firm's staff session cannot be used here", and no data. The firm user's own session key is never sent (`session.ts`).
  * No token: 401.
* **Keyboard only.** Nine Tabs reach "Hold a firm's data", and Enter opens it on the firm search. From there:
  * type a name, Tab to "Choose …" and Enter; focus moves to Change;
  * Space ticks Advanced, and the arrow keys change Covers;
  * Enter in Reason places the hold, and focus returns to "Hold a firm's data";
  * Escape after typing asks "Discard your unsaved changes?";
  * Change keeps the draft and puts focus back in the search;
  * Release by keyboard opens on its reason, and Enter releases.
* **Widths.**
  * 375, 400, 1024 and 512×450 (1024 px at 200 % zoom): no sideways page scroll. The place dialog fits and scrolls inside itself.
  * axe-core found 0 serious issues at 375 and 1024 on the page, the place dialog with errors showing, and the release dialog with an error showing.
  * Long firm names wrap in the table and the picker.
* **Load.** 508 holds: the list loads in about 0.5 s and the chips switch in under 0.2 s.
