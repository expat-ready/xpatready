# CS-W1 part 1 review (schema; platform firm id beside the text firm key on cases, stages and counters)

**Reviewed:** PR #2125, branch `claude/charming-wright-8rc7y7`, commit **`d59865563f8d263b472f68b636b0b80e2da73cf6`** against `origin/main` (merge base `15c75cd52`). Reviewer: Opus 5.5, independent. Brief: `design/briefs/CS-W1.md` (Part 1 and the points above it; part 2 items not judged). US$0, no model call.
**Copies:** `rv_csw1` on :4438 (runtime band, WAY-OF-WORKING), later a clean `git worktree` of `d59865563` served on :4438 by hand. All copies, scratch databases and the worktree are removed.
**Note on the tree.** The builder and breaker kept committing in this same checkout during the review (`959f07f4e`, `b07234275`, `ce64412fa`, then uncommitted edits). Anything I first ran on the shared tree was run again on a clean worktree of `d59865563`. The verdict is for `d59865563` only; later heads are not reviewed.

## Checks run on `d59865563` (clean worktree)

| Check | Result |
|---|---|
| `tests/check_csw1_firm_id.ts 4438 <db>` (DW1, DW2, DW5, DW7, DW9, DW10) | 39/39 (matches the builder's run) |
| `tests/check_prisma_schema.ts` | **7/8: "M fail" step red** (Major 1) |
| `check_pf12_walls`, `check_pf3_platform_schema`, `check_c617_stages_migration`, `check_a24_case_number_migration`, `check_csc1_close`, `check_css1_index` | 100, 75, 23, 28, 55, 53: all pass |
| The migration on loaded data: configured checkpoint + 10 API openings (both firms), CS-W1 removed using the header's own rollback, then `prisma migrate deploy` (one transaction, so the backfill fires the deferred `trg_case_stage_current` on every stage) | rollback text works; 11/11 cases, 15/15 stages, 2/2 counters filled |
| 5 `migrate deploy` runs at once on clones (the cluster-wide role block) | 5/5 applied, no "tuple concurrently updated" failure |
| Same, with the Sample firms absent at migrate time and present afterwards | 11/11 cases, 15/15 stages, 2/2 counters stay null (Minor 1) |
| Mutation: both `seedSampleFirmsAsDemo` lines removed from `demo.ts` | the suite still passes 39/39 (Minor 2) |
| Shared-tree runs (code may have been newer than d598): `check_a24_case_number_api`, `check_d1_reset_to_six`, `check_csc1_count`, `check_aud1a_insert_only`, `check_c10_1_configured`, `check_case_feed`, `check_pf25_web_address`, `check_fo3w_booking_browser`, `journeys/j_9`; `typecheck.mjs` (api) | 23, 25, 40, 41, 48, 39, 68, 67, 4: all pass; no new type error. The default-on seed broke none of these suites (it runs before `app.listen`, so `isolated.sh`'s start-up wait covers it) |

PR CI on `d59865563`: draft, so only the guards ran (`ci`, `packs`, `types`, `regression` were skipped); `module-cards` and `pr-rules` are red. The full CI has not run.

## Blocker
None.

## Major
1. **Must. The migration cannot be applied a second time to a database whose `public` schema was reset, so `check_prisma_schema.ts` is red.** `prisma/migrations/20261118090000_csw1_firm_id/migration.sql:69` is `CREATE SCHEMA IF NOT EXISTS case_lookup`, but `:79` is a plain `CREATE FUNCTION case_lookup.case_firm_id_of_key`. Prisma resets a shadow database (and `migrate reset` resets a dev database) by dropping `public` only, so the second apply stops with 42723 "function case_firm_id_of_key already exists". *Failing scenario:* `check_prisma_schema.ts` "M fail: a model added to the schema without its migration is caught" (`tests/check_prisma_schema.ts:100`) gets P3006 "Migration `20261118090000_csw1_firm_id` failed to apply cleanly to the shadow database". Reproduced by hand: migrate deploy, `drop schema public cascade; create schema public`, migrate deploy again. The brief's Done-when lists `check_prisma_schema.ts` as passing unchanged, and the PR body says it passes. *Fix:* `CREATE OR REPLACE FUNCTION` (the builder's `959f07f4e` does this; that commit is not reviewed here), plus a DW7 line that re-applies the migration after a `public`-only reset.

## Minor
1. **Should. On a database that keeps its data, rows written before the Sample firms exist are never filled.** `start.sh:13` migrates before `main.ts:235` seeds. Nothing re-runs the backfill (`migration.sql:115-117`) after a seed: not the start-up seed, not `demo.ts:442` or `:545`. `runtime_next_case_number`'s `ON CONFLICT` path updates only `next_value`. *Failing scenario (reproduced):* firms absent at migrate time, then present. 11/11 cases, 15/15 stages and 2/2 counters stay null, and a later case number leaves its counter null. `demo-update.yml` updates :4400 with "data kept, no reset". If the demo database had no Sample platform firms before the merge (I could not read the Mac's database; `demo-reset.ts` says "a firm that is not seeded is skipped"), the PR's "On the demo: … every case with its firm's id" is wrong there, and part 2's NOT NULL step would stop the demo update. *Fix:* fill the null rows after each seed, or record now in the brief/STATE that part 2 runs the same backfill before it refuses. The builder's `b07234275` adds a `case_firm_backfill()` after each seed (not reviewed).
2. **Should. Three of part 1's code lines have no test that fails when they are removed.** Removing `demo.ts:442` and `:545` still gives 39/39 (mutation run): DW5's copy already has both firms from the start-up seed (`tests/check_csw1_firm_id.ts:147,160`). `firms.ts:19-31` (`firmIdByKey`, `firmIdOfActor`, `forgetFirmIds`) is in the brief's part-1 build list but has no caller and no test. By hand, on a copy started with `PLATFORM_SAMPLE_SEED=off`, the load line does work: 0 → 2 firms, the case filled, and one `platform_bypass` line `platform.demo.reset` POST. *Fix:* one DW5 pass/fail pair on a copy started with `PLATFORM_SAMPLE_SEED=off`. One line for `firmIdByKey`: a known key gives its id, an unknown key gives null and is not cached.
3. **Should. DW1 is measured after every later migration** (`tests/check_csw1_firm_id.ts:55` runs them before the DW1 block at `:57`). The brief (rev 16.7) says right after this migration. It is the same today, because no migration is newer. But part 2's NOT NULL migration would throw on the suite's `ghost-firm` rows before DW1 is read. *Fix:* read DW1 before applying the later migrations.

