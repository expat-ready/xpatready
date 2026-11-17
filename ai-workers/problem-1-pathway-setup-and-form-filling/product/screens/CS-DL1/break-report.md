# CS-DL1 part 1: break report (PR #2000, `claude/runtime-csdl1a` @ a5f25f46e)

Breaker pass, 16 Nov. Scope (P-26): `screens/CS-DL1/` has no concept.md, challenge.md or build-notes.md, so "what gets built" was taken from `product/design/briefs/CS-DL1.md` Part 1 and AG-7-94@2b63ee12. That covers `platform/calendar/working-days.ts` (`calendarDate`, `isOpenDay`, `countBack`, `dayMark`, `readFirmCalendar`, the moved helpers) and `showDeadline` in GET `/api/runtime/cases/:id/stages`. This part has no screen, so these checks do not apply: uploads, keyboard, 1024 px / 200 %, two sessions, duplicates, hierarchy. Part 2 (reminders, jobs, close/reopen) is not in scope.
Probes: `/tmp/claude-0/-home-user-xpatready/09435c72-30f8-58d5-b85a-ace19cf123d2/scratchpad/breaker/b1.ts` (bad dates, odd n, showDeadline), `b2.ts` (runs of closed days, zones, timing), `b3.ts` (sparse hours, Missed at midnight), plus live calls on :4471. The brief's case ebde2f63… is not in the db (404), so I opened a case of my own on `study_then_work`: 18b366f6-9fc2-4983-aaad-1f462da1f125, ref BRK-DL1-1. I tampered with its study stage's `key_details` and then restored the original value.

## Findings

**M1 (Major). With a valid calendar, `countBack` can return a day later than the right one, and even a weekend.** This breaks AG-7-94 r5/r6 ("lands on an open day", "never later than the computed day") and AG16-7.
`working-days.ts:131-132,134,138`. The walk stops after 366 + ceil(7n/5) days (n=0: 367 days), then falls back to "n calendar days before". The comment on line 124-125 calls that fallback "earlier, never a miss". It is the opposite: an open day exists further back, so the fallback is later than the right answer.
Repro (b2.ts, b3.ts):
- Firm with 262 consecutive closed weekdays before Mon 8 Mar 2027. `CLOSED_DAYS` allows up to 366, so the setting is valid (`settings.ts:196`). `countBack("2027-03-08", 1)` gives **2027-03-07 (Sun, weekend)**; the right answer is 2026-03-04.
  - n=2 gives Sat 6 Mar; the right answer is 2025-10-08.
  - n=0 with the date itself closed gives Mon 8 Mar, which is a closed day; the right answer is 2026-03-05.
  - With 260 closed weekdays the result is still correct; at 262 it is wrong.
- Firm with Friday-only hours (a valid setting). n=70 gives 2026-12-28, which is not an open day; the right answer is 2025-11-07. n=100 gives 2026-11-28 instead of 2025-04-11.
- Firm open Mon-Wed. n=400 gives 2026-02-01 instead of 2024-08-14.
The suite's own MAX_COUNT_BACK of 2600 is therefore not reachable correctly on sparse calendars. With part 2's Sample offsets (7 / 2 / 0) it takes the extreme closed-days list to trigger this, but part 2 builds DW11 ("a run of closed days") on this function.

**M2 (Major). The case view never reads the firm's own calendar.** The "(closed day)" mark and Missed "in the firm's zone" only ever use the built-in defaults (Mon-Fri 09:00-17:00, no closed days, America/Toronto).
`case-stages.ts:77` uses `currentFirm() ?? NO_ID`. But `/api/runtime/cases/:id/stages` is an `x-actor` route (`@CaseRead`, `case-stages.ts:281-285`). PF-4's guard, which sets the firm, runs only on `/api/platform|front-office` and on keyed runtime routes (`core.ts:94-95`). So on this route `currentFirm()` is always undefined.
Repro: GET stages for the BRK-DL1-1 case answers `Sun 7 Mar 2027 (weekend)`, read from the defaults. Whatever a firm saves for `platform.closed_days`, `platform.business_hours` or `platform.time_zone`, no request to this route can reach those values. For example, a Tokyo firm's deadline turns Missed by Toronto's date, 13-14 h late.
AG-7-94 r3 (closed-day mark) and the brief's "Missed … in the firm's zone" are only met inside the pure-function tests (DW3/DW4 call `showDeadline` directly). Commit a5f25f46e deliberately replaced the earlier firm lookup to keep PF-12's wall. This is a contract gap that needs the lead's ruling, written down, rather than a silent fallback to the defaults.

