#!/usr/bin/env bash
# B203 (P-744): test-graph.py on fixtures. A scratch repository (two module cards, three suites, a CAPABILITIES.md) and
# hand-made V8 coverage files prove the join: suite -> exercised file -> module -> capability; a file only loaded never
# makes an edge; two processes of one suite are merged; helpers and the module wrapper do not count; a capability no
# suite names stays listed; a suite with nothing exercised is unmapped; a partial coverage file is skipped. Also the
# wiring: run-suites.sh sets the coverage folder before the copy starts, only with SUITES_COVERAGE. US$0, no network.
#   bash product/tools/check-test-graph.sh
set -u
. "$(dirname "$0")/guard-test-lib.sh"
TG="$TOOLS/test-graph.py"
[ -f "$TG" ] || { ok "test-graph.py exists (B203)" 0 "no $TG"; finish; }
R=$(mktemp -d "${TMPDIR:-/tmp}/tgraph.XXXXXXXX") && [ -d "$R" ] || { echo "no temp dir: nothing was checked"; exit 2; }; trap 'rm -rf "$R"' EXIT
PH=ai-workers/problem-1-pathway-setup-and-form-filling; S=$PH/prototype/studio
mkdir -p "$R/.claude/rules/modules" "$R/$S/api/src/b" "$R/$S/engine" "$R/$S/tests" "$R/$PH/product/qa" "$R/cov/check_one" "$R/cov/check_two" "$R/cov/check_three" "$R/cov/__boot__" "$R/cov/out"
card() { printf -- '---\npaths:\n  - "%s"\n---\n# Module card: %s\n' "$S/$2" "$1" > "$R/$S/api/src/$3"; ln -s "../../../$S/api/src/$3" "$R/.claude/rules/modules/$1.md"; }
card api-a "api/src/a*.ts" MODULE.a.md; card api-b "api/src/b/**" b/MODULE.md
for f in api/src/a1.ts api/src/a2.ts api/src/a3.ts api/src/b/x.ts engine/e.ts; do echo "export const x = 1;" > "$R/$S/$f"; done
echo '// proves C1.2: the a rule' > "$R/$S/tests/check_one.ts"; echo '// no id here' > "$R/$S/tests/check_two.cjs"; echo '// C1.2 only loads' > "$R/$S/tests/check_three.ts"
cat > "$R/$PH/product/qa/CAPABILITIES.md" <<'EOF'
| Id | Area | Capability | Milestone | Status |
|---|---|---|---|---|
| C1.2 | 1 Set-up | The a rule | M3 | Works |
| C9.9 | 9 Other | Nobody tests this | M3 | Partial |
| R1.5 | Sign-up: firm | api-b | Works | main | — | `check_two.cjs` passes | — |
EOF
u() { printf 'file://%s/%s/%s' "$R" "$S" "$1"; }
fn() { printf '{"functionName":"%s","ranges":[{"startOffset":0,"endOffset":9,"count":%s}],"isBlockCoverage":true}' "$1" "$2"; }
W='{"functionName":"","ranges":[{"startOffset":0,"endOffset":99,"count":1}],"isBlockCoverage":false}'
cat > "$R/cov/check_one/p1.json" <<EOF
{"result":[{"scriptId":"1","url":"$(u api/src/a1.ts)","functions":[$W,$W,$(fn __name 3),$(fn doA 1),$(fn other 0)]},
 {"scriptId":"2","url":"$(u engine/e.ts)?v=1","functions":[$W,$(fn calc 2)]},
 {"scriptId":"3","url":"$(u node_modules/x/i.ts)","functions":[$W,$(fn y 1)]},
 {"scriptId":"4","url":"$(u tests/check_one.ts)","functions":[$W,$(fn t 1)]},
 {"scriptId":"5","url":"node:fs","functions":[$W]}]}
EOF
echo "{\"result\":[{\"scriptId\":\"9\",\"url\":\"$(u api/src/a1.ts)\",\"functions\":[$W,$W,$(fn __name 1),$(fn doA 0),$(fn other 4)]},{\"scriptId\":\"8\",\"url\":\"$(u api/src/a3.ts)\",\"functions\":[$W,$W,$(fn route 1)]}]}" > "$R/cov/check_one/server.json"
echo "{\"result\":[{\"scriptId\":\"1\",\"url\":\"$(u api/src/a3.ts)\",\"functions\":[$W,$W,$(fn route 1)]}]}" > "$R/cov/__boot__/p.json"
echo "{\"result\":[{\"scriptId\":\"1\",\"url\":\"$(u api/src/b/x.ts)\",\"functions\":[$W,$W,$(fn go 1)]}]}" > "$R/cov/out/p.json"
echo "{\"result\":[{\"scriptId\":\"1\",\"url\":\"$(u api/src/b/x.ts)\",\"functions\":[$W,$W,$(fn go 1)]}]}" > "$R/cov/check_two/p.json"
echo '{"result":[{"scriptId":"1","url":"' > "$R/cov/check_two/broken.json"
echo "{\"result\":[{\"scriptId\":\"1\",\"url\":\"$(u api/src/a2.ts)\",\"functions\":[$W,$W,$(fn get 5),$(fn f 0)]}]}" > "$R/cov/check_three/p.json"
ROOT="$R" python3 -I "$TG" collect "$R/cov" --out "$R/suites.json" 2> "$R/err"; rc=$?
ok "collect: exit 0 on the fixtures (a partial coverage file is skipped)" "$([ $rc = 0 ] && echo 1)" "exit $rc: $(cat "$R/err")"
ROOT="$R" python3 -I "$TG" join "$R/suites.json" --out "$R/graph.json" --commit abc1234 > "$R/out" 2>&1; rc=$?
ok "join: exit 0 and a summary line" "$([ $rc = 0 ] && grep -q '3 suites, 1 unmapped, 3 files' "$R/out" && echo 1)" "exit $rc: $(cat "$R/out")"
q() { python3 -I -c "import json,sys; g=json.load(open(sys.argv[1])); print(json.dumps($1, sort_keys=True))" "$R/graph.json" 2>&1; }
ok "suite -> file: check_one exercised a1.ts (both functions, across two processes) and engine/e.ts; not node_modules, tests or node:" \
  "$([ "$(q "g['suites']['check_one']['exercised']")" = "{\"$S/api/src/a1.ts\": [2, 2], \"$S/engine/e.ts\": [1, 1]}" ] && echo 1)" "$(q "g['suites']['check_one']")"
