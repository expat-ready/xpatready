# P785-2b (PR #2971): path-owners follow-up, review round 1

Reviewer: independent; I did not build this. This is a tooling change, so there was no screen to walk and no journey score.

- **Reviewed head:** `71d225edd3a579fca5aea382c61e0d36b869f0e4`, stacked on #2925 at `9ddd8bdd6`.
- **Its own change:** `git diff 9ddd8bdd6 71d225edd --stat` shows one file, `product/tools/check-mergify-scopes.sh` (+77 / −16).
- **Read for context:**
  - #2925's comment "Reviewer: Approve ae84336cc" (the five Minors this PR says it closes);
  - #2971's PR body;
  - #3006's `track-paths.txt` and `track-route.py` (branch `claude/cool-ride-4g42kx` at `85321bee4`).

## Runs (exit codes)

- `bash product/tools/check-mergify-scopes.sh`: `PASS  mergify scopes: 300 checks`, exit 0. No false refusals on today's tree.
- `python3 -I product/screens/B119/check-queue-rules.py`: `68 passed, 0 failed`, exit 0.

I ran every edit below on a throwaway copy of the script's Python body, one edit at a time. The harness is in my session scratch folder, and nothing was committed. Each row records whether the script still exits 0 (passes) or now exits 1.

| # | Rule gutted, or probe | Result |
|---|---|---|
| G1 | second-scope rule (`if twice:`) | exit 1 (rows for `check_pf*` in migrations and `check_fo1*` in case-side): caught |
| G2 | "wholly in its scope" | exit 1: caught |
| G3 | missing-scope rule (line 64) | **exit 0: not caught** |
| G4 | duplicate key (`if dup: raise`) | exit 1: caught |
| G5a | glob refusal **loop** (line 163, `if ambiguous(g)` → `False`) | **exit 0: not caught** |
| G5b | `ambiguous()` itself returns False | exit 1: caught |
| G6 | case-blind `re.I` | exit 1 (`check_FO3_x`, `check_Pf9_x`): caught |
| G7 | named feature file in a second scope | exit 1 (`clients.ts`): caught |
| G8–G10 | `track_copies`: the match, the prefix, the "/" root form | exit 1 each: caught |
| G11 | merge-key `flatten_mapping` removed | exit 1 (ConstructorError traceback, fails closed): caught |
| G12 | the one-source FAIL loop (lines 230–232), with #3006's list in place | **exit 0: not caught** (only `track_copies` is self-tested) |
| G14 | "names no area" (line 88) | **exit 0: not caught**. The same gutting on #2925's script (`9ddd8bdd6`) exits 1, through its `client money/x.tsx` row, which this PR removed |
| P1 | #3006's `track-paths.txt` in place | exit 1 on exactly lines 22, 29, 30, 31, 41, 42, 43 and 44, as the PR body says. Line 23 (`audit-*.ts`, a superset of `audit-firm-read.ts`) is correctly allowed |
| P2 | `features/visitor-visa-filings.ts` added to platform as well (it is case-side's) | **exit 0** |
| P3 | `features/field-drafts.ts` added to case-side as well (it is forms-engine's) | exit 1: caught |
| P4 | `features/audit-firm-read.ts` added to case-side as well (it is platform's) | **exit 0** |
| P5 | `web/src/modules/front-office/**` added to migrations | exit 1: caught |
| P6 | track lines `web/src/modules/platform/**/*` and `track-b !api/src/features/platform-*.ts` | **exit 0** |

## The five Minors from #2925

1. **Exceptions dropped from the second-scope rule: closed.** Both exceptions are gone (lines 78–80) and G1 proves the rule.
2. **`migrations` skipped; the feature-file rule refused no second scope: partly closed.**
   - `migrations` now counts.
   - A feature file named after an API file is refused in a second scope (G7).
   - But a feature file held by **name only** passes in two scopes (P2, P4; Minor 1 below). Examples: `visitor-visa-filings.ts`, `audit-firm-read.ts`, the case-side list.
3. **`FOLDERS` "known, no scope" entry and `_` folders: closed.**
   - `FOLDERS` can map a folder to `None`.
   - `_` folders are skipped, as `web/src/modules/README.md:23` defines them: "A folder starting with `_` is a fixture".
4. **Merge keys and stdout: closed.** Merge keys load, and the FAIL line is on stdout. One latent false refusal remains (Minor 2).
5. **Self-test covers every new rule: not closed** (Major 1).
   - The approve comment named four rules that could be gutted with the self-test green: second scope, wholly in its scope, missing scope, duplicate key.
   - Missing scope still can be (G3).
   - The PR's own "Done when" names the glob refusal, and its loop can be gutted too (G5a).
   - A rule #2925 did cover, "names no area", has lost its row (G14).

## The one-source rule against `track-route.py`

`track_copies` (lines 216–227) reads `track-paths.txt` the same way `track-route.py load()` does (its lines 43–59):

- the same `#` comment cut and whitespace split, with two parts per line;
- `prefix` lines update the prefix where they stand;
- `/<glob>` lines are relative to the repository root (`v[1:]`); the self-test row `track-b /…check_cs*` proves it;
- other lines get the prefix (G9 proves it);
- `scope:` lines are skipped as references.

Every raw line repeating a scope include is caught, whichever track it is on. Lines naming sub-folders of a scope (`api/src/front-office/sales/**`) and supersets (`audit-*.ts`) are allowed, as the rule says.

Two narrow differences (Minor 3):

- the match is on the exact text;
- `!` exceptions are skipped entirely, including a `!` line that is itself a copy of a scope pattern.

Dropping the 8 flagged lines changes no file's track: across all tracked files, the assignment is identical before and after. It does change the regex **text** `track-route.py` generates, so `.mergify.yml`'s two track conditions must be regenerated in the same change (Minor 5).

## Findings

### Blocker
None.

### Major

1. **Minor 5 is not closed: three rules can be gutted with the self-test green, one of them a regression from #2925.**
   - **Where:**
     - `check-mergify-scopes.sh:64` (missing scope): the self-test at :150 only asks whether the real file has `migrations`, never whether the rule fires.
     - `:163` (glob refusal loop): only `ambiguous()` is tested, at :155.
     - `:88` ("names no area"): #2925's loop over `_money/x.tsx` and `client money/x.tsx` was replaced at :134 by test-name rows only.
   - **Evidence:** G3, G5a and G14 each exit 0. G14 exits 1 on `9ddd8bdd6`.
   - **Why Major:** this PR exists to close Minor 5, and its "Done when" claims "exits 1 with any of the rules above gutted … glob refusal". That is not true today, and one existing guard lost its proof.
   - **Smallest fix:** three self-test rows.
     - Missing scope: move the `need` loop into `missing(src)` and assert that `missing({k: v for k, v in src.items() if k != "migrations"})` is non-empty.
     - Glob refusal: move the loop at :160–164 into `globs_bad(src, barrier)` and assert that it reports a scope copy with `…/client-money**` added.
     - Names no area: assert that `owners_bad(src, files + [ST + "web/src/modules/client money/x.tsx"])` contains "names no area".

### Minor

1. **A feature file held by name only can sit in two scopes.** At `check-mergify-scopes.sh:95–103` (and :78), the second-scope test runs only for files matching an `OWN` pattern or named after an API file in a scope.
   - Files listed by name and matching neither pass in two scopes (P2, P4): case-side's `visitor-visa-filings.ts`, `findings.ts`, `readiness.ts` …, platform's `audit-firm-read.ts`, forms-engine's `draft-contract.ts`.
   - The PR body promises "Every owned test and feature file sits in one scope only".
   - **Smallest fix:** in `owners_bad`, for every file under `tests/` or `api/src/features/` held by any scope, refuse when more than one scope holds it. I counted today's tree: 324 held files, none in two scopes, so the change adds no false refusal. Add P2 as a self-test row.
2. **A legitimate YAML merge override is refused as a duplicate key.** At `check-mergify-scopes.sh:28–33`, `flatten_mapping` runs before the duplicate count, so `y: {<<: *a, k: 2}` overriding `k: 1` is refused ("refused as duplicate: k"). `yaml.safe_load` gives `{'y': {'k': 2}}`.
   - `.mergify.yml` uses no anchors today, so this is latent and fails closed with a clear message.
   - **Smallest fix:** count duplicates among the node's own keys (skip the `tag:yaml.org,2002:merge` key) before flattening, and leave the flattening to `construct_mapping`.
3. **The one-source rule compares exact text and skips every `!` line.** At `check-mergify-scopes.sh:225–227`, `track-a web/src/modules/platform/**/*` matches the same files as the scope's `…/platform/**` and passes (P6). So does `track-b !api/src/features/platform-*.ts`, a second copy of a scope pattern, in exception form.
   - **Smallest fix:**
     - collapse a trailing `/**/*` to `/**` before the lookup;
     - check `!` lines the same way (the glob after `!` / `!/`), since `track-route.py` has no `!scope:` form;
     - or state both limits in the comment at :212–215.
4. **The real-file branch is untested and goes silent if the list moves.** At `check-mergify-scopes.sh:229–232`, gutting the FAIL loop passes with #3006's list in place (G12). If #3006's review moves or renames `track-paths.txt`, the rule turns off without a word.
   - **Smallest fix:**
     - when `product/tools/track-route.py` exists and `TP` does not, add a FAIL;
     - add one self-test row that runs the loop body on the demo list and expects two FAIL lines.
5. **The order plan in the PR body leaves out a regeneration.** The body says "then this PR, which deletes those 8 lines along with its guard". Dropping the 8 lines changes `track-route.py regex track-a|track-b`'s output text (measured: not equal). So `.mergify.yml`'s two generated conditions must change in the same PR. That makes the PR two more files and a `.mergify.yml` change (P-423 window). `test-spd-1.sh`, which catches the drift, is `continue-on-error`.
   - **Smallest fix:** say so in the body. Or let #3006 adopt `scope:` for those 8 lines before it merges, so this PR stays one file.
6. **Stale wording carried from #2925: "once #2445 lands".** At `check-mergify-scopes.sh:48` (and guards.yml:22, .mergify.yml:24), #2445 is now in main. **Smallest fix:** present tense at :48, since this PR already edits the file.

### Cross-PR risk (#2925 against #3006; for the Lead, not counted against this PR)

#3006 bakes the include patterns of `scope:platform`, `scope:money` and `scope:case-side` into fixed regexes in `.mergify.yml`'s queues `track-a` and `track-b` (`track-route.py regex`). #2925 changes those scopes. I measured with #3006's `track-route.py` over every tracked file:

- 21 files go from no track to `track-b` once regenerated: 14 case-side `api/src/features/*.ts` files (`clients.ts`, `findings.ts`, `readiness.ts`, `visitor-visa-filings.ts` …) and 7 `tests/check_fo7*`.
- #3006's current regexes no longer equal the regenerated ones, for either track.
- Whichever PR merges second must regenerate. If it does not, the drift check in `test-spd-1.sh` is `continue-on-error` (report-only, P-717 (b)), so main stays green with stale routing.
- Stale routing lowers no gate (the track queues keep product's conditions). It does break the track split: a PR with track-A files plus a case-side feature file goes to `track-a` instead of `product`.

**Smallest fix:** the Lead holds the order stated in #2971's body. The second of #2925 and #3006 runs `track-route.py regex` and pastes both conditions; the reviewer of that PR runs `python3 -I product/tools/track-route.py check` and requires exit 0, whatever the CI step's report-only status.

## Verdict

The one-source rule is correct for how `track-route.py` reads the list, and catches exactly #3006's 8 copies. Minors 1, 3 and 4 are closed. Minor 5 is not: three rules can still be gutted with the self-test green, one of them newly. All fixes are small self-test rows, so round 2 can be diff only.

To fix: Major 1. Minors 1–6 are recommended; Minor 1 is the rest of #2925's Minor 2.

Reviewer: Changes 71d225edd3a579fca5aea382c61e0d36b869f0e4
