#!/usr/bin/env bash
# Clean-up safety net in CI (enforcement plan row E5, P-674 to P-677; pr-rules.yml). Reads the PR body on stdin and the
# change against --base (in CI the merge commit's first parent, so the change is exactly what the PR adds):
#  - a body line "Clean-up: move" or "Clean-up: delete" (optionally "; allow: FILE, FILE") makes the PR prove it is
#    pure with check-pure-move.sh; product/tools/stale-paths.txt and docs/PATHS-MOVED.md are always allowed, since
#    each stage adds its rows there in the same PR (repo-cleanup plan §3);
#  - without that line, a PR that edits stale-paths.txt, or renames or deletes BULK (default 50) files or more, fails:
#    a bulk move hides edits a reviewer cannot see, so it must be a pure Clean-up PR;
#  - every PR runs check-stale-paths.sh: no live file may name a path a stage moved or removed.
# Exit 0 clean, 1 on a finding, 2 on bad use (never a pass). US$0, no network.
#   printf '%s\n' "$BODY" | bash product/tools/cleanup-pr-check.sh [--base REV]
# Test: product/tools/check-cleanup-pr.sh.
set -u
TOOLS="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
P1=ai-workers/problem-1-pathway-setup-and-form-filling
LIST="$P1/product/tools/stale-paths.txt"; MOVED=docs/PATHS-MOVED.md; BULK="${CLEANUP_BULK:-50}"
base="origin/main"
while [ $# -gt 0 ]; do
  case "$1" in
    --base) [ -n "${2:-}" ] || { echo "--base needs a commit" >&2; exit 2; }; base="$2"; shift 2;;
    *) echo "unknown argument: $1" >&2; exit 2;;
  esac
done
git rev-parse -q --verify "$base^{commit}" >/dev/null || { echo "no such base: $base" >&2; exit 2; }
body=$(cat)
line=$(printf '%s\n' "$body" | tr -d '\r' | grep -m1 -E '^Clean-up:' || true)
names=$(git -c diff.renameLimit=0 -c core.quotePath=false diff --name-status -M "$base"...HEAD) || { echo "git diff failed" >&2; exit 2; }
moved=$(printf '%s\n' "$names" | grep -cE '^(R[0-9]*|D)'$'\t' || true)
lists=$(printf '%s\n' "$names" | cut -f2- | tr '\t' '\n' | grep -cxF "$LIST" || true)
bad=0
if [ -n "$line" ]; then
  mode=$(printf '%s' "$line" | sed -nE 's/^Clean-up:[[:space:]]*(move|delete)[[:space:]]*(;[[:space:]]*allow:.*)?$/\1/p')
  [ -n "$mode" ] || { echo "  CLEAN-UP LINE: '$line' cannot be read; write 'Clean-up: move' or 'Clean-up: delete', optionally '; allow: FILE, FILE'"; exit 1; }
  args=(--"$mode" --base "$base" --allow "$LIST" --allow "$MOVED")
  allow=$(printf '%s' "$line" | sed -nE 's/^[^;]*;[[:space:]]*allow:(.*)$/\1/p')
  IFS=',' read -ra extra <<< "$allow"
  for f in "${extra[@]+"${extra[@]}"}"; do f=$(printf '%s' "$f" | sed 's/^[[:space:]]*//; s/[[:space:]]*$//'); [ -n "$f" ] && args+=(--allow "$f"); done
  echo "  clean-up PR ($mode): proving it is pure"
  bash "$TOOLS/check-pure-move.sh" "${args[@]}"; r=$?
  [ "$r" = 2 ] && exit 2
  [ "$r" = 0 ] || bad=1
else
  if [ "$lists" -gt 0 ]; then
    echo "  NO CLEAN-UP LINE: this PR edits $LIST, so it is a clean-up stage; add 'Clean-up: move' or 'Clean-up: delete' to the body"; bad=1
  fi
  if [ "$moved" -ge "$BULK" ]; then
    echo "  NO CLEAN-UP LINE: $moved files renamed or deleted (limit $BULK); a bulk move must be its own pure PR with 'Clean-up: move' or 'Clean-up: delete'"; bad=1
  fi
  [ "$bad" = 0 ] && echo "  not a clean-up PR: $moved file(s) renamed or deleted, under $BULK"
fi
bash "$TOOLS/check-stale-paths.sh"; r=$?
[ "$r" = 2 ] && exit 2
[ "$r" = 0 ] || bad=1
exit $bad
