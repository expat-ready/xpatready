# Merge-queue causes, 16 Nov (B194; P-502, P-610, P-619)

Why the merge queue loses time, measured from GitHub on 16 Nov ~00:30 IST (GET only; no estimate). Window: Mergify's
306 batch PRs (`mergify/merge-queue/*`, 7–15 Nov) and the 283 PRs they merged. Re-run the measurement with
`python3 -I product/tools/merge-queue-causes.py --failed 24`. The founder's board at 22:38 IST 15 Nov showed:
approved to merged median 61 min, p90 157; 22% of batches failed; 34% of CI minutes thrown away. These figures agree:
approved to merged median 59, p90 155 (n=280); batch ci runs 51 failed of 306 (17%), 5 cancelled; 33% of batch CI
machine minutes went to a run that merged nothing.

## Top three causes (the last 24 failed batches: 9,854 CI machine minutes)

| # | cause (root, with the batches it took down behind it) | batches | of them cascades | CI min | share |
|---|---|---|---|---|---|
| 1 | **Two PRs that add migrations:** an area's schema check (`check_fo1a_sales_schema.ts`, `check_fo7a_money_schema.ts`: "every function the migration adds is this area's") broke when another area's migration came first: #1755 and #1761 after FO-1a (#1742) merged; #1818's CS-C1a functions against FO-7a's check. | 6 | 3 | 2,443 | 25% |
| 2 | **Flaky:** the same code later merged with the suite green (members merged unchanged): `check_b151_unpriced_browser.ts` (2), `check_c95_release_update_browser.ts` (1), `check_bk5_start_browser.cjs` (1), part 8 outside a suite (1). | 5 | 0 | 2,093 | 21% |
| 3 | **Forms release questions:** BK-13's `check_bk13_zero_code_run.ts` broke on BK-22 (#1698), in the same batch as BK-13 (#1695), then on BK-23 on main. The two PRs share no file. | 5 | 1 | 2,088 | 21% |
| 4–6 | BK-18's Works packs (#1691, 3 batches, 1,274 min); QA-439 against main's c95 (#1643, 3, 1,216); BK-17 against main's filings (#1612, 2, 740). | 8 | 4 | 3,230 | 33% |

Every one of the 11 real breaks was a member's own check meeting newer code for the first time in the queue. In each
case the fix commit names the batch (for example #1818's 9ef44dea5, "FO-7a's function-name check leaves out functions
of later migrations (merge batch #1837 shard 1)", and #1695's a87d2cdee, "merge-queue batch #1705 with BK-22"). No failure was a
selection miss: `select-suites.mjs --direct` does choose `check_fo7a_money_schema.ts` for #1818's files. A cascade is
a batch checked on top of a failing batch ahead (`max_parallel_checks: 3`). It failed because it carried the broken
commits. 8 of the 24 are cascades, 3,199 min.

## Per batch

| batch | members | ahead | failing job | suite(s) failed twice | cause | evidence | files shared by members and the PRs ahead | CI min |
|---|---|---|---|---|---|---|---|---|
| #1839 | #1808 #1810 | #1834 #1818 #1823 #1816 | shard (1) | `check_fo7a_money_schema.ts` (not retried: demo database) | cascade | stacked on #1837 | 3: service.ts, events.ts, check_forms_qa53.ts | 418 |
| #1838 | #1823 #1816 | #1824 #1834 #1818 | shard (1) | same | cascade | stacked on #1837 | 2: events.ts, check_forms_qa53.ts | 392 |
| #1837 | #1834 #1818 | #1824 | shard (1) | `check_fo7a_money_schema.ts` | broke | #1818 fixed it, 9ef44dea5 | 1: check_forms_qa53.ts | 409 |
| #1767 | #1761 #1752 | - | shard (7) | `check_fo1a_sales_schema.ts` (not retried) | broke | #1761 re-stamped its migration, 2b087d7ad (P-600) | 1: platform.prisma | 409 |
| #1766 | #1761 | #1751 #1755 | shard (1) | `check_fo1a_sales_schema.ts` | cascade | stacked on #1765 | 1: platform.prisma | 406 |
| #1765 | #1755 | #1751 | shard (1) | `check_fo1a_sales_schema.ts` (not retried) | broke | #1755 re-stamped, c841df3f4 | - | 410 |
| #1735 | #1733 | #1728 | shard (1) | `check_c95_release_update_browser.ts` | flaky | merged unchanged, suite green in its merge batch | - | 404 |
| #1724 | #1692 | #1691 #1722 | regression | Works packs | cascade | stacked on #1720 | 60 (records) | 412 |
| #1723 | #1691 | - | regression | Works packs | broke | #1691 fixed, 471f34fc2 | - | 439 |
| #1722 | #1691 #1692 #1713 | - | regression | Works packs | broke | #1691 fixed, 0a67b2fde | - | 423 |
| #1721 | #1695 | #1711 #1709 #1706 #1720 | shard (2) | `check_bk13_zero_code_run.ts` | broke | #1695 fixed, 6a64089c5 (BK-23 on main) | 48 (records) | 421 |
| #1720 | #1695 #1691 | #1711 #1709 #1706 | regression, shard (2) | `check_bk13_zero_code_run.ts`, Works packs | broke | #1695, #1691 fixed | - | 407 |
| #1715 | #1706 | #1698 #1702 | shard (3) | `check_bk5_start_browser.cjs` | flaky | merged unchanged; stacked on #1705, whose failure was another suite | 1: form-values.ts | 455 |
| #1707 | #1702 | #1695 #1698 | shard (3) | `check_bk13_zero_code_run.ts` | cascade | stacked on #1704 | 1: form-values.ts | 421 |
| #1705 | #1695 #1698 | - | shard (3) | `check_bk13_zero_code_run.ts` | broke | #1695 fixed, a87d2cdee (with BK-22) | - | 441 |
| #1704 | #1698 | #1692 #1695 | shard (7) | `check_bk13_zero_code_run.ts` | broke | #1695 fixed | - | 397 |
| #1701 | #1692 | #1694 | shard (2) | `check_b151_unpriced_browser.ts` | flaky | merged unchanged | - | 431 |
| #1697 | #1692 | #1693 | shard (2) | `check_b151_unpriced_browser.ts` | flaky | merged unchanged | - | 428 |
| #1664 | #1652 | #1643 #1659 | shard (7), (8) | `check_qa439_question_order_api.ts`, `check_c95_release_update_browser.ts` | cascade | stacked on #1662 | - | 404 |
| #1663 | #1659 | #1643 | shard (6) | `check_qa439_question_order_api.ts` | cascade | stacked on #1662 | - | 405 |
| #1662 | #1643 | - | shard (6) | `check_qa439_question_order_api.ts` | broke | #1643 fixed, d474bd9a9 ("c95 fails only on the merge with main") | - | 407 |
| #1634 | #1628 | - | shard (8) | - (job failed outside a suite) | flaky | merged unchanged | - | 376 |
| #1630 | #1627 | #1566 #1612 | shard (7) | `check_bk17_recorded_filing_api.ts` | cascade | stacked on #1629 | - | 343 |
| #1629 | #1612 | #1552 #1566 | shard (7) | `check_bk17_recorded_filing_api.ts` | broke | #1612 fixed, af157ce4d (main's filings) | - | 397 |

## Where all the batch minutes went (306 runs, 89,126 machine min)

| what became of the run | runs | CI min | share |
|---|---|---|---|
| merged | 217 | 59,914 | 67% |
| succeeded, then thrown away: something ahead left the queue (23 of them "checks failed" ahead) | 32 | 10,090 | 11% |
| failed: a member broke it | 23 | 8,179 | 9% |
| failed: cascade | 17 | 5,922 | 7% |
| failed: flaky suite or job | 11 | 3,505 | 4% |
| cancelled (reset) | 5 | 1,516 | 2% |

Approved to merged, 24,537 PR-minutes: 39% (9,553) between a PR's first and last entry into the queue (it was
dequeued, fixed, reviewed again and labelled again), 22% (5,478) labelled before its ci was green, the rest in the
queue. A batch run takes 46 min (median; p90 57), so 54 min queued to merged (median) is one batch and the wait for it.

## What was ruled out, with the measurement

* **Fewer parallel checks.** A replay of the 342 real queue entries through a model of the queue reproduces today
  (queued to merged 51/96 min against the measured 54/98; 20% failed against 17–22%). With `max_parallel_checks: 1`,
  approved to merged becomes 97/204 min (from 58/148), and waste goes only from 27% to 24%. Rejected. Batch size 2–6
  and 4–5 parallel checks change nothing that matters (57–64 median).
* **"The PR's check was old".** On their own, check age and the number of merges since the check do not predict a failure. About
  20% of entries failed at every age (0 merges behind: 19%; 3: 22%; 5+: 7%).
* **PRs sharing files in one batch.** Members and the PRs ahead of them shared a file in 27% of failing entries and
  16% of passing ones. Cause 3 shares no file. Cause 1 conflicts with main, not with a batch peer. A Mergify file rule
  sees neither.

## The fix (cause 1, the narrowest that works) and what it should move

**What predicts a failure.** Main merged a PR after this PR's green ci started, and that PR touched one of the same
app files, or both PRs add migrations. 8% of queue entries (26 of 342) were like that. 35% of them failed (9),
against 17% of the rest. When both PRs add migrations, 6 of 10 failed (60%).

**The fix.** `product/tools/queue-gate.sh fresh` (run by `.github/workflows/queue-gate.yml`) sets the status
`queue-fresh`. The product queue needs that status for app code (`.mergify.yml`). An unlabelled PR is `pending`: the verdict is made when the label goes on, before it goes on. For a labelled PR in that state,
the gate re-runs its ci run on today's main (a re-run, never a cancel, P-371). The break then shows in a PR check
(about 25 min, the PR's own suites) instead of a batch (46 min, 8 parts, plus up to 2 batches stacked behind it). In
the last 24 it would have held #1755 and #1761 (batches #1765, #1766, #1767: 1,224 min). It costs about 26 extra
PR re-runs a week. It does not catch cause 3 (no shared file) or cause 2.

**Step 3, the label.** The same workflow puts `review: approved` on by itself. That needs a comment "Reviewer: Approve
<head SHA>" from the owner's account or a login in the repository variable `REVIEWERS`, green ci on that head, and
no path in `product/tools/lead-read-paths.txt` (`.github/`, `.mergify.yml`, the schema and migrations, money, and the guards themselves: `product/tools/`, `.githooks/`, `.claude/`; P-423). A later "Reviewer: Changes needed" on the same head wins over the Approve. This targets
the 39% of approved-to-merged time spent between queue entries, the part where a fixed PR waits for its lane to label it again.

**Measure on 23 Nov** (same tool): failed batches with a migration member (6 of 24 now). Count of `queue-fresh`
re-runs. Approved to merged median and p90. Gap between dequeue and the next queue entry.

**Next, not in this change.** Cause 2: `check_b151_unpriced_browser.ts` failed twice in two batches whose members
merged unchanged. B122's rule counts only "passed on retry", so it never quarantines a suite like that. Counting such
a batch as a flake is the next narrow fix. Cause 3 is the queue doing its job: the two PRs really conflicted.
