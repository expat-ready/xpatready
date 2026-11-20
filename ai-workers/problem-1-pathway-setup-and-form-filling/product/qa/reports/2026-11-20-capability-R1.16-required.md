# qa capability R1.16: re-score on main 24662257b after #2565 (QA-449 part 2), 20 Nov (cloud qa lane; Opus 5.5 medium; fresh Opus reader, ran nothing; US$0)

**Item:** R1.16 "Automated testing". The tech lead (Lead 4, series 3) asked at 22:2x IST, after #2565 (5b637a119) made `skeleton` a merge condition for product batches. Earlier score: `2026-11-20-capability-R1.16.md` (Partial on 90535a94e, held only by "a red suite blocks it" for skeleton).

**Verdict: the clause is met by configuration. Row stays Partial until skeleton is green on main's head 24662257b, twice (P-339).** Main's app code changed in 35 `prototype/` files since the two green dispatches on 90535a94e, and no skeleton run exists on a tree equal to main's `prototype/` tree. Dispatch asked in the PR comment. The fresh Opus reader gives **Partial, ~85%**, for the same reason, and found two holes qa had missed (QA-614 and Q4).

## "A red suite blocks it", against `.mergify.yml` on main
| Queue | Can it carry image paths? | Condition | Holds a red skeleton? |
|---|---|---|---|
| product (`.mergify.yml:168-203`) | yes: every PR with a non-pipeline file | `check-success = ci` and `or: [check-success = skeleton, -files ~= <image paths>]` (`:196-202`) | **yes**. A batch touching an image path needs `skeleton` success; skipped or missing is not success, so it waits or fails (fail-closed). |
| pipeline (`:207-223`) | no: every file must be a pipeline path (`.github/`, tools, rules) | ci only | n/a, except `.github/workflows/skeleton.yml` itself (on skeleton's path list; see Q2) |
| records, verdicts (`:153-167`, `:224-236`) | no: label `records`, records-only files | ci only | n/a |

**The guard regex matches skeleton's paths.** qa compared the `-files ~=` regex (`:202`) with the 18 `paths` globs in `skeleton.yml:24-41` over all 14,757 tracked files plus edge cases (`p5/a/b.ts`, `p2/sub/x.ts`, `studio/Dockerfile.bak`). Only one file differs: `.github/workflows/skeleton.yml`, which matches a glob but not the regex. It can only go through the pipeline queue, so it never reaches this rule.

**ci** stays required on every queue (unchanged; all shards, types and regression jobs run on the batch, `ci.yml`).

## Runs
| Run | What | Result | Tree = main's `prototype/`? |
|---|---|---|---|
| 44764131465, 44764145893 | dispatch on main 90535a94e (first score) | success | no (35 files changed since) |
| 44772876358 | batch, #2502 | success | no; #2502 did not merge |
| 44773332306 | batch, #2556 | success | no; #2556 did not merge |
| — | batch since #2565 merged (16:48Z) | none yet | — |

So 11 clean batch runs since #2517 (the Lead's count, P-717 (b)), none red. **No red batch has been seen held yet**: the rule is proven by reading, not by a held batch.

## Bugs: 0 Blocker · 0 Critical · 0 Major · 1 Minor new (QA-614); QA-449 closed (both parts fixed: #2517, #2565)
- **QA-449**: moved to `BUGS-CLOSED.md`.
- **QA-614** (Gap · Minor, found by the reader and checked by qa): skeleton's path list and the guard regex miss parts of the image. `studio/Dockerfile:40-41` copies all of `prototype/` and `official-sources/`. The app reads `official-sources/` at run time (`api/src/core.ts:19`), but it is on neither list. A change to it alone gets no container proof. The risk is low, because ci's suites read the same files from the checkout.
- Stale text: `skeleton.yml:12-16` still says "report-only".

## Questions for the Lead
1. **Please dispatch `skeleton` twice on main 24662257b** (Actions › skeleton › Run workflow; cloud lanes get 403, P-439). When both are green, qa moves R1.16 to Works with the run ids.
2. Minor, no row: a PR changing only `skeleton.yml` goes to the pipeline queue, where skeleton is not a merge condition (it still runs, report-only). A broken skeleton.yml could merge on ci alone, and the next product batch would then be held. Add `or: [check-success = skeleton, -files ~= ^\.github/workflows/skeleton\.yml$]` to the pipeline queue? Recommended: yes, it is one line and keeps the rule symmetrical.
3. The regex is kept in step with `skeleton.yml`'s `paths` by hand (comment at `:199`). A check like qa's comparison in `check-skeleton-scope.sh` would catch a drift. *Later · Scaffolding.*

4. **Merges outside Mergify skip skeleton.** The `main` ruleset requires only `ci` (`rules/branches/main`), and a merge outside a batch has happened before (#2533). So clause 1 holds only for merges that go through Mergify. Accept this (recommended: say so in WAY-OF-WORKING), or add skeleton to the ruleset. A ruleset check has no path guard, so a records PR would then need a skeleton status too.

## Could not test
- A red batch actually held: none seen (only runs on main's head or a seeded red batch would show it; qa does not seed batches).
- "An API error never reads green": no new evidence (rests on PF-7).
