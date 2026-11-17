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
| 16 Nov 17:3x | 47b00ddae | none | none | wait; batch #1976 closed 11:54Z unmerged (#1952 lost its label, dequeued); PF-6r #1951 back in the queue — no main merge for 3 h |
| 16 Nov 17:5x | 47b00ddae | none | none | wait |
| 16 Nov 18:1x | 47b00ddae | none | none | wait |
| 16 Nov 18:4x | 39d4c831b | #1951 PF-6r, #1955 PF-5v part 1, #1952 PF-6f, #1962 FO-4sf; records #1943, #1954, #1929, #1967 | none: R1.6 still needs PF-6m #1945 (open, no approve), J-6 part 2 (CI-run suite) per its row; R1.19 still PF-5 part 2 #1959 (approve lost), PF-5s, QA-481; R1.100 PF-5t #1957 (approve lost) | wait. #1961 PF-19p dequeued; #1956 approved not queued |
| 16 Nov 19:0x | 39d4c831b | none | none | wait |
| 16 Nov 19:2x | 39d4c831b | none | none | wait |
| 16 Nov 19:5x | f255a85e8 | #1924 FO-7mv (To move list, not a watched row), #1958 (records) | none | wait |
| 16 Nov 20:1x | d66bcfd2d | #1983 (qa records), #1972 (shaping batch 8); no app code | none | wait |
| 16 Nov 20:4x | d66bcfd2d | none | none | wait |
| 16 Nov 21:0x | d66bcfd2d | none | none | wait |
| 16 Nov 21:2x | d66bcfd2d | none | none | wait |
| 16 Nov 21:3x | d66bcfd2d | (Lead 69 ask) FO-4sf #1962, PF-5v part 1 #1955 already on main | R1.27: parts missing FO-4b | QA-493 closed, QA-484 fixed on main (row in #1950), QA-501 new Minor; `2026-11-16-after-merge-r127-qa484/report.md` |
| 16 Nov 21:4x | f7dde02c8 | #1982 FO-3w part 2 (booker manage page; R1.42, QA-496) | none: R1.38/R1.40 still wait on J-38 (R1.38 also FO-3st1); QA-496 is the other qa session's (#1968) | wait; #2006 queued, deferred behind #1950 (conflict in CAPABILITIES.md) |
| 16 Nov 22:1x to 17 Nov 03:3x | f7dde02c8, then 50cb489bd | only #1988 (C4.11-G5 pack-2 flake fix, not watched) | none | wait; lines held while #2006 sat in the merge queue |
| 17 Nov 03:4x | bfac889d7 | #1945 PF-6m (R1.6 part), #1950 (qa records: QA-484 closed there), #2007, #1989, #1997, #1865 | R1.6: covered by qa #2010 (parts missing PF-6 part 2a/2b, J-6 part 2), not duplicated | #2006 dequeued (conflict with #1950 in CAPABILITIES.md): main merged in, R1.27 note kept on main's row |
| 17 Nov 03:5x | bfac889d7 | none | none | wait |
| 17 Nov 04:1x | 693369537 | #1998 PF-21s part 3, #2002 CS-C1b, #2025, #2028 (ports), #1999 (qa R1.4; took QA-500 too), #2015, #1990 (records) | none watched | #2006 merged with main again: this lane's FO-4sf finding renumbered QA-500 → QA-501 (#1999's QA-500 is R1.4's) |
| 17 Nov 04:3x to 06:3x | 693369537 | none (six checks) | none | #2006 waited in the records queue; merged 06:35 IST (QA-493 closed, R1.27 parts missing FO-4b, QA-501) |
| 17 Nov 06:4x | 6dcff65f5 | #2006 (this lane), #1968 (qa R1.38/R1.40 on the manage page), #2034 (QA-498 quarantine) | none | wait |
| 17 Nov 07:0x | bcc505afd | #1957 PF-5t part 1 (R1.100: new version asks again, acceptances shown), #2040 FO-6 part 2 (signing port), #2048 (qa records) | none: R1.100 still waits on QA-481 (the code reaches no inbox: PF-5v part 2 after PF-19p #1961, unmerged) | wait |
| 17 Nov 07:2x | bcc505afd | none | none | last check |

## Closing, 17 Nov 07:3x IST (lane stops at 08:00, P-626)
* **Whole rows proven by this lane: none.** No watched row had all its parts merged during the lane (P-606).
* **Done:** QA-493 closed (FO-4sf #1962; #2006); R1.27 parts missing FO-4b; QA-484 fixed on main (confirmed; row closed by #1950); **QA-501** new (Minor: the FO-4sf pack is not re-runnable on one database). Lead 69's ask answered on #2006.
* **What still blocks each watched row, on main bcc505afd:**
  * R1.6: PF-6 part 2a/2b, J-6 part 2 (qa #2010 holds the retest after PF-6m).
  * R1.40: J-38 (no PR seen). R1.38: J-38 and FO-3st1.
  * R1.28: PF-19b part 2 (#1956, dequeued) and FO-2 part 3 (withdraw).
  * R1.19: PF-5 part 2 (#1959), PF-5s (sign-up page), QA-481 (PF-5v part 2 after PF-19p #1961).
  * R1.100: QA-481 only (PF-5t part 1 #1957 merged 07:07 IST): retest when PF-5v part 2 lands.
* **For the next qa lane:** re-run `check_qa_r1_platform_fo_walk.ts` for R1.19/R1.100 when PF-19p and PF-5v part 2 merge; run FO-4sf's pack on fresh copies only until QA-501 is fixed.
