#!/usr/bin/env bash
# qa probe (23 Nov): PF-4s part 2, POST /api/system/staff with an unknown field. Which answer comes first, 403 or 422?
# Two callers: a Platform Owner (holds system/platform-user:manage) and Platform support (does not). Sample staff only.
# Run from prototype/ on an isolated copy, never :4400:
#   zsh studio/tools/isolated.sh qapf4s 4472 start --ttl 15 PLATFORM_IDENTITY=local PLATFORM_SYSTEM_IDENTITY=local && trap 'zsh studio/tools/isolated.sh qapf4s 4472 stop' EXIT && bash studio/tests/qa/check_qa_pf4s_403_422_order.sh 4472 xr_studio_qapf4s
# Exit 0 when a key holder gets 422 for the unknown field and a non-holder gets 403 (authorise, then validate).
set -u; PORT=${1:-4472}; DB=${2:-xr_studio_qapf4s}; [ "$PORT" = 4400 ] && { echo "refused: never :4400"; exit 2; }
Q() { psql -h 127.0.0.1 -p 54329 -U xr_studio -d "$DB" -XAtq -c "$1"; }
T=$(date +%s)
for who in owner:platform-owner support:platform-support; do n=${who%%:*}; r=${who#*:}
  Q "with s as (insert into plat_system_staff (id, email, display_name, status) values (gen_random_uuid(), 'qa.$n.$T@expatready.example', 'Sample QA $n', 'ACTIVE') returning id) insert into plat_system_role_grant (id, staff_id, role_code) select gen_random_uuid(), id, '$r' from s" >/dev/null || exit 2
done
tok() { curl -s -X POST "http://localhost:$PORT/api/system/session/local" -H 'content-type: application/json' -d "{\"email\":\"qa.$1.$T@expatready.example\",\"secondStep\":true}" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p'; }
BODY='{"email":"qa.new.'$T'@expatready.example","displayName":"Sample New","roles":["platform-support"],"reason":"qa probe (Sample)","unknownField":1}'
fail=0
for n in owner support; do t=$(tok $n); [ -n "$t" ] || { echo "STOP  no token for $n"; exit 2; }
  out=$(curl -s -o /dev/stderr -w '%{http_code}' -X POST "http://localhost:$PORT/api/system/staff" -H "authorization: Bearer $t" -H 'content-type: application/json' -d "$BODY" 2>"${TMPDIR:-/tmp}/qapf4s.$n"); body=$(cut -c1-220 "${TMPDIR:-/tmp}/qapf4s.$n")
  want=$([ $n = owner ] && echo 422 || echo 403)
  [ "$out" = "$want" ] && echo "PASS  $n (key $( [ $n = owner ] && echo held || echo not held)) gets $want for an unknown field — $body" || { echo "FAIL  $n expected $want, got $out — $body"; fail=1; }
done
Q "select count(*) from plat_system_staff where email = 'qa.new.$T@expatready.example'" | grep -qx 0 && echo "PASS  nobody was invited" || { echo "FAIL  an invite was written"; fail=1; }
exit $fail
