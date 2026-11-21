# Fresh reader verdict: R1.38, R1.110, R1.40 on main d3d014857 (P-303)

Fresh Opus 5.5 reader, 21 Nov (qa 12). Ran nothing: read code, journeys, the qa check, the evidence files and 1 screenshot.
Paths: S = `prototype/studio/`. Run ids are from `walks-github.md` (copied from job logs by qa; not re-fetched by the reader).

## 1. R1.38 Time zones from booking page to invite: **Partial (held by proof only, not by the product)**

**Evidence accepted**
- GitHub walks.yml on main d3d014857: run 44818224820 (job 136572315567) and 44818327469 (job 136572624893), J-38 39/39 each.
  The walked day is 23 Nov 2026 (EST); J-38 picks "10:00 Toronto, 15:00 or 14:00 UTC" on the first day ahead
  (`S/tests/journeys/j_38.ts:136`) and never crosses a clock change (W7 moves one hour on the same day).
- qa local check `S/tests/qa/check_r138_staff_zone_dst.ts` on an isolated copy of d3d014857, 14/14 twice (a and b differ only
  in the firm key). Read in full: it asserts what its names say. Screenshot `staff-dst-a/staff-detail-edt-1440.png` agrees
  (booking in the 10:00 row of Mon 15 Mar; "10:00–10:30 America/Toronto · 18:00 for Ana Sample (Asia/Dubai)").
- Older qa checks `check_r138_r140_booking_page_walk.ts` (f7dde02c8, 35/35) and `check_r140_staff_move_invite.ts`: accepted
  as history only. They predate FO-3st1 #2322, J-38 W6 #2326, PF-19b part 3's mail path and the audit edits to
  `api/src/front-office/booking/service.ts` (e9fd83700); not re-run on d3d014857, they prove nothing about main's head.
- Code: the staff calendar converts with Intl and a named zone, not a fixed offset: one formatter per zone with
  `timeZone: zone` (`S/web/src/modules/front-office/booking/calendar/contract.ts:46`), used by `dayOf`/`hourOf`/`hhmm`/`longWhen`
  (`:52-56`); the grid's `data-cell` is the office-zone day and hour (`calendar-page.tsx:170-172`), the zone line names the
  office zone (`:104`). Mails use `wallLabel` with `timeZone` (`api/src/front-office/booking/service.ts:187`), the host's zone
  from `hostZone` (`:192`, `:670`). The .ics carries DTSTART in UTC (`Z`), so its offset is right by construction.
  DST-correct by design; the question is only whether that is shown on GitHub.

**Clauses**
| Clause | Status | Where shown |
|---|---|---|
| A slot shown in the client's zone | MET (GitHub) | J-38 W1 `j_38.ts:113`, `:148` (Dubai browser, "19:00 Asia/Dubai time") |
| stored in UTC | MET (GitHub) | J-38 W1 `j_38.ts:161` (startsAt = instant, bookerTimeZone kept) |
| appears in the staff zone | MET (GitHub), one day only | J-38 W6 `j_38.ts:197`, `:202`, `:207` (London browser, 10:00 Toronto row, no London time) |
| and in the invite with the right offset | MET (GitHub), one day only | J-38 W2/W3 `j_38.ts:177-180`; W4 `:224` (.ics from both mails and Add to calendar at the instant in UTC) |
| across a daylight-saving change | NOT MET on GitHub; met in a qa local run on d3d014857 | `check_r138_staff_zone_dst.ts:81-89` (booker 19:00 / 18:00 Dubai, stored 15:00Z / 14:00Z), `:100-114` (staff week and detail 10:00 Toronto both sides, not the London row), `:118-121` (host mail 10:00 a.m. both sides, DTSTART 15:00Z / 14:00Z) |

Not covered on d3d014857 by any run: the booker's mail text across the change (7:00 p.m. / 6:00 p.m. Dubai); only the
older f7dde02c8 check has it. Low risk (same `wallLabel`, same UTC .ics), but it is a gap in the new check.

