# R1.79 part 1 (CS-R1 part 1): break report

PR #3642, branch `claude/jolly-brahmagupta-c693m4`, head `39ccdbd354f9c75358b09105d16e27b3271781e3`. API only, so no browser was used.
Method: I copied the setup of `studio/tests/check_csr1_reports.ts` into scratch scripts (`/tmp/claude-0/csr1break/break.ts`, `break2.ts`, not in the repo). They use the same two Sample firms, the same fixtures and the same ~3,000 firm-B cases. Every read went through `ReportsController.query` as `xr_app` inside `withFirm`. Run from `prototype/` with `npx tsx --tsconfig studio/api/tsconfig.json <script>` against Postgres 127.0.0.1:54329. Each run used its own `xr_studio_csr1break_<pid>` database, dropped at the end. The PR's own test passes: 31 passed, 0 failed.

## Findings

**M1 (Major): the drill link from case load leads to a wider list than the figure.**
`case-reports.ts:31,74` drills `reports.cases.case_load` to `GET /api/runtime/cases` whenever no filter is set. But the figure is not the list:
- The figure counts only `c.status = 'OPEN'` cases inside `caseScope`.
- The list (`runtime.ts:1073`) filters only by `workspaceId` and `firmKey`. It has no status filter and no `caseScope`, so it shows closed cases and, for a view.own viewer, every case of the firm.
- Repro A5, as the Owner: the figure totals 3 cases (Study permit 2, Work permit 1), but the drilled list has 4 rows (closed c3 included).
- Repro A5, as the Owner with report view.all and only case view.own: the figure is `[]`, yet the drill is `{path:"/api/runtime/cases",query:{}}`, which opens all 4 firm cases.

The file header and `ports/metrics.ts` `drillOf` both promise "never a wider list than the figure". Here, "no filter in effect" ignores the figure's own fixed conditions (open only, case scope). DW6 tests only the case where a filter is set.

**M2 (Major): the client-type filter misses the STANDARDS §9 budget at 400 combinations.**
`case-reports.ts:48-52` reads every distinct combination of the firm. It then runs one recursive `groupOfCombination` query per combination, one after another. This happens again for each metric, so four times per door call.
- Repro A6: firm B got 100 PROGRAM nodes with 4 PATHWAY children each, and 400 combinations spread over its 3,000 cases.
- With no filter, the four reads take 23 ms in total.
- `overBudget(..., {clientType:"CORPORATE"})` at scope all: case_load 586 ms, new_vs_closed 514, stage_durations 422, open_review_findings 531.
- At scope own with INDIVIDUAL: 445-551 ms each.
- The door answering all four with CORPORATE: 869 ms.

DW7 runs the budget only with `filters = {}` (`check_csr1_reports.ts:192`), and firm A has 2 combinations, so the test never exercises this path. The CS-R1 row also asks for "each query uses an index (plan checked)", and no plan check exists.

**M3 (Major): the 200-row LIST cap silently drops rows, and the "Slowest" mark can be wrong.**
- `stage_durations` orders by stage name and then cuts at `limit 200` (`case-reports.ts:120`). "Slowest" is worked out on the rows that are left (`:121`).
- Repro B2: 205 stages "A000…A204" of 1 day each, plus "Zulu (the slowest)" at 45 days. The answer has 200 rows. Zulu, Visitor record and Work permit are gone, and **all 200** rows are marked "Slowest" because they tie at 1 day.
- `case_load` (`:85`) keeps the 200 biggest. Repro A7: 233 open cases come back as 200 rows totalling 201. Nothing tells the caller that rows were cut.

With 400 combinations, 200+ distinct stage names is plausible. AG-14-28 asks for paginated or streamed answers, not quietly incomplete ones.

**m1 (Minor): stage labels can merge or break.**
Repro B1:
- A real stage named "No stage yet" shows as a second row with the same label as cases that have no stage (`:86`).
- Two long names that share their first 300 characters show as two identical labels.
- `slice(0, 300)` splits an emoji and sends a lone surrogate (`"…xxxxx\ud83d"`).
- A stage name of only spaces ("   ") shows as its own row.

