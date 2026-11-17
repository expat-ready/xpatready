# CS-SD1 break report (breaker, 16 Nov 2026)

PR #2017, head `b5889232d` on `claude/runtime-schema-drift` (base `f7dde02c8` = `origin/main`). Brief: `build-lead-c-briefs/CS-SD1.md`.
Isolated copy `brk_cssd1` on :4651 (`zsh tools/isolated.sh brk_cssd1 4651 start --ttl 30`, stopped afterwards). Scratch databases were
`xr_studio_brk_cssd1`, `_rst`, `_mut`, `_dev`, `_dev_shadow`, all dropped. Temporary Prisma configs went in `studio/var/brk-cssd1/` (gitignored)
and were removed. :4400 and `xr_studio_demo` were not touched. Prisma 7.8.0, PostgreSQL 18.3. Live AI off, US$0.

**Result: nothing Blocker or Major is caused by this PR.** One Major problem exists already on main and was found by the race (F2).
(a) could not be run as a true pg_dump/pg_restore in this environment (F1).

## (a) Restored database, then `migrate diff --exit-code`
* Source: a fresh copy, `POST /api/demo/load` → 201, then one demo case opened (`POST /api/runtime/cases` as user-O) → 201.
  Rows: person_role 6, form_edition_accept 2, canonical_field_name 164.
* `pg_dump --format=custom` → **exit 1**: `server version: 18.3; pg_dump version: 16.15`. The only pg_dump here is 16
  (`/usr/lib/postgresql/18/bin/pg_dump` is a symlink to the 16 binary). Fetching a PG18 client was refused: apt.postgresql.org
  got 403 from the proxy, and the auto-mode classifier denied a conda-forge download. Docker is not running, so PR #2014's
  `restore-drill.sh` cannot run either (it needs compose).
* I then tried a PG16 round trip in a throwaway PG16 cluster. `migrate deploy` → **exit 1**: `collation "pg_c_utf8" ... does not
  exist`. The migrations need PG17 or later. Abandoned; the cluster was stopped and removed.
* What did run: `prisma migrate diff --config <tmp> --from-config-datasource --to-schema prisma/schema --script --exit-code` on
  the migrated database with the sample and the case loaded → **exit 0**, `-- This is an empty migration.` I ran it again after
  every API write below → **exit 0**. `prisma migrate status` → "Database schema is up to date!"
* **F1 (Minor, environment):** DW1 has not been run on a *restored* database. It needs a Mac or CI run of PF-8r's drill (#2014).

## (b) The client cannot reach `canonical_field_name`
* `node_modules/.prisma/client/index.d.ts`: 0 matches for `canonicalFieldName`. `get canonicalField()` is present (line 3388).
* Searching `api/ engine/ contracts/ ports/ web/src/ tools/ samples/` for `canonical_field_name` finds only
  `rename-door.ts:79` and `:149` (they match the index name in the 23505 message) and a comment at `rule-facts.ts:243`. No
  `$queryRaw`, `$executeRaw` or `*Unsafe` call writes it. In `tests/` it appears only in reads and in the PR's own scratch-DB
  cases. The trigger is still its only writer. **Held.**
* `prisma validate` → exit 0.

## (c) Rename race (`PATCH /api/library/fields/:key/name`, `x-actor: user-A`, draft fields in group person, seeded with `seedField`)
| run | concurrent renames | names | result |
|---|---|---|---|
| same | 30 | one name | 1×200, 29×409 "Same name", 1 holder |
| variants | 30 | `Brk race two` / `brk RACE two` / `BRK-RACE-TWO` / `  brk   race two ` / `Brk_race_two!` | 1×200, 29×409, 1 holder |
| hundred | 100 | 4 case, spacing and punctuation variants | 1×200, 99×409, 1 holder, 0×500 in the api log |
| non-ASCII | 20 | `Ñombre de carrera` / `ñombre de carrera` / spaced / upper | **2×200**, 18×409 |
| accents + punctuation | 2 (run twice) | `Café-crème name` / `Café crème name` | **2×200, both kept** |

No status other than 200 or 409 in any run; no 500. ASCII names: exactly one winner every time. **Held.**
* **F2 (Major, already on main, not caused by this PR):** run at the same moment, two fields in one group both keep names that the
  app's own rule treats as the same. The app compares with `normalizeLabel` (`contracts/programs.ts:23`: NFKC,
  `toLocaleLowerCase`, punctuation removed). The database reserves names with `canonical_field_name_key`
  (migration `20261025100000_field_name_unique`, the function after the CREATE TABLE): a non-ASCII name keeps its punctuation,
  and `lower()` under the database's C collation leaves `Ñ` as it is (`select lower('ÑOMBRE')` → `Ñombre`). Run one after the
  other, the app refuses the second name (`Ñombre-de-carrera` → 409 "Not changed"). At the same moment, both pass the app's check
  and the index lets both through. Result in the database: `person.brk_punct_…_0 = "Café-crème name"` and
  `…_1 = "Café crème name"`. CS-SD1 changes neither the migration nor the API, so this is the same on main. It belongs to the
  rename door's or the name guard's row. Reported only, not fixed here.

