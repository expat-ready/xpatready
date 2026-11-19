# Break report: FO-3st3 part 1 (Settings → Booking types)

Head 7f32e887b, branch `claude/screens-fo3st3`. I tested my own copy `brk_fo3st3` on :4593 with PLATFORM_IDENTITY=local, using the Sample firms plus one BILLING_FINANCE person added with SQL. I used Chromium for the browser checks. The copy is now stopped. Scope: the web files under `web/src/modules/front-office/booking/settings/`, the route and menu lines, and the test. Paths are under `prototype/studio/web/src/modules/front-office/booking/settings/`. Probes and screenshots are in `/tmp/claude-0/-home-user-xpatready/a802ee3b-7ff2-5430-9ffb-05d4bb469296/scratchpad/break-fo3st3/` (scripts b1-b4.mjs).

Totals: 0 Blocker, 1 Major, 9 Minor.

## Findings

**M1 (Major): a read-only user who opens `?type=new` gets a blank page.**
- Steps: sign in as the Case Manager and open `/front-office/booking-types?type=new`.
- Expected: the list, with no drawer (or the read-only words).
- Actual: the browser throws `TypeError: Cannot read properties of null (reading 'hostStaffIds')`. The whole page goes blank (body text is ""), with no frame, menu or way back.
- Cause: `type-panel.tsx:61` renders `<ReadOnly t={t!} …/>` while `t` is null, because `isNew` is true and `edit` is false. Any `:list`-only role is hit (Case Manager, Case Officer, Read-only). Billing and finance is not hit, because the list refusal returns first.
- Screenshot: cm-type-new.png.

**m1: one fast burst of clicks creates several types or copies.**
- Steps: in the new-type drawer, fire three `click()` calls on Save type in one task; do the same twice on Duplicate.
- Expected: one type, one copy.
- Actual: 3 "Sync save" types and 2 "Dup source (copy)".
- Cause: the only guard is React state (`busy`, `type-panel.tsx:31`), with no in-flight ref. A real Playwright `dblclick` created only one (held), so a person rarely hits this.

**m2: Delete and Retire stay clickable while a Delete is in flight.**
- Steps: slow the DELETE request by 1.5 s, confirm Delete, then click Delete again.
- Expected: the footer is busy.
- Actual: Delete was enabled, and the confirm opened and sent again.
- Cause: the Delete and Retire buttons carry no `busy` (`type-panel.tsx:51-52`). Here the drawer closed before the second answer arrived, so nothing visible broke. Save stays clickable during a delete too.

**m3: Close during a new type's save reopens the drawer.**
- Steps: New booking type, Save (POST slowed by 1.5 s), Escape at once.
- Expected: the drawer stays closed, or Escape waits.
- Actual: the drawer closes, then reopens on the new type when the POST answers.
- Cause: `onOpen(made.id)` runs regardless (`type-panel.tsx:39`).

**m4: unsaved edits are dropped without asking.**
- Steps: (a) type a new name, then Retire → confirm; (b) type, then Escape.
- Expected: the input is kept, or the person is asked. The Panel has `confirmClose` for exactly this.
- Actual: (a) after the refetch the field shows the server's name and the typed name is gone, because the draft resets on the new version (`type-panel.tsx:26`); (b) the drawer closes with no question.

**m5: the Delete confirm uses the drawer's stale read.**
- Steps: open the type in tab A; another tab renames it; in A press Delete → confirm.
- Expected: the current name and count, or a refusal.
- Actual: the confirm reads `Delete "Del race"? 0 future bookings stay booked.` and deletes the renamed type.
- Cause: the name and `futureBookings` come from the drawer's earlier read (`type-panel.tsx:87-91`), and DELETE sends no version (FO-3a). A booking made after the drawer opened is counted wrongly in the same way.

**m6: focus is lost after Delete, Retire, Keep and Escape in the confirm.**
- Steps, keyboard only:
  - Delete → Enter on confirm: focus goes to `BODY`.
  - Retire → confirm: the Retire button is swapped for Switch on, and focus goes to `BODY`.
  - In the confirm, Keep or Escape: focus goes to `BODY`, not back to Delete.
- Expected (WCAG 2.4.3): focus returns to New booking type or the next row, to Switch on, and to Delete.
- Cause: the drawer is unmounted by `onClose`, so `onCloseAutoFocus` never runs. The `Dialog` at `type-panel.tsx:87` gets no return target.

