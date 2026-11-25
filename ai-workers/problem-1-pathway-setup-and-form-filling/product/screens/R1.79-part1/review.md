# R1.79 part 1 (CS-R1 part 1): review

PR #3642 · head `39ccdbd354f9c75358b09105d16e27b3271781e3` · diff `origin/main...39ccdbd35` (4 files, +357) · reviewer did not build it.
**Verdict: Rework → Block** (4 Major open). Journey score **8.1/10** (6.5 of 8 applicable; pass, narrowly; `journey-test-reviewer-2026-11-25.md`).

## What I ran
* **The PR's test:** **31 passed, 0 failed, exit 0** (8 s). Mutation harness and perf probe in the scratchpad, not the repo.
* **Repo checks:** `graph.mjs --check` exit 0 (no GRAPH.md entry for an API-only row); `count-any` 416 → 416; `run-suites --changed --list` selects `check_csr1_reports.ts`.
* I read the breaker's `break-report.md` after my own findings; it agrees on M1 and M2.

## Dimensions
No screen: D1-D20's browser dimensions and BIC-01-20 are **N/A** (they go to PF-R3); D17 and D20 not walked by an intended user. Code, rights, tests and repo rules are judged below.

## What holds
* **Rights (AG-14-19):**
  * `scopedCases` (`case-reports.ts:38-55`) bounds every number by `caseScope` plus `caseVisibleSql` (the viewer's case keys) and the explicit `c.firm_id`.
  * At own scope it uses the viewer, and under a person filter the named person's own cases (file owner or open team row). Another firm's staff gives nothing.
  * The 403 OWN_ONLY and the ignored body `scope` are PF-R1's and hold.
  * These rules are tested with a pass and a fail, and the tests bite: removing the person filter fails 6 checks, the viewer scope 2, the firm predicate 8.
* **SQL:**
  * Every value is a bound parameter.
  * `case_stage_one_current` makes the left join one row per case.
  * Columns are timestamptz, so `to_char(... at time zone 'UTC')` does not depend on the session.
  * Finding states match the `review_finding_state_check`.
  * The trend is capped at 24 months, which bites (AG-14-28).
* **Read budget without filters:** 8-27 ms for all four with about 3,000 cases of firm B. DW7's fail line bites.
* **Repo rules:** nothing is written (AG-14-1); there is no second route; MODULE row file present; usage line present; any count unchanged.

## Issues (ranked)
**M1, Major, Must: the drill leads to a wider list than the figure (AG-14-22; PF-R1 break M4).**
* `case-reports.ts:31,74,77` drills case load to `GET /api/runtime/cases` whenever no filter is set.
* That list (`runtime.ts:1073`) filters by workspace and firm key only: no status, no `caseScope`.
* So the figure "open cases, only cases you may open" drills to a list that also holds closed cases. For a viewer with case view.own only, the figure is `[]` and the link opens the whole firm.
* The file header (`:13-14`) promises the opposite. DW6 (`check_csr1_reports.ts:187`) asserts the wrong link.
* **Fix:** `drillTarget: null` on case load until the case list carries status and case scope, and flip DW6's pass.

**M2, Major, Must: the client-type filter makes one query per combination, and the budget test never runs it (STANDARDS §2 [M] "no N+1", §9 [M] 200 ms).**
* `case-reports.ts:48-53` loops over every combination of the firm, one awaited recursive `groupOfCombination` query each, once per metric (4 times per door call).
* My probe:
  * 100 combinations: door call 269 ms;
  * 300 combinations: each metric 329-370 ms, so `overBudget` with `{clientType:"CORPORATE"}` names all four. The breaker saw 422-586 ms at 400.
* DW7 (`check_csr1_reports.ts:192`) runs with `filters = {}`, and firm A has 2 combinations.
* **Fix:** resolve the client type for all the firm's combinations in one recursive SQL, joined in the metric's query (or computed once per request). Add a DW7 line with `clientType` over about 100-400 combinations.

**M3, Major, Must: four rules have no test that fails when the rule is removed (WAY-OF-WORKING "Every PR": each rule a pass and a fail).** All of these mutations still give 30/30 on the rule checks:
* (a) Median replaced by `avg` (`:116`): each stage name has one ended stage (`check_csr1_reports.ts:101,106`), so average equals median.
* (b) Case load's date range (`:73,84`) removed: there is no case-load test with dates.
* (c) The trend's from/to clamps (`:97`) removed: the test uses month-aligned dates (`:147`).
* (d) The inclusive end day (`dayAfter`, `:133`) made exclusive: no finding sits on the `to` day (`:183`).

**Fix:** add fixtures for each:
* the same stage name with 1, 2 and 9 days (average 4, median 2);
* a case-load range that drops one case;
* a mid-month `from`/`to` that excludes a case in the same month;
* a finding at 23:59 UTC on the `to` day.

**M4, Major, Must: the row's Done when is cut silently (CLAUDE.md "never deviate silently"; BACKLOG.md:1139).**
* CS-R1 asks for these, and the part does not deliver them:
  * case load **by stage, combination, officer and status**: only open-by-stage is built;
  * open findings **by stage and officer**: one total is built;
  * the test "each query uses an index (plan checked)": no plan check.
* The PR's 5-part plan has no CS-R1 part 2, so these have no home. Only tasks and documents are raised (Questions 2 and 3).
* **Fix (records, no new code needed):** name where each goes (a CS-R1 part 2 in the plan, or a Question to the tech lead with a recommendation), and either add the plan check or list it there.

**m1, Minor, Should: the 200-row cap drops rows silently.**
* `:85` and `:120` apply `limit 200` (stage durations by name) and compute "Slowest" on what is left (`:121`).
* Ties mark every tied row "Slowest". The breaker's repro: 200 rows, all "Slowest".
* **Fix:** compute the slowest stage in SQL before the limit, flag one row only, and say when rows were cut.

**m2, Minor, Should: closed counts follow the status now.**
* `:102` counts `status = 'CLOSED'` with `closed_at`, and a reopen clears both (`cases.prisma:35-37`).
* So a case closed in November and reopened later leaves November's "closed" figure: the history rewrites itself.
* **Fix:** count from the close event (CS-C1a's case.closed), or say "cases closed and still closed" in the definition words (`:91`).

**m3, Minor, Should: months and days are cut in UTC.**
* `:33-34` and `:99` use UTC. AG-14 line 165 says "time buckets honour the firm/office timezone".
* **Fix:** record it as a Question or deferral. The Sample firm has no office time zone yet.

**m4, Minor, Should: the firm-wall claim is wrong for the case tables.**
* The PR body and the test header (`check_csr1_reports.ts:4,160`) credit PF-12's walls.
* But `runtime_case`, `case_stage` and `review_finding` are not in PF-12's RLS list (`migrations/20261116013000_pf12_firm_walls/migration.sql:197-206`).
* The explicit `c.firm_id` (`case-reports.ts:41`) is the only firm wall for these rows. Without it, firm A's Owner counts B's 3,000 cases ("No stage yet: 3000").
* It is tested, and that test bites.
* **Fix:**
  * the words: name `c.firm_id` as the wall, and note CS-W2;
  * code: keep the predicate on every read.

**m5, Minor, Should: other small items.**
* A stage with `ended_at < started_at` gives a negative average (`:115`).
* The MODULE row (`CS-R1.md:2`) omits `combination` and `program_def`, which are read through `groupOfCombination`.

## Could not check
* Browser dimensions and BIC (no screen).
* A real user's walk (D17 and D20).
* CI's result on this head: `run-suites --changed` was "running" in the PR body.

Reviewer: Block 39ccdbd354f9c75358b09105d16e27b3271781e3
Verdict: Block 39ccdbd354f9c75358b09105d16e27b3271781e3 (to fix: M1, M2, M3, M4)
