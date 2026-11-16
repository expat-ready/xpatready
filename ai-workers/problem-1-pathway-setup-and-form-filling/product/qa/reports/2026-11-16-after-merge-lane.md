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
