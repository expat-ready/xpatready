#!/usr/bin/env bash
# B206 part 1 (P-751): Actions runs "waiting for a machine" count only runs created under 6 h ago; older queued runs go on
# one stale line, uncounted, never cancelled. runs-waiting.py on fake GitHub answers, and lead-watch.sh's wiring. US$0, no network.
#   bash product/tools/check-runs-waiting.sh
set -u
. "$(dirname "$0")/guard-test-lib.sh"
T=$(mktemp -d "${TMPDIR:-/tmp}/rwait.XXXXXXXX") && [ -d "$T" ] || { echo "no temp dir: nothing was checked"; exit 2; }; trap 'rm -rf "$T"' EXIT
R="$TOOLS/runs-waiting.py"; NOW=2026-11-20T05:00:00Z
# 20 Nov 10:2x IST as measured: the four runs queued since 12 Nov, plus two fresh ones (1 h and 5 h 59 min old)
cat > "$T/runs.json" <<'EOF'
{"total_count": 6, "workflow_runs": [
 {"id": 51, "status": "queued", "created_at": "2026-11-20T04:00:00Z", "name": "ci"},
 {"id": 52, "status": "queued", "created_at": "2026-11-19T23:01:00Z", "name": "ci"},
 {"id": 43098053168, "status": "queued", "created_at": "2026-11-12T09:10:00Z", "name": "ci"},
 {"id": 43098053155, "status": "queued", "created_at": "2026-11-12T09:09:00Z", "name": "ci"},
 {"id": 43098053395, "status": "queued", "created_at": "2026-11-12T09:12:00Z", "name": "guards"},
 {"id": 43098053377, "status": "queued", "created_at": "2026-11-12T09:11:00Z", "name": "guards"}]}
EOF
out=$(python3 -I "$R" --runs "$T/runs.json" --now $NOW --save "$T/m.json"); r=$?
ok "runs created under 6 h count: 2 waiting, oldest 359 min" "$([ $r = 0 ] && grep -qx 'runs  2 Actions run(s) waiting for a machine (created under 6 h), oldest 359 min' <<< "$out" && echo 1)" "exit $r: $out"
ok "runs queued over 6 h: one stale line, oldest first, all four ids, never cancelled" "$(grep -qx 'stale 4 run(s) queued over 6 h, not counted, never cancelled (P-371), since 12 Nov 14:39 IST: 43098053155 43098053168 43098053377 43098053395' <<< "$out" && echo 1)" "$out"
ok "--save writes the measure for the constraint section (fresh 2, four stale)" "$(jq -e '.fresh == 2 and (.stale | length) == 4 and .oldest_fresh_min == 359' "$T/m.json" >/dev/null && echo 1)" "$(cat "$T/m.json")"
jq '.workflow_runs[1].created_at = "2026-11-19T23:00:00Z"' "$T/runs.json" > "$T/edge.json"
out=$(python3 -I "$R" --runs "$T/edge.json" --now $NOW)
ok "a run exactly 6 h old is stale" "$(grep -q '^runs  1 ' <<< "$out" && grep -q '^stale 5 ' <<< "$out" && echo 1)" "$out"
echo '{"total_count": 1, "workflow_runs": [{"id": 9, "status": "queued", "created_at": null}]}' > "$T/nt.json"
out=$(python3 -I "$R" --runs "$T/nt.json" --now $NOW)
ok "a run with no readable time is counted, never hidden" "$(grep -q '^runs  1 ' <<< "$out" && ! grep -q '^stale' <<< "$out" && echo 1)" "$out"
echo '{"total_count": 0, "workflow_runs": []}' > "$T/none.json"
out=$(python3 -I "$R" --runs "$T/none.json" --now $NOW)
ok "nothing queued: 0 waiting, no stale line" "$(grep -qx 'runs  0 Actions run(s) waiting for a machine (created under 6 h)' <<< "$out" && ! grep -q '^stale' <<< "$out" && echo 1)" "$out"
echo 'not json' > "$T/bad.json"; out=$(python3 -I "$R" --runs "$T/bad.json" --now $NOW --save "$T/b.json"); r=$?
ok "unreadable answer: \"not measured\", never 0 waiting" "$([ $r = 0 ] && grep -q '^runs  waiting for a machine: not measured' <<< "$out" && jq -e .error "$T/b.json" >/dev/null && echo 1)" "exit $r: $out"
echo '{"message": "API rate limit exceeded", "documentation_url": "x"}' > "$T/err.json"; out=$(python3 -I "$R" --runs "$T/err.json" --now $NOW 2>&1)
ok "an error body from GitHub (rate limit, 404, 5xx): \"not measured\", never 0 waiting" "$(grep -q '^runs  waiting for a machine: not measured (no workflow_runs in the answer: API rate limit exceeded' <<< "$out" && echo 1)" "$out"
echo '[1, 2]' > "$T/list.json"; out=$(python3 -I "$R" --runs "$T/list.json" --now $NOW 2>&1)
ok "an answer that is not an object: \"not measured\", no traceback" "$(grep -q 'not measured' <<< "$out" && ! grep -q Traceback <<< "$out" && echo 1)" "$out"
jq '.total_count = 140' "$T/runs.json" > "$T/many.json"; out=$(python3 -I "$R" --runs "$T/many.json" --now $NOW)
ok "more queued than one page read: said on a warn line" "$(grep -q '^warn  140 queued runs, only the newest 6 read' <<< "$out" && echo 1)" "$out"
# P-789 (2): the jam line prints the measured number of running jobs (in_progress jobs across in_progress runs), never "40 jobs at once"
cat > "$T/running.json" <<'EOF'
{"workflow_runs": [{"id": 61, "status": "in_progress"}, {"id": 62, "status": "in_progress"}],
 "jobs": {"61": {"jobs": [{"status": "in_progress"}, {"status": "in_progress"}, {"status": "completed"}, {"status": "queued"}]},
          "62": {"jobs": [{"status": "in_progress"}]}}}
