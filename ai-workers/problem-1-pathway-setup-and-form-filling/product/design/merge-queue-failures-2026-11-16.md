# Merge-queue failures by cause, and where approved-to-merged time goes (B199 step 1, 16 Nov)

B199 (P-622, P-214, P-371, P-610). Measured from GitHub on 16 Nov, 04:00–05:30 UTC, with read-only GET calls and no
estimates. This page follows B194's `design/merge-queue-causes-2026-11-16.md`, which measured 24 failures and the fix
for the migration pair (the `queue-fresh` gate, #1861, merged 02:07 UTC 16 Nov).

This page does three things:
* classifies the last **30** failed batches into the row's four causes;
* answers the Lead's two questions (Lead 64, 07:3x IST): the parts of approved-to-merged time, and per-module queues;
* recommends what to build.

To reproduce, run from the repository root. The scripts are word for word in
`merge-queue-failures-2026-11-16-scripts.md`.
1. `python3 -I product/tools/merge-queue-causes.py --failed 30 --pages 6 --cache DIR` gives the table and writes
   `DIR/last-failed.json`.
2. The cause column comes from each root's fix commit (`pulls/<n>/commits`), quoted below.
3. `python3 -I product/tools/flow-measure.py --since 2026-11-15T03:30:00Z` gives the headline numbers.
4. `parts.py DIR 50` gives §2.
5. `replay.py DIR` gives the part times in §2 and the suite selection in §3.

## Headline

| number | baseline 15 Nov 22:38 IST (the row) | 15 Nov 03:30 to 16 Nov 04:40 UTC (25 h) | B199 target |
|---|---|---|---|
| batch failures | 24 of 111 (22%) | **3 of 54 (5.6%)**: one root (#1837, a migration pair) and its 2 cascades. None since 15 Nov 13:22 UTC | under 10% |
| approved to merged (from the last label), median / p90 | 61 / 157 min (n=221) | **61 / 132 min (n=78)** | median under 30 min |

The reviewer re-ran `flow-measure.py` about 10 minutes later. It gave 3 failed of 56 (5.4%) and a median of 62, p90
122 (n=82), with no new failure.

**What this means:**
* The failure target is met on these 25 h.
* The time target is not met. Even a PR whose first batch merges waits a median of 51 min for that batch's own ci
  run (see §2). That alone is longer than the target.
* Approved-to-merged's constraint is therefore the batch check's length. The pipeline's constraint is qa (P-623).
* Failures still cost time, but mostly before the last label, not after it. Counted from the first label, code PRs
  take a median of 121 min (see §2).

## 1. The last 30 failed batches, by cause (11 Nov 23:34 to 15 Nov 13:22 UTC)

The four causes:
* **clash:** a member's own ci was green, but in the queue it met another PR's code for the first time. That code was
  on main (merged after the member's ci started), ahead in the queue, or in the same batch. The fix commit names the
  other PR or main's code.
* **real break:** a member was broken on its own. The queue's extra check (the regression job's Works packs) found it.
* **flaky:** the members later merged unchanged, with the same suite green. A fix landing on main in between is not
  ruled out.
* **infrastructure:** a runner or service failed, and there is no test result.

A **cascade** is a batch checked on top of a failing batch ahead of it (`max_parallel_checks: 3`). It carries the same
broken commits, so it takes the cause of its root.

| batch | created (UTC) | members (ahead) | failed suite or job | cause | evidence: the fix commit, or the log | CI min |
|---|---|---|---|---|---|---|
| #1839 | 15 Nov 13:22 | #1808 #1810 (#1834 #1818 #1823 #1816) | check_fo7a_money_schema.ts | clash (cascade of #1837) | same failure, #1818 ahead | 418 |
| #1838 | 15 Nov 12:53 | #1823 #1816 (#1824 #1834 #1818) | check_fo7a_money_schema.ts | clash (cascade of #1837) | same failure, #1818 ahead | 392 |
| #1837 | 15 Nov 12:45 | #1834 #1818 (#1824) | check_fo7a_money_schema.ts | **clash** with FO-7a on main (migration pair) | #1818 9ef44dea5 "FO-7a's function-name check leaves out functions of later migrations (merge batch #1837 shard 1)" | 409 |
| #1767 | 14 Nov 16:03 | #1761 #1752 | check_fo1a_sales_schema.ts | **clash** with FO-1a and PF-L on main (migration pair) | #1761 2b087d7ad "FO-5 re-stamp step (P-600) after FO-1a and PF-L merged" | 409 |
| #1766 | 14 Nov 15:12 | #1761 (#1751 #1755) | check_fo1a_sales_schema.ts | clash (cascade of #1765) | same failure | 406 |
| #1765 | 14 Nov 15:00 | #1755 (#1751) | check_fo1a_sales_schema.ts | **clash** with FO-1a (#1742) on main and PF-L (#1751) ahead (migration pair) | #1755 c841df3f4 re-stamp "migration 20261114190000 → 20261114223000", after 136b87f96 merged FO-1a and PF-L in | 410 |
| #1735 | 14 Nov 05:21 | #1733 (#1728) | check_c95_release_update_browser.ts | **flaky** | TimeoutError on both tries; members merged unchanged | 404 |
| #1724 | 13 Nov 20:54 | #1692 (#1691) | regression (Works packs) | real break (cascade of #1723, the batch holding #1691) | same failure as #1723 | 412 |
| #1723 | 13 Nov 20:54 | #1691 | regression (Works packs) | **real break** | #1691 471f34fc2 "C8.3's re-approval: the reviewer's own typing since the round's base is judged form by form" | 439 |
| #1722 | 13 Nov 20:00 | #1691 #1692 #1713 | regression (Works packs) | **real break** | the same #1691 fix | 423 |
| #1721 | 13 Nov 19:56 | #1695 (#1711 #1709 #1706) | check_bk13_zero_code_run.ts | **clash** with BK-23 on main (note 1) | #1695 6a64089c5 "the spouse's current country of residence in the Sample answers (BK-23 now asks it)" | 421 |
| #1720 | 13 Nov 19:04 | #1695 #1691 (#1711 #1709 #1706) | check_bk13_zero_code_run.ts and regression | **clash** (#1695 with BK-23), and the #1691 real break | both fixes above | 407 |
| #1715 | 13 Nov 17:19 | #1706 (#1698 #1702) | check_bk5_start_browser.cjs | **flaky** | "BR-6 pass: Try again (double clicked)" on both tries; members merged unchanged | 455 |
| #1707 | 13 Nov 16:39 | #1702 (#1695 #1698) | check_bk13_zero_code_run.ts | clash (cascade of #1705, open until 16:49) | same failure | 421 |
| #1705 | 13 Nov 15:54 | #1695 #1698 | check_bk13_zero_code_run.ts | **clash** with BK-22 in the same batch | #1695 a87d2cdee "merge-queue batch #1705 with BK-22 (#1698)" | 441 |
| #1704 | 13 Nov 15:51 | #1698 (#1692 #1695) | check_bk13_zero_code_run.ts | **clash**: BK-22 (#1698) against #1695 ahead | the same #1695 fix | 397 |
| #1701 | 13 Nov 15:00 | #1692 (#1694) | check_b151_unpriced_browser.ts | **flaky** (weak: see note 2) | `name: 'Error'` on both tries; #1692 merged unchanged | 431 |
| #1697 | 13 Nov 13:35 | #1692 (#1693) | check_b151_unpriced_browser.ts | **flaky** (weak: see note 2) | as #1701 | 428 |
| #1664 | 12 Nov 18:29 | #1652 (#1643 #1659) | check_qa439_question_order_api.ts, check_c95_release_update_browser.ts | clash (cascade of #1662) | same failure | 404 |
| #1663 | 12 Nov 18:04 | #1659 (#1643) | check_qa439_question_order_api.ts | clash (cascade of #1662) | same failure | 405 |
| #1662 | 12 Nov 17:50 | #1643 | check_qa439_question_order_api.ts | **clash** with main | #1643 d474bd9a9 "CI's c95 fails only on the merge with main 052e9fcc6"; fix 8bbe5fa9f | 407 |
| #1634 | 12 Nov 07:47 | #1628 | shard (8), no suite result | **infrastructure** | annotation on job 131047164751: "The hosted runner lost communication with the server." | 376 |
| #1630 | 12 Nov 06:51 | #1627 (#1566 #1612) | check_bk17_recorded_filing_api.ts | clash (cascade of #1629) | same failure | 343 |
| #1629 | 12 Nov 06:44 | #1612 (#1552 #1566) | check_bk17_recorded_filing_api.ts | **clash** with BK-15 and BK-16 on main | #1612 af157ce4d "test set-up follows main's filings (BK-15, BK-16: everyone files their own)" | 397 |
| #1619 | 12 Nov 04:40 | #1617 (#1591) | check_bk9_shared_filing_api.ts | clash (cascade of #1618) | same failure | 356 |
| #1618 | 12 Nov 04:19 | #1591 (#1580) | check_bk9_shared_filing_api.ts | **clash** with BK-9 on main | #1591 6be6e17d7 "BK-15 × BK-9: the shared-filing check finds a child on the principal's application by data" | 359 |
| #1610 | 12 Nov 02:32 | #1569 (#1580) | check_bk4a.ts | clash (cascade of #1608) | same failure | 355 |
| #1608 | 12 Nov 01:53 | #1580 | check_bk4a.ts | **clash** with BK-4b (#1582) on main, merged 01:27 | #1580 3b847fabb "check_bk4a BR-1 lists BK-4b's reviewed hand-offs" | 325 |
| #1607 | 12 Nov 01:52 | #1580 #1569 | check_bk4a.ts | **clash** with BK-4b on main (#1569 is qa records) | the same #1580 fix | 318 |
| #1604 | 11 Nov 23:34 | #1582 (#1575 #1557 #1549 #1600) | check_bk4b_handoffs.ts | **clash** with BK-5's start page (#1581) on main | #1582 45bf8271f "BR-1's page check allows the sign-in places: BK-5's start page (P-484) and BK-4a's sign-in page (#1580)" | 318 |

Notes on the table:
1. Some roots carried the same unfixed commit: #1720 and #1721 (#1695, Mergify's re-check of #1695 after #1720 closed),
   #1704 and #1705 (#1695), and #1607 and #1608 (#1580). The real-break pair #1722 and #1723 share #1691's commit. Each
   is counted as a root because it was checked before the fix, so the 13 clash roots have about 10 distinct causes.
   Cascade links follow the batch open ahead at creation (a correction to `merge-queue-causes.py`'s matching for
   #1707, #1610 and #1724; no total changes).
2. Both b151 failures were on one PR (#1692). #1706, which merged at 19:50 13 Nov, fixed a race in that browser check
   before #1692 merged at 22:41. So these two may be a fix landing on main in between, not a flake.

### Totals

Each cascade is counted under its root's cause. #1720 is counted once, as a clash.

| cause | roots | batches, with cascades | of 30 | CI machine min |
|---|---|---|---|---|
| clash | 13 | 22 | **73%** | 8,518 |
| flaky | 4 | 4 | 13% | 1,717 |
| real break | 2 | 3 | 10% | 1,274 |
| infrastructure | 1 | 1 | 3% | 376 |
| **all** | 20 | 30 | 100% | 11,885 |

**Clashes.** Of the 13 clash roots:
* in 10, the other PR was already on main: #1837, #1767, #1721, #1720, #1662, #1629, #1618, #1608, #1607 and #1604;
* in 2, a PR ahead in the queue was involved: #1765 (PF-L ahead) and #1704 (#1695 ahead);
* in 1, both PRs were in the same batch: #1705.

Keeping PRs that touch the same suites out of one batch would therefore have prevented at most 1 root and its cascade.

B194's `queue-fresh` gate addresses clashes with code that had just merged. It re-runs ci on today's main when main
has merged a PR touching the same app files, or a second migration. By its own measure it covers the 3 migration
pairs (#1837, #1765, #1767). The other 10 roots shared no app file with the PR that broke them: a suite of one PR read
behaviour that another PR changed.

**Flaky.** There were 4 batches, from 3 suites. Each failed twice in one run, so B122's automatic quarantine did not
count them: it counts only a pass on retry. `check-flaky.sh:195` states "failed twice is a real failure, never a
reason to quarantine". The evidence for each suite:
* **`check_bk5_start_browser.cjs`** has independent repeated evidence. It failed in batch #1715 (13 Nov), and again
  in the scheduled nightly on main, which never retries: run 43777966873, attempt 1, 00:01–00:58 UTC 16 Nov, job
  133008504101. Both times it failed "BR-6 pass: Try again (double clicked)". That nightly attempt failed. Only
  attempt 2, the re-run, passed. No code change caused it: main's own code failed in a run that changed nothing. The race may be in the app,
  not only in the check, so its fix row decides which before it leaves the quarantine.
* **`check_c95_release_update_browser.ts`** failed twice in a run with TimeoutError 5 times, in the batch runs of
  8 Nov (2), 11 Nov, 12 Nov and 14 Nov. The 12 Nov one is the #1643 clash, so 4 are independent. The nightly
  attempt above passed it.
* **`check_b151_unpriced_browser.ts`** failed on one PR only (note 2). This is weak evidence.

**Infrastructure.** 1 batch in 30: a lost runner. Retrying a failed part once would have saved one batch of 376 min
in four days.

## 2. Where approved-to-merged time goes (the Lead's question 1: the last 50 merges)

Two clocks are used:
* **from the last label:** from the last `review: approved` label to the merge. This is flow-measure's and the
  board's metric.
* **from the first label:** from the first `review: approved` label to the merge. This includes every round of
  dequeue, fix, re-review and re-label after a failed batch or a new push.

The parts of the last-label clock:
* **waiting for a batch:** from the last label to the first batch PR that holds the PR. This covers Mergify's
  conditions (ci, queue-fresh), `batch_max_wait_time` (5 min) and the slots ahead.
* **re-runs:** from that first batch to the batch that merged the PR.
* **final batch:** from that batch's creation to the merge. Its ci run is inside this part.

The 50 merges run back from 16 Nov 04:34 UTC. All figures are minutes, median (p90).

| PRs | n | labelled more than once | from the first label | before the last label | from the last label | waiting for a batch | re-runs | final batch | of it, its ci run |
|---|---|---|---|---|---|---|---|---|---|
| all | 50 | 20 | 62 (281) | 0 (174) | 60 (132) | 10 (55) | 0 (0) | 52 (58) | 51 (58) |
| code | 28 | 15 | **121 (374)** | 5 (251) | 67 (154) | 11 (58) | 0 (0) | 53 (58) | 53 (58) |
| records | 22 | 5 | 37 (63) | 0 (3) | 37 (63) | 10 (17) | 0 (0) | 26 (54) | 6 (53) |

Totals over the 50 PRs, from the first label:

| part | min | share |
|---|---|---|
| before the last label (failed batches, new pushes, re-labels) | 2,733 | 45% |
| final batch | 2,098 | 34% |
| waiting for a batch | 1,023 | 17% |
| re-runs inside the last label | 254 | 4% |
| **all** | 6,108 | 100% |

**What dominates.** Two parts:
1. **The rounds before the last label: 45% of all minutes.** 20 of the 50 PRs were labelled more than once (15 of
   the 28 code PRs). For example, #1818 (the #1837 clash root) shows re-runs 0 on the last-label clock, though 376 min
   passed between its first and last approval. On the last-label clock this cost is invisible. Batch failures, new
   pushes and re-reviews drive it.
2. **The final batch's ci run: a floor of about 51–53 min.** No PR can merge faster than that, even with zero
   failures and zero waiting.

On the 40 newest merged batches, the run's wall time has a median of 52.8 min (`replay.py`). Almost all of it is the
longest of the 8 parallel parts, the shards: median 48.7 min, maximum 54.1. The other parts are small:
* waiting for a runner after the first job: median 0.1 min, maximum 18.4;
* the first job (`kind`): about 3 min;
* set-up: about 2 min per part.

`suite-times.tsv` holds 498 suites totalling 339 machine minutes. That includes the quarantined
`check_b78_section_names.ts` (20.5 min), so batches run about 317. 8 parts give about 42 min each on average, on the
same base as the ratio below. The parts
are uneven: the longest is 1.16 times the mean. The longest single suite, `check_b78_section_names.ts` at 1,230 s,
is quarantined and runs only nightly.

**What the target needs.** Take a 10 min median wait plus about 5 min of start-up. A last-label median under 30 min
then needs a longest part under about 15 min. That is 339 / 15 × 1.16, so **about 26 parts**, or fewer parts and a
shorter wait. 16 parts give about 25 + 5 = 30 min of ci, so about 40 min last-label. That is better than today's 61,
but not under 30.

## 3. Separate queues per module (the Lead's question 2)

**Mergify's options.** I could not read Mergify's documentation or pricing from this session. `docs.mergify.com` and
`mergify.com` are refused by the session's network: "CONNECT tunnel failed, response 403" with curl, and "getaddrinfo
ENOTFOUND" with the fetch tool. So three facts are **unconfirmed**:
* whether partitions are on our plan;
* how a PR that matches two partitions is checked;
* the price.

The Lead can add the two hosts to the environment, or read the pages on the Mac. Nothing below depends on them.

**How our suite selection would scope a module's batch.** `replay.py` fed the union of each failed batch's members'
and ahead PRs' files (the batch's change against main) to `select-suites.mjs`, with today's graph of 513
`tests/check_*` files:
* 9 of 30 batches chose **ALL**, because they touched `api/src/core.ts`, a migration, `prisma.config.ts` or a
  checkpoint feature step.
* 20 chose between 304 and 519 suites. Some of these counts exceed 513 because the smoke set and its helpers are
  listed by name.
* 1, the infrastructure batch #1634, chose 24.
* In all 26 batches with a failing suite, it was chosen. The other 4 failed the regression job or a runner.

So selection would have missed no failure, but it would have saved almost no minutes. Our PRs touch shared files
(the schema and its migrations, `core.ts`, `main.ts`, the checkpoint feature steps), so a module's batch would still
run nearly the whole set. Per-module queues would not shorten a batch's ci run, which is the floor above.

**What a split would cost.** 4 of the 13 clash roots crossed modules:
* #1837: case side against client money;
* #1629: runtime filings against BK-15 and BK-16;
* #1618: BK-15 against BK-9;
* #1604: the screens hand-offs against the BK-5 start page.

Two queues that each test against main without the other's PRs would let such a pair land on main green in each
queue and broken together. That is a check weakened (P-214), unless a PR that touches both modules joins both
partitions, which is the unconfirmed part above. More queues would also run more batches at once on the same runners.

**Recommendation: do not split the queue.** It would save no measured minute, and it risks breaking main.

## 4. What to propose (by cause, then by time)

Every item below changes `product/tools/` or `.github/`, which this evidence copy may not edit (P-189's stop hook).
Each one is a proposal for the Lead, with a patch in the PR. P-623 (4) says "no further pipeline change until P-622
runs to its numbers". The Lead decides whether these come under P-622 or wait.

1. **Flaky: quarantine `check_bk5_start_browser.cjs` now (P-205)**, with its own fix row: the BR-6 double-click race,
   in the app or the check. Its owner is the tech lead, by `flaky-ledger.tsv`'s catch-all, until the Lead names
   BK-5's area. Main's own nightly failed it with no code cause. It goes on `run-suites.sh`'s quarantine
   list, and the nightly full set still runs it.
   * `check_c95_release_update_browser.ts`: quarantine with a fix row (owner: the tech lead, by the ledger's
     catch-all) on 4 independent
     TimeoutErrors in 7 days. The Lead may prefer to wait for one more failure, since the 16 Nov nightly passed it.
   * `check_b151_unpriced_browser.ts` stays in the check (note 2).
   * **No change to B122's rule.** Counting "failed twice" toward automatic quarantine would reverse
     `check-flaky.sh:195`. "Merged unchanged" cannot tell a flake from a fix on main in between, as b151 shows, so
     this page does not propose it.
2. **Clash (73%): measure the `queue-fresh` gate before widening it.** It went live at 02:07 UTC 16 Nov, and no batch
   has failed since 15 Nov 13:22 UTC. If the 24 h re-measure (step 3) still shows clashes, the next step is to widen
   it from "same app file" to "same suite". The gate would go stale when main has added or changed a suite that the
   PR's files select, or has changed a file selected by a suite that the PR changes. This needs a replay of the 13
   roots first.
3. **Infrastructure (3%): no build now** (P-610).
4. **Time (the floor):** shorten the batch's ci run. The arithmetic in §2 needs about 26 parts for a median under
   30 min. 16 parts would bring the median to about 40.
   * On a public repository, GitHub's hosted minutes cost US$0, and the machine minutes stay the same.
   * GitHub's limit on jobs running at once is **unconfirmed** here. With 3 batches at once, 26 parts plus 5
     regression jobs per batch could queue parts and cancel the gain.
   * A measured trial would set the count from the observed runner wait. The change is in `.github/workflows/ci.yml`
     (P-423).

## 5. Re-measure (step 3)

24 h after the next fix merges, run each of these with `--since` set to the merge time:
* `merge-queue-causes.py --failed 30`;
* `flow-measure.py --since`;
* `parts.py`.

Post the numbers with n, on both clocks.
