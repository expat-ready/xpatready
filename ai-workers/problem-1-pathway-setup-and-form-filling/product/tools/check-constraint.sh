#!/usr/bin/env bash
# Test for constraint.py (ENF-738, P-738): each branch of the constraint choice is driven by a fixture of batch runs and
# merged PRs and must name the right constraint; the same case under its line must not. No network, US$0.
#   bash product/tools/check-constraint.sh      (exit 0 = every case as expected)
set -u
TOOLS="$(cd "$(dirname "$0")" && pwd)"
T=$(mktemp -d "${TMPDIR:-/tmp}/constraint.XXXXXXXX") && [ -d "$T" ] || { echo "no temp dir: nothing was checked"; exit 2; }; trap 'rm -rf "$T"' EXIT
fail=0
case_() {  # name, expected grep (or !grep; several joined by " ;; " must all match), expected exit, facts json
  local name=$1 want=$2 code=$3; printf '%s' "$4" > "$T/f.json"
  out=$(python3 -I "$TOOLS/constraint.py" --facts "$T/f.json" 2>&1); rc=$?
  if [ "${want:0:1}" = "!" ]; then echo "$out" | grep -qE -- "${want:1}" && okw=0 || okw=1; else okw=1; while IFS= read -r w; do echo "$out" | grep -qE -- "$w" || okw=0; done <<<"${want// ;; /$'\n'}"; fi
  if [ $okw = 1 ] && [ "$rc" = "$code" ]; then echo "PASS $name"; else echo "FAIL $name (exit $rc, want $code) :: $out"; fail=$((fail+1)); fi
}
# A batch run: id, conclusion, minutes the shard job waited, minutes it ran (start 12:00, all at 12:xx/13:xx on 19 Nov).
run() {  # id conclusion wait_min part_min [title]
  python3 -I -c '
import json, sys
from datetime import datetime, timedelta
i, c, w, p = sys.argv[1], sys.argv[2], float(sys.argv[3]), float(sys.argv[4]); title = sys.argv[5]
s = lambda m: (datetime(2026, 11, 19, 10, 0) + timedelta(minutes=m)).strftime("%Y-%m-%dT%H:%M:%SZ")
print(json.dumps({"id": int(i), "display_title": title, "status": "completed", "conclusion": c, "run_started_at": s(0), "updated_at": s(w + p + 2),
  "jobs": [{"name": "kind", "created_at": s(0), "started_at": s(0.1), "completed_at": s(1), "suite_min": None},
           {"name": "shard (3)", "created_at": s(1), "started_at": s(1 + w), "completed_at": s(1 + w + p), "suite_min": p - 2}]}))' "$@" "${5:-merge queue: checking #$1 + #9$1 together on main (abc), stacked on #7}"
}
pr() { echo "{\"number\":$1,\"merged_at\":\"2026-11-19T12:00:00Z\",\"approved_at\":$2}"; }   # number, approved_at json
FX() { echo "{\"now\":\"2026-11-19T13:00:00Z\",\"hours\":3,\"runs\":[$1],\"merged\":[$2]}"; }
FAST="$(pr 1 '"2026-11-19T11:40:00Z"'),$(pr 2 '"2026-11-19T11:30:00Z"')"   # approved to merged 20 and 30 min
SLOW="$(pr 1 '"2026-11-19T10:00:00Z"'),$(pr 2 '"2026-11-19T10:30:00Z"'),$(pr 3 null)"   # 120 and 90 min; one without the label

case_ "machines: job wait 8 min" "^ACT   constraint: machines — job wait 8.0 min" 1 "$(FX "$(run 1 success 8 20)" "$FAST")"
case_ "machines under: wait 4 min" "!machines" 0 "$(FX "$(run 1 success 4 20)" "$FAST")"
case_ "test parts: 45 min" "^ACT   constraint: test parts — longest part 45.0 min \(shard \(3\)\) — split the longest suite or raise SHARDS" 1 "$(FX "$(run 1 success 0.1 45)" "$FAST")"
case_ "test parts under: 29 min" "!test parts" 0 "$(FX "$(run 1 success 0.1 29)" "$FAST")"
case_ "faulty PRs: 2 failed batches" "^ACT   constraint: faulty PRs reach batches — 2 failed batches in 3 h — CI-PRE" 1 "$(FX "$(run 1 failure 0.1 20),$(run 2 failure 0.1 20)" "$SLOW")"
case_ "faulty PRs: members named" "run 1: #1 #91 · run 2: #2 #92" 1 "$(FX "$(run 1 failure 0.1 20),$(run 2 failure 0.1 20)" "$SLOW")"
case_ "faulty PRs under: 1 failed" "!faulty PRs" 0 "$(FX "$(run 1 failure 0.1 20),$(run 2 success 0.1 20)" "$SLOW")"
case_ "queue capacity: 105 min, nothing failing" "^ACT   constraint: queue capacity — approved to merged median 105.0 min — more parallel batches" 1 "$(FX "$(run 1 success 0.1 20)" "$SLOW")"
case_ "queue capacity: label count" "2 of 3 merged PRs carried the label\\) · merges per hour 1.0" 1 "$(FX "$(run 1 success 0.1 20)" "$SLOW")"
case_ "queue capacity under: 25 min" "!queue capacity" 0 "$(FX "$(run 1 success 0.1 20)" "$FAST")"
case_ "none: everything under its line" "^constraint: none — wait 0.1 min, part 20.0 min, 0 failed" 0 "$(FX "$(run 1 success 0.1 20)" "$FAST")"
case_ "none: no batches at all" "^constraint: none" 0 "$(FX "" "")"
case_ "order: machines before test parts, the other listed" "^ACT   constraint: machines ;; also over its line: test parts" 1 "$(FX "$(run 1 success 9 50)" "$FAST")"
case_ "order: test parts before faulty PRs (19 Nov)" "^ACT   constraint: test parts ;; also over its line: faulty PRs reach batches" 1 "$(FX "$(run 1 failure 0.1 60),$(run 2 failure 0.1 43)" "$SLOW")"
case_ "merged title: members read" "run 5: #2241 #2208" 1 "$(FX "$(run 5 failure 0.1 20 'merge queue: merged #2241, #2208: records: P-1'),$(run 6 failure 0.1 20)" "$FAST")"
printf 'not json' > "$T/bad.json"; out=$(python3 -I "$TOOLS/constraint.py" --facts "$T/bad.json"); rc=$?
case "$out" in "ACT   constraint: unreadable"*) [ $rc = 1 ] && echo "PASS unreadable: an ACT, never a pass" || { echo "FAIL unreadable exit $rc"; fail=$((fail+1)); };;
  *) echo "FAIL unreadable :: $out"; fail=$((fail+1));; esac
[ $fail = 0 ] && echo "all constraint cases pass" || echo "$fail case(s) failed"
exit $fail
