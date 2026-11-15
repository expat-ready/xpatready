#!/usr/bin/env bash
# Every branch ahead of main with no open PR and no LANE-REPORT is listed (A85 3b generalised, row G-4 (5)): lane work
# that no PR carries and no report names is work nobody will merge. Each origin branch pushed in the last SWEEP_DAYS
# (7) days, other than main, HEAD and mergify/*, with commits not on origin/main, is skipped when an open PR has it as
# head, when a merged or closed PR has exactly its head (nothing pushed since), or when an item in
# product/state/items.json names it (a LANE-REPORT, G-1); else one ACT line. Read-only; exit = number of ACT lines.
# Run by lead-watch.sh 3b. Env: SWEEP_GH (stand-in gh), ITEMS, MAIN_REF (origin/main). Test: check-g4-rules.sh.
set -u
TOOLS="$(cd "$(dirname "$0")" && pwd)"; gh() { ${SWEEP_GH:-bash "$TOOLS/gh.sh"} "$@"; }
ITEMS="${ITEMS:-$TOOLS/../state/items.json}"; MAIN_REF="${MAIN_REF:-origin/main}"; days=${SWEEP_DAYS:-7}
prs=$(gh pr list --state all --limit 500 --json headRefName,headRefOid,state 2>/dev/null) \
  && echo "$prs" | jq -e 'type == "array"' >/dev/null 2>&1 || { echo "ACT   branch sweep: PRs unreadable, branches not swept"; exit 1; }
named=$(jq -r '.[]?.branch // empty' "$ITEMS" 2>/dev/null)
cut=$(( $(date +%s) - days * 86400 )); act=0
while read -r t sha ref; do
  b=${ref#origin/}; case "$b" in main|HEAD|mergify/*|origin) continue;; esac; [ "$t" -ge "$cut" ] || continue
  n=$(git rev-list --count "$MAIN_REF..$sha" 2>/dev/null); [ "${n:-0}" -gt 0 ] || continue
  echo "$prs" | jq -e --arg b "$b" --arg s "$sha" 'any(.[]; .headRefName == $b and (.state == "OPEN" or .headRefOid == $s))' >/dev/null && continue
  printf '%s\n' "$named" | grep -qxF "$b" && continue
  act=$((act + 1)); echo "ACT   $b: $n commit(s) not on main, no open PR, no LANE-REPORT (G-4 (5)): ask its lane, or open the PR"
done < <(git for-each-ref --format='%(committerdate:unix) %(objectname) %(refname:short)' refs/remotes/origin)
exit $act
