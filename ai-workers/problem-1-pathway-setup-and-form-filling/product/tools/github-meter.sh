#!/usr/bin/env bash
# LR-174 (founder A455, 28 Nov: "make sure they are enforced in the lab ... everywhere agent is aware"): one meter for the
# GitHub REST budget of the Lead's tools. Facts and sources: product/rules/github-limits.md. Read-only on GitHub.
#   github-meter.sh top                  one line: token kind, hourly limit, used, remaining, reset, org App token in use or not
#   github-meter.sh start <file>         saves the x-ratelimit numbers now (for stop); prints the top line
#   github-meter.sh stop <script> <file> logs the requests <script> used since start to the meter log; prints them
#   github-meter.sh run <script> -- cmd  start, run cmd, stop; exits with cmd's code
#   github-meter.sh fits <script>        exit 0 when the remaining budget holds <script>'s budget line, 1 when not, 2 unknown
#   github-meter.sh budget [log]         each script's newest measured cost against github-budget.tsv: exit 1 on any over
#                                        its line, or a metered script with no line; exit 0 when all hold
#   github-meter.sh calls [minutes]      calls made through gh.sh per calling script in the last minutes (default 60)
# The numbers come from the x-ratelimit-* headers of GET /rate_limit, which itself does not count against the limit
# (GitHub docs). A measured cost is the token's use during the run: other tools on the same token in that window count too.
# Token: the org App's installation token when it is configured (app-token.sh: its key file exists), else GH_TOKEN, else
# `gh auth token`; with the App, the user token's remaining (it carries every write) is on the top line too. Meter log: $GITHUB_METER_DIR/meter.tsv (default $TMPDIR/xr-github-meter).
# XR_GITHUB_API replaces https://api.github.com (tests). Test: check-github-budget.sh. US$0.
set -u
TOOLS="$(cd "$(dirname "$0")" && pwd)"
DIR="${GITHUB_METER_DIR:-${TMPDIR:-/tmp}/xr-github-meter}"; mkdir -p "$DIR" 2>/dev/null
LOG="${GITHUB_METER_LOG:-$DIR/meter.tsv}"; BUDGET="${GITHUB_BUDGET_FILE:-$TOOLS/github-budget.tsv}"
API="${XR_GITHUB_API:-https://api.github.com}"
ist() { TZ=Asia/Kolkata date -d "@$1" '+%H:%M IST' 2>/dev/null || TZ=Asia/Kolkata date -r "$1" '+%H:%M IST'; }

token() {  # sets TOK and KIND (the token never leaves this process but in curl's stdin)
  APP=no; TOK=""
  if [ "$(bash "$TOOLS/app-token.sh" kind)" = app ]; then
    if TOK=$(bash "$TOOLS/app-token.sh" 2>"$DIR/app-token.err"); then APP=yes; else APP="set but failed: $(head -c 120 "$DIR/app-token.err")"; TOK=""; fi
  fi
  USERTOK="${GH_TOKEN:-${GITHUB_TOKEN:-$(command gh auth token 2>/dev/null)}}"; [ -n "$TOK" ] || TOK="$USERTOK"
  case "$TOK" in
    gho_*) KIND="user OAuth (gho_, gh CLI)";; ghp_*) KIND="classic personal (ghp_)";; github_pat_*) KIND="fine-grained personal (github_pat_)";;
    ghs_*) [ "$APP" = yes ] && KIND="org App installation (ghs_)" || KIND="installation or Actions (ghs_)";; ghu_*) KIND="App user (ghu_)";;
    "") KIND="none";; *) KIND="unknown kind";;
  esac
}
read_limits() {  # sets LIMIT USED REMAIN RESET from the headers; returns 1 when unreadable
  LIMIT=""; USED=""; REMAIN=""; RESET=""
  [ -n "$TOK" ] || return 1
  local h; h=$(printf 'Authorization: Bearer %s\nAccept: application/vnd.github+json\n' "$TOK" \
    | curl -sS --max-time 10 -o /dev/null -D - -H @- "$API/rate_limit" 2>/dev/null | tr -d '\r') || return 1
  LIMIT=$(sed -n 's/^x-ratelimit-limit: *//Ip' <<<"$h" | head -1); USED=$(sed -n 's/^x-ratelimit-used: *//Ip' <<<"$h" | head -1)
  REMAIN=$(sed -n 's/^x-ratelimit-remaining: *//Ip' <<<"$h" | head -1); RESET=$(sed -n 's/^x-ratelimit-reset: *//Ip' <<<"$h" | head -1)
  case "$LIMIT$USED$REMAIN$RESET" in ''|*[!0-9]*) return 1;; esac
  [ -n "$LIMIT" ] && [ -n "$USED" ] && [ -n "$REMAIN" ] && [ -n "$RESET" ]
}
appnote() { case "$APP" in yes) echo "org App token in use (reads)";; no) echo "org App token not in use (no key file)";; *) echo "org App token $APP; user token in use";; esac; }
topline() {
  if read_limits; then
    local u=""; if [ "$APP" = yes ]; then   # writes (comments, labels) stay on the user token: its budget is said too
      local keep="$TOK" l=$LIMIT us=$USED rm=$REMAIN rs=$RESET; TOK="$USERTOK"
      if read_limits; then u=" · user token (writes) remaining $REMAIN of $LIMIT"; else u=" · user token (writes) unknown"; fi
      TOK="$keep"; LIMIT=$l; USED=$us; REMAIN=$rm; RESET=$rs; fi
    echo "github token $KIND · limit $LIMIT/h · used $USED · remaining $REMAIN · resets $(ist "$RESET") · $(appnote)$u"
  else echo "github token $KIND · budget unknown (GET /rate_limit unreadable) · $(appnote)"; return 2; fi
}
budget_of() { awk -F'\t' -v s="$1" '$1==s {print $2; exit}' "$BUDGET" 2>/dev/null; }

