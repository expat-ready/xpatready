#!/usr/bin/env bash
# SPD-2 self-tests (P-802, founder 22 Nov): database changes and test runs stop being one shared line.
#   bash product/tools/test-spd-2.sh        exit 0 when every case passes. US$0, no network, no database.
# Cases (the brief's four first):
#   1. two migrations in different areas may queue together (migration-slots.py clash; different Mergify scopes);
#   2. two in the same area wait in order (clash; one scope mig-<area>, capacity 1); a shared one waits for every area;
#   3. an old stamp is refused with the exact git mv re-stamp command; a missing or wrong area too; a batch judges the
#      stamp against its own area; an edited applied migration is refused unless the change re-records its checksum;
#   4. a one-module change runs only that module's suites plus the always-run set (module-suites.py, run-suites.sh
#      --modules --list), while a file outside every card keeps select-suites.mjs --direct;
#   plus .mergify.yml holds exactly the generated per-area slots, and ci.yml runs the check on every PR and batch.
set -u
TOOLS="$(cd "$(dirname "$0")" && pwd)"; ROOTD="$(cd "$TOOLS/../../../.." && pwd)"
pass=0; fail=0
ok() { if [ "$2" = 1 ]; then pass=$((pass + 1)); echo "PASS  $1"; else fail=$((fail + 1)); echo "FAIL  $1 — ${3:-}"; fi; }
T=$(mktemp -d "${TMPDIR:-/tmp}/spd2.XXXXXXXX") && [ -d "$T" ] || { echo "no temp dir: nothing was checked"; exit 2; }; trap 'rm -rf "$T"' EXIT
MS="$TOOLS/migration-slots.py"
S=ai-workers/problem-1-pathway-setup-and-form-filling/prototype/studio; M="$S/prisma/migrations"; SC="$S/prisma/schema"

# --- a throwaway repository: three schema files, one migration on main (fixture data, not real values)
G="$T/repo"; mkdir -p "$G" && cd "$G" && git init -q -b main && git config user.email t@t && git config user.name t
mkdir -p "$SC" "$M/20261122033000_qa644_reserve_staging"
printf 'model MoneyRow {\n  id String @id\n  @@map("money_row")\n}\n' > "$SC/client-money.prisma"
printf 'model RuntimeCase {\n  id String @id\n  @@map("runtime_case")\n}\nenum CaseKind {\n  A\n}\nview CaseView {\n  id String @unique\n  @@map("case_view")\n}\n' > "$SC/cases.prisma"
printf 'model Firm {\n  id String @id\n  @@map("platform_firm")\n}\n' > "$SC/base.prisma"
echo 'CREATE TABLE "money_row" ("id" TEXT);' > "$M/20261122033000_qa644_reserve_staging/migration.sql"
# a .mergify.yml with the generated slots of these three schema files (the anchors migration-slots.py --write needs)
cat > .mergify.yml <<'YML'
scopes:
  source:
    files:
      pipeline:
        include:
          - ".github/**"
  barrier_files:
    include:
      # SPD-2: a migration of a barrier schema file is a barrier too (migration-slots.py)
  capacities:
    pipeline: 1
YML
(ROOT="$G" python3 -I "$MS" mergify --write .mergify.yml >/dev/null) || echo "FAIL  the fixture .mergify.yml could not be written"
git add -A && git commit -qm main
mig() {  # mig <branch> <folder> <sql> [schema file to touch]
  git checkout -q -B "$1" main; mkdir -p "$M/$2"; printf '%s\n' "$3" > "$M/$2/migration.sql"
  [ -n "${4:-}" ] && echo "// $1" >> "$SC/$4"; git add -A && git commit -qm "$1"; git checkout -q main; }
chk() { (cd "$G" && ROOT="$G" python3 -I "$MS" check "$@" 2>&1); }

