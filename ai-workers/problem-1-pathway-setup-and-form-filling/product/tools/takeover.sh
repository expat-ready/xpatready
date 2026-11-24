#!/bin/bash
# Take-over read for the new Lead (P-611 (2), row G-2), after handover.sh. Read-only. Prints: the current_lead line;
# git log since the previous hand-over (the previous Lead's commits and anything after); open and un-acked items;
# unmerged lane branches; and the check: a script cannot see cron, so it prints the exact CronCreate call to make when
# CronList shows no check.   Usage: bash product/tools/takeover.sh      Test: check-handover.sh
set -uo pipefail
TOOLS="$(cd "$(dirname "$0")" && pwd)"; cd "$TOOLS/.." || exit 99
br=$(git rev-parse --abbrev-ref HEAD)
# A363, A368: whose tools, and how old this copy is. A copy that left main over 24 h ago takes over nothing: it would lead by
# the rules and tools of that day. No flag goes round it; a fresh branch is one step.
[ -f "$TOOLS/tools-fresh.py" ] && python3 -I "$TOOLS/tools-fresh.py"
ca=$(bash "$TOOLS/copy-age.sh" 2>/dev/null); r=$?; [ -n "$ca" ] && echo "$ca"
if [ "$r" = 1 ]; then
  echo "REFUSED: this copy left main over 24 h ago. Start a fresh lead/<today> from origin/main (WAY-OF-WORKING, tech lead housekeeping, P-388), then run takeover.sh in it."
  exit 3
fi
git fetch -q origin "$br" 2>/dev/null && [ "$(git rev-list --count "HEAD..origin/${br}" 2>/dev/null || echo 0)" -gt 0 ] && echo "warn  this copy is behind origin/$br: git pull --ff-only, then run this again"
echo "lead  $(grep '^current_lead: ' STATE.md | sed 's/^current_lead: //')"
# Hand-over commits only (subject names "hand-over"): a Lead's own "took over" edits to its line are not hand-overs.
ho() { git log -1 --format=%H -i --grep='hand-over' -G'^current_lead: ' "$1" -- STATE.md 2>/dev/null; }
h=$(ho HEAD); p=$([ -n "$h" ] && ho "${h}~1")
range="${p:+${p}..}HEAD"
echo "log   $(git rev-list --count "$range") commit(s) since the previous hand-over (${p:0:9}); newest 30:"
git log --format='      %h %cd %s' --date=format:'%d %b %H:%M' -30 "$range" | cut -c1-140
echo "items open or acked (open = not acked: ack each now):"
o=$(python3 -I "$TOOLS/items.py" list --open); [ -n "$o" ] && echo "$o" | sed 's/^/      /' || echo "      none"
l=$(bash "$TOOLS/lane-branches.sh" HEAD); [ -n "$l" ] && echo "$l" | sed 's/^/      /' || echo "lanes no board/* or tools/* branch waits to be merged"
m=$(( ($(date +%M | sed 's/^0//') + 1) % 30 )); [ "$m" = 0 ] && m=1   # off :00 and :30
echo "check a script cannot see cron: run CronList; if no \"run lead-watch; read STATE Start here\" job, run:"
echo "      CronCreate(cron: \"$m,$((m + 30)) * * * *\", prompt: \"run lead-watch; read STATE Start here\", recurring: true)"
