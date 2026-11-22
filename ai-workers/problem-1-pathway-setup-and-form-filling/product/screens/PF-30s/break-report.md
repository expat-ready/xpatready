# PF-30s break report: the find box in the staff top bar

Breaker: a fresh agent that did not build PF-30s, 22 Nov 2026. PR #2921 at `bd0b4da2e`, in worktree `local/pf30s-review` (that commit plus a local merge of PF-30a #2884). Isolated copy `brk_pf30s` on :4572, PLATFORM_IDENTITY=local, seeded by `check_pf30s_find_box_browser.ts` (34/34 pass), plus my own Sample leads with hostile, long and non-English names, a lead with a phone number owned by the Case Manager, and 10 "Scrolly" leads. Chromium 1440, 1024, 768, 720, 700, 660, 640, 375 and 320 px, and 1024 and 1280 px windows at 200 % zoom. Scripts in the session scratchpad (`brk/a1.mjs` to `a14.mjs`), not committed.
Scope: concept r2 §2 to §6. The items on its Not built list (hidden counts, the Studio and Cases frames, client and case journeys, stage names, the 100-firm load) are not findings here. Some points overlap `review.md`; those are marked "= review #n".

**Verdict: Changes.** No Blocker: there are no leaks, no injected markup and nothing stored. There are 3 Majors and 6 Minors.

