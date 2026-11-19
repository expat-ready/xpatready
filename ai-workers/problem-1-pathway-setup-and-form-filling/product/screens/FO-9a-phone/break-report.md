# Break report: FO-9a phone part (R1.33): staff phone edit

Commit b6b6b3d484506b76a133408524956317b463597b (branch `claude/confident-mendel-v60owc`). Scope: only the brief's "Amendment (19 Nov 11:23 IST, Lead B)", meaning `PATCH /api/front-office/people/:personId` `{ phone }` and the lead page's Phone row edit. Run on an isolated copy `brk33` on :4435 (PLATFORM_IDENTITY=local), seeded with `seedSampleFirms` + `seedSampleFirmsFrontOffice`. Staff: user-R (firm A Owner), user-T (Case Manager), user-O (Case Officer), user-S (firm B Owner). Five manual leads with phone "12" or "+1 416 555 0199"; one fo_person in no lead was added by SQL. The copy is stopped and the scratch scripts are deleted. US$0, no model call.

Paths below are relative to `prototype/studio/`.

## Findings

### F1 (Major): a number libphonenumber calls possible, but longer than 15 digits, returns 500 instead of 422
* **Repro:**
  1. Sign in as user-R and take any person you may see (for example R's own lead's person).
  2. `PATCH /api/front-office/people/<personId>` `{"phone":"+49 23456789012345"}` (or `"+49 123456789012345"`).
* **Expected:** 422 with `fields.phone` = the brief's sentence and nothing saved, or 200 with a number the database accepts.
* **Actual:** 500 "Something went wrong on the server. Refresh to see the current state, then try again."
  * Nothing is saved (the transaction rolls back), and the log holds no number (`errorName: DriverAdapterError` only).
  * On the screen (Edit, type the number, Enter), the field shows that server sentence under it. It asks staff to refresh but does not say what is wrong with the number.
* **Cause:** `api/src/front-office/duplicates/phone.ts:11` accepts on `n.isPossible()`. For DE that allows 17 digits: libphonenumber-js reports `+4923456789012345` as possible and even valid. `api/src/front-office/people/edit.ts:47` passes it on, and `edit.ts:56` writes it with `phoneReadable: true`. The database then refuses it through `fo_person_phone_check` (`^\+[1-9][0-9]{1,14}$`, `prisma/migrations/20261114153000_fo1a_front_office_sales/migration.sql:700`).
* **Scope of the gap:** a scan of every libphonenumber-js region found 14 possible numbers longer than 15 digits (DE, ID, JP, KR, NG, UY). The builder's test (`tests/check_fo9a_phone_edit.ts`) tries only short numbers.

### F2 (Minor): a "possible" number too short for phone_e164 clears Fix number but stays out of duplicate matching
* **Repro:** `PATCH … {"phone":"+43 2345"}` (also `+49 2345`, `+98 2345`).
* **Actual:** 200 `{"phone":"+432345","fixNumber":false}`. In the database the row reads `phone=+432345`, `phone_readable=t` and `phone_e164=NULL`.
  * The trigger's `fo_sales_phone_e164` requires 7–15 digits (`migration.sql` of `20261117030000_fo9a_duplicate_match`, lines 17–20).
  * So the pill clears, but the number cannot match a duplicate.
* **Expected (brief):** a valid number "is stored in E.164 … and clears Fix number". Either both happen or the number is refused.

### F3 (Minor): what staff typed is replaced, and some typed digits are silently dropped
* **Repro:**
  1. `PATCH … {"phone":"+1 416 555 0100 ext 9999"}` gives 200 `+14165550100`: the extension is gone.
  2. `PATCH … {"phone":"+86 1234567890123456"}` gives 200 `+8667890123456`: libphonenumber removed "12345" as a CN prefix, so the stored number is not the one typed.