# 3. stamps and areas
mig old 20261118150000_aud1c_money 'ALTER TABLE "money_row" ADD COLUMN "x" TEXT;' client-money.prisma
out=$(chk main..old); r=$?
ok "3. an old stamp is refused (exit 1)" "$([ $r = 1 ] && grep -q "is not after main's newest migration 20261122033000" <<< "$out" && echo 1)" "exit $r: $out"
st=$(grep -oE "Fix: git mv $M/20261118150000_aud1c_money $M/[0-9]{14}_client-money__aud1c_money" <<< "$out" | grep -oE '[0-9]{14}_client' | cut -c1-14)
ok "3. ... with the exact git mv re-stamp command, area included, to a stamp after main's newest" "$([ -n "$st" ] && [ "$st" -gt 20261122033000 ] && echo 1)" "$out"
mig good 20261122040000_client-money__fo7ts 'ALTER TABLE "money_row" ADD COLUMN "y" TEXT;' client-money.prisma
out=$(chk main..good); r=$?
ok "3. a stamp after main's newest naming its area passes" "$([ $r = 0 ] && echo 1)" "exit $r: $out"
mig noarea 20261122040000_fo7ts 'ALTER TABLE "money_row" ADD COLUMN "y" TEXT;'
out=$(chk main..noarea); r=$?
ok "3. a migration naming no area is refused, the area read from its SQL" "$([ $r = 1 ] && grep -qF "$M/20261122040000_client-money__fo7ts" <<< "$out" && echo 1)" "exit $r: $out"
mig wrong 20261122040000_cases__fo7ts 'ALTER TABLE "money_row" ADD COLUMN "y" TEXT;'
out=$(chk main..wrong); r=$?
ok "3. a migration naming the wrong area is refused" "$([ $r = 1 ] && grep -q "names tables of client-money, not only 'cases'" <<< "$out" && echo 1)" "exit $r: $out"
mig two 20261122040000_client-money__both 'ALTER TABLE "money_row" ADD COLUMN "y" TEXT; CREATE TRIGGER t AFTER DELETE ON "runtime_case" FOR EACH ROW EXECUTE FUNCTION f();'
out=$(chk main..two); r=$?
ok "3. a migration writing two areas must be shared" "$([ $r = 1 ] && grep -qF "$M/20261122040000_shared__both" <<< "$out" && echo 1)" "exit $r: $out"
mig cmt 20261122040000_client-money__cmt '-- UPDATE "runtime_case" in a comment is not a change
ALTER TABLE "money_row" ADD COLUMN "z" TEXT;'
out=$(chk main..cmt); r=$?
ok "3. a comment's words are not changes" "$([ $r = 0 ] && echo 1)" "exit $r: $out"
# M1 (review round 1): every form that writes another area's table is seen; reads and foreign keys are not
w() {  # w <label> <sql> <want: refused|passes>  (a client-money migration with that SQL)
  local b="w$((++wn))"; mig "$b" "20261122040000_client-money__$b" "$2"; out=$(chk main.."$b"); r=$?
  if [ "$3" = refused ]; then ok "3. M1: $1 is seen as writing cases (refused as client-money)" "$([ $r = 1 ] && grep -q "names tables of cases, client-money\|names tables of cases," <<< "$out" && echo 1)" "exit $r: $out"
  else ok "3. M1: $1 is not a write of cases (passes as client-money)" "$([ $r = 0 ] && echo 1)" "exit $r: $out"; fi; }
