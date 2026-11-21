#!/usr/bin/env bash
# CI-SPEED-3 (founder A254, 21 Nov): queue-depth.py on fake batch data. Under 10% failed gives 12, over 20% gives 6,
# 10-20% holds the current value, unreadable data gives exit 2 and no change; and lead-watch.sh's ACT line. US$0, no network.
#   bash product/tools/check-queue-depth.sh
set -u
. "$(dirname "$0")/guard-test-lib.sh"
T=$(mktemp -d "${TMPDIR:-/tmp}/qdepth.XXXXXXXX") && [ -d "$T" ] || { echo "no temp dir: nothing was checked"; exit 2; }; trap 'rm -rf "$T"' EXIT
Q="$TOOLS/queue-depth.py"
mg() { printf 'merge_queue:\n  max_parallel_checks: %s   # note\n  mode: parallel\n' "$1" > "$T/m$1.yml"; echo "$T/m$1.yml"; }
# runs FAILED [TOTAL] [EXTRA_JSON]: TOTAL batches (default 20) on their own branches, newest first; the first FAILED fail
runs() { python3 -I -c '
import json, sys
f, n = int(sys.argv[1]), int(sys.argv[2]); extra = json.loads(sys.argv[3])
r = [{"head_branch": "mergify/merge-queue/b%02d" % i, "status": "completed", "conclusion": "failure" if i < f else "success",
      "run_started_at": "2026-11-21T%02d:%02d:00Z" % (10 - i // 60, 59 - i % 60)} for i in range(n)]
print(json.dumps({"total_count": len(r) + len(extra), "workflow_runs": extra + r}))' "$1" "${2:-20}" "${3:-[]}" > "$T/r.json"; echo "$T/r.json"; }
run() { out=$(python3 -I "$Q" --runs "$1" --mergify "$2" 2>&1); rc=$?; }
has() { [ "$rc" = "$1" ] && grep -qE "$2" <<< "$out" && echo 1; }

run "$(runs 1)" "$(mg 6)";   ok "1 of 20 failed (5%), at 6: want 12, exit 3" "$(has 3 '^rate=5% current=6 want=12 reason=1 of 20 batches failed, under 10%: set 12$')" "exit $rc: $out"
run "$(runs 0)" "$(mg 12)";  ok "0 of 20 failed, at 12: no change, exit 0" "$(has 0 '^rate=0% current=12 want=12 ')" "exit $rc: $out"
run "$(runs 5)" "$(mg 12)";  ok "5 of 20 failed (25%), at 12: want 6, exit 3" "$(has 3 '^rate=25% current=12 want=6 reason=5 of 20 batches failed, over 20%: set 6$')" "exit $rc: $out"
run "$(runs 10)" "$(mg 6)";  ok "10 of 20 failed, at 6: no change, exit 0" "$(has 0 '^rate=50% current=6 want=6 ')" "exit $rc: $out"
for f in 2 3 4; do for c in 6 12; do run "$(runs $f)" "$(mg $c)"
  ok "$f of 20 failed ($((f * 5))%, inside the band), at $c: holds $c, exit 0" "$(has 0 "^rate=$((f * 5))% current=$c want=$c reason=.*band: hold$")" "exit $rc: $out"; done; done
ok "the source is named, and split retries are said to count as batches" "$(grep -qE '^source file .*; a split retry counts as a batch \(its own run\)$' <<< "$out" && echo 1)" "$out"
# what counts as a batch outcome
X='[{"head_branch":"mergify/merge-queue/zz","status":"completed","conclusion":"cancelled","run_started_at":"2026-11-21T11:00:00Z"},
    {"head_branch":"claude/runtime-x","status":"completed","conclusion":"failure","run_started_at":"2026-11-21T11:01:00Z"},
    {"head_branch":"mergify/merge-queue/b00","status":"completed","conclusion":"success","run_started_at":"2026-11-21T11:02:00Z"}]'
run "$(runs 1 20 "$X")" "$(mg 12)"
ok "cancelled batch runs and non-batch branches are no outcome; a re-run's newest result wins" "$(has 0 '^rate=0% current=12 want=12 ')" "exit $rc: $out"
X='[{"head_branch":"mergify/merge-queue/c1","status":"completed","conclusion":"cancelled","run_started_at":"2026-11-21T11:00:00Z"},
    {"head_branch":"mergify/merge-queue/c2","status":"completed","conclusion":"skipped","run_started_at":"2026-11-21T11:01:00Z"},
    {"head_branch":"mergify/merge-queue/c3","status":"completed","conclusion":"neutral","run_started_at":"2026-11-21T11:02:00Z"},
    {"head_branch":"mergify/merge-queue/c4","status":"completed","conclusion":"stale","run_started_at":"2026-11-21T11:03:00Z"},
    {"head_branch":"mergify/merge-queue/c5","status":"completed","conclusion":"action_required","run_started_at":"2026-11-21T11:04:00Z"}]'
run "$(runs 0 19 "$X")" "$(mg 6)"
ok "19 batches plus branches with only cancelled, skipped, neutral, stale or action_required runs: still 19, exit 2" "$(has 2 'unreadable, no change: only 19 finished batch')" "exit $rc: $out"
X='[{"head_branch":"mergify/merge-queue/b00","status":"completed","conclusion":"cancelled","run_started_at":"2026-11-21T11:02:00Z"}]'
run "$(runs 1 20 "$X")" "$(mg 6)"; ok "a newer cancelled run does not hide the batch's failure" "$(has 3 '^rate=5% current=6 want=12 ')" "exit $rc: $out"
X='[{"head_branch":7,"status":"completed","conclusion":"failure","run_started_at":"2026-11-21T11:02:00Z"}]'
run "$(runs 0 20 "$X")" "$(mg 12)"; ok "a branch that is not text is no batch, no traceback" "$(has 0 '^rate=0% current=12 want=12 ')" "exit $rc: $out"
echo '{"workflow_runs":[{"head_branch":"mergify/merge-queue/a","status":"completed","conclusion":"success","run_started_at":"x"},{"head_branch":"mergify/merge-queue/a","status":"completed","conclusion":"failure","run_started_at":5}]}' > "$T/odd.json"
run "$T/odd.json" "$(mg 12)"; ok "odd field types: exit 2 or a clean answer, never a traceback" "$([ "$rc" != 1 ] && ! grep -q Traceback <<< "$out" && echo 1)" "exit $rc: $out"
X='[{"head_branch":"mergify/merge-queue/b00","status":"completed","conclusion":"timed_out","run_started_at":"2026-11-21T11:02:00Z"}]'
run "$(runs 0 20 "$X")" "$(mg 6)"; ok "timed_out counts as failed" "$(has 3 '^rate=5% current=6 want=12 ')" "exit $rc: $out"
run "$(runs 0 30 "$(python3 -I -c 'import json; print(json.dumps([{"head_branch":"mergify/merge-queue/old%d" % i,"status":"completed","conclusion":"failure","run_started_at":"2026-11-20T00:%02d:00Z" % i} for i in range(9)]))')")" "$(mg 6)"
ok "only the newest 20 batches count (9 older failures ignored)" "$(has 3 '^rate=0% current=6 want=12 ')" "exit $rc: $out"
# unreadable: exit 2, want = current, never a change
echo 'not json' > "$T/bad.json"; run "$T/bad.json" "$(mg 12)"
ok "runs not JSON: exit 2, no change" "$(has 2 '^rate=\? current=12 want=12 reason=unreadable, no change: ')" "exit $rc: $out"
echo '{"message":"API rate limit exceeded"}' > "$T/err.json"; run "$T/err.json" "$(mg 6)"
ok "an error body from GitHub: exit 2, no change" "$(has 2 'want=6 reason=unreadable, no change: no workflow_runs in the answer: API rate limit')" "exit $rc: $out"
run "$(runs 0 19)" "$(mg 6)"; ok "fewer than 20 batches: exit 2, no change" "$(has 2 'want=6 reason=unreadable, no change: only 19 finished batch')" "exit $rc: $out"
run "$T/missing.json" "$(mg 6)"; ok "runs file missing: exit 2" "$(has 2 'unreadable, no change: cannot read ')" "exit $rc: $out"
PY=$(command -v python3); out=$(env -u GH_TOKEN -u GITHUB_TOKEN PATH="$T/none" GH_REPO=o/r "$PY" -I "$Q" --mergify "$(mg 12)" 2>&1); rc=$?
ok "gh and curl missing (live read): exit 2, no change, no traceback" "$([ $rc = 2 ] && grep -q '^rate=? current=12 want=12 reason=unreadable, no change: ' <<< "$out" && ! grep -q Traceback <<< "$out" && echo 1)" "exit $rc: $out"
printf 'merge_queue:\n  mode: parallel\n' > "$T/nomg.yml"; run "$(runs 5)" "$T/nomg.yml"
ok "max_parallel_checks unreadable: exit 2, no change" "$(has 2 '^rate=\? current=\? want=\? reason=unreadable, no change: max_parallel_checks not found')" "exit $rc: $out"
ok "no traceback in any answer" "$(! grep -q Traceback <<< "$out" && echo 1)" "$out"
# lead-watch.sh: its one line, run as written, prints the ACT line on exit 3 and nothing on 0 or 2
L="$TOOLS/lead-watch.sh"; line=$(grep -m1 '^qd=\$(python3 -I "\$TOOLS/queue-depth.py"' "$L")
ok "lead-watch.sh calls queue-depth.py" "$([ -n "$line" ] && echo 1)" "no call line in $L"
lw() { ( act=0; ACT() { echo "ACT   $1"; }; seen() { :; }; QUEUE_DEPTH_RUNS=$1; QUEUE_DEPTH_MERGIFY=$2; eval "$line" ) 2>&1; }
o=$(lw "$(runs 5)" "$(mg 12)")
ok "exit 3: ACT queue depth: set max_parallel_checks to 6 (rate 25% over last 20 batches)" "$(grep -qx 'ACT   queue depth: set max_parallel_checks to 6 (rate 25% over last 20 batches)' <<< "$o" && echo 1)" "$o"
o=$(lw "$(runs 3)" "$(mg 12)"); ok "inside the band: no ACT line" "$(! grep -q '^ACT' <<< "$o" && grep -q '^rate=15%' <<< "$o" && echo 1)" "$o"
o=$(lw "$T/bad.json" "$(mg 12)"); ok "unreadable: no ACT line, the reason is printed" "$(! grep -q '^ACT' <<< "$o" && grep -q 'unreadable' <<< "$o" && echo 1)" "$o"
ok "neither tool edits .mergify.yml (the Lead lands each switch as a PR)" "$(! grep -qE "open\([^)]*['\"]w|write_text|sed -i[^\n]*mergify" "$Q" && echo 1)" "a write found in $Q"
finish
