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
# lead-check-guard.sh: the standby's recurring prompt "run lead-watch gap" is allowed in the Lead's copy; additions are not.
git init -q "$T/copy" && mkdir -p "$T/copy/$PRODREL/tools" && printf '#!/bin/bash\necho "$FAKE_LANE"\n' > "$T/copy/$PRODREL/tools/lane.sh"
guard() { local o; o=$(jq -n --arg p "$2" --arg d "$T/copy" '{tool_name:"CronCreate", tool_input:{cron:"*/10 * * * *", prompt:$p, recurring:true}, cwd:$d}' | FAKE_LANE="$1" bash "$TOOLS/lead-check-guard.sh")
  if printf '%s' "$o" | jq -e '.hookSpecificOutput.permissionDecision == "deny"' >/dev/null 2>&1; then echo deny; else echo allow; fi; }
r=$(guard lead 'run lead-watch gap'); ok "guard: recurring 'run lead-watch gap' allowed in the Lead's copy" "$([ "$r" = allow ] && echo 1)" "got $r"
r=$(guard lead '  Run lead-watch gap.'); ok "guard: ... case, spacing and a full stop aside" "$([ "$r" = allow ] && echo 1)" "got $r"
r=$(guard lead 'run lead-watch gap; and label #2401'); ok "guard: ... anything added is refused" "$([ "$r" = deny ] && echo 1)" "got $r"
r=$(guard qa 'run lead-watch gap now'); ok "guard: ... in any copy, since it names lead-watch" "$([ "$r" = deny ] && echo 1)" "got $r"
# skill lead: the hand-over order and the standby's watchdog.
S="$(cd "$TOOLS/../../../.." && pwd)/.claude/skills/lead/SKILL.md"
grep -q "first action is creating its check" "$S" && grep -q "CronList shows" "$S" && grep -q '`run lead-watch gap`' "$S" && grep -qi "push notification" "$S" && grep -q "30 min" "$S"
ok "skill lead: new Lead's check first, old one deleted only after its CronList shows it, standby gap check, push at 15, take over at 30" "$([ $? = 0 ] && echo 1)"
b=$(wc -c < "$S" | tr -d ' '); ok "skill lead stays under 10,240 bytes ($b)" "$([ "$b" -lt 10240 ] && echo 1)" "$b bytes"
finish
