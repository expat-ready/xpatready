#!/usr/bin/env bash
# LR-154 (founder A430, 27 Nov): a lead-watch check turn cannot end without claude-lanes.js's "claude.ai:" summary line in
# the Lead's text, nor with a SIGNED OUT / not loaded / UNREACHABLE line and no PushNotification (lead-check-guard.sh, Stop
# mode). Fixture transcripts, a throwaway copy bound as the Lead's; no network, US$0.
#   bash product/tools/check-claude-lanes.sh
set -u
. "$(dirname "$0")/guard-test-lib.sh"
command -v jq >/dev/null || { echo "jq is missing; nothing was checked"; exit 2; }
T=$(mktemp -d "${TMPDIR:-/tmp}/lanes.XXXXXXXX") && [ -d "$T" ] || { echo "no temp dir: nothing was checked"; exit 2; }; trap 'rm -rf "$T"' EXIT
G="$TOOLS/lead-check-guard.sh"; C='run lead-watch; read STATE Start here'
# A throwaway copy whose lane.sh answers FAKE_LANE (as check-app-view.sh); the app view is fresh, so only LR-154 can block.
git init -q "$T/copy" && mkdir -p "$T/copy/$PRODREL/tools" && printf '#!/bin/bash\necho "$FAKE_LANE"\n' > "$T/copy/$PRODREL/tools/lane.sh"
export APP_VIEW_FILE="$T/app-view.txt" NOW=1800000000
printf 'app view read at epoch %s\nrows=3 · 0 flagged\n' "$NOW" > "$APP_VIEW_FILE"
tr() {  # $1 prompt, $2 the Lead's text, $3 tool name used in the turn (optional) → $T/t.jsonl
  jq -cn --arg p "$1" --arg x "$2" --arg tool "${3:-}" '
    {type:"user", message:{role:"user", content:"older turn"}},
    {type:"assistant", message:{content:[{type:"text", text:"claude.ai: signed in · 1 waiting · 0 unread · 2 running · 9 listed · Show more ×1"}]}},
    {type:"user", message:{role:"user", content:$p}},
    {type:"assistant", message:{content:([{type:"text", text:$x}] + (if $tool == "" then [] else [{type:"tool_use", name:$tool, input:{}}] end))}},
    {type:"user", message:{content:"<task-notification>agent done</task-notification>"}}' > "$T/t.jsonl"; }
stop() {  # $1 lane → $out, and block|pass in $v
  out=$(jq -n --arg d "$T/copy" --arg t "$T/t.jsonl" '{hook_event_name:"Stop", cwd:$d, transcript_path:$t, stop_hook_active:true}' | FAKE_LANE="${1:-lead}" bash "$G" 2>&1)
  v=pass; printf '%s' "$out" | jq -e '.decision == "block"' >/dev/null 2>&1 && v=block; }
ok_line='Check 12:33 IST. claude.ai: signed in · 2 waiting · 1 unread · 4 running · 23 listed · Show more ×2. Both WAITs answered.'
tr "$C" "Check done: 3 ACT lines, all handled."; stop
ok "a check turn whose text quotes no claude.ai: line is refused, naming claude-lanes.js" "$([ $v = block ] && grep -q 'claude-lanes.js' <<< "$out" && echo 1)" "$out"
tr "$C" "$ok_line"; stop
ok "... with the summary line it passes" "$([ $v = pass ] && echo 1)" "$out"
tr "  Run lead-watch;  read STATE Start here." "Check done."; stop
ok "the check prompt is matched like the cron guard (case, spacing, full stop)" "$([ $v = block ] && echo 1)" "$out"
tr "$C" "Check done."; sed -i.b '2d' "$T/t.jsonl"; jq -cn '{type:"assistant", message:{content:[{type:"text", text:"claude.ai: signed in · 0 waiting"}]}}' | cat - "$T/t.jsonl" > "$T/t2" && mv "$T/t2" "$T/t.jsonl"; stop
ok "a claude.ai: line from an earlier turn does not count" "$([ $v = block ] && echo 1)" "$out"
tr "$C" "claude.ai: SIGNED OUT or list not loaded (https://claude.ai/login)"; stop
ok "SIGNED OUT with no PushNotification in the turn is refused, naming the sign-in URL" "$([ $v = block ] && grep -q 'PushNotification' <<< "$out" && grep -q 'https://claude.ai/login' <<< "$out" && echo 1)" "$out"
tr "$C" "claude.ai: SIGNED OUT or list not loaded (https://claude.ai/login)" PushNotification; stop
ok "... with a PushNotification in the same turn it passes" "$([ $v = pass ] && echo 1)" "$out"
tr "$C" "claude.ai: UNREACHABLE (browser pane closed)"; stop
ok "UNREACHABLE with no PushNotification is refused" "$([ $v = block ] && echo 1)" "$out"
tr "$C" "claude.ai: UNREACHABLE (browser pane closed)" mcp__claude-code__PushNotification; stop
ok "... a PushNotification tool under an MCP prefix counts" "$([ $v = pass ] && echo 1)" "$out"
tr "where are we?" "Fine."; stop
ok "another Lead turn stops freely" "$([ $v = pass ] && echo 1)" "$out"
tr "$C" "Check done."; stop screens
ok "a builder's copy is never blocked" "$([ $v = pass ] && echo 1)" "$out"
jq -e '[.hooks.Stop[]?.hooks[]?.command | select(test("lead-check-guard.sh"))] | length == 1' "$TOOLS/../../../../.claude/settings.json" >/dev/null
ok "settings.json runs lead-check-guard.sh as a Stop hook" "$([ $? = 0 ] && echo 1)"
grep -q 'claude-lanes.js' "$TOOLS/../../../../.claude/skills/lead-watch/SKILL.md"; ok "the lead-watch skill names claude-lanes.js" "$([ $? = 0 ] && echo 1)"
grep -q 'Show more' "$TOOLS/claude-lanes.js" && grep -q 'claude.ai: signed in' "$TOOLS/claude-lanes.js"
ok "claude-lanes.js clicks Show more and prints the summary line" "$([ $? = 0 ] && echo 1)"
finish
