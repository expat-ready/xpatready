# PF-22a part 1: break report (R1.95, PR #3639, head ecee6634a)

Scope: schema only (`platform-custom.prisma`, migration `20261125090000_pf22a_custom_fields` with its rollback, and `tests/check_pf22a_custom_schema.ts`). No UI and no routes, so UI items (keyboard, 1024 px, zoom, uploads) do not apply. Scratch DB `xr_studio_pf22a_break` on 127.0.0.1:54329, built from every migration in order and seeded with `seedSampleFirms`. Two more copies (pre-migration, and migrate then rollback) were used for the residue check. All three are dropped. Firm A = sample-firm, B = sample-solo. "As app" means role `xr_app` inside `begin; select set_config('app.firm_id', A, true); …; commit` (the test's `asApp`). Each repro below sets up a field F of firm A with `created_by` = A's staff.

## Findings

**M1 (Major): REPEATABLE READ / SERIALIZABLE defeat DW5 (type change and option removal on a field with values)**
`pf_custom_field_kept` uses `EXISTS (SELECT … FROM plat_custom_value … FOR SHARE)` to look for values. At RR or SERIALIZABLE, that subquery reads the transaction's snapshot. If a value is committed after the snapshot, the check does not see it. The value writer's `FOR SHARE` on the field row only locks the row and does not change it, so the field UPDATE gets no serialization error. The codebase does use `isolationLevel: RepeatableRead` (client-money reads, `messages/send/messages.ts:120`).
```sql
-- setup (xr_studio): F NUMBER, no values
-- S2 (as app): BEGIN ISOLATION LEVEL REPEATABLE READ; SELECT set_config('app.firm_id','<A>',true);
--              SELECT count(*) FROM plat_custom_value WHERE field_id='<F>';            -- 0, snapshot taken
-- S1 (as app): BEGIN; SELECT set_config('app.firm_id','<A>',true);
--              INSERT INTO plat_custom_value (id,firm_id,field_id,entity_kind,entity_id,value,updated_by,updated_at)
--              VALUES (gen_random_uuid(),'<A>','<F>','fo_prospect',gen_random_uuid(),'42','<A staff>',now()); COMMIT;
-- S2:          UPDATE plat_custom_field SET type='DATE', updated_at=now() WHERE id='<F>'; COMMIT;   -- UPDATE 1
SELECT f.type, v.value, pf_custom_value_ok(f.type, f.options, v.value) FROM plat_custom_field f JOIN plat_custom_value v ON v.field_id=f.id WHERE f.id='<F>';
-- DATE | 42 | f
```
- Expected: S2's UPDATE is refused, either "the type of a field with values never changes" or a serialization failure.
- Actual: UPDATE 1. The stored value no longer fits its field. Any later update to that row is refused ("does not fit its field's type (DATE)"), so the row is stuck.
- Also reproduced: SELECT options `["Keep","Drop"]` changed to `["Keep"]` while S1 wrote `"Drop"` (the stored value is outside the options). The same happens with S2 at SERIALIZABLE when S1 is READ COMMITTED (SSI does not cover mixed isolation levels).
- Held: the same race with S2 at READ COMMITTED (refused correctly), and the reverse order (value writer at RR after a committed field change gets "could not serialize access").
- Suggested fix (pick one):
  - (a) Have the value trigger write to the field row once, for example a `has_values boolean` that it sets with `UPDATE … WHERE NOT has_values`. A field UPDATE at RR or SERIALIZABLE then gets a serialization failure, and the type check can read `OLD.has_values`.
  - (b) In `pf_custom_field_kept`, refuse a type or options change when `current_setting('transaction_isolation') <> 'read committed'`.
- Add a two-session RR case to the test either way.

**m1 (Minor): blank or invisible text gets past the "1+ characters" rule**
`btrim` removes only ASCII spaces. `pf_custom_value_ok('TEXT','[]', v)` returns true for `"\t"`, `"\n\n"`, `" "`, `"​"` and `"　"`; LONG_TEXT behaves the same. Labels (`E'\tTabbed'`, `E' '` were inserted) and options (`[" "]`, `["​"]`, `["\tYes","Yes"]`, `["Yes","Yes "]`) pass too. Expected: refused, which is what zod's `.trim().min(1)` does for Unicode whitespace. Actual: accepted. Fix: test `s ~ '[^[:space:] ​ 　﻿]'` (or use `regexp_replace` with the `\s` class) in value, label and option checks.

**m2 (Minor): the option case-duplicate check is ASCII-only and depends on collation**
The scratch cluster uses collation C. There, `pf_custom_options_ok('SELECT', '["Élan","élan"]')`, `'["ÉLAN","élan"]'`, `'["Straße","STRASSE"]'` and `'["café","café"]'` (NFC vs NFD) all return true, while `'["Yes","YES"]'` returns false. On an en_US/ICU cluster the first two would be refused. That means an IMMUTABLE CHECK gives a different answer per environment. Fix: compare `lower(normalize(x, NFC) COLLATE "und-x-icu")`, or another explicit collation, and document it.

**m3 (Minor): loose PHONE, EMAIL and URL shapes**
Accepted: PHONE `"(((("`, `"(   )"`, `"0---"` (no digit is required after the first character). EMAIL `"<script>@x.y"`, `"a@b..c"`, `"a@b.c "`, `"a b@c.d"`. URL `"https:// "`, `"https://a b"`. Expected: refused, as the header says the checks match the API's zod schema. Fix: PHONE requires at least 4 digits (`length(regexp_replace(s,'[^0-9]','','g')) >= 4`), and EMAIL and URL also refuse Unicode spaces and separators and `..`.

**m4 (Minor): NUMBER keeps precision JSON/JS cannot represent**
`1e-400`, `0.12345678901234567890123456789` and `999999999999999.9` are accepted and stored exactly. JS reads them as 0, a rounded value, and 999999999999999.9 respectively. Fix: also require `(v #>> '{}')::float8::numeric = (v #>> '{}')::numeric`, or bound the scale.

**m5 (Minor): lock-order inversion causes a deadlock**
The value write locks the value row and then the field row (FOR SHARE). The field write locks the field row and then the value rows. Repro: S1 `BEGIN; DELETE FROM plat_custom_value WHERE field_id=F;`, then S2 `UPDATE plat_custom_field SET type='TEXT' WHERE id=F;` (it waits on S1), then S1 inserts a new value for F. Result: "deadlock detected" and S1 aborts (S2 is then refused correctly; the state stays consistent). This will hit a "clear and re-set" PUT. Fix: the value route (or trigger) locks the field row first, e.g. `SELECT … FROM plat_custom_field … FOR SHARE` before touching values. At minimum, document the order for part 2.

**m6 (Minor): the claims are wider than the schema**
- (a) A field's `id` can be changed while it has no values: `update plat_custom_field set id='…f0' where id=<F> returning id` gives UPDATE 1. The trigger's never-change list leaves out `id`.
- (b) `entity_id` has no key, so firm A can store a value for any UUID, including another firm's record. That contradicts the header's "nothing of firm A names anything of firm B". The kind is polymorphic, so state that the port's `canEdit` must check it.
- (c) Values of an archived field can still be deleted (`delete … where field_id=<archived>` gives DELETE 1), while the header says "its values kept".
- (d) `plat_saved_view.filter` and `sort` have no size limit: a 5 MB filter was accepted, while `columns` is capped at 50 (duplicates such as `["name","name"]` are accepted).
- Fix: add `id` to the never-change list, and add an `octet_length(filter::text) <= 64000` check. For (b) and (c), state the rule in the header.

## What held
- Cross-firm (as app):
  - A value naming B's field gives an FK error with "Key is not present" and no key values.
  - Reusing B's field id gives `plat_custom_field_pkey` with the DETAIL hidden.
  - Writing `firm_id`=B, or changing a field's firm to B, is refused by the firm-first gate before any area trigger.
  - With no `app.firm_id`, or an empty one, reads return 0 and writes are refused.
  - A's reads never see B's rows.
- Privileges: xr_app gets "permission denied" for TRUNCATE on all three tables and for DELETE on fields. A direct `select pf_custom_field_kept()` is refused, and so is `create trigger` on a temp look-alike with any of the three definers (EXECUTE revoked). xr_app has no CREATE on `public`.
- A temp `plat_custom_field` with `set local search_path = pg_temp, public` is ignored: the definer read the real field.
- Value checks held: leap days (2000-02-29 accepted; 2100-02-29, 2025-02-29 and 0000-01-01 refused); DATE under `datestyle='SQL, DMY'`; SELECT and MULTI_SELECT case tricks, nested arrays and duplicates; `"false"` for CHECKBOX; 2^53+1 refused.
- At READ COMMITTED: type change vs value insert, option removal vs value insert, and archive vs value insert, in both orders.
- Rollback with `-1` on a fully migrated copy: the catalogue (classes and ACLs, functions with owner, ACL, body and config, types, triggers, policies, default ACLs, roles) and the permission catalogue rows are identical to a copy migrated only up to the migration before this one. Nothing is left behind.
- As xr_studio: the TRUNCATE and DELETE guard on fields fires, and the never-change columns are refused.

Verdict: Changes

## Round 2 (head 05d4820a1, diff-only: `prisma/` since ecee6634a)

Scratch DB `xr_studio_pf22a_break2` (every migration in order, `seedSampleFirms`) plus a rollback copy, both dropped. Concurrency was driven by three `pg` clients as `xr_app` (firm A). The PR's own `check_pf22a_custom_schema.ts` gives 86 passed, 0 failed.

**Round-1 findings**
- **M1: closed.** Round 1's repro at RR and at SERIALIZABLE is now refused with 55000 "only at READ COMMITTED", and the field and value stay as they were. Ways around it that I tried, all refused:
  - Changing the level after the first query: `SET TRANSACTION`, `set_config('transaction_isolation',…,true/false)`, `SET [LOCAL] transaction_isolation`, and the same after `SAVEPOINT` all give 25001. `RESET` gives 0A000. A temp function with `SET transaction_isolation` gives 0A000.
  - `default_transaction_isolation='repeatable read'` for the session: the gate fires.
  - A value written at RR while the field change runs at RC, whether the change was committed before or still in flight: the writer gets 40001. An RR value UPDATE to an option just removed at RC also gets 40001.
  - Switching `app.firm_id` in the UPDATE's WHERE or SET: 0 rows, or refused by RLS.
  - A CTE that deletes or inserts values in the same statement as the type change: refused.
  - A trigger from another table: none exists that writes `plat_custom_field`, and every FK to it is RESTRICT (no cascade path).
  - The one legal route, `SET TRANSACTION … READ COMMITTED` before the first query, really is RC.
- **m1: partly closed.** Tab, NBSP, U+200B, U+3000, U+FEFF, U+1680 and VT are now blank. Still accepted as text, a label or a choice: U+0085, U+180E, U+200C/D, U+2060, U+00AD, U+3164, U+2800, U+200E and U+202E. Repro: `pf_custom_value_ok('TEXT','[]',to_jsonb(U&'\3164'))` gives t, and `pf_custom_options_ok('SELECT','["Yes","Ye‌s"]')` gives t (two choices that look identical). See n1 for U+200B.
- **m2: closed for options.** `lower(normalize(…,NFC) COLLATE pg_c_utf8)` refuses É/é, NFD café, K/U+212A, Ω/U+2126 and ǅ/ǆ the same way on any cluster. It uses simple case mapping, so Straße/STRASSE and ΣΑΣ/σας stay distinct. pg_c_utf8 is not a new PostgreSQL 17+ dependency: the fo7a and csnk1 migrations already use it. New residue: see n2.
- **m3: partly closed.** PHONE now needs 4-20 digits (`((((` and `0---` are refused). EMAIL refuses `<`, a doubled dot and an ASCII space. Both shapes still accept a Unicode separator or bidi control in the middle: EMAIL `a b@c.d`, `a​b@c.d`, `a@b　c.d` and `a@b.c‮`, URL `https://a b`, `https://a　b` and `https://a.com/‮gpj.exe`. Minor.
- **m4: over-corrected.** See n3.
- **m5: held for the round-1 repro.** The DELETE trigger now takes FOR SHARE on the field first. So delete, then a waiting type change, then a re-insert runs without a deadlock, and the type change is refused. Residue: a field writer that holds the row (label UPDATE), then a value DELETE, then a type change in the same transaction still gives 40P01. The type change stays refused, and this is the documented "writers lock the field first" order for part 2.
- **m6: closed.** `id` changes on a field, a value or a view are refused. `filter` above 16384 characters, `sort` above 2048 or not an object, and duplicate `columns` are refused. (b) is now stated in the header. For (c), delete and upsert on an archived field are refused.

**New findings**
- **n1 (Minor): the database is now stricter than zod on U+200B.** The header says the value rules are "the same rules as the API's zod schema". JS `.trim()` keeps U+200B, so zod accepts `"​"` (and `"Yes​"` as a label), while `pf_custom_trim` refuses it. Part 2 would get a check_violation (a 500) on input zod passed. Fix: drop `​` from the class, or have zod strip it too. Add the case to N5's parity test.
- **n2 (Minor): `pf_custom_trim` depends on collation inside an IMMUTABLE CHECK** (`migration.sql:132`). `[[:space:]]` follows the caller's collation. `length(pf_custom_trim(U&'\0085a\0085' COLLATE "C"))` gives 3, while `"und-x-icu"` and `pg_c_utf8` give 1. `pf_custom_label_ok(U&'Yes\0085',80)` is t on this C cluster and f under ICU, so `plat_custom_field_shape` answers differently per environment (round 1's m2 class). Fix: `COLLATE pg_c_utf8` inside `pf_custom_trim`, as the options check now does.
- **n3 (Minor): NUMBER refuses ordinary JS doubles** (`migration.sql:166`). PostgreSQL's `float8::numeric` rounds to 15 significant digits, so `x = (v::float8)::numeric` is false for any value with 16 or 17 digits. Refused: `3.141592653589793` (Math.PI), `0.3333333333333333` (1/3), `0.30000000000000004` (0.1+0.2), `123456789012345.6`. Expected: accepted, since JS reads each back unchanged and zod `.finite()` passes them. Actual: f, which part 2 would turn into a 500. Fix: compare against `(v #>> '{}')::float8::text::numeric` with `SET extra_float_digits = 1` on the function (shortest exact output). Add π and 1/3 to DW3.
- **n4 (Minor): archived values cannot be erased by the natural path** (`migration.sql:276-279`). DELETE on an archived field's value is refused. PF-21d's job (`api/src/platform/erasure/service.ts:189`) runs every eraser in one transaction and aborts on the first throw. One EMAIL or PHONE value on an archived field would therefore block the whole person's erasure (SA-11). The only path that works is un-archive, then delete, then re-archive in one transaction (tested: count 0). No eraser exists yet, so this is Minor. Fix: say in the header and the module card that erasure takes that path, or exempt it.
- **n5 (Minor, wording):** "filter … at most 16 KB" is 16384 *characters*. 16370 4-byte emoji (about 64 KB) were accepted. Say "characters", or use `octet_length`.

