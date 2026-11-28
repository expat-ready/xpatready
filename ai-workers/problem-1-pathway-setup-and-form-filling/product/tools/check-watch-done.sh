#!/usr/bin/env bash
# Test for watch-done.py (LR-127): a watch exits on merge, on close and on an empty queue, logs the end, and never ends on
# what it cannot read. Fixture JSON only: no network, US$0.   bash product/tools/check-watch-done.sh
set -u
cd "$(dirname "$0")"
D="$(mktemp -d)"; trap 'rm -rf "$D"' EXIT
pass=0; fail=0
ok() { if [ "$2" = 0 ]; then pass=$((pass + 1)); echo "PASS  $1"; else fail=$((fail + 1)); echo "FAIL  $1"; fi; }
run() { WATCH_LOG="$D/log.tsv" python3 -I ./watch-done.py "$@" > "$D/out" 2>&1; echo $?; }
printf '%s' '{"number":7,"state":"open","merged_at":null}' > "$D/open.json"
printf '%s' '{"number":7,"state":"closed","merged_at":"2026-11-28T08:00:00Z"}' > "$D/merged.json"
printf '%s' '{"number":7,"state":"closed","merged_at":null}' > "$D/closed.json"
printf '%s' '[{"number":1,"state":"open","labels":[{"name":"review: approved"}]},{"number":2,"state":"open","labels":[]}]' > "$D/queued.json"
printf '%s' '[{"number":2,"state":"open","labels":[{"name":"records"}]}]' > "$D/empty.json"
printf '%s' 'not json' > "$D/bad.json"

e=$(run --pr 7 --prs "$D/open.json"); [ "$e" = 1 ] && grep -q '^watch-done: #7: not yet' "$D/out" && [ ! -s "$D/log.tsv" ]; ok "open PR: not yet (exit 1), nothing logged" $?
e=$(run --pr 7 --prs "$D/merged.json"); [ "$e" = 0 ] && grep -qE '^watch end: #7 merged at 20[0-9-]+ [0-9:]+ IST$' "$D/out"; ok "merged PR: the watch ends (exit 0) and says merged, in IST" $?
grep -qE $'^20[0-9-]+ [0-9:]+ IST\t#7\tmerged$' "$D/log.tsv"; ok "the end is logged: time, what, why" $?
e=$(run --pr 7 --prs "$D/closed.json" --what "lane x"); [ "$e" = 0 ] && grep -q '^watch end: lane x closed' "$D/out"; ok "closed unmerged PR: ends, says closed, uses --what" $?
e=$(run --pr 8 --prs "$D/merged.json"); [ "$e" = 2 ] && grep -q 'cannot read' "$D/out"; ok "another PR's object: cannot read (exit 2), never an end" $?
e=$(run --queue --prs "$D/queued.json"); [ "$e" = 1 ] && grep -q 'not yet (1 queued: #1)' "$D/out"; ok "queue with a labelled PR: not yet, names it" $?
e=$(run --queue --prs "$D/empty.json"); [ "$e" = 0 ] && grep -q '^watch end: merge queue empty' "$D/out"; ok "empty queue: the watch ends" $?
n=$(wc -l < "$D/log.tsv"); e=$(run --queue --prs "$D/bad.json"); [ "$e" = 2 ] && [ "$(wc -l < "$D/log.tsv")" = "$n" ]; ok "unreadable input: exit 2, nothing logged" $?
e=$(run --pr 7 --prs "$D/queued.json"); [ "$e" = 2 ]; ok "a list where one PR is expected: cannot read" $?
echo "check-watch-done: $pass passed, $fail failed"
[ "$fail" = 0 ]
