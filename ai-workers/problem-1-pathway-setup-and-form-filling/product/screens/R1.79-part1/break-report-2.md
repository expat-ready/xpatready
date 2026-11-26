# R1.79 part 1 (CS-R1 part 1): break report, round 2

PR #3642, branch `claude/jolly-brahmagupta-c693m4`, head `bfd4ae9ccdb8b267762fa32534de2fa36c36ee1b`. I attacked the change from `39ccdbd35` in `api/src/case-reports.ts`. API only, so no browser was used.

**Method.**
- The scratch script `/tmp/claude-0/csr1break2/run.ts` is not in the repo. It reuses the setup of the PR's own `check_csr1_reports.ts`: two Sample firms, firm B with ~3,000 cases and 400 combinations, and 206 extra stage names.
- Every read went through `ReportsController.query` (or `read` under `withFirm`) as `xr_app`.
- Database `xr_studio_csr1break2_<pid>` on 127.0.0.1:54329, dropped at the end (checked: none left).
- The PR's own test passes: 41 passed, 0 failed.

## Round-1 findings, re-run

| Round 1 | Now | Evidence |
|---|---|---|
| M1 drill wider than the figure | **Fixed** | Every `drillTarget` is null, and every answer's `drill` is null, including Owner, own-cases-only and no filter (R10). |
| M2 client-type speed | **Fixed** | Tree of 100 PROGRAM × 4 PATHWAY × STREAM × CATEGORY, with 400 combinations at depth 3 over firm B's cases, plus 5,000 noise combinations in another workspace. `overBudget` with CORPORATE and with INDIVIDUAL, 3 runs each at Owner, Officer (own) and Solo: worst 32 ms. The door answering all four for firm B takes 37–43 ms with or without the filter (round 1: 869 ms). The plan uses a hashed subplan, run once (8 ms). |
| M3 silent 200-row cut, wrong "Slowest" | **Fixed** | Firm A with 205 one-day stages plus "Zulu" at 45 days gives 200 rows. Zulu comes first and is the only row marked; the last row is "10 more stages" (ended 10). Case load with 237 open cases gives 200 rows that total 237. |
| m1 labels | **Partly fixed** | A real "No stage yet" stays its own row, and no lone surrogate is sent. The rest are in n3 below. |
| m2 UTC buckets | **Fixed for Toronto** | The case opened at 31 Oct 23:30 local is in October and in from = to = 2026-10-31 (TZ1). One edge is left: n1. |
| m3 dates before 100 | **Fixed** | `{0000-01-01..0000-12-31}`, `{to:0050-03-01}` and `{1970-01-01..9999-12-31}` all return OK for all four metrics; none is UNAVAILABLE, and no year is read as 19xx. One cosmetic point is left: n4. |
| m4 backwards stage | **Fixed** | `ended_at < started_at` is left out (`:150`). A zero-length stage reads as 0 days. |
| m5 team match by actor id | Unchanged, inherited from `caseScope` | Not this PR's code; not re-tested. |

## New findings

**n1 (Minor): a zone whose DST change falls at midnight loses a case from both months.**
- Repro TZ5: firm A set to `America/Havana`. Its clocks go back at 01:00 CDT on 1 Nov 2026, so 00:00–00:59 happens twice.
- Case cH was opened at 2026-11-01T04:30Z, which is 00:30 on 1 Nov local (first pass, as `Intl` confirms).
  - `case_load` with from = to = 2026-10-31 **includes** cH; with from = to = 2026-11-01 it **excludes** it.
  - Trend Oct only: Oct opened 2 (cH is in the window but bucketed "2026-11", so dropped). Nov only: Nov opened 2 (cH outside the window). Oct–Nov: Nov opened 3.
- So cH is counted in neither single-month view.
- Cause: `'2026-11-01'::timestamp at time zone 'America/Havana'` takes the *later* of the two local midnights (05:00Z) (`case-reports.ts:50, :126-127`), while `to_char(x.at at time zone zone)` buckets by wall-clock time (`:129`); day edge and month bucket disagree for that hour.
- Toronto and other zones that change at 02:00 are unaffected.
- A zone whose clocks jump forward at midnight (America/Santiago, 6 Sep 2026) held: the day starts at the first real instant.

**n2 (Minor): the "N more stages" row looks exactly like a real stage, and it can swallow "no stage yet".**
- The rest row is `{stage: "37 more stages", cases: 37}`. It has no marker field, so it has the same shape as a data row (`:113, :155`).
- Repro K5:
  - A real stage named "37 more stages" (1 case) and the rest row (37 cases) come back as two rows with the same label.
  - The `stage: null` row (c6, no stage yet) sorts last on ties (`nulls last`, `:111`), so it is folded into "37 more stages".
  - The m1 fix (null stays its own row, worded by the screen) does not survive the cap: the answer says "stages" for cases that have no stage.
