#!/usr/bin/env bash
# A351 C1 (founder 24 Nov): red-on-old.py and red-on-old.yml, a PR's new and changed suites on the base's app code. Pass and
# fail case for each rule, on made-up changes and run-suites tables. US$0, no network, no suite.   bash product/tools/check-red-on-old.sh
set -u
. "$(dirname "$0")/guard-test-lib.sh"
T=$(mktemp -d "${TMPDIR:-/tmp}/ro.XXXXXXXX") && [ -d "$T" ] || { echo "no temp dir: nothing was checked"; exit 2; }; trap 'rm -rf "${T:?}"' EXIT
D=ai-workers/problem-1-pathway-setup-and-form-filling/prototype/studio; R="$T/r"; PY="$TOOLS/red-on-old.py"
g() { git -C "$R" -c user.email=t@t -c user.name=t -c commit.gpgsign=false "$@"; }
git init -q -b main "$R"; mkdir -p "$R/$D/tests/journeys" "$R/$D/api/src" "$R/$D/web/src" "$R/$D/prisma"
echo 'ok("a", true);' > "$R/$D/tests/check_a.ts"; echo 'h' > "$R/$D/tests/helper.ts"; echo 1 > "$R/$D/api/src/x.ts"; echo 1 > "$R/$D/web/src/w.ts"; echo 1 > "$R/$D/prisma/s.prisma"; g add -A; g commit -qm base; g tag b0
start() { g checkout -q -f b0; g clean -qfd; }
plan() { g add -A; g commit -qm x --allow-empty; o=$(cd "$R" && python3 -I "$PY" plan --base b0 2>&1; echo "rc=$?"); }
has() { grep -qF -- "$1" <<<"$o" && echo 1; }; line() { grep -qxF -- "$1" <<<"$o" && echo 1; }
start; echo 2 > "$R/$D/api/src/x.ts"; echo 'ok("n", true);' > "$R/$D/tests/check_n.ts"; echo 'ok("a2", true);' >> "$R/$D/tests/check_a.ts"; plan
ok "a new and a changed suite with an app change: both, the new one first" "$([ "$(line 'suites=check_n.ts check_a.ts')" = 1 ] && [ "$(has "app=$D/api/src")" = 1 ] && has rc=0)" "$o"
start; echo 2 > "$R/$D/api/src/x.ts"; plan; ok "no suite touched: nothing to run" "$([ "$(line 'suites=')" = 1 ] && has 'note=no check suite added or changed')" "$o"
start; echo 'ok("n", true);' > "$R/$D/tests/check_n.ts"; plan; ok "a test-only PR: nothing to run, said" "$([ "$(line 'suites=')" = 1 ] && has 'note=no app code changed (a test-only PR)')" "$o"
start; echo 2 > "$R/$D/api/src/x.ts"; echo '// note' >> "$R/$D/tests/check_a.ts"; plan; ok "a comment only is no changed check" "$(line 'suites=')" "$o"
start; echo 2 > "$R/$D/api/src/x.ts"; : > "$R/$D/tests/check_a.ts"; plan; ok "lines only removed: not a new check (C2 lists those)" "$(line 'suites=')" "$o"
start; echo 2 > "$R/$D/api/src/x.ts"; g rm -q "$D/tests/check_a.ts"; plan; ok "a deleted suite is not run" "$(line 'suites=')" "$o"
start; echo 2 > "$R/$D/api/src/x.ts"; mkdir -p "$R/$D/tests/journeys"; echo j > "$R/$D/tests/journeys/j_1.ts"; echo h2 > "$R/$D/tests/helper.ts"; plan; ok "a journey or a helper is not a suite here" "$(line 'suites=')" "$o"
start; echo 2 > "$R/$D/api/src/x.ts"; for i in 1 2 3 4 5 6; do echo 'ok(1)' > "$R/$D/tests/check_m$i.ts"; done; plan; ok "at most 4, the rest named" "$([ "$(line 'suites=check_m1.ts check_m2.ts check_m3.ts check_m4.ts')" = 1 ] && has 'not run: check_m5.ts check_m6.ts')" "$o"
o=$(cd "$R" && python3 -I "$PY" plan --base nope 2>&1; echo "rc=$?"); ok "fail: a change that cannot be read is said, exit 2" "$([ "$(has '::warning title=Red on the old code (A351 C1)::not read')" = 1 ] && has rc=2)" "$o"
start; printf 'ok(1)\n' > "$R/$D/tests/check_x;id.ts"; echo 2 > "$R/$D/api/src/x.ts"; plan; ok "a name with a shell character is no suite" "$(line 'suites=')" "$o"

