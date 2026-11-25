# R1.109 Complaints record: independent reader's verdict

Date: 19 Nov 2026. Reader: independent qa reader (Opus 5.5). I ran nothing; I read only the files in this folder.

## Verdict: PARTIAL

The CI and walk evidence is strong: the merge batch is green on main's exact tree, both walks on main passed 26 of 26, and the only bug logged in BUGS.md is a Minor. The row still cannot count as Works, for one reason that blocks and two weaker ones:

1. **A Major authorisation finding on the row's own parts has no recorded close (blocks).** The J-109 breaker (`j109-break-report.md`, M1, Major) found the following. When a Read-only person is chosen as a complaint's handler, that person can see the complaint, acknowledge it and close it with an outcome. The handler list offers every active staff member, Read-only people included (`complaints.ts:188-192`, `:323-326`). The J-109 reviewer (`j109-review.md`, R2) agreed the finding is real but ruled it outside J-109. It belongs to PF-21v/PF-21w, which are parts of this row. The reviewer asked for a tracked row in BUGS or PF-21v/w. Re-reviews R3 to R6 say `complaints.ts` changed only by PF-21i's additions, so the handler logic was not fixed on that branch. Nothing in this pack shows the finding was fixed on main, logged in BUGS.md, or downgraded. `ci/summary.md` says BUGS.md has "no open Major/Critical for R1.109", but that may only mean the finding was never logged. The walk does not test it: W1 checks only that a Case Manager is offered as their own handler, and W3 tests a Read-only person who is not the handler. Until this finding is closed by a fix, or logged with a decided severity, it counts as an open Major on the capability.
2. "Never deleted" has no proof on main that I can see (details below).
3. The J-109 "Done when" asks for a walk "in a visible browser". Every walk in the pack ran headless.

## Each "Done when" clause and its evidence

Row "Done when": *"A complaint recorded with who, about what, dates and outcome; never deleted; the list filters by state."*

| Clause | Evidence | Status |
|---|---|---|
| Recorded with **who** | `walk-steps-pack.txt` W1 pass: complainant name shown, handler and recorder checked in the `plat_complaint` row (`j_109.ts:108`). Pack run 44543315644, job 135627929501; re-run 44543321849, job 135627584968; both 26/0 on main 3c9731cd7. | Proven |
| **About what** (category, summary) | The walk sends a category, channel and summary but checks only the name and the handler in the row (`j_109.ts:108`). Support: reviewer's data check "rows… exactly as entered" (`j109-journey-test-reviewer-2026-11-18.md`, at 648daeea9, a branch head, not main). `check_pf21_complaints.ts` 107/0 (job 135591815243) probably covers it, but the suite's contents are not in the pack. | Partly proven on main |
| **Dates** | W1 checks the exact received time. W2 pass and fail: acknowledge-by Tue 17 Nov 17:00, skipping the closed Fri 13 Nov, and not Mon 16 Nov. W2 also checks "Needs you" with the business days late. DW2 shows the system clock is used. Same two runs. | Proven |
| **Outcome** | W4: closing with no outcome is refused in the panel and the row stays OPEN. Closing with Resolved shows Closed in the page and in the database, with only Add a note left. Same two runs. | Proven |
| **Never deleted** | Not checked by the walk. The breaker saw "DELETE gives 405" on the closed complaint, but at 648daeea9 (branch head, not main). PF-21's backlog text says `plat_complaint_event` is insert-only. `check_pf21_complaints.ts` 107/0 on the batch tree may test it, but its contents are not shown. | Not proven on main from this pack |
| **List filters by state** | W3 fail line: the Owner sees it under Overdue. W5: it leaves Open and appears under Closed with its Closed status. The handler sees it closed too. Same two runs. | Proven |

J-109's own "Done when" (`backlog-parts.md`):
* Each swap is shown real by a test that fails on the fake. DW1 (pg-boss row, run, cancel) and DW2 (system clock) pass on main. The reviewer explains, by reading the code, why they would fail on fakes (`j109-review.md` R1 and R2). Accepted.
* The walk passes as a scripted check: yes, twice on main, 26/0.
* The walk passes **in a visible browser**: not shown. The CI walks and the reviewer's runs were all headless ("no display here").
* The walk ends at the next capability's first step: the brief says no next capability follows, and the walk ends at the Closed list. The reviewer accepted this (D19).

