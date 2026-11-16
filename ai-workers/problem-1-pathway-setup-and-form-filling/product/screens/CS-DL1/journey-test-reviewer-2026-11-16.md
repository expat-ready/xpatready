# CS-DL1 part 1: journey test, reviewer role (PR #2000 @ a5f25f46e, 16 Nov)

Isolated copy http://127.0.0.1:4471 (db `xr_studio_rt_csdl1a`, builder's runtime/qa port; never :4400). Part 1 adds API fields only. The stage strip (`web/src/runtime/stages.tsx:35-36`) still shows "Apply for the work permit by <date> · Sample", so the journeys were walked at the API and through the pure functions, not in a browser. Persona: the case officer (`x-actor: user-O`). The brief's case `ebde2f63…` was gone (404), so I used `18b366f6…` (BRK-DL1-1, study → work, Sample).

## Journeys
1. **Main: officer reads the next deadline.** GET `/api/runtime/cases/18b366f6…/stages` gives 200 (20-40 ms ×3) and work CURRENT with `due 2027-03-07`, `"shown":"Sun 7 Mar 2027 (weekend)"`, `missed:false`, Sample. The date is not moved. **Held.**
2. **Alternate: the deadline falls on a firm closed day.** It cannot be reached on the route: `currentFirm()` is undefined on `/api/runtime/*`, so the defaults apply, and the isolated DB has no `platform_firm` row. It holds only via `showDeadline` with an explicit calendar (DW3: "Mon 8 Mar 2027 (closed day)"). **Not met on the product path** (review M2).
3. **Empty: no date recorded.** `shown:null, missed:false`, "Can't set: … is missing (Sample rule)" (DW3, and the PR's walk). **Held.**
4. **Past date shows Missed.** DW4 on the fake clock: Sat 6 Mar is Missed on Sun 7 Mar. Sun 7 Mar is not Missed at 03:30Z (still Sun in Toronto), but is in Tokyo. **Held in the function**; the service wiring is untested (review m1), and on the route the zone is always Toronto (M2).
5. **Error: a date that does not exist.** "2027-02-31" is refused with "That date does not exist" by every calendar function (DW6, plus 9 more bad forms). **Held.** The key-detail entry gives other words: outside this touch list.
6. **Reminder count back (part 2's input).** The brief's dates are right (Thu 4 Mar ×2, Wed 30 Dec 2026). Friday-only hours with n=70 gives Mon 28 Dec 2026, not an open day; 366 closed weekdays with n=1 gives Sun 7 Mar 2027. **Broken** (review M1).
7. **Wrong role and bad id.** Client `user-P` gets 403; `not-a-uuid` gets 404. **Held.**
8. **Recovery: reload.** The same request 3× gives identical bodies; the view is read-only (no write, no audit line expected). **Held.**
9. **Boundary to the next screen.** The strip does not show weekday, mark or Missed yet (PR Question 2, unanswered). **Open.**

## Break pass (reviewer's share; the breaker's report is `break-report.md`)
Odd n (−1, 1.5, NaN, 2601, "1") is refused. DST (Toronto, Santiago) and Apia's skipped day are correct. A long closed run and sparse hours are wrong (M1). Year 0000 / out-of-range dates: agreed with breaker m1-m3 (Minor, not reachable through writes).

## Data underneath
Read-only view: nothing written. The calendar is read once per view through `readSetting` → `firmScope` under the PF-12 walls; no platform table is queried unscoped.

## Score (each 0 / ½ / 1)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | ½ | The fields are in the API; a firm's closed day is never marked on the route (M2); no screen shows them |
| Next step obvious | ½ | No screen change; the strip shows the bare date (Question 2) |
| Plain words | 1 | "Sun 7 Mar 2027 (weekend)", "(closed day)", "That date does not exist", "Can't set: … is missing" |
| Feedback and state | ½ | `missed` is computed but not shown; the zone is always Toronto on the route |
| Correct data | ½ | Brief dates correct; count back wrong on sparse calendars (M1); calendar is defaults (M2) |
| Error recovery | 1 | Bad dates and counts refused with exact words; a missing date gives "Can't set", never a 500 on the write paths |
| Accessibility and screen sizes | ½ | No page changed, so nothing to check; not walked (no axe run on an unchanged page) |
| Speed | 1 | GET stages 20-40 ms; n=2600 count back ≈ 120 ms (not on the view path) |
| Visual quality | ½ | Unchanged page; the new words are not visible yet |
| Trust and sources | 1 | Date never moved; Sample kept on every deadline; AG-7-94 cited in code and tests |
| **Total** | **7 / 10** | **Fail (below 8; no 0)** |

**To raise it, most valuable first:** fix M1 (correct data). Settle M2 by the tech lead's ruling on Question 1 (task completed, feedback). Show `shown` / Missed on the strip once Question 2 is ruled (next step, visual, accessibility).

## Not tested
A visible-browser walk, axe and the 400/1024/1440 widths (no changed page). A real screen reader. An intended user's unaided walk (D17/D20 stay with the founder). Full CI and the DB suites (I relied on the PR's results).

## Re-run on 08ec00e46 (16 Nov)
I walked the journeys again through the functions and the new wiring test. The live :4471 process predates the commit (started 16:09, commit 16:29), and a second copy could not be started here. So there was no live walk of the new head.
* **J4, past date shows Missed:** `deadlineDay` inside firm A's scope (fake settings reader) gives today = Mon 8 Mar in Tokyo, so Sun 7 Mar is Missed and Mon 8 Mar shows "(closed day)". With no firm in scope it uses Toronto and no mark. **Held at the wiring.** On the x-actor route it is still the defaults (M2, waiting on Question 1).
* **J5, a stored refused date (31 Feb, 0000-01-01, +010000):** no weekday, no mark, not Missed, never a 500. **Held** (previously a 500 path).
* **J6, count back:** 450 cases match an unbounded reference walk (sparse hours, 366 closed days, n up to 2600; ≤113 ms). A firm open on no weekday counts Mon-Fri. **Held** (previously broken).
* J2 (a firm closed day on the route) and J9 (the strip) are unchanged: **open**, waiting on Questions 1 and 2.

| Criterion | Was | Now | Why |
|---|---|---|---|
| Correct data | ½ | 1 | M1 fixed; reference check 0/450 mismatches |
| Error recovery | 1 | 1 | Also no 500 on a refused stored date |
| All others | as above | unchanged | Task ½ and feedback ½ (M2); next step ½, visual ½, accessibility ½ (no screen yet, Question 2) |
| **Total** | 7 | **7.5 / 10** | **Fail (below 8; no 0).** The rest is held by the two open Questions, not by code in this diff |
