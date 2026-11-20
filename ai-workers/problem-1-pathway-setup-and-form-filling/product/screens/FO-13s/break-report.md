# FO-13s part 1 break report: the Identity check panel (PR #2309)

Written 19 Nov 2026 by a breaker that did not build the screen. Scope: concept "What gets built" (§2-§5: the panel, the record form, the contract, the mounts on the lead and prospect pages). Tested: commit 70c36466e plus the uncommitted Part A `service.ts` 422 rule (#2305), on an isolated copy (`bk13s`, :4581, PLATFORM_IDENTITY=local; stopped and removed at the end). Chromium at /opt/pw-browsers/chromium, Playwright scripts plus direct API calls. **Note:** while the run was going on, HEAD in `/home/user/xb` moved to a92466ee9 ("review fixes": summary words, expiry format, skeleton, the 401 on Open copy, prospect "(no name)"). None of the findings below is touched by that commit. The line numbers are for a92466ee9.

## Blocker
None.

## Major
**MJ-1. A long note with no break widens the whole lead page to 3 133 px, at every width.**
* Did: recorded a valid OTHER check (the server accepts it) whose note is one unbroken 470-character token. Then opened the lead page at 375, 1024, 720 (1440 at 200 %) and 512 (1024 at 200 %).
* Expected: the note wraps inside the row, with no sideways scroll (concept §4 widths; the Document cell already uses `[overflow-wrap:anywhere]`).
* Actual: `document.scrollWidth` was 3 133 at 375 px, 3 653 at 1 024 px, and 3 133 at both 200 % sizes. The panel was 3 115 px wide. "Record a check", "Engage" and the page's own sections sit far off screen.
* Note: an 80-character URL with hyphens wraps (375 px holds), so it takes a token of about 40+ characters with no break.
* Where: `identity-panel.tsx:63`. The `methodDetail` span sits in a flex `<p>` with no `min-w-0` or overflow-wrap.
* Severity: Major. Very long text is one of the attacks named for this screen, and one stored row breaks the page for every viewer.

**MJ-2. A partly typed expiry date is dropped without a word, and the check is saved with no expiry.**
* Did: picked a Passport and filled CA and 9876. In the native date input I typed only the month and day ("03", "15") and pressed Save check.
* Expected: a refusal on Expiry date, or at least a warning, because the person typed a date.
* Actual: `input.value` is `""` (Chromium's badInput). The form has `noValidate` and only reads `value`, so the POST carries no expiry. The answer was 201, one new row, `documentExpiry: null`, "No expiry given".
* Why it matters: a check is insert-only (BR-1), so the wrong row cannot be fixed. BR-4's expired-document rule never runs.
* Where: `identity-panel.tsx:126` (`noValidate`) and `:153` (no `validity.badInput` check).
* Severity: Major. Typed compliance data is lost without a word, in a record nobody can correct.

## Minor
* **m1. After a lost answer, an edited retry ends with two checks, and the screen never says the first one landed.**
  * Did: let the first POST reach the server, then cut the answer (`route.fetch` then abort). The panel said "Could not reach the server… Save again to retry the same check."
  * Retrying unchanged gave one row (held).
  * Editing the note before the retry gave 409 "This request was already used with other details. Start a new Save." The list behind was not refreshed. The next Save stored a second, insert-only row.
  * Where: `identity-panel.tsx:108-112`.
* **m2. The discard question is wrong after a lost answer.** Closing the panel then asks "Discard this identity check? Nothing is saved." But the check was saved (server row count +1). Where: `:124`.
* **m3. Cancel discards typed data without asking.** Escape, the X and the overlay ask first (`confirmClose`). The footer Cancel calls `onOpenChange(false)` directly. Where: `:125`.
* **m4. A date the picker accepts gets a format message the person cannot act on.** Typing 12/31/2300 gives "The expiry is a real date as YYYY-MM-DD." The input has no `min`/`max`, the native picker accepts the date, and the person never typed a format. Where: `:153`.
* **m5. Read-only viewers see no reason for the missing Record button once checks exist.** When at least one check exists, BILLING_FINANCE and READ_ONLY see no "Record a check" and no line saying why. RECORD_REASON shows only in the empty state, while BR-8 says "one plain line says why". Where: `:182`, `:189`.
* **m6. The error summary has no links.** It shows the right words, and focus goes to the first invalid field (held). But BIC-13 and the challenge's M4 fix ask for a link that focuses each field. Where: `:129`.
* **m7. "Checked" times use the browser's clock zone.** They show in the browser's zone, not the firm's (America/Toronto), and do not name the zone. A UTC browser showed "3:31 p.m." for a check made at 10:31 Toronto time. Challenge m4 asked for the firm's zone. Where: `sales/time.ts:14-15` (`arrivedLabel`).
* **m8. The server's own 10 MB refusal never reaches the copy field.** An 11 MB copy sent straight to the API answers 413 "This file is too large for this upload." with no `fields.copy`, because `main.ts:189-201` rewrites every 413. BR-5's "413 shows on the copy field" therefore rests only on the client pre-check, which holds in the UI. Two `copy` parts give "Add at most 20 files at a time", which is wrong for this route (API, noted only).

## What held
* **Double Save:** a double-click on Save check, and Enter twice, gave one row each. The lock and the busy button work.
* **requestId:** the same id replayed gives 201 with one row. Eight and five concurrent POSTs with the same id (with and without a copy) gave one row each. The same id in upper case replays. The same id with another note gives 409 REQUEST_REUSED, and the screen then takes a new id.
* **Hostile copies:**
  * A .txt renamed .pdf gives 415, shown as "Copy: A PDF, JPEG or PNG." in the summary and under the field.
  * An 11 MB file is stopped in the browser ("At most 10 MB.", no request sent, focus on the file input).
  * A PDF/HTML polyglot is stored as application/pdf and served `attachment` with `nosniff` and `sandbox` CSP.
  * The PDF with planted instructions is stored as bytes only. Nothing reads or acts on it.
  * A link from O used by READ_ONLY gives 404. With no bearer it gives 401.
* **Notes:**
  * 500 Devanagari characters save, and so do 500 emoji (the input stops at 500 UTF-16 units). 501 is refused.
  * Each of these is refused under the Note field, with focus on it: "Passport AB123456", "12 34 56", Persian digits, "X-1-2-3-9", "E12345678" in Chinese text, and an RTL override.
  * Hindi names show in the BR-9 sentence.
* **Roles:**
  * BILLING_FINANCE: list 200, record 403, link 403; the UI has no Record button and shows the reason line on an empty list.
  * READ_ONLY: record 403, link 200; the UI has Open copy but no Record.
  * No token: 401.
* **Expiry:** yesterday gives 422, shown under Expiry date with focus there. Today saves. 2199-12-31 saves. 2200-01-01, 2027-02-30 and 1899-12-31 are refused.
* **Expired link:** a link opened after 382 s answers 410 "This download link has expired. Open the check again." Open copy asks for a fresh link on each click and downloads `identity-copy.pdf`.
* **Reload or Back mid-Save:** the request completes, the row exists once, and it is listed after the reload. No page errors from the screen.
* **Keyboard only:**
  * 8 Tabs to "Record a check"; the panel opens on Method.
  * The tab order follows the form; Space ticks a detail; Enter on Save check saves.
  * Focus returns to "Record a check" after a save. On an empty Save, focus goes to the Details fieldset.
  * Open copy is focusable.
* **Widths:** 375 / 1024 px and 200 % zoom with ordinary data: no sideways scroll, and the record panel fits with Save check visible.
* **No name:** a person with no name reads "No identity check is recorded for the signer." on both the lead and prospect pages, matching retainers/service.ts.

## Round 2 (20 Nov 2026): head 1efbf26e7, after origin/main (#2305 expired → 422, Messages panel, Phone edit row)
Isolated copy `brk_fo13s` on :4571 (PLATFORM_IDENTITY=local), stopped and removed at the end. Playwright (Chromium) and direct multipart calls. US$0. MJ-1 and MJ-2 re-checked: both fixed (no sideways scroll; a half-typed date gives "Enter the whole date…").

**Blocker:** none. **Major:** none.

**Minor**
* **m9. Errors arrive one at a time, so an expired date surfaces only after other fixes.** Did: POST an expired date plus empty details, then an expired date plus a text file named .pdf. Expected: the summary lists every problem (BIC-13 "There is a problem" list). Actual: 400 on `details` only, then 422 on expiry after that fix. The copy's 415 appears only after the date is fixed (3 Saves for 3 problems). Where: `service.ts:76-113` returns on the first refusal, and the 422 runs after parse (`:161`). This is FO-13i ordering; the concept says no API change, so note only.
* **m10. Earlier minors still open at this head:** m5 (Billing and finance sees no reason line once checks exist: `identity-panel.tsx:186,193`), m6 (summary items have no links: `:134`), m7 (Checked times use the browser's zone: `sales/time.ts:14-15`). In a browser set to Pacific/Marquesas the row read the browser's clock. m2 and m3 are fixed: Cancel asks, and the question now reads "Discard the details you typed?".
* Note (not a finding): with the same `requestId` reused after a success, an expired date gives 409 REQUEST_REUSED, not 422 (`service.ts:158` replays before the expiry rule). The screen reaches this only through round-1 m1.

**What held (round 2)**
* **Expired through the API:** firm-yesterday, 1900-01-01, `"  <yesterday>\t"` and `"<yesterday>\n"` (trimmed) all give 422 with `fields.documentExpiry` = "This document has expired. Check a current one." Today saves, and so does 2028-02-29.
* **Odd formats** get 400 "a real date as YYYY-MM-DD": 1899-12-31, `/`, compact, a time suffix, `2026-1-5`, full-width and Arabic-Indic digits, DMY, 2025-02-29, month 00, `-`/`+` years, and two `documentExpiry` parts.
* **Expiry without a type:** with no document, 400 on Document type "An expiry needs the document it belongs to." (not 422). With a country and last 4 but no type, 400 "named by its type, issuing country and last 4 together". In the UI each lands on Document type with focus. After the document is completed, the 422 follows.
* **Order:** wrong role is refused before the rule. Billing and finance and Read-only get 403, no token gets 401, an unknown person gets 404. An expired date with a good, bad or 10 MB+ copy gives 422 before any copy check.
* **Nothing stored or audited on a refusal:** over 30 refused POSTs left fo_identity_check, audit_event (`identity.checked`), module_event and the copy folder unchanged. api.log has only route/status lines, with no expiry or last 4.
* **Retry after refusal:** the same id expired twice gives 422 both times, then the same id with today gives 201, then a replay gives 201 with one row. Six concurrent same-id expired POSTs gave 6 × 422 and 0 rows. Six concurrent same-id today POSTs gave 6 × 201 and 1 row.
* **Firm time zone:** with the firm on Pacific/Pago_Pago (firm Nov 19, UTC Nov 20), Nov 19 saved and Nov 18 got 422. On Pacific/Kiritimati, its today saved and its yesterday got 422.
* **A real firm midnight** (Pacific/Marquesas, 09:30 UTC):
  * Recorded at 23:22 with expiry = that day: 201.
  * After midnight, replaying the same id returned the saved check (201, one row). A new id with the same date got 422. The new day saved.
  * A panel filled before midnight and saved after it showed the 422 under Expiry date, with 0 rows.
* **UI, lead and prospect pages:**
  * An expired Save shows the sentence in the summary and under Expiry date (`aria-describedby` points at it), focus on the date, and 0 rows and 0 audit lines.
  * Editing the date clears the error. Save after the fix sends the same requestId (one row).
  * Focus is back on "Record a check" within 2 s, at 1440, 1024, 375, 720 and 512 (200 % zoom) on both pages. No sideways scroll; Save check is in the viewport with the error showing.
  * A typed 01/01/1900 gets 422; a typed year 0001 gets the format message (round-1 m4).
* **Refusal keeps input:** the chosen PDF copy stays after a 422 and is stored with the fixed Save. Escape after a refusal asks; dismissing keeps the panel open; accepting closes it and returns focus.
* **Next to the new panels:** with the Phone row's Edit open and typed in, a full identity Save left the Phone value as typed and returned focus to Record. The Messages panel does not disturb the layout at any width. No page errors; only the expected 4xx console lines.
