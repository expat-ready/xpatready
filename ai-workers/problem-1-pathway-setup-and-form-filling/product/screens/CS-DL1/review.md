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

## Review round 3 (1fb7ca098)
Reviewer, fresh Opus 5.5 context, 17 Nov. Head `1fb7ca0986acfaf67b8cb5ccfe7c43b81cadbe7f`. P-277: I read only `git diff 4a1325673..1cfc6ca81 -- prototype` (7 files: the migration, `case-stages.ts`, `contracts/runtime.ts`, `stages.tsx`, the new browser suite, two module cards) and the merge `1fb7ca098`. Rulings read: 6924926243 (Q2), 6925010919 and 6925060605 (Q1 re-ruled: a narrow definer lookup, no bypass use), 6936429814 (records out, P-610). The PR changes 610 lines against main (502 added, 108 removed), so it stays under 800.

**Run.**
* `check_csdl1_deadlines.ts`: **34/34**.
* `check_csdl1_deadlines_browser.ts` on my own copy `rev_csdl1` :4474: **24/24**. I ran it again after the shared cluster's 02:57Z stop (the breaker's, not the code) and got **24/24** on a fresh copy.
* `check_pf12_walls.ts`: **100/100** with the new migration applied.
* `tsc` for api and web: no error in any changed file.
* `graph.mjs --check`: G1/G2/G4/G5 = 0.
* The suite rewrites two committed screenshots in the shared checkout. I restored them with `git checkout`, so the checkout is clean.

### The checks asked for
1. **Migration compared with PF-12's `platform_web_address_taken`: met.** It has the same shape: `LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp`, `OWNER TO xr_wall_reader`, `REVOKE ALL … FROM PUBLIC`, `GRANT EXECUTE … TO xr_app`. It has a full header and a `Rollback: DROP FUNCTION platform_firm_calendar(text);` line. It returns only three `jsonb` columns, reads the setting keys `platform.time_zone`, `platform.business_hours` and `platform.closed_days` (these match `settings.ts`), and touches no table or row. Its stamp, `20261116184100`, is later than main's newest (`20261116030000_fo7mv_move_list`, origin/main `fc0971103`). The function is not a trigger, so PF-12's trigger-owner guard does not apply (100/100 above).
2. **`firm-scope.ts` is untouched: met.** `git diff origin/main 1fb7ca098 -- …/firm-scope.ts` is empty, and there is no `BYPASS_USES` entry.
3. **`caseFirmCalendar` (`case-stages.ts:84-91`): met.**
   * The key is bound as a parameter (`$queryRaw` template).
   * No row gives the three defaults.
   * Each column is parsed by its setting's zod schema. Null or a failed parse gives that setting's default.
   * Live probes on :4474: a stored zone `"Mars/Base"` reads Toronto, and `closed_days: 12` reads none. Both answer 200.
   * The key comes only from the reached case. `reach` (`runtime.ts:154`) has already refused another firm's officer and other clients: user-Q gets 403, user-P gets 403.
   * Note: this silently reads the default where `readSetting` throws on a bad stored value. That is deliberate (never a 500) and stated in the PR. Not a finding.
4. **Optional contract fields: met.** `weekday?`, `mark?`, `shown?`, `missed?` are added only. `DeadlineShown = Required<…>`, so the server always sets them. The web falls back with `d.shown ?? day(d.due)`.
5. **The screen (`stages.tsx:36-37`): met.**
   * The strip and the panel show "Mon 8 Mar 2027 (closed day)" and "Sun 1 Nov 2026 (weekend)" with a red "Missed" pill and the Sample pill.
   * Screenshots: `screenshots/CSDL1-strip-closed-day-1440.png`, `CSDL1-strip-missed-375.png`, `CSDL1-panel-missed-375.png`.
   * DW7 checks the 1440 and 375 px widths, axe, no sideways scroll, and Enter opening the panel.
6. **Each DW passes and fails as named: met, with one gap (m1 below).**
   * DW8 covers firm A's closed day, never firm B's, and an unknown key giving the defaults.
   * DW9 checks the catalogue string exactly (owner, `prosecdef`, `proconfig`, result columns, PUBLIC false, xr_app true), that there is no overload, and the odd keys (`''`, SQL-shaped, other letter case, trailing space give 0 rows).
   * Removing the firm key from `deadlineDay` would fail DW8's pass case. This also closes round 2's n2: the `views()` call is now under test through the API.
   * Live check that Missed follows the firm's zone: firm A set to `Pacific/Kiritimati`, due 2026-11-16, at about 02:53Z. Kiritimati gives `missed:true`; the Toronto default gives `missed:false`.
