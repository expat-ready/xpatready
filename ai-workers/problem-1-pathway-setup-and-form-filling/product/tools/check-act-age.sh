#!/usr/bin/env bash
# OS-85 part 2: act-age.py moves ACT lines about events over 72 h old to a weekly stale line, and lead-watch.sh pipes
# retry-watch.py and outside-deps-watch.py through it. Cases on made-up detector output with a fixed clock. US$0.
#   bash product/tools/check-act-age.sh
set -u
. "$(dirname "$0")/guard-test-lib.sh"
T=$(mktemp -d "${TMPDIR:-/tmp}/aa.XXXXXXXX") && [ -d "$T" ] || { echo "no temp dir: nothing was checked"; exit 2; }; trap 'rm -rf "${T:?}"' EXIT
A="$TOOLS/act-age.py"; NOW=2026-11-26T08:00:00Z   # 26 Nov 13:30 IST
IN='retry 3 of 9 suites that passed only on retry have no fix PR; comments read to 26 Nov 13:00 IST
ACT   retry: check_a.ts passed only on retry 2 times, newest on #3001 at 18 Nov 10:15 IST: no PR names its fix
ACT   retry: check_b.ts passed only on retry 1 time, newest on #3790 at 25 Nov 22:40 IST: no PR names its fix
ACT   retry: check_c.ts passed only on retry 4 times, newest on #3100 at 19 Nov 09:00 IST: it came back after #3200'"'"'s fix
ACT   retry: memory unreadable: /x/retry-watch.json; reading again
ACT outside: 3 SomeVendor: stuck for 230 h (since 16 Nov 21:40 IST)
ACT outside: 4 Other: decision date 24 Nov reached, not done: decide or take the fallback (none)'
run() { out=$(printf '%s\n' "$IN" | python3 -I "$A" --name "${N:-retry}" --state "$T/s" --now "${AT:-$NOW}" 2>&1); r=$?; }
run
ok "an ACT about an event over 72 h old (18 Nov, 19 Nov, 16 Nov) leaves the check" "$(! grep -v '^ACT   stale' <<< "$out" | grep -qE '^ACT .*(check_a|check_c|SomeVendor)' && echo 1)" "$out"
ok "an ACT about a recent event (25 Nov 22:40) and one within 72 h by its date (24 Nov) stay" "$(grep -q '^ACT   retry: check_b' <<< "$out" && grep -q '^ACT outside: 4 Other' <<< "$out" && echo 1)" "$out"
ok "an ACT with no date (memory unreadable) and info lines pass unchanged" "$(grep -q 'memory unreadable' <<< "$out" && grep -q '^retry 3 of 9' <<< "$out" && echo 1)" "$out"
ok "the first check lists the stale lines once as a weekly ACT, naming the file" "$([ "$(grep -c '^ACT   stale retry: 3 line(s)' <<< "$out")" = 1 ] && grep -q "stale-retry.txt" <<< "$out" && [ "$(wc -l < "$T/s/stale-retry.txt")" = 3 ] && echo 1)" "$out"
ok "exit 0" "$([ $r = 0 ] && echo 1)" "exit $r"
AT=2026-11-26T08:10:00Z run
ok "ten minutes later: one info line, no ACT for the stale list (listed weekly, next date named)" "$(! grep -q '^ACT   stale' <<< "$out" && grep -q '^stale retry: 3 line(s) .* listed weekly (next 03 Dec 13:30 IST)' <<< "$out" && echo 1)" "$out"
AT=2026-12-03T08:00:00Z run
ok "a week later the stale list is an ACT again" "$(grep -q '^ACT   stale retry:' <<< "$out" && echo 1)" "$out"
N=outside AT=2026-11-26T08:10:00Z run
ok "each name keeps its own week (outside lists on its first check)" "$(grep -q '^ACT   stale outside:' <<< "$out" && echo 1)" "$out"
IN2="$IN"; IN='ACT   retry: check_a.ts passed only on retry 3 times, newest on #3801 at 26 Nov 11:00 IST: no PR names its fix'; run
ok "the same suite passing only on retry again (a new date) is shown at once: still true" "$(grep -q '^ACT   retry: check_a.ts .*26 Nov 11:00' <<< "$out" && echo 1)" "$out"
IN='ACT   retry: something on 31 Dec 10:00 IST
ACT   retry: other on 28 Dec 10:00 IST'; AT=2027-01-02T08:00:00Z run
ok "a date across the new year counts by the nearest year: 31 Dec (2 days before 2 Jan) stays, 28 Dec (5 days) is stale" "$(grep -q '^ACT   retry: something' <<< "$out" && ! grep -q '^ACT   retry: other' <<< "$out" && echo 1)" "$out"
IN="$IN2"; echo '{' > "$T/s/act-age.json"; AT=2026-11-26T09:00:00Z run
ok "an unreadable memory lists the stale lines again (never hides them)" "$(grep -q '^ACT   stale retry:' <<< "$out" && echo 1)" "$out"
out=$(printf '%s\n' "$IN" | python3 -I "$A" --name retry --state "$T/s" --now not-a-time 2>&1)
ok "anything wrong here: every detector line passes unchanged, with one ACT saying why" "$(grep -q 'check_a.ts passed only on retry 2 times' <<< "$out" && grep -q 'act-age.py could not judge' <<< "$out" && echo 1)" "$out"
LW="$TOOLS/lead-watch.sh"
ok "lead-watch.sh pipes retry-watch.py and outside-deps-watch.py through act-age.py" "$(grep -q 'retry-watch.py" --state "$STATE_DIR" 2>&1 | python3 -I "$TOOLS/act-age.py" --name retry' "$LW" && grep -q 'outside-deps-watch.py" 2>&1 | python3 -I "$TOOLS/act-age.py" --name outside' "$LW" && echo 1)" "not wired"
finish
