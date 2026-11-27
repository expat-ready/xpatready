#!/usr/bin/env bash
# Hooks fail closed (bundle A1, LR-046): every guard hook in .claude/settings.json runs through hook-fail-closed.sh, and
# a guard that errors, times out, prints junk or cannot read its input blocks (exit 2), never allows. For each guard
# named in settings.json the failure is planted in a throwaway copy (the guard swapped for a broken or hanging one) and
# the block is seen; the real guard is also fed unreadable input. US$0, no network.
#   bash product/tools/check-hook-fail-closed.sh
set -u
. "$(dirname "$0")/guard-test-lib.sh"
command -v jq >/dev/null || { echo "jq is missing; nothing was checked"; exit 2; }
S="$TOOLS/../../../../.claude/settings.json"; W="$TOOLS/hook-fail-closed.sh"
T=$(mktemp -d "${TMPDIR:-/tmp}/hfc.XXXXXXXX"); trap 'rm -rf "$T"' EXIT
IN='{"hook_event_name":"PreToolUse","tool_name":"Bash","tool_input":{"command":"ls"},"cwd":"/nonexistent"}'
run() {  # $1 tools dir, $2 seconds, $3 guard, stdin → prints "exit <n>" and keeps stderr in $T/err
  bash "$1/hook-fail-closed.sh" "$2" "$3" 2>"$T/err"; echo "exit $?"; }
plant() {  # $1 name, $2 guard file name, $3 body → a copy of the wrapper next to a planted guard
  mkdir -p "$T/$1"; cp "$W" "$T/$1/"; printf '%s\n' "$3" > "$T/$1/$2"; }

# The settings: every PreToolUse and Stop command hook is wrapped; the wrapper's limit is under the hook's timeout.
cmds=$(jq -r '.hooks.PreToolUse[], .hooks.Stop[] | .hooks[] | select(.type == "command") | "\(.timeout // 600) \(.command)"' "$S")
bad=$(printf '%s\n' "$cmds" | grep -v 'hook-fail-closed\.sh [0-9]* ' | head -3)
ok "every PreToolUse and Stop guard runs through hook-fail-closed.sh" "$([ -n "$cmds" ] && [ -z "$bad" ] && echo 1)" "$bad"
late=$(printf '%s\n' "$cmds" | awk '{for (i = 2; i <= NF; i++) if ($i ~ /hook-fail-closed\.sh$/) {if (5 + $(i + 1) + 1 >= $1 + 0) print; break}}')
ok "5 s input + each wrapper limit + 1 s kill is under its hook timeout, so the wrapper fires first" "$([ -z "$late" ] && echo 1)" "$late"
stops=$(jq -r '[.hooks.Stop[].hooks[] | select(.type == "command") | .timeout // 600] | map(select(. < 60)) | length' "$S")
ok "Stop hook timeouts are 60 s or more (LR-046)" "$([ "$stops" = 0 ] && echo 1)" "$stops under 60"
pre=$(jq -r '[.hooks.PreToolUse[].hooks[] | select(.type == "command") | select(.onFailure != "block")] | length' "$S")
ok "every PreToolUse guard also carries onFailure: block" "$([ "$pre" = 0 ] && echo 1)" "$pre without"

