#!/bin/bash
# The Lead's by-hand merge (P-791 (2), (4); founder 22 Nov). Lesson: the Lead's by-hand merge of #2754 at 12:1x IST moved
# main under the merge queue and restarted 9 running batches. This tool never merges: it counts the batches running
# (queue-batches.py) and, when none runs or a reason is given, prints the steps for the Lead to run by hand. Step 1 asks
# for the Lead's "Lead read the diff: <head sha>" (P-423) and says product code is never merged by hand (P-691); step 3
# offers the by-hand merge only after that line (F1, Lead 4 on #2590, 23 Nov).
#   bash product/tools/lead-merge.sh <PR number> [--reason "<text>"]
# Refused (exit 1): no PR number; any batch running and no --reason; the batch count unreadable and no --reason.
# Env (tests): QB_PULLS, QB_CHECKS (queue-batches.py --pulls / --checks). Test: check-lead-merge.sh. US$0, read-only.
TOOLS="$(cd "$(dirname "$0")" && pwd)"
pr=""; reason=""
while [ $# -gt 0 ]; do
  case "$1" in
    --reason) reason="${2:-}"; shift 2 || shift;;
    *) [ -z "$pr" ] && pr="$1"; shift;;
  esac
done
case "$pr" in ''|*[!0-9]*) echo "refused: give the PR number: lead-merge.sh <PR> [--reason \"<text>\"]" >&2; exit 1;; esac
line=$(python3 -I "$TOOLS/queue-batches.py" ${QB_PULLS:+--pulls "$QB_PULLS"} ${QB_CHECKS:+--checks "$QB_CHECKS"} 2>&1)
echo "$line"
n=$(sed -nE 's/^batches ([0-9]+) merge-queue batch.*/\1/p' <<<"$line" | head -1); [ -n "$n" ] || n="?"   # any line (a warn may come first); none: not counted
blank=$(tr -d '[:space:]' <<<"$reason")   # spaces, tabs or newlines alone are no reason
if [ "$n" != 0 ] && [ -z "$blank" ]; then
  if [ "$n" = "?" ]; then echo "refused: the running batches could not be counted; a manual merge may restart them. Wait for the queue, or give --reason \"<why now>\" (P-791 (4))" >&2
  else echo "refused: $n merge-queue batch(es) running; a manual merge to main now restarts $n batches. Wait until none runs, or give --reason \"<why now>\" (P-791 (4))" >&2; fi
  exit 1
fi
[ "$n" != 0 ] && echo "reason given with $n batch(es) running: $reason (say it in the merge comment and in STATE)"
cat <<EOF
Steps for #$pr (run them yourself; this tool merges nothing):
  1. read #$pr's head: green checks, the reviewer's "Reviewer: Approve <head sha>" for that head, and your own "Lead read the diff: <head sha>" naming the same full head (P-423); product code is never merged by hand: a by-hand merge is only for a pipeline or CI fix while the queue is broken (P-691)
  2. prefer the queue: label "review: approved" and let Mergify merge it (no batch restarts)
  3. only if a by-hand merge is needed, and only after step 1's "Lead read the diff: <head sha>" names the head you merge: merge #$pr yourself on GitHub (its "Merge pull request" button)
  4. comment on #$pr: "Merged by hand by the Lead: ${reason:-no batch running}"
EOF
exit 0
