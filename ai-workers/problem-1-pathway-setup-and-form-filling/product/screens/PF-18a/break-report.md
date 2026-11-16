# PF-18a part 1, break report (offices: API + schema, no screen)

Breaker, 16 Nov. Head under test: **081df1d** (code; 120e280 adds records only). My first round ran on 6ba0a5e; I restarted the
isolated copy on 081df1d, ran every finding below again there, and all of them reproduce. Isolated copy `brk18a` on :4547
(`PLATFORM_IDENTITY=local PLATFORM_SAMPLE_SEED=on`), now stopped. Tokens came from `POST /api/platform/session/local`.
I added a Read only user and an Admin to sample-firm with SQL. Live AI off, US$0.
Scope is part 1 of the brief only. Not tested: screens (PF-18s), part 2, `hostZone()`.
**Note:** while I was finishing, the shared checkout gained *uncommitted* edits: `service.ts` `change()` now takes the firm's
advisory lock ("review m1, m2"), and the contract and test files are edited too. These edits look aimed at B1 and B2, but they
are not on any commit, so I have not checked them.

## Breaks

**B1. Major: two parallel renames create offices whose names differ only by case.** Steps: firm sample-solo has offices
"Par 2" and "Par 3". Send `PATCH /api/platform/offices/<Par 2> {"name":"Twin1"}` and `PATCH …/<Par 3> {"name":"twin1"}` at
the same moment (two `curl &`). Expected: one 200 and one 409 "An office with this name already exists." Actual: both 200,
5 tries out of 5 on 6ba0a5e and 3 out of 3 on 081df1d. The firm ends up with `Twin3` and `twin3`. Why:
`change()` (service.ts:114-132 at 081df1d) checks the name case-insensitively but does not take the firm lock that `add()`
takes (:83). The database does not catch it either: `platform_office_firm_id_name_key` (migration.sql:20) is a case-sensitive
unique index. As xr_app with app.firm_id set, `insert … name 'a2'` beside an existing `A2` succeeds. So the rule is not
"checked twice" (STANDARDS §3.4) and duplicates by meaning get in (§3.2).

**B2. Major: two sessions saving the same office lose an update silently, and the audit trail is wrong.** Steps: send
`PATCH …/<Par 4> {"timeZone":"America/Regina"}` and `{"timeZone":"America/Halifax"}` at the same moment. Expected: the second
save gets 409 with what changed (STANDARDS §4 [M]: version column, stale save → 409). Failing that, the saves should at least
be serialized so each audit "before" is true. Actual: both get 200 and the last one wins. The two audit lines read
"Office time zone changed from America/Edmonton to America/Halifax" and "…from America/Edmonton to America/Regina". One of
the two "from" values is false, which breaks AG-1-74 §9's before/after line. There is no version field on the office, in the
body or in the view.

**B3. Major: the real OfficeClock gives wrong values without any error when it runs outside the firm's database scope; the
fake does not.** Steps (tsx script, `OfficeClock` over `Db`, after `wallUnscopedQueries()` as in the server; firm B stores
`platform.time_zone = America/Vancouver`, and staff S is in office OB):
- With no scope, or inside `withFirm(A)`, `zoneFor(B, null)` returns **"America/Toronto"**. That is the platform default,
  neither firm B's zone nor a refusal.
- `officeOfStaff(B, S)` returns **null**, as if S had no office.
- `zoneFor(B, OB)` throws OfficeNotFound.

