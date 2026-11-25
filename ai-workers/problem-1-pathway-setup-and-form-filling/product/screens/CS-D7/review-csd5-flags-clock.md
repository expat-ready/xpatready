# Review: PR #3355, `check_csd5_flags.ts` back-dates in hours (CS-D7, test-only)

Reviewed commit `744a613833d939e160d93be1cfb13458afa74678` on `claude/trusting-keller-t74sqh`. Reviewer did not write it. Date 24 Nov 2026, run from 00:19 to 00:35 UTC, which is inside the failing hour.
Diff: one file, `prototype/studio/tests/check_csd5_flags.ts`. Line 109 changes `now() - interval '400 days'` to `now() - interval '9600 hours'`, with a 2-line why-comment at 109-110. Line 119 changes `- interval '1 day'` to `- interval '24 hours'`. No app code changed (`git diff --name-only 744a61383^ 744a61383` lists only this file).
Scope: the screen-review checks for concept, D1-D20, BIC and journey are N/A here. The PR changes no screen, route, table or words, so it has no user journey to walk and no journey score.

## (a) The app counts UTC dates in both places the test reads: confirmed
- `api/src/case-document-flags.ts:41-42`: `day = d.toISOString().slice(0,10)` (UTC date) and `daysBetween` takes the difference of two `T00:00:00Z` dates. Line 55 uses `daysBetween(day(d.uploadedAt), today)` for the "Uploaded N days ago" warning.
- **Checklist line `flag_warnings`:** `case-checklist.ts:156` sets `today: today.toISOString().slice(0, 10)`. Line 175 passes it to `flagsOf(x, …, d.today)`, which calls `flagWarnings`. Line 208 gathers `flag_warnings` from `x.flags.warnings`.
- **Prepare/readiness warnings:** `case-prepare.ts:681` calls `flagWarningsOf(...)`. At `case-document-flags.ts:94` that function sets `today = new Date().toISOString().slice(0, 10)` and calls `flagWarnings`.
- `case_document.uploaded_at` is `@db.Timestamptz` (`prisma/schema/evidence.prisma:60`), so Prisma reads an absolute instant. Only the SQL interval arithmetic depends on the session zone. The test database zone is `America/Toronto` (`show timezone` on :54329).

## (b) SQL proof: reproduced, plus a two-year sweep
My own query, session zone America/Toronto, using the app's rule (UTC date of now minus UTC date of `uploaded_at`):
```
 now_utc           | old_400d | new_9600h | old_plus_1d | new_plus_24h | old_elapsed       | new_elapsed
 2026-11-24 00:19Z |      401 |       400 |         402 |          401 | 400 days 01:00:00 | 400 days
 2026-11-24 01:19Z |      400 |       400 |         401 |          401 | 400 days 01:00:00 | 400 days
```
The builder's `scratchpad/proof.sql` gives the same numbers. Old form: 401, then 400. New form: 400 both times. New +24 hours: 401 both times. The old +1 day gave 402 in the bad hour, so before the fix the second assertion failed too.
**Sweep (every 10 minutes, 2026-01-01 to 2028-01-01, 105,121 instants, two winter and two summer clock changes plus a leap day):**
- `9600 hours`: always 400. `9600 hours + 24 hours`: always 401. Hours are absolute, so an elapsed time of exactly 400 x 24 h always spans exactly 400 UTC dates. The UTC rule cannot give 399 or 401 in any season.
- `400 days` gives **401** from 2 Nov to 7 Dec 2026, in the 00:00-00:59 UTC hour (the clock went back on 1 Nov 2026 / 2 Nov 2025). It gives **399** from 8 Mar to 12 Apr 2026, in the 23:00-23:59 UTC hour (summer time). So the old test was red in both windows, and the fix closes both.

