# FO-3w part 2: break report (booker's manage page, PR #1982 head 3285d306c)

Breaker: a fresh agent that did not build the screen. Scope: concept r2 BR-8..BR-10, §4 "Manage", §5 manage copy (the reason box from FO-3pa included). The API (`public.controller.ts`, `service.ts`) is on main and out of scope: API faults are notes only.
Set-up: isolated copy `brk_fo3wm` on :4551 and a held server on :4851 with a settable clock on the copy's database, copied from `tests/check_fo3w_manage_browser.ts`. Firm `maple` (Sample, phone +1 416 555 0100). Client F is open 24 h, 7 days (Toronto), so lists are long. Extra Sample types: `no-cancel`, an 80-character name with no spaces, an Arabic name. Second firm: a 200-character name. Browser: Chromium, zone Asia/Dubai. Scripts and screenshots: `/tmp/claude-0/-home-user-xpatready/633679fc-4b1c-5efd-9b5d-5a756d0cc745/scratchpad/` (`brk.mts`, `attacks*.mts`, `shots/`; called S/ below). Copy stopped at the end. Live AI off, US$0.

**Result: 0 Blockers, 3 Majors, 8 Minors, 4 notes.**

## Majors
**M1. A cancel reason with a tab, an RLM/LRM mark or a control character cannot be sent, and the page says only "Please check the highlighted details." with nothing highlighted.**
- Cause: the API refuses `\t`, U+0000-001F, U+200E/F, U+202A-E, U+2066-9 and others (`service.ts:155-156`, 400 `booking-refused`). The page closes the dialog (`manage-page.tsx:175`) and shows the server's `detail` on the card (`:50`).
- Steps: open a live link → Cancel → paste `Reason<TAB>with a tab`, or Arabic `سبب الإلغاء` + U+200F + `انتقال` (an RLM is common in RTL text copied from chat apps), or `x\u0007y` → Cancel booking.
- Actual: the dialog closes and the card reads "Please check the highlighted details." The booking stays SCHEDULED. Reopening Cancel shows the same reason (state kept, `:165`), so every retry fails the same way. Evidence: S/shots/reason-tab.png; run output `reason:tab`, `reason:rlm`, `reason:rlo`, `reason:nul-ish`.
- Expected: the cancel goes through, or the box says what to change, as the booking form's field errors do.
- Impact: the booker cannot cancel online and nothing tells them the reason is the cause.

**M2. If the answer to Move or Cancel is lost, the page says "Please try again." although the change was made. The retry then says "This link is no longer valid…".**
- Cause: a failed `fetch` becomes status 0 (`contract.ts:44`), shown as "We could not make this change. Please try again." (`manage-page.tsx:50, 133, 175`). The server has already rotated or voided the token, so the next try gets 404 and the whole page becomes `BadLink` (`:85`).
- Steps: Playwright `route.fetch()` then `abort("connectionreset")` on `/reschedule`. The DB shows the row RESCHEDULED, sequence 1. The page still offers the old time and says "Please try again" (S/shots/lost-move-1.png). Pick another time → "This link is no longer valid. Please use the link in your latest email, or reply to it." (S/shots/lost-move-2.png). For `/cancel` the same happens: the row is CANCELLED, the page says "try again", and the retry gives the bad-link text.
- Impact: the booker never learns on the page that they were moved (or to which time) or cancelled. They are told the link is dead instead. This is part 1's M3 again, on the manage page. On a status 0, reading the booking again with the same token would tell the two cases apart (404 = it went through).

**M3. On "Choose a new time", the time that has keyboard focus can be fully hidden behind the sticky "Move to this time / Back" bar (WCAG 2.2 2.4.11, the EXPERIENCE bar).**
- Cause: `manage-page.tsx:155` (`sticky bottom-0`), with no `scroll-padding-bottom` or scroll margin on the times.
- Steps: 1024×768 at 200% (512×384 CSS px) → Reschedule → Tab through the times. 17 of the first 40 focused times end up 100% under the bar. At 360×740, 8 do. Example: "Wednesday 2 December, 00:00" at y 315-359, with the bar from y 315. Evidence: S/shots/zoom200-focus-hidden.png (only the left edge of the ring shows); run output `obscure:*`.
- Impact: a keyboard user at zoom cannot see which time Space would pick.

## Minors
- **m1. Focus is lost to `<body>` in four places.** `:79` only moves focus for `done` or the move step.
  - "Back" from the move step: the Back button unmounts.
  - "This time was just booked.": `:133` clears the pick, so the focused Move button becomes disabled.
  - The limit refusal on Move or Cancel: the buttons vanish.
  - While a cancel is sending: the focused submit button becomes disabled inside the open modal.
  - Run output: `kbd:after-back`, `kbd:after-taken`, `kbd:busy-focus`, `limit:move-after`, `limit:cancel-after`.
