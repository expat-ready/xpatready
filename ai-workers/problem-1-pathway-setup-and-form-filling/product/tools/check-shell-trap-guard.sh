#!/usr/bin/env bash
# LR-155 slice (audit top 15 no. 10): shell-trap-guard.py refuses `pkill -f` and an unbraced `$VAR:refs`-style refspec
# before they run, and lets everything else through. The hook input as Claude Code sends it. US$0, no network.
#   bash product/tools/check-shell-trap-guard.sh
set -u
. "$(dirname "$0")/guard-test-lib.sh"
command -v jq >/dev/null || { echo "jq is missing; nothing was checked"; exit 2; }
G="$TOOLS/shell-trap-guard.py"
run() { jq -n --arg c "$1" '{hook_event_name:"PreToolUse",tool_name:"Bash",tool_input:{command:$c}}' | python3 -I "$G" --hook; }
rule() { local o; o=$(run "$1"); [ -z "$o" ] && { echo allowed; return; }; jq -r '.hookSpecificOutput.permissionDecisionReason // "allowed"' <<<"$o" | sed -E 's/^Rule (SHELL-[0-9]):.*/\1/'; }
for c in 'pkill -f "node .*studio"' 'pkill -9 -f vite' 'sudo pkill -fx api' 'cd x && pkill -f web; echo done' 'pkill --full studio' \
         '(pkill -f api)' 'pkill -u me -f api'; do
  r=$(rule "$c"); ok "refused as SHELL-1: $c" "$([ "$r" = SHELL-1 ] && echo 1)" "got $r"; done
for c in 'git push origin "$C:refs/heads/main"' 'git fetch origin $SHA:refs/tmp/x' 'echo $FILE:r' 'cp a $DIR:h'; do
  r=$(rule "$c"); ok "refused as SHELL-2: $c" "$([ "$r" = SHELL-2 ] && echo 1)" "got $r"; done
for c in 'pkill node' 'pkill -9 vite' 'pgrep -f studio' 'git push origin "${C}:refs/heads/main"' 'echo "$A:$B"' \
         'git push -u origin lr-051:claude/x' 'echo $HOME' 'ls -la' 'skill -f x' 'python3 -c "import re"' "echo \$PATH:/usr/bin"; do
  r=$(rule "$c"); ok "allowed: $c" "$([ "$r" = allowed ] && echo 1)" "got $r"; done
out=$(run 'git push origin "$C:refs/heads/main"')
ok "the refusal names the braced form to use instead" "$(jq -r '.hookSpecificOutput.permissionDecisionReason' <<<"$out" | grep -qF '`${C}:refs`' && echo 1)" "$out"
ok "a refusal is a PreToolUse deny with the rule id and the fix (LR-051)" "$(jq -e '.hookSpecificOutput | .hookEventName == "PreToolUse" and .permissionDecision == "deny" and (.permissionDecisionReason | test("^Rule SHELL-1: .*Fix: "))' <<<"$(run 'pkill -f x')" >/dev/null && echo 1)"
out=$(printf 'not json' | python3 -I "$G" --hook); r=$?
ok "input that is not a hook event: no output, exit 0 (never blocks by crashing)" "$([ $r = 0 ] && [ -z "$out" ] && echo 1)" "exit $r: $out"
ok "settings.json runs it on every Bash call (no if: filter)" "$(jq -e '[.hooks.PreToolUse[] | select(.matcher == "Bash") | .hooks[] | select(.command | contains("shell-trap-guard.py --hook")) | has("if")] == [false]' "$TOOLS/../../../../.claude/settings.json" >/dev/null && echo 1)"
finish
