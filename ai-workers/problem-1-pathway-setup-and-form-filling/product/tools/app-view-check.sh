#!/bin/bash
# The app view's ACT lines (B197 (3), founder A110, 16 Nov; P-326, P-339): run by lead-watch.sh every check and by
# lead-check-guard.sh at a check turn's end. Reads product/state/app-view-latest.txt (app-view-save.sh): over 15 min old
# (P-798, 22 Nov: was 35) or missing = "ACT app view not read in N min"; otherwise one ACT per FLAG line in it, one for an UNREADABLE line and one for a "WARNING: list may be cut" line (B204).
#   bash product/tools/app-view-check.sh [--stale-only]     exit = the number of ACT lines
# Env (tests): APP_VIEW_FILE, NOW (epoch seconds). Test: check-app-view.sh.
STALE_MIN=15   # P-798: one 10-minute check plus 5 min grace (was 35; P-789 (2) asked 12 before the 10-minute check)
TOOLS="$(cd "$(dirname "$0")" && pwd)"
f="${APP_VIEW_FILE:-$TOOLS/../state/app-view-latest.txt}"; now="${NOW:-$(date +%s)}"
how="run tools/app-view.js (it clicks every Show more) in the built-in browser on claude.ai/code, save it with lead-watch.sh app-view-read, act on each FLAG (P-326, A110)"
n=0; ACT() { n=$((n+1)); echo "ACT   $1"; }
t=$([ -s "$f" ] && sed -n '1s/.* epoch \([0-9][0-9]*\)$/\1/p' "$f")
[ -z "$t" ] && [ -s "$f" ] && t=$(stat -c %Y "$f" 2>/dev/null || stat -f %m "$f" 2>/dev/null)
if [ -z "$t" ]; then ACT "app view never read in this copy (no $f): $how"; exit "$n"; fi
age=$(( (now - t) / 60 ))
if [ "$age" -gt "$STALE_MIN" ]; then ACT "app view not read in ${age} min (over ${STALE_MIN}): $how"; exit "$n"; fi
[ "${1:-}" = --stale-only ] && exit 0
echo "app view read ${age} min ago: $(sed -n 2p "$f")"
# P-789 (2): a summary with no "rows=N" was read without clicking every "Show more": the sidebar's rows are unseen.
sed -n 2p "$f" | grep -qE '(^| )rows=[0-9]+' || ACT "app view saved without rows=N (\"Show more\" not expanded): $how"
# Idle-lane alarm (A334 fix 1, founder 23 Nov "Yes, beside product": lanes sat idle for hours waiting for answers). Each FLAG
# line stays one ACT, never two; a cloud lane idle over 10 min with work left, or waiting for the Lead (need_input, blocked,
# failed), comes first, oldest first, and ends "[idle lane N min: answer or wake it]". Other flags (mac lanes, context) follow.
# Fields are found by shape, not position (a title or detail may hold " · "): the place and status after the first
# " · cloud|mac · <status> · needs: ", the idle minutes from the last "idle N min" field, the reasons after the last " -> ".
# Any reason other than idle or context is a status the Lead must answer (need_input, blocked, failed, or a failed run).
idle_lanes=$(grep '^FLAG' "$f" | awk -F' · ' '{
  why = $0; while ((k = index(why, " -> ")) > 0) why = substr(why, k + 4); if (why == $0) why = ""
  m = "?"; for (i = NF; i >= 2; i--) if ($i ~ /^idle [0-9]+ min$/) { split($i, w, " "); m = w[2]; break }
  rs = why; gsub(/ \([^)]*\)/, "", rs)   # "context 46% (over 45%, P-565)": the comma inside brackets is not a reason
  wait = 0; n = split(rs, r, ", "); for (j = 1; j <= n; j++) if (r[j] !~ /^(idle [0-9]+ min with work left|context )/) wait = 1
  lane = ($0 ~ / · cloud · [a-z_]+ · needs: /) && (why ~ /idle [0-9]+ min with work left/ || wait)
  printf "%d\t%d\t%s\t%s\n", lane, (m == "?" ? 0 : m), m, $0 }' | sort -t "$(printf '\t')" -s -k1,1nr -k2,2nr)
nl=0; oldest=0
while IFS="$(printf '\t')" read -r lane key m l; do
  [ -z "$l" ] && continue
  if [ "$lane" = 1 ]; then nl=$((nl+1)); [ "$key" -gt "$oldest" ] && oldest=$key; ACT "app view: ${l#FLAG  } [idle lane $m min: answer or wake it]"
  else ACT "app view: ${l#FLAG  }"; fi
done <<< "$idle_lanes"
echo "idle lanes: $nl cloud lanes idle over 10 min with work left or waiting for the Lead$([ "$nl" -gt 0 ] && echo ", oldest $oldest min")"
while IFS= read -r l; do ACT "app view: $l"; done < <(grep '^UNREADABLE' "$f")
# B204 (4): the page returned as many sessions as it asked for, or said more remain: lanes past the limit are unseen.
while IFS= read -r l; do ACT "app view: $l: raise LIMIT in tools/app-view.js or read the rest in claude.ai/code"; done < <(grep '^WARNING: list may be cut' "$f")
exit "$n"