## Parts merged

| Part | Merged? | Checks in merge batch run 44532604794 (batch tree d2c27b778 = main 23e242d37's tree) |
|---|---|---|
| PF-21 part 1 (schema, service, events) | #1753 (row history) | `check_pf21_complaints.ts` 107/0, job 135591815243 (shard 1) |
| PF-21w (routes) | PR number not in the pack; the suite runs on main's tree | `check_pf21w_routes.ts` 83/0, job 135591815002 (shard 8) |
| PF-21v (view fields) | PR number not in the pack; the suite runs on main's tree | `check_pf21v_views.ts` 54/0, job 135591815035 (shard 7) |
| PF-21b (port) | PR number not in the pack; the suite runs on main's tree | `check_pf21b_port.ts` 32/0, job 135591815034 (shard 4) |
| PF-21s (screens) | Parts 3 (#1998) and 4 (#2134) named in the row; parts 1 and 2 not named | `check_pf21s_complaints_browser.ts` 116/116, job 135591814903 (shard 6) |
| PF-21i (idempotent record) | The row history says #2012 was open. The pack does not show #2012 merging. Re-review R3 says the J-109 branch carried PF-21i's changes. The code is on main's tree either way. | `check_pf21i_idempotent.ts` 30/0, job 135591814983 (shard 5); W1 checks the Idempotency-Key on main |
| J-109 (join and walk) | #2262, merged 14:20:31Z as b8fa9b962 in batch #2288 | Walks below |

Run 44532604794 succeeded across all jobs: 8 shards, types, fast, regression plan and 5 regression jobs (`ci/jobs.txt`).

Walks on main 3c9731cd7 (`ci/summary.md`): pack run 44543315644 / job 135627929501 passed 26/0, and the independent re-run 44543321849 / job 135627584968 passed 26/0. An earlier walk on the PR head 88ee4ed5a passed 26/0 (`prehead-walk-j109.log`).

`backlog-parts.md` contradicts this: its status lines still say "PF-21s not built" and "PF-21v not built", although both suites run green on main's tree. The records are out of date.

## Bugs

* **QA-506** (Minor, open): no My account menu entry reaches Complaints (`qa506.md`). `ci/summary.md` says `account-sections.ts` on main still has no Complaints entry. A Minor does not block on its own, but it does mean people cannot reach the page by normal navigation.
* **Breaker M1** (Major, status not shown): a Read-only person chosen as handler can acknowledge and close a complaint. This keeps the row PARTIAL (see above).
* Other breaker findings, all Minor and owned by existing parts or by J-109: m1 (the reminder queue drains slowly, about 0.5 jobs a second, shared across firms), m4 (browser Back drops a typed note with no prompt), m5 (after a lost answer, editing the form gets a 422, and the only way out risks a duplicate complaint). The reviewer also notes a Minor: close-panel errors stay on screen after they are fixed. None of these blocks.

## What is not proven

1. That breaker M1 was fixed, logged in BUGS.md, or given a decided severity.
2. "Never deleted" on main (there is no walk line for it, and the suite contents are not shown).
3. "About what" checked on main in the database (the walk checks only the name and the handler).
4. A walk in a visible browser, as J-109's "Done when" asks.
5. The step-by-step output of the independent re-run. Only its count, 26/0, is in `ci/summary.md`; the step list given is for the pack run.
6. That main 3c9731cd7, where the walks ran, differs from the batch tree only by PF-19r part 2 with no complaints files. This is stated, not shown.
7. The merge PRs for PF-21w, PF-21v, PF-21b, PF-21s parts 1 and 2, and PF-21i. Their code is shown on main's tree only through their suites running there.

## What would make it WORKS

Fix breaker M1: handlers limited to staff who hold the complaints key, and a handler with no key is refused. Prove the fix with a test that has a pass line and a fail line, or log it in BUGS.md with the founder's or the Lead's severity ruling. Add a walk or suite line on main for "never deleted" (DELETE refused, events insert-only). Then re-read the batch and both walks.
