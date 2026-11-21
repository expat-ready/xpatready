# FO-3a1e break report: firm timings (runtime + migration, no screen)

PR #2727, commit `7ccd544dbadb5df1c0f59572bcdc3fbaa95c9154` (branch `claude/runtime-fo3a1e-timings`). Breaker: schema and permissions. Scope: brief `lead-b-briefs/FO-3a.md` "Firm timings", DW19-DW21.
How I tested: scratch databases on 127.0.0.1:54329 (`xr_studio_brk_*`, all dropped afterwards). Migrations up to 20261121090000 applied with psql, then real rows added (2 firms, types holding default and their own values, bookings), then this migration, then rollback.sql, compared with a reference database. A small Nest app (the same harness as `tests/check_fo3a_hours_timings.ts`, Db walled as xr_app) for the HTTP attacks. US$0, live AI off, :4400 not touched.
Note: while I was testing, the branch moved to `e43a9f86e` in the shared checkout (a test-only fix for M1 below). The source files are the same in both commits.

## Blockers
None.

## Majors
**M1. An existing CI suite fails at 7ccd544: `tests/check_fo1b_booking_schema.ts` gives 79 passed, 1 failed.**
Reproduce: at 7ccd544, run `tsx --tsconfig api/tsconfig.json tests/check_fo1b_booking_schema.ts`. It prints `FAIL FO-1b pass: a type takes AG-4-66's Sample timings when none are given (gap 0 / 10 min ...)` (tests/check_fo1b_booking_schema.ts:98-100). The suite applies every migration from FO-1b onward, so this migration's `DROP DEFAULT` is included. A type inserted with no timings now reads NULL, so the `'0/10/240/60/240/-/FREE_CONSULT'` assert fails. On main this suite gives 80/80 (qa report ci-44598210725-suites.txt:423). The merge-queue batch would go red.
Status: commit `e43a9f86e` (test-only) rewrites the assert to `-/-/-/-/-/-/FREE_CONSULT`, and I re-ran it there: 80/80. That is the right fix. 7ccd544 itself does not have it.

## Minors
**m1. Keys named after JavaScript object properties give a bare 500, not a Problem Details 400 (STANDARDS §6 [M]).**
Reproduce, as any holder of `agent/booking-event-type:list` (READ_ONLY included):
`PUT /api/front-office/booking-timings` with body `{"constructor":1}`. Also `{"toString":1}`, `{"valueOf":1}`, `{"hasOwnProperty":1}` and `{"__defineGetter__":1}`.
Result: 500 `{"statusCode":500,"message":"Internal server error"}`. `PATCH /booking-types/:id/timings` with `{"version":1,"constructor":1}` also gives 500.
Cause: timings.ts:135 runs `fields[f] ??= …` on a plain `{}`. `fields.constructor` is inherited, so nothing is assigned. `invalid()` then reads `first[1]` of an empty list (timings.ts:114-115) and throws a TypeError.
types.ts:109 has the same pattern. It was already there before this PR (`POST booking-types` with such a key also gives 500 on main), but the new route reuses it. Nothing is saved.
Fix direction: use `Object.create(null)` or `Object.hasOwn`.

**m2. The recorded rollback order opens an outage window.**
rollback.sql:3 says "Roll the code back first". Main's code, once restored, reads the NULL timings. `null * DAY` is 0, so in main's slots.ts:60-61 `latest = now`. Every type that inherits the firm's values (nearly all of them after the backfill) then offers no times on the public page until rollback.sql runs.
The other order is safe: run rollback.sql first, then roll back the code. The new code resolves non-NULL values unchanged; only a "reset to firm default" PATCH would hit NOT NULL during that window.
The data restore itself held (see below).

**m3. The firm's Timings save does not warn when it makes a type unbookable (§12 / STANDARDS §3.6).**
Reproduce:
1. `PATCH booking-types/T/timings {version, minNoticeMinutes: 2880}` gives 200 with no warnings. The window is still 60, inherited.
2. `PUT booking-timings {windowDays: 1}` gives 200 with `warnings: []`.
3. Type T now resolves to notice 2,880 minutes against a window of 1 day. Public slots over a month: 0.
`GET booking-types/T` has no `warnings` field.
Cause: `read()` checks only the firm's own pair (timings.ts:125). Only `updateTimings` checks the type's resolved pair (types.ts:203).

