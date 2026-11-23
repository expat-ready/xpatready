# R1.74: fresh reader's verdict (P-303, P-339), 21 Nov

This reader ran nothing. It read the files on main fa6b364d6 (the same app as ed24d2649), the job logs over REST, and the bodies of PRs #2485, #2594, #2677, #2596 and #2621.

**Verdict: Works, medium-high confidence.** The limits are listed under question 2 and at the end.

## Evidence checked
* **Walks:** walks.yml `j_74` run 44857655344 (job 136703707332) and run 44857663765 (job 136703732636). Both are workflow_dispatch runs on main, SHA ed24d2649, and both succeeded. The logs read "25/25 passed" and "25 PASS, 0 FAIL". qa's saved lines in this folder match the logs line for line.
* **The binding:** `api/src/features/platform-notifications.ts` binds `CASE_DEADLINE_NOTIFICATIONS` to `NOTIFICATION_PORT` (`PrismaNotificationPort`) with `useExisting`.
* **The binding is in the real app.** `features.ts` `registerFeatures` adds every features file to main's one root module. So `CaseDeadlineJobs.onModuleInit` (`features/case-deadlines.ts`) now receives the port. It registers the reminder, milestone and sweep handlers on `PlatformJobs`, the real pg-boss runner, and runs the sweep every 10 minutes on the system clock.

## 1. Each clause
| Clause | Status | Evidence |
|---|---|---|
| A stage's deadline worked out and shown | **Met by screens** | J-74 W2: "Apply for the work permit by Mon 8 Mar 2027 (closed day)", axe clean. Every real route is Sample, as decided (P-412 F13 (b)). |
| A government step's deadline (CS-DL1 (1), "milestone") | **Met by screens** | W5: recorded by keyboard; it shows "Due Sun 20 Dec 2026 (weekend) · in 30 days". W6: the planned reminders shown are the armed jobs. W7: cancel with a reason, record again, both lines kept. The due date is typed from the letter, never computed (P-170). |
| Reminds the case's people before it falls due | **Met by screens and test, with a stand-in timer** | W6b: at 7 working days before, the representative and the officer are each told once, through PF-18n's real store (`msg_notification`). The negative check (NR) one hour earlier finds nobody told. W6c: the officer's Home shows the item under Needs you, and opening it lands on the case. W7b: a cancelled step stays silent, and in the same walk the step recorded again reminds (NR). W4 covers the stage reminders. The real app now arms reminders, because the port is bound in the root module (see above). |
| Working days skip weekends and the firm's holidays (a pass and a fail) | **Met by test, shown on screen** | DW1 pass: 24 Feb, 3 Mar, 4 Mar, which skips closed Fri 5 and Mon 8. DW1 NR fail: with no closed days the same check fails (25 Feb, 4 Mar, 8 Mar). W6 counts back over a weekend (Thu 10 Dec, Thu 17 Dec, Fri 18 Dec). The government date itself never moves (AG-7-94). |

## 2. Is the stand-in acceptable?
**Yes.**
* **Precedent.** Earlier Works rows were judged with declared stand-ins for one non-user-facing link: C1.3 (SI-10) and C4.7 and C3.1 (the stand-in launcher). P-322 asks that Works count where a real user meets it. Here the user-facing parts are all real: the screens, the store, Home's Needs you, the firm scope and the routes. Only the timer is a stand-in, and the header of `j_74.ts` declares it.
* **The real runner is covered by test.** `tests/check_pf18n_notifications.ts` DW6 boots Nest from the real feature files (jobs, deadlines, notifications) on real pg-boss with a TestClock:
  * unbound, it logs `case_deadlines_waiting` and registers no handler;
  * bound, the recurring sweep arms the 7, 2 and 0 reminders, and the 7-day point writes one `msg_notification` row per person.
  * It passed 34/34, as reported in #2596. I did not re-check it on CI.
* **What is not covered.** No one has seen the running app's runner deliver a reminder on real time, and no walk drives a government-step reminder through that runner (DW6 covers a stage deadline). Both are a residual risk, not a missing part.

## 3. Gate A by screens
**Met, to the extent possible.**
* The walk goes on past the deadline: from the reminder to Home › Needs you, then opens the item and lands on the case page's Government steps line, where the officer acts next.
* The next capability in map order is R1.75 Tasks (My Tasks, Unassigned). It is Not built, so its first step, My Tasks, cannot be walked yet. This deserves a note in qa's row.

## 4. Bugs
* **QA-471 can close.** The port is bound, Needs you is built (PF-18h #2621), and W6b and W6c walk both.
* **QA-591 can close.** The screen (#2594), the walk (W5 to W7b) and a real-store reminder (#2677) are all on main.
* **QA-592 stays open.** BACKLOG.md:1072 still says "a counting mode from pack data: CALENDAR … or WORKING". It is a records item, Minor, and does not block Works.
* **No other open rows.** No other open row in BUGS.md names R1.74, CS-DL, PF-18n, PF-18h or J-74.

## Limits
* The walk's Home shows "Reminder came in 10 Dec 2026", a date ahead of today. This is because of the FakeClock, and the walk declares it.
* Stage reminders never fire for a real route while every route is Sample (by decision). Government-step reminders fire whatever the route's basis.
* Not seen: coverage, 200% zoom, the :4400 demo.