# The wrapper alone: each planted failure blocks; a guard's own allow and deny pass through.
plant pass g.sh 'cat >/dev/null; exit 0'
r=$(printf '%s' "$IN" | run "$T/pass" 5 g.sh); ok "a guard that allows still allows (exit 0)" "$([ "$r" = "exit 0" ] && echo 1)" "$r"
plant deny g.sh 'cat >/dev/null; echo "{\"hookSpecificOutput\":{\"permissionDecision\":\"deny\"}}"'
out=$(printf '%s' "$IN" | bash "$T/deny/hook-fail-closed.sh" 5 g.sh 2>/dev/null)
ok "a guard's deny JSON passes through" "$(printf '%s' "$out" | jq -e '.hookSpecificOutput.permissionDecision == "deny"' >/dev/null && echo 1)" "$out"
plant two g.sh 'cat >/dev/null; echo no >&2; exit 2'
r=$(printf '%s' "$IN" | run "$T/two" 5 g.sh); ok "a guard's exit 2 passes through" "$([ "$r" = "exit 2" ] && grep -q no "$T/err" && echo 1)" "$r"
plant fail1 g.sh 'cat >/dev/null; exit 1'
r=$(printf '%s' "$IN" | run "$T/fail1" 5 g.sh); ok "a guard that errors (exit 1) blocks" "$([ "$r" = "exit 2" ] && grep -q 'failed with exit 1' "$T/err" && echo 1)" "$r $(cat "$T/err")"
plant syn g.sh 'if then fi'
r=$(printf '%s' "$IN" | run "$T/syn" 5 g.sh); ok "a guard with a syntax error blocks" "$([ "$r" = "exit 2" ] && echo 1)" "$r"
plant hang g.sh 'sleep 30'
t0=$(date +%s); r=$(printf '%s' "$IN" | run "$T/hang" 2 g.sh); t1=$(date +%s)
ok "a guard that hangs past its limit blocks, within the limit" "$([ "$r" = "exit 2" ] && grep -q 'ran over 2 s' "$T/err" && [ $((t1 - t0)) -le 5 ] && echo 1)" "$r in $((t1 - t0)) s"
plant junk g.sh 'cat >/dev/null; echo not json'
r=$(printf '%s' "$IN" | run "$T/junk" 5 g.sh); ok "a guard that prints junk blocks" "$([ "$r" = "exit 2" ] && grep -q 'not one JSON object' "$T/err" && echo 1)" "$r"
r=$(printf '%s' "$IN" | run "$T/pass" 5 missing.sh); ok "a missing guard blocks" "$([ "$r" = "exit 2" ] && grep -q 'missing.sh is missing' "$T/err" && echo 1)" "$r"
r=$(printf '%s' "$IN" | run "$T/pass" 5 ../g.sh); ok "a guard outside the tools folder blocks" "$([ "$r" = "exit 2" ] && echo 1)" "$r"
r=$(printf '%s' "$IN" | run "$T/pass" x g.sh); ok "a wrapper call without a limit blocks" "$([ "$r" = "exit 2" ] && echo 1)" "$r"
r=$(printf '' | run "$T/pass" 5 g.sh); ok "empty input blocks" "$([ "$r" = "exit 2" ] && grep -q 'not one JSON object' "$T/err" && echo 1)" "$r"
r=$(printf '{"cut' | run "$T/pass" 5 g.sh); ok "unreadable input blocks" "$([ "$r" = "exit 2" ] && echo 1)" "$r"
r=$(printf '[1] {"a":1}' | run "$T/pass" 5 g.sh); ok "input of two JSON values blocks, even when the last is an object" "$([ "$r" = "exit 2" ] && echo 1)" "$r"
plant twoout g.sh 'cat >/dev/null; echo "{}"; echo "{\"decision\":\"block\"}"'
r=$(printf '%s' "$IN" | run "$T/twoout" 5 g.sh); ok "a guard that prints two JSON documents blocks" "$([ "$r" = "exit 2" ] && echo 1)" "$r"
plant nul g.sh 'cat >/dev/null; echo null'
r=$(printf '%s' "$IN" | run "$T/nul" 5 g.sh); ok "a guard that prints null blocks" "$([ "$r" = "exit 2" ] && echo 1)" "$r"
plant late g.sh 'cat >/dev/null; sleep 30 & echo $! > "$HFC_PIDF"; exit 0'
out=$(printf '%s' "$IN" | HFC_PIDF="$T/late.pid" bash "$T/late/hook-fail-closed.sh" 5 g.sh 2>/dev/null; echo "exit $?"); sleep 0.5
ok "a child a guard leaves behind is stopped once the guard answers" "$([ "$out" = "exit 0" ] && [ -s "$T/late.pid" ] && ! ps -o stat= -p "$(cat "$T/late.pid")" 2>/dev/null | grep -qv Z && echo 1)" "$out"
r=$( (sleep 7) | run "$T/pass" 5 g.sh); ok "no input within 5 s blocks" "$([ "$r" = "exit 2" ] && grep -q 'within 5 s' "$T/err" && echo 1)" "$r"
mkdir -p "$T/nojq"; for b in bash cat head tr mktemp rm dirname; do ln -s "$(command -v $b)" "$T/nojq/$b"; done
r=$(printf '%s' "$IN" | PATH="$T/nojq" run "$T/pass" 5 g.sh); ok "no jq blocks" "$([ "$r" = "exit 2" ] && grep -q 'jq is missing' "$T/err" && echo 1)" "$r"

# Each guard named in settings.json: the real one refuses unreadable input; a planted error and a planted hang block.
for g in $(printf '%s\n' "$cmds" | grep -oE 'hook-fail-closed\.sh [0-9]+ [^ ]+' | awk '{print $3}' | sort -u); do
  [ -f "$TOOLS/$g" ]; ok "$g exists in tools" "$([ $? = 0 ] && echo 1)"
  r=$(printf 'not json' | run "$TOOLS" 12 "$g"); ok "$g: unreadable input blocks" "$([ "$r" = "exit 2" ] && echo 1)" "$r"
  case "$g" in *.py) e='raise SystemExit(1)'; h='import time; time.sleep(30)';; *) e='exit 1'; h='sleep 30';; esac
  plant "e-$g" "$g" "$e"; r=$(printf '%s' "$IN" | run "$T/e-$g" 12 "$g"); ok "$g: a planted error blocks" "$([ "$r" = "exit 2" ] && echo 1)" "$r"
  plant "h-$g" "$g" "$h"; r=$(printf '%s' "$IN" | run "$T/h-$g" 1 "$g"); ok "$g: a planted hang blocks" "$([ "$r" = "exit 2" ] && echo 1)" "$r"
done
grep -q 'exit 1; }   # fail closed' "$TOOLS/stop-check.sh"; ok "stop-check.sh fails (not passes) when it cannot enter the copy" "$([ $? = 0 ] && echo 1)"
finish
