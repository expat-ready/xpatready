#!/usr/bin/env bash
# PF-8r (map row 14, first half; NFR5-04 "quarterly restore drill … with recorded evidence"; P-586, MVP-CHECKLIST C13
# "one restore drill passed"): a restore drill on deploy/compose.test.yml's pinned PostgreSQL, local, US$0.
#   bash studio/tools/restore-drill.sh [--evidence <file>] [--corrupt <table>] [--extra-migration]
#     1. source: a compose project of compose.test.yml (db, migrate = the release step, app with the Sample firms seeded
#        at start); the existing demo reset (POST /api/demo/load, the suites' fixture with a Release 1) and one demo case
#        opened through the product's own route (POST /api/runtime/cases); no new seed. The app is stopped before the dump.
#     2. dump: `pg_dumpall --globals-only` (the roles: pg_dump does not dump them; PF-12's xr_* roles) and
#        `pg_dump --format=custom` of the database.
#     3. restore: globals, then `pg_restore`, into a FRESH PostgreSQL of the same pinned image: a second compose project
#        with its own anonymous volume (never the first database; the drill checks the two server system ids differ).
#     4. checks, each PASS or FAIL with what it saw: `prisma migrate status` (nothing pending or failed); `prisma migrate
#        diff --from-config-datasource --to-schema prisma/schema --exit-code` (Prisma 7's spelling of --from-url /
#        --to-schema-datamodel) gives the restored copy the source's very difference, and the two schemas read from the
#        catalogue are the same (no drift from the restore; main's own small difference from prisma/schema is named in words); for the tables below the same row count and the same SHA-256 of the sorted
#        primary keys; the app starts against the restored database and tools/skeleton-smoke.sh passes; the audit chain
#        (AUD-1c's verifier, a SKIP in words until it is on main).
#     5. prints the measured restore time (dump start to the last check) and writes the evidence file (default
#        var/restore-drill/restore-drill-evidence.json): time, main's sha, each check's result, the table counts.
#        No row data and no personal data, in the file or in this log: only names of tables, counts and yes/no.
#   Fail cases (tests/check_pf8r_restore.ts): --corrupt <table> deletes that table's rows in the RESTORED copy after the
#   restore (simulated corruption); --extra-migration checks the restored database against a copy of prisma/migrations
#   holding one migration that was never applied to it.
# Needs docker (compose v2) and the image studio-skeleton:test (`docker compose -f deploy/compose.test.yml build`).
# bash 3.2 compatible (the Mac). Never calls a model; live AI off; US$0. Exit 0 only when every check passed.
set -uo pipefail
STUDIO="$(cd "$(dirname "$0")/.." && pwd)"
COMPOSE="$STUDIO/deploy/compose.test.yml"
IMAGE="studio-skeleton:test"
EVIDENCE="$STUDIO/var/restore-drill/restore-drill-evidence.json"; CORRUPT=""; EXTRA=0
while [ $# -gt 0 ]; do case "$1" in
  --evidence) EVIDENCE="${2:?--evidence wants a file}"; shift 2;;
  --corrupt) CORRUPT="${2:?--corrupt wants a table}"; shift 2;;
  --extra-migration) EXTRA=1; shift;;
  *) echo "restore-drill.sh: unknown argument $1 (--evidence <file>, --corrupt <table>, --extra-migration)" >&2; exit 2;;
