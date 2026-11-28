#!/usr/bin/env bash
# ENF-761 part 4, the check watchdog (founder, 20 Nov 15:0x IST: a 98-min gap, 12:24 to 14:03 IST, at a hand-over: a
# scheduled check fires only while its session is idle, and the old Lead deleted its check before the new one made its
# own). lead-watch.sh gap reads only the stall guard's stamp and makes no GitHub call; lead-check-guard.sh allows the
# standby's recurring prompt "run lead-watch gap"; skill lead orders the hand-over. Clock faked; a gh that logs. US$0.
#   bash product/tools/check-lead-gap.sh
set -u
. "$(dirname "$0")/guard-test-lib.sh"
command -v jq >/dev/null || { echo "jq is missing; nothing was checked"; exit 2; }
T=$(mktemp -d "${TMPDIR:-/tmp}/gap.XXXXXXXX"); trap 'rm -rf "$T"' EXIT; mkdir -p "$T/bin" "$T/state"
printf '#!/bin/sh\necho "gh $*" >> "%s/gh.log"; exit 1\n' "$T" > "$T/bin/gh"; chmod +x "$T/bin/gh"
NOW=1763600000
gap() { out=$(PATH="$T/bin:$PATH" LEAD_WATCH_STATE_DIR="$T/state" NOW=$NOW bash "$TOOLS/lead-watch.sh" gap 2>&1); r=$?; }
gap; ok "no stamp yet: ACT watchdog never, exit 1" "$([ $r = 1 ] && grep -q '^ACT   watchdog: last Lead check never' <<< "$out" && echo 1)" "exit $r: $out"
echo $((NOW - 16 * 60)) > "$T/state/last-check"
gap; ok "last check 16 min ago: 'ACT watchdog: last Lead check 16 min ago', exit 1 (fail case)" "$([ $r = 1 ] && [ "$out" = 'ACT   watchdog: last Lead check 16 min ago' ] && echo 1)" "exit $r: $out"
echo $((NOW - 15 * 60)) > "$T/state/last-check"
gap; ok "15 min ago is not over 15: one ok line, exit 0 (pass case)" "$([ $r = 0 ] && [ "$out" = 'ok    watchdog: last Lead check 15 min ago' ] && echo 1)" "exit $r: $out"
echo $((NOW - 98 * 60)) > "$T/state/last-check"; before=$(cat "$T/state/last-check")
gap; ok "20 Nov's 98-min gap: ACT ... 98 min ago" "$([ $r = 1 ] && grep -q '98 min ago$' <<< "$out" && echo 1)" "exit $r: $out"
ok "gap mode never writes the stamp (a standby must not hide the Lead's gap)" "$([ "$(cat "$T/state/last-check")" = "$before" ] && echo 1)" "$(cat "$T/state/last-check")"
ok "gap mode makes no GitHub call" "$([ ! -s "$T/gh.log" ] && echo 1)" "$(cat "$T/gh.log" 2>/dev/null)"
echo $((NOW - 10 * 60)) > "$T/state/last-check"
gap; ok "gap at 10 min: one ok line, exit 0" "$([ $r = 0 ] && [ "$out" = 'ok    watchdog: last Lead check 10 min ago' ] && echo 1)" "exit $r: $out"
echo $((NOW - 20 * 60)) > "$T/state/last-check"
gap; ok "gap at 20 min: 'ACT watchdog: last Lead check 20 min ago', exit 1" "$([ $r = 1 ] && [ "$out" = 'ACT   watchdog: last Lead check 20 min ago' ] && echo 1)" "exit $r: $out"
for bad in '12 34' 'abc' 'TOOLS[$(touch '"$T"'/pwned)]'; do printf '%s\n' "$bad" > "$T/state/last-check"; : > "$T/gh.log"
  gap; ok "garbage stamp '$bad': ACT unreadable, exit 1, stamp untouched, no gh call, nothing run" "$([ $r = 1 ] && [ "$out" = "ACT   watchdog: Lead check stamp unreadable at $T/state/last-check" ] && [ "$(cat "$T/state/last-check")" = "$bad" ] && [ ! -s "$T/gh.log" ] && [ ! -e "$T/pwned" ] && echo 1)" "exit $r: $out"; done
