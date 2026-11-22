#!/usr/bin/env bash
# Test for sle-watch.py (A92 steps 1 and 2, founder 18:4x IST 15 Nov; targets R and B: B193, P-619): each wait-time target is broken on purpose in a
# fixture snapshot and must give a MISS; the same case inside its target must not. No network, US$0.
#   bash product/tools/check-sle-watch.sh      (exit 0 = every case as expected)
set -u
TOOLS="$(cd "$(dirname "$0")" && pwd)"
T=$(mktemp -d "${TMPDIR:-/tmp}/sle.XXXXXXXX") && [ -d "$T" ] || { echo "no temp dir: nothing was checked"; exit 2; }; trap 'rm -rf "$T"' EXIT
fail=0
case_() {  # name, expected grep (or !grep), expected exit, snapshot json
  local name=$1 want=$2 code=$3; printf '%s' "$4" > "$T/s.json"
  out=$(python3 -I "$TOOLS/sle-watch.py" --snapshot "$T/s.json" ${ARGS:-}); rc=$?
  if [ "${want:0:1}" = "!" ]; then echo "$out" | grep -qE "${want:1}" && hit=1 || hit=0; [ $hit = 0 ] && okw=1 || okw=0
  else echo "$out" | grep -qE "$want" && okw=1 || okw=0; fi
  if [ $okw = 1 ] && [ "$rc" = "$code" ]; then echo "PASS $name"; else echo "FAIL $name (exit $rc, want $code) :: $out"; fail=$((fail+1)); fi
}
NOW='"now":"2026-11-15T13:00:00Z","board_at":"2026-11-15T12:50:00Z"'   # every fixture carries a fresh board
pr() {  # number labels updated_at comments-json extra
  echo "{\"number\":$1,\"title\":\"row $1\",\"draft\":false,\"labels\":$2,\"head\":\"abc$1\",\"updated_at\":\"$3\",\"body\":\"\",\"comments\":$4,\"same_head\":[]${5:-}}"
}
Q='{"at":"2026-11-15T12:00:00Z","body":"## Question for the tech lead: may I touch core.ts?"}'
A_LATE='{"at":"2026-11-15T12:10:00Z","body":"**Tech lead (Lead 60):** yes"}'
A_B='{"at":"2026-11-15T12:10:00Z","body":"**Lead B (6) (row owner):** yes"}'

# Q: a question unanswered for 60 min is a MISS; answered by the tech lead or Lead B is not; 8 min old is only due (P-798: target 10).
case_ "Q broken: unanswered 60 min" "MISS +Q #1:" 1 "{$NOW,\"prs\":[$(pr 1 '[]' 2026-11-15T12:59:00Z "[$Q]")]}"
case_ "Q met: tech lead answered" "!Q #1:" 0 "{$NOW,\"prs\":[$(pr 1 '[]' 2026-11-15T12:59:00Z "[$Q,$A_LATE]")]}"
case_ "Q met: Lead B answered" "!Q #1:" 0 "{$NOW,\"prs\":[$(pr 1 '[]' 2026-11-15T12:59:00Z "[$Q,$A_B]")]}"
case_ "Q due: 8 min" "due +Q #1:" 0 "{\"now\":\"2026-11-15T12:08:00Z\",\"board_at\":\"2026-11-15T12:00:00Z\",\"prs\":[$(pr 1 '[]' 2026-11-15T12:07:00Z "[$Q]")]}"

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

