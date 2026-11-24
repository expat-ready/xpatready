# Early starts for lead-watch.sh (Lead 26's row, 24 Nov 2026: a check every 10 minutes cannot take 10 to 13). Sourced, never run.
# The steps waited on GitHub one after another; their commands do not need each other. pre starts one in the background
# at the top; the step, written as before, runs the same command and is given that answer: same arguments, same output,
# same exit code, read in this run only. A command not started early, one with a pipe into it, or a job that died without
# an answer runs at its step as before: the list below changes speed, never what is checked.
#   pre <command...>        starts it                    after <command...> -- <command...>   when the first has ended
#   pre_off                 stops what has not ended (in a sandbox that hides processes, only its shell) and removes the run's folder     pre_seconds   the jobs' own seconds
# Test: check-lead-watch-speed.sh.
PRE_DIR=""   # under 1 GB free nothing starts early: a job's answer is a file, and a file cut short would lose its last lines
[ "$(df -k "$STATE_DIR" 2>/dev/null | awk 'NR == 2 {print $4}')" -ge "${PRE_FREE_KB:-1048576}" ] 2>/dev/null && { PRE_DIR=$(mktemp -d "$STATE_DIR/pre.XXXXXXXX" 2>/dev/null) || PRE_DIR=""; }
PRE_N=0; PRE_PIDS=""; PRE_T0=${PRE_T0:-$SECONDS}
PRE_KEYS=(""); PRE_I=""
pre_key() { printf -v PRE_K '%q ' "$@"; }   # in this shell: a fork for each call would cost what is saved
pre_find() {  # PRE_I = the job's number for these arguments
  local i=1; pre_key "$@"; PRE_I=""
  while [ "$i" -le "$PRE_N" ]; do [ "${PRE_KEYS[$i]}" = "$PRE_K" ] && { PRE_I=$i; return 0; }; i=$((i + 1)); done; return 1; }
pre_wait() { while [ ! -e "$PRE_DIR/$1.rc" ]; do kill -0 "$(cat "$PRE_DIR/$1.pid" 2>/dev/null)" 2>/dev/null || { sleep 0.2; [ -e "$PRE_DIR/$1.rc" ]; return; }; sleep 0.1; done; }
pre_start() {  # $1 = the number of a job that must end first, or 0
  local first=$1 n; shift; [ -n "$PRE_DIR" ] || return 0
  PRE_N=$((PRE_N + 1)); n=$PRE_N; pre_key "$@"; PRE_KEYS[$n]=$PRE_K
  ( trap - EXIT; [ "$first" = 0 ] || pre_wait "$first"; s=$(date +%s)
    command "$@" > "$PRE_DIR/$n.out" 2> "$PRE_DIR/$n.err" < /dev/null; r=$?
    echo "$(( $(date +%s) - s ))" > "$PRE_DIR/$n.sec"; echo "$r" > "$PRE_DIR/$n.tmp"; mv -f "$PRE_DIR/$n.tmp" "$PRE_DIR/$n.rc" ) &
  echo "$!" > "$PRE_DIR/$n.pid"; PRE_PIDS="$PRE_PIDS $!"; }
pre() { pre_start 0 "$@"; }
after() { local a=(); while [ $# -gt 0 ] && [ "$1" != -- ]; do a+=("$1"); shift; done; shift; pre_find "${a[@]}" || PRE_I=0; pre_start "$PRE_I" "$@"; }
pre_run() {  # the step's own call: the early answer, once, or the command itself
  local i=""; [ "$PRE_N" -gt 0 ] && pre_find "$@" && i=$PRE_I
  if [ -n "$i" ] && mkdir "$PRE_DIR/$i.taken" 2>/dev/null && pre_wait "$i" && grep -qxE '[0-9]+' "$PRE_DIR/$i.rc"; then cat "$PRE_DIR/$i.out"; cat "$PRE_DIR/$i.err" >&2; return "$(cat "$PRE_DIR/$i.rc")"; fi
  command "$@"; }
python3() { pre_run python3 "$@"; }
bash() { pre_run bash "$@"; }
pre_seconds() {
  local i=1 a; while [ "$i" -le "$PRE_N" ]; do a=$(grep -oE '[a-z0-9-]+\.(py|sh)' <<<"${PRE_KEYS[$i]}" | head -1); echo "$(cat "$PRE_DIR/$i.sec" 2>/dev/null || echo 0) ${a:-?}"; i=$((i + 1)); done | sort -rn | head -5 | awk '{printf "%s%s %s s", (NR > 1 ? ", " : ""), $2, $1}'; }
pre_off() { [ -n "$PRE_DIR" ] || return 0; local p i=0; for p in $PRE_PIDS; do i=$((i + 1)); [ -e "$PRE_DIR/$i.rc" ] && continue   # ended: its number may be another process's by now
  pkill -P "$p" 2>/dev/null; kill "$p" 2>/dev/null; done; rm -rf "${PRE_DIR:?}"; PRE_DIR=""; }
