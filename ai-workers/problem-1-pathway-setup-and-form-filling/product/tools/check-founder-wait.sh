#!/usr/bin/env bash
# lead-watch step 13d (OS-18, P-530): a red "Waiting on the founder" line atop STATE is an ACT at every check, and none once
# it is gone. The step is cut from lead-watch.sh and run on made-up STATE pages. US$0, no network.
#   bash product/tools/check-founder-wait.sh
set -u
. "$(dirname "$0")/guard-test-lib.sh"
T=$(mktemp -d "${TMPDIR:-/tmp}/fwait.XXXXXXXX") && [ -d "$T" ] || { echo "no temp dir: nothing was checked"; exit 2; }; trap 'rm -rf "${T:?}"' EXIT
sed -n '/^# 13d (OS-18/,/^$/p' "$TOOLS/lead-watch.sh" > "$T/step.sh"; mkdir -p "$T/p/tools"
ok "lead-watch has step 13d, ending in a blank line" "$(grep -q 'founder wait: no' "$T/step.sh" && [ "$(tail -1 "$T/step.sh")" = "" ] && echo 1)" "$(cat "$T/step.sh")"
run() { o=$( ( TOOLS="$T/p/tools"; act=0; say() { echo "$1"; }; ACT() { act=$((act + 1)); echo "ACT   $1"; }; fresh() { :; }; . "$T/step.sh"; echo "acts=$act" ) 2>&1 ); }
has() { grep -qF -- "$1" <<<"$o"; }
page() { printf '%s\n' "$@" > "$T/p/STATE.md"; }
page '# State' '' 'current_lead: x' '' '🔴 **Waiting on the founder (00:3x IST 22 Nov, P-530):** AWS console session expired; sign in again.' '' '## Start here' 'text'
run; ok "a 🔴 line atop STATE: one ACT that quotes it" "$(has 'acts=1' && has "ACT   founder wait: STATE's 🔴 line stands: re-send the push notification" && has 'AWS console session expired' && echo 1)" "$o"
run; ok "the next check: the ACT again (re-sent each check, P-530)" "$(has 'acts=1' && echo 1)" "$o"
page '# State' '' 'current_lead: x' '' '## Start here' 'text'
run; ok "no line: no ACT, a plain line says so" "$(has 'acts=0' && has 'founder wait: no 🔴 Waiting on the founder line atop STATE' && echo 1)" "$o"
page '# State' '' '## Start here' '🔴 **Waiting on the founder (old, inside a section):** done'
run; ok "the line inside a section, not atop: no ACT" "$(has 'acts=0' && echo 1)" "$o"
page '# State' 'Waiting on the founder: nothing (plain text, not the red line)' '## x'
run; ok "a plain mention, not the 🔴 line: no ACT" "$(has 'acts=0' && echo 1)" "$o"
page '# State' $'🔴 **Waiting on the founder:** sign in\x1b[31m\x07 now' '## x'
run; ok "control characters in the line are dropped from the ACT" "$(has 'acts=1' && ! grep -q $'\x1b' <<<"$o" && has 'sign in[31m now' && echo 1)" "$o"
rm -f "$T/p/STATE.md"; run; ok "no STATE.md: an ACT, never 'no line'" "$(has 'acts=1' && has 'STATE.md unreadable' && echo 1)" "$o"
finish
