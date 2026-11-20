# qa 7 R1.109 re-walk after PF-21j (20 Nov 2026, ~02:1x IST)

Verdict: **Works** on main 6f6efac88 (QA-517's fix PF-21j #2315 merged 01:53 IST). **QA-517 closed.** New: QA-525 (Gap · Minor, a test gap in H4). Live AI off, US$0, no priced button, no demo; nothing run locally: both walks ran on GitHub's runners, started by the tech lead (Lead 97). Reader: a fresh Opus 5.5 at high effort, ran nothing (P-303). The reader's note that the QA-517 row appears twice in BUGS.md was checked and is not so (one row, line 260 on main b2f0c23b1); nor does its pack's `bugs-open.md` (here `bugs-open-reader.md`) list QA-517 twice.

## Files
| File | What it is |
|---|---|
| reader-verdict.md | the fresh reader's verdict |
| walk-j109-pack-44608469689.txt | j_109 pack run on main 6f6efac88, job 135859331855 (26 PASS) |
| walk-j109-rerun-44608482750.txt | j_109 independent re-run on main 6f6efac88, job 135858756145 (26 PASS) |
| ci-44601627608-suites.txt | every suite line of merge batch draft #2371 (head eabe462db) |
| ci-44601627608-jobs.txt | that run's non-skipped jobs and conclusions |
| ci-suites-r1109.txt | its complaints (pf21) lines, as given to the reader |
| pf21j-diff-3c9731cd7-6f6efac88.patch | the fix's diff to complaints.ts and routes.ts |
| batch-checks.txt | run identities read from the GitHub API, and the tree note |
| batch-checks-reader.txt | the short version the reader was given |
| bugs-open-reader.md | the open BUGS rows naming R1.109 as given to the reader (QA-506, QA-517) |

## Names the reader used → file here
| Reader's name | File here |
|---|---|
| walk-44608469689.txt | walk-j109-pack-44608469689.txt |
| walk-44608482750.txt | walk-j109-rerun-44608482750.txt |
| ci-suites-all.txt | ci-44601627608-suites.txt |
| ci-suites.txt | ci-suites-r1109.txt |
| ci-jobs.txt | ci-44601627608-jobs.txt |
| pf21j-diff.patch | pf21j-diff-3c9731cd7-6f6efac88.patch |
| batch-checks.txt | batch-checks-reader.txt |
| bugs-open.md | bugs-open-reader.md |
| row.md, rules-works.md, qa517.md, j_109.ts, check_pf21j_handler_key.ts, earlier-reader-verdict-3c9731cd7.md | R1.109's row and QA-517's row as on main 6f6efac88 (`qa/CAPABILITIES.md`, `qa/BUGS.md`), `RULES.md`, `prototype/studio/tests/journeys/j_109.ts`, `prototype/studio/tests/check_pf21j_handler_key.ts`, `reports/2026-11-19-after-merge-r1109/reader-verdict.md` |
