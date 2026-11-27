#!/usr/bin/env bash
# LR-154 (founder A430, 27 Nov; the tech lead's correction 13:1x IST: app-view.js already clicks "Show more", so no new
# tool): a lead-watch check turn cannot end while the saved app view is stale (B197, now registered as a Stop hook), nor
# with a saved app view that says UNREADABLE (signed out) and no PushNotification to the founder in that same turn
# (lead-check-guard.sh, Stop mode). Fixture transcripts, a throwaway copy bound as the Lead's; no network, US$0.
#   bash product/tools/check-lane-read.sh
set -u
. "$(dirname "$0")/guard-test-lib.sh"
command -v jq >/dev/null || { echo "jq is missing; nothing was checked"; exit 2; }
T=$(mktemp -d "${TMPDIR:-/tmp}/laneread.XXXXXXXX") && [ -d "$T" ] || { echo "no temp dir: nothing was checked"; exit 2; }; trap 'rm -rf "$T"' EXIT
G="$TOOLS/lead-check-guard.sh"; C='run lead-watch; read STATE Start here'
# A throwaway copy whose lane.sh answers FAKE_LANE (as check-app-view.sh).
git init -q "$T/copy" && mkdir -p "$T/copy/$PRODREL/tools" && printf '#!/bin/bash\necho "$FAKE_LANE"\n' > "$T/copy/$PRODREL/tools/lane.sh"
export APP_VIEW_FILE="$T/app-view.txt" NOW=1800000000
view() {  # $1 the saved line 2, $2 age in minutes
  printf 'saved 27 Nov 13:00 IST epoch %s\n%s\n' "$((NOW - ${2:-1} * 60))" "$1" > "$APP_VIEW_FILE"; }
tr() {  # $1 prompt, $2 tool name used in the turn (optional) → $T/t.jsonl; an older turn used PushNotification
  jq -cn --arg p "$1" --arg tool "${2:-}" '
    {type:"user", message:{role:"user", content:"older turn"}},
    {type:"assistant", message:{content:[{type:"tool_use", name:"PushNotification", input:{}}]}},
    {type:"user", message:{role:"user", content:$p}},
    {type:"assistant", message:{content:([{type:"text", text:"Check done."}] + (if $tool == "" then [] else [{type:"tool_use", name:$tool, input:{}}] end))}},
    {type:"user", message:{content:"<task-notification>agent done</task-notification>"}}' > "$T/t.jsonl"; }
stop() {  # $1 lane → $out, $v block|pass
  out=$(jq -n --arg d "$T/copy" --arg t "$T/t.jsonl" '{hook_event_name:"Stop", cwd:$d, transcript_path:$t, stop_hook_active:true}' | FAKE_LANE="${1:-lead}" bash "$G" 2>&1)
  v=pass; printf '%s' "$out" | jq -e '.decision == "block"' >/dev/null 2>&1 && v=block; }
view "app view rows=14 · 2 flagged" 3; tr "$C"; stop
ok "a check turn with a fresh, readable app view passes" "$([ $v = pass ] && echo 1)" "$out"
view "app view rows=14 · 2 flagged" 20; tr "$C"; stop
ok "a check turn whose app view is 20 min old is refused (B197, now a registered Stop hook)" "$([ $v = block ] && grep -q 'app view' <<< "$out" && echo 1)" "$out"
view "UNREADABLE app view · rows=0: HTTP 401 (signed out?)" 2; tr "$C"; stop
ok "a fresh UNREADABLE (signed out) view with no PushNotification in the turn is refused, naming the sign-in URL" "$([ $v = block ] && grep -q 'PushNotification' <<< "$out" && grep -q 'https://claude.ai/login' <<< "$out" && echo 1)" "$out"
tr "$C" PushNotification; stop
ok "... with a PushNotification in the same turn it passes" "$([ $v = pass ] && echo 1)" "$out"
tr "$C" mcp__claude-code__PushNotification; stop
ok "... a PushNotification under an MCP prefix counts" "$([ $v = pass ] && echo 1)" "$out"
tr "  Run lead-watch;  read STATE Start here."; stop
ok "the check prompt is matched like the cron guard (case, spacing, full stop); an earlier turn's push does not count" "$([ $v = block ] && echo 1)" "$out"
tr "where are we?"; stop
ok "another Lead turn stops freely, even signed out" "$([ $v = pass ] && echo 1)" "$out"
tr "$C"; stop screens
ok "a builder's copy is never blocked" "$([ $v = pass ] && echo 1)" "$out"
S="$TOOLS/../../../../.claude/settings.json"
jq -e '[.hooks.Stop[]?.hooks[]?.command | select(test("lead-check-guard.sh"))] | length == 1' "$S" >/dev/null
ok "settings.json runs lead-check-guard.sh as a Stop hook" "$([ $? = 0 ] && echo 1)"
grep -q 'app-view.js' "$TOOLS/../../../../.claude/skills/lead-watch/SKILL.md"; ok "the lead-watch skill names app-view.js" "$([ $? = 0 ] && echo 1)"
grep -q 'Show more' "$TOOLS/app-view.js"; ok "app-view.js reads past Show more (the tool, unchanged)" "$([ $? = 0 ] && echo 1)"
finish
