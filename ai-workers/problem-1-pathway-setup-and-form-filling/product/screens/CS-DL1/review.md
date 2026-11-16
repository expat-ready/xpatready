# CS-DL1 part 1: independent review (PR #2000, `claude/runtime-csdl1a` @ a5f25f46ea157504fbf1b4ceb40b6bca0de40e78)

Reviewer, fresh Opus 5.5 context, 16 Nov. Specification: `design/briefs/CS-DL1.md` Part 1 on `main`, overridden by `build-lead-c-briefs/CS-DL1a.md` (Build Lead C; it wins); AG-7-94@2b63ee12 (requirements-2026-11-02). This is not a screen. It is a runtime change: the calendar move plus API view fields. So the screen checks of `screen-review` (keyboard, 1024 px / 200 %, BIC-01–20, menu words) are N/A: no page changed (the stage strip `web/src/runtime/stages.tsx:35-36` is untouched, see Question 2 on the PR). Probes and mutations ran on a scratch copy byte-identical to a5f25f46e (checked with `cmp`). The shared checkout picked up uncommitted edits to `working-days.ts`, `case-stages.ts` and the test during this review. They are **not** reviewed here; a re-review reads only the new commits (P-277).

## Verdict
**Verdict: Changes requested** (= Block: two open Majors). Journey score 7/10, fail (`journey-test-reviewer-2026-11-16.md`).

## What was run (exact head)
* `tsx tests/check_csdl1_deadlines.ts`: **28/28**, exit 0, 1.6 s, no DB. `tests/check_c617_stages.ts`: **32/32**.
* PF-21 / PF-21w / PF-21v suites: `git diff origin/main...a5f25f46e` touches none of them (byte-for-byte unchanged). Not re-run here (they need a DB). I relied on the PR's pasted 107/83/54.
* `tsc -p api/tsconfig.json`: no error in any changed file. `count-any.mjs`: 417, baseline 433, so no new explicit `any`. `check-module-cards.sh`: exit 0. `graph.mjs --check`: G1/G2/G4/G5 0.
* Live :4471 (`x-actor: user-O`). The brief's case `ebde2f63…` is gone (404), so I used `18b366f6…` (BRK-DL1-1): `200`, 20-40 ms, `"shown":"Sun 7 Mar 2027 (weekend)","missed":false`. Client `user-P` gets 403; a bad id gets 404.
* Mutation pass (each a single change, suite re-run). **Caught:** weekend counted as open (1 FAIL), closed days ignored (6), count one day late (5), n=0 returning the date (3), no date check (3), fallback returning the date (1), `missed` as `<=` (2), deadline moved by `countBack` (3), closed-day mark dropped (2). **Survived (0 FAIL):** the service computing today in UTC instead of the firm zone/clock port, and the service ignoring the firm (`NO_ID` always). See m1.

## The six checks asked for
1. **Move, not copy: met.** The moved code is line for line PF-21's (`working-days.ts` 1-101 vs the removed lines of `business-days.ts`). `ACK_BUSINESS_DAYS` and `acknowledgeBy` stay (`business-days.ts:13-27`), importing from `calendar/`. Callers moved: `complaints.ts:27-29,198`, `leads.ts:10`, `open-minutes.ts:6` (one import line each). **The re-export (`business-days.ts:10`) does not conflict with Lead B's limit:** the file keeps its own complaint rule and code, so it is not "emptied into a re-export". And `check_pf21v_views.ts:40` imports `BusinessDayTally` and `businessDaysBetween` from this path, so the "suites unchanged" proof *requires* those two. `localDate`, `zonedInstant` and `FirmCalendar` are not needed by any suite or caller (m2).
2. **countBack / isOpenDay vs AG-7-94 r4-r6.** Correct on the brief's dates (Thu 4 Mar ×2, Wed 30 Dec 2026), n=0, short and two-week runs of closed days, Toronto spring/fall DST, Santiago's midnight change, Apia's skipped 30 Dec 2011 (not open, marked "closed day", stepped over → 29 Dec), and bounds −1/1.5/NaN/2601/"1" (refused). Never after the date. **Not correct beyond the walk bound (M1).**
3. **"That date does not exist": met.** `calendarDate` (`working-days.ts:110`) refuses 2027-02-31, 2027-02-29, months 00/13, unpadded, timestamps, numbers, null, non-ASCII digits and a trailing newline, and accepts 2028-02-29. Every calendar function and `showDeadline` refuse with these exact words. (The key-detail input path says "write a date as YYYY-MM-DD…" for 31 Feb: outside this touch list, breaker m5. Not a finding here.)
4. **Case view.** Missed is `due < localDate(cal.zone, this.clock.now())` (`case-stages.ts:65,96`): clock port, firm zone, one calendar read per view, not per row. Every deadline path (list, one stage, preview, start) goes through `views()`. No platform table is queried unscoped: `readSetting` uses `firmScope` and the walls. **But the firm's calendar is never reached on this route (M2).**
5. **DW1-DW6:** each passes, and each named rule fails its own case when removed (mutations above), except the service wiring (m1).
6. **Explicit any: none new. P-607: met** in new code (the `new Date()` calls at `case-stages.ts:156,205,211,215,265` predate this PR). **No new technology.**