## (d) Creates on the four tables still get ids
* fact_source: `PUT /api/combinations/<wp.family>/fact-sources/principal/person.date_of_birth` → 200, row `78a76321-…` v1.
  `POST …/fact-sources/bulk` → 200: one row saved with a batch_id, one refused in words (it is a case officer fact).
* form_edition_accept: `POST /api/library/forms/IMM%205707/accepts` (user-A) → WAITING, then
  `POST /api/library/changes/<id>/approve` (user-B) → 201. The `lifecycle.ts:449` upsert created row `1d0d7ec6-…`.
  The two rows from the sample load (`finder.ts:847/858/868`) also have ids.
* person_role: there is no Add route. The 6 starting roles come from `core.ts:132` `createMany` during the demo load; all have ids.
* validated_copy: the route (`POST /api/form-copies/:id/validated`) needs an Adobe-validated PDF, which cannot be made here.
* So in one rolled-back transaction I used the app's generated client (PrismaPg, FK triggers off for that transaction only):
  `personRole.create`, `personRole.createManyAndReturn` (2), `validatedCopy.create`, `formEditionAccept.create`,
  `factSource.create`. All omitted the id and all got a v4 UUID from the database; 0 rows were left behind.
* Generated types: `FactSourceUncheckedCreateInput.id?: string` is unchanged, so `proposals.ts:1015` (re-creates with its old id)
  still type-checks. `tsc -p api/tsconfig.json --noEmit` (8 GB heap): no errors in `api/src`. There are 15 errors in 5 test files
  (`check_vv_checklist`, `check_x2b_bulk_apply`, `check_c69_runs`, `check_cost_check`, `check_c18_age_case`; UUID template-literal
  typing). None mentions the four models; I did not compare against main. **Held.**

## (e) `prisma migrate dev --create-only` proposes nothing
* Scratch `xr_studio_brk_dev` with shadow `xr_studio_brk_dev_shadow`:
  `prisma migrate dev --config <tmp> --create-only --name brk_cssd1 </dev/null` → exit 0. It applied the 100 migrations, then
  created `prisma/migrations/20261116164743_brk_cssd1/migration.sql` whose whole content is `-- This is an empty migration.`
  (30 bytes). The folder was deleted at once (`git status prisma/` is clean), and both databases were dropped. **Held.**

## Further attacks on the drift check (scratch `xr_studio_brk_mut`, after `migrate deploy`)
| change made in the database | `migrate diff --exit-code` |
|---|---|
| none | 0, empty |
| `name_key` → varchar(200) | 2, `ALTER … SET DATA TYPE TEXT` (caught) |
| an extra column on canonical_field_name | 2, `DROP COLUMN "x"` (caught) |
| `canonical_field_name_unique` made non-partial | 2, `DROP INDEX` (caught) |
| person_role id default → `uuidv4()` | 2, `SET DEFAULT gen_random_uuid()` (caught) |
| **`canonical_field_name_unique` dropped** | **0, empty** |
* **F3 (Minor):** Prisma 7.8 neither states nor sees the partial unique index, so "no drift" (exit 0) does not show that
  the one-name guard exists. PR #2014's drill compares catalogue schemas too, which would catch this. DW3 checks the index only on
  a fresh database. Suggested follow-up: the PF-8r drill or the DW checks assert `canonical_field_name_unique` by name on the
  restored copy. Not a change to CS-SD1's touch list.
* Minor note: `prisma format --check` fails on both this head and main, because of alignment in older models. The lines this PR
  changed are not the cause.

## Held
DW1 exit 0 on a migrated database with the sample and a case loaded · the client has no `canonicalFieldName` delegate and no raw
writer exists · concurrent ASCII renames give exactly one 200, every other answer is 409 "Same name", never a 500 (30, 30, 100) ·
the four tables get database ids through the API and the client · `migrate dev --create-only` gives an empty migration · the
diff catches column, type and default drift on the `@@ignore` model.

Not in the touch list but required: `tests/check_prisma_schema.ts` empties its `KNOWN` set. That test's own header says "take a
line out of KNOWN in the PR that fixes it", so this is correct. I did not run the PR's own `check_cssd1_no_drift.ts`, because its
scratch database name (`xr_studio_cssd1_<pid>`) is outside my `xr_studio_brk_` allowance.