start; echo 2 > "$R/$D/api/src/x.ts"; echo new > "$R/$D/api/src/y.ts"; mkdir -p "$R/$D/engine"; echo e > "$R/$D/engine/e.ts"; g rm -q "$D/web/src/w.ts"; echo 'ok("n", true);' > "$R/$D/tests/check_n.ts"; g add -A; g commit -qm pr
o=$(cd "$R" && env -u GITHUB_ACTIONS python3 -I "$PY" old --base b0 2>&1; echo "rc=$?"); ok "old refuses outside CI, and changes nothing" "$([ "$(has 'only in CI')" = 1 ] && [ "$(has rc=2)" = 1 ] && [ "$(cat "$R/$D/api/src/x.ts")" = 2 ] && echo 1)" "$o"
o=$(cd "$R" && GITHUB_ACTIONS=true python3 -I "$PY" old --base b0 2>&1; echo "rc=$?")
ok "old: changed, added and removed app files are the base's, a whole added folder is gone, the PR's test stays" "$([ "$(has rc=0)" = 1 ] && [ "$(cat "$R/$D/api/src/x.ts")" = 1 ] && [ ! -e "$R/$D/api/src/y.ts" ] && [ ! -e "$R/$D/engine/e.ts" ] && [ -e "$R/$D/web/src/w.ts" ] && [ -e "$R/$D/tests/check_n.ts" ] && echo 1)" "$o"
g reset -q --hard

