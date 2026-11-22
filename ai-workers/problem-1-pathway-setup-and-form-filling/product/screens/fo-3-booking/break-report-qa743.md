# Break report: QA-743 time off on the staff calendar (PR #2929, head 690477895)

Breaker run 22 Nov 2026. Isolated copy `br743` on :4443 (`PLATFORM_IDENTITY=local`, 40-min TTL), stopped at the end. No model calls. Seeded the way `tests/check_fo3st1_calendar_browser.ts` does: firm `maple` (America/Toronto, `platform.everyone_sees_all` **off**) with Owner, 3 Case Officers (one with a 64-character name, one named `<img src=x onerror=alert(1)> 名前`), Read-only, Billing and finance, a deactivated Case Officer, plus a second firm `oak` with its own time off. Time off covered: whole days on 2027-03-14 (spring forward) and 2026-11-01 (fall back); multi-day periods that start before the window and end after it; part days at 05:00–07:00, 22:00–01:00, 10:59–11:01; 01:30 EST–03:30 EDT across the spring gap; 01:30 EDT–01:30 EST and 01:00–01:30 EST in the repeated hour. Browser in Asia/Dubai, Playwright Chromium. Sign-in through `POST /api/platform/session/local`.

Code under test: `studio/api/src/front-office/booking/feed.ts:55-63` (`offItems`), `studio/web/src/modules/front-office/booking/calendar/calendar-page.tsx:75-77, 157-217`, `contract.ts:73-85` (`offOn`, `offInHour`).

## What held
| Attack | Result |
|---|---|
| Cross-firm leakage | `oak` Owner's team feed returned only oak's period. `maple` feeds never held oak's. `firmScope` is on both queries. |
| A host without the list key | Billing and finance: `view=team` returned 403 `MISSING_PERMISSION`; `view=mine` returned `timeOff: []` while 10 colleague periods existed; the UI shows the refusal notice with no calendar. No token returned 401. |
| Reasons or creator leaking | Every item has exactly `id, staff{id,name}, mine, label, startsAt, endsAt`. `createdBy` (one period was created by the Owner for a colleague) never appears. The model has no reason column. |
| Mine vs Team | Mine shows only the viewer's own ("Time off"); the host list in Mine holds only the viewer. Team labels colleagues "Not available". |
| Multi-day, and periods past the window edges | A period from Fri 5 Mar 13:00 to Tue 9 Mar 12:00 shows as "all day" Mon and "until 12:00" Tue. A period from Fri 12 Mar 16:00 to Wed 17 Mar 10:00 shows as "from 16:00" Fri, then "all day" Sat and Sun. Next week continues it, and Back restores the week. |
| Spring forward, 2027-03-14 | A whole day shows as "all day" (a 23-hour day). The gap period reads "01:30–03:30". The 03:00–18:00 rows are marked correctly. |
| Part days and midnight | "05:00–07:00", "from 22:00" / "until 01:00" on the next day, and "10:59–11:01" marks both the 10:00 and 11:00 rows. |
| `?hour=` list filter | `hour=2027-03-11T13` shows only that period. `hour=2027-03-14T01` shows only the periods that touch 01:00. |
| Host filter | `host=<Client I>` shows only Client I's 6 periods. A name seen only through time off stays named in the host list. |
| Not clickable | Clicking a Week chip or a List row changes nothing (no panel, same URL). No button or link is inside a time-off row. Tabbing never stops on a chip. |
| Hostile and non-English text | The `<img onerror>` name and 名前 render as plain text in the chip, the title, the List and the `<option>`. There were no dialogs and no page or console errors in any run. |
| Widths and zoom | Nothing scrolls sideways at 1024 and 1440, or at 720 px with 2x zoom. At 400 px the week becomes a single day and the chips are readable. |

## Findings

### Blocker
None.

