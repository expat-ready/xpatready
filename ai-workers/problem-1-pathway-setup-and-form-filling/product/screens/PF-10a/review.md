# PF-10a review: import batch tables (independent reviewer, 23 Nov 2026)

Commit reviewed: **9d717c8ec8afa96f0846c7737dde4db5532d342b** (branch `claude/bold-fermi-fe7khf`, PR #3276, draft). Diff `origin/main...9d717c8ec`: `platform-import.prisma`, the slot lines in `platform.prisma`, migration `20261124050000_pf10a_import_tables` (migration and rollback), `tests/check_pf10a_import_schema.ts`, `MODULE.rows/PF-10a.md`. Judged against: row PF-10a (BACKLOG.md:1038), AG-18-11, -12, -15, -39, -49, -52, -54, -56 (trace `--brief`), rev 16.6 and 16.7, PF-12's wall pattern (FO-6 signing, FO-9b merge, `check_pf12_walls.ts`), STANDARDS §3–§5. **Schema-only row:** there is no screen and no route, so the UI checks (keyboard, 1024 px, 200 %, words, team look), screenshots and the BIC table are N/A. Graph: `graph.mjs` ran (G1 0, G2 0); no page or route belongs to PF-10a. Known and accepted: no key rows (PF-3 already seeds the three `agent/import:*` keys for Owner and Admin; the tech lead agreed on the PR). Stamp 20261124050000 was assigned by the tech lead.

**Verdict: Rework → Block.** The schema itself is sound. Two one-line faults turn CI red: M1 and M2.

## What I ran
* `npx tsx tests/check_pf10a_import_schema.ts`: **42 passed, 0 failed** (14 s).
* Neighbouring suites at this commit: `check_pf12_walls` 110/110 (the wall guard picks up all four tables and the three reader functions), `check_pf0p_ports` 127/127 (slot comments), `check_pf8b_f4_migrations` 9/9 (non-superuser hand-over), `check_pf8b_f7_data_walls` 17/17, `check_pf3_platform_schema` 75/75, `check_pf25_web_address` 72/72. **`check_prisma_schema` 7/8: FAIL** (M1).
* `check-module-cards.sh`: **FAIL** "tree: as on this branch" (M2). It also fails in CI on this head (job 137883581689). `pr-rules` is red too: the PR body has no "Duplicate check:" line (m1).
* A scratch database with every migration plus the Sample firms. I played PF-10b's flows as `xr_app` (journey report beside this file). I also tested the rollback: rollback.sql ran in one transaction, the catalogue then matched a database migrated up to the migration before (6,108 objects, ACLs and the schema's CREATE right included; diff empty), and the migration re-applied cleanly. Databases dropped.

## Done when: each line, with its pass and fail
| Done-when line | Pass / fail test | Holds? |
|---|---|---|
| Migration on empty and demo-data copies, `migrate diff` empty, measured right after itself (rev 16.7) | yes / yes (stamp later and unique, not `at(-1)`; no table before; walls on both copies; demo rows unchanged; additive-only scan; diff exit 0) | Yes. The "demo" copy is migrations plus `seedSampleFirms`, not the full demo reset. That is enough here, because no existing table is touched |
| A row's reasons refuse a value (shape check, no raw value) | yes / yes ×7 (extra `value` key, spaces and `@`, 65 characters, a missing rule, a bare string, an object, a number, 51 reasons) | Yes. `CASE` guards `jsonb_array_length` and `jsonb_object_keys`. The tests match the constraint's name, so a check that raised an error instead of refusing would fail them. The object case runs on a SKIP row, where only the reasons check can refuse it (check constraints run in name order). I probed `null`, `"str"`, `5`, `[null]`, `[[]]`, `[{}]` and mixed arrays: each answered false and none raised an error |
| An attestation refuses update and delete | yes / yes (update, delete, truncate; `xr_app` holds no UPDATE, DELETE or TRUNCATE) | Yes |
| A batch's importer from another firm is refused by the key pair | yes / yes (importer, attestation, row→batch, mapping saver) | Yes. Every staff key is `(firm_id, staff_id) → platform_staff(firm_id, id)` |
| Firm A cannot read firm B's batch under the policy | yes / yes (all four tables; by id; write and update across firms) | Yes |

**AG-18-49 under PF-12:** `pf_import_attestation_owner` is SECURITY DEFINER, owned by `xr_wall_reader` (BYPASSRLS), with `search_path` pinned. It reads only `NEW.firm_id`'s staff and grants. `0_pf12_firm_first` fires first (triggers run in name order), so firm A's session naming firm B's staff is refused by the gate and never reaches the Owner check. The trigger therefore cannot be used to ask whether someone is firm B's Owner (checked as `xr_app`). The grant pair for `xr_wall_reader` follows F4 (`GRANT/REVOKE CREATE`). Owner-only holds as `xr_app` too: a non-Owner is refused, a suspended Owner is refused, and a backdated `at` is replaced by `clock_timestamp()`.

