# Focus list — the R1 items a builder brief may name (P-733 (1), P-734 (2); row ENF-733)

Kept by the tech lead. One line per Release 1 item with no, one or two parts left: the item, the row ids a brief may name for it, the owning Lead, the parts left. A session start whose brief is for an R1 item or a build row that is not on this page is refused by `tools/focus-check.py` (run by `tools/lane-preflight.sh --hook`), with the reason and this file's path. Tooling, qa, records and Lead briefs are not checked. To let a lane start on another item, add its line here first (the nearest items come first, P-733 (1)); remove a line when its item is Proven.

Format the check reads: a table line starting with the item id (`R1.<n>`, several separated by commas), then the row ids separated by commas (`-` for none). A part with its own backlog row (PF-19b3, FO-13i2) is listed by that id too, and so is a parent row its brief opens with (CS-DL1, FO-5, PF-21). The other cells are for people.

Seeded 19 Nov from the two nearest-to-done lists: Lead B's lane order of 19 Nov 12:3x IST (sections A, B, C; `design/lead-b-briefs/` on branch `lead-b-front-office`) and Build Lead C's list of 19 Nov 12:5x IST ("Nothing left", "One part left", "Two parts left"; `design/` on branch `claude/build-lead-c-647b40`).

## No build part left (merge, then proof)
| Item | Rows a brief may name | Lead | Parts left |
|---|---|---|---|
| R1.4 | PF-12b | Lead B | none: #2029 merges, then qa walks (firm walls) |
| R1.80 | - | Build Lead C | none: #2235 merges, proof is automatic, qa walks (IRCC forms) |

## One part left
| Item | Rows a brief may name | Lead | Parts left |
|---|---|---|---|
| R1.109 | J-109 | Lead B | J-109 |
| R1.37 | J-37 | Lead B | J-37 |
| R1.48 | PF-19b, PF-19b3, J-48 | Lead B | PF-19b part 3, then J-48 |
| R1.41 | FO-3st2, J-41 | Lead B | FO-3st2 with J-41 |
| R1.30, R1.31 | FO-4 | Lead B | FO-4 part 2a with its J-test |
| R1.33 | FO-9a, J-33 | Lead B | FO-9a's phone part with J-33 |
| R1.19, R1.89 | PF-5s, J-19 | Lead B | PF-5s part 1 with J-19 |
| R1.28 | J-28 | Lead B | J-28 |
| R1.40 | J-38 | Lead B | J-38 (FO-3w parts 1 and 2 are on main) |
| R1.77 | J-77 | Build Lead C | J-77, after #2169 |
| R1.74 | CS-DL1, CS-DL1b, J-74 | Build Lead C | CS-DL1b with J-74, after #2000 |
| R1.67 | CS-D1t, J-67 | Build Lead C | CS-D1t with J-67 |

## Two parts left
| Item | Rows a brief may name | Lead | Parts left |
|---|---|---|---|
| R1.100 | PF-19e, PF-5v, J-100 | Lead B | PF-19e, then PF-5v part 2 with J-100 |
| R1.110 | FO-13i, FO-13i2, FO-13s, FO-13s1, J-110, QA-510 | Lead B | FO-13i part 2 (QA-510), then FO-13s part 1 with J-110 |
| R1.23 | PF-13 | Lead B | PF-13 part 1, then part 2 |
| R1.38 | FO-3st1, J-38, DEMO-LINK | Lead B | FO-3st1, then J-38 extended by its staff-zone step; DEMO-LINK (#2687, founder A245 and A258; reaches the booking page from :4400) fixes its Home target-size failure |
| R1.92 | PF-18a, PF-18s, PF-18np | Lead B | PF-18a part 2, then PF-18s (PF-18np first if it is not on main) |
| R1.53 | FO-5, FO-5b, FO-5s, J-53 | Lead B | FO-5b, then FO-5s with J-53 |
| R1.49 | QA-495, J-49 | Lead B | QA-495's remainder (case-side link emails: Build Lead C), then J-49 |
| R1.86 | PF-21, PF-21c, PF-21rs | Lead B | PF-21c, then PF-21rs |
| R1.8 | AUD-1m, J-8, PF-0a | Build Lead C | AUD-1m part 2a, then 2b with J-8 and PF-0a, after #2214 |
| R1.72 | FO-8, CS-K1, J-72 | Build Lead C | FO-8, then CS-K1 part 2 with J-72 |
| R1.10 | CS-V1, PF-28 | Build Lead C (PF-28: Lead B) | CS-V1 PR 3 and PF-28 |

## Track B (case side and client money; Lead B (Track B), P-785; founder A286/A287 22 Nov: one lane per open part)
| Item | Rows a brief may name | Lead | Parts left |
|---|---|---|---|
| R1.56, R1.60 | FO-7b, FO-7g, FO-7q, FO-7s1 | Lead B (Track B) | FO-7b part 1b (#2953), FO-7g parts 1w and 3, FO-7q, FO-7s1 |
| R1.57 | FO-7c | Lead B (Track B) | FO-7c parts 1-3 |
| R1.58 | FO-7ts, FO-7t | Lead B (Track B) | FO-7ts part 3 (#2368), FO-7t parts 1-3 |
| R1.65 | PF-F1 | Lead B (Track B) | PF-F1, PF-F1b, PF-F1c |
| R1.3 | CS-W2, CS-W3 | Lead B (Track B) | CS-W2 parts, CS-W3 parts 2-3, CS-W4 |
| R1.29 | FO-9b, FO-9s | Lead B (Track B) | FO-9b parts 1-2, FO-9s parts 2-3 |
| R1.93 | PF-17 | Lead B (Track B) | PF-17 parts 1-4 |
| R1.54, R1.61 | FO-6, J-61 | Lead B (Track B) | FO-6 parts 3+, FO-6d, J-61 |
| R1.55 | FO-5d | Lead B (Track B) | FO-5d part 1 |
| R1.105 | PF-5 | Lead B (Track B) | PF-5 part 4; AUD-2 and PF-11c blocked (AUD-5 done, #2197) |
| R1.85 | PF-21b, PF-21d | Lead B (Track B) | PF-21b parts 2-3, PF-21d, PF-21rs |
| R1.76 | CS-NT1 | Lead B (Track B) | CS-NT1 parts 1-3 (#2320), CS-NT1t |
