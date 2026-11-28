# R1.79 part 2 (PF-R2fo): review

PR #3734 · head `eae03bb409534baa1b1d281ac400914b4de3d518` · diff `origin/main...eae03bb40` (4 files, +335). I did not build it.
**Verdict: Rework → Block** (6 Major open). Journey score **7.5/10**: 6 of the 8 criteria that apply, no 0, **below the pass mark** (`journey-test-reviewer-2026-11-25.md`).
While I was reviewing, the builder pushed `3625d9bbd`. It changes only `MODULE.rows/PF-R2fo.md` and `check_pfr1_reports.ts`. `metrics.ts` and its test are unchanged, so every finding below still holds there.

## What I ran
* **The PR's test**, run from `prototype/` (Postgres 127.0.0.1:54329): **30 passed, 0 failed, exit 0**, 12 s.
* **Mutations and probes:** run on a copy of `studio/` in the scratchpad. The repo files were not edited, no test database is left behind, and the worktree is clean.
* **Repo checks:** `graph.mjs --check` exit 0; `typecheck.mjs` no new errors (15 known); `count-any` 416 and the diff adds no `any`; `module-cards.py pr` PASS; `run-suites --changed --list` selects `check_pfr2fo_metrics.ts`, `check_pfr1_reports.ts` and `check_csr1_reports.ts`.
* **Dimensions:** there is no screen, so D1-D20's browser dimensions and BIC-01 to BIC-20 are N/A (they go to PF-R3). D17 and D20 were not walked by an intended user.

## What holds
* **Registration:** all seven metrics are on the one door, through the feature file. No second route and no rollup table. Nothing is written (AG-14-1), the import boundary holds, and another module cannot take `reports.sales.*`.
* **Definitions on the fixtures:** leads added 4, by source 3/1, engage rate 75 %, win rate 50 % (the duplicate left out), and an empty cohort gives none. Nurture is one parked count, and the per-person table is in name order with "(Inactive)" rows.
* **Rights:** report `own` scope gives own only, and unassigned is WITHHELD there. The lead rule bounds report view.all, and "everyone sees all" off narrows even the Owner. The 403 OWN_ONLY holds, and a scope sent in the body is ignored. A viewer who does not see all and names someone else gets 0 and `[]` (probe): right, but untested (M4).
* **Firm walls:** without the explicit `t.firm_id` or `st.firm_id` predicate, the test still gives 30/30. That is because PF-12's row policies cover `fo_*` and `platform_staff` (`pf12_firm_walls/migration.sql:198-207`). The wall holds, and the predicate is a second guard.
* **SQL:** every value is a bound parameter. The combine and duplicate reason keys exist (`firm-seed.ts:46,57`).

## Issues (ranked)
**M1, Major, Must: days are cut in UTC, not in the firm's time zone (AG-14 BR-6, §6; rule 16).**
* `metrics.ts:29-31` builds `${d}T00:00:00.000Z`. The lead and prospect lists cut days in the firm's zone (`prospects.ts:47-55`, `dayRange`), and the Sample default zone is America/Toronto.
* Probe, November, Toronto firm: base 4. A lead at 31 Oct 22:00 local is counted (5). A lead at 30 Nov 22:00 local is not (still 5). So the figure and the list disagree on every month edge.
* **Fix:** use `dayRange`, or part 1's `frameOf` pattern (`readSetting` with TIME_ZONE). Add a fixture at each edge and one line in a second zone.

