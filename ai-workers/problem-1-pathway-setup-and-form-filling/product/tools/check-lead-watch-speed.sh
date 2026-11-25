#!/usr/bin/env bash
# Lead 26's row (24 Nov 2026): lead-watch.sh's slow reads start together (lead-watch-pre.sh) and no check is lost by it; gh is
# tried once a run when its TLS fails; each section says its seconds. No network, US$0.   bash product/tools/check-lead-watch-speed.sh
set -u
. "$(dirname "$0")/guard-test-lib.sh"
T=$(mktemp -d "${TMPDIR:-/tmp}/lws.XXXXXXXX") && [ -d "$T" ] || { echo "no temp dir: nothing was checked"; exit 2; }
trap 'rm -rf "${T:?}"' EXIT
L="$TOOLS/lead-watch.sh"; [ -f "$TOOLS/lead-watch-pre.sh" ] || { ok "lead-watch-pre.sh is there" 0 "no file"; finish; }
cat > "$T/job.sh" <<'E2'
echo "start $1" >> "$LOG"; sleep "$2"; echo "end $1" >> "$LOG"; echo "out $1"; echo "err $1" >&2; exit "$3"
E2
# each case is its own shell, as lead-watch.sh is: $1 = the lines to run after the file is sourced
case_() { rm -rf "$T/st"; mkdir -p "$T/st"; : > "$T/log"; LOG="$T/log" STATE_DIR="$T/st" J="$T/job.sh" command bash -c '. "$0"; '"$1"'; pre_off' "$TOOLS/lead-watch-pre.sh" 2> "$T/err"; }
o=$(case_ 'pre bash "$J" a 0 3; x=$(bash "$J" a 0 3); echo "$x rc=$?"')
ok "the step gets the early answer: its output and its exit code" "$([ "$o" = 'out a rc=3' ] && [ "$(grep -c '^start a' "$T/log")" = 1 ] && echo 1)" "$o / $(cat "$T/log")"
o=$(case_ 'pre bash "$J" a 0 3; bash "$J" a 0 3 2>&1'); ok "... and what it wrote on stderr" "$(grep -qx 'err a' <<<"$o" && echo 1)" "$o"
o=$(case_ 'for k in a b c; do pre bash "$J" $k 20 0; done; for i in $(seq 100); do [ "$(grep -c ^start "$LOG")" = 3 ] && break; sleep 0.1; done; cat "$LOG"')
ok "three 20-second jobs run together (all started before any ended)" "$([ "$(grep -c '^start' <<<"$o")" = 3 ] && ! grep -q '^end' <<<"$o" && echo 1)" "$o"
o=$(case_ 'pre bash "$J" a 0 0; bash "$J" a 0 0; bash "$J" a 0 0'); ok "the same command asked twice: the second is read again, never repeated" "$([ "$(grep -c '^out a' <<<"$o")" = 2 ] && [ "$(grep -c '^start a' "$T/log")" = 2 ] && echo 1)" "$(cat "$T/log")"
o=$(case_ 'pre bash "$J" a 0 0; bash "$J" b 0 4; echo "rc=$?"'); ok "a command that was not started early runs at its step" "$([ "$o" = $'out b\nrc=4' ] && echo 1)" "$o"
o=$(case_ 'pre bash "$J" "a 0" 0; bash "$J" a 0 0; pre_wait 1'); ok "other arguments that print alike are not the same command" "$(grep -q '^start a' "$T/log" && [ "$(grep -c '^start' "$T/log")" = 2 ] && echo 1)" "$(cat "$T/log")"
o=$(case_ 'pre bash "$J" a 9 0; kill -9 "$(cat "$PRE_DIR/1.pid")"; sleep 0.3; printf "echo again\n" > "$J.2"; pre bash "$J.2"; kill -9 "$(cat "$PRE_DIR/2.pid")" 2>/dev/null; sleep 0.3; rm -f "$PRE_DIR/2.rc"; bash "$J.2"')
ok "a job that died without an answer: the step runs the command itself" "$([ "$o" = again ] && echo 1)" "$o"
o=$(case_ 'pre bash "$J" a 1 0; after bash "$J" a 1 0 -- bash "$J" b 0 0; bash "$J" b 0 0'); ok "after: the second starts only when the first has ended" "$([ "$(paste -sd, "$T/log" | cut -c1-21)" = 'start a,end a,start b' ] && echo 1)" "$(cat "$T/log")"
case_ 'pre bash "$J" a 30 0; sleep 0.3'; n=$(ls "$T/st" | wc -l | tr -d ' '); ok "pre_off leaves no folder behind" "$([ "$n" = 0 ] && echo 1)" "$n left"
o=$(case_ 'rm -rf "$PRE_DIR"; PRE_DIR=""; pre bash "$J" a 0 0; bash "$J" a 0 5; echo "rc=$?"'); ok "no folder to work in: every step runs as before" "$([ "$o" = $'out a\nrc=5' ] && echo 1)" "$o"