**m2 (Minor): months and day edges use UTC, not the firm's time zone.**
- `to_char(x.at at time zone 'UTC')` (`:99`) and `dayStart` (`:33`) cut days and months in UTC. AG-14 (v1.11, line 134 and line 205) says "time buckets honour the firm/office timezone".
- Repro A4: a case opened at 21:30 on 31 Oct in Toronto (01 Nov 01:30 UTC) counts in November.
- The same case is missing from `case_load` with from = to = 2026-10-31.
- `platform_office.time_zone` exists (migration pf18a), but the Sample firm has no office row.

**m3 (Minor): dates before year 100 are accepted and misread.**
- `DAY` (`ports/metrics.ts:62`) accepts `0000-01-01`. With `{from:"0000-01-01",to:"0000-12-31"}`, all four metrics come back UNAVAILABLE (the read throws). The answer should be 422 or a value.
- `Date.UTC` with a two-digit year (`case-reports.ts:62,96`) maps `{to:"0050-03-01"}` to 1950, so the trend is `[]` instead of 6 months.

This is harmless but sloppy.

**m4 (Minor): a backwards stage gives a negative duration.**
Repro A7: a stage with `ended_at` before `started_at` reads as `average_days: -9`, and the status is OK. Nothing in the read or the table refuses it.

**m5 (Minor, inherited from `caseScope`, not this PR's code): team rows match by staff id or actor id.**
- `case-access.ts:31` lets team rows match the person's staff id or their actor id.
- Repro A2b: when the Officer's `actor_id` is set to another staff member's id, the Officer's own figures, and the Owner's figures filtered to the Officer, rise from 1 to 2. The extra count is the other person's team case.
- This needs an actor id that is a UUID equal to someone's staff id, so it is theoretical. The report inherits it unchanged.

## What held

- **Cross-firm:**
  - Firm B's ~3,000 cases and 1,500 findings never reach firm A.
  - A read run as firm B that names firm A's id returns 0, or empty lists and zero months, for all four metrics.
  - A firm-A context with firm B's staff id counts nothing.
  - The combination list behind the client-type filter is firm-bounded, and only its effect on the result is used.
- **Own scope:**
  - The Officer (report own) gets only c1 and c3, with or without case view.all.
  - Without any case key, the Officer gets 0 or empty lists, and the trend shows zero months.
  - `scope:"all"` in the body is ignored.
  - A person filter naming the Owner or another firm's staff is 403 OWN_ONLY.
  - The Officer's own id in UPPER case is accepted and counts the same.
- **Key combinations:**
  - Report all with case own only counts the Owner's own cases (none).
  - The same plus a filter on the Officer gives the intersection (0).
  - Report financial only gives WITHHELD; no report key gives 403.
- **Person filter:**
  - A nonexistent UUID, a case id or a firm id as `staffId` counts nothing, with status OK.
  - An actor id string such as "user-O" is 422.
  - An ended team row counts nothing; an open team row naming the person's actor id counts.
- **Injection and shape:**
  - A quote or `--` in clientType, staffId or from is 422. So is `firmId` as a filter, `2026-02-30`, from > to, and lowercase `corporate`.
  - Every value is bound through `Prisma.sql`, and the combination ids go in as one `text[]` parameter.
  - 31 metrics is 422; 30 copies of one metric are answered once.
- **Trend cap:**
  - 1900-01-01 to 9999-12-31 gives exactly 24 months (9998-01 … 9999-12), with nothing unbounded.
  - A period across a year end keeps its order.
  - A future from with no to gives one month. A single day works.
- **Budget:** without the client-type filter, every metric is under 200 ms, both at firm B's 3,000 cases under the own rule and at firm A with 460 extra cases.

Verdict: Changes 39ccdbd354f9c75358b09105d16e27b3271781e3
