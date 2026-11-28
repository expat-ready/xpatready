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
SET="$TOOLS/../../../../.claude/settings.json"
ok "settings.json runs it on every Bash call (no if: filter)" "$(jq -e '[.hooks.PreToolUse[] | select(.matcher == "Bash") | .hooks[] | select(.command | contains("shell-trap-guard.py")) | has("if")] == [false]' "$SET" >/dev/null && echo 1)"
# The command as settings.json runs it (review I1): it denies through the real file, and with the file gone it stays
# silent and exits 0, never 2 (exit 2 from a PreToolUse hook blocks every Bash call).
CMD=$(jq -r '.hooks.PreToolUse[] | select(.matcher == "Bash") | .hooks[] | select(.command | contains("shell-trap-guard.py")) | .command' "$SET")
ROOT="$(cd "$TOOLS/../../../.." && pwd)"
out=$(jq -n --arg c 'pkill -f x' '{tool_input:{command:$c},cwd:"/nowhere"}' | MAIN_COPY_LANE=lead CLAUDE_PROJECT_DIR="$ROOT" bash -c "$CMD"); r=$?
ok "the settings.json command denies through the real file" "$([ $r = 0 ] && jq -e '.hookSpecificOutput.permissionDecision == "deny"' <<<"$out" >/dev/null && echo 1)" "exit $r: $out"
E=$(mktemp -d "${TMPDIR:-/tmp}/hk.XXXXXXXX")
out=$(printf '{}' | CLAUDE_PROJECT_DIR="$E" bash -c "$CMD" 2>&1); r=$?; rm -rf "${E:?}"
ok "with the guard's file missing, the settings.json command is silent and exits 0 (never 2)" "$([ $r = 0 ] && [ -z "$out" ] && echo 1)" "exit $r: $out"
out=$(python3 -I "$TOOLS/shell-trap-guard.py" --bad </dev/null 2>/dev/null); r=$?
ok "a usage error exits 1, never 2" "$([ $r = 1 ] && echo 1)" "exit $r"
for j in '[1]' '"x"' '{"tool_input":"s"}'; do out=$(printf '%s' "$j" | python3 -I "$TOOLS/shell-trap-guard.py" --hook 2>&1); r=$?
  ok "JSON that is not an event ($j): no output, exit 0" "$([ $r = 0 ] && [ -z "$out" ] && echo 1)" "exit $r: $out"; done
finish
