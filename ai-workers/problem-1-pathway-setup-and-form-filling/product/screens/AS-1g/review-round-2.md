# AS-1g (R1.106) review, round 2: score grids as cited data on a release

Reviewer (independent; did not build it). PR #3478, branch `claude/runtime-as1g-score-grids`, head **aa29a40b6f7ea10a07a4bbeade42cd7622f0a80f**.
I read only the diff since round 1 (P-277): `git diff f383a1cfe aa29a40b6`, 10 files, +150/-49. Against main the PR is 794 + 5 = 799 changed lines.
I ran an isolated copy, `review2_as1g` on :4443. It is now stopped, with its database and files removed. Live AI was off (US$0).

**Verdict: Block.** Three Majors are open. All three can be fixed with 0 net lines, so the PR stays at 799.
Most round 1 findings are closed and their repros now fail as they should. Two fixes have new gaps: the replacement of an approved import (Major 1) and the cut-off words (Major 2). The breaker's M4 is only partly closed (Major 3).

## What I ran
* `tsx tests/check_as1g_score_grids.ts 4443 xr_studio_review2_as1g`: **44 passed, 0 failed**. That includes the new rev 16.7 migration block on a scratch database, and `migrate diff` reports "No difference detected".
* Probe scripts (scratchpad `r2/p1` to `p7`, not committed). They re-run every round 1 repro, then test replacement, size and word length.
* Headless Chromium on To review and `/review/change/:id` at 400, 1024 and 1440 px. axe WCAG 2.2 A/AA found nothing, there was no sideways scroll and no page error.

## Round 1 findings, checked again
| Finding | Repro now | Closed? |
|---|---|---|
| B1 / brk M1 (key locked after a return) | return → corrected import 201 (old one WITHDRAWN, "Replaced …"); withdraw WAITING 201; withdraw RETURNED 201 | yes |
| M1 / brk M2 (typo combination stuck APPROVED) | `["wp.famly"]`, `["fs.outside","nope"]` → 400 GRID_COMBINATION; `[" "]`, duplicate → 400 GRID_SHAPE | yes, but see Major 1 |
| brk M1 Repro B (3e9 fails at approval) | `maximum: 3e9` → 400 at import | yes |
| brk M3 (text versus number overlap) | `in ["30"]`+`gte 30`, `eq true`+`gte 0` → 400 "mix"; `eq "30"`+`eq 30`, `"true"`+`true` → 400 overlap | yes |
| brk M4 (in-list freezes the server) | 51 values → 400. But within the new bounds the server still freezes for 6 s | **partly**, Major 3 |
| brk M5 (forged citations) | `javascript:`, `data:`, `file:`, `http:`, 2026-13-45, 0000-00-00, 9999-12-31, 2026-02-29, U+200B, U+2061, U+202A, NUL, lone surrogate → 400. DB check: 2026-02-31, `http`, U+200B section → refused | yes (gaps in m2) |
| Review M2/M3 (migration test, drift) | scratch DB: before / its own / twice / after / `migrate diff` empty; indexes are in the schema | yes |
| Review M4 (guard regex) | `points >= 67`, `clb >= 7`, `maxPoints: 12`, `agePoints = 12`, `score: 470`, `threshold: 67` are each caught; the code tree is clean | yes |
| Review M5 / brk m5 (values not seen) | To review row shows each band, its points and its source | **only for small grids**, Major 2; the approval page itself still shows none (m3) |
| m1/brk m3 audit, m2 words, m7 published read, brk m4 sort | "1 row cited, 8 Sample"; "Import score grid"; "1 factor, 2 bands"; `distinct on` reads only `score_grids`; the sort happens before the hash | yes |

Left as is, and the reasons hold:
* Demo reset keeps the platform-wide rows. They are not a firm's rows, and the suite deletes its own.
* Each ruleset has its own conversion table. AS-1c brings the cited tables.
* The draft read is for display only. The release gate re-hashes, so a torn read cannot be released.
* The within-one-factor overlap question is with the tech lead.

## Findings (most severe first)

**Major 1 (new with the B1 fix): when an import replaces an approved one, the approved grid's record says WITHDRAWN while its values ship.**
* `api/src/library-score-grids.ts:27,185`: `REPLACED` includes APPROVED, and the propose step marks the approved change WITHDRAWN "Replaced by a later import …".
* But the approved grid's rows were already written at approval (`:212`), and they stay in the library until the replacement is approved.
* Probe `r2/p2`:
  * A is approved, and its rows are written.
  * B is proposed, so A becomes WITHDRAWN.
  * B is returned, then withdrawn.
  * The wp.family release then carries **A** ("r2.app added", signed, release 4), while A's change still reads "WITHDRAWN [Replaced by a later import …]".
* Result: a released grid with no RELEASED change behind it, and a record that says it never applied. If one of A's two combinations had already released it, A is also marked withdrawn.
* Fix (0 net lines):
  * At propose, replace only `RETURNED`.
  * In `apply`, on the `writeGrid` line, mark any other APPROVED change of the same key as replaced (`id: { not: c.id }`).
  * The M1 lock stays fixed, because propose no longer refuses an APPROVED change.

