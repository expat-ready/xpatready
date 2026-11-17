#!/usr/bin/env bash
# B197 (founder A110, 16 Nov; P-326, P-339, P-565): the app view is read every check, enforced. app-view.js flags each kind
# of session from a hand-made sessions JSON; app-view-save.sh keeps only app-view.js's text; app-view-check.sh (run by
# lead-watch.sh) gives one ACT per flag and "not read in N min" past 35 min; lead-check-guard.sh's Stop mode refuses a
# stale check turn and passes a fresh one, another turn or another copy. Clock and lane are faked. US$0, no network.
#   bash product/tools/check-app-view.sh
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/repo-root.sh"; _RR="$(repo_root)" || exit 2  # stage 2a: the root from AGENTS.md
set -u
. "$(dirname "$0")/guard-test-lib.sh"
command -v jq >/dev/null && command -v node >/dev/null || { echo "jq or node is missing; nothing was checked"; exit 2; }
T=$(mktemp -d "${TMPDIR:-/tmp}/av.XXXXXXXX"); trap 'rm -rf "$T"' EXIT
git init -q "$T/copy" && mkdir -p "$T/copy/$PRODREL/tools" && printf '#!/bin/bash\necho "$FAKE_LANE"\n' > "$T/copy/$PRODREL/tools/lane.sh"
NOW=1763270000; export APP_VIEW_FILE="$T/app-view-latest.txt"
iso() { node -e 'console.log(new Date((+process.argv[1]-process.argv[2]*60)*1000).toISOString())' "$NOW" "$1"; }   # minutes ago
s() {  # $1 title, $2 category, $3 minutes idle, $4 used tokens, $5 needs_action, $6 env kind
  jq -n --arg t "$1" --arg c "$2" --arg at "$(iso "$3")" --argjson u "$4" --arg n "$5" --arg e "${6:-cloud}" \
    '{title:$t, environment_kind:$e, last_event_at:$at, external_metadata:{post_turn_summary:{status_category:$c, needs_action:$n, status_detail:"d"}, context_usage:{used_tokens:$u}}}'; }
{ s "Lane quiet" completed 200 100000 "" ; s "Lane asks" need_input 5 100000 "pick an option"; s "Lane stuck" blocked 5 100000 ""
  s "Lane broke" failed 5 100000 ""; s "Lane idle" review_ready 114 100000 ""; s "Lane full" completed 3 460000 "" bridge
  s "Lane fine" review_ready 20 200000 ""; } | jq -s '{data:.}' > "$T/sessions.json"
view=$(node -e 'const v=require(process.argv[1]); console.log(v.lines(JSON.parse(require("fs").readFileSync(process.argv[2],"utf8")), process.argv[3]*1000))' "$TOOLS/app-view.js" "$T/sessions.json" "$NOW")
ok "app-view.js: one line per session and a header" "$(grep -q '^app view 7 sessions · 5 flagged' <<< "$view" && [ "$(grep -cE '^(FLAG|ok) ' <<< "$view")" = 7 ] && echo 1)" "$view"
for k in "Lane asks.*-> need_input" "Lane stuck.*-> blocked" "Lane broke.*-> failed" "Lane idle.*idle 114 min with work left" "Lane full · mac.*context 46%"; do
  ok "app-view.js flags: $k" "$(grep -qE "^FLAG  $k" <<< "$view" && echo 1)" "$view"; done