# R: an Approve on the current head with a green ci and no label for 45 min is a MISS naming the PR (B193).
GREEN='{"conclusion":"success","status":"completed","completed_at":"2026-11-15T12:10:00Z","run":"5","owner":null}'
R() { echo ",\"approves\":[{\"at\":\"$1\",\"sha\":\"$2\"}],\"ci\":[$3]"; }
case_ "R broken: approved green 45 min, unlabelled" "MISS +R #6: Approve on head abc6 and ci green 45 min" 1 "{$NOW,\"prs\":[$(pr 6 '[]' 2026-11-15T12:59:00Z '[]' "$(R 2026-11-15T12:15:00Z abc6 "$GREEN")")]}"
case_ "R met: labelled and queued" "!R #6" 0 "{$NOW,\"prs\":[$(pr 6 '["review: approved","queued"]' 2026-11-15T12:59:00Z '[]' "$(R 2026-11-15T12:15:00Z abc6 "$GREEN")")]}"
case_ "R not yet: approved 20 min" "!R #6" 0 "{$NOW,\"prs\":[$(pr 6 '[]' 2026-11-15T12:59:00Z '[]' "$(R 2026-11-15T12:40:00Z abc6 "$GREEN")")]}"
case_ "R not on head: Approve names an old commit" "!R #6" 0 "{$NOW,\"prs\":[$(pr 6 '[]' 2026-11-15T12:59:00Z '[]' "$(R 2026-11-15T12:15:00Z def9 "$GREEN")")]}"
case_ "R not green: ci red" "!R #6" 0 "{$NOW,\"prs\":[$(pr 6 '[]' 2026-11-15T12:59:00Z '[]' "$(R 2026-11-15T12:15:00Z abc6 '{"conclusion":"failure","status":"completed","completed_at":"2026-11-15T12:10:00Z","run":"5","owner":null}')")]}"
out=$(cd "$TOOLS" && python3 -I -c 'import importlib.util as u; s=u.spec_from_file_location("w","sle-watch.py"); m=u.module_from_spec(s); s.loader.exec_module(m)
print(m.approve_shas("**Reviewer: Approve `1a2b3c4d5e6f`** (Opus)\nnot this: abcdef1\nReviewer: approved 9f9f9f9 after 7e7e7e7"))')
[ "$out" = "['1a2b3c4d5e6f', '9f9f9f9']" ] && echo "PASS R reads the Approve line as label-guard does" || { echo "FAIL R Approve parse: $out"; fail=$((fail+1)); }

# B: board data 46 min old is a MISS with its IST time; 44 min is not; history.jsonl (+05:30) and --board-time are read.
EMPTY="{$NOW,\"prs\":[]}"
case_ "B broken: board 46 min old" "MISS +B board not refreshed since 15 Nov 17:44 IST \(46 min" 1 "${EMPTY/12:50:00Z/12:14:00Z}"
case_ "B met: board 44 min old" "every target met" 0 "${EMPTY/12:50:00Z/12:16:00Z}"
printf '{"day":"2026-11-14","taken_at":"2026-11-14T23:00:00+05:30"}\n{"day":"2026-11-15","taken_at":"2026-11-15T17:44:00+05:30"}\n' > "$T/h.jsonl"
NB='{"now":"2026-11-15T13:00:00Z","prs":[]}'
ARGS="--board-file $T/h.jsonl" case_ "B broken: history.jsonl newest line 46 min old" "MISS +B board not refreshed since 15 Nov 17:44 IST" 1 "$NB"
ARGS="--board-file $T/h.jsonl --board-time 2026-11-15T18:20:00+05:30" case_ "B met: the Lead's published data time wins" "every target met" 0 "$NB"
: > "$T/e.jsonl"
ARGS="--board-file $T/e.jsonl" case_ "B unknown: no data time is a MISS" "MISS +B board: no data time" 1 "$NB"
ARGS="--board-file $T/none.jsonl" case_ "B unknown: missing file is a MISS" "MISS +B board: no data time" 1 "$NB"

# A read failure is said, never read as "all met".
echo '{broken' > "$T/bad.json"; out=$(python3 -I "$TOOLS/sle-watch.py" --snapshot "$T/bad.json"); rc=$?
if [ "$rc" = 1 ] && echo "$out" | grep -q "could not read"; then echo "PASS a failed read is a MISS"; else echo "FAIL a failed read: $out"; fail=$((fail+1)); fi

[ $fail = 0 ] && echo "sle-watch: all cases as expected" || echo "sle-watch: $fail case(s) failed"
exit $fail
