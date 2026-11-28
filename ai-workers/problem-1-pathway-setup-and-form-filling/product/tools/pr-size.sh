#!/usr/bin/env bash
# PRs stay under 800 changed lines, tests included (P-610 (1), row G-4 (6): 15 of 25 PRs over 800 took 4.3 h median to
# Approve against 0.7 h for 400-800). Changed lines = additions + deletions as GitHub counts them. Over the limit passes when:
#   * P-857 (5): the PR carries the label "size: exception" (fourth argument "yes", read from GitHub at the run) and its
#     body (stdin) has a line "Size exception: <reason>" with a reason in words; no DECISIONS row is needed; or
#   * (the old form, kept) the body has a line "Size exception: P-NNN" naming a row of DECISIONS.md about size (it says
#     "800" or "size exception"); this passes with or without the label.
# A records-only PR (third argument "yes", from tools/records-only.sh is-records) passes at any size (P-686): word-for-word
# records, read by the Lead (P-385), not code to review.
# Usage: pr-size.sh <additions> <deletions> [records-only yes|no] [label yes|no] < body
# Env: PR_SIZE_LIMIT (800), DECISIONS. Test: check-g4-rules.sh.
set -u
DEC="${DECISIONS:-$(cd "$(dirname "$0")/.." && pwd)/DECISIONS.md}"; limit=${PR_SIZE_LIMIT:-800}
n=$(( ${1:?additions} + ${2:?deletions} ))
[ "${3:-no}" = yes ] && { echo "size: $n changed lines, records only (P-686)"; exit 0; }
[ "$n" -le "$limit" ] && { echo "size: $n changed lines (limit $limit)"; exit 0; }
body=$(cat)
ex=$(printf '%s\n' "$body" | grep -oE 'Size exception:[[:space:]]*P-[0-9]+' | head -1 | grep -oE 'P-[0-9]+')
# Rows moved out of DECISIONS.md word for word (decisions/DECISIONS-*.md, lab clean-up 27 Nov) still count.
[ -n "$ex" ] && cat "$DEC" "$(dirname "$DEC")"/decisions/DECISIONS-*.md 2>/dev/null | grep -E "^\| *$ex *\|" | grep -qiE '800|size exception' && { echo "size: $n changed lines, over $limit, recorded exception $ex"; exit 0; }
# P-857 (5): the label form. The reason is the rest of the line at its start and must hold a letter or digit.
reason=$(printf '%s\n' "$body" | tr -d '\r' | sed -nE 's/^[[:space:]]*Size exception:[[:space:]]*(.*[[:alnum:]].*)$/\1/p' | head -1)
if [ "${4:-no}" = yes ]; then
  [ -n "$reason" ] && { echo "size: $n changed lines, over $limit, label \"size: exception\": $reason"; exit 0; }
  echo "REFUSED: $n changed lines, over $limit: the PR has the label \"size: exception\" but the body has no line \"Size exception: <reason>\" giving the reason (P-857 (5))."
  exit 1
fi
echo "REFUSED: $n changed lines, over $limit (P-610 (1)): split the row into parts, or add the label \"size: exception\" and a line \"Size exception: <reason>\" (P-857 (5); a label alone starts no run: add it first, then edit the body), or a line \"Size exception: P-NNN\" naming a size row of DECISIONS.md${ex:+ ($ex is not a size row of DECISIONS.md)}."
exit 1
