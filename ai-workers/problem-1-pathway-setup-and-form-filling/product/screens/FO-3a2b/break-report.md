# FO-3a part 2b: break report (the staff read feed, API only)

PR #2313, head `84a6ba0d3`. Breaker, 19 Nov 2026. This report covers only the row's own diff (`booking/feed.ts`, the feature line and `staffBooking` made public).

**Set-up.** Scratch databases on 127.0.0.1:54329 with every migration. A small Nest app ran `features/front-office-booking.ts`'s controllers in the feature's order, behind PF-4's guard with the local sign-in. The roles were the ones PF-3 seeds: Owner, Admin, Case Manager, three Case Officers, Billing and finance, Read-only, plus one deactivated owner. Firm B had its own Owner. Scripts were kept outside the worktree. US$0.

There is no screen, so the keyboard, 1024 px, 200 % zoom, reload and two-session attacks do not apply.

## Findings

**F1 Minor: a year-0000 `from`/`to` gives a 500; `GET /bookings` answers 400 for the same query.** (`feed.ts:25`; compare `service.ts:111`)
* Repro: any signed-in staff member calls `GET /api/front-office/bookings/feed?from=0000-01-01T00:00:00Z&to=0000-01-05T00:00:00Z`.
  * Result: 500 (PostgreSQL 22008, "date/time field value out of range"), with `view=mine` or `view=team`.
  * `GET /api/front-office/bookings` with the same values gives 400.
* Cause: the feed declares its own `Instant`, which leaves out the service's "a time between 2000 and 2100" bound.
* Side effect: the feed accepts 0001-1999 and 2100-9999 (200, empty), where FO-3vr's list refuses them.
* Expected: 400 `booking-refused`, the same as the list.

**F2 Minor: more than 32,767 lead-less people in one window gives a 500, where FO-3vr's list answers 200.** (`feed.ts:65`)
* Repro: 33,000 bookings within 62 days, each on its own person with no prospect. Then:
  * Owner, everyone-sees-all on: `view=team` → 500 in 753 ms (Prisma P2029, "query parameter limit … exceeded", at `this.db.foLead.findMany`).
  * Case Officer, own-only: `view=team` → 500 as well.
  * `GET /bookings` over the same window → 200 with 33,000 rows (737 ms).
* Cause: the `foLead` lookup combines `personId in [...]` with `orderBy`, so Prisma does not split it. The person, type and record lookups do not fail this way.
* This is FO-3vr's break F1 (m2) again, inside `items()`. The PR says "ids read in pieces", but that holds only for `readSeen`.
* About 530 bookings a day: far past the sample data (STANDARDS §9), hence Minor.

