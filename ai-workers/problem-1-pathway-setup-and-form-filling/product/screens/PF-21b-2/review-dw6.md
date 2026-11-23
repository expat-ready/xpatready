# PF-21b DW6 fix: migrate diff after every migration (reviewer, 22 Nov 2026)

**Reviewed:** commit 678d85fe982fbe78a30d4712d976358313440847 on branch `claude/runtime-pf21b-dw6-diff`. The diff is `git diff origin/main 678d85fe9`, a single file, `tests/check_pf21b_holds.ts`, +5/−1. `origin/main` is an ancestor of the commit.

**Problem:** DW6 applied migrations only up to `20261122180000_pf21b_legal_holds`. It then ran `prisma migrate diff` against the full schema. Any later row's tables therefore read as drift. That is why batch 45080999446, shard 11, failed on `fo_dup_merge`.

**The change:** after the "right after itself" checks, the test applies every migration later than `NEW` to `EMPTY`. Only then does it run the diff. The diff's label now says how many later migrations were applied.

## Checked
- **The shape checks still run right after this row's own migration.** On both `EMPTY` and `DEMO` they check: forced with no policy, the key for the Platform Owner only, five definers owned by xr_wall_reader, the demo firms untouched. The function-prefix check also runs first. These lines are unchanged; the new loop comes after them.
- **`DEMO` is not used for the diff.** The config datasource is still `urlOf(EMPTY)`. `DEMO` gets nothing beyond `NEW`.
- **The later-migration filter mirrors the existing `before` filter.** `later = all.filter((d) => d > NEW)` applies the folders in sorted name order, as Prisma does.
- **A later migration that fails is loud.** `psqlFile` runs with `ON_ERROR_STOP=1`, throws, and the outer `catch` counts it as a FAIL.
- **Nothing else in the test changes.** No other file is touched, so no other suite can be affected.

## Runs (detached worktrees, removed afterwards; scratch databases dropped)
- **On 678d85fe9 (main plus the fix):** 67 passed, 0 failed, exit 0. The label reads "then the 0 after it".
- **With #3042 (`claude/serene-hopper-xuvdzf` @ 4a36e3e92) merged locally:** 67 passed, 0 failed, exit 0, with 1 later migration applied (`20261123010000_fo9b_person_merge`). I ran the new test once per setup, not twice.
- **The old test in the same merged tree:** 66 passed, 1 failed. The failure is exactly the diff: "Added enums FoDupKind / Added tables fo_dup_merge / Changed fo_arrival_receipt…". So the fix closes the failure the batch hit.

**Findings:** none.

Verdict: Approve 678d85fe982fbe78a30d4712d976358313440847
