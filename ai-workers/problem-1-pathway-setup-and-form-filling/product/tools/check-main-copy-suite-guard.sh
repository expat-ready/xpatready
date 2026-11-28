#!/usr/bin/env bash
# LR-155 slice (audit top 15 no. 8, F-7Nov): main-copy-suite-guard.py denies running a guard test or the suites in the
# Lead's main copy, and lets everything else through: other commands there, and every command in a lane, qa or cloud copy.
# The hook input as Claude Code sends it; MAIN_COPY_LANE stands in for lane.sh whoami. US$0, no network.
#   bash product/tools/check-main-copy-suite-guard.sh
set -u
. "$(dirname "$0")/guard-test-lib.sh"
command -v jq >/dev/null || { echo "jq is missing; nothing was checked"; exit 2; }
G="$TOOLS/main-copy-suite-guard.py"
run() { jq -n --arg c "$2" '{hook_event_name:"PreToolUse",tool_name:"Bash",tool_input:{command:$c},cwd:"/nowhere"}' | MAIN_COPY_LANE="$1" python3 -I "$G" --hook; }
says() { local o; o=$(run "$1" "$2"); [ -z "$o" ] && { echo allowed; return; }; jq -r '.hookSpecificOutput.permissionDecisionReason' <<<"$o" | sed -E 's/^Rule (F-7Nov):.*/\1/'; }
for c in 'bash product/tools/check-guards.sh' 'bash ai-workers/p/product/tools/check-queue-gate.sh' './product/tools/run-suites.sh 3' \
         'timeout 600 bash tools/check-names-check.sh' 'cd tools && bash check-stop-check.sh' 'git pull; bash tools/check-guards.sh --mutate' \
         'sh check-x.sh' 'bash -x tools/check-x.sh'; do
  r=$(says lead "$c"); ok "the Lead's copy: refused: $c" "$([ "$r" = F-7Nov ] && echo 1)" "got $r"; done
r=$(says lead-stale 'bash tools/check-guards.sh'); ok "a lead-stale copy is the Lead's too: refused" "$([ "$r" = F-7Nov ] && echo 1)" "got $r"
for c in 'cat tools/check-guards.sh' 'git add tools/check-x.sh' 'sed -n 1,9p tools/check-guards.sh' 'grep -n ok tools/check-*.sh' \
         'git diff -- tools/run-suites.sh' 'bash tools/lead-watch.sh 30' 'ls tools'; do
  r=$(says lead "$c"); ok "the Lead's copy: allowed (not a run): $c" "$([ "$r" = allowed ] && echo 1)" "got $r"; done
for l in screens qa runtime unbound; do
  r=$(says "$l" 'bash tools/check-guards.sh'); ok "a $l copy runs suites freely" "$([ "$r" = allowed ] && echo 1)" "got $r"; done
out=$(run lead 'bash tools/check-guards.sh')
ok "the refusal is a PreToolUse deny with the rule id, the reason and the throwaway-clone fix (LR-051)" "$(jq -e '.hookSpecificOutput | .permissionDecision == "deny" and (.permissionDecisionReason | test("^Rule F-7Nov: .*Fix: run it in a throwaway clone"))' <<<"$out" >/dev/null && echo 1)" "$out"
out=$(printf 'not json' | python3 -I "$G" --hook); r=$?
ok "input that is not a hook event: no output, exit 0" "$([ $r = 0 ] && [ -z "$out" ] && echo 1)" "exit $r: $out"
# Without the stand-in it asks lane.sh: in a cloud copy (CLAUDE_CODE_REMOTE) on branch main it is never the Lead's copy.
T=$(mktemp -d "${TMPDIR:-/tmp}/mc.XXXXXXXX"); trap 'rm -rf "${T:?}"' EXIT
git init -q -b main "$T/c"; mkdir -p "$T/c/$PRODREL/tools"; cp "$TOOLS/lane.sh" "$TOOLS/records-dir.sh" "$T/c/$PRODREL/tools/" 2>/dev/null
out=$(jq -n --arg d "$T/c" '{tool_input:{command:"bash tools/check-guards.sh"},cwd:$d}' | env -u MAIN_COPY_LANE CLAUDE_CODE_REMOTE=true python3 -I "$G" --hook)
ok "no stand-in: lane.sh decides, and a cloud copy is never the Lead's" "$([ -z "$out" ] && echo 1)" "$out"
SET="$TOOLS/../../../../.claude/settings.json"
ok "settings.json runs it on every Bash call (no if: filter)" "$(jq -e '[.hooks.PreToolUse[] | select(.matcher == "Bash") | .hooks[] | select(.command | contains("main-copy-suite-guard.py")) | has("if")] == [false]' "$SET" >/dev/null && echo 1)"
# The command as settings.json runs it (review I1): it denies through the real file, and with the file gone it stays
# silent and exits 0, never 2 (exit 2 from a PreToolUse hook blocks every Bash call).
CMD=$(jq -r '.hooks.PreToolUse[] | select(.matcher == "Bash") | .hooks[] | select(.command | contains("main-copy-suite-guard.py")) | .command' "$SET")
ROOT="$(cd "$TOOLS/../../../.." && pwd)"
out=$(jq -n --arg c 'bash tools/check-guards.sh' '{tool_input:{command:$c},cwd:"/nowhere"}' | MAIN_COPY_LANE=lead CLAUDE_PROJECT_DIR="$ROOT" bash -c "$CMD"); r=$?
ok "the settings.json command denies through the real file" "$([ $r = 0 ] && jq -e '.hookSpecificOutput.permissionDecision == "deny"' <<<"$out" >/dev/null && echo 1)" "exit $r: $out"
E=$(mktemp -d "${TMPDIR:-/tmp}/hk.XXXXXXXX")
out=$(printf '{}' | CLAUDE_PROJECT_DIR="$E" bash -c "$CMD" 2>&1); r=$?; rm -rf "${E:?}"
ok "with the guard's file missing, the settings.json command is silent and exits 0 (never 2)" "$([ $r = 0 ] && [ -z "$out" ] && echo 1)" "exit $r: $out"
out=$(python3 -I "$TOOLS/main-copy-suite-guard.py" --bad </dev/null 2>/dev/null); r=$?
ok "a usage error exits 1, never 2" "$([ $r = 1 ] && echo 1)" "exit $r"
for j in '[1]' '"x"' '{"tool_input":"s"}'; do out=$(printf '%s' "$j" | python3 -I "$TOOLS/main-copy-suite-guard.py" --hook 2>&1); r=$?
  ok "JSON that is not an event ($j): no output, exit 0" "$([ $r = 0 ] && [ -z "$out" ] && echo 1)" "exit $r: $out"; done
finish
