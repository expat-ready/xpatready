#!/usr/bin/env bash
# Lead 30's row (24 Nov): a suite that hits its limit says what it was waiting on, from Node's own report, and no secret of the
# environment, the command line, a folder or an address is ever printed (the logs are public). The filter on a hand-made raw
# report, then (Linux, as CI) run-suites.sh's own guarded() on a suite that hangs with secrets planted. No network, US$0.
#   bash product/tools/check-hang-report.sh
set -u
. "$(dirname "$0")/guard-test-lib.sh"
[ -f "$TOOLS/hang-report.py" ] || { ok "hang-report.py is there" 0 "no file: a hang says nothing about what it waits on"; finish; }
T=$(mktemp -d "${TMPDIR:-/tmp}/hr.XXXXXXXX") && [ -d "$T" ] || { echo "no temp dir: nothing was checked"; exit 2; }
trap 'rm -rf "${T:?}"' EXIT
mkdir "$T/raw"; cat > "$T/raw/report.1.json" <<'E2'
{"header":{"commandLine":["node","PLANTED_ARG"],"cwd":"/PLANTED_CWD","host":"PLANTED_HOST","networkInterfaces":[{"address":"PLANTED_ADDR"}]},
 "javascriptStack":{"message":"PLANTED_MESSAGE","stack":["at waitALittle (/home/PLANTED_DIR/suite.cjs:62:34)","at async Frame.waitForTimeout (/x/PLANTED_DIR/frame.js:1:2)","PLANTED_LINE token=abc","at f (https://u:pw@h/PLANTEDURL.js:1:1)","at f (/x/y.js?token=PLANTEDQ:1:1)","at f (data:text/javascript,PLANTEDD:1:1)","at postgres:PLANTEDPW@h:1:1","at Object.password PLANTED_FN (/a/b.js:1:1)"],"errorProperties":{"k":"PLANTED_PROP"}},
 "nativeStack":[{"pc":"0x1","symbol":"node::TriggerNodeReport(x)"},{"pc":"0x1","symbol":"uv__io_poll PLANTED_SYMBOL [node]"}],
 "libuv":[{"type":"timer","is_active":true,"is_referenced":true,"firesInMsFromNow":300,"address":"0xPLANTED"},{"type":"tcp","is_active":true,"is_referenced":true,"localEndpoint":{"host":"PLANTED_EP"}},{"type":"tcp","is_active":true,"is_referenced":true},{"type":"PLANTED KIND"}],
 "sharedObjects":["/PLANTED_SO"],"userLimits":{"x":"PLANTED"}}
E2
o=$(python3 -I "$TOOLS/hang-report.py" "$T/raw")
ok "the JavaScript stack: function, file and line, no folder" "$(grep -qx '  js      at waitALittle suite.cjs:62:34' <<<"$o" && grep -qx '  js      at async Frame.waitForTimeout frame.js:1:2' <<<"$o" && echo 1)" "$o"
ok "the native symbol and each handle (timers with their time, alike ones counted)" "$(grep -q '^  native  uv__io_poll$' <<<"$o" && ! grep -q TriggerNodeReport <<<"$o" && grep -qx '  uv      timer active=True referenced=True fires in 300 ms' <<<"$o" && grep -qx '  uv      tcp active=True referenced=True x2' <<<"$o" && [ "$(grep '^  uv' <<<"$o" | head -1 | cut -c11-15)" = timer ] && echo 1)" "$o"
ok "nothing planted is printed (argument, folder, host, address, message, property, endpoint, odd line)" "$(! grep -q PLANTED <<<"$o" && ! grep -q 'token=abc' <<<"$o" && echo 1)" "$(grep PLANTED <<<"$o")"
echo '{"environmentVariables":{"K":"PLANTED_ENVIRONMENT"},"javascriptStack":{"stack":["at f (/a/b.js:1:1)"]}}' > "$T/raw/report.1.json"; o=$(python3 -I "$TOOLS/hang-report.py" "$T/raw"); ok "a report with the environment in it is not shown at all" "$(grep -q 'not shown' <<<"$o" && ! grep -qE 'PLANTED|b.js' <<<"$o" && echo 1)" "$o"
echo 'PLANTED {' > "$T/raw/report.1.json"; o=$(python3 -I "$TOOLS/hang-report.py" "$T/raw"); ok "an unreadable report says so and shows nothing of it" "$([ "$o" = 'node report 1: unreadable' ] && echo 1)" "$o"
for b in '{"javascriptStack":{"stack":{"a":1}}}' '{"libuv":[{"type":"timer","firesInMsFromNow":Infinity}]}'; do echo "$b" > "$T/raw/report.1.json"; o="$(python3 -I "$TOOLS/hang-report.py" "$T/raw")" || odd="${odd:-} $b"; done; ok "odd shapes do not stop it" "$([ -z "${odd:-}" ] && echo 1)" "${odd:-}"
mkdir "$T/ask"; : > "$T/ask/asked"; o=$(python3 -I "$TOOLS/hang-report.py" "$T/ask"); ok "asked and nothing written: it says so" "$(grep -q '^node report: asked, none written' <<<"$o" && echo 1)" "$o"
mkdir "$T/none"; o=$(python3 -I "$TOOLS/hang-report.py" "$T/none"); ok "no report: no line" "$([ -z "$o" ] && echo 1)" "$o"

