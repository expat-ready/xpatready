#!/usr/bin/env bash
# Test for code-review-verdict.py (LR-132): title first, then the Important count from the last line, a missing line is
# no verdict, a run on an older commit is no verdict. Fixture JSON only: no network, US$0.
#   bash product/tools/check-code-review-verdict.sh
set -u
cd "$(dirname "$0")"
# The temp folder under TMPDIR, as guard-test-lib.sh makes it (a bare mktemp -d failed on the Mac: "/runs.json:
# Operation not permitted"); no folder, no test (exit 2), never a run against an empty path.
D="$(mktemp -d "${TMPDIR:-/tmp}/check-code-review-verdict.XXXXXXXX")" && [ -d "$D" ] || { echo "check-code-review-verdict: no temp folder under ${TMPDIR:-/tmp}; nothing was checked"; exit 2; }; trap 'rm -rf "$D"' EXIT
pass=0; fail=0
ok() { if [ "$2" = 0 ]; then pass=$((pass + 1)); echo "PASS  $1"; else fail=$((fail + 1)); echo "FAIL  $1"; fi; }
H=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa; O=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
printf '{"head":{"sha":"%s"}}' "$H" > "$D/pr.json"
# run <title> <text> [sha] [status]: one check run as the API returns it
run() { python3 -c 'import json,sys;print(json.dumps({"check_runs":[{"id":1,"name":"Claude Code Review","head_sha":sys.argv[3],"status":sys.argv[4],"started_at":"2026-11-28T08:00:00Z","output":{"title":sys.argv[1],"text":sys.argv[2]}}]}))' "$1" "$2" "${3:-$H}" "${4:-completed}" > "$D/runs.json"; }
v() { python3 -I ./code-review-verdict.py --pr 9 --pr-json "$D/pr.json" --runs-json "$D/runs.json" > "$D/out"; echo $?; }
M='<!-- bughunter-severity: {"nit":1,"normal":2,"pre_existing":0} -->'
run "Code review found 2 issues" $'| file | sev |\n| a.ts | Important |\n'"$M"
[ "$(v)" = 1 ] && grep -q 'block (2 Important, 1 Nit, 0 Pre-existing)' "$D/out"; ok "normal 2 on the last line: block, counts named" $?
run "Code review found no issues" '<!-- bughunter-severity: {"nit":3,"normal":0,"pre_existing":1} -->'
[ "$(v)" = 0 ] && grep -q 'pass (0 Important, 3 Nit, 1 Pre-existing)' "$D/out"; ok "normal 0: pass" $?
run "Code review found 1 issue" $'<!-- bughunter-severity: {"nit":0,"normal":0,"pre_existing":0} -->\nmore text'
[ "$(v)" = 3 ] && grep -q 'no severity line' "$D/out"; ok "the marker not on the last line: no verdict (file names above it are not read)" $?
run "Code review found no issues" "no marker here"
[ "$(v)" = 3 ] && grep -q 'not read as zero findings' "$D/out"; ok "missing line: no verdict, never zero findings" $?
run "Code review not repeated — earlier findings still open" ""
[ "$(v)" = 1 ]; ok "title 'not repeated' (no severity line): block, title first" $?
run "Code review skipped — no new changes" ""
[ "$(v)" = 0 ]; ok "title ending 'no new changes': pass" $?
for t in "Code review failed" "Code review timed out" "Code review declined" "Code review not run: no policy rule uses it"; do
  run "$t" "$M"; [ "$(v)" = 3 ]; ok "title '$t': no verdict, even with a severity line" $?
done
run "Code review in progress..." "" "$H" in_progress
[ "$(v)" = 3 ] && grep -q 'not finished' "$D/out"; ok "in progress: no verdict" $?
run "Code review found no issues" '<!-- bughunter-severity: {"nit":0,"normal":0,"pre_existing":0} -->' "$O"
[ "$(v)" = 3 ] && grep -q 'no Claude Code Review check run on the head commit' "$D/out"; ok "a pass on an older commit: no verdict for the head" $?
run "Code review found 1 issue" '<!-- bughunter-severity: {"nit":0} -->'
[ "$(v)" = 3 ] && grep -q 'unreadable' "$D/out"; ok "a severity line without normal: no verdict" $?
printf 'nope' > "$D/runs.json"; [ "$(v)" = 2 ]; ok "unreadable runs: cannot read (exit 2)" $?
echo "check-code-review-verdict: $pass passed, $fail failed"
[ "$fail" = 0 ]
