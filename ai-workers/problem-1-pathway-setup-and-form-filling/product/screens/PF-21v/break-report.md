# PF-21v break report: complaint view fields (PR #1848)

Breaker (Opus 5.5, did not build it), 15 Nov. Target commit **c799e5fa0**. While I worked, the branch moved to **c8c484182**. The only code change since c799e5fa0 is the dropped `localDate` import (`complaints.ts:28`), so every result below holds for both commits. US$0, no model call, :4400 never touched.
**Scope:** there is no screen (PF-21s builds it), so the brief's "What to build" (`lead-b-briefs/PF-21v.md`, lead-b-front-office) is the scope. Keyboard, 1024 px, zoom and uploads are N/A.
**How:** I ran two scratch scripts, kept outside the repo in the session scratchpad.
* `pure.mts` checks `business-days.ts` against an independent oracle (local dates read with a separate `Intl` formatter). It also compares `acknowledgeBy` with origin/main's copy.
* `attack.mts` is a copy of the `check_pf21v_views.ts` harness with its own database `xr_studio_pf21vbrk_<pid>` on 127.0.0.1:54329. It runs a Nest app on a random port, behind ConfigReadGuard and PF-4's PlatformGuard, with LocalIdentity tokens. The database was dropped afterwards.

The PR's own suite passes here: 51 passed, 0 failed.

## Blockers
None.

## Majors
**M1. A complaint's age, which the person recording it chooses, costs CPU on every read, and the shared event loop stalls for every firm.**
* What I did: as OWNER (agent/complaint:record is enough), I recorded 100 complaints with `receivedAt` from `2000-01-03T15:00:00Z`, one a week. `isInstant` accepts any date from 2000 on. The clock was then 24 Nov 2026.
* Expected: STANDARDS §9 "filter … < 200 ms". A page of 100 is the normal page size (`PAGE`), not scale work.
* Actual:
  * `GET /:id` of one such complaint takes 283 ms (`businessDaysLeft: -7014`).
  * `list("overdue", {limit: 100})` takes 1,203 ms, and `list("all")` 1,250 ms. Over HTTP, `?view=overdue&limit=100` took 1,280 ms.
  * Firm B's own `GET ?view=all` takes 8 ms alone. Sent 30 ms after three firm-A overdue pages, it took **2,655 ms**, and the firm-A pages took 1,325, 3,969 and 3,970 ms.
  * Even one mistyped year (2006 for 2026) adds about 280 ms to every list and every open of that firm's complaints, until someone acknowledges or closes it.
* Where: `business-days.ts:82-86`. The loop walks one calendar day at a time from D to T for each row. `seen` (per request) saves only the zone work, never the walk. Called from `complaints.ts:138`.
* The reviewer logged this as m2 (Minor, "scale work is the team's"). I rate it Major because the cost comes from one row's input, not from row count, and it slows other firms.

## Minors
**m1. A calendar change after recording makes `0` ("due today") false.** `acknowledgeBy` is frozen when the complaint is recorded, but `businessDaysLeft` reads today's calendar.
* What I did: received Mon 16 Nov 10:00 Toronto, due Wed 18 Nov 17:00 (`2026-11-18T22:00:00Z`). Tue 10:00 gave `[1, false]`. I then set `platform.closed_days = ["2026-11-18"]`.
* Actual: Tue 10:00 gives `[0, false]` ("due today") while the due time, and the reminder, are still Wed 17:00. Wed 10:00 gives `[0, false]`, Wed 18:00 `[-1, true]`, Thu `[-1, true]`.
* Removing Wednesday from `platform.business_hours` does the same: Tue gives `[0, false]`.
* Where: `complaints.ts:136-139` with `business-days.ts:52-63`.

**m2. A firm with no opening days: `0` for three days, then `-1` forever.**
* What I did: `platform.business_hours = []` (the schema allows it, `settings.ts:188`). Received Fri 13 Nov 10:00 Toronto. The fallback put the due time at Sun 15 Nov 17:00.
* Actual: Fri, Sat and Sun all give `[0, false]`. From Monday on it is `[-1, true]`, and still `[-1, true]` 90 days later (13 Feb 2027).
* An overdue count that never grows says nothing about how late the complaint is. The reviewer's m3 covered only the `0` part.
* Where: `complaints.ts:138` (`-max(1, 0)`) with the fallback at `business-days.ts:74-76`.

