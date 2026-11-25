#!/usr/bin/env bash
# founder-wait.py and lead-watch step 13d (OS-18, P-530): a red "Waiting on the founder" line atop STATE or in its Start
# here gives one ACT to re-send the push once it has waited 30 min, then at most once an hour; a plain line between; none
# once the line is gone. Made-up STATE pages and clock times. US$0, no network.   bash product/tools/check-founder-wait.sh
set -u
. "$(dirname "$0")/guard-test-lib.sh"
T=$(mktemp -d "${TMPDIR:-/tmp}/fwait.XXXXXXXX") && [ -d "$T" ] || { echo "no temp dir: nothing was checked"; exit 2; }; trap 'rm -rf "${T:?}"' EXIT
S="$T/STATE.md"; M="$T/mem.json"
run() { o=$(python3 -I "$TOOLS/founder-wait.py" --state "$S" --memory "$M" --now "2026-11-25T$1:00+00:00" 2>&1); rc=$?; }
has() { grep -qF -- "$1" <<<"$o"; }; acts() { grep -c '^ACT' <<<"$o"; }
page() { printf '%s\n' "$@" > "$S"; }
RED='🔴 **Waiting on the founder (06:00 IST, P-530):** AWS console session expired; sign in again.'
page '# State' '' 'current_lead: x' '' "$RED" '' '## Start here' 'text'
run 06:00; ok "first seen: a plain line, its wait starts, no ACT" "$([ "$rc" = 0 ] && [ "$(acts)" = 0 ] && has 'founder wait: 🔴 line stands, waited 0 min; next re-send due in 30 min' && has 'AWS console session expired' && echo 1)" "$o"
run 06:20; ok "20 min: still a plain line (P-530 (2): over 30 min)" "$([ "$(acts)" = 0 ] && has 'waited 20 min; next re-send due in 10 min' && echo 1)" "$o"
run 06:30; ok "30 min: one ACT to re-send the push, quoting the line" "$([ "$(acts)" = 1 ] && has 'ACT   founder wait: waited 30 min, no re-send yet: re-send the push notification' && has 'AWS console session expired' && echo 1)" "$o"
run 06:40; ok "10 min after a re-send: no ACT (at most once an hour)" "$([ "$(acts)" = 0 ] && has 'next re-send due in 50 min' && echo 1)" "$o"
run 07:30; ok "an hour after the re-send: the ACT again" "$([ "$(acts)" = 1 ] && has 'waited 90 min, last re-send 60 min ago' && echo 1)" "$o"
page '# State' '' '## Start here' 'text'; run 07:40
ok "the line gone: no ACT, a plain line, and it is forgotten" "$([ "$(acts)" = 0 ] && has 'founder wait: no 🔴 Waiting on the founder line' && [ "$(cat "$M")" = '{}' ] && echo 1)" "$o"
page '# State' "$RED"; run 07:50; ok "the line back: its wait starts again" "$([ "$(acts)" = 0 ] && has 'waited 0 min' && echo 1)" "$o"
for shape in '1. **🔴 Waiting on the founder:** x' '**🔴 Waiting on the founder, right now:** x' '  - 🔴 Waiting on the founder: x'; do
  rm -f "$M"; page '# State' "$shape"; run 06:00; run 06:31
  ok "a list item, bold before the emoji or an indented bullet counts: $shape" "$([ "$(acts)" = 1 ] && echo 1)" "$o"; done
rm -f "$M"; page '# State' '' '## Start here (next Lead)' "$RED" '## Leads' 'x'; run 06:00; run 06:31
ok "a line at the top of Start here counts (P-530 (1))" "$([ "$(acts)" = 1 ] && echo 1)" "$o"
rm -f "$M"; page '# State' '## History' "$RED"; run 06:00; run 06:31
ok "a line inside another section is not the live line" "$([ "$(acts)" = 0 ] && has 'founder wait: no 🔴' && echo 1)" "$o"
rm -f "$M"; page '# State' 'Waiting on the founder: nothing (no red mark)'; run 06:00; ok "a plain mention: no line" "$(has 'founder wait: no 🔴' && echo 1)" "$o"
rm -f "$M"; printf '# State\r\n%s\r\n## Start here\r\n' "$RED" > "$S"; run 06:00; run 06:31; ok "CRLF lines" "$([ "$(acts)" = 1 ] && ! grep -q $'\r' <<<"$o" && echo 1)" "$o"
rm -f "$M"; page '# State' $'🔴 **Waiting on the founder:** sign in\x1b[31m\x07 now'; run 06:00
ok "control characters in the line are dropped" "$(! grep -q $'\x1b' <<<"$o" && has 'sign in[31m now' && echo 1)" "$o"
rm -f "$M"; page '# State' "🔴 **Waiting on the founder:** $(printf 'é%.0s' $(seq 1 300))"; run 06:00
ok "a long line is cut at 200 characters, never inside one" "$(python3 -I -c 'import sys; l = [x for x in sys.stdin.buffer.read().split(b"\n") if b"stands" in x][0]; l.decode("utf-8"); sys.exit(0)' <<<"$o" && echo 1)" "$o"
rm -f "$M"; page '# State' "$RED"; echo 'not json' > "$M"; run 06:00; ok "an unreadable memory: the wait starts again, no crash" "$([ "$rc" = 0 ] && has 'waited 0 min' && echo 1)" "$o"
echo '{"x": 1}' > "$M"; run 06:00; ok "a memory entry of the wrong shape: the wait starts again" "$([ "$rc" = 0 ] && has 'waited 0 min' && echo 1)" "$o"
rm -f "$S"; run 06:00; ok "no STATE.md: an ACT, never 'no line'" "$([ "$(acts)" = 1 ] && has 'STATE.md unreadable' && echo 1)" "$o"
mkdir "$S"; run 06:00; ok "STATE.md a directory: an ACT" "$([ "$(acts)" = 1 ] && has 'STATE.md unreadable' && echo 1)" "$o"; rmdir "$S"
# lead-watch step 13d, cut from lead-watch.sh (it ends in a blank line)
sed -n '/^# 13d (OS-18/,/^$/p' "$TOOLS/lead-watch.sh" > "$T/step.sh"; mkdir -p "$T/l/x" "$T/st"
ok "lead-watch has step 13d, ending in a blank line" "$(grep -q 'founder-wait.py' "$T/step.sh" && [ "$(tail -1 "$T/step.sh")" = "" ] && echo 1)" "$(cat "$T/step.sh")"
step() { printf 'import sys\nprint("""%s""")\nsys.exit(%s)\n' "$1" "${2:-0}" > "$T/l/x/founder-wait.py"; o=$( ( TOOLS="$T/l/x"; STATE_DIR="$T/st"; act=0; ACT() { act=$((act + 1)); echo "ACT   $1"; }; seen() { :; }; fresh() { :; }; . "$T/step.sh"; echo "acts=$act" ) 2>&1 ); }
step 'founder wait: no 🔴 line'; ok "step 13d: a plain line is no ACT" "$(has 'acts=0' && echo 1)" "$o"
step 'ACT   founder wait: waited 30 min'; ok "step 13d: its ACT line is counted" "$(has 'acts=1' && echo 1)" "$o"
step 'Traceback' 1; ok "step 13d: a crash is an ACT" "$(has 'did not run' && has 'acts=1' && echo 1)" "$o"
finish
