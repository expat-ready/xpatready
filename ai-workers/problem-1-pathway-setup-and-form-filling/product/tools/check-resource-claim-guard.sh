#!/usr/bin/env bash
# Guard 32 (ENF-771, P-771, founder 21 Nov): no turn ends blaming machines, runners or capacity without a measured number.
# Feeds resource-claim-guard.sh the Stop hook's JSON as Claude Code does. US$0, no network.
#   bash product/tools/check-resource-claim-guard.sh
set -u
. "$(dirname "$0")/guard-test-lib.sh"
command -v jq >/dev/null || { echo "jq is missing; nothing was checked"; exit 2; }
T=$(mktemp -d "${TMPDIR:-/tmp}/rc.XXXXXXXX"); trap 'rm -rf "$T"' EXIT
G="$TOOLS/resource-claim-guard.sh"
stop() {  # $1 message, [$2 via=transcript] → block | pass
  local out j
  if [ "${2:-}" = transcript ]; then
    jq -nc --arg m "$1" '{type:"assistant",message:{content:[{type:"text",text:$m}]}}' > "$T/t.jsonl"
    j=$(jq -n --arg t "$T/t.jsonl" '{hook_event_name:"Stop",stop_hook_active:false,transcript_path:$t}')
  else j=$(jq -n --arg m "$1" '{hook_event_name:"Stop",stop_hook_active:false,last_assistant_message:$m}'); fi
  out=$(printf '%s' "$j" | bash "$G")
  if printf '%s' "$out" | jq -e '.decision == "block"' >/dev/null 2>&1; then echo block; else echo pass; fi; }
for m in 'The constraint now is the merge queue and machines.' 'We are waiting for a machine, so the proof slips.' \
         'There are not enough runners for six batches.' 'Runners are the bottleneck tonight.' 'CI capacity is limited, so I held the full runs.' \
         'Out of GitHub machines; the batch waits.'; do
  r=$(stop "$m"); ok "refused, no number: $m" "$([ "$r" = block ] && echo 1)" "got $r"; done
r=$(stop 'Runners are the bottleneck tonight.' transcript); ok "... read from the transcript too" "$([ "$r" = block ] && echo 1)" "got $r"
for m in 'Machines are not the constraint: jobs waited 3-4 s in batch 44793064743.' 'Machines are not the constraint.' \
         'Runs waiting for a machine: 5 runs queued (runs-waiting.py), each started within 40 s.' \
         'The batch waited 12 min for a runner (run 44793064743, created 18:28, started 18:40).' 'R1.8 merged; R1.38 is next.' \
         'Disk is short: 3.2 GB free (df -h).' 'There is no shortage of machines.'; do
  r=$(stop "$m"); ok "passes: $m" "$([ "$r" = pass ] && echo 1)" "got $r"; done
out=$(jq -n --arg m 'Runners are the bottleneck.' '{last_assistant_message:$m}' | bash "$G")
ok "the refusal names the measuring tools" "$(jq -e '.reason | contains("runs-waiting.py")' <<<"$out" >/dev/null && echo 1)" "$out"
ok "stop-check.sh runs the guard in every copy" "$(grep -q 'resource-claim-guard.sh' "$TOOLS/stop-check.sh" && ! grep 'resource-claim-guard' "$TOOLS/stop-check.sh" | grep -q 'LANE" = lead' && echo 1)"
finish