o=$(case_ 'pre bash "$J" a 0 3; pre_wait 1; : > "$PRE_DIR/1.rc"; bash "$J" a 0 3; echo "rc=$?"'); ok "an answer whose exit code was cut (a full disk) is no answer: the step runs the command" "$([ "$o" = $'out a\nrc=3' ] && [ "$(grep -c '^start' "$T/log")" = 2 ] && echo 1)" "$o"
o=$(PRE_FREE_KB=99999999999 case_ 'pre bash "$J" a 0 5; bash "$J" a 0 5; echo "rc=$? n=$PRE_N"'); ok "under the free space asked for, nothing starts early and the step runs as before" "$([ "$o" = $'out a\nrc=5 n=0' ] && echo 1)" "$o"
case_ 'pre bash "$J" a 0 0; pre_wait 1; sleep 30 & x=$!; PRE_PIDS=" $x"; pre_off; kill -0 $x 2>/dev/null && echo alive > "$LOG"; kill $x'; ok "a job that ended is not signalled (its number may be another's)" "$(grep -qx alive "$T/log" && echo 1)"

# lead-watch.sh: every early command is a step's own command, word for word, or it is work for nothing
bad=""; n=0
while IFS= read -r c; do n=$((n + 1)); [ "$(grep -vE '^(pre|SWEEP_STATE_DIR="\$STATE_DIR" after) ' "$L" | grep -cF -- "$c")" -ge 1 ] || bad="$bad [$c]"; done < <(grep -E '^pre |^SWEEP_STATE_DIR="\$STATE_DIR" after ' "$L" | sed -E 's/^pre //; s/^.* -- //; s/   #.*//')
ok "each of the $n early commands is also a step, word for word" "$([ "$n" -ge 15 ] && [ -z "$bad" ] && echo 1)" "no step:$bad"
p=$(grep -n '^pre ' "$L" | tail -1 | cut -d: -f1); f=$(grep -n '^PRE_T0=.*fetch -q origin 2>' "$L" | head -1 | cut -d: -f1); ok "git is fetched before the early commands start" "$([ -n "$f" ] && [ "$f" -lt "$(grep -n '^pre ' "$L" | head -1 | cut -d: -f1)" ] && echo 1)" "fetch ${f:-none}, last pre ${p:-none}"
ok "the private sync, which writes and has its own limit, is not started early" "$(! grep -qE '^pre .*sync' "$L" && grep -q '^ps=.*lead-upkeep.py" sync' "$L" && echo 1)"
# the block itself, with a fetch that fails: nothing starts early, and the section says so; with one that works: they start
sed -n '/^PRE_T0=/,/^fresh "git fetch origin;/p' "$L" > "$T/block.sh"
block() { local rc=$1; rm -rf "$T/st"; mkdir -p "$T/st"; ( STATE_DIR="$T/st"; git() { return "$rc"; }; fresh() { echo "fresh $*"; }; TOOLS_REAL="$TOOLS"; mkdir -p "$T/tl"; cp "$TOOLS_REAL/lead-watch-pre.sh" "$T/tl/"; TOOLS="$T/tl"; . "$T/block.sh"; echo "started $PRE_N"; pre_off ) 2>/dev/null; }
o=$(block 1); ok "the fetch failed: nothing is started early, and the stamp says it" "$(grep -qx 'started 0' <<<"$o" && grep -q 'not started early, origin was not fetched' <<<"$o" && echo 1)" "$o"
o=$(block 0); ok "the fetch worked: they start" "$(grep -qE '^started 1[0-9]$' <<<"$o" && grep -q 'start now, together, so a stamp' <<<"$o" && echo 1)" "$o"
ok "branch-sweep.sh, which reads items.json, waits for lead-queue.sh, which writes it" "$(grep -qF 'after bash "$TOOLS/lead-queue.sh" -- bash "$TOOLS/branch-sweep.sh"' "$L" && echo 1)"
# steps 3 and 3b, cut out and run as written, on three comments: an open PR's question and lane report, a closed PR's question
sed -n '/^# One read of every comment/,/^git fetch/p' "$L" | grep -v '^git fetch' > "$T/asks.sh"; mkdir -p "$T/a"
c() { jq -nc --argjson n "$1" --arg b "$2" '{n: ($n | tostring), b: $b}'; }
asks() { ( STATE_DIR="$T/a"; since=x; gh() { [ "${RC:-0}" = 0 ] || return 1; [ -z "${NONE:-}" ] || return 0; c 7 "x Question for the tech lead: y"; c 7 "again: Question for the tech lead"; c 8 "Ready for Lead 5"; c 9 "Question for the tech lead"; c 10 "thanks"; [ -z "${FULL:-}" ] || c 7 "Question for the tech lead: full run please"; [ -z "${CUT:-}" ] || printf '{"n":"8","b":"Question fo\n'; [ -z "${HALF:-}" ]; }
  ACT() { echo "ACT $1"; }; fresh() { :; }; seen() { :; }; act=0; . "$T/asks.sh" ) 2>&1; }
