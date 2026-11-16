# Night queue for the lane-starter routines (Lead 70, 22:1x IST 16 Nov; founder approved "Yes, 3 routines" at 22:1x)

Three hourly cloud routines ("lane starter 1-3", at :05, :25 and :45 UTC past each hour) read this file from branch `lead/2026-11-07-lead31`. Each run takes the **first row from the top** that passes all three tests, then builds it to a labelled PR:
1. **Gate:** every item in "After" is merged: a `#n` is a merged PR; a row id is merged when a merged PR's title contains that id (and that part) (the GitHub pulls API for this repository, `repos/<owner>/<name>/pulls/<n>` with owner/name from `git remote get-url origin`, shows `"merged": true`).
2. **Not taken:** no open PR title contains the row id, and no branch `claim/<row id>` exists (`git ls-remote origin "refs/heads/claim/*"`).
3. **Claimed:** `git push origin origin/main:refs/heads/claim/<row id>` succeeds. If it fails, someone else took the row: go to the next one.

Only the tech lead edits this file. Build Leads send rows to the Lead; the Lead adds them here at each check. Rows that a warm lane takes as its second brief are not listed here.

| Row id | Area | Brief (branch:path under product/design/) | After | Effort, breaker |
|---|---|---|---|---|
| FO-9b part 0 | runtime | main:lead-b-briefs/FO-9b.md (port only) | — | high, no |
| PF-21b part 1 | runtime | main:lead-b-briefs/PF-21b.md (port only) | — | high, no |
| PF-Fp part 1 | runtime | lead-b-front-office:lead-b-briefs/P-630-amendments.md PF-Fp row + tech-gate-platform-front-office-2026-11-14.md entry 17 (toPdf port, fake, Gotenberg adapter; the container line comes with PF-8) | — | high, yes; shared port: "Ready for Lead read" |
| AUD-4s part 1 | runtime | claude/build-lead-c-647b40:build-lead-c-briefs/AUD-4s-1.md (concept records, with a fresh challenger) | — | medium, no |
| CS-W3 part 0 | runtime | claude/build-lead-c-647b40:build-lead-c-briefs/CS-W3-0.md (records-only spike on a scratch copy) | — | medium, no |
| CS-S1 part 1 | runtime | claude/build-lead-c-647b40:build-lead-c-briefs/CS-S1-1.md | — ; **skip this row if #2002 (CS-C1b) is merged** (WIP P-623) | high, yes; schema: "Ready for Lead read" |
| FO-6 | runtime | lead-b-front-office:lead-b-briefs/FO-6.md | — | medium, no |
| PF-19e | runtime | lead-b-front-office:lead-b-briefs/PF-19e.md | #1956, #1961 | medium, no |
| AUD-1b | runtime | claude/build-lead-c-647b40:build-lead-c-briefs/AUD-1b.md | #2003 | high, yes (audit) |
| CS-DL1b | runtime | claude/build-lead-c-647b40:build-lead-c-briefs/CS-DL1b.md | #2000 | medium, no |
| AUD-1c part 1 | runtime | claude/build-lead-c-647b40:build-lead-c-briefs/AUD-1c-1.md (may run beside AUD-1b) | #2003 | high, yes; schema: "Ready for Lead read" |
| PF-6 part 2a | runtime | lead-b-front-office:lead-b-briefs/PF-6p2.md | #1945 | high, yes |
| PF-6m2 | runtime | lead-b-front-office:lead-b-briefs/PF-6m2.md | #1945 | high, yes |
| PF-4c part 1 | runtime | main:lead-b-briefs/PF-4c.md | #1945 | high, yes |
| PF-11 part 1 | runtime | main:lead-b-briefs/PF-11.md + the corrections in #1972 comment 6916991708 | #1959 | high, yes; migration: "Ready for Lead read" |
| FO-3a part 1b | runtime | main:lead-b-briefs/FO-3a.md + lead-b-front-office:lead-b-briefs/P-626-order.md A2 | #1918 | high, no |
| FO-3a part 2a | runtime | lead-b-front-office:lead-b-briefs/FO-3a2.md (may run beside 1b) | #1918 | high, no |
| FO-3vr | runtime | main:lead-b-briefs/FO-3vr.md | #1918, FO-3a part 1b | high, yes |
| FO-3st2 | runtime | main:lead-b-briefs/FO-3st2.md + lead-b-front-office:lead-b-briefs/P-626-order.md A3 | FO-3a part 1b | high, no |
| FO-3st3 | runtime | main:lead-b-briefs/FO-3st3.md + lead-b-front-office:lead-b-briefs/P-626-order.md A3 | FO-3a part 1b | high, no |
| FO-3v part 1 | runtime | main:lead-b-briefs/FO-3v.md | #1918, FO-3a part 1b, FO-3vr | high, no |
| FO-3c part 1 | runtime | main:lead-b-briefs/FO-3c.md + P-627-amendments.md FO-3c block; never beside FO-5b or FO-5p (skip while an open PR names either) | FO-3a part 1b | high, no |
| FO-5cr | runtime | lead-b-front-office:lead-b-briefs/P-626-order.md "New row FO-5cr" | FO-3a part 2a | high, no |
| PF-15 part 1 | runtime | main:lead-b-briefs/PF-15.md | #1997, PF-4c part 1 | high, yes |
| PF-19c part 1 | runtime | main:lead-b-briefs/PF-19c.md + P-630-amendments.md PF-19c block | #1956, #1961, PF-19e, PF-13 part 1 | high, no |
| PF-19ad | runtime | main:lead-b-briefs/PF-19ad.md | PF-19c part 1 | high, no |

Chains on shared files run one after another, never side by side (Build Lead A, rev 16.80): booking/service.ts: FO-3a part 1b → FO-3vr → FO-3v; the messages files: PF-19e → PF-13 part 1 → PF-19c → PF-19ad. Sources: Build Lead A rev 16.80 (1671fb76e), Build Lead C 93004803b, 22:2x IST 16 Nov.

Removed 22:3x (Lead 70): CS-V1-2. The CS-V1 lane (#2007) takes it warm after #2007 merges, once Build Lead C confirms the scope.
