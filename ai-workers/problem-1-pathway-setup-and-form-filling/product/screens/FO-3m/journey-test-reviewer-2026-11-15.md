# FO-3m journey test, reviewer role, 15 Nov (API only, no screen)

Commit e6e3283572a6d1b1834e8ca1ec946aa897dd1e9c (code as at b0772076b). Run over HTTP against the real staff controller, PF-4's guard and the six seeded roles (`tests/check_fo3m_answers.ts`, re-run by the reviewer: 14/14) on a pid-named scratch database. US$0.

## Journeys
1. Main: the host (billing role, no edit key) records Attended on their own started meeting: 200 COMPLETED.
2. Alternate: a case officer (edit key) answers another host's booking, then the owner changes it to No-show: 200, both times.
3. Error, bad input: outcome "MAYBE" or missing: 400 "Attendance not recorded", issue `outcome: ...`, status unchanged.
4. Error, extra key (`note`): 400 naming `note`, nothing recorded.
5. Wrong role: read-only staff on another host's booking: 403 "Not allowed", code MISSING_PERMISSION, the same code as the guard's.
6. Wrong time: active booking before its start: 409 too-early. The same booking once cancelled: 409 not-active "Cancelled".
7. Due item: 29 min after the end it is not due; 31 min after, the job is done, no mail is sent, and the booking is on the due list (AG-4-39 rule 2).
8. List error: to before from, or from missing: 400 "Bookings not listed".

## Break-it
Seven one-line mutants of the fixes are all caught (see review.md). There are no duplicates or races to try: attendance runs under the existing row lock and is idempotent (`b.status === o` returns early). No Blocker, Major or Minor beyond review.md's two Minors.

## Score: 8.5 / 10, pass (no 0)
Task 1 · next step ½ (no screen yet) · words 1 · feedback 1 · data 1 · recovery 1 · accessibility/sizes ½ (N/A, API) · speed 1 · visual ½ (N/A) · trust 1.
To raise it: the booking screen row that shows the due item and the two buttons (already planned, not this row's scope).

Not tested: a browser, a screen reader, or an intended user's own walk (D17/D20 stay with the founder).