**M2, Major, Must: the drill goes to a different list than the figure (AG-14-22; PF-R1 break M4; part 1 M1 again).**
* `:27,53`: with no filter, leads added links to `GET /api/front-office/leads` with `{}`. That list's default view is `state = OPEN` with `take: 500` (`leads.ts:44,54-60`).
* The figure counts engaged and closed leads too (probe: 8 counted, 5 of firm A's leads not OPEN).
* **Fix:** set `drillTarget: null` until a list can carry this exact set, and add a test that the answer has no drill.

**M3, Major, Must: the lead rule is worked out again, and wrongly for a deactivated owner (rules 1, 12, 16; BR-4).**
* The list treats an open lead whose owner is not ACTIVE as Unassigned (`source-filter.ts:22-24`, `leads.ts:29,56-58`). `ownerScope` (`:41`) and unassigned waiting (`:74`) only accept `owner_staff_id is null`.
* Probe: with an open November lead owned by the deactivated person added, unassigned waiting stays 1 and an assign-holder without view.all still counts 4 leads added. The Unassigned list shows that lead.
* Prospects work the other way round. `ownerScope` lets an assign-holder count unassigned prospects, but the prospect list shows a prospect only to its owner or to someone who sees all (`prospects.ts:137-140,213`).
* The file header (`:4-5`) promises "never re-derived".
* **Fix:** for leads, reuse `leadsSeenWhere`'s rule (inactive owners count as unassigned) in `ownerScope` and in unassigned waiting; for prospects, own or seesAll only. Test each with a pass and a fail.

**M4, Major, Must: 15 of 32 single-rule mutations leave the test green (STANDARDS §7 [M]; WAY-OF-WORKING "Every PR").** Each of these gave 30/30:
* **Rule 18:** `ADDED_TO_PROSPECT` dropped; `COMBINED_PROSPECT` dropped (it re-enters the win rate).
* **Date bounds:** the `to` day made exclusive; `>=` changed to `>`.
* **Rights:**
  * the person filter allowing anyone to name anyone;
  * per-person showing another's row to a viewer who does not see all;
  * the owner scope removed from stage counts and from the win rate.
* **Unassigned waiting:** `state = 'OPEN'` dropped; the person-filter short-circuit dropped; the pipeline dropped; oldest by `max`.
* **Per-person:** calls and won no longer bounded by the period; won's pipeline dropped.
* **Engage rate:** `ENGAGED` changed to `<> 'OPEN'`.
* **Smaller test faults:** DW5's fail line names stage counts but checks only the win rate (`test:168`); every fixture sits at 10:00 UTC, mid-period.
* **Fix:** add fixtures that each rule moves: an added-to-prospect lead, a combined prospect, a lead on the `to` day and one at 00:00, a non-seesAll viewer with a person filter, the Officer's stage counts and win rate, a closed unassigned lead, a call and a win outside the period, and a closed lead.

**M5, Major, Must: 200-row caps drop rows silently, and the words say the opposite (rule 4 "Nothing is dropped"; AG16-60; AG-14-31 "add up").**
* `leads_by_source` (`:64`) has `limit 200`, while its definition (`:62`) says "nothing is dropped". The source is free text (`ADD_LEAD source`).
  * Probe: 250 more sources give 200 rows summing 205 of 257 leads, and nothing says rows were cut.
* `per_person` (`:129`) has `limit 200` before the inactive filter (`:131`).
  * Probe: with 234 staff, 200 rows come back and the Owner's own row is missing.
* **Fix:** part 1's pattern: the first 199 rows, then one row "n more" with its total. Add a test for each.

**M6, Major, Must (fixed on `3625d9bbd`, not reviewed beyond its diff): a selected suite is red at the reviewed head.**
* `check_pfr1_reports.ts` at `eae03bb40` gives **71 passed, 1 failed**. The failing line is "DW7 fail: a module that registers a metric with no budget test is named". Its planted path is now a real file.
* On `3625d9bbd` the same suite gives 72/72 (scratch).
* The PR body's "checks running" never reported this.
* **Fix:** re-request review on the new head, and name the run and its exit code in the body.

**m1, Minor, Should: rule 5 and rule 3 are only partly built, and the PR does not say so (never deviate silently).**
* Rule 5 also counts WON and LOST prospects "by `wonAt` and `lostAt` in the range". Stage counts is "now" only (`:81`).
* Rule 3's "already a client at arrival" count is not built.
* **Fix (records only):** name both as deferred in the PR body, or in the MODULE row, which claims "rules 1-6".

**m2, Minor, Should: the per-person columns do not match rule 13 or the other figures.**
* "Engaged" counts leads by `fo_lead.engaged_by/engaged_at` (`:124`). Rule 13 counts prospects engaged by the user. A lead's second prospect keeps the first engage date (`prospects.ts:175`), so it is never credited, and the column does not add up to the win-rate cohort (AG-14-31).
* Leads owned and calls ignore the client type (`:122,126-127`), while the other columns follow it.

**m3, Minor, Should: the read budget is untested at a firm with many staff (§5 [M] "read paths indexed"; §9).**
* `per_person` runs 6 correlated subqueries per staff row, on `engaged_by` and `by_actor`, neither of which is indexed.
* Probe, one firm with about 5,000 leads and 5,000 calls: 54 staff 147-208 ms (2 of 5 runs over 200 ms); 234 staff 666-864 ms.
* DW6 puts its 5,000 leads in the one-person firm (`test:107-110,171`).
* **Fix:** aggregate with `group by` and join to staff (or add indexes), and put the budget data in the multi-staff firm.

**m4, Minor, Should: edge answers.**
* `from: "0000-01-01"` gives UNAVAILABLE. Part 1 clamps to 1970 (`case-reports.ts:37,41`).
* Unassigned waiting answers `{waiting: 0}` to a viewer whose Unassigned list is refused (`leads.ts:46`). It reads as "nobody waiting".
* The oldest lead's age is counted in 24-hour blocks, not in firm days (with M1).

**Noted, not raised:** rule 13's credited person is the current owner, so a later reassignment re-credits, which goes against BR-14. The PR raises this itself as Question 1, which is right; the tech lead should rule on it.

## Could not check
* Browser dimensions, BIC, D17 and D20: there is no screen (PF-R3).
* CI on either head: I did not read it. My local runs stand in for it.
* The HTTP layer at a builder port: I called the door through `ReportsController.query` inside `withFirm`, as the PR's test does.

To fix before Approve: M1, M2, M3, M4, M5, M6 (M6 already fixed on `3625d9bbd`; re-review that head).

Reviewer: Block eae03bb409534baa1b1d281ac400914b4de3d518

Verdict: Block eae03bb409534baa1b1d281ac400914b4de3d518
