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
while IFS= read -r l; do ACT "app view: ${l#FLAG  }"; done < <(grep '^FLAG' "$f")
while IFS= read -r l; do ACT "app view: $l"; done < <(grep '^UNREADABLE' "$f")
# B204 (4): the page returned as many sessions as it asked for, or said more remain: lanes past the limit are unseen.
while IFS= read -r l; do ACT "app view: $l: raise LIMIT in tools/app-view.js or read the rest in claude.ai/code"; done < <(grep '^WARNING: list may be cut' "$f")
exit "$n"