wn=0
w "CREATE POLICY ... ON" 'ALTER TABLE money_row ADD COLUMN a TEXT; CREATE POLICY p ON runtime_case USING (true);' refused
w "CREATE CONSTRAINT TRIGGER ... ON" 'ALTER TABLE money_row ADD COLUMN a TEXT; CREATE CONSTRAINT TRIGGER t AFTER INSERT ON "runtime_case" DEFERRABLE FOR EACH ROW EXECUTE FUNCTION f();' refused
w "DROP TRIGGER ... ON" 'ALTER TABLE money_row ADD COLUMN a TEXT; DROP TRIGGER IF EXISTS t ON runtime_case;' refused
w "an unnamed CREATE INDEX ON" 'ALTER TABLE money_row ADD COLUMN a TEXT; CREATE INDEX ON runtime_case (id);' refused
w "DROP INDEX of the table's index" 'ALTER TABLE money_row ADD COLUMN a TEXT; DROP INDEX runtime_case_id_idx;' refused
w "the second table of DROP TABLE a, b" 'DROP TABLE money_row, runtime_case;' refused
w "the second table of TRUNCATE a, b" 'TRUNCATE money_row, "runtime_case";' refused
w "ALTER TABLE IF EXISTS ONLY" 'ALTER TABLE money_row ADD COLUMN a TEXT; ALTER TABLE IF EXISTS ONLY runtime_case ADD COLUMN b TEXT;' refused
w "UPDATE ONLY" 'ALTER TABLE money_row ADD COLUMN a TEXT; UPDATE ONLY runtime_case SET id = id;' refused
w "DELETE FROM ONLY" 'ALTER TABLE money_row ADD COLUMN a TEXT; DELETE FROM ONLY runtime_case;' refused
w "an unquoted upper-case name" 'ALTER TABLE money_row ADD COLUMN a TEXT; ALTER TABLE RUNTIME_CASE ADD COLUMN b TEXT;' refused
w "a write after a '--' inside a string" "ALTER TABLE money_row ADD COLUMN a TEXT; SELECT '--'; ALTER TABLE runtime_case ADD COLUMN b TEXT;" refused
w "an INSERT inside a DO block" 'ALTER TABLE money_row ADD COLUMN a TEXT; DO $$ BEGIN INSERT INTO runtime_case (id) VALUES (1); END $$;' refused
w "a schema-qualified name" 'ALTER TABLE money_row ADD COLUMN a TEXT; ALTER TABLE public."runtime_case" ADD COLUMN b TEXT;' refused
w "CREATE TABLE of another area" 'CREATE TABLE runtime_case (id TEXT);' refused
w "INSERT INTO" 'INSERT INTO runtime_case (id) VALUES (1);' refused
w "a policy reading another table" 'CREATE POLICY p ON money_row USING (EXISTS (SELECT 1 FROM runtime_case c WHERE c.id = money_row.id));' passes
w "a foreign key to another table" 'ALTER TABLE money_row ADD CONSTRAINT fk FOREIGN KEY (id) REFERENCES "runtime_case"("id");' passes
# round 2: R2-M1 (aliases; no write read means every named table counts) and minors 1-3
w "UPDATE t alias SET (an alias without AS)" 'ALTER TABLE money_row ADD COLUMN a TEXT; UPDATE "runtime_case" c SET id = c.id;' refused
w "UPDATE t AS \"a\" SET (a quoted alias)" 'ALTER TABLE money_row ADD COLUMN a TEXT; UPDATE runtime_case AS "c" SET id = id;' refused
w "a migration whose only write the patterns miss (every named table counts)" 'SELECT set_config(...) FROM runtime_case;' refused
w "dynamic SQL over an ARRAY of tables (EXECUTE format)" "ALTER TABLE money_row ADD COLUMN a TEXT; DO \$\$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['runtime_case'] LOOP EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t); END LOOP; END \$\$;" refused
w "an error message naming a table (not a table literal)" "ALTER TABLE money_row ADD COLUMN a TEXT; DO \$\$ BEGIN EXECUTE 'SELECT 1'; RAISE EXCEPTION 'runtime_case: % is missing', 1; END \$\$;" passes
w "ON CONFLICT DO UPDATE SET (no table there)" 'INSERT INTO money_row (id) VALUES (1) ON CONFLICT (id) DO UPDATE SET id = EXCLUDED.id;' passes
w "GRANT ... ON a, b (the second table)" 'ALTER TABLE money_row ADD COLUMN a TEXT; GRANT SELECT ON money_row, runtime_case TO someone;' refused
w "COMMENT ON TABLE" 'ALTER TABLE money_row ADD COLUMN a TEXT; COMMENT ON TABLE runtime_case IS $c$x$c$;' refused
w "CREATE TYPE of another area" 'ALTER TABLE money_row ADD COLUMN a TEXT; CREATE TYPE "CaseKind" AS ENUM (\'"'"'A'"'"');' refused
w "DROP TYPE a, b (the second type)" 'ALTER TABLE money_row ADD COLUMN a TEXT; DROP TYPE "MoneyKind", "CaseKind";' refused
w "MERGE INTO" 'ALTER TABLE money_row ADD COLUMN a TEXT; MERGE INTO runtime_case r USING money_row m ON r.id = m.id WHEN MATCHED THEN DELETE;' refused
w "COPY into a table" 'ALTER TABLE money_row ADD COLUMN a TEXT; COPY runtime_case FROM STDIN;' refused
w "CREATE RULE ... AS ON ... TO" 'ALTER TABLE money_row ADD COLUMN a TEXT; CREATE RULE r AS ON INSERT TO runtime_case DO INSTEAD NOTHING;' refused
w "a view of another area" 'ALTER TABLE money_row ADD COLUMN a TEXT; CREATE OR REPLACE VIEW case_view AS SELECT 1 AS id;' refused
w "PARTITION OF another table" 'ALTER TABLE money_row ADD COLUMN a TEXT; CREATE TABLE money_row_p PARTITION OF runtime_case FOR VALUES IN (1);' refused
w "a trigger on another schema's qualified name" 'ALTER TABLE money_row ADD COLUMN a TEXT; CREATE TRIGGER t AFTER INSERT ON audit.runtime_case FOR EACH ROW EXECUTE FUNCTION f();' refused
w "a quoted policy name with spaces" 'ALTER TABLE money_row ADD COLUMN a TEXT; CREATE POLICY "case wall" ON runtime_case USING (true);' refused
w "ALTER SEQUENCE of the table's sequence" 'ALTER TABLE money_row ADD COLUMN a TEXT; ALTER SEQUENCE runtime_case_id_seq RESTART;' refused
w "an E'' string with an escaped quote and --" "ALTER TABLE money_row ADD COLUMN a TEXT; SELECT E'\\'--'; ALTER TABLE runtime_case ADD COLUMN b TEXT;" refused
mig shok 20261122040000_shared__ok 'ALTER TABLE money_row ADD COLUMN s TEXT; ALTER TABLE runtime_case ADD COLUMN s TEXT;'
out=$(chk main..shok); r=$?
ok "3. a migration writing two areas passes when it is named shared" "$([ $r = 0 ] && echo 1)" "exit $r: $out"
mig eq 20261122033000_client-money__eq 'ALTER TABLE money_row ADD COLUMN e TEXT;'
out=$(chk main..eq); r=$?
ok "3. a stamp equal to main's newest is refused (it must be after)" "$([ $r = 1 ] && echo 1)" "exit $r: $out"
mig keep 20261118150000_client-money__keep 'SELECT 1;' cases.prisma
out=$(chk main..keep); r=$?
ok "3. a refusal for the stamp alone keeps the author's area" "$([ $r = 1 ] && grep -qE "Fix: git mv $M/20261118150000_client-money__keep $M/[0-9]{14}_client-money__keep" <<< "$out" && echo 1)" "exit $r: $out"
git checkout -q -B main4 main; for x in 20991231000000_future 20261340000000_notadate; do mkdir -p "$M/$x"; echo 'SELECT 1;' > "$M/$x/migration.sql"; done; git add -A; git commit -qm main4; git checkout -q main
git checkout -q -B b4 main4; mkdir -p "$M/20261122040000_client-money__b4"; echo 'ALTER TABLE money_row ADD COLUMN q TEXT;' > "$M/20261122040000_client-money__b4/migration.sql"; git add -A; git commit -qm b4; git checkout -q main
out=$(chk main4..b4); r=$?
ok "3. a bad stamp already on main (far ahead, or no date) is not taken as main's newest" "$([ $r = 0 ] && echo 1)" "exit $r: $out"
# M2: a Prisma back-relation in another schema file does not make it shared
mig back 20261122040000_client-money__back 'CREATE TABLE money_row2 (id TEXT REFERENCES runtime_case(id));' cases.prisma
out=$(chk main..back); r=$?
ok "3. M2: a back-relation edit in another schema file (cases.prisma) keeps the area (client-money)" "$([ $r = 0 ] && echo 1)" "exit $r: $out"
mig hint 20261122040000_hint 'SELECT 1;' client-money.prisma
out=$(chk main..hint); r=$?
ok "3. M2: with no table written, the edited schema file suggests the area" "$([ $r = 1 ] && grep -qF "$M/20261122040000_client-money__hint" <<< "$out" && echo 1)" "exit $r: $out"
# invalid areas and stamps, the barrier exemption
mig nosuch 20261122040000_nosuch__x 'SELECT 1;'
out=$(chk main..nosuch); r=$?
ok "3. an area that is no schema file is refused" "$([ $r = 1 ] && grep -q "neither a schema file" <<< "$out" && echo 1)" "exit $r: $out"
mig bar 20261122040000_base__x 'ALTER TABLE platform_firm ADD COLUMN a TEXT; ALTER TABLE money_row ADD COLUMN b TEXT;'
out=$(chk main..bar); r=$?
ok "3. a barrier area may name a migration that also writes other areas (it waits for everything)" "$([ $r = 0 ] && echo 1)" "exit $r: $out"
mig far 20991231000000_client-money__far 'ALTER TABLE money_row ADD COLUMN a TEXT;'
out=$(chk main..far); r=$?
ok "3. a stamp far in the future is refused (it would hold every later migration)" "$([ $r = 1 ] && grep -q "at most two days ahead" <<< "$out" && echo 1)" "exit $r: $out"
mig baddate 20261340000000_client-money__bad 'ALTER TABLE money_row ADD COLUMN a TEXT;'
out=$(chk main..baddate); r=$?
ok "3. a stamp that is no date is refused with a fix, no crash" "$([ $r = 1 ] && grep -q "Fix: git mv" <<< "$out" && echo 1)" "exit $r: $out"
# M3: a new schema area needs its slot, and --write adds it
git checkout -q -B newarea main; printf 'model Note {\n  id String @id\n  @@map("case_note")\n}\n' > "$SC/case-notes.prisma"
mkdir -p "$M/20261122040000_case-notes__n"; echo 'CREATE TABLE case_note (id TEXT);' > "$M/20261122040000_case-notes__n/migration.sql"; git add -A; git commit -qm newarea
out=$(chk main..newarea); r=$?
ok "3. M3: a new schema area without its slot is refused with the mergify --write command" "$([ $r = 1 ] && grep -q "has no slot mig-case-notes" <<< "$out" && grep -q "mergify --write .mergify.yml" <<< "$out" && echo 1)" "exit $r: $out"
(ROOT="$G" python3 -I "$MS" mergify --write .mergify.yml >/dev/null); git add -A; git commit -qm slot
out=$(chk main..newarea); r=$?
ok "3. M3: ... and passes once mergify --write added mig-case-notes" "$([ $r = 0 ] && grep -q "mig-case-notes:" .mergify.yml && echo 1)" "exit $r: $out"
out=$(ROOT="$G" python3 -I "$MS" mergify --check .mergify.yml); r=$?
ok "3. M3: mergify --write is idempotent and --check passes" "$([ $r = 0 ] && cp .mergify.yml "$T/m1" && ROOT="$G" python3 -I "$MS" mergify --write .mergify.yml >/dev/null && cmp -s .mergify.yml "$T/m1" && echo 1)" "$out"
git checkout -q main
mchk() { (cd "$G" && ROOT="$G" python3 -I "$MS" mergify --check "$1" >/dev/null 2>&1); echo $?; }
grep -v '_base__' "$G/.mergify.yml" > "$T/m-bar.yml"
ok "3. mergify --check refuses a missing barrier line" "$([ "$(mchk "$T/m-bar.yml")" = 1 ] && echo 1)"
sed 's/^      pipeline:$/      mig-nosuch:\n        include:\n          - "x"\n      pipeline:/' "$G/.mergify.yml" > "$T/m-stray.yml"
ok "3. mergify --check refuses a mig- scope with no schema file" "$([ "$(mchk "$T/m-stray.yml")" = 1 ] && echo 1)"
sed "s#^      pipeline:\$#      migrations:\n        include:\n          - \"$M/**\"\n      pipeline:#" "$G/.mergify.yml" > "$T/m-old.yml"
ok "3. mergify --check refuses the old one shared migrations scope" "$([ "$(mchk "$T/m-old.yml")" = 1 ] && echo 1)"
printf 'scopes:\n  source:\n    files: {}\n' > "$T/m-noanchor.yml"; cp "$T/m-noanchor.yml" "$T/m-noanchor.keep"
(cd "$G" && ROOT="$G" python3 -I "$MS" mergify --write "$T/m-noanchor.yml" >/dev/null 2>&1); r=$?
# a hand edit inside a generated scope: the rewrite would leave an orphan line and fail its own check, so nothing is written
# a hand edit inside a generated scope (an exclude:, a comment) goes with the scope: nothing is left behind
awk '{print} /^      mig-client-money:$/{print "        # a hand note"; print "        exclude:"; print "          - \"x\""}' "$G/.mergify.yml" > "$T/m-hand.yml"
(cd "$G" && ROOT="$G" python3 -I "$MS" mergify --write "$T/m-hand.yml" >/dev/null 2>&1); r2=$?
ok "3. mergify --write replaces a generated scope whole (a hand edit inside it leaves nothing behind)" "$([ $r2 = 0 ] && ! grep -q 'exclude:\|a hand note' "$T/m-hand.yml" && cmp -s "$T/m-hand.yml" "$G/.mergify.yml" && echo 1)" "exit $r2"
sed 's/^      mig-cases:$/      mig-cases:\n        exclude:\n          - "x"/' "$G/.mergify.yml" > "$T/m-excl.yml"
ok "3. mergify --check refuses a key besides include in a generated scope" "$([ "$(mchk "$T/m-excl.yml")" = 1 ] && echo 1)"
ok "3. mergify --write without its anchors exits 2 and writes nothing" "$([ $r = 2 ] && cmp -s "$T/m-noanchor.yml" "$T/m-noanchor.keep" && echo 1)" "exit $r"
# a batch: another area merged first with a later stamp
git checkout -q -B main2 main; mkdir -p "$M/20261122050000_cases__later"; echo 'ALTER TABLE "runtime_case" ADD COLUMN "q" TEXT;' > "$M/20261122050000_cases__later/migration.sql"; git add -A; git commit -qm later; git checkout -q main
git checkout -q -B batch main2; git merge -q --no-edit good 2>/dev/null; git checkout -q main
out=$(chk main2..batch); r=$?
ok "3. as a PR, a stamp before main's newest (another area) is refused" "$([ $r = 1 ] && echo 1)" "exit $r: $out"
out=$(chk --batch main2..batch); r=$?
ok "3. in a merge batch, another area's later migration does not hold it (--batch)" "$([ $r = 0 ] && echo 1)" "exit $r: $out"
git checkout -q -B main3 main; mkdir -p "$M/20261122050000_client-money__later"; echo 'ALTER TABLE "money_row" ADD COLUMN "q" TEXT;' > "$M/20261122050000_client-money__later/migration.sql"; git add -A; git commit -qm later3; git checkout -q main
git checkout -q -B batch3 main3; git merge -q --no-edit good 2>/dev/null; git checkout -q main
out=$(chk --batch main3..batch3); r=$?
ok "3. in a merge batch, the same area's later migration is refused" "$([ $r = 1 ] && echo 1)" "exit $r: $out"
for later in 20261122050000_shared__l 20261122050000_base__l 20261122050000_legacy_name; do
  git checkout -q -B "m-$later" main; mkdir -p "$M/$later"; echo 'SELECT 1;' > "$M/$later/migration.sql"; git add -A; git commit -qm "$later"; git checkout -q main
  git checkout -q -B "b-$later" "m-$later"; git merge -q --no-edit good 2>/dev/null; git checkout -q main
  out=$(chk --batch "m-$later..b-$later"); r=$?
  ok "3. in a merge batch, a later $(sed 's/^[0-9]*_//; s/__l$//' <<< "$later") migration on main holds a client-money one" "$([ $r = 1 ] && echo 1)" "exit $r: $out"