**m4. The firm's Timings have no version, so a full-form save can silently undo another admin's change (STANDARDS §4 [M] optimistic concurrency).**
`write()` (timings.ts:138-143) skips only the fields equal to the *current* stored value. Example:
- Admin 1 reads gap after 10.
- Admin 2 saves 30.
- Admin 1 saves the form with all six fields (gap after still 10, only notice edited).
- The server sees 10 ≠ 30 and writes 10 back. Admin 2's change is lost with no 409.
I confirmed this mechanism with 8 parallel PUTs: all 200, and the last writer wins. The audit from→to chain stays consistent.
The settings home has no versions elsewhere either, so this may be accepted. Recording it for Lead B.

**m5. The database does not check the stored firm value (STANDARDS §3.4 "checked twice").**
The trigger casts with `(value #>> '{}')::int` (migration.sql:60-61) without checking the value's type:
- `10.5`, `30.0`, `"abc"`, `[30]` and `{}` refuse every booking write for that firm with a raw 22P02 error.
- `1e10` gives 22003.
- `-600` gives "range lower bound must be less than or equal to range upper bound".
- `"30"` is accepted as 30, while `firmTimings()` throws on it (timings.ts:82).
- JSON `null` silently pads by the default, while the app throws.
I found no app path that can store such a value. writeSetting runs zod (settings.ts:159). The demo reset writes only registered defaults or SAMPLE values through writeSetting (demo-reset.ts:33-35). No seed writes these keys. So this is defence in depth only; a `jsonb_typeof(value)='number'` guard would close it.

## What held
- **Exclusion with NULL gaps** (run as xr_app, firm A session). A type with NULL gaps pads by firm A's value (30), never firm B's (90) or the default. NULL plus no firm row gives 0/10. A neighbour inside the padding is refused (`fo_booking_no_overlap`). A booking keeps its padding after the firm value changes (rule 8). Through the API, public slots, staff warnings and the trigger agree: with firm gaps 30/30, a 11:00 booking blocks 10:30-12:00; 10:00 and 12:00 are not offered; a zero-gap type offers 10:00 and 12:00, and its 10:30 booking gets 409 WARNINGS.
- **PF-12.** After the migration, `fo_booking_write` is SECURITY DEFINER, owned by xr_wall_reader, `search_path=pg_catalog, public, pg_temp`. The firm read is keyed by `NEW.firm_id`, which the `0_pf12_firm_first` gate pins to the session firm. The public door reads the firm's values (its slots move with the firm's gap). No cross-firm reads: firm B's PUT leaves firm A's GET unchanged.
- **Permissions.**
  - No sign-in: 401. Billing/Finance: 403.
  - READ_ONLY reads (200). READ_ONLY saving unchanged values or all-null on a type that is already null gets 200, writes nothing and adds no audit line. Any real change gets 403, including reordered reminders `[60,1440]` and an explicit value equal to the firm's on a type.
  - Firm B owner on a firm A type: 404. Bad uuid: 404.
  - The general `PATCH booking-types/:id` and `POST booking-types` refuse timing fields (400).
- **Type confusion.** `"60"`, `[60]`, `true`, `null` (firm), `1e400`, 2^53+1, reminder strings, floats and an empty list all give 400 with the allowed range. Extra keys (`firmId`, `id`) give 400. `version` as a string, missing, 0 or above the safe-integer limit gives 400. `-0` does not count as a change. `__proto__` is ignored.
- **Concurrency.** 5 parallel type PATCHes with the same version: one 200, four 409. 8 parallel first writes of a firm key: all 200, no P2002 or 500, 8 audit lines chained from→to. Four different keys in parallel: all saved.
- **Migration on real data.** Types holding default values became NULL, their own values stayed, and the existing bookings' `block_range` did not change.
- **Rollback.** rollback.sql (`-1`) restored what each type used, the firm's value included (t1 0/30, tb 0/90, own values unchanged). The function text, nullability, defaults, owner, SECURITY DEFINER and search_path are byte-identical to the pre-migration reference.
- **Schema drift.** `prisma migrate diff --from-config-datasource --to-schema prisma/schema` after the migration: "This is an empty migration."
- **Suites (tsx --tsconfig api/tsconfig.json).** check_fo3_booking 133/0. check_fo3a_hours_timings 43/0. check_fo3a_booking_types 48/0. check_fo3a2_feed 26/0. check_fo3a1c_set_names 20/0. check_fo1b_booking_schema: 79/1 at 7ccd544 (M1), 80/0 at e43a9f86e.
- **Out of scope.** No role has only one of `:edit` and `:configure-availability`, so the per-field split (`timingKey`) cannot be exercised with stock roles. The `changePermission` stored for the gap keys is `:edit` (as the brief orders) while the service enforces `:configure-availability`. No generic setting writer exists that would use the stored key.

