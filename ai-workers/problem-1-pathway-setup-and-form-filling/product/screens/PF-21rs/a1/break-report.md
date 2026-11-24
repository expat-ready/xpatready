# PF-21rs A1 — break report (fresh breaker, 24 Nov)

**Verdict: Block** `fdb60f0106b7ca3b3593d2d556d5195d3517692b`: one open Major (B1, focus lost on every close of "Record a breach"). The rest holds or is Minor.

Scope: the Breaches list `/system/privacy/breaches`, "Record a breach" (firm picker, categories, optional texts, the guard's reason, one Idempotency-Key per opening), the menu's "Privacy" group (`a1/build-notes.md`; A2 and B parts are not findings). I ran an isolated copy `rsbrk` on :4438 (AI_LIVE=off, local identities; stopped after, US$0) with Playwright and Chromium (/opt/pw-browsers/chromium). I added 121 Sample firms (one long name, one Arabic, one Japanese, one markup name, one DELETED), 210+ breaches and an Auditor. Paths are under `prototype/studio/web/src/modules/system/` unless named.

## Major
**B1. Closing the dialog drops the keyboard focus to `<body>`: Escape, Cancel, the X and a successful "Record the breach" all do it.** WCAG 2.4.3 (level A).
* Did: keyboard only, focused "Record a breach", pressed Enter, then (a) Escape on the untouched dialog, (b) Cancel, (c) a full record ending with Enter in the reason box.
* Expected: focus goes back to "Record a breach" (or, after a record, to the new row or the "Recorded" line).
* Actual: `document.activeElement` is `BODY` in all three cases. The next Tab starts at the top of the page: home link, Sign out, Firms, Breaches, crumb, then the button, six presses to get back.
* Why: `privacy/record-breach.tsx:77` opens the shared `Dialog` with no Radix trigger. Its Content (`web/src/components/ui/controls.tsx:84`) has no `onCloseAutoFocus`, so Radix focuses a trigger that does not exist. The shared `Panel` fixed this same defect with `returnFocus` (controls.tsx:105-106, :122, "review MJ-2, WCAG 2.4.3"), so the repo already rates it Major. The builder's W6 check walks the keyboard into the dialog but never checks where the focus lands after it closes.

## Minor
* **m1. A lost answer, then the natural next step, gives false words or a permanent duplicate.**
  * Did: the POST reached the server (201 committed) and the browser got a connection reset.
  * The dialog says "Could not record the breach. Please try again." (`record-breach.tsx:71`), but the outcome is unknown.
  * Holds: pressing again with the same body gets 200 and the first breach; one row is stored.
  * Breaks if the person edits first: the answer is 422 "This Idempotency-Key was used for another request; nothing was recorded. Use a new key for a new breach." This is false (one was recorded), and the person cannot change the key.
  * Breaks if they press Cancel: the list is not read again, because it is invalidated only on success (`breaches-page.tsx:158`). The recorded breach is not shown (checked: 0 rows), so reopening the dialog records a second breach in a register that never deletes (BR-4).
  * Needs a lost response after commit, which is why it is Minor and not Major.
* **m2. The firm picker cuts to 8 matches without saying so.** "Breaker" matched 121 firms (the API sent 50) and showed 8 "Add" buttons with an empty status line; "Breaker firm 1" showed 8 of 32 (`record-breach.tsx:45` `left.slice(0, 8)`). Typing more finds the firm, but nothing tells the person that more exist ("Showing 8 of 50: type more of the name").
* **m3. A breach naming many firms makes one row 837 px tall at 1440 px.** I named 124 firms through the API (the limit is 200). `breaches-page.tsx:140` lists every name, so one row fills about a screen. "First names, and n more" would keep the list scannable. The cell wraps, with no sideways scroll.
* **m4. An empty "Discovered at" hides the other refusals.** All fields blank with the time cleared shows only "Give the day and time it was discovered."; the description and reason refusals appear only on the second press (`record-breach.tsx:68` replaces the error set before the call). That goes against the guard's own rule that one answer names every field (R1.10 A4).
* **m5. Typed work is dropped without the dialog's guard.**
  * Browser Back mid-dialog (Firms → Breaches → dialog with text → Back) closes it with no "Discard your unsaved changes?". The guard covers only Escape, the X and the overlay (controls.tsx:80).
  * When the session ends mid-dialog (I set `sessions_ended_at`, then pressed Record), the 401 correctly shows the card with the server's words and stores nothing. After signing in again the dialog is closed and the description is gone.
* **m6 (PF-21c's schema, not A1's code, shown by A1's dialog).** A 301-character reason made of a letter and 300 emoji is refused: "This is too long: at most 500 characters." `OpenBody`'s `reason: z.string().max(500)` counts UTF-16 units (`api/src/platform/register/breaches/service.ts:83`), while the guard counts characters. A runtime item, not an A1 fix.

## What held
* **Roles (API, curl).**
  * Platform Owner: list 200, POST 201.
  * Support (no key): list 403 and POST 403 with the API's words.
  * Auditor: list 200, POST 403, including a POST from its own browser.
  * Firm Owner's token: 403 FIRM_SESSION_REFUSED on the list, the POST and `firms?q=`. No token: 401.
* **Roles (browser).**
  * Auditor: menu "Firms / Privacy / Breaches", no "Record a breach", the line "Read only: you hold system/breach:read."
  * Support: the API's 403 words, no table, no Retry, no Breaches link in the side menu or the 400 px row.
  * A firm token placed in the console's storage: "Could not check who is signed in…" and no register data.
  * Platform Owner's role revoked mid-dialog: the 403 words above the buttons, nothing stored.
* **Double submit and retry.** A triple `click()` stored 1. A retry after a lost answer with the same body stored 1 and closed the dialog with "Recorded…". Each opening has a fresh key and a blank form. The button is `aria-busy` and disabled while the call runs.
* **Refusals land on their field, and focus moves to the first refused field.** Each case was refused and nothing was stored:
  * blank fields, whitespace only, zero-width only;
  * U+202E inside the text ("Write it as ordinary text.");
  * an invisible-only or punctuation-only reason;
  * a reason of 501 characters, a description of 4001;
  * a future time (2030), the year 1999, an empty or half-typed time;
  * a root cause of zero-width only.
  * A root cause of spaces only is left out of the body, as built.
* **Text that stores.**
  * Arabic, Japanese, emoji and markup stored and showed as text. `<img onerror>` in a description and in a firm name rendered no element.
  * 4000 characters without spaces wrap with no sideways scroll.
  * Kolkata time 09:30 local was stored as 04:00 UTC and shown as "24 Nov 2026, 04:00".
* **Picker.** Arabic and Japanese names were found with 2 characters; "%" asked for 2 letters; "%%" gave "No firm matches."; Enter in the search box does not submit; focus returns to the search box after "Add". About 35 ms per search with the 2 seeded firms, about 290 ms with 121 matches (that is #3489's firms read at scale, the team's per §9).
* **Budgets.** With 210 breaches, first view took 401 ms with 2 calls (`/me` and the list), not one per row. With 124 firms on one breach, a reload took 332 ms.
* **Widths and zoom.** At 1024, 400, 1440 at 200 % and 1024 at 200 %: no sideways page scroll, the dialog fits with no sideways scroll, the submit button can be reached, and axe found 0 serious or critical issues on the page and with the dialog open.
* **Keyboard and navigation.**
  * The dialog traps focus (40 Tabs, never outside). The first focus is "Discovered at", and the order is the visual one.
  * The Escape guard asks once the form has been touched.
  * Reload mid-dialog stores nothing. Back and Forward return to a clean list.