## Findings
**Major M1: `countBack` returns a later, non-open day for valid sparse calendars (AG-7-94 r5 "lands on an open day", r6 "never later than the computed day").** `working-days.ts:131,134,138`: the walk stops after 366 + ⌈7n/5⌉ days (n=0: 367), then falls back to "n calendar days before". The comment at :125 ("earlier, never a miss") is wrong: an open day exists further back, so the fallback is *later*. I reproduced the breaker's M1:
* 366 consecutive closed weekdays (the `CLOSED_DAYS` max, `settings.ts:196`): n=1 before Mon 8 Mar 2027 gives **Sun 7 Mar**; the right day is 2025-10-09.
* Friday-only hours (a valid setting): n=70 gives **Mon 28 Dec 2026, not an open day**. n=7/52/60 are still correct.

Deadlines a client can lose a case on, and part 2's DW11 builds on this. **Fix:** derive the bound from the calendar, e.g. open weekdays per week k (Mon-Fri with hours); if k>0, bound = ⌈(n + closedDays.length + 1)/k⌉·7 + 7 days, which always reaches the nth open day. Fall back only when k=0. Add a DW2 fail case for Friday-only n=70 and for a 366-day closed run.

**Major M2: the case view never reads the firm's own calendar, so "(closed day)" and "Missed in the firm's zone" are met only in the pure-function tests.** `case-stages.ts:77`: `currentFirm() ?? NO_ID`. On `/api/runtime/*`, PF-4's guard returns before `setRequestFirm` (`platform/identity/guard.ts:83`, not a platform path), so `currentFirm()` is always undefined. Every request then uses the defaults (Toronto, Mon-Fri, no closed days). A firm's saved closed day never shows "(closed day)" (AG-7-94 r3 and its "Fri 1 Jan (closed day)" example), and a Tokyo or Halifax firm's Missed flips by Toronto's date. **My judgment of the fallback:** it is safe (never across the wall, no leak, documented defaults), and the builder was right not to add a `BYPASS_USES` entry outside the touch list (Lead B's `firm-scope.ts`). But the part is not whole (P-606), and the PR's own Question 1 is unanswered. **Fix:** either (a) on Build Lead C's / Lead B's OK, add the named bypass use with an API test (a firm's closed day shows "(closed day)", firm B's never shows on firm A's case, and Missed follows the firm's zone), or (b) a written ruling on the PR that keeps option 2 and names the row that will give the case side its firm. With (b) recorded, this drops to a Minor.