**Major 2 (M5/m5 not closed for a real grid): the words are cut at 6,000 characters, so the approver and the expert do not see most of a real grid. A changed line can come out empty.**
* `engine/score-grids.ts:40` cuts `gridWords` at 6,000 characters. Every band repeats its full source, so a cited band is about 250 characters, and about 24 bands fit.
* Probe `r2/p4`, a cited grid of 10 factors × 30 bands (smaller than CRS):
  * The To review row and `score_grid.words` stop inside factor_1. factor_9 is never named, and nothing says the text was cut.
  * A change of the last band, 10 → 7, is not visible on To review.
* Probe `r2/p5`, the same grid released, then 7 → 5:
  * The release line the expert signs reads exactly **"Probe cited grid, changed:"** and nothing else.
  * Cause: `engine/validate.ts:431` diffs the two cut texts, which are identical.
* Fix (0 net lines): drop `.slice(0, 6000)` in `gridWords`, so the diff compares whole factors. If a cap is wanted, apply it only after the diff (`validate.ts:431`) and say "… cut".

**Major 3 (breaker M4, partly closed): within the new bounds, one import still freezes the whole server for about 6 s, and every opening of it freezes it again.**
* The cap of 50 values per `in` list does not bound the pairwise check (`api/src/library-score-grids.ts:84,107-118`).
* Probe `r2/p3`: 70 factors × 200 bands × `in` lists of 50 values (4.7 MB, under the 5 MB limit).
  * Propose took 7.8 s, and `GET /session` from another user waited **6.0 s**.
  * The proposal is stored. `GET /library/changes/:id` runs the recheck again in **7.0 s** each time.
* Fix (0 net lines): add a `.refine` on the existing `Factor` zod line. Example: at most 1,000 listed values in a factor's bands, "a factor lists at most 1,000 values".

**Minor**
* m1. NUL still gets a server error.
  * A band's string value containing `\u0000` returns 500 "Something went wrong" (`library-score-grids.ts:67` checks the length only).
  * A NUL in the reason returns **404 "Not found (it may have been removed by a reset)"** (`:48`).
  * Fix (0 lines): add `!UNSTORABLE.test(x)` to `:67`, and use `said("reason", 300)` at `:48`.
* m2. Invisible quotes still get through, and the SQL check is looser than the API.
  * A quote made only of U+00AD (soft hyphen) or U+3164 (Hangul filler) is accepted (201).
  * `migration.sql:101` covers only U+200B–U+200F, U+2060 and U+FEFF. Called directly, the check accepts a U+2061 or U+202A quote and the date 0001-01-01, which the API refuses.
  * The DB, the last wall, is therefore stricter than round 1 but not "stricter" than the API.
* m3. The approval page `/review/change/:id` still shows only the label ("Import score grid: UI probe grid: 1 factor, 2 bands …", screenshot `r2/change.png`). The values appear only on the To review list row (`r2/queue.png`).
  * The web is outside the touch list. Record a "Question for the tech lead" in the PR.
* m4. A returned import can still be resubmitted unchanged with any reason (probe → 201 WAITING). Round 1 asked for this to be refused.
  * It is acceptable because a second person decides again. Say so in the PR.
* m5. Language rows are sorted before the checks, so "Language conversion row 2 … overlaps row 1" numbers the sorted rows, not the rows of the author's file (`library-score-grids.ts:46,122`).

## Journey test (reviewer role; API path and To review, no new screen per AG-03)
* J1 main path: propose → To review → approve → release with sign-off → pin. **Held** (suite, and probe p2).
* J2 wrong role: self-approval 403; user-R 403. **Held**.
* J3 bad input: uncited, overlap, mixed kinds, forged sources, bounds. **Held**, except a NUL gets a 500 (m1).
* J4 recovery: return → correct, or withdraw. **Held**. Replace an approved import, then return the replacement → false record (Major 1).
* J5 hand-over: To review → the approval page → the expert's release line. Values are cut or missing for a real-size grid (Major 2), and absent on the approval page (m3).
* J6 break: a large file freezes the server (Major 3).

| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | J1; 44/44 |
| Next step obvious | 1 | 409 now says "its proposer withdraws it, or a second person returns it" |
| Plain words | 1 | "Import score grid", plurals, values in words |
| Feedback and state | ½ | WITHDRAWN shown for a grid that ships (Major 1) |
| Correct data | ½ | release carries A under a withdrawn record (Major 1) |
| Error recovery | 1 | B1 and M1 paths now open (probe p1) |
| Accessibility and sizes | 1 | axe none, no sideways scroll at 400/1024/1440 on both pages |
| Speed | ½ | 6 s whole-server freeze (Major 3); normal calls < 1 s; approval of 12k cited rows 3.9 s |
| Visual quality | 1 | To review row readable (r2/queue.png) |
| Trust and sources | ½ | sources shown for small grids; a real grid's change reads "changed:" with nothing (Major 2) |

**Score: 8.0 / 10.** No criterion is at 0, so the score passes on its own, but the verdict is Block for the three open Majors.
Most valuable fixes, in order: Major 2 (trust), Major 1 (data and state), Major 3 (speed).

Not checked: CI on this head (the GitHub API refused the PR and check calls through the proxy); a real screen reader; a keyboard walk of the approval page.

**Verdict: Block** (fix Major 1, 2 and 3; each is 0 net lines)

Reviewer: Block aa29a40b6f7ea10a07a4bbeade42cd7622f0a80f
