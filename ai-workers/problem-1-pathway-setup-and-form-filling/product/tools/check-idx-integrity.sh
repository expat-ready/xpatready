#!/usr/bin/env bash
# E14 (P-772; IDX-1, -2, -4, -5): check-docs.sh fails an IDX row (in RULES.md or rules/*.md) that lists a P-ID with no
# row in DECISIONS.md or decisions/*.md, ranges "P-a to P-b" included. Fixture pages in a throwaway copy, US$0, no network.
#   bash product/tools/check-idx-integrity.sh
set -u
. "$(dirname "$0")/guard-test-lib.sh"
T=$(mktemp -d "${TMPDIR:-/tmp}/guard.XXXXXXXX") && [ -d "$T" ] || { echo "no temp dir: nothing was checked"; exit 2; }; trap 'rm -rf "$T"' EXIT
docs_copy "$T/c"; P="$T/c/$PRODREL"; CD="$P/tools/check-docs.sh"; mkdir -p "$P/decisions" "$P/rules"
run() { out=$(bash "$CD" 2>/dev/null); r=$?; }
{ printf '| # | Date | Decision |\n|---|---|---|\n'; for i in 3 4 5 6 9; do printf '| P-%s | 15 Nov | row |\n' "$i"; done; printf '| ~~P-7~~ | 15 Nov | ~~withdrawn~~ |\n'; } > "$P/DECISIONS.md"
printf '| P-1 | 1 Oct | an old row in a side file |\n' > "$P/decisions/P-01-old.md"
page() { { echo '# Rule register (as of **P-9**, test)'; echo; echo '| ID | Rule | Enforced by | As of |'; echo '|---|---|---|---|'; cat; } > "$P/RULES.md"; }
printf '| IDX-1 | Rows P-1, P-3 to P-6, P-7 and P-9 stand. | prose | 15 Nov |\n' | page; run
ok "an index row whose IDs are all DECISIONS rows (side file, range, struck-through row) passes" "$([ $r = 0 ] && echo 1)" "exit $r: $out"
printf '| IDX-1 | Rows P-3, P-8 and P-12 stand. | prose | 15 Nov |\n' | page; run
ok "an ID with no DECISIONS row fails, naming the row and each missing ID" "$([ $r = 1 ] && echo "$out" | grep -q 'INDEX: RULES.md line 5 (IDX-1) lists P-8, P-12, not a row' && echo 1)" "exit $r: $out"
printf '| IDX-1 | Rows P-3 to P-9 stand. | prose | 15 Nov |\n' | page; run
ok "a range is read number by number: the gap P-8 fails" "$([ $r = 1 ] && echo "$out" | grep -q 'lists P-8, not a row' && echo 1)" "exit $r: $out"
printf '| IDX-1 | Rows P-9 to P-3 stand. | prose | 15 Nov |\n| IDX-2 | Rows P-3 to P-900 stand. | prose | 15 Nov |\n' | page; run
ok "a range that runs backwards or spans over 200 rows fails" "$([ $r = 1 ] && echo "$out" | grep -q 'IDX-1) has the range P-9 to P-3' && echo "$out" | grep -q 'IDX-2) has the range P-3 to P-900' && echo 1)" "exit $r: $out"
printf '| IDX-1 | Rows P-3 stand. | prose | 15 Nov |\n' | page; printf '# Moved\n\n| IDX-1 | Full list: P-4, P-44. | prose | 15 Nov |\n' > "$P/rules/moved.md"; run
ok "an IDX row in rules/*.md (the moved full list) is checked too" "$([ $r = 1 ] && echo "$out" | grep -q 'INDEX: rules/moved.md line 3 (IDX-1) lists P-44' && echo 1)" "exit $r: $out"
rm -f "$P/rules/moved.md"; printf '| IDX-1 | Rows P-4b and P-5 stand; F-12Nov and QA-221 are not P-IDs. | prose | 15 Nov |\n' | page; run
ok "a lettered ID is found by its number's row; other ID forms are not read" "$([ $r = 0 ] && echo 1)" "exit $r: $out"
printf '| P-30 | A rule naming P-99. | prose | 15 Nov |\n| IDX-1 | Rows P-3 stand. | prose | 15 Nov |\n' | page; run
ok "only IDX rows are read: a rule row naming an unknown ID is not an index" "$([ $r = 0 ] && echo 1)" "exit $r: $out"
finish
