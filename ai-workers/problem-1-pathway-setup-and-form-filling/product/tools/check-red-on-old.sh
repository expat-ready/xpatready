#!/usr/bin/env bash
# A351 C1 (founder 24 Nov): red-on-old.py and red-on-old.yml, a PR's new and changed suites on the base's app code. Pass and
# fail case for each rule, on made-up changes and run-suites tables. US$0, no network, no suite.   bash product/tools/check-red-on-old.sh
set -u
. "$(dirname "$0")/guard-test-lib.sh"
T=$(mktemp -d "${TMPDIR:-/tmp}/ro.XXXXXXXX") && [ -d "$T" ] || { echo "no temp dir: nothing was checked"; exit 2; }; trap 'rm -rf "${T:?}"' EXIT
D=ai-workers/problem-1-pathway-setup-and-form-filling/prototype/studio; R="$T/r"; PY="$TOOLS/red-on-old.py"
g() { git -C "$R" -c user.email=t@t -c user.name=t -c commit.gpgsign=false "$@"; }
git init -q -b main "$R"; mkdir -p "$R/$D/tests/journeys" "$R/$D/api/src" "$R/$D/web/src" "$R/$D/prisma" "$R/$D/ports" "$R/$D/tools"; echo 1 > "$R/$D/ports/audit.ts"; echo 1 > "$R/$D/tools/t.py"; echo 1 > "$R/$D/package.json"
echo 'ok("a", true);' > "$R/$D/tests/check_a.ts"; echo 'h' > "$R/$D/tests/helper.ts"; echo 1 > "$R/$D/api/src/x.ts"; echo 1 > "$R/$D/web/src/w.ts"; echo 1 > "$R/$D/prisma/s.prisma"; g add -A; g commit -qm base; g tag b0
start() { g checkout -q -f b0; g clean -qfd; }
plan() { g add -A; g commit -qm x --allow-empty; o=$(cd "$R" && python3 -I "$PY" plan --base b0 2>&1; echo "rc=$?"); }
has() { grep -qF -- "$1" <<<"$o" && echo 1; }; line() { grep -qxF -- "$1" <<<"$o" && echo 1; }
start; echo 2 > "$R/$D/api/src/x.ts"; echo 'ok("n", true);' > "$R/$D/tests/check_n.ts"; echo 'ok("a2", true);' >> "$R/$D/tests/check_a.ts"; plan
ok "a new and a changed suite with an app change: both, the new one first" "$([ "$(line 'suites=check_n.ts check_a.ts')" = 1 ] && [ "$(has "app=$D/api")" = 1 ] && has rc=0)" "$o"
start; echo 2 > "$R/$D/api/src/x.ts"; plan; ok "no suite touched: nothing to run" "$([ "$(line 'suites=')" = 1 ] && has 'note=no check suite added or changed')" "$o"
start; echo 'ok("n", true);' > "$R/$D/tests/check_n.ts"; plan; ok "a test-only PR: nothing to run, said" "$([ "$(line 'suites=')" = 1 ] && has 'note=no app code changed (a test-only PR)')" "$o"
start; echo 2 > "$R/$D/api/src/x.ts"; echo '// note' >> "$R/$D/tests/check_a.ts"; plan; ok "a comment only is no changed check" "$(line 'suites=')" "$o"
start; echo 2 > "$R/$D/api/src/x.ts"; : > "$R/$D/tests/check_a.ts"; plan; ok "lines only removed: not a new check (C2 lists those)" "$(line 'suites=')" "$o"
start; echo 2 > "$R/$D/api/src/x.ts"; g rm -q "$D/tests/check_a.ts"; plan; ok "a deleted suite is not run" "$(line 'suites=')" "$o"
start; echo 2 > "$R/$D/api/src/x.ts"; mkdir -p "$R/$D/tests/journeys"; echo j > "$R/$D/tests/journeys/j_1.ts"; echo h2 > "$R/$D/tests/helper.ts"; plan; ok "a journey or a helper is not a suite here" "$(line 'suites=')" "$o"
start; echo 2 > "$R/$D/api/src/x.ts"; for i in 1 2 3 4 5 6; do echo 'ok(1)' > "$R/$D/tests/check_m$i.ts"; done; plan; ok "at most 4, the rest named" "$([ "$(line 'suites=check_m1.ts check_m2.ts check_m3.ts check_m4.ts')" = 1 ] && has 'not run: check_m5.ts check_m6.ts')" "$o"
o=$(cd "$R" && python3 -I "$PY" plan --base nope 2>&1; echo "rc=$?"); ok "fail: a change that cannot be read is said, exit 2" "$([ "$(has '::warning title=Red on the old code (A351 C1)::not read')" = 1 ] && has rc=2)" "$o"
start; echo 2 > "$R/$D/ports/audit.ts"; echo 'ok("n", true);' > "$R/$D/tests/check_n.ts"; plan; ok "ports run too: a suite with a ports change is not test-only" "$(line 'suites=check_n.ts')" "$o"
start; mkdir -p "$R/$D/api/src/MODULE.rows"; echo x > "$R/$D/api/src/MODULE.rows/A.md"; echo 'ok("n", true);' > "$R/$D/tests/check_n.ts"; plan; ok "a Markdown row under api is no app code" "$(has 'note=no app code changed')" "$o"
start; printf 'ok(1)\n' > "$R/$D/tests/check_x;id.ts"; echo 2 > "$R/$D/api/src/x.ts"; plan; ok "a name with a shell character is no suite" "$(line 'suites=')" "$o"

