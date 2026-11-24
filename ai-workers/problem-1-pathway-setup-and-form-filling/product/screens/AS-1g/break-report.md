# AS-1g break report, round 1: score grids as cited data on a release

PR #3478 · branch `claude/runtime-as1g-score-grids` · head f383a1cfedddcfa17244251d7dc5ee7bd4719ef2 · copy `break_as1g` on :4442 (db xr_studio_break_as1g, stopped afterwards; nothing edited or pushed). The suite passed 31/31 first. Attack scripts were kept outside the repository. Paths are relative to `prototype/studio/`.

**Breaker: Changes f383a1cfedddcfa17244251d7dc5ee7bd4719ef2** (5 Major, 8 Minor, no Blocker)

## Major

**M1. Once an import is returned or cannot be applied, that grid key is locked for good.** The guarded change has no way back.
- Repro A: propose grid K, then `POST /library/changes/<id>/return` as user-B. After that:
  - `POST .../withdraw` as user-A gives 409 "Only a new shared field, a rename …";
  - proposing a corrected file for K gives 409 "already waits on To review";
  - `resubmit` only puts back the same rejected file (it waits again and can be approved as it is).
- Repro B: an import that passes every import check fails at approval and goes back to WAITING. Two examples:
  - `maximum: 3000000000` (zod `int()` allows it, the INTEGER column does not) gives 409 "the database refused it". To review's recheck still says "nothing blocks it".
  - a band value `1e999`: see m1.
  Its only exit is Return, which is Repro A.
- Cause: `api/src/library-changes.ts:330-331` (`score_grid` is not withdrawable at any status), and `OPEN` includes RETURNED (`api/src/library-score-grids.ts:24, 158-159`). The words at `:173` and `:175` ("Return it; the author imports the file again") describe a path that does not exist. One typo in `express_entry.crs` would lock that key with no way out in the app.

**M2. A grid can name combinations that do not exist, and then stays APPROVED for ever.**
- Repro: propose with `combinations: ["no.such"]` (also accepted: `[" "]`, `["no.such","no.such"]`), then approve. It stays APPROVED after release 4 of wp.family.
- A corrected import of that key gives 409 "approved and waits for the next release of **wp.family**". The message names the new file's combinations, not those of the change that is stuck.
- Cause: `releaseScoreGrids` needs `combos.length > 0` (`api/src/library-score-grids.ts:200-201`); the message is built at `:159`; nothing checks that a named combination exists. Same lock as M1.

**M3. The overlap check lets through bands that the condition language would both match for one answer.**
- Accepted (201): `in ["30"]` with `gte 30`; `eq "30"` with `eq 30`; `eq true` with `gte 0`.
- `contracts/rules.ts:122` `cmp` falls back to comparing as text. With it, `evaluate(in ["30"])` and `evaluate(gte 30)` are both true for the answer "30", and `eq true` and `gte 0` are both true for `true`.
- Cause: `meets()` lets only number values meet a range (`api/src/library-score-grids.ts:76`). One answer gets two point values, which is exactly what the README says is refused.

**M4. A large `in` list freezes the whole server; the request still gets stored, and every To review view freezes it again.**
- The pairwise `some(includes)` check (`api/src/library-score-grids.ts:75, 104`) is O(n²) and runs on the event loop:

  | Two `in` lists of | Body | Server frozen |
  |---|---|---|
  | 20k values each | 224 KB | 0.8 s |
  | 60k values each | 712 KB | 5.1 s (`GET /session` waited 4.7 s) |
  | 150k values each | 1.0 MB | 29.4 s, then the client saw ECONNRESET |

- The 150k proposal was stored anyway (WAITING). `GET /library/changes/<id>` re-runs the check through `recheck` and took 5.2 s for the 60k proposal. The `in` values have no upper limit; the body limit is 5 MB.

**M5. Forged citations pass both the import and the SQL check, and land in the tables.**
- Proposed, approved and stored in `score_ruleset.source_ref`:
  - `date: "2026-13-45"`, also `"0000-00-00"` and `"9999-12-31"`;
  - `quote: "​"` (an invisible quote);
  - `url: "javascript:alert(document.cookie)"`, also `data:`, `file:///etc/passwd` and plain `http://evil.example/`.
