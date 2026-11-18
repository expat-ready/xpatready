# PF-F4 journey test (reviewer, 18 Nov 2026): not applicable; the test pack's coverage is scored instead

Commit 183238e06 (PR #2128). PF-F4 is pure runtime code: no screen, route, door or app change, and nothing to see at any port. **No journey can be walked**, so there is no persona walk, Playwright replay, axe check, screen-width check or data check underneath. In their place I scored `tests/check_pff4_file_type.ts` (54 checks) on ten coverage criteria (0, ½ or 1 each), with evidence from `review.md`.

| Criterion | Score | Evidence |
|---|---|---|
| Every acceptance line has a passing case | 1 | Real samples of all 7 types, exactly 25 MB and 10 MB, a PNG at an images-only door, and an 81 MP JPEG |
| Every acceptance line has a failing case | 1 | exe, HTML, SVG, docm/xlsm, ZIP, size + 1, bomb PNG/JPEG, PDF at an images-only door |
| Runs green from a clean checkout (CI) | 0 | `plain.zip` is gitignored, so line 78 throws ENOENT and exits 1 (B1) |
| A rule's test fails when the rule is removed | ½ | 8 of 21 mutations caught; 13 survive, including `#xx` decoding and the CD bounds (m1) |
| Hostile ZIP structures | ½ | Only one truncated ZIP and a fake-office ZIP; none for ZIP64, the entry cap, cdAt past the end, or the signature |
| Hostile JPEG/PNG/HEIC headers | ½ | SOF huge, SOF missing, AVIF; no fill-byte, C4-before-SOF or IHDR-missing case |
| Run time on hostile input | ½ | ZIP bomb timed (0.06 ms); no 25 MB PDF or JPEG timed (measured 1.8 s and 0.55 s, m2) |
| Name-correction rules | ½ | Double extension, path, markup and dotted names; no trailing dot, bidi, case-only or correct-name case (m3, m4) |
| Refusal wording (AG-9-2, "Nothing was stored.") | 1 | All 25 refusals checked; exact message for a narrowed door |
| Door narrowing and the empty door | 1 | Images-only door both ways; one-type door; `[]` throws |

**Score: 6.5/10, with one criterion at 0. Below the pass bar.** Most valuable fixes:
1. Build the ZIP in the test (0 → 1).
2. Make the `#xx` and CD-bounds tests genuine, and add one crafted ZIP per guard.
3. Time a 25 MB hostile PDF.
4. Add trailing-dot and correct-name cases.

Not testable here: an intended user's walk (D17 and D20 stay with the founder), a HEIC decode.
