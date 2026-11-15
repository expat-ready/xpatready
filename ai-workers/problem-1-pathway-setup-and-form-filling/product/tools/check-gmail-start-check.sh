#!/usr/bin/env bash
# B193 part 2 (c), P-620: gmail-start-check.sh blocks the Lead's first stop when the session's transcript shows no
# Gmail connector (or a failed one), once per session and again after a change; a session with Gmail, or a builder's
# copy, is never stopped. Transcripts are hand-made in the shape Claude Code writes. US$0, no network.
#   bash product/tools/check-gmail-start-check.sh
set -u
. "$(dirname "$0")/guard-test-lib.sh"
command -v jq >/dev/null || { echo "jq is missing; nothing was checked"; exit 2; }
T=$(mktemp -d "${TMPDIR:-/tmp}/gm.XXXXXXXX"); trap 'rm -rf "$T"' EXIT
git init -q "$T/copy" && mkdir -p "$T/copy/$PRODREL/tools" && printf '#!/bin/bash\necho "$FAKE_LANE"\n' > "$T/copy/$PRODREL/tools/lane.sh"
delta() { jq -cn --argjson a "$1" --argjson r "${2:-[]}" --argjson f "${3:-[]}" '{type:"attachment", attachment:{type:"deferred_tools_delta", addedNames:$a, removedNames:$r, failedMcpServers:$f, needsAuthMcpServers:[], pendingMcpServers:[]}}'; }
delta '["Read","mcp__Google_Drive__search_files"]' > "$T/none.jsonl"
{ cat "$T/none.jsonl"; delta '["mcp__claude_ai_Gmail__search_threads","mcp__claude_ai_Gmail__get_thread"]'; } > "$T/gmail.jsonl"
{ cat "$T/gmail.jsonl"; delta '[]' '["mcp__claude_ai_Gmail__search_threads","mcp__claude_ai_Gmail__get_thread"]'; } > "$T/switched.jsonl"
{ cat "$T/none.jsonl"; delta '[]' '[]' '["{\"name\":\"plugin:productivity:gmail\",\"errorCode\":\"ERR\"}"]'; } > "$T/failed.jsonl"
G="$TOOLS/gmail-start-check.sh"
stop() {  # $1 lane, $2 transcript, $3 session id → block | pass
  local out; out=$(jq -n --arg t "$2" --arg s "$3" --arg d "$T/copy" '{session_id:$s, transcript_path:$t, cwd:$d, stop_hook_active:false}' | TMPDIR="$T" FAKE_LANE="$1" bash "$G")
  if printf '%s' "$out" | jq -e '.decision == "block"' >/dev/null 2>&1; then echo block; else echo pass; fi; }
r=$(stop lead "$T/none.jsonl" s1); ok "the Lead's session with no Gmail connector is stopped to ask the founder" "$([ "$r" = block ] && echo 1)" "got $r"
r=$(stop lead "$T/none.jsonl" s1); ok "... once: the next stop passes" "$([ "$r" = pass ] && echo 1)" "got $r"
r=$(stop lead "$T/gmail.jsonl" s2); ok "a session with Gmail tools passes" "$([ "$r" = pass ] && echo 1)" "got $r"
r=$(stop lead "$T/switched.jsonl" s2); ok "after a switch removes Gmail, the same session is stopped again" "$([ "$r" = block ] && echo 1)" "got $r"
r=$(stop lead "$T/failed.jsonl" s3); ok "a failed Gmail connector is stopped" "$([ "$r" = block ] && echo 1)" "got $r"
r=$(stop screens "$T/none.jsonl" s4); ok "a builder's copy is never stopped" "$([ "$r" = pass ] && echo 1)" "got $r"
out=$(jq -n --arg t "$T/none.jsonl" --arg d "$T/copy" '{session_id:"s5", transcript_path:$t, cwd:$d}' | TMPDIR="$T" XR_GMAIL_CHECK=1 FAKE_LANE=unbound bash "$G")
ok "the outside-accounts session (XR_GMAIL_CHECK=1) is checked, and told to ask with AskUserQuestion" "$(echo "$out" | jq -e '.reason | test("P-620.*AskUserQuestion.*Connectors")' >/dev/null && echo 1)" "$out"
out=$(jq -n --arg t "$T/none.jsonl" --arg d "$T/copy" '{session_id:"s6", transcript_path:$t, cwd:$d, stop_hook_active:true}' | TMPDIR="$T" FAKE_LANE=lead bash "$G")
ok "never blocks twice in one stop (stop_hook_active)" "$([ -z "$out" ] && echo 1)" "$out"
finish
