#!/usr/bin/env bash
# LR-181: times the edit-time lint hook the way #4043 timed LR-083's (cold: a fresh eslint process per file, no cache),
# file by file, largest first, and says whether every timed file is under the bar. It runs exactly the hook's command
# (lint-hook.sh: eslint.hook.config.js, bulk suppressions). Needs the studio's node_modules (npm ci in studio). US$0.
#   bash product/tools/lint-hook-timing.sh [N=40 largest files | all] [BAR seconds=2]
# Prints one line per file (seconds, lines, path), then "lint-hook timing: max X s over N files, bar B s: PASS|FAIL".
# Exit 0 PASS, 1 FAIL, 2 cannot run (no eslint).
set -u
ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"
S="$ROOT/ai-workers/problem-1-pathway-setup-and-form-filling/prototype/studio"
N="${1:-40}"; BAR="${2:-2}"
ESLINT="$S/node_modules/.bin/eslint"
[ -x "$ESLINT" ] || { echo "lint-hook timing: no eslint under $S/node_modules (run npm ci there); nothing was timed"; exit 2; }
cd "$S" || exit 2
list=$(find . \( -path ./node_modules -o -path ./evidence -o -name dist \) -prune -o -type f \
  \( -name '*.ts' -o -name '*.tsx' -o -name '*.js' -o -name '*.mjs' -o -name '*.cjs' \) ! -name '*.d.ts' -printf '%s %P\n' \
  | sort -rn | awk '{print $2}')
[ "$N" = all ] || list=$(printf '%s\n' "$list" | head -n "$N")
max=0; n=0; worst=""
while IFS= read -r rel; do
  [ -n "$rel" ] || continue
  t0=$(date +%s%N)
  "$ESLINT" --config eslint.hook.config.js --pass-on-unpruned-suppressions --format stylish -- "$rel" >/dev/null 2>&1
  t=$(python3 -c "print(round(($(date +%s%N)-$t0)/1e9,2))")
  printf '%6s s %6s lines  %s\n' "$t" "$(wc -l < "$rel")" "$rel"
  n=$((n + 1))
  if python3 -c "import sys; sys.exit(0 if $t > $max else 1)"; then max=$t; worst=$rel; fi
done <<< "$list"
verdict=PASS; python3 -c "import sys; sys.exit(0 if $max < $BAR else 1)" || verdict=FAIL
echo "lint-hook timing: max $max s ($worst) over $n files, bar $BAR s: $verdict"
[ "$verdict" = PASS ]
