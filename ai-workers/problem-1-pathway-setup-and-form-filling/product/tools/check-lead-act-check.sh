#!/usr/bin/env bash
# B193 part 2 (d), P-388, P-619: lead-act-check.sh gives an ACT when the Lead's 30-minute check last ran over 40 min ago
# or the board data is over 45 min old, blocks the Lead's stop once with them, then keeps quiet for 30 min on the same
# facts; fresh check and board, or a builder's copy, pass. Stamp, board and clock are hand-made. US$0, no network.
#   bash product/tools/check-lead-act-check.sh
set -u
. "$(dirname "$0")/guard-test-lib.sh"
command -v jq >/dev/null || { echo "jq is missing; nothing was checked"; exit 2; }
T=$(mktemp -d "${TMPDIR:-/tmp}/la.XXXXXXXX"); trap 'rm -rf "$T"' EXIT
git init -q "$T/copy" && mkdir -p "$T/copy/$PRODREL/tools" "$T/st" && printf '#!/bin/bash\necho "$FAKE_LANE"\n' > "$T/copy/$PRODREL/tools/lane.sh"
G="$TOOLS/lead-act-check.sh"; NOW=1763240000   # a fixed clock
board() { python3 -I -c 'import sys,json,datetime as d
z=d.timezone(d.timedelta(hours=5,minutes=30)); t=lambda s: d.datetime.fromtimestamp(s,z).isoformat()
n=int(sys.argv[1]); print(json.dumps({"rows":1,"taken_at":t(n-9000)})); print(json.dumps({"taken_at":t(n-int(sys.argv[2])*60)}))' "$NOW" "$1" > "$T/board.jsonl"; }   # macOS and Linux alike
status() {  # $1 check age (min, or none), $2 board age (min) → the number of ACT lines, then the lines
  rm -f "$T/st/last-check"; [ "$1" != none ] && echo $((NOW - $1 * 60)) > "$T/st/last-check"; board "$2"
  LEAD_STAMP="$T/st/last-check" BOARD_FILE="$T/board.jsonl" NOW=$NOW bash "$G" --status "$T/copy"; echo "rc=$?"; }
o=$(status 20 10); ok "a check 20 min ago and a board 10 min old: nothing to act on" "$(grep -q '^rc=0' <<< "$o" && echo 1)" "$o"
o=$(status 41 10); ok "a check 41 min ago is an ACT (P-388)" "$(grep -q '^rc=1' <<< "$o" && grep -q 'ACT.*30-minute check last ran 41 min ago' <<< "$o" && echo 1)" "$o"
o=$(status 40 45); ok "40 and 45 min are still on time" "$(grep -q '^rc=0' <<< "$o" && echo 1)" "$o"
o=$(status 10 46); ok "board data 46 min old is an ACT (P-619)" "$(grep -q '^rc=1' <<< "$o" && grep -q "ACT.*board data is 46 min old" <<< "$o" && echo 1)" "$o"
o=$(status none 50); ok "no stamp at all and a stale board: two ACTs" "$(grep -q '^rc=2' <<< "$o" && echo 1)" "$o"
stop() {  # $1 lane, $2 clock → block | pass
  local out; out=$(jq -n --arg d "$T/copy" '{cwd:$d, stop_hook_active:false}' | LEAD_STAMP="$T/st/last-check" BOARD_FILE="$T/board.jsonl" NOW=$2 FAKE_LANE="$1" bash "$G")
  if printf '%s' "$out" | jq -e '.decision == "block" and (.reason | test("ACT"))' >/dev/null 2>&1; then echo block; else echo pass; fi; }
echo $((NOW - 50 * 60)) > "$T/st/last-check"; board 10; rm -f "$T/st/act-check.alerted"
r=$(stop lead $NOW); ok "the Lead's stop is blocked with the missed check" "$([ "$r" = block ] && echo 1)" "got $r"
r=$(stop lead $((NOW + 60))); ok "... once: a minute later, same facts, it passes" "$([ "$r" = pass ] && echo 1)" "got $r"
r=$(stop lead $((NOW + 31 * 60))); ok "... and asks again after 30 min if still stale" "$([ "$r" = block ] && echo 1)" "got $r"
r=$(stop screens $NOW); ok "a builder's copy is never blocked" "$([ "$r" = pass ] && echo 1)" "got $r"
echo $((NOW - 5 * 60)) > "$T/st/last-check"; r=$(stop lead $NOW); ok "a fresh check and board: the Lead stops freely" "$([ "$r" = pass ] && echo 1)" "got $r"
finish
