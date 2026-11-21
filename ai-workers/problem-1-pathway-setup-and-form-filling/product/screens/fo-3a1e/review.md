# FO-3a1e review: firm booking timings (runtime + migration, no screen)

PR #2727, reviewed commit `7ccd544dbadb5df1c0f59572bcdc3fbaa95c9154` (branch `claude/runtime-fo3a1e-timings`). Independent reviewer; I did not build this.
Bar: `lead-b-briefs/FO-3a.md` "Part 1b" → "Firm timings", its route list (booking-timings, PATCH booking-types/:id/timings), DW19-DW21 (timings halves); AG-4-4/-5/-66 (requirements-2026-11-02 AG-04 l.432); Lead B's ruling (comment 7057396435). US$0, live AI off, :4400 not used.
Note: during the review the builder pushed `e43a9f86e` (test-only, one file) into the same checkout. The source is the same in both commits. My suite runs below that start after 05:13 used e43a9f86e's copy of `check_fo1b_booking_schema.ts`.

## What I ran
* `check_fo3a_hours_timings.ts`: run 1 stopped at the first new HTTP call with `fetch failed / ECONNRESET` (see m6). Run 2: **43 passed, 0 failed**, exit 0.
* Every other booking suite: fo1b_booking_schema 80/0 (at e43a9f86e), fo3a_booking_types 48/0, fo3_booking 133/0, fo3a2_feed 26/0, fo3a1c_set_names 20/0, fo3sa_any_time 39/0, fo3m_answers 14/0, fo3pa_public_answers 45/0, fo3sr_routes 29/0, fo3vr_visibility 24/0, fo3a2_consult_record 39/0.
* `tsc -p api/tsconfig.json --noEmit`: no error under `api/`. Only old errors in unrelated `tests/` files remain. The typed `TypeRow = WithTimings<…>` makes the compiler check that every reader in service.ts gets resolved timings.
* PF-12 by hand, on a scratch database with every migration, as `xr_app` with firm A's `app.firm_id`. Firm A stored gap after 25; firm B stored 77/99. A NULL-gap booking padded **0/25**: firm A's value, nothing from firm B, and the default before. `platform_firm_setting` showed 1 row under RLS. The function is SECURITY DEFINER, owned by `xr_wall_reader`, with search_path pinned (also asserted in DW21).
* `graph.mjs --check`: exit 0. G3 lists the three new routes as untested. That is the graph failing to read the suite's `F()` helper: every 1b-i route in the same file shows the same. Not a real gap.

