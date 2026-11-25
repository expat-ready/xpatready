# qa 7 after-merge proof: R1.33 Phone numbers (20 Nov 2026, ~03:2x IST)

Verdict: **Partial** on main a70aa2c36 (its last part FO-9a phone #2268, J-33 inside, merged 03:00 IST at 7aa9b3b84; app code identical). Held by **QA-526** (Gap · Major: only the staff edit route uses the exact libphonenumber normaliser; the FO person port uses a looser one; the FO-2 doors and booking keep a trunk 0 and store any + with 7-15 digits as readable). New: QA-527 (Ambiguity · Minor, for the tech lead: R1.33's "refused on the field" against AG-2-84 rule 5), QA-528 (Gap · Minor, J-33 has no duplicates step). Also in this change: QA-519 re-seen in batch #2386 (passed on retry); the duplicate QA-164 rows in BUGS-CLOSED.md merged into one, every fact kept. Live AI off, US$0, no priced button, no demo; nothing run locally: both walks ran on GitHub's runners (the automatic item-proof, and an independent re-run started by the tech lead, Lead 98). Reader: a fresh Opus 5.5 at high effort, ran nothing (P-303). No open finding named R1.33 before this (the reader's `bugs-open.md` was empty).

## Files
| File | What it is |
|---|---|
| reader-verdict.md | the fresh reader's verdict |
| auto-verdict-r133-7aa9b3b84.json | item-proof's machine verdict (branch `auto-verdicts`) |
| walk-j33-autoproof-44619429206.txt | J-33 steps in the automatic proof, job 135897157513, on 7aa9b3b84 |
| walk-j33-rerun-44619936002.txt | J-33 independent re-run on main a70aa2c36, job 135898927378 |
| ci-44613682025-suites.txt | every suite line of merge batch draft #2386 (head 9ac8b4da0) |
| ci-44613682025-jobs.txt | that run's non-skipped jobs and conclusions |
| ci-suites-r133.txt | its front-office lines, as given to the reader |
| batch-checks.txt | run identities and jobs read from the GitHub API, and the tree evidence |
| batch-checks-reader.txt | the short version the reader was given |

## Names the reader used → file here
| Reader's name | File here |
|---|---|
| walk-steps-autoproof.txt | walk-j33-autoproof-44619429206.txt |
| walk-steps-rerun.txt | walk-j33-rerun-44619936002.txt |
| auto-verdict.json | auto-verdict-r133-7aa9b3b84.json |
| ci-suites-all.txt | ci-44613682025-suites.txt |
| ci-suites.txt | ci-suites-r133.txt |
| ci-jobs.txt | ci-44613682025-jobs.txt |
| batch-checks.txt | batch-checks-reader.txt |
| row.md, rules-works.md, j_33.ts, bugs-open.md (empty) | R1.33's row in `qa/CAPABILITIES.md` and `RULES.md` on main a70aa2c36; `prototype/studio/tests/journeys/j_33.ts` |