R="$TOOLS/run-suites.sh"
ok "run-suites.sh asks Node to leave the environment and the network out" "$(grep -q -- '--report-on-signal --report-exclude-env --report-exclude-network --report-directory=' "$R" && echo 1)"
ok "the limit, the TERM and the KILL are as they were" "$(grep -q '"$TIMEOUT" -k "$KILL_AFTER" "$LIMIT" "$@" < /dev/null >> "$log" 2>&1 &' "$R" && grep -q 'sleep "$(( LIMIT > 2 ? LIMIT - 1 : 1 ))"' "$R" && echo 1)"
TMO=$(command -v timeout || command -v gtimeout || true)
if [ -d /proc/self/fd ] && [ -n "$TMO" ] && node --report-exclude-env --report-exclude-network -e 0 2>/dev/null; then
  { sed -n '/^LIMIT="/,/^  return "\$code"/p' "$R"; echo '}'; } > "$T/guarded.sh"; mkdir "$T/tmp"
  cat > "$T/hang.cjs" <<'E2'
const { spawn } = require("node:child_process"); spawn("sleep", ["30"], { stdio: "ignore" });
function waitingForNothing() { setTimeout(() => {}, 300000); } waitingForNothing(); console.log("suite started");
E2
  echo 'console.log("done")' > "$T/quick.cjs"
  g() { ( cd "$TOOLS/../../../.." && P="${PRODREL%/product}" TIMEOUT="$TMO" SUITES_TIMEOUT=$1 TMPDIR="$T/tmp" HANG_MARKER=PLANTED_IN_ENV; export HANG_MARKER TMPDIR; . "$T/guarded.sh"; shift; guarded "$@"; echo "rc=$?" ) 2>"$T/g.err"; }
  o=$(g 4 "$T/hang.log" node "$T/hang.cjs" PLANTED_IN_ARGS); l=$(cat "$T/hang.log"); rep=$(sed -n '/^node report/,$p' <<<"$l")
  ok "a suite that hangs: exit 124 as before, and the log says what it waits on (its timer)" "$(grep -qx 'rc=124' <<<"$o" && grep -q '^STOP still running' <<<"$l" && grep -qE '^  uv      timer active=True referenced=True fires in [0-9]+ ms' <<<"$rep" && echo 1)" "$o / $l / $(cat "$T/g.err")"
  ok "no planted secret of the environment is in the log, none of the arguments in the report" "$(! grep -q PLANTED_IN_ENV <<<"$l" && ! grep -q PLANTED <<<"$rep" && echo 1)" "$l"
  ok "the raw report is gone" "$([ -z "$(ls -A "$T/tmp")" ] && echo 1)" "$(ls -R "$T/tmp")"
  o=$(g 20 "$T/quick.log" node "$T/quick.cjs"); ok "a suite that ends: its own output and exit code, nothing added" "$([ "$(cat "$T/quick.log")" = done ] && grep -qx 'rc=0' <<<"$o" && [ -z "$(ls -A "$T/tmp")" ] && echo 1)" "$o / $(cat "$T/quick.log")"
  o=$(g 4 "$T/sh.log" bash -c 'echo shell; sleep 30'); ok "a suite that is not node is not signalled (124, not 140)" "$(grep -qx 'rc=124' <<<"$o" && ! grep -q 'node report' "$T/sh.log" && echo 1)" "$o / $(cat "$T/sh.log")"
else echo "note: not Linux, or no Node with --report-exclude-env: the live part runs in CI"; fi
finish