start; echo 2 > "$R/$D/api/src/x.ts"; echo new > "$R/$D/api/src/y.ts"; echo 2 > "$R/$D/ports/audit.ts"; echo 2 > "$R/$D/tools/t.py"; echo 2 > "$R/$D/package.json"; mkdir -p "$R/$D/engine"; echo e > "$R/$D/engine/e.ts"; g rm -q "$D/web/src/w.ts"; echo 'ok("n", true);' > "$R/$D/tests/check_n.ts"; g add -A; g commit -qm pr
o=$(cd "$R" && env -u GITHUB_ACTIONS python3 -I "$PY" old --base b0 2>&1; echo "rc=$?"); ok "old refuses outside CI, and changes nothing" "$([ "$(has 'only in CI')" = 1 ] && [ "$(has rc=2)" = 1 ] && [ "$(cat "$R/$D/api/src/x.ts")" = 2 ] && echo 1)" "$o"
o=$(cd "$R" && GITHUB_ACTIONS=true python3 -I "$PY" old --base b0 2>&1; echo "rc=$?")
ok "old: changed, added and removed app files are the base's, a whole added folder is gone, the PR's test stays" "$([ "$(has rc=0)" = 1 ] && [ "$(cat "$R/$D/api/src/x.ts")" = 1 ] && [ ! -e "$R/$D/api/src/y.ts" ] && [ ! -e "$R/$D/engine/e.ts" ] && [ -e "$R/$D/web/src/w.ts" ] && [ "$(cat "$R/$D/ports/audit.ts" "$R/$D/tools/t.py" "$R/$D/package.json" | tr -d '\n')" = 111 ] && [ -e "$R/$D/tests/check_n.ts" ] && echo 1)" "$o"
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
for w in "exit 1: Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/home/runner/work/xpatr" "exit 1: SyntaxError: The requested module '../api/src/case-clients/prospect-won.mjs' doe"; do tab "| check_n.ts | FAIL | 1 s | $w |"; rep check_n.ts; ok "a suite that cannot load there (run-suites.sh's real, cut line) is said apart" "$([ "$(has '0 red, 1 cannot load')" = 1 ] && has 'check_n.ts: red: cannot load there')" "$o"; done
tab '| check_n.ts | FAIL | 9 s | exit 1: FAIL  N1: TypeError: x.y is not a function |'; rep check_n.ts; ok "a run-time failure is red, not a load" "$(has '1 red, 0 cannot load')" "$o"
tab '| check_n.ts | FAIL | | isolated copy n did not start |' "$G"; rep 'check_n.ts check_a.ts'; ok "fail: a copy that did not start judges nothing, and the other suite's pass still warns" "$([ "$(has '0 red, 0 cannot load, 1 pass, 1 not judged')" = 1 ] && has 'would pass without the change')" "$o"
tab '| check_n.ts | FAIL | 9 s | exit 1: FAIL  N1: the refused link is not found |'; rep check_n.ts; ok "a FAIL line with the same words is red" "$(has '1 red')" "$o"
tab '| check_n.ts | FAIL | 300 s | exit 124: STOP still running at the 20 min limit; its processes below |'; rep check_n.ts; ok "a suite cut at its limit is not judged" "$(has '0 red, 0 cannot load, 0 pass, 1 not judged')" "$o"
for w in 'exit 1: FAIL N1: the new route answers 200 (got 404 Not Found)' 'exit 1: Error: P1 the upload was refused: 409' 'exit 1: STOP  no row: page not found'; do tab "| check_n.ts | FAIL | 9 s | $w |"; rep check_n.ts; ok "red: '${w:8:40}'" "$(has '1 red')" "$o"; done
start; mkdir -p "$R/$D/acceptance/lib"; echo 1 > "$R/$D/acceptance/lib/m.ts"; echo 'ok("n", true);' > "$R/$D/tests/check_n.ts"; plan; ok "the packs' helpers are test code" "$(has 'note=no app code changed')" "$o"
tab '| check_n.ts | passed on retry | 9 s | x |'; rep check_n.ts; ok "passed on retry is a pass" "$(has '0 red, 0 cannot load, 1 pass')" "$o"
tab "$G"; rep 'check_a.ts check_gone.ts'; ok "a suite with no row is not judged, never red or green" "$(has '0 red, 0 cannot load, 1 pass, 1 not judged, of 2')" "$o"
tab '| check_n.ts | quarantined | 0 s | x |'; rep check_n.ts; ok "fail: a quarantined suite judges nothing: a warning" "$([ "$(has 'nothing was judged')" = 1 ] && has '1 not judged')" "$o"
tab '| check_n.ts | FAIL | 9 s | exit 1: FAIL  ::error title=x::y ##[stop] <b> |'; rep check_n.ts; ok "no workflow command or markup can be made of a row" "$(! grep -qE '::error|##\[' <<<"$o" && ! grep -q '<b>' "$T/sum" && echo 1)" "$o"
o=$(echo | python3 -I "$PY" report --suites x --out "$T/nope" 2>&1; echo "rc=$?"); ok "fail: a table that cannot be read is said, exit 2" "$([ "$(has 'not read')" = 1 ] && has rc=2)" "$o"
o=$(echo | python3 -I "$PY" report --suites '' --out "$T/out" 2>&1; echo "rc=$?"); ok "fail: no suite named is said, never ok" "$([ "$(has 'not read')" = 1 ] && has rc=2)" "$o"

