# Break report: FO-2 part 3, Individual prospects (API only)

Commit d09490d99 on `claude/runtime-prospects`. Brief: `origin/lead-b-front-office` `design/lead-b-briefs/wave1-sales.md`, "FO-2 part 3".
Run: isolated copy `breaker_fo2p3` on :4562 (`PLATFORM_IDENTITY=local`), started and stopped in the same command, four full runs, each on a fresh database seeded with `seedSampleFirms` + `seedSampleFirmsFrontOffice`. Actors: user-R (Owner + Case Manager), user-T (Case Manager), user-O (Case Officer; also turned into READ_ONLY, and a Case Officer with `lose`/`convert` removed from `platform_role_permission`), user-S (firm B). "Everyone sees all" (`platform.everyone_sees_all`) is **on by default** (no row; registry default `true`), so own-only cases were run with the row set to `false` through psql. Values and currencies were set through psql (no route sets them in this part). The :4400 demo was not touched.

## Findings

### M1 (Major): a concurrent change gets 404 "No such prospect in your firm" instead of 409 with a reload
`locked()` (`api/src/front-office/sales/prospects.ts:158-163`) reads the prospect joined to its stage (`join fo_stage s on … s.id = p.stage_id … for update of p`). When a second request waits on the row lock and the first one commits a stage change, PostgreSQL re-checks the waiting row's join against the *old* stage row. `s.id = p.stage_id` is now false, so the query returns no row and the request answers `notFound("prospect")`. Every request that waits behind a committed move, Lost, Convert or Undo gets this answer. The brief's rule ("a stale version → 409 with a reload") fails in exactly the race it exists for, and the screen is told the prospect does not exist. Nothing is written twice; only the answer is wrong. Seen in all four runs:
- 4 × `POST prospects/:id/move {stageId:<each other open stage>, cause:"PERSON", version:"22"}` at once → `404,404,200,404`, each with `{"code":"NOT_FOUND","detail":"No such prospect in your firm."}`. Expected: one 200 and three 409 `STALE`. Sent one after another, the same request does give 409 `STALE` ("Representative (Sample) moved this to Consult. Reload it.").
- `convert {version:v}` ‖ `move {stageId:QUALIFIED, version:v}` → `404:NOT_FOUND 200` (either order). Expected: 200 and 409 `STALE`.
- 5 × `convert` at once → `404,200,404,404,404`. Expected: 409 `ALREADY_WON`. 5 × `lost {reasonId:PRICE}` → `404 ×4, 200` (one late request got 409 `TERMINAL`). Expected: 409 `TERMINAL`. 3 × `undo-convert {reason}` → `200,404,404`. Expected: 409 `NOT_WON`.

