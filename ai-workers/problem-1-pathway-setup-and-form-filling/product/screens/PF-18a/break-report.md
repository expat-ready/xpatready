# PF-18a part 1, break report (offices: API + schema, no screen)

Breaker, 16 Nov. Rounds: 6ba0a5e, then 081df1d (every break below reproduced there), then **9b1dc85** (this update: the
builder's fixes for B1–B9, on a fresh isolated copy `brk18a` on :4547 with `PLATFORM_IDENTITY=local PLATFORM_SAMPLE_SEED=on`,
now stopped).

**Set-up:** tokens from `POST /api/platform/session/local`; a Read only user and an Admin added to sample-firm with SQL;
database checks as xr_app with `app.firm_id` set and as xr_studio; port checks in a tsx script over `OfficeClock`/`Offices`
with `wallUnscopedQueries()`, as the server does. Live AI off, US$0. Scope: part 1 of the brief only (no screens, no part 2,
no `hostZone()`).

**Status on 9b1dc85:** 5 fixed, 4 partly fixed (one Minor left in each). No Blocker or Major is open.

## Breaks and their status on 9b1dc85

**B1 Major, case-only duplicate names under parallel renames: FIXED (one Minor left).** Each try sends two parallel PATCHes,
"TwinN" on office A and "twinN" on office B, each with its current `version`. Through the API, 5 of 5 tries gave no duplicate
(final names `Twin4`, `twin5`); a parallel "Dup"/"dup" pair gave 200 and 409. `change()` now takes the firm lock, and the new
index `platform_office_firm_name_ci` (firm_id, lower(name)), migration.sql:42, refuses `PAR 1` beside `Par 1` as xr_app.
- *Left, Minor:* the databases' collation is `C` (pg_database `datctype = C`), so `lower()` folds only A–Z. As xr_app, `ÉCOLE`
  and `école` insert together; the API still refuses the second (409), so only direct writes get past. Greek final sigma is
  the reverse case: `ΟΔΟΣ` and `οδοσ` are both 201 through the API, because JS lower-cases a word-final Σ to ς.

**B2 Major, lost update on parallel PATCH: FIXED.** Two parallel PATCHes with the same `version` give 200 and 409, with one
audit line whose "from" is true. A stale `version` → 409 "Someone changed this office since you opened it", with `current`
(a no-op change too). A missing or non-string `version` → 400. After a direct `updated_at = now()` (microseconds), the version
from GET → 200 (the truncation matches). A cross-firm PATCH with any version → 404, and nothing from `current` leaks.

**B3 Major, the real OfficeClock answered defaults outside the firm's scope: FIXED.** With no scope or under `withFirm(A)`,
`zoneFor(B, null)` and `officeOfStaff(B, S)` now throw "OfficeClock: the firm is not readable here", and `zoneFor(B, office)`
→ OfficeNotFound. Under `withFirm(B)`: Vancouver, the office's zone and the office id, all correct.
`check-port-contracts.mjs`: 14 ports, 0 problems.

**B4 Minor, 500 for `US/Pacific-New`: PARTLY FIXED.** POST and PATCH with that zone → 400 `ZONE_REFUSED` (`zoneGuard`).
- *Left:* the first-office insert is not wrapped in `zoneGuard` (service.ts:96, unlike :106). A firm whose stored
  `platform.time_zone` is `US/Pacific-New` (`writeSetting` accepts it; no route today, so I set it with SQL) still gets
  **500** on its first add, and nothing is written. An office abroad pre-fills that firm zone and gets 400 "Choose a time
  zone from the list", although the person chose no zone.

**B5 Minor, database checks weaker than the code's, and one bad row breaks the list: PARTLY FIXED.** Now refused as xr_app:
hours `[1,2]`, an unknown day, a missing `closes`, closed days `["nope",5]`, and `Factory` (new `platform_office_zone_check`).
- *Left:* the jsonpath checks (migration.sql:35-36) still accept, as xr_app: hours with **numbers**
  (`{"opens":900,"closes":1700}`, because `like_regex` on a non-string is "unknown" and the filter passes); opens after closes;
  the same day twice; an extra key; closed day `2026-02-30`; a date listed twice. All of these fail the code's schemas. After
  the numeric-hours update was committed, `GET /api/platform/offices` returned **500** for the whole firm again, until I
  repaired the row with SQL.