## Major
**M1. From 640 to 719 CSS px the box covers the staff name and the list runs off the left edge (= review #1).** Those widths include a 1280 px laptop at 200 % zoom.
Steps: sign in as user-O, open `/home` with the viewport at 640×400, zoom ×2, type "Lena".
Expected: the input sits beside the name, and the list stays inside the window.
Actual: the input runs from x 257 to 481 and the name starts at 435, so `elementFromPoint` at the name returns the input and the name reads "fficer (…". The list starts at x −21 (−29 for the Owner's longer name), so "Leads and prospects", "Lena…", "Lead L-00001" and "1 result" lose their first letter. From 720 px the overlap is gone (at 768: input 277 to 501, name 509).
Where: `find-box.tsx:99` (`min-w-0` wrapper), `:117` (`sm:w-56` fixed), `:124` (`sm:right-0 sm:w-[28rem]`). Screenshot: scratchpad `brk/shots/clip-user-o-640x2.png`, `w-640-home.png`.

**M2. Arrow keys mark a row that is out of view, so the keyboard cannot see Enter's target.**
Steps: sign in as user-T (owns 10 "Scrolly" leads), open `/front-office/leads` at 640×400 CSS (1280×800 at 200 %), type "Scrolly" (8 rows, "8 best matches."), then press ArrowDown 7 times.
Expected: the marked row scrolls into view inside the list (APG combobox; WCAG 2.4.7 and 2.4.11).
Actual: the 8th row has `aria-selected="true"`, top 418, while the list ends at 329. The list's `scrollTop` stays 0, so Enter opens "Scrolly PersonH", a row nobody can see. At 1440×900 the row happens to fit.
Where: `find-box.tsx:83` (`setActive` with no `scrollIntoView({block:"nearest"})` of the active option); the list's `max-h-[70vh]` is at `:124`.

**M3. Below 640 px, Sign out takes focus while it is hidden under the open find bar (WCAG 2.2 2.4.11, AA).**
Steps: at 375 px, on `/front-office/leads`, press the Find button, type "Ph", then press Tab twice.
Expected: focus never lands on a control that cannot be seen, or the bar closes when focus leaves it.
Actual: the first Tab goes to Close and the second to "Sign out". `elementFromPoint` at Sign out's centre is the find bar's Close button, so Sign out is fully covered. Enter there signs the person out without them seeing the control. Tab on into the page and the bar stays over the logo and Sign out.
Where: `find-box.tsx:104` (a fixed `z-40` bar over the header; `wide` is cleared only by Close or a third Escape, not by focus leaving, `:115`). Screenshot: `brk/shots/signout-obscured-375.png`.

## Minor
**m1. When terms are pending, the Sales frame shows the box and every search says "Search is not available right now. Try again."** BR-6 says terms pending means no box. Not checked by the reviewer.
Steps: publish a PRIVACY_NOTICE version (insert into `platform_terms_version`), sign in as user-O, open `/front-office/leads` or `/front-office/pipeline`, type "Lena".
Expected: no box (as on `/home`, where PlatformFrame hides it).
Actual: the box is there. The API answers 428, the error line shows and the live region says it, so "try again" never works until the terms are accepted elsewhere.
Where: `sales-frame.tsx:66` (no terms check; `platform/frame.tsx` uses `pending.checked && !pending.terms`).

**m2. "/" opens the box behind any open dialog or drawer (= review #2).** The guard looks for `[aria-modal='true'], dialog[open]`, but Radix `Dialog` and `Panel` render `role="dialog"` with no `aria-modal` (measured `null`; no element in `web/src` sets it).
Steps: at 375 px, open "Add a lead", focus the drawer's Close (X), press "/", then Escape.
Expected: nothing happens, and the "/" is not swallowed.
Actual: the key's `defaultPrevented` is true and the find bar opens behind the drawer. When the drawer closes, the header shows the find bar instead of the logo. At 1440 the "/" is swallowed and `open` is set. "/" typed inside drawer fields works ("a/b" kept).
Where: `find-words.ts:65`. Screenshot: `brk/shots/after-drawer-375.png`.

**m3. Below 640 px, Close and the third Escape leave focus on BODY (= review #4).**
Steps: at 375, press Find, type "Phoebe", Tab to Close, press Enter.
Actual: `document.activeElement` is BODY, the same as after Escape ×3.
Where: `find-box.tsx:88`, `:121`.

**m4. Enter is dropped during the pause while the earlier list still shows a marked row (= review #5).**
Steps: type "Zoe" and wait for the row, type " A", then press Enter within 1.5 s (find delayed by a route stub).
Actual: during the wait the row has `aria-selected="true"` and `aria-activedescendant` points to it, but Enter does nothing (the URL stays `/home`). A quick "type and Enter" never opens anything.
Where: `find-box.tsx:85` (`state.at === "done"` only) against `:76` (`mark` is set while searching).

**m5. The error line says "Try again" but gives no way to try again without editing the text.**
Steps: stub the find route to return 500, type "Garcia", remove the stub, then press Enter or ArrowDown.
Actual: 0 new requests. Only changing the text (even adding a space) asks again.
Where: `find-box.tsx:54-67` (the request runs only on `[text]`), `:85`.

**m6. A `contenteditable="plaintext-only"` area loses its "/" to the box (latent).** BR-1 says "editable area".
Steps: on `/home`, add `<div contenteditable="plaintext-only">`, click into it, type "/".
Actual: no "/" is typed and the box takes focus. The same happens for `contenteditable="TRUE"` (upper case). No such element exists in the app today.
Where: `find-words.ts:68` (better: `el.isContentEditable`).

## Out of scope (PF-30a's door, for its owner; not counted)
* A Cyrillic or Hangul name is never found by name. "Анна", "ИВАНОВА", "민준" and "김 민준" return `groups: []` from the API, while the same person's email finds them. The box shows the honest empty line.
* Lead numbers ("L-00003") are not found, even by their owner; only P-numbers are.

## What held
* **Leaks:** user-O (view.own) gets no hit for user-T's lead by name, email, phone ("+1 415 555 0199", "4155550199") or number, in both frames. user-T finds it (positive control). Firm B's Solo representative gets nothing from firm A ("Lena", "P-00001", emails, phone), through the box and through the API.
* **XSS and markup:** names `<img src=x onerror=alert(1)>` and `<b>Bold</b>` show as text. There is no `img` in the list, no dialog fired and no page error. An API url `//example.com/x` stays in the app (`/example.com/x`).
* **Late, failed and 401 answers:** a late answer after a newer text, after Escape ×2 and after navigation never shows. Navigation via pushState, Back and reload while a request is pending all leave the box empty and closed. A network abort shows the error line and keeps the text. A 401 removes the box and shows the sign-in card, with no error line, and sessionStorage is cleared.
* **Text:** 1 character, or "  a  ", sends no request. 101 characters gives "Type 2 to 100 characters to search." with no request. 100 emoji (200 UTF-16 units) is sent and answered. Accents highlight both ways ("zoe"→"Zoë", "ÅNGSTRÖM"→"Ångström", "lua"→"Lụa", "garcía"→"García"). A 128-character name wraps inside the list. Typing "/Jose" fast puts "Jose" in the box with one request.
* **Keyboard:** Tab closes the list and moves to Sign out; Shift+Tab reopens it; Escape ×3 closes, clears, then leaves. ArrowUp wraps. Synthetic IME Enter and "/" are ignored. A CDP IME composition commits correctly. Numpad "/" and German Shift+7 open the box; Ctrl+Alt+"/" does not, per BR-1.
* **Storage:** nothing typed reaches localStorage, sessionStorage (only `xr-staff-session`), the URL or `history.state`. The input has `autocomplete="off"`, no `name`, no form and `spellcheck="false"`.
* **States and layout:** "Other" for unknown kinds, partial with and without hits, "8 best matches.", count equal to the rows shown. axe (wcag2a/aa, 21aa, 22aa) on the header with the list open at 375 and 1440: no violations. No sideways scroll and the list stays inside the window at 320, 375, 768, 1024, 1440 and 1024 @ 200 %. The box is hidden on `/home` while terms are pending.