case "${1:-}" in
  top) token; topline; exit $?;;
  start) [ -n "${2:-}" ] || { echo "usage: start <file>" >&2; exit 2; }
    token; topline; r=$?; printf '%s %s %s %s\n' "${USED:-x}" "${RESET:-x}" "$(date +%s)" "$KIND" > "$2"; exit $r;;
  stop) [ -n "${2:-}" ] && [ -n "${3:-}" ] || { echo "usage: stop <script> <file>" >&2; exit 2; }
    read -r u0 r0 t0 _ < "$3" 2>/dev/null || { echo "meter: no start file $3" >&2; exit 2; }
    token; n="?"
    if read_limits && [ "$u0" != x ]; then
      if [ "$RESET" = "$r0" ]; then n=$(( USED - u0 )); else n=$(( USED + 0 )); fi   # the window reset during the run: a floor
    fi
    now=$(date +%s); printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\n' "$now" "$(ist "$now")" "$2" "$n" "$(( now - ${t0:-$now} ))s" "${REMAIN:-?}" "$KIND" >> "$LOG"
    echo "meter $2: $n requests in $(( now - ${t0:-$now} )) s · remaining ${REMAIN:-?}"; [ "$n" != "?" ];;
  run) s="${2:-}"; [ -n "$s" ] && [ "${3:-}" = -- ] || { echo "usage: run <script> -- cmd ..." >&2; exit 2; }; shift 3
    f=$(mktemp "$DIR/run.XXXXXXXX"); bash "$0" start "$f" >&2; "$@"; rc=$?; bash "$0" stop "$s" "$f" >&2; rm -f "$f"; exit $rc;;
  fits) b=$(budget_of "${2:-}"); [ -n "$b" ] || { echo "meter: no budget line for ${2:-?} in $BUDGET" >&2; exit 2; }
    token; read_limits || { echo "meter: budget unknown; ${2} assumed to fit"; exit 2; }
    if [ "$REMAIN" -ge "$b" ]; then echo "meter: $REMAIN remaining holds ${2}'s $b"; exit 0; fi
    echo "meter: $REMAIN remaining is under ${2}'s budget $b (resets $(ist "$RESET"))"; exit 1;;
  budget) L="${2:-$LOG}"; [ -s "$L" ] || { echo "budget: no measurements in $L yet: nothing over"; exit 0; }
    awk -F'\t' -v bf="$BUDGET" '
      BEGIN { while ((getline l < bf) > 0) { if (l ~ /^#/ || l == "") continue; split(l, a, "\t"); B[a[1]] = a[2] } }
      $4 ~ /^[0-9]+$/ { last[$3] = $4; when[$3] = $2 }
      END { bad = 0
        for (s in last) {
          if (!(s in B)) { print "FAIL  " s ": measured " last[s] " requests (" when[s] ") and no budget line in github-budget.tsv"; bad = 1 }
          else if (last[s] + 0 > B[s] + 0) { print "FAIL  " s ": measured " last[s] " requests (" when[s] ") over its budget line " B[s]; bad = 1 }
          else print "ok    " s ": " last[s] " of " B[s] }
        exit bad }' "$L";;
  calls) m="${2:-60}"; since=$(( $(date +%s) - m * 60 )); C="${GH_METER_CALLS:-$DIR/calls.tsv}"
    [ -s "$C" ] || { echo "calls: none logged through gh.sh in $C"; exit 0; }
    awk -F'\t' -v s="$since" '$1 >= s { n[$2]++; t++ } END { for (k in n) printf "%6d  %s\n", n[k], k; printf "%6d  total through gh.sh\n", t }' "$C" | sort -rn;;
  *) sed -n '2,16p' "$0" | sed 's/^# \{0,1\}//'; exit 2;;
esac