- PF-R3's screen cannot tell the rest row from data without parsing English text.

**n3 (Minor, m1 remainder): stage labels still merge or split** (`name`, `:42`).
- Repro N1:
  - " Study permit" (leading space) appears as a second "Study permit" row (1 case) next to the real one (2 cases).
  - A name of only spaces ("   ") becomes `null`: a second "no stage yet" row.
  - Two names sharing their first 120 characters give two identical labels. The cut dropped from 300 to 120 characters, so this is now more likely.
- Slicing by code point still splits what a reader sees as one character:
  - A ZWJ family emoji at character 120 is cut to a lone "👨".
  - A flag 🇨🇦 at character 120 is cut to a lone "🇨".
  - "e" followed by U+0301 loses its accent.
- The comment says "never a split character". That is true for code points, not for what a person sees as one character.
- French, Arabic, Chinese and accented names all came through intact.

**n4 (Minor, cosmetic): periods before 1970 show months the period does not contain** (`trendMonths`, `:86-94`).
- `{from:0050-03-01,to:0050-03-01}` and `{from:0000-01-01,to:1969-12-31}` both return the single month "1970-01". That month is after the period's own end. This is asserted by DW5 as designed.
- `{to:1970-01-15}` returns 1969-08 … 1970-01. These months are before `EARLIEST_DAY`, so the clamp is applied to `from` but not to the default start. They show zero counts, so this is harmless.

**n5 (Minor, carried from review M4): still no plan check.**
- The CS-R1 row says "each query uses an index (plan checked)". Neither the test nor the diff checks a plan.
- My EXPLAIN of the corporate `not in` read on firm B shows:
  - a hashed subplan;
  - sequential scans of `runtime_case`, `combination` and `program_def`. This is the planner's choice at this size; `runtime_case_firm_id_created_at_idx` exists.
- The read runs in 8 ms. Where the check goes is a records point for the reviewer.

## What held

- **Rights, re-run:** no report key 403; financial key only WITHHELD; Officer (own) gets c1 and c3 only, `scope:"all"` in the body is ignored, naming the Owner is 403, its own id in UPPER case counts the same, CORPORATE 0 and INDIVIDUAL 1; Owner with case view.own only 0, also with CORPORATE; a case id or another firm's staff as `staffId` 0; Solo naming firm A's Owner 0. Refused with 422: lowercase `corporate`, a quote or `--` in clientType, `2026-02-30`, from > to, `firmId` as a filter, `user-O` as staffId.
- **Firm time zone:**
  - Every zone the setting accepts (428 of the `Intl` list) is known to Postgres 18.3.
  - Firm B set to Pacific/Kiritimati leaves firm A's months unchanged (TZ2). Firm A changed to Kiritimati takes effect on the next read (c6 moves to November; 31 Oct becomes empty).
  - The default trend's "today" is the firm's date: Kiritimati at 2026-11-30T10:30Z ends in 2026-12; Toronto at 2026-12-01T03:00Z ends in 2026-11.
  - A stored zone that no longer fits the schema ("EST", written directly) fails closed: all four UNAVAILABLE, no wrong number.
- **The one-query client type matches `groupOfCombination`** on every tree tried (C2): corporate three levels down; nearest INDIVIDUAL PATHWAY under a CORPORATE one; a PATHWAY with no client type under a CORPORATE one; two-node cycles with and without a CORPORATE PATHWAY; a self-loop; a missing parent; a parent key only in another workspace (individual); CORPORATE at depth 31 (found) and 41 (past 32, individual in both). (workspace, node key) is unique, so no fan-out.
- **`not in` with nulls:** `runtime_case.combination_id` is NOT NULL and the subquery returns only `combination.id`. Corporate plus individual equals all, for case load and each trend month, in firm A (4+10=14) and firm B (1000+2001=3001). Firm B's CORPORATE total equals `groupOfCombination` per case (998); the combination list stays bounded to the caller's firm.
- **`capped()`:** 0 rows stay empty; 200 stay 200 with no rest row; 201 become 199 plus "2 more stages"; "Slowest" is worked out before the cut; when every stage ties nothing is marked (D10).
- **trendMonths:** 1970 to 9999 gives 24 months (9998-01 … 9999-12) in 8 ms; `{from:9999-12-31}` gives one month and reads without error; 29 Feb 2028 to 1 Mar works; a future from with no to gives one month; the default across a year end (today 2026-01-31) runs 2025-08 … 2026-01.

Verdict: Approve bfd4ae9ccdb8b267762fa32534de2fa36c36ee1b
