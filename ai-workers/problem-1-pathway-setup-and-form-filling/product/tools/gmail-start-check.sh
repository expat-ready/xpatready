#!/bin/bash
# Start check (B193 part 2 (c), P-620): every Lead's session has the company Gmail connector; missing → ask the founder.
# Stop hook in the Lead's copy (lane.sh whoami = lead), or any copy with XR_GMAIL_CHECK=1 (the outside-accounts session).
# Reads the session's transcript (hook input transcript_path): Claude Code records each connector change as an
# attachment `deferred_tools_delta` (tool names added and removed, servers failed or needing sign-in). Gmail is there
# when a tool whose name holds "gmail" is added and not removed since. At the session's first stop, and again whenever
# the answer changes (an account switch), a missing Gmail blocks the stop once with the step: ask the founder (one
# AskUserQuestion) to connect the company mailbox in claude.ai Connectors, and record the answer in STATE. Whether the
# mailbox is the company's is for the session to confirm. Read only: nothing is mailed. Test: check-gmail-start-check.sh.
input=$(cat); [ "$(printf '%s' "$input" | jq -r '.stop_hook_active // false' 2>/dev/null)" = true ] && exit 0
cwd=$(printf '%s' "$input" | jq -r '.cwd // empty' 2>/dev/null)
sid=$(printf '%s' "$input" | jq -r '.session_id // "none"' 2>/dev/null)
tr_=$(printf '%s' "$input" | jq -r '.transcript_path // empty' 2>/dev/null)
if [ "${XR_GMAIL_CHECK:-}" != 1 ]; then
  ROOT=$([ -n "$cwd" ] && git -C "$cwd" rev-parse --show-toplevel 2>/dev/null)
  LANE=$([ -n "$ROOT" ] && cd "$ROOT" && bash ai-workers/problem-1-pathway-setup-and-form-filling/product/tools/lane.sh whoami 2>/dev/null)
  [ "$LANE" = lead ] || exit 0
fi
[ -f "$tr_" ] || exit 0
state=$(jq -rs '[.[] | select(.attachment.type? == "deferred_tools_delta") | .attachment] as $d
  | ([$d[] | (.addedNames // [])[] | select(test("gmail"; "i"))] - [$d[] | (.removedNames // [])[] ]) as $have
  | [$d[] | ((.failedMcpServers // []) + (.needsAuthMcpServers // []))[] | tostring | select(test("gmail"; "i"))] as $bad
  | if ($have | length) > 0 then "ok" elif ($bad | length) > 0 then "failed" else "missing" end' "$tr_" 2>/dev/null) || exit 0
mark="${TMPDIR:-/tmp}/xr-gmail-check/$sid"; mkdir -p "$(dirname "$mark")"
[ "$(cat "$mark" 2>/dev/null)" = "$state" ] && exit 0
echo "$state" > "$mark"
[ "$state" = ok ] && exit 0
why=$([ "$state" = failed ] && echo "the Gmail connector failed or needs sign-in" || echo "this session has no Gmail connector")
jq -n --arg w "$why" '{decision:"block",reason:("P-620 start check: " + $w + ". Ask the founder now, one AskUserQuestion: connect the company mailbox in claude.ai Settings › Connectors (Gmail), then restart or switch back to this session. Record the answer in STATE. Shown once per session and again after a change.")}'
