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

## Round 2 (diff-only re-review, 25 Nov 2026)

Commit reviewed: **05d4820a19ebaec55b54b2551da41bb40eef1207** (the PR's head on GitHub). Scope: `git diff ecee6634a..05d4820a1 -- prototype/studio`. That is the migration and its rollback, `platform-custom.prisma` lines 1-2, the PF-22a suite (+13 checks), and one line in `check_pf3_platform_schema.ts`. The `product/screens` records in the diff are not code and I did not review them. This round is still schema only: there is no screen. **Journey score: N/A.**

### What I ran
* `npx tsx tests/check_pf22a_custom_schema.ts`: **86 passed, 0 failed** (21 s). `npx tsx tests/check_prisma_schema.ts`: **8 passed, 0 failed**. `check_pf3_platform_schema` (`--tsconfig api/tsconfig.json`): 75/75.
* Scratch database (dropped afterwards), built from every migration in order on PostgreSQL 18.3:
  * `rollback.sql` in one transaction leaves 0 `pf_custom_*` functions, 0 tables and 0 types, including the two new functions. The migration then re-applies cleanly.
* Mutations on copies of the migration (copies removed afterwards). Each was **caught by exactly one failing check**:
  * (A) the value trigger's field `FOR SHARE` removed: the two-session race fails, `waited` 27 ms;
  * (B) `OR DELETE` removed from the value trigger: m6 (c) fails;
  * (F) `normalize(…, NFC)` removed: m2 fails;
  * (G) `COLLATE pg_c_utf8` removed: m2 fails, because the cluster's collation is C.
* `pg_c_utf8` needs PostgreSQL 17 or later. Local, `compose.test.yml` (18.3) and CDK RDS (`VER_18_3`) all qualify.

### Round-1 findings
| # | Fixed? | Fail test |
|---|---|---|
| M1 `check_prisma_schema` Owner line | **Yes.** Line 1 is one sentence ending with `Owner: Lead B (platform, P-559).` | `check_prisma_schema` F 8/8 |
| M2 type/options freeze at RR/SERIALIZABLE | **Yes, via fix (b).** `pf_custom_field_kept` refuses a type or options change when `transaction_isolation <> 'read committed'` (SQLSTATE 55000). Label, position and archive still change at RR. The reverse order (a value writer at RR or SERIALIZABLE after a committed field change) already got a serialization failure from the trigger's `FOR SHARE`. | "break M1 fail" (RR options, SERIALIZABLE type); "break M1 pass" (RR label/order, RC options); a two-session RC race that shows the wait and the refusal (mutation A proves it bites) |
| m1 untested rules | **Yes.** Now tested: `created_at` on fields and views; `help_text` 300/301; `position` -1; 100/101 options; label and option 80/81; 50/51 columns; value `field_id`/`entity_kind`/`firm_id`/`id`; view `id`/`firm_id`/`created_at`; the value-side lock (two sessions). | The checks listed. The field trigger's `FOR SHARE` on value rows is still untested, but at READ COMMITTED the protection comes from the value-side lock (mutation A), so this is not a finding. |
| m2 `id` not frozen | **Yes.** Fields, values and views now all freeze `id`. | "review m2 / m1 fail", "value's … id never change", view `id` case |
| m3 `btrim` ASCII-only | **Yes.** `pf_custom_trim` covers `[:space:]` plus U+00A0, U+1680, U+2000-200B, U+2028/2029, U+202F, U+205F, U+3000 and U+FEFF. It is used for labels, choices, view names and values. | "TEXT" bad cases (`\t\n`, U+00A0, U+200B, U+3000), "break m1 fail" |
| m4 IMMUTABLE `pf_custom_value_ok` | **Yes.** It is now STABLE and called only from triggers; the comment says so. | (a label, not a behaviour; nothing to test) |
| Breaker m2, m3, m4, m6 (a)/(c)/(d) | Fixed, each with a fail case. m5 and m6 (b) are documented for part 2 in the value trigger's comment, as round 1 asked (N1, N3). | as listed in the suite |

### New in this round
**m5 (Minor, Should): the NUMBER round-trip check refuses ordinary JavaScript numbers.**
* Where: `migration.sql:162`, `x = ((v #>> '{}')::float8)::numeric`.
* Cause: PostgreSQL's float8 to numeric cast keeps only 15 significant digits (DBL_DIG). The check therefore means "at most 15 significant digits", not "equal to its double reading" as the comment says.
* Refused on PG 18.3, all of them numbers JS writes and reads back unchanged: `3.141592653589793` (`Math.PI`), `0.30000000000000004` (`0.1 + 0.2`), `1234567890.123456`, `123456789012.3456`.
* No check in the suite uses a 16-17 digit number, so nothing caught it.
* Fix (one line): compare through float8's shortest text, `x = ((v #>> '{}')::float8::text)::numeric`. I checked it accepts all four values above, still refuses `0.1234567890123456789` and `9007199254740993`, and `1e-400` still raises and is refused. Add one of these numbers as a "good" NUMBER value.
* Why not Major: no stored value is wrong and nothing is defeated. It refuses a rare input, and the zod parity test in part 2 (N5) would also have caught it.

**Notes for part 2's zod parity (N5; not findings):**
* The database counts U+200B as blank, while JS `String.prototype.trim` does not. A value of only U+200B passes zod's `.trim().min(1)` and the database refuses it.
* The URL host must start with an ASCII letter or digit, so `https://例子.cn` is refused while zod's `.url()` accepts it.
* EMAIL accepts `.a@b.co` and `a.@b.co`.
* A field edit made inside a RepeatableRead transaction (for example with an audit line) now fails with 55000 on a type or choices change, so the route must run it at READ COMMITTED.
* With deletes of an archived field's values refused, a "clear all values of a record" PUT and FO-9b's merge must skip archived fields (N2 now applies to DELETE too).
* The tests for value `firm_id` and view `firm_id` accept `never change|foreign key`. That is looser than the other checks, but the firm-first gate and the key also refuse the change, so it is not a finding.

### Could not check
* CI's full run on this head: the `ci` and `regression` jobs show skipped. `module-cards`, `pr-rules` and `guard` are green, and CodeQL (javascript-typescript) was still running.

Reviewer: Approve 05d4820a19ebaec55b54b2551da41bb40eef1207

**Verdict: Approve**
* Blockers: none. Majors: none open (M1 and M2 fixed with fail tests).
* Minor to fix (in this PR if cheap, or as the first item in part 2): m5 (the NUMBER round-trip uses the 15-digit cast; compare through `::float8::text`, and add a 16-17 digit good value).

## Round 3 (diff-only re-review, 25 Nov 2026)

Commit reviewed: **b901ec4bca97b68707a4e9964abaebe4850a427c**, the PR's head on GitHub. The tech lead allowed a diff-only round on the PR. Scope: `git diff -M 05d4820a1..b901ec4bc -- prototype/studio`, five files, +19/-16:
* the migration folder renamed to `20261125130000_shared__pf22a_custom_fields`;
* inside it, the n2, n3 and n5 lines;
* `rollback.sql` (its two name lines);
* `platform-custom.prisma` (line 8, the name);
* `MODULE.rows/PF-22a.md` (the name);
* the PF-22a suite (`NEW`, the NUMBER good cases, the m4 refused list, one m1 case, one check title).

Nothing else changed. This is still schema only, with no screen, so **Journey score: N/A**.

### What I ran
* `migration-slots.py check origin/main..HEAD`: **PASS**, after a fresh fetch of main (24a517697). It reports 1 new migration against main's newest, `20261124170000`.
* `git grep 20261125090000` at the head finds no code. The old name is left only in records: round 1 of this review and of `break-report.md`, and `screens/PF-22s/challenge.md` line 2, which lists what the challenger read at the time.
* `npx tsx tests/check_pf22a_custom_schema.ts`: **86 passed, 0 failed** (38 s). The count is the same as round 2 because the new cases sit inside existing checks.
* `npx tsx tests/check_prisma_schema.ts`: **8 passed, 0 failed**.
* Mutations, each run on a `git archive` copy of the head (copies and databases removed afterwards):
  * (n3) put back `::float8)::numeric`: "DW3 pass: NUMBER takes … 3.141592653589793 …" fails (85/1);
  * (n2) removed `COLLATE pg_c_utf8` from `pf_custom_trim`: "break m1 fail" fails (85/1). The cluster is C/C, provider libc, so the U+0085 case bites;
  * (n3 guard) removed `SET extra_float_digits = 1`: **86/0, not caught** (see n1 below).
* Probes on a scratch database built from every migration up to this one (PostgreSQL 18.3, dropped afterwards). `pf_custom_value_ok('NUMBER', …)`:
  * true for `3.141592653589793`, `0.30000000000000004`, `999999999999999.9`, `5e-324`, `1e-5`, `-0`, `1.50`, `1E2`;
  * false for `0.1234567890123456789`, `1.00000000000000001`, `1e-400`, `9007199254740993`, `1e15`;
  * π is still true with a session `extra_float_digits` of 0 or 3, so the function's SET holds.
* Probes of `pf_custom_trim(U&'\0085a\0085')`: length 1 under `"C"`, `"und-x-icu"` and the default. `pf_custom_label_ok(U&'Yes\0085', 80)` is f under C and under ICU. The function is still IMMUTABLE, with `search_path=pg_catalog`.

### Round-2 findings
| # | Fixed? | Fail test |
|---|---|---|
| Slot: migration name | **Yes.** The folder, `NEW`, the rollback's `psql` line and its `_prisma_migrations` delete, the prisma header and the module row all use the new name. The slot check passes. | DW1 (stamp unique and later than every one before it), `migration-slots.py` PASS |
| Break n3 / review m5: NUMBER refused 16-17 digit doubles | **Yes.** The comparison is `x = ((v #>> '{}')::float8::text)::numeric` under `SET extra_float_digits = 1`. `999999999999999.9` leaves the refused list, which is right: JS reads it back unchanged. `1.00000000000000001` takes its place. | "DW3 pass" now includes π, 0.1+0.2, 1/3 and 123456789012345.6 (mutation n3 proves it bites); "break m4 fail" |
| Break n2: `pf_custom_trim` depended on collation | **Yes.** `s COLLATE pg_c_utf8`, as the options check already does. | "break m1 fail" + `U&'Yes\0085'` (mutation n2 proves it bites on this C cluster) |
| Break n5: "16 KB" was characters | **Yes** for the filter (header) and for the constraint comment ("16,384 characters", "2,048"). See n2 below. | the m6 (d) check's title (wording only; 16,400 characters is still refused) |

### New in this round (no Blocker, no Major, no Minor)
* **n1 (Nit): the `extra_float_digits` guard has no test.** Removing the SET leaves the suite green (86/0), because the cluster default is already 1. A session or role set to 0 would then refuse π again. My probe shows the SET works today. A cheap pin for part 2: run one π insert after `set extra_float_digits = 0`.
* **n2 (Nit, wording): the header still says "sort … at most 2 KB"** (`migration.sql:19`). The constraint comment on line 210 now says 2,048 characters.

### Could not check
* CI's full run on this head. `ci`, `regression`, `types` and the walks show *skipped*. `review-rounds` shows *cancelled*. CodeQL, `module-cards`, `pr-rules`, `guard`, `read-gate`, `completes-ready` and `outside-wave` are green.

Reviewer: Approve b901ec4bca97b68707a4e9964abaebe4850a427c

**Verdict: Approve**
* Blockers: none. Majors: none. Minors: none open. Round 2's m5 and break n2, n3 and n5 are fixed, and n2 and n3 each have a fail test that bites.
* Nits (optional, part 2 is fine): n1 (pin `extra_float_digits` with one test), n2 (the "2 KB" in the header).

## Round 4 (diff-only, allowed by the tech lead)
Head `041947a3853ab2afbc21dbbb6e3769fab4adde15`. Scope: `git diff 44f8e3902..041947a38` only (2 files, +14 / -8). Not re-run: the screen walk and the journey test (no screen or behaviour change in this diff; round 3's records stand).

### What I checked
* **`.mergify.yml`: the `mig-platform-custom` scope and its capacity of 1.** The scope holds `prisma/schema/platform-custom.prisma`, `migrations/*_platform-custom__*/**` and `migrations/*_shared__*/**`, the same shape as every other area. The PR's migration (`20261125130000_shared__pf22a_custom_fields`) is a `shared__` one, so the barrier scopes still serialise it.
  * `bash product/tools/check-mergify-scopes.sh`: PASS (309 checks; 33 area scopes, 4 barrier areas).
  * `migration-slots.py mergify --write` run on a scratch copy of the committed file (exit 0): the result is **byte-identical** to the committed `.mergify.yml`. The file is generated, not hand-edited.
* **`tests/check_pf22a_custom_schema.ts`: is it a pure move?** Yes. Both versions have the same lines once blank lines are dropped and the lines sorted. The only differences are one added comment line (the P-600 reason) and one dropped blank line. Both versions have 70 `ok(` calls, so no check is added or dropped. The order does not change what is tested: the rollback runs on `DEMO`, and the later migrations and `prisma migrate diff` run on `EMPTY`.
  * `bash product/tools/check-own-migration-guard.sh`: 47 passed, 0 failed.
  * `own-migration-guard.py` on the round-3 version of the file: **REFUSED** (`walled()` read at line 66 and again at line 88, after the later-migrations loop at line 76). On the head version: PASS. So the move was needed, and it is enough.
  * `npx tsx tests/check_pf22a_custom_schema.ts` (Postgres 127.0.0.1:54329): **86 passed, 0 failed**, the same count as round 3.

### Findings
None. No Blocker, Major, Minor or Nit is new in this diff. Round 3's nits n1 (`extra_float_digits` pin) and n2 ("2 KB" in the header) are still open. They are optional and can wait for part 2.

### Could not check
* CI's full run on this head. When I looked, `guards part 1-4` and `parts (1, 3-6, 9)` were still in progress, and `review-rounds` showed *cancelled*. `ci`, `fast`, `guard`, `pr-rules`, `read-gate`, `module-cards`, `outside-wave`, `completes-ready`, CodeQL and the Mergify protections were green.

Reviewer: Approve 041947a3853ab2afbc21dbbb6e3769fab4adde15

**Verdict: Approve**
* Blockers: none. Majors: none. Minors: none.
* Nits (optional, carried from round 3): n1, n2.

## Round 5 (diff-only, P-293)
Head `b736f58eeee1f9b5b524562744d631fd60262b35`. Scope: `git diff -M 5b3a2a67d b736f58ee` limited to the PR's own files (`git diff -M origin/main...HEAD --stat`). That covers 4aa59afd1 (re-stamp 130000 to 140100), the merge of origin/main 7040918c8, and b736f58ee (re-stamp to 20261126063100, because main's newest migration is now 20261125150000). Not re-run: the screen walk and the journey test, because nothing on screen or in behaviour changed. Round 3's records stand.

### What I checked
* **migration.sql is unchanged.** The blob is `8e399d712267` at 5b3a2a67d (`20261125130000_shared__pf22a_custom_fields/`) and the same blob at b736f58ee (`20261126063100_shared__pf22a_custom_fields/`). Only the folder name changed.
* **Every reference names the new folder.** rollback.sql changed in exactly two places, the `psql -f` path and the `_prisma_migrations` delete, and both now say `20261126063100_shared__pf22a_custom_fields`. The new name is also in the platform-custom.prisma header (line 8), MODULE.rows/PF-22a.md, and `NEW` in tests/check_pf22a_custom_schema.ts (line 21). Nothing else changed in those files.
* **No stale stamp is left.** `git grep -E '2026112513|20261125140100|130000_shared|140100_shared'` over the PR's files finds only the dated records: break-report.md line 100, and review.md lines 135 and 184 (rounds 2 and 4). Records keep their facts (P-188), so these stay as they are. No other file in the tree names a different stamp for `pf22a_custom_fields`.
* **The merge brought no conflict into the PR's files.** No conflict markers. The PR's own diff against origin/main is still only its additions: `.mergify.yml` adds the 6-line `mig-platform-custom` scope plus its capacity of 1, and platform.prisma adds the two PF-22a back-relation slots. Between 5b3a2a67d and b736f58ee, the changes in these two files come from main: the `mig-platform-files` scope, P-827's queue order, and PF-19m's `msgMailboxes` line. Each sits next to the PR's lines, and neither side's lines were altered. `check-mergify-scopes.sh`: PASS (312 checks). `migration-slots.py mergify --check`: exit 0.
* **Migration slots, run again by me:** `migration-slots.py check origin/main..HEAD` gave **PASS**: 1 new migration against main's newest, 20261125150000 (`20261126063100_shared__pf22a_custom_fields`). I fetched origin/main first, and main's newest is still 20261125150000.
* Taken from the builder, not re-run: `check_pf22a_custom_schema.ts` 86/86 and `check_prisma_schema.ts` 8/8.

### Findings
None new. Round 3's nits n1 and n2 are still open and still optional.

Reviewer: Approve b736f58eeee1f9b5b524562744d631fd60262b35

**Verdict: Approve**
* Blockers: none. Majors: none. Minors: none.

## Round 6 (diff-only, 26 Nov 2026): head `560e9b8200488d76d6560afa5a9c24c726ac9e29`
Scope: the PR's own files (`git diff --stat origin/main...560e9b820`, 15 files; the merge base is origin/main's tip a1fd1b69e) from a3bd7eb2c (records after the round 5 Approve of b736f58ee) to 560e9b820. That is the merge of origin/main 4cc9abef3 and the re-stamp 20261126063100 to 20261126155300. The re-stamp was needed: main now has its own `20261126063100_shared__fo3v_video`. The screen walk and the journey test were not re-run, because nothing on screen or in behaviour changed; round 3's journey score stands.
* **migration.sql is byte-identical.** It is blob `8e399d712267` at both a3bd7eb2c and 560e9b820 (`R100`, only the folder name changed).
* **Every reference is renamed:** rollback.sql (the `psql -f` path and the `_prisma_migrations` delete), the platform-custom.prisma header, MODULE.rows/PF-22a.md, and `NEW` in check_pf22a_custom_schema.ts. Nothing else changed in those files. `git grep 20261126063100` at 560e9b820 finds only main's fo3v_video folder and this file's own dated round 5 notes.
* **The merge keeps both sides.** Each side's change from its merge base was compared. platform.prisma has the same two PF-22a slot blocks (firm, staff), with main's PF-20 `autoRecipes` slot kept below the firm one. .mergify.yml has the same `mig-platform-custom` scope and capacity, placed after main's new `mig-platform-automation`. check_pf3_platform_schema.ts has the same one line; main's copy did not change.
* **Migration slots, run by me:** `migration-slots.py check origin/main..560e9b820` gave PASS (1 new migration against main's newest 20261126100000). `migration-slots.py mergify --check .mergify.yml` gave PASS (36 area scopes, 4 barrier areas). The coordinator ran the suites: check_pf22a_custom_schema 86/86, check_prisma_schema 8/8.

Reviewer: Approve 560e9b8200488d76d6560afa5a9c24c726ac9e29

**Verdict: Approve**
* Blockers: none. Majors: none. Minors: none.
