#!/usr/bin/env bash
# PRs stay under 800 changed lines, tests included (P-610 (1), row G-4 (6): 15 of 25 PRs over 800 took 4.3 h median to
# Approve against 0.7 h for 400-800). Changed lines = additions + deletions as GitHub counts them. Over the limit passes
# only when the PR body (stdin) has a line "Size exception: P-NNN" naming a row of DECISIONS.md about size (it says "800" or "size exception").
# Usage: pr-size.sh <additions> <deletions> < body     Env: PR_SIZE_LIMIT (800), DECISIONS. Test: check-g4-rules.sh.
set -u
DEC="${DECISIONS:-$(cd "$(dirname "$0")/.." && pwd)/DECISIONS.md}"; limit=${PR_SIZE_LIMIT:-800}
n=$(( ${1:?additions} + ${2:?deletions} ))
[ "$n" -le "$limit" ] && { echo "size: $n changed lines (limit $limit)"; exit 0; }
ex=$(grep -oE 'Size exception:[[:space:]]*P-[0-9]+' | head -1 | grep -oE 'P-[0-9]+')
[ -n "$ex" ] && grep -E "^\| *$ex *\|" "$DEC" | grep -qiE '800|size exception' && { echo "size: $n changed lines, over $limit, recorded exception $ex"; exit 0; }
echo "REFUSED: $n changed lines, over $limit (P-610 (1)): split the row into parts, or add a line \"Size exception: P-NNN\" naming a DECISIONS row${ex:+ ($ex is not a size row of DECISIONS.md)}."
exit 1