echo '[{"number":7},{"number":8},{"number":10}]' > "$T/a/prs-body.json"; o=$(asks)
ok "one ACT for an open PR's question and one for a lane report, none for a closed PR" "$([ "$(grep -c '^ACT' <<<"$o")" = 2 ] && grep -q '#7 has a new question' <<<"$o" && grep -q '#8 has a lane report' <<<"$o" && echo 1)" "$o"
echo '[]' > "$T/a/prs-body.json"; o=$(asks); ok "an empty open-PR list drops no question" "$(grep -q '#9 has a new question' <<<"$o" && echo 1)" "$o"
echo 'not json' > "$T/a/prs-body.json"; o=$(asks); ok "an unreadable open-PR list drops no question" "$(grep -q '#9 has a new question' <<<"$o" && grep -q '#7 ' <<<"$o" && echo 1)" "$o"
o=$(RC=1 asks); ok "comments that cannot be read are an ACT, never 'no questions'" "$(grep -q '^ACT comments since x unreadable' <<<"$o" && echo 1)" "$o"
o=$(CUT=1 asks); ok "an answer cut short is an ACT, and what was whole before the cut is still shown" "$(grep -q '^ACT comments since x cut short' <<<"$o" && grep -q '#7 has a new question' <<<"$o" && echo 1)" "$o"
echo '[{"number":7}]' > "$T/a/prs-body.json"; o=$(FULL=1 LEAD_WATCH_FULL_RUN_POST=0 asks); ok "3a: an open PR's question asking for the full run is an ACT with the words (OS-06)" "$(grep -q '^ACT   #7 asks for the full run: type /run full' <<<"$o" && echo 1)" "$o"
o=$(NONE=1 asks); ok "no comment in the window is no ACT" "$([ -z "$o" ] && echo 1)" "$o"
o=$(HALF=1 asks); ok "a later page that fails is an ACT, with the first page's questions shown" "$(grep -q '^ACT comments since x unreadable' <<<"$o" && grep -q '#7 has a new question' <<<"$o" && echo 1)" "$o"
ok "the comments are read by time, in full, not found by a search" "$(grep -q 'issues/comments?since=$since&per_page=100" --paginate' "$L" && ! grep -qE '^[a-z]+=\$\(gh search prs' "$L" && echo 1)"
ok "the last line says the seconds of the whole check" "$(tail -2 "$L" | head -1 | grep -q '^echo "spent ' && echo 1)"

# each section says its seconds from 2 s on
o=$(command bash -c '. "$0"; fresh one; FRESH_AT=$((SECONDS - 7)); fresh two; fresh three' "$TOOLS/fresh-lib.sh")
ok "a section that took 7 s says so, a quick one is as before" "$([ "$(grep -c ' s · read' <<<"$o")" = 1 ] && grep -q '^      [78] s · read [0-9:]* IST from two$' <<<"$o" && echo 1)" "$o"

# gh.sh: after one TLS failure in a run, gh is not tried again
mkdir "$T/bin"; cat > "$T/bin/gh" <<'E2'
#!/bin/bash
[ "$1 $2" = "auth token" ] && { echo tok; exit 0; }
echo try >> "$FX/tries"; echo 'tls: failed to verify certificate: x509: OSStatus -26276' >&2; exit 1
E2
printf '#!/bin/bash\nfor a; do [ "$p" = -D ] && : > "$a"; p=$a; done\necho "{\\"number\\":1}"\n' > "$T/bin/curl"; chmod +x "$T/bin/"*
tries() { : > "$T/tries"; for i in 1 2 3; do env -u GH_TOKEN PATH="$T/bin:$PATH" FX="$T" "$@" bash "$TOOLS/gh.sh" api repos/o/r/pulls/1 --jq .number > "$T/got" 2>/dev/null; done; grep -c . "$T/tries"; }
n=$(tries env GH_TLS_NOTE_ONCE="$T/flag"); ok "one run, three reads, gh's TLS broken: gh is tried once and the third read is answered" "$([ "$n" = 1 ] && [ "$(cat "$T/got")" = 1 ] && echo 1)" "$n tries, got $(cat "$T/got")"
n=$(tries env -u GH_TLS_NOTE_ONCE); ok "no run flag: gh is tried each time, as before" "$([ "$n" = 3 ] && echo 1)" "$n tries"
finish
