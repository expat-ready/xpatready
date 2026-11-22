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

# Round 2 (PR #3035 at 02ad3b5b6, diff-only)

Scope: `git diff 18bb85298 02ad3b5b6` of `migration-slots.py`, `test-spd-2.sh`, `module-suites.py` and `check-guards.sh`, plus the updated PR body. #3007's merged changes were ignored. Pipeline work, so the journey score is N/A (no screen).

## What I ran (this container, 22 Nov)
* `test-spd-2.sh` 66/66 (8.7 s) · `check-mergify-scopes.sh` PASS (189) · `check-queue-gate.sh` 140/140.
* **Main's 143 migrations replayed through `written()`:** 99 one area, 24 shared, 11 barrier, 9 none. This matches the PR body. css1, csw1 and csw3 now read as multi-area; fo6 and pf18a stay single.
* **The six open PRs** (`pull/N/head`, fetched today): I merged each into 02ad3b5b6 in a scratch clone and applied the printed `git mv`. Then I re-ran `check` and `check-mergify-scopes.sh`. For #2129 and #2320, a MODULE card conflict was resolved to theirs.
* **56 probe SQLs** against `written()`, and 31 hand mutations against `test-spd-2.sh`: the 8 from round 1 again, plus 23 new ones.
* **The four guard-37 rows**, run through `check-guards.sh --mutate`'s own copy loop (only those rows; the full run was skipped, per the brief).

Every edit was made in a scratch clone. In this worktree I edited this file only.

## Round 1 findings
* **M1 (write detection): mostly fixed; one part is still open (R2-M1 below).**
  * Every round-1 form is now seen: POLICY, CONSTRAINT and DROP TRIGGER, unnamed and DROP INDEX, the comma lists, ONLY, upper case, and `'--'` in a string.
  * The scanner keeps strings, `""` names and nested dollar bodies (`$o$ … $i$ … $i$ … $o$` is seen), and `''` and `""` escapes work.
  * The three main precedents now come out multi-area.
* **M2 (back-relations): fixed.** A touched schema file only hints, so fo6 and pf18a pass under their own area. The rule is safe: the touched file already puts the PR in that `mig-<area>` scope, and a Prisma FK needs that back-relation.
* **M3 (new schema area): fixed in the tools.**
  * The check refuses a named new area with the `mergify --write` command, and `check-mergify-scopes.sh` prints the same fix.
  * `--write` is a no-op on the real `.mergify.yml` and idempotent after adding an area.
  * If the anchor is missing, `--write` exits 2 and leaves the file unchanged.
  * #2927 end to end: `git mv`, then `--write`, then both checks PASS (29 scopes, 192 checks).
  * The #2320 row is wrong (minor 4).
* **M4 (test mutations): fixed for the round-1 eight.** Each now turns the suite red (valid area, barrier exemption, batch shared floor, batch wide floor, repair read from code, and the others).
  * All four guard-37 rows fail in the mutation copy for the intended reason: stamp (7 red), area (3), multi (2), slot (1).
  * New survivors are in minor 3.
* **Minors 1-6:**
  * m1 is fixed: every exception exits 2, and the error test passes.
  * m2 is fixed: `stamp_ok` refuses non-dates and stamps more than 2 days ahead, and `newest` ignores bad stamps on main.
  * m3 is fixed in code, but the test does not prove the folder name must match (minor 3).
  * m4 is fixed: suggestions use the current minute.
  * m5 moved to open question 5. That is acceptable.
  * m6 is fixed.

## Major (must fix)
* **R2-M1. A common write form is still missed, so three real migrations read as "no known table" and would pass under any area name.**
  * `UPDATE "t" alias SET …` (an alias without `AS`) and `UPDATE "t" AS "a" SET` (a quoted alias) are not matched: `migration-slots.py:112` allows only `AS \w+`.
  * 17 of main's 143 migrations use this form. For 3 of them it is the only write, so they are counted in the PR's "9 name no known table (the area is named by hand)":
    * `20261122030000_qa741_sample_plan_prices` updates `platform_plan` (platform);
    * `20261119144500_csnk1_field_name_key` updates `canonical_field_name` (library);
    * `20261118210000_fo7lk_trust_lock` updates `money_invoice` (client-money).
  * When `derived` is empty, any valid area passes (`:247`). I copied qa741 and csnk1 under `<now>_cases__…` on top of 02ad3b5b6, and the check printed `PASS migration slots: 2 new migration(s)`.
  * This is round 1's M1 class: one slot is taken while another area's table changes. Round 1 also asked for a fallback for "nothing detected"; it was not added, and its absence is what makes this miss silent.
  * Fix:
    * extend the UPDATE form to `UPDATE (ONLY)? <id> ((AS)? <alias>)? SET`, where the alias is quoted or a plain word and not a keyword, so `ON CONFLICT … DO UPDATE SET` stays unmatched;
    * add fixtures for both alias shapes and for the three migrations above, so each reads as writing its area;
    * correct the PR's replay table.

