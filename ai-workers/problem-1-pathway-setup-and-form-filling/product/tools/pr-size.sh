#!/usr/bin/env bash
# PRs stay under 800 changed lines, tests included (P-610 (1), row G-4 (6): 15 of 25 PRs over 800 took 4.3 h median to
# Approve against 0.7 h for 400-800). Changed lines = additions + deletions as GitHub counts them. Over the limit passes
# only when the PR body (stdin) has a line "Size exception: P-NNN" naming a row of DECISIONS.md about size (it says "800" or "size exception").
# A records-only PR (third argument "yes", from tools/records-only.sh is-records) passes at any size (P-686): word-for-word
# records, read by the Lead (P-385), not code to review.
# Usage: pr-size.sh <additions> <deletions> [records-only yes|no] < body     Env: PR_SIZE_LIMIT (800), DECISIONS. Test: check-g4-rules.sh.
set -u
DEC="${DECISIONS:-$(cd "$(dirname "$0")/.." && pwd)/DECISIONS.md}"; limit=${PR_SIZE_LIMIT:-800}
n=$(( ${1:?additions} + ${2:?deletions} ))
[ "${3:-no}" = yes ] && { echo "size: $n changed lines, records only (P-686)"; exit 0; }
[ "$n" -le "$limit" ] && { echo "size: $n changed lines (limit $limit)"; exit 0; }
ex=$(grep -oE 'Size exception:[[:space:]]*P-[0-9]+' | head -1 | grep -oE 'P-[0-9]+')
# Rows moved out of DECISIONS.md word for word (decisions/DECISIONS-*.md, lab clean-up 27 Nov) still count.
[ -n "$ex" ] && cat "$DEC" "$(dirname "$DEC")"/decisions/DECISIONS-*.md 2>/dev/null | grep -E "^\| *$ex *\|" | grep -qiE '800|size exception' && { echo "size: $n changed lines, over $limit, recorded exception $ex"; exit 0; }
echo "REFUSED: $n changed lines, over $limit (P-610 (1)): split the row into parts, or add a line \"Size exception: P-NNN\" naming a DECISIONS row${ex:+ ($ex is not a size row of DECISIONS.md)}."
exit 1
