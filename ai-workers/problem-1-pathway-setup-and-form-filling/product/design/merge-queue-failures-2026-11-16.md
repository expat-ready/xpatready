# Merge-queue failures by cause, and where approved-to-merged time goes (B199 step 1, 16 Nov)

B199 (P-622, P-214, P-371, P-610). Measured from GitHub on 16 Nov, 04:00–04:45 UTC (09:30–10:15 IST). Read-only GET
calls, no estimates. This page follows B194's `design/merge-queue-causes-2026-11-16.md`. That page measured 24
failures and the fix for the migration pair (the `queue-fresh` gate, #1861, merged 02:07 UTC 16 Nov). This page
classifies the last **30** failed batches into the four causes the row names, adds the Lead's two questions (Lead 64,
07:3x IST: the parts of approved-to-merged time, and whether per-module queues would help), and recommends what to build.

Reproduce:
* the table: `python3 -I product/tools/merge-queue-causes.py --failed 30 --pages 6`;
* the cause column: each root's fix commit (quoted below), read from `pulls/<n>/commits`;
* the 24 h numbers: `python3 -I product/tools/flow-measure.py --since 2026-11-15T03:30:00Z`.

## Headline

| number | baseline 15 Nov 22:38 IST (the row) | last 24 h (15 Nov 03:30 to 16 Nov 04:40 UTC) | B199 target |
|---|---|---|---|
| batch failures | 24 of 111 (22%) | **3 of 54 (5.6%)**. All 3 came from one root (#1837, a migration pair) and its 2 cascades. None since 15 Nov 13:22 UTC (15 h) | under 10% |
| approved to merged, median / p90 | 61 / 157 min (n=221) | **61 / 132 min (n=78)** | median under 30 min |

**What this means.** The failure target is already met on the last 24 h. The time target is not, and fixing failures
cannot meet it. On the last 50 merges, the final batch's own CI run takes a median of **51 min**. That is longer than
the whole 30 min target (see §2). The constraint (P-622) is the batch check's length, not its failures.

## 1. The last 30 failed batches, by cause (11 Nov 23:34 to 15 Nov 13:22 UTC)

The four causes:
* **clash:** a member's own check was green, but the member met another PR's newer code for the first time in the
  queue. That code was either on main (merged after the member's ci started), ahead in the queue, or in the same batch.
  The fix commit names the other PR or main's code.
* **real break:** a member was broken alone. The queue's extra check (the regression job's Works packs) found it.
* **flaky:** the members later merged unchanged, with the same suite green.
* **infrastructure:** a runner or service failed, with no test result.

A **cascade** is a batch checked on top of a failing batch ahead (`max_parallel_checks: 3`). It carries the same broken
commits, so it takes the cause of its root.

| batch | created (UTC) | members (ahead) | failed suite or job | cause | evidence: the fix commit, or the log | CI min |
|---|---|---|---|---|---|---|
| #1839 | 15 Nov 13:22 | #1808 #1810 (#1834 #1818 #1823 #1816) | check_fo7a_money_schema.ts | clash (cascade of #1837) | same failure, #1818 ahead | 418 |
| #1838 | 15 Nov 12:53 | #1823 #1816 (#1824 #1834 #1818) | check_fo7a_money_schema.ts | clash (cascade of #1837) | same failure, #1818 ahead | 392 |
| #1837 | 15 Nov 12:45 | #1834 #1818 (#1824) | check_fo7a_money_schema.ts | **clash** with FO-7a on main (migration pair) | #1818 9ef44dea5 "FO-7a's function-name check leaves out functions of later migrations (merge batch #1837 shard 1)" | 409 |
| #1767 | 14 Nov 16:03 | #1761 #1752 | check_fo1a_sales_schema.ts | **clash** with FO-1a and PF-L on main (migration pair) | #1761 2b087d7ad "FO-5 re-stamp step (P-600) after FO-1a and PF-L merged" | 409 |
| #1766 | 14 Nov 15:12 | #1761 (#1751 #1755) | check_fo1a_sales_schema.ts | clash (cascade of #1765) | same failure | 406 |
| #1765 | 14 Nov 15:00 | #1755 (#1751) | check_fo1a_sales_schema.ts | **clash** with FO-1a, PF-L and PF-0p (migration pair) | #1755 136b87f96 "Merge origin/main (PF-0p #1752, FO-1a #1742, PF-L #1751) into FO-13", then c841df3f4 re-stamp | 410 |
| #1735 | 14 Nov 05:21 | #1733 (#1728) | check_c95_release_update_browser.ts | **flaky** | TimeoutError on both tries; members merged unchanged | 404 |
| #1724 | 13 Nov 20:54 | #1692 (#1691 #1722) | regression (Works packs) | real break (cascade of #1722) | same failure, #1691 ahead | 412 |
| #1723 | 13 Nov 20:54 | #1691 | regression (Works packs) | **real break** | #1691 471f34fc2 "C8.3's re-approval: the reviewer's own typing since the round's base is judged form by form" | 439 |
| #1722 | 13 Nov 20:00 | #1691 #1692 #1713 | regression (Works packs) | **real break** | the same #1691 fix | 423 |
| #1721 | 13 Nov 19:56 | #1695 (#1711 #1709 #1706 #1720) | check_bk13_zero_code_run.ts | **clash** with BK-23 on main | #1695 6a64089c5 "the spouse's current country of residence in the Sample answers (BK-23 now asks it)" | 421 |
| #1720 | 13 Nov 19:04 | #1695 #1691 (#1711 #1709 #1706) | check_bk13_zero_code_run.ts and regression | **clash** (#1695, BK-23) and real break (#1691) | both fixes above | 407 |
| #1715 | 13 Nov 17:19 | #1706 (#1698 #1702) | check_bk5_start_browser.cjs | **flaky** | "BR-6 pass: Try again (double clicked)" on both tries; members merged unchanged | 455 |
| #1707 | 13 Nov 16:39 | #1702 (#1695 #1698) | check_bk13_zero_code_run.ts | clash (cascade of #1704) | same failure | 421 |
| #1705 | 13 Nov 15:54 | #1695 #1698 | check_bk13_zero_code_run.ts | **clash** with BK-22 in the same batch | #1695 a87d2cdee "merge-queue batch #1705 with BK-22 (#1698)" | 441 |
| #1704 | 13 Nov 15:51 | #1698 (#1692 #1695) | check_bk13_zero_code_run.ts | **clash** with BK-22, #1695 ahead | the same #1695 fix | 397 |
| #1701 | 13 Nov 15:00 | #1692 (#1694) | check_b151_unpriced_browser.ts | **flaky** (weak: the same member as #1697) | `name: 'Error'` on both tries; #1692 merged unchanged | 431 |
| #1697 | 13 Nov 13:35 | #1692 (#1693) | check_b151_unpriced_browser.ts | **flaky** (weak: see #1701) | as #1701 | 428 |
| #1664 | 12 Nov 18:29 | #1652 (#1643 #1659) | check_qa439_question_order_api.ts, check_c95_release_update_browser.ts | clash (cascade of #1662) | same failure | 404 |
| #1663 | 12 Nov 18:04 | #1659 (#1643) | check_qa439_question_order_api.ts | clash (cascade of #1662) | same failure | 405 |
| #1662 | 12 Nov 17:50 | #1643 | check_qa439_question_order_api.ts | **clash** with main | #1643 d474bd9a9 "CI's c95 fails only on the merge with main 052e9fcc6", fix 8bbe5fa9f | 407 |
| #1634 | 12 Nov 07:47 | #1628 | shard (8), no suite result | **infrastructure** | annotation: "The hosted runner lost communication with the server." (job 131047164751) | 376 |
| #1630 | 12 Nov 06:51 | #1627 (#1566 #1612) | check_bk17_recorded_filing_api.ts | clash (cascade of #1629) | same failure | 343 |
| #1629 | 12 Nov 06:44 | #1612 (#1552 #1566) | check_bk17_recorded_filing_api.ts | **clash** with BK-15 and BK-16 on main | #1612 af157ce4d "test set-up follows main's filings (BK-15, BK-16: everyone files their own)" | 397 |
| #1619 | 12 Nov 04:40 | #1617 (#1591) | check_bk9_shared_filing_api.ts | clash (cascade of #1618) | same failure | 356 |
| #1618 | 12 Nov 04:19 | #1591 (#1580) | check_bk9_shared_filing_api.ts | **clash** with BK-9 on main | #1591 6be6e17d7 "BK-15 × BK-9: the shared-filing check finds a child on the principal's application by data" | 359 |
| #1610 | 12 Nov 02:32 | #1569 (#1580) | check_bk4a.ts | clash (cascade of #1607) | same failure | 355 |
| #1608 | 12 Nov 01:53 | #1580 | check_bk4a.ts | **clash** with BK-4b on main | #1580 3b847fabb "check_bk4a BR-1 lists BK-4b's reviewed hand-offs" | 325 |
| #1607 | 12 Nov 01:52 | #1580 #1569 | check_bk4a.ts | **clash** with BK-4b (#1569 is qa records) | the same #1580 fix | 318 |
| #1604 | 11 Nov 23:34 | #1582 (#1575 #1557 #1549 #1600) | check_bk4b_handoffs.ts | **clash** with BK-5 and BK-4a | #1582 45bf8271f "BR-1's page check allows the sign-in places: BK-5's start page (P-484) and BK-4a's sign-in page (#1580)" | 318 |

### Totals

Each cascade is counted under its root's cause. #1720 is counted once, as a clash.

| cause | roots | with cascades | of 30 | CI machine min |
|---|---|---|---|---|
| clash | 13 | 23 | **77%** | 9,107 |
| flaky | 4 | 4 | 13% | 1,718 |
| real break | 2 | 3 | 10% | 1,274 |
| infrastructure | 1 | 1 | 3% | 376 |
| **all** | 20 | 30 | 100% | 12,475 |

Notes on the totals:
* **Clashes.** Of the 13 clash roots, the other PR was already on main in 10 and in the same batch in 1 (#1705), and
  2 involve a PR ahead in the queue (#1704, #1607). So keeping PRs that touch the same suites out of one batch would
  have prevented at most 1 root and its cascade. Clashes with code that had just merged are the ones B194's
  `queue-fresh` gate addresses: it re-runs ci on today's main when main merged a PR touching the same app files, or a
  second migration. It covers the 3 migration pairs (#1837, #1765, #1767) by its own measure. The other 10 roots
  shared no app file with the PR that broke them: a suite of one PR read behaviour that another PR changed.
* **Flaky.** 4 batches, from 3 suites. Their last failures were 13 and 14 Nov. Main's scheduled nightly run 43777966873
  (16 Nov 00:01 UTC, the full set, never retried) passed all three. The batch failures at that time failed twice in
  one run, so B122's automatic quarantine did not count them: it counts only a pass on retry.
  `check_c95_release_update_browser.ts` also failed twice with TimeoutError in the batch runs of 8 Nov (2), 11 Nov
  and 12 Nov (one of them the #1643 clash). It is the one suite with repeated independent evidence.
* **Infrastructure.** 1 in 30: a lost runner. Retrying a failed part once would have saved one batch of 376 min in
  four days.

## 2. Where approved-to-merged time goes (the Lead's question 1: the last 50 merges)

The parts of approved-to-merged time:
* **waiting for a batch:** from the last `review: approved` label to the first batch PR that contains the PR. This
  covers Mergify's conditions (ci, queue-fresh), `batch_max_wait_time` (5 min) and the slots ahead.
* **re-runs after a failed batch:** from that first batch to the batch that merged the PR.
* **the final batch:** from that batch's creation to the merge. Its ci run is inside this part.

The 50 merges run back from 16 Nov 04:34 UTC.

| PRs | n | approved to merged median (p90) | waiting for a batch median (p90) | re-runs median (p90) | final batch median (p90) | of it, the batch's ci run median (p90) |
|---|---|---|---|---|---|---|
| all | 50 | 60 (132) | 10 (55) | 0 (0) | 52 (58) | 51 (58) |
| code (product queue) | 28 | 67 (154) | 11 (58) | 0 (0) | 53 (58) | 53 (58) |
| records | 22 | 37 (63) | 10 (17) | 0 (0) | 26 (54) | 6 (53) |

Totals over the 50 merges:

| part | minutes | share |
|---|---|---|
| final batch | 2,098 | 62% |
| waiting for a batch | 1,023 | 30% |
| re-runs after a failed batch | 254 | 8% |
| **all** | 3,375 | 100% |

Only 3 of the 50 PRs went through more than one batch.

**The final batch's ci run dominates.** On the 40 newest merged batches, the run's wall time has a median of 52.8 min.
Almost all of it is the longest of the 8 parallel parts (shards): median 48.7 min, maximum 54.1. The other times are
small:
* waiting for a runner: median 0.1 min after the first job;
* the first job (`kind`): 3 min;
* set-up: about 2 min per part.

`suite-times.tsv` holds 498 suites totalling 339 machine minutes, so 8 parts give about 42 min each. The longest
single suite is `check_b78_section_names.ts` at 1,230 s. It is quarantined, so it runs only nightly.

So an approved-to-merged median under 30 min needs the batch's ci run under about 20 min. Fixing failures does not get
there: even with zero failures and zero waiting, a code PR would take a median of about 53 min.

## 3. Separate queues per module (the Lead's question 2)

**Mergify's options.** I could not read Mergify's documentation or pricing from this session.
`docs.mergify.com` and `mergify.com` are refused by the session's network: "CONNECT tunnel failed, response 403" with
curl, and "getaddrinfo ENOTFOUND" with the fetch tool. So the following are unconfirmed:
* whether partitions are on our plan;
* how a PR that matches two partitions is checked;
* the price.

The Lead can add the two hosts to the environment, or read the pages on the Mac. Nothing below depends on them.

**How our suite selection would scope a module's batch.** For each failed batch, I fed the union of its members' and
ahead PRs' files (the batch's change against main) to `select-suites.mjs`, using today's graph:
* 9 of 30 batches chose **ALL**. The reasons were `api/src/core.ts`, a migration, `prisma.config.ts` and a checkpoint
  feature step.
* The rest chose 304 to 519 of 498+ suites. The one exception was the infrastructure batch #1634, which chose 24.
* The failing suite was chosen in every one of the 30. Selection would have missed no failure, but it would have
  saved almost no minutes either.

A module's batch would therefore still run nearly the whole set. Our PRs touch shared files: the schema and
migrations, `core.ts`, `main.ts` and the checkpoint feature steps. So per-module queues would not shorten a batch's
ci run, which is the constraint above.

**What a split would cost.** 4 of the 13 clash roots crossed modules:
* #1837: case side against client money;
* #1629: runtime filings against BK-15 and BK-16;
* #1618: BK-15 against BK-9;
* #1604: screens sign-in against the BK-5 start page.

Two queues that each test against main without the other's PRs would let such a pair land on main green in each
queue and broken together. That is a check weakened (P-214), unless a PR that touches both modules joins both
partitions. That behaviour is the unconfirmed part above. More queues would also run more batches at once on the
same runners.

**Recommendation: do not split the queue.** It would save no measured minute and risks breaking main.

## 4. What to build (the recommendation, by cause and by time)

1. **Clash (77%): keep the `queue-fresh` gate and measure it first.** B194's gate went live at 02:07 UTC 16 Nov. No
   batch has failed since 15 Nov 13:22 UTC. The next step, only if the 24 h re-measure (step 3) still shows clashes:
   widen `queue-fresh` from "same app file" to "same suite". The gate would go stale when main has added or changed
   a suite that the PR's files select, or has changed a file selected by a suite the PR changes. This is the
   narrowest form of the row's "keep PRs touching the same suites apart": 10 of the 13 roots had their partner on
   main, not in the batch. It changes `product/tools/queue-gate.sh` (Lead-read, P-423). It needs a replay of the
   13 roots before it is built.
2. **Flaky (13%): quarantine `check_c95_release_update_browser.ts`** with its own fix row:
   * owner: forms, C9.5;
   * the cause: TimeoutError in 5 batch runs, 8–14 Nov;
   * listed in `run-suites.sh`'s quarantine list, with the nightly full set still running it.

   Then count "failed twice in a batch whose members later merged unchanged" toward B122's automatic quarantine,
   with the same 2-in-7-days rule. `check_bk5_start_browser.cjs` and `check_b151_unpriced_browser.ts` stay in the
   check: the nightly passes them, and their evidence is older or comes from one PR. The new count quarantines them
   if they fail again.
3. **Infrastructure (3%): no build now.** One lost runner in four days does not justify a re-run workflow on the
   queue (P-610).
4. **Time (the real constraint, P-622): shorten the batch's ci run.** The same 339 machine minutes on 16 parts
   instead of 8 give about 21 min per part, plus about 5 min of start-up. On a public repository, GitHub's hosted
   minutes cost US$0. The limit on jobs running at once is unconfirmed here, and with 3 batches at once it could
   queue parts. A 24 h trial would set the number of parts from the measured runner wait. This changes
   `.github/workflows/ci.yml` (P-423). **Question for the tech lead:** may this lane take it as B199 part 2? It is
   the only fix that reaches the under-30-min median.

## 5. Re-measure (step 3)

24 h after the next fix merges, run both commands with `--since` set to the merge time, and post the numbers with n:
* `merge-queue-causes.py --failed 30`;
* `flow-measure.py --since <merge time>`.

Then add the parts table from the script in §2 (`parts.py`, kept in the B199 PR body until it becomes a tool).
