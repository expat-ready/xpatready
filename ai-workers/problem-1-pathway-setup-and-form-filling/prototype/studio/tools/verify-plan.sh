#!/usr/bin/env bash
# The verify skill's plan (OS-72, design/self-checking-builders-2026-11-25.md): which capabilities a builder's change
# touches, so verify walks only those before the commit. The change is everything not on origin/main yet: commits since
# the merge base, staged and unstaged edits, and new files. Their acceptance packs come from the same graph gate B uses
# (product/tools/select-suites.mjs --packs); each pack file acceptance/<C>[-part].test.ts names capability <C>.
# Prints, in order: "verify: <why>" lines, then one line "CAPS <C> <C> ..." (empty when nothing to walk), then
# "RUN <command>" (gate B on the builder's own copy, never :4400), and "ALSO <file>" for other touched browser tests.
# Exit 0 planned (or nothing to walk: records only, or no pack reads the change), 2 when the plan cannot be made (never
# an empty plan by mistake). Off by default: verify runs only on lanes listed in .claude/skills/verify/lanes.txt.
#   bash prototype/studio/tools/verify-plan.sh [--port <n>]        Test: product/tools/check-verify-plan.sh.
set -uo pipefail
STUDIO="$(cd "$(dirname "$0")/.." && pwd -P)"; P="$(cd "$STUDIO/../.." && pwd -P)"; ROOT="$(git -C "$STUDIO" rev-parse --show-toplevel)" || exit 2
SEL="${VERIFY_SELECT_SUITES:-$P/product/tools/select-suites.mjs}"; KIND="${VERIFY_CHANGE_KIND:-$P/product/tools/change-kind.sh}"
PORT=4690; [ "${1:-}" = --port ] && { PORT="${2:-}"; shift 2; }
[[ "$PORT" =~ ^4[0-9]{3}$ ]] && [ "$PORT" != 4400 ] || { echo "verify: --port must be 4000-4999 and never 4400 (the demo)"; exit 2; }
cd "$ROOT" || exit 2
base=$(git merge-base HEAD origin/main 2>/dev/null) || { echo "verify: no origin/main to compare with (git fetch origin main)"; exit 2; }
files=$( { git -c core.quotePath=false diff --no-renames --name-only "$base" && git -c core.quotePath=false ls-files --others --exclude-standard; } 2>/dev/null | sort -u) \
  || { echo "verify: the changed files could not be listed"; exit 2; }
[ -n "$files" ] || { echo "verify: nothing changed since origin/main"; echo "CAPS"; exit 0; }
kind=$(printf '%s\n' "$files" | bash "$KIND" --files 2>/dev/null) || { echo "verify: change-kind.sh failed: the plan cannot be made"; exit 2; }
case "$kind" in notes|records) echo "verify: $kind only ($(printf '%s\n' "$files" | wc -l | tr -d ' ') file(s)): nothing to walk"; echo "CAPS"; exit 0;; esac
packs=$(printf '%s\n' "$files" | node "$SEL" --packs 2>/dev/null) || { echo "verify: select-suites.mjs --packs failed: the plan cannot be made"; exit 2; }
A="${STUDIO#$ROOT/}/acceptance/"
caps=$(printf '%s\n' "$packs" | cut -f1 | grep -F "$A" | sed -E "s#^.*/acceptance/([A-Z][A-Za-z]*[0-9]+(\.[0-9]+)*)(-[^/]*)?\.test\.ts\$#\1#;t;d" | sort -uV | paste -sd ' ' -)
also=$(printf '%s\n' "$packs" | cut -f1 | grep . | grep -vF "$A" | grep -E '_browser\.ts$|\.spec\.ts$' || true)
n=$(printf '%s\n' "$files" | wc -l | tr -d ' ')
if [ -z "$caps" ]; then echo "verify: $n changed file(s) ($kind); no acceptance pack reads them"; echo "CAPS"
else
  echo "verify: $n changed file(s) ($kind) reach these capabilities' packs"; echo "CAPS $caps"
  echo "RUN cd ${STUDIO#$ROOT/} && GATE_B_NO_DIFF=1 GATE_B_JOBS=1 GATE_B_PORT=$PORT GATE_B_NAME=verify node tools/gate-b.mjs --title \"verify: $caps\" --kind code"
fi
printf '%s\n' "$also" | grep . | sed 's/^/ALSO /'
exit 0
