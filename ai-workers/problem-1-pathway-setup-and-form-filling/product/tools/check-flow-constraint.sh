#!/usr/bin/env bash
# ENF-738 (P-738; B206 part 4, P-751): lead-watch.sh's constraint section. flow-constraint.py on made-up facts: the six
# measures print, the one constraint is the first over its bar in flow order, and anything unread is said, never passed.
# US$0, no network.   bash product/tools/check-flow-constraint.sh
set -u
. "$(dirname "$0")/guard-test-lib.sh"
T=$(mktemp -d "${TMPDIR:-/tmp}/flowc.XXXXXXXX") && [ -d "$T" ] || { echo "no temp dir: nothing was checked"; exit 2; }; trap 'rm -rf "$T"' EXIT
C="$TOOLS/flow-constraint.py"; NOW=2026-11-20T06:00:00Z
# facts: 4 batches in 6 h (walls 30, 40, 50, 70 min); batch run 3 failed, its batch PR #900 holds #11 (merged since) and #12 (open)
facts() {  # facts <file> [jq edit]
  jq -n '{now: "2026-11-20T06:00:00Z",
    batches: [{id: 1, conclusion: "success", started: "2026-11-20T01:00:00Z", updated: "2026-11-20T01:30:00Z", pr: 901},
              {id: 2, conclusion: "success", started: "2026-11-20T02:00:00Z", updated: "2026-11-20T02:40:00Z", pr: 902},
              {id: 3, conclusion: "failure", started: "2026-11-20T03:00:00Z", updated: "2026-11-20T03:50:00Z", pr: 900},
              {id: 4, conclusion: "success", started: "2026-11-20T04:00:00Z", updated: "2026-11-20T05:10:00Z", pr: 903}],
    newest_jobs: {run: 4, jobs: [{name: "fast", min: 3}, {name: "shard (7)", min: 41.4}, {name: "types", min: null}]},
    pulls: {"900": {title: "merge queue: checking #11 + #12 together on main", body: "", state: "closed", login: "mergify[bot]"},
            "11": {title: "a", state: "closed", merged_at: "2026-11-20T04:30:00Z"}, "12": {title: "b", state: "open", merged_at: null}},
    merged: [{number: 11, approved_at: "2026-11-20T03:00:00Z", merged_at: "2026-11-20T04:30:00Z"},
             {number: 13, approved_at: "2026-11-20T04:40:00Z", merged_at: "2026-11-20T05:10:00Z"},
             {number: 14, approved_at: null, merged_at: "2026-11-19T10:00:00Z"}]}' | jq "${2:-.}" > "$1"; }