## Minors
1. **Dynamic SQL is invisible.** The repo's own idiom is `FOREACH t IN ARRAY ARRAY['…'] LOOP EXECUTE format('… ON %I', t)`, used in 16 of 143 migrations.
   * For example, `20261116013000_pf12_firm_walls` enables RLS on 8+ areas' tables this way. It still reads as multi-area only because of its static writes.
   * A single-area migration doing the same would pass under that area.
   * Suggestion: when the code contains `EXECUTE`, count every known table named in a string literal as written.
2. **Other forms are missed or dead.** None of these has a main precedent:
   * **Rules never match:** the real syntax is `CREATE RULE r AS ON <event> TO <table>`, and the regex captures the event. The PR body's "a rule" claim is false.
   * **Policy names with spaces:** `CREATE/ALTER/DROP POLICY "firm wall" ON t` is missed, because the policy name is read as `\S+`. Main's 28 quoted policy names have no spaces today.
   * **Only the first item counts** in `GRANT/REVOKE … ON a, b` and `DROP TYPE a, b`.
   * **Partitions:** the parent of `CREATE TABLE … PARTITION OF` and `ALTER TABLE … ATTACH PARTITION` is not counted.
   * **Views:** Prisma `view` models are in `owners()`, but there is no VIEW form.
   * **Other schemas:** a trigger `ON` a non-`public` schema is missed.
   * **Sequences:** the `ALTER SEQUENCE` form is dead, because `owners()` holds no sequences.
   * **E-strings:** `E'\'--'` throws the scanner out of step and hides the rest of the line. This is contrived.
3. **`test-spd-2.sh` survivors.** These hand mutations still pass 66/66:
   * **The `area != "shared"` exemption removed (`:247`).** Every correctly named shared migration (24 on main) is then refused. No PR-mode case has a shared migration that writes two areas and passes.
   * **Seven write forms without a case:** GRANT/REVOKE, COMMENT, TYPE, MERGE, COPY and RULE could each be deleted. The PR says "one case per write form".
   * **The repair:** `repairs()` accepting any folder name in the quotes.
   * **The floor:** `<=` changed to `<` (a stamp equal to main's newest passes).
   * **Bad stamps on main:** `newest` counting them.
   * **`write()`:** no longer checking its result.
   * **`mergify --check`:** its barrier, stray `mig-` scope and legacy-scope rules switched off.

   Also, row "37 module" was dropped with no replacement. module-suites.py now has no mutation guard, because those cases skip in the copy; say so in the PR.
4. **The #2320 row is wrong.** "Also: none: a shared migration needs no new slot" and the sentence after the table do not hold:
   * `check-mergify-scopes.sh` requires a scope for every non-barrier schema file. With `case-notes.prisma` added, it fails (`scope mig-case-notes: not …`, `capacities: mig-case-notes is not 1`) even with the shared name. I checked this on the scratch merge.
   * `--write` clears it. The PR body's first paragraph already says so, so only the table and that sentence need fixing.
   * Separately, #2320 also fails `scope case-side: lacks its card api-cases's paths …case-notes/*.ts`. That is unrelated to SPD-2.
5. **The fix can rename a valid area.** On a refusal for the stamp alone, `want` comes from the hint (`:224-228`). So a valid `cases__x` that writes no known table but touches `client-money.prisma` (a back-relation) is told to `git mv` to `client-money__x`. Keep the named area when it is valid and consistent with `derived`.
6. **`mergify --write` writes before it validates.** A hand comment inside a generated scope stops the line removal, and the orphaned `include:` lines attach to the scope above (I saw `scope forms-engine: holds migration folders outside a per-area scope`). The check then prints the same `--write` command again. The risk is low, since the block is generated and git can revert it. Writing to a temp file and checking before replacing would remove it.
7. **The reads line is acceptable.**
   * Foreign keys are covered: Prisma's back-relation touches the other schema file, so the PR enters that scope.
   * Residual: a policy, view or SQL-language function that reads a column which another area's parallel migration drops or renames can make `migrate deploy` fail once both merge. plpgsql bodies are checked only at run time.
   * Record this as an accepted residual in the PR's open questions.

## Six open PRs (printed fixes, verified)
| PR | Printed fix | After the fix |
|---|---|---|
| #2129 | `<now>_audit__aud1c_audit_chain` | PASS |
| #2320 | `<now>_shared__csnt1a_case_note` | check PASS; `check-mergify-scopes.sh` FAIL until `--write` (minor 4) |
| #2368 | `20261122040000_client-money__fo7ts_part3` | PASS |
| #2927 | `20261122060000_platform-system__pf4s_system_identity`, then `--write` | PASS (both) |
| #2938 | `20261122040000_client-money__fo7c1_account_firm_lookup` | PASS; same stamp and area as #2368, so whichever merges second is refused and re-stamps (expected) |
| #2968 | `<now>_shared__pf8b_f5_grant_loop` | PASS (checksum repair accepted) |

## Not checked
Mergify's live glob engine; real CI runs; the full `check-guards.sh --mutate`; Prisma's out-of-order apply (open question 3).

Reviewer: Block 02ad3b5b682531bab1e38fcb9dacec0e06eace87
Verdict: Block. Fix R2-M1: the `UPDATE … alias SET` form, with fixtures for qa741, csnk1 and fo7lk, and correct the replay table. The Minors are optional. Minor 3's shared-exemption case and minor 4's #2320 row are the cheapest.
