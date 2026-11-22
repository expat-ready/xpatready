# SPD-2: independent review, round 1 (PR #3035 at 18bb85298)

Scope: the SPD-2 part only (`git diff origin/claude/adoring-pascal-glv4d7...HEAD`, 13 files). This is pipeline work, not a screen, so D1-D20, the BIC table, the graph and the journey test do not apply (journey score: N/A, no screen). I judged correctness and safety.

## What I ran (this container, 22 Nov)
* `test-spd-2.sh` 32/32 · `check-queue-gate.sh` 140/140 · `check-mergify-scopes.sh` PASS (189) · `check-pr-suites-job.sh` 20/20.
* `migration-slots.py check origin/main..refs/pr/N` for the six PRs gives the same refusals and fixes as the PR table. Each printed `git mv`, applied in a scratch clone, then passes the check (all six).
* I replayed real main migrations through the check, probed it with 24 fixture SQLs, and ran 12 hand mutations against `test-spd-2.sh` (scratch clone; I edited no file in this worktree except this one).

## Verified sound
* The ci.yml step is in job `fast`, which runs on every non-notes PR and batch. RANGE comes from `pr-base.sh`: today's main on a PR; on a batch, main..HEAD^2 (the draft head, so the whole batch). `--batch` is passed exactly when QUEUE=true.
* Batch floor: main's newest of the same area, shared, barrier or pre-SPD-2 migrations; all areas for a `shared` one. It is consistent with the scopes (capacity 1 per area, barrier migrations in barrier_files).
* Glob prefixes are safe. `*_platform__*/**` cannot match `…_platform-offices__…`, because areas are joined by `-` and the folder separator is `_`. A name part holding `_<area>__` only adds scopes, which is the safe direction. Legacy folders sit in no scope, and edits to them are refused unless repaired.
* The merge batch (`--skip-quarantined`, no `--changed`) and the nightly are unchanged. pr-suites.yml still skips `mergify/` branches.

## Majors (must fix)
1. **The check passes migrations that write another area's tables** (`migration-slots.py:38`, WRITES). With a `cases__` folder, my fixtures showed it does not see these writes:
   * `CREATE CONSTRAINT TRIGGER … ON "money_row"`, `CREATE POLICY … ON`, `DROP TRIGGER … ON`;
   * `CREATE INDEX ON t (…)` with no index name, `DROP INDEX`;
   * the second and later tables of `DROP TABLE a, b` and `TRUNCATE a, b`;
   * `ALTER TABLE IF EXISTS ONLY`, `UPDATE ONLY`, `DELETE FROM ONLY`;
   * unquoted upper case (`ALTER TABLE MONEY_ROW`);
   * a `'--'` inside a string, which hides the rest of the line (`code()` is not string-aware).

   When nothing is detected (`derived` empty), any valid area name passes (line 145): the read hint only feeds the suggestion. Main already has precedents among its 143 migrations:
   * `20261117004500_css1_case_party_index` adds CONSTRAINT TRIGGERs on `client_canonical_answer` (answers), but the check sees only case-search. The PR body says "a trigger on another area's table counts".
   * `20261118090000_csw1_firm_id` adds `CREATE POLICY … ON platform_firm` (base, a barrier), but the check sees only cases.
   * `20261121100000_csw3_case_door` adds policies on `runtime_case` and `person_link` (links). The check sees nothing, so it would pass under any area name.

   Such a migration takes one slot while it changes a table in another, so two same-table migrations can merge in parallel batches. Each batch is green on its own, and main can break after both merge.

   Fix:
   * add the POLICY, CONSTRAINT TRIGGER, DROP TRIGGER and unnamed/DROP INDEX forms, comma lists after DROP TABLE and TRUNCATE, ONLY in every position, and lower-cased unquoted names;
   * strip comments outside string literals and dollar-quotes only;
   * when nothing is detected but the reads name one other area, refuse (or require `shared`);
   * add a fixture for each, including the three real migrations above.