# The workflow, read as YAML: report only, once per PR, one machine, the base's code, history, the named suites only
Y="$TOOLS/../../../../.github/workflows/red-on-old.yml"; python3 -c 'import yaml' 2>/dev/null || { echo "PyYAML is missing; nothing was checked"; exit 2; }
o=$(python3 - "$Y" "$TOOLS/../../../../.mergify.yml" "$TOOLS/../../../../.github/workflows/guards.yml" <<'P' 2>&1
import sys, yaml
t = open(sys.argv[1]).read(); w = yaml.safe_load(t); on = w.get("on", w.get(True)); J = w["jobs"]; j = J["red-on-old"]; s = j["steps"]; by = {x.get("id"): x for x in s}
def p(k, v): print("%s=%d" % (k, bool(v)))
p("once", on == {"pull_request": {"types": ["opened", "ready_for_review"]}})
p("read_only", w["permissions"] == {} and j["permissions"] == {"contents": "read"} and "secrets." not in t)
p("one_machine", len(J) == 1 and "strategy" not in j and j["timeout-minutes"] == 45 and j["runs-on"] == "ubuntu-latest")
p("no_batch", j["if"] == "${{ !github.event.pull_request.draft && !startsWith(github.event.pull_request.head.ref, 'mergify/') }}")
p("report_only", s[0]["uses"] == "actions/checkout@v4" and all(x.get("continue-on-error") is True for x in s[1:]))
p("history", s[0]["with"]["fetch-depth"] == 0 and s[0]["with"]["persist-credentials"] is False)
p("plan_base", '"$P/tools/red-on-old.py" plan --base HEAD^1)' in by["p"]["run"])
p("old_base", by["old"]["run"] == 'python3 -I "$P/tools/red-on-old.py" old --base HEAD^1' and by["old"]["if"] == "steps.p.outputs.suites != ''")
p("setup_after", by["setup"]["if"] == "steps.old.outcome == 'success'" and by["setup"]["timeout-minutes"] == 15 and [x.get("id") for x in s].index("setup") > [x.get("id") for x in s].index("old"))
p("suites", by["s"]["run"] == 'bash "$P/tools/run-suites.sh" --demo --skip-quarantined --only "$SUITES" > red-on-old.md 2>&1 || true' and by["s"]["if"] == "steps.setup.outcome == 'success'" and by["s"]["timeout-minutes"] == 25 and by["s"]["env"]["SUITES_TIMEOUT"] == "300")
r = s[-1]; p("report", "red-on-old.py\" report --suites \"$SUITES\" --out red-on-old.md" in r["run"] and r["if"] == "steps.p.outputs.suites != ''" and '"$SETUP" != success' in r["run"])
p("env_only", not any("${{" in x.get("run", "") for x in s))
p("not_required", "red-on-old" not in open(sys.argv[2]).read())
g = yaml.safe_load(open(sys.argv[3])); gp = g.get("on", g.get(True))["pull_request"]["paths"]; p("guarded", ".github/workflows/red-on-old.yml" in gp)
P
)
for k in once read_only one_machine no_batch report_only history plan_base old_base setup_after suites report env_only not_required guarded; do ok "red-on-old.yml: $k" "$(line "$k=1")" "$o"; done
ok "run-suites.sh has --only and prints the table this reads" "$(grep -q -- '--only)' "$TOOLS/run-suites.sh" && grep -q '| Suite | Result | Time | Last line |' "$TOOLS/run-suites.sh" && echo 1)"
finish
