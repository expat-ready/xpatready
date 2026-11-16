#!/usr/bin/env bash
# Test for the known-failures step (B202, founder A119 16 Nov, P-639): every line of tools/known-failures.tsv has one case
# inside its threshold (ok, no ACT) and one past it (an ACT with its count and oldest item); reused lines are counted, never
# repeated; a source that did not run is said. Fake facts; no network, US$0.
#   bash product/tools/check-known-failures.sh      (exit 0 = every case as expected)
set -u
TOOLS="$(cd "$(dirname "$0")" && pwd)"
T=$(mktemp -d "${TMPDIR:-/tmp}/kf.XXXXXXXX") && [ -d "$T" ] || { echo "no temp dir: nothing was checked"; exit 2; }; trap 'rm -rf "$T"' EXIT
fail=0
case_() {  # name, id, want: ok|act|seen|warn, facts json (merged over the base)
  local name=$1 id=$2 want=$3
  python3 -I -c 'import json,sys; b=json.loads(sys.argv[1]); b.update(json.loads(sys.argv[2])); print(json.dumps(b))' "$BASE" "$4" > "$T/f.json"
  out=$(python3 -I "$TOOLS/known-failures.py" --facts "$T/f.json"); rc=$?
  line=$(grep -E "known $id:" <<<"$out")
  case "$want" in
    ok)   pat="^ok +known $id: ";; act) pat="^ACT   known $id: .* — [0-9]+, oldest: ";;
    seen) pat="^seen  known $id: covered above, [0-9]+ ACT line";; warn) pat="^warn  known $id: not measured here";;
    nm)   pat="^ACT   known $id: not measured: ";;
  esac
  if grep -qE "$pat" <<<"$line"; then echo "PASS $name"; else echo "FAIL $name :: ${line:-no line for $id} (exit $rc)"; fail=$((fail+1)); fi
}
# Base facts: everything inside its threshold.
BOARD='{"first":{"release":{"waiting":3}},"capacity":{"ready_rows":{"value":6}},"team":{"sessions":[{"name":"b1","role":"builder","state":"running","row":"B1","chip":"pushing"},{"name":"b2","role":"builder","state":"running","row":"B2","chip":"pushing"}]}}'
BASE='{"now":"2026-11-16T06:00:00+00:00","files":{"RULES.md":20000,"STATE.md":11000},
 "prs":[{"number":1,"title":"lead: records","additions":300,"deletions":10,"createdAt":"2026-11-16T01:00:00Z"}],
 "records_off_main":[{"sha":"aaaaaaaaaaaa","at":"2026-11-16T05:00:00+00:00","file":"x"}],"alive":["qa/a","qa/b","claude/x"],
 "board":'"$BOARD"',"seen":["queue 0 queued · 0 approved not queued · 0 open without label","sle   every wait-time target met","board  as of 11:00 IST (0.5 h old): 0 stuck"]}'

