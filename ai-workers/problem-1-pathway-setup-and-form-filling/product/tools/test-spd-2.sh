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
printf 'model RuntimeCase {\n  id String @id\n  @@map("runtime_case")\n}\n' > "$SC/cases.prisma"
printf 'model Firm {\n  id String @id\n  @@map("platform_firm")\n}\n' > "$SC/base.prisma"
echo 'CREATE TABLE "money_row" ("id" TEXT);' > "$M/20261122033000_qa644_reserve_staging/migration.sql"
git add -A && git commit -qm main
mig() {  # mig <branch> <folder> <sql> [schema file to touch]
  git checkout -q -B "$1" main; mkdir -p "$M/$2"; printf '%s\n' "$3" > "$M/$2/migration.sql"
  [ -n "${4:-}" ] && echo "// $1" >> "$SC/$4"; git add -A && git commit -qm "$1"; git checkout -q main; }
chk() { (cd "$G" && ROOT="$G" python3 -I "$MS" check "$@" 2>&1); }

# 3. stamps and areas
mig old 20261118150000_aud1c_money 'ALTER TABLE "money_row" ADD COLUMN "x" TEXT;' client-money.prisma
out=$(chk main..old); r=$?
ok "3. an old stamp is refused (exit 1)" "$([ $r = 1 ] && grep -q "is not after main's newest migration 20261122033000" <<< "$out" && echo 1)" "exit $r: $out"
ok "3. ... with the exact git mv re-stamp command, area included" "$(grep -qF "Fix: git mv $M/20261118150000_aud1c_money $M/20261122033100_client-money__aud1c_money" <<< "$out" && echo 1)" "$out"
mig good 20261122040000_client-money__fo7ts 'ALTER TABLE "money_row" ADD COLUMN "y" TEXT;' client-money.prisma
out=$(chk main..good); r=$?
ok "3. a stamp after main's newest naming its area passes" "$([ $r = 0 ] && echo 1)" "exit $r: $out"
mig noarea 20261122040000_fo7ts 'ALTER TABLE "money_row" ADD COLUMN "y" TEXT;'
out=$(chk main..noarea); r=$?
ok "3. a migration naming no area is refused, the area read from its SQL" "$([ $r = 1 ] && grep -qF "$M/20261122040000_client-money__fo7ts" <<< "$out" && echo 1)" "exit $r: $out"
mig wrong 20261122040000_cases__fo7ts 'ALTER TABLE "money_row" ADD COLUMN "y" TEXT;'
out=$(chk main..wrong); r=$?
ok "3. a migration naming the wrong area is refused" "$([ $r = 1 ] && grep -q "changes client-money, not only 'cases'" <<< "$out" && echo 1)" "exit $r: $out"
mig two 20261122040000_client-money__both 'ALTER TABLE "money_row" ADD COLUMN "y" TEXT; CREATE TRIGGER t AFTER DELETE ON "runtime_case" FOR EACH ROW EXECUTE FUNCTION f();'
out=$(chk main..two); r=$?
ok "3. a migration writing two areas must be shared" "$([ $r = 1 ] && grep -qF "$M/20261122040000_shared__both" <<< "$out" && echo 1)" "exit $r: $out"
mig cmt 20261122040000_client-money__cmt '-- UPDATE "runtime_case" in a comment is not a change
ALTER TABLE "money_row" ADD COLUMN "z" TEXT;'
out=$(chk main..cmt); r=$?
ok "3. a comment's words are not changes" "$([ $r = 0 ] && echo 1)" "exit $r: $out"
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
# an applied migration edited
git checkout -q -B edit main; echo '-- edited' >> "$M/20261122033000_qa644_reserve_staging/migration.sql"; git add -A; git commit -qm edit; git checkout -q main
out=$(chk main..edit); r=$?
ok "3. an edited migration already on main is refused" "$([ $r = 1 ] && grep -q "already on main and changed here" <<< "$out" && echo 1)" "exit $r: $out"
git checkout -q edit; mkdir -p "$M/20261122040000_client-money__repair"
echo "UPDATE _prisma_migrations SET checksum = 'x' WHERE migration_name = '20261122033000_qa644_reserve_staging';" > "$M/20261122040000_client-money__repair/migration.sql"; git add -A; git commit -qm repair; git checkout -q main
out=$(chk main..edit); r=$?
ok "3. ... unless the change re-records its checksum in a new migration" "$([ $r = 0 ] && echo 1)" "exit $r: $out"

