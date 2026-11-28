#!/usr/bin/env bash
# Test of LR-168 (founder A455, 28 Nov): the Lead's check stamp is pushed to GitHub (lead/check-stamp, fast-forward only,
# the working tree and index untouched) and judged by .github/workflows/lead-gap.yml every 10 min: over 20 min, missing,
# unreadable or in the future is a red "lead-check-gap" status on main's tip; the run itself never fails (no email).
# Throwaway repositories; no network, US$0.   bash product/tools/check-check-stamp-push.sh
set -u
. "$(dirname "$0")/guard-test-lib.sh"
T=$(mktemp -d "${TMPDIR:-/tmp}/stamppush.XXXXXXXX") && [ -d "$T" ] || { echo "no temp dir: nothing was checked"; exit 2; }; trap 'rm -rf "$T"' EXIT
export GIT_AUTHOR_NAME=t GIT_AUTHOR_EMAIL=t@t GIT_COMMITTER_NAME=t GIT_COMMITTER_EMAIL=t@t
S="$TOOLS/lead-stamp.sh"; WF="$TOOLS/../../../../.github/workflows/lead-gap.yml"; NOW=1800000000
# judge
j() { printf '%s' "$1" > "$T/s.json"; bash "$S" judge "$T/s.json" "$NOW"; }
ok "a stamp 5 min old: success" "$(j "{\"epoch\": $((NOW - 300))}" | grep -q '^success last Lead check 5 min ago' && echo 1)" "$(j "{\"epoch\": $((NOW - 300))}")"
ok "a stamp 20 min old: success (over 20 is red)" "$(j "{\"epoch\": $((NOW - 1200))}" | grep -q '^success' && echo 1)"
ok "a stamp 21 min old: failure" "$(j "{\"epoch\": $((NOW - 1260))}" | grep -q '^failure last Lead check 21 min ago' && echo 1)" "$(j "{\"epoch\": $((NOW - 1260))}")"
ok "no stamp file: failure" "$(bash "$S" judge "$T/none.json" "$NOW" | grep -q '^failure no Lead check stamp' && echo 1)"
ok "an unreadable stamp: failure" "$(j 'not json' | grep -q '^failure the Lead check stamp is unreadable' && echo 1)"
ok "an epoch that is not a number: failure" "$(j '{"epoch": "1800000000"}' | grep -q '^failure' && echo 1)"
ok "a stamp in the future: failure" "$(j "{\"epoch\": $((NOW + 600))}" | grep -q 'in the future' && echo 1)"
# push
git init -q --bare "$T/origin.git"; git clone -q "$T/origin.git" "$T/copy" 2>/dev/null; cd "$T/copy" || exit 2
echo a > a.txt; git add a.txt; git commit -qm a; git push -q origin HEAD:refs/heads/main 2>/dev/null; git fetch -q origin
echo dirty >> a.txt; before=$(git status --porcelain; git rev-parse HEAD)
o=$(NOW=$NOW bash "$S" push "$T/copy"); r=$?
ok "push: exit 0 and one line" "$([ "$r" = 0 ] && grep -q '^check stamp pushed: ' <<<"$o" && echo 1)" "rc=$r $o"
tip=$(git --git-dir="$T/origin.git" rev-parse refs/heads/lead/check-stamp 2>/dev/null)
body=$(git --git-dir="$T/origin.git" show "$tip:lead-check-stamp.json" 2>/dev/null)
ok "the branch holds lead-check-stamp.json with the epoch, this copy's head and its behind count" "$(python3 -I -c 'import json,sys
d=json.loads(sys.argv[1]); assert d["epoch"]==int(sys.argv[2]) and d["head"]==sys.argv[3] and d["behind"]==0' "$body" "$NOW" "$(git rev-parse HEAD)" 2>/dev/null && echo 1)" "$body"
ok "... and nothing else" "$([ "$(git --git-dir="$T/origin.git" ls-tree --name-only "$tip")" = lead-check-stamp.json ] && echo 1)"
ok "the working tree, index and HEAD are untouched" "$([ "$(git status --porcelain; git rev-parse HEAD)" = "$before" ] && echo 1)"
o=$(NOW=$((NOW + 600)) bash "$S" push "$T/copy"); tip2=$(git --git-dir="$T/origin.git" rev-parse refs/heads/lead/check-stamp)
ok "a second push fast-forwards (its parent is the first stamp)" "$([ "$(git --git-dir="$T/origin.git" rev-parse "$tip2^")" = "$tip" ] && echo 1)" "$o"
# a stamp pushed from another copy meanwhile: refetched, still a fast-forward
git clone -q -b main "$T/origin.git" "$T/other" 2>/dev/null; NOW=$((NOW + 900)) bash "$S" push "$T/other" >/dev/null
o=$(NOW=$((NOW + 1200)) bash "$S" push "$T/copy"); r=$?; tip3=$(git --git-dir="$T/origin.git" rev-parse refs/heads/lead/check-stamp)
ok "a push after another copy's stamp is still a fast-forward on it" "$([ "$r" = 0 ] && [ "$(git --git-dir="$T/origin.git" rev-list --count "$tip3")" = 4 ] && echo 1)" "rc=$r $o"
o=$(CHECK_STAMP_REMOTE="$T/nowhere.git" bash "$S" push "$T/copy"); r=$?
ok "a push that cannot reach the remote: exit 1, one line saying so, with git's reason" "$([ "$r" = 1 ] && [ "$(wc -l <<<"$o")" = 1 ] && grep -q 'NOT pushed' <<<"$o" && grep -qi 'git: .*\(not\|does not\|fatal\)' <<<"$o" && echo 1)" "rc=$r $o"
ok "lead-gap.yml's checkout cannot turn the run red" "$(grep -A1 'uses: actions/checkout' "$WF" | grep -q 'continue-on-error: true' && echo 1)"
# lead-watch pushes it at its end in the Lead's copy only, an ACT when not pushed
lw="$TOOLS/lead-watch.sh"
ok "lead-watch.sh pushes the stamp in the Lead's copy (lane.sh whoami = lead) and makes a failed push an ACT" "$(grep -q 'whoami 2>/dev/null)" in lead|lead-stale) true;;' "$lw" && grep -q 'sp=$(bash "$TOOLS/lead-stamp.sh" push "$TOOLS" 2>&1) && echo "$sp" || ACT "$sp"' "$lw" && echo 1)"
# the workflow
ok "lead-gap.yml runs every 10 min and by hand" "$(grep -q 'cron: "\*/10 \* \* \* \*"' "$WF" && grep -q '^  workflow_dispatch:' "$WF" && echo 1)"
ok "... with contents: read and statuses: write only" "$(grep -q 'permissions: { contents: read, statuses: write }' "$WF" && grep -q '^permissions: {}' "$WF" && echo 1)"
ok "... judges with lead-stamp.sh and sets the status lead-check-gap on main's tip" "$(grep -q 'lead-stamp.sh" judge' "$WF" && grep -q 'context: "lead-check-gap"' "$WF" && grep -q 'commits/main' "$WF" && echo 1)"
ok "... and never fails its run (no exit 1, ends exit 0)" "$(! grep -qE 'exit [1-9]' "$WF" && grep -q 'set +e' "$WF" && [ "$(grep -c '^          exit 0$' "$WF")" = 1 ] && echo 1)"
finish
