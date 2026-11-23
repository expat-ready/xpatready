# Break report: FO-3st3 part 3a, Settings → Booking types (PR #2718 at 6b2a083c2)

Breaker: an independent agent that did not build the screen. Isolated copy `break_fo3st3` on :4591 (`isolated.sh … start --ttl 60 PLATFORM_IDENTITY=local`, stopped afterwards), Sample firm `sample-firm`. People: two Admins, two Case Officer hosts (F, G), a Case Officer later suspended (S), Billing and finance, Read-only, and the Sample Case Manager (user-T). Real routes, Playwright Chromium, local sign-in as in `tests/check_fo3st3_types_browser.ts`. Live AI off, US$0. Scope: concept r2 BR-19, §4 "Settings → Booking types" (Definition · Hosts · Share · Preview), §5 strings, J-T1..J-T4. Timings and Advanced are part 3b, so they are not findings here. Files: `web/src/modules/front-office/booking/settings/types-page.tsx` (TP), `api/src/front-office/booking/settings/types.ts` (TS).

## Summary
0 Blocker · 4 Major · 7 Minor. The role gates, name and web-address rules, duplicates and the stale PATCH held. Saving the panel fails when the PATCH works and a later "Uses set" PUT does not. A suspended host cannot be seen or removed. One date crashes the whole page.

## Findings

**M1 (Major): if a "Uses set" PUT fails after the PATCH, nothing is shown and the next save is refused as stale.**
Steps: Admin opens a type, renames it, picks a non-default "Uses set" for host F. Another session deletes that set (F, `DELETE me/availability-sets/:id`, 200). Admin clicks Save type.
Expected: the type is saved and the set error is shown, or nothing is saved.
Actual: the PATCH is saved (DB name renamed, version 1 → 2). The PUT answers 400 with `fields.setId`. TP:125 puts that into `errors` but no field shows `setId`, and TP:126 sets no notice because `fields` is not empty. So the panel stays open with no message and Save type still enabled. The list behind still shows the old name, because nothing reloads it. Changing the set back and saving again gives "Someone else changed this type. Reload to see their changes.": the panel's own earlier PATCH made the version stale (`t.version` was never updated). The admin is told about a conflict they caused, and their own rename is already live. Evidence: TP:116-126. Run output: "after 1st save: panel open: 1, db name: … renamed, version 1 -> 2, panel mentions error: null"; then "after 2nd save: Someone else changed this type".

**M2 (Major): the same failure on a new type creates a second copy when the admin retries.**
Steps: New booking type "Brk pn", tick F, pick F's non-default set, delete that set in another session, Save type, then pick the default set and Save type again.
Expected: one type (STANDARDS §2 "[M] Idempotent creates").
Actual: the first POST creates `brk-pn-z5rk` and the PUT fails silently (as in M1). The panel still says "New booking type", so the second Save POSTs again: the DB has `brk-pn-z5rk` and `brk-pn-z5rk-2`, and the list shows 2 rows. Evidence: TP:116-117, where `t` is null after a create, so the retry is another POST.

**M3 (Major): a suspended host on a type cannot be seen or removed in the panel.**
Steps: type with hosts F and S. Suspend S (status SUSPENDED). Admin opens the panel.
Expected: the Hosts section shows S as a host (for example as suspended) and lets the admin take S off.
Actual: the list cell says "Brk Officer F, Brk Suspendme", but the panel shows checkboxes for active staff only (TP:33, TP:172). S does not appear, and the hidden id is sent back on every save. After the admin unticks F and saves, the DB hosts are `["S"]` and the list says "Brk Suspendme", "On booking page: Yes". The type now has no host who can take bookings, and nothing on the panel shows why. Its Preview says "This type has no host" (TS preview counts only active hosts). The same applies to a host whose staff row is gone ("A former colleague" in the list, not in the panel).

**M4 (Major): typing 9999-12-31 in Preview's Date field blanks the whole app.**
Steps: open the panel, click Preview as a booker, type 9999-12-31 into Date.
Expected: a plain refusal (or a capped date).
Actual: `pageerror: RangeError: Invalid time value`, and `document.body` innerText is empty, so the panel and the list are gone until reload. Cause: TP:211 runs `nextDay` seven times. `nextDay("9999-12-31")` gives "+010000-01" and the next call is `Date.parse(NaN)` → `toISOString` throws during render. TP:218 accepts any non-empty value. Evidence: run output "Brk base 9999-12-31: dialog=0 body start: (empty)"; screenshot taken during the run (scratch, not committed).

