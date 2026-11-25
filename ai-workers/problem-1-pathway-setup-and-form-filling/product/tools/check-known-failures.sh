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
BOARD='{"first":{"release":{"waiting":3,"waiting_ids":[4,9,12]}},"capacity":{"ready_rows":{"value":6}},"team":{"sessions":[{"name":"b1","role":"builder","state":"running","row":"B1","chip":"pushing"},{"name":"b2","role":"builder","state":"running","row":"B2","chip":"pushing"}]}}'
BASE='{"now":"2026-11-16T06:00:00+00:00","files":{"RULES.md":20000,"STATE.md":11000},
 "prs":[{"number":1,"title":"lead: records","additions":300,"deletions":10,"createdAt":"2026-11-16T01:00:00Z"}],
 "alive_subjects":{"claude/q1":"qa: capability R1 rows","claude/q2":"qa: batch","claude/x":"tools: B1"},
 "board":'"$BOARD"',"seen":["queue 0 queued · 0 approved not queued · 0 open without label","sle   every wait-time target met",
 "records on main: P-631 and the skills match","lanes pushed in 90 min: 3"]}'

case_ "size-rules ok: 20000 B"            size-rules ok   '{}'
case_ "size-rules ACT: 25406 B"           size-rules act  '{"files":{"RULES.md":25406,"STATE.md":11000}}'
case_ "size-state ok: 11000 B"            size-state ok   '{}'
case_ "size-state ACT: 12225 B"           size-state act  '{"files":{"RULES.md":20000,"STATE.md":12225}}'
case_ "records-pr ok: 310 lines"          records-pr ok   '{}'
case_ "records-pr ACT: 760 lines"         records-pr act  '{"prs":[{"number":7,"title":"qa: rescore","additions":700,"deletions":60}]}'
case_ "records-pr ignores app PRs"        records-pr ok   '{"prs":[{"number":8,"title":"forms: C1.2","additions":900,"deletions":0}]}'
case_ "records-pr ACT: a (records only) title" records-pr act '{"prs":[{"number":9,"title":"records: P-631 (records only)","additions":790,"deletions":0}]}'
case_ "records-pr ACT: the records label"  records-pr act '{"prs":[{"number":10,"title":"rules page","labels":[{"name":"records"}],"additions":750,"deletions":0}]}'
case_ "records-pr-age ok: a records PR open 5 h" records-pr-age ok '{}'
case_ "records-pr-age ACT: open 25 h, named with its age" records-pr-age act '{"prs":[{"number":11,"title":"lead: records","createdAt":"2026-11-15T05:00:00Z"}]}'
case_ "records-pr-age ok: an app PR open 3 days" records-pr-age ok '{"prs":[{"number":12,"title":"forms: C1.2","createdAt":"2026-11-13T05:00:00Z"}]}'
case_ "records-pr-age ACT: a draft records PR counts too" records-pr-age act '{"prs":[{"number":13,"title":"qa: rescore","isDraft":true,"createdAt":"2026-11-14T05:00:00Z"}]}'
case_ "records-pr-age ok: exactly 24 h" records-pr-age ok '{"prs":[{"number":14,"title":"records: x","createdAt":"2026-11-15T06:00:00Z"}]}'
case_ "records-pr-age: PRs read without createdAt is an ACT" records-pr-age nm '{"prs":[{"number":15,"title":"lead: x"}]}'
case_ "questions ok: sle-watch met"       questions ok    '{}'
case_ "questions seen: counted, not repeated" questions seen '{"seen":["sle   x","ACT   SLE Q #12: question unanswered 60 min"]}'
case_ "questions: a new-question ACT without sle-watch is still seen" questions seen '{"seen":["queue 0 queued","ACT   #12 has a new question for the tech lead"]}'
case_ "questions: no sle-watch and no hit is a warn, never ok" questions warn '{"seen":["queue 0 queued","records on main: P-631"]}'
case_ "approved-red ok"                   approved-red ok '{}'
case_ "approved-red seen"                 approved-red seen '{"seen":["queue 1 queued · 0 approved","ACT   #9 red after approval (x)"]}'
case_ "approved-red: step 2 not run is said" approved-red warn '{"seen":["queue items: 2 open"]}'
case_ "approved-unqueued ok"              approved-unqueued ok '{}'
case_ "approved-unqueued seen"            approved-unqueued seen '{"seen":["ACT   SLE A #5 approved 40 min, not queued"]}'
case_ "approved-unqueued: sle-watch not run is said" approved-unqueued warn '{"seen":["queue 0 queued"]}'
case_ "records-off-main ok: step 7 says on main" records-off-main ok '{}'
case_ "records-off-main seen: step 7 ACT reused" records-off-main seen '{"seen":["ACT   records not on main: newest decision P-640 here, P-631 on main"]}'
case_ "proving-pipe ok: 3 waiting"        proving-pipe ok '{}'
case_ "proving-pipe ok: 9 waiting, 2 qa lanes" proving-pipe ok '{"board":{"first":{"release":{"waiting":9}}}}'
case_ "proving-pipe ACT: 9 waiting, 1 qa lane" proving-pipe act '{"board":{"first":{"release":{"waiting":9,"waiting_ids":[4]}}},"alive_subjects":{"claude/q1":"qa: x","claude/x":"tools: y"}}'
case_ "proving-pipe ok: two pushing qa sessions count" proving-pipe ok '{"board":{"first":{"release":{"waiting":9}},"team":{"sessions":[{"name":"qa1","role":"qa","chip":"pushing"},{"name":"qa2","role":"qa","chip":"pushing"}]}},"alive_subjects":{"claude/q1":"qa: x"}}'
case_ "proving-pipe ACT: one lane seen as branch and session is one" proving-pipe act '{"board":{"first":{"release":{"waiting":9}},"team":{"sessions":[{"name":"qa R1 lane","role":"qa","chip":"pushing"}]}},"alive_subjects":{"claude/wizardly":"qa: capability R1 eight rows"}}'
case_ "proving-pipe ok: a branch and another lane's named session are two" proving-pipe ok '{"board":{"first":{"release":{"waiting":9}},"team":{"sessions":[{"name":"qa2","role":"qa","chip":"pushing","branch":"claude/b"}]}},"alive_subjects":{"claude/a":"qa: x"}}'
case_ "proving-pipe ACT: a session naming the same branch is one lane" proving-pipe act '{"board":{"first":{"release":{"waiting":9}},"team":{"sessions":[{"name":"qa1","role":"qa","chip":"pushing","branch":"claude/a"}]}},"alive_subjects":{"claude/a":"qa: x"}}'
case_ "proving-pipe: board without first screen is a warn" proving-pipe warn '{"board":{"capacity":{}}}'
case_ "feeding-pipe ok: 6 ready, 2 builders" feeding-pipe ok '{}'
case_ "feeding-pipe ACT: 3 ready, 2 builders" feeding-pipe act '{"board":{"capacity":{"ready_rows":{"value":3}},"team":{"sessions":[{"name":"b1","role":"builder","state":"running","chip":"pushing","row":"B1"},{"name":"b2","role":"builder","state":"running","chip":"pushing","row":"B2"}]}}}'
case_ "feeding-pipe ACT: idle builder with no row" feeding-pipe act '{"board":{"capacity":{"ready_rows":{"value":9}},"team":{"sessions":[{"name":"b3","role":"builder","state":"idle","chip":"quiet"}]}}}'
case_ "feeding-pipe: no sessions is not a pass" feeding-pipe warn '{"board":{"capacity":{"ready_rows":{"value":9}},"team":{"sessions":[]}}}'
case_ "lane-silent ok"                    lane-silent ok  '{}'
case_ "lane-silent seen: board idle lanes" lane-silent seen '{"seen":["board  as of x","ACT   stuck: 3 lanes idle (no push in 90 min) — a; b; c"]}'
case_ "lane-silent seen: a local lane idle" lane-silent seen '{"seen":["lanes pushed in 90 min: 1","ACT   local lane b4 idle 60 min while 3 PR(s) merged"]}'
case_ "lane-silent: no sle-watch or board is a warn, never ok" lane-silent warn '{"seen":["queue 0 queued","lanes pushed in 90 min: 6","ok    local lane builder-1 active 3 min ago"]}'
case_ "same-cause ok"                     same-cause ok   '{"seen":["same cause 3 failed batches in 12 h, 0 failures seen in two or more"]}'
case_ "same-cause seen: counted, not repeated" same-cause seen '{"seen":["ACT   same cause: 1 failure alike in batch #1 and #2"]}'
case_ "same-cause: step 2j not run is said" same-cause warn '{"seen":["queue 0 queued"]}'
case_ "a fact not read is an ACT, never a pass" size-rules nm '{"files":{}}'
case_ "board not read: a warn (the board step says it), not a second ACT" proving-pipe warn '{"board":null}'
case_ "open PRs not read: an ACT" records-pr nm '{"prs":null}'
case_ "a malformed board is said, never a traceback" feeding-pipe warn '{"board":[1]}'

