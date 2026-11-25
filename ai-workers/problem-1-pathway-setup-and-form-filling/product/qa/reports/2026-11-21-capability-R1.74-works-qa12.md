# qa 12 — R1.74 Government deadlines that remind; working days with holidays: Works on main ed24d2649, 21 Nov

qa 12 is a cloud session (Opus 5.5, effort medium), asked by the tech lead (Lead 10) after the last parts merged:
* CS-DL3 #2485, #2594 and #2677;
* PF-18n part 1, #2596;
* PF-18h, #2621.

Live AI off, US$0. Isolated copies only, never :4400.

## Verdict
**Works (P-339).** It has one declared stand-in, the walk's timer (see below).

## The runs (main ed24d2649; app unchanged to fa6b364d6)
| Run | Where | Result |
|---|---|---|
| Pack: walks.yml `j_74` | GitHub, [run 44857655344](https://github.com/expat-ready/xpatready/actions/runs/44857655344), job 136703707332 | **25 PASS, 0 FAIL** (`2026-11-21-r174-qa12b/walk_j74_job136703707332.txt`) |
| Independent re-run: walks.yml `j_74` | GitHub, [run 44857663765](https://github.com/expat-ready/xpatready/actions/runs/44857663765), job 136703732636 | **25 PASS, 0 FAIL** (`walk_j74_job136703732636.txt`) |
| `j_74.ts`, fresh copy, twice | here (`j74_{1,2}.txt`) | 25/25 twice |
| `check_pf18n_notifications.ts` | here (`pf18n.txt`) | 34/34 |
| Fresh Opus reader (ran nothing) | `reader-verdict.md` | Works, medium-high confidence |

Both walks were dispatched by the Lead.

## Each Done-when clause
* **A stage's government deadline worked out and shown:** by screens. W2 shows "Apply for the work permit by Mon 8 Mar 2027 (closed day)", with axe clean.
* **A government step's deadline** (CS-DL1 (1), QA-591): by screens.
  * W5 records a biometrics instruction letter by keyboard, due in 30 days as typed from the letter; the app never computes it (P-170).
  * W6 lists its reminders, and they are the armed jobs.
  * W7 cancels with a reason and records again; both lines are kept.
* **Reminds the case's people before it falls due:**
  * W6b: through PF-18n's real store, the representative and the officer are told once each, and an hour earlier nobody is.
  * W6c: the officer finds the reminder under Home › Needs you, and it opens the case.
  * W7b: the cancelled step tells nobody, while the step recorded again does.
  * In the real app, `features/platform-notifications.ts:17` binds `CASE_DEADLINE_NOTIFICATIONS`. The pf18n pack's DW6 starts the app from its real feature files on the real job runner: without the binding no handler registers; with it, the recurring sweep arms the 7, 2 and 0 working-day reminders, and the 7-day point writes one row per person.
* **Working days skip weekends and the firm's holidays, a pass and a fail:**
  * DW1 pass: 24 Feb, 3 Mar and 4 Mar, skipping the closed Fri 5 and Mon 8 Mar.
  * DW1 fail: with no closed days, the same check gives other days.
  * W6 counts back over a weekend.
  * The government date itself never moves (AG-7-94).

## Declared stand-in (P-322)
* **What it is:** the walk runs its reminder jobs in process on a FakeClock, so Home shows "Reminder came in" on the walk's clock date. Its header says so.
* **What covers the real runner:** pf18n DW6 above.
* **The gap left (a risk, not a missing part):** nobody has watched the running app deliver a government-step reminder on real time; DW6 drives a stage deadline. The reader accepts this, as for the earlier Works rows that had one declared stand-in (C1.3, C4.7, C3.1).
* **By decision:** stage reminders do not fire while every real route is Sample (P-412 F13 (b)). Government-step reminders fire whatever the route.

## Gate A by screens
* **The walk:** the reminder → Home › Needs you → the case's Government steps line, where the officer acts next.
* **The next row:** R1.75, Tasks, is Not built, so its first step (My Tasks) cannot be walked yet.

## Findings
* **QA-471: closed.** PF-18n binds the port, and Needs you is built and walked.
* **QA-591: closed.** The screen, the walk and a reminder through the real store are all on main.
* **QA-592** (Ambiguity · Minor): stays. BACKLOG CS-DL1 still says a deadline has a counting mode CALENDAR or WORKING; it is a records fix, not a blocker.
* **No other open row** names R1.74.

## Not tested
* Coverage (c8).
* 200% zoom.
* The shared demo (:4400): this cloud copy has none.
