#!/usr/bin/env bash
# E1 (P-772, P-651): lead-watch.sh ACTs when the newest finished scheduled nightly is not green, or when no scheduled
# nightly started in 30 h; nightly-watch.py on fake GitHub answers, its lead-watch.sh wiring, and nightly.yml's parts
# matching ci.yml's default. US$0, no network.
#   bash product/tools/check-nightly-watch.sh
set -u
. "$(dirname "$0")/guard-test-lib.sh"
T=$(mktemp -d "${TMPDIR:-/tmp}/nwatch.XXXXXXXX") && [ -d "$T" ] || { echo "no temp dir: nothing was checked"; exit 2; }; trap 'rm -rf "$T"' EXIT
W="$TOOLS/nightly-watch.py"; NOW=2026-11-20T10:00:00Z
# 20 Nov as measured: the scheduled run 44656287758 cancelled (3 parts cut at 59 min), a hand-started green re-test after it
cat > "$T/runs.json" <<'EOF'
{"total_count": 3, "workflow_runs": [
 {"id": 44700000000, "event": "workflow_dispatch", "status": "completed", "conclusion": "success", "created_at": "2026-11-20T05:00:00Z", "head_sha": "aaaaaaaaaaaa"},
 {"id": 44656287758, "event": "schedule", "status": "completed", "conclusion": "cancelled", "created_at": "2026-11-20T01:48:34Z", "head_sha": "418be9f1a0996d80"},
 {"id": 44440440980, "event": "schedule", "status": "completed", "conclusion": "failure", "created_at": "2026-11-19T01:54:54Z", "head_sha": "9d440b2f48"}]}
EOF
cat > "$T/jobs.json" <<'EOF'
{"jobs": [
 {"name": "plan", "status": "completed", "conclusion": "success", "started_at": "2026-11-20T01:48:40Z", "completed_at": "2026-11-20T01:49:00Z"},
 {"name": "packs", "status": "completed", "conclusion": "skipped"},
 {"name": "suites (3)", "status": "completed", "conclusion": "cancelled", "started_at": "2026-11-20T01:49:00Z", "completed_at": "2026-11-20T02:48:00Z"},
 {"name": "suites (5)", "status": "completed", "conclusion": "cancelled", "started_at": "2026-11-20T01:49:00Z", "completed_at": "2026-11-20T02:48:00Z"},
 {"name": "suites (1)", "status": "completed", "conclusion": "success", "started_at": "2026-11-20T01:49:00Z", "completed_at": "2026-11-20T02:20:00Z"}]}