python3 -I -c 'import json,sys; b=json.loads(sys.argv[1]); b["prs"]=[{"number":21,"title":"lead: a","createdAt":"2026-11-15T04:00:00Z"},{"number":20,"title":"records: b","labels":[{"name":"records"}],"createdAt":"2026-11-14T06:00:00Z"},{"number":22,"title":"tools: c","createdAt":"2026-11-01T00:00:00Z"}]; print(json.dumps(b))' "$BASE" > "$T/f.json"
o=$(python3 -I "$TOOLS/known-failures.py" --facts "$T/f.json" | grep 'known records-pr-age:')
grep -qF -- '— 2, oldest: #20 open 48 h; #21 open 26 h (' <<<"$o" && echo "PASS records-pr-age names every old records PR, oldest first, and no other PR" || { echo "FAIL records-pr-age list :: $o"; fail=$((fail+1)); }

# Each table line has a passing case (ok) and a failing one (act or seen) above (a new line without both fails here).
for id in $(awk -F'\t' '!/^#/ && $1 != "id" {print $1}' "$TOOLS/known-failures.tsv"); do
  p=$(grep -cE "^case_ .* $id ok " "$0"); f=$(grep -cE "^case_ .* $id (act|seen) " "$0")
  [ "$p" -ge 1 ] && [ "$f" -ge 1 ] && echo "PASS $id has $p pass and $f fail case(s)" || { echo "FAIL $id has $p pass and $f fail case(s), want one of each"; fail=$((fail+1)); }
