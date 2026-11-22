#!/bin/bash
# Bulk-delete and stale-index guard (ENF-803, P-803; founder 22 Nov: "make sure inbuilt a enforced mechanism in the lead
# agent that he doesn't take any stale information"). Lesson: on 22 Nov a GIT_INDEX_FILE left set to a temp index in the
# Lead's shell made commit 54e27fc66 delete 10,753 files. Two refusals:
#   index                 GIT_INDEX_FILE points outside this repository's git folder (a temp index): refuse. Git itself
#                         points it at .git/index.lock or .git/next-index-*.lock while a commit runs; those pass.
#   staged <msg file>     the staged commit deletes more than LIMIT files and the message has no "BULK-DELETE-OK: <reason>"
#   range <rev-list args> the same for every commit in the range (pre-push through push-guard.sh, and CI's guard job)
# A file counts as deleted only when it is gone against EVERY parent (a merge of main that brings main's own deletions
# is not counted) and its exact content is not added at another path in the same commit (a pure move is not a delete;
# an empty file never counts as moved).
# Reads trees only (no blob), so CI's blob:none checkout needs no download. Hooks: .githooks/pre-commit, commit-msg,
# pre-push. Limit: BULK_DELETE_LIMIT (default 50). Test: test-enf-803.sh. Exit 1 refused, 0 clean, 2 misuse.
set -u
LIMIT="${BULK_DELETE_LIMIT:-50}"
TRAILER='^BULK-DELETE-OK:[[:space:]]*[^[:space:]].{2,}'

index_check() {
  [ -n "${GIT_INDEX_FILE:-}" ] || return 0
  local verdict
  verdict=$(python3 -I - "$GIT_INDEX_FILE" "$(git rev-parse --absolute-git-dir 2>/dev/null)" "$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null)" <<'PY'
import os, sys
idx, gd, cd = sys.argv[1], sys.argv[2], sys.argv[3]
r = lambda p: os.path.realpath(p) if p else ""
i = r(idx)
inside = any(d and (i == r(d) or i.startswith(r(d) + os.sep)) for d in (gd, cd))
print("ok" if inside else i)
PY
)
  [ "$verdict" = ok ] && return 0
  echo "REFUSED (ENF-803): GIT_INDEX_FILE is set to $verdict, outside this repository's git folder (a temp or stale index)."
  echo "  A commit from it can delete every file not in that index (22 Nov: 54e27fc66 deleted 10,753 files)."
  echo "  Fix: unset GIT_INDEX_FILE, check 'git status', then commit again."
  return 1
}

# deleted_list <commit or --staged>: prints the count of deletions against every parent, pure moves excluded
deleted_list() {
  local c="$1" parents p first=1 dels="" adds
  if [ "$c" = --staged ]; then
    parents="HEAD"; [ -f "$(git rev-parse --git-path MERGE_HEAD)" ] && parents="HEAD $(tr '\n' ' ' < "$(git rev-parse --git-path MERGE_HEAD)")"
    git rev-parse -q --verify HEAD >/dev/null || return 0   # first commit: nothing to delete
  else
    parents=$(git rev-list --parents -n1 "$c" | cut -d' ' -f2-); [ "$parents" = "$c" ] && return 0   # root commit
  fi
  for p in $parents; do
    if [ "$c" = --staged ]; then d=$(git diff-index --cached --no-renames --raw "$p" | awk '$5 == "D" {sub(/^[^\t]*\t/, ""); print}' | sort)
    else d=$(git diff-tree -r --no-renames --raw "$p" "$c" | awk '$5 == "D" {sub(/^[^\t]*\t/, ""); print}' | sort); fi
    if [ "$first" = 1 ]; then dels="$d"; first=0
      # exact moves against the first parent: deleted blob ids that come back under another path
      if [ "$c" = --staged ]; then adds=$(git diff-index --cached --no-renames --raw "$p" | awk '$5 == "A" && $4 !~ /^e69de29bb2d1d6434b8b29ae775ad8c2e48c5391/ {print $4}' | sort -u)
      else adds=$(git diff-tree -r --no-renames --raw "$p" "$c" | awk '$5 == "A" && $4 !~ /^e69de29bb2d1d6434b8b29ae775ad8c2e48c5391/ {print $4}' | sort -u); fi
      if [ -n "$adds" ] && [ -n "$dels" ]; then
        if [ "$c" = --staged ]; then moved=$(git diff-index --cached --no-renames --raw "$p" | awk '$5 == "D" {o = $3; sub(/^[^\t]*\t/, ""); print o "\t" $0}')
        else moved=$(git diff-tree -r --no-renames --raw "$p" "$c" | awk '$5 == "D" {o = $3; sub(/^[^\t]*\t/, ""); print o "\t" $0}'); fi
        gone=$(awk -F'\t' 'NR == FNR {a[$1]; next} !($1 in a) {print $2}' <(printf '%s\n' "$adds") <(printf '%s\n' "$moved") | sort)
        dels=$(comm -12 <(printf '%s\n' "$dels") <(printf '%s\n' "$gone"))
      fi
      [ "$(printf '%s\n' "$dels" | grep -c .)" -le "$LIMIT" ] && break   # under the limit already: other parents can only lower it
    else dels=$(comm -12 <(printf '%s\n' "$dels") <(printf '%s\n' "$d")); fi
  done
  printf '%s\n' "$dels" | grep -c .
}

refuse_msg() {  # $1 what, $2 count
  echo "REFUSED (ENF-803): $1 deletes $2 files (limit $LIMIT) and its message has no \"BULK-DELETE-OK: <reason>\" line."
  echo "  If the delete is wanted, add that line with the reason; if not, a stale or temp index is the usual cause:"
  echo "  unset GIT_INDEX_FILE, 'git reset' (keeps your files), check 'git status', then stage again."
}

case "${1:-}" in
  index) index_check ;;
  staged)
    [ -n "${2:-}" ] && [ -f "$2" ] || { echo "bulk-delete-guard: staged needs the commit message file"; exit 2; }
    index_check || exit 1
    n=$(deleted_list --staged)
    [ "${n:-0}" -le "$LIMIT" ] && exit 0
    grep -v '^#' "$2" | grep -qE "$TRAILER" && { echo "bulk delete of $n files allowed: $(grep -m1 -oE "$TRAILER" "$2")"; exit 0; }
    refuse_msg "this commit" "$n"; exit 1 ;;
  range)
    shift; [ $# -gt 0 ] || { echo "bulk-delete-guard: range needs rev-list arguments"; exit 2; }
    cs=$(git rev-list "$@" 2>/dev/null) || { echo "REFUSED (ENF-803): cannot list commits of '$*'"; exit 1; }
    bad=0
    for c in $cs; do
      n=$(deleted_list "$c")
      [ "${n:-0}" -le "$LIMIT" ] && continue
      git log -1 --format=%B "$c" | grep -qE "$TRAILER" && continue
      refuse_msg "commit ${c:0:9} ($(git log -1 --format=%s "$c" | cut -c1-60))" "$n"; bad=1
    done
    exit $bad ;;
  *) echo "usage: bulk-delete-guard.sh index | staged <msg file> | range <rev-list args>"; exit 2 ;;
esac
