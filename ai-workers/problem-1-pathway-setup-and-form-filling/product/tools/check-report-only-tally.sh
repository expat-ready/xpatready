#!/usr/bin/env bash
# LR-048 (OS-13): report-only-tally.py counts a report-only workflow's false blocks right. guards.d/OS-13.sh switches its
# false-block, caught, Mergify-head, pull_requests-object and masked rules off in turn, and this test must then fail. US$0, no network.
#   bash product/tools/check-report-only-tally.sh
set -u
. "$(dirname "$0")/guard-test-lib.sh"
P="$TOOLS/report-only-tally.py"
out=$(python3 -I "$P" --self-test 2>&1); r=$?
ok "LR-048: the self-test's planted runs are each counted right (exit 0)" "$([ $r = 0 ] && echo 1)" "$(printf '%s\n' "$out" | grep -m3 'FAIL\|Error')"
D=$(mktemp -d "${TMPDIR:-/tmp}/rot.XXXXXXXX"); A=$(printf 'a%.0s' {1..40}); B=$(printf 'b%.0s' {1..40}); C=$(printf 'c%.0s' {1..40})
printf '%s\n' "$A" > "$D/heads.txt"
cat > "$D/runs.json" <<J
{"workflow_runs": [
 {"id": 1, "path": ".github/workflows/walks.yml", "event": "pull_request", "status": "completed", "conclusion": "failure", "head_sha": "$A", "head_branch": "x", "pull_requests": [{"number": 7, "head": {"sha": "$A"}}], "created_at": "2026-11-28T01:00:00Z"},
 {"id": 3, "path": ".github/workflows/walks.yml", "event": "pull_request", "status": "completed", "conclusion": "failure", "head_sha": "$C", "head_branch": "z", "pull_requests": [{"number": 7, "head": {"sha": "$C"}}], "created_at": "2026-11-28T00:30:00Z"},
 {"id": 2, "path": ".github/workflows/walks.yml", "event": "pull_request", "status": "completed", "conclusion": "failure", "head_sha": "$B", "head_branch": "mergify/merge-queue/q", "pull_requests": [], "created_at": "2026-11-28T02:00:00Z"}]}
J
v=$(python3 -I "$P" "$D/runs.json" --merged "$D/heads.txt"); r=$?
ok "GitHub's object-shaped pull_requests: a red on a merged head is a false block, a red on the same PR's earlier head is caught, a Mergify batch head is not counted" "$([ $r = 0 ] && grep -q '^| walks | 2 | .* | 2 | 1 | 1 | no |$' <<< "$v" && echo 1)" "exit $r: $v"
v=$(python3 -I "$P" "$D/runs.json"; echo "exit $?"); ok "no --merged file: usage, exit 2" "$(grep -q 'exit 2' <<< "$v" && echo 1)" "$v"
echo '{' > "$D/bad.json"; v=$(python3 -I "$P" "$D/bad.json" --merged "$D/heads.txt"; echo "exit $?")
ok "unreadable runs file: bad input, exit 2" "$(grep -q 'bad input' <<< "$v" && grep -q 'exit 2' <<< "$v" && echo 1)" "$v"
rm -rf "$D"
finish
