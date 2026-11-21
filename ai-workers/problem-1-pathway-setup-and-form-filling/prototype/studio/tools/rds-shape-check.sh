#!/bin/bash
# PF-8b F4 (RDS; R1.13, R1.15): every migration applied from empty on a PostgreSQL 18 cluster shaped like Amazon RDS, where
# the migrating user is NOT a superuser (RDS's admin is rds_superuser: CREATEROLE, CREATEDB, BYPASSRLS) and the server logs
# tersely (the estate's parameter group). Then the walls are checked as xr_app, and two stop paths: an admin without
# BYPASSRLS and a server that does not log tersely must stop at PF-12 with its message, leaving no role behind.
# A throwaway cluster on its own port (initdb as the postgres user: a cloud lane or a Linux machine with postgresql-18),
# removed at the end; the lane's own cluster on 54329 is never touched. Exit 0 only when every line passes. US$0.
#   bash studio/tools/rds-shape-check.sh [port]      (default 54401; uses ports port..port+2)
set -uo pipefail
STUDIO=$(cd "$(dirname "$0")/.." && pwd); PORT=${1:-54401}
PGBIN=${PGBIN:-$(dirname "$(readlink -f "$(command -v initdb 2>/dev/null || echo /usr/lib/postgresql/18/bin/initdb)")")}
AS_PG=(); [ "$(id -u)" = 0 ] && AS_PG=(runuser -u postgres --)
fails=0; ok() { if [ "$2" = "$3" ]; then echo "PASS $1"; else echo "FAIL $1: got [$2], want [$3]"; fails=$((fails + 1)); fi; }
start() { # port bypass|nobypass terse|verbose
  local d=/tmp/rds-shape-$1 attr="LOGIN CREATEROLE CREATEDB NOSUPERUSER"; [ "$2" = bypass ] && attr="$attr BYPASSRLS"
  rm -rf "$d"; mkdir -p "$d"; [ "$(id -u)" = 0 ] && chown postgres "$d"
  "${AS_PG[@]}" "$PGBIN/initdb" -D "$d/data" -U postgres -A trust -E UTF8 --locale=C.UTF-8 >/dev/null || return 1
  "${AS_PG[@]}" "$PGBIN/pg_ctl" -D "$d/data" -o "-p $1 -k $d -c listen_addresses=127.0.0.1 -c log_error_verbosity=$3" -l "$d/log" -w start >/dev/null || return 1
  for q in "CREATE ROLE rds_superuser NOLOGIN" "CREATE ROLE xr_admin $attr" "GRANT rds_superuser TO xr_admin WITH ADMIN OPTION" "CREATE DATABASE xr_rds OWNER xr_admin"; do
    psql -h 127.0.0.1 -p "$1" -U postgres -d postgres -qc "$q" || return 1; done
}
stop() { "${AS_PG[@]}" "$PGBIN/pg_ctl" -D "/tmp/rds-shape-$1/data" stop -m fast >/dev/null 2>&1; rm -rf "/tmp/rds-shape-$1"; }
migrate() { (cd "$STUDIO" && DATABASE_URL="postgresql://xr_admin@127.0.0.1:$1/xr_rds" timeout 600 ./node_modules/.bin/prisma migrate deploy 2>&1); }
trap 'stop $PORT; stop $((PORT + 1)); stop $((PORT + 2))' EXIT
a() { psql -h 127.0.0.1 -p "$PORT" -d xr_rds -At -U xr_admin -c "$1" 2>&1 | tail -1; }
u() { psql -h 127.0.0.1 -p "$PORT" -d xr_rds -At -U xr_app -c "$1" 2>&1 | tail -1; }
uall() { psql -h 127.0.0.1 -p "$PORT" -d xr_rds -At -U xr_app -c "$1" 2>&1; }   # every line (an error's first line is the message)
has() { grep -q "$1" && echo 1 || echo 0; }

