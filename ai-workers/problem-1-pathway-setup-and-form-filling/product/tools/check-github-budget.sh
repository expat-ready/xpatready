#!/usr/bin/env bash
# LR-174 (founder A455, 28 Nov): the GitHub budget is known and enforced. github-meter.sh measures a script's requests from
# the x-ratelimit headers and logs them; "budget" fails any script over its line in github-budget.tsv (or metered with no
# line); "fits" refuses a run the remaining budget cannot hold; lead-watch.sh's top line is the budget, and a full check
# that would not fit runs no GitHub step. On the Lead's machine the live meter log is judged too. A stand-in curl plays
# GET /rate_limit; no network, US$0.   bash product/tools/check-github-budget.sh
set -u
. "$(dirname "$0")/guard-test-lib.sh"
T=$(mktemp -d "${TMPDIR:-/tmp}/ghbud.XXXXXXXX") && [ -d "$T" ] || { echo "no temp dir: nothing was checked"; exit 2; }; trap 'rm -rf "$T"' EXIT
mkdir -p "$T/bin" "$T/meter" "$T/state"
cat > "$T/bin/curl" <<'EOF'
#!/bin/bash
d=""; u=""; while [ $# -gt 0 ]; do case "$1" in -D) d=$2; shift;; -o|-H|-X|--max-time) shift;; http*) u=$1;; esac; shift; done; cat >/dev/null
case "$u" in */rate_limit) ;; *) echo "unexpected $u" >> "$FX/unexpected.log"; exit 22;; esac
[ -s "$FX/down" ] && exit 7
used=$(cat "$FX/used"); rem=$(( 5000 - used ))
h=$(printf 'HTTP/2 200\r\nx-ratelimit-limit: 5000\r\nx-ratelimit-used: %s\r\nx-ratelimit-remaining: %s\r\nx-ratelimit-reset: %s\r\n\r\n' "$used" "$rem" "$(cat "$FX/reset")")
if [ "$d" = - ]; then printf '%s' "$h"; else printf '%s' "$h" > "$d"; fi
EOF
printf '#!/bin/sh\n[ "$1 $2" = "auth token" ] && { echo gho_StandIn; exit 0; }\nexit 1\n' > "$T/bin/gh"; chmod +x "$T/bin/curl" "$T/bin/gh"
echo 10 > "$T/used"; echo 1800000000 > "$T/reset"
export FX="$T" XR_GITHUB_API="https://stand-in.invalid" GITHUB_METER_DIR="$T/meter" PATH="$T/bin:$PATH"; unset XR_APP_ID XR_APP_INSTALLATION_ID XR_APP_KEY_FILE GH_TOKEN GITHUB_TOKEN
M="$TOOLS/github-meter.sh"; BF="$T/budget.tsv"
printf '# test budget\nlead-watch-full\t2800\tline\nlead-watch-lite\t50\tline\n' > "$BF"; export GITHUB_BUDGET_FILE="$BF"
row() { printf '%s\t%s\t%s\t%s\t60s\t100\tuser OAuth (gho_, gh CLI)\n' 1800000000 "15:19 IST" "$1" "$2"; }

# budget: the passing and the failing case
{ row lead-watch-full 2900; row lead-watch-full 2650; row lead-watch-lite 31; } > "$T/pass.tsv"
out=$(bash "$M" budget "$T/pass.tsv" 2>&1); r=$?; ok "pass: newest costs under their lines (2650 of 2800, 31 of 50): exit 0" "$([ $r = 0 ] && grep -q '^ok    lead-watch-full: 2650 of 2800' <<<"$out" && echo 1)" "exit $r: $out"
{ row lead-watch-full 2650; row lead-watch-full 2900; } > "$T/over.tsv"
out=$(bash "$M" budget "$T/over.tsv" 2>&1); r=$?; ok "fail: lead-watch-full measured 2900, over its line 2800: exit 1, FAIL names it" "$([ $r = 1 ] && grep -q '^FAIL  lead-watch-full: measured 2900 requests (15:19 IST) over its budget line 2800' <<<"$out" && echo 1)" "exit $r: $out"
{ row lead-watch-full 100; row new-script.sh 5; } > "$T/noline.tsv"
out=$(bash "$M" budget "$T/noline.tsv" 2>&1); r=$?; ok "fail: a metered script with no budget line" "$([ $r = 1 ] && grep -q '^FAIL  new-script.sh: measured 5 requests .* no budget line' <<<"$out" && echo 1)" "exit $r: $out"
out=$(bash "$M" budget "$T/none.tsv" 2>&1); r=$?; ok "no measurements yet: exit 0, says so" "$([ $r = 0 ] && grep -q 'no measurements' <<<"$out" && echo 1)" "exit $r: $out"
ok "the real github-budget.tsv has the lead-watch-full line" "$(awk -F'\t' '$1=="lead-watch-full" && $2 ~ /^[0-9]+$/' "$TOOLS/github-budget.tsv" | grep -q . && echo 1)" "$(cat "$TOOLS/github-budget.tsv")"

