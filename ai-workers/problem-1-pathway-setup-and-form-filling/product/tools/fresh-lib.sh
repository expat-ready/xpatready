# Freshness stamps (ENF-803, P-803; founder 22 Nov: "Always verify the source of information and whether the information
# is up to date … Never assumes it"). Sourced by lead-watch.sh, never run. Times come only from TZ=Asia/Kolkata date.
#   fresh <source>                    prints "read HH:MM IST from <source>" under the section that just read it
#   fresh_cache <file> <source> [max] a cached answer: stamped when under max minutes old (default FRESH_MAX_MIN, 10);
#                                     older or missing: one "REFUSED stale" line, exit 1, and the caller does not print it
# FRESH_MAX_MIN is exported so the Python readers lead-watch.sh starts (flow-measure.py) use the same limit.
# Test: test-enf-803.sh.
export FRESH_MAX_MIN="${FRESH_MAX_MIN:-10}"
fresh_now() { TZ=Asia/Kolkata date '+%H:%M'; }
FRESH_AT=$SECONDS   # the seconds since the stamp before: what this section cost (Lead 26, 24 Nov)
fresh() { local s=$((SECONDS - FRESH_AT)) w=""; [ "$s" -ge 2 ] && w="$s s · "; echo "      ${w}read $(fresh_now) IST from $*"; FRESH_AT=$SECONDS; }
fresh_cache() {
  local f="$1" src="$2" max="${3:-$FRESH_MAX_MIN}" m age
  if [ ! -f "$f" ]; then echo "REFUSED stale: $src: no cached answer at $f (not printed; read it again)"; return 1; fi
  m=$(stat -c %Y "$f" 2>/dev/null || stat -f %m "$f" 2>/dev/null) || m=0
  age=$(( ( $(date +%s) - m ) / 60 ))
  if [ "$age" -gt "$max" ]; then
    echo "REFUSED stale: $src cached $age min ago ($(TZ=Asia/Kolkata date -d "@$m" '+%H:%M' 2>/dev/null || TZ=Asia/Kolkata date -r "$m" '+%H:%M') IST), over $max min: not printed; read it again"
    return 1
  fi
  echo "      read $(TZ=Asia/Kolkata date -d "@$m" '+%H:%M' 2>/dev/null || TZ=Asia/Kolkata date -r "$m" '+%H:%M') IST from $src (cached, $age min old)"
}