### m1 (Minor): the version leaks other firms' activity
`versionOf` (`prospects.ts:72-75`) uses `fo_stage_move.seq`, which comes from one sequence for the whole platform (FO-1a trigger, `nextval(pg_get_serial_sequence('"fo_stage_move"','seq'))`). Firm B's Owner engaged one prospect (`version:"26"`). Firm A then made three moves, and firm B's next Engage answered `version:"34"`. Every `GET prospects/:id`, Engage, move, Lost and Convert answer, and every 409 `STALE`, tells one firm how many stage moves the whole platform made in between. Prospect numbers are per firm (B's are P-00001 and P-00002), so the version is the only leak. A count per prospect, or the move id, would leak nothing.

### m2 (Minor): a date filter with year 0000 or 9999 gives 500
`dayOf` (`prospects.ts:30-34`) accepts any four-digit year:
- `GET prospects?from=0000-01-01` and `GET leads?view=all&from=0000-01-01` → 500: PostgreSQL has no year 0.
- `?to=9999-12-31` → 500 on both routes. The `+ 1` day gives year 10000, and Prisma refuses that date (`PrismaClientValidationError` in `var/isolated-logs/breaker_fo2p3-api.log`).
- `?to=0000-12-31` → 500.

Expected: 400 at the field, like `2026-02-30` (which correctly gets 400 "from: a date as YYYY-MM-DD.").

### m3 (Minor): Mark lost and Convert act on a stale screen when no `version` is sent
`locked()` checks the version only when one is given (`prospects.ts:165`), and only `move` requires it. In the test, T moved the prospect, then R sent `POST prospects/:id/convert {}` from the earlier read → 200, the prospect was converted from a stage R never saw. `lost {reasonId}` without `version` behaves the same way. Sent with a stale `version`, both correctly answer 409 `STALE`. The brief states the version rule only for move, so this is Minor. The FO-4 part 2a screen must send `version` on Lost and Convert, or the API should require it.

### m4 (Minor): a Lost note made only of punctuation or emoji is dropped without telling the person
`POST prospects/:id/lost {reasonId:PRICE, note:"!!! — ??? 🙁"}` → 200 with `lostNote: null`. The shared `text()` turns text without a letter or digit into null when the field is optional (`common.ts:29`). The person typed a note and nothing says it was not kept. Expected: keep the note, or answer 422 at `note`.

### m5 (Minor): the prospects list stops at 500 without saying so
Firm A had 621 Individual prospects. `GET prospects` answered 500 rows (`take: 500`, `prospects.ts:127`): no total, no "more" flag, no paging. The board showed all 621, and its totals counted 621. A list of 500 rows and a board of 621 disagree, and nothing tells the screen. Timings held: list 29-51 ms, board 31-39 ms, read 12-14 ms, move 41 ms.

### m6 (Minor): the board's open total counts prospects in a stage the board does not show
With the ENGAGED stage set `active=false` (psql; the pipeline settings are not built yet), `GET pipelines/INDIVIDUAL/board` still had `totals:[CAD 170000 ×2, USD 250000 ×1]`, all from ENGAGED. But ENGAGED is no longer a column, and no visible stage total adds up to it. Cause: `boardTotals` counts `kind: "ACTIVE"` whether or not the stage is active (`board-totals.ts:12`), while the board lists only active stages (`corporate/service.ts:170`). This shows only once stages can be switched off; filed so FO-2 part 5 / FO-4 part 3 do not inherit it.

## What held
- **Money:** CAD, USD and EUR are always separate lines, at the board level and per stage, never added together. LOST (EUR) and WON prospects are not in the open total but are in their own stage's total. Two values of 2,147,483,647 cents sum to `4295137294`, no overflow. An own-only viewer's totals cover only their own prospects (T: USD 250000 only). Firm B's totals are `[]`. The database refuses `currency='cad'` and negative values (`fo_prospect_value_check`).
- **Firm walls:** firm B's Owner got 404 on GET, move, Lost, Convert and Undo of firm A's prospects, and on Engage of firm A's lead (and the other way). `?owner=<firm B staff>` → 400 `UNKNOWN_OWNER`, the same answer as an unknown id. Firm B's list showed only its own P-00001 and P-00002.
- **Own-only, "everyone sees all" off:**
  - O got 404 on read, move, Lost and Convert of T's prospect;
  - the list, `?owner=T` and `leads?view=all&owner=T` gave `[]`;
  - O got 404 on Engage of T's open lead.
- **The Engage message:** after T (the owner) was deactivated, O engaged T's old lead. The answer said "This lead already had 3 prospects. This is another one." and named none of T's numbers.
- **Roles:**
  - READ_ONLY: list, read and board give 200 (own only); move, Engage, Lost, Convert and Undo give 403 `MISSING_PERMISSION` with the key named;
  - Case Officer without `lose`/`convert`: Lost, Convert and Undo give 403;
  - no token gives 401.
- **Move guards:**
  - into WON → 422 `WON_BY_EVENT` with AG-2-26's words; LOST → 422 `USE_MARK_LOST`; NURTURE → 422 `USE_PARK`;
  - same stage → 409; out of WON or LOST → 409 `TERMINAL`; out of NURTURE → 200;
  - a stage that is inactive, from the Corporate pipeline, from firm B or not a uuid → 422;
  - version missing, `"1.0"`, `-1` or `1e21` → 422; cause `CONVERT` or `null` → 422;
  - a non-uuid prospect id (`1 or 1=1`) → 404; an array body → 422; a broken JSON body → 400; a 60 MB body → 413.
- **Lost:**
  - no reason, a lead-close reason, `COMBINED_PROSPECT`, firm B's reason or an inactive reason → 400 `REASON_REQUIRED`;
  - a note over 2,000 characters (also 5 MB) → 422; NUL, U+202E or a number as note → 422;
  - a French, Japanese and Arabic note with a line break is kept exactly;
  - Lost twice, or on a WON prospect → 409;
  - the default list leaves Lost out; `?stage=lost` shows it.
- **Convert and Undo:**
  - Convert twice → 409 `ALREADY_WON`; Convert of a lost prospect → 409; Convert of one won by signature → 409;
  - Undo with no reason, `"..."`, more than 2,000 characters or a control character → 422;
  - Undo goes back to the earlier stage, writes the INTERNAL note, and keeps the reason out of the audit line; Undo twice → 409 `NOT_WON`;
  - Undo after a `CLIENT_SIGNED` or `SIGNED` retainer → 409 `SIGNED`; Undo of a prospect won `SIGNED_OFFLINE` → 409;
  - parallel Converts wrote one `prospect.won`; parallel Losts wrote one audit line.
  - Reading the code (no test): Undo racing Signed offline cannot end "open with a signed retainer". Signing locks the prospect after it updates the retainer, so it either sees WON and leaves it, or wins the prospect after Undo.
  - Invoices on `main` reference a person with no foreign key, and no code writes them. The README discloses this, so the missing case and invoice checks are not a finding here.
- **Engage:**
  - 6 at once on one lead → 6 prospects, the first `again:false` and the rest `again:true`;
  - Engage racing Close → `201` and `409 STATE`, ending ENGAGED with one prospect;
  - a closed lead → 409 `LEAD_CLOSED`; an upper-case uuid works.
- **Date filters:**
  - `2026-02-30`, `2026-13-01`, `2026-1-01`, a repeated `from`, and `from` after `to` → 400 on both lists; a repeated `owner` or `owner=nope` → 400;
  - a lead that arrived at 2026-11-18 03:30Z is found by `from=to=2026-11-17` in the firm's zone, and not by `2026-11-18`.
- **Audit:** every audit line on `fo_prospect` and `fo_lead` has a typed actor (0 untyped).
