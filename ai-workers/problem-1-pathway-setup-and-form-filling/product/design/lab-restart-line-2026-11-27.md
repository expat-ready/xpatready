# When product restarts: fix what costs 80% of the time first (A446)

Lead 8, 19:1x IST 27 Nov. Answers the founder's A446 (word for word: `history/STATE-2026-11-27-1910-lead8-A446-row.md`). Evidence: `lab-replan-2026-11-27-flow.md` (every lab PR's minutes today, measured from GitHub at 18:10 IST), `lab-replan-2026-11-27-triage.md` (the 110 Intended rows), `.mergify.yml` on main. Amends the restart line of P-852; no gate is lowered (A438).

## The answer in five lines
1. **Yes: fix the pipeline problems that cost 80% of the time before product restarts.** Six fixes remove about 80% of today's measured waiting (table below), and most of them are small. Today's restart line (the 27 must-have rows) leaves out four of the six.
2. **Product on today's pipeline would hurt both, so it stays stopped.** The two compete for the one Lead's reads (29.5 h was already the biggest wait), and product's flaky browser tests bounce pipeline PRs: #3953 failed its merge batch today on a product test (QA-789).
3. **The 7 nights are not code. They are 7 days of waiting** (LR-110: "Elapsed time; new PR only on a new red"). Today they hold the restart from about 29 Nov to about 4-5 Dec.
4. **There is a faster way with *more* evidence.** Every merge batch already runs the full test suites, about 30 times a day. 40 clean full runs plus 2 green nightlies is a bigger sample than 7 nightlies, with the same rule that a flaky test is quarantined and given an owner. That is what large teams use (a merge queue with required checks, automatic flaky-test quarantine, an owner per failure), not a calendar streak.
5. **Something was wrong in how we worked, and the data shows what:** 83 of the 99 open PR-hours were waiting, not work. Three causes: one Lead reads every pipeline PR in series (and the Lead changed 5 times today); a check that can fail (`guards`) is not required, so a broken PR merged; and failure logs showed only their last 20 lines, so three stacked causes were found one at a time.

## Where the 99 PR-hours went, and what removes it (lab PRs today)
| Wait | Hours | Fix (no gate lowered) | Size | Removes (est.) | In the 27? |
|---|---|---|---|---|---|
| Waiting on a Lead read or answer | 29.5 | **F1** Lead reads first at every 10-min check, oldest first, always the exact line `Lead read the diff: <full sha>` (HOLD notes go below it); **F6** a Lead hands over at most twice a day | process (in force since 17:01; lead-watch already lists owed reads) | ~20 h | No |
| Merge queue | 17.4 | **F2** a priority rule in `.mergify.yml`: main-fix PRs (P-214) jump the `pipeline` scope's line, same conditions | ~15 lines | ~6 h | No |
| Red main / red `fast` | 13.3 | **F3** #3953 (every FAIL line printed, zsh installed), then **F4** `guards` becomes a required check for the `pipeline` scope | ~30 + ~5 lines | ~13 h | No |
| guards part 1/4 time-outs | 11.9 | **F5** #3918 (guards in 6 parts) | 11 lines | ~12 h | Partly (A2) |
| Idle after Approve | 10.4 | **F6** each check, every approved PR has an owner and a next step; plus the queue gate's automatic full run after a failed batch (B206, working: it started #3953's run by itself at 18:43) | process + done | ~8 h | Partly (#3825, #3843) |
| CI running (real work) | 9.6 | none (this is the work) | | | |
| Total waiting | 82.5 | F1-F6 | about 60 lines of code | **~59 h, about 72%; with A10 later, over 80%** | |

The rest of the Lead wait goes when reads stop depending on one session. That is the Claude Approvals switch (A6 observe week, then A10), already on the register and already decided (P-849). It needs its observe week, so it lands after the restart.

## The new restart line (amends P-852)
Product restarts when **all three** hold:
1. **The six flow fixes F1-F6 are merged or in force, and one measured day proves them.** Measured with `flow-measure.py` over 12 hours: median Approve→merge for pipeline PRs ≤ 45 min (today 141), no red main or red `fast` longer than 30 min, no `guards` time-out, no Lead read waiting over 30 min.
2. **The must-have safety rows are merged and proven:** bundle 1 (#3833, #3814, #3825, #3843), A1 hooks fail closed, A2 guards right-sized, A3 PR rules fail closed, A4 review converges, A5 product safety checks, A7 private split, A8 dependencies. This is the triage page's own line. A6 (observe week), A9 (workflow pins) and A10 (the switch) follow after the restart, as the triage page already planned.
3. **Main is proven stable on evidence, not on a calendar (replaces LR-110's 7 nights, founder's yes needed):** the last 40 full-suite runs (merge batches and nightlies) have no red that is not either the culprit PR's own fault (found by Mergify's split) or a quarantined suite with a named owner and a fix PR. The last 2 nightlies are green. The 2 nightlies keep the date and time-of-day cases the batches can miss.

After the restart the nightly still counts: a red night stops product merges until it is fixed (P-852 unchanged on this).

## Code left, and is it worth it
* **LR-110 (7 nights): 0 lines.** It is waiting only.
* **Flow fixes F1-F6: about 60 lines of code** plus the Lead's own discipline. Worth it: about 59 of the 82.5 waiting hours.
* **Must-have safety rows:** the four open PRs are 3,596 changed lines (#3833 1,521; #3843 1,787; #3814 206; #3825 82); the bundles A1-A5, A7, A8 are about 2,300 lines plus A7's pure moves. Worth it: each closes a measured hole (a broken PR merged today because a check was optional; hooks and PR rules that fail open let bad changes through silently).

## Forecast (estimate from today's rates; reset each morning, P-614)
* F3 #3953 tonight (its full run is going), F5 #3918 next, F2 and F4 one small PR tomorrow morning; F1 and F6 are in force now.
* Proof day for F1-F6: 28 Nov.
* Must-have safety rows Built and Proven: about 29 Nov evening (Lead 7's estimate, unchanged), and faster once F1-F6 cut the waits.
* 40 clean full runs: about 1.5 days at ~30 batches a day, so it runs alongside.
* **Restart about 29-30 Nov, not 4-5 Dec, with stronger evidence than the 7 nights.** Release 1 stays 12 Dec, with the re-decision on 1 Dec (P-609).

## Owed to make this real
* A builder for the four open must-have PRs (their session was on the old account and is gone), started at the founder's next desktop-typed turn, with two standby Leads.
* F2 + F4 in one `pipeline` PR (`.mergify.yml`: priority for main fixes; `guards` required after #3918), Lead read, check-only (P-214).
* `lab-progress.py` counts the restart line's rows (owed under P-852), not all 137.