## Checks the caller asked for
* **Resolve order everywhere.** I searched the whole studio (api, web, tests, journeys, seeds, SQL) for the five column names. The only readers are the 8 `withTimings` reads in service.ts, the preview (types.ts:226), `get`/`updateTimings` (`effectiveTimings`), feed.ts:107 and the trigger. All resolve in the order type → firm → default. `publicList` and `availability.ts:177` do not read timings. In web, only `selfServiceLimitHours` is read, fed from the resolved feed and public answers.
* **Trigger defaults = registered defaults.** 0 and 10 in migration.sql:60-61; 0 and 10 in timings.ts:56-57. DEFAULT_TIMINGS is built from the registry. DW21 checks a fresh pad of 0/10 and the firm's 25.
* **Changed-field permission checks.** No bypass. The type route needs `version` and compares it under the row lock (types.ts `change`), so a change between the unlocked read and the lock gives 409. The firm route writes only the fields that differ from the value read in the same transaction, so an "unchanged" field the caller lacks the key for is never written. The general `PATCH booking-types/:id` does not accept timing fields.
* **Ranges vs database CHECKs.** They match: gaps 0-1,440; notice and self-service 0-525,600; window 1-730. Each refusal carries its range in words on the field (§10). NULL passes the CHECKs, as intended.
* **Audit.** Type: `booking_type.timings_changed`, "Booking type "X" timings changed.", fields before and after. Firm: one `platform.setting.change` per changed key with from/to and "(booking timings changed)". Refusals write nothing (DW21 fail).
* **Backfill and rollback.** NULL is written only where the value equals today's default, and no firm had a value, so slots are unchanged (FO-3 suites green). rollback.sql fills each NULL with the firm's value, else the default, then restores NOT NULL and the defaults and FO-1b's trigger text with its definer settings. The suite proves both directions on a copy of main's schema.
* **Reminder offsets stored but not used** (declared in the PR's question 2). Not blocking. The brief limits this row to registering them and to the slot and self-service readers, and DW19 asks only that the read shows them. But the gap must not reach a person: see m1.

## Blockers
* **B1. A required suite is red at 7ccd544: `tests/check_fo1b_booking_schema.ts:98-100` fails (79/1).** The brief's "Must still be true: every FO-1b … suite" is broken.
  * Scenario: the suite inserts a type with no timings and expects `0/10/240/60/240/-/FREE_CONSULT`. This migration drops the DEFAULTs, so the columns are NULL, the `||` concat is NULL, and the check fails. CI goes red.
  * Fixed by `e43a9f86e`: the assert now expects `-/-/-/-/-/-/FREE_CONSULT`, and 80/0 when I ran it. That fix is correct and is the only change from 7ccd544.

## Majors
None.

## Minors (Should)
* **m1. Reminder offsets are accepted but have no effect** (timings.ts:52-53; service.ts still schedules at 24 h and 1 h).
  * Scenario: an Owner sets `[2880, 120]` and gets 200, yet reminders still go out 24 h and 1 h before.
  * Fix: give the follow-up row the PR proposes a BACKLOG entry before FO-3st3b shows the field as editable. Until then FO-3st3b should label it or not offer it.
* **m2. The type editor's §12 warning is incomplete** (timings.ts:98-99, 125; types.ts:177).
  * Scenario: a type with notice 2,880 min and an inherited window. The firm then sets its window to 1 day: 200 with `warnings: []`, and the type silently offers no times.
  * `GET booking-types/:id` has no `warnings`, so the Advanced panel cannot warn when it opens. Add `warnings: timingWarnings(effectiveTimings)` to `get`.
* **m3. No optimistic concurrency on `PUT booking-timings`** (STANDARDS [M] "version column; stale save → 409").
  * Scenario: Admin 1 reads gap after 10. Admin 2 saves 30. Admin 1 saves the whole form, changing only notice. Gap after goes back to 10 with no 409.
  * Same as every settings-home write today (branding), so not blocking. FO-3st3b should send only the fields the person changed. Lead B to decide on a version.
* **m4. A key named after an object property gives a bare 500** (timings.ts:135 → 114-115; the same pattern is older in types.ts:109).
  * Scenario: `PUT booking-timings {"constructor":1}` gives 500 instead of 400. `fields.constructor` is inherited, so `??=` assigns nothing and `first[1]` throws.
  * Fix: `Object.create(null)` or `Object.hasOwn`.
* **m5. The rollback's stated order opens an outage** (rollback.sql:3, "Roll the code back first").
  * Scenario: once main's code is restored, it reads the NULL timings. `null * DAY` is 0 (slots.ts:61), so every inheriting type offers no times until the SQL runs.
  * Fix: state that rollback.sql runs first; the new code reads non-NULL values unchanged.
* **m6. The new tests fail intermittently** (tests/check_fo3a_hours_timings.ts:277-286; 1 of my 2 runs).
  * Cause: the first 1b-ii HTTP call comes right after the long synchronous `migrate(OLD, …)` (l.249-254). That blocks the event loop past Node's 5 s keep-alive, and the reused socket is reset.
  * Fix: send `connection: close` in `call`, or move the 1b-ii HTTP block above the migration checks.
* **m7. The stored change key does not match the enforced one.** `platform_setting_definition.change_permission` for the gap, notice and window keys is `:edit` (the brief orders this), while the service enforces `:configure-availability`. No generic writer uses the stored key today. Record this for whoever builds one.
* **m8. No test runs the split with a role that holds only one key.** Stock roles hold both `:edit` and `:configure-availability` or neither, so the per-field split is proved only by the `timingKey` unit assert. The same goes for the firm self-service limit on the booker's manage path: the feed and the public answers are covered only at the default.

## For the FO-3st3b builder (API shape)
* `GET booking-timings` returns `{timings, defaults, warnings}`.
* `PUT booking-timings` takes any of the six fields; the answer is the same read.
* `PATCH booking-types/:id/timings` takes `{version, field: number | null}`, where `null` means "Reset to firm default". It answers with the view plus `effectiveTimings` and `warnings`.
* The list endpoint's `timings` are raw (null = the firm's).
* Units are minutes, except the window, which is in days. Refusals carry `fields.<name>`. A mixed save missing a key gives 403 `MISSING_PERMISSION` and saves nothing.