done

# The wiring: lead-watch.sh's own step 12, run with the data the earlier steps hold, adds its ACT lines to the exit count.
step=$(sed -n '/^# 12\. Known failures/,/^kf=.*known-failures.py/p' "$TOOLS/lead-watch.sh")
mkdir -p "$T/root/p" "$T/st"; head -c 25406 /dev/zero > "$T/root/p/RULES.md"; head -c 100 /dev/zero > "$T/root/p/STATE.md"
printf '%s' "$BOARD" > "$T/board.json"
ms_now() { python3 -I -c 'import time; print(time.time_ns() // 1000000)'; }
t0=$(ms_now)
w=$(cd "$T/root" && git() { echo "qa: capability rows"; }; act=0; STATE_DIR="$T/st"; SEEN="$T/st/seen"; printf 'queue 0 queued\nsle   due Q #12\nACT   SLE Q #12 unanswered 40 min\n' > "$SEEN"
    D=p/DECISIONS.md; COCKPIT_DATA="$T/board.json"; prs='[]'; alive=$'claude/q1\nclaude/q2'; eval "$step"; echo "act=$act")
ms=$(( $(ms_now) - t0 ))
grep -q '^ACT   known size-rules: RULES.md is near its 25 KB wall' <<<"$w" && grep -q '^seen  known questions: covered above, 1 ACT' <<<"$w" \
  && grep -q '^act=1$' <<<"$w" && echo "PASS lead-watch step 12 prints the table and counts its 1 ACT" || { echo "FAIL lead-watch wiring :: $w"; fail=$((fail+1)); }
[ "$ms" -lt 3000 ] && echo "PASS step 12 ran in ${ms} ms (under 3 s)" || { echo "FAIL run time ${ms} ms"; fail=$((fail+1)); }

[ "$fail" = 0 ] && echo "known failures: all cases as expected" || echo "known failures: $fail case(s) failed"
exit "$fail"
