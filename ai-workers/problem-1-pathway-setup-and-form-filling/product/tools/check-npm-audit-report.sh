#!/usr/bin/env bash
# npm-audit-report.py and studio-audit.yml (P-776's npm audit, report only; 24 Nov). Pass and fail case for each, on made-up
# audit answers. US$0, no network.   bash product/tools/check-npm-audit-report.sh
set -u
. "$(dirname "$0")/guard-test-lib.sh"
python3 -c 'import yaml' 2>/dev/null || { echo "PyYAML is missing; nothing was checked"; exit 2; }
T=$(mktemp -d "${TMPDIR:-/tmp}/na.XXXXXXXX") && [ -d "$T" ] || { echo "no temp dir: nothing was checked"; exit 2; }; trap 'rm -rf "${T:?}"' EXIT
aud() { python3 -I -c '
import json,sys
v=dict(x.rsplit("=",1) for x in sys.argv[2:]); o=("critical","high","moderate","low","info")
c={k:sum(1 for s in v.values() if s==k) for k in o}; c["total"]=len(v)
json.dump({"auditReportVersion":2,"vulnerabilities":{k:{"name":k,"severity":s} for k,s in v.items()},"metadata":{"vulnerabilities":c}},open(sys.argv[1],"w"))' "$@"; }
run() { : > "$T/sum"; o=$(python3 -I "$TOOLS/npm-audit-report.py" --head "$T/h" --summary "$T/sum" "$@" 2>&1; echo "rc=$?"); }
has() { grep -qF -- "$1" <<<"$o" && echo 1; }
aud "$T/h" a=high b=moderate c=low; aud "$T/b" a=high b=moderate c=low
run --base "$T/b"; ok "pass: the same findings as the base: counted, no warning" "$([ "$(has 'npm audit (studio, report only): 3 packages with a finding (1 high, 1 moderate, 1 low); the base has 3; 0 new or more severe here, 0 gone')" = 1 ] && ! grep -q '::warning' <<<"$o" && has rc=0)" "$o"
ok "the count is in the run's summary" "$(grep -q '### npm audit (studio, report only): 3 packages' "$T/sum" && echo 1)"
aud "$T/h" a=critical b=low n=high; run --base "$T/b"; ok "fail: one new and one more severe are warned and listed, worst first; a milder one and a gone one are not" "$([ "$(has '2 new or more severe here, 1 gone')" = 1 ] && [ "$(has '::warning title=npm audit (P-776, report only)::2 packages')" = 1 ] && [ "$(grep -E '^\| .(a|n). ' "$T/sum" | paste -sd, -)" = '| `a` | critical |,| `n` | high |' ] && has rc=0)" "$o"
aud "$T/h" a0=low a1=low a2=low a3=low a4=low b=moderate zc=critical; run --base "$T/b"; ok "the warning names the worst first" "$(has 'than the base: zc, a0')" "$o"
aud "$T/h"; run --base "$T/b"; ok "pass: no finding is said" "$([ "$(has '0 packages with a finding (none)')" = 1 ] && has '3 gone')" "$o"
aud "$T/h" a=high; run; ok "no base given: the count alone" "$([ "$(has '1 packages with a finding (1 high)')" = 1 ] && ! grep -q base <<<"$o" && echo 1)" "$o"
echo '{"error":{"code":"ENOTFOUND","summary":"registry down ::error::x"}}' > "$T/b"; run --base "$T/b"; ok "fail: an unreadable base is said, the PR's count stands" "$([ "$(has "the base's audit could not be read")" = 1 ] && [ "$(has '1 packages')" = 1 ] && has rc=0)" "$o"
printf '{"error":{"code":"E"},"vulnerabilities":{},"metadata":{"vulnerabilities":{"critical":0,"high":0,"moderate":0,"low":0,"info":0,"total":0}}}' > "$T/h"; run; grep -q '### npm audit (studio, report only): not read' "$T/sum"; ok "fail: not read is in the summary too" "$([ $? = 0 ] && echo 1)"
printf '{"message":"request to https://registry.npmjs.org failed, reason: ENOTFOUND","method":"POST","uri":"x"}' > "$T/h"; run; ok "fail: npm's own network answer is said with its reason" "$([ "$(has 'reason: ENOTFOUND')" = 1 ] && has rc=2)" "$o"
printf '{"error":{"code":"ENOLOCK","summary":"This command requires an existing lockfile."},"vulnerabilities":{},"metadata":{"vulnerabilities":{"critical":0,"high":0,"moderate":0,"low":0,"info":0,"total":0}}}' > "$T/h"; run; ok "fail: an answer with an error and zero counts is no audit" "$([ "$(has 'not read')" = 1 ] && has rc=2)" "$o"
for j in '' '{' '[]' '{"error":{"summary":"x"}}' '{"metadata":{"vulnerabilities":{}},"vulnerabilities":{}}' '{"vulnerabilities":{"a":{"severity":"high"}},"metadata":{"vulnerabilities":{"critical":0,"high":0,"moderate":0,"low":0,"info":0,"total":0}}}'; do printf '%s' "$j" > "$T/h"; run; ok "fail: '${j:0:36}' is no audit: exit 2, never 0 findings" "$([ "$(has 'not read')" = 1 ] && [ "$(has rc=2)" = 1 ] && ! grep -q 'packages with a finding' <<<"$o" && echo 1)" "$o"; done
aud "$T/b"; aud "$T/h" 'x::error title=y::z|<b>=high'; run --base "$T/b"; ok "no workflow command or markup can be made of a package name" "$(! grep -qE '[a-z]::error|<b>' <<<"$o" && ! grep -q '<b>' "$T/sum" && echo 1)" "$o"
o=$(python3 - "$TOOLS/../../../../.github/workflows/studio-audit.yml" "$TOOLS/../../../../.mergify.yml" "$TOOLS/../../../../.github/workflows/guards.yml" <<'P' 2>&1
import sys, yaml
t = open(sys.argv[1]).read(); w = yaml.safe_load(t); on = w.get("on", w.get(True)); j = w["jobs"]["audit"]; s = j["steps"]
def p(k, v): print("%s=%d" % (k, bool(v)))
lock = "ai-workers/problem-1-pathway-setup-and-form-filling/prototype/studio/package"
p("paths", set(on) == {"pull_request"} and {lock + ".json", lock + "-lock.json", lock[:-7] + ".npmrc"} <= set(on["pull_request"]["paths"]))
p("read_only", w["permissions"] == {} and j["permissions"] == {"contents": "read"} and "secrets." not in t and s[0]["with"]["persist-credentials"] is False and s[0]["with"]["fetch-depth"] == 2)
p("report_only", len(w["jobs"]) == 1 and s[0]["uses"] == "actions/checkout@v4" and all(x.get("continue-on-error") is True for x in s[1:]))
p("npm_ci", s[2]["run"] == 'cd "$S" && npm ci --ignore-scripts --no-audit --no-fund')
a = s[3]["run"]
p("audit", 'for v in head base; do npm audit --prefix "$RUNNER_TEMP/$v" --package-lock-only --json --registry=https://registry.npmjs.org/ --offline=false --include=prod --include=dev --include=optional --include=peer > "$RUNNER_TEMP/$v.json" || true; done' in a and 'cp "$S/$f" "$RUNNER_TEMP/head/$f" || true' in a and 'git show "HEAD^1:$S/$f" > "$RUNNER_TEMP/base/$f" || true' in a and '--base "$RUNNER_TEMP/base.json" --summary "$GITHUB_STEP_SUMMARY"' in s[3]["run"])
p("env_only", not any("${{" in x.get("run", "") for x in s))
p("not_required", "studio-audit" not in open(sys.argv[2]).read())
g = yaml.safe_load(open(sys.argv[3])); p("guarded", ".github/workflows/studio-audit.yml" in g.get("on", g.get(True))["pull_request"]["paths"])
P
)
for k in paths read_only report_only npm_ci audit env_only not_required guarded; do ok "studio-audit.yml: $k" "$(grep -qx "$k=1" <<<"$o" && echo 1)" "$o"; done
node "$TOOLS/ci-and-lists.mjs" > "$T/lists" 2>&1; ok "no && list of a workflow can hide a red (ci-and-lists.mjs, the required check's own)" "$([ $? = 0 ] && echo 1)" "$(tail -3 "$T/lists")"
finish
