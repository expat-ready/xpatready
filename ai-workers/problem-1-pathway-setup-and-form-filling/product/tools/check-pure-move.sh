#!/usr/bin/env bash
# Repository clean-up (product/design/repo-cleanup-plan-2026-11-17.md §3): proves a clean-up pull request is what it
# says, so a reviewer checks thousands of files in one line. --move: every change is a rename with identical content
# (git R100). --delete: every change is a deletion. --allow FILE (repeatable): a file that may also change (CLAUDE.md
# in stage 1). Prints the counts and every other change; exit 0 when pure, 1 when not, 2 on bad use. US$0, no network.
#   bash product/tools/check-pure-move.sh --move [--base origin/main] [--allow FILE]...
#   bash product/tools/check-pure-move.sh --delete [--base origin/main] [--allow FILE]...
# Test: product/tools/check-cleanup-checks.sh.
set -u
mode=""; base="origin/main"; allow=()
while [ $# -gt 0 ]; do
  case "$1" in
    --move|--delete) mode="${1#--}"; shift;;
    --base) base="${2:?--base needs a commit}"; shift 2;;
    --allow) allow+=("${2:?--allow needs a file}"); shift 2;;
    *) echo "unknown argument: $1" >&2; exit 2;;
  esac
done
[ -n "$mode" ] || { echo "say --move or --delete" >&2; exit 2; }
git rev-parse -q --verify "$base^{commit}" >/dev/null || { echo "no such base: $base" >&2; exit 2; }
want=$([ "$mode" = move ] && echo R100 || echo D)
list=$(git -c diff.renameLimit=0 diff --name-status -M100% "$base"...HEAD) || { echo "git diff failed" >&2; exit 2; }   # 0: no limit on renames
n_ok=0; n_allowed=0; bad=()
while IFS=$'\t' read -r st a b; do
  [ -n "$st" ] || continue
  if [ "$st" = "$want" ]; then n_ok=$((n_ok + 1)); continue; fi
  f="${b:-$a}"; hit=0
  for x in "${allow[@]+"${allow[@]}"}"; do [ "$f" = "$x" ] || [ "$a" = "$x" ] && hit=1; done
  if [ "$hit" = 1 ]; then n_allowed=$((n_allowed + 1)); else bad+=("$st	$a${b:+ -> $b}"); fi
done <<< "$list"
echo "  pure $mode: $n_ok ${want} change(s), $n_allowed allowed, ${#bad[@]} other"
for x in "${bad[@]+"${bad[@]}"}"; do echo "  NOT PURE: $x"; done
[ "$n_ok" -gt 0 ] || { echo "  nothing to check: no $want change against $base"; exit 1; }
[ "${#bad[@]}" -eq 0 ]
