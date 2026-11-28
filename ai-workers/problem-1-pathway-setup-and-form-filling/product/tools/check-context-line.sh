#!/usr/bin/env bash
# LR-053 (OS-26): context-line.sh, the Stop hook that warns at the hand-over line (P-446, P-446f, P-565). Fixture
# transcripts fed as Claude Code does; silent below the line, a warning (never a block) above. US$0, no network.
#   bash product/tools/check-context-line.sh
set -u
. "$(dirname "$0")/guard-test-lib.sh"
command -v jq >/dev/null || { echo "jq is missing; nothing was checked"; exit 2; }
T=$(mktemp -d "${TMPDIR:-/tmp}/ctx.XXXXXXXX"); trap 'rm -rf "$T"' EXIT
G="$TOOLS/context-line.sh"
turn() {  # $1 input $2 cache read $3 cache creation [$4 sidechain] → one assistant line with usage
  jq -nc --argjson i "$1" --argjson r "$2" --argjson c "$3" --argjson s "${4:-false}" \
    '{type:"assistant",isSidechain:$s,message:{content:[{type:"text",text:"ok"}],usage:{input_tokens:$i,cache_read_input_tokens:$r,cache_creation_input_tokens:$c,output_tokens:100}}}'; }
user() { jq -nc '{type:"user",message:{content:"next"}}'; }
run() {  # $1 transcript, $2 lane, [$3 stop_hook_active] → the hook's output
  jq -n --arg t "$1" --argjson a "${3:-false}" '{hook_event_name:"Stop",stop_hook_active:$a,transcript_path:$t}' | CONTEXT_LINE_LANE=$2 bash "$G"; }
# Below and above the builder line (400k): only the LAST main-thread turn counts.
{ turn 10 450000 0; user; turn 10 150000 2000; } > "$T/below.jsonl"
{ turn 10 150000 0; user; turn 10 405000 2000; } > "$T/above.jsonl"
out=$(run "$T/below.jsonl" screens); ok "silent below the builder line (the last turn is 152k, an older turn 450k)" "$([ -z "$out" ] && echo 1)" "$out"
out=$(run "$T/above.jsonl" screens)
ok "warns over the builder line (407k)" "$(jq -e '.systemMessage | contains("~407k") and contains("400k") and contains("P-446f")' <<<"$out" >/dev/null && echo 1)" "$out"
ok "... a warning, never a block" "$(jq -e 'has("decision") | not' <<<"$out" >/dev/null && echo 1)" "$out"
# A subagent's turn in the transcript does not count as the session's context.
{ turn 10 150000 0; turn 10 900000 0 true; } > "$T/side.jsonl"
out=$(run "$T/side.jsonl" screens); ok "a sidechain turn (900k) is not the session's context" "$([ -z "$out" ] && echo 1)" "$out"
# The Lead's line is 320k (200k beyond a ~120k start read, P-446); qa's 300k.
{ user; turn 10 330000 0; } > "$T/lead.jsonl"
out=$(run "$T/lead.jsonl" lead); ok "the Lead is warned at 330k (line 320k) to hand over in STATE.md" "$(jq -e '.systemMessage | contains("320k") and contains("STATE.md")' <<<"$out" >/dev/null && echo 1)" "$out"
out=$(run "$T/lead.jsonl" lead-stale); ok "... a lead-stale copy too" "$(jq -e '.systemMessage | contains("320k")' <<<"$out" >/dev/null && echo 1)" "$out"
out=$(run "$T/lead.jsonl" screens); ok "the same 330k is under a builder's line" "$([ -z "$out" ] && echo 1)" "$out"
{ user; turn 10 310000 0; } > "$T/qa.jsonl"
out=$(run "$T/qa.jsonl" qa); ok "qa is warned at 310k (line 300k)" "$(jq -e '.systemMessage | contains("300k")' <<<"$out" >/dev/null && echo 1)" "$out"
# No usage in the transcript: its bytes / 4.
head -c 1700000 /dev/zero | tr '\0' 'x' | fold -w 1000 | jq -Rc '{type:"user",message:{content:.}}' > "$T/bytes.jsonl"
out=$(run "$T/bytes.jsonl" screens); ok "no usage: a 1.7 MB transcript reads as over 400k (bytes / 4)" "$(jq -e '.systemMessage | contains("bytes / 4")' <<<"$out" >/dev/null && echo 1)" "$out"
# The override, the second stop and a missing transcript.
out=$(jq -n --arg t "$T/below.jsonl" '{transcript_path:$t}' | CONTEXT_LINE_LANE=screens CONTEXT_LINE_TOKENS=100000 bash "$G")
ok "CONTEXT_LINE_TOKENS sets the line" "$(jq -e '.systemMessage | contains("100k")' <<<"$out" >/dev/null && echo 1)" "$out"
out=$(run "$T/above.jsonl" screens true); ok "silent on the second stop (stop_hook_active)" "$([ -z "$out" ] && echo 1)" "$out"
out=$(run "$T/none.jsonl" screens); r=$?; ok "a missing transcript: silent, exit 0" "$([ -z "$out" ] && [ $r = 0 ] && echo 1)" "exit $r: $out"
ok "settings.json runs the hook on Stop" "$(jq -e '[.hooks.Stop[].hooks[].command] | any(contains("product/tools/context-line.sh"))' "$TOOLS/../../../../.claude/settings.json" >/dev/null && echo 1)"
finish