* **Expected:** the brief says "stored as E.164 beside what was typed".
* **Actual:** `edit.ts:56` overwrites `phone` with the E.164 value, so the typed text is lost.
  * The screen only says "Phone number saved." and does not show that the number changed.
  * Note: `fo_person_phone_check` forbids a non-E.164 `phone` when it is readable, so this cannot be kept "beside" without a column. This is recorded as fact; no new scope is asked.

### F4 (Minor): a fast double-click on Save sends two PATCHes, writes two audit lines and shows two toasts
* **Repro:**
  1. Open a lead page as user-R and press Edit.
  2. Type `+1 416 555 0177`, then double-click Save (Playwright `dblclick`).
* **Actual:** 2 PATCH requests, 2 `front_office.person.phone_changed` audit lines and 2 "Phone number saved." toasts. Pressing Enter twice, or a click then Enter, sends one.
* **Cause:** `busy` disables the button only after the mutation re-renders (`web/src/modules/front-office/sales/lead-page.tsx:43`, `onSubmit` at line 39 does not guard `save.isPending`).
* **Related:** saving the same number again also writes a "changed the phone number" audit line although nothing changed (`edit.ts:56-58`).

### F5 (Minor): two sessions editing the same person: the stale one silently overwrites
* **Repro:**
  1. Open the same lead in tabs A and B as user-R, and press Edit in B. It is prefilled with `+14165550133`.
  2. In A, save `+1 416 555 0144`.
  3. In B, save `+1 416 555 0155`. The result is 200 with no warning, and the database holds `+14165550155`.
* **Note:** there is no version and no 409 (STANDARDS §4 [M] optimistic concurrency). The brief's `{ phone }` only also refuses any extra key such as a version. Under a 20-way parallel PATCH race the row lock held: every request returned 200, no 500, and there were 20 audit lines.

### F6 (Minor): focus is lost when the edit closes, and Escape only works from inside the field
* **Repro:** as user-R on the lead page:
  1. Tab 7 times to reach "Fix number", press Enter, and focus goes to the field (correct).
  2. Press Escape, or press Cancel, or save successfully. In each case `document.activeElement` is `BODY`, not the Edit or Fix number button.
  3. Tab from Save and press Escape: the form stays open.
* **Cause:** `lead-page.tsx:29` focuses on open but nothing restores focus on close. The Escape handler is only on the input (`lead-page.tsx:42`).
* **Impact:** low. Chrome's next Tab still lands on Fix number.

### F7 (Minor): some field errors under the phone field are lower-case fragments
* **Repro:** in the edit field, type 41 digits and press Enter. The field shows "at most 40 characters." A right-to-left mark shows "one line, no control characters." The API returns `fields.phone` = the same fragments.
* **Cause:** the shared `text()` in `api/src/front-office/sales/common.ts:22-31` is used at `edit.ts:45`. The `<Input>` has no `maxLength` either.

## What held
* **Cross-firm:**
  * R → firm B's person: 404 "No such person in your firm.", and B's row is unchanged. S can edit S's own person.
  * A bad body on B's person gives 422 before any read, so it reveals nothing about whether the person exists.
* **Own versus all** (`platform.everyone_sees_all` = false for firm A):
  * R → T's lead person: 404. T → R's: 404. T → own: 200.
  * A person in no lead: 404 (with the setting off).
  * An Unassigned lead: 200 for R and for O (O holds `view.all`). With O's `view.all` removed: 404 for the Unassigned person and 200 for O's own, matching `GET leads/:id`.
  * A deactivated owner's lead counts as Unassigned: R gets 200, and the lead read is also 200. The deactivated T gets 401.
* **Roles:** CASE_OFFICER without `agent/prospect:edit` gets 403 MISSING_PERMISSION, checked before the body. No token gives 401.
* **Body:**
  * Extra keys (`email`, `__proto__`, `constructor`) give 422 "Only the phone number can be changed here."
  * An array, null, "", a missing body, or a number value gives 422. A bare JSON string gives 400. A 41-character value or bidi controls give 422.
  * Full-width digits and Arabic-Indic digits normalise to `+14165550100`. "12" gives 422 with the exact sentence and nothing saved.