**Call.** P-339 asks for every Done-when clause green on GitHub's runners on main's head. The DST clause is the one that
names this capability, and on GitHub it is not walked: J-38 on 23 Nov shows the staff zone and the invite at one offset.
A qa local run is supporting evidence, not a GitHub run. Calling this Works "with a note" would make the hardest clause
the one taken on trust, so: **Partial, held only by proof**. The product looks right (Intl with named zones throughout,
UTC invites, a clean local DST walk on main's own code). It becomes Works on the first green walks.yml run on main whose
journey crosses the change. Note: walks.yml only runs `tests/journeys/j_*.ts` (`.github/workflows/walks.yml:5-8`, `:60-67`),
so the qa check cannot be dispatched there as it is; the steps must go into J-38 (a W9).
Also: the qa check fixes the dates (12 and 15 Mar 2027, `check_r138_staff_zone_dst.ts:81-82`) under a 130-day window
(`:73`). It stops working once those days pass. A J-38 W9 should find the firm zone's next change and book either side of it.

**Bug actions**
- New, **QA-6xx (Gap · Minor (proof) · owner guess: evidence lane, J-38)**: "R1.38's daylight-saving clause has no GitHub
  run. J-38 walks one winter day (`j_38.ts:136`) and never crosses a clock change; the only DST walk on main d3d014857 is
  qa's local `tests/qa/check_r138_staff_zone_dst.ts` (14/14 twice), which walks.yml cannot run and whose dates are
  fixed in March 2027. Expected: a J-38 step (W9) books, by screens from an Asia/Dubai browser, one slot either side of
  the firm zone's next change (found, not fixed), and checks the stored UTC instants, the staff week and detail
  (London browser) at 10:00 office time both sides, both mails in each one's zone, and each invite's DTSTART. Green on
  walks.yml on main twice, R1.38 is Works."
- No other bug for R1.38. QA-571 is R1.40's (below).

## 2. R1.110 Client identity check: **Works**

**Evidence accepted**: walks.yml on main d3d014857, runs 44818224820 (job 136572315628) and 44818327469 (job 136572624779),
J-110 14/14 each, lines identical. #2568's diff read (`git show d3d014857`): `api/src/clients.ts:131` adds `fo_person_id`;
`web/src/runtime/clients.tsx:182` mounts `IdentityCheckPanel` read-only on the client page; `identity-panel.tsx:69` puts the
stored ISO in `data-checked`.

| Clause | Status | Where shown |
|---|---|---|
| Method, document type, issuing country, expiry recorded | MET | W2 one row per Save `j_110.ts:105`; W3 `:109-111` (Document copy, "Passport, IN ···4K9Z", expiry) |
| with who | MET | W3 `j_110.ts:111` and W6 `:161` (`by <Case Officer's name>`) |
| and when | MET | W6 `j_110.ts:155-161`: the shown time equals stored `checkedAt` formatted the panel's way, and `data-checked` equals `checkedAt.toISOString()` (an invented time fails) |
| an expired document refused as the basis | MET | W5 `j_110.ts:133-137` (server 422 on `fields.documentExpiry`, field message, still one row); server `api/src/front-office/compliance/identity/service.ts:159-162` |
| shown on the client | MET | W6 `j_110.ts:146-163` (Convert, FO-8 client linked to the same person, the client page lists the check, read-only) |

Note (not blocking): W6 checks "when" against the browser's zone (`j_110.ts:153-157`), so it codifies QA-613. When QA-613 is
fixed, W6 must switch to the firm's zone in the same change.

**Bug actions**
- **QA-610: close** (fixed by #2568; J-110 W6 green on GitHub twice on d3d014857).
- **QA-611: close.** Its expected step named W3; the "when" is now asserted against the stored `checked_at` in W6
  (`j_110.ts:155-161`), same panel row (`identity-panel.tsx:69`). W3 still checks who only; that is fine.
- **QA-613: keep open, still true.** `web/src/modules/front-office/sales/time.ts:14-15` formats with no `timeZone`, now also on
  the client page; add to the row that J-110 W6's expectation moves with the fix.
- **QA-612: keep open** (question to the founder). Retainer Send still counts any recorded check (`api/src/front-office/retainers/service.ts:520`);
  the panel still never marks a check whose document has since expired (`identity-panel.tsx:73` shows the date only).

## 3. R1.40 Calendar invite files: **Works (holds on d3d014857, no regression)**

**Evidence accepted**: the same J-38 runs, 39/39 twice on main d3d014857 (was 34/34 on e2f2e9ad0; the 5 new lines are W6's
staff zone steps and their axe checks). Since e2f2e9ad0 the booking code changed only by e9fd83700 (audit `before`/`after`
fields; no mail or .ics change) and j_38.ts only by #2326 (W6 added, W7 variables renamed).

| Clause | Status | Where shown |
|---|---|---|
| Each booking and change sends an .ics with the same time | MET | W4 `j_38.ts:224-228` (booker mail, host mail and Add to calendar: one event at the instant, 30 min, booker's file equals Add to calendar); W7 `:285-288` (both inboxes, new DTSTART) |
| an update replaces the event (same UID) | MET | W7 `j_38.ts:285` (REQUEST, same UID, SEQUENCE higher) |
| a cancel removes it | MET | W8 `j_38.ts:303` (CANCEL, STATUS:CANCELLED, same UID, higher SEQUENCE, both inboxes) |

Standing note: J-38's changes are by staff; the booker's own Reschedule and Cancel are shown only by the older qa check.

**Bug actions**: **QA-571 keep open** (a host-changing move still mails only the current host: `booking/service.ts:573-574`
may pick another host, `:669-671` mails `b.staffId` only). Does not hold R1.40. No new bug.
