#!/usr/bin/env bash
# No lane starts without room (founder, 6 Nov ~03:00 IST; that night B99 failed to start twice, at 4.7 and 3.7 GB free;
# a new lane copy needs about 5.4 GB). Checks the Mac before a session starts there: free disk at least 7 GB, 1-minute
# load at most 16, fewer than 4 running test copies (studio/tools/test-copies.sh). Prints each reading; exit 1 with the
# reasons when any fails. Limits: PREFLIGHT_MIN_GB, PREFLIGHT_MAX_LOAD, COPY_CAP.
#   bash product/tools/lane-preflight.sh          a person or the Lead, before start_session
#   bash product/tools/lane-preflight.sh --hook   PreToolUse hook on start_session (.claude/settings.json): a session
#                                                 started on this machine is refused with the reason; a cloud one passes;
#                                                 any brief failing brief-check.sh --brief is refused (G-4 (3), (7))
#                                                 (it also needs "Item: R1.x" in an open wave, waves.py allow, B204)
#                                                 and a builder brief naming an R1 item or row that is not on
#                                                 product/focus-list.md is refused (ENF-733; focus-check.py), and a
#                                                 "Touches:" file an open PR already changes is refused (E10; touch-overlap.py),
#                                                 and after an account switch the start waits for the baseline (switch.sh gate)
# Test: check-lane-preflight.sh; the focus list: check-focus-list.sh; the touch list: check-touch-overlap.sh.
DIR="$(cd "$(dirname "$0")" && pwd)"; min=${PREFLIGHT_MIN_GB:-7}; maxload=${PREFLIGHT_MAX_LOAD:-16}; cap=${COPY_CAP:-4}
if [ "${1:-}" = --hook ]; then
  in=$(cat); target=$(echo "$in" | jq -r '.tool_input.target // .tool_input.location // empty' 2>/dev/null)
  # G-4 (3), (7) (P-608, P-526): every lane brief, here or in the cloud, names model and effort, "Done when", "Duplicate check:".
  miss=$(echo "$in" | jq -r '.tool_input.prompt // .tool_input.message // .tool_input.brief // empty' | bash "$DIR/brief-check.sh" --brief) \
    || { jq -n --arg r "Lane brief refused (P-608, P-611 G-4; Item and waves: B204, P-745): $miss Fix the brief and start again." '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$r}}'; exit 0; }
  # ENF-733 (P-733 (1), P-734 (2)): a builder brief names only R1 items and rows on product/focus-list.md (focus-check.py).
  off=$(echo "$in" | jq -r '.tool_input.prompt // .tool_input.message // .tool_input.brief // empty' | python3 -I "$DIR/focus-check.py") \
    || { jq -n --arg r "Lane brief refused (P-733, P-734): ${off:-focus-check.py could not run, so nothing was checked.}" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$r}}'; exit 0; }
  # E10 (P-576, P-526b, P-438b): a "Touches:" file already changed by an open PR is refused, here or in the cloud (touch-overlap.py).
  hot=$(echo "$in" | jq -r '.tool_input.prompt // .tool_input.message // .tool_input.brief // empty' | python3 -I "$DIR/touch-overlap.py" 2>&1) \
    || { jq -n --arg r "Lane brief refused (E10, P-576): ${hot:-touch-overlap.py could not run, so nothing was checked.}" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$r}}'; exit 0; }
  # OS-86 / LR-143 (founder A417): after an account switch, no start until the minute-0 meter is recorded, then at most
  # 4 starts in 15 min and 12 in the first 2 h (switch.sh gate; here and in the cloud alike). Test: check-switch.sh.
  sg=$(bash "$DIR/switch.sh" gate 2>&1) \
    || { jq -n --arg r "$sg" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$r}}'; exit 0; }
  case "$(echo "$in" | jq -r '.tool_name // empty')" in *create_session) target=cloud;; esac
  [ "$target" = cloud ] && exit 0
  out=$(bash "$0"); [ $? = 0 ] && exit 0
  jq -n --arg r "$out" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:("No lane starts without room (founder, 6 Nov). " + $r + " Free disk or stop test copies first, or start the lane in the cloud.")}}'
  exit 0
fi
kb=$(df -Pk / 2>/dev/null | awk 'NR == 2 {print $4}'); gb=$(awk -v k="${kb:-0}" 'BEGIN {printf "%.1f", k / 1048576}')
load=$(sysctl -n vm.loadavg 2>/dev/null | tr -d '{}' | awk '{print $1}'); [ -n "$load" ] || load=$(awk '{print $1}' /proc/loadavg 2>/dev/null)
[ -n "$load" ] || load=$(uptime 2>/dev/null | sed -E 's/.*load averages?: *//' | awk '{gsub(",","",$1); print $1}')  # sandbox blocks sysctl (9 Nov)
copies=$(bash "$DIR/../../prototype/studio/tools/test-copies.sh" --count)
echo "preflight: disk ${gb} GB free (need ${min}) · load ${load:-?} (max ${maxload}) · test copies ${copies} (cap ${cap})"
bad=""
awk -v g="$gb" -v m="$min" 'BEGIN {exit !(g < m)}' && bad="$bad disk ${gb} GB free, under ${min} GB;"
[ -z "$load" ] && bad="$bad load unreadable;"
[ -n "$load" ] && awk -v l="$load" -v m="$maxload" 'BEGIN {exit !(l > m)}' && bad="$bad 1-minute load ${load}, over ${maxload};"
[ "$copies" -ge "$cap" ] && bad="$bad ${copies} test copies running, cap ${cap} (ports: $(bash "$DIR/../../prototype/studio/tools/test-copies.sh" | paste -sd ' ' -));"
[ -z "$bad" ] && { echo "preflight: room to start a lane"; exit 0; }
echo "REFUSED:${bad%;}."; exit 1