**m1 (Minor): 0001-01-01 in Preview shows server words a person cannot act on.** The notice reads "Give from and to as times with their offset, and tz as an IANA time zone." (TS preview, shown raw by TP:224).

**m2 (Minor): clearing "Web address" on an edit promises a new address that is never made.** The hint becomes `localhost:4591/book/sample-firm/<made from the name>` (TP:158). TP:115 then omits an empty slug and the server keeps the old one: after a rename to "Brk base new name" the slug is still `brk-base`. On a create the hint is true; on an edit it is not.

**m3 (Minor): two Admins can overwrite each other's "Uses set" choice without the stale-save refusal.** The PUT does not change the type's version: after A2's PUT the version stays 1 → 1. So A's panel, opened earlier, PATCHes with version 1 (200) and its PUT replaces A2's set (200). BR-19 says "a stale save is refused", but the panel's Save type only covers the Definition. Evidence: API run "version after A2's set change: 1 -> 1"; TP:118-121.

**m4 (Minor): one long unbroken name pushes every row's actions off screen at 375 px.** With an 80-character "NNNN…" or 80-emoji name, the table region is 1046 px wide inside 341 px. Every row shows only its Name, and Duplicate/Retire/Delete and "On booking page" need sideways scrolling inside the table. Cause: TP:74 uses `[overflow-wrap:break-word]`, which does not lower a table cell's minimum width (`anywhere` does). The panel overflows as well: its content is 1117 px inside 374 px, the title runs under the Close X, and the Web address hint runs past the edge. The builder's `list-375` shot only has short names.

**m5 (Minor): focus falls to `<body>` after Retire, after Delete and after closing Preview.** After a keyboard Retire or Delete is confirmed, `document.activeElement` is `<body>`: the dialog unmounts on TP:92, and the Retire button or the row then leaves. After Esc from Preview the panel stays open but focus is on `<body>`, not on "Preview as a booker". WCAG 2.4.3. (Esc from the panel returns focus to the row, and after a rename save focus stays on the renamed row: those held.)

**m6 (Minor): an action on a type deleted elsewhere leaves the old row in the list.** If another Admin deletes the type and you then click Duplicate or Delete on it, the page says "No such booking type.", but the row stays (TP:52 reloads only on success). Opening the row shows "Could not load this booking type." with Save type disabled. Retrying shows the same thing.

**m7 (Minor): below 768 px there is no menu entry for Booking types.** At 375 px the Bookings nav is `hidden md:block` (`booking/area.tsx`). Unlike My account's menu (`frame.tsx:57`), it has no small-screen row, so the new entry cannot be reached from the menu on a phone. Calendar was already like this before the PR.

Also seen, not counted (no rule asks for it): Esc or a click outside the panel discards a typed new type without asking (no `confirmClose`). On an edit, focus opens on the panel itself, not on its first field.

## What held
* Roles. Read-only and the Case Manager see the list, the menu entry, the values as text, Share and Preview, with no New, Duplicate, Retire, Delete or Save type and 0 inputs. Hosts show as "1 host" (no staff key). Billing and finance has no Bookings nav, gets the refusal on the page, and gets 403 on list and preview. Read-only, Case Manager, Case Officer and Billing get 403 on POST, PATCH, duplicate, switch-off, DELETE and PUT set. With no token: 401.
* Names. 80 characters and 80 emoji save; 81 of either → "Name must be 1 to 80 characters." Spaces only are refused; padding is trimmed. RTL-override characters and "---" → "Name cannot hold line breaks or invisible characters." Arabic saves (slug `type-2`). A family emoji (ZWJ sequence) saves. HTML shows as text, with no element injected. Duplicating the 80-emoji name gives 73 emoji + " (copy)".
* Web addresses. "manage" → reserved, on create and on edit. "Manage" and "MANAGE" → "Use lower-case letters…" at the field. A clash → 409 "already used" at the field. The name "Manage" gets `manage-3`. 81 characters are refused.
* Duplicates. A double-click on Duplicate makes 1 copy. Three Duplicates at once make `-copy`, `-copy-2`, `-copy-3`. Retire twice is a quiet no-op. A second Delete, and Duplicate, Retire or PUT on a deleted type → 404.
* Hosts and sets. Another person's set → 400 "Choose one of this host's sets." A set for someone who is not a host → 400. A plain stale PATCH → 409 with Reload.
* Preview. No host → "This type has no host". 2099 → "Beyond the booking window". 2020 → "In the past". Pacific/Kiritimati: Monday is "No host hours" and Tuesday starts at 04:00, which matches 09:00 Toronto. A retired type previews its times. Nothing is booked.
* The page itself never scrolls sideways at 375 px.
