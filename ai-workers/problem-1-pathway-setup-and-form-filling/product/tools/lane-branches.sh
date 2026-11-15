#!/bin/bash
# Lane branches the Lead merges by hand (board/*, tools/*) with commits not on this branch (P-611, rows G-1 and G-2; on
# 15 Nov four reviewer-fix commits sat unmerged on a board branch). One line per branch; exit 1 when any, else 0.
# Fetches with --prune, so a branch deleted on GitHub (abandoned) stops counting. Used by handover.sh and takeover.sh.
# Usage: bash product/tools/lane-branches.sh [base, default HEAD]
base="${1:-HEAD}"; cd "$(dirname "$0")" || exit 99
git fetch -q --prune origin "+refs/heads/board/*:refs/remotes/origin/board/*" "+refs/heads/tools/*:refs/remotes/origin/tools/*" 2>/dev/null \
  || echo "warn  lane-branches: fetch failed; using the branches last fetched" >&2
hit=0
for b in $(git for-each-ref --format='%(refname:short)' "refs/remotes/origin/board/" "refs/remotes/origin/tools/"); do
  n=$(git rev-list --count "${base}..${b}" 2>/dev/null) || continue
  [ "${n:-0}" -gt 0 ] || continue
  hit=1; echo "unmerged  ${b#origin/}: ${n} commit(s) not on $(git rev-parse --abbrev-ref "$base"), last push $(git log -1 --format=%cr "$b")"
done
exit "$hit"
