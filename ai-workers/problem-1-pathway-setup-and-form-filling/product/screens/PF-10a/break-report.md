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