**m1 (Minor). `showDeadline` throws, and GET stages answers 500 for the whole case, when the due date leaves four-digit years.**
`stages.ts:122` can produce `"+010000-01"` or `"-000001-12"`. `dayMark` → `calendarDate` then throws RangeError (`case-stages.ts:64`), and `ProblemErrors` turns that into a 500 (`main.ts:220-221`). Before this PR the same row showed a garbage date and did not fail.
Repro (b1.ts): `showDeadline(deadlineOf({add_days: 1, …}, [{… value: "9999-12-31"}]), cal, today)` throws "That date does not exist". `0000-01-01` with add_days -1 also throws.
How it is reached: the key-detail write paths refuse years outside 1950-2100 (`stages.ts:93,106`), so only a stored row (older data, an import, a seed) together with a route whose `add_days` is not 0 triggers it. On the live route (`add_days` 0) the tampered values `0000-01-01` and `9999-12-31` did not cause a 500.

**m2 (Minor). Year 0000 is accepted as a calendar date and shown with the wrong year.** `calendarDate("0000-01-01")` passes (`working-days.ts:111`). Live, after tampering the stored key detail to `0000-01-01`, the deadline shows **"Sat 1 Jan 1 (weekend)"**, which is year 1 not year 0 (via `fmtDate`), and Missed true.

**m3 (Minor). A count back from a real date can be refused with "That date does not exist".** `countBack("0000-01-03", 5)` and `countBack("0000-01-01", 0)` throw NO_SUCH_DATE. The walk steps into year -1, where `prevDate` gives `"-000001-12"` and `isOpenDay` re-checks it (`working-days.ts:53,119,131,136`). The input date exists, so the words are wrong. This only happens next to year 0.

**m4 (Minor). The "no open day at all" fallback is the latest possible guess, not the earliest.** This is the same code as M1 (`working-days.ts:138`), in the case where the firm has no open days at all.
- Hours `[]` (valid), or Saturday-only hours: n=5 from Mon 8 Mar gives Wed 3 Mar, n=0 from Sun 7 Mar gives Sun 7 Mar itself, and n=2600 gives 2020-01-24 (calendar days).
- "Duplicate beats a miss" (AG-7-94 §10) points the other way: counting Mon-Fri would land earlier (n=5 → Mon 1 Mar).
- DW2's own "fail" case asserts this fallback, so the test locks in the behaviour.

**m5 (Minor, outside this row's touch list; for information).** A government date typed as 31 Feb when opening a case gets "Study permit valid until: write a date as YYYY-MM-DD, for example 2027-02-03." (live POST `/api/runtime/cases`, 400, nothing saved; `stages.ts:105`). AG-7-94's failure test asks for "That date does not exist". A stored `2027-02-31` reads "Can't set: … is missing" (`stages.ts:121`). The brief scopes DW6 to the function, so this belongs to the input path's owner, not this PR.

## What held
- **DW6 bad dates.** All of these are refused with exactly "That date does not exist":
  - impossible days: 2027-02-31, 2027-02-29, 1900-02-29
  - leading or trailing spaces, `\n`, NUL
  - Arabic-Indic or full-width digits, Unicode hyphens
  - `+02027-…`, ISO timestamps, `20270307`, week dates
  - `null`, `undefined`, numbers, `Date`, arrays, `String` objects, `{toString}`, `true`
  Real leap days pass (2028-02-29, 2000-02-29), and so does 9999-12-31.
- **Odd n.** 0 and -0 give the same day; 2600 is accepted and 2601 refused. These are all refused with the range words: -1, 0.5, NaN, ±Infinity, MAX_SAFE_INTEGER, 1e21, `"2"`, `true`, `null`.
- **Never after the date.** For n≥1 the result is always before the date; for n=0 it is on or before it.
- **Zones.**
  - Pacific/Apia 30 Dec 2011, the skipped day: not open, marked "closed day"; the count steps over it (2012-01-02, n=1 → 2011-12-29).
  - Pacific/Kwajalein 1993: correct.
  - DST days: Toronto spring and fall, Havana and São Paulo midnight skips, Lord Howe's half-hour shift: no crash, correct days.
  - Etc/GMT+12, Kiritimati, Tehran: correct.
- **Missed at midnight.**
  - Toronto: 04:59:59.999Z is not Missed, 05:00:00Z is.
  - Kolkata: 18:29:59.999Z / 18:30Z, same pattern.
  - Toronto fall-back night: correct.
  - Apia across the skipped day: Missed from 31 Dec.
- **Live GET stages with stored values.** Numbers, arrays, a bare string, an extra `by` and impossible dates in `key_details` all give a 200 with "Can't set". A non-object `key_details` is refused by the db check `case_stage_key_details_object`.
- **Cost.** n=2600 runs in about 72 ms (366 closed days included); n≤100 in under 12 ms.
- **The move is a move.** The moved code is line for line PF-21's apart from the exports. `acknowledgeBy` and `ACK_BUSINESS_DAYS` stay in `complaints/business-days.ts`. `check_csdl1_deadlines.ts` passes 28/28.
- **Wall.** No firm is looked up across the wall (but see M2).