- Cause:
  - zod checks only the date's shape and uses JS `trim()`, which keeps U+200B (`api/src/library-score-grids.ts:29`);
  - `z.string().url()` accepts any scheme;
  - `score_source_ref_ok` in the migration checks the date by regex, trims spaces only (`btrim`), and does not require a non-empty `section` (an empty section only loads as the table's owner).
- This breaks AGENTS rule 4 ("cited with page, quote and date").

## Minor

- **m1. A band value is changed without notice.** `eq`/`in` value `1e999` passes (`typeof` number; only comparisons test `isFinite`, `:58` vs `:62`). The stored proposal holds `"value": null` (seen in `matches`), and approval then fails "no longer passes the grid checks" (leads to M1).
- **m2. NUL gives a 500.** A NUL character in a quote, or in a band's string value, returns 500 "Something went wrong", not a plain 400 (JSONB refuses `\u0000` in `libraryChange.create`).
- **m3. The audit line is false.** It says "every row cited" when every band and language row is Sample. Repro: grid and factor cited, band and conversion "Sample"; the proposal's audit summary reads "(sha256 …; every row cited)". `:165` checks only the grid and its factors.
- **m4. `sha256` in the snapshot is not the hash of what the snapshot carries.** Language rows are re-sorted by test, skill and lowest score (`engine/score-grids.ts:238`), but `sha256` is the file's. Repro: rows given as [5-9, 0-4.5] are carried as [0, 5] under the file's sha `63316d2d49dc`. The same rows in a different order import as a new "changed" grid with identical content.
- **m5. The review line for a changed grid does not say what changed.** It reads "Break grid: 1 factors (imported file …)" (`engine/validate.ts:432`), so the expert signs a 10 → 9 point change without seeing 10 or 9. "1 factors" is also wrong grammar.
- **m6. Confusing words for Infinity in a language row.** `score_max: 1e999` is refused with "expected number, received number".
- **m7. Possible torn read (from reading the code, not reproduced).** The draft `buildSnapshots` reads `score_ruleset`, then factors, bands and conversions as separate queries outside a transaction (Prisma 7 without relationJoins; `engine/snapshot.ts:125`). An approval's delete and re-create between those queries would show a grid with its old sha and 0 factors on the draft view or at Submit. The release gate's re-hash would refuse such a release, so this affects only the display.
- **m8. The recheck shown before approval is wrong for imports the database will refuse.** It says "Checked again just now: nothing blocks it." for the 3e9 import that the approval then fails (M1 Repro B).

## What held

- **Write wall on the four tables.** As xr_app, INSERT, UPDATE, DELETE and TRUNCATE are denied. xr_data has no TRIGGER or REFERENCES grant, the tables have no row security to get around, xr_app has no CREATE on `public`, and `score_source_ref_ok` is owned by xr_studio. No route other than approve writes the tables.
- **Citation shape refused:** an extra key, `"sample"`, `"SAMPLE"`, a missing section, null, an array, an empty, blank or NBSP-only quote, and a quote over 2,000 characters. Sample together with a source cannot be expressed in the file, and the DB check refuses it.
- **Races.** 12 parallel proposals of one key: one 201, eleven 409, one row. Three approvals and one return at once: one 201, three 409, the grid written once, status APPROVED. An approval racing the release of wp.family: the release froze only the reviewed grid (brk.ov, now RELEASED); the new grid stayed APPROVED and shows as "added" on the next draft.
- **Overlap shapes handled correctly:** open and closed ends (gt/lte touching is allowed; gte/lte meeting at 30 is refused), -0 against 0, 30.0000000000000001, bands on two different facts, `and` over two facts, `or`, nested `and`, `neq`, empty `in`, object values, `eq null`, a field given as an array, two upper ends. Infinity in `gte` and in language rows is refused.
- **Roles:** user-B, C, O and P cannot propose (403); an unknown or missing `x-actor` gets 401; the client and the officer cannot list (403); the proposer cannot approve their own import.
- **Release:** a pinned case keeps release 1's grid (suite), and a grid that is no longer carried gets a "removed" line.
- **Budgets:** a maximum grid (100 factors × 200 bands): propose 0.8 s, approve 4.7 s, draft config 162 → 295 ms (474 KB → 2.3 MB), combination page 280 → 499 ms.

## Notes outside this item

- xr_app can UPDATE `config_release.snapshot` and `library_change.matches` (tested in a transaction that was rolled back). So the frozen copy of a grid, and a grid waiting for approval, are not behind this PR's wall.
- xr_app can `SET ROLE xr_staff_bypass` directly, which is the PF-15 design.
- The UI checks (keyboard, 1024 px, 200 % zoom, reload and back) do not apply: AS-1g has no authoring screen (AG-03).