echo '{"fresh": 1, "oldest_fresh_min": 4, "stale": [{"id": 43098053168}, {"id": 43098053155}]}' > "$T/rw.json"
echo '{"freshness": {"generated_at": "2026-11-20T05:55:00Z"}, "first": {"today": {"proven": 3, "goal": 10, "short": 7, "waiting": 5}}}' > "$T/board.json"
run() { out=$(python3 -I "$C" --facts "$1" --runs-waiting "${RW:-$T/rw.json}" --board "${BD:-$T/board.json}" --now "$NOW" --save "$T/m.json" 2>&1); r=$?; act=$(grep '^ACT' <<< "$out"); }
facts "$T/f.json"; run "$T/f.json"
ok "section heading with the IST time" "$(grep -qx 'constraint (P-738, ENF-738) measured 20 Nov 11:30 IST' <<< "$out" && echo 1)" "$out"
ok "batch: count, median wall, the newest batch's longest part" "$(grep -qx '  batch     4 batch(es) started in the last 6 h and ended, median wall 45 min; newest.s longest part shard (7) 41 min (run 4)' <<< "$out" && echo 1)" "$out"
ok "machines: runs-waiting.py's measure (part 1), stale runs apart" "$(grep -qx '  machines  1 run(s) waiting (created under 6 h), oldest 4 min; 2 stale, not counted' <<< "$out" && echo 1)" "$out"
ok "failed: each failed batch with its members, the still-open one named culprit" "$(grep -qx '  failed    1 of 4 batch(es) failed in 6 h: run 3: #11, #12 (culprit: still open)' <<< "$out" && echo 1)" "$out"
ok "merge: approved to merged median over PRs merged in 24 h (no label time: left out)" "$(grep -qx '  merge     approved to merged median 60 min (n=2, merged in 24 h)' <<< "$out" && echo 1)" "$out"
ok "rate: merges per hour over 3 h" "$(grep -qx '  rate      0.7 merges per hour (last 3 h, 2 merges)' <<< "$out" && echo 1)" "$out"
ok "proven: the board's Today card with its age" "$(grep -qx '  proven    Proven today 3 of 10 (7 short), 5 Built waiting for qa (board 5 min old)' <<< "$out" && echo 1)" "$out"
ok "exactly one ACT line, the constraint" "$([ "$(grep -c '^ACT' <<< "$out")" = 1 ] && echo 1)" "$out"
ok "1 of 4 failed (25%, bar 10%): the constraint is failed batches, culprit #12, the P-731 way back" "$(grep -q '^ACT   constraint: failed batches — 1 of 4 failed in 6 h (bar 10%), culprits #12: send each culprit back' <<< "$act" && grep -q 'Batch failures covered:' <<< "$act" && echo 1)" "$act"
ok "--save writes the measures" "$(jq -e '.failed.n == 1 and .batch.median_min == 45 and .machines.fresh == 1' "$T/m.json" >/dev/null && echo 1)" "$(cat "$T/m.json")"
echo '{"fresh": 6, "oldest_fresh_min": 22, "stale": []}' > "$T/rw2.json"; RW="$T/rw2.json" run "$T/f.json"
ok "machines over the bar (oldest 22 min, bar 15) come first in flow order" "$(grep -q '^ACT   constraint: machines — 6 run(s) waiting, oldest 22 min' <<< "$act" && echo 1)" "$act"
facts "$T/f2.json" '.batches[2].conclusion = "success"'; run "$T/f2.json"
ok "no failed batch, median wall 45 min: not over 45, so approved to merged (60, bar 60) is not over either: proof is named" "$(grep -q '^ACT   constraint: proof — Proven today 3 of 10' <<< "$act" && echo 1)" "$act"
facts "$T/f3.json" '.batches[2].conclusion = "success" | .batches[0].updated = "2026-11-20T02:30:00Z"'; run "$T/f3.json"
ok "batch time over the bar: the longest part is the action" "$(grep -q '^ACT   constraint: batch time — median wall 60 min (bar 45): split or speed up the longest part, shard (7) (41 min)' <<< "$act" && echo 1)" "$act"
facts "$T/f4.json" '.batches[2].conclusion = "success" | .merged[1].approved_at = "2026-11-20T02:00:00Z"'; run "$T/f4.json"
ok "approved to merged over the bar (median 140 min)" "$(grep -q '^ACT   constraint: approved to merged — median 140 min (bar 60)' <<< "$act" && echo 1)" "$act"
facts "$T/f5.json" '.batches = [] | .newest_jobs = null | .merged = [.merged[2]]'; run "$T/f5.json"
ok "no batch and no merge in 3 h: supply is the constraint" "$(grep -q '^ACT   constraint: supply — no merge and no batch in 3 h' <<< "$act" && echo 1)" "$act"
facts "$T/f6.json" '.batches = {error: "HTTP 502"}'; run "$T/f6.json"
ok "batches unreadable: said on both lines, and the constraint is not measured, never \"none\"" "$(grep -q '^  batch     not measured (HTTP 502)' <<< "$out" && grep -q '^  failed    not measured (HTTP 502)' <<< "$out" && grep -q '^ACT   constraint: not measured — failed, batch unreadable' <<< "$act" && echo 1)" "$out"
facts "$T/f7.json" '.pulls = {error: "rate limit"}'; run "$T/f7.json"
ok "PRs unreadable: the failed batch says its members are unreadable" "$(grep -q 'run 3: members unreadable' <<< "$out" && echo 1)" "$out"
RW="$T/none.json" BD="$T/none.json" run "$T/f2.json"
ok "no runs-waiting.json and no board: both lines say not measured; the constraint says so too" "$(grep -q '^  machines  not measured (runs-waiting.json not found' <<< "$out" && grep -q '^  proven    not measured' <<< "$out" && grep -q '^ACT   constraint: not measured — machines' <<< "$act" && echo 1)" "$out"
echo 'not json' > "$T/bad.json"; run "$T/bad.json"
ok "facts that cannot be read: one line and still one ACT, exit 0" "$([ $r = 0 ] && grep -q 'could not be measured' <<< "$out" && [ "$(grep -c '^ACT' <<< "$out")" = 1 ] && echo 1)" "exit $r: $out"
facts "$T/f8.json" '.batches[2].conclusion = "success" | .batches[0].updated = "2026-11-20T01:20:00Z"'; BD="$T/b2.json"; echo '{"first": {"today": {"proven": 10, "goal": 10, "short": 0, "waiting": 0}}}' > "$T/b2.json"; run "$T/f8.json"; BD=""
ok "nothing over its bar: \"none over its bar\", still one ACT" "$(grep -q '^ACT   constraint: none over its bar' <<< "$act" && echo 1)" "$act"
# part 4 review M1: an unread or missing part never ends as "none over its bar"
facts "$T/f9.json" '.batches[2].conclusion = "success" | .batches[0].updated = "2026-11-20T01:20:00Z"'; BD="$T/none.json" run "$T/f9.json"
ok "board unreadable, all else fine and under its bar: \"not measured — proven\", never none" "$(grep -q '^ACT   constraint: not measured — proven' <<< "$act" && echo 1)" "$act"
echo '{"freshness": {"generated_at": "2026-11-20T04:00:00Z"}, "first": {"today": {"proven": 10, "goal": 10, "short": 0, "waiting": 0}}}' > "$T/b3.json"; BD="$T/b3.json" run "$T/f9.json"
ok "board 120 min old: stale, not this check's measure" "$(grep -q '^  proven    not measured (the board is 120 min old' <<< "$out" && grep -q '^ACT   constraint: not measured — proven' <<< "$act" && echo 1)" "$out"
echo '{"freshness": {"generated_at": "2026-11-20T05:40:00Z"}, "first": {"today": {"proven": 3, "goal": 10, "short": 7, "waiting": 5}}}' > "$T/b20.json"; BD="$T/b20.json" run "$T/f9.json"
ok "board 20 min old: over the 10-min limit (P-803, FRESH_MAX_MIN), not measured, never \"Proven today\"" "$(grep -q '^  proven    not measured (the board is 20 min old, over 10' <<< "$out" && ! grep -q 'Proven today' <<< "$out" && grep -q '^ACT   constraint: not measured — proven' <<< "$act" && echo 1)" "$out"
out=$(FRESH_MAX_MIN=30 python3 -I "$C" --facts "$T/f9.json" --runs-waiting "$T/rw.json" --board "$T/b20.json" --now "$NOW" 2>&1)
ok "FRESH_MAX_MIN=30 (lead-watch exports it): the same board 20 min old is read" "$(grep -q '^  proven    Proven today 3 of 10' <<< "$out" && echo 1)" "$out"
ok "lead-watch.sh passes step 11's \$BOARD to step 15 (a refused board reads as not measured)" "$(grep -q 'flow-constraint.py" --runs-waiting "\$STATE_DIR/runs-waiting.json" --board "\$BOARD"' "$TOOLS/lead-watch.sh" && echo 1)" "step 15 reads the board itself"
facts "$T/f10.json" '.batches[2].conclusion = "success" | .batches[0].updated = "2026-11-20T01:20:00Z" | .merged[0].approved_at = null | .merged[1].approved_at = null'; BD="$T/b2.json" run "$T/f10.json"
ok "merges with no approval time found: approved to merged is not measured, never under its bar" "$(grep -q '^  merge     not measured (merges with no approval time' <<< "$out" && grep -q '^ACT   constraint: not measured — merge' <<< "$act" && echo 1)" "$out"
ok "--save keeps the same verdict as the lines (saved after pick)" "$(jq -e '.merge.error' "$T/m.json" >/dev/null && echo 1)" "$(cat "$T/m.json")"
facts "$T/f14.json" '.batches[2].conclusion = "success" | .batches[0].updated = "2026-11-20T01:20:00Z" | .merged = [{number: 15, approved_at: null, merged_at: "2026-11-20T01:00:00Z"}]'; BD="$T/b2.json" run "$T/f14.json"
ok "a merge 5 h ago with no approval time, none in 3 h: still not measured (the 24 h count)" "$(grep -q '^  merge     not measured' <<< "$out" && echo 1)" "$out"
echo '{"fresh": 3, "oldest_fresh_min": null, "stale": []}' > "$T/rw3.json"; RW="$T/rw3.json" BD="$T/b2.json" run "$T/f9.json"
ok "runs waiting with no age: machines not measured" "$(grep -q '^ACT   constraint: not measured — machines' <<< "$act" && echo 1)" "$act"
touch -t 202611190000 "$T/rw.json"; BD="$T/b2.json" run "$T/f9.json"; touch "$T/rw.json"
ok "runs-waiting.json left from an earlier check (over 45 min old): machines not measured" "$(grep -q '^  machines  not measured (runs-waiting.json is ' <<< "$out" && echo 1)" "$out"
# part 4 review M2: a member re-queued in a later batch (Mergify splits a failed batch) is not a culprit
facts "$T/f11.json" '.pulls["11"] = {title: "a", state: "open", merged_at: null} | .pulls["905"] = {title: "merge queue: checking #11 on main", body: "", state: "open", login: "mergify[bot]", ref: "mergify/merge-queue/x"}'; run "$T/f11.json"
ok "two open members, #11 re-queued in batch PR #905: only #12 is the culprit" "$(grep -q 'run 3: #11 (re-queued), #12 (culprit: still open)' <<< "$out" && grep -q 'culprits #12:' <<< "$act" && echo 1)" "$out"
facts "$T/f12.json" '.batches[2].pr = null | .batches[2].head = "mergify/merge-queue/f3" | .pulls["900"].ref = "mergify/merge-queue/f3"'; run "$T/f12.json"
ok "a batch run with no pull_requests (Mergify deleted its branch): its batch PR is found by branch" "$(grep -q 'run 3: #11, #12 (culprit: still open)' <<< "$out" && echo 1)" "$out"
facts "$T/f13.json" '.batches[0].started = "2026-11-19T23:30:00Z" | .batches[0].updated = "2026-11-20T00:10:00Z" | .batches[1:] = [] | .merged = [.merged[2]] | .newest_jobs = null'; BD="$T/b2.json" run "$T/f13.json"
ok "a batch 4-6 h ago, nothing since and no merge in 3 h: supply (the same 3 h window)" "$(grep -q '^ACT   constraint: supply' <<< "$act" && echo 1)" "$act"
# part 4 review M3: gather() on GitHub's real shapes, through a stand-in gh.sh (REST runs, jobs, pulls; GraphQL merged PRs)
mkdir -p "$T/gh"; cat > "$T/gh/gh.sh" <<'GH'
#!/usr/bin/env bash
case "$*" in
  *"actions/workflows/ci.yml/runs"*) [ -n "${GH_FAIL_RUNS:-}" ] && { echo '{"message":"Bad gateway"}'; exit 1; }
    echo '{"total_count":3,"workflow_runs":[
      {"id":71,"status":"completed","conclusion":"failure","head_branch":"mergify/merge-queue/aa","run_started_at":"2026-11-20T04:00:00Z","updated_at":"2026-11-20T04:50:00Z","pull_requests":[]},
      {"id":72,"status":"in_progress","conclusion":null,"head_branch":"mergify/merge-queue/bb","run_started_at":"2026-11-20T05:00:00Z","updated_at":"2026-11-20T05:20:00Z","pull_requests":[{"number":951}]},
      {"id":73,"status":"completed","conclusion":"success","head_branch":"claude/lane-x","run_started_at":"2026-11-20T03:00:00Z","updated_at":"2026-11-20T03:10:00Z","pull_requests":[{"number":21}]}]}';;
  *"actions/runs/71/jobs"*) echo '{"jobs":[{"name":"shard (2)","started_at":"2026-11-20T04:01:00Z","completed_at":"2026-11-20T04:44:00Z"},{"name":"fast","started_at":"2026-11-20T04:01:00Z","completed_at":"2026-11-20T04:05:00Z"}]}';;
  *"pulls?state=all"*) echo '[{"number":950,"title":"merge queue: checking #21 + #22 together on main","body":"","state":"closed","merged_at":null,"user":{"login":"mergify[bot]"},"head":{"ref":"mergify/merge-queue/aa"}},
      {"number":951,"title":"merge queue: checking #21 on main","body":"","state":"open","merged_at":null,"user":{"login":"mergify[bot]"},"head":{"ref":"mergify/merge-queue/bb"}},
      {"number":21,"title":"x","state":"open","merged_at":null,"user":{"login":"lane"},"head":{"ref":"claude/lane-x"}},
      {"number":22,"title":"y","state":"open","merged_at":null,"user":{"login":"lane"},"head":{"ref":"claude/lane-y"}}]';;
  "repo view"*) echo '{"owner":{"login":"o"},"name":"r"}';;
  "api graphql"*) echo '{"data":{"repository":{"pullRequests":{"nodes":[
      {"number":20,"mergedAt":"2026-11-20T05:30:00Z","timelineItems":{"nodes":[{"createdAt":"2026-11-20T03:00:00Z","label":{"name":"review: approved"}},{"createdAt":"2026-11-20T04:30:00Z","label":{"name":"review: approved"}},{"createdAt":"2026-11-20T05:00:00Z","label":{"name":"queued"}},{}]}}]}}}}';;
  *) echo '{"message":"unexpected"}'; exit 1;;