case_ "size-rules ok: 20000 B"            size-rules ok   '{}'
case_ "size-rules ACT: 25406 B"           size-rules act  '{"files":{"RULES.md":25406,"STATE.md":11000}}'
case_ "size-state ok: 11000 B"            size-state ok   '{}'
case_ "size-state ACT: 12225 B"           size-state act  '{"files":{"RULES.md":20000,"STATE.md":12225}}'
case_ "records-pr ok: 310 lines"          records-pr ok   '{}'
case_ "records-pr ACT: 760 lines"         records-pr act  '{"prs":[{"number":7,"title":"qa: rescore","additions":700,"deletions":60}]}'
case_ "records-pr ignores app PRs"        records-pr ok   '{"prs":[{"number":8,"title":"forms: C1.2","additions":900,"deletions":0}]}'
case_ "questions ok: none above"          questions ok    '{}'
case_ "questions seen: counted, not repeated" questions seen '{"seen":["queue 0 queued","ACT   #12 has a new question for the tech lead"]}'
case_ "approved-red ok"                   approved-red ok '{}'
case_ "approved-red seen"                 approved-red seen '{"seen":["queue 1 queued","ACT   #9 red after approval (x)"]}'
case_ "approved-unqueued ok"              approved-unqueued ok '{}'
case_ "approved-unqueued seen"            approved-unqueued seen '{"seen":["ACT   SLE A #5 approved 40 min, not queued"]}'
case_ "approved-unqueued: sle-watch not run is said" approved-unqueued warn '{"seen":["queue 0 queued"]}'
case_ "records-off-main ok: 1 h"          records-off-main ok '{}'
case_ "records-off-main ACT: 4 h"         records-off-main act '{"records_off_main":[{"sha":"bbbbbbbbbbbb","at":"2026-11-16T02:00:00+00:00","file":"DECISIONS.md"}]}'
case_ "proving-pipe ok: 3 waiting"        proving-pipe ok '{}'
case_ "proving-pipe ok: 9 waiting, 2 qa lanes" proving-pipe ok '{"board":{"first":{"release":{"waiting":9}}}}'
case_ "proving-pipe ACT: 9 waiting, 1 qa lane" proving-pipe act '{"board":{"first":{"release":{"waiting":9}}},"alive":["qa/a","claude/x"]}'
case_ "feeding-pipe ok: 6 ready, 2 builders" feeding-pipe ok '{}'
case_ "feeding-pipe ACT: 3 ready, 2 builders" feeding-pipe act '{"board":{"capacity":{"ready_rows":{"value":3}},"team":{"sessions":[{"name":"b1","role":"builder","state":"running","chip":"pushing","row":"B1"},{"name":"b2","role":"builder","state":"running","chip":"pushing","row":"B2"}]}}}'
case_ "feeding-pipe ACT: idle builder with no row" feeding-pipe act '{"board":{"capacity":{"ready_rows":{"value":9}},"team":{"sessions":[{"name":"b3","role":"builder","state":"idle","chip":"quiet"}]}}}'
case_ "lane-silent ok"                    lane-silent ok  '{}'
case_ "lane-silent seen: board idle lanes" lane-silent seen '{"seen":["board  as of x","ACT   stuck: 3 lanes idle (no push in 90 min) — a; b; c"]}'
case_ "a fact not read is an ACT, never a pass" size-rules nm '{"files":{}}'
case_ "board not read: proving pipe not measured" proving-pipe nm '{"board":null}'

# Each table line has one ok and one non-ok case above (a new line without its two cases fails here).
for id in $(awk -F'\t' '!/^#/ && $1 != "id" {print $1}' "$TOOLS/known-failures.tsv"); do
  n=$(grep -cE "^case_ .* $id (ok|act|seen|warn) " "$0")
  [ "$n" -ge 2 ] && echo "PASS $id has $n cases" || { echo "FAIL $id has $n case(s), want a pass and a fail"; fail=$((fail+1)); }
done

# The wiring: lead-watch.sh's own step 9b, run with the data the earlier steps hold, adds its ACT lines to the exit count.
step=$(sed -n '/^# 9b\. Known failures/,/^kf=.*known-failures.py/p' "$TOOLS/lead-watch.sh")
mkdir -p "$T/root/p" "$T/st"; head -c 25406 /dev/zero > "$T/root/p/RULES.md"; head -c 100 /dev/zero > "$T/root/p/STATE.md"
printf '%s' "$BOARD" > "$T/board.json"
ms_now() { python3 -I -c 'import time; print(time.time_ns() // 1000000)'; }
t0=$(ms_now)
w=$(cd "$T/root" && git() { :; }; act=0; STATE_DIR="$T/st"; SEEN="$T/st/seen"; printf 'queue 0 queued\nACT   #12 has a new question for the tech lead\n' > "$SEEN"
    D=p/DECISIONS.md; COCKPIT_DATA="$T/board.json"; prs='[]'; alive=$'qa/a\nqa/b'; eval "$step"; echo "act=$act")
ms=$(( $(ms_now) - t0 ))
grep -q '^ACT   known size-rules: RULES.md is near its 25 KB wall' <<<"$w" && grep -q '^seen  known questions: covered above, 1 ACT' <<<"$w" \
  && grep -q '^act=1$' <<<"$w" && echo "PASS lead-watch step 9b prints the table and counts its 1 ACT" || { echo "FAIL lead-watch wiring :: $w"; fail=$((fail+1)); }
[ "$ms" -lt 3000 ] && echo "PASS step 9b ran in ${ms} ms (under 3 s)" || { echo "FAIL run time ${ms} ms"; fail=$((fail+1)); }

[ "$fail" = 0 ] && echo "known failures: all cases as expected" || echo "known failures: $fail case(s) failed"
exit "$fail"
