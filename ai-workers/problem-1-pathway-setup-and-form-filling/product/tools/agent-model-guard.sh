#!/usr/bin/env bash
# Reviewers and breakers run on Opus 5.5 at medium effort (P-788: "Opus 5.5 medium everywhere", which superseded P-608 (2)'s
# high; row G-4 (2); lab register LR-103). Another model or effort only when needed and named (P-788 (2)): not by launch.
#   agent-model-guard.sh          every .claude/agents/*.md named *reviewer* or *breaker* has "model: opus" and
#                                 "effort: medium" in its front matter; exit 1 naming each file that has not (pr-rules.yml)
#   agent-model-guard.sh --hook   PreToolUse hook on Agent and Task: a reviewer or breaker (by subagent_type or
#                                 description) launched with another model or an effort other than medium is denied. A
#                                 launch with no model inherits the agent file's (checked above) or the caller's: not detectable.
# Env: AGENTS_DIR. Test: check-g4-rules.sh.
set -u
if [ "${1:-}" = --hook ]; then
  in=$(cat); who=$(echo "$in" | jq -r '[.tool_input.subagent_type, .tool_input.description] | map(. // "") | join(" ")')
  echo "$who" | grep -qiE '(^|[^a-z])(review|reviewer|breaker)([^a-z]|$)' || exit 0
  m=$(echo "$in" | jq -r '.tool_input.model // empty'); e=$(echo "$in" | jq -r '.tool_input.effort // empty')
  why=""; [ -n "$m" ] && [ "$m" != inherit ] && ! echo "$m" | grep -qi opus && why="model $m"
  case "$e" in ""|medium) ;; *) why="${why:+$why, }effort $e";; esac
  [ -z "$why" ] && exit 0
  jq -n --arg r "Reviewers and breakers run on Opus 5.5 medium (P-788); this launch ($who) asks for $why. Launch it again with model opus, effort medium, or leave both out; another setting needs a named reason to the founder first (P-788 (2))." \
    '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$r}}'
  exit 0
fi
D="${AGENTS_DIR:-$(cd "$(dirname "$0")/../../../.." && pwd)/.claude/agents}"; bad=0; n=0
for f in "$D"/*reviewer*.md "$D"/*breaker*.md; do
  [ -f "$f" ] || continue; n=$((n + 1)); fm=$(awk 'NR == 1 && /^---$/ {o = 1; next} o && /^---$/ {exit} o' "$f")
  echo "$fm" | grep -qE '^model:[[:space:]]*opus' || { echo "REFUSED: $(basename "$f") has no \"model: opus\" (P-788)"; bad=1; }
  echo "$fm" | grep -qE '^effort:[[:space:]]*medium[[:space:]]*$' || { echo "REFUSED: $(basename "$f") has no \"effort: medium\" (P-788)"; bad=1; }
done
[ "$n" -gt 0 ] || { echo "REFUSED: no reviewer or breaker agent in $D"; exit 1; }
[ "$bad" = 0 ] && echo "agents: $n reviewer/breaker file(s) on Opus medium"; exit $bad