**What PF-10b (BACKLOG.md:1039) needs, as `xr_app`:**
* Not blocked: a DRAFT batch; dry-run rows; a run that updates them in place; `ON CONFLICT (batch_id, row_number) DO NOTHING` on resume; moving through the states COMPLETED → UNDOING → UNDONE with deadline and attestation set later; a mapping changed after the dry run (the mapping stays mutable, so "changed mapping → run refused" can be tested); a saved mapping saved again by upsert by another staff member; a batch deleted after its rows are gone.
* Not over-constrained: every frozen batch column (file, target, source, importer, firm) belongs to one upload.
* The PF-10b builder should still read the notes at the end.

## D1–D20 (1–5; schema row)
D1 4: every Done-when line met; M1/M2 keep CI red · D2 5: firm-pair keys on every link; frozen batch facts; insert-only attestation; one row per batch and row number · D3 4: one mapping per firm, source and target; reasons as names · D4 N/A · D5 4: rollback exact and re-runnable; resume key in place · D6 4: attestation records who, when and wording version, at the database's time · D7 N/A · D8–D14 N/A (no UI) · D15 4: `(firm_id, created_at)` for the paginated home; `(batch_id, row_number)` and `(firm_id, batch_id, outcome)` for the preview · D16 3: m2, m3 (rules whose removal no test catches) · D17, D20 simulated only (no user walk) · D18 4: AG ids on every rule, Sample marked · D19 N/A (closes with PF-10b, PF-10t, PF-10s).

BIC-01–BIC-20: N/A (not a case-side screen). Journey score (reviewer): **8.5/10, no criterion at 0** (see the journey report).

## Issues
**Blockers:** none.

**M1 (Major, Must): `check_prisma_schema.ts` fails.**
* Where: `prisma/schema/platform-import.prisma:1-2`. The area rule line wraps, so "Owner: …." is on line 2.
* The check (`tests/check_prisma_schema.ts:54`) wants `// platform-import.prisma — … Owner: ….` on line 1.
* `select-suites.mjs` answers ALL for this diff (a migration changed), so the merge check goes red.
* Fix: one line, for example `// platform-import.prisma — import batches of the one import engine (PF-10a; AG-18 §7). Owner: Lead B (platform, P-559).` Keep the rest of the comment below it.

**M2 (Major, Must): the `module-cards` CI check is red.**
* Where: `api/src/platform/MODULE.rows/PF-10a.md:1` writes `` `prisma/schema/platform-import.prisma` `` in backticks.
* `module-cards.py check_fragment` resolves every backticked path. `check-module-cards.sh:37` builds its tree copy from `api/src`, `web/src` and `tests` only, so "tree: as on this branch" fails, and so does "a good row fragment". Reproduced locally and in CI job 137883581689. This is the first fragment that names a `prisma/` path.
* Fix: write the path without backticks, or leave it out (the migration name is enough).

**Minors**
* **m1 (Must for merge, PR body only): `pr-rules` red.** "MISSING: no "Duplicate check:" line." Add the row's duplicate check to the PR body.
* **m2 (Should): three Owner-check rules have no failing test** (`migration.sql:167`, `migration.sql:168`, `migration.sql:171`). Removing any of them leaves all 42 checks green:
  * `s.status = 'ACTIVE'`;
  * `g.ended_at IS NULL`;
  * `NEW.at := clock_timestamp()`.
  * Add: a suspended Owner refused, an Owner whose grant has ended refused, a backdated `at` replaced. Add one attestation insert as `xr_app` inside a firm session, which proves the definer function under the wall. The suite inserts attestations only as the owner role; I checked the `xr_app` path by hand.
* **m3 (Should): the frozen-facts test covers 4 of the 9 frozen columns** (`tests/check_pf10a_import_schema.ts:159-161`). `source_name`, `file_kind`, `created_at` and `id` are frozen by `migration.sql:154-155` but untested. Add `source_name` and `file_kind` to the list.
* **m4 (Should, record it): the reasons check enforces the shape of a reason, not where its words came from.** A raw value that looks like a name passes `pf_import_reasons_ok`, for example `{"field":"Smith","rule":"JaneDoe"}` or `"jane.doe-1975"` (`migration.sql:124`). The Done-when is met as written. The rest of AG-18-12 is PF-10b's job: reasons must be built only from the target schema's field and rule identifiers. Say so in the fragment or in PF-10b's brief, so PF-10b's test covers it.
* **m5 (Could): race with an Owner's demotion.** The Owner check reads the grant without a lock (`migration.sql:165-168`). An attestation can therefore commit while that Owner's grant is being ended. `PERFORM 1 … FOR SHARE OF g` would close it. Low risk.

