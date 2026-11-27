#!/usr/bin/env bash
# One model rule (P-788, founder 22 Nov; A420, 27 Nov): every agent runs on Opus 5.5 at medium effort. Another model or
# effort only when needed and never silently (P-788 (2)): the launch names it with "P-788 exception: <reason>".
#   agent-model-guard.sh          every .claude/agents/*.md has "model: opus" (or claude-opus-5-5) and "effort: medium"
#                                 in its front matter; exit 1 naming each file that has not (model-rule-check.py, pr-rules.yml)
#   agent-model-guard.sh --hook   PreToolUse hook on Agent and Task: a launch asking for another model, or an effort other
#                                 than medium, is denied unless its prompt or description carries "P-788 exception:".
#                                 A launch with no model or effort inherits the agent file's (checked above) or the
#                                 session's (settings.json "model" and "effortLevel", checked by model-rule-check.py).
# Docs (code.claude.com/docs/en/sub-agents, read 27 Nov 2026): "`model` ... `sonnet`, `opus`, `haiku`, `fable`, a full
# model ID such as `claude-opus-5-5`, or `inherit`"; "`effort` ... Overrides the session effort level".
# Env: AGENTS_DIR. Tests: check-g4-rules.sh (2), check-model-rule.sh.
set -u
ok_model() { case "$(printf '%s' "$1" | tr 'A-Z' 'a-z')" in ""|inherit|opus|opus\[*\]|claude-opus-5-5|claude-opus-5-5\[*\]) return 0;; esac; return 1; }   # a context suffix such as [1m] is the same model
if [ "${1:-}" = --hook ]; then
  in=$(cat)
  m=$(echo "$in" | jq -r '.tool_input.model // empty'); e=$(echo "$in" | jq -r '.tool_input.effort // empty')
  why=""; ok_model "$m" || why="model $m"
  case "$e" in ""|medium) ;; *) why="${why:+$why, }effort $e";; esac
  [ -z "$why" ] && exit 0
  echo "$in" | jq -e '[.tool_input.prompt, .tool_input.description] | map(. // "") | join(" ") | test("P-788 exception:")' >/dev/null && exit 0
  who=$(echo "$in" | jq -r '[.tool_input.subagent_type, .tool_input.description] | map(. // "") | join(" ")')
  jq -n --arg r "One model rule (P-788): every agent on Opus 5.5 at medium effort; this launch ($who) asks for $why. Leave model and effort out, or name the reason in the prompt as \"P-788 exception: <why>\" and tell the founder (P-788 (2))." \
    '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$r}}'
  exit 0
fi
D="${AGENTS_DIR:-$(cd "$(dirname "$0")/../../../.." && pwd)/.claude/agents}"; bad=0; n=0
for f in "$D"/*.md; do
  [ -f "$f" ] || continue; n=$((n + 1)); fm=$(awk 'NR == 1 && /^---$/ {o = 1; next} o && /^---$/ {exit} o' "$f")
  m=$(echo "$fm" | sed -n 's/^model:[[:space:]]*//p' | tr -d ' "'"'"); e=$(echo "$fm" | sed -n 's/^effort:[[:space:]]*//p' | tr -d ' "'"'")
  case "$m" in opus|claude-opus-5-5) ;; *) echo "REFUSED: $(basename "$f") has model \"${m:-none}\", not \"model: opus\" (P-788)"; bad=1;; esac
  [ "$e" = medium ] || { echo "REFUSED: $(basename "$f") has effort \"${e:-none}\", not \"effort: medium\" (P-788)"; bad=1; }
done
[ "$n" -gt 0 ] || { echo "REFUSED: no agent file in $D"; exit 1; }
[ "$bad" = 0 ] && echo "agents: $n agent file(s) on Opus medium"; exit $bad