esac; done
case "$CORRUPT" in ""|[a-z]*) ;; *) echo "--corrupt wants a table name" >&2; exit 2;; esac
printf '%s' "$CORRUPT" | grep -q '[^a-z0-9_]' && { echo "--corrupt wants a table name (a-z, 0-9, _)" >&2; exit 2; }
TAG="${RESTORE_DRILL_TAG:-$$}"
SRC="xr-drill-src-$TAG"; DST="xr-drill-dst-$TAG"
SRC_PORT="${RESTORE_DRILL_SRC_PORT:-4481}"; DST_PORT="${RESTORE_DRILL_PORT:-4482}"
TMP="$(mktemp -d)"
cleanup() {
  docker compose -p "$SRC" -f "$COMPOSE" down -v --remove-orphans >/dev/null 2>&1
  docker compose -p "$DST" -f "$COMPOSE" down -v --remove-orphans >/dev/null 2>&1
  rm -rf "$TMP"
}
trap cleanup EXIT
fails=0; CHECKS=""; T0=""
# json_str <text>: a JSON string (only the drill's own words reach it: table names, counts, prisma's migration names).
json_str() { local s; s=$(printf '%s' "$1" | tr '\n\t' '  ' | sed 's/\\/\\\\/g; s/"/\\"/g'); printf '"%s"' "$s"; }
record() { CHECKS="$CHECKS${CHECKS:+,}{\"check\":$(json_str "$2"),\"result\":\"$1\",\"saw\":$(json_str "$3")}"; }
pass() { echo "PASS  $1: $2"; record PASS "$1" "$2"; }
fail() { echo "FAIL  $1: $2"; record FAIL "$1" "$2"; fails=$((fails + 1)); }
skip() { echo "SKIP  $1: $2"; record SKIP "$1" "$2"; }
dc() { local p="$1"; shift; docker compose -p "$p" -f "$COMPOSE" "$@"; }
# q <project> <sql>: one value, as the bootstrap superuser (the table owner; it reads past PF-12's row-level security).
q() { dc "$1" exec -T db psql -U studio -d studio -XAtq -v ON_ERROR_STOP=1 -c "$2"; }
# prisma <project> <args>: the image's own prisma CLI on that project's network, against its database.
prisma() { local p="$1"; shift; docker run --rm --network "${p}_default" -e DATABASE_URL=postgresql://studio@db:5432/studio "$@"; }
abort() { fail "$1" "$2"; write_evidence; echo "restore drill: stopped ($fails failed)"; exit 1; }

# The tables compared (PF-8r brief): every platform_*, fo_*, msg_* and module_event table, plus the case tables the demo
# case fills. A case table missing from the database is a FAIL (the list is fixed here, never read from what is there).
PREFIXES="platform_ fo_ msg_"
CASE_TABLES="module_event runtime_case firm_case_counter case_team_member case_stage case_participant party party_profile pack_work_pin audit_event config_release combination"
TABLES=""; TABLE_JSON=""

write_evidence() {
  local secs="null"; [ -n "$T0" ] && secs=$(( $(date +%s) - T0 ))
  mkdir -p "$(dirname "$EVIDENCE")"
  printf '{"drill":"PF-8r restore drill (local, compose.test.yml)","rule":"NFR5-04; P-586","at":"%s","main_sha":"%s","restore_seconds":%s,"result":"%s","failed":%s,"options":{"corrupt":%s,"extra_migration":%s},"checks":[%s],"tables":[%s]}\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$(git -C "$STUDIO" rev-parse HEAD 2>/dev/null || echo unknown)" "$secs" \
    "$( [ "$fails" = 0 ] && echo pass || echo fail)" "$fails" "$(json_str "$CORRUPT")" "$( [ "$EXTRA" = 1 ] && echo true || echo false)" "$CHECKS" "$TABLE_JSON" > "$EVIDENCE"
}

docker image inspect "$IMAGE" >/dev/null 2>&1 || { echo "FAIL  image: $IMAGE is not built (docker compose -f deploy/compose.test.yml build)"; exit 1; }

# 1. the source database: migrations, the Sample firms (seeded at the app's start), the demo reset and one demo case.
echo "restore drill: source $SRC (port $SRC_PORT), restored copy $DST (port $DST_PORT)"
SKELETON_PORT="$SRC_PORT" dc "$SRC" up -d --no-build --wait --wait-timeout 180 >"$TMP/src-up.log" 2>&1 \
  || { tail -20 "$TMP/src-up.log"; abort "source" "compose.test.yml did not start (db, migrate, app)"; }
api() { curl -sS -o "$TMP/api.json" -w '%{http_code}' --max-time 300 -H 'content-type: application/json' -H "x-actor: $2" -X POST --data "$3" "http://127.0.0.1:$SRC_PORT/api$1" 2>/dev/null || echo 000; }
code=$(api /demo/load user-A '{}')
case "$code" in 200|201) ;; *) abort "source" "the demo reset (POST /api/demo/load, the suites' fixture) answered $code";; esac
comb=$(q "$SRC" "select c.id from combination c join config_release r on r.combination_id = c.id where c.retired_at is null order by c.created_at limit 1")
[ -n "$comb" ] || abort "source" "the demo reset left no released combination to open the demo case on"
code=$(api /runtime/cases user-O "{\"combinationId\":\"$comb\",\"reference\":\"DRILL-$TAG\",\"clientActor\":\"user-P\",\"principal\":{\"displayName\":\"Sample Drill Client\"}}")
[ "$code" = 200 ] || [ "$code" = 201 ] || abort "source" "opening the demo case (POST /api/runtime/cases) answered $code"
dc "$SRC" stop app >/dev/null 2>&1   # nothing writes while the dump runs
firms=$(q "$SRC" "select count(*) from platform_firm"); cases=$(q "$SRC" "select count(*) from runtime_case")
{ [ "${firms:-0}" -gt 0 ] && [ "${cases:-0}" -gt 0 ]; } || abort "source" "the source holds $firms firm(s) and $cases case(s); the drill needs both"
pass "source" "migrations applied, $firms Sample firm(s), the demo reset loaded, $cases demo case(s); app stopped before the dump"