## Journey score
N/A. This row has no screen, so there is nothing a person can walk in a browser (same as the fo-3a1c precedent). I checked the API paths through the suite and by hand: data underneath, roles enforced on the server, audit lines, a booker's slots. D17 and D20: not applicable. The browser journey score belongs to FO-3st3b.

## Could not check
* A real production role setup: the migration ran as the local superuser, and the trigger as `xr_app` by hand.
* The CI run itself.

Verdict: Changes requested

## Re-review 18b828e (P-277: only the new diff 7ccd544..18b828e)
Read `git diff 7ccd544dbadb5df1c0f59572bcdc3fbaa95c9154 18b828efac544e60f8927ae6dba2214bc8c1288b`: e43a9f86e (the B1 fix) and 18b828e (the minors).
* **Ran at 18b828e:**
  * `check_fo3a_hours_timings.ts` twice: 46/0 both times, no ECONNRESET.
  * `check_fo3a_booking_types.ts` 48/0 (`parse` change) and `check_fo1b_booking_schema.ts` 80/0.
  * `tsc -p api/tsconfig.json`: no error under `api/`.
* **B1, closed.** The FO-1b assert now expects empty timings, which is correct, and the suite is green.
* **m2, closed.**
  * `GET booking-types/:id` now carries `warnings` from the resolved pair (types.ts:177-178).
  * The firm's GET and PUT answer adds one warning that names, up to 10, the types with their own notice or window that the firm's values leave with no times (timings.ts `unbookable`). Types that inherit both are already covered by the firm-pair warning.
  * Tested: a firm window of 1 day against a type's own notice of 2 days names "Strategy session", and the type's own read warns too.
* **m4, closed.** `Object.create(null)` in both parsers. `constructor`, `toString` and `valueOf` now give 400 on the firm, type-timings and create routes (tested).
* **m5, closed.** rollback.sql:3-7 now says to run it BEFORE rolling the code back, and why.
* **m6, closed.** The new HTTP checks now run ahead of the long synchronous migrations. The only thing after those migrations is psql.
* **Breaker m5, narrowed, not closed.** The trigger and rollback now read the firm value only when `jsonb_typeof = 'number'`, and a stored `"abc"` pads by the default (tested). A JSON number that is not a whole int4 (`10.5`, `1e10`) still raises in the cast; I checked: `('10.5'::jsonb #>> '{}')::int` gives 22P02. A negative value still gives an inverted range. The comment "anything else is treated as unset" (migration.sql:59-60) therefore says more than the code does.
  * Minor only: no app path can store such a value, because writeSetting runs the zod int-range schema.
  * Optional fix: also require `(s.value #>> '{}') ~ '^[0-9]{1,4}$'`.
* **Not changed, accepted as recorded:**
  * m1: reminders, a question to the tech lead on the PR. FO-3st3b must not offer reminders as an editable field that does nothing.
  * m3: no version on the firm's Timings, for Lead B.
  * m7: the stored key is `:edit`, as the brief orders.
  * m8: no stock role holds only one of the two keys.
* Nothing in the new diff adds a Blocker or a Major. No open Blocker or Major remains.

Verdict: Approve 18b828efac544e60f8927ae6dba2214bc8c1288b

## Re-review 75294c5 (P-277: only the new diff 18b828e..75294c5, report files excluded)
* **Breaker m5, closed.** The trigger (migration.sql:59-63) and all five rollback fills now also require `(s.value #>> '{}') ~ '^[0-9]{1,6}$'`.
  * The `::int` cast sits in the subquery's select list, so it only runs on a row that passed the filter.
  * jsonb prints `1e10` as `10000000000`, which has 11 digits. `10.5` and `-600` fail the pattern. `-0` prints as `0`, which is a valid 0.
  * So every value that does not fit is now unset and pads by the default. The migration comment now says exactly what the code does.
* **Tested.** "abc", 10.5, -600 and 1e10 each pad 0/10 (the default). `check_fo3a_hours_timings.ts` at 75294c5: 46/0, exit 0.
* **Residual, not a finding.** A stored whole number above the key's range (e.g. 2000) would still be used by the trigger, while the app's read refuses it. No app path can store one, because writeSetting enforces the range.
* No open Blocker or Major. m1, m3, m7 and m8 stay as recorded above.

Verdict: Approve 75294c5f9c871df82b66e056dd76c76c97b400a5