**m7: the width of a long name is not fixed; the 40-character cut is not enough.**
- Steps: names of 80 × "W" at 1440, and 80 × "Ω" at 375, 1024 and 720 (the 200 % zoom size).
- Expected: the title stays clear of Close (DW7).
- Actual: the "W" title ends at x=1652 while the drawer ends at 1440; Close is at 1392. The title runs under Close and off the drawer, and the drawer scrolls sideways (scrollWidth 771 against 559).
- Cause: the cut counts characters, not width (`type-panel.tsx:46`). The suite's check uses narrow "N"s.
- Screenshots: title-87.png, drawer-375.png, drawer-zoom200.png.

**m8: Preview error words for a bad zone, an empty zone or a far date.**
- Steps: zone "Mars/Olympus", zone emptied, or date 9999-12-31.
- Expected: words a staff member understands, for example that the time zone is not known. An empty zone could fall back to the firm's zone.
- Actual: all three show the server's developer text: "Give from and to as times with their offset, and tz as an IANA time zone."
- Also: the date field starts at today's UTC date (`toISOString`, `type-panel.tsx:136`), so in the evening in Toronto it already shows tomorrow.

**m9: Back from an open drawer leaves the page.**
- Steps: Profile → Booking types → open a type → browser Back.
- Expected: Back closes the drawer.
- Actual: Back goes to `/platform/profile`, because `?type=` is written with `replace: true` (`types-page.tsx:26`).
- Note: reload with `?type=<id>` or `?type=new` reopens the drawer correctly (held).

**Note (no severity):** the embed code's title is "Book a meeting with sample-firm" (the firm key, `type-panel.tsx:124`, `contract.ts:42`), not the firm's name. It is safe to copy (see below), but the wording is odd.

## What held
- **Reserved slug.** Editing the slug to `manage` shows "This web address is reserved." at the field, with `aria-invalid` set and no Notice; the database is unchanged. "Manage" in capitals gets the shape message. A name "Manage" becomes `manage-2`.
- **Slug clashes.** A copy's slug edited to its source's slug shows "This web address is already used." at the field, and nothing is saved. Fixing the slug clears the error and saves. An empty slug gets the shape message.
- **Duplicate slugs.** Two copies get `-copy` and `-copy-2`. Five parallel duplicates got five distinct slugs (all 201). "free  CONSULTATION" becomes `free-consultation-2`.
- **Wrong roles, from the console or the API.** The Case Manager and Case Officer get 403 on PATCH, POST, DELETE, switch-off and duplicate, and 200 on list, read and preview. Billing and finance gets 403 on everything. With no session the answer is 401.
- **Other firm or junk id.** The solo firm gets 404 "No such booking type." on the other firm's id. `?type=<another firm's id>`, junk, the nil UUID and `%3Cscript%3E` all show "Not available / No such booking type." without leaking anything. `?type=` (empty) opens no drawer.
- **Billing and finance in the address.** No menu entry; the direct link and `?type=<id>` or `?type=new` show the server's refusal with no drawer. The Case Manager and Owner see the menu entry.
- **Stale save.** A second save shows "Someone else changed this type. Reload to see their changes." and keeps the input. A retry gives the same answer, and the other tab's value stays. A save after another tab's delete shows "No such booking type.". Changing a host's set of hours keeps the unsaved draft (version unchanged).
- **Names.** Emoji, Arabic (RTL), Burmese, Korean, Chinese, Hindi, 80 × Ω, `<img onerror>`, `<script>` and `"><svg onload>` all render as text in the list, title, link and embed code. There were no injected nodes and no alert. The embed code is built only from the origin, the firm key and a slug the server keeps to `[a-z0-9-]`, so it is safe to copy. RLO, blank and 81-character names get the server's words at the field.
- **Preview.** Lower-case zone, Kiritimati and GMT+12 give the right days. 2099 gives "Beyond the booking window", 2020 gives "In the past", and a 6-digit year gives "Could not load the times.". An empty date disables Show times.
- **Keyboard and focus trap.** Tab cycles inside the drawer: 45 tabs and focus never left. The confirm traps Close, Keep and Delete, and Escape in the confirm closes only the confirm.
- **Axe.** No violations on the list, the drawer and the confirm at 375, nor on the Case Manager's read-only drawer.
- **Layout.** No page-level sideways scroll at 320, 375, 1024 or 720 (200 %). At 375 the table scrolls inside its box.
- **Budget.** 110 types: the API answered in 15 ms (65 kB), the list rendered in 414 ms and a drawer opened in 146 ms.
