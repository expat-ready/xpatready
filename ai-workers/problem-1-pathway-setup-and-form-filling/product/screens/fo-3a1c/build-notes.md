# FO-3a part 1c build notes (R1.41's chain: after FO-3st2 part 1 (#2243), before J-41)

**Why this exists:** Lead B's answer on #2243 (19 Nov 13:1x IST, comment 7002972653): breaker M4 (duplicate set names) is a Major open on R1.41, and m11 (a deactivated colleague editable by the address) goes with it; "this lane does them, back to back, as FO-3a part 1c: one small runtime PR, from main ... before part 2, so J-41 walks the fixed API." The BACKLOG row FO-3a1c is the tech lead's to write (builders do not edit BACKLOG).

**Duplicate check:** searched BACKLOG (FO-3a, FO-3a1c: no row yet), open PRs including records PRs (19 Nov; none touches `booking/settings/availability.ts` or set names), `main`'s code (no name rule on `fo_availability_set`; `target()` accepts any staff of the firm), qa/BUGS.md; none.

## Done when → test (`tests/check_fo3a1c_set_names.ts`, a pass and a fail each)
* `FO-3a DW22` (M4): a person's set names are unique, compared ignoring case and repeated spaces. The second save answers 409 on `fields.name`, "You already have a set called <name>." (create and rename; a set may re-case its own name; another person may use the name; four saves at once give one 201; the database refuses a row written past the API).
* `FO-3a DW23` (m11): the hours, sets and time-off routes answer 404 for a deactivated colleague as the target, the same answer as for an id the firm does not have, and nothing changes. A suspended colleague can still be read.
* `FO-3a DW24` (the migration): on a database that already holds duplicates, the default (else the older) set keeps its name, each other one gets the first free " (n)" (cut to fit 80 characters), one audit line per rename on the firm's trail, nothing deleted.

## What changed
* Migration `20261119081500_fo3a_set_name_unique` (later than main's newest, `20261119031000_fo3a_hour_sets`): the rename of existing duplicates, then a unique index on `(firm_id, staff_id, lower(name with spaces collapsed))`. No new table, column or function.
* `api/src/front-office/booking/settings/availability.ts`: the name check under the person's lock (it compares in the database with the index's own expression, so the two can never disagree), the index's refusal turned into the same 409, and `target()` refusing a deactivated person.
* The screen needs no change: FO-3st2's "Add a set" dialog already shows the server's `fields.name` message.

## Decisions taken while building (each open to the tech lead)
* **Which set keeps its name in the migration:** the default first, then the older. The brief said "renames the later one"; a default that is newer than its twin keeps its name, because the default is the one people see as "theirs".
* **" (2)" already taken:** the next free number is used, never a second duplicate.
* **Suspended is not deactivated:** only `DEACTIVATED` is refused, as the ruling says. A suspended person's hours can still be read and changed by an Owner or Admin.
* **A type's set per host** (`PUT booking-types/:id/hosts/:staffId/set`) is not touched: it is a booking-type route, not one of the three named, and it changes no hours.
* **Not refused: the deactivated person themself.** They have no session, so `me/…` cannot be reached by them.

## Checks (19 Nov)
* `check_fo3a1c_set_names.ts` 20/20, exit 0 · `check_fo3a_hours_timings.ts` 26/26, exit 0 · `check_fo1b_booking_schema.ts` 80/80, exit 0.
* `graph.mjs --check` exit 0; `count-any` 417 = base 417.
