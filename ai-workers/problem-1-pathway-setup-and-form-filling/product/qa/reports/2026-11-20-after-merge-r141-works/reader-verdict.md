VERDICT: WORKS

R1.41 "Staff hours and time off", main 292847c32 (#2302 merge). Fresh reader, ran nothing (P-303); read the pack and the app at /tmp/claude-501/qa7/rec/.../studio.

## (1) Done-when clauses
- Weekly hours set by screens, by the staff person themselves:
  PASS "J-41 W1: the host sets Monday to 10:00-12:00 on My account → Availability; "Save hours" answers Saved and the server holds it" (j_41.ts:115-120: fills the Monday inputs, clicks Save hours, waits for "Saved.", then reads GET /front-office/me/availability-sets to confirm the server holds it).
- Time off set by screens:
  PASS "J-41 W2: the host adds the Tuesday as a whole day off; it is listed and saved midnight to midnight (Toronto)" (j_41.ts:124-129: Add time off, From, Save time off; checked against GET /front-office/me/time-off).
- No slot inside time off:
  PASS "J-41 W3: the public page shows no slots on the day off (the Tuesday cannot be chosen)" (j_41.ts:135-136, a booker with no session); PASS "...underneath, the slots route gives the same (Monday 10:00-11:30 only, nothing on the Tuesday)" (j_41.ts:141-143). Part-day time off is covered by suite fo3a DW17 ("time off Fri 12:00-17:00 keeps the morning and drops the afternoon"), check_fo3a_hours_timings.ts:200.
- No slot outside hours:
  PASS "J-41 W3: the public page shows slots only inside the hours (the Monday offers 10:00, 10:30, 11:00, 11:30 and nothing else)" (j_41.ts:139-140), plus the untouched Wednesday still 09:00-16:30 (j_41.ts:137-138).
- Fails on the stand-in (P-606): the two NR lines PASS. Before any change, Monday offers 09:00-16:30 and Tuesday can be booked (j_41.ts:108-111), so the W3 checks fail when nothing has been set.
- Overlapping hours refused by the database: the journey does not test this, and it is not expected to. Two suites cover it. check_fo1b_booking_schema.ts:297 ("overlapping windows on a day ... are refused", fo_availability_no_overlap) passed 80/80 in job 135824586788. check_fo3a_hours_timings.ts:260-262 (DW21: "two overlapping windows in one set" refused by fo_availability_no_overlap) passed 26/26 in job 135824587042. The constraint is at prisma/migrations/20261119031000_fo3a_hour_sets/migration.sql:56. The API's 400 "These hours overlap." is checked in check_fo3a_hours_timings.ts:124-126 and on screen in check_fo3st2_availability_browser.ts:126.
- Rows j_41 writes straight to the database instead of through screens (j_41.ts:45-50): the Sample firm, the host staff row, the host's CASE_OFFICER grant and the booking type. The privacy notice is accepted through the API (j_41.ts:54-56). All of these are setup that belongs to other capabilities. The hours and time off this capability is about are set only through screens.

## (2) Earlier "parts missing" (routes and screen, FO-3a / FO-3st): now on main
- Routes: api/src/front-office/booking/settings/availability.controller.ts:26-54 has two groups. The me/ routes (availability sets: list, create, update, delete; time off: list, add, remove) need no permission key. The staff/:staffId/ routes need the configure-availability key. The service is availability.ts (272 lines).
- Screen: web/src/modules/front-office/booking/availability/availability-page.tsx (Save hours :216, Add time off :288, Save time off :297). It is routed at web/src/modules/front-office/routes.tsx:22 and listed in the menu at web/src/modules/platform/account-sections.ts:8 (My account → Availability).

## (3) Permissions
- Your own hours and time off: any signed-in staff person, no key needed (availability.controller.ts:26-39, @AnyStaff).
- Another person's hours or time off: needs agent/booking-event-type:configure-availability (availability.controller.ts:41-54). That key is granted only to OWNER and ADMIN (prisma/migrations/20261114015002_pf3_platform_tables/migration.sql:544-545). The target person must be in the caller's firm and not deactivated, otherwise the answer is 404 (availability.ts:222-227).
- Tested, all in the merge batch's CI:
  - fo3a DW17 fail: "a Case Officer entering a colleague's time off → 403 ... another firm's owner → 404" (:207)
  - DW20 pass/fail: Case Officer edits their own hours; Admin edits a colleague's; a colleague's hours by a Case Officer → 403; firm B owner → 404; no sign-in → 401 (:224, :231)
  - DW21: no audit line is written for a refused change (:242)
  - Screen: an Admin uses the "Viewing" picker; a Case Manager gets no picker and a server 403 (check_fo3st2_availability_browser.ts:194, 209, 235; 53/53 in job 135824586637).

## (4) P-339: pack green on main's head on GitHub's runners
- Merge batch draft #2366, head c6d80860b: ci run 44598210725, every job success (ci-jobs.txt). Its studio tree d0dd16d62 equals the tree of 292847c32, which is main's head (batch-checks.txt).
- Booking and hours suites in that run: fo3w_booking 67/67, fo3w_manage 50/50, fo3st2 53/53, fo3_booking 133/0, fo1b 80/0, fo3sa 39/0, fo3a_hours_timings 26/0 (ci-suites.txt).
- Automatic item-proof: run 44603961304, job 135842994804, on 292847c32. overall PASS: 12 PASS lines, including the secret scan (auto-verdict.json, walk-steps-autoproof.txt).
- Independent re-run (walks.yml): run 44604534795, job 135845046995, on main 292847c32. The same 11 journey PASS lines (walk-steps-rerun.txt).
- What I could not check: I took the run ids and the tree match from the pack. I made no network calls.

## (5) Holds (P-305)
- bugs-open.md is empty: no open Major or Critical names R1.41. Nothing holds it.

## Minor findings worth logging
- m1 (wording in Done when): since FO-3a hour sets (migration 20261119031000:54-57), the database refuses overlap within one set, keyed on firm_id, set_id and weekday. Before that it was keyed on staff_id. One person may now have overlapping windows in two different named sets, by design: a booking type picks one set per host, and fo_booking_no_overlap still stops double bookings. Suggest the Done when read "overlapping hours within one set of a person refused by the database".
- m2: j_41 walks only "own" hours. Setting a colleague's hours by screens is proven only by the fo3st2 browser suite (J-A4), not by the journey. That is acceptable, but gate A's walk should note it.
- m3: the walks.yml re-run log has no secret-scan line, while the auto-proof log has one. Neither log prints a pass/fail count line. Consider making the walk output uniform.
- m4: j_41 seeds its host and booking type straight into the database (j_41.ts:47-50). Fine for this row. Once the R1 booking-type screens are Works, the join to them could be walked as well.