esac
GH
out=$(FLOW_GH="$T/gh/gh.sh" python3 -I "$C" --runs-waiting "$T/rw.json" --board "$T/board.json" --now "$NOW" --save "$T/g.json" 2>&1)
ok "gather: only completed runs on mergify/merge-queue/ branches are batches; wall from run_started_at to updated_at" "$(grep -q '^  batch     1 batch(es) started in the last 6 h and ended, median wall 50 min; newest.s longest part shard (2) 43 min (run 71)' <<< "$out" && echo 1)" "$out"
ok "gather: a run with empty pull_requests finds its batch PR by branch; #21 re-queued in the running batch #951, #22 the culprit" "$(grep -q 'run 71: #21 (re-queued), #22 (culprit: still open)' <<< "$out" && echo 1)" "$out"
ok "gather: GraphQL nesting; the last review: approved label before the merge (not the earlier one, not another label)" "$(grep -q '^  merge     approved to merged median 60 min (n=1' <<< "$out" && echo 1)" "$out"
out=$(GH_FAIL_RUNS=1 FLOW_GH="$T/gh/gh.sh" python3 -I "$C" --runs-waiting "$T/rw.json" --board "$T/board.json" --now "$NOW" 2>&1)
ok "gather: a failed read is an error entry (not measured), never an empty list" "$(grep -q '^  batch     not measured (gh api' <<< "$out" && grep -q '^  failed    not measured' <<< "$out" && grep -q '^ACT   constraint: not measured' <<< "$out" && echo 1)" "$out"
L="$TOOLS/lead-watch.sh"
ok "lead-watch.sh prints the section each check and counts its ACT" "$(grep -q 'flow-constraint.py" --runs-waiting "\$STATE_DIR/runs-waiting.json"' "$L" && grep -q 'echo "\$cs"; act=\$((act + \$(grep -c .^ACT. <<<"\$cs")))' "$L" && echo 1)" "no wiring in $L"
ok "no cancel anywhere (P-371)" "$(! grep -qE '/cancel|force-cancel|run cancel' "$C" && echo 1)" "a cancel found"
finish