## The builder's deviations, judged
1. **EXECUTE/USAGE to `xr_data`: accepted, and needed.** `asBypass` switches the role to `xr_staff_bypass`. That role does not inherit `xr_app` (PF-12 grants `xr_staff_bypass` to `xr_app`, not the reverse). Every suite and tool process also runs direct on the bypass role. A grant to `xr_app` alone would refuse every case insert there. Checked: as `xr_app`, `SET ROLE xr_staff_bypass`, the lookup returns the id. Correction to the PR body: `xr_data` has three members (also `xr_wall_reader`, which is BYPASSRLS anyway), and `xr_wall_reader` reaches `xr_case_lookup` through `xr_studio`. It gains nothing.
2. **`pg_temp` last: accepted.** As `xr_app`, a temporary table `platform_firm` holding the key 'evil' gives no result. `CREATE` and `CREATE OR REPLACE` in `case_lookup` are refused ("permission denied for schema"). Keys that are 100 kB long, non-English, have a trailing newline, or try `%`, NULL, case or injection all return nothing.
3. **No `ci.yml` line: accepted.** CI's suites start copies through `gate-b.mjs` → `isolated.sh`. `cloud-setup.sh` starts no API, and `container-entry.mjs` (production) does not use `start.sh`.
4. **Reuse of `platform.demo.reset`: accepted, pending Lead B's OK.** Every path into `wipe` and `loadConfigured` is `POST /api/demo/(load|reset|reset-to-six|checkpoints/finished-story)` or runs outside a request, so it matches the use's routes. The use's "why" still names the settings only. The PR also still needs Lead B's OK on the policy and the column grant on `platform_firm`, as the brief requires.
5. **Normalised Prisma default: accepted.** The M pass step shows 0 differences.

## Other points checked (no finding)
* **Write paths.** Case, stage and counter inserts run with no firm set. They come from case routes, `routes-data.ts`, the checkpoint, and the direct-process seeds. The only staff-session case routes (`features/case-close.ts`) insert none of the three tables. So the trigger's refusal when a session's firm differs from the key's firm (DW2) is reachable by no current path. The `BEFORE INSERT` trigger fires on the counter's `ON CONFLICT` path too, which is harmless today.
* **Backfill on data.** The backfill fires the deferred stage checks on every stage it updates. Stages are deleted only by the case cascade (`case_stage.combination` is Restrict), so data that passed those checks before passes them again (shown above).
* **Concurrency and safety.** The role block retries as PF-12's does. The definer function is SQL, STABLE, uses a schema-qualified table and returns one uuid (`platform_firm.key` is unique). Its owner owns no table and cannot log in (DW10).
* Production never seeds: `sample-seed.ts` refuses production, and reset and load refuse outside the demo workspace before `wipe` or the seed runs.

## Scores
D1 requirement fit 4 (part 1's list is built; Major 1 breaks a Done-when suite) · D2 data integrity 4 (mismatched firm ids refused on insert; Minor 1) · D3 5 · D4 n/a · D5 stability and recovery 3 (cannot be re-applied after a `public` reset) · D6 4 (the rollback in the header works as written) · D7 n/a · D8-D12 n/a (no screen changes) · D13 regression only: 5 · D14 n/a · D15 5 (a case opens in 0.2 s warm; the lookup is one index probe) · D16 testability 3 (Minor 2, 3) · D17, D20 simulated only · D18 4 · D19 n/a for part 1.
**BIC-01-BIC-20:** n/a. The row changes no case screen. As a regression check only, BIC-20 is Met (keyboard-only opening, 1024 px and 200 % zoom with no sideways scroll, axe 0). Evidence is in the journey report.
**Journey score (reviewer, the one score for this check): 9.5/10, pass** (`journey-test-reviewer-2026-11-18.md`).

## Could not check
The Mac's :4400 database (whether it holds the Sample platform firms; Minor 1's impact). The full PR CI (draft). A real screen reader. Later heads `959f07f4e` and after.

