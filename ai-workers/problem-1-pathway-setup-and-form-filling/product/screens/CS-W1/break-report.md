# CS-W1 part 1: break report

PR #2125, branch `claude/charming-wright-8rc7y7`, commit d59865563f8d263b472f68b636b0b80e2da73cf6 (main 15c75cd52 unchanged since; no newer migration on main). Scope: part 1 only, from the brief's "Reviewer and breaker" paragraph (`design/briefs/CS-W1.md`). Part 2 (NOT NULL, update guards, the identity switch) is out of scope. Copies used: `br_csw1` :4498, `br_csw1_m2` :4497, `br_csw1_off` :4496. Scratch databases: `xr_studio_br_csw1_m1`, `_c1`-`_c3`. All of them are stopped or dropped. I did not touch :4400 or `xr_studio_demo`. No AI calls, no code changed.

## Findings

**M1 (Major): an existing database never gets its cases filled. The migration's backfill runs before the Sample firms exist, and nothing fills them later.**
* Steps: (1) `xr_studio_br_csw1_m2` holds every migration before `20261118090000` and its rows in `_prisma_migrations`. It has cases, stages and counters keyed `sample-firm`, `sample-solo` and `ghost-firm`, and `platform_firm` is empty, as on main where `PLATFORM_SAMPLE_SEED` is off by default. (2) `zsh tools/isolated.sh br_csw1_m2 4497 restart` runs `migrate deploy`, then starts the API with the seed on, which is the repository's new setting.
* Expected: both Sample firms exist, and every case, stage and counter of their keys carries the firm id (DW5's "every case filled"; part 1 must have "run on every path (demo, …)" before part 2).
* Actual: `platform_firm` holds `sample-firm` and `sample-solo`. Every `runtime_case`, `case_stage` and `firm_case_counter` row still has `firm_id` null, and nothing ever fills them:
  * the backfill (`migration.sql:115-117`) ran while no firm existed;
  * the triggers fire `BEFORE INSERT` only;
  * `seedSampleFirms` does not backfill;
  * the demo reset only deletes and recreates the rows of the demo workspace.
* The ordering is fixed. `start.sh:13` migrates before the API seeds (`start.sh:16-17`, `main.ts:235`), and `isolated.sh restart` does the same.
* Why it matters:
  * `.github/workflows/demo-update.yml` moves :4400 to the new main "data kept (migrations applied, no reset)", so the demo's existing cases, counters included, stay unfilled for good.
  * Part 2's planned remedy, "run the Sample seed, then migrate again", fills nothing.
  * DW5 tests only a fresh copy (`tests/check_csw1_firm_id.ts:140-150`), so it misses this case.

**m1 (Minor): the two new seed calls in `demo.ts` ignore the seed setting and the production refusal.** `seedSampleFirmsAsDemo` (`api/src/demo.ts:35-36`, called at `:442` and `:545`) calls `seedSampleFirms` directly, not through `sampleSeedDecision` (`platform/identity/sample-seed.ts:15-22`).
* Steps: start `br_csw1_off` with `PLATFORM_SAMPLE_SEED=off`; `platform_firm` has 0 rows. Run `POST /api/demo/load {"sample":"configured"}` as user-A. Both Sample firms are created.
* Effects:
  * `isolated.sh`'s comment "an argument PLATFORM_SAMPLE_SEED=off still wins" holds at start-up only.
  * With `PLATFORM_ENVIRONMENT=production` and `STUDIO_WORKSPACE_KEY` unset (default `demo`, and `deploy/RUNBOOK-secrets.md` does not list it), any author's demo reset or load would write Sample firms and staff. The brief says "Production would then carry no Sample rows (P-571 (2))".
* Severity: raise it to Major if production runs with the demo workspace key.

**m2 (Minor): "part 1 never refuses" fails while a session firm is set.**
* As xr_app with `app.firm_id` set to sample-firm's id, inserting a case keyed `ghost-firm` (no platform firm) is refused: `case_firm_from_key: the firm id given is not the platform firm of key "ghost-firm"`. The column default fills the session firm, then the trigger compares it with the lookup's null (`migration.sql:88-92`).
* I found no API route that opens a case or a counter under a firm session today, because `/api/runtime/cases` runs with no firm. A future keyed route or job would hit it.

**m3 (Minor): `firmIdByKey` and `firmIdOfActor` (`api/src/firms.ts:17-30`) are built but no suite exercises them, and nothing calls them yet.**
* I called them as xr_app on :4498. They returned the right ids for user-O, user-S and user-R, and null for user-A, user-P, `SAMPLE-FIRM`, `''`, a 100 kB key and an injected quote.
* The per-process cache is cleared only by the demo reset. A Sample firm deleted and re-seeded with a new id by any other path keeps serving the old id.

**Note (not a finding):** DW2's fail case "a session in firm A opening a case keyed to firm B is refused" holds only when `firm_id` is left out. An explicit `firm_id` naming B, or an explicit `NULL`, with key B under a firm-A session is accepted. Part 1 puts no wall on case tables (CS-W2), so this is about the test's wording only.

**Part 2's (expected to pass today):**
* As xr_app, `UPDATE runtime_case SET firm_id = <other firm>` succeeds.
* So does `INSERT … ON CONFLICT (id) DO UPDATE SET firm_id = <other firm>` (the insert trigger does not see the update branch).

## What held

* **Suites on this head:**
  * `check_csw1_firm_id.ts` 39/39 (on :4498);
  * `check_a24_case_number_api.ts` 23/23;
  * `check_pf12_walls.ts` 100/100 (with `--tsconfig api/tsconfig.json`);
  * `check_c617_stages_migration.ts` 23/23;
  * `check_prisma_schema.ts` 8/8 (`migrate diff` empty);
  * `check_d1_reset_to_six.ts` 25/25;
  * `check_csc1_close.ts` 55/55.
* **Cases opened in parallel, two firms, through the API:** 20 user-O and 20 user-S openings at once all returned 201. Numbers stayed gap-free and separate per firm (sample-firm 1-49, sample-solo 1-21, distinct = count). No case, stage or counter had the wrong `firm_id`, and both counters carry their own firm.
* **Body injection on every API route that opens cases:** `POST /runtime/cases` with `firmKey`, `firmId` and `firm_id` naming the other firm, on all 5 released combinations, as user-O and user-S. All returned 201 in the opener's own firm, with 0 case or stage mismatches. Stages are inserted only at opening (`routes-data.ts:58,68`).
* **Direct inserts as xr_app:**
  * another firm's id on a case, a counter or (via `\copy`) a stage is refused in plain words;
  * `session_replication_role` is denied, and so is `DISABLE TRIGGER`, also after `SET ROLE xr_staff_bypass`;
  * a temp `runtime_case` that shadows the real one does not fool `case_firm_fill`.
* **The lookup:**
  * returns one uuid or null, never a set;
  * returns null for case, space, zero-width, look-alike and wildcard keys, a NUL-free 1 MB key and SQL in the key;
  * xr_app and `SET ROLE xr_staff_bypass` get the id;
  * a fresh LOGIN role with no grants gets "permission denied for schema case_lookup", and its `SET ROLE xr_case_lookup` is denied;
  * xr_app cannot create an overload in `case_lookup` or in `public`, and neither can the bypass role;
  * a `pg_temp.platform_firm` table and a `pg_temp.case_firm_id_of_key` function do not change the answer.
* **Migration:**
  * with the seed off it leaves rows null and refuses no insert;
  * the backfill took 0.9 s for 40,001 cases;
  * three databases ran `prisma migrate deploy` at once on the shared cluster, and all succeeded;
  * the role block, with a throwaway role name (dropped afterwards), raced 9 sessions on 3 databases over 6 rounds with the role missing each round: no failure, one `NOLOGIN NOBYPASSRLS` role, one membership.
* **Demo paths with the seed off (`br_csw1_off`):**
  * the configured load, Reset to the six, the blank Reset and the finished story (async; `platform.demo.reset` passed its bypass route check) all ended with both Sample firms present and every case and stage of the demo workspace filled;
  * another workspace's cases and a non-Sample firm's `platform_firm` row (md5 compared before and after) were untouched.
* **CI:** copies come from `isolated.sh`, which now turns the seed on.
* **Not applicable to this row** (no screen or upload in part 1): keyboard use, 1024 px and 200 % zoom, hostile uploads, and reload or back mid-action.

Breaker: fail

## Round 2: head 2cbe299c60d1ac2ebd41a624e9a3b3d38a64989a

Code diff since round 1: `case_firm_backfill()` in the migration, `fillCaseFirmIds` / `fillCaseFirmIdsOnStart` (`firms.ts`), the demo seed refused in production (`demo.ts:35-42`), the start-up fill beside the seed (`main.ts:235`), the lookup `CREATE OR REPLACE`. Round 1's `Breaker: fail` above stays as written; this round replaces the verdict. Copies `br_csw1` :4498, `br_csw1_m2` :4497, `br_csw1_m3` :4496 and scratch `xr_studio_br_csw1_c1` are stopped and dropped; scratch output stays under `/tmp/claude-0/` (round 1's two empty `.err` files in the repository were mine, now removed).