**m3. GET /handlers sorts by code point, so names are not in alphabetical order.**
* What I did: as CASE_MANAGER, with active staff named "alice lower", "bob", "Zoë Upper", "Émile Accent", "ålesund", "王 Wang" and "Ahmed أحمد".
* Actual: `… "Second representative (Sample)", "Zoë Upper", "alice lower", "bob", "Émile Accent", "ålesund", "王 Wang"`. Lower-case and accented names come after every capitalised Latin name.
* This sandbox's database uses collation C. The migrations set no collation on `display_name`, so the order changes with each machine's `initdb` locale. A handler picker in French or for mixed-case names is hard to scan.
* Where: `complaints.ts:299` (`orderBy displayName`).

## What held
**`people` (DW3). No leak found:**
* **Paging.** A CASE_OFFICER with `limit=1` got only the shown row's recorder ("Hidden Recorder One"). The next row's recorder (`hidden2`), fetched as the +1 row, was absent until page 2.
* **Crafted cursor.** A cursor aimed at the ADMIN-handled complaint gave 200, 0 items and `people: {}`.
* **Every view.** For `open`, `overdue`, `closed` and `all`, as CASE_OFFICER and READ_ONLY, every key of `people` appears elsewhere in the answer. For the OWNER, every handler and recorder is named.
* **Handler moved away.** A READ_ONLY handler was named on `GET /:id`. After the handler moved, they got a 404 without `people`, and their list returned `people: {}`.
* **Crafted events, inserted straight into the database:**
  * An actor `staff:<firm B owner>` was not named: `firmScope` holds.
  * An upper-case actor id is named under its lower-case key. A braced id is ignored.
  * A STEP with `detail.from` is ignored.
  * A HANDLER_CHANGED without its row change is refused by the database trigger.
* **Other firm.** Firm B's Owner gets a 404, with no `people`, on firm A's id.
* **Write answers.** POST answers carry `businessDaysLeft` but no `people` and no `firmTimeZone`, as the brief says.

**GET /handlers (DW5): every refusal held.**

| Request | Answer |
|---|---|
| Keyless person; every grant ended (old token still valid); CASE_OFFICER; READ_ONLY; BILLING_FINANCE | 403 `MISSING_PERMISSION` |
| Suspended person's token; deactivated person's token | 401 `STAFF_NOT_ACTIVE` |
| No second step | 401 `TWO_STEP_REQUIRED` |
| Forged signature, payload swap, `alg: none` | 401 `TOKEN_REFUSED` |
| Token for an unknown staff id | 401 `UNKNOWN_STAFF` |
| No token, empty `Bearer`, `Basic`, two bearers | 401 `NOT_SIGNED_IN` |

* **Another firm.** Firm B's Owner gets firm B's 3 staff only, with `?firmId=<firm A>`, `/HANDLERS`, `/handlers/` and `?status=SUSPENDED` alike.
* **Other methods.** POST, PUT and PATCH give 404. DELETE gives `/:id`'s uniform 405.
* **Fields.** Each item has only `id` and `displayName`. Suspended and deactivated staff are absent.
* **Size.** 2,020 active staff come back in 13 ms (145 KB).
* **Not a finding.** Active staff with no role, or with every grant ended, are listed as handler choices. The brief says "ACTIVE staff", and `record` accepts them the same way.

**`businessDaysLeft` and the calendar (DW1, DW2):**
* **Oracle: 230,400 checks, 0 failures.** I compared `businessDaysBetween` with the oracle at 7 points around each due time.
  * 16 zones: Toronto, Apia (Dec 2011 skipped day), Chatham, Lord Howe, Cairo, Santiago, Kathmandu, Kiritimati, St John's, Tehran, Casablanca, Havana, Beirut, Tongatapu, Scoresbysund, Troll.
  * 5 calendars: Mon–Fri 09–17; 00:00–00:30; 09:00–23:59; weekends only; with closed days.
  * Receipts every 5 h through 20 Dec 2011–10 Jan 2012, and every 29 h through Mar–Nov 2026 (both Toronto DST weeks).
* **Refactor.** The refactored `acknowledgeBy` matches origin/main's copy on every one of those receipts.
* **Edges.** `now` equal to the due time gives `[0, false]`; 1 ms later gives `[-1, true]`. A zone moved after recording (Kiritimati, Pago Pago, Apia, Chatham) gives 0 before the due time and −1 after it, so the sign still agrees with `overdue`.
* **Calendar reads.** The suite's spy counts the calendar settings read once per request, and I confirmed the count.

