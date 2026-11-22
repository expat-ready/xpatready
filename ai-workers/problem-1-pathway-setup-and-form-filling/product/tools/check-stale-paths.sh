#!/usr/bin/env bash
# Repository clean-up (product/design/repo-cleanup-plan-2026-11-17.md §3): fails when a live file still names a path
# that a clean-up stage moved or removed. The old paths are listed in stale-paths.txt (one per line, # comments; each
# stage adds its own). Live files are what runs or instructs: CI, Mergify, hooks, skills, agents, root instructions,
# the root config files, the product rules, the tools, the prototype (app, POC runners, their data) and the packages.
# Records (screens, qa, design, reports, history, evidence) keep their facts (P-188) and are not read. A stored path
# in data is mapped by fromStored(), never rewritten (plan §7.1): a stage that lists such a path skips that data file
# here, by name. Prints file:line for each hit; exit 0 clean, 1 on a hit, 2 on bad use or when git cannot read the
# copy (never a pass). US$0, no network.
#   bash product/tools/check-stale-paths.sh [--list FILE]
# Test: product/tools/check-cleanup-checks.sh.
set -u
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/repo-root.sh"
ROOTD="$(repo_root)" || exit 2
git -C "$ROOTD" rev-parse --is-inside-work-tree >/dev/null 2>&1 || { echo "not a git work tree: $ROOTD" >&2; exit 2; }
list="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/stale-paths.txt"
case "${1:-}" in
  "") ;;
  --list) [ -n "${2:-}" ] || { echo "--list needs a file" >&2; exit 2; }; list="$2";;
  *) echo "unknown argument: $1" >&2; exit 2;;
esac
[ -f "$list" ] || { echo "no list: $list" >&2; exit 2; }
P1=ai-workers/problem-1-pathway-setup-and-form-filling
LIVE=(.github .mergify.yml .githooks .claude .agents .goose AGENTS.md CLAUDE.md .gitignore .nvmrc tsconfig.base.json package.json
  packages "$P1/product/tools" "$P1/product/RULES.md" "$P1/product/WAY-OF-WORKING.md" "$P1/prototype")
SKIP=(":!$P1/prototype/studio/evidence" ":!$P1/prototype/studio/tests/fixtures" ":!*.png" ":!*.jpg" ":!*.pdf" ":!$P1/product/tools/stale-paths.txt")
# The October hash lists and hand-over notes at the prototype/ root are records no tool reads (clean-up stage 1, #2459 A).
SKIP+=(":(glob,exclude)$P1/prototype/*-manifest*.sha256" ":(glob,exclude)$P1/prototype/*-handoff-*.md")
n=0; hits=0; ERR=$(mktemp "${TMPDIR:-/tmp}/stale-paths.XXXXXXXX") || exit 2; trap 'rm -f "$ERR"' EXIT
while IFS= read -r p || [ -n "$p" ]; do
  p="${p%%#*}"; p="$(printf '%s' "$p" | sed 's/^[[:space:]]*//; s/[[:space:]]*$//')"; [ -n "$p" ] || continue
  n=$((n + 1))
  out=$(git -C "$ROOTD" grep -nF -- "$p" -- "${LIVE[@]}" "${SKIP[@]}" 2>"$ERR"); rc=$?
  [ "$rc" = 1 ] && continue
  [ "$rc" = 0 ] || { echo "git grep failed (exit $rc) for $p: $(cat "$ERR")" >&2; exit 2; }
  hits=$((hits + $(printf '%s\n' "$out" | wc -l)))
  printf '%s\n' "$out" | sed "s#^#  STALE ($p): #"
done < "$list"
echo "  stale paths: $n checked, $hits hit(s) in live files"
[ "$hits" -eq 0 ]
