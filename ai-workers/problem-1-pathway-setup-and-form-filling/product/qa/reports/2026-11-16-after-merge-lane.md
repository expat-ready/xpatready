# qa after-merge lane — Release 1 (P-626, P-640), 16 Nov to 08:00 IST 17 Nov

Lane: cloud qa copy, branch `claude/confident-allen-dt0td1`. Started 12:4x IST 16 Nov on the Lead's brief (Lead 66). Model Opus 5.5, high (P-608). Live AI off, US$0.
Loop: every 20 minutes read `git log origin/main` for new merges; when a merge completes a Release 1 row's parts (MVP-CHECKLIST "Parts"; qa/CAPABILITIES "Missing"), re-test that row at once (its checks + a short journey walk, fresh Opus reader verdict), one small verdict PR per row or pair. Bug ids from QA-500.

## Watch list (parts still open, read 12:4x IST on main b1161b4df)
| Row | Waiting on | Open PRs seen |
|---|---|---|
| R1.6 | PF-6m (#1945), PF-6r (#1951), PF-6 part 2a | #1945, #1951 open |
| R1.40 | J-38 (join and walk); FO-3w part 1 merged #1921 | no J-38 PR seen |
| R1.38 | J-38; FO-3st1 (staff calendar) | none seen |
| R1.28 | PF-19b part 2 (#1956, draft) | #1956 |
| R1.19 | PF-5 part 2 (#1959, draft), PF-5v part 2, PF-19p (#1961) | #1959, #1955, #1961 |
| R1.100 | PF-5t (#1957), PF-5 part 2 | #1957 |

Refined 16:1x IST from qa #1950's verdict table (open, stacked on #1929): R1.19 also waits on QA-481 (the code reaches no inbox) and the sign-up page PF-5s; R1.100 on QA-481 and PF-5t; R1.28 on withdraw (PF-19b part 2 #1956, FO-2 part 3). #1950's walk `check_qa_r1_platform_fo_walk.ts` (20/32, 12 FAILs = missing parts) is the check this lane re-runs for those rows once it is on main.

## Checks
| IST | main head | New merges | Row completed? | Action |
|---|---|---|---|---|
| 16 Nov 12:4x | b1161b4df | #1921 FO-3w part 1, #1933 FO-2v, #1919 PF-Le (+ records) | none: R1.40 still waits on J-38 | baseline |
| 16 Nov 13:0x | 3b08111de (07:16Z batch) | #1928, #1931 (qa records), #1935, #1940 (records); no app code | none | wait; #1945, #1951, #1956, #1957, #1959, #1961 still open |
| 16 Nov 13:2x | 3b08111de | none | none | wait |
| 16 Nov 13:5x | c0896290d | #1910 PF-12 database walls (map row 3, not a watched row), #1944 (records) | none | wait; PF-12 touches every table: regression left to its merge batch CI and gate B (brief: re-test only completed rows) |
| 16 Nov 14:1x | fd2dee855 | #1953 (qa records: R1.99 Works; R1.6, 27, 38, 40, 47, 49, 80 Partial), #1949 (tools) | none | wait |
| 16 Nov 14:3x | fd2dee855 | none | none | wait |
| 16 Nov 14:5x | 47b00ddae | #1936 (shaping batch 7), #1939 (Lead records); no app code | none | wait |
| 16 Nov 15:1x | 47b00ddae | none | none | wait |
| 16 Nov 15:4x | 47b00ddae | none | none | wait |
| 16 Nov 16:0x | 47b00ddae | none | none | wait. Queue: #1951 PF-6r in batch #1976; #1956, #1957, #1959 approved+queued; #1945, #1961 approved not queued. Duplicate note: qa #1968/#1967 (another qa session) already re-walk R1.38/R1.40 on FO-3w part 1; this lane takes those two only on J-38 or FO-3st1 merging |
| 16 Nov 16:2x | 47b00ddae | none | none | wait |
| 16 Nov 16:4x | 47b00ddae | none | none | wait; batch #1976 (PF-6r #1951 with 5 others) CI run 43848577574 still in shards (2 of 8 done) |
| 16 Nov 17:0x | 47b00ddae | none | none | wait |
