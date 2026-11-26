# R1.79 part 1 (CS-R1 part 1): review, round 2 (diff only)

PR #3642 · head `bfd4ae9ccdb8b267762fa32534de2fa36c36ee1b` · diff `39ccdbd35..bfd4ae9cc`, code in `b710c366e`: `api/src/case-reports.ts`, `tests/check_csr1_reports.ts`, `MODULE.cases.rows/CS-R1.md`. The reviewer did not build it.
**Verdict: Ship after fixes → Changes** (1 Major open, test-only). Journey score **9.4/10** (7.5 of 8 applicable; pass; `journey-test-reviewer-2026-11-25-r2.md`).

## What I ran
* **The PR's test** (from `prototype/`, Postgres 127.0.0.1:54329): **41 passed, 0 failed, exit 0** (9 s).
* **Repo checks:** `typecheck.mjs`: no new type errors (15 known). `graph.mjs --check`: exit 0. `count-any` 416 → 416. `run-suites --changed 39ccdbd35..HEAD --list` selects `check_csr1_reports.ts`.
* **Mutation harness:** 26 mutations, each run on a scratch copy of `studio/` in the scratchpad, never on the repo files. Probes run on the same copy.
* I read the breaker's `break-report-2.md` after my own findings. Where we agree, it is noted below.

## Round-1 findings: fixed, and does a test fail without the fix?
| Round 1 | Fixed? | Test bites? (the mutation → what fails) |
|---|---|---|
| Reviewer M1 / breaker M1: drill wider than the figure | Yes: every `drillTarget: null` (`:103,117,139,159`) | Restore the case-list drill → DW6 fails 2 |
| Reviewer M2 / breaker M2: one query per combination | Yes: one recursive CTE, a hashed subplan (`:61-72`) | Restore the per-combination loop → the new DW7 line fails (400 combinations). My probe, at 2,000 combinations three levels deep: CORPORATE and INDIVIDUAL both 0 over budget, 7-13 ms per metric |
| Reviewer M3a: median | Yes: Biometrics 1/2/9 days (`test:113-115`) | `avg` in place of the median → DW2 fails |
| Reviewer M3b: case load's date range | Yes (`test:172`) | Range removed → DW2 fails |
| Reviewer M3c: the trend's own days | Yes (`test:176-177`) | `lo` clamp off → DW5 fails; `hi` clamp off → DW5 fails |
| Reviewer M3d: inclusive last day | Yes (`test:214`, plus c2 on 2 Nov) | `at(to, 0)` → 2 checks fail |
| Breaker M3: silent 200-row cut; "Slowest" wrong | Yes: `capped()` `:79-82`; slowest found in SQL before the cut `:145` | Silent slice → DW2 fails; order by name → 3 fail. **The all-ties guard does not bite** (n1) |
| Reviewer M4: Done when cut silently | Deferred to "part 1b" (PR comment, 25 Nov 05:25) | See below: acceptable |
| Reviewer m1 = breaker M3 | Yes | As above |
| Reviewer m2: closed counts follow the status | Yes, in the words: "cases closed and still closed" (`:118`) | Words only: OK for a Minor |
| Reviewer m3 / breaker m2: UTC buckets | Yes: `platform.time_zone` through `readSetting` (`:48`), day edges `:50` and buckets `:129` in that zone | Zone set to UTC → 4 fail. **A hard-coded Toronto passes 41/41** (N1b) |
| Reviewer m4: wrong firm-wall claim | Yes in code and test headers (`:11-12`, `test:5`); **the PR body still says "The firm walls (PF-12) apply"** (m3) | Firm predicate removed → 11 fail |
| Reviewer m5: negative duration; MODULE row | Yes (`:150`; `CS-R1.md:2` adds combination, programDef, platformFirmSetting) | Backwards stage kept → 2 fail |
| Breaker m1: labels | Partly: null stays its own row (`:112-113`); the cut is by code point (`:42`) | Null renamed → DW2 fails; untrimmed names pass 41/41 (breaker n3 has the rest) |
| Breaker m3: dates before year 100 | Yes: `clampDay` (`:41`) | `trendMonths` clamp off → DW5 fails. **The frame's clamp off passes 41/41** (n1) |
| Breaker m4: backwards stage | Yes | As reviewer m5 |

**Reviewer M4 deferred to part 1b: acceptable for this PR.** CS-R1's own row says "size: 2 PRs" (`BACKLOG.md:1139`), so a second CS-R1 PR fits the row. The deferral is now named, not silent. It goes to the tech lead as a question on the PR, which is on GitHub (P-82). `Completes: R1.79` sits in part 5, so the item cannot close without part 1b. One record gap remains, m3 below.

## New code checked (the rewrite)
* **`Prisma.sql` and time zones:** every value is bound, including the zone. `(day::date + n)::timestamp at time zone zone` is midnight in the firm's zone, and `to_char(x.at at time zone zone)` buckets in the same zone, so neither depends on the session. `group by 1` avoids the "same expression, different parameter" error.
  * Probe P3: with firm A set to Asia/Kolkata, c6 moves to November, and the solo firm stays on the Toronto default.
  * Breaker n1 (a zone whose DST change falls at midnight, such as Havana) is a real edge; I agree it is Minor.