for p in $PREFIXES; do TABLES="$TABLES $(q "$SRC" "select string_agg(tablename, ' ' order by tablename) from pg_tables where schemaname = 'public' and tablename like '${p}%'")"; done
for t in $CASE_TABLES; do
  [ "$(q "$SRC" "select count(*) from pg_tables where schemaname = 'public' and tablename = '$t'")" = 1 ] || abort "tables" "the fixed list names $t, which is not in the database"
  TABLES="$TABLES $t"
done
# pk_sql <table>: count and SHA-256 of the sorted primary keys (the whole row's text where a table has no primary key).
pk_sql() {
  local cols; cols=$(q "$SRC" "select string_agg(format('%I', a.attname), ',' order by k.ord) from pg_index i join lateral unnest(i.indkey) with ordinality k(attnum, ord) on true join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.attnum where i.indrelid = 'public.$1'::regclass and i.indisprimary")
  [ -n "$cols" ] && cols="($cols)::text" || cols="t::text"
  printf 'select count(*) || %s || coalesce(encode(sha256(convert_to(string_agg(%s, E%s order by %s), %s)), %s), %s) from public.%s t' "' '" "$cols" "'\\n'" "$cols" "'UTF8'" "'hex'" "'empty'" "$1"
}
for t in $TABLES; do pk_sql "$t" > "$TMP/sql.$t"; q "$SRC" "$(cat "$TMP/sql.$t")" > "$TMP/src.$t" || abort "tables" "could not read $t in the source"; done

# 2. the dump (the timer starts here: dump start to the last check).
T0=$(date +%s)
dc "$SRC" exec -T db pg_dumpall -U studio --globals-only > "$TMP/globals.sql" 2>"$TMP/dump.err" || abort "dump" "pg_dumpall --globals-only failed: $(head -c 200 "$TMP/dump.err")"
dc "$SRC" exec -T db pg_dump -U studio -d studio --format=custom > "$TMP/studio.dump" 2>"$TMP/dump.err" || abort "dump" "pg_dump failed: $(head -c 200 "$TMP/dump.err")"
roles=$(grep -c '^CREATE ROLE' "$TMP/globals.sql")
pass "dump" "pg_dumpall --globals-only ($roles role(s)) and pg_dump --format=custom ($(wc -c < "$TMP/studio.dump" | tr -d ' ') bytes)"

