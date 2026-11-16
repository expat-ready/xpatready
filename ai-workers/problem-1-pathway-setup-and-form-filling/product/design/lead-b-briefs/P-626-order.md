# P-626 order: the PF/FO rows that complete the Partial capabilities (Lead B (6), rev 16.43, 16 Nov 07:4x IST)

The founder's P-626: finish the Partial capabilities first, so that 10 Release 1 capabilities are proven by qa by 08:00 IST on 17 Nov. These rows come before shaping batch 6 (#1908), PF-Fd and the rest of Lead B's list. Lead B checked each row's waits on `main` at 07:2x–07:4x IST on 16 Nov, and verified merges from GitHub. Where a brief here differs from its text on `main`, the amendment below wins. **Paste the amendment above the brief** when starting the builder.

| # | Row | Capability | Brief | Starts when | State at 07:4x IST |
|---|---|---|---|---|---|
| 0 | **PF-6 part 1** (platform frame, session holder) | base for 109, 41, 42 | `lead-b-briefs/PF-6.md` (on `main`) | now: no open PR touches `sales/session.ts` | **ready now; start first** |
| 1 | **FO-3w** (public booking pages) | R1.24, 37, 38, 40 | `lead-b-briefs/FO-3w.md` (on `main`) + amendment A1 | #1830 (FO-3pa) on `main` | ready the moment #1830 merges |
| 2 | **FO-3a part 1a** (booking types) | 41, 42 | `lead-b-briefs/FO-3a.md` (on `main`) + amendment A2 | #1830 on `main` (#1828 merged 15 Nov) | ready the moment #1830 merges |
| 2' | FO-3a part 1b (hour sets, time off, timings) | 41 | same brief | 1a on `main` | waits |
| 2'' | **FO-3a part 2a** (consult record, read port) | 42 | `lead-b-briefs/FO-3a2.md` (Lead B's branch) | 1a on `main`; may run beside 1b | waits |
| 2''' | FO-3vr (booking visibility) | 37, 42 | `lead-b-briefs/FO-3vr.md` (on `main`) | #1830 and #1831 on `main` | #1831 is approved and needs its label |
| 2'''' | FO-3a part 2b (staff read feed) | 42 | `lead-b-briefs/FO-3a2.md` | FO-3vr and 2a on `main` | waits |
| 3 | **FO-3st2** (Availability, Time off) | 41 | `lead-b-briefs/FO-3st2.md` (on `main`) + amendment A3 | 1b and PF-6 part 1 on `main` | waits |
| 3' | **FO-3st3** (Booking types, Timings) | 42 | `lead-b-briefs/FO-3st3.md` (on `main`) + amendment A3 | 1a, 1b and PF-6 part 1 on `main` | waits |
| 3'' | **FO-3st1** parts 1-2 (calendar, detail, attendance, consult record) | 42 | `lead-b-briefs/FO-3st1.md` (Lead B's branch; new) | part 1: PF-6 part 1 and 2b; part 2: part 1 and 2a | waits |
| 4 | **J-38** (time zones, invite files) | 38, 40 | `lead-b-briefs/J-rows.md` (on `main`) + amendment A4 | FO-3w part 1 on `main` | waits only on FO-3w part 1 |
| 5 | **PF-21s stage 2** (complaints screens) | 109 | `lead-b-briefs/PF-21s.md` (Lead B's branch) + amendment A5 | PF-6 part 1 on `main` | PF-21w #1823 and PF-21v #1848 are merged and the concept is approved |
| 6 | **J-6** (R1.6 walk) | R1.6 | `lead-b-briefs/J-rows.md` + amendment A6 | now (PF-6b is on `main`) | ready now |

**The critical path is PF-6 part 1.** It holds 109, 41 and 42's screens. Start it now, beside FO-3w, which does not need it: FO-3w uses its own small public frame.

## A1. FO-3w (Lead B ruling, rev 16.43; settles the brief's "For Lead B" paragraph)
* **Option (b) is taken.** It **does not wait on PF-13**. The public frame shows the firm's operating name from FO-3pa's answers. PF-13 adds the logo and colour to this frame as its own Done when line (AG-4-16 rule 3, "No separate booking-page branding").
* The path is `/book/:firmKey`, as the brief already has. It needs no PF-25 host routing.
* **The agreement link and "I accept" tick (rev 16.40, from FO-3c) are not in FO-3w.** FO-3c part 1 is not on `main`. When it lands, FO-3c part 2 adds the tick to the type page as its own Done when line. FO-3w neither waits for it nor draws it.
* Part 1 (J-P1 to J-P5, J-P9, DW10, DW11) is what J-38 needs. Part 2 (manage pages) follows in the same lane.

## A2. FO-3a part 1a
* It starts when #1830 merges.
* It changes only the two type lookups' `where` in `booking/service.ts`. **#1831 (FO-3m, approved) also edits `service.ts`.** If #1831 is not on `main` when 1a reaches those two lines, 1a merges `main` in once #1831 lands (P-270 on that conflict). It does not wait to start.
* It never runs beside FO-3vr (same file). Whichever starts second waits, as the brief says.

## A3. FO-3st2 and FO-3st3
* Both build inside **PF-6 part 1's `PlatformFrame`** and import the holder from `modules/platform/session.ts`, as PF-6.md's "Parallel safety" says. So both start only after PF-6 part 1 merges, as well as their FO-3a parts.
* FO-3st2's Availability entry is one line in `ACCOUNT_SECTIONS`.
* Office zone = the firm's zone until PF-18a (concept §6b). Neither waits on PF-18a.

## A4. J-38 (map rows 38 and 40)
* **Waits only on FO-3w part 1.**
  - PF-23w (#1800) is on `main`.
  - Booking mail is real through PF-19b's adapter (#1860, on `main`), with the demo inbox route.
  - FO-3h (#1799) and FO-3f (#1785) are on `main`.
  - Rev 16.17's "waits on PF-4b's sending adapter" is replaced by #1860.
* **Swaps to show real** (each case fails on the fake):
  - `J-38 DW1`: the booking mails go through `MailPort`'s real adapter and are read from `GET /api/demo/platform-inbox?address=`, not from `fakeMail`.
  - `J-38 DW2`: the `.ics` is the one FO-3pa serves by token.
* **Walk** `J-38 W1`, in a visible browser and as a scripted check:
  - A visitor whose browser zone is Asia/Dubai books a 14:00 America/Toronto slot on `/book/maple/<slug>`.
  - The visitor's mail shows the Dubai time with the zone named.
  - The host's mail shows the host's office time (FO-3h).
  - The `.ics` `DTSTART` is the same UTC instant as the booking.
  - It ends at row 39's first step (the host opens Bookings); that step may be a 404 until FO-3st1 lands, and the walk says so.

## A5. PF-21s stage 2
* PF-21w (#1823) and PF-21v (#1848) are on `main`, and the concept is approved (`screens/pf-21-complaints/concept.md`).
* Stage 2 part 1 starts when **PF-6 part 1** merges, as the concept §"Part 1" says. Part 2 follows in the same lane.
* The Complaints entry in the platform menu: per concept, a one-line follow-up after PF-6's menu exists. It is in PF-21s part 2 if `PlatformFrame` has a menu list by then; otherwise the walk uses the address.

## A6. qa's R1.6 question ("which row owns own versus all and money and licence apart?")
* **There is an owner already:**
  - the API half is **PF-6b**, on `main` (catalogue `scope` and `class`, money and licence keys never in a group tick, own versus all checked);
  - the screen half is **PF-6's two Done when lines**, copied into BACKLOG's PF-6 row (rows rev 16.10 table): the role editor's money and licence groups, and a Case Officer without `view.all` seeing only their own items in the browser;
  - **J-6** walks both.
* **To prove R1.6 by 17 Nov, split J-6 (rev 16.43):**
  - **J-6 part 1, now:**
    - API: PF-6b's checks, with a pass and a fail per key class;
    - screen: own versus all on FO-4's Leads screen (on `main`), where a Case Officer with "own" sees only their own leads and an Owner sees all;
    - wrong role by URL refused on screen and API.
  - **J-6 part 2:** the role editor line, when PF-6 part 2 (Team, roles) is on `main`.
  - qa scores R1.6 on part 1 only if its capability text is met without the role editor. "Money and licence keys never come with another key" is an API rule (PF-6b), so it can be. qa decides.

## New row FO-5cr (rev 16.43)
**FO-5cr: the retainer draft is pre-filled from a consult record** (AG-4-49, AG-4-50; concept BR-16, Q3).
* FO-5's draft, opened with `?consultRecord=<id>`, reads `ConsultRecordPort.read` and pre-fills the party, the recommended items and the quoted fee. Nothing is typed twice, and nothing is sent.
* Touch: FO-5's retainer draft files only.
* Waits on FO-3a part 2a.
* Not on the P-626 path: J-42's walk reaches the draft through FO-3st1's button.