done
mig sharedb 20261122040000_shared__s 'ALTER TABLE money_row ADD COLUMN s TEXT; ALTER TABLE runtime_case ADD COLUMN s TEXT;'
git checkout -q -B b-sharedb main2; git merge -q --no-edit sharedb 2>/dev/null; git checkout -q main
out=$(chk --batch main2..b-sharedb); r=$?
ok "3. in a merge batch, a shared migration is held by any area's later migration" "$([ $r = 1 ] && echo 1)" "exit $r: $out"
# an applied migration edited
git checkout -q -B edit main; echo '-- edited' >> "$M/20261122033000_qa644_reserve_staging/migration.sql"; git add -A; git commit -qm edit; git checkout -q main
out=$(chk main..edit); r=$?
ok "3. an edited migration already on main is refused" "$([ $r = 1 ] && grep -q "already on main and changed here" <<< "$out" && echo 1)" "exit $r: $out"
git checkout -q edit; mkdir -p "$M/20261122040000_client-money__repair"
echo "UPDATE _prisma_migrations SET checksum = 'x' WHERE migration_name = '20261122033000_qa644_reserve_staging';" > "$M/20261122040000_client-money__repair/migration.sql"; git add -A; git commit -qm repair; git checkout -q main
out=$(chk main..edit); r=$?
ok "3. ... unless the change re-records its checksum in a new migration" "$([ $r = 0 ] && echo 1)" "exit $r: $out"
git checkout -q -B edit2 main; echo '-- edited' >> "$M/20261122033000_qa644_reserve_staging/migration.sql"; mkdir -p "$M/20261122040000_client-money__fake"
printf '%s\n' "-- UPDATE _prisma_migrations SET checksum = 'x' WHERE migration_name = '20261122033000_qa644_reserve_staging';" "SELECT count(*) FROM _prisma_migrations; ALTER TABLE money_row ADD COLUMN f TEXT;" > "$M/20261122040000_client-money__fake/migration.sql"; git add -A; git commit -qm fake; git checkout -q main
git checkout -q -B edit3 main; echo '-- edited' >> "$M/20261122033000_qa644_reserve_staging/migration.sql"; mkdir -p "$M/20261122040000_client-money__other"
echo "UPDATE _prisma_migrations SET checksum = 'x' WHERE migration_name = '20261122033000_some_other_folder'; ALTER TABLE money_row ADD COLUMN o TEXT;" > "$M/20261122040000_client-money__other/migration.sql"; git add -A; git commit -qm other; git checkout -q main
out=$(chk main..edit3); r=$?
ok "3. ... a repair of another folder does not cover this one" "$([ $r = 1 ] && grep -q "already on main and changed here" <<< "$out" && echo 1)" "exit $r: $out"
out=$(chk main..edit2); r=$?
ok "3. ... a repair only in a comment, or a mere mention of _prisma_migrations, is not one" "$([ $r = 1 ] && grep -q "already on main and changed here" <<< "$out" && echo 1)" "exit $r: $out"

