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
  LANE=$([ -n "$ROOT" ] && cd "$ROOT" && bash ai-workers/problem-1-pathway-setup-and-form-filling/product/tools/lane.sh whoami 2>/dev/null | sed "s/^lead-stale$/lead/")
  [ "$LANE" = lead ] || exit 0
fi
[ -f "$tr_" ] || exit 0
# Replayed in order (a name added, removed and added again is there; readdedNames counts as added); "failed" when the
# newest delta naming a Gmail server lists it as failed or needing sign-in.
state=$(jq -rs 'reduce (.[] | select(.attachment.type? == "deferred_tools_delta") | .attachment) as $d ({have: {}, bad: false};
    .have = (reduce (($d.removedNames // [])[]) as $n (.have; del(.[$n])))
  | .have = (reduce ((($d.addedNames // []) + ($d.readdedNames // []))[]) as $n (.have; .[$n] = true))
  | ([($d.failedMcpServers // []) + ($d.needsAuthMcpServers // []) | .[] | tostring | select(test("gmail"; "i"))] | length > 0) as $f
  | ([($d.pendingMcpServers // [])[] | tostring | select(test("gmail"; "i"))] | length > 0) as $p
  | .bad = (if $f then true elif $p then false else .bad end))
  | if ([.have | keys[] | select(test("gmail"; "i"))] | length) > 0 then "ok" elif .bad then "failed" else "missing" end' "$tr_" 2>/dev/null) || exit 0
mark="${TMPDIR:-/tmp}/xr-gmail-check/$sid"; mkdir -p "$(dirname "$mark")"
[ "$(cat "$mark" 2>/dev/null)" = "$state" ] && exit 0
echo "$state" > "$mark"
[ "$state" = ok ] && exit 0
why=$([ "$state" = failed ] && echo "the Gmail connector failed or needs sign-in" || echo "this session has no Gmail connector")
jq -n --arg w "$why" '{decision:"block",reason:("P-620 start check: " + $w + ". Ask the founder now, one AskUserQuestion: connect the company mailbox in claude.ai Settings › Connectors (Gmail), then restart or switch back to this session. Record the answer in STATE. Shown once per session and again after a change.")}'