ok "file -> module: a1.ts is api-a (its card's paths:), engine/e.ts has no card and says so" \
  "$([ "$(q "g['suites']['check_one']['modules']")" = '["(no card: engine)", "api-a"]' ] && echo 1)" "$(q "g['suites']['check_one']['modules']")"
ok "suite -> capability: check_one names C1.2 in its source" "$([ "$(q "g['suites']['check_one']['capabilities']")" = '["C1.2"]' ] && echo 1)" "$(q "g['suites']['check_one']")"
ok "suite -> R1 item: CAPABILITIES.md's R1.5 row names check_two.cjs" "$([ "$(q "g['suites']['check_two']['capabilities']")" = '["R1.5"]' ] && echo 1)" "$(q "g['suites']['check_two']")"
ok "capability -> module (the join): C1.2's modules come only from code its suites exercised (check_one), its suites are every suite naming it" \
  "$([ "$(q "[g['capabilities']['C1.2'][k] for k in ('suites','modules','name','status')]")" = '[["check_one", "check_three"], ["(no card: engine)", "api-a"], "The a rule", "Works"]' ] && echo 1)" "$(q "g['capabilities']['C1.2']")"
ok "a file only loaded (the export getter ran, no function did) makes no edge: check_three is unmapped, has no module, and a2.ts is not in the file map" \
  "$([ "$(q "[g['unmapped'], g['suites']['check_three']['loaded_only'], g['suites']['check_three']['modules'], '$S/api/src/a2.ts' in g['files']]")" = '[["check_three"], 1, [], false]' ] && echo 1)" "$(q "g['suites']['check_three']")"
ok "a capability no suite names stays listed with no suite (the gap is shown)" "$([ "$(q "g['capabilities']['C9.9']['suites']")" = '[]' ] && echo 1)" "$(q "g['capabilities'].get('C9.9')")"
ok "file -> suites (for impact analysis): b/x.ts is run by check_two, in module api-b" "$([ "$(q "[g['files']['$S/api/src/b/x.ts'][k] for k in ('module','suites')]")" = '["api-b", ["check_two"]]' ] && echo 1)" "$(q "g['files']")"
ok "boot baseline: a3.ts's route ran in check_one's server and in a bare start (__boot__): no edge, and the graph says the baseline was there" \
  "$([ "$(q "['$S/api/src/a3.ts' in g['suites']['check_one']['exercised'], g['boot_baseline'], '__boot__' in g['suites']]")" = '[false, true, false]' ] && echo 1)" "$(q "g['suites']['check_one']")"
ok "a folder that is not a suite's (run-suites.sh's own out/) is not read as a suite" "$([ "$(q "sorted(g['suites'])")" = '["check_one", "check_three", "check_two"]' ] && echo 1)" "$(q "sorted(g['suites'])")"
ok "the commit is recorded" "$([ "$(q "g['commit']")" = '"abc1234"' ] && echo 1)" ""
python3 -I "$TG" render "$R/graph.json" --html "$R/g.html" --mermaid "$R/g.mmd"; rc=$?
ok "render: an HTML page and a Mermaid diagram with the capability -> module edge" "$([ $rc = 0 ] && grep -q '<title>Test graph</title>' "$R/g.html" && grep -q 'C1_2 --> api_a' "$R/g.mmd" && echo 1)" "exit $rc: $(cat "$R/g.mmd" 2>/dev/null)"
RS="$TOOLS/run-suites.sh"
ok "wiring: run-suites.sh sets the suite's coverage folder only with SUITES_COVERAGE, before its copy starts" \
  "$(grep -q 'cov() { \[ -n "${SUITES_COVERAGE:-}" \] || return 0; export NODE_V8_COVERAGE="$SUITES_COVERAGE/${1%.\*}"' "$RS" && grep -q 'usage=$(grep -m1 -E "studio/tests/$f" "$path"); cov "$f"' "$RS" && grep -q '^  cov check_runtime_r1a.ts' "$RS" && echo 1)" "see $RS"
W2="$(cd "$TOOLS/../../../.." && pwd)/.github/workflows/test-graph.yml"
ok "wiring: test-graph.yml runs by hand or on a schedule, reads only (contents: read), and never on a PR's suites" \
  "$([ -f "$W2" ] && grep -q 'workflow_dispatch' "$W2" && grep -q 'schedule:' "$W2" && grep -q 'contents: read' "$W2" && ! grep -qE 'contents: write|pull_request_target' "$W2" && echo 1)" "$W2"
finish