Inside `withFirm(B)` all three are correct (Vancouver, the office's zone, OB). `fakeOfficeClock` gives firm B's values
whatever the caller's scope. So the two adapters disagree, and the shared contract (office-clock-port.contract.ts) never
tests a caller outside the firm's scope. The port file says the caller gets the firm's own settings or a refusal ("never
another firm's values"). A job or a cross-firm caller (PF-29c clocks, FO-3st1) would instead get a wrong time zone with no
sign of it. Source: clock.ts:23-36 (`readSetting` falls back to the default when the row is hidden by PF-12).

**B4. Minor: a zone the schema accepts but PostgreSQL rejects gives a 500.** I compared every ICU zone and every
`pg_timezone_names` entry against `TIME_ZONE.schema`. `US/Pacific-New` passes the schema but fails the trigger
(migration.sql:48). `POST {"name":"PN","timeZone":"US/Pacific-New"}` and the same `PATCH` both return **500 "Server error"**.
Expected: 400 `ZONE_REFUSED`. Also, a firm whose stored `platform.time_zone` is that value (`writeSetting` accepts it) could
never add a second office: the first-office insert fails with a 500 every time.

**B5. Minor: the database checks on hours, closed days and zone are weaker than the code's, and one bad row breaks the whole
list.** As xr_app with app.firm_id set:
- `update platform_office set business_hours='[1,2]'` is accepted. The only check is "array of at most 7" (migration.sql:34).
- `closed_days '["nope",5]'` is accepted.
- `time_zone 'Factory'` is accepted (it is in `pg_timezone_names`, but the schema refuses it).

After that, `GET /api/platform/offices` returns **500** for every person in the firm, because `view()` (service.ts:50)
parses each row. `PATCH {"name":…}` on that office also returns 500 and rolls back. The only repair is a PATCH that sends
`businessHours` again. With `Factory` stored, `OfficeClock.zoneFor` throws a ZodError.

**B6. Minor: names that look the same are stored as different offices.** Each of these returns 201 beside an office that
looks identical: `"Café"` written NFC and NFD; `"Same​"` (zero-width space) beside `"Same"`; `"abc‮dcba"`
(right-to-left override); `"a b"` (line separator). Neither the code's control-character check (service.ts:24,
`\u0000-\u001f\u007f-\u009f`) nor `[[:cntrl:]]` catches them. Separately, 61 emoji (61 characters) are refused with "at most
120 characters", because the length is counted in UTF-16 units while the database counts characters.

**B7. Minor: address input is dropped without telling the person.** `PATCH {"province":"BC"}` on an office whose country is
US returns 200 with `province:null`, and the value is discarded. `country:"ZZ"` (not an ISO 3166 code) is accepted and
stored (service.ts:26 checks only "two letters").

**B8. Minor: an empty change writes an audit line.** `PATCH …/<id> {}` returns 200 and adds an "Office changed" line each
time. The audit count went from 3 to 4, with nothing changed.

**B9. Minor (new at 081df1d): one database rule was dropped.** Removing `platform_staff_office_write` also removed "the
person and the firm never change". As xr_app, `update platform_staff_office set staff_id=<another staff of the same firm>`
now succeeds. That moves one person's office record onto someone else with no audit line. The keys still stop a move to
another firm.

Question, not scored: once offices exist, the first office and the firm's own settings can drift apart. For example, a PATCH
moves the first office to `Europe/London`, while `zoneFor(firm, null)` still reads `platform.time_zone`. Which of the two is
meant for a staff member with no office is for Lead B to say.

## What held
- **Permissions:**
  - no token → 401; a tampered token → 401; an `x-actor` header without a token → 401.
  - Case Officer and Read only: POST and PATCH → 403 `MISSING_PERMISSION` (also on their own firm's office); GET → 200.
  - Admin can edit. Owner can edit.
- **Across firms:**
  - Firm A's PATCH on firm B's office → 404, also with the id in capitals; a non-uuid id → 404; there is no `GET /:id`.
  - Firm A's list never shows firm B's rows.
  - As xr_app: no insert or update of another firm's row, no moving a row to another firm, no unknown firm.
  - Staff office: no staff member of another firm, no office of another firm, no unknown staff member (all refused by the keys
    at 081df1d).
  - No delete; TRUNCATE is refused; `is_first` cannot be flipped; a second `is_first` is refused.
  - As xr_studio: deleting an office is refused by the trigger; firm and staff deletes are blocked.
- **Parallel adds:** 6 parallel POSTs on a firm with no office give exactly one first office and 7 rows. 4 parallel POSTs of
  the same name give one 201 and three 409. "same " / "Same" → 409.
- **Zones:**
  - `America/Toronto ` (trailing space), `america/toronto`, a number, `null`, `Factory` → 400 `ZONE_REFUSED`.
  - `UTC`, `Etc/GMT+5` and `Asia/Calcutta` are accepted.
  - The database refuses a trailing space and `posix/…`.
- **Provinces:** `XX`, `Ontario` → 400 `PROVINCE_REFUSED`; a number → 400; ` qc ` → QC; `CANADA` → CA.
- **Bodies:**
  - Unknown keys (`firmId`, `isFirst`), `[]`, `null`, `"x"`, `{}`, a blank name, a control character, 121 characters → 400.
  - A 2 MB body and nesting 5,000 deep → 400, not 500.
  - Lone surrogates → U+FFFD, then a clean 409.
  - Hours: start after end, the same day twice, `24:00`, an object, `null` → 400. Closed days: `2026-02-30`, a duplicate,
    `null` → 400.
  - French and CJK names are fine.
- **Port:** a non-uuid office → OfficeNotFound; a bad firm id is refused; the values handed back are copies;
  `check-port-contracts.mjs` passes (14 ports, 0 problems).
- **Budgets:** with 100+ offices, GET takes 9-19 ms (51 KB) and POST about 30 ms. The `pg_timezone_names` lookup in the
  trigger costs about 11 ms per write.
- **Builder's suite:** `tests/check_pf18a_offices.ts` passes (71/71 at 6ba0a5e; 77/77 on the working tree at 081df1d plus
  the uncommitted edits).
