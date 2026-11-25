# PF-22a part 1 review: custom field, value and saved view tables (independent reviewer, 25 Nov 2026)

Commit reviewed: **ecee6634a52d1d121630104fdf46435e19ceb977** (PR #3639, branch `claude/nice-turing-ue036e`). Diff `origin/main...HEAD`: `platform-custom.prisma`, two slot blocks in `platform.prisma`, migration `20261125090000_pf22a_custom_fields` (migration and rollback), `tests/check_pf22a_custom_schema.ts`, `MODULE.rows/PF-22a.md`. I checked it against BACKLOG PF-22a and PF-22v, STANDARDS §3-§5 and §7, the platform module card, and the precedent PF-10a (migration `20261124050000`, its test and its review). **Schema only:** there is no screen and no route. The UI checks, screenshots and BIC-01-20 are N/A. **Journey score: N/A** (nothing a person can walk; I replayed part 2's flows as SQL instead, below). I read the breaker's `break-report.md` after doing my own checks, and I mark where we agree.

## What I ran
* `npx tsx tests/check_pf22a_custom_schema.ts`: **73 passed, 0 failed** (17 s).
* Neighbouring suites at this head (with `--tsconfig api/tsconfig.json`): `check_pf12_walls` 110/110, `check_pf3_platform_schema` 75/75, `check_pf6r_roles_read` 17/17, `check_pf6b_permission_rules` 42/42, `check_pf8b_f4_migrations` 9/9, `check_pf0p_ports` 127/127. **`check_prisma_schema` 7/8: FAIL** (M1 below). `graph.mjs --check`: G1 0, G2 0. CI `module-cards` and `pr-rules` are green.
* Rollback: on one copy I applied migrations up to the one before this. On a second copy I applied this migration, then `rollback.sql` in one transaction. I compared a catalogue fingerprint of the two (3,724 entries: relations with ACLs, functions with owner, ACL and body hash, types, triggers, policies, schema ACLs, keys, role keys). They are identical apart from temp-schema numbers. The migration then re-applies (the suite's DW1 checks this).
* Races on a scratch copy (dropped), each with two sessions:
  * At READ COMMITTED: a value insert held open, then the options drop its option: refused once it commits. A value held open, then a type change: refused. An archive held open, then a value insert: refused.
  * At REPEATABLE READ: **the type change succeeded** and left `DATE | 42` stored (M2).
* Mutation spot-checks on a copy of the migration. Each line removed, then the suite run again:
  * `REVOKE ALL … FROM PUBLIC` removed: caught (1 fail).
  * Not caught (73/73 still pass): every `FOR SHARE`; `created_at` in both never-change lists; the `help_text` ≤ 300 and `position` ≥ 0 checks; the options ≤ 100 limit; the session-firm check in `pf_custom_value_checked`. That last one is defence in depth behind `0_pf12_firm_first`, which fires first, so it is not a finding.

## Done when (BACKLOG PF-22a, schema share), each with its pass and fail test
| Rule | Pass / fail | Holds? |
|---|---|---|
| Migration on empty and demo-data copies, measured right after itself (Amendment 6), migrate diff empty | yes / yes | Yes. The stamp is checked unique and later than all before it, never by `at(-1)` |
| DATE refuses `"tomorrow"`; SELECT refuses a value outside its options; all ten types | yes / yes for each type | Yes. DATE is safe under any DateStyle (regex first) |
| Archive hides and keeps values; un-archive shows them; no delete or truncate | yes / yes (`xr_app` has no DELETE or TRUNCATE) | Yes |
| Type change refused once values exist; an option in use kept | yes / yes | At READ COMMITTED only (M2) |
| Firm A never sees or names firm B's fields, values, views or staff | yes / yes (policy as `xr_app`; `(firm_id, …)` keys) | Yes. `entity_id` is polymorphic and unchecked (note N3) |
| Definer functions: `xr_wall_reader`, pinned search_path, EXECUTE revoked, look-alike tables refused | yes / yes | Yes. Same as PF-10a |
| Key `agent/custom-field:manage`, Owner and Admin (Sample) | yes / yes | Yes |
| Unique key per firm and kind; one value per field and record | yes / yes | Yes |

**Stated deviations: both accepted.**
* `plat_saved_view` sits in this migration. PF-22v's row already puts it in `platform-custom.prisma`, and the columns match its list (owner null = shared, `created_by` kept for leavers, no unique name). The reason given is not quite right: P-228 (8) allows two additive migrations in flight at once. The fold is still harmless.
* `required` is backed by the R1.95 row text ("type, required", `qa/CAPABILITIES.md:177`).
* The tech lead's records should update PF-22a's column list and PF-22v's Touch line ("+ one migration folder").

## D1-D20 (1-5; schema row)
D1 4: every Done-when line has a test; M2 narrows one · D2 3: firm-pair keys and type checks are sound, but the frozen type breaks at RR/SERIALIZABLE (M2) · D3 4: one field per firm, kind and key; values reference it · D4 N/A · D5 4: rollback exact; archive is reversible · D6 3: who and when on fields and values; audit lines come in part 2 · D7 N/A · D8-D14 N/A (no UI) · D15 4: `(firm, kind, entity)` for a record's panel, `(firm, field, entity)` for filters, `(firm, list, owner)` for views · D16 3: m1 (rules whose removal no test catches) · D17, D20 simulated only · D18 4: sources cited, Sample marked · D19 N/A (closes with parts 2-5).

## Issues
**M1 (Major, Must): `check_prisma_schema.ts` fails, so CI will go red.** `prisma/schema/platform-custom.prisma:1-2`: "Owner: Lead B …" wraps to line 2. The check (`tests/check_prisma_schema.ts`, `areaFaults`) wants `// platform-custom.prisma — … Owner: ….` on line 1. This is the same fault as PF-10a's M1. Fix: make line 1 one sentence ending with `Owner: Lead B (platform, P-559).` and move the rest below it.

**M2 (Major, Must): at REPEATABLE READ or SERIALIZABLE, a field's type or options change even though it has values.** This is the same finding as the breaker's M1; I reproduced it.
* Where: `migration.sql:214`, `:220`. The `EXISTS … FOR SHARE` reads the transaction's snapshot. A value committed after that snapshot is not seen, and the value writer's `FOR SHARE` on the field (`:246`) does not change the field row, so no serialization error is raised.
* Result: the stored value no longer fits its type (`DATE | 42`), and every later update of that row is refused.
* Why it matters: the API runs at READ COMMITTED today, but the codebase does use RepeatableRead (`client-money/reads/*`). A rule the database claims to hold should not depend on the caller's isolation level.
* Fix (either is a few lines): (a) the value trigger marks the field once (e.g. `has_values`, set by `UPDATE … WHERE NOT has_values`), so the field UPDATE meets a write conflict and its rule reads `OLD.has_values`; or (b) refuse a type or options change when `current_setting('transaction_isolation') <> 'read committed'`. Add a two-session RR test.

**Minors**
* **m1 (Should): several stated rules have no failing test.** Removing any of these keeps the suite at 73/73:
  * `created_at` never changes, on fields and on views (`:210`, `:265`);
  * `help_text` ≤ 300 and `position` ≥ 0 (`:187`);
  * at most 100 options (`:139`);
  * the `FOR SHARE` locks (`:214`, `:220`, `:246`). Their race is now verified only by hand: add one two-session case, which M2's test can share.
  * Also not tested: changes to a value's `field_id`, `entity_kind` or `firm_id`, and to a view's `firm_id`; a label or view name over 80; an option over 80; more than 50 columns.
  * This is STANDARDS §3.10 and §7 [M] ("a rule's test fails when the rule is removed").
* **m2 (Should): `id` is missing from the field's never-change list** (`:207-210`; breaker m6a). I changed a field's id when it had no values (UPDATE 1). With values, the key refuses it. Add `id` to the list.
* **m3 (Should): blank checks use `btrim`, which strips ASCII spaces only** (`:141`, `:162`, `:186`, `:193`; breaker m1). A tab, a newline or U+3000 counts as text. The zod schema in part 2 will trim these and disagree with the database. Use a `[:space:]`-aware test.
* **m4 (Could): `pf_custom_value_ok` is declared IMMUTABLE** (`:146`), but `text::date` and `to_char` are STABLE. This is harmless while only triggers call it, but the header calls the shapes "usable in checks". Mark it STABLE, or say it must not go into an index or CHECK. The breaker's m2 (collation-dependent `lower()` in an IMMUTABLE CHECK) is the same kind of issue.
* The breaker's m3-m5 and m6 (b)-(d) are fair. Of these, m5 (deadlock lock order) and m6 (b)/(c) belong in part 2's brief (N1, N3 below). I do not count them twice.

## Notes for parts 2-3 (not findings, no new scope)
* **N1 (part 2, PUT values):** take the field row `FOR SHARE` before touching any value row. This avoids the deadlock order the breaker showed. Map 40P01 and 40001 to a retry or a 409.
* **N2 (part 2, archive):** values of an archived field can still be deleted, and a new value cannot be written. So the PUT must leave hidden values alone. FO-9b's merge ("fill empty ones") must skip archived fields, or the whole merge is refused. Put that in FO-9b's line and in part 2's test.
* **N3 (part 2, records):** `entity_id` has no key. `canEdit` and `canView` must confirm the record is the firm's own and of the kind. The header line "nothing of firm A names anything of firm B" holds for fields and staff, not for records.
* **N4 (part 2, keys):** the unique key counts archived fields too. "Archive it and add a new one" needs a new key, so the route must derive a free one.
* **N5 (parts 2-3):** `required` is not enforced by the database. Part 2 must define what it means for records that already exist. The zod value schema must match `pf_custom_value_ok`; add a parity test over the same cases as DW3.
* **N6 (PF-22v):** the module card says other modules never read these tables. The front-office list's custom-field filter (part 3) must therefore come through a port method, not a join in front-office code. The indexes support it.
* **N7:** optimistic concurrency can use `updated_at` as the version (PF-18a's `@Versioned` pattern). No `version` column is needed.

## Could not check
* A real RDS run beyond `check_pf8b_f4_migrations`; the full demo reset (no existing table is touched); CI's full run (not yet run on this head).
* The stamp is provisional. A rename needs DW1 re-run on the new stamp.

**Head moved during this review:** the branch is now at 967be3be4 (one line in `tests/check_pf3_platform_schema.ts`: it counts the new key as a later row's key). My `check_pf3_platform_schema` 75/75 may have run on either version. This review and its verdict cover **ecee6634a** only. M1 and M2 are unchanged at 967be3be4, because the migration and the prisma file are untouched.

Reviewer: Block ecee6634a52d1d121630104fdf46435e19ceb977

**Verdict: Block**
* Blockers: none.
* Majors: M1 (`check_prisma_schema` red: Owner line), M2 (type and options freeze defeated at RR/SERIALIZABLE).
* Minors: m1 (untested rules: `created_at`, `help_text`/`position`/options bounds, locks, and others), m2 (`id` not frozen), m3 (`btrim` misses non-ASCII blanks), m4 (IMMUTABLE label on `pf_custom_value_ok`).
