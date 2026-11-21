# FO-3st1 part 1 — break report (PR #2322, head 7071b6f91)

Breaker, Opus 5.5, effort high, 19 Nov 2026. Scope (P-26): the brief's part 1 (calendar, booking detail with attendance, New booking with Book anyway, Reschedule, Cancel; J-S1..J-S4, J-S9, DW10, DW11) and concept r2 §3 BR-13/BR-14, §4, §5, §6. The consult record and Next step (part 2) are not findings.
Copy: `isolated.sh screens_fo3st1b`, port **4593**. 4552 was taken mid-run by another session's `check_fo3st1_calendar_browser.ts 4552 xr_studio_screens_fo3st1w`, which displaced my first copy. Seeded like the test: firm `maple` in America/Toronto, the seeded roles (Owner F, CO C and I, Admin A, CM K, Billing D, Read-only R), 31 extra CO hosts (one with a 125-character name), leads P, B, O, N (no email), Q (with a phone), a 200-character name, an Arabic and Chinese name, an HTML/RLO name, 60 bookings next week, 373 in one week, and DST bookings. Signed in by POST /api/platform/session/local. Chromium is `/opt/pw-browsers/chromium`. Scripts and screenshots are in `/tmp/claude-0/-home-user-xpatready/dc04b5aa-0d5e-5245-919b-cba0a8040214/scratchpad/` (`b1..b8.mjs`, `shots/*.png`). The copy was stopped at the end.
The DST dates in the brief do not apply to Toronto: 7 Mar and 31 Oct 2027 are not Toronto changes. I used the real ones, **Sun 14 Mar 2027** and **Sun 7 Nov 2027** (concept J-P5 also uses 14 Mar).

**Verdict: no Blocker, 9 Major, 9 Minor.**

## Findings

**M1 Major. A malformed address blanks the whole page.**
* Repro: `/front-office/bookings?date=2027-13-45`, or `?view=list&hour=foo`.
* Result: `RangeError: Invalid time value`, a white page with no frame and no message (`shots/odd-_date_2027_13_45.png`).
* Cause: the date regex accepts any 4-2-2 digits (`calendar-page.tsx:123`); `addDays` then runs `toISOString()` on NaN (`contract.ts:57`); `shortDay(hour.slice(0,10))` formats an Invalid Date (`calendar-page.tsx:234`, `contract.ts:55`).
* Related: `?date=0000-01-01` shows the range "Wed 1 Dec – Wed 1 Dec", the zone "…" and the server's raw sentence "Ask with from and to as ISO times…".
* Expected: fall back to today, as `?date=garbage` already does.

**M2 Major. The pinned "Did <person> attend?" only covers the week on screen (BR-14, AG-4-39).**
* `due` is filtered out of the visible range's feed (`calendar-page.tsx:135`). Concept §6 names `/attendance-due` for this.
* As Client C: two due questions are pinned. Click "Next week" and both disappear (`shots/pinned-next-week-gone.png`).
* A meeting that ended 9 days ago and was never answered is not pinned on the current week, although `GET /attendance-due` returns it.
* Expected: every due question is pinned, whatever the week.

**M3 Major. The Person search does not search what its hint says.**
* The hint reads "Search by name, email or phone" (concept §5).
* Searching `uniqueq@client.example` or `+14165550199` shows "No person found. Add them as a lead first." (`shots/newbooking-search-by-phone.png`).
* The filter only checks the name and the lead number (`new-booking.tsx:205`).

**M4 Major. The person chosen in New booking can be hidden while Book still books them.**
* Choose Client Q and a time, then type "Client P" in the search. The Person select shows "Choose…", but Book stays enabled and books **Client Q** (`shots/newbooking-stale-person.png`).
* `leadId` survives a search that filters it out (`new-booking.tsx:198-209`). Only the line "Times for Client Q Sample…" gives this away.

**M5 Major. Case Officers cannot choose the host (BR-13; concept §4 "with FO-3sa also host").**
* The Host field appears only if `/front-office/leads/assignees` returns names. That needs `agent/prospect:assign` (`api/.../sales/leads.ts:103`), so a CO gets no field (`new-booking.tsx:197,203,221`; `shots/co-newbooking-no-host.png`).
* FO-3sa's `POST /bookings` accepts `hostStaffId` from anyone with `agent/booking:create`. Calling it as the CO with `hostStaffId` set to themselves gets a normal answer, not a refusal.
* The browser is deriving a permission from an unrelated key (STANDARDS §7). A CO cannot put a caller into their own calendar; they get "the first free host".

**M6 Major. New booking's zone is always the office zone, and cannot be changed (BR-13, §5).**
* The concept says: "the person's zone when known, else the host's office zone, shown and changeable", with "Times for <person> in <zone> (change)".
* The build always sends `timeZone: zone`, the viewer's office zone (`new-booking.tsx:208`). The line has no "(change)" (`:223`).
* Result: a caller in Dubai is recorded with booker zone America/Toronto.

**M7 Major. Moving the week with a host filter on shows a false empty week.**
* Pick "Host 07 Sample", then "Next week". The select now reads "Host: anyone", the address keeps `host=…`, and the grid says "No bookings this week." (`shots/host-filter-next-week.png`).
* The options are built only from the shown range's items (`calendar-page.tsx:134,160`).

**M8 Major. At 1024 px the week shows no names.**
* Blocks are 31 px wide and read "C…" (`shots/week-w1024.png`); at 1440 a three-block cell reads "Clie…".
* The person and type are only in `title`, which keyboard and touch users never see (`calendar-page.tsx:196-200`).
* DW10 asks for the week to lay out at 1024. It does, but it cannot be read.

