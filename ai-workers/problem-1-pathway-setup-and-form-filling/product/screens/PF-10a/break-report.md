# PF-10a break report: import batch tables (schema only)

**Commit:** 9d717c8ec, branch `claude/bold-fermi-fe7khf` (PR #3276). **Target:** `studio/prisma/migrations/20261124050000_pf10a_import_tables/migration.sql` (cited as `mig:N`), `rollback.sql`, `prisma/schema/platform-import.prisma`.
**Set-up:** scratch DB `xr_studio_pf10a_break_27647` on 127.0.0.1:54329, built by applying every migration with `psql -v ON_ERROR_STOP=1`. It was seeded as xr_studio with firm A, firm B and these firm-A staff: an active Owner, an Admin, an Owner whose grant has ended, a DEACTIVATED Owner, a SUSPENDED Owner. Firm B has one Owner. All app calls ran as `xr_app` inside `begin; select set_config('app.firm_id','<firm>',true); …; commit;`, written below as **[A]** or **[B]**. Also run: `check_pf10a_import_schema.ts` (42/42), `tools/rds-shape-check.sh 15461` (21/21), an RDS-shaped attestation probe, and a rollback catalogue comparison. All scratch DBs and clusters were dropped. Nothing was edited or committed.
Scope: only what PF-10a builds (BACKLOG PF-10a). The import engine, routes and UI are PF-10b and later and are not findings.

## Findings

**F1 — Major — "a batch's facts never change" can be bypassed with DELETE and re-INSERT. A batch's rows (the undo data) can be rewritten or deleted.**
`xr_data` still holds DELETE on `plat_import_batch` and DELETE/UPDATE on `plat_import_row`. Only the attestation's privileges are revoked (`mig:183`). The facts trigger fires only on UPDATE (`mig:152-160`).
Repro: when the batch has no rows (or after its rows are deleted), [A]
`delete from plat_import_batch where id='<bA>'; insert into plat_import_batch (id, firm_id, target_key, source_name, file_key, file_sha256, file_kind, mapping, importer_staff_id, created_at) values ('<bA>','<A>','company','Other','k/evil.csv',repeat('c',64),'XLSX','{}','<otherStaff>','2020-01-01') returning file_sha256, target_key, created_at;`
→ commits. Under the same id, every field the trigger claims to freeze has changed: hash `cccc…`, target `company`, created_at backdated to 2020-01-01.
Row data, [B]: `update plat_import_row set before_image='{"email":"attacker@x.test"}' where batch_id='<bB>'` → OK. `update … set before_image=null` on a MERGE row → OK. `update … set batch_id='<bB2>'` (moves rows to a different batch) → OK. `delete from plat_import_row where batch_id='<bB2>'; delete from plat_import_batch where id='<bB>'` → "batch gone".
Why it matters: undo restores before-images and removes what this batch created (AG-18-39/-40). A run must match the dry run's file hash (AG-18-16). Neither is protected at the database, although the migration header (`mig:10`) says they are. `written_at` and `created_at` can also be set to any value at insert (unlike the attestation, whose `at` is forced by its trigger, `mig:171`).

**F2 — Minor — a MERGE does not have to keep what it overwrote, and a CREATE or MERGE does not have to name its record.** The check at `mig:135-137` enforces "before_image only on a MERGE" but not the other direction. The comment at `mig:130` ("a merge keeps what it overwrote") and the schema doc (`platform-import.prisma:76-78`, "for undo") promise more.
Repro [B]: `insert into plat_import_row (id, firm_id, batch_id, row_number, outcome) values (gen_random_uuid(),'<B>','<bB2>',1,'MERGE'),(gen_random_uuid(),'<B>','<bB2>',2,'CREATE')` → both accepted, with record_id and before_image NULL. Undo cannot reverse either row.

**F3 — Minor — the reasons check tests the shape of a name, not that it is one of a known list of names. A value that looks like a name passes unchanged (AG-18-12).** `mig:113-127`.
Repro [B]: insert an ERROR row with reasons such as `[{"field":"postal","rule":"M5V3L9"}]`. Each of these was **accepted**: `M5V3L9` (postal code), `AB1234567` (passport-shaped), `jane.doe` (email local part), `example.com` (domain), `Jean-Pierre` (given name), `p4165551234` / `s046-454-286` (phone or SIN behind a one-letter prefix), `D1990-01-01` (date).
Judgement: a value that is digits only or starts with a digit, or that contains `@`, a space or an apostrophe, is refused. So a phone number or SIN gets through only if someone deliberately prefixes it. But postal codes, ID numbers, local parts, hyphenated names and allowed-value labels (AG-18-9's "unmapped value", e.g. `Married`) are already name-shaped. The comment's "a raw value from the file has nowhere to go" (`mig:6`) is true for shape only. Any leak stays inside the firm's own data, so this is Minor. Options: keep `rule` to a closed list in the check, or reword the claim and put the "field is a target field key, rule is an engine rule" test in PF-10b.

**F4 — Minor — the batch's record of what happened can be rewritten after it finishes.** The facts trigger (`mig:154-155`) leaves out `attestation_id`, `mapping`, `dry_run_hash`, `undo_deadline`, `finished_at` and the order of states.
Repro [A]: `update plat_import_batch set attestation_id=null, state='COMPLETED' where id='<bA>'` → OK (the AG-18-49 link is gone after the run). Then `update … set state='UNDONE'; update … set state='DRAFT', undo_deadline=now()+interval '100 years', finished_at='1990-01-01', mapping='{"x":"y"}'` → OK.
The attestation itself is insert-only, but nothing protects the batch's pointer to it.

**F5 — Minor — another firm can learn how many rows a batch has.** The unique index `plat_import_row(batch_id, row_number)` (`mig:94`; `platform-import.prisma:93`) has no `firm_id`, and it is checked before the (firm_id, batch_id) key.
Repro [A], with firm B's batch id: `insert into plat_import_row (id, firm_id, batch_id, row_number, outcome) values (gen_random_uuid(),'<A>','<bB2>',1,'SKIP')` → `duplicate key … plat_import_row_batch_id_row_number_key`. With row_number 18 → `violates foreign key constraint plat_import_row_firm_id_batch_id_fkey`. Bisecting on row_number gives firm B's batch size.
This needs B's random UUID, so it is Minor. A unique key on `(firm_id, batch_id, row_number)` would close it. The plain primary-key existence leak (`plat_import_batch_pkey`) happens on every table in the codebase and is not counted here.

**F6 — Minor — invisible text passes the blank checks.** `btrim` removes spaces only (`mig:140-141`, `mig:149`).
Repro [A]: an attestation with `wording_version = E'​'` → accepted. A batch with `source_name = E'​'` and `file_key = E'\t'` → accepted. Other tables in the codebase already refuse U+200B in emails (the `platform_firm_*_email_lower` checks).

## What held
- **Firm walls (AG-18-52):** firm A's session saw 0 of B's rows in all four tables, while B saw its own. UPDATE/DELETE … RETURNING across firms returned nothing and changed nothing. `INSERT … ON CONFLICT (id) DO UPDATE` aimed at B's batch was refused by RLS. A mapping upsert on B's natural key only touched A's own key. With no firm set, writes are refused (`platform_firm_first`).
- **Error messages:** FK and RESTRICT errors carry no key values ("Key is not present" / "Key is referenced"), because RLS hides the DETAIL.
- **Attestation writer:** `0_pf12_firm_first` fires before `pf_import_attestation_owner`, so the SECURITY DEFINER read never runs for another firm. The error text is the same whether or not the staff exists, so it gives no oracle. Refused: Admin, ended Owner grant, DEACTIVATED with an open Owner grant, SUSPENDED, firm B's Owner for A (in either session), firm A's Owner on a firm-B row.
- **Attestation insert-only:** UPDATE, DELETE, TRUNCATE, `ON CONFLICT DO UPDATE`, and `MERGE … UPDATE` / `MERGE … DELETE` → "permission denied". `ALTER TABLE … DISABLE TRIGGER` → "must be owner". `at` is forced to `clock_timestamp()` (an insert with `at='2001-01-01'` was ignored).
- **Batch facts:** UPDATE of `file_sha256`, `id` or `created_at`, and the upsert path, are refused by the trigger. A 63-character or upper-case hash and negative counts are refused.
- **Reasons:** refused `é`, `K` (U+212A), `ı`, fullwidth `Ａ`, `a\n`, U+200B, a combining accent, the key `Field`, nested objects and arrays, a null element, `=cmd`, a trailing space, and 51 elements. With duplicate JSON keys, jsonb keeps only the last value, so an earlier raw value is never stored. `\u0000` is refused by jsonb itself.
- **Migration:** applies after itself on an empty copy and on a demo-data copy, and `migrate diff` is empty (check 42/42).
- **RDS shape:** a non-superuser BYPASSRLS admin applied every migration including this one (21/21). On that cluster: the three pf_import functions are owned by `xr_wall_reader` (SECURITY DEFINER), the reader has no CREATE on public afterwards, the Owner's attestation is written, the Admin is refused, UPDATE is denied and the hash freeze holds. An admin **without** BYPASSRLS stops at PF-12, as that script says it should, so it never reaches PF-10a. That is the platform's stated contract, not a PF-10a defect.
- **Rollback:** run with `-1` (after creating `_prisma_migrations`), it leaves no `pf_import_%` function and no `PlatImport%` type or table. The reader's CREATE grant and the default ACLs match a database migrated only up to the previous migration. Without `_prisma_migrations` it aborts cleanly; 12 of the 15 rollback files share that pattern. A full schema diff was not possible because the pg_dump wrapper is version 16 against an 18 server.
- **Budget:** 5,000 ERROR rows with 50 reasons each inserted in 1.7 s. The per-batch report query uses `(batch_id, row_number)`.

Not findings (outside PF-10a or by design): `xr_app` can `SET ROLE xr_staff_bypass` (PF-12's logged bypass role). The database proves that the named staff member is an active Owner, not that the Owner was the one acting; that check belongs to PF-10b.

Verdict: Changes

## Round 2 — commit 68c32637c62bdd9133933f58f7836a99f37ac6b4 (diff 9d717c8ec..68c32637c)

**Set-up:** fresh scratch DB `xr_studio_pf10a_break_r2_10958`, built with every migration and the same seed. App calls as before, written **[A]** or **[B]**. Also run: `check_pf10a_import_schema.ts` (63/63); an RDS-shaped throwaway cluster (non-superuser BYPASSRLS admin, `prisma migrate deploy`); a rollback catalogue comparison on two fresh DBs. All dropped. Nothing was edited or committed. Line numbers (`mig:N`) refer to this commit.

**R2-F1 — Major — another firm can use the SECURITY DEFINER trigger functions through a temp table: they answer about firm B and lock firm B's rows.** `pf_import_kept()` (`mig:205-213`) and `pf_import_attestation_owner()` (`mig:222-233`) run as `xr_wall_reader` (BYPASSRLS). They are executable by PUBLIC, and they trust `OLD`/`NEW` without checking which table fired them or the session's firm. `xr_app` holds TEMP on the database.
Repro [A], firm A's session (also reproduced as xr_app on the RDS-shaped cluster):
```sql
create temp table plat_import_row (firm_id uuid, batch_id uuid) on commit drop;
create trigger t before delete on pg_temp.plat_import_row for each row execute function public.pf_import_kept();
insert into pg_temp.plat_import_row values ('<B>','<B batch 1>'),('<B>','<B batch 2>');
delete from pg_temp.plat_import_row where batch_id='<B batch 1>';  -- returns the row: B's batch is DRAFT/DRY_RUN_READY
delete from pg_temp.plat_import_row where batch_id='<B batch 2>';  -- "kept for undo … (DELETE refused)": RUNNING or later, or no such batch
create temp table p (firm_id uuid, owner_staff_id uuid, at timestamptz) on commit drop;
create trigger t before insert on pg_temp.p for each row execute function public.pf_import_attestation_owner();
insert into p values ('<B>','<B staff id>',null) returning at;  -- succeeds only if that staff member is an active Owner of B
```
While firm A's transaction stays open, the `FOR SHARE OF s, g` lock is held on **firm B's** staff and grant rows. [B]'s `update platform_staff set display_name=… where id='<B owner>'` waited and was cancelled by `lock_timeout` ("while locking tuple (0,6) in relation platform_staff"). So firm A can stall firm B's renames, deactivations and Owner-grant changes for as long as it likes.
It needs B's UUIDs, so this is Major, not Blocker. The round-1 `pf_import_attestation_owner` had the same oracle, without the lock; I missed it in round 1.
Fix in this row: in each function, refuse unless `TG_RELID` is the expected `public.*` table, and/or unless `OLD/NEW.firm_id = platform_session_firm()` for a caller without bypass; `REVOKE EXECUTE … FROM PUBLIC` on the five functions.
**Note for the lead:** 116 trigger functions owned by `xr_wall_reader` are executable by xr_app (query on `pg_proc`), so the same class may exist outside PF-10a (PF-12's area).

**R2-F2 — Minor — rows can still be added to a batch after its run has ended.** There is no INSERT rule on `plat_import_row`; `mig:216` covers UPDATE/DELETE only.
Repro [A]: batch DRAFT→DRY_RUN_READY→RUNNING→COMPLETED, then `insert into plat_import_row (…, outcome, record_kind, record_id, before_image) values (…,777,'MERGE',…,'person','<any record>','{"email":"planted@x.test"}')` → accepted. After UNDOING→UNDONE, a CREATE row → accepted. Undo would "restore" the planted before-image.
The run itself must insert rows, so the window can only be narrowed: allow inserts only in DRAFT, DRY_RUN_READY or RUNNING.
Related race: the row-delete check does not lock the batch row. T1 deletes a dry-run row while the batch is DRY_RUN_READY; T2 moves the batch to RUNNING without waiting (0.01 s); T1 commits; result is RUNNING with 0 rows. Only pre-run rows can be lost this way. `FOR SHARE` on the batch row in `pf_import_kept` would close it.

**R2-F3 — Minor — the finish time, undo deadline and counts are not tied to the run, and "set once" freezes an early wrong value.** `mig:182-185`, `191-200`.
Repro [A]: `insert … on conflict (id) do update set error_count=99, undo_deadline=now()+interval '100 years', finished_at='1990-01-01'` on a DRAFT batch → accepted. A plain UPDATE in DRAFT does the same.
That batch's real completion is then refused ("the finish time and the undo deadline are set once"), and its undo window never closes (AG-18-39).
Counts still change in UNDONE (`created_count=5000` accepted). The born-draft rule holds only at the moment of insert.

**R2-F4 — Minor — the mapping and dry-run hash can change after the dry run, including in the same UPDATE that starts the run.** The freeze tests `OLD.state` (`mig:178-181`).
Repro [A]: in DRY_RUN_READY, `update … set mapping='{"Phone":"email"}'` → OK. Then `update … set state='RUNNING', dry_run_hash=repeat('c',64), mapping='{"Other":"email"}'` → `RUNNING`.
The run then uses a mapping its dry run never checked (AG-18-16). PF-10b's hash check is the remaining guard.

**R2-F5 — Minor — the text checks do not reject invisible characters, and they refuse non-Latin names.** `mig:146-147`, `152`. `[[:cntrl:]]` does not match format characters, and `~ '[A-Za-z0-9]'` only requires one ASCII letter or digit somewhere.
Accepted as `source_name`: `E'A​B'`, `E'CRM‮gpj.exe'` (right-to-left override; it displays as "CRMexe.jpg"), `E'A '`, `E'A B'`.
Refused: `'Экспорт'` and `'客户导出'` (non-English export names; `'Экспорт CRM'` passes).
`file_key` accepts `a/../../etc/passwd`. It is system-generated, so this is for FilesPort to note, not counted.

### Round 2 — what held
- **Batch removal:** DELETE/TRUNCATE of batches, and UPDATE/TRUNCATE/`ON CONFLICT DO UPDATE` of rows → "permission denied"; the triggers stand behind the revokes.
- **Rows of a run:** deleting a row of a RUNNING batch is refused, including in the same statement as a state change (`with u as (update … set state='DRY_RUN_READY') delete …` → refused). RUNNING→DRY_RUN_READY is refused, so a batch cannot be moved back to unlock its rows.
- **State moves:** DRAFT→RUNNING and DRAFT→COMPLETED (including through `ON CONFLICT DO UPDATE`) are refused. A CTE double hop (`with a as (update … 'DRY_RUN_READY') update … 'RUNNING'`) applies only the first update (PostgreSQL ignores a second update of the same row in one statement). RUNNING needs a dry-run hash. Mapping, hash and attestation are refused from RUNNING on.
- **Born-draft:** non-DRAFT and counted inserts are refused. `created_at` on insert is replaced by the database time. An upsert setting `created_at=excluded.created_at` is refused.
- **Row shape and key:** a MERGE without a before-image, and a CREATE without a record, are refused (check 63/63). The unique key is `(firm_id, batch_id, row_number)`, which closes round-1 F5.
- **FOR SHARE (normal use):** two concurrent attestations both succeed. Ending the Owner's grant waits for the open attestation (1.5 s), then proceeds. It works as xr_app on the RDS shape (the reader has UPDATE there).
  Caveat (not counted): two transactions that both attest and then both update the same Owner's `platform_staff` row deadlock ("deadlock detected … while locking tuple in relation platform_staff"). PF-10b should not touch the staff row in the attestation transaction.
- **Rollback:** after `rollback.sql -1`, the catalogue matches a database migrated only to the previous migration: relations, functions (owner, definer, ACL, source hash), types, policies, constraints, schema ACL, default ACLs, role memberships and the `_prisma_migrations` row. The only differences are OID-named internal triggers. No `pf_import_%`/`PlatImport%` objects remain.
- **RDS shape:** every migration applied as the non-superuser admin. All five pf_import functions are owned by `xr_wall_reader` (SECURITY DEFINER). The reader has no CREATE on public afterwards. Attestation and refusal as in round 1.

Verdict: Changes (for 68c32637c62bdd9133933f58f7836a99f37ac6b4)

## Round 3 — commit 5a8665e8f0630c04f9407e5327bc843f457496d9 (diff 68c32637c..5a8665e8f)

**Set-up:** fresh scratch DB `xr_studio_pf10a_break_r3_20194` with the same seed, plus two DBs for the rollback comparison; all dropped. Also run: `check_pf10a_import_schema.ts` (82/82); `tools/rds-shape-check.sh 15491` (all passed); an RDS-shaped probe (attestation; DRY_RUN row written and deleted; RUN row written while RUNNING, all as xr_app). No code edited, nothing committed. **No Blocker or Major.** Four Minor findings, all for PF-10b's engine or a later small row.

**R3-F1 — Minor — R2-F4's freeze can be bypassed by sending the batch back to DRAFT.** Repro [A] on a DRY_RUN_READY batch: `update … set state='DRAFT', mapping='{"Phone":"email"}'; update … set state='DRY_RUN_READY'; update … set state='RUNNING'` → `RUNNING` with the **old** `dry_run_hash` and the new mapping. The new rule (`mig:197-202`) only covers DRY_RUN_READY→DRY_RUN_READY. Clearing `dry_run_hash` on the move to DRAFT, or refusing DRAFT→DRY_RUN_READY with the hash unchanged after a mapping change, would close it. PF-10b's hash recomputation (AG-18-16) is the remaining guard.

**R3-F2 — Minor — FAILED does not mean the run created nothing; only the self-reported counts are checked.** Repro [A]: while RUNNING, insert a RUN `CREATE` row (with record); then `update … set state='FAILED', finished_at=now()` → `FAILED|0|1` (created_count 0, one RUN CREATE row). FAILED cannot move to UNDOING, so undo can never reach that record (`mig:160-164`). The engine must keep counts and rows consistent, or the check would have to look at rows.

**R3-F3 — Minor — the new FOR SHARE makes two concurrent row writers on one batch deadlock.** `mig:255`. Repro: two transactions each `insert … phase 'RUN'` and then `update plat_import_batch set skipped_count = skipped_count + 1` → "deadlock detected … while locking tuple in relation plat_import_batch". One is aborted. Each holds a share lock and then wants the row lock. A single worker (row then count) works. A state change waits for an open row writer (1.2 s), as intended. PF-10b should use one writer per batch, or lock the batch `FOR NO KEY UPDATE` before the row.

**R3-F4 — Minor — names that are entirely invisible still pass.** `mig:154`, `166`. Accepted as `source_name` with nothing else in the name: U+3164, U+FFA0, U+115F (Hangul fillers, which count as letters), U+2800 (braille blank), a lone U+0301. Accepted inside a name: U+180E, U+061C, U+034F, U+FE0F, tag characters U+E0041.
All the listed ranges (U+200B–200F, U+202E, NBSP, U+2066) are refused. Arabic, Russian and Chinese names are accepted. `file_key` refuses `/./`, `/../`, `//` and a trailing `..`, but accepts `a/b/` and `a/.../b` (harmless).

Not counted: `finished_at` and `undo_deadline` take any values at the finish (`'1990-01-01'` / `'2999-01-01'` accepted). Only "set once" and "shape" were claimed; the 14-day value is PF-10b's (Sample).

### Round 3 — what held
- **R2-F1 closed.** All six trigger functions have `proacl = {xr_wall_reader=X}`. xr_app gets "permission denied for function" when attaching `pf_import_row_open` or `pf_import_attestation_owner` to a look-alike temp table. With `set local search_path = pg_temp, public` and a temp `plat_import_row`, the real attestation still works: `'public.…'::regclass` is schema-qualified. A row naming firm B's batch is refused by the key, the firm guard means no lock is taken, and B's batch update was not blocked.
- **R2-F2 closed.** RUN row in DRAFT, DRY_RUN row inserted or deleted while RUNNING, RUN row deleted while RUNNING, RUN row in COMPLETED and in UNDOING: all refused with the row-open message. The round-2 race is closed: the job's state change now waits for an open row writer.
- **R2-F3 closed.** The legitimate single-UPDATE finish (state, counts, finished_at, undo_deadline) works, and so does counts-then-state in two UPDATEs. Refused: COMPLETED without finished_at, FAILED with an undo deadline, FAILED with created_count 1, counts changed in UNDOING.
- **Row shape:** a DRY_RUN MERGE with a before-image and a DRY_RUN ERROR naming a record are refused.
- **Rollback:** after `rollback.sql -1`, the catalogue (relations, functions with owner, ACL and source hash, types including `PlatImportRowPhase`, triggers, policies, constraints, schema ACL, default ACLs, memberships, `_prisma_migrations`) is identical to a database migrated only to the previous migration.

Verdict: Approve (for 5a8665e8f0630c04f9407e5327bc843f457496d9)
