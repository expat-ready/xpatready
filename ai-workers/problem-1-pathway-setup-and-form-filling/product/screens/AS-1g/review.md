# AS-1g (R1.106) review, round 1: score grids as cited data on a release

Reviewer (independent; did not build it). PR #3478, branch `claude/runtime-as1g-score-grids`, head **f383a1cfedddcfa17244251d7dc5ee7bd4719ef2**.
Read: the BACKLOG row AS-1g with Amendment 6, the brief (build-lead-c-briefs/AS-1g.md), contract §1 rule 1, rows rev 16.7, the full diff (12 files).
Ran an isolated copy, `review_as1g` on :4441 (now stopped and dropped).

**Verdict: Block** (1 Blocker, 4 Major open). The core is sound: the write wall, the cited-or-Sample checks, snapshot freezing, the pin, the submit-vs-import race. The guarded-change lifecycle has dead ends, though, and two of the row's own tests are weaker than the row asks.

## What I ran
* `tsx tests/check_as1g_score_grids.ts 4441 xr_studio_review_as1g`: **31 passed, 0 failed**.
* `tests/check_bypass_uses.ts`: 52/0. `tests/check_pf12_walls.ts`: 110/0. The new tables and the bypass use do not break the walls.
* `prisma migrate diff` from the migrated copy to `prisma/schema`: `DROP INDEX "language_conversion_ruleset_id_idx"; DROP INDEX "score_band_factor_id_idx"`. Nothing else drifts.
* My own probes (scratch scripts, not committed): return/withdraw/resubmit, a typo combination key, a grid approved between submit and release approval, demo reset, and the To review screen in headless Chromium at 1440 px.

## Findings (most severe first)

**B1 Blocker: a waiting or returned grid import can never be withdrawn or replaced, so the grid's key locks for good.**
* `library-changes.ts:330-331`: `renaming` lists no `score_grid`, so `withdrawChange` refuses a WAITING or RETURNED grid with 409 "Only a new shared field, a rename …".
* `library-score-grids.ts:24,158-159`: `OPEN` includes RETURNED, so a corrected file for that key gets 409 "already waits on To review".
* Probe: propose, then return ("wrong values"), then propose the fixed file → 409. Withdraw → 409.
* The only move left is the generic `resubmitChange`. It sends back the identical rejected file with any 8-character reason: probe → 201, WAITING.
* A wrong value, once returned, cannot be corrected in the app. Choice (6) says "a fix is a new import through review", and this path makes that impossible.
* Fix: withdraw WAITING/RETURNED `score_grid` (nothing was applied) in the `renaming` set. Refuse its resubmit ("propose it again"), as the other file-like kinds do.

**M1 Major: an approved import whose combinations never release stays APPROVED forever and blocks every later import of that key.**
* `library-score-grids.ts:200-207` releases the change only when at least one named combination exists and all of them carry it. `propose` (`:151-163`) never checks that the combination keys exist, and choice (6) forbids withdrawing an approved import.
* Probe: `combinations: ["wp.famly"]` → approved. The grid rows are written platform-wide. The change stays APPROVED.
* The corrected file then gets 409 "is approved and waits for the next release of wp.family", which names the new file's combination, not the stuck one's. Withdraw → 409.
* The same lock happens when a named combination is retired, or one of two named combinations is never released.
* Fix: at propose and at approval, refuse combination keys that do not exist in the workspace. Let releaseScoreGrids treat a gone or retired combination as carried, or allow withdraw of an APPROVED grid that no release has carried yet.

**M2 Major: the migration test does not follow rows rev 16.7 (Amendment 6, an explicit line of the row).**
* `tests/check_as1g_score_grids.ts:59` only counts four constraints on a fully migrated database.
* It does none of these: apply the folders before, then this one, then measure, then the rest; the stamp check ("later than every one before it, unique"); a "does not apply twice" check; the `migrate diff` check that sibling suites use (e.g. `check_csnt1_notes.ts:46-60`).
* That missing diff check would have caught M3 below.

**M3 Major (part of M2): schema and migration drift.**
* `migration.sql:112-113` creates two indexes that `library-score-grids.prisma` does not declare (`@@index([factorId])`, `@@index([rulesetId])`).
* The next `prisma migrate dev` on this file generates DROP INDEX for both. AS-2e is the next row to touch this file, per the brief.

**M4 Major: the "no score number in code" guard misses the usual ways a pass mark gets hard-coded (choice 7).**
* `tests/check_as1g_score_grids.ts:144` matches only `<name>\s*[:=]\s*N` for exact names. I tested the regex:
  * Missed: `if (points >= 67)`, `if (total >= 67)`, `clb >= 7`, `maxPoints: 12`, `agePoints = 12`, `max_points: 12`, `minimumClb: 7`, `score: 470`, `threshold: 67`, `points ?? 67`.
  * Caught: `passMark = 67`, `PASS_MARK = 67`, `{ points: 6 }`, `clb: 7`, `CRS_MAX = 1200`.
