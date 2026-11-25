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