2. **Wrong refusal of the most common new-table pattern: Prisma back-relations force `shared`** (line 125). With one new migration, every schema file the PR touches counts as changed. Prisma needs the back-relation field in the other model's file. The schema files hold 212 cross-file relation fields, most of them to `platform`, and about 11 of main's last 40 migrations edited `platform.prisma` beside their own file. I replayed two of them with the area they serve:
   * `20261122020000_front-office-signing__fo6_signing_tables`: its SQL writes only signing tables, and the `platform.prisma` edit is back-relation lines only. Refused: "changes front-office-signing, platform … Fix: …shared__…".
   * `20261119180000_platform-offices__pf18a_notification_prefs`: refused the same way.

   So these must be `shared` and wait for every area, which defeats P-802 for a large share of migrations. The rule adds no safety, because the touched schema file already puts the PR in that area's `mig-<area>` scope (the schema file glob). Fix: count a touched schema file only when the SQL writes one of its tables (not REFERENCES), and add a fixture with a back-relation edit.
3. **Two of the six open PRs need more than the printed `git mv`.** Both add a new schema file: #2320 adds `case-notes.prisma`, and #2927 adds `platform-system.prisma`. With SPD-2 merged in plus the rename, `check-mergify-scopes.sh` fails: "scope mig-platform-system: not [...]" and "capacities: mig-platform-system is not 1". The same happens for mig-case-notes (I tested both in a scratch merge; main's own check passes them). The failure prints no fix, although the brief says refusals print the exact command. The PR's plan ("each owner runs one `git mv`"; "#2927 and #2368 can queue together") is therefore incomplete. Also, every PR that adds a schema area must now edit `.mergify.yml`, which is a pipeline file and Lead-read (P-423), and the PR does not say so. Fix:
   * print the exact lines to add (the `migration-slots.py mergify` output for that area) in the scopes failure;
   * correct the table and plan for #2320 and #2927;
   * state the new-area step in the PR body.
4. **`test-spd-2.sh` misses most mutations of the safety rules.** Of 12 hand mutations, 8 still pass 32/32:
   * WRITES without CREATE TABLE, DROP TABLE, INSERT, UPDATE and DELETE;
   * the batch floor ignoring shared and barrier migrations;
   * the batch floor for a `shared` migration taken off;
   * touched schema files ignored;
   * the repair accepting any `_prisma_migrations` mention;
   * `area not in valid` disabled (a bogus area passes when nothing is detected);
   * the barrier-area exemption removed;
   * row-file `Tests:` lines ignored in module-suites.

   Only 4 mutations were caught: legacy floor, barrier `.ts` fallback, edited applied migration, comment stripping. Fix: one case per rule above, and add the key ones as guard-37 mutation rows.

## Minors
1. `clash` "fails closed" only for exit 2. An uncaught exception (e.g. UnicodeDecodeError) exits 1, which queue-gate reads as "may queue together" (`queue-gate.sh:220`, `migration-slots.py:244`). Use a distinct exit code for "no clash", or catch all exceptions to 2.
2. No stamp sanity check: `99991231235959_…` and `20261399999999_…` pass. Once one lands, every later stamp must exceed it. For the second, every later refusal crashes in `stamp_after` with an uncaught ValueError (traceback, no fix printed). Refuse stamps that are not a real date or are far beyond the commit date.
3. The repair acceptance (line 116) needs only a `_prisma_migrations` mention in code and the quoted folder name anywhere, even in a comment. Require an `UPDATE _prisma_migrations … WHERE migration_name = '<d>'` in code.
4. The PR-mode floor is global, so any area's merge makes every open migration PR re-stamp on its next push or re-run. Also, #2129, #2320 and #2968 are all told `20261122033100`, so only the first to merge keeps it. The plan should say so.
5. Module cards are now load-bearing for PR suites, and some are incomplete. `check_fo7lk_lock_order.ts` tests client money's trust-lock order and reads `client-money/MODULE.md`, but it is on neither the card nor its rows, so a client-money change no longer runs it on the PR. It is report-only and the batch runs everything, but consider adding the suites that import or name the changed file (`module-suites.py:77`).
6. Nit: the `__main__` comment in module-suites ("docs and records alone pick nothing") is wrong, since a docs-only change picks the 6 always-run suites (as select-suites did). Reword it.

## Not checked
Mergify's live glob engine (I used the repo's own `rx()` reading); real CI runs; `check-guards.sh --mutate` (not run, per the brief); Prisma's out-of-order behaviour (the PR's open question 3).

Reviewer: Block 18bb85298373d1ed851817c8205f324e350ecf3d
Verdict: Block. Fix Majors 1-4: write detection plus its fixtures, the back-relation refusal, the new-schema-area scopes fix and plan, and the test mutations. The Minors are optional.