**B6 Minor, lookalike names: PARTLY FIXED.** Now: NFD `Café` → 409 beside the NFC one; zero-width space, right-to-left
override and U+2028 → 400; 120 emoji → 201, 121 → 400 (counted as characters).
- *Left:* 201 beside `Main office`, so it reads the same: spaces `Main office` (no-break), `　` (ideographic),
  ` ` (en); invisible `᠎`, `͏` (combining grapheme joiner), `ㅤ` (Hangul filler), `⠀` (blank Braille),
  and a tag character (`󠁁`). I do not count the Cyrillic `Т` as a finding.

**B7 Minor, address input dropped silently / any two letters accepted as a country: PARTLY FIXED.** Now: a province on an
office abroad → 400 "A province or territory is for an office in Canada" (POST and PATCH); `ZZ`, `QQ`, `XK` → 400.
- *Left:* `UK`, `EU`, `UN`, `EZ`, `AC`, `TA`, `DG`, `EA`, `IC`, `CP` → 201, stored as given; none is an assigned ISO 3166-1
  code, so a person typing `UK` gets `UK`, not `GB`. Cause: `Intl.DisplayNames` names reserved codes too (service.ts:25).

**B8 Minor, empty change audited: FIXED.** `{version}` alone, `{version, timeZone: <same>}` and `{version, businessHours:
<same>}` each return 200, and the audit count stays at 2.

**B9 Minor, `staff_id` could be repointed: FIXED.** As xr_app, `update … set staff_id` or `firm_id` → permission denied
(column grants, migration.sql:66); `office_id` can still change. `Offices.setStaffOffice` under `withFirm(B)`: move, clear
and set again all work with the new grants.

Answered, not scored: the first office drifting from the firm's settings is intended (AG-1-74: "case has no office → firm
time zone"); the builder is putting it to Lead B in the PR.

## Things the fixes could have broken: none broken
- Database checks do not refuse values the code accepts. Each → 201: `America/Argentina/Buenos_Aires`,
  `America/Port-au-Prince`, `Etc/GMT-14`, `Etc/GMT+12`, `UTC`, `America/North_Dakota/New_Salem`, `Antarctica/DumontDUrville`,
  `America/Indiana/Knox`, hours `[]`, all 7 days 00:00–23:59, 366 closed days, `2028-02-29`, a heart emoji with its variation
  selector.
- PATCH `{"country":"US"}` on an office with a province → 400, saying to clear it; with `"province":null` → 200. A blank
  province on an office abroad → 200 (read as none).

## What held (all rounds; "3" = checked again on 9b1dc85)
- **Permissions (3):** no token, a tampered token, or an `x-actor` header without a token → 401. Case Officer and Read only:
  POST and PATCH → 403, GET → 200. Admin and Owner can edit.
- **Across firms (3):** firm A's PATCH on firm B's office → 404 (also with the id in capitals or a bad version); a non-uuid id
  → 404; firm B's rows never appear in firm A's list.
- **Database walls:** as xr_app, no insert, update or move of another firm's office and no unknown firm; staff office: no staff
  member or office of another firm (the keys, from 081df1d); no delete; TRUNCATE refused; `is_first` cannot be flipped and a
  second one is refused. As xr_studio: an office delete is refused; firm and staff deletes are blocked.
- **Parallel adds (3):** 6 parallel first adds → exactly one first office, 7 rows. 4 parallel adds of one name → one 201,
  three 409.
- **Zones and provinces (3):** `America/Toronto ` (trailing space) and `america/toronto` → 400; province `XX` or `Ontario` →
  400; ` qc ` → QC; `CANADA` → CA.
- **Bodies:** unknown keys, `[]`, `null`, a blank name, a control character, 121 characters → 400; a 2 MB body and nesting
  5,000 deep → 400; bad hours and closed days → 400; lone surrogates → a clean 409.
- **Budgets (3):** with 100+ offices, GET takes 13–14 ms and POST 35–74 ms.
- **Builder's suite:** `tests/check_pf18a_offices.ts` passes 85/85 on 9b1dc85.
