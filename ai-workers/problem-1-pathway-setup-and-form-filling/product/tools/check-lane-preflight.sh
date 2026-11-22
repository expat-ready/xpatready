#!/usr/bin/env bash
# Guard 3 (founder, 6 Nov ~03:00 IST): no lane starts without room. lane-preflight.sh with stand-in df, sysctl and lsof
# (the night's two failed starts at 4.7 and 3.7 GB, a load of 17, four copies), and its PreToolUse hook on start_session,
# fed the hook's JSON as Claude Code does, including B204's Item line and wave check (P-745) on throwaway waves files. US$0.
#   bash product/tools/check-lane-preflight.sh
set -u
. "$(dirname "$0")/guard-test-lib.sh"
# ENF-803: a start brief's Duplicate check names the main sha and the exact IST time (brief-fresh.py); HEAD stands for main here
export BRIEF_MAIN=HEAD; FRESH_DUP="read main $(git rev-parse --short=9 HEAD) at $(TZ=Asia/Kolkata date +%H:%M) IST;"
command -v jq >/dev/null || { echo "jq is missing; nothing was checked"; exit 2; }
T=$(mktemp -d "${TMPDIR:-/tmp}/guard.XXXXXXXX") && [ -d "$T" ] || { echo "no temp dir: nothing was checked"; exit 2; }; trap 'rm -rf "$T"' EXIT; mkdir "$T/bin"
printf '#!/bin/sh\necho "Filesystem 1024-blocks Used Available Capacity Mounted"\necho "/dev/disk3s1 990000000 1 $FAKE_KB 1%% /"\n' > "$T/bin/df"
printf '#!/bin/sh\necho "{ $FAKE_LOAD 9.00 8.00 }"\n' > "$T/bin/sysctl"
printf '#!/bin/sh\nfor p in $FAKE_PORTS; do echo "node 1$p u 20u IPv4 0x1 0t0 TCP 127.0.0.1:$p (LISTEN)"; done\n' > "$T/bin/lsof"
chmod +x "$T/bin/"*
P="$TOOLS/lane-preflight.sh"
pf() { out=$(PATH="$T/bin:$PATH" FAKE_KB="$1" FAKE_LOAD="$2" FAKE_PORTS="$3" bash "$P" "${@:4}" 2>&1); r=$?; }
gb() { echo $(( $1 * 1048576 / 10 )); }   # tenths of a GB → KB
pf "$(gb 150)" 6.5 "4400 4471"; ok "15 GB, load 6.5, one copy (the demo is not counted): room" "$([ $r = 0 ] && echo "$out" | grep -q 'test copies 1 ' && echo 1)" "exit $r: $out"
pf "$(gb 47)" 6.5 ""; ok "4.7 GB free (B99's first start) is refused" "$([ $r = 1 ] && echo "$out" | grep -q 'REFUSED: disk 4.7 GB free, under 7 GB' && echo 1)" "exit $r: $out"
pf "$(gb 37)" 6.5 ""; ok "3.7 GB free (B99's second start) is refused" "$([ $r = 1 ] && echo 1)" "exit $r: $out"
pf "$(gb 70)" 16 ""; ok "exactly 7 GB and load 16 pass" "$([ $r = 0 ] && echo 1)" "exit $r: $out"
pf "$(gb 150)" 17.2 ""; ok "a 1-minute load of 17.2 is refused" "$([ $r = 1 ] && echo "$out" | grep -q 'load 17.2, over 16' && echo 1)" "exit $r: $out"
pf "$(gb 150)" 3 "4420 4431 4452 4471"; ok "four running test copies are refused, with their ports" "$([ $r = 1 ] && echo "$out" | grep -q '4 test copies running, cap 4 (ports: 4420 4431 4452 4471' && echo 1)" "exit $r: $out"
pf "$(gb 30)" 20 "4420 4431 4452 4471"; ok "every reason is named at once" "$([ $r = 1 ] && [ "$(echo "$out" | grep '^REFUSED' | grep -o 'under 7 GB\|over 16\|cap 4' | wc -l | tr -d ' ')" = 3 ] && echo 1)" "$out"
# The stand-in brief's row X-1 is put on a throwaway focus list, so focus-check.py (ENF-733; test: check-focus-list.sh) is not what these checks see.
printf '| R1.1 | X-1 | test | test |\n' > "$T/focus-list.md"; export FOCUS_LIST="$T/focus-list.md"
BRIEF=$'Row X-1. Model: Opus 5.5, effort: medium.\nItem: R1.1\nDuplicate check: '"$FRESH_DUP"$' searched BACKLOG; none\nDone when: check-x.sh exits 0'   # passes brief-check.sh --brief (G-4, B204)
# B204 (P-745): a throwaway waves list, so the wave a fixture item is in never moves with qa's verdicts. Wave 1 has 4 unproven
# items (active), wave 2 is next; R1.6 is wave 4, R1.7 wave 3; R1.8 is Proven (wave 0).
printf '| # | Map row: capability | Module | Status |\n|---|---|---|---|\n' > "$T/caps.md"
for i in 1 2 3 4 5 6 7; do printf '| R1.%s | x | P | Partial |\n' "$i" >> "$T/caps.md"; done; printf '| R1.8 | x | P | Works |\n' >> "$T/caps.md"
printf 'R1.1\t1\tJ0\nR1.2\t1\tJ0\nR1.3\t1\tJ4\nR1.4\t1\tJ4\nR1.5\t2\tJ2\nR1.6\t4\tJ8\nR1.7\t3\tJ5\nR1.8\t0\tJ0\n' > "$T/waves.tsv"
export WAVES_TSV="$T/waves.tsv" WAVES_CAPS="$T/caps.md"
printf '| Row | Area | What |\n|---|---|---|\n| X-1 | runtime (case side) | a build row |\n| T-1 | tooling (P-745) | a tooling row |\n' > "$T/BACKLOG.md"; export FOCUS_BACKLOG_DIR="$T"
hook() { out=$(jq -n --arg t "$5" --arg p "${6-$BRIEF}" '{tool_name:"start_session", tool_input:{target:$t, prompt:$p}}' | PATH="$T/bin:$PATH" FAKE_KB="$1" FAKE_LOAD="$2" FAKE_PORTS="$3" bash "$P" --hook); r=$?; }
hook "$(gb 37)" 3 "" x local; ok "hook: a Mac start at 3.7 GB is denied with the reason" "$(echo "$out" | jq -e '.hookSpecificOutput.permissionDecision == "deny" and (.hookSpecificOutput.permissionDecisionReason | test("3.7 GB"))' >/dev/null && echo 1)" "$out"
hook "$(gb 37)" 3 "" x cloud; ok "hook: a cloud start is not checked" "$([ $r = 0 ] && [ -z "$out" ] && echo 1)" "$out"
hook "$(gb 150)" 3 "" x ""; ok "hook: a Mac start with room passes" "$([ $r = 0 ] && [ -z "$out" ] && echo 1)" "$out"
hook "$(gb 150)" 3 "" x cloud "Row X-1. Done when: check-x.sh exits 0"; ok "hook: a cloud brief with no model and effort line or Duplicate check is denied (G-4 (7))" "$(echo "$out" | jq -e '.hookSpecificOutput.permissionDecision == "deny" and (.hookSpecificOutput.permissionDecisionReason | test("model and effort") and test("Duplicate check"))' >/dev/null && echo 1)" "$out"
# B204 (P-745): what the lane is for, and its wave (brief-check.sh --brief, then waves.py allow).
B4=$'Row X-1. Model: Opus 5.5, effort: medium.\nDuplicate check: '"$FRESH_DUP"$' searched BACKLOG; none\nDone when: check-x.sh exits 0\n'
deny() { echo "$out" | jq -e --arg w "$1" '.hookSpecificOutput.permissionDecision == "deny" and (.hookSpecificOutput.permissionDecisionReason | test($w))' >/dev/null 2>&1 && echo 1; }
hook "$(gb 150)" 3 "" x cloud "${B4}Item: R1.6"; ok "hook: a Wave 4 item (R1.6) is refused, with its wave and the open waves" "$(deny 'OUTSIDE WAVE: R1.6 is in wave 4; lane starts are open for waves 0, 1, 2 only')" "$out"
hook "$(gb 150)" 3 "" x cloud "${B4}Item: R1.1"; ok "hook: a Wave 1 item (R1.1, the active wave) passes" "$([ $r = 0 ] && [ -z "$out" ] && echo 1)" "$out"
hook "$(gb 150)" 3 "" x cloud "${B4}- **Item:** R1.5, R1.8."; ok "hook: the next wave and a Proven item pass, in a bullet with bold and a full stop" "$([ $r = 0 ] && [ -z "$out" ] && echo 1)" "$out"
hook "$(gb 150)" 3 "" x cloud "${B4}Item: R1.1, R1.7"; ok "hook: one item outside the open waves refuses the start" "$(deny 'R1.7 is in wave 3')" "$out"
hook "$(gb 150)" 3 "" x cloud "$B4"; ok "hook: a row brief with no Item line is refused" "$(deny 'no \"Item:\" line')" "$out"
hook "$(gb 150)" 3 "" x cloud "${B4/Row X-1./Row T-1.}Item: none (tooling)"; ok "hook: Item: none (tooling) passes for a tooling row" "$([ $r = 0 ] && [ -z "$out" ] && echo 1)" "$out"
hook "$(gb 150)" 3 "" x cloud "${B4/Row X-1./\/next runtime T-1.}Item: none (tooling)"; ok "hook: ... and on /next runtime with a tooling row (a builder on a tooling row)" "$([ $r = 0 ] && [ -z "$out" ] && echo 1)" "$out"
hook "$(gb 150)" 3 "" x cloud "${B4}Build R1.6."$'\nItem: none (tooling)'; ok "hook: Item: none on a build row's brief is refused (no skipping the wave check)" "$(deny 'row X-1 is a build row')" "$out"
hook "$(gb 150)" 3 "" x cloud "${B4/Row X-1./\/next runtime X-1.}Item: none (records)"; ok "hook: ... on /next runtime with a build row too" "$(deny 'row X-1 is a build row')" "$out"
hook "$(gb 150)" 3 "" x cloud $'/lead: take over as Lead 9; R1.6 is in the hand-over. Model: Opus 5.5, effort: medium.\nItem: none (lead)'; ok "hook: a Lead start naming an item, with Item: none (lead), passes" "$([ $r = 0 ] && [ -z "$out" ] && echo 1)" "$out"
hook "$(gb 150)" 3 "" x cloud "${B4}**Item**: R1.1"; ok "hook: '**Item**: R1.1' is read" "$([ $r = 0 ] && [ -z "$out" ] && echo 1)" "$out"
hook "$(gb 150)" 3 "" x cloud "${B4}1. Item: R1.6"; ok "hook: '1. Item: R1.6' is read (and refused for its wave)" "$(deny 'R1.6 is in wave 4')" "$out"
hook "$(gb 150)" 3 "" x cloud "${B4}Item: the booking page"; ok "hook: an Item line that is neither R1 items nor none is refused" "$(deny 'neither R1 items')" "$out"
hook "$(gb 150)" 3 "" x cloud $'Model: Opus 5.5, effort: medium. You are a standby; wait for the Lead.'; ok "hook: a start naming no row and no R1 item needs no Item line" "$([ $r = 0 ] && [ -z "$out" ] && echo 1)" "$out"
hook "$(gb 150)" 3 "" x cloud $'Model: Opus 5.5, effort: medium. Build R1.6 now.'; ok "hook: a brief naming an R1 item but no row still needs an Item line" "$(deny 'no \"Item:\" line')" "$out"
WAVES_TSV="$T/none.tsv" hook "$(gb 150)" 3 "" x cloud "${B4}Item: R1.1"; ok "hook: an unreadable waves list refuses the start (fails closed)" "$(deny 'cannot read')" "$out"
ROOTD="$(cd "$TOOLS/../../../.." && pwd)"
jq -e '[.hooks.PreToolUse[] | select(.matcher | test("start_session")) | .hooks[].command | select(test("lane-preflight.sh --hook"))] | length == 1' "$ROOTD/.claude/settings.json" >/dev/null
ok "settings.json runs the preflight hook on start_session" "$([ $? = 0 ] && echo 1)"
grep -q 'lane-preflight.sh' "$ROOTD/.claude/skills/lead/SKILL.md"; ok "skill lead runs lane-preflight.sh before start_session" "$([ $? = 0 ] && echo 1)"
# E10: the touch-list overlap has its own test, run from here so check-guards.sh needs no new line.
tout=$(bash "$TOOLS/check-touch-overlap.sh" 2>&1); ok "check-touch-overlap.sh passes (E10, the touch list): $(echo "$tout" | tail -1)" "$([ $? = 0 ] && echo 1)" "$(echo "$tout" | grep '^FAIL')"
finish
