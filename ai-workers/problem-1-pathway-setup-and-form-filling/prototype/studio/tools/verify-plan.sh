#!/usr/bin/env bash
# The verify skill's plan (OS-72, design/self-checking-builders-2026-11-25.md): which capabilities a builder's change
# touches, so verify walks a few of them before the commit, as CI's gate B would. The change is everything not on
# origin/main yet: commits since the merge base, staged and unstaged edits, new files. Packs come from the graph gate B
# uses (product/tools/select-suites.mjs --packs, "<file>\t<chain>"); a pack acceptance/<C>[-part].test.ts names C<n.n>.
# Nearest first (a pack the change is, then the fewest "←" steps), at most --max (default 4); the rest are named as left
# to CI's gate B (#3715 review: one engine edit reached 44 rows). Prints "verify: <why>" lines, then:
#   CAPS <C> ...        (empty: nothing to walk: records, notes, tests only, or no pack reads the change)
#   LEFT <C> ...        rows CI runs that verify does not
#   RUN <command>       gate B on the lane's own port, each row on its scoring data as CI scores it (works-set.mjs's
#                       baseScoring: qa's REGRESSION-DATA, the row's evidence, the checkpoint for M3, else the six)
#   ALSO <file>         the nearest touched browser tests (at most 2)
# Exit 0 planned, 2 when the plan cannot be made (never an empty plan by mistake).
#   bash prototype/studio/tools/verify-plan.sh --lane screens|forms|runtime|evidence [--max <n>]
# Test: product/tools/check-verify-plan.sh.
set -o pipefail   # no -u: macOS bash 3.2 calls an empty array unbound
STUDIO="$(cd "$(dirname "$0")/.." && pwd -P)"; P="$(cd "$STUDIO/../.." && pwd -P)"; ROOT="$(git -C "$STUDIO" rev-parse --show-toplevel)" || exit 2
SEL="${VERIFY_SELECT_SUITES:-$P/product/tools/select-suites.mjs}"; WS="${VERIFY_WORKS_SET:-$STUDIO/tools/works-set.mjs}"; KIND="${VERIFY_CHANGE_KIND:-$P/product/tools/change-kind.sh}"
LANE=""; MAX=4
while [ $# -gt 0 ]; do case "$1" in --lane) LANE="${2:-}"; shift 2;; --max) MAX="${2:-}"; shift 2;; *) echo "verify: usage: verify-plan.sh --lane <lane> [--max <n>]"; exit 2;; esac; done
# each lane's own test-copy ports (WAY-OF-WORKING: runtime 4430-39, screens 4440-49, forms 4450-59); evidence has none there
case "$LANE" in runtime) PORT=4438;; screens) PORT=4448;; forms) PORT=4458;; evidence) PORT=4468;;
  *) echo "verify: --lane must be screens, forms, runtime or evidence (lane.sh whoami)"; exit 2;; esac
[[ "$MAX" =~ ^[1-9]$ ]] || { echo "verify: --max must be 1 to 9"; exit 2; }
cd "$ROOT" || exit 2
base=$(git merge-base HEAD origin/main 2>/dev/null) || { echo "verify: no origin/main to compare with (git fetch origin main)"; exit 2; }
files=$( { git -c core.quotePath=false diff --no-renames --name-only "$base" && git -c core.quotePath=false ls-files --others --exclude-standard; } 2>/dev/null | sort -u) \
  || { echo "verify: the changed files could not be listed"; exit 2; }
n=$(printf '%s\n' "$files" | grep -c .)
[ "$n" -gt 0 ] || { echo "verify: nothing changed since origin/main"; echo "CAPS"; exit 0; }
kind=$(printf '%s\n' "$files" | bash "$KIND" --files 2>/dev/null) || { echo "verify: change-kind.sh failed: the plan cannot be made"; exit 2; }
case "$kind" in notes|records) echo "verify: $kind only ($n file(s)): nothing to walk"; echo "CAPS"; exit 0;; esac
SR="${STUDIO#$ROOT/}"
if ! printf '%s\n' "$files" | grep -vqE "^$SR/(tests|acceptance)/"; then echo "verify: tests only ($n file(s)): nothing to walk; CI runs them"; echo "CAPS"; exit 0; fi
packs=$(printf '%s\n' "$files" | node "$SEL" --packs 2>/dev/null) || { echo "verify: select-suites.mjs --packs failed: the plan cannot be made"; exit 2; }
# "<steps>\t<file>": the pack itself changed is 0 steps, else the number of "←" in its chain
ranked=$(printf '%s\n' "$packs" | grep . | awk -F'\t' '{ s = gsub(/←/, "←", $2); print s "\t" $1 }' | sort -t$'\t' -k1,1n -k2,2)
caps=(); left=(); seen=" "
while IFS=$'\t' read -r s f; do
  [ -n "$f" ] || continue
  case "$f" in "$SR/acceptance/"*.test.ts) ;; *) continue;; esac
  b=${f##*/}; c=$(printf '%s' "$b" | sed -nE 's/^(C[0-9]+(\.[0-9]+)+)(-[^/]*)?\.test\.ts$/\1/p')
  if [ -z "$c" ]; then echo "verify: $b is not a C<n.n> pack, so verify cannot run it; CI's gate B decides"; continue; fi
  [ -e "$ROOT/$f" ] || { echo "verify: $b was deleted; CI's gate B names it"; continue; }
  case "$seen" in *" $c "*) continue;; esac; seen="$seen$c "
  if [ "${#caps[@]}" -lt "$MAX" ]; then caps+=("$c"); else left+=("$c"); fi
done <<< "$ranked"
also=$(printf '%s\n' "$ranked" | cut -f2 | grep -E "^$SR/tests/.*(_browser\.ts|\.spec\.ts)$" | head -2 || true)
if [ "${#caps[@]}" = 0 ]; then echo "verify: $n changed file(s) ($kind); no C<n.n> pack reads them"; echo "CAPS"
else
  echo "verify: $n changed file(s) ($kind); the nearest ${#caps[@]} capabilities' packs, at most $MAX"
  echo "CAPS ${caps[*]}"; [ "${#left[@]}" -gt 0 ] && echo "LEFT ${left[*]}"
  dof=$(node --input-type=module -e 'const m = await import(process.argv[2]); const b = m.baseScoring();
console.log(process.argv.slice(3).map((c) => c + "=" + b.dataOf(c)).join(" "))' - "$WS" "${caps[@]}" 2>/dev/null) \
    && [[ "$dof" =~ ^C[0-9.]+=(six|checkpoint)( C[0-9.]+=(six|checkpoint))*$ ]] || { echo "verify: the rows' scoring data could not be read (works-set.mjs): the plan cannot be made"; exit 2; }
  echo "RUN cd '$STUDIO' && GATE_B_NO_DIFF=1 GATE_B_JOBS=1 GATE_B_PORT=$PORT GATE_B_NAME=verify_$LANE GATE_B_DATA_OF='$dof' node tools/gate-b.mjs --title 'verify: ${caps[*]}' --kind code"
fi
printf '%s\n' "$also" | grep . | sed 's/^/ALSO /'
exit 0
