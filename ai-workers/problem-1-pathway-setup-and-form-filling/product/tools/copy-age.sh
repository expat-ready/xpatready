#!/bin/bash
# How old is this copy against main (A368, founder 24 Nov)? Age = of the newest commit on main's own line (first parents: each
# merge of a pull request) that this copy holds; a copy that holds all of main is fresh, however quiet main is.
#   copy-age.sh     one line; exit 0 under 24 h, 1 over (a Lead copy then starts a fresh lead/<today>, WAY-OF-WORKING P-388), 2 not readable
# session-start.sh prints it for every role; lead-watch.sh makes 1 an ACT at its top; takeover.sh refuses on 1. Test: check-tools-fresh.sh
now=${NOW:-$(date +%s)}; no() { echo "copy   age against origin/main not readable ($1)"; exit 2; }
git rev-parse -q --verify HEAD >/dev/null 2>&1 && git rev-parse -q --verify origin/main >/dev/null 2>&1 || no "no origin/main here"
L=(); while read -r s; do L+=("$s"); done < <(git rev-list --first-parent origin/main 2>/dev/null); n=${#L[@]}; [ "$n" -gt 0 ] || no "main's commits unreadable"
lo=0; hi=$n   # newest first: the first one this copy holds; all older ones on main's line are held too
while [ "$lo" -lt "$hi" ]; do m=$(( (lo + hi) / 2 )); if git merge-base --is-ancestor "${L[$m]}" HEAD 2>/dev/null; then hi=$m; else lo=$((m + 1)); fi; done
[ "$lo" -lt "$n" ] || no "no commit of main's is held"
[ "$lo" = 0 ] && { echo "copy   holds all of origin/main (${L[0]:0:9})"; exit 0; }
t=$(git log -1 --format=%ct "${L[$lo]}"); [ "$t" -le "$now" ] 2>/dev/null || no "a commit dated after the clock"
h=$(( (now - t) / 3600 )); echo "copy   newest main commit it holds is $h h old (${L[$lo]:0:9}); it misses main's last $lo"
[ "$h" -lt 24 ]