## Notes for later rows (not findings, no new scope)
* PF-10b, resume:
  * a dry-run outcome and an applied outcome share one row, and nothing marks which is which;
  * the code can tell them apart by `record_id` or `before_image` being set, but write that rule down before relying on it;
  * a SKIP cannot name the record it matched (`plat_import_row_outcome_shape`).
* PF-10b, saved mappings: `saved_at` is set only on insert. A re-save must set it.
* PF-10b, row-level reasons: a reason that belongs to the whole row still needs a field name (it must start with a letter).
* PF-10b, the actor: the database cannot tell who made the request (there is no session actor). The route must check that the Owner is the person recording the attestation.
* PF-11c: attestations have no delete path. The firm purger keeps them, as it keeps audit lines, or needs a named exception.
* PF-11c: before-images hold personal data after the 14-day undo window. Their retention belongs to PF-10b and PF-11c.

## Could not check
* A real RDS run beyond `check_pf8b_f4_migrations`.
* The full demo reset on an isolated copy. Not needed: no existing table is touched.
* `check_csw1_firm_id` and `check_cssd1_no_drift`: they need a running copy on :4440 and the Mac's binary path. Their failures here come from the environment and are unrelated to this diff.

## Head moved during this review
The branch moved to **6f6502570** while I worked: 4f11a86ce "step 5 — break round 1 fixes" and the breaker's `break-report.md`. This review and its verdict cover **9d717c8ec** only.
* M1 and M2 are still there at 6f6502570. I checked the files: `platform-import.prisma` still has `Owner:` on line 2, and the fragment still puts the prisma path in backticks.
* m4 is the same finding as the breaker's F3.
* My hand probes ran in this shared checkout and may have read the step-5 migration. Every number above comes from the 9d717c8ec suite run and the files of 9d717c8ec.
* 6f6502570 needs its own round.

**Verdict: Block** — fix M1, M2 and m1 (CI). Then m2 and m3 are worth the same round.

Reviewer: Block 9d717c8ec8afa96f0846c7737dde4db5532d342b

---

