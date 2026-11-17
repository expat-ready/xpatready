#!/usr/bin/env bash
# Repository clean-up (product/design/repo-cleanup-plan-2026-11-17.md §3): fails when a live file still names a path
# that a clean-up stage moved or removed. The old paths are listed in stale-paths.txt (one per line, # comments; each
# stage adds its own). Live files are what runs or instructs: CI, Mergify, hooks, skills, agents, root instructions,
# the tools, the app and the packages. Records (screens, qa, design, reports, history, evidence) keep their facts
# (P-188) and are not read. Prints file:line for each hit; exit 0 clean, 1 on a hit, 2 on bad use. US$0, no network.
#   bash product/tools/check-stale-paths.sh [--list FILE]
# Test: product/tools/check-cleanup-checks.sh.
set -u
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/repo-root.sh"
ROOTD="$(repo_root)" || exit 2
list="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/stale-paths.txt"
[ "${1:-}" = "--list" ] && list="${2:?--list needs a file}"
[ -f "$list" ] || { echo "no list: $list" >&2; exit 2; }
P1=ai-workers/problem-1-pathway-setup-and-form-filling
LIVE=(.github .mergify.yml .githooks .claude .agents .goose AGENTS.md CLAUDE.md packages "$P1/product/tools" "$P1/prototype/studio")
SKIP=(":!$P1/prototype/studio/evidence" ":!$P1/prototype/studio/tests/fixtures" ":!*.png" ":!*.jpg" ":!*.pdf" ":!$P1/product/tools/stale-paths.txt")
n=0; hits=0
while IFS= read -r p || [ -n "$p" ]; do
  p="${p%%#*}"; p="$(printf '%s' "$p" | sed 's/[[:space:]]*$//')"; [ -n "$p" ] || continue
  n=$((n + 1))
  out=$(git -C "$ROOTD" grep -nF -- "$p" -- "${LIVE[@]}" "${SKIP[@]}" 2>/dev/null) || continue
  hits=$((hits + $(printf '%s\n' "$out" | wc -l)))
  printf '%s\n' "$out" | sed "s#^#  STALE ($p): #"
done < "$list"
echo "  stale paths: $n checked, $hits hit(s) in live files"
[ "$hits" -eq 0 ]
