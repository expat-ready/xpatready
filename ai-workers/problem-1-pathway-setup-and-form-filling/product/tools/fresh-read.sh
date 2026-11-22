#!/bin/bash
# Fresh read (ENF-803, P-803; 20 Nov P-766: the Lead read config from a lead branch instead of origin/main). Prints a file
# as it is on origin/main right after a fetch, headed by the fetched sha and the IST time, and warns when the local copy
# differs. A failed fetch refuses (exit 2): an old origin/main is never printed as fresh.
#   bash product/tools/fresh-read.sh <path from the repository root, or relative to the current folder>
# Env (tests): FRESH_REMOTE (default origin), FRESH_BRANCH (default main). Exit 0 printed, 1 not on main, 2 no fetch.
# Test: test-enf-803.sh.
set -u
R="${FRESH_REMOTE:-origin}"; B="${FRESH_BRANCH:-main}"
[ -n "${1:-}" ] || { echo "usage: fresh-read.sh <path>" >&2; exit 2; }
top=$(git rev-parse --show-toplevel) || exit 2
rel=$(python3 -I -c 'import os,sys; print(os.path.relpath(os.path.abspath(sys.argv[1]), sys.argv[2]))' "$1" "$top")
case "$rel" in ../*) rel="$1";; esac   # not under this folder: take it as a repository path
git -C "$top" fetch -q "$R" "$B" 2>/dev/null || { echo "REFUSED: git fetch $R $B failed at $(TZ=Asia/Kolkata date '+%H:%M') IST; nothing printed (an unfetched $R/$B may be stale)" >&2; exit 2; }
sha=$(git -C "$top" rev-parse FETCH_HEAD) || exit 2
# relative to the current folder first, then as a path from the repository root
git -C "$top" cat-file -e "$sha:$rel" 2>/dev/null || { git -C "$top" cat-file -e "$sha:$1" 2>/dev/null && rel="$1"; }
git -C "$top" cat-file -e "$sha:$rel" 2>/dev/null || { echo "NOT ON $R/$B: $rel does not exist at ${sha:0:12}" >&2; exit 1; }
echo "fresh-read $rel · $R/$B ${sha:0:12} · fetched $(TZ=Asia/Kolkata date '+%d %b %H:%M') IST" >&2
git -C "$top" show "$sha:$rel"
if [ -f "$top/$rel" ] && ! git -C "$top" show "$sha:$rel" | cmp -s - "$top/$rel"; then
  echo "WARN  local copy of $rel differs from $R/$B ${sha:0:12} (branch $(git -C "$top" rev-parse --abbrev-ref HEAD)): act on the text above, not the local file" >&2
elif [ ! -f "$top/$rel" ]; then echo "WARN  no local copy of $rel on this branch" >&2; fi
exit 0