**F3 Minor: `hangsOn` names a lead the viewer cannot see, and leaves out the prospect they can.** (`feed.ts:65, 74, 82`)
* Repro A (AG-4-67 rule 2 c), with everyone-sees-all off:
  1. Person Q has a prospect owned by Case Officer CO (its lead is ENGAGED).
  2. Q also has a newer OPEN lead owned by Case Officer CO2.
  3. A booking on Q with no prospect id, hosted by CO2.
  * Result: CO sees the booking (because CO owns Q's prospect) in `view=team` and by `feed/:id`. The item says `hangsOn: {kind:"lead", id:<CO2's lead>, name:"L-00003"}`.
* Repro B: CO hosts a booking on Client P, whose lead belongs to CO2.
  * Result: `hangsOn` gives CO2's lead id and `L-00001`.
* In both cases the viewer is outside that lead's rule (AG-2-64), so the calendar's link would 404, and the lead number is disclosed outside the record rule.
* Also: "newest open" is coded as `state !== "CLOSED"`, so an ENGAGED lead counts as open.
* Expected: never name a record the viewer can't open. Either point at the prospect that makes the booking visible, or give `hangsOn: null` (or no id) when the viewer doesn't see the lead.

## Attempts that held (each run over HTTP)
* **Ranges:**
  * 63 days → 400 "at most 62 days". Exactly 62 days → 200. 62 days + 1 ms → 400.
  * from = to → 400. to before from → 400. Year 0001 to 9999 → 400 (range).
  * 62 days across the 14 Mar 2027 DST change → 200.
* **Keys:**
  * `view=team` without the list key (Billing and finance) → 403 naming `agent/booking:list`.
  * `view=mine` → only their own hosted booking. No `view` → mine. No token → 401.
* **`feed/:id`:**
  * Firm B's id read by firm A's Owner → 404.
  * An upper-case id → 200 for the host, returned in lower case. An upper-case id of a booking the viewer can't see → 404.
  * 404 for each of: a non-uuid, an SQL-ish string, `feed/attendance-due` (Owner and Billing and finance), braces, no dashes, `%00`, `%0A`.
  * `feed/` and `FEED` → the list. `feed/<id>/` → the item.
* **`feed` is never read as `:id`:** `GET /feed` with no query (Owner and Billing and finance) → 400 from the feed, not "No such booking".
  * Real assembly checked: `features/*.ts` are sorted; `consult/controller.ts` declares only `:id/consult-record`; nothing else holds `BookingStaffController`.
* **Odd query values:**
  * 400 for: `view=team&view=mine`, `view=`, `view=TEAM`, a missing `to`, `from` twice, Feb 30, Feb 31, hour 24, no offset, date only, lower-case t/z, epoch numbers, year 275760, `+275760`.
  * `from[]` → 400 (read as a missing `from`). A 60 KB junk parameter → 431.
  * `view[]=team` and `__proto__[view]=team` → ignored, so mine (no escalation). Unknown `staff=` → ignored.
  * Offsets `+14:00`, `+23:59` and `-00:00`, and 9 fraction digits → 200.
* **No leak of person details:** items are built only from rows `readSeen`, the host query or `staffBooking` let through. Every lookup is firm-scoped.
  * Own-only Case Officer: the colleague's booking is absent from `team` and gives 404 by id.
* **`view=team` against `GET /bookings` (FO-3vr), and against `feed/:id`:**
  * Fuzz: 220 bookings across six kinds:
    * no person;
    * a person with nothing;
    * one lead;
    * two leads;
    * a prospect named on the booking;
    * a person's prospect not named;
    * owners random, including null and a deactivated one;
    * hosts random.
  * Seven viewers (Owner, Admin, Case Manager, three Case Officers, Read-only), everyone-sees-all off and on.
  * The id sets were identical in all 14 runs. `feed/:id` disagreed with the list 0 times in 3,080 reads.
* **`outsideHours`:**
  * Each forged line left the flag false: another firm's line on this booking, entity `fo_lead`, action `booking.cancelled`, an upper-case key, `warnings` as a string, CLOSED_DAY only.
  * A later `booking.completed` line keeps it true. A later `booking.rescheduled` without warnings turns it false (the latest line wins).
  * Real flow through the runtime AuditPort and PrismaArrival: a staff booking on Sunday 11:00 Toronto first gave 409 `OUTSIDE_HOURS`. Book anyway → 201. Then:
    * the audit line holds `["OUTSIDE_HOURS"]`;
    * the feed shows `outsideHours: true`;
    * a move with book anyway keeps it true;
    * after cancel: `canEdit: false`, `canAnswerAttendance: false`.
* **Per-viewer answers against the endpoints** (read side by side): `canAnswerAttendance` matches `recordAttendance` (host, or the edit key; started; not cancelled). `canEdit` matches reschedule and cancel (edit key at the guard plus `staffBooking`; active only). `attendanceDue` uses the same end + 30 min as `GET /attendance-due`.
* **Timing:** 2,000 bookings in 62 days, `view=team`:
  * Owner, Case Officer and Case Manager: 66-118 ms, everyone-sees-all on or off. `GET /bookings`: 43-80 ms.
  * One read per table, none per row.

## Notes for the reviewer (not findings)
* PR deviation 3 makes `staffBooking` public. The brief says "If the filter needs a new export, stop and ask"; the PR declares this instead of asking. Lead B to confirm.
* `outsideHours` counts OUTSIDE_HOURS, including time off, but not CLOSED_DAY. This matches "FO-3sa's recorded warning". AG-4-63 rule 3 lists a closed day as a separate reason.
