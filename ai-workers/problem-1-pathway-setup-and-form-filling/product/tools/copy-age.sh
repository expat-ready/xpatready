#!/bin/bash
# How old is this copy against main (A368, founder 24 Nov)? The copy's fork point is the newest main commit it holds.
#   copy-age.sh        one line; exit 0 under 24 h, 1 over (a Lead copy then starts a fresh lead/<today>, WAY-OF-WORKING P-388), 2 not readable
# session-start.sh prints it for every role; lead-watch.sh makes 1 its first ACT; takeover.sh refuses on 1. Test: check-lead-run.sh
now=${NOW:-$(date +%s)}; mb=$(git merge-base HEAD origin/main 2>/dev/null); t=$(git log -1 --format=%ct "${mb:-none}" -- 2>/dev/null)
case "$t" in ''|*[!0-9]*) echo "copy   age against origin/main not readable (no common commit here, or no origin/main)"; exit 2;; esac
h=$(( (now - t) / 3600 )); n=$(git rev-list --count HEAD..origin/main 2>/dev/null)
echo "copy   $(git branch --show-current 2>/dev/null || true): newest main commit it holds is $h h old (${mb:0:9}), $n commit(s) behind origin/main"
[ "$h" -lt 24 ]
