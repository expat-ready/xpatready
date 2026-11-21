# Fresh reader verdict: R1.38 after J-38 W9, main 51b04d9bc (P-303)

Fresh Opus 5.5 reader, 21 Nov (qa 12). Ran nothing: read `j_38.ts` in full at main 51b04d9bc (checkout detached at origin/main),
the calendar code it reads, and the evidence files. S = `prototype/studio/`. Run ids are from `walks-github-w9.md` (copied from
job logs by qa; not re-fetched by the reader). j_38.ts on main last changed in 35af98684 and 766edeba4 (W9), both under 51b04d9bc.

## Evidence accepted
- walks.yml on main 51b04d9bc: run 44841739167 (job 136651783836) and run 44841813322 (job 136652022077), J-38 55/55 each,
  conclusion success. The count adds up: 39 W1–W8 lines (as in `walks-github.md`) + 16 W9 `ok` calls (`j_38.ts:361`, `:370`,
  2 × `:378`, `:389`, `:401`, `:402`, `:407`, `:418`, `:420`) = 55.
- W9 walked Toronto's 14 Mar 2027 change: Fri 12 Mar booked at 15:00Z (19:00 Dubai), Mon 15 Mar at 14:00Z (18:00 Dubai).
- W1–W8 lines on 51b04d9bc: the same steps as the d3d014857 runs (23 Nov 2026, EST); now also green on main's head.

## Is W9 sound?
- **Independent of the product.** The change day is found by comparing Intl `shortOffset` for America/Toronto at noon UTC on
  consecutive days (`:320-323`); 10:00 Toronto's instant is picked from 14:00Z/15:00Z by an Intl formatter (`:125`, `:324`);
  Dubai's hour is a plain +4 sum (`:365`; Dubai has no DST); mail day and day label are Intl in UTC (`:326`, `:368`), safe because
  14:00–15:00Z is the same date in Toronto and Dubai. No product function is imported for any expected value (imports `:48-51`
  are setup only).
- **Cannot pass vacuously.** No pair aborts the walk (`:361-362`); the two sides must sit on different offsets (`:370`); each
  booked row is fetched by the expected instant and must carry Dubai and the host (`:387-389`, null fails); the calendar must
  hold that booking's id in the office-zone 10:00 cell (`:400-402`; `data-cell` is the office day/hour, `calendar-page.tsx:172`,
  Intl with the named zone, `contract.ts:46`); the detail must exclude London's own hour, which differs from 10:00 (`:396`, `:408`);
  the host's mail is found by the W9 booking's UID, not the date, so W1's mail cannot stand in (`:415-416`); each invite's
  DTSTART must be the UTC `Z` form at the instant (`:85`, `:420`; a TZID or floating form reads null and fails).
- **Will not go stale.** Dates come from today's clock (`:321`), two changes are looked for (`:323`), the next is used unless it
  is under 26 h away (`:357`); worst case (just before the March change) the November change is ~238 days out, inside the
  250-day window (`:103`) with the 7-day after-search (`:358`).

## Clauses (J-38 on GitHub, main 51b04d9bc, runs 44841739167 and 44841813322)
| Clause | Status | Where shown |
|---|---|---|
| A slot shown in the client's zone | MET | W1 `j_38.ts:120`, `:155`, `:166` (Asia/Dubai browser, "19:00 Asia/Dubai time"); W9 `:378`, `:389` both sides |
| stored in UTC | MET | W1 `:168` (startsAt = instant, booker zone kept); W9 `:387-389` (15:00Z and 14:00Z) |
| appears in the staff zone (calendar) | MET | W6 `:204`, `:209-214`; W9 `:402`, `:407-408` (Europe/London browser, 10:00 Toronto row and detail, no London hour) |
| appears in the staff zone (host's mail) | MET | W3 `:186-187`; W9 `:418` ("10:00 a.m. (America/Toronto)" both sides) |
| appears in the invite | MET | W4 `:229-235` (both mails and Add to calendar, instant in UTC, 30 min, UID); W9 `:420` both mails, both sides |
| with the right offset across a DST change | MET | W9 `:370` (offsets differ), `:389` stored instants, `:402`/`:408` staff, `:418` both mails (7:00 p.m. / 6:00 p.m. Dubai), `:420` invites |

## Not shown, and whether the Done when needs it
- The booker's own reschedule, or a staff move, from one side of a change to the other: not walked (W7 moves one hour on the
  same day, `:283`). The Done when speaks of a slot shown, stored and appearing across a change; booking either side shows that.
  Not needed for R1.38; it touches R1.40/row 42 if anything. No bug.
- W9 checks DTSTART only, not DTEND, and does not repeat W2's "no other zone in the booker's mail" check. W4/W2 cover both
  on one offset; the .ics end is start + 30 min in UTC, so the offset cannot differ. Nit, no bug.
- W9 does not walk the November (EDT to EST) direction in these runs; it will on any run after mid-March 2027. Not needed.
- `findFirst({ startsAt })` (`:387`) does not filter by booker email; W1's booking was moved off the hour (`:283`), so no clash
  today. Nit.

## Verdict: **R1.38 Works**
Every clause is shown by J-38, green twice on GitHub's runners on main's head 51b04d9bc (P-339), the DST clause by W9 with
expected values worked out by Intl and plain sums, and no fixed dates.

## Bug actions
- **QA-616: close.** Its Expected is met as written: W9 finds the next Toronto change (`:320-323`), books either side by screens
  from Asia/Dubai (`:372-390`), reads the staff calendar and detail from Europe/London (`:395-409`), both mails and both invites
  (`:411-421`); green in walks.yml runs 44841739167 and 44841813322 on main 51b04d9bc. Fixed by #2658 (35af98684, 766edeba4).
- No new bug.
