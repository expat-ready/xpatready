# qa 7 after-merge proof: R1.37, R1.40, R1.77 (20 Nov 2026, ~01:3x IST)

Tested: main c66a41c96 (app code; the records branch merges main 298f75651, which changes no app code these items use). Live AI off, US$0, no priced button, no demo; nothing run locally: the walks ran on GitHub's runners, started by the tech lead (Lead 97). Readers: fresh Opus 5.5 at high effort, one per item, ran nothing (P-303).

| Item | Verdict | Held by |
|---|---|---|
| R1.37 Public booking page; no double booking | Works | none (QA-475 is Minor) |
| R1.40 Calendar invite files | Partial | QA-522 (J-38 shows only the first invite) |
| R1.77 Submission number and UCI; decision, close, reopen | Works | none (QA-502 closed; QA-523 Minor, new) |

Also in this change: QA-519 (Minor, a CI race in `check_forms_qa206_name_browser.cjs`, raised by Lead B (8)).

## Files
| File | What it is |
|---|---|
| reader-verdict-r137.md, reader-verdict-r140.md, reader-verdict-r177.md | each fresh reader's verdict |
| auto-verdict-r137-ee24ed8b1.json | item-proof's machine verdict for R1.37 (branch `auto-verdicts`) |
| walk-j37-autoproof-44562311132.txt | J-37 steps in the automatic proof, job 135695093462, on ee24ed8b1 |
| walk-j37-rerun-44600062791.txt | J-37 independent re-run on main c66a41c96, job 135829239530 |
| walk-j38-pack-44600075318.txt, walk-j38-rerun-44600084855.txt | J-38 on main c66a41c96, jobs 135829147812 and 135829118189 |
| walk-j77-pack-44600094672.txt, walk-j77-rerun-44600106989.txt | J-77 on main c66a41c96, jobs 135829183143 and 135829221381 |
| ci-44575502680-suites.txt | every suite line of merge batch draft #2344's 18 shards (head 6f1ef9c36; studio tree 1b360046e = main c66a41c96's) |
| batch-checks.txt | every run's id, workflow, head sha, branch, conclusion and jobs (incl. the 5 regression jobs of ci 44575502680), read from the GitHub API by qa 7; both walk runs of each item have head sha c66a41c96 |
| ci-suites-r137.txt, ci-suites-r140.txt, ci-suites-r177.txt | the lines of ci-44575502680-suites.txt each reader was given |
| bugs-open-r137.md, bugs-open-r140.md, bugs-open-r177.md | the open BUGS.md rows naming each item, as given to its reader |
| qa519-ci-scan.txt | QA-519's evidence: the failing job's log lines and the scan of the last 45 ci runs (16 runs held the suite, all PASS) |

## Names the readers used (their pack) → file here
| Reader's name | R1.37 | R1.40 | R1.77 |
|---|---|---|---|
| walk-steps-autoproof.txt | walk-j37-autoproof-44562311132.txt | | |
| walk-steps-pack.txt | | walk-j38-pack-44600075318.txt | walk-j77-pack-44600094672.txt |
| walk-steps-rerun.txt | walk-j37-rerun-44600062791.txt | walk-j38-rerun-44600084855.txt | walk-j77-rerun-44600106989.txt |
| ci-suites.txt | ci-suites-r137.txt | ci-suites-r140.txt | ci-suites-r177.txt |
| auto-verdict.json | auto-verdict-r137-ee24ed8b1.json | | |
| bugs-open.md | bugs-open-r137.md | bugs-open-r140.md | bugs-open-r177.md |
| batch-checks.txt | batch-checks.txt (the readers had a short version; this one adds the API read) | same | same |
| row.md, rules-works.md, j_37.ts / j_38.ts / j_77.ts, qa475.md, qa502.md, c82-row.md | the row and rules as on main c66a41c96 (`qa/CAPABILITIES.md`, `RULES.md`), the journeys in `prototype/studio/tests/journeys/`, the BUGS rows | | |