### Major
**1. The "shaded hours" never show: they have the same colour as the page.** The off-hour cells get `bg-surface` (calendar-page.tsx:182). In the light theme, the shaded cell, an unshaded cell (transparent over `body`), the table head and the page are all `rgb(247,247,247)`. In dark they are all `rgb(20,32,44)`. The hours exist only as a `data-off-hour` attribute, which is the only thing the PR's check counts (check_fo3st1_calendar_browser.ts:281). The PR's own screenshot `screenshots/fo3st1-time-off-week-mine-1440.png` shows it: Wed 25 Nov is "Time off · all day", yet its 08:00–18:00 cells look like every other cell. In Week and Day the user therefore cannot see which hours are blocked. Only the chip row at the top says so, and at 1024 px that row is truncated (finding 4).
Reproduce:
1. Seed a whole day off for Client C on Wed 10 Mar 2027.
2. Open `/front-office/bookings?view=week&whose=mine&date=2027-03-08` at 1440 px.
3. Compare the Wed 10 cells with the Tue 9 cells: no difference. `getComputedStyle` gives the same background for `[data-cell="…T13"][data-off-hour]`, a plain cell and `body`.

### Minor
**2. The fall-back day shows a one-hour period as "01:30–01:30", and the repeated hour is never shaded.** `offOn` prints wall times with no offset (contract.ts:79), so 01:30 EDT to 01:30 EST (05:30Z–06:30Z) reads as zero length in Week, Day and List. Separately, `offInHour` (contract.ts:83) maps the "01:00" row to the first 01:00 (EDT) only. A colleague's 01:00–01:30 EST period sits beside a 01:10 EST booking in the same 01:00 row, but no row gets `data-off-hour`.
Reproduce: seed periods `2026-11-01T05:30Z–06:30Z` and `2026-11-01T06:00Z–06:30Z` for Client I and a booking at `06:10Z`. Open `?view=day&whose=team&date=2026-11-01&host=<I>`.

**3. A long name that reaches the host list only through time off makes the page scroll sideways at 400 px.** The new line calendar-page.tsx:75 adds every staff name in `timeOff` to the Host `<select>`, which has no maximum width (calendar-page.tsx:108). With a 64-character name, Day, Week and List at 400 px all scroll 84 px sideways (`LABEL`/`SELECT` right edge 484). The same week without that colleague's time off has 0 overflow. This breaks reflow (WCAG 1.4.10). The cause is the existing select, but this PR adds names that never appeared there before.
Reproduce: give a colleague with a long display name some time off, and no bookings, in the week. Open `?view=day&whose=team&date=2027-03-12` at 400 px and check `scrollWidth - innerWidth`.

**4. At 1024 px the Week chips are cut off, and the full text is only in a mouse tooltip.** 14 of 15 chips overflow (`block truncate`, calendar-page.tsx:175). Examples: "Time off · all…", "Client I with …", "Client X (left…". The who and when are only in `title`, which keyboard and touch users cannot reach because the chips are not focusable. Screen readers get the full DOM text. 1440 px still cuts 8 of 15.
Reproduce: open `?view=week&whose=team&date=2027-03-08` at 1024 px. See `week-1024-1.png` in the scratchpad.

**5. A crafted `?hour=` outside the shown week gives a time-off row with an empty "When" cell.** `offs` filters by `offInHour` alone, not by `dates` (calendar-page.tsx:77). `offWhen` then joins only the shown dates (calendar-page.tsx:198), so it is empty. Bookings in the same case are filtered out by `dates.includes`.
Reproduce: seed I off on 2026-11-02 09:00–10:00 Toronto. Open `?view=list&whose=team&date=2026-10-28&hour=2026-11-02T09`. The row reads " – – Client I … – Not available".

**6. A deactivated colleague's time off is still shown and offered as a host.** `offItems` (feed.ts:58-60) does not check staff status. In Team, "Client X (left): not available · all day" appears in Week and List, and "Client X (left)" is in the Host list. Availability's own `target()` treats such a person as not in the firm (availability.ts:228).
Reproduce: seed time off for a staff member with `status=DEACTIVATED`. Open Team week.

**7. Question for the lead, not a defect: Team time off ignores the record rule.** With `everyone_sees_all` off, Read-only's Team week has 0 bookings (record rule) but 14 colleague periods with names, and every colleague is in the Host list. This matches the brief ("everyone's in the firm"). The concept's "Who sees what" (fo-3-booking concept §6, line 73) puts "others within the record rule" on the calendar, and "a colleague's hours and time off" behind `:configure-availability`. Someone should confirm that showing who is off and when, with no reason, to every list-key holder is intended.
Reproduce: sign in as Read-only with the setting off and open `?view=week&whose=team&date=2027-03-08`.

**8. Cosmetic: overlapping own periods show as duplicate chips.** Sun 14 Mar shows "Time off · all day" twice because two of the viewer's periods overlap. Overlapping time off is allowed by Availability.