tab() { printf '| Suite | Result | Time | Last line |\n|---|---|---|---|\n' > "$T/out"; printf '%s\n' "$@" >> "$T/out"; }
rep() { : > "$T/sum"; o=$(printf '%s\n' "${2:-}" | python3 -I "$PY" report --suites "$1" --out "$T/out" --summary "$T/sum" 2>&1; echo "rc=$?"); }
F='| check_n.ts | FAIL | 9 s | exit 1: FAIL  N1 pass: the page opens |'; G='| check_a.ts | PASS | 9 s | 4 passed, 0 failed |'
tab "$F" "$G"; rep 'check_n.ts check_a.ts'; ok "pass: one suite red on the old code is enough" "$([ "$(has 'ok    red on old: 1 red, 0 cannot load, 1 pass, 0 not judged, of 2')" = 1 ] && ! grep -q '::warning' <<<"$o" && has rc=0)" "$o"
tab "$G"; rep check_a.ts; ok "fail: all pass: a warning that they would pass without the change" "$([ "$(has '::warning title=Red on the old code (A351 C1)::0 red, 0 cannot load, 1 pass')" = 1 ] && [ "$(has 'would pass without the change')" = 1 ] && has rc=0)" "$o"
rep check_a.ts 'Red on old code: a refactor, the same behaviour (P-801)'; ok "pass: all pass, and the body says why" "$([ "$(has 'reason given: a refactor')" = 1 ] && ! grep -q '::warning' <<<"$o" && grep -q 'Reason in the body: a refactor' "$T/sum" && echo 1)" "$o"
for b in 'Red on old code:' 'Red on old code: <reason>' 'Red on old code: none.' '<!-- Red on old code: because I say so -->' '> Red on old code: because I say so' '```
Red on old code: because I say so
```'; do rep check_a.ts "$b"; ok "fail: '$(head -1 <<<"$b")' gives no reason" "$(has 'would pass without the change')" "$o"; done
for w in 'exit 1: Error [ERR_MODULE_NOT_FOUND]: Cannot find module ../src/y' 'exit 1: SyntaxError: x does not provide an export named y'; do tab "| check_n.ts | FAIL | 1 s | $w |"; rep check_n.ts; ok "a suite that cannot load there is said apart" "$([ "$(has '0 red, 1 cannot load')" = 1 ] && has 'check_n.ts: red: cannot load there')" "$o"; done
tab "$G"; rep 'check_a.ts check_gone.ts'; ok "a suite with no row is not judged, never red or green" "$(has '0 red, 0 cannot load, 1 pass, 1 not judged, of 2')" "$o"
tab '| check_n.ts | quarantined | 0 s | x |'; rep check_n.ts; ok "fail: a quarantined suite judges nothing: a warning" "$([ "$(has 'nothing was judged')" = 1 ] && has '1 not judged')" "$o"
tab '| check_n.ts | FAIL | 9 s | exit 1: FAIL  ::error title=x::y ##[stop] <b> |'; rep check_n.ts; ok "no workflow command or markup can be made of a row" "$(! grep -qE '::error|##\[' <<<"$o" && ! grep -q '<b>' "$T/sum" && echo 1)" "$o"
o=$(echo | python3 -I "$PY" report --suites x --out "$T/nope" 2>&1; echo "rc=$?"); ok "fail: a table that cannot be read is said, exit 2" "$([ "$(has 'not read')" = 1 ] && has rc=2)" "$o"
o=$(echo | python3 -I "$PY" report --suites '' --out "$T/out" 2>&1; echo "rc=$?"); ok "fail: no suite named is said, never ok" "$([ "$(has 'not read')" = 1 ] && has rc=2)" "$o"

# The workflow: report only, once per PR, one machine, and its table is the one run-suites.sh prints
Y="$TOOLS/../../../../.github/workflows/red-on-old.yml"
o=$(python3 -I - "$Y" "$TOOLS/../../../../.mergify.yml" <<'P'
import re, sys
t = open(sys.argv[1]).read(); m = open(sys.argv[2]).read()
steps = t.split("    steps:\n")[1].split("\n      - ")
steps = [s if s.startswith("uses") or s.startswith("id") or s.startswith("name") else s.lstrip(" -") for s in steps]
print("checkout_first=%d" % ("actions/checkout@v4" in steps[0]))
print("report_only=%d" % all("continue-on-error: true" in s for s in steps[1:]))
print("once=%d" % ("types: [opened, ready_for_review]" in t and "synchronize" not in t))
print("read_only=%d" % ("permissions: {}" in t and "permissions: { contents: read }" in t and "write" not in re.sub(r"(?m)#.*$", "", t) and "secrets." not in t and "pull_request_target" not in t))
print("one_machine=%d" % ("matrix" not in t and t.count("runs-on:") == 1 and "timeout-minutes: 45" in t))
print("no_batch=%d" % ("!github.event.pull_request.draft && !startsWith(github.event.pull_request.head.ref, 'mergify/')" in t))
print("not_required=%d" % ("red-on-old" not in m))
print("env_only=%d" % (not re.search(r"run:.*\$\{\{|^ {10}.*\$\{\{", t, re.M)))
print("order=%d" % (t.index("red-on-old.py\" plan") < t.index("red-on-old.py\" old") < t.index("cloud-setup.sh\"") < t.index("run-suites.sh\"") < t.index("red-on-old.py\" report")))
P
)
for k in checkout_first report_only once read_only one_machine no_batch not_required env_only order; do ok "red-on-old.yml: $k" "$(line "$k=1")" "$o"; done
ok "run-suites.sh has --only and prints the table this reads" "$(grep -q -- '--only)' "$TOOLS/run-suites.sh" && grep -q '| Suite | Result | Time | Last line |' "$TOOLS/run-suites.sh" && echo 1)"
finish
