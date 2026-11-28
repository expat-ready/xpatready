# Reviewer test set: runs (LR-136)

One block per run, newest first. The set: `reviewer-test-set.json` (16 cases from our own shipped bugs, each a culprit PR
whose bug later turned main red; found by reading the fix PRs on 28 Nov). Run it when REVIEW.md, the reviewer agent or
skill, its tools or its model change (REVIEW.md §8). Tokens: each reviewer's context at its last call (input + cache
creation + cache read + output of that call), from the subagent transcripts; the sum counting every call's cache reads
is about ten times larger. Plan subagents, no paid API call, live AI off.

## 2026-11-28 14:1x IST (TZ=Asia/Kolkata date), first run, lane automation-measures-2

* Reviewer: fresh general-purpose subagent on Opus (P-303), one per case, blind brief from `reviewer-eval.py brief`,
  each in a git worktree detached at the culprit's merge commit, REVIEW.md as on main 70d00f54c (with §8).
* Pilot first (LR-128 rule): RT-15 and RT-11, 0 of 2, ~125k tokens each; the brief and scoring held, so the other 14
  ran in batches of at most 5.
* **Result: caught 3 of 16 (18%), 2,014,339 tokens (about 126k per review).** Caught RT-03 (stale generated waves.md),
  RT-07 (PR-only git-state assertion), RT-08 (newest-migration assertion). Approved with the bug in: RT-05, RT-10,
  RT-11, RT-14. The other 9 asked for Changes on other problems and missed the shipped bug.
* Scoring checked by hand against every answer: the same 3. Two scorer faults found and fixed during the run (a file
  named for another problem counted as a catch: per-case `match` added; a finding under a "## Important" heading was
  not read as Important), each with a test in check-reviewer-eval.sh.
* What the misses have in common: 11 of the 13 are bugs that show only against other files or the clock (a card's
  line cap, a scope list, a time zone or a frozen clock, a suite's usage line read by run-suites.sh). The reviewer read
  the diff well and found real other problems, but did not check the diff against the repository's own checks.
  That is the input for the next reviewer-brief change (not made here: REVIEW.md changes are their own row).
* Answers: `reviewer-test-runs/2026-11-28/RT-*.md`.

```
RT-01 #3924 MISSED  Changes, Important on check-docs.sh but for another problem (match: syntax|empty .?then|if\b.*\bthen|mutant|row 6)
RT-02 #3812 MISSED  Changes, but no Important finding names PF-R2cm.md
RT-03 #2623 CAUGHT  Changes, Important on ai-workers/problem-1-pathway-setup-and-form-filling/product/design/waves.tsv
RT-04 #2317 MISSED  Changes, Important on reminders.ts but for another problem (match: mergify|scope)
RT-05 #2909 MISSED  approved
RT-06 #2195 MISSED  Changes, but no Important finding names check-module-cards.sh
RT-07 #2035 CAUGHT  Changes, Important on ai-workers/problem-1-pathway-setup-and-form-filling/prototype/studio/tests/check_css1_index.ts
RT-08 #2101 CAUGHT  Changes, Important on ai-workers/problem-1-pathway-setup-and-form-filling/prototype/studio/tests/check_csnk1_name_key.ts
RT-09 #3180 MISSED  Changes, Important on check_csd5_flags.ts but for another problem (match: time ?zone|DST|daylight|UTC|Toronto|calendar day)
RT-10 #2243 MISSED  approved
RT-11 #3492 MISSED  approved
RT-12 #3658 MISSED  Changes, Important on check_fo7s3a_payments_trust_browser.ts but for another problem (match: expir|frozen|real time)
RT-13 #3836 MISSED  Changes, Important on check_pf21rs_browser.ts but for another problem (match: usage line|run-suites|--tsconfig|isolated copy|copy pattern)
RT-14 #3769 MISSED  approved
RT-15 #1056 MISSED  Changes, but no Important finding names item-channels.tsx
RT-16 #3716 MISSED  Changes, Important on merge-dialog.tsx but for another problem (match: twice|same sentence|shown once|two times|repeat)
reviewer-eval: caught 3 of 16 (18%), tokens 2014339
```