EOF
out=$(python3 -I "$R" --runs "$T/runs.json" --running "$T/running.json" --now $NOW --save "$T/m2.json")
ok "jobs line: 3 jobs running now across 2 in-progress runs (measured)" "$(grep -qx 'jobs  3 job(s) running now across 2 in-progress run(s) (measured, Actions API)' <<< "$out" && jq -e '.running.jobs == 3' "$T/m2.json" >/dev/null && echo 1)" "$out"
jq 'del(.jobs["62"])' "$T/running.json" > "$T/running-bad.json"; out=$(python3 -I "$R" --runs "$T/runs.json" --running "$T/running-bad.json" --now $NOW)
ok "a run whose jobs cannot be read: running jobs not measured, never a count" "$(grep -q '^jobs  running now: not measured (jobs of run 62 unreadable' <<< "$out" && echo 1)" "$out"
ok "no tool here says \"40 jobs at once\": the number is measured" "$(! grep -qE '40 jobs at once' "$R" "$TOOLS/lead-watch.sh" && grep -q 'running_line(rn)' "$R" && echo 1)" "a fixed limit is still printed"
# lead-watch.sh prints the two lines each check and cancels nothing
L="$TOOLS/lead-watch.sh"
ok "lead-watch.sh runs runs-waiting.py and saves its measure" "$(grep -q 'runs-waiting.py" --save "\$STATE_DIR/runs-waiting.json"' "$L" && echo 1)" "no call in $L"
ok "no tool here cancels a run (P-371)" "$(! grep -qE "/cancel|force-cancel|run cancel" "$R" "$L" && echo 1)" "a cancel call found"
# the board's Stuck now count uses the same 6 h rule
ok "cockpit-data.py counts only runs created under 6 h (stale ones apart)" "$(grep -q 'stale = \[x.get("id") for x in qr if (x.get("created_at") or "9") <= old6\]' "$TOOLS/cockpit-data.py" && grep -q 'qn = qd.get("total_count", len(qr)) - len(stale)' "$TOOLS/cockpit-data.py" && echo 1)" "cockpit-data.py still counts every queued run"
finish