Verdict: Changes requested

## Re-break 18b828e (P-277: only `git diff 7ccd544db 18b828efa`)
Same set-up: scratch databases `xr_studio_brk_*` (dropped), the walled Nest harness, US$0, :4400 not touched. **Blockers:** none. **Majors:** none (M1 is fixed: fo1b 80/0).
**Fixes that held**
- **m1:** `constructor`, `toString`, `hasOwnProperty`, `valueOf` and `__defineGetter__` now give a 400 naming the field on `PUT booking-timings` (also as READ_ONLY with a bad value: both fields named), `PATCH booking-types/:id/timings` and `POST booking-types`. `__proto__` is ignored.
- **m2:** rollback.sql runs first. With a 10.5 or window-0 firm value it aborts in its one transaction and leaves the columns nullable (fails safe). With `"45"` stored it fills the default, as the trigger does.
- **m3:** the firm PUT/GET warning names the stranded type both ways round (type notice vs firm window, type window vs firm notice), and `GET booking-types/:id` (READ_ONLY) warns.
  - Deleted types drop out; firm A's and firm B's warnings never name each other's types.
  - Cost: one query per read; with 600 affected types GET took 14 ms (then 8), PUT 26 ms; capped at 10 names (~800 characters).
- **m5 (strings, arrays, objects, null):** now read as unset (pad 10), checked as xr_app; `-0` pads 0; `1e3` and `3e1` read as 1000 and 30. Still SECURITY DEFINER, owned by xr_wall_reader, search_path pinned.
- **Suites at 18b828e:** fo1b 80/0 · fo3_booking 133/0 · fo3a_hours_timings 46/0 · fo3a_booking_types 48/0 · fo3a2_feed 26/0 · fo3a1c_set_names 20/0.

**Minor left (not blocking)**
- **m5 is closed only for non-numbers:** `jsonb_typeof = 'number'` still passes numbers that are not whole or not in range (migration.sql:61, rollback.sql:7-11). `10.5`/`30.0` give 22P02 on every booking write for that firm, `1e10` gives 22003, `-600` gives the range-bound error.
  - No app path stores these (writeSetting runs zod `.int().min().max()`; JSON `30.0` arrives as 30, stored `30`), so this is defence in depth. Possible guard: `AND (s.value #>> '{}') ~ '^[0-9]{1,4}$'`.
- **m4** stays with Lead B, as stated.

Verdict: Approve 18b828efac544e60f8927ae6dba2214bc8c1288b

## Re-break 75294c5 (P-277: only `git diff 18b828efa 75294c5f9`, screens excluded)
Scratch database `xr_studio_brk_fin_*` (dropped); trigger run as xr_app in firm A's session, firm gap after varied:
- **Read as stored:** `0`, `1440`, `30`, `1e3` (1000), `3e1` (30), `999999`; `-0` pads 0. **Read as unset (pad 10):** `30.0`, `10.5`, `-600`, `1e10`, `1000000`, `"30"`, `null`, `"abc"`, `[30]`. No error on any value; still SECURITY DEFINER, owned by xr_wall_reader, search_path pinned.
- **rollback.sql (`-1`):** non-matching values fill the defaults and the columns end NOT NULL. A whole number outside the column CHECK (window `-0`, `1440`, `999999`) aborts the transaction and leaves the columns nullable (fails safe; zod in writeSetting stops such values).
- **Suites at 75294c5:** check_fo3a_hours_timings 46/0, check_fo3_booking 133/0, check_fo1b_booking_schema 80/0. No new findings; m4 stays with Lead B.

Verdict: Approve 75294c5f9c871df82b66e056dd76c76c97b400a5