* **Audit:** one line per save, entity `fo_person`, summary and detail holding ids only. No audit or module_event row contains a number, and the 500's log line holds no number.
* **Screen:**
  * Fix number and Edit open the field, focused and prefilled. The error is `role=alert` with `aria-invalid` and `aria-describedby`. Typing clears the error, and reopening clears a stale error.
  * At 1024 px and 200 % zoom (720 CSS px) there is no horizontal overflow and the sentence wraps (scratchpad screenshots `brk-1024.png`, `brk-zoom200.png`). No page errors.

Breaker: 0 Blocker, 1 Major, 6 Minor on b6b6b3d484506b76a133408524956317b463597b

## Re-check on 5cbdee05
Read only `git diff b6b6b3d4 5cbdee05`. A detached worktree at 5cbdee05 ran as copy brk33 on :4435; it is now stopped and removed, along with the scratch files.
* **F1, F2, F3 fixed:** `+49 23456789012345`, `+49 123456789012345`, `+43 2345`, `+86 1234567890123456` and `… ext 9` / `#5` / `;ext=5` all give 422 with the sentence. There were no 500s across 24 hostile bodies (numbers, arrays, objects, `true`, `"+"`, `"\u0000"`, a lone surrogate, RLO, 41 characters).
  * A sweep of all 245 regions' example mobiles found that the international, E.164 and 011-from-Canada formats of every one are accepted unchanged. Full-width digits (including `０１１ ４４ …`), Arabic-Indic digits, Persian digits, `(0)` and a trunk `0` after the country code (`+44 020 …`, `+91 098…`, `+234 0803…`) are accepted.
* **F4 fixed:** a double-click sends 1 PATCH and writes 1 audit line with 1 toast. Saving the same number again returns 200 with no audit line. Retrying after a 422 or a network failure still saves.
* **F6 fixed:** Escape (field or Save), Cancel and a save return focus to "Edit phone"; Escape is ignored while saving. **F7 fixed:** one sentence for every refusal; `maxLength=40` cuts a pasted 47-character value and the server refuses the cut text.
* **Held again:** firm B's person 404; no overflow at 1024 px or 200 %; no page errors. **F5** is with the tech lead, not re-counted.
* **R1 (Minor): numbers dialled with `00` are refused.**
  * Repro: `0044 20 7946 0000`, `00 44 20 7946 0000`, `0033 6 12 34 56 78`, `0091 98765 43210` and `00447911123456` all give 422 (API and screen).
  * The `00${cc}` head at `duplicates/phone.ts:27` can never match, because the first parse with region CA (whose prefix is 011) returns no number for `00…`. Yet the doc comment says the "international prefix (00, 011)" is accepted.
  * Not a regression (b6b6b3d4 refused these too), but staff in most countries outside North America type 00. The sentence does show the way: type +44.
* **R2 (Minor): a trunk prefix other than `0` after the country code is now refused, though b6b6b3d4 read it correctly.**
  * Repro: `+7 8 495 123 45 67`, `+375 8 029 123 45 67`, `+36 06 20 123 4567` and `+54 011 15-2345-6789` give 422. On b6b6b3d4 these gave `+74951234567`, `+375291234567` and `+36201234567`. Cause: `phone.ts:28` allows only one `0`. These are informal ways to write the number, and the sentence lets staff retype it.
* **R3 (Minor): opened from "Fix number", the field returns focus to "Edit phone", not "Fix number".** The opener is unmounted while the field is open, so `isConnected` is false (`lead-page.tsx:36`); the comment says "Edit or Fix number". Usable: same row.

Breaker: 0 Blocker, 0 Major, 3 Minor on 5cbdee053dc48e2d1c1788cfd7db1f300e4c3f90