7. **Merge `1fb7ca098` keeps both sides: met.**
   * `MODULE.cases.md` has main's CS-C1b purpose and invariant and `check_csc1_count.ts`, plus CS-DL1's invariant and both csdl1 suites.
   * `platform/MODULE.md` has main's PF-5t terms, PF-6m money line and `check_pf6m_money_line.ts`/`check_pf5t_terms.ts`, plus CS-DL1's `calendar/` entry, the definer-lookup sentence and the calendar invariant.
   * No other prototype file differs from main beyond this PR's own 19.
8. **Round 2 Minors:** n1 and n3 are closed (`4a1325673`: the orphaned JSDoc is removed, and the catch is narrowed to `RangeError`/`NO_SUCH_DATE`). n2 is closed (point 6). n5 is closed (the body says 34/34 and names the two re-exported names). n4 is harmless and unchanged.

**M2 is closed.** The firm's own calendar now reaches the x-actor route through the ruled lookup, as point 6 shows live.

### Findings (none block)
* **m1 (Minor, test gap): the lookup's zone and hours keys are not pinned by any test.** On a fresh copy I replaced the function with misspelled `'platform.timezone'` and `'platform.hours'` keys and kept `closed_days`. Result: **24/24 still pass**, because DW9 only asserts firm A's *unset* zone is null and DW8 only uses closed days. A typo or a later key rename would silently put every case back on the Toronto zone. **Fix:** in DW9, set firm A's zone and hours and assert that `platform_firm_calendar('sample-firm')` returns them as stored. This needs no clock. Optionally, add a Missed-by-zone API case.
* **m2 (Minor): the `deadlineDay` JSDoc is now wrong** (`case-stages.ts:71-74`). It still says an x-actor request "reads no setting, so the settings' defaults apply … never looked up across the wall". It should describe the case's firm key and the definer lookup.
* **m3 (Minor, agree with breaker pass 2 m1): the lookup also runs on writes.** `views()` runs on `POST …/stages/next` (via `compute`) and on `PUT …/key-details` (via `stage`), not only on GET routes as the comment at `:81` and the first ruling say. The lookup itself is read-only. But if the function is missing (a migration rollback with this code still deployed), the PUT commits and then answers 500. **Fix:** say "roll back the code first" in the rollback line, or correct the comment. A follow-up is enough.
* **m4 (Minor, agree with breaker m3; BIC-14 Partly → Should): what Missed means lives only in a `title`** on a non-focusable pill (`stages.tsx:37`). The pre-existing Sample pill follows the same pattern.
* Breaker m2 (the function is bound to a key, not to the session's firm): this is the ruled design, and it is noted for CS-W3 part 1, which removes it. Not a finding here.

### BIC (case-side scope; one changed line in the existing strip)
* **BIC-10 Met:** the status words are kept.
* **BIC-14 Partly:** m4.
* **BIC-18 Met:** "Can't set: … is missing" is kept, and a refused stored date shows no mark and never a 500.
* **BIC-19 Met:** red is used only for Missed, a missed legal date, with text and shape.
* **BIC-20 Met at 1440/375:** keyboard Enter opens the panel, axe is clean, and there is no sideways scroll. 1024 px and 200 % zoom were not walked; they are inferred from the 375 px wrap.
* **BIC-01-09, 11-13, 15-17 N/A:** no questions, documents, forms, signing or review on this line.

### D1–D20 (only what this diff touches)
* **D1 5:** AG-7-94 r3 words, and Missed by the firm's zone (live).
* **D2 5:** read-only, nothing written.
* **D5 5:** no 500 on bad stored values or dates.
* **D11 5:** Missed is shown.
* **D12 5 / D14 5:** team `Pill` tones.
* **D13 4:** m4; 1024 px not walked.
* **D15 5:** one single-row function call per view (not re-timed this round).
* **D16 4:** m1.
* **D17, D20:** simulated only.
* The rest are unchanged from round 1.

### Could not check
* The full `ci`.
* PF-21 ×3, C6.17 migration/acceptance, demo reset, checkpoint load and FO-2 at this head (I relied on the PR's pasted results).
* A real screen reader.
* 1024 px / 200 % zoom by hand.
* An intended user's walk (D17/D20 stay with the founder).
* The Lead's P-423 read of the migration is still due before the label.

**Journey (re-score on 1fb7ca098): 9.5/10, pass** (`journey-test-reviewer-2026-11-16.md`, round 3 section).

**Verdict: Approve** for `1fb7ca0986acfaf67b8cb5ccfe7c43b81cadbe7f`. There is no open Blocker or Major. Fix m1-m4 or list them in the PR.

## Review round 4 (2048a997e, merge only)

A diff-only re-review (P-277) of `2048a997e4c260e788572dcab5ea439b443f3930`. It is one merge commit, with parents `1fb7ca098` and `origin/main` `780b1552c`. The merge settles GitHub's conflict. I read only what the merge changed in CS-DL1's own files.

* **MODULE.cases.md:** the conflict is resolved correctly. Main's lines are kept: the `case_party_index` rule line, `casePartyIndex (triggers only)` in Tables, `tests/check_css1_index.ts` in Tests, and the "Do not" line "Write `case_party_index` from application code; the triggers keep it." CS-DL1's own lines are also kept: the stage deadline rule line, then `tests/check_csdl1_deadlines.ts` and `tests/check_csdl1_deadlines_browser.ts` after `check_css1_index.ts`. Against main, the file's only changes are CS-DL1's one rule line and its two test names.
* **Migration move:** the old path `20261116184100_csdl1_firm_calendar/` is gone at the head, and nothing refers to the old stamp or the new stamp by number. The CS-DL1 tests find the migration by its name. The content is byte-identical: `git show 1fb7ca098:<old>/migration.sql | sha256sum` and the new file both give `01d439bdc6cabf11131534a8af5a0b3cc8d1e9eabf88feaca625001c8e3e55e4`. The new stamp `20261117054600` is later than main's newest migration (`20261117004500_css1_case_party_index`) and appears only once. Main has 102 entries in its migrations folder and the head has 103; the one more is this migration. The folder has three repeated stamps (`20261025090000`, `20261031140000`, `20261102010000`). They are already on main, so they are not this PR's. With the content unchanged, the condition in the Lead's P-423 comment 6939843362 holds.
* **PR diff:** `git diff origin/main...2048a997e --stat` lists 19 files (+502/-108), the same list as at round 3 apart from the migration's stamp. With the stamp normalised and `index` lines dropped, the whole patch matches round 3. The only other differences are the MODULE.cases.md hunk header and its context lines, which now include main's CS-S1 lines. The merge brought none of main's changes into this PR's diff.
* **Collisions with main's new commits** (`fc0971103..780b1552c`, 33 commits: CS-S1 part 1, B193 part 2b, cockpit, FO-7s0 records, qa records). None of them touches `case-stages.ts`, `stages.tsx`, `contracts/runtime.ts`, `platform/calendar/` or `working-days`, and none mentions `platform_firm_calendar`. The grep found these words only in qa's BUGS/CAPABILITIES text (QA-471, R1.74, which CS-DL1 answers) and in one SQL comment in CS-S1's migration that names `case-stages.ts`. That comment is about where the EMPLOYER party sits, and CS-DL1's `case-stages.ts` and `runtime.ts` changes touch no subject, party or participant line.
  * CS-S1 adds `case_party_index_*` functions in public, plus a definer function owned by `xr_wall_reader` (`case_party_index_firm_of`). The suites that list public's functions are FO-7a's (it leaves out later migrations' functions by stamp), PF-21's (it measures before later migrations), CS-S1's (it filters by `case_party_index_%` and trgm) and PF-12's (owner, definer and search_path, no fixed count). None of them gives a different answer for `platform_firm_calendar` with the new stamp. The builder's DB run on this head is what confirms this.
* **Unit suite:** `tsx --tsconfig api/tsconfig.json tests/check_csdl1_deadlines.ts` gives **34/34 passed** at `2048a997e`.

### Could not check
* The DB and browser suites, and CI, on this head. The builder is re-running them, and I did not start an isolated copy, as asked.
* The journey was not re-run. A merge that changes no product code leaves the round 3 score of 9.5/10 standing.

The round 3 minors m1-m4 stand as recorded.

**Verdict: Approve** for `2048a997e4c260e788572dcab5ea439b443f3930`. There is no open Blocker or Major. The label still waits on green CI.

## Review round 5 (64ab036a5, merge and actor word)

A diff-only re-review (P-277) of `64ab036a5d99e6df2488ea12060847248700f80b`. It has two commits on top of the approved `2048a997e`:
* `37bb48d9a`, a merge with parents `2048a997e` and `origin/main` `9cea7c02d`. That is current main, 273 commits after round 4's base `780b1552c`.
* `64ab036a5`, a one-line test change.

* **platform/MODULE.md:** the conflict is resolved correctly. Against main, the head changes only CS-DL1's four items:
  * the `calendar/` Purpose entry, with `complaints/ (its acknowledge-by period, over calendar/)`;
  * the `platform_firm_calendar` definer sentence in the PF-12 invariant;
  * the one-firm-calendar invariant;
  * `tests/check_csdl1_deadlines.ts` in Tests.

  All of main's new lines are kept:
  * `keep-period/` and `settings/offices/` in Purpose;
  * PF-4c `staff/invitations/batch`, AUD-5 `keep-periods` and PF-18a `offices`/`OFFICE_CLOCK`/`zoneForProvince` in Entry points;
  * the AUD-1a append-only wording, the PF-6m2 money-line and inviter invariant, and the PF-18a office invariant;
  * `platformOffice` and `platformStaffOffice` in Tables;
  * `check_pf4c_batch_invite`, `check_pf6m2_invite_recheck`, `check_aud5_keep_periods` and `check_pf18a_offices` in Tests;
  * the PF-19b part 2 paragraph.
* **Migration rename:** `20261117054600_csdl1_firm_calendar` is gone and `20261118194500_csdl1_firm_calendar` is the only csdl1 migration. Both files hash to `01d439bdc6cabf11131534a8af5a0b3cc8d1e9eabf88feaca625001c8e3e55e4`, so the SQL is byte-identical and the Lead's earlier read still holds. The stamp is later than main's newest migration (`20261117124500_aud1a_audit_insert_only`), and also later than every stamp on the fetched open branches: #2106's `20261117133000_fo7ts_money_settings` and the newest, `20261118140000_fo13i_identity_check_key`. It appears once. Main has 107 entries and the head has 108. The only repeated stamps are the three old ones already on main. Nothing refers to any of the stamps by number.
* **Actor word:** `writeSetting` writes `audit_event.actor = by`. AUD-1a's `aud_event_actor_type` maps `^seed:[A-Za-z0-9][A-Za-z0-9._:/-]*$` to SEED. So `seed:csdl1` is typed, while the old `check:csdl1` would have been refused by `aud_event_fill`. The new word matches main's own convention for test setting writers (`seed:pf21b`, `seed:PF-19a`, `seed:FO-2-test`). It is the only audit write in CS-DL1's diff. The other actor words in CS-DL1's files are listed user-X ids: the browser suite's `x-actor` headers are `AUTHOR` = `user-A` and `OFFICER` = `user-O`, from `acceptance/lib/m3.ts`. `by: "u"` in the unit suite is a key-detail value passed to a pure function, not an audit line. `case-stages.ts`, `working-days.ts`, the complaints move and the migration write no audit line.
* **PR diff:** `git diff origin/main...64ab036a5 --stat` lists the same 19 files as round 4 (+502/-108). With `index` lines dropped and the old stamp mapped to the new one, the patch matches round 4 except in two places: the MODULE.md context lines, which now include main's lines, and the one `seed:csdl1` line. None of main's changes leaked into the PR.
* **Collisions** (`780b1552c..9cea7c02d`):
  * Of CS-DL1's files, main's new commits touch only `platform/MODULE.md` (settled above) and `contracts/runtime.ts`. The `contracts/runtime.ts` change is 3 CS-V1 part 2 commits that append strict schemas at the end of the file. The file auto-merged cleanly: against main, the head differs only by CS-DL1's `deadline` hunk at line 407, and CS-V1 does not touch `CaseStageView`.
  * None of main's new commits touches `case-stages.ts`, `stages.tsx`, `platform/calendar/`, `working-days` or `business-days.ts`, and none mentions `platform_firm_calendar`.
  * Main added no new importer of `complaints/business-days.ts`. The head's importers (`complaints.ts`, `check_pf21_complaints.ts`, `check_pf21v_views.ts`, `check_csdl1_deadlines.ts`) use `acknowledgeBy` or the kept re-exports.
  * PF-18a's `settings/offices/` reads the firm settings through `settings.ts` directly, not through `calendar/`.
* **PF-18a (offices) on main, not in scope:** this does not block the PR.
  * On main a case carries no office: no office column is in the case schema.
  * PF-18a's invariant keeps a one-office firm on the firm's own zone, hours and closed days, and when a second office is added, the first office is written from those settings. So `platform_firm_calendar` gives the right calendar for every one-office firm, which includes both Sample firms.
  * For a multi-office firm, the weekday mark and the Missed day are read against the firm's own (first-office) calendar. The date itself is never moved (AG-7-94).
  * The builder has asked the tech lead to carry the office choice in CS-DL1 part 2. That is the right place: a case needs an office before it can be read.
* **Unit suite:** `tsx --tsconfig api/tsconfig.json tests/check_csdl1_deadlines.ts` gives **34/34 passed** at `64ab036a5`.

### Could not check
* CI and the PR's mergeable state: GitHub's API is not enabled for this session.
* The DB, browser, PF-12, PF-21, PF-18a and acceptance suites at this head. As asked, I did not start an isolated copy, and I relied on the builder's pasted results for 64ab036a. In particular, I could not run myself that the browser suite's `seed:csdl1` write passes AUD-1a's insert trigger on a migrated copy (the builder reports csdl1 34/34 and the browser run on a fresh copy).
* The journey was not re-run. Only a merge and a test actor word changed, so round 3's 9.5/10 stands.

The round 3 minors m1-m4 stand as recorded.

**Verdict: Approve** for `64ab036a5d99e6df2488ea12060847248700f80b`. There is no open Blocker or Major. The label still waits on green CI for this head.

## Review round 6 (74268f69f, merge only)
This is a diff-only re-review (P-277). `74268f69f` is a single merge commit, with parents `64ab036a5` (approved in round 5) and `2c9231ab4` (origin/main at the time). Lead 82 asked to keep both sides and keep the stamp 20261118194500.

* **`platform/MODULE.md` resolution:** correct. Main's PF-18b lines are all kept:
  * the Purpose entry for `support/` (PF-18b);
  * the PF-18b entry points (`/api/platform/support` routes, `SupportService.replyAsSupport`);
  * the support-message invariant;
  * the `platformSupportTicket` and `platformSupportMessage` tables;
  * `tests/check_pf18b_support.ts`.

  Every CS-DL1 line is kept too: `calendar/` with `readFirmCalendar` (CS-DL1), `complaints/` over `calendar/`, and `tests/check_csdl1_deadlines.ts`.
* **The PR's own changes are unchanged.** `git diff 9cea7c02 64ab036a5` and `git diff 2c9231ab 74268f69f`, each without `platform/MODULE.md`, are byte-identical. The merge changed nothing of CS-DL1 except the card.
* **Migration:** `prisma/migrations/20261118194500_csdl1_firm_calendar/migration.sql` is unchanged. Its sha256 is `01d439bdc6cabf11131534a8af5a0b3cc8d1e9eabf88feaca625001c8e3e55e4` at both heads.
  * Its stamp is later than main's newest migration, `20261118073000_pf18b_support`.
  * The stamp is unique. The only repeated stamps (20261025090000, 20261031140000, 20261102010000) were already on main and are not this PR's.
* **`git diff origin/main...74268f69f --stat`:** 19 files, +502/-108. They are CS-DL1's own files only: 6 screenshots, `MODULE.cases.md`, `case-stages.ts`, `leads.ts`, `open-minutes.ts`, `platform/MODULE.md`, `calendar/working-days.ts`, `business-days.ts`, `complaints.ts`, `contracts/runtime.ts`, the migration, the two csdl1 tests and `stages.tsx`. Nothing of main's leaked in.
* **Collisions:** none. I checked main's commits from the old merge base `9cea7c02` to the current origin/main `7dcef1e76`:
  * No commit touches `case-stages.ts`, `web/src/runtime/stages.tsx`, `contracts/runtime.ts`, `platform/calendar/`, `complaints/business-days.ts`, `complaints.ts`, `leads.ts`, `open-minutes.ts` or `MODULE.cases.md`.
  * No commit adds or removes `platform_firm_calendar` or `platformFirmCalendar`. Main has no such table.
* **Main has moved since the merge:** origin/main is now at `7dcef1e76` (#2123, cleanup stage 0). That change adds only tooling, `docs/PATHS-MOVED.md`, `packages/repo-paths/` and `tests/check_repo_paths.ts`, with no migration and none of CS-DL1's files. `git merge-tree origin/main 74268f69f` merges cleanly. The stale-paths list on main has no entries yet.
* **Unit suite:** `tsx --tsconfig api/tsconfig.json tests/check_csdl1_deadlines.ts` gives **34/34 passed** at `74268f69f`.

### Could not check
* CI for this head.
* The other suites the builder lists (PF-12, PF-21/21w/21v, FO-2, CSS-1, PF-18a/18b, DW7-DW9, acceptance, demo reset, checkpoint). As asked, I did not start an isolated copy, and I relied on the builder's results.
* The journey was not re-run, because only a merge changed. Round 3's 9.5/10 stands.

The round 3 minors m1-m4 stand as recorded.

**Verdict: Approve** for `74268f69fc064c997ef9f9b529b8726dfd39d317`. There is no open Blocker or Major. The label still waits on green CI for this head.

## Review round 7 (6f3471227, merge only)

This is a diff-only re-review (P-277) of `6f3471227a2eff6d0bed70555a9d73e48ead54d9`. It is one merge of origin/main `34c5e1e99` into `74268f69f`, which round 6 approved. I read it from the local checkout because it was not yet pushed.

* **Module cards:** both conflict resolutions keep main's lines and every CS-DL1 line. `git diff 34c5e1e99 6f3471227` on the two cards shows CS-DL1's additions only.
  * `MODULE.cases.md` keeps CS-W1 part 1's firm-id invariant (`firm_id` beside `firm_key`, `case_firm_from_key`, `case_firm_fill`, `case_lookup.case_firm_id_of_key`, `firmIdByKey`) and `tests/check_csw1_firm_id.ts`. It keeps CS-DL1's deadline invariant and its two csdl1 tests. The card is 36 lines.
  * `platform/MODULE.md` keeps PF-F4's `files/file-type.ts` purpose clause and `tests/check_pff4_file_type.ts`. It keeps CS-DL1's `calendar/` clause, `complaints/` over `calendar/`, the `platform_firm_calendar` wall line, the one-calendar invariant and `tests/check_csdl1_deadlines.ts`. The card is 40 lines, at the limit and not over it.
  * `module-cards.py tree` gives PASS: 15 cards, tree checked.
* **The PR's own changes are unchanged.** I compared `git diff 2c9231ab4 74268f69f` with `git diff 34c5e1e99 6f3471227`, each without the two cards and without `index` lines. They are byte-identical.
* **Migration:** `20261118194500_csdl1_firm_calendar/migration.sql` is unchanged. Its sha256 is still `01d439bdc6cabf11131534a8af5a0b3cc8d1e9eabf88feaca625001c8e3e55e4`.
  * Its stamp is later than main's newest migration, `20261118140000_fo13i_identity_check_key`. It is also later than `20261118090000_csw1_firm_id`.
  * The stamp is unique. The only repeated stamps (20261025090000, 20261031140000, 20261102010000) are main's own.
* **`git diff origin/main...6f3471227 --stat`:** 19 files, +502/-108. They are CS-DL1's own files only, the same list as round 6. Nothing of main's leaked in. The merge base is now `34c5e1e99`, and `git merge-tree origin/main 6f3471227` merges cleanly.
* **Collisions:** none. I checked main's commits from the old base `2c9231ab4` to `34c5e1e99`:
  * No commit touches `case-stages.ts`, `web/src/runtime/stages.tsx`, `contracts/runtime.ts`, `platform/calendar/`, `complaints/business-days.ts`, `complaints.ts`, `leads.ts`, `open-minutes.ts` or the csdl1 tests.
  * No commit mentions `platform_firm_calendar`.
* **CS-W1 part 1 does not change how CS-DL1 reaches a case's firm.**
  * CS-W1 part 1 adds a nullable `firm_id` beside `firm_key` on `runtime_case`, `case_stage` and `firm_case_counter`. The database fills it.
  * `firm_key` stays on the case. The identity comparisons stay on `firm_key` until CS-W1 part 2.
  * So `deadlineDay(…, c.firmKey)` and `caseFirmCalendar(firmKey)` still get the same key.
  * CS-W1's lookup `case_lookup.case_firm_id_of_key` maps a key to a firm the same way `platform_firm_calendar` does (`platform_firm.key = $1`), so the two cannot disagree on which firm a case belongs to.
  * On the walls, CS-W1 adds a separate owner `xr_case_lookup` and one role-only policy `case_lookup_read` on `platform_firm` for that role. It does not touch PF-12's own policy, `platform_firm_setting`, `xr_wall_reader` or `xr_app`'s grants, so the definer function's reads are unaffected.
  * Follow-up, not a finding: when CS-W1 part 2 or CS-W3 part 1 moves cases to `firm_id`, `platform_firm_calendar(firm key)` should move too. The migration already names CS-W3 part 1 as its replacement.
* **Unit suite:** `tsx --tsconfig api/tsconfig.json tests/check_csdl1_deadlines.ts` gives **34/34 passed** at `6f3471227` on the shared database.

### Could not check
* CI for this head, which was not pushed when I reviewed it.
* The builder's other suites, which were still running. As asked, I did not start an isolated copy.
* The journey was not re-run, because only a merge changed. Round 3's 9.5/10 stands.

The round 3 minors m1-m4 stand as recorded.

**Verdict: Approve** for `6f3471227a2eff6d0bed70555a9d73e48ead54d9`. There is no open Blocker or Major. The label still waits on green CI for this head, once it is pushed.

## Review round 8 (15e7fe389, test-only)

This is a diff-only re-review (P-277) of `git diff 6f3471227 15e7fe389`. It has one commit, and that commit's only parent is `6f3471227`.

* **Scope:** two files changed, both tests: `tests/check_csdl1_deadlines.ts` (+13) and `tests/check_csdl1_deadlines_browser.ts` (+7/-9).
  * Nothing outside `tests/` changed, so no product code moved.
  * The migration `20261118194500_csdl1_firm_calendar/migration.sql` is untouched. Its sha256 is still `01d439bd…3e55e4`.
* **Why the change is right:** CS-W1 part 1 now seeds both Sample firms when a fresh copy starts.
  * That broke the old setup step, "a fresh copy holds no platform firm A yet".
  * It also hollowed out the old browser case "a case whose platform firm cannot be found". Firm A existed; it just had no settings.
  * `seedSampleFirms(db)` is idempotent. Neither the seed nor the demo reset writes a calendar setting (`SAMPLE_SETTING_VALUES` holds only `legal.closed_client_files_years`). So firm A really has no calendar setting until DW8 sets one.
* **Unit suite:** `tsx --tsconfig api/tsconfig.json tests/check_csdl1_deadlines.ts` gives **37/37 passed** at `15e7fe389`. That is round 7's 34 plus the three new DW8 cases.
* **Mutations:** each run in a scratch copy of `prototype/`; the copy was restored to 37/37 afterwards.

| Mutation | Result |
|---|---|
| M1a: the stand-in `$queryRaw` returns firm A's row for any key (the database answers an unknown key with another firm's row) | "DW8 fail (unit): a firm key the database does not know…" FAILs (zone Asia/Tokyo). 36/37 |
| M1b: product `caseFirmCalendar` falls back to `platform_firm_calendar('sample-firm')` when the key finds no row | The same case FAILs. 36/37 |
| M2: drop the schema check in `caseFirmCalendar`'s `read` (return the stored value whenever it is not null) | The suite stops with `RangeError: Invalid time zone specified: Mars/Olympus` and exits 1, so the mutation is caught. This is the "500" the case's name rules out. |
| M2b: a narrower version that drops the schema check for `closed_days` only | "DW8 fail (unit): stored values that no longer fit…" FAILs. 36/37, exit 1 |
| M3: `caseFirmCalendar` always reads firm B (`platform_firm_calendar('sample-solo')`) | The unit suite's "DW8 pass (unit)" FAILs (36/37). In the browser check, firm B's Mon 8 Mar closed day is set before the firm-A case runs (line 55). So the case's `bare.mark === null` would get "closed day" and FAIL. That is from reading the code: as asked, I did not run the browser check. |

* **Is DW8 coverage still as strong? Yes.** "A case whose platform firm cannot be found" is still proved, now in two parts that each run against what they claim:
  * DW9 in the browser check, against the real database, already proves the function returns no row for unknown keys: empty, SQL in the key, `SAMPLE-FIRM`, `sample-firm ` with a trailing space.
  * The new unit DW8 proves that no row gives the defaults, never another firm's calendar.
  * The browser's DW8 pass case already proves the wiring that sends the case's own `firmKey` to `caseFirmCalendar`.
  * Before, the browser check ran one direct end-to-end case for a missing firm. Now the proof is put together from these pieces. I find that just as sound, and more honest than the old case, which passed only by coincidence once CS-W1 seeded firm A.
  * The browser's new fail case, firm A with no setting while firm B is closed that day, is a real cross-firm check and not a coincidence.
* **New minor (m5, the comment only):** the browser check's header (lines 4-5) still says DW8 proves "a case whose firm cannot be found gets the defaults". Line 44 and the unit suite now hold that case. Fix the header when convenient. This does not block.

### Could not check
* The browser check at this head (the builder is running it on an isolated copy) and CI for this head (not pushed yet).
* The journey was not re-run: this commit changes only tests. Round 3's 9.5/10 stands.

The round 3 minors m1-m4 stand as recorded.

**Verdict: Approve** for `15e7fe3896cbf71a225d9c764b93459c2e4dc2b7`. There is no open Blocker or Major. The label still waits on green CI and the builder's browser check passing at this head.

## Review round 9 (c7ad059f7: merge + rename)

Diff-only re-review (P-277) of `15e7fe389..c7ad059f7`: bd9ba5ab4 merges origin/main 9d440b2f4 (Build Lead C's step 1), and c7ad059f7 renames the migration folder to Lead 84's slot.

* **`complaints.ts`, against main:** the only change is CS-DL1's own. The settings import drops `BUSINESS_HOURS` and `CLOSED_DAYS`. `BusinessDayTally`, `businessDaysBetween`, `readFirmCalendar` and `FirmCalendar` now come from `../calendar/working-days.ts`, `acknowledgeBy` stays in `./business-days.ts`, and `calendar()` calls `readFirmCalendar`. PF-19r's work is intact: the `mailIn` and `MessageRefused` imports, the tiered `runAckReminder`, and `after.push(await mailIn(...))`. Since 15e7fe389 the diff holds only main's PF-19r change.
* **Imports:** the api typecheck reports `PASS no new type errors (15 known, 0 fixed)`, and web has 0 errors. No import is unused or missing.
* **`platform/MODULE.md`:** it is 40 lines and keeps main's `check_pf19r_senders.ts` plus CS-DL1's `check_csdl1_deadlines.ts`. Against main, it shows only CS-DL1's Purpose, wall and invariant lines. `module-cards.py tree` reports `PASS module cards: 15 cards, tree checked`.
* **Migration:** `20261119000000_csdl1_firm_calendar/migration.sql` has sha256 `01d439bdc6cabf11131534a8af5a0b3cc8d1e9eabf88feaca625001c8e3e55e4`, the same as the old folder at 15e7fe389 (git sees a 100% rename). The new stamp is later than main's newest, `20261118200100_fo7ts_card_terminal_trust`, and no other folder uses it. `git grep 20261118194500` at c7ad059f7 finds nothing. The three repeated stamps already on main (20261025090000, 20261031140000, 20261102010000) predate this PR and are not its concern.
* **Scope:** `git diff origin/main...c7ad059f7` lists 19 files (513+/108-), all CS-DL1's own, and `git diff origin/main c7ad059f7` lists the same 19. Nothing of main leaked in or was reverted. For example, main's FO-2 changes to `leads.ts` are kept, and against main only CS-DL1's one-line `FirmCalendar` import differs.
* **Suite at c7ad059f7:** `tests/check_csdl1_deadlines.ts` passes 37/37 against the shared database.

### Could not check
* The builder's other suites at bd9ba5ab4 and their re-runs at c7ad059f7 (PF-12, C6.17 migration, FO-7ts, DW7-DW9). I take them from the builder's report and did not run them. CI for this head.
* The journey was not re-run: these two commits do not change the screen. Round 3's 9.5/10 stands.

The minors m1-m5 stand as recorded.

**Verdict: Approve** for `c7ad059f79da2e4373517a00c2e931bac1685cb3`. No Blocker or Major is open.
