# qa 2 — after-merge, 26 Nov (round 1)

Cloud qa lane (qa 2), Opus 5.5 medium (P-608, P-788). Main **791c6f82f** (app code = 220f82567's; #3800 changed guards only). Isolated copies only (never :4400), live AI off, US$0. Out of scope: qa 1b scores R1.10, R1.55, R1.96, R1.45, R1.24, R1.42 and R1.50.

## Verdict
**No row's last part has merged, so no new verdicts (P-606).** Every target PR is still open: #3675 (R1.87 AUD-3b), #3633 and #3692 (R1.57), #3418 (R1.112, approved, dequeued), #3681 (R1.60, dequeued) and #3733 (R1.34, dequeued). Every Partial part the Lead named has merged, and each was re-checked. Six rows go from Not built to Partial: R1.107, R1.34, R1.79, R1.111, R1.64 and R1.52. **No new bugs.** In every journey run, each red step is a step for a part that has not merged.

## How
Journeys were run with each file's own header line (isolated.sh start, then tsx, then stop), headless, one run each. `walk.mjs` cannot record in this cloud container: Playwright's ffmpeg is missing (`/opt/pw-browsers/ffmpeg-1013`), so every recorded walk crashes at `newPage`. That is a container limit, not an app fault. The recorded walk for each verdict belongs on GitHub's runners (walks.yml) once the row's last part merges.

## Rows
| Row | Was | Now | Merged since qa's last line | Run here (main 791c6f82f) | Parts missing |
|---|---|---|---|---|---|
| R1.87 | Partial | Partial | AUD-3 part 2 #3491, part 3 #3657, breach read #3660 | probe_r187: 10 PASS, 2 FAIL (the read's reason; POST support session 404) | AUD-3b (#3675) |
| R1.56 | Partial | Partial | FO-7w1 #3654, #3737 | j_56: 17 PASS, 1 FAIL (W9, R1.57's first step: no pay link) | FO-7c, FO-7s2 (#3633, #3692) |
| R1.58 | Partial | Partial | FO-7s3a part 1 #3658 | j_58: 22 PASS, 2 FAIL (W3 fail: move-to-case route 404; W5: no red row on Money › Trust) | move-to-case route (an unnamed FO-7t part), FO-7s3b |
| R1.85 | Partial | Partial | PF-21d part 2a #3583 | j_85: 18 PASS, 3 FAIL (W1, W2: no console Privacy page; W5: an approved DELETION erases nothing) | PF-21rs, PF-21d part 2b and later (#3713) |
| R1.107 | Not built | Partial | AS-2a #3663 | j_107: 1 PASS, 17 FAIL (no samples/provincial-streams/*.json; no client copy) | AS-2d1, AS-2d2, FO-15a, FO-15b, AS-2c, AS-2cs |
| R1.34 | Not built | Partial | PF-26 part 1 #3637 | no journey on main | PF-26 part 2 (#3733), PF-26s, CS-X1 parts 1-3 |
| R1.79 | Not built | Partial | PF-R1 #3291, CS-R1 part 1 #3642 | no journey on main | PF-R2fo (#3734), PF-R2cm, PF-R3 |
| R1.111 | Not built | Partial | FO-7r part 1 #3634 | no journey on main | FO-7r part 2 (#3753), FO-7s5 |
| R1.64 | Not built | Partial | PF-F2 part 1 #3277 | no journey on main (j_64 is in #3698) | PF-F2 part 1b (#3640, queued), part 2 (#3303), CS-D1 (#3698) |
| R1.52 | Not built | Partial | PF-19m #3653 | no journey on main | PF-19mc, PF-19mi, PF-19mx, PF-19ms, FO-11 |
| R1.57 | Not built | Not built | none | j_57 not on main (#3692) | FO-7c parts 2a-3 (#3633), FO-7s2 |
| R1.60 | Not built | Not built | none | none | FO-7b deposit on signing (#3681 part a1, part b) |
| R1.112 | Not built | Not built | none | none | FO-3v part 1 (#3418) |

## Notes
* j_56 W7 (the invoice issues with an INV- number and its PDF, labelled "part missing: FO-7b part 1b") is now green, so that label is out of date. The journey's author can relabel it. This is not a finding.
* j_58 W3 guesses the move-to-case route's name (`POST /trust/moves-to-case`). When that part is built, the journey has to follow the real route.

## Could not test
Recorded walks (no ffmpeg here). Headed walks and the screen sizes for these rows: none of them can be scored yet, so they wait for the verdict round.

## Questions for the Lead
None.

## Suggestions
* *Later · Scaffolding:* make `walk.mjs` fall back to trace and screenshots without video when ffmpeg is missing, so cloud qa copies can record a walk.