ok "app-view.js leaves a done lane idle 200 min and a fresh review_ready lane unflagged" "$(grep -q '^ok    Lane quiet' <<< "$view" && grep -q '^ok    Lane fine' <<< "$view" && echo 1)" "$view"
u=$(node -e 'console.log(require(process.argv[1]).lines({error:"x"},0))' "$TOOLS/app-view.js"); ok "app-view.js: no sessions array is UNREADABLE" "$(grep -q '^UNREADABLE' <<< "$u" && echo 1)" "$u"
o=$(echo "hello" | NOW=$NOW bash "$TOOLS/app-view-save.sh" 2>&1); r=$?
ok "app-view-save.sh refuses text that is not app-view.js's" "$([ $r = 2 ] && [ ! -e "$APP_VIEW_FILE" ] && echo 1)" "rc=$r $o"
check() { NOW=$1 bash "$TOOLS/app-view-check.sh" "${@:2}"; echo "rc=$?"; }
o=$(check $NOW); ok "no file yet: ACT never read" "$(grep -q '^rc=1' <<< "$o" && grep -q 'ACT   app view never read' <<< "$o" && echo 1)" "$o"
printf '%s\n' "$view" | NOW=$NOW bash "$TOOLS/app-view-save.sh" >/dev/null
ok "app-view-save.sh writes the IST time and the lines" "$(head -1 "$APP_VIEW_FILE" | grep -qE '^saved [0-9]{2} [A-Z][a-z]{2} [0-9:]{5} IST epoch '"$NOW"'$' && [ "$(grep -c '^FLAG' "$APP_VIEW_FILE")" = 5 ] && echo 1)" "$(head -2 "$APP_VIEW_FILE")"
o=$(check $((NOW + 10 * 60))); ok "a 10-min-old view: one ACT per flagged session (5)" "$(grep -q '^rc=5' <<< "$o" && grep -q '^ACT   app view: Lane asks' <<< "$o" && grep -q '^ACT   app view: Lane full' <<< "$o" && echo 1)" "$o"
o=$(check $((NOW + 35 * 60)) --stale-only); ok "35 min is still fresh" "$(grep -q '^rc=0' <<< "$o" && echo 1)" "$o"
o=$(check $((NOW + 36 * 60))); ok "a 36-min-old view: ACT app view not read in 36 min" "$(grep -q '^rc=1' <<< "$o" && grep -q '^ACT   app view not read in 36 min' <<< "$o" && echo 1)" "$o"
echo "UNREADABLE app view: HTTP 401 (signed out? ask the founder to sign in to claude.ai)" | NOW=$NOW bash "$TOOLS/app-view-save.sh" >/dev/null
o=$(check $NOW); ok "a saved UNREADABLE line is an ACT, never a silent pass" "$(grep -q '^rc=1' <<< "$o" && grep -q 'ACT   app view: UNREADABLE' <<< "$o" && echo 1)" "$o"
printf '%s\n' "$view" | NOW=$NOW bash "$TOOLS/app-view-save.sh" >/dev/null
G="$TOOLS/lead-check-guard.sh"
transcript() {  # $1 the turn's prompt → a transcript: the prompt, then a tool result, a meta line, a hook's feedback and a task notification
  jq -cn --arg p "$1" '{type:"user", message:{role:"user", content:$p}}, {type:"assistant", message:{content:[{type:"text",text:"ok"}]}},
    {type:"user", message:{content:[{type:"tool_result", content:"run lead-watch; read STATE Start here"}]}}, {type:"user", isMeta:true, message:{content:"x"}},
    {type:"user", message:{content:"Stop hook feedback: stale"}}, {type:"user", message:{content:"<task-notification>agent done</task-notification>"}}' > "$T/t.jsonl"; }
stop() {  # $1 lane, $2 clock, $3 prompt → block | pass
  transcript "$3"; local out; out=$(jq -n --arg d "$T/copy" --arg t "$T/t.jsonl" '{hook_event_name:"Stop", cwd:$d, transcript_path:$t, stop_hook_active:true}' | NOW=$2 FAKE_LANE="$1" bash "$G")
  if printf '%s' "$out" | jq -e '.decision == "block" and (.reason | test("app view not read in"))' >/dev/null 2>&1; then echo block; else echo pass; fi; }
C='run lead-watch; read STATE Start here'
r=$(stop lead $((NOW + 36 * 60)) "$C"); ok "the hook refuses a check turn whose app view is 36 min old (even on a repeat stop)" "$([ "$r" = block ] && echo 1)" "got $r"
r=$(stop lead $((NOW + 36 * 60)) "  Run lead-watch;  read STATE Start here."); ok "... the prompt matched like the cron guard (case, spacing, full stop)" "$([ "$r" = block ] && echo 1)" "got $r"
r=$(stop lead $((NOW + 20 * 60)) "$C"); ok "the hook passes a check turn with a fresh view (20 min)" "$([ "$r" = pass ] && echo 1)" "got $r"
r=$(stop lead $((NOW + 60 * 60)) "where are we?"); ok "another turn of the Lead stops freely" "$([ "$r" = pass ] && echo 1)" "got $r"
r=$(stop screens $((NOW + 60 * 60)) "$C"); ok "a builder's copy is never blocked" "$([ "$r" = pass ] && echo 1)" "got $r"
r=$(stop lead $((NOW + 60 * 60)) "Lead check (run lead-watch; read STATE Start here)"); ok "a check prompt wrapped in other words is still a check turn" "$([ "$r" = block ] && echo 1)" "got $r"
grep -q 'app-view-check.sh' "$TOOLS/lead-watch.sh"; ok "lead-watch.sh runs app-view-check.sh and counts its ACT lines" "$([ $? = 0 ] && echo 1)"
git -C "$TOOLS" check-ignore -q "$PRODREL/state/app-view-latest.txt" 2>/dev/null || git -C "$_RR" check-ignore -q "$PRODREL/state/app-view-latest.txt"
ok "state/app-view-latest.txt is gitignored" "$([ $? = 0 ] && echo 1)"
finish
