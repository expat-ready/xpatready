#!/usr/bin/env bash
# B193 part 2 (f), P-302: ist-time-guard.py refuses an edit of STATE.md or DECISIONS.md that writes a time ahead of
# now in IST, and passes the true time, past times, plans (due, by, next …), text already in the file and other files.
# The clock is fixed at 16 Nov 2026 01:02 IST. US$0, no network.
#   bash product/tools/check-ist-time-guard.sh
set -u
. "$(dirname "$0")/guard-test-lib.sh"
command -v jq >/dev/null || { echo "jq is missing; nothing was checked"; exit 2; }
T=$(mktemp -d "${TMPDIR:-/tmp}/ist.XXXXXXXX"); trap 'rm -rf "$T"' EXIT
NOW=1794771120   # 2026-11-16 01:02 IST
G="$TOOLS/ist-time-guard.py"; S="$T/$PRODREL/STATE.md"; D="$T/$PRODREL/DECISIONS.md"; mkdir -p "$(dirname "$S")"
printf '# State\nupdated: 2026-11-16 00:5x IST by Lead 61\n' > "$S"
edit() {  # $1 file, $2 old, $3 new → allow | deny
  local out; out=$(jq -n --arg f "$1" --arg o "$2" --arg n "$3" '{tool_name:"Edit", tool_input:{file_path:$f, old_string:$o, new_string:$n}}' | NOW=$NOW python3 -I "$G")
  if printf '%s' "$out" | jq -e '.hookSpecificOutput.permissionDecision == "deny"' >/dev/null 2>&1; then echo deny; else echo allow; fi; }
u='updated: 2026-11-16 00:5x IST by Lead 61'
for n in 'updated: 2026-11-16 01:3x IST by Lead 61' 'updated: 16 Nov 02:10 IST by Lead 61' '(founder ~01:1x IST, typed to Lead 61)' \
         'took over 23:40 IST 16 Nov' '| P-623 | 17 Nov | **WIP limit** |' 'merged at 05:00 IST'; do
  r=$(edit "$S" "$u" "$n"); ok "a time ahead of now is refused: $n" "$([ "$r" = deny ] && echo 1)" "got $r"; done
for n in 'updated: 2026-11-16 01:0x IST by Lead 61' 'updated: 16 Nov 00:58 IST' '(founder 23:5x IST, last night)' 'took over 20:12 IST 15 Nov' \
         '| P-623 | 16 Nov | **WIP limit** |' 'next check 01:3x IST; weekly resets 17 Nov 10:29 IST' 'target all 101 by 29 Nov' 'due 02:00 IST' 'qa verdicts due by 18 Nov 12:00'; do
  r=$(edit "$S" "$u" "$n"); ok "passes: $n" "$([ "$r" = allow ] && echo 1)" "got $r"; done
r=$(edit "$D" "x" "| P-500 | 12 Nov | rule (founder 14:0x IST) |"); ok "a DECISIONS row's bare time is on the row's date (12 Nov 14:0x is past)" "$([ "$r" = allow ] && echo 1)" "got $r"
r=$(edit "$D" "x" "| P-623 | 16 Nov | rule (founder 03:1x IST) |"); ok "... and today's row with a later time is refused" "$([ "$r" = deny ] && echo 1)" "got $r"
r=$(edit "$S" "a 05:00 IST b" "a 05:00 IST b, c"); ok "a time the edit only keeps is not re-judged" "$([ "$r" = allow ] && echo 1)" "got $r"
r=$(edit "$T/$PRODREL/BACKLOG.md" "x" "merged at 05:00 IST"); ok "other files are not guarded" "$([ "$r" = allow ] && echo 1)" "got $r"
out=$(jq -n --arg f "$S" '{tool_name:"Write", tool_input:{file_path:$f, content:"# State\nupdated: 2026-11-16 00:5x IST by Lead 61\nhand-over 16 Nov 04:00 IST\n"}}' | NOW=$NOW python3 -I "$G")
ok "Write: a new line with a time ahead is refused, the kept line is not" "$(echo "$out" | jq -e '.hookSpecificOutput.permissionDecisionReason | test("16 Nov 04:00.*178 min ahead") and (test("00:5x") | not)' >/dev/null && echo 1)" "$out"
out=$(jq -n --arg f "$S" '{tool_name:"MultiEdit", tool_input:{file_path:$f, edits:[{old_string:"a", new_string:"b 01:00 IST"}, {old_string:"c", new_string:"d 16 Nov 01:4x"}]}}' | NOW=$NOW python3 -I "$G")
ok "MultiEdit: each edit is read" "$(echo "$out" | jq -e '.hookSpecificOutput.permissionDecisionReason | test("16 Nov 01:4x")' >/dev/null && echo 1)" "$out"
finish
