# Break report: R1.30 Source filter on the prospects List and board (PR #2454, head 9e2e67c7)

Run on 20 Nov 2026 against an isolated copy (`brk_r130`, :4492, `PLATFORM_IDENTITY=local`, stopped at the end), US$0, live AI off.
Actors: user-T Case Manager, user-O Case Officer, user-R Representative, with EVERYONE_SEES_ALL on and off. Scope is what the
PR adds: `?source=` on `GET prospects` and `GET pipelines/:type/board`, the shared Source control on the List and the board,
and the from-after-to message on Leads and the List. Studio = `ai-workers/problem-1-pathway-setup-and-form-filling/prototype/studio`.
The PR's own check (`tests/check_r130_prospect_source.ts`) passed 24/24 on this copy before the attacks.

## Findings

**Blocker:** none.

**M1 (Major). A from-after-to date pins the List (and Leads) to the old rows, even after the Source changes or a Move succeeds.**
Steps: List → Engaged to = today → Engaged from = today+3 (the message appears and the old rows stay, as intended) → Source → Referral.
Expected: the list follows the new source, or says plainly that it is out of date. Actual: the chip reads "Referral", the address has
`source=Referral`, and all 21 rows are still listed, 17 of them not Referral. Then **Move to… → Qualified** on P-00021: the server
moved it (`fo_prospect` stage = Qualified) but the row still says **Engaged**, because the query is turned off while the range is wrong.
Leads does the same: with Arrived from after Arrived to, choosing Referral left both non-Referral open leads on screen under a
Referral chip. Cause: `useKept` returns the last answer for as long as `badRange` is set, whatever else changes
(`web/src/modules/front-office/sales/source-filter.tsx:87-91`; used at `pipeline-page.tsx:133-136` and `leads-page.tsx:52-55`).
Evidence: scratchpad `shots/list-held-mismatch-1440.png`, `shots/leads-held-mismatch-1440.png`.

**m1 (Minor). A bad date in the address of the List shows a raw server message, or the wrong one.** Leads drops a malformed day
(`leads-page.tsx:40`, `day()`), but the List passes the raw `?from=`/`?to=` (`pipeline-page.tsx:129`) and compares them as strings
(`source-filter.tsx:84`).
- `?view=list&from=abc` or `from=2026-02-30`: the field looks empty and is not marked invalid. The page shows **"from: a date as
  YYYY-MM-DD. Try again"**, and Try again repeats the same 400. DW5 says no raw "from:" text should ever show.
- `from=abc&to=2026-01-01`: the page says "The from date must be on or before the to date." next to a from field that looks empty.
- `from=2026-1-5&to=2026-01-10` (5 Jan is before 10 Jan): the page says from is after to, because `"2026-1-5" > "2026-01-10"` as strings.
Expected: a malformed day is dropped (as on Leads) or named in plain words at the field. Clear filters does recover the page.

**m2 (Minor). The board and the List now wait for `GET leads/sources` even when no source is asked.**
Steps: delay `leads/sources` by 8 s (Playwright route), then open `/front-office/pipeline` with no `?source=`. Expected: the board
draws as before (about 0.3 s here). Actual: the first card appears after 8.5 s (8.5 s on the List too); the baseline is 0.27 s.
A hung sources route holds an unfiltered board on "Loading the board" for as long as it hangs. Cause: `enabled: !src.known.isPending`
whether or not the address asks for a source (`pipeline-page.tsx:51`, `:55`, `:134`).

**m3 (Minor). An own-only person cannot filter one of their own prospects by its source when its lead now has another owner.**
Steps: O's lead "Reowned …" is engaged by O, giving P-00020 (owner O). O is deactivated, and T engages the same lead (it now counts as
Unassigned), so the lead's owner becomes T. O is reactivated and EVERYONE_SEES_ALL is off. Expected: O can find P-00020, which is on
their List and board, by its source. Actual: "Reowned …" is not among O's choices. `?source=Reowned…` gives 400 UNKNOWN_SOURCE on the
API. On screen the address source is dropped without a word and all 5 of O's prospects are listed. Cause: the choices are the sources
of the leads the person sees (`api/src/front-office/sales/source-filter.ts:27-30`), while a prospect is seen by its own owner
(`prospects.ts:195`). Nothing leaks; the filter just cannot reach this prospect.

**m4 (Minor). A stored source with leading or trailing spaces can be chosen but never filtered.** A lead with source `" Padded "` is
listed as a choice. The screen sends it as it is, the server trims it to `Padded` (`source-filter.ts:12`), and it is not among the
allowed sources (`:37`), so the List and the board answer 400 "Unknown source: Padded". The manual Add lead route trims sources
(`common.ts:27`); I did not trace whether web-form or seeded sources can carry spaces, so this may only happen with stored data.
The same applies to `?source=` in NFD form (stored text is NFC): 400. This behaviour comes from FO-4sf and is now shared by three lists.

## What held
- **Visibility (setting off):** O's `?source=<T's secret source>` returns 400 on the List, the INDIVIDUAL board and the CORPORATE
  board. `allowed` is exactly O's own `leads/sources` list, so nothing extra is named. O's Referral board shows only O's cards and
  only O's USD 500 total. The 200 and 400 answers tell O nothing about other people's sources. R (no own leads) gets 400 for Referral.
  In the browser, a typed secret source is dropped for O (no chip, the name never shown, only O's own rows and total).
- **Odd values:** exact case is matched (`web` and `Web` are separate, `WEB` gives 400). `web,Web` is one value (400). Empty or
  space-only values mean all. 200 repeats are de-duplicated. 300-character and unicode sources (é, 東京, 🎉) filter correctly. A
  5,000-character or %00 value gives 400 with the message capped (300 unknown values: detail 732 characters). `source[a]=` and
  `source[0]=` are ignored like any other unknown parameter.
- **Board and Corporate:** with a source chosen, Move to… and drag (Engaged → Qualified → Consult) update the cards, the counts and the
  per-stage and open totals on the filtered board (CAD 1,000 moved from the Engaged total to the Qualified total). The `["fo","prospects"]`
  invalidation covers the board key that carries the source. `CORPORATE` takes the same check (400 for an unknown source, 0 cards for T's).
- **Board/List switch and clearing:** the source is kept both ways; Clear filters on the List and All sources on the board drop it;
  a reload keeps it.
- **Sources route failing:** with a source in the address, nothing is fetched and the "not shown" note appears; Try again recovers
  (2 rows, chip back). With no source, the full list loads and the error has Try again.
- **Keyboard and screen reader:** Enter on Source puts focus in Find; Tab moves to a checkbox; Space toggles it while the panel stays
  open and focus stays put. Escape returns focus to "Source (1)". The chip's "Remove source: Web" button returns focus to the toggle.
  The from-after-to message is linked to the field (aria-invalid, described by it) and is spoken as a status, not an alert.
- **Widths and axe:** no sideways page scroll at 400, 720 (200 % of 1440), 1024 and 1440 px on the List and the board, with three
  chips (a 300-character one, a unicode one, `web`) and the panel open; the panel stays inside the screen (x = 16 at 400 px). axe
  (WCAG 2.2 A and AA) found nothing in any of these states or with the date message showing. No page errors.
- **Dates on the server:** from after to, 30 Feb, `abc` and `2026-1-5` are all refused with a 400. A from-after-to typed into the
  Leads address shows the message and the leads list is not requested.