**M9 Major. "Today" uses the UTC date, not the office date.**
* `today()` is `toISOString().slice(0,10)` (`calendar-page.tsx:96`).
* With the browser clock at 22:30 Thu 19 Nov in Toronto, Day shows **Fri 20 Nov**. At 22:30 Sunday, Week shows the **next** week (`shots/today-2026-11-20.png`).
* An office west of Toronto is wrong for even more of its day: a UTC−8 office from 16:00.

**m1 Minor.** Any `hour` parameter outside the List view hides every booking: `?view=day&date=2026-11-19&hour=x` says "No bookings this week" on a day that has bookings (`calendar-page.tsx:133`). `?view=list&hour=2026-11-24T99` shows "Bookings at 99:00".
**m2 Minor.** Below 768 px CSS, including 200 % zoom of 1440 (720 px), "Week" cannot be chosen: clicking it leaves Day pressed (`calendar-page.tsx:121`; `shots/week-zoom200-of-1440.png`). The concept only asks for this at 375.
**m3 Minor. DST (§4 lists a "DST day" state; the staff calendar has no DST note).**
* On 7 Nov 2027, two different bookings both show "01:30" in the same cell. The List and detail say "01:30–01:00" for the first-pass 01:30 (`detail-panel.tsx:60`).
* On 14 Mar a 30-minute booking at 01:30 reads "01:30–03:00".
* "Pick another time" at 02:30 on 14 Mar silently becomes "Chosen: Sun 14 March 03:30–04:00" (`contract.ts:61-66`). 01:30 on 7 Nov always takes the first pass, with no choice.
* The grid itself held: bookings sit on the right day and hour, there is no duplicate row, and the 02:00 row is empty (`shots/dst-*.png`).

**m4 Minor. Keyboard in the More menu.**
* Escape on the open menu also closes the whole panel (`detail-panel.tsx:47` does not stop propagation).
* ArrowDown does nothing in `role="menu"`. Tab walks out and leaves the menu open (`shots/more-menu-after-tab.png`).
* After the panel, Move or Cancel closes, focus falls to `<body>`, not the block or More, so a keyboard user starts again from the top of a 60-block week.

**m5 Minor. Hostile and long text in the panel.**
* A 200-character unbroken name overflows the 520 px panel: scrollWidth 1967, and the title covers the × (`shots/long-name-panel.png`).
* A U+202E in a person's name reverses the rest of the line, including "Host: Client D" and the email (`shots/hostile-name-panel.png`). Names come from the public form, so the fix is `dir=auto` or `<bdi>`.
**m6 Minor.** For someone with `booking:create` but no `booking-event-type:list` (no seeded role is like this; simulated by removing the key from CM in the copy), New booking is a silent dead end: empty "Booking type" and "Way to meet", Book never enabled, no sentence (`new-booking.tsx:195`; `shots/newbooking-no-types-key.png`).
**m7 Minor. Volume.**
* A 373-booking week takes 2.9–3.5 s to show. The feed answers in 41 ms. An empty week takes 0.2 s, the 60-booking week 0.7 s.
* Cause: a new `Intl.DateTimeFormat` is built per call, per cell (`contract.ts:44-46`, `calendar-page.tsx:217`).
* STANDARDS §9 leaves 400-row scale to the team, hence Minor.
**m8 Minor.** Nothing links to Bookings. `ACCOUNT_SECTIONS` and the sales pages have no entry, so even a list-key holder reaches the Calendar only by typing the address. J-S1's "has the Bookings menu" is only true once there.
**m9 Minor.** "Free times" shows only the first 12 slots, which today were all Thu afternoon (`new-booking.tsx:174`). A free time next week can only be typed in through "Pick another time".

## What held
* **A Billing host and someone else's booking by a typed address:** "This booking is not available." The same text appears for `/not-a-uuid`. API: `feed/:id` 404, `attendance` 404, `cancel` 403, Team feed 403. Their own booking opens and Attended saves. `/front-office/bookings` gives the plain refusal and no menu.
* **Read-only:** no New booking button; "You can view bookings but not change them."; attendance and cancel by API are 403.
* **Attendance answered twice from two tabs (same session):** tab A's Attended saved, tab B's later No-show saved, and tab A re-reads No-show on opening. The last answer wins with no warning, which concept §4 accepts: "a stale-save conflict is not drawn".
* **Writes:** double-clicking Book made one booking. Cancelling a booking already cancelled elsewhere shows "Not cancelled. This booking is no longer active."
* **Session ended mid-dialog** by a newer sign-in: "Signed in elsewhere", nothing saved.
* **Reload and Back:** reload with Move open reopens the panel from the address; Back closes the panel; Back after "+n more" returns to the week.
* **60 and 373 bookings:** no overlapping blocks. Every booking is either a block or counted in "+n more" (33 + 340 = 373). The List has 373 rows. One feed request per view, and the host filter answers in 139 ms.
* **Widths and axe:** at 375, at 200 % zoom (720 and 512 px) and at 1024, the week becomes a day where narrow, nothing scrolls sideways, and the panel and New booking fit. axe-core shows no serious or critical issue on the week, panel, New booking and the 373-row List.
* **Keyboard in New booking:** Tab stays inside the dialog.
* **Text:** an HTML name is shown as text and never runs. An Arabic and Chinese name is found by Arabic search. `?view=foo`, `?whose=xyz`, `?date=garbage` and an unknown `?host=` fall back to the defaults. `?date=2027-02-30` rolls to the 1 Mar week.
* **Other screen rules:** the "No email: … will get no confirmation." note; the "Cancelled by" chip.