# --- the RDS shape: non-superuser admin with CREATEROLE, CREATEDB, BYPASSRLS; terse server logs
start "$PORT" bypass terse || { echo "FAIL the throwaway cluster did not start"; exit 1; }
ok "the migrating user is not a superuser, has CREATEROLE and BYPASSRLS" "$(a "select rolsuper||','||rolcreaterole||','||rolbypassrls from pg_roles where rolname = current_user")" "false,true,true"
out=$(migrate "$PORT"); ok "every migration applies from empty as that user (prisma migrate deploy)" "$(echo "$out" | has 'All migrations have been successfully applied')" "1"
[ "$fails" = 0 ] || echo "$out" | grep -o 'message: "[^"]*"' | head -2
ok "roles: NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION; xr_app LOGIN INHERIT NOBYPASSRLS; only the two wall roles BYPASSRLS" \
  "$(a "select string_agg(rolname||':'||rolsuper||rolcreatedb||rolcreaterole||rolreplication||':'||rolcanlogin||':'||rolbypassrls||':'||rolinherit, ' ' order by rolname) from pg_roles where rolname in ('xr_app','xr_data','xr_staff_bypass','xr_wall_reader','xr_case_lookup')")" \
  "xr_app:falsefalsefalsefalse:true:false:true xr_case_lookup:falsefalsefalsefalse:false:false:true xr_data:falsefalsefalsefalse:false:false:true xr_staff_bypass:falsefalsefalsefalse:false:true:true xr_wall_reader:falsefalsefalsefalse:false:true:true"
ok "the reader holds no CREATE on public after the last hand-over; xr_app none either" "$(a "select has_schema_privilege('xr_wall_reader','public','CREATE')||','||has_schema_privilege('xr_app','public','CREATE')")" "false,false"
ok "xr_app cannot become the reader; it may SET ROLE to the logged bypass role only" "$(a "select pg_has_role('xr_app','xr_wall_reader','SET')||','||pg_has_role('xr_app','xr_staff_bypass','SET')||','||pg_has_role('xr_app','xr_staff_bypass','USAGE')")" "false,true,false"
a "insert into platform_firm (id, key, operating_name, country_code, contact_email, updated_at) values ('11111111-1111-1111-1111-111111111111','walls-a','Firm A','CA','a@example.test',now()), ('22222222-2222-2222-2222-222222222222','walls-b','Firm B','CA','b@example.test',now())" >/dev/null
ok "walls: xr_app with no firm reads no firm" "$(u 'select count(*) from platform_firm')" "0"
ok "walls: xr_app as firm A reads only firm A" "$(u "select set_config('app.firm_id','11111111-1111-1111-1111-111111111111',false); select string_agg(key, ',') from platform_firm")" "walls-a"
ok "walls: xr_app as firm A changes none of firm B's rows" "$(u "select set_config('app.firm_id','11111111-1111-1111-1111-111111111111',false); update platform_firm set operating_name = 'x' where key = 'walls-b'")" "UPDATE 0"
ok "walls: xr_app cannot turn row security off for itself" "$(uall 'set row_security = off; select count(*) from platform_firm' | has 'would be affected by row-level security')" "1"
ok "walls: xr_app cannot disable a wall, create a table or skip triggers" \
  "$(uall 'alter table platform_firm disable row level security' | has 'must be owner'),$(uall 'create table x_probe (i int)' | has 'permission denied for schema public'),$(uall 'set session_replication_role = replica' | has 'permission denied')" "1,1,1"
ok "terse error logs: the server's setting stands for xr_app" "$(u 'show log_error_verbosity')" "terse"
ok "the F4 checksums are the files' (prisma migrate status)" "$( (cd "$STUDIO" && DATABASE_URL="postgresql://xr_admin@127.0.0.1:$PORT/xr_rds" ./node_modules/.bin/prisma migrate status 2>&1) | has 'Database schema is up to date')" "1"

# --- stop paths: never a weaker wall
start $((PORT + 1)) nobypass terse || { echo "FAIL the second cluster did not start"; exit 1; }
out=$(migrate $((PORT + 1)))
ok "an admin without BYPASSRLS stops at PF-12, naming the role" "$(echo "$out" | has 'PF-12 stopped: xr_admin cannot create role xr_staff_bypass')" "1"
ok "…and leaves no role behind (the block is one statement)" "$(psql -h 127.0.0.1 -p $((PORT + 1)) -d xr_rds -At -U xr_admin -c "select count(*) from pg_roles where rolname in ('xr_app','xr_data','xr_staff_bypass','xr_wall_reader','xr_case_lookup')")" "0"
start $((PORT + 2)) bypass verbose || { echo "FAIL the third cluster did not start"; exit 1; }
out=$(migrate $((PORT + 2)))
ok "a server that does not log tersely stops at PF-12 (xr_app's terse logs cannot be set by a non-superuser)" "$(echo "$out" | has 'PF-12 stopped: xr_admin may not set log_error_verbosity')" "1"

echo "$([ "$fails" = 0 ] && echo "all passed" || echo "$fails failed")"
exit $((fails > 0))