## Round 2 (23 Nov 2026): commit 68c32637c62bdd9133933f58f7836a99f37ac6b4
Diff `9d717c8ec..68c32637c`: step 5 (the breaker's F1–F6) and step 6 (my round 1).

**What I ran**
* `check_pf10a_import_schema.ts`: **63 passed, 0 failed**.
* `check_prisma_schema` 8/8, `check_pf12_walls` 110/110, `check_pf8b_f4_migrations` 9/9, `check_pf0p_ports` 127/127.
* `check-module-cards.sh` passes.
* CI on this head: module-cards and the latest pr-rules run are green.
* As `xr_app` on a scratch database with every migration plus the Sample firms, I played PF-10b's flows.
* The rollback in one transaction left no `plat_import`/`pf_import` object and no migration row, and the migration then re-applied cleanly. Database dropped.

**Round 1 items:** M1, M2 and m1 are fixed, and m3 is fixed (7 frozen columns tested).
* m2: fixed. There are tests for a deactivated Owner, an ended grant, a backdated `at`, and an `xr_app` insert.
* m4: recorded as PF-10b's rule at `migration.sql:15-16`.
* m5: fixed with `FOR SHARE OF s, g` (`:228`). The reader holds UPDATE on both tables, so the lock is allowed.

**Breaker's F1–F6:** each has a pass/fail check, and those checks pass.

**What PF-10b (BACKLOG.md:1039) can do, as `xr_app`:**
* Resume works: `ON CONFLICT DO NOTHING` on the new key gave `INSERT 0 0`.
* Deleting a dry run's rows before RUNNING and writing the run's rows fresh works.
* A crash during UNDOING: the job can resume, because a batch may stay in the same state and UNDOING → UNDONE stays open.

**Majors**
* **M3 (Must): a dry run cannot store its per-row outcomes.**
  * Where: `plat_import_row_outcome_shape` now requires a record kind and id on every CREATE and MERGE, and a before-image on every MERGE, whatever the batch state (`migration.sql:140`, `:142`).
  * Why that fails: a dry run writes nothing to the target records (AG-18-15), so a would-be CREATE has no record id. I tried each as `xr_app` and each was refused:
    * a dry-run CREATE row;
    * a dry-run MERGE row with no before-image;
    * a duplicate SKIP that names its match.
  * The rest of the change assumes dry-run rows do live here: `migration.sql:13`, the row-delete exception in `pf_import_kept` (`:205-208`, "a dry run's rows"), and `platform-import.prisma:80`.
  * The test's "redone dry run" uses only SKIP rows (`tests/check_pf10a_import_schema.ts:198`), so it misses this.
  * Effect: PF-10b's preview (totals plus per-row outcomes with reasons, up to 5,000 rows, paged in PF-10s) would need a new migration, made-up record ids, or a store outside the firm wall.
  * Fix, the tech lead's choice:
    * (a) A `phase` column (`DRY_RUN | RUN`), part of the row key. The CREATE/MERGE record and before-image rules apply only to RUN rows, and only DRY_RUN rows may be deleted, and only before RUNNING. This also gives the "previewed versus applied" marker from round 1's notes.
    * (b) Record on the PR that dry-run outcomes are not stored in this table, say where PF-10b keeps them, and correct the three comments.

**Minors**
* **m6 (Should): rows can be added to a batch in any state.**
  * I added a row to a FAILED batch as `xr_app` and it was accepted. Batches in COMPLETED, PARTIAL, UNDOING and UNDONE also have no insert check.
  * So a MERGE with a made-up before-image can be added after the run, and undo would then "restore" it. This is F1's risk by another door.
  * Fix: on insert, the batch must be DRAFT, DRY_RUN_READY or RUNNING (read with `FOR SHARE`).
* **m7 (Could): row deletes can race the move to RUNNING.** The delete exception reads the batch state with no lock (`migration.sql:208`), so a delete can commit at the same moment as DRY_RUN_READY → RUNNING. Fix: `FOR SHARE` on the batch.
* **m8 (Should, record it): a FAILED batch can never be undone** (`:171-172`; AG-18-39 allows undo only for COMPLETED and PARTIAL).
  * PF-10b must therefore mark any run that created or merged something PARTIAL, never FAILED. Otherwise those records are stranded.
  * Fix: say so in PF-10b's brief, or enforce that FAILED means `created_count = merged_count = 0`.

**Notes (not findings)**
* Rows can no longer be updated, so undo progress cannot be marked on them. The undo job must be idempotent, and its "worked on since" test must not count undo's own restore.
* An abandoned DRAFT batch stays for ever. AG-18's state list has no "cancelled".
* PF-11c's purge needs a named exception for batches, rows and attestations.

**Journey score (round 2): 8/10, no criterion at 0** (round 2 section of the journey report).

**Verdict: Block** — fix M3 (either option). m6 and m8 are worth the same round.

Verdict: Block

Reviewer: Block 68c32637c62bdd9133933f58f7836a99f37ac6b4

---

## Round 3 (23 Nov 2026): commit 5a8665e8f0630c04f9407e5327bc843f457496d9
**Verdict: Approve.** No Blocker or Major is open.

**What I ran**
* `check_pf10a_import_schema.ts`: **82 passed, 0 failed**.
* `check_prisma_schema` 8/8, `check_pf12_walls` 110/110, `check_pf8b_f4_migrations` 9/9.
* The rollback removes every `plat_import`/`pf_import` object, including `PlatImportRowPhase`, and the migration re-applies cleanly.

**PF-10b's flow, replayed as `xr_app` in firm A's session on a scratch database (dropped):**
* The dry run stores its preview with phase DRY_RUN: a CREATE with no record yet, a MERGE naming its match with no before-image, a SKIP naming its match, an ERROR with reasons.
* A mapping change with the same hash is refused. A redone dry run deletes and rewrites the preview and sets a new hash.
* The attestation is set, then the batch moves to RUNNING; the preview is kept beside the run.
* The run writes its rows with phase RUN, one transaction each. A CREATE names its record and a MERGE carries its before-image. A resumed row 2 with `ON CONFLICT DO NOTHING` writes nothing.
* The run reaches COMPLETED, then UNDOING. A resumed undo stays in UNDOING, then moves to UNDONE.
* A second batch with one record created cannot end FAILED (`finish_shape`). It ends PARTIAL, then UNDOING, then UNDONE.
* Refused, as intended:
  * deleting the preview while RUNNING;
  * a RUN row after COMPLETED;
  * firm B's id in firm A's session;
  * `xr_app` calling the trigger function directly.

**M3 is resolved** by option (a). R2-F1, m6 (rows follow the batch state under `FOR SHARE`), m7 and m8 are resolved too.

**Notes for PF-10b (not findings)**
* The attestation must be set in an update before the move to RUNNING, not in the same update. Two statements in one transaction are fine.
* Every RUN row insert takes `FOR SHARE` on the batch. If parallel workers each insert a row and then update the batch counts in the same transaction, two of them can deadlock. Run the rows from one worker, or lock the batch `FOR UPDATE` before inserting.
* The counts must be final before or in the finishing update.

Verdict: Approve

Reviewer: Approve 5a8665e8f0630c04f9407e5327bc843f457496d9
