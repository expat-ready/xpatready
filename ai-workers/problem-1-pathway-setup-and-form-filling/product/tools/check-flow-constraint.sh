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
echo '{"freshness": {"generated_at": "2026-11-20T05:30:00Z"}, "first": {"today": {"proven": 3, "goal": 10, "short": 7, "waiting": 5}}}' > "$T/board.json"
run() { out=$(python3 -I "$C" --facts "$1" --runs-waiting "${RW:-$T/rw.json}" --board "${BD:-$T/board.json}" --now "$NOW" --save "$T/m.json" 2>&1); r=$?; act=$(grep '^ACT' <<< "$out"); }
facts "$T/f.json"; run "$T/f.json"
ok "section heading with the IST time" "$(grep -qx 'constraint (P-738, ENF-738) measured 20 Nov 11:30 IST' <<< "$out" && echo 1)" "$out"
ok "batch: count, median wall, the newest batch's longest part" "$(grep -qx '  batch     4 batch(es) ended in 6 h, median wall 45 min; newest.s longest part shard (7) 41 min (run 4)' <<< "$out" && echo 1)" "$out"
ok "machines: runs-waiting.py's measure (part 1), stale runs apart" "$(grep -qx '  machines  1 run(s) waiting (created under 6 h), oldest 4 min; 2 stale, not counted' <<< "$out" && echo 1)" "$out"
ok "failed: each failed batch with its members, the still-open one named culprit" "$(grep -qx '  failed    1 of 4 batch(es) failed in 6 h: run 3: #11, #12 (culprit: still open)' <<< "$out" && echo 1)" "$out"
ok "merge: approved to merged median over PRs merged in 24 h (no label time: left out)" "$(grep -qx '  merge     approved to merged median 60 min (n=2, merged in 24 h)' <<< "$out" && echo 1)" "$out"
ok "rate: merges per hour over 3 h" "$(grep -qx '  rate      0.7 merges per hour (last 3 h, 2 merges)' <<< "$out" && echo 1)" "$out"
ok "proven: the board's Today card with its age" "$(grep -qx '  proven    Proven today 3 of 10 (7 short), 5 Built waiting for qa (board 30 min old)' <<< "$out" && echo 1)" "$out"
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
L="$TOOLS/lead-watch.sh"
ok "lead-watch.sh prints the section each check and counts its ACT" "$(grep -q 'flow-constraint.py" --runs-waiting "\$STATE_DIR/runs-waiting.json"' "$L" && grep -q 'echo "\$cs"; act=\$((act + \$(grep -c .^ACT. <<<"\$cs")))' "$L" && echo 1)" "no wiring in $L"
ok "no cancel anywhere (P-371)" "$(! grep -qE '/cancel|force-cancel|run cancel' "$C" && echo 1)" "a cancel found"
finish