**Fix list (do not label `d59865563`):** Major 1. Minor 1-3 are recommended in the same round.

Verdict: Changes requested

## Round 2 (diff only, P-608): `d59865563..3ab906b8dab5cd6aacec19b998c0a6f137950ab9`

**Scope:** `git diff d59865563..3ab906b8d -- …/prototype/studio`, which touches `migration.sql`, `firms.ts`, `demo.ts`, `main.ts` and `check_csw1_firm_id.ts`. The checkout was clean at `3ab906b8d` and stayed at that head throughout. Copies: `rv_csw1`, `rv_csw1b`, `rv_csw1m` and `pf4` on :4438/:4439. All are stopped and their databases dropped. Every suite ran with `--tsconfig api/tsconfig.json`.

| Check on `3ab906b8d` | Result |
|---|---|
| `check_csw1_firm_id` | 47/47 |
| `check_prisma_schema` | 8/8: the shadow re-apply after a `public`-only reset now passes |
| By hand: migrate, `drop schema public cascade; create schema public`, migrate again; then the lookup as `xr_app` | applied; lookup works |
| `check_pf12_walls`, `check_pf3_platform_schema`, `check_c617_stages_migration`, `check_d1_reset_to_six`, `check_pf4_identity` | 100, 75, 23, 25, 119: all pass |
| Kept data: configured checkpoint + 10 openings; CS-W1 rolled back; Sample firms absent at migrate, present before the API restarts (`isolated.sh … restart`) | after migrate 11/11 cases and 15/15 stages null. After the start: 0 null, all ids match. The log line reads "filled … 28 case, stage and counter row(s)". The fill is one transaction, so the deferred stage checks held |
| The start-up fill with every case row locked by another session for 40 s | the start finished in 9 s; logged "could not fill … lock timeout"; the server serves; the demo reset afterwards gave 201 |

**Round-1 findings:**
* **Major 1: fixed.** `migration.sql` now uses `CREATE OR REPLACE FUNCTION case_lookup.case_firm_id_of_key`. `case_firm_backfill()` is in `public`, so a `public` reset drops it with everything else. `check_prisma_schema` is the failing-when-removed test.
* **Minor 1: fixed.** `case_firm_backfill()` is SECURITY INVOKER, has `search_path` pinned, and fills only rows that are empty and whose key now resolves. EXECUTE goes to `xr_data` only. It runs in three places:
  * in the migration;
  * at start, on the seed's own line in `main.ts`, through `fillCaseFirmIdsOnStart` (lock 5 s, statement 60 s, never stops the start);
  * in `demo.ts` after the seed (a failure is logged, never blocks).
  The test covers it at DW1 (0, then 3 rows once the firm exists, then 0 again) and at DW5 (a reset fills an empty case; the start-up fill does too).
* **Minor 2: fixed.** `firmIdByKey` and `firmIdOfActor` are tested as `xr_app` through Prisma, with pass and fail cases. The DW5 reset line now fails if the demo's seed+fill is removed: the other workspace's row is written past the triggers after start, so only the reset's fill can fill it. The `loadConfigured` call shares the same `seedSampleFirmsAsDemo` function, which that line tests.
* **Minor 3: not changed; deferral accepted.** No later migration exists today, and the builder records in the PR that part 2 moves the DW1 read.

**New in this diff, judged (no finding):**
* `GRANT USAGE ON SCHEMA public TO xr_case_lookup` gives no CREATE: DW10's "never on public" still passes.
* The demo seed now refuses production (`sampleSeedDecision`), on top of reset and load refusing outside the demo workspace.
* `fillCaseFirmIdsOnStart` runs on every start, production included. It only copies ids from real `platform_firm` rows, as the migration does. That is derived data, so I accept it.
* The reset's fill also fills empty rows of other workspaces. This writes no Sample row and deletes nothing, and the brief's rule is about deleting another workspace's cases, so I accept it.

**Minor (round 2), Should, not blocking:** `migration.sql`'s rollback header does not list `REVOKE USAGE ON SCHEMA public FROM xr_case_lookup` for the new grant. My rollback runs added it by hand. If it is left out, only a harmless USAGE grant remains. Add it to the rollback line when part 2 next touches this header, or now.

**Still open, outside the code:** Lead B's OK on the `platform_firm` policy, the column grant and the reuse of `platform.demo.reset`, as the brief requires. Green full CI on this head (the PR is still a draft).

**Journey score (round 2): 10/10, pass.** "Correct data" goes from ½ to 1: rows filled after a later seed (kept-data run above). Everything else as in round 1.

Verdict: Approve (head 3ab906b8dab5cd6aacec19b998c0a6f137950ab9)