# 3. a fresh PostgreSQL of the same pinned image, then globals and the dump.
dc "$DST" up -d --no-build --wait --wait-timeout 120 db >"$TMP/dst-up.log" 2>&1 || abort "restore" "the fresh PostgreSQL did not start"
a=$(q "$SRC" "select system_identifier from pg_control_system()"); b=$(q "$DST" "select system_identifier from pg_control_system()")
ta=$(q "$DST" "select count(*) from pg_tables where schemaname = 'public'")
{ [ -n "$a" ] && [ "$a" != "$b" ] && [ "$ta" = 0 ]; } || abort "restore" "the target is not a fresh, separate cluster (system ids differ: $([ "$a" != "$b" ] && echo yes || echo no); tables before restore: $ta)"
# The bootstrap role (studio) exists in every fresh cluster: its CREATE is dropped, its ALTER kept; every other role is created.
grep -v '^CREATE ROLE studio;$' "$TMP/globals.sql" | dc "$DST" exec -T db psql -U studio -d postgres -Xq -v ON_ERROR_STOP=1 >"$TMP/globals.out" 2>&1 \
  || abort "restore" "restoring the globals failed: $(head -c 200 "$TMP/globals.out")"
dc "$DST" exec -T db pg_restore -U studio -d studio --exit-on-error < "$TMP/studio.dump" >"$TMP/restore.out" 2>&1 \
  || abort "restore" "pg_restore failed: $(head -c 300 "$TMP/restore.out")"
pass "restore" "globals and the dump restored into a fresh cluster of the same image (a separate compose project and volume; system ids differ)"
if [ -n "$CORRUPT" ]; then
  # Simulated corruption, AFTER the restore and in the restored copy only (the source and the dump are untouched).
  # session_replication_role = replica: the delete passes foreign keys and triggers, as damage to the files would.
  n=$(q "$DST" "set session_replication_role = replica; with d as (delete from public.$CORRUPT returning 1) select count(*) from d") || abort "corrupt" "could not delete from $CORRUPT"
  echo "NOTE  corrupt: $n row(s) deleted from $CORRUPT in the restored copy after the restore (simulated corruption)"
fi

# 4a. migrations: nothing pending or failed, then no drift.
MIG=()
if [ "$EXTRA" = 1 ]; then
  cp -R "$STUDIO/prisma/migrations" "$TMP/migrations"; chmod -R a+rX "$TMP/migrations"
  mkdir -p "$TMP/migrations/29991231000000_pf8r_drill_never_applied"
  printf -- '-- PF-8r drill fail case: a migration that was never applied to the restored database.\nSELECT 1;\n' > "$TMP/migrations/29991231000000_pf8r_drill_never_applied/migration.sql"
  chmod -R a+rX "$TMP/migrations"
  MIG=(-v "$TMP/migrations:/app/ai-workers/problem-1-pathway-setup-and-form-filling/prototype/studio/prisma/migrations:ro")
