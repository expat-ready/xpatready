#!/usr/bin/env bash
# P-729 (2): batch-fail-alert.py on a fixture failed batch (title, jobs, job logs, member files) gives the expected
# comment and likely-PR call, posts once per member and never twice for one run; and its workflow fires on a failed ci
# run of a merge-queue branch only. test_batch_fail_alert.py; no network, US$0. Run by check-guards.sh (guard 26).
#   bash product/tools/check-batch-fail-alert.sh
set -u
T="$(cd "$(dirname "$0")" && pwd)"; W="$T/../../../../.github/workflows/batch-fail-alert.yml"; bad=0
python3 -I "$T/test_batch_fail_alert.py" 2>&1 || bad=1
for want in "workflows: \[ci\]" "types: \[completed\]" "conclusion == 'failure'" "startsWith(github.event.workflow_run.head_branch, 'mergify/merge-queue/')" "ref: main" "pull-requests: write"; do
  grep -q -- "$want" "$W" || { echo "FAIL  batch-fail-alert.yml lacks: $want"; bad=1; }; done
grep -qE "issues: write|contents: write|labels" "$W" && { echo "FAIL  batch-fail-alert.yml asks for more than it needs"; bad=1; }
[ $bad = 0 ] && echo "batch-fail-alert: all checks pass" || echo "batch-fail-alert: FAILED"
exit $bad