# 1 and 2. slots: clash, and the Mergify scopes
cl() { printf '%s\n' "$1" > "$T/a"; printf '%s\n' "$2" > "$T/b"; python3 -I "$MS" clash "$T/a" "$T/b"; echo $?; }
ok "1. two migrations in different areas may queue together (clash exit 1)" "$([ "$(cl "$M/20261122040000_client-money__a/migration.sql" "$M/20261122040100_cases__b/migration.sql")" = 1 ] && echo 1)"
ok "2. two migrations of the same area wait in order (clash exit 0)" "$([ "$(cl "$M/20261122040000_client-money__a/migration.sql" "$M/20261122040100_client-money__b/migration.sql")" = 0 ] && echo 1)"
ok "2. a shared migration waits for any area" "$([ "$(cl "$M/20261122040000_shared__a/migration.sql" "$M/20261122040100_cases__b/migration.sql")" = 0 ] && echo 1)"
python3 -I "$MS" clash "$T/does-not-exist" "$T/b" 2>/dev/null; r=$?
ok "2. clash exits 2 on an error (queue-gate reads anything but 1 as a clash)" "$([ $r = 2 ] && echo 1)" "exit $r"
ok "2. a migration named before SPD-2 waits for any area (fails closed)" "$([ "$(cl "$M/20261122040000_fo7ts/migration.sql" "$M/20261122040100_cases__b/migration.sql")" = 0 ] && echo 1)"
cd "$ROOTD"
scopes=$(python3 -I - "$ROOTD/.mergify.yml" <<'PY'
import re, sys, yaml
c = yaml.safe_load(open(sys.argv[1])); s = c["scopes"]; f = s["source"]["files"]
def rx(g):
    o, i = "", 0
    while i < len(g):
        if g.startswith("**", i): o += ".*"; i += 2
        elif g[i] == "*": o += "[^/]*"; i += 1
        else: o += re.escape(g[i]); i += 1
    return re.compile(o + r"\Z")
M = "ai-workers/problem-1-pathway-setup-and-form-filling/prototype/studio/prisma/migrations/"
def scopes(p): return sorted(k for k, v in f.items() if any(rx(g).match(p) for g in (v or {}).get("include") or []))
a = scopes(M + "20261122040000_client-money__a/migration.sql"); b = scopes(M + "20261122040100_cases__b/migration.sql")
c2 = scopes(M + "20261122040100_client-money__c/migration.sql"); sh = scopes(M + "20261122040100_shared__d/migration.sql")
print("diff" if a and b and not set(a) & set(b) else "share", "same" if set(a) & set(c2) else "apart",
      "cap1" if all(s["capacities"].get(k) == 1 for k in a + b) else "nocap", "shared-all" if set(a) <= set(sh) and set(b) <= set(sh) else "shared-some",
      "no-global" if "migrations" not in f else "global")
PY
)
ok "1. Mergify: different areas are in different scopes" "$(grep -qw diff <<< "$scopes" && echo 1)" "$scopes"
ok "2. Mergify: one area is one scope with capacity 1" "$(grep -qw same <<< "$scopes" && grep -qw cap1 <<< "$scopes" && echo 1)" "$scopes"
ok "2. Mergify: a shared migration is in every area's scope" "$(grep -qw shared-all <<< "$scopes" && echo 1)" "$scopes"
ok "1. Mergify: the one product-wide migrations slot is gone" "$(grep -qw no-global <<< "$scopes" && echo 1)" "$scopes"
# The app tree (schema files, module cards) is absent in check-guards.sh's mutation copy, which holds only the tools,
# the workflows and .mergify.yml: there the cases that need it are skipped, so a guard 37 row fails for its own reason.
REAL=0; [ -d "$ROOTD/$SC" ] && [ -d "$ROOTD/.claude/rules/modules" ] && REAL=1
[ "$REAL" = 1 ] || echo "SKIP  the cases that read the app tree (no $SC here: check-guards.sh's mutation copy)"
if [ "$REAL" = 1 ]; then
out=$(python3 -I "$MS" mergify --check "$ROOTD/.mergify.yml"); r=$?
ok ".mergify.yml holds exactly the generated per-area slots" "$([ $r = 0 ] && echo 1)" "$out"
fi
# Fault 2 (Lead 4 on #3035, 23 Nov): the approved set-up's manifest pinned the old one slot ("migrations": 1), so the
# heartbeat's conformance check would fail the day this merged. The manifest now pins every mig-<area> scope at 1.
MAN="$ROOTD/ai-workers/problem-1-pathway-setup-and-form-filling/product/design/engineering-approved-setup.json"
if [ -f "$MAN" ]; then
out=$(python3 -I "$TOOLS/conformance-check.py" --root "$ROOTD" 2>&1 | grep -E 'mergify\.capacities'); true
ok "the approved set-up's manifest pins the per-area slots, and this .mergify.yml conforms (mergify.capacities)" "$(grep -q '^PASS mergify.capacities' <<< "$out" && grep -q 'mig-\*' <<< "$out" && echo 1)" "$out"
fi
ok "ci.yml runs the check on every PR and batch (fast job; --batch in the queue)" "$(grep -q 'migration-slots.py" check $(\[ "$QUEUE" = true \] && echo --batch) "$RANGE"' "$ROOTD/.github/workflows/ci.yml" && echo 1)"
ok "queue-gate.sh re-checks only for a migration of the same area (migration-slots.py clash)" "$(grep -q 'migration-slots.py" clash' "$TOOLS/queue-gate.sh" && echo 1)"