**Round 1, re-checked.**
* **M1 fixed.** Same reproduction on 2cbe299 (pre-migration rows of three keys, `platform_firm` empty, `isolated.sh restart`): after start every case, stage and counter of both Sample keys carries its firm; `ghost-firm` stays null; the log says "filled … 6 … row(s)". A second start fills 0 and logs nothing.
* **m1 fixed for production.** `sampleSeedDecision` refuses `PLATFORM_ENVIRONMENT=production` (with or without `PLATFORM_SAMPLE_SEED=off`). `local` and `test` seed. As the demo forces the setting on, `PLATFORM_SAMPLE_SEED=off` still seeds on the demo paths, which is now intended.
* **m3 fixed.** `check_csw1_firm_id.ts` 46/46 covers `firmIdByKey`, `firmIdOfActor` and the fills (it needs `--tsconfig api/tsconfig.json`, which `run-suites.sh:129` passes).
* **m2 closed** as the coordinator's intended behaviour.

**New findings (all Minor).**
* **R2-m1: the lookup's owner has no `USAGE` on `public`, so the lookup needs PUBLIC's default grant.** Steps: on `xr_studio_br_csw1_c1` run `prisma migrate deploy`, then `drop schema public cascade; create schema public` (the reset that the `CREATE OR REPLACE` comment names, `migration.sql:79-80`), then `migrate deploy` again. Every migration applies and the function survives, owned by xr_case_lookup. But as xr_app `select case_lookup.case_firm_id_of_key('x')`, and so every `runtime_case` insert, fails with `permission denied for schema public`. A recreated `public` grants only `xr_studio=UC` and `xr_data=U`, and xr_case_lookup is not in xr_data. A database that hardens `public` (`REVOKE USAGE … FROM PUBLIC`) is in the same state. Grant `USAGE ON SCHEMA public` to xr_case_lookup; DW10 assumes USAGE anyway. No repository path runs the API on such a database today; raise it to Major if production revokes PUBLIC's USAGE on `public`.
* **R2-m2: the start-up fill can wait without limit.** Steps: hold `select … from runtime_case where firm_key='sample-solo' for update` for 75 s in another session, with that case still unfilled, then `isolated.sh br_csw1_m3 4496 restart`. The API listened only once the lock was released (log: "Product Studio on …" at 14:22:13, 76 s after start). A failure is caught, but a wait is not: the fill has no `lock_timeout` or `statement_timeout`.
* **R2-m3: one invalid case in any workspace stops the whole fill, and the demo then names the wrong cause.** Steps: insert, in replica mode, an unfilled `sample-firm` case in a non-demo workspace whose only stage is NOT_STARTED, so `trg_case_stage_current` refuses the stage update. Results:
  * at start the API still starts, but the log line gives no reason ("could not fill … at start (CS-W1): ");
  * `POST /api/demo/reset` answers 409 "This case moved to its next stage…", and Reset to the six and the configured load stop the same way, because `seedSampleFirmsAsDemo` runs before the wipe and is not caught;
  * the demo is blocked by another workspace's row, which the demo reset now writes (it fills the null `firm_id` of every workspace's cases).
  * Such a row needs a write past the database's own rules (replica mode), so this is Minor.

**Held in round 2:** `check_prisma_schema` 8/8, `check_pf12_walls` 100/100, `check_c617_stages_migration` 23/23. `case_firm_backfill` is INVOKER with its `search_path` pinned, is named `case_firm_*`, and has no PUBLIC EXECUTE. It updates only empty rows, it never fires `trg_runtime_case_number_fixed` or `trg_runtime_case_stage` (both are `UPDATE OF` other columns), and `runtime_case_stage_forward` allows the `firm_id` change. After a reset of `public`, the migration re-applies cleanly.

Breaker: pass
