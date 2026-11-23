#!/usr/bin/env bash
# P-791 (2), (4) (founder 22 Nov; the Lead's by-hand merge of #2754 at 12:1x IST restarted 9 batches): lead-watch.sh prints
# the merge-queue batches running and "a manual merge to main now restarts N batches"; lead-merge.sh <PR> refuses while a
# batch runs unless given --reason, and only prints the steps: it never merges. Fake GitHub answers, a gh that logs. US$0.
#   bash product/tools/check-lead-merge.sh
set -u
. "$(dirname "$0")/guard-test-lib.sh"
T=$(mktemp -d "${TMPDIR:-/tmp}/lmerge.XXXXXXXX") && [ -d "$T" ] || { echo "no temp dir: nothing was checked"; exit 2; }; trap 'rm -rf "$T"' EXIT
Q="$TOOLS/queue-batches.py"; M="$TOOLS/lead-merge.sh"
# three open mergify/ PRs: #901 checks running, #902 all completed, #903 no check run yet; #50 a lane PR with checks running
cat > "$T/pulls.json" <<'J'
[{"number": 901, "state": "open", "head": {"ref": "mergify/merge-queue/aa", "sha": "s901"}},
 {"number": 902, "state": "open", "head": {"ref": "mergify/merge-queue/bb", "sha": "s902"}},
 {"number": 903, "state": "open", "head": {"ref": "mergify/merge-queue/cc", "sha": "s903"}},
 {"number": 50, "state": "open", "head": {"ref": "claude/lane-x", "sha": "s50"}}]
J
cat > "$T/checks.json" <<'J'
{"s901": {"check_runs": [{"status": "completed"}, {"status": "in_progress"}]},
 "s902": {"check_runs": [{"status": "completed"}, {"status": "completed"}]},
 "s903": {"check_runs": []},
 "s50": {"check_runs": [{"status": "queued"}]}}
J
echo '[]' > "$T/none.json"; echo '{"message": "Bad credentials"}' > "$T/bad.json"
out=$(python3 -I "$Q" --pulls "$T/pulls.json" --checks "$T/checks.json")
ok "batches running: the mergify/ PRs whose checks are not finished (#901 running, #903 not started), never a lane PR" "$(grep -qx 'batches 2 merge-queue batch(es) running (#901, #903) · a manual merge to main now restarts 2 batches' <<< "$out" && echo 1)" "$out"
out=$(python3 -I "$Q" --pulls "$T/none.json" --checks "$T/checks.json")
ok "no batch: 0, and the line still says what a manual merge restarts" "$(grep -qx 'batches 0 merge-queue batch(es) running · a manual merge to main now restarts 0 batches' <<< "$out" && echo 1)" "$out"
out=$(python3 -I "$Q" --pulls "$T/bad.json" --checks "$T/checks.json"); r=$?
ok "an error from GitHub: not measured (exit 3), never 0" "$([ $r = 3 ] && grep -q '^batches not measured' <<< "$out" && echo 1)" "exit $r: $out"
jq '.s901.total_count = 150' "$T/checks.json" > "$T/c3.json"; out=$(python3 -I "$Q" --pulls "$T/pulls.json" --checks "$T/c3.json"); r=$?
ok "a batch with more check runs than one page read (2 of 150): not measured, never a false 0" "$([ $r = 3 ] && grep -q 'only 2 of 150 read' <<< "$out" && echo 1)" "exit $r: $out"
jq 'del(.s901)' "$T/checks.json" > "$T/c2.json"; out=$(python3 -I "$Q" --pulls "$T/pulls.json" --checks "$T/c2.json" --count); r=$?
ok "a batch whose checks cannot be read: \"?\", exit 3" "$([ $r = 3 ] && [ "$out" = "?" ] && echo 1)" "exit $r: $out"
ok "lead-watch.sh prints the line every check (step 2h)" "$(grep -q 'qb=$(python3 -I "$TOOLS/queue-batches.py"' "$TOOLS/lead-watch.sh" && grep -q 'say "$qb"' "$TOOLS/lead-watch.sh" && echo 1)" "no step 2h in lead-watch.sh"
# lead-merge.sh with a gh that logs every call: it must never call GitHub to change anything
mkdir -p "$T/bin"; printf '#!/bin/bash\necho "gh $*" >> "%s/gh.log"\nexit 1\n' "$T" > "$T/bin/gh"; chmod +x "$T/bin/gh"; : > "$T/gh.log"
lm() { PATH="$T/bin:$PATH" QB_PULLS="$1" QB_CHECKS="$T/checks.json" bash "$M" "${@:2}" 2>&1; echo "rc=$?"; }
o=$(lm "$T/pulls.json" 2754)
ok "lead-merge.sh refuses while 2 batches run and no --reason (exit 1, says it restarts 2)" "$(grep -q '^rc=1' <<< "$o" && grep -q 'refused: 2 merge-queue batch(es) running; a manual merge to main now restarts 2 batches' <<< "$o" && ! grep -q '^Steps for' <<< "$o" && echo 1)" "$o"
o=$(lm "$T/pulls.json" 2754 --reason "   ")
ok "a blank --reason is no reason: refused" "$(grep -q '^rc=1' <<< "$o" && echo 1)" "$o"
o=$(lm "$T/pulls.json" 2754 --reason "$(printf '\t\n ')")
ok "a --reason of tabs and newlines only is no reason: refused" "$(grep -q '^rc=1' <<< "$o" && echo 1)" "$o"
o=$(lm "$T/pulls.json" 2754 --reason "security fix, founder asked 12:20 IST")
ok "with --reason it prints the steps and the reason, exit 0" "$(grep -q '^rc=0' <<< "$o" && grep -q '^Steps for #2754' <<< "$o" && grep -q 'reason given with 2 batch(es) running: security fix' <<< "$o" && echo 1)" "$o"
o=$(lm "$T/none.json" 2754)
ok "no batch running: the steps, no reason needed, exit 0" "$(grep -q '^rc=0' <<< "$o" && grep -q '^Steps for #2754' <<< "$o" && grep -q 'prefer the queue' <<< "$o" && echo 1)" "$o"
jq -n '[range(100) as $i | {number: (100 + $i), state: "open", head: {ref: "claude/lane-\($i)", sha: "s50"}}]' > "$T/full.json"
o=$(lm "$T/full.json" 2754)
ok "100 open lane PRs (a full page, so a warn line comes first) and no batch: the steps, exit 0" "$(grep -q '^rc=0' <<< "$o" && grep -q '^Steps for #2754' <<< "$o" && grep -q '^warn  100 open PRs read' <<< "$o" && echo 1)" "$o"
o=$(lm "$T/bad.json" 2754)
ok "batches not countable and no --reason: refused (unknown is not safe)" "$(grep -q '^rc=1' <<< "$o" && grep -q 'could not be counted' <<< "$o" && echo 1)" "$o"
o=$(lm "$T/none.json")
ok "no PR number: refused" "$(grep -q '^rc=1' <<< "$o" && grep -q 'give the PR number' <<< "$o" && echo 1)" "$o"
ok "lead-merge.sh never runs gh: the gh log is empty after every case" "$([ ! -s "$T/gh.log" ] && echo 1)" "$(cat "$T/gh.log")"
ok "lead-merge.sh runs no merge or push command of its own" "$(! grep -qE '^[^#]*(gh(\.sh)? (pr|api)|git (merge|push))' "$M" && echo 1)" "a merge or push command found"
finish