* The failing case (`:149`) is a stand-in that is made to match the regex, so the guard does not fail on a realistic leak.
* Fix: match a name containing points/score/mark/clb/crs/fsw/threshold/cutoff (camelCase and snake_case) next to an assignment **or a comparison**. Add `if (points >= 67)` as the failing case.

**M5 Major: the second person and the immigration expert approve values they cannot see.**
* On To review (`/review/change/:id`, screenshot taken), the approver sees only "SET_SCORE_GRID score grid: … 1 factor, 1 bands, 0 language rows …" and "Key: probe.ui". No point value, no band, no `source_ref`, no Sample label.
* The release line (`engine/validate.ts:432`) says "<label>: N factors (imported file <sha>)", so the expert signs off on a hash.
* A forged `source_ref` (the breaker's case in the brief) or a wrong point value passes both checks. Only the raw API (`matches`) shows the file.
* Other file-like kinds give the reviewer a view (`changeView` `supplies`, `sets` …, `library-changes.ts:83`).
* Minimum fix within the row: a `score_grid` view in `changeView`, plus words in the release line: Sample or cited, and for "changed", which bands changed.
* If the To review page needs a web change outside the touch list, raise it as a "Question for the tech lead".

**Minor**
* m1 `library-score-grids.ts:165`: the audit line says "every row cited" when only the grid and factor rows are cited. Sample bands or language rows (the actual values) are not counted. This misstates AGENTS rule 4 in the audit trail.
* m2 Plain words (PRODUCT §4): the To review heading shows the raw code `SET_SCORE_GRID`, because `ACTION_WORD` has no entry for it (`library-changes.ts:41`). It also reads "1 bands" (`library-score-grids.ts:125`) and "1 factors" (`validate.ts:432`).
* m3 Demo reset leaves the platform-wide grid rows. The reset demo's wp.family then shows "Score grid added" and needs sign-off, with no library change or reason behind it. Probe: after reset, 1 row, draft carries `probe.race`, 0 changes. Re-importing gives 409 "already in the library". A suite that stops mid-way leaves this for the next suite on its shard.
* m4 Choice (3): the row's line says "two **factors** with overlapping bands for one fact". The build refuses overlap within one factor, which is the right reading for CRS (core and transferability read one fact), but it departs from the row's words. Record it with the row owner in the PR. Otherwise the rule is good: touching ranges pass, and set/range and missing-fact cases are handled.
* m5 Choice (2): the row's `language_conversion` has no ruleset. Tying it to a ruleset lets two grids map one test score to two different CLB levels, and nothing refuses that. Accept with a note, or check consistency across grids for the same test and skill.
* m6 The SQL `score_source_ref_ok` (`migration.sql:101`) does not require `section` to be non-empty, and its date regex accepts 2026-02-31. The API is stricter. The database is meant to be the last wall.
* m7 `engine/snapshot.ts:127`: the published view loads the whole snapshot JSON (492 kB on the demo) of every combination's release only to read `score_grids`. Select only that path.

Choices judged acceptable:
* (1) a `text[]` link, given the existence check in M1.
* (4) the bypass on the PF-15 pattern: the walls and bypass suites are green, and the app role gets permission denied.
* (5) the published view reads the latest release's grids: the published sha equals the release sha, and the in-release published-equals-frozen check still holds.
* The submit-then-import race is refused ("draft changed after it was submitted"), so no unsigned grid is released.

## Journey test (reviewer role; API path, no screen per AG-03)
I ran five journeys:
* **J1 main path** (author proposes, approver approves, author's release with the expert's sign-off, case pinned, release 2): held.
* **J2 wrong role**: author self-approval refused; reader cannot propose.
* **J3 bad input**: uncited, overlapping and stray-fact files refused, and nothing written.
* **J4 recovery**: return, then correct → dead end (B1). Typo combination → stuck (M1).
* **J5 hand-over to To review**: values not visible (M5).

| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | J1, all 31 suite lines |
| Next step obvious | ½ | the 409 after a return names no way out |
| Plain words | ½ | `SET_SCORE_GRID`, "1 bands" |
| Feedback and state | 1 | WAITING → APPROVED → RELEASED; refusals say "Nothing was proposed" |
| Correct data | 1 | counts, frozen release 1 = 10 points, release 2 = 9 points, pin on release 1 |
| Error recovery | 0 | B1, M1 |
| Accessibility and sizes | ½ | no new screen; To review renders at 1440 px with no page errors; no keyboard or axe pass done |
| Speed | 1 | every call under 1 s |
| Visual quality | ½ | raw code in the heading |
| Trust and sources | ½ | sources stored and frozen, but not shown to the approver or expert (M5) |

**Score: 6.5 / 10, fail** (below 8, and error recovery is 0).
Most valuable fixes: B1, M1 (recovery), then M5 (trust), then m2 (words).

Not checked: a real screen reader; keyboard and axe on To review; CI on this head (the GitHub API refused my calls through the proxy); the breaker's role (a separate seat).

Reviewer: Block f383a1cfedddcfa17244251d7dc5ee7bd4719ef2
