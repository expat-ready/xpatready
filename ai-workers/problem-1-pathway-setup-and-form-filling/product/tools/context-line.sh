#!/bin/bash
# LR-053 (OS-26, lab lane fast-route-2, 28 Nov): Stop hook — the hand-over warning at the context line. Reads the
# session's transcript (transcript_path in the hook input), takes the context size from the last main-thread assistant
# turn's usage (input + cache read + cache creation + output tokens; the file's bytes / 4 when no turn has usage), and
# warns when it is over this copy's line. Silent below the line. A warning, never a block: the session decides when to
# write the hand-over; nothing here stops a turn.
# Lines (RULES.md): P-446, the Lead hands over 200k tokens beyond its start read (start read ~120k,
# design/release1-operating-model-2026-11-16.md item 4) = 320k; P-446f, qa ~300k, builders split before ~400k;
# P-565, no working session goes past about half its context (the lines above sit under half of a 1M window).
# Reviewers and helpers are subagents: their own Stop (SubagentStop) does not run this.
# CONTEXT_LINE_TOKENS overrides the line; CONTEXT_LINE_LANE names the lane (tests; else lane.sh whoami). US$0, no network.
input=$(cat)
[ "$(printf '%s' "$input" | jq -r '.stop_hook_active // false' 2>/dev/null)" = "true" ] && exit 0
tp=$(printf '%s' "$input" | jq -r '.transcript_path // empty' 2>/dev/null)
[ -n "$tp" ] && [ -f "$tp" ] || exit 0
lane=${CONTEXT_LINE_LANE:-}
if [ -z "$lane" ]; then
  cwd=$(printf '%s' "$input" | jq -r '.cwd // empty' 2>/dev/null)
  lane=$(cd "${cwd:-.}" 2>/dev/null && bash "$(dirname "$0")/lane.sh" whoami 2>/dev/null)
fi
case "$lane" in
  lead|lead-stale) line=320000; why="the Lead hands over 200k beyond its ~120k start read (P-446)"; act="write the hand-over in STATE.md and start the next Lead";;
  qa) line=300000; why="qa sessions end near 300k (P-446f)"; act="write the hand-over in your PR or report and end this session";;
  *) line=400000; why="builders split before ~400k (P-446f; P-565: under half the context)"; act="push, write the hand-over in the PR and end this session";;
esac
case "${CONTEXT_LINE_TOKENS:-}" in ''|*[!0-9]*) ;; *) line=$CONTEXT_LINE_TOKENS; why="the line set by CONTEXT_LINE_TOKENS";; esac
# The last main-thread assistant turn with usage: read from the end (tac; tail -r on macOS), a bounded number of usage lines.
used=$( { tac "$tp" 2>/dev/null || tail -r "$tp"; } | grep -m 200 '"usage"' | jq -r 'select(.type == "assistant" and (.isSidechain // false) == false and (.message.usage | type) == "object")
  | .message.usage | (.input_tokens // 0) + (.cache_read_input_tokens // 0) + (.cache_creation_input_tokens // 0) + (.output_tokens // 0)' 2>/dev/null | head -1)
how="last turn's usage"
case "$used" in ''|*[!0-9]*) used=$(( $(wc -c < "$tp") / 4 )); how="transcript bytes / 4";; esac
[ "$used" -gt "$line" ] || exit 0
jq -n --arg m "context line: this session holds ~$((used / 1000))k tokens ($how), over the ${lane:-unbound} line of $((line / 1000))k: $why. Next: $act." '{systemMessage:$m}'
