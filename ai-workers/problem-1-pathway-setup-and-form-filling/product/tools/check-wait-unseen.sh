#!/usr/bin/env bash
# Test of LR-177 (founder A455, 28 Nov 15:5x IST: "nobody waits unseen"): (a) saving the app view also writes app-view.json
# with each lane's state, last message time and what it waits for; (b) lead-watch's app-view-check.sh ACTs on a lane
# waiting for an answer, a lane idle over 10 min with work left, a finished lane not archived, and an app view not read
# in 15 min, and the Lead's check turn cannot end on a view that old (lead-check-guard.sh's Stop mode, B197); (c)
# brief-check.sh --brief refuses a lane brief with no "Do it yourself" section naming its tools. Fixtures; no network, US$0.
#   bash product/tools/check-wait-unseen.sh
set -u
. "$(dirname "$0")/guard-test-lib.sh"
command -v jq >/dev/null || { echo "jq is missing; nothing was checked"; exit 2; }
T=$(mktemp -d "${TMPDIR:-/tmp}/waitunseen.XXXXXXXX") && [ -d "$T" ] || { echo "no temp dir: nothing was checked"; exit 2; }; trap 'rm -rf "$T"' EXIT
NOW=1800000000; export APP_VIEW_FILE="$T/app-view-latest.txt"
L() { printf "%-6s%s\n" "$1" "$2 · cloud · $3 · needs: $4 · d · idle $5 min · context 100k (10%) · id session_01$6${7:+ -> $7}"; }
view() { printf 'app view 4 sessions · 2 flagged · rows=4\n%s\n' "$@" | NOW=$NOW bash "$TOOLS/app-view-save.sh" >/dev/null; }
view "$(L FLAG forms-lane need_input 'pick an option' 12 AAAAAAAAAAAAAAAAAAAAAA need_input)" \
     "$(L FLAG runtime-lane working none 25 BBBBBBBBBBBBBBBBBBBBBB 'idle 25 min with work left')" \
     "$(L ok cleanup-lane completed none 40 CCCCCCCCCCCCCCCCCCCCCC)" \
     "$(L ok screens-lane working none 3 DDDDDDDDDDDDDDDDDDDDDD)"
