#!/bin/bash
# Test for plan-watch.py (P-690): the real plan passes; a copy with one row deleted fails and names it.
H="$(cd "$(dirname "$0")" && pwd)"; P="$H/../design/full-power-plan-2026-11-17.md"
t=$(mktemp -d "${TMPDIR:-/tmp}/plan-watch.XXXXXX"); trap 'rm -rf "$t"' EXIT
fail=0; ok() { if [ "$2" = 1 ]; then echo "PASS  $1"; else echo "FAIL  $1"; fail=1; fi; }
python3 "$H/plan-watch.py" "$P" >/dev/null; ok "the real plan has every item" "$([ $? = 0 ] && echo 1)"
grep -v '^| 37 |' "$P" > "$t/p.md"; out=$(python3 "$H/plan-watch.py" "$t/p.md"); r=$?
ok "a deleted item fails and is named" "$([ $r = 1 ] && echo "$out" | grep -q 'missing.*37' && echo 1)"
s=$(python3 "$H/plan-watch.py" --summary "$P"); ok "the summary line counts the statuses" "$(echo "$s" | grep -qE '^plan: Done [0-9]+ .*of [0-9]+' && echo 1)"
exit $fail
