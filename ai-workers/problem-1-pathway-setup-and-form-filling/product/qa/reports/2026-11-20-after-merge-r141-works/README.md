# qa 7 after-merge proof: R1.41 Staff hours and time off (20 Nov 2026, ~01:4x IST)

Verdict: **Works** on main 292847c32 (its last part J-41 #2302 merged 01:29 IST). Live AI off, US$0, no priced button, no demo; nothing run locally: the walks ran on GitHub's runners (the automatic item-proof, and an independent re-run started by the tech lead, Lead 97). Reader: a fresh Opus 5.5 at high effort, ran nothing (P-303). New: QA-524 (Ambiguity · Minor, the Done when's "for one person" against the per-set database rule). No open finding names R1.41 (the reader's `bugs-open.md` was empty). qa corrected the reader's m2 (the reviewer checked the tests): fo3st2 shows an Admin setting a colleague's time off by screens, not hours; a colleague's hours are proven only through the API (fo3a DW20).

## Files
| File | What it is |
|---|---|
| reader-verdict.md | the fresh reader's verdict |
| auto-verdict-r141-292847c32.json | item-proof's machine verdict (branch `auto-verdicts`) |
| walk-j41-autoproof-44603961304.txt | J-41 steps in the automatic proof, job 135842994804, on 292847c32 |
| walk-j41-rerun-44604534795.txt | J-41 independent re-run on main 292847c32, job 135845046995 |
| ci-44598210725-suites.txt | every suite line of merge batch draft #2366's shards and regression jobs (head c6d80860b) |
| ci-44598210725-jobs.txt | that run's non-skipped jobs and conclusions |
| ci-suites-r141.txt | the booking and hours lines of it that the reader was given |
| batch-checks.txt | run ids, workflows, head shas, branches and conclusions read from the GitHub API, and the tree evidence |
| batch-checks-reader.txt | the short version the reader was given |

## Names the reader used → file here
| Reader's name | File here |
|---|---|
| walk-steps-autoproof.txt | walk-j41-autoproof-44603961304.txt |
| walk-steps-rerun.txt | walk-j41-rerun-44604534795.txt |
| auto-verdict.json | auto-verdict-r141-292847c32.json |
| ci-suites-all.txt | ci-44598210725-suites.txt |
| ci-suites.txt | ci-suites-r141.txt |
| ci-jobs.txt | ci-44598210725-jobs.txt |
| batch-checks.txt | batch-checks-reader.txt |
| row.md, rules-works.md, j_41.ts, bugs-open.md (empty) | R1.41's row in `qa/CAPABILITIES.md` and `RULES.md` on main 292847c32; `prototype/studio/tests/journeys/j_41.ts` |