fi
prisma "$DST" ${MIG[@]+"${MIG[@]}"} "$IMAGE" ./node_modules/.bin/prisma migrate status > "$TMP/status.out" 2>&1; st=$?
pending=$(sed -n '/not yet been applied/,/^$/p' "$TMP/status.out" | grep -oE '^[0-9]{14}_[a-z0-9_]+' | paste -sd ',' -)
failed=$(grep -oE '[0-9]{14}_[a-z0-9_]+' "$TMP/status.out" | sort -u | while read -r m; do grep -q "failed.*$m\|$m.*failed" "$TMP/status.out" && echo "$m"; done | paste -sd ',' -)
count=$(ls -d "${TMP}/migrations"/*/ 2>/dev/null | wc -l | tr -d ' '); [ "$EXTRA" = 1 ] || count=$(ls -d "$STUDIO/prisma/migrations"/*/ | wc -l | tr -d ' ')
if [ "$st" = 0 ] && grep -q 'Database schema is up to date' "$TMP/status.out"; then pass "migrate status" "$count migration(s), nothing pending or failed"
else fail "migrate status" "exit $st; not applied: ${pending:-none named}; failed: ${failed:-none}"; fi
# migrate diff: main's own migrations already differ a little from prisma/schema (found by this row, 16 Nov: a few id
# defaults and a table only a migration creates; named in words, not the restore's doing). So the drift check is that the
# restored copy differs from prisma/schema exactly as the source does, statement for statement, and that the two copies'
# schemas, read from the catalogue, are line for line the same (migrate status alone does not see drift).
drift() { prisma "$1" "$IMAGE" ./node_modules/.bin/prisma migrate diff --from-config-datasource --to-schema prisma/schema --script --exit-code > "$TMP/drift.$1" 2>"$TMP/drift.$1.err"; echo $?; }
# schema <project>: the public schema as sorted lines from the catalogue (columns, indexes, constraints, triggers,
# functions, row-level security, policies, grants). A CHECK's or policy's text loses its brackets and spaces first:
# PostgreSQL deparses a restored expression with other brackets (AND flattened), the same expression all the same.
SCHEMA_SQL="select l from (
 select format('column %s.%s %s null=%s default=%s', table_name, column_name, udt_name, is_nullable, coalesce(column_default, '-')) l from information_schema.columns where table_schema = 'public'
 union all select 'index ' || indexdef from pg_indexes where schemaname = 'public'
 union all select format('constraint %s %s %s %s', conrelid::regclass, conname, contype, regexp_replace(pg_get_constraintdef(oid), '[()[:space:]]', '', 'g')) from pg_constraint where connamespace = 'public'::regnamespace
 union all select format('trigger %s %s %s', tgrelid::regclass, tgname, tgenabled) from pg_trigger where not tgisinternal and tgrelid::regclass::text not like 'pg_%'
 union all select format('function %s(%s) %s', p.proname, pg_get_function_identity_arguments(p.oid), md5(p.prosrc)) from pg_proc p where p.pronamespace = 'public'::regnamespace
 union all select format('rls %s %s %s', relname, relrowsecurity, relforcerowsecurity) from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r'
 union all select format('policy %s %s %s %s %s %s', tablename, policyname, cmd, roles, regexp_replace(coalesce(qual, ''), '[()[:space:]]', '', 'g'), regexp_replace(coalesce(with_check, ''), '[()[:space:]]', '', 'g')) from pg_policies where schemaname = 'public'
 union all select format('grant %s %s %s', grantee, table_name, privilege_type) from information_schema.role_table_grants where table_schema = 'public'
) x order by l"
schema() { dc "$1" exec -T db psql -U studio -d studio -XAtq -v ON_ERROR_STOP=1 -c "$SCHEMA_SQL"; }
sx=$(drift "$SRC"); dx=$(drift "$DST")
schema "$SRC" > "$TMP/schema.src" 2>/dev/null; schema "$DST" > "$TMP/schema.dst" 2>/dev/null
said=$(grep -E '^(ALTER|DROP|CREATE)' "$TMP/drift.$SRC" | sed -E 's/ (ALTER COLUMN|ADD COLUMN|DROP COLUMN)/:\1/; s/;$//' | head -6 | paste -sd ';' - | sed 's/;/; /g')
nst=$(grep -cE '^(ALTER|DROP|CREATE)' "$TMP/drift.$SRC")
if [ "$dx" = 1 ] || [ "$sx" = 1 ]; then fail "migrate diff" "prisma migrate diff did not run (source exit $sx, restored exit $dx): $(grep -i error "$TMP/drift.$DST.err" | head -2 | paste -sd ' ' -)"
elif ! cmp -s "$TMP/drift.$SRC" "$TMP/drift.$DST"; then fail "migrate diff" "drift: the restored copy differs from prisma/schema otherwise than the source does ($(diff "$TMP/drift.$SRC" "$TMP/drift.$DST" | grep -cE '^[<>]') line(s) differ)"
elif ! [ -s "$TMP/schema.src" ] || ! cmp -s "$TMP/schema.src" "$TMP/schema.dst"; then fail "migrate diff" "drift: the schemas of the source and the restored copy differ ($(diff "$TMP/schema.src" "$TMP/schema.dst" | grep -cE '^[<>]') line(s)): $(diff "$TMP/schema.src" "$TMP/schema.dst" | grep -E '^[<>]' | head -4 | cut -c1-120 | paste -sd ';' -)"
elif [ "$sx" = 0 ]; then pass "migrate diff" "no drift: the restored database matches prisma/schema, and its schema is the source's"
else pass "migrate diff" "no drift from the restore: the restored copy differs from prisma/schema exactly as the source does, and its schema ($(wc -l < "$TMP/schema.dst" | tr -d ' ') catalogue lines: columns, indexes, constraints, triggers, functions, policies, grants) is the source's. NOTE main's own migrations differ from prisma/schema in $nst statement(s): $said"; fi