**Held (round 2):** EXCEPTION blocks under `debug_parallel_query=on`; `pf_custom_value_ok` STABLE and in no CHECK or index; a used option's case rename (Yes to yes) and SELECT to MULTI_SELECT with values refused, a reorder allowed; `pf_custom_trim` on 200 k-2 M spaces 3-48 ms; a 5000-deep view under 16 KB accepted; the rollback leaves no `pf_custom_` function, type or key (its `_prisma_migrations` line errors only because the copy was not built by Prisma). No open Blocker or Major.

Verdict: Approve

## Round 3 (head b901ec4bc, diff-only: `prisma/` since 05d4820a1)

Scratch DB `xr_studio_pf22a_break3` (every migration in order), plus two one-function copies on an ICU (`und`) and a libc `en_US.UTF-8` database. All three were dropped. The PR's `check_pf22a_custom_schema.ts` gives 86 passed, 0 failed. `migration-slots.py check` against main's merge base gives PASS (the new stamp 20261125130000 comes after main's newest, 20261124170000).

**Round-2 findings**
- **n3: closed.** I ran 120,031 JSON numbers through `pf_custom_value_ok('NUMBER',…)`: 60 k random bit-pattern doubles, 30 k doubles in everyday ranges (each written by `JSON.stringify`), 30 k random 16-18 digit literals, and 41 hand-picked cases. Expected: accepted exactly when the literal equals, as numeric, what JS writes back, and |x| < 1e15. Result: 0 mismatches. I ran the whole set again with session `extra_float_digits` at -15, 0, 1 and 3 (PGOPTIONS), with 0 mismatches each time, and the session's value is the same after the call.
  - Accepted: π, 1/3, 0.1+0.2, 123456789012345.6, 123456789012345.67, 999999999999999.9, 5e-324, -5e-324, 1e-310, 2.2250738585072014e-308, 1e-7, 1.50, 1E2, -0 and -0.0 (stored as 0).
  - Refused: 0.10000000000000001, 1.0000000000000001, 4.9406564584124654e-324, 12345678901234.567 (JS writes …566), 9007199254740993, 999999999999999.94 (JS writes 1e15), 1e15, -1e15, 1e-400, 1e400 and 1.7976931348623157e308.
  - Huge exponents: `1e131071` and `-1e-16383` are refused in about 2 ms (the cast error is caught). `1e1000000`, `1e-100000` and `1e-16384` are refused by jsonb input itself, before the check runs.
  - A `SET LOCAL extra_float_digits=-15` survives the call and a rolled-back savepoint around a refused call.
  - The function's SET clause works in parallel workers (`debug_parallel_query=on`, 4 workers, 30 k/30 k accepted).
  - Cost is about 2.7 µs per call (200 k calls in 538 ms).
- **n2: closed.** `pf_custom_trim` was run on every code point from U+0001 to U+10FFFF (surrogates skipped), with the input under `C`, `und-x-icu`, `en_US.utf8`, `tr-TR-x-icu`, `pg_unicode_fast`, the default, and a nondeterministic ICU collation (`und-u-ks-level2`). All give the same 27 blanks. The nondeterministic one raises no "not supported for regular expressions" error, because the explicit COLLATE wins. The blank set has the same md5 on the C, ICU and libc databases (a bare `[[:space:]]` regex on the libc database still keeps U+0085, so the fix is what makes them agree).
  - Long strings take 0.5-42 ms and grow linearly, against 1.5-26 ms for the old body. The cases were: 1 M spaces; `a` + 100 k spaces or U+3000 + `a`; 500 k `a `; 1 M é or 中; 500 k emoji; 100 k U+0085 + `a`. No run of spaces in the middle showed quadratic backtracking.
  - The rollback (`-1`, with a `_prisma_migrations` row under the new name) leaves no `pf_custom_` function, no type, no table and no migration row.

**New findings**
- **n6 (Minor): U+0085 joins U+200B as "database stricter than zod"** (`migration.sql:134`, n1's class). Under pg_c_utf8, `[[:space:]]` is Unicode White_Space, so U+0085 now counts as blank on every cluster. JS `.trim()` keeps it: `"\u0085a".trim().length` is 2. Of all code points, the database trims exactly JS's 25 plus U+0085 and U+200B. So `"Yes\u0085"` as a label or choice, or `"\u0085"` as a TEXT value, passes zod and then hits a check_violation in part 2. Expected: the same answer on both sides. Fix: in part 2's zod, strip both (or drop them from the SQL class), and add U+0085 to N5's parity test with U+200B.
- **Observation (outside the diff, m3 residue):** EMAIL and URL in `pf_custom_value_ok` (`migration.sql:186,188`) still use a bare `[[:space:]]` in the middle of the string. `U&'a\0085b@c.d' ~ '^[^@[:space:]]+@'` gives t on this C cluster and f on the ICU database. The function is STABLE and not in a CHECK, so no stored row changes meaning. The result does differ by environment, though. Part 2 could use the same `COLLATE pg_c_utf8`.
- **Note:** `var/suites/selection.tsv` (not tracked) still names the old folder `20261125090000_pf22a_custom_fields`. The demo and builder databases on this cluster never applied the old name, so no Prisma "missing migration" drift is pending here.

**Held (round 3):** numbers JS writes are accepted, and numbers it does not are refused, under any session `extra_float_digits`. Huge exponents are refused quickly. `-0` is stored as 0. The GUC is restored after a call, after an error and in parallel workers. `pf_custom_trim` gives one answer under every input collation and every database locale, does not fail under a nondeterministic collation, and runs in linear time. The rename to `shared__` passes the slot check, and the rollback names the new folder. No open Blocker or Major.

Verdict: Approve