echo $((NOW + 60 * 60)) > "$T/state/last-check"
gap; ok "stamp 60 min in the future (clock jump): ACT, exit 1, not a silent ok" "$([ $r = 1 ] && grep -q '^ACT   watchdog: Lead check stamp is 60 min in the future' <<< "$out" && echo 1)" "exit $r: $out"
# The normal run's stall guard (step 0) is lowered from 40 to 15 min; only its first lines are read (real clock, fake gh).
# Output goes to a file (never a pipe, whose reader would wait on any child still holding it: guards hung 30 min in CI on
# 6aa72f3/6c66a84). It is polled for step 0's stamp (the three A363 lines come first), then the whole run is SIGKILLed; psql, curl and gh are stubs.
G=$(command -v git); printf '#!/bin/sh\nfor a; do [ "$a" = fetch ] && exit 1; done\nexec %s "$@"\n' "$G" > "$T/bin/git"; chmod +x "$T/bin/git"   # no network: the A363 lines say unknown
for c in psql curl; do printf '#!/bin/sh\nexit 1\n' > "$T/bin/$c"; chmod +x "$T/bin/$c"; done
SETSID=$(command -v setsid || true)
run() { echo $(( $(date +%s) - $1 * 60 )) > "$T/state/last-check"; : > "$T/run.out"
  PATH="$T/bin:$PATH" LEAD_WATCH_STATE_DIR="$T/state" GIT_TERMINAL_PROMPT=0 $SETSID bash "$TOOLS/lead-watch.sh" > "$T/run.out" 2>/dev/null < /dev/null & local pid=$! i
  for i in $(seq 150); do grep -q 'IST from the clock' "$T/run.out" && break; kill -0 "$pid" 2>/dev/null || break; sleep 0.1; done
  kill -KILL -- "-$pid" 2>/dev/null || kill -KILL "$pid" 2>/dev/null; wait "$pid" 2>/dev/null; out=$(sed -n '/^time  /,/IST from the clock/p' "$T/run.out"); }
run 20; ok "normal run, previous check 20 min ago: the stall ACT (was silent under the 40-min guard)" "$(grep -q '^ACT   previous check ran 20 min ago' <<< "$out" && echo 1)" "$out"
run 10; ok "normal run, previous check 10 min ago: step 0 ran and gave no stall ACT (the line after the time is step 0's fresh stamp, ENF-803)" "$(grep -q '^time  ' <<< "$out" && sed -n 2p <<< "$out" | grep -qE '^ +read [0-9:]+ IST from the clock' && ! grep -q 'previous check ran' <<< "$out" && echo 1)" "$out"
# lead-check-guard.sh: the standby's recurring prompt "run lead-watch gap" is allowed in the Lead's copy; additions are not.
git init -q "$T/copy" && mkdir -p "$T/copy/$PRODREL/tools" && printf '#!/bin/bash\necho "$FAKE_LANE"\n' > "$T/copy/$PRODREL/tools/lane.sh"
guard() { local o; o=$(jq -n --arg p "$2" --arg d "$T/copy" '{tool_name:"CronCreate", tool_input:{cron:"*/10 * * * *", prompt:$p, recurring:true}, cwd:$d}' | FAKE_LANE="$1" bash "$TOOLS/lead-check-guard.sh")
  if printf '%s' "$o" | jq -e '.hookSpecificOutput.permissionDecision == "deny"' >/dev/null 2>&1; then echo deny; else echo allow; fi; }
r=$(guard lead 'run lead-watch gap'); ok "guard: recurring 'run lead-watch gap' allowed in the Lead's copy" "$([ "$r" = allow ] && echo 1)" "got $r"
r=$(guard lead '  Run lead-watch gap.'); ok "guard: ... case, spacing and a full stop aside" "$([ "$r" = allow ] && echo 1)" "got $r"
r=$(guard lead 'run lead-watch gap; and label #2401'); ok "guard: ... anything added is refused" "$([ "$r" = deny ] && echo 1)" "got $r"
r=$(guard lead 'check the queue every 10 minutes'); ok "guard: another recurring prompt in the Lead's copy is still refused" "$([ "$r" = deny ] && echo 1)" "got $r"
r=$(guard qa 'run lead-watch gap now'); ok "guard: ... in any copy, since it names lead-watch" "$([ "$r" = deny ] && echo 1)" "got $r"
# skill lead: the hand-over order and the standby's watchdog.
S="$(cd "$TOOLS/../../../.." && pwd)/.claude/skills/lead/SKILL.md"
grep -q "first action is creating its check" "$S" && grep -q "CronList shows" "$S" && grep -q '`run lead-watch gap`' "$S" && grep -q "one push notification per gap and messages the current Lead" "$S" && grep -q "no answer by 30 min → the lowest-numbered standby takes over (the other only notifies)" "$S" && grep -q "new sessions only for work no lane covers" "$S" && grep -q "adopts the running lanes from STATE" "$S"
ok "skill lead: new Lead's check first, old one deleted only after its CronList shows it, standby gap check, one push per gap, lowest standby takes over at 30, lanes adopted not duplicated" "$([ $? = 0 ] && echo 1)"
b=$(wc -c < "$S" | tr -d ' '); ok "skill lead stays under 10,240 bytes ($b)" "$([ "$b" -lt 10240 ] && echo 1)" "$b bytes"
# skill lead-watch (reviewer Major, 21 Nov): a standby's "run lead-watch gap" must not be served by the full run, which
# rewrites the Lead's stamp every 10 min and so hides the very gap the watchdog is for.
W="${S%/lead/SKILL.md}/lead-watch/SKILL.md"
ok "skill lead-watch: the standby prompt runs only lead-watch.sh gap, never the full run" "$(grep -q 'Standby prompt `run lead-watch gap` → only `lead-watch.sh gap`\*\* (a full run rewrites the Lead.s stamp)' "$W" && echo 1)" "no gap line in $W"
b=$(wc -c < "$W" | tr -d ' '); ok "skill lead-watch stays under 10,240 bytes ($b)" "$([ "$b" -lt 10240 ] && echo 1)" "$b bytes"
finish
