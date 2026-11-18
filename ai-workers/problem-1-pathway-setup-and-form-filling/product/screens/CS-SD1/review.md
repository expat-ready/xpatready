# CS-SD1 review: schema drift (PR #2017), commit b5889232dcdd55f00287ab8fc1dff9a2361d0b66

Reviewer: fresh Opus 5.5, who did not build it. The row is schema text only and has no screen, so it is reviewed against the brief (`build-lead-c-briefs/CS-SD1.md` on `claude/build-lead-c-647b40`) rather than a concept. The diff is `origin/main...b5889232d` (merge base f7dde02c8 = main's head at review time). Isolated copy `rev_cssd1` on :4641. Scratch databases `xr_studio_rev_cssd1*` were all dropped afterwards. Journey test: `journey-test-reviewer-2026-11-16.md`, **9.5/10**.

**Verdict: Approve b5889232dcdd55f00287ab8fc1dff9a2361d0b66** (no open Blocker or Major). The label still needs green CI on this sha (P-277/P-385): CI was skipped on the draft when reviewed. The Lead reads the schema diff (P-423).

## What was checked (with evidence)
1. **The four ids.** `FactSource` and `PersonRole` (pathways.prisma), `FormEditionAccept` (forms.prisma) and `ValidatedCopy` (answers.prisma) are now `@default(dbgenerated("gen_random_uuid()"))`. Each matches `"id" UUID NOT NULL DEFAULT gen_random_uuid()` in `w115_fact_sources:9`, `w110_channels:19,60` and `s5_person_roles:4`.
   * App code: every Prisma write on these models was read. None reads `.id` before the create or relies on a client-made id:
     * `fact-sources.ts:104,198,253` and `proposals.ts:1015` (the last passes an explicit id from a snapshot);
     * `core.ts:132` `createMany` with no returning;
     * `fill-case.ts:549` reads `row.id` after the create;
     * `finder.ts:847,858,868` and `lifecycle.ts:449` (create and upsert).
   * There are no nested writes through `validated`, `accepts` or `factSources`.
   * Confirmed live on the generated 7.8 client: `create` and `createManyAndReturn` on `person_role` return the database-made UUID, and an explicit id is kept.
   * The CI type check (`typecheck.mjs`, with a larger heap) reports no new type errors (15 known, 0 fixed).
2. **`CanonicalFieldName`** (library.prisma:72-86) matches `20261025100000_field_name_unique` exactly: `workspace_id` UUID, `canonical_field_key`/`group_key`/`name_key` TEXT, all NOT NULL, `PRIMARY KEY (workspace_id, canonical_field_key)` (default name `_pkey`), `@@map`, `@@ignore`. The header comment names the trigger as the only writer and says never to drop the table or the index. `prisma db pull` on a fresh deployed database prints the same model.
3. **The partial index claim.** I re-ran both routes myself with my own config and shadow database:
   * `--from-migrations … --to-schema prisma/schema --exit-code`: "empty migration", **exit 0**.
   * `--from-config-datasource` on a fresh `migrate deploy` database: **exit 0**, and the reverse direction is also exit 0.
   * `main`'s schema against the same database gives exactly the five statements the PR quotes (exit 2).
   * So Prisma 7.8 proposes nothing for `canonical_field_name_unique`. But see m1.
4. **`tests/check_cssd1_no_drift.ts`.** 17/17 on three runs, about 25 s each. Each pass/fail pair proves its "Done when" line:
   * DW1: the exact one-line scripts for the uuid-back copy and the no-model copy.
   * DW2: a raw insert gets a v4 UUID; with the default dropped in a scratch transaction it fails on a null id, and the default is still there afterwards; all four defaults are read back.
   * DW3: the SQL-level refusal, then the same insert accepted without the index (2 rows, rolled back), the index still there afterwards; through the API, a 409 "already" and a race with one winner.
   * GEN: the client has no `canonicalFieldName` delegate, and a copy without `@@ignore` has one.
   * It would fail on `main` (I ran DW1's diff against main's schema).
   * Cleanup: `dropdb --force` and the work folder in `finally`, plus SIGTERM/SIGINT handlers. Nothing was left behind after my runs.
   * Portability: it uses Homebrew's postgres binaries when present, else the PATH (it ran on Linux here).
   * The usage line (:12) matches `run-suites.sh:348`'s regex: name `runtime_cssd1`, port 4631 (used by no other suite), args `4631 xr_studio_runtime_cssd1`, which the prefix renaming handles.
5. **`KNOWN` emptied in `check_prisma_schema.ts:23`** (outside the touch list) is justified and forced. The check's own rule, "every known difference is still there", goes red the moment the drift is fixed, and its header says to remove fixed lines in the same PR. Re-run: 8/8, "0 known differences (diff exit 0)". The PR body discloses it. See m2.
6. **Other CI parts**, run here:
   * `graph.mjs --check`, `suite-exit.mjs`, `ci-and-lists.mjs`, `count-any.mjs` (417 = base), `push-guard.sh`, `check-port-contracts.mjs`: all exit 0.
   * The brief's suites on my copy: `check_gcore_b2_door.ts` 52/0, `check_screen02_fix.ts` 64/64, `check_forms_c36_rule_facts.ts` 42/0.
   * `check-works-set.mjs` gave 78/1. Its failing case ("a base with no acceptance pack") reads git history and acceptance packs, which this PR does not touch. I judge it environmental (this clone), not caused by the PR. It was not re-checked on main.

## Blockers
None.

## Majors
None.

## Minors
* **m1. The PR body's reason for not stating the index is inaccurate. The decision itself is right.** The body says Prisma 7.8 "leaves an index it cannot express alone".
  * 7.8 can express the index: `db pull` prints `@@unique([workspaceId, groupKey, nameKey], map: "canonical_field_name_unique", where: raw("(name_key <> ''::text)"))`.
  * `prisma validate` refuses that line unless the generator has the preview `partialIndexes`.
  * With the flag on and the index unstated, the diff proposes `DROP INDEX` for **36** partial indexes repo-wide (`canonical_field_name_unique` among them). With the flag and the line, it still proposes the other 35.
  * So stating the index means the flag in base.prisma plus 35 other indexes in other area files. That is well outside this row and the STANDARDS §1 gate, and leaving it unstated is the narrowest fix (P-610).
  * Fix: correct the PR body's sentence and tell the Lead in the Lead read that turning on `partialIndexes` later would propose dropping every partial unique index, this one included.
* **m2. A file outside the touch list without the brief's "Question for the tech lead".** The `check_prisma_schema.ts` change is mechanically forced and disclosed in the PR body. The brief asks for a stop-and-ask comment for anything beyond the touch list. Fix: the Lead confirms it in the schema-diff read. No code change.
* **m3. No sweep for a killed run's leftovers** in `check_cssd1_no_drift.ts:24,64`. `check_prisma_schema.ts` has one. A SIGKILL during `spawnSync` leaves `xr_studio_cssd1_<pid>` (which `prune-test-dbs.sh` covers) and `var/cssd1-check-<pid>` (which nothing covers). Should, optional.
* **Nit.** `check_pf3_platform_schema.ts:36` and `check_fo1a_sales_schema.ts:35` still mention "main's own known drift, listed in … KNOWN". Harmless now. Not this row's to fix.

## D1–D20 (schema row: most are N/A; scores out of 5)
D1 5 (every brief line is met: four ids, `@@ignore` model, no migration folder, diff exit 0) · D2 5 (the database guard and defaults are kept, and the race gives one winner) · D5 5 (cleanup on every end, three green runs) · D16 5 (a pass and a fail per DW, the test fails on main, re-run by the reviewer) · D18 4 (the header comment names the trigger, the migration and the 409, but see m1) · D3, D4, D6, D7, D19 N/A (no content or rule change) · D8–D15 N/A (no screen; the rename dialog was spot-checked in the journey: words, look, keyboard, 1024/400 px all unchanged) · D17, D20 simulated only (founder).

## Not checked
* The scorecard (BIC-01–20): N/A, no case-side screen.
* Full CI on this sha: not run yet (draft).
* Demo reset and checkpoint load.
* The PF-8r restored-database DW1 run and the client-reach check (the breaker's).
* axe and 200 % zoom (`@axe-core/playwright` is not installed).
* `graph.mjs`'s per-screen view: no screen.