# 1 and 2. slots: clash, and the Mergify scopes
cl() { printf '%s\n' "$1" > "$T/a"; printf '%s\n' "$2" > "$T/b"; python3 -I "$MS" clash "$T/a" "$T/b"; echo $?; }
ok "1. two migrations in different areas may queue together (clash exit 1)" "$([ "$(cl "$M/20261122040000_client-money__a/migration.sql" "$M/20261122040100_cases__b/migration.sql")" = 1 ] && echo 1)"
ok "2. two migrations of the same area wait in order (clash exit 0)" "$([ "$(cl "$M/20261122040000_client-money__a/migration.sql" "$M/20261122040100_client-money__b/migration.sql")" = 0 ] && echo 1)"
ok "2. a shared migration waits for any area" "$([ "$(cl "$M/20261122040000_shared__a/migration.sql" "$M/20261122040100_cases__b/migration.sql")" = 0 ] && echo 1)"
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
out=$(python3 -I "$MS" mergify --check "$ROOTD/.mergify.yml"); r=$?
ok ".mergify.yml holds exactly the generated per-area slots" "$([ $r = 0 ] && echo 1)" "$out"
ok "ci.yml runs the check on every PR and batch (fast job; --batch in the queue)" "$(grep -q 'migration-slots.py" check $(\[ "$QUEUE" = true \] && echo --batch) "$RANGE"' "$ROOTD/.github/workflows/ci.yml" && echo 1)"
ok "queue-gate.sh re-checks only for a migration of the same area (migration-slots.py clash)" "$(grep -q 'migration-slots.py" clash' "$TOOLS/queue-gate.sh" && echo 1)"

# 4. a one-module change runs only its suites
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
ok "4. ... and the always-run set" "$([ -z "$(comm -23 <(echo "$smoke") <(echo "$mine"))" ] && echo 1)" "$(echo $mine)"
all=$(echo "$f" | node "$TOOLS/select-suites.mjs" | grep -c .)
ok "4. ... far fewer than the path rules pick ($(grep -c . <<< "$mine") against $all)" "$([ "$(grep -c . <<< "$mine")" -lt "$all" ] && echo 1)"
n=$(bash "$TOOLS/run-suites.sh" --changed "$(git rev-parse HEAD)..$(git rev-parse HEAD)" --modules --list 2>&1 | grep -c '^check_' || true)
ok "4. run-suites.sh --modules is wired (an empty change picks nothing)" "$([ "$n" = 0 ] && echo 1)" "$n"
out=$(echo "$S/tests/check_engine.ts" | python3 -I "$TOOLS/module-suites.py" | cut -f1)
ok "4. a file outside every card keeps select-suites.mjs --direct (a changed suite runs itself)" "$(grep -qx check_engine.ts <<< "$out" && echo 1)" "$out"
out=$(echo "$S/api/src/main.ts" | python3 -I "$TOOLS/module-suites.py" | cut -f2 | grep -vc 'always-run\|on its card' || true)
ok "4. a barrier file (main.ts) is not narrowed to a card" "$([ "${out:-0}" -gt 0 ] && echo 1)" "$out"
ok "4. pr-suites.yml and pr-suites-plan.sh run by module" "$(grep -q -- '--changed "$RANGE" --modules' "$ROOTD/.github/workflows/pr-suites.yml" && grep -q -- '--modules --list' "$TOOLS/pr-suites-plan.sh" && echo 1)"
ok "4. the merge batch and the nightly still run every suite (no --modules there)" "$(! grep -q -- '--modules' "$ROOTD/.github/workflows/ci.yml" && ! grep -q -- '--modules' "$ROOTD/.github/workflows/nightly.yml" && echo 1)"

echo "$pass passed, $fail failed"
[ "$fail" = 0 ]