**Minor m1: the view's wiring has no test.** Replacing `today` with UTC's date, or the firm with `NO_ID`, passes every suite (`case-stages.ts:77,96`). DW4 tests `showDeadline` with a `today` the test computes itself. Add one service-level case (set `service.clock = new FakeClock(...)`, assert Missed at 03:30Z) with M2's fix.
**Minor m2:** `business-days.ts:10` re-exports `localDate`, `zonedInstant` and `FirmCalendar`, which no caller or unchanged suite needs. Keep only `BusinessDayTally` and `businessDaysBetween`, and adjust DW5 (`check_csdl1_deadlines.ts:78`), which locks the extras in.
**Minor m3:** the no-open-day fallback (`working-days.ts:138`, firm with `hours: []`) is the latest guess, and DW2's fail case at `:43-45` asserts it. AG16-60 points earlier (count Mon-Fri). Fix it with M1.
**Minor m4 (breaker m1-m3, agreed):** a due date outside four-digit years makes `calendarDate` throw, which turns GET stages into a 500. Year 0000 is accepted and shown as "1". Not reachable through the write paths (1950-2100 and `add_days` ≤ 3650). Clamp `calendarDate` to 0001-9999, or catch in `showDeadline`.
**Minor m5:** the DW5 name at `check_csdl1_deadlines.ts:80` says "and is not in calendar/", but nothing asserts it. The stale comment at `open-minutes.ts:3` still says "PF-21's business-days.ts gives the zone's wall clock". `clock` is a public mutable field (`case-stages.ts:71`), not injected: acceptable, but worth noting.

## Could not check
Full `ci` and the DB suites (PF-21 ×3, C6.17 migration/acceptance, demo reset, checkpoint load): I relied on the PR's pasted results. No screen to walk (D17/D20 stay with the founder). There was no firm in the isolated DB (`platform_firm` is empty), so I could not show a live closed day.

## Re-review of 08ec00e46
Reviewer, fresh Opus 5.5 context, 16 Nov. P-277: read only `git diff a5f25f46e..08ec00e46 -- prototype` (4 files: `case-stages.ts`, `calendar/working-days.ts`, `complaints/business-days.ts`, `tests/check_csdl1_deadlines.ts`). Probes and mutations ran on a scratch export of 08ec00e46 (`git archive`; the four files `cmp`-identical to the checkout).

**Run.** `check_csdl1_deadlines.ts` **34/34**, exit 0, 2.3 s. `check_c617_stages.ts` **32/32**. `tsc -p api/tsconfig.json`: no error in any changed file or caller. Only two importers of `complaints/business-days.ts` remain (`check_pf21_complaints.ts:18` takes `acknowledgeBy`, `check_pf21v_views.ts:40` takes `acknowledgeBy`, `BusinessDayTally`, `businessDaysBetween`), and both are served by the trimmed file. I relied on the builder's PF-21 107, PF-21w 83, PF-21v 54 and FO-2 113 (they need a DB).

**Reference check of `countBack`.** I compared it with an unbounded open-day walk over 450 cases: hours Fri / Mon / Mon-Wed / Mon-Fri / Wed+Sat; closed days none, a 366-weekday run, or 366 spread; n = 0, 1, 2, 7, 52, 70, 100, 400, 1000, 2600; from 8 Mar, 7 Mar and 31 Dec. **0 mismatches.** The worst case (n=2600, Friday-only, 366 closed days) takes 82-113 ms.

### The fixes
| Finding | Closed? | Evidence (mutation → suite) |
|---|---|---|
| **M1** walk bound (AG-7-94 r5/r6) | **Yes** | The bound `7 × (n + 368)` + 7 per closed day is sound: each week holds an open-weekday slot, and the list has at most 366 dates. The 366-run repro and Friday-only n=70 now match the reference. Old bound + no closed term: **2 FAIL** (262-run, Friday n=70). Old bound alone: 1 FAIL. `7(n+1)`, no closed term: 2 FAIL. Removing the n=0 date check: 1 FAIL. |
| breaker m4 / review m3, no-open-weekday fallback | **Yes** | It now counts Mon-Fri weekdays: n=5 before Mon 8 Mar gives Mon 1 Mar, earlier than calendar days, as "duplicate beats a miss" asks. DW2's fail case asserts this and a Saturday-only firm. Calendar-day fallback: 1 FAIL. `?? d`: 2 FAIL. |
| breaker m1, 500 on a refused stored date | **Yes** | `showDeadline` catches and shows no weekday, no mark, not Missed. Without the catch the suite crashes with a RangeError (exit 1). |
| breaker m2, year 0000 | **Yes** | `calendarDate` refuses anything before 0001-01-01. Removing the bound: 2 FAIL. |
| breaker m3, walk into year −1 | **Yes** | `walkBack` stops at 0001-01-01. Removing the guard: 1 FAIL. |
| review m1, the view's wiring | **Yes, mostly** | `deadlineDay` runs the real `readFirmCalendar` over a fake reader that answers only firm A, inside `withFirm`. `NO_ID`: 1 FAIL. UTC today: 1 FAIL. `new Date()`: 2 FAIL. Residual: the service's one call site is not covered (n2). |
| review m2, re-exports trimmed | **Yes** | Only `BusinessDayTally` and `businessDaysBetween` are re-exported. DW5 asserts the other names are absent. Re-adding `localDate`: 1 FAIL. Review m5's untested "not in calendar/" claim is now asserted too. |