J="$T/app-view-latest.json"
# (a) app-view.json
ok "(a) saving the app view writes app-view.json beside it" "$([ -s "$J" ] && echo 1)" "$(ls "$T")"
ok "(a) ... with each lane's state, what it waits for and its session id" "$(jq -e '.lanes | length == 4 and .[0].state == "need_input" and .[0].waits_for == "pick an option" and .[0].session_id == "session_01AAAAAAAAAAAAAAAAAAAAAA" and .[3].waits_for == ""' "$J" >/dev/null && echo 1)" "$(head -c 600 "$J")"
ok "(a) ... and its last message time (the save time minus its idle minutes)" "$(jq -e --arg t "$(python3 -c 'import datetime;print(datetime.datetime.fromtimestamp(1800000000-12*60,datetime.timezone.utc).isoformat())')" '.lanes[0].last_message_at == $t and .lanes[0].idle_min == 12' "$J" >/dev/null && echo 1)" "$(jq -c '.lanes[0]' "$J")"
ok "(a) ... flagged lanes carry their reasons" "$(jq -e '.lanes[1].flagged and .lanes[1].reasons == ["idle 25 min with work left"] and (.lanes[3].flagged | not)' "$J" >/dev/null && echo 1)" "$(jq -c '.lanes[1]' "$J")"
echo "not a view" > "$T/bad.txt"; python3 -I "$TOOLS/app-view-json.py" "$T/bad.txt" "$T/bad.json" >/dev/null; r=$?
ok "(a) text that is not a saved view writes nothing (exit 2)" "$([ $r = 2 ] && [ ! -e "$T/bad.json" ] && echo 1)" "rc=$r"
# (b) the four ACTs
o=$(NOW=$((NOW + 60)) bash "$TOOLS/app-view-check.sh")
ok "(b) a lane waiting for an answer (need_input, 12 min) is an ACT" "$(grep -q '^ACT   app view: forms-lane · cloud · need_input .*\[idle lane' <<<"$o" && echo 1)" "$o"
ok "(b) a lane idle 25 min with work left is an ACT" "$(grep -q '^ACT   app view: runtime-lane .*idle 25 min with work left' <<<"$o" && echo 1)" "$o"
ok "(b) a finished lane 40 min old not archived is an ACT" "$(grep -q '^ACT   app view: finished lane not archived: cleanup-lane' <<<"$o" && echo 1)" "$o"
ok "(b) a working lane active 3 min ago is none" "$(! grep -q 'screens-lane' <<<"$o" && echo 1)" "$o"
view "$(L ok cleanup-lane completed none 5 CCCCCCCCCCCCCCCCCCCCCC)"
o=$(NOW=$((NOW + 60)) bash "$TOOLS/app-view-check.sh")
ok "(b) a lane finished 6 min ago is not yet an ACT (over 10 min)" "$(! grep -q 'finished lane not archived' <<<"$o" && echo 1)" "$o"
o=$(NOW=$((NOW + 16 * 60)) bash "$TOOLS/app-view-check.sh")
ok "(b) an app view not read in 16 min is an ACT" "$(grep -q '^ACT   app view not read in 16 min (over 15)' <<<"$o" && echo 1)" "$o"
# ... and the Lead's check turn cannot end on it (lead-check-guard.sh's Stop mode)
git init -q "$T/copy" && mkdir -p "$T/copy/$PRODREL/tools" && printf '#!/bin/bash\necho "$FAKE_LANE"\n' > "$T/copy/$PRODREL/tools/lane.sh"
jq -cn '{type:"user", message:{role:"user", content:"run lead-watch; read STATE Start here"}}' > "$T/t.jsonl"
mkdir -p "$T/lw"; echo "$((NOW + 16 * 60)) 0 x 30" > "$T/lw/full-check"   # LR-167's stamp, where that gate is on main
out=$(jq -n --arg d "$T/copy" --arg t "$T/t.jsonl" '{hook_event_name:"Stop", cwd:$d, transcript_path:$t, stop_hook_active:true}' | LEAD_WATCH_STATE_DIR="$T/lw" NOW=$((NOW + 16 * 60)) FAKE_LANE=lead bash "$TOOLS/lead-check-guard.sh")
ok "(b) the Lead's check turn is blocked while the app view is 16 min old" "$(jq -e '.decision == "block" and (.reason | test("app view"))' <<<"$out" >/dev/null && echo 1)" "$out"
# (c) brief-check: a lane brief needs a "Do it yourself" section naming its tools
B=$'Model: Opus 5.5, effort: medium. You are a standby; wait for the Lead.'
o=$(printf '%s\n' "$B" | bash "$TOOLS/brief-check.sh" --brief); r=$?
ok "(c) a lane brief with no \"Do it yourself\" section is refused, naming it" "$([ $r = 1 ] && grep -q 'no "Do it yourself" section' <<<"$o" && echo 1)" "rc=$r $o"
o=$(printf '%s\n\nDo it yourself: gh, git and the built-in browser on claude.ai.\n' "$B" | bash "$TOOLS/brief-check.sh" --brief); r=$?
ok "(c) ... one with the section naming its tools passes" "$([ $r = 0 ] && echo 1)" "rc=$r $o"
o=$(printf '%s\n\n## Do it yourself\nEverything, always.\n' "$B" | bash "$TOOLS/brief-check.sh" --brief); r=$?
ok "(c) ... a section that names no tool is refused" "$([ $r = 1 ] && grep -q 'names no tool' <<<"$o" && echo 1)" "rc=$r $o"
o=$(printf 'Done when: x.sh exits 0.\nDuplicate check: none\n' | bash "$TOOLS/brief-check.sh"); r=$?
ok "(c) a PR body (no --brief) is not asked for it" "$([ $r = 0 ] && echo 1)" "rc=$r $o"
finish