## (c) Suite: passes, and a control run confirms the cause
- PR version, run at 00:27Z and again at 00:28Z (both inside the failing hour): `run-suites.sh --only "check_csd5_flags.ts"` → **PASS, 41/41** (runtime slot, ports +14000, not :4400). Log lines 24-25 show "Uploaded 400 days ago" and "Uploaded 401 days ago".
- Control: I put the parent version of the test back for one run at 00:28Z → **FAIL, 39/41**. Line 24 failed with `["Uploaded 401 days ago; …"]` and line 25 (review N1, a day later) also failed. Then I restored the file with `git checkout`. `git status` was clean before the last run. This reproduces the exact red from shard 18 and shows the fix removes it.

## (d) The list of other day intervals is honest; none was changed
- I re-ran the stated search (`interval 'N day(s)'`, `interval N days`, `make_interval(days`) over `tests/`: **68 matches**. The files and line numbers match the PR body exactly, and the diff touches none of them.
- I spot-checked PF-15 renewals, PF-15 limits, FO-5, PF-5t and PF-16 line 110. They are thresholds with slack, refusals or orderings. I found none that asserts an exact UTC day count after a calendar-day interval.
- **Outside the stated pattern (observation, not a finding against this PR):** the search does not catch template intervals (`interval '${…}'`, 12 sites). One of them looks like **the same class of fault**. In `tests/check_pf16_banner_browser.ts:47` + `:86`, `trial("14 days")` gives `now() + interval '14 days'`. `bannerDaysLeft` (`api/src/platform/billing/banner.ts:24`) is `ceil(ms / DAY)`. In SQL that gives **15**, not 14, at every hour from 18 Oct to 1 Nov each year (337 of 8,761 hourly instants in 2026), so "14 days left" would fail for about two weeks before the autumn clock change. `trial("10 days")` (lines 118, 139) has the same exposure if it asserts the count. `check_pf5s2_billing_browser.ts` already uses `"9 days - 1 hour"`, which is safe. Month and year intervals (`check_pf15_cases.ts:110` `'1 month'`, `j_69.ts:100` `'7 years'`) are also outside the pattern. pf15_cases computes its expected value in SQL, so it stays consistent. This is worth its own row. It is not this PR's scope, and I did not change it.

## (e) The comment is accurate and short; one Minor
- Two lines, the why, no history. "400 days is counted on the local calendar, so across the winter clock change it is 400 days and 1 hour, and between 00:00 and 01:00 UTC the app says 401" matches the proof exactly.
- **Minor (optional, does not block):** the comment names only the November case. The same interval is 1 hour short in spring and gives 399 between 23:00 and 24:00 UTC (8 Mar to 12 Apr), and the fix covers that too. Adding "(and 399 in spring)" would make it complete. "Winter clock change" is clear enough: it means the change to winter time, which the PR body calls autumn.

## Residual risk (existed before, not introduced)
- If UTC midnight passes between the SQL `now()` and the app's `new Date()` (milliseconds), or between line 119's update and `prep()`, the counts shift by one. The window is tiny, every date-counting test shares it, and it is not a reason to change this PR.

## Issues
| # | Severity | Where | Issue | Fix |
|---|---|---|---|---|
| 1 | Minor | `check_csd5_flags.ts:109-110` | The comment covers the November 401 case but not the spring 399 case the fix also closes | Optional: add "(and 399 in spring)" |
| 2 | Info, not this PR | `check_pf16_banner_browser.ts:47,86` (and possibly `:118`, `:139`) | Template `'14 days'` interval plus `ceil` gives 15, from 18 Oct to 1 Nov each year. The PR's search pattern misses it. | Separate backlog row: use hours, or `"14 days - 1 hour"` as pf5s2 does |

No Blocker, no Major.

## Could not check
- The CI log of full run 45292899069, shard 18 (not fetched). My control run reproduced the same two failures locally instead.

Reviewer: Approve 744a613833d939e160d93be1cfb13458afa74678

Verdict: Approve