# run: the cost from the headers, logged per script
out=$(bash "$M" run lead-watch-full -- bash -c 'echo 47 > "$FX/used"; echo work' 2>"$T/err"); r=$?
ok "run: the command's own output and exit code pass through" "$([ $r = 0 ] && [ "$out" = work ] && echo 1)" "exit $r: $out"
ok "run: 37 requests (used 10 → 47) logged for lead-watch-full with remaining 4953" "$(awk -F'\t' '$3=="lead-watch-full" && $4==37 && $6==4953' "$T/meter/meter.tsv" | grep -q . && grep -q 'meter lead-watch-full: 37 requests' "$T/err" && echo 1)" "$(cat "$T/meter/meter.tsv" "$T/err")"
bash "$M" run failing -- bash -c 'exit 5' 2>/dev/null; r=$?; ok "run: a failing command's exit code is kept" "$([ $r = 5 ] && echo 1)" "exit $r"
f="$T/start"; bash "$M" start "$f" >/dev/null; echo 1700000000 > "$T/reset"; echo 12 > "$T/used"; bash "$M" stop reset-case "$f" >/dev/null 2>&1
ok "a window reset during the run logs the new window's use (a floor), not a negative number" "$(awk -F'\t' '$3=="reset-case" && $4==12' "$T/meter/meter.tsv" | grep -q . && echo 1)" "$(cat "$T/meter/meter.tsv")"
echo 1800000000 > "$T/reset"

# fits and the top line
echo 100 > "$T/used"; out=$(bash "$M" fits lead-watch-full); r=$?; ok "fits: 4900 remaining holds 2800: exit 0" "$([ $r = 0 ] && echo 1)" "exit $r: $out"
echo 4900 > "$T/used"; out=$(bash "$M" fits lead-watch-full); r=$?; ok "fits: 100 remaining does not hold 2800: exit 1" "$([ $r = 1 ] && grep -q '100 remaining is under lead-watch-full' <<<"$out" && echo 1)" "exit $r: $out"
out=$(bash "$M" fits nothing-here 2>&1); r=$?; ok "fits: no budget line: exit 2" "$([ $r = 2 ] && echo 1)" "exit $r: $out"
echo x > "$T/down"; out=$(bash "$M" top); r=$?; ok "top: GitHub unreadable says budget unknown, exit 2" "$([ $r = 2 ] && grep -q 'budget unknown' <<<"$out" && echo 1)" "exit $r: $out"; : > "$T/down"
out=$(bash "$M" top); ok "top: kind, limit, used, remaining, reset IST, App note" "$(grep -qE '^github token user OAuth \(gho_, gh CLI\) · limit 5000/h · used 4900 · remaining 100 · resets [0-9]{2}:[0-9]{2} IST · org App token not in use' <<<"$out" && echo 1)" "$out"

# calls: one line per gh.sh call, summed per script
now=$(date +%s); printf '%s\tqueue-batches.py\tapi x\n%s\tqueue-batches.py\tapi y\n%s\tsle-watch.py\tapi z\n%s\told.py\tapi q\n' "$now" "$now" "$now" $((now - 7200)) > "$T/meter/calls.tsv"
out=$(GH_METER_CALLS="$T/meter/calls.tsv" bash "$M" calls 60); ok "calls: per script in the last hour, the older call left out" "$(grep -qE '^ +2  queue-batches.py$' <<<"$out" && grep -qE '^ +3  total through gh.sh$' <<<"$out" && ! grep -q old.py <<<"$out" && echo 1)" "$out"

# lead-watch: the budget is its top line; a full check that would not fit makes no GitHub step and no fetch
printf '#!/bin/sh\nfor a; do [ "$a" = fetch ] && { echo fetch >> "%s/fetch.log"; exit 1; }; done\nexec %s "$@"\n' "$T" "$(command -v git)" > "$T/bin/git"; chmod +x "$T/bin/git"
printf 'lead-watch-full\t2800\tline\n' > "$BF"
echo 4900 > "$T/used"
out=$(cd "$TOOLS" && GH_TOKEN=gho_StandIn LEAD_WATCH_STATE_DIR="$T/state" timeout 60 bash "$TOOLS/lead-watch.sh" 2>/dev/null); r=$?
ok "lead-watch: the first line is the GitHub budget" "$(head -1 <<<"$out" | grep -q '^github token user OAuth (gho_, gh CLI) · limit 5000/h · used 4900 · remaining 100' && echo 1)" "$(head -3 <<<"$out")"
ok "lead-watch over budget: one ACT, then the lite check instead of any full-check step (LR-175), nothing but /rate_limit asked of curl" "$([ $r -ge 2 ] && grep -q '^ACT   github budget: 100 remaining is under lead-watch-full.s budget 2800 .*the lite check runs instead' <<<"$out" && grep -q 'mode lite' <<<"$out" && ! grep -q '^tools  ' <<<"$out" && [ ! -s "$T/unexpected.log" ] && echo 1)" "exit $r: $out"
st=$(cat "$T/state/last-check" 2>/dev/null); ok "... and it still writes the check stamp, so the standbys' gap alarm stays quiet" "$([ -n "$st" ] && [ $(( $(date +%s) - st )) -lt 60 ] && echo 1)" "stamp: ${st:-none}"

# The Lead's machine: the live meter log is judged against the real budget lines (skipped where there is none, as in CI).
LIVE="${LEAD_WATCH_STATE_DIR:-/private/tmp/claude-$(id -u)/lead-watch}/github-meter/meter.tsv"
if [ -s "$LIVE" ]; then out=$(GITHUB_BUDGET_FILE="$TOOLS/github-budget.tsv" bash "$M" budget "$LIVE" 2>&1); r=$?
  ok "live: every Lead script in $LIVE is within its budget line" "$([ $r = 0 ] && echo 1)" "$out"
else echo "skip  live: no meter log at $LIVE (not the Lead's machine)"; fi
finish