EOF
out=$(python3 -I "$W" --runs "$T/runs.json" --jobs "$T/jobs.json" --now $NOW); r=$?
ok "a cancelled scheduled nightly is one ACT line naming the run and each part not green" "$([ $r = 0 ] && [ "$(grep -c '^ACT' <<< "$out")" = 1 ] && grep -q '^ACT   nightly of 20 Nov 07:18 IST ended cancelled on 418be9f1a (run 44656287758): suites (3) cancelled 59 min; suites (5) cancelled 59 min: ' <<< "$out" && echo 1)" "exit $r: $out"
ok "a hand-started green run after it does not hide the red night" "$(! grep -q 44700000000 <<< "$out" && echo 1)" "$out"
jq '.workflow_runs[1].conclusion = "failure"' "$T/runs.json" > "$T/f.json"
out=$(python3 -I "$W" --runs "$T/f.json" --jobs "$T/jobs.json" --now $NOW)
ok "a failed scheduled nightly is an ACT line" "$(grep -q '^ACT   nightly of 20 Nov 07:18 IST ended failure' <<< "$out" && echo 1)" "$out"
jq '.workflow_runs[1].conclusion = "success"' "$T/runs.json" > "$T/g.json"
out=$(python3 -I "$W" --runs "$T/g.json" --jobs /nonexistent --now $NOW)
ok "a green scheduled nightly: no ACT, one night line" "$(! grep -q '^ACT' <<< "$out" && grep -qx 'night nightly of 20 Nov 07:18 IST green on 418be9f1a (run 44656287758)' <<< "$out" && echo 1)" "$out"
jq '.workflow_runs = [{"id": 9, "event": "schedule", "status": "in_progress", "conclusion": null, "created_at": "2026-11-20T09:00:00Z"}] + .workflow_runs' "$T/runs.json" > "$T/run.json"
out=$(python3 -I "$W" --runs "$T/run.json" --jobs "$T/jobs.json" --now $NOW)
ok "a run still going is said, and the finished one before it is judged" "$(grep -q '^night nightly 9 started 20 Nov 14:30 IST is still running' <<< "$out" && grep -q '^ACT   nightly of 20 Nov 07:18 IST ended cancelled' <<< "$out" && echo 1)" "$out"
out=$(python3 -I "$W" --runs "$T/g.json" --now 2026-11-21T08:00:00Z)
ok "no scheduled start in 30 h is an ACT (the schedule dropped, as on 18 Nov)" "$(grep -q '^ACT   nightly: no scheduled run started in 30 h (newest 20 Nov 07:18 IST)' <<< "$out" && echo 1)" "$out"
echo '{"total_count": 0, "workflow_runs": []}' > "$T/none.json"; out=$(python3 -I "$W" --runs "$T/none.json" --now $NOW)
ok "no scheduled run at all is an ACT, never green" "$(grep -q '^ACT   nightly: no scheduled run started' <<< "$out" && ! grep -q green <<< "$out" && echo 1)" "$out"
out=$(python3 -I "$W" --runs "$T/runs.json" --jobs /nonexistent --now $NOW 2>&1)
ok "parts unreadable: the ACT stands, said so" "$(grep -q '^ACT   nightly of 20 Nov 07:18 IST ended cancelled .*parts not read' <<< "$out" && echo 1)" "$out"
echo '{"message": "API rate limit exceeded"}' > "$T/err.json"; out=$(python3 -I "$W" --runs "$T/err.json" --now $NOW 2>&1); r=$?
ok "an error body from GitHub: a warn line, never green, no traceback" "$([ $r = 0 ] && grep -q '^warn  nightly: not measured (no workflow_runs in the answer: API rate limit exceeded' <<< "$out" && ! grep -qE 'green|Traceback' <<< "$out" && echo 1)" "exit $r: $out"
echo 'not json' > "$T/bad.json"; out=$(python3 -I "$W" --runs "$T/bad.json" --now $NOW 2>&1)
ok "unreadable answer: a warn line, no traceback" "$(grep -q '^warn  nightly: not measured' <<< "$out" && ! grep -q Traceback <<< "$out" && echo 1)" "$out"
# lead-watch.sh counts its ACT lines; nothing here cancels or re-runs a run (P-371)
L="$TOOLS/lead-watch.sh"
ok "lead-watch.sh runs nightly-watch.py and counts its ACT lines" "$(grep -q 'nw=\$(python3 -I "\$TOOLS/nightly-watch.py"' "$L" && grep -q 'act=\$((act + \$(grep -c .^ACT. <<<"\$nw")))' "$L" && echo 1)" "no call, or its ACT lines not counted, in $L"
ok "no tool here cancels or re-runs a run (P-371)" "$(! grep -qE '/cancel|force-cancel|run cancel|/rerun' "$W" && echo 1)" "a cancel or re-run call found"
# nightly.yml splits the suites like a merge-queue batch: as many parts as ci.yml's default (E1: 8 parts ran out of time)
Y="$TOOLS/../../../../.github/workflows"
ci_n=$(grep -oE 'n="\$\{SHARDS_VAR:-[0-9]+\}"' "$Y/ci.yml" | grep -oE '[0-9]+' | head -1)
ny_n=$(sed -n '/^  suites:/,/^  [a-z-]*:$/p' "$Y/nightly.yml" | grep -E '^      N: [0-9]+$' | grep -oE '[0-9]+')
ny_m=$(sed -n '/^  suites:/,/^  [a-z-]*:$/p' "$Y/nightly.yml" | grep -E '^        shard: \[' | grep -oE '[0-9]+' | wc -l | tr -d ' ')
ok "nightly.yml's suites run on as many parts as ci.yml's default (ci $ci_n, nightly N=$ny_n, matrix $ny_m)" "$([ -n "$ci_n" ] && [ "$ci_n" = "$ny_n" ] && [ "$ny_n" = "$ny_m" ] && echo 1)" "ci.yml default ${ci_n:-?}, nightly N ${ny_n:-?}, matrix ${ny_m:-?} parts"
finish