# 4b. the same rows: count and SHA-256 of the sorted primary keys, per table.
bad=""; n=0; rows=0
for t in $TABLES; do
  s=$(cat "$TMP/src.$t"); d=$(q "$DST" "$(cat "$TMP/sql.$t")" 2>/dev/null || echo "missing missing")
  sc=${s%% *}; dcnt=${d%% *}; n=$((n + 1)); rows=$((rows + sc))
  same=false; [ "$s" = "$d" ] && same=true
  TABLE_JSON="$TABLE_JSON${TABLE_JSON:+,}{\"table\":\"$t\",\"source_rows\":$sc,\"restored_rows\":$( [ "$dcnt" = missing ] && echo null || echo "$dcnt"),\"ids_match\":$same}"
  if [ "$same" = true ]; then :
  elif [ "$sc" != "$dcnt" ]; then fail "rows $t" "count $sc in the source, $dcnt in the restored copy"; bad="$bad $t"
  else fail "rows $t" "count $sc in both, but the SHA-256 of the sorted ids differs"; bad="$bad $t"; fi
done
[ -z "$bad" ] && pass "rows" "$n table(s) ($rows row(s)): the same count and the same SHA-256 of the sorted ids in the source and the restored copy" \
  || echo "      rows: $((n - $(echo $bad | wc -w))) of $n table(s) the same; differ:$bad"

# 4c. the app against the restored database, and the smoke journey.
if SKELETON_PORT="$DST_PORT" dc "$DST" up -d --no-build --no-deps --wait --wait-timeout 180 app >"$TMP/dst-app.log" 2>&1; then
  [ -f "$STUDIO/api/src/features/platform-identity.ts" ] && export PLATFORM_ME=required
  if bash "$STUDIO/tools/skeleton-smoke.sh" "http://127.0.0.1:$DST_PORT" > "$TMP/smoke.out" 2>&1; then
    pass "app and smoke" "the app started against the restored database; skeleton-smoke.sh: $(grep -c '^PASS' "$TMP/smoke.out") PASS, $(grep -c '^SKIP' "$TMP/smoke.out") SKIP"
  else fail "app and smoke" "skeleton-smoke.sh failed against the restored copy: $(grep '^FAIL' "$TMP/smoke.out" | head -3 | paste -sd ';' -)"; fi
else fail "app and smoke" "the app did not start against the restored database: $(dc "$DST" logs --tail 5 app 2>/dev/null | tr '\n' ' ' | head -c 300)"; fi

# 4d. the audit chain, end to end (AUD-1c). AUD-1c's builder turns this into the real check (one step, named in its PR).
if [ -f "$STUDIO/api/src/platform/audit/chain/verify.ts" ]; then
  fail "audit chain" "AUD-1c's verifier is on main but this drill does not run it yet: AUD-1c's row wires it here"
else skip "audit chain" "AUD-1c's chain verifier is not on main (api/src/platform/audit/chain/verify.ts); the step runs once it is"; fi

# 5. the time and the evidence.
secs=$(( $(date +%s) - T0 ))
echo "restore time: ${secs} s (dump start to the last check)"
write_evidence
echo "evidence: $EVIDENCE"
[ "$fails" = 0 ] && { echo "restore drill: every check passed"; exit 0; }
echo "restore drill: $fails check(s) failed"; exit 1
