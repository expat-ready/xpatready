#!/usr/bin/env bash
# Test for sle-watch.py (A92 steps 1 and 2, founder 18:4x IST 15 Nov): each wait-time target is broken on purpose in a
# fixture snapshot and must give a MISS; the same case inside its target must not. No network, US$0.
#   bash product/tools/check-sle-watch.sh      (exit 0 = every case as expected)
set -u
TOOLS="$(cd "$(dirname "$0")" && pwd)"
T=$(mktemp -d "${TMPDIR:-/tmp}/sle.XXXXXXXX") && [ -d "$T" ] || { echo "no temp dir: nothing was checked"; exit 2; }; trap 'rm -rf "$T"' EXIT
fail=0
case_() {  # name, expected grep (or !grep), expected exit, snapshot json
  local name=$1 want=$2 code=$3; printf '%s' "$4" > "$T/s.json"
  out=$(python3 -I "$TOOLS/sle-watch.py" --snapshot "$T/s.json"); rc=$?
  if [ "${want:0:1}" = "!" ]; then echo "$out" | grep -qE "${want:1}" && hit=1 || hit=0; [ $hit = 0 ] && okw=1 || okw=0
  else echo "$out" | grep -qE "$want" && okw=1 || okw=0; fi
  if [ $okw = 1 ] && [ "$rc" = "$code" ]; then echo "PASS $name"; else echo "FAIL $name (exit $rc, want $code) :: $out"; fail=$((fail+1)); fi
}
NOW='"now":"2026-11-15T13:00:00Z"'
pr() {  # number labels updated_at comments-json extra
  echo "{\"number\":$1,\"title\":\"row $1\",\"draft\":false,\"labels\":$2,\"head\":\"abc$1\",\"updated_at\":\"$3\",\"body\":\"\",\"comments\":$4,\"same_head\":[]${5:-}}"
}
Q='{"at":"2026-11-15T12:00:00Z","body":"## Question for the tech lead: may I touch core.ts?"}'
A_LATE='{"at":"2026-11-15T12:10:00Z","body":"**Tech lead (Lead 60):** yes"}'
A_B='{"at":"2026-11-15T12:10:00Z","body":"**Lead B (6) (row owner):** yes"}'

# Q: a question unanswered for 60 min is a MISS; answered by the tech lead or Lead B is not; 20 min old is only due.
case_ "Q broken: unanswered 60 min" "MISS +Q #1:" 1 "{$NOW,\"prs\":[$(pr 1 '[]' 2026-11-15T12:59:00Z "[$Q]")]}"
case_ "Q met: tech lead answered" "!Q #1:" 0 "{$NOW,\"prs\":[$(pr 1 '[]' 2026-11-15T12:59:00Z "[$Q,$A_LATE]")]}"
case_ "Q met: Lead B answered" "!Q #1:" 0 "{$NOW,\"prs\":[$(pr 1 '[]' 2026-11-15T12:59:00Z "[$Q,$A_B]")]}"
case_ "Q due: 20 min" "due +Q #1:" 0 "{\"now\":\"2026-11-15T12:20:00Z\",\"prs\":[$(pr 1 '[]' 2026-11-15T12:19:00Z "[$Q]")]}"

# A: approved 45 min and not queued is a MISS, and a shadowing skipped ci from another PR is named (step 2, #1811).
SH=',"approved_at":"2026-11-15T12:15:00Z","ci":[{"conclusion":"success","status":"completed","completed_at":"2026-11-15T11:42:00Z","run":"1","owner":null},{"conclusion":"skipped","status":"completed","completed_at":"2026-11-15T10:35:00Z","run":"2","owner":[1830]}]'
case_ "A broken: approved 45 min, shadowed" "MISS +A #2:.*#1830.*pushes one commit" 1 "{$NOW,\"prs\":[$(pr 2 '["review: approved"]' 2026-11-15T12:59:00Z '[]' "$SH")]}"
case_ "A met: queued" "!A #2" 0 "{$NOW,\"prs\":[$(pr 2 '["review: approved","queued"]' 2026-11-15T12:59:00Z '[]' "$SH")]}"
RUN=',"approved_at":"2026-11-15T12:15:00Z","ci":[{"conclusion":null,"status":"in_progress","completed_at":null,"run":"3","owner":null}]'
case_ "A broken: ci still running is named" "MISS +A #2:.*still running" 1 "{$NOW,\"prs\":[$(pr 2 '["review: approved"]' 2026-11-15T12:59:00Z '[]' "$RUN")]}"
case_ "A not yet: approved 10 min" "!A #2" 0 "{$NOW,\"prs\":[$(pr 2 '["review: approved"]' 2026-11-15T12:59:00Z '[]' ',"approved_at":"2026-11-15T12:50:00Z","ci":[]')]}"

# L: an open lane PR quiet 2 h is a MISS; one that says it waits is not; over 3 days goes to the stale list.
case_ "L broken: quiet 120 min" "MISS +L #3: quiet 120" 1 "{$NOW,\"prs\":[$(pr 3 '[]' 2026-11-15T11:00:00Z '[]')]}"
case_ "L met: says it waits" "wait +L #3" 0 "{$NOW,\"prs\":[{\"number\":3,\"title\":\"row 3\",\"draft\":true,\"labels\":[],\"head\":\"x\",\"updated_at\":\"2026-11-15T11:00:00Z\",\"body\":\"Stacked on #1811; labels only after it merges.\",\"comments\":[],\"same_head\":[]}]}"
case_ "L stale: 5 days" "MISS +L stale: 1 open PR.*#4" 1 "{$NOW,\"prs\":[$(pr 4 '[]' 2026-11-10T11:00:00Z '[]')]}"
case_ "all met" "every target met" 0 "{$NOW,\"prs\":[$(pr 5 '[]' 2026-11-15T12:59:00Z '[]')]}"

# A read failure is said, never read as "all met".
echo '{broken' > "$T/bad.json"; out=$(python3 -I "$TOOLS/sle-watch.py" --snapshot "$T/bad.json"); rc=$?
if [ "$rc" = 1 ] && echo "$out" | grep -q "could not read"; then echo "PASS a failed read is a MISS"; else echo "FAIL a failed read: $out"; fail=$((fail+1)); fi

[ $fail = 0 ] && echo "sle-watch: all cases as expected" || echo "sle-watch: $fail case(s) failed"
exit $fail
