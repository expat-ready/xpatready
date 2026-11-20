#!/usr/bin/env bash
# ENF-761 part 3 (20 Nov: 3 of 7 "red after approval" PRs were queued and red only on optional checks): lead-watch.sh
# step 2 (queue-red.py) gives "ACT #N red after approval" only when a REQUIRED check (ci, or the ruleset's list) failed on
# a labelled PR's head; red only on optional checks is one info line, no ACT. Fake PR JSON; no network, US$0.
#   bash product/tools/check-queue-red.sh
set -u
. "$(dirname "$0")/guard-test-lib.sh"
cr() { jq -cn --arg n "$1" --arg c "$2" '{__typename:"CheckRun", name:$n, status:"COMPLETED", conclusion:$c}'; }
pr() {  # $1 number, $2 labels (comma), then check objects
  local n=$1 l=$2; shift 2
  jq -cn --argjson n "$n" --arg l "$l" --argjson c "[$(IFS=,; echo "$*")]" \
    '{number:$n, title:"PR \($n)", isDraft:false, headRefName:"b\($n)", labels:([$l|split(",")[]|select(.!="")|{name:.}]), statusCheckRollup:$c}'; }
A="review: approved"
P=$(jq -s -c . <<EOF2
$(pr 1 "$A,queued" "$(cr ci SUCCESS)" "$(cr module-cards FAILURE)" "$(cr CodeQL FAILURE)")
$(pr 2 "$A" "$(cr ci FAILURE)" "$(cr walks FAILURE)")
$(pr 3 "$A,queued" "$(cr ci SUCCESS)" "$(cr pr-rules FAILURE)")
$(pr 4 "" "$(cr ci FAILURE)")
$(pr 5 "$A" "$(cr ci SUCCESS)" '{"__typename":"StatusContext","context":"ext/gate","state":"ERROR"}')
$(pr 6 "$A" "$(cr ci TIMED_OUT)")
EOF2
)
q() { out=$(printf '%s' "$P" | python3 -I "$TOOLS/queue-red.py" "$@"); r=$?; }
q --required ci
ok "required ci failed on a labelled head: ACT red after approval naming ci (pass case)" "$(grep -qx 'ACT   #2 red after approval: required ci failed (PR 2)' <<< "$out" && echo 1)" "$out"
ok "ci timed out counts as failed" "$(grep -q '^ACT   #6 red after approval: required ci' <<< "$out" && echo 1)" "$out"
ok "red only on module-cards, CodeQL, pr-rules (optional): no ACT (fail case of the old rule)" "$(! grep -qE '^ACT   #(1|3|5) ' <<< "$out" && echo 1)" "$out"
ok "... one info line lists them, with the required list" "$([ "$(grep -c '^info ' <<< "$out")" = 1 ] && grep -q '^info  red only on optional checks, not blocking (required: ci): #1 (CodeQL, module-cards); #3 (pr-rules); #5 (ext/gate)' <<< "$out" && echo 1)" "$out"
ok "an unlabelled PR red on ci is not a red after approval" "$(! grep -q '#4' <<< "$out" && echo 1)" "$out"
ok "exactly 2 ACT lines" "$([ "$(grep -c '^ACT' <<< "$out")" = 2 ] && echo 1)" "$out"
q --required "ci,pr-rules"
ok "pr-rules in the ruleset's required list: #3 red on pr-rules is an ACT" "$(grep -qx 'ACT   #3 red after approval: required pr-rules failed (PR 3)' <<< "$out" && echo 1)" "$out"
q --required ""
ok "an empty required list (ruleset unreadable) still counts ci" "$(grep -q '^ACT   #2 red after approval: required ci' <<< "$out" && echo 1)" "$out"
grep -q 'python3 -I "$TOOLS/queue-red.py" --required "${req:-ci}"' "$TOOLS/lead-watch.sh" && grep -q 'rules/branches/main' "$TOOLS/lead-watch.sh"
ok "lead-watch.sh step 2 runs queue-red.py with the ruleset's required checks (REST)" "$([ $? = 0 ] && echo 1)"
grep -qE "^back=.*red after approval" "$TOOLS/lead-watch.sh"; ok "lead-watch.sh still counts the red-after-approval ACT lines (back=)" "$([ $? = 0 ] && echo 1)"
finish
