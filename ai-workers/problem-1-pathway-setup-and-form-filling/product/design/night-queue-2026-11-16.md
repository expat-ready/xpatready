# Night queue for the lane-starter routines (Lead 70, 22:1x IST 16 Nov; founder approved "Yes, 3 routines" at 22:1x)

Three hourly cloud routines ("lane starter 1-3", at :05, :25 and :45 UTC past each hour) read this file from branch `lead/2026-11-07-lead31`. Each run takes the **first row from the top** that passes all three tests, then builds it to a labelled PR:
1. **Gate:** every PR in "After" is merged (the GitHub pulls API for this repository, `repos/<owner>/<name>/pulls/<n>` with owner/name from `git remote get-url origin`, shows `"merged": true`).
2. **Not taken:** no open PR title contains the row id, and no branch `claim/<row id>` exists (`git ls-remote origin "refs/heads/claim/*"`).
3. **Claimed:** `git push origin origin/main:refs/heads/claim/<row id>` succeeds. If it fails, someone else took the row: go to the next one.

Only the tech lead edits this file. Build Leads send rows to the Lead; the Lead adds them here at each check. Rows that a warm lane takes as its second brief are not listed here.

| Row id | Area | Brief (branch:path under product/design/) | After | Effort, breaker |
|---|---|---|---|---|
| FO-6 | runtime | lead-b-front-office:lead-b-briefs/FO-6.md | — | medium, no |
| PF-19e | runtime | lead-b-front-office:lead-b-briefs/PF-19e.md | #1956, #1961 | medium, no |
| AUD-1b | runtime | claude/build-lead-c-647b40:build-lead-c-briefs/AUD-1b.md | #2003 | high, yes (audit) |
| CS-DL1b | runtime | claude/build-lead-c-647b40:build-lead-c-briefs/CS-DL1b.md | #2000 | medium, no |
| CS-V1-2 | runtime | claude/build-lead-c-647b40:build-lead-c-briefs/CS-V1-2.md | #2007 | medium, no |