### M2 (the firm's calendar on x-actor routes): still open, no ruling on the PR
The PR's "Question for the tech lead" (comment of 16:01Z) has no answer yet. **On its own terms the code is acceptable as written.** The fallback never crosses the wall and leaks nothing. The defaults are documented (`case-stages.ts:70-73`), and the firm path is now proven by the wiring test whenever a firm is in scope. Option 1 needs `firm-scope.ts`, which is outside the touch list, so the builder was right to ask and not add it.

**It still blocks approval until the ruling is recorded.** The first review set the condition: Major until a written ruling, Minor once option 2 is recorded. The bar is Approve only with no open Major. The brief's "Missed … in the firm's zone" and AG-7-94 r3's "(closed day)" are not met on the running route. That is a scope call for the Lead (P-628), not the reviewer's to make.
* **Option 2 recorded:** no code change is needed. This review becomes **Approve for 08ec00e46** (M2 drops to a Minor that names the follow-up row).
* **Option 1:** a new commit, and a re-review of only that diff.

This is review round 2. Per P-277 the Lead decides from here.

### Remaining Minors (none block)
* **n1:** the old `calendar()` JSDoc is now orphaned at `case-stages.ts:85-87` and attaches to `reach`. Delete it, since `deadlineDay` carries the same words.
* **n2:** `views()` calling `deadlineDay` is not under test. Replacing the call with `readFirmCalendar(this.db, NO_ID)` and UTC today passes 34/34. It is one line and visible in a grep, so this is acceptable. A service-level case with `service.clock = FakeClock` would pin it.
* **n3:** `showDeadline`'s bare `catch {}` swallows any error from `dayMark`, not only `NO_SUCH_DATE`. Consider `catch (e) { if (e instanceof RangeError && e.message === NO_SUCH_DATE) return null; throw e; }` so a future calendar bug is not shown as "no date".
* **n4:** the `7 × closedDays.length` term is redundant under the 366 cap (dropping it passes 34/34, and the reference check still matches). It is harmless as cover for lists stored before validation. The 262-run test does not sit at the 366 maximum (a `7(n+260)` bound passes the suite), but my 366-run reference cases pass.
* **n5:** the PR body is stale. It still says "28/28" and "re-exports the moved names". It should say 34/34 and two names.
* Still open from the first review: `open-minutes.ts:3`'s comment (Lead B's file).

### Could not check
A live walk of 08ec00e46. The :4471 process started at 16:09, before the 16:29 commit, and is not in watch mode, so it serves the earlier code. Starting a second reviewer copy on another qa port was refused by the session's permission check. The changed code is view-only and covered by the function and wiring tests above. The DB suites and full `ci` were not run here (I relied on the builder's results).

**Journey (re-score):** 7.5/10, fail. The two low criteria wait on the PR's Questions 1 and 2 (`journey-test-reviewer-2026-11-16.md`, re-run section).

**Verdict: Changes requested** for 08ec00e46. Only M2 is open, pending the tech lead's written ruling on Question 1. The code needs no change for option 2; on that ruling this becomes Approve for 08ec00e46.