* **`not in` with the CTE:** there is no NULL trap. `runtime_case.combination_id` is NOT NULL (`cases.prisma:14`), and the subquery returns `combination.id`, the primary key. The CTE is uncorrelated, so it runs once.
  * Probe P1, on the real shape (combination on a PROGRAM or STREAM under its PATHWAY, and nested PATHWAYs both ways): the result matches `groupOfCombination` for all four combinations, CORPORATE and INDIVIDUAL.
  * **But the suite never tests that shape** (N1a).
* **`capped()`:** ≤ 200 rows come back whole. Otherwise it returns 199 rows plus a rest row; the rest row's `ended` and `cases` totals are right ("8 more stages", ended 8). Zod's 200-row limit holds.
* **`trendMonths`:** the year-end roll, the 24-month cap, the 6-month default (`m < 1` roll) and a future `from` are all right. `today` is the firm's date (`:121`).
* **`new_vs_closed` lo/hi:** `lo` = max(from, first month shown); `hi` = the day after `to`, else the end of the last month.
  * The `f.to.slice(0, 7) <= months.at(-1)` test is always true when `to` is set (dead branch, harmless).
  * A period wholly before 1970 is relabelled (n2).
* **`readSetting` under the firm walls:** it reads only the caller's firm. In DW3's cross-firm read (firm B's context naming firm A), the wall hides A's row and the default is used: nothing leaks. A stored value that fails its schema throws, which gives UNAVAILABLE, not 500.
* **Reads per door call:** about 4 per metric (setting, caller's scope, person scope, the figure). None is per row.

## Issues (ranked)
**N1, Major, Must: two rules the rewrite added have no test that fails when they are removed (WAY-OF-WORKING "Every PR": a pass and a fail; the same bar as round 1's M3).**
* **(a) The walk up to the nearest Pathway** (`:63-71`). The fixtures put each combination directly on a PATHWAY node (`test:66-70, 139-141`). So `where false` in the recursive step, or `order by depth desc` (the farthest Pathway), both still pass 41/41.
  * On real data (Visitor visa, `check_csc1_count.ts:76-83, 241-244`), a combination hangs below its Pathway. Without the walk, every case would read Individual and Corporate would show 0, with CI green.
  * This rule used to be `groupOfCombination`, which has its own tests. It is now a second copy in SQL.
* **(b) The firm's stored time zone** (`:48`). Every fixture uses the default, so `const zone = 'America/Toronto'` passes 41/41.
* **Fix (test only):**
  * Hang `combo()`'s combination on a PROGRAM child of the PATHWAY, as `check_csc1_count.ts` does. Add one nested PATHWAY (Corporate over Individual) whose nearest Pathway decides.
  * Ideally, add one line comparing the CTE against `groupOfCombination` for every fixture combination.
  * Add one DW5 line with `platform.time_zone` stored for firm A (for example Asia/Kolkata: c6 moves to November).

**n1, Minor, Should: two smaller guards do not bite.**
* The all-ties guard `min < max` (`:145`): dropping it passes 41/41. This is the breaker's round-1 repro (every row tied, so every row was "Slowest"). Dropping `count > 1` also passes.
* The frame's `clampDay` (`:49`): without it, `0000-01-01` makes every read throw. Only the pure `trendMonths` is tested (`test:41`).
* **Fix:** one all-tied fixture (or a check on firm B's 200 one-day "Many stage" rows without the 45-day one), and one door call with `from: "0000-01-01"` expecting OK.

**n2, Minor, Should: the rest row and early periods are worded as data.**
* `{stage: "8 more stages", …}` (`:113, :155`) has a data row's shape: PF-R3 cannot tell it from a stage of that name, and it can swallow the null "no stage yet" row. The breaker's n2 agrees.
* A period wholly before 1970 answers months it was not asked about: `{0050-03-01..0050-03-01}` gives `[1970-01]`, and `{to: 1960-05-01}` gives 1969-08 to 1970-01 (probe P4).
* Ties at the top mark both rows "Slowest" (probe P5). That is defensible, but it is not "one row" as round 1 asked: say so in the words or pick one.
* **Fix:** add a marker on the rest row (for example `more: 8`, stage null). For a period before 1970, return an empty trend or a 422.

**m3, Minor, Should: the PR record lags the code.**
* The PR body still says:
  * "a figure links only when no filter is in effect";
  * "The firm walls (PF-12) apply";
  * "31 passed";
  * a 5-part plan with no part 1b.
* j_79's step "a figure with no filter drills to the case list" contradicts DW6. PF-R3's Done when, "a drill-through opens the target list" (`BACKLOG.md:1110`), now has no row that makes the case list keep to open cases and the case scope (`:16-17` says only "it comes with a scoped list").
* **Fix (records):**
  * Update the PR body.
  * Add part 1b to the plan table, with its three lines: case load by combination, officer and status; findings by stage and officer; the plan check.
  * Name where the scoped case list goes, in the part 1b question or as a Question to the tech lead.

## Could not check
* Browser dimensions, BIC and D17/D20: no screen (PF-R3).
* CI on this head: `ci`, `types` and `regression` were skipped on `bfd4ae9cc` (a records commit) and cancelled on `b710c366e`. My local test and type check stand in for them.

To fix before Approve: **N1** (a and b). n1-n2 and m3 should be done in the same push.

Reviewer: Changes bfd4ae9ccdb8b267762fa32534de2fa36c36ee1b
Verdict: Changes bfd4ae9ccdb8b267762fa32534de2fa36c36ee1b