# 4. a one-module change runs only its suites
ok "4. pr-suites.yml and pr-suites-plan.sh run by module" "$(grep -q -- '--changed "$RANGE" --modules' "$ROOTD/.github/workflows/pr-suites.yml" && grep -q -- '--modules --list' "$TOOLS/pr-suites-plan.sh" && echo 1)"
ok "4. the merge batch and the nightly still run every suite (no --modules there)" "$(! grep -q -- '--modules' "$ROOTD/.github/workflows/ci.yml" && ! grep -q -- '--modules' "$ROOTD/.github/workflows/nightly.yml" && echo 1)"
if [ "$REAL" = 1 ]; then
P=ai-workers/problem-1-pathway-setup-and-form-filling
f="$S/api/src/client-money/invoices/drafts.ts"
sel=$(echo "$f" | python3 -I "$TOOLS/module-suites.py"); r=$?
card=$(sed -n 's/^\*\*Tests\.\*\*//p' "$S/api/src/client-money/MODULE.md" | grep -o 'check_[A-Za-z0-9_.-]*\.\(ts\|cjs\)' | sort -u)
mine=$(cut -f1 <<< "$sel" | sort -u)
smoke=$(sed -n 's/^const SMOKE = \[\(.*\)\];.*/\1/p' "$TOOLS/select-suites.mjs" | grep -o 'check_[A-Za-z0-9_.-]*' | sort -u)
rows=$(cat "$S/api/src/client-money/MODULE.rows/"*.md 2>/dev/null | sed -n 's/^Tests://p' | grep -o 'check_[A-Za-z0-9_.-]*\.\(ts\|cjs\)' | sort -u)
extra=$(comm -23 <(echo "$mine") <(printf '%s\n' "$card" "$rows" "$smoke" | sort -u))
ok "4. a one-module change runs only its card's suites and the always-run set" "$([ $r = 0 ] && [ -z "$extra" ] && [ -n "$card" ] && echo 1)" "exit $r; not the module's: $(echo $extra)"
ok "4. ... every suite on its card is chosen" "$([ -z "$(comm -23 <(echo "$card") <(echo "$mine"))" ] && echo 1)" "$(echo $mine)"
ok "4. ... and every suite on its row files (P-712)" "$([ -n "$rows" ] && [ -z "$(comm -23 <(echo "$rows") <(echo "$mine"))" ] && echo 1)" "rows: $(echo $rows); chosen: $(echo $mine)"
ok "4. ... and the always-run set" "$([ -z "$(comm -23 <(echo "$smoke") <(echo "$mine"))" ] && echo 1)" "$(echo $mine)"
all=$(echo "$f" | node "$TOOLS/select-suites.mjs" | grep -c .)
ok "4. ... far fewer than the path rules pick ($(grep -c . <<< "$mine") against $all)" "$([ "$(grep -c . <<< "$mine")" -lt "$all" ] && echo 1)"
n=$(bash "$TOOLS/run-suites.sh" --changed "$(git rev-parse HEAD)..$(git rev-parse HEAD)" --modules --list 2>&1 | grep -c '^check_' || true)
ok "4. run-suites.sh --modules is wired (an empty change picks nothing)" "$([ "$n" = 0 ] && echo 1)" "$n"
out=$(echo "$S/tests/check_engine.ts" | python3 -I "$TOOLS/module-suites.py" | cut -f1)
ok "4. a file outside every card keeps select-suites.mjs --direct (a changed suite runs itself)" "$(grep -qx check_engine.ts <<< "$out" && echo 1)" "$out"
out=$(echo "$S/api/src/main.ts" | python3 -I "$TOOLS/module-suites.py" | cut -f2 | grep -vc 'always-run\|on its card' || true)
ok "4. a barrier file (main.ts) is not narrowed to a card" "$([ "${out:-0}" -gt 0 ] && echo 1)" "$out"
fi

echo "$pass passed, $fail failed"
[ "$fail" = 0 ]
