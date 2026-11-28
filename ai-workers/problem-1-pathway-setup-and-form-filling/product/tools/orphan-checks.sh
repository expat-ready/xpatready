#!/usr/bin/env bash
# LR-044 (lab bundle A2, OS-34): lists every product/tools/check-*.sh that nothing runs. A check-*.sh is covered when it is
# a test check-guards.sh runs (a TESTS line in check-guards.sh or guards.d/*.sh, its extra tests, itself), the file a
# mutation row switches off (that row's test then runs it), or named on a non-comment line of a .github/workflows/*.yml.
# Exit 1 when any is listed, 2 when check-guards.sh is missing. Test: check-orphan-checks.sh.
#   bash product/tools/orphan-checks.sh [ROOT]      US$0, no network
set -u
ROOT="${1:-$(cd "$(dirname "$0")/../../../.." && pwd)}"; T="$ROOT/ai-workers/problem-1-pathway-setup-and-form-filling/product/tools"
[ -f "$T/check-guards.sh" ] || { echo "orphan-checks: no check-guards.sh under $ROOT: nothing was checked"; exit 2; }
nocomment() { grep -hv '^[[:space:]]*#' "$@" 2>/dev/null | sed 's/[[:space:]]#.*//'; }   # a comment runs nothing
tests() { nocomment "$T/check-guards.sh" "$T"/guards.d/*.sh | grep '^TESTS=' | grep -oE '[A-Za-z0-9_.-]+\.(sh|py)'; }
extras() { grep -oE 'for t in \$TESTS [^;]*' "$T/check-guards.sh" | grep -oE '[A-Za-z0-9_.-]+\.sh'; echo check-guards.sh; }
rowfiles() { nocomment "$T"/guards.d/*.sh | awk -F'|' 'NF >= 4 && $2 ~ /^product\/tools\/[^\/]+$/ { sub(/^product\/tools\//, "", $2); print $2 }'; }
workflows() { nocomment "$ROOT"/.github/workflows/*.yml | grep -vE '^[[:space:]]*(- *["\x27]|-? *name:)' | grep -oE 'check-[A-Za-z0-9_.-]+\.sh'; }   # a paths entry or a step name runs nothing
covered=$( { tests; extras; rowfiles; workflows; } | sort -u )
n=0
for f in $(cd "$T" && LC_ALL=C ls -- check-*.sh); do
  grep -qxF -- "$f" <<< "$covered" || { n=$((n + 1)); echo "ORPHAN  $f: no check-guards test, mutation row or workflow runs it (add it to a guards.d/OS-<id>.sh TESTS line)"; }
done
echo "orphan-checks: $n orphan check-*.sh"
[ "$n" = 0 ]