- **m2. The times are a `radiogroup` where every radio is its own Tab stop and the arrow keys do nothing** (`:143-149`). The 24 h Sample host gives 624 stops. A real Mon-Fri 09-17 host gives about 160 over the two weeks. ArrowRight left the focus where it was (`kbd:move-tabs`).
- **m3. The 429 sentence is wrong for this door.** The page says "Please try again in a minute." (`:49`, `TRY_LATER`). The API limits a token's calls to 30 per IP per 10 minutes (`service.ts:63`), and its own detail says "Please wait a few minutes and try again." (`service.ts:91`). Every view, list of times, move and cancel counts toward the 30.
- **m4. When loading the times fails, the page says "We could not make this change. Please try again."** No change was attempted, and the step gives no retry and no times (`:123` → `:50`). Only Back → Reschedule loads them again (`net:abort-slots`, `net:429-slots`).
- **m5. Some bad links do not get BR-10's one text.**
  - A 40,000-character fragment gives "This page could not be loaded. Please try again." (the server refuses the long path; only a 404 maps to `BadLink`, `:59-60`). The other cases tested (`%`, `%E0%A4%A`, spaces, `..`, `%2F`, 5,000 characters, Arabic, `?x=1`, `%00`) give the right text.
  - While loading, on a 429 and on a network failure, the tab title is "Book a meeting" (`frame.tsx:25, 29`) on a page about an existing booking (`net:429-load`, `net:abort-load`).
- **m6. A pasted reason longer than 500 characters is cut silently** (`:188` `maxLength`, no counter or hint). 600 characters pasted → 500 stored, and the booker is not told (`reason:600-chars`).
- **m7. The "not allowed" sentence contradicts the button next to it.** On a type with Cancel off, the card says "This booking cannot be changed online. Please reply to your confirmation email." directly above a working "Reschedule" button (`:83, :98`; S/shots/no-cancel.png). The suite asserts this (J-P7 no-cancel), but the copy reads as "no change is possible".
- **m8. After a move into the self-service window, the page still shows Reschedule and Cancel.** A reload of the same token shows the limit sentence and no buttons.
  - Cause: `done === "moved"` skips the limit (`:81-82`). The move's answer carries `startsAt` and `selfServiceLimitHours`, so the page could check the limit itself.
  - Steps: give the type a notice of 30 minutes (limit 4 h), clock 08:00 Toronto → move to the first time offered (09:00 Toronto). The page shows "Booking updated" with both buttons; after a reload it shows "It is less than 4 hours…" (S/shots/move-into-limit.png).
  - BR-8 covers clicking the buttons (the next action shows the limit text), but the two views of the same booking disagree.

## Notes (not findings for this PR)
- n1. The `:firmKey` in the address is never read. `/book/longfirm/manage#<maple token>` and `/book/nosuchfirm/manage#…` both show Maple's booking under Maple's name. The token is the key, so nothing is exposed.
- n2 (API). `GET /api/public/bookings/:token` answers with no `Cache-Control: no-store`. The app's HTML has no `Referrer-Policy` (harmless here: a fragment is never sent in a Referer).
- n3 (API). When a type's notice is shorter than its self-service limit, the move list offers times inside the limit (the root of m8). A booker who moves there can no longer change the booking online.
- n4. Chromium's own "Failed to load resource … 409/500" console lines carry the API URL (with the token path) as their source in DevTools. The app itself writes no token to the console.

## What held
- **History and reload.** The move uses `replaceState`: `history.length` is unchanged and the address holds the new token.
  - Reload after a move shows the moved booking with both buttons. Reload after a second move works too.
  - Back goes to the page before. Forward returns with the new token.
  - Reload after a cancel shows BR-10's text, as specified (the dead token stays in the fragment).
- **Two tabs.** Different times moved at once: one wins (one row RESCHEDULED, sequence 1) and the other gets the bad-link text. The same time at once gives the same result. When tab 1 has moved and tab 2 then cancels with the old token, tab 2 gets the bad-link text and nothing changes.
- **Repeated and interrupted actions.**
  - A double click on "Cancel booking" sends 1 POST. Enter pressed 5 times on Move sends 1 POST.
  - Back pressed during an in-flight move: the move completes and the page honestly shows "Booking updated".
- **The limit passing while the page is open.** Move, Reschedule and Cancel each then show "It is less than 4 hours before your meeting. Please reply to this email or call us on +1 416 555 0100." with no buttons, and the booking is unchanged.
- **The reason box.**
  - Line breaks are stored as spaces.
  - 260 emoji are cut to 250; with an odd count, no surrogate is split and the cancel goes through.
  - `👨‍👩‍👧 🇨🇦` and a lone ZWJ are stored. Spaces only are stored as no reason.
  - 498 characters plus two line breaks are taken. The reason is never shown back.
- **Pasted links.**
  - A different link pasted mid-move remounts on that booking.
  - Pasting the same (moved) token does nothing.
  - Back after a pasted link returns to the moved token.
  - A fragment with spaces around the token (` %20token%20`) is trimmed and works.
- **Keyboard.**
  - Tab order on the booking: Reschedule → Cancel.
  - Reschedule puts the focus on "Choose a new time". A move puts it on "Your booking". A cancel puts it on "Your booking is cancelled…".
  - The dialog opens with the focus in the reason box. Escape closes it and returns the focus to Cancel.
  - While a cancel is sending, Escape and a click on the overlay keep the dialog open, and Keep booking is disabled.
  - After a 429 or a 500 on cancel, the focus returns to Cancel and the reason is kept.
  - No Radix leftovers (`pointer-events`, `aria-hidden`) after a cancel.
- **Layout.** At 360 px and at 1024 px with 200% zoom, there is no sideways scroll on the view, the move step or the dialog (with a 500-character reason). The same holds with the 80-character type name, the 200-character firm name and the Arabic type name (isolated in `<bdi>`). Every target is at least 44 × 44 px.
- **The token.**
  - It never appears in a query string (0 of all API calls).
  - It is not in any Referer (`…/book/maple/manage` only), in the app's console lines or in the DOM.
  - No page error in any run.
